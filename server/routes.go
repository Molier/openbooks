package server

import (
	"context"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

//go:embed app/dist
var reactClient embed.FS

func (server *server) registerRoutes() *chi.Mux {
	router := chi.NewRouter()

	// Apply basic authentication middleware if configured
	router.Use(server.basicAuthMiddleware)

	router.Handle("/*", server.staticFilesHandler("app/dist"))
	router.Get("/ws", server.serveWs())
	router.Get("/stats", server.statsHandler())
	router.Get("/servers", server.serverListHandler())

	router.Group(func(r chi.Router) {
		r.Use(server.requireUser)
		r.Get("/library", server.getAllBooksHandler())
		r.Delete("/library/{fileName}", server.deleteBooksHandler())
		r.Get("/library/*", server.getBookHandler())
	})

	return router
}

// serveWs handles websocket requests from the peer.
func (server *server) serveWs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("OpenBooks")
		if errors.Is(err, http.ErrNoCookie) {
			cookie = &http.Cookie{
				Name:     "OpenBooks",
				Value:    uuid.New().String(),
				Path:     server.config.Basepath,
				Secure:   r.TLS != nil,
				HttpOnly: true,
				Expires:  time.Now().Add(time.Hour * 24 * 7),
				SameSite: http.SameSiteStrictMode,
			}
			w.Header().Add("Set-Cookie", cookie.String())
		}

		userId, err := uuid.Parse(cookie.Value)
		alreadyConnected := server.isClientConnected(userId)

		// If invalid UUID or the same browser tries to connect again, reject
		if err != nil || alreadyConnected {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		upgrader.CheckOrigin = server.isAllowedWebsocketOrigin

		conn, err := upgrader.Upgrade(w, r, w.Header())
		if err != nil {
			server.log.Println(err)
			return
		}

		ctx, cancel := context.WithCancel(context.Background())

		client := &Client{
			conn:   conn,
			send:   make(chan interface{}, 128),
			uuid:   userId,
			log:    log.New(os.Stdout, fmt.Sprintf("CLIENT (%s): ", server.config.UserName), log.LstdFlags|log.Lmsgprefix),
			ctx:    ctx,
			cancel: cancel,
		}

		server.log.Printf("Client connected from %s\n", conn.RemoteAddr().String())
		client.log.Println("New client created.")

		server.register <- client

		go server.writePump(client)
		go server.readPump(client)
	}
}

func (server *server) staticFilesHandler(assetPath string) http.Handler {
	// update the embedded file system's tree so that index.html is at the root
	app, err := fs.Sub(reactClient, assetPath)
	if err != nil {
		server.log.Println(err)
	}

	// strip the predefined base path and serve the static file
	return http.StripPrefix(server.config.Basepath, http.FileServer(http.FS(app)))
}

func (server *server) statsHandler() http.HandlerFunc {
	type statsReponse struct {
		UUID string `json:"uuid"`
		IP   string `json:"ip"`
		Name string `json:"name"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		clients := server.snapshotClients()
		result := make([]statsReponse, 0, len(clients))

		for _, client := range clients {
			details := statsReponse{
				UUID: client.uuid.String(),
				Name: server.sharedIRC.Username,
				IP:   client.conn.RemoteAddr().String(),
			}

			result = append(result, details)
		}

		json.NewEncoder(w).Encode(result)
	}
}

func (server *server) serverListHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Check if server list is stale (older than 5 minutes)
		if server.repository.IsServerListStale() && server.ircConnected && server.sharedIRC != nil {
			server.log.Println("Server list stale, requesting fresh user list from IRC...")
			if err := server.sharedIRC.GetUsers("ebooks"); err != nil {
				server.log.Printf("Error requesting server list refresh: %v\n", err)
			}
			// Note: Don't wait for response, it will come asynchronously via ServerList event
			// Frontend will receive SERVER_LIST broadcast and refetch
		}

		// Return current cached data (might be stale, but will update soon)
		servers := server.repository.GetServerList()
		json.NewEncoder(w).Encode(servers)
	}
}

func (server *server) getAllBooksHandler() http.HandlerFunc {
	type download struct {
		Name         string    `json:"name"`
		DownloadLink string    `json:"downloadLink"`
		Time         time.Time `json:"time"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		if !server.config.Persist {
			w.WriteHeader(http.StatusNotFound)
			return
		}

		libraryDir := filepath.Join(server.config.DownloadDir, "books")
		books, err := os.ReadDir(libraryDir)
		if err != nil {
			server.log.Printf("Unable to list books. %s\n", err)
		}

		output := make([]download, 0)
		for _, book := range books {
			if book.IsDir() || strings.HasPrefix(book.Name(), ".") || filepath.Ext(book.Name()) == ".temp" {
				continue
			}

			info, err := book.Info()
			if err != nil {
				server.log.Println(err)
			}

			dl := download{
				Name:         book.Name(),
				DownloadLink: path.Join("library", book.Name()),
				Time:         info.ModTime(),
			}

			output = append(output, dl)
		}

		w.Header().Add("Content-Type", "application/json")
		json.NewEncoder(w).Encode(output)
	}
}

func (server *server) getBookHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, fileName := path.Split(r.URL.Path)
		fileName = filepath.Base(fileName)
		bookPath := filepath.Join(server.config.DownloadDir, "books", fileName)

		// Set Content-Type based on actual file extension
		contentType := "application/octet-stream"
		switch strings.ToLower(filepath.Ext(fileName)) {
		case ".epub":
			contentType = "application/epub+zip"
		case ".pdf":
			contentType = "application/pdf"
		case ".mobi":
			contentType = "application/x-mobipocket-ebook"
		case ".azw3":
			contentType = "application/x-mobi8-ebook"
		case ".txt":
			contentType = "text/plain"
		case ".zip":
			contentType = "application/zip"
		case ".rar":
			contentType = "application/x-rar-compressed"
		}
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": fileName}))

		http.ServeFile(w, r, bookPath)

		if !server.config.Persist {
			err := os.Remove(bookPath)
			if err != nil {
				server.log.Printf("Error when deleting book file. %s", err)
			}
		}
	}
}

func (server *server) deleteBooksHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fileName, err := url.PathUnescape(chi.URLParam(r, "fileName"))
		if err != nil {
			server.log.Printf("Error unescaping path: %s\n", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		safeName := filepath.Base(fileName)
		if safeName == "." || safeName == ".." || safeName == "" || safeName != fileName {
			server.log.Printf("Rejected suspicious delete path: %q\n", fileName)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		err = os.Remove(filepath.Join(server.config.DownloadDir, "books", safeName))
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			server.log.Printf("Error deleting book file: %s\n", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
	}
}

func (server *server) isAllowedWebsocketOrigin(req *http.Request) bool {
	origin := req.Header.Get("Origin")
	if origin == "" {
		return true
	}

	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}

	host := strings.ToLower(parsed.Host)
	requestHost := strings.ToLower(req.Host)
	if host == requestHost {
		return true
	}

	return host == "127.0.0.1:5173" || host == "localhost:5173"
}
