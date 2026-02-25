package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/evan-buss/openbooks/core"
	"github.com/evan-buss/openbooks/util"
)

// RequestHandler defines a generic handle() method that is called when a specific request type is made
type RequestHandler interface {
	handle(c *Client)
}

const (
	minReconnectBackoff = 1 * time.Second
	maxReconnectBackoff = 30 * time.Second
	heartbeatInterval   = 45 * time.Second
	heartbeatStaleAfter = (2 * heartbeatInterval) + (15 * time.Second)
)

// messageRouter is used to parse the incoming request and respond appropriately
func (server *server) routeMessage(message Request, c *Client) {
	var obj interface{}

	switch message.MessageType {
	case SEARCH:
		obj = new(SearchRequest)
	case DOWNLOAD:
		obj = new(DownloadRequest)
	}

	if obj != nil {
		err := json.Unmarshal(message.Payload, obj)
		if err != nil {
			server.log.Printf("Invalid request payload. %s.\n", err.Error())
			c.send <- StatusResponse{
				MessageType:      STATUS,
				NotificationType: DANGER,
				Title:            "Unknown request payload.",
			}
			return
		}
	}

	switch message.MessageType {
	case CONNECT:
		c.startIrcConnection(server)
	case SEARCH:
		c.sendSearchRequest(obj.(*SearchRequest), server)
	case DOWNLOAD:
		c.sendDownloadRequest(obj.(*DownloadRequest), server)
	default:
		server.log.Println("Unknown request type received.")
	}
}

// handle ConnectionRequests and either connect to the server or do nothing
func (c *Client) startIrcConnection(server *server) {
	server.ircMutex.Lock()

	// If IRC is not connected, connect now
	if !server.ircConnected {
		err := core.Join(server.sharedIRC, server.config.Server, server.config.EnableTLS, server.config.TLSSkipVerify)
		if err != nil {
			server.ircMutex.Unlock()
			c.log.Println(err)
			c.send <- newErrorResponse("Unable to connect to IRC server.")
			return
		}

		server.lastIrcActivity = time.Now()
		server.ircConnected = true
		server.log.Printf("Shared IRC connection established with username: %s\n", server.sharedIRC.Username)
	}

	if !server.ircReaderStarted {
		server.ircReaderStarted = true
		go server.runIrcReaderSupervisor()
	}
	if !server.heartbeatStarted {
		server.heartbeatStarted = true
		go server.runIrcHeartbeat()
	}
	server.ircMutex.Unlock()

	c.send <- ConnectionResponse{
		StatusResponse: StatusResponse{
			MessageType:      CONNECT,
			NotificationType: SUCCESS,
			Title:            "Welcome, connection established.",
			Detail:           fmt.Sprintf("IRC username %s", server.sharedIRC.Username),
		},
		Name: server.sharedIRC.Username,
	}
}

func (server *server) runIrcReaderSupervisor() {
	for {
		if err := server.ircCtx.Err(); err != nil {
			return
		}

		handler := server.NewIrcEventHandler()
		server.attachIrcLogger(handler)
		err := core.StartReader(server.ircCtx, server.sharedIRC, handler)
		if errors.Is(err, context.Canceled) || errors.Is(server.ircCtx.Err(), context.Canceled) {
			return
		}

		if err != nil && !errors.Is(err, io.EOF) {
			server.log.Printf("IRC reader stopped: %v\n", err)
		}
		server.markIrcDisconnected()

		if err := server.reconnectWithBackoff(); err != nil {
			server.log.Printf("IRC reconnection stopped: %v\n", err)
			return
		}
	}
}

func (server *server) attachIrcLogger(handler core.EventHandler) {
	if !server.config.Log {
		return
	}

	logger, closer, err := util.CreateLogFile(server.sharedIRC.Username, server.config.DownloadDir)
	if err != nil {
		server.log.Printf("Error creating IRC log file: %v\n", err)
		return
	}

	server.ircMutex.Lock()
	if server.ircLogCloser != nil {
		_ = server.ircLogCloser.Close()
	}
	server.ircLogCloser = closer
	server.ircMutex.Unlock()

	prev := handler[core.Message]
	handler[core.Message] = func(text string) {
		if prev != nil {
			prev(text)
		}
		logger.Println(text)
	}
}

// handle SearchRequests and send the query to the book server
func (c *Client) sendSearchRequest(s *SearchRequest, server *server) {
	server.lastSearchMutex.Lock()
	defer server.lastSearchMutex.Unlock()

	nextAvailableSearch := server.lastSearch.Add(server.config.SearchTimeout)

	if time.Now().Before(nextAvailableSearch) {
		remainingSeconds := time.Until(nextAvailableSearch).Seconds()
		c.send <- newRateLimitResponse(remainingSeconds)

		return
	}

	err := core.SearchBook(server.sharedIRC, server.config.SearchBot, s.Query)
	if err != nil {
		server.log.Printf("Search send failed: %v\n", err)
		c.send <- newErrorResponse("Unable to send search request to IRC.")
		return
	}
	server.lastSearch = time.Now()

	c.send <- newStatusResponse(NOTIFY, "Search request sent.")
}

// handle DownloadRequests by sending the request to the book server
func (c *Client) sendDownloadRequest(d *DownloadRequest, server *server) {
	err := core.DownloadBook(server.sharedIRC, d.Book)
	if err != nil {
		server.log.Printf("Download send failed: %v\n", err)
		c.send <- newErrorResponse("Unable to send download request to IRC.")
		return
	}
	server.enqueueDownloadRequest(d.Book)
	c.send <- newStatusResponse(NOTIFY, "Download request received.")
}

func (server *server) runIrcHeartbeat() {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-server.ircCtx.Done():
			return
		case <-ticker.C:
			server.ircMutex.Lock()
			connected := server.ircConnected
			server.ircMutex.Unlock()
			if !connected {
				continue
			}

			if time.Since(server.getLastIrcActivity()) > heartbeatStaleAfter {
				server.log.Printf("IRC activity stale for %s, forcing reconnect\n", heartbeatStaleAfter)
				_ = server.sharedIRC.Disconnect()
				server.markIrcDisconnected()
				continue
			}

			token := fmt.Sprintf("hb-%d", time.Now().UnixNano())
			if err := server.sharedIRC.Ping(token); err != nil {
				server.log.Printf("IRC heartbeat ping failed: %v\n", err)
				server.markIrcDisconnected()
			}
		}
	}
}

func (server *server) reconnectWithBackoff() error {
	backoff := minReconnectBackoff
	for {
		select {
		case <-server.ircCtx.Done():
			return context.Canceled
		case <-time.After(backoff):
		}

		server.ircMutex.Lock()
		err := core.Join(server.sharedIRC, server.config.Server, server.config.EnableTLS, server.config.TLSSkipVerify)
		if err == nil {
			server.ircConnected = true
			server.lastIrcActivity = time.Now()
			server.ircMutex.Unlock()
			server.log.Printf("IRC reconnected with username: %s\n", server.sharedIRC.Username)
			return nil
		}
		server.ircConnected = false
		server.ircMutex.Unlock()

		server.log.Printf("IRC reconnect attempt failed: %v\n", err)

		backoff *= 2
		if backoff > maxReconnectBackoff {
			backoff = maxReconnectBackoff
		}
	}
}

func (server *server) markIrcDisconnected() {
	server.ircMutex.Lock()
	server.ircConnected = false
	server.ircMutex.Unlock()
}
