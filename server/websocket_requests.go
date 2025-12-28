package server

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/evan-buss/openbooks/core"
	"github.com/evan-buss/openbooks/util"
)

// RequestHandler defines a generic handle() method that is called when a specific request type is made
type RequestHandler interface {
	handle(c *Client)
}

// messageRouter is used to parse the incoming request and respond appropriately
func (server *server) routeMessage(message Request, c *Client) {
	var obj interface{}

	switch message.MessageType {
	case SEARCH:
		obj = new(SearchRequest)
	case DOWNLOAD:
		obj = new(DownloadRequest)
	}

	err := json.Unmarshal(message.Payload, &obj)
	if err != nil {
		server.log.Printf("Invalid request payload. %s.\n", err.Error())
		c.send <- StatusResponse{
			MessageType:      STATUS,
			NotificationType: DANGER,
			Title:            "Unknown request payload.",
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
	defer server.ircMutex.Unlock()

	// If IRC is not connected, connect now
	if !server.ircConnected {
		err := core.Join(server.sharedIRC, server.config.Server, server.config.EnableTLS)
		if err != nil {
			c.log.Println(err)
			c.send <- newErrorResponse("Unable to connect to IRC server.")
			return
		}

		handler := server.NewIrcEventHandler()

		if server.config.Log {
			logger, _, err := util.CreateLogFile(server.sharedIRC.Username, server.config.DownloadDir)
			if err != nil {
				server.log.Println(err)
			} else {
				// Only add message handler if logger was successfully created
				handler[core.Message] = func(text string) { logger.Println(text) }
			}
		}

		go core.StartReader(server.ircCtx, server.sharedIRC, handler)
		server.ircConnected = true
		server.log.Printf("Shared IRC connection established with username: %s\n", server.sharedIRC.Username)
	}

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

	core.SearchBook(server.sharedIRC, server.config.SearchBot, s.Query)
	server.lastSearch = time.Now()

	c.send <- newStatusResponse(NOTIFY, "Search request sent.")
}

// handle DownloadRequests by sending the request to the book server
func (c *Client) sendDownloadRequest(d *DownloadRequest, server *server) {
	core.DownloadBook(server.sharedIRC, d.Book)
	c.send <- newStatusResponse(NOTIFY, "Download request received.")
}
