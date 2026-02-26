package server

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/evan-buss/openbooks/irc"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
	"github.com/rs/cors"
)

type server struct {
	// Shared app configuration
	config *Config

	// Shared data
	repository *Repository
	// Tracks download requests in order so async DCC responses can map back to UI items.
	downloadQueue []downloadRequest
	downloadMutex sync.Mutex

	// Registered clients.
	clients map[uuid.UUID]*Client
	// Guards concurrent access to clients map.
	clientsMutex sync.RWMutex

	// Register requests from the clients.
	register chan *Client

	// Unregister requests from clients.
	unregister chan *Client

	log *log.Logger

	// Mutex to guard the lastSearch timestamp
	lastSearchMutex sync.Mutex

	// The time the last search was performed. Used to rate limit searches.
	lastSearch time.Time

	// Shared IRC connection for all clients
	sharedIRC *irc.Conn

	// Mutex to guard IRC operations
	ircMutex sync.Mutex

	// Flag to track if IRC is connected
	ircConnected bool
	// Flag to ensure only one IRC reader supervisor runs
	ircReaderStarted bool
	// Flag to ensure only one IRC heartbeat loop runs
	heartbeatStarted bool
	// Optional IRC log file handle
	ircLogCloser io.Closer
	// Last time we observed IRC activity (PONG/line).
	lastIrcActivity time.Time

	// Context for IRC reader
	ircCtx context.Context

	// Cancel function for IRC reader
	ircCancel context.CancelFunc

	shutdownOnce sync.Once
}

type downloadRequest struct {
	book   string
	server string
}

// Config contains settings for server
type Config struct {
	Log                     bool
	Port                    string
	UserName                string
	Persist                 bool
	DownloadDir             string
	Basepath                string
	Server                  string
	EnableTLS               bool
	TLSSkipVerify           bool
	SearchTimeout           time.Duration
	SearchBot               string
	DisableBrowserDownloads bool
	UserAgent               string
	AutoExtractAll          bool
	RandomUsername          bool
	AuthUser                string
	AuthPass                string
}

func New(config Config) *server {
	ircCtx, ircCancel := context.WithCancel(context.Background())
	return &server{
		repository:      NewRepository(),
		config:          &config,
		downloadQueue:   make([]downloadRequest, 0),
		register:        make(chan *Client),
		unregister:      make(chan *Client),
		clients:         make(map[uuid.UUID]*Client),
		log:             log.New(os.Stdout, "SERVER: ", log.LstdFlags|log.Lmsgprefix),
		sharedIRC:       irc.New(config.UserName, config.UserAgent),
		ircConnected:    false,
		lastIrcActivity: time.Now(),
		ircCtx:          ircCtx,
		ircCancel:       ircCancel,
	}
}

// Start instantiates the web server and opens the browser
func Start(config Config) {
	createBooksDirectory(config)
	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)

	corsConfig := cors.Options{
		AllowCredentials: true,
		AllowedOrigins:   []string{"http://127.0.0.1:5173"},
		AllowedHeaders:   []string{"*"},
		AllowedMethods:   []string{"GET", "DELETE"},
	}
	router.Use(cors.New(corsConfig).Handler)

	server := New(config)
	routes := server.registerRoutes()

	ctx, cancel := context.WithCancel(context.Background())
	go server.startClientHub(ctx)
	router.Mount(config.Basepath, routes)

	httpServer := &http.Server{
		Addr:    ":" + config.Port,
		Handler: router,
	}
	server.registerGracefulShutdown(cancel, httpServer)

	server.log.Printf("Base Path: %s\n", config.Basepath)
	server.log.Printf("OpenBooks is listening on port %v", config.Port)
	server.log.Printf("Download Directory: %s\n", config.DownloadDir)
	server.log.Printf("Open http://localhost:%v%s in your browser.", config.Port, config.Basepath)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		server.log.Fatal(err)
	}
}

// The client hub is to be run in a goroutine and handles management of
// websocket client registrations.
func (server *server) startClientHub(ctx context.Context) {
	for {
		select {
		case client := <-server.register:
			server.addClient(client)
		case client := <-server.unregister:
			server.removeClient(client)
		case <-ctx.Done():
			for _, client := range server.snapshotClients() {
				server.removeClient(client)
			}
			return
		}
	}
}

func (server *server) registerGracefulShutdown(cancel context.CancelFunc, httpServer *http.Server) {
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-c
		server.shutdownOnce.Do(func() {
			server.log.Println("Graceful shutdown.")
			signal.Stop(c)

			if server.ircCancel != nil {
				server.ircCancel()
			}

			if server.sharedIRC != nil {
				_ = server.sharedIRC.Disconnect()
			}
			server.closeIRCLogFile()

			// Close websocket clients and stop hub.
			cancel()

			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer shutdownCancel()
			if err := httpServer.Shutdown(shutdownCtx); err != nil {
				server.log.Printf("HTTP shutdown error: %v\n", err)
			}
		})
	}()
}

func (server *server) addClient(client *Client) {
	server.clientsMutex.Lock()
	server.clients[client.uuid] = client
	server.clientsMutex.Unlock()
}

func (server *server) removeClient(client *Client) {
	server.clientsMutex.Lock()
	current, ok := server.clients[client.uuid]
	if !ok {
		server.clientsMutex.Unlock()
		return
	}
	delete(server.clients, client.uuid)
	server.clientsMutex.Unlock()

	if current.cancel != nil {
		current.cancel()
	}

	defer func() {
		recover()
	}()
	close(current.send)
}

func (server *server) getClientByUUID(userID uuid.UUID) (*Client, bool) {
	server.clientsMutex.RLock()
	client, ok := server.clients[userID]
	server.clientsMutex.RUnlock()
	return client, ok
}

func (server *server) isClientConnected(userID uuid.UUID) bool {
	server.clientsMutex.RLock()
	_, ok := server.clients[userID]
	server.clientsMutex.RUnlock()
	return ok
}

func (server *server) snapshotClients() []*Client {
	server.clientsMutex.RLock()
	clients := make([]*Client, 0, len(server.clients))
	for _, client := range server.clients {
		clients = append(clients, client)
	}
	server.clientsMutex.RUnlock()
	return clients
}

func (server *server) clientCount() int {
	server.clientsMutex.RLock()
	count := len(server.clients)
	server.clientsMutex.RUnlock()
	return count
}

func (server *server) closeIRCLogFile() {
	server.ircMutex.Lock()
	defer server.ircMutex.Unlock()
	if server.ircLogCloser != nil {
		_ = server.ircLogCloser.Close()
		server.ircLogCloser = nil
	}
}

func (server *server) enqueueDownloadRequest(book string) {
	server.downloadMutex.Lock()
	server.downloadQueue = append(server.downloadQueue, downloadRequest{
		book:   book,
		server: extractServerFromDownloadRequest(book),
	})
	server.downloadMutex.Unlock()
}

// claimDownloadRequestForResponse matches a received DCC response to a pending
// download request. It prefers matching by IRC sender and falls back to FIFO.
func (server *server) claimDownloadRequestForResponse(rawLine string) string {
	sender := extractSenderFromIRCLine(rawLine)

	server.downloadMutex.Lock()
	defer server.downloadMutex.Unlock()

	if len(server.downloadQueue) == 0 {
		return ""
	}

	matchIdx := 0
	if sender != "" {
		for i, request := range server.downloadQueue {
			if request.server == sender {
				matchIdx = i
				break
			}
		}
	}

	request := server.downloadQueue[matchIdx]
	server.downloadQueue = append(server.downloadQueue[:matchIdx], server.downloadQueue[matchIdx+1:]...)

	return request.book
}

func (server *server) setIrcActivityNow() {
	server.ircMutex.Lock()
	server.lastIrcActivity = time.Now()
	server.ircMutex.Unlock()
}

func (server *server) getLastIrcActivity() time.Time {
	server.ircMutex.Lock()
	defer server.ircMutex.Unlock()
	return server.lastIrcActivity
}

func createBooksDirectory(config Config) {
	err := os.MkdirAll(filepath.Join(config.DownloadDir, "books"), os.FileMode(0755))
	if err != nil {
		panic(err)
	}
}

func extractServerFromDownloadRequest(book string) string {
	fields := strings.Fields(strings.TrimSpace(book))
	if len(fields) == 0 {
		return ""
	}
	return normalizeServerName(strings.TrimPrefix(fields[0], "!"))
}

func extractSenderFromIRCLine(line string) string {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, ":") {
		return ""
	}

	trimmed = trimmed[1:]
	if trimmed == "" {
		return ""
	}

	end := strings.IndexAny(trimmed, "! ")
	if end == -1 {
		return normalizeServerName(trimmed)
	}

	return normalizeServerName(trimmed[:end])
}

func normalizeServerName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return ""
	}
	trimmed = strings.TrimPrefix(trimmed, ":")
	trimmed = strings.TrimLeft(trimmed, "~&@%+!")
	return strings.ToLower(trimmed)
}
