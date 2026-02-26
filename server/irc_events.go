package server

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/evan-buss/openbooks/core"
	"github.com/evan-buss/openbooks/dcc"
)

func (server *server) NewIrcEventHandler() core.EventHandler {
	handler := core.EventHandler{}
	handler[core.Message] = func(_ string) {
		server.setIrcActivityNow()
	}
	handler[core.SearchResult] = server.searchResultHandler(server.config.DownloadDir)
	handler[core.BookResult] = server.bookResultHandler(server.config.DownloadDir, server.config.DisableBrowserDownloads)
	handler[core.NoResults] = server.noResultsHandler
	handler[core.BadServer] = server.badServerHandler
	handler[core.SearchAccepted] = server.searchAcceptedHandler
	handler[core.MatchesFound] = server.matchesFoundHandler
	handler[core.Ping] = server.pingHandler
	handler[core.Pong] = server.pongHandler
	handler[core.ServerList] = server.userListHandler(server.repository)
	handler[core.Version] = server.versionHandler(server.config.UserAgent)
	return handler
}

// broadcast sends a message to all connected clients
func (server *server) broadcast(message interface{}) {
	for _, client := range server.snapshotClients() {
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
		request, hasRequest := server.claimSearchRequest()
		server.log.Printf("Received search results: %s\n", text)
		extractedPath, err := core.DownloadExtractDCCStringWithOptions(filepath.Join(downloadDir, "books"), text, nil, server.config.AutoExtractAll)
		if err != nil {
			server.log.Println(err)
			if hasRequest {
				server.sendToClient(request.requester, newErrorResponse("Error when downloading search results."))
				parseErr := core.ParseError{
					Line:  "",
					Error: errors.New("unable to download search results file"),
				}
				server.sendToClient(request.requester, newSearchResponse([]core.BookDetail{}, []core.ParseError{parseErr}))
			} else {
				server.broadcast(newErrorResponse("Error when downloading search results."))
			}
			return
		}

		bookResults, parseErrors, err := core.ParseSearchFile(extractedPath)
		if err != nil {
			server.log.Println(err)
			if hasRequest {
				server.sendToClient(request.requester, newErrorResponse("Error when parsing search results."))
				parseErr := core.ParseError{
					Line:  "",
					Error: errors.New("unable to parse search results file"),
				}
				server.sendToClient(request.requester, newSearchResponse([]core.BookDetail{}, []core.ParseError{parseErr}))
			} else {
				server.broadcast(newErrorResponse("Error when parsing search results."))
			}
			return
		}

		if len(bookResults) == 0 && len(parseErrors) == 0 {
			if hasRequest {
				server.sendToClient(request.requester, newStatusResponse(WARNING, "No results found for the query."))
				server.sendToClient(request.requester, newSearchResponse([]core.BookDetail{}, []core.ParseError{}))
			} else {
				server.broadcast(newStatusResponse(WARNING, "No results found for the query."))
			}
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
		if hasRequest {
			server.sendToClient(request.requester, newSearchResponse(bookResults, parseErrors))
		} else {
			server.broadcast(newSearchResponse(bookResults, parseErrors))
		}

		err = os.Remove(extractedPath)
		if err != nil {
			server.log.Printf("Error deleting search results file: %v", err)
		}
	}
}

// bookResultHandler downloads the book file and sends it over the websocket to all clients
func (server *server) bookResultHandler(downloadDir string, disableBrowserDownloads bool) core.HandlerFunc {
	return func(text string) {
		request, hasRequest := server.claimDownloadRequestForResponse(text)
		requestedBook := request.book

		progressBook := requestedBook
		var progressWriter *transferProgressWriter

		if downloadMeta, err := dcc.ParseString(text); err == nil {
			if progressBook == "" {
				progressBook = downloadMeta.Filename
			}
			progressWriter = newTransferProgressWriter(downloadMeta.Size, func(received, total int64) {
				response := newDownloadProgressResponse(progressBook, received, total)
				if hasRequest {
					server.sendToClient(request.requester, response)
					return
				}
				server.broadcast(response)
			})
		}

		extractedPath, err := core.DownloadExtractDCCStringWithOptions(filepath.Join(downloadDir, "books"), text, progressWriter, server.config.AutoExtractAll)
		if err != nil {
			server.log.Println(err)
			if hasRequest {
				server.sendToClient(request.requester, newErrorResponse("Error when downloading book."))
			} else {
				server.broadcast(newErrorResponse("Error when downloading book."))
			}
			return
		}

		if progressBook == "" {
			progressBook = text
		}

		server.log.Printf("Sending book entitled '%s'.\n", filepath.Base(extractedPath))
		response := newDownloadResponse(progressBook, extractedPath, disableBrowserDownloads)
		if hasRequest {
			server.sendToClient(request.requester, response)
		} else {
			server.broadcast(response)
		}
		server.broadcast(newBooksUpdatedResponse())
	}
}

// NoResults is called when the server returns that nothing was found for the query
func (server *server) noResultsHandler(_ string) {
	request, ok := server.claimSearchRequest()
	if ok {
		server.sendToClient(request.requester, newStatusResponse(WARNING, "No results found for the query."))
		server.sendToClient(request.requester, newSearchResponse([]core.BookDetail{}, []core.ParseError{}))
		return
	}
	server.broadcast(newStatusResponse(WARNING, "No results found for the query."))
}

// BadServer is called when the requested download fails because the server is not available
func (server *server) badServerHandler(line string) {
	request, ok := server.claimDownloadRequestBySender(line)
	if ok {
		server.sendToClient(request.requester, newErrorResponse("Server is not available. Try another one."))
		return
	}
	server.broadcast(newErrorResponse("Server is not available. Try another one."))
}

// SearchAccepted is called when the user's query is accepted into the search queue
func (server *server) searchAcceptedHandler(_ string) {
	request, ok := server.peekSearchRequest()
	if ok {
		server.sendToClient(request.requester, newStatusResponse(NOTIFY, "Search accepted into the queue."))
		return
	}
	server.broadcast(newStatusResponse(NOTIFY, "Search accepted into the queue."))
}

// MatchesFound is called when the server finds matches for the user's query
func (server *server) matchesFoundHandler(num string) {
	request, ok := server.peekSearchRequest()
	if ok {
		server.sendToClient(request.requester, newStatusResponse(NOTIFY, fmt.Sprintf("Found %s results for your query.", num)))
		return
	}
	server.broadcast(newStatusResponse(NOTIFY, fmt.Sprintf("Found %s results for your query.", num)))
}

func (server *server) pingHandler(serverUrl string) {
	server.setIrcActivityNow()
	if err := server.sharedIRC.Pong(serverUrl); err != nil {
		server.log.Printf("Error responding to IRC ping: %v\n", err)
	}
}

func (server *server) pongHandler(_ string) {
	server.setIrcActivityNow()
}

func (server *server) versionHandler(version string) core.HandlerFunc {
	return func(line string) {
		server.log.Printf("Sending CTCP version response: %s", line)
		if err := core.SendVersionInfo(server.sharedIRC, line, version); err != nil {
			server.log.Printf("Error sending CTCP version response: %v\n", err)
		}
	}
}

func (server *server) userListHandler(repo *Repository) core.HandlerFunc {
	return func(text string) {
		servers := core.ParseServers(text)
		repo.UpdateServerList(servers)

		server.log.Printf("Server list updated: %d elevated, %d regular users\n",
			len(servers.ElevatedUsers), len(servers.RegularUsers))

		server.broadcast(newServerListResponse())
	}
}

type transferProgressWriter struct {
	total    int64
	received int64
	lastEmit time.Time
	emit     func(received, total int64)
}

func newTransferProgressWriter(total int64, emit func(received, total int64)) *transferProgressWriter {
	return &transferProgressWriter{
		total: total,
		emit:  emit,
	}
}

func (w *transferProgressWriter) Write(p []byte) (int, error) {
	n := len(p)
	w.received += int64(n)

	now := time.Now()
	if now.Sub(w.lastEmit) >= 500*time.Millisecond || (w.total > 0 && w.received >= w.total) {
		w.emit(w.received, w.total)
		w.lastEmit = now
	}

	return n, nil
}
