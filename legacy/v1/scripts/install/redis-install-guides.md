# Redis Installation Guides

Comprehensive installation instructions for Redis across different platforms.

## Table of Contents

- [Windows](#windows)
- [macOS](#macos)
- [Linux](#linux)
  - [Ubuntu/Debian](#ubuntudebian)
  - [CentOS/RHEL/Fedora](#centosrhelfedora)
  - [Arch Linux](#arch-linux)
- [Docker](#docker)
- [Verification](#verification)

---

## Windows

### Option 1: Chocolatey (Recommended)

1. **Install Chocolatey** (if not already installed):
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```

2. **Install Redis**:
   ```powershell
   choco install redis-64 -y
   ```

3. **Start Redis**:
   ```powershell
   redis-server
   # Or as a service
   net start redis
   ```

### Option 2: Scoop

1. **Install Scoop** (if not already installed):
   ```powershell
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   irm get.scoop.sh | iex
   ```

2. **Install Redis**:
   ```powershell
   scoop install redis
   ```

3. **Start Redis**:
   ```powershell
   redis-server
   ```

### Option 3: WSL2 (Windows Subsystem for Linux)

If you're using WSL2, follow the Linux installation instructions below.

### Option 4: Direct Download

1. Download from: https://github.com/microsoftarchive/redis/releases
2. Extract to `C:\Redis` or desired location
3. Add to system PATH
4. Run `redis-server.exe`

---

## macOS

### Option 1: Homebrew (Recommended)

1. **Install Homebrew** (if not already installed):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. **Install Redis**:
   ```bash
   brew install redis
   ```

3. **Start Redis**:
   ```bash
   # Start Redis as a service (auto-start on login)
   brew services start redis

   # Or run Redis in foreground
   redis-server /usr/local/etc/redis.conf
   ```

4. **Stop Redis**:
   ```bash
   brew services stop redis
   ```

### Option 2: MacPorts

1. **Install MacPorts** (if not already installed)
2. **Install Redis**:
   ```bash
   sudo port install redis
   ```

3. **Start Redis**:
   ```bash
   sudo port load redis
   ```

---

## Linux

### Ubuntu/Debian

1. **Update package index**:
   ```bash
   sudo apt-get update
   ```

2. **Install Redis**:
   ```bash
   sudo apt-get install redis-server -y
   ```

3. **Start Redis**:
   ```bash
   sudo systemctl start redis-server
   sudo systemctl enable redis-server  # Auto-start on boot
   ```

4. **Check status**:
   ```bash
   sudo systemctl status redis-server
   ```

### CentOS/RHEL/Fedora

1. **Install Redis**:
   ```bash
   # CentOS/RHEL
   sudo yum install redis -y

   # Fedora
   sudo dnf install redis -y
   ```

2. **Start Redis**:
   ```bash
   sudo systemctl start redis
   sudo systemctl enable redis
   ```

3. **Check status**:
   ```bash
   sudo systemctl status redis
   ```

### Arch Linux

1. **Install Redis**:
   ```bash
   sudo pacman -S redis --noconfirm
   ```

2. **Start Redis**:
   ```bash
   sudo systemctl start redis
   sudo systemctl enable redis
   ```

---

## Docker

### Quick Start

```bash
# Pull Redis image
docker pull redis:latest

# Run Redis container
docker run -d \
  --name redis-claude-flow \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:latest redis-server --appendonly yes

# Connect to Redis
docker exec -it redis-claude-flow redis-cli
```

### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: redis-claude-flow
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
      - ./redis.conf:/usr/local/etc/redis/redis.conf
    command: redis-server /usr/local/etc/redis/redis.conf
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  redis-data:
    driver: local
```

Run with:
```bash
docker-compose up -d
```

---

## Verification

After installation, verify Redis is working:

### 1. Check Redis is running

```bash
redis-cli ping
# Expected output: PONG
```

### 2. Test basic operations

```bash
# Set a value
redis-cli set test "Hello Redis"

# Get the value
redis-cli get test
# Expected output: "Hello Redis"

# Delete the value
redis-cli del test
```

### 3. Check Redis version

```bash
redis-cli --version
redis-server --version
```

### 4. Use automated test script

```bash
node scripts/install/redis-test.js
```

---

## Configuration

### Default Configuration Locations

- **Windows (Chocolatey)**: `C:\ProgramData\Redis\redis.conf`
- **macOS (Homebrew)**: `/usr/local/etc/redis.conf`
- **Linux**: `/etc/redis/redis.conf` or `/etc/redis/redis/redis.conf`

### Recommended Settings for Claude Flow Novice

```conf
# Network
bind 127.0.0.1
port 6379
protected-mode yes

# Memory
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Performance
tcp-keepalive 300
timeout 0
databases 16

# Event notification (for swarm coordination)
notify-keyspace-events "Ex"
```

---

## Troubleshooting

### Redis won't start

1. **Check if Redis is already running**:
   ```bash
   ps aux | grep redis
   # Or on Windows
   tasklist | findstr redis
   ```

2. **Check port 6379 is not in use**:
   ```bash
   # Linux/macOS
   lsof -i :6379

   # Windows
   netstat -ano | findstr :6379
   ```

3. **Check Redis logs**:
   ```bash
   # Linux
   sudo tail -f /var/log/redis/redis-server.log

   # macOS
   tail -f /usr/local/var/log/redis.log
   ```

### Connection refused

1. Ensure Redis is running
2. Check firewall settings
3. Verify bind address in redis.conf
4. Check Redis is listening on the correct port

### Permission denied

```bash
# Linux - ensure proper permissions
sudo chown -R redis:redis /var/lib/redis
sudo chmod 755 /var/lib/redis
```

---

## Security Considerations

1. **Set a password** (if needed):
   ```conf
   # In redis.conf
   requirepass your-strong-password
   ```

2. **Bind to localhost only** (for development):
   ```conf
   bind 127.0.0.1
   ```

3. **Disable dangerous commands** (for production):
   ```conf
   rename-command CONFIG ""
   rename-command FLUSHDB ""
   rename-command FLUSHALL ""
   ```

4. **Enable protected mode**:
   ```conf
   protected-mode yes
   ```

---

## Next Steps

After successful installation:

1. Run the automated setup:
   ```bash
   node scripts/install/redis-setup.js
   ```

2. Run the connection test:
   ```bash
   node scripts/install/redis-test.js
   ```

3. Initialize Claude Flow Novice:
   ```bash
   npx claude-flow-novice init
   ```

---

## Additional Resources

- **Official Redis Documentation**: https://redis.io/docs/
- **Redis Configuration Reference**: https://redis.io/docs/manual/config/
- **Redis Security**: https://redis.io/docs/manual/security/
- **Redis Best Practices**: https://redis.io/docs/manual/patterns/
