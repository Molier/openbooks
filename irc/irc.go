package irc

import (
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"
)

const (
	defaultDialTimeout  = 15 * time.Second
	defaultReadTimeout  = 120 * time.Second
	defaultWriteTimeout = 10 * time.Second
)

// Conn represents an IRC connection to a server
type Conn struct {
	net.Conn
	channel  string
	Username string
	realname string
	mu       sync.RWMutex

	dialTimeout  time.Duration
	readTimeout  time.Duration
	writeTimeout time.Duration
}

// New creates a new IRC connection to the server using the supplied username and realname
func New(username, realname string) *Conn {
	irc := &Conn{
		channel:      "",
		Username:     username,
		realname:     realname,
		dialTimeout:  defaultDialTimeout,
		readTimeout:  defaultReadTimeout,
		writeTimeout: defaultWriteTimeout,
	}

	return irc
}

// Connect connects to the given server at port 6667
func (i *Conn) Connect(address string, enableTLS bool, insecureSkipVerify bool) error {
	i.mu.Lock()
	if i.Conn != nil {
		_ = i.Conn.Close()
		i.Conn = nil
	}
	i.mu.Unlock()

	var conn net.Conn
	var err error
	dialer := &net.Dialer{
		Timeout:   i.dialTimeout,
		KeepAlive: 30 * time.Second,
	}
	if enableTLS {
		conn, err = tls.DialWithDialer(dialer, "tcp", address, &tls.Config{
			MinVersion:         tls.VersionTLS12,
			InsecureSkipVerify: insecureSkipVerify,
		})
	} else {
		conn, err = dialer.Dial("tcp", address)
	}

	if err != nil {
		return err
	}

	i.mu.Lock()
	i.Conn = conn
	i.mu.Unlock()

	user := fmt.Sprintf("USER %s 0 * :%s", i.Username, i.Username)
	nick := fmt.Sprintf("NICK %s", i.Username)

	if err := i.writeCommand(user); err != nil {
		_ = i.Disconnect()
		return err
	}
	if err := i.writeCommand(nick); err != nil {
		_ = i.Disconnect()
		return err
	}
	return nil
}

// Disconnect closes connection to the IRC server
func (i *Conn) Disconnect() error {
	if !i.IsConnected() {
		return nil
	}
	_ = i.writeCommand("QUIT :Goodbye")

	i.mu.Lock()
	conn := i.Conn
	i.Conn = nil
	i.channel = ""
	i.mu.Unlock()

	if conn == nil {
		return nil
	}

	return conn.Close()
}

// SendMessage sends the given message string to the connected IRC server
func (i *Conn) SendMessage(message string) error {
	if !i.IsConnected() {
		return errors.New("irc connection not established")
	}
	i.mu.RLock()
	channel := i.channel
	i.mu.RUnlock()
	if channel == "" {
		return errors.New("irc channel not joined")
	}

	cleanMessage := sanitizeIRCBoundString(message)
	if cleanMessage == "" {
		return errors.New("irc message cannot be empty")
	}

	return i.writeCommand(fmt.Sprintf("PRIVMSG #%s :%s", channel, cleanMessage))
}

// SendNotice sends a notice message to the specified user
func (i *Conn) SendNotice(user string, message string) error {
	if !i.IsConnected() {
		return errors.New("irc connection not established")
	}

	cleanUser := sanitizeIRCBoundString(user)
	cleanMessage := sanitizeIRCBoundString(message)
	if cleanUser == "" || cleanMessage == "" {
		return errors.New("irc notice user and message must be set")
	}

	return i.writeCommand(fmt.Sprintf("NOTICE %s :%s", cleanUser, cleanMessage))
}

// JoinChannel joins the channel given by channel string
func (i *Conn) JoinChannel(channel string) error {
	if !i.IsConnected() {
		return errors.New("irc connection not established")
	}

	cleanChannel := sanitizeIRCBoundString(channel)
	cleanChannel = strings.TrimPrefix(cleanChannel, "#")
	if cleanChannel == "" {
		return errors.New("irc channel cannot be empty")
	}

	i.mu.Lock()
	i.channel = cleanChannel
	i.mu.Unlock()

	return i.writeCommand(fmt.Sprintf("JOIN #%s", cleanChannel))
}

// GetUsers sends a NAMES request to the IRC server
func (i *Conn) GetUsers(channel string) error {
	if !i.IsConnected() {
		return errors.New("irc connection not established")
	}

	cleanChannel := strings.TrimPrefix(sanitizeIRCBoundString(channel), "#")
	if cleanChannel == "" {
		return errors.New("irc channel cannot be empty")
	}

	return i.writeCommand(fmt.Sprintf("NAMES #%s", cleanChannel))
}

// Pong sends a Pong message to the server, often used after a PING request
func (i *Conn) Pong(server string) error {
	if !i.IsConnected() {
		return errors.New("irc connection not established")
	}

	cleanServer := sanitizeIRCBoundString(server)
	if cleanServer == "" {
		return errors.New("irc pong server cannot be empty")
	}

	return i.writeCommand(fmt.Sprintf("PONG %s", cleanServer))
}

// Ping sends a health-check ping message to the IRC server.
func (i *Conn) Ping(token string) error {
	if !i.IsConnected() {
		return errors.New("irc connection not established")
	}

	cleanToken := sanitizeIRCBoundString(token)
	if cleanToken == "" {
		cleanToken = i.Username
	}

	return i.writeCommand(fmt.Sprintf("PING :%s", cleanToken))
}

// RawConn returns the underlying net.Conn for reader creation.
func (i *Conn) RawConn() (net.Conn, error) {
	i.mu.RLock()
	defer i.mu.RUnlock()
	if i.Conn == nil {
		return nil, errors.New("irc connection not established")
	}
	return i.Conn, nil
}

// SetReadDeadline sets the read deadline on the underlying IRC connection.
func (i *Conn) SetReadDeadline(deadline time.Time) error {
	i.mu.RLock()
	conn := i.Conn
	i.mu.RUnlock()
	if conn == nil {
		return errors.New("irc connection not established")
	}
	return conn.SetReadDeadline(deadline)
}

// IsConnected returns true if the IRC connection is not null
func (i *Conn) IsConnected() bool {
	i.mu.RLock()
	defer i.mu.RUnlock()
	return i.Conn != nil
}

func (i *Conn) writeCommand(command string) error {
	i.mu.RLock()
	conn := i.Conn
	writeTimeout := i.writeTimeout
	i.mu.RUnlock()

	if conn == nil {
		return errors.New("irc connection not established")
	}

	if writeTimeout > 0 {
		if err := conn.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
			return err
		}
	}

	_, err := conn.Write([]byte(command + "\r\n"))
	if err != nil {
		i.mu.Lock()
		if i.Conn == conn {
			_ = i.Conn.Close()
			i.Conn = nil
			i.channel = ""
		}
		i.mu.Unlock()
	}
	return err
}

func sanitizeIRCBoundString(value string) string {
	withoutControls := strings.Map(func(r rune) rune {
		if r == '\r' || r == '\n' || r == 0 {
			return -1
		}
		return r
	}, value)
	return strings.TrimSpace(withoutControls)
}
