# Docker Deployment Guide

Complete guide for running OpenBooks with Docker.

## Quick Start

### Using Docker Compose (Recommended)

1. **Start the service:**
   ```bash
   docker-compose up -d
   ```

2. **View logs:**
   ```bash
   docker-compose logs -f
   ```

3. **Access:** http://localhost:8383
   - **Username:** `admin`
   - **Password:** `changeme123` (change this in `docker-compose.yml`)

### Using Docker Run

```bash
docker run -d \
  --name openbooks \
  -p 8383:80 \
  -v $(pwd)/books:/books \
  -e AUTH_USER=admin \
  -e AUTH_PASS="ChangeMe123!" \
  YOUR_DOCKERHUB_USERNAME/openbooks-fork \
  --random-name \
  --server irc.irchighway.net:6667 \
  --tls=false \
  server --persist --auto-extract
```

---

## Docker Compose Configuration

### Basic Setup

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  openbooks:
    image: YOUR_DOCKERHUB_USERNAME/openbooks-fork:latest
    container_name: openbooks
    ports:
      - "8383:80"
    volumes:
      - ./books:/books
    environment:
      - AUTH_USER=admin
      - AUTH_PASS=changeme123
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

**Run:**
```bash
docker-compose up -d
```

### Without Authentication

```yaml
version: '3.8'
services:
  openbooks:
    image: YOUR_DOCKERHUB_USERNAME/openbooks-fork:latest
    container_name: openbooks
    ports:
      - "8080:80"
    volumes:
      - ./books:/books
    command: [
      "--random-name",
      "--server", "irc.irchighway.net:6667",
      "--tls=false",
      "server",
      "--dir", "/books",
      "--port", "80",
      "--persist"
    ]
    restart: unless-stopped
```

### Behind Reverse Proxy

```yaml
version: '3.8'
services:
  openbooks:
    image: YOUR_DOCKERHUB_USERNAME/openbooks-fork:latest
    container_name: openbooks
    volumes:
      - ./books:/books
    environment:
      - AUTH_USER=admin
      - AUTH_PASS=${OPENBOOKS_PASSWORD}
      - BASE_PATH=/openbooks/
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
    networks:
      - web

networks:
  web:
    driver: bridge
```

**Caddy Configuration:**
```
your-domain.com {
    reverse_proxy /openbooks/* openbooks:80
}
```

**Nginx Configuration:**
```nginx
location /openbooks/ {
    proxy_pass http://openbooks:80/openbooks/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

---

## Docker Run Examples

### Basic (No Authentication)

```bash
docker run -d \
  --name openbooks \
  -p 8080:80 \
  -v $(pwd)/books:/books \
  YOUR_DOCKERHUB_USERNAME/openbooks-fork \
  --random-name \
  --server irc.irchighway.net:6667 \
  --tls=false \
  server --persist
```

### Secure (With Authentication)

```bash
docker run -d \
  --name openbooks \
  -p 8383:80 \
  -v $(pwd)/books:/books \
  -e AUTH_USER=admin \
  -e AUTH_PASS="SecurePass123!" \
  YOUR_DOCKERHUB_USERNAME/openbooks-fork \
  --random-name \
  --server irc.irchighway.net:6667 \
  --tls=false \
  server --persist --auto-extract
```

### Custom Username

```bash
docker run -d \
  --name openbooks \
  -p 8080:80 \
  -v $(pwd)/books:/books \
  YOUR_DOCKERHUB_USERNAME/openbooks-fork \
  --name MyBookReader \
  --server irc.irchighway.net:6667 \
  --tls=false \
  server --persist
```

### Localhost Only (More Secure)

```bash
docker run -d \
  --name openbooks \
  -p 127.0.0.1:8383:80 \
  -v $(pwd)/books:/books \
  -e AUTH_USER=admin \
  -e AUTH_PASS="SecurePass123!" \
  YOUR_DOCKERHUB_USERNAME/openbooks-fork \
  --random-name \
  --server irc.irchighway.net:6667 \
  --tls=false \
  server --persist
```

---

## Building from Source

### Build Docker Image

```bash
# Clone repository
git clone https://github.com/YOUR_GITHUB_USERNAME/openbooks-fork.git
cd openbooks

# Build image
docker build -t openbooks:local .

# Run your build
docker run -d \
  --name openbooks \
  -p 8383:80 \
  -v $(pwd)/books:/books \
  openbooks:local
```

### Build with Docker Compose

If `docker-compose.yml` has `build: .`:

```bash
docker-compose build
docker-compose up -d
```

---

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTH_USER` | No | - | Username for HTTP Basic Auth |
| `AUTH_PASS` | No | - | Password for HTTP Basic Auth |
| `BASE_PATH` | No | `/` | Base URL path for reverse proxy |

**Notes:**
- Both `AUTH_USER` and `AUTH_PASS` must be set together for authentication to work
- Use strong passwords (12+ characters, mixed case, symbols)
- Special characters in passwords? Wrap in quotes: `-e AUTH_PASS="P@ssw0rd!"`

### Volume Mounts

| Container Path | Purpose | Recommended Host Path |
|----------------|---------|----------------------|
| `/books` | Downloaded books storage | `./books` or `~/Downloads/openbooks` |

### Port Mapping

The container exposes port `80`. Map to your preferred host port:

```bash
# Standard ports
-p 8080:80   # Common alternative
-p 8383:80   # Recommended in docs
-p 3000:80   # Custom

# Localhost only
-p 127.0.0.1:8383:80
```

---

## Management Commands

### Docker Compose

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Restart
docker-compose restart

# View logs
docker-compose logs -f

# Update to latest
docker-compose pull
docker-compose up -d

# Rebuild after code changes
docker-compose build
docker-compose up -d
```

### Docker Run

```bash
# Stop
docker stop openbooks

# Start
docker start openbooks

# Restart
docker restart openbooks

# View logs
docker logs -f openbooks

# View last 100 lines
docker logs --tail 100 openbooks

# Remove container
docker rm -f openbooks

# Remove image
docker rmi YOUR_DOCKERHUB_USERNAME/openbooks-fork:latest
```

### Update to Latest Version

**Docker Compose:**
```bash
docker-compose pull
docker-compose up -d
```

**Docker Run:**
```bash
# Stop and remove old container
docker stop openbooks
docker rm openbooks

# Pull latest image
docker pull YOUR_DOCKERHUB_USERNAME/openbooks-fork:latest

# Run new container
docker run -d \
  --name openbooks \
  -p 8383:80 \
  -v $(pwd)/books:/books \
  -e AUTH_USER=admin \
  -e AUTH_PASS="your-password" \
  YOUR_DOCKERHUB_USERNAME/openbooks-fork \
  --random-name \
  --server irc.irchighway.net:6667 \
  --tls=false \
  server --persist --auto-extract
```

---

## Docker Image Tags

| Tag | Description | Recommended For |
|-----|-------------|-----------------|
| `latest` | Latest stable release | Most users |
| `X.X.X` | Specific version (e.g., `4.3.0`) | Version pinning |
| `edge` | Development build (unstable) | Testing new features |

**Pull specific version:**
```bash
docker pull YOUR_DOCKERHUB_USERNAME/openbooks-fork:4.3.0
```

## Supported Platforms

- `linux/amd64` - Intel/AMD 64-bit
- `linux/arm64` - ARM 64-bit (Raspberry Pi 4+, Apple Silicon)
- `linux/arm/v7` - ARM 32-bit (Raspberry Pi 3)

---

## Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker logs openbooks
```

**Common issues:**
- Port already in use: `bind: address already in use`
  - Solution: Use different port `-p 8080:80` or stop conflicting service
- Volume mount permission denied
  - Solution: `chmod 777 books/` or run with `--user $(id -u):$(id -g)`

### Can't Access Web Interface

1. **Verify container is running:**
   ```bash
   docker ps | grep openbooks
   ```

2. **Check port binding:**
   ```bash
   docker port openbooks
   ```

3. **Test connection:**
   ```bash
   # Without auth
   curl http://localhost:8383

   # With auth
   curl -u admin:password http://localhost:8383
   ```

4. **Check firewall:**
   ```bash
   # Linux
   sudo ufw allow 8383

   # Docker network
   docker network inspect bridge
   ```

### Authentication Not Working

1. **Verify environment variables:**
   ```bash
   docker exec openbooks env | grep AUTH
   ```

2. **Check both are set:**
   - Both `AUTH_USER` and `AUTH_PASS` must be set together
   - If only one is set, authentication is disabled

3. **Password with special characters:**
   ```bash
   # Wrap in quotes
   -e AUTH_PASS="P@ssw0rd!"
   ```

### IRC Connection Issues

**Symptoms:**
- "Unable to connect to IRC server"
- EOF errors in logs

**Solution:**
Ensure you're using the correct configuration:
```bash
--server irc.irchighway.net:6667 --tls=false
```

**Not:**
- ❌ `--server irc.irchighway.net:6697` (TLS doesn't work)
- ❌ `--tls=true` (Go TLS incompatible with IRC Highway)

### Books Not Persisting

**Check volume mount:**
```bash
docker inspect openbooks | grep -A 5 Mounts
```

**Verify with `--persist` flag:**
```bash
# Must include in command
server --persist
```

**Test write permissions:**
```bash
docker exec openbooks touch /books/test.txt
docker exec openbooks ls -la /books/
```

### High Memory Usage

**Limit container resources:**
```bash
docker run -d \
  --name openbooks \
  --memory="512m" \
  --cpus="1.0" \
  -p 8383:80 \
  -v $(pwd)/books:/books \
  YOUR_DOCKERHUB_USERNAME/openbooks-fork \
  --random-name \
  server --persist
```

**Monitor usage:**
```bash
docker stats openbooks
```

---

## Security Best Practices

### 1. Always Use Authentication

```bash
-e AUTH_USER=admin \
-e AUTH_PASS="StrongPassword123!"
```

### 2. Use Strong Passwords

- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- Don't use common words or patterns

### 3. Run Behind HTTPS Reverse Proxy

```bash
# Use Caddy for automatic HTTPS
docker run -d \
  -p 80:80 \
  -p 443:443 \
  -v caddy_data:/data \
  -v $(pwd)/Caddyfile:/etc/caddy/Caddyfile \
  caddy:latest
```

### 4. Restrict Network Access

```bash
# Localhost only
-p 127.0.0.1:8383:80

# Specific IP
-p 192.168.1.100:8383:80
```

### 5. Don't Commit Credentials

```bash
# Use .env file
echo "AUTH_USER=admin" > .env
echo "AUTH_PASS=SecurePass123" >> .env
echo ".env" >> .gitignore

# Reference in docker-compose.yml
environment:
  - AUTH_USER=${AUTH_USER}
  - AUTH_PASS=${AUTH_PASS}
```

### 6. Keep Container Updated

```bash
# Auto-update with Watchtower
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --interval 86400  # Check daily
```

### 7. Review Logs Regularly

```bash
docker logs --since 24h openbooks | grep -i error
```

---

## Performance Tips

### 1. Use Volumes for Better I/O

```yaml
volumes:
  books_data:

services:
  openbooks:
    volumes:
      - books_data:/books  # Named volume (faster)
```

### 2. Clean Up Old Books

```bash
# Delete books older than 30 days
docker exec openbooks find /books -name "*.epub" -mtime +30 -delete

# Or from host
find books/ -name "*.epub" -mtime +30 -delete
```

### 3. Resource Limits

```yaml
services:
  openbooks:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
```

---

## Additional Resources

- **Main Documentation:** [README.md](README.md)
- **Configuration Guide:** See README.md Configuration section
- **Troubleshooting:** See README.md Troubleshooting section
- **Docker Hub:** https://hub.docker.com/r/YOUR_DOCKERHUB_USERNAME/openbooks-fork
- **GitHub:** https://github.com/YOUR_GITHUB_USERNAME/openbooks-fork

---

## Example Setups

### Home Media Server

```yaml
version: '3.8'
services:
  openbooks:
    image: YOUR_DOCKERHUB_USERNAME/openbooks-fork:latest
    container_name: openbooks
    ports:
      - "127.0.0.1:8383:80"  # Localhost only
    volumes:
      - /mnt/media/books:/books
    environment:
      - AUTH_USER=admin
      - AUTH_PASS=${OPENBOOKS_PASSWORD}
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

### Public Instance with Caddy

```yaml
version: '3.8'
services:
  openbooks:
    image: YOUR_DOCKERHUB_USERNAME/openbooks-fork:latest
    container_name: openbooks
    volumes:
      - books_data:/books
    environment:
      - AUTH_USER=admin
      - AUTH_PASS=${OPENBOOKS_PASSWORD}
      - BASE_PATH=/books/
    command: [
      "--random-name",
      "--server", "irc.irchighway.net:6667",
      "--tls=false",
      "server",
      "--dir", "/books",
      "--port", "80",
      "--persist"
    ]
    restart: unless-stopped
    networks:
      - web

  caddy:
    image: caddy:latest
    container_name: caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    restart: unless-stopped
    networks:
      - web

networks:
  web:
    driver: bridge

volumes:
  books_data:
  caddy_data:
  caddy_config:
```

**Caddyfile:**
```
books.example.com {
    reverse_proxy /books/* openbooks:80
}
```

---

## FAQ

**Q: Do I need to specify `--name` or `--random-name`?**
A: Use `--random-name` in Docker deployments. It's easier and generates unique usernames automatically.

**Q: Why use port 6667 instead of 6697?**
A: IRC Highway's TLS ports (6697, 9999) don't work with Go's TLS implementation. Port 6667 (no TLS) is the working solution.

**Q: Can I run multiple OpenBooks containers?**
A: Yes, but use different IRC usernames and ports:
```bash
# Container 1
docker run -d --name openbooks1 -p 8383:80 YOUR_DOCKERHUB_USERNAME/openbooks-fork --name user1 ...

# Container 2
docker run -d --name openbooks2 -p 8384:80 YOUR_DOCKERHUB_USERNAME/openbooks-fork --name user2 ...
```

**Q: How do I change the download directory?**
A: Mount a volume and use `--dir`:
```bash
-v /path/to/books:/books
command: ["--random-name", "server", "--dir", "/books", "--persist"]
```

**Q: Books download to browser instead of disk?**
A: Ensure `--persist` flag is included in the command.

**Q: How do I enable debug logging?**
A: Add `--log` flag:
```bash
command: ["--random-name", "--log", "server", "--persist"]
```

Then check logs in `/books/logs/` directory.

---

**Last Updated:** 2024-12
