package server

import (
	"sync"
	"time"

	"github.com/evan-buss/openbooks/core"
)

type Repository struct {
	servers                core.IrcServers
	serverListLastUpdated  time.Time
	serverListMutex        sync.RWMutex
}

func NewRepository() *Repository {
	return &Repository{
		servers: core.IrcServers{},
		serverListLastUpdated: time.Time{}, // Zero time = never updated
	}
}

// IsServerListStale returns true if server list is older than 5 minutes
func (r *Repository) IsServerListStale() bool {
	r.serverListMutex.RLock()
	defer r.serverListMutex.RUnlock()

	// If never updated, it's stale
	if r.serverListLastUpdated.IsZero() {
		return true
	}

	// Stale if older than 5 minutes
	return time.Since(r.serverListLastUpdated) > 5*time.Minute
}

// UpdateServerList updates the server list and timestamp
func (r *Repository) UpdateServerList(servers core.IrcServers) {
	r.serverListMutex.Lock()
	defer r.serverListMutex.Unlock()

	r.servers = servers
	r.serverListLastUpdated = time.Now()
}

// GetServerList returns a copy of the current server list
func (r *Repository) GetServerList() core.IrcServers {
	r.serverListMutex.RLock()
	defer r.serverListMutex.RUnlock()

	return r.servers
}
