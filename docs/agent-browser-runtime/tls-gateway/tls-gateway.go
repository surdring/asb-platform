// tls-gateway/tls-gateway.go
package main

import (
	"bufio"
	"crypto/rand"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	utls "github.com/refraction-networking/utls"
)

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envBoolOrDefault(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func envDurationOrDefault(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}

var (
	listenAddr       = flag.String("listen", envOrDefault("LISTEN_ADDR", "0.0.0.0:8080"), "Gateway listen address")
	logLevel         = flag.String("log", envOrDefault("LOG_LEVEL", "info"), "Log level: debug, info, warn, error")
	ja3Profile       = flag.String("ja3-profile", envOrDefault("JA3_PROFILE", "Chrome-124-macOS"), "JA3 profile label")
	enableSessions   = flag.Bool("enable-sessions", envBoolOrDefault("ENABLE_SESSIONS", true), "Enable session management")
	sessionTTL       = flag.Duration("session-ttl", envDurationOrDefault("SESSION_TTL", 1*time.Hour), "Session TTL")
	enableProxyChain = flag.Bool("enable-proxy-chain", envBoolOrDefault("ENABLE_PROXY_CHAIN", false), "Enable proxy chain support")
	proxyChainConfig = flag.String("proxy-chain", envOrDefault("PROXY_CHAIN", ""), "Proxy chain config (format: name:mode:proxy1,proxy2)")
)

// GatewayConfig is the runtime configuration for the local proxy service.
type GatewayConfig struct {
	ListenAddr       string
	JA3Profile       string
	LogLevel         string
	EnableSessions   bool
	SessionTTL       time.Duration
	EnableProxyChain bool

	profileLibrary *JA3ProfileLibrary
	sessionManager *SessionManager
	proxyChainMgr  *ProxyChainManager
	proxyChain     *ProxyChain
}

func splitTargetHostPort(target string) (string, string) {
	host, port, err := net.SplitHostPort(target)
	if err != nil {
		return target, "443"
	}
	return host, port
}

func writeJSON(conn net.Conn, statusCode int, payload interface{}) {
	data, err := json.Marshal(payload)
	if err != nil {
		statusCode = http.StatusInternalServerError
		data = []byte(`{"status":"error","error":"marshal_failed"}`)
	}
	fmt.Fprintf(conn, "HTTP/1.1 %d %s\r\n", statusCode, http.StatusText(statusCode))
	fmt.Fprintf(conn, "Content-Type: application/json\r\n")
	fmt.Fprintf(conn, "Content-Length: %d\r\n", len(data))
	fmt.Fprintf(conn, "Connection: close\r\n\r\n")
	_, _ = conn.Write(data)
}

func writeHealthResponse(conn net.Conn, cfg *GatewayConfig) {
	body := map[string]interface{}{
		"status":     "ok",
		"service":    "tls-gateway",
		"listen":     cfg.ListenAddr,
		"ja3Profile": cfg.JA3Profile,
		"sessions":   cfg.EnableSessions,
		"proxyChain": cfg.EnableProxyChain,
		"checkedAt":  time.Now().Format(time.RFC3339),
	}
	writeJSON(conn, http.StatusOK, body)
}

func writeStatsResponse(conn net.Conn, cfg *GatewayConfig) {
	stats := map[string]interface{}{
		"status":     "ok",
		"checkedAt":  time.Now().Format(time.RFC3339),
		"ja3Profile": cfg.JA3Profile,
		"profiles":   []string{},
	}
	if cfg.profileLibrary != nil {
		stats["profiles"] = cfg.profileLibrary.ListProfiles()
	}
	if cfg.sessionManager != nil {
		stats["sessions"] = cfg.sessionManager.GetStats()
	}
	if cfg.proxyChain != nil {
		stats["proxyChain"] = map[string]interface{}{
			"name":  cfg.proxyChain.Name,
			"mode":  cfg.proxyChain.RotationMode,
			"nodes": len(cfg.proxyChain.Nodes),
		}
	}
	writeJSON(conn, http.StatusOK, stats)
}

func getClientHelloID(profileName string) utls.ClientHelloID {
	switch {
	case strings.Contains(profileName, "Chrome-110"):
		return utls.HelloChrome_106_Shuffle
	case strings.Contains(profileName, "Chrome-115"):
		return utls.HelloChrome_115_PQ
	case strings.Contains(profileName, "Chrome-124"):
		return utls.HelloChrome_Auto
	case strings.Contains(profileName, "Chrome-125"):
		return utls.HelloChrome_Auto
	case strings.Contains(profileName, "Safari"):
		return utls.HelloSafari_Auto
	case strings.Contains(profileName, "Edge"):
		return utls.HelloEdge_Auto
	case strings.Contains(profileName, "Firefox"):
		return utls.HelloFirefox_Auto
	case profileName == "random":
		ids := []utls.ClientHelloID{
			utls.HelloChrome_Auto,
			utls.HelloSafari_Auto,
			utls.HelloFirefox_Auto,
			utls.HelloEdge_Auto,
		}
		if n, err := rand.Int(rand.Reader, big.NewInt(int64(len(ids)))); err == nil {
			return ids[n.Int64()]
		}
		return ids[0]
	default:
		return utls.HelloChrome_Auto
	}
}

func getRandomizedALPN(profileName string) []string {
	var result []string

	switch {
	case strings.Contains(profileName, "Chrome"):
		result = []string{"h2", "http/1.1"}
	case strings.Contains(profileName, "Safari"):
		result = []string{"h2", "http/1.1"}
	case strings.Contains(profileName, "Firefox"):
		result = []string{"h2", "http/1.1"}
	case strings.Contains(profileName, "Edge"):
		result = []string{"h2", "http/1.1"}
	default:
		if n, err := rand.Int(rand.Reader, big.NewInt(2)); err == nil && n.Int64() == 1 {
			result = []string{"h2", "http/1.1"}
		} else {
			result = []string{"http/1.1", "h2"}
		}
	}

	return result
}

func dialTargetTCP(target string, cfg *GatewayConfig, clientAddr string) (net.Conn, string, error) {
	host, port := splitTargetHostPort(target)
	targetAddr := net.JoinHostPort(host, port)

	assignedOutboundIP := ""
	if cfg.EnableSessions && cfg.sessionManager != nil {
		session := cfg.sessionManager.GetOrCreateSession(clientAddr)
		assignedOutboundIP = strings.TrimSpace(session.AssignedIP)
		if conn, err := dialWithAssignedIP(targetAddr, assignedOutboundIP); err == nil {
			return conn, assignedOutboundIP, nil
		} else {
			logf("warn", "[SessionManager] outbound IP dial failed (%s): %v", assignedOutboundIP, err)
		}
	}

	if cfg.proxyChain != nil {
		if conn, err := DialWithProxyChain(cfg.proxyChain, "tcp", targetAddr); err == nil {
			return conn, assignedOutboundIP, nil
		}
	}

	dialer := &net.Dialer{Timeout: 30 * time.Second}
	tcpConn, err := dialer.Dial("tcp", targetAddr)
	if err != nil {
		return nil, assignedOutboundIP, err
	}

	clientHelloID := getClientHelloID(cfg.JA3Profile)
	alpnProtos := getRandomizedALPN(cfg.JA3Profile)

	tlsConfig := &utls.Config{
		ServerName: host,
		NextProtos: alpnProtos,
	}

	uconn := utls.UClient(tcpConn, tlsConfig, clientHelloID)

	if err := uconn.Handshake(); err != nil {
		tcpConn.Close()
		logf("error", "[TLS] Handshake failed for %s: %v", target, err)
		return nil, assignedOutboundIP, fmt.Errorf("tls handshake failed: %w", err)
	}

	logf("debug", "[TLS] Handshake completed for %s with profile %s (version: 0x%x, negotiated: %v)", host, cfg.JA3Profile, uconn.ConnectionState().Version, uconn.ConnectionState().NegotiatedProtocol)
	return uconn, assignedOutboundIP, nil
}

func handleHTTPSConnect(conn net.Conn, target string, cfg *GatewayConfig) {
	host, port := splitTargetHostPort(target)

	targetConn, assignedOutboundIP, err := dialTargetTCP(target, cfg, conn.RemoteAddr().String())
	if err != nil {
		logf("error", "[TLS-Gateway] Failed to connect to %s: %v", target, err)
		fmt.Fprintf(conn, "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
		return
	}
	defer targetConn.Close()

	if cfg.EnableSessions && cfg.sessionManager != nil {
		cfg.sessionManager.StartConnection(conn.RemoteAddr().String(), host, port, assignedOutboundIP)
	}

	if _, err := conn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
		logf("error", "[TLS-Gateway] Failed to write CONNECT response: %v", err)
		return
	}

	logf("debug", "[TLS-Gateway] Tunnel established for %s", target)

	var upstreamBytes int64
	var downstreamBytes int64
	done := make(chan struct{}, 2)

	go func() {
		upstreamBytes, _ = io.Copy(targetConn, conn)
		if tc, ok := targetConn.(*utls.Conn); ok {
			_ = tc.CloseWrite()
		} else if tcpConn, ok := targetConn.(*net.TCPConn); ok {
			_ = tcpConn.CloseWrite()
		}
		done <- struct{}{}
	}()

	go func() {
		downstreamBytes, _ = io.Copy(conn, targetConn)
		if tc, ok := conn.(*utls.Conn); ok {
			_ = tc.CloseWrite()
		} else if tcpConn, ok := conn.(*net.TCPConn); ok {
			_ = tcpConn.CloseWrite()
		}
		done <- struct{}{}
	}()

	<-done
	<-done

	if cfg.EnableSessions && cfg.sessionManager != nil {
		cfg.sessionManager.EndConnection(conn.RemoteAddr().String(), host, port, upstreamBytes, downstreamBytes)
	}
}

func handleHTTPForward(conn net.Conn, req *http.Request, cfg *GatewayConfig) {
	targetHost := req.Host
	if targetHost == "" && req.URL != nil {
		targetHost = req.URL.Host
	}
	if targetHost == "" {
		fmt.Fprintf(conn, "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
		return
	}

	targetConn, _, err := dialTargetTCP(targetHost+":80", cfg, conn.RemoteAddr().String())
	if err != nil {
		logf("error", "[HTTP-Forward] Failed to connect to %s: %v", targetHost, err)
		fmt.Fprintf(conn, "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
		return
	}
	defer targetConn.Close()

	if err := req.Write(targetConn); err != nil {
		logf("error", "[HTTP-Forward] Failed to forward request: %v", err)
		return
	}

	resp, err := http.ReadResponse(bufio.NewReader(targetConn), req)
	if err != nil {
		logf("error", "[HTTP-Forward] Failed to read response: %v", err)
		return
	}
	defer resp.Body.Close()

	if err := resp.Write(conn); err != nil {
		logf("error", "[HTTP-Forward] Failed to write response: %v", err)
		return
	}

	logf("debug", "[HTTP-Forward] Request completed: %d %s", resp.StatusCode, http.StatusText(resp.StatusCode))
}

// handleConnection is the main HTTP proxy request handler.
func handleConnection(conn net.Conn, cfg *GatewayConfig) {
	defer conn.Close()

	reader := bufio.NewReader(conn)
	req, err := http.ReadRequest(reader)
	if err != nil {
		logf("error", "Failed to parse request: %v", err)
		return
	}
	defer req.Body.Close()

	target := req.Host
	if target == "" && req.URL != nil {
		target = req.URL.Host
	}
	logf("info", "[TLS-Gateway] %s %s", req.Method, target)

	if req.Method == http.MethodGet && req.URL != nil {
		switch req.URL.Path {
		case "/health":
			writeHealthResponse(conn, cfg)
			return
		case "/stats":
			writeStatsResponse(conn, cfg)
			return
		}
	}

	if req.Method == http.MethodConnect {
		handleHTTPSConnect(conn, req.Host, cfg)
		return
	}

	handleHTTPForward(conn, req, cfg)
}

func logf(level string, format string, args ...interface{}) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	levelMarker := map[string]string{
		"debug": "DBG",
		"info":  "INF",
		"warn":  "WRN",
		"error": "ERR",
	}[level]

	message := fmt.Sprintf(format, args...)
	fmt.Printf("[%s] %s [%s] %s\n", timestamp, levelMarker, strings.ToUpper(level), message)
	log.Printf("[%s] %s", level, message)
}

func main() {
	flag.Parse()

	cfg := &GatewayConfig{
		ListenAddr:       *listenAddr,
		JA3Profile:       *ja3Profile,
		LogLevel:         *logLevel,
		EnableSessions:   *enableSessions,
		SessionTTL:       *sessionTTL,
		EnableProxyChain: *enableProxyChain,
	}

	logf("info", "TLS Gateway starting")
	logf("info", "  Listen: %s", cfg.ListenAddr)
	logf("info", "  JA3 Profile: %s", cfg.JA3Profile)
	logf("info", "  Enable Sessions: %v", cfg.EnableSessions)
	logf("info", "  Enable Proxy Chain: %v", cfg.EnableProxyChain)

	cfg.profileLibrary = NewJA3ProfileLibrary()
	logf("info", "JA3 Profile Library initialized with %d profiles", len(cfg.profileLibrary.ListProfiles()))

	if cfg.EnableSessions {
		outboundIPs := []string{}
		if rawIPs := strings.TrimSpace(os.Getenv("OUTBOUND_IPS")); rawIPs != "" {
			for _, ip := range strings.Split(rawIPs, ",") {
				trimmed := strings.TrimSpace(ip)
				if trimmed != "" {
					outboundIPs = append(outboundIPs, trimmed)
				}
			}
		}
		routingPolicy := envOrDefault("SESSION_ROUTING_POLICY", "sticky")

		cfg.sessionManager = NewSessionManager(&SessionConfig{
			OutboundIPs:   outboundIPs,
			IPRotation:    len(outboundIPs) > 0,
			SessionTTL:    cfg.SessionTTL,
			RoutingPolicy: routingPolicy,
		})
		logf("info", "Session Manager initialized (TTL: %v, mode: %s, outboundIPs: %d)", cfg.SessionTTL, routingPolicy, len(outboundIPs))
	}

	if cfg.EnableProxyChain && *proxyChainConfig != "" {
		cfg.proxyChainMgr = NewProxyChainManager()
		chain, err := BuildProxyChainFromEnv(*proxyChainConfig)
		if err != nil {
			logf("warn", "Failed to build proxy chain: %v", err)
		} else {
			cfg.proxyChain = chain
			_ = cfg.proxyChainMgr.AddProxyChain(chain)
			logf("info", "Proxy Chain initialized: %s (mode: %s)", chain.Name, chain.RotationMode)
		}
	}

	listener, err := net.Listen("tcp", cfg.ListenAddr)
	if err != nil {
		logf("error", "Failed to listen: %v", err)
		os.Exit(1)
	}
	defer listener.Close()

	logf("info", "Gateway listening on %s", cfg.ListenAddr)

	for {
		conn, err := listener.Accept()
		if err != nil {
			logf("error", "Accept error: %v", err)
			continue
		}
		go handleConnection(conn, cfg)
	}
}
