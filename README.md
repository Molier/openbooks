# OpenBooks

[![Docker Pulls](https://img.shields.io/docker/pulls/evanbuss/openbooks.svg)](https://hub.docker.com/r/evanbuss/openbooks/)
[![GitHub Release](https://img.shields.io/github/v/release/evan-buss/openbooks)](https://github.com/evan-buss/openbooks/releases)
[![License](https://img.shields.io/github/license/evan-buss/openbooks)](LICENSE)

**OpenBooks** is a web-based eBook searcher and downloader that connects to IRC Highway, providing an easy-to-use interface for finding and downloading eBooks from the world's largest IRC book archive.

> **Note:** This project is a client for IRC Highway's book search service. Always respect copyright laws in your jurisdiction.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./.github/home_v3_dark.png">
  <img alt="openbooks screenshot" src="./.github/home_v3.png">
</picture>

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Mobile Experience](#mobile-experience)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)
- [Development](#development)
- [Technology Stack](#technology-stack)
- [Contributing](#contributing)

---

## Features

### Core Features
- 🔍 **Search & Download** - Search thousands of eBooks and download with one click
- 🌐 **Web Interface** - Modern, responsive React-based UI accessible from any browser
- 🐳 **Docker Ready** - Deploy in seconds with Docker or docker-compose
- 💾 **Persistent Storage** - Optionally save books to disk for your collection
- 📦 **Auto-Extract** - Automatically extract archives (ZIP, RAR, 7z) and clean up
- 🔐 **HTTP Basic Auth** - Optional password protection for your instance

### Multi-User & Mobile
- 👥 **Multi-Browser Support** - Multiple tabs/browsers can use OpenBooks simultaneously
- 📱 **Mobile-First UX** - Card-based interface optimized for touch devices
- 🎯 **Smart Grouping** - Duplicate books from different servers grouped together
- 📂 **Progressive Disclosure** - Expandable source lists reduce visual clutter
- ⚡ **Touch-Friendly** - 48dp minimum touch targets, mobile gestures supported
- 🔄 **Auto-Retry** - Failed downloads automatically retry every hour for 24 hours

### Developer & Power User
- 🎲 **Random Usernames** - Auto-generate IRC nicknames for easy deployment
- 📊 **Download Queue** - Visual queue for failed/pending downloads
- ⏱️ **Smart Timeouts** - 60-second search timeout prevents stuck states
- 🔌 **WebSocket Disconnect Handling** - Gracefully handles app switching and network issues
- 🧪 **Mock IRC Server** - Test and develop without connecting to IRC Highway
- 🪵 **Debug Logging** - Save raw IRC logs for troubleshooting

### Reliability Features
- ✅ **Search Timeout** - Searches timeout after 60 seconds with clear error messages
- ✅ **Manual Cancel** - Cancel button appears during searches for immediate control
- ✅ **Connection Recovery** - Auto-clears stuck states on WebSocket disconnect
- ✅ **Inline Errors** - Parse errors shown as cards with copy-to-clipboard support
- ✅ **Offline Detection** - Visual indicators for offline IRC servers
- ✅ **Size Formatting** - Consistent file size display (KB/MB/GB)

---

## Quick Start

### Docker (Recommended)

**Production setup** with authentication, auto-extract, and random username:
```bash
docker run -p 8383:80 \
  -v $(pwd)/books:/books \
  -e AUTH_USER=admin \
  -e AUTH_PASS="ChangeMe123!" \
  evanbuss/openbooks \
  --random-name \
  --server irc.irchighway.net:6667 \
  --tls=false \
  server --persist --auto-extract
```

Then visit: **http://localhost:8383**

**Simple setup** (no authentication):
```bash
docker run -p 8080:80 evanbuss/openbooks \
  --random-name \
  --server irc.irchighway.net:6667 \
  --tls=false \
  server
```

### Docker Compose

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  openbooks:
    image: evanbuss/openbooks:latest
    container_name: openbooks
    ports:
      - "8383:80"
    volumes:
      - ./books:/books
    environment:
      - AUTH_USER=admin
      - AUTH_PASS=ChangeMe123!
    command: [
      "--random-name",
      "--server", "irc.irchighway.net:6667",
      "--tls=false",
      "server",
      "--dir", "/books",
      "--port", "80",
      "--persist",
      "--auto-extract"
    ]
    restart: unless-stopped
```

Run: `docker-compose up -d`

---

## Installation

### Docker

**Pull from Docker Hub:**
```bash
docker pull evanbuss/openbooks:latest
```

**Or build from source:**
```bash
git clone https://github.com/evan-buss/openbooks.git
cd openbooks
docker build -t openbooks:local .
```

### Binary

1. **Download** the latest release for your platform from the [releases page](https://github.com/evan-buss/openbooks/releases)

2. **Make executable** (Linux/macOS):
   ```bash
   chmod +x openbooks
   ```

3. **Run:**
   ```bash
   ./openbooks --help
   ```

### From Source

**Requirements:**
- Go 1.21+
- Node.js 18+
- npm

**Build:**
```bash
git clone https://github.com/evan-buss/openbooks.git
cd openbooks
./build.sh
```

The compiled binary will be in `./cmd/openbooks/`.

---

## Configuration

### Global Flags

| Flag | Environment Variable | Default | Description |
|------|---------------------|---------|-------------|
| `--name` / `-n` | - | (required*) | IRC username to connect with |
| `--random-name` | - | `false` | Auto-generate random username (e.g., `cosmic_405821`) |
| `--server` / `-s` | - | `irc.irchighway.net:6697` | IRC server address and port |
| `--tls` | - | `true` | Use TLS (see [Troubleshooting](#irc-connection-issues)) |
| `--searchbot` | - | `search` | IRC search bot (`search` or `searchook`) |
| `--log` / `-l` | - | `false` | Save raw IRC logs to disk |
| `--useragent` / `-u` | - | `OpenBooks 4.3.0` | User agent string |
| `--auth-user` | `AUTH_USER` | - | Username for HTTP Basic Auth |
| `--auth-pass` | `AUTH_PASS` | - | Password for HTTP Basic Auth |

\* Either `--name` or `--random-name` is required

### Server Mode Flags

| Flag | Environment Variable | Default | Description |
|------|---------------------|---------|-------------|
| `--port` / `-p` | - | `5228` | Web server port |
| `--rate-limit` / `-r` | - | `10` | Seconds between searches (min: 10) |
| `--basepath` | `BASE_PATH` | `/` | Base URL path for reverse proxy |
| `--persist` | - | `false` | Save books to disk permanently |
| `--dir` / `-d` | - | `/tmp/openbooks` | Directory for saved books |
| `--auto-extract` | - | `false` | Extract archives and remove originals |
| `--no-browser-downloads` | - | `false` | Don't send to browser (disk only) |
| `--browser` / `-b` | - | `false` | Auto-open browser on start |

### Configuration Examples

**Random username with authentication:**
```bash
docker run -p 8383:80 \
  -e AUTH_USER=admin \
  -e AUTH_PASS="SecurePass123!" \
  evanbuss/openbooks --random-name server
```

**Custom username with persistent storage:**
```bash
./openbooks --name BookLover123 \
  --server irc.irchighway.net:6667 \
  --tls=false \
  server --persist --dir ~/books
```

**Behind reverse proxy with base path:**
```bash
docker run -p 8080:80 \
  -e BASE_PATH=/openbooks/ \
  evanbuss/openbooks --random-name server
```

**Auto-extract archives with logging:**
```bash
./openbooks --random-name \
  --server irc.irchighway.net:6667 \
  --tls=false \
  --log \
  server --persist --auto-extract
```

---

## Usage

### Web Interface

1. **Search:** Enter a book title, author, or ISBN in the search box
2. **Browse Results:** Results are grouped by book with multiple sources
3. **Expand Sources:** Click "▼ Show X more sources" to see all available servers
4. **Download:** Click the download button on your preferred source
5. **Wait:** Download status updates in real-time
6. **Retry:** Failed downloads are added to the retry queue

### Search Tips

- **General search:** `why we sleep`
- **Author search:** `matthew walker`
- **Specific edition:** `why we sleep epub`
- **Manual download:** If a book shows "Manual download required", click "Copy Command" and paste into search box with `!` prefix

### Download States

| Status | Meaning | Action |
|--------|---------|--------|
| **Requesting...** | Connecting to IRC server | Wait (< 5 seconds) |
| **Waiting...** | Waiting for server response | Wait (< 30 seconds) |
| **Still waiting...** | Server slow to respond | Wait or cancel |
| **Downloading...** | File transfer in progress | Wait |
| **✓ Done** | Download complete | File downloaded |
| **Retry** | Timeout or failure | Click to retry |

### Retry Queue

Failed downloads are automatically added to the retry queue:
- **Auto-retry:** Every hour for 24 hours
- **Manual retry:** Click the retry button
- **Remove:** Click the X button to cancel

---

## Mobile Experience

OpenBooks features a mobile-first design optimized for touch devices:

### Mobile Features

✅ **Card-Based Layout** - Vertical scrolling, no horizontal scroll
✅ **Full Text Visibility** - Book titles and authors fully visible (2-line wrap)
✅ **Smart Grouping** - Same book from multiple servers shown as one card
✅ **Progressive Disclosure** - "Show more sources" reduces clutter
✅ **Inline Errors** - Parse errors shown as cards with helpful actions
✅ **Touch Targets** - 48dp minimum for all buttons (Material Design compliant)
✅ **Safe Area Support** - Works with notched displays (iPhone X+, modern Android)
✅ **Results Count** - "29 results • ⚠️ 8 manual" summary bar
✅ **Standardized Sizes** - Consistent "1.5 MB", "351 KB" formatting

### Mobile Screenshots

The interface adapts seamlessly:
- **Portrait Mode:** Optimized for one-handed use
- **Landscape Mode:** Takes advantage of wider screen
- **Tablet Mode:** Multi-column layout for larger screens
- **Desktop Mode:** Full-width table view with filtering

### Supported Browsers

- ✅ iOS Safari (iOS 11+)
- ✅ Chrome (iOS/Android)
- ✅ Firefox (Android)
- ✅ Edge (Android/iOS)
- ✅ Samsung Internet
- ✅ Kiwi Browser

---

## Troubleshooting

### IRC Connection Issues

**Problem:** "Unable to connect to IRC server" or EOF errors

**Root Cause:** Go's TLS implementation is incompatible with IRC Highway's TLS configuration ([#102](https://github.com/evan-buss/openbooks/issues/102), [#134](https://github.com/evan-buss/openbooks/issues/134))

**Solution:** Use port 6667 without TLS:
```bash
--server irc.irchighway.net:6667 --tls=false
```

**Port Reference:**

| Port | TLS | Status | Recommended |
|------|-----|--------|-------------|
| 6667 | No | ✅ Works | **Yes - Use this** |
| 6697 | Yes | ❌ Fails | No |
| 9999 | Yes | ❌ Fails | No |

**Security Note:** IRC traffic is unencrypted on port 6667, but:
- Search queries are public data (book titles)
- Downloads use DCC protocol (separate from IRC)
- Use `--auth-user` and `--auth-pass` to protect your web interface
- Run behind HTTPS reverse proxy for public deployments

### Search Stuck or Timeout

**Problem:** Search never completes, button spinning forever

**Causes:**
- WebSocket disconnected mid-search
- IRC server didn't respond
- Browser tab closed during search

**Solutions:**
1. **Wait 60 seconds** - Search auto-fails with error message
2. **Click "Cancel"** - Red button appears during search
3. **Refresh page** - Clears stuck state automatically

**How it works:**
- 60-second timeout clears pending searches
- WebSocket disconnect clears pending searches
- Manual cancel button for immediate control

### Empty Search Results

**Possible causes:**
1. IRC search bot is down
2. Network connectivity issues
3. Rate limiting

**Solutions:**
```bash
# Try alternative search bot
--searchbot searchook

# Enable debug logging
--log

# Check IRC Highway status
# Visit: https://irchighway.net
```

### Rate Limiting

**Problem:** "Rate limit exceeded" or temporary ban

**Solution:**
```bash
# Increase rate limit (default: 10 seconds)
--rate-limit 15

# Wait 5-10 minutes before searching again
```

### Authentication Issues

**Problem:** Auth prompt doesn't appear or fails

**Checklist:**
- [ ] Both `--auth-user` AND `--auth-pass` are set
- [ ] No special characters needing shell escaping
- [ ] Docker: Use environment variables `-e AUTH_USER=... -e AUTH_PASS=...`
- [ ] Check logs for: "Both --auth-user and --auth-pass must be set"

**Example:**
```bash
# ✅ Correct (Docker)
docker run -e AUTH_USER=admin -e AUTH_PASS="Pass123!" ...

# ❌ Wrong (missing one)
docker run -e AUTH_USER=admin ...

# ✅ Correct (CLI)
./openbooks --auth-user admin --auth-pass "Pass123!" ...
```

### Mobile Interface Issues

**Problem:** Buttons hidden, content cropped on mobile

**Solutions:**
1. Clear browser cache
2. Update to latest OpenBooks version
3. Try landscape orientation
4. Use supported browser (see [Mobile Experience](#mobile-experience))

**Known Issues:**
- Older browsers may not support `safe-area-inset`
- PWA mode may have layout issues on some Android devices

### Download Fails

**Problem:** Download starts but fails

**Possible causes:**
1. Server offline (grey indicator)
2. File no longer available
3. DCC connection blocked by firewall

**Solutions:**
1. Try different source (expand "Show more sources")
2. Check server status indicator (green = online, grey = offline)
3. Check firewall settings for DCC ports
4. Enable logging: `--log` to debug DCC connection

---

## Architecture

### How OpenBooks Works

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ WebSocket
       ▼
┌─────────────────┐     IRC Protocol     ┌──────────────┐
│  OpenBooks      │ ◄──────────────────► │ IRC Highway  │
│  Go Backend     │                      │ IRC Server   │
└─────────────────┘                      └──────────────┘
       │
       │ DCC Protocol
       ▼
┌─────────────────┐
│  IRC Book Bot   │
│  (File Server)  │
└─────────────────┘
```

**Flow:**
1. **Connection:** OpenBooks connects to IRC Highway and joins search channels
2. **Search:** User searches → IRC query sent to search bot
3. **Results:** Search bot replies with book list via IRC private messages
4. **Download:** User clicks book → DCC (Direct Client-to-Client) transfer initiated
5. **Processing:** File extracted (if archive), served to browser or saved to disk

### Multi-Browser Support

OpenBooks uses a **shared IRC connection** architecture:

```
Browser Tab 1 ──► WebSocket 1 ──┐
Browser Tab 2 ──► WebSocket 2 ──┼──► Shared IRC Connection ──► IRC Highway
Browser Tab 3 ──► WebSocket 3 ──┘
```

**Benefits:**
- ✅ Multiple browsers/tabs work simultaneously
- ✅ Single IRC connection (server accepts single nickname)
- ✅ All clients receive search results via broadcast
- ✅ Thread-safe with mutex protection

**Technical Details:**
- Each browser tab = unique WebSocket connection
- All WebSocket clients share 1 IRC connection (lazy-initialized)
- IRC events broadcast to all connected clients
- Mutex-protected IRC operations for thread safety

### State Management

**Frontend (React + Redux):**
- WebSocket middleware for real-time communication
- Download state tracking with retry queue
- Search timeout and cancel handling
- Optimistic UI updates

**Backend (Go):**
- Gorilla WebSocket for client connections
- Thread-safe IRC connection sharing
- DCC file transfer management
- Archive extraction with cleanup

---

## Development

### Prerequisites

- Go 1.21+
- Node.js 18+
- npm
- Docker (optional)

### Local Development

**1. Clone repository:**
```bash
git clone https://github.com/evan-buss/openbooks.git
cd openbooks
```

**2. Install dependencies:**
```bash
go mod download
cd server/app && npm install && cd ../..
```

**3. Run development servers:**

**Backend:**
```bash
go run cmd/openbooks/main.go \
  --random-name \
  --server irc.irchighway.net:6667 \
  --tls=false \
  server --port 5228
```

**Frontend (separate terminal):**
```bash
cd server/app
npm run dev
```

Visit: http://localhost:3000 (frontend) → proxies to http://localhost:5228 (backend)

### Mock IRC Server

Test without connecting to IRC Highway:

**Terminal 1 (Mock Server):**
```bash
cd cmd/mock_server
go run .
```

**Terminal 2 (OpenBooks):**
```bash
cd cmd/openbooks
go run . server --server localhost --log
```

### Building

**Full build (frontend + backend + cross-compile):**
```bash
./build.sh
```

**Go binary only:**
```bash
go build -o openbooks cmd/openbooks/main.go
```

**Frontend only:**
```bash
cd server/app
npm run build
```

**Docker:**
```bash
docker build -t openbooks:dev .
```

### Project Structure

```
openbooks/
├── cmd/
│   ├── openbooks/        # Main application entry point
│   └── mock_server/      # Mock IRC server for testing
├── server/
│   ├── app/              # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── cards/     # BookCard, ErrorCard, SourceRow
│   │   │   │   ├── tables/    # Legacy table components
│   │   │   │   └── ...
│   │   │   ├── pages/         # SearchPage
│   │   │   ├── state/         # Redux store, slices, middleware
│   │   │   └── utils/         # Book grouping, formatting
│   │   └── ...
│   ├── client.go         # IRC client implementation
│   ├── server.go         # HTTP/WebSocket server
│   ├── routes.go         # API routes
│   ├── middlewares.go    # Auth, logging
│   └── ...
├── core/                 # IRC protocol, search parsing
├── irc/                  # Low-level IRC implementation
├── dcc/                  # DCC file transfer protocol
├── util/                 # Archive extraction, helpers
├── cli/                  # CLI mode (terminal interface)
└── desktop/              # Experimental webview support
```

### Running Tests

```bash
# Go tests
go test ./...

# Frontend tests (if you add them)
cd server/app
npm test
```

### Code Style

**Go:**
- Follow [Effective Go](https://golang.org/doc/effective_go)
- Use `gofmt` for formatting
- Run `golangci-lint` for linting

**TypeScript/React:**
- ESLint + Prettier configured
- Run `npm run lint` before committing

---

## Technology Stack

### Backend

| Technology | Purpose |
|------------|---------|
| **Go 1.21** | Primary backend language |
| **stdlib only** | Core features (no external dependencies) |
| **Chi** | HTTP router |
| **gorilla/websocket** | WebSocket support |
| **archiver/v3** | Archive extraction (ZIP, RAR, 7z) |
| **cobra** | CLI framework |

### Frontend

| Technology | Purpose |
|------------|---------|
| **React 18** | UI framework |
| **TypeScript** | Type safety |
| **Redux Toolkit** | State management |
| **RTK Query** | API data fetching |
| **Mantine UI** | Component library |
| **@emotion/react** | CSS-in-JS styling |
| **@tanstack/react-virtual** | Virtual scrolling |
| **Vite** | Build tool |

### Protocols

| Protocol | Purpose |
|----------|---------|
| **IRC** | Internet Relay Chat for search queries |
| **DCC** | Direct Client-to-Client for file transfers |
| **WebSocket** | Real-time browser ↔ server communication |

---

## Security

### Authentication

OpenBooks supports HTTP Basic Authentication:
- Zero external dependencies (Go stdlib)
- Constant-time password comparison (`crypto/subtle`)
- Optional (works without auth for trusted networks)
- Both CLI flags and environment variables supported

**Setup:**
```bash
# Both required together
--auth-user admin --auth-pass "SecurePassword123!"
```

**Security Best Practices:**
- Use strong passwords (12+ characters, mixed case, symbols)
- Run behind HTTPS reverse proxy for public deployments
- Rotate passwords regularly
- Use environment variables instead of CLI flags (prevents shell history exposure)

### Known Security Considerations

**IRC Connection:**
- Port 6667 = unencrypted IRC traffic
- Search queries are public data (book titles)
- Consider running on private network or behind VPN

**DCC Transfers:**
- Direct connection between OpenBooks and IRC file servers
- Files downloaded directly, not routed through IRC
- Consider firewall rules for DCC port range

For complete security audit, see: **SECURITY_AUDIT.md**

---

## Contributing

Contributions are welcome! Here's how to help:

### Reporting Bugs

1. Check [existing issues](https://github.com/evan-buss/openbooks/issues)
2. Create new issue with:
   - OpenBooks version
   - Operating system
   - Steps to reproduce
   - Expected vs actual behavior
   - Logs (if using `--log` flag)

### Suggesting Features

1. Check [existing feature requests](https://github.com/evan-buss/openbooks/issues?q=is%3Aissue+label%3Aenhancement)
2. Create issue with:
   - Use case description
   - Proposed solution
   - Alternative approaches considered

### Pull Requests

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make changes following code style guidelines
4. Test thoroughly
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open Pull Request

**PR Guidelines:**
- One feature/fix per PR
- Update documentation if needed
- Add tests for new features
- Follow existing code style
- Reference related issues

---

## Roadmap

### Completed ✅

- [x] Web-based interface
- [x] Docker support
- [x] Multi-browser/tab support
- [x] Mobile-first UX redesign
- [x] Auto-retry failed downloads
- [x] Search timeout handling
- [x] HTTP Basic Authentication
- [x] Auto-extract archives
- [x] Random username generation
- [x] Persistent storage
- [x] Inline error handling
- [x] Progressive disclosure UI
- [x] Safe-area mobile support

### Planned 🚧

- [ ] Advanced filtering (format, size, server)
- [ ] Sort by popularity/size/date
- [ ] Bookmarks/favorites system
- [ ] Download history
- [ ] Batch downloads
- [ ] Dark mode improvements
- [ ] PWA support (offline mode)
- [ ] API for programmatic access
- [ ] Multiple search bot support
- [ ] Custom themes

### Under Consideration 💭

- [ ] WebView desktop app (native-like)
- [ ] Server-side search history
- [ ] Multi-language support
- [ ] Book metadata enrichment
- [ ] Reading progress tracking
- [ ] Integration with ebook readers

---

## FAQ

**Q: Is this legal?**
A: OpenBooks is a client for IRC Highway's public book search service. Always respect copyright laws in your jurisdiction.

**Q: Why does TLS not work?**
A: Go's TLS implementation is incompatible with IRC Highway's TLS configuration. Use port 6667 with `--tls=false`.

**Q: Can I use this on my phone?**
A: Yes! The mobile interface is optimized for touch devices. Just visit the OpenBooks URL in your mobile browser.

**Q: Does this work with other IRC servers?**
A: OpenBooks is designed specifically for IRC Highway. Other IRC book servers may use different protocols.

**Q: How do I update to the latest version?**
A: **Docker:** `docker pull evanbuss/openbooks:latest`
**Binary:** Download latest from [releases page](https://github.com/evan-buss/openbooks/releases)

**Q: Can multiple users share one instance?**
A: Yes! OpenBooks supports multiple concurrent users and browser tabs.

**Q: Where are my books saved?**
A: With `--persist` enabled, books are saved to `--dir` (default: `/tmp/openbooks`). Without `--persist`, they're downloaded to your browser and deleted from the server.

**Q: How do I run OpenBooks behind a reverse proxy?**
A: Use `--basepath` flag. See [Configuration Examples](#configuration-examples).

---

## Acknowledgments

- **IRC Highway** - For providing the IRC book search service
- **Contributors** - Everyone who has contributed code, bug reports, and ideas
- **Users** - Thank you for using OpenBooks!

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Support

- **Issues:** [GitHub Issues](https://github.com/evan-buss/openbooks/issues)
- **Discussions:** [GitHub Discussions](https://github.com/evan-buss/openbooks/discussions)
- **IRC Highway:** https://irchighway.net

---

**Note:** OpenBooks is not affiliated with IRC Highway. This is an independent client application.

---

Made with ❤️ by [Evan Buss](https://github.com/evan-buss) and [contributors](https://github.com/evan-buss/openbooks/graphs/contributors)
