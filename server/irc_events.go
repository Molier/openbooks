package server

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/evan-buss/openbooks/core"
)

func (server *server) NewIrcEventHandler() core.EventHandler {
	handler := core.EventHandler{}
	handler[core.SearchResult] = server.searchResultHandler(server.config.DownloadDir)
	handler[core.BookResult] = server.bookResultHandler(server.config.DownloadDir, server.config.DisableBrowserDownloads)
	handler[core.NoResults] = server.noResultsHandler
	handler[core.BadServer] = server.badServerHandler
	handler[core.SearchAccepted] = server.searchAcceptedHandler
	handler[core.MatchesFound] = server.matchesFoundHandler
	handler[core.Ping] = server.pingHandler
	handler[core.ServerList] = server.userListHandler(server.repository)
	handler[core.Version] = server.versionHandler(server.config.UserAgent)
	return handler
}

// broadcast sends a message to all connected clients
func (server *server) broadcast(message interface{}) {
	for _, client := range server.clients {
		select {
		case client.send <- message:
		default:
			// Client send channel is full or closed, skip
			server.log.Printf("Failed to send message to client %s\n", client.uuid.String())
		}
	}
}

// searchResultHandler downloads from DCC server, parses data, and sends data to all clients
func (server *server) searchResultHandler(downloadDir string) core.HandlerFunc {
	return func(text string) {
		server.log.Printf("Received search results: %s\n", text)
		extractedPath, err := core.DownloadExtractDCCStringWithOptions(filepath.Join(downloadDir, "books"), text, nil, server.config.AutoExtractAll)
		if err != nil {
			server.log.Println(err)
			server.broadcast(newErrorResponse("Error when downloading search results."))
			return
		}

		bookResults, parseErrors, err := core.ParseSearchFile(extractedPath)
		if err != nil {
			server.log.Println(err)
			server.broadcast(newErrorResponse("Error when parsing search results."))
			return
		}

		if len(bookResults) == 0 && len(parseErrors) == 0 {
			server.noResultsHandler(text)
			return
		}

		// Output all errors so parser can be improved over time
		if len(parseErrors) > 0 {
			server.log.Printf("%d Search Result Parsing Errors\n", len(parseErrors))
			for _, err := range parseErrors {
				server.log.Println(err)
			}
		}

		server.log.Printf("Sending %d search results.\n", len(bookResults))
		server.broadcast(newSearchResponse(bookResults, parseErrors))

		err = os.Remove(extractedPath)
		if err != nil {
			server.log.Printf("Error deleting search results file: %v", err)
		}
	}
}

// bookResultHandler downloads the book file and sends it over the websocket to all clients
func (server *server) bookResultHandler(downloadDir string, disableBrowserDownloads bool) core.HandlerFunc {
	return func(text string) {
		extractedPath, err := core.DownloadExtractDCCStringWithOptions(filepath.Join(downloadDir, "books"), text, nil, server.config.AutoExtractAll)
		if err != nil {
			server.log.Println(err)
			server.broadcast(newErrorResponse("Error when downloading book."))
			return
		}

		server.log.Printf("Sending book entitled '%s'.\n", filepath.Base(extractedPath))
		server.broadcast(newDownloadResponse(text, extractedPath, disableBrowserDownloads))
	}
}

// NoResults is called when the server returns that nothing was found for the query
func (server *server) noResultsHandler(_ string) {
	server.broadcast(newErrorResponse("No results found for the query."))
}

// BadServer is called when the requested download fails because the server is not available
func (server *server) badServerHandler(_ string) {
	server.broadcast(newErrorResponse("Server is not available. Try another one."))
}

// SearchAccepted is called when the user's query is accepted into the search queue
func (server *server) searchAcceptedHandler(_ string) {
	server.broadcast(newStatusResponse(NOTIFY, "Search accepted into the queue."))
}

// MatchesFound is called when the server finds matches for the user's query
func (server *server) matchesFoundHandler(num string) {
	server.broadcast(newStatusResponse(NOTIFY, fmt.Sprintf("Found %s results for your query.", num)))
}

func (server *server) pingHandler(serverUrl string) {
	server.sharedIRC.Pong(serverUrl)
}

func (server *server) versionHandler(version string) core.HandlerFunc {
	return func(line string) {
		server.log.Printf("Sending CTCP version response: %s", line)
		core.SendVersionInfo(server.sharedIRC, line, version)
	}
}

func (server *server) userListHandler(repo *Repository) core.HandlerFunc {
	return func(text string) {
		repo.servers = core.ParseServers(text)
		server.log.Printf("Server list updated: %d elevated users, %d regular users\n",
			len(repo.servers.ElevatedUsers), len(repo.servers.RegularUsers))
		server.broadcast(newServerListResponse())
	}
}
