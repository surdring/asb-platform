// tls-gateway/proxy-chain.go
package main

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"
)

type ProxyNode struct {
	URL          string
	Protocol     string
	Host         string
	Port         int
	Username     string
	Password     string
	HealthyUntil time.Time
	FailureCount int
	LastUsed     time.Time
}

type ProxyChain struct {
	Name         string
	Nodes        []*ProxyNode
	RotationMode string // "sequential", "random", "least-used"
	CurrentIndex int
	mu           sync.RWMutex
	stats        map[string]*ProxyStats
}

type ProxyStats struct {
	TotalRequests  int64
	SuccessCount   int64
	FailureCount   int64
	LastUsedTime   time.Time
	AverageLatency time.Duration
}

type ProxyChainManager struct {
	chains map[string]*ProxyChain
	mu     sync.RWMutex
}

func NewProxyChainManager() *ProxyChainManager {
	return &ProxyChainManager{
		chains: make(map[string]*ProxyChain),
	}
}

func (pcm *ProxyChainManager) AddProxyChain(chain *ProxyChain) error {
	pcm.mu.Lock()
	defer pcm.mu.Unlock()

	if _, exists := pcm.chains[chain.Name]; exists {
		return fmt.Errorf("proxy chain '%s' already exists", chain.Name)
	}

	pcm.chains[chain.Name] = chain
	return nil
}

func (pcm *ProxyChainManager) GetProxyChain(name string) *ProxyChain {
	pcm.mu.RLock()
	defer pcm.mu.RUnlock()
	return pcm.chains[name]
}

func NewProxyChain(name string, mode string) *ProxyChain {
	return &ProxyChain{
		Name:         name,
		Nodes:        make([]*ProxyNode, 0),
		RotationMode: mode,
		stats:        make(map[string]*ProxyStats),
	}
}

func (pc *ProxyChain) AddNode(proxyURL string) error {
	pc.mu.Lock()
	defer pc.mu.Unlock()

	node, err := parseProxyURL(proxyURL)
	if err != nil {
		return err
	}

	pc.Nodes = append(pc.Nodes, node)
	pc.stats[proxyURL] = &ProxyStats{}
	return nil
}

func (pc *ProxyChain) GetNextProxy() *ProxyNode {
	pc.mu.Lock()
	defer pc.mu.Unlock()

	if len(pc.Nodes) == 0 {
		return nil
	}

	var proxy *ProxyNode

	switch pc.RotationMode {
	case "random":
		randomIdx, _ := rand.Int(rand.Reader, big.NewInt(int64(len(pc.Nodes))))
		proxy = pc.Nodes[randomIdx.Int64()]

	case "least-used":
		proxy = pc.getLeastUsedProxy()

	case "sequential":
		fallthrough
	default:
		proxy = pc.Nodes[pc.CurrentIndex]
		pc.CurrentIndex = (pc.CurrentIndex + 1) % len(pc.Nodes)
	}

	if proxy != nil {
		proxy.LastUsed = time.Now()
	}

	return proxy
}

func (pc *ProxyChain) getLeastUsedProxy() *ProxyNode {
	var least *ProxyNode
	minRequests := int64(999999)

	for _, node := range pc.Nodes {
		stats := pc.stats[node.URL]
		if stats.TotalRequests < minRequests && node.HealthyUntil.After(time.Now()) {
			least = node
			minRequests = stats.TotalRequests
		}
	}

	if least == nil && len(pc.Nodes) > 0 {
		least = pc.Nodes[0]
	}

	return least
}

func (pc *ProxyChain) RecordSuccess(proxyURL string, latency time.Duration) {
	pc.mu.Lock()
	defer pc.mu.Unlock()

	if stats, exists := pc.stats[proxyURL]; exists {
		stats.TotalRequests++
		stats.SuccessCount++
		stats.LastUsedTime = time.Now()

		if stats.AverageLatency == 0 {
			stats.AverageLatency = latency
		} else {
			stats.AverageLatency = (stats.AverageLatency + latency) / 2
		}
	}

	for _, node := range pc.Nodes {
		if node.URL == proxyURL {
			node.FailureCount = 0
			node.HealthyUntil = time.Now().Add(1 * time.Hour)
			break
		}
	}
}

func (pc *ProxyChain) RecordFailure(proxyURL string) {
	pc.mu.Lock()
	defer pc.mu.Unlock()

	if stats, exists := pc.stats[proxyURL]; exists {
		stats.TotalRequests++
		stats.FailureCount++
		stats.LastUsedTime = time.Now()
	}

	for _, node := range pc.Nodes {
		if node.URL == proxyURL {
			node.FailureCount++
			backoffDuration := calculateBackoffDuration(node.FailureCount)
			node.HealthyUntil = time.Now().Add(backoffDuration)
			break
		}
	}
}

func calculateBackoffDuration(failureCount int) time.Duration {
	switch {
	case failureCount <= 1:
		return 5 * time.Minute
	case failureCount <= 2:
		return 30 * time.Minute
	case failureCount <= 3:
		return 2 * time.Hour
	default:
		return 24 * time.Hour
	}
}

func (pc *ProxyChain) GetStats() map[string]*ProxyStats {
	pc.mu.RLock()
	defer pc.mu.RUnlock()

	statsCopy := make(map[string]*ProxyStats)
	for k, v := range pc.stats {
		statsCopy[k] = v
	}
	return statsCopy
}

func parseProxyURL(proxyURL string) (*ProxyNode, error) {
	parsedURL, err := url.Parse(proxyURL)
	if err != nil {
		return nil, fmt.Errorf("invalid proxy URL: %w", err)
	}

	host := parsedURL.Hostname()
	port := parsedURL.Port()
	if port == "" {
		switch parsedURL.Scheme {
		case "socks5":
			port = "1080"
		case "http", "https":
			port = "80"
		default:
			port = "80"
		}
	}

	portInt, err := parsePort(port)
	if err != nil {
		return nil, err
	}

	username := parsedURL.User.Username()
	password, _ := parsedURL.User.Password()

	return &ProxyNode{
		URL:          proxyURL,
		Protocol:     parsedURL.Scheme,
		Host:         host,
		Port:         portInt,
		Username:     username,
		Password:     password,
		HealthyUntil: time.Now().Add(1 * time.Hour),
		FailureCount: 0,
		LastUsed:     time.Now(),
	}, nil
}

func parsePort(portStr string) (int, error) {
	portStr = strings.TrimSpace(portStr)
	if portStr == "" {
		return 0, fmt.Errorf("port is empty")
	}

	var port int
	_, err := fmt.Sscanf(portStr, "%d", &port)
	if err != nil {
		return 0, fmt.Errorf("invalid port: %s", portStr)
	}

	if port < 1 || port > 65535 {
		return 0, fmt.Errorf("port out of range: %d", port)
	}

	return port, nil
}

func DialWithProxyChain(chain *ProxyChain, network, addr string) (net.Conn, error) {
	if chain == nil || len(chain.Nodes) == 0 {
		return net.Dial(network, addr)
	}

	proxy := chain.GetNextProxy()
	if proxy == nil {
		return net.Dial(network, addr)
	}

	switch proxy.Protocol {
	case "socks5":
		return dialSOCKS5(proxy, addr)

	case "http", "https":
		return dialHTTPProxy(proxy, addr)

	default:
		return net.Dial(network, addr)
	}
}

func dialSOCKS5(proxy *ProxyNode, addr string) (net.Conn, error) {
	conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", proxy.Host, proxy.Port))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to SOCKS5 proxy: %w", err)
	}

	if err := negotiateSOCKS5(conn, proxy, addr); err != nil {
		conn.Close()
		return nil, err
	}

	return conn, nil
}

func negotiateSOCKS5(conn net.Conn, proxy *ProxyNode, addr string) error {
	// CONNECT request: version, command, reserved, address type, address, port
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		return err
	}

	var portNum int
	_, err = fmt.Sscanf(port, "%d", &portNum)
	if err != nil {
		return err
	}

	return nil
}

func dialHTTPProxy(proxy *ProxyNode, addr string) (net.Conn, error) {
	conn, err := net.Dial("tcp", fmt.Sprintf("%s:%d", proxy.Host, proxy.Port))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to HTTP proxy: %w", err)
	}

	return conn, nil
}

func BuildProxyChainFromEnv(chainConfig string) (*ProxyChain, error) {
	parts := strings.SplitN(chainConfig, ":", 3)
	if len(parts) < 3 {
		return nil, fmt.Errorf("invalid proxy chain config format")
	}

	name := parts[0]
	mode := parts[1]
	proxies := strings.Split(parts[2], ",")

	chain := NewProxyChain(name, mode)
	for _, proxyURL := range proxies {
		if err := chain.AddNode(strings.TrimSpace(proxyURL)); err != nil {
			return nil, fmt.Errorf("failed to add proxy to chain: %w", err)
		}
	}

	return chain, nil
}
