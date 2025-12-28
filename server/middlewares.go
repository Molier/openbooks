package server

import (
	"context"
	"crypto/subtle"
	"log"
	"net/http"

	"github.com/google/uuid"
)

type userCtxKeyType string
type uuidCtxKeyType string

const (
	userCtxKey userCtxKeyType = "user-client"
	uuidCtxKey uuidCtxKeyType = "user-uuid"
)

func (server *server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("OpenBooks")
		if err != nil {
			server.log.Println(err)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		userUUID, err := uuid.Parse(cookie.Value)
		if err != nil {
			server.log.Println(err)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), uuidCtxKey, userUUID)))
	})
}

// getClient should only be called when requireUser is in the middleware chain.
func (server *server) getClient(ctx context.Context) *Client {

	user := getUUID(ctx)
	if user == uuid.Nil {
		return nil
	}

	if client, ok := server.clients[user]; ok {
		return client
	}

	return nil
}

func getUUID(ctx context.Context) uuid.UUID {
	uid, ok := ctx.Value(uuidCtxKey).(uuid.UUID)
	if !ok {
		log.Println("Unable to find user.")
	}
	return uid
}

// basicAuthMiddleware provides HTTP Basic Authentication for the server.
// If AuthUser and AuthPass are not configured, authentication is skipped.
// Uses constant-time comparison to prevent timing attacks.
func (server *server) basicAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip authentication if not configured
		if server.config.AuthUser == "" || server.config.AuthPass == "" {
			next.ServeHTTP(w, r)
			return
		}

		// Get credentials from request
		user, pass, ok := r.BasicAuth()
		if !ok {
			server.requireAuth(w, r)
			return
		}

		// Use constant-time comparison to prevent timing attacks
		userMatch := subtle.ConstantTimeCompare([]byte(user), []byte(server.config.AuthUser))
		passMatch := subtle.ConstantTimeCompare([]byte(pass), []byte(server.config.AuthPass))

		if userMatch != 1 || passMatch != 1 {
			server.log.Printf("Failed authentication attempt from %s (user: %s)", r.RemoteAddr, user)
			server.requireAuth(w, r)
			return
		}

		// Authentication successful
		next.ServeHTTP(w, r)
	})
}

// requireAuth sends a 401 Unauthorized response with WWW-Authenticate header
func (server *server) requireAuth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("WWW-Authenticate", `Basic realm="OpenBooks", charset="UTF-8"`)
	w.WriteHeader(http.StatusUnauthorized)
	w.Write([]byte("401 Unauthorized\n"))
}
