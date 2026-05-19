// tls-gateway/session-manager.go
package main

import (
	"crypto/md5"
	"fmt"
	"net"
	"sync"
	"time"
)

type SessionConfig struct {
	OutboundIPs []string
	IPRotation  bool
	SessionTTL  time.Duration

	RoutingPolicy string
}

type SessionManager struct {
	mu sync.RWMutex

	sessions map[string]*SessionData

	config *SessionConfig
	ticker *time.Ticker
}

type SessionData struct {
	ClientKey     string
	AssignedIP    string
	CreatedAt     time.Time
	LastAccessAt  time.Time
	RequestCount  int64
	ConnectionMap map[string]*ConnInfo
}

type ConnInfo struct {
	TargetHost    string
	TargetPort    string
	OutboundIP    string
	ConnCreatedAt time.Time
	ConnClosedAt  *time.Time
	BytesSent     int64
	BytesRecv     int64
}

func NewSessionManager(config *SessionConfig) *SessionManager {
	sm := &SessionManager{
		sessions: make(map[string]*SessionData),
		config:   config,
	}

	if config == nil {
		sm.config = &SessionConfig{
			IPRotation:    false,
			SessionTTL:    24 * time.Hour,
			RoutingPolicy: "sticky",
		}
	}

	if sm.config.SessionTTL > 0 {
		sm.ticker = time.NewTicker(sm.config.SessionTTL / 2)
		go sm.cleanupExpiredSessions()
	}

	return sm
}

func (sm *SessionManager) GetOrCreateSession(clientAddr string) *SessionData {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if session, exists := sm.sessions[clientAddr]; exists {
		session.LastAccessAt = time.Now()
		session.RequestCount++
		return session
	}

	session := &SessionData{
		ClientKey:     clientAddr,
		CreatedAt:     time.Now(),
		LastAccessAt:  time.Now(),
		RequestCount:  1,
		ConnectionMap: make(map[string]*ConnInfo),
	}

	if sm.config.IPRotation && len(sm.config.OutboundIPs) > 0 {
		session.AssignedIP = sm.selectOutboundIP(clientAddr)
		logf("debug", "[SessionManager] Assigned IP %s to session %s", session.AssignedIP, clientAddr)
	}

	sm.sessions[clientAddr] = session
	return session
}

func (sm *SessionManager) selectOutboundIP(clientKey string) string {
	if len(sm.config.OutboundIPs) == 0 {
		return ""
	}

	switch sm.config.RoutingPolicy {
	case "sticky":
		hash := md5.Sum([]byte(clientKey))
		index := int(hash[0]) % len(sm.config.OutboundIPs)
		return sm.config.OutboundIPs[index]

	case "hash":
		hash := md5.Sum([]byte(clientKey))
		index := int(hash[0]) % len(sm.config.OutboundIPs)
		return sm.config.OutboundIPs[index]

	case "random":
		index := int(time.Now().UnixNano()) % len(sm.config.OutboundIPs)
		return sm.config.OutboundIPs[index]

	case "roundrobin":
		count := int64(0)
		sm.mu.RLock()
		for _, s := range sm.sessions {
			count += s.RequestCount
		}
		sm.mu.RUnlock()
		index := int(count) % len(sm.config.OutboundIPs)
		return sm.config.OutboundIPs[index]

	default:
		return sm.config.OutboundIPs[0]
	}
}

func (sm *SessionManager) StartConnection(clientAddr, targetHost, targetPort, outboundIP string) *ConnInfo {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if session, exists := sm.sessions[clientAddr]; exists {
		connKey := fmt.Sprintf("%s:%s", targetHost, targetPort)
		connInfo := &ConnInfo{
			TargetHost:    targetHost,
			TargetPort:    targetPort,
			OutboundIP:    outboundIP,
			ConnCreatedAt: time.Now(),
		}
		session.ConnectionMap[connKey] = connInfo
		return connInfo
	}

	return nil
}

func (sm *SessionManager) EndConnection(clientAddr, targetHost, targetPort string, bytesSent, bytesRecv int64) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if session, exists := sm.sessions[clientAddr]; exists {
		connKey := fmt.Sprintf("%s:%s", targetHost, targetPort)
		if connInfo, found := session.ConnectionMap[connKey]; found {
			now := time.Now()
			connInfo.ConnClosedAt = &now
			connInfo.BytesSent = bytesSent
			connInfo.BytesRecv = bytesRecv
		}
	}
}

func (sm *SessionManager) GetSessionInfo(clientAddr string) *SessionData {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.sessions[clientAddr]
}

func (sm *SessionManager) cleanupExpiredSessions() {
	for range sm.ticker.C {
		sm.mu.Lock()

		now := time.Now()
		for clientKey, session := range sm.sessions {
			if now.Sub(session.LastAccessAt) > sm.config.SessionTTL {
				logf("debug", "[SessionManager] Cleaned up expired session: %s", clientKey)
				delete(sm.sessions, clientKey)
			}
		}

		sm.mu.Unlock()
	}
}

func (sm *SessionManager) GetStats() map[string]interface{} {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	totalRequests := int64(0)
	totalBytesSent := int64(0)
	totalBytesRecv := int64(0)

	for _, session := range sm.sessions {
		totalRequests += session.RequestCount
		for _, conn := range session.ConnectionMap {
			totalBytesSent += conn.BytesSent
			totalBytesRecv += conn.BytesRecv
		}
	}

	return map[string]interface{}{
		"active_sessions":  len(sm.sessions),
		"total_requests":   totalRequests,
		"total_bytes_sent": totalBytesSent,
		"total_bytes_recv": totalBytesRecv,
	}
}

func (sm *SessionManager) Close() {
	if sm.ticker != nil {
		sm.ticker.Stop()
	}
}

func dialWithAssignedIP(targetAddr string, outboundIP string) (net.Conn, error) {
	if outboundIP == "" {
		return net.Dial("tcp", targetAddr)
	}

	dialer := &net.Dialer{
		LocalAddr: &net.TCPAddr{
			IP:   net.ParseIP(outboundIP),
			Port: 0,
		},
		Timeout: 30 * time.Second,
	}

	return dialer.Dial("tcp", targetAddr)
}
