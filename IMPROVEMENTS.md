# OpenBooks Improvements Summary

This document summarizes the improvements made to the OpenBooks project.

## 1. Fixed: Multiple Browsers/Tabs Share Same IRC Connection

**Problem**: Previously, each browser tab created a separate IRC connection with the same nickname, causing IRC servers to reject the second connection. Only the first browser window would work.

**Solution**: Implemented a shared IRC connection architecture where:
- All websocket clients share a single IRC connection per server instance
- IRC connection is created on-demand when the first client connects
- IRC events are broadcast to all connected websocket clients
- Multiple browser tabs/windows can now use OpenBooks simultaneously

**Files Modified**:
- `server/server.go`: Added shared IRC connection, mutex, and broadcast mechanism
- `server/client.go`: Removed individual IRC connection from Client struct
- `server/routes.go`: Removed restriction preventing multiple clients
- `server/websocket_requests.go`: Updated to use shared IRC connection
- `server/irc_events.go`: Modified all handlers to broadcast to all clients

**Usage**: No configuration needed - multiple tabs/browsers now work automatically.

---

## 2. Added: Auto-Extract All Files from Archives

**Problem**: Archives with multiple files were not extracted - only the archive itself was served.

**Solution**:
- Added `--auto-extract` flag to extract all files from archives (zips, rars, etc.)
- Automatically removes the archive after successful extraction
- Returns the first extracted file to the browser

**Files Modified**:
- `server/server.go`: Added `AutoExtractAll` config option
- `util/archiver.go`: Added `ExtractAllFiles()` function
- `core/file.go`: Added `DownloadExtractDCCStringWithOptions()` function
- `server/irc_events.go`: Updated handlers to use new extraction option
- `cmd/openbooks/server.go`: Added `--auto-extract` CLI flag
- `cmd/openbooks/main.go`: Added desktop mode flag support

**Usage**:
```bash
# Docker
docker run -p 8080:80 evanbuss/openbooks --name MyUser --auto-extract

# Binary
./openbooks server --name MyUser --auto-extract
```

---

## 3. Added: Random Username Generation

**Problem**: The `--name` flag was required, making it cumbersome for quick testing or Docker deployments.

**Solution**:
- Added `--random-name` flag to auto-generate usernames in format `word_timestamp` (e.g., `cosmic_405821`, `phoenix_123456`)
- Uses a pool of 50 random dictionary words combined with a timestamp for uniqueness
- Either `--name` or `--random-name` is now required (not both)
- Simplifies Docker deployments and testing
- Avoids IRC server restrictions on specific keywords

**Files Modified**:
- `server/server.go`: Added `RandomUsername` config option
- `cmd/openbooks/main.go`: Added `RandomUsername` to GlobalFlags and flag definition
- `cmd/openbooks/server.go`: Added `--random-name` flag
- `cmd/openbooks/util.go`: Added `generateRandomUsername()` function

**Usage**:
```bash
# Docker
docker run -p 8080:80 evanbuss/openbooks --random-name

# Binary
./openbooks server --random-name

# Or specify a name
./openbooks server --name MyCustomName
```

---

## 4. Added: HTTP Basic Authentication

**Problem**: OpenBooks had no built-in authentication, making it accessible to anyone who could reach the server.

**Solution**:
- Added HTTP Basic Authentication using Go's standard library
- Uses `crypto/subtle.ConstantTimeCompare` to prevent timing attacks
- Optional authentication via CLI flags or environment variables
- Zero external dependencies - pure Go stdlib
- Browser-native authentication prompts

**Files Modified**:
- `server/middlewares.go`: Added `basicAuthMiddleware` with constant-time comparison
- `server/server.go`: Added `AuthUser` and `AuthPass` config fields
- `server/routes.go`: Applied auth middleware to all routes
- `cmd/openbooks/main.go`: Added `AuthUser` and `AuthPass` to GlobalFlags
- `cmd/openbooks/server.go`: Added environment variable support and status logging
- `cmd/openbooks/util.go`: Added validation for auth credentials

**Usage with CLI flags:**
```bash
docker run -p 8383:80 openbooks-improved \
  --random-name \
  --auth-user admin \
  --auth-pass "your-secure-password" \
  server --persist --auto-extract
```

**Usage with environment variables:**
```bash
docker run -p 8383:80 \
  -e AUTH_USER=admin \
  -e AUTH_PASS="your-secure-password" \
  openbooks-improved --random-name server --persist
```

**Security Features**:
- ✅ Constant-time password comparison (prevents timing attacks)
- ✅ Both username and password required together
- ✅ Failed authentication attempts logged (without credentials)
- ✅ Works with existing `--tls` flag for encrypted transport
- ✅ No external dependencies = no CVE vulnerabilities
- ✅ Browser handles credential storage/prompting

**Note**: Authentication is optional. If not configured, OpenBooks works as before.

---

## 5. Fixed: Mobile Interface Layout Issues

**Problem**:
- Mobile interface cropped badly
- Buttons were hidden under browser UI (URL bar, bottom navigation)
- Issues on Edge and Kiwi browsers

**Solution**:
- Added `viewport-fit=cover` to handle notch/safe areas
- Implemented CSS safe-area-inset for proper padding
- Fixed body/root overflow and height issues
- Prevented scrolling behind browser chrome

**Files Modified**:
- `server/app/index.html`: Enhanced viewport meta tags and added base styles
- `server/app/src/App.tsx`: Fixed wrapper dimensions and overflow
- `server/app/src/pages/SearchPage.tsx`: Added safe-area padding for mobile devices

**Improvements**:
- Content respects safe areas (notches, rounded corners)
- No content hidden behind browser UI
- Proper scrolling behavior on mobile
- Works with browser address bars (auto-hide on scroll)

---

## Breaking Changes

None! All changes are backwards compatible. Existing Docker commands and CLI usage continue to work as before.

---

## Migration Guide

### For Docker Users

**Before (single browser only)**:
```bash
docker run -p 8080:80 evanbuss/openbooks --name TestUser --persist
```

**After (supports multiple browsers + auto-extract)**:
```bash
docker run -p 8080:80 evanbuss/openbooks --random-name --persist --auto-extract
```

### For Binary Users

**Before**:
```bash
./openbooks server --name MyUser
```

**After (with new features)**:
```bash
# Random username + auto-extract
./openbooks server --random-name --auto-extract

# Or with custom name
./openbooks server --name MyUser --auto-extract
```

---

## Testing Recommendations

1. **Multiple Browsers Test**:
   - Open OpenBooks in Chrome, Firefox, and Edge simultaneously
   - Verify all can connect and receive search results
   - Verify downloads work in all browsers

2. **Auto-Extract Test**:
   - Search for and download books that come as zip/rar files
   - Verify archives are extracted and removed
   - Check that extracted files are served correctly

3. **Random Username Test**:
   - Start server with `--random-name`
   - Verify connection succeeds with auto-generated username
   - Check logs for username format

4. **Mobile Test**:
   - Open on mobile device (iOS Safari, Chrome, Edge, Kiwi)
   - Verify search bar is always visible
   - Check that buttons aren't hidden under browser UI
   - Test in both portrait and landscape modes

---

## Architecture Changes

### Shared IRC Connection Flow

```
Before:
Browser 1 → WebSocket 1 → IRC Connection 1 ✅
Browser 2 → WebSocket 2 → IRC Connection 2 ❌ (rejected by IRC server)

After:
Browser 1 → WebSocket 1 ↘
                          → Shared IRC Connection ✅
Browser 2 → WebSocket 2 ↗
Browser 3 → WebSocket 3 ↗
```

### Archive Extraction Flow

```
Before:
Download → Is Archive? → Single File? → Extract → Serve File
                       → Multiple Files? → Serve Archive (as-is)

After (with --auto-extract):
Download → Is Archive? → Extract All Files → Delete Archive → Serve First File
                                                             → Other files saved to disk
```

---

## Performance Considerations

- **IRC Connection**: Single shared connection reduces server load and IRC server connections
- **Broadcasting**: Minimal overhead as messages are only sent to connected clients
- **Archive Extraction**: Slightly higher disk I/O when extracting all files, but cleaner for users
- **Mobile Layout**: No performance impact, purely CSS/HTML changes

---

## Future Enhancements (Not Implemented)

1. **Multi-file Download UI**: Currently serves first file when multiple files are extracted. Could add UI to download all files as a new zip or individually.
2. **Username Persistence**: Save random username to config file to maintain same username across restarts.
3. **Mobile PWA**: Add service worker for offline support and installable app experience.
4. **Connection Status**: Show connected client count in UI.

---

## Changelog

### [Unreleased]

#### Added
- Shared IRC connection for multiple browser clients (server/server.go, server/client.go, server/routes.go, server/websocket_requests.go, server/irc_events.go)
- `--auto-extract` flag to extract all files from archives (util/archiver.go, core/file.go, cmd/openbooks/server.go)
- `--random-name` flag to generate random usernames (cmd/openbooks/main.go, cmd/openbooks/util.go)
- Mobile viewport safe-area support (server/app/index.html, server/app/src/App.tsx, server/app/src/pages/SearchPage.tsx)

#### Fixed
- Multiple browser/tab connections now work simultaneously
- Mobile interface no longer hides content under browser UI
- Archives with multiple files are now extracted properly

#### Changed
- `--name` flag is no longer strictly required (use `--random-name` instead)
- IRC connection is created on-demand rather than per-client
- All IRC events are now broadcast to all connected clients

---

## Credits

Improvements made to enhance the OpenBooks user experience, particularly for:
- Users wanting to access OpenBooks from multiple devices/tabs
- Docker deployments where specifying usernames is cumbersome
- Mobile users experiencing layout issues
- Users downloading archives with multiple files
