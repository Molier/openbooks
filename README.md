# OpenBooks Fork

A maintained fork of OpenBooks focused on reliability, mobile/desktop UX, and safer multi-session behavior while keeping a single shared IRC backend connection.

## Upstream Attribution

This project is based on the original OpenBooks by Evan Buss:
- Upstream repository: https://github.com/evan-buss/openbooks
- Original Docker image: `evanbuss/openbooks`
- License: MIT (see [LICENSE](LICENSE))

This fork keeps upstream credit and license intact, then layers improvements listed below.

## What This Fork Improves

- Shared IRC backend connection for low IRC load across browser sessions
- Per-session UI isolation for search/download state (phone and desktop no longer overwrite each other)
- Shared library visibility across sessions/devices for the same deployment
- Robust async download mapping and progress handling
- Better source ranking: online first, EPUB preferred, stronger size/format sorting
- Auto EPUB filter default when EPUBs are present (toggleable)
- Retry queue fixes and improved mobile/desktop layout
- Stronger mobile UX (drawer behavior, less intrusive notifications, swipe dismiss)
- Sidebar issue-log export (`normal` + `debug`) for troubleshooting
- Docker and build pipeline updates (Go 1.24 builder, modern frontend deps)

## High-Level Architecture

```mermaid
flowchart LR
  U1[Browser Session A] -->|WebSocket + HTTP| API[OpenBooks Server]
  U2[Browser Session B] -->|WebSocket + HTTP| API

  subgraph Backend
    API --> ROUTER[Chi Router + WS Hub]
    ROUTER --> Q[Per-session Request Queues]
    ROUTER --> REPO[(Server/State Repository)]
    Q --> IRC[Shared IRC Connection]
    IRC --> PARSER[Search/Result Parsers]
    PARSER --> Q
    ROUTER --> LIB[(books/ storage)]
  end

  API -->|session-scoped SEARCH/DOWNLOAD updates| U1
  API -->|session-scoped SEARCH/DOWNLOAD updates| U2
  API -->|shared library invalidation| U1
  API -->|shared library invalidation| U2
```

### Search Flow

```mermaid
sequenceDiagram
  participant A as Browser Session
  participant S as Server
  participant I as Shared IRC

  A->>S: SEARCH(query)
  S->>S: enqueue requester session
  S->>I: send IRC search
  I-->>S: DCC search results
  S->>S: parse + match queued requester
  S-->>A: SEARCH results/errors
```

### Download Flow

```mermaid
sequenceDiagram
  participant A as Browser Session
  participant S as Server
  participant I as Shared IRC
  participant FS as books/ storage

  A->>S: DOWNLOAD(book command)
  S->>S: enqueue requester + server hint
  S->>I: send IRC download
  I-->>S: DCC transfer + progress
  S-->>A: DOWNLOAD_PROGRESS (session-scoped)
  S->>FS: persist file
  S-->>A: DOWNLOAD success (session-scoped)
  S-->>All: BOOKS_UPDATED (shared library refresh)
```

## Quick Start

### Docker Compose (recommended)

From repository root:

```bash
docker compose build
docker compose up -d
```

Default local mapping in this repo is `http://localhost:8383`.

### Run tests/build checks

```bash
go test ./...
```

Frontend build (inside containerized Node toolchain):

```bash
docker run --rm -v "$PWD":/work -w /work/server/app node:18-alpine sh -lc 'npm ci && npm run build'
```

## Runtime Model

- One shared IRC connection per OpenBooks server instance
- Multiple browser sessions can connect simultaneously
- Search/download responses are scoped to the requesting session
- Library/downloaded files are shared across sessions

This balances IRC load efficiency with predictable multi-device UX.

## Security Notes

This fork includes fixes for several common self-hosting risks (basic auth support, websocket origin controls, safer routing, improved request handling).

Still recommended before public exposure:
- Put behind HTTPS reverse proxy
- Use strong `AUTH_USER` / `AUTH_PASS`
- Restrict network exposure to trusted clients
- Keep base image/dependencies updated

## Repository Layout

- `cmd/openbooks/` CLI entrypoint
- `server/` HTTP + WebSocket server
- `server/app/` React frontend
- `core/` IRC parsing/search handling
- `dcc/` DCC transfer logic
- `util/` archive and helper utilities
- `books/` persisted downloads/logs (runtime data)

## Copyright / Legal

OpenBooks is an IRC client for search services. You are responsible for complying with copyright and distribution laws in your jurisdiction.
