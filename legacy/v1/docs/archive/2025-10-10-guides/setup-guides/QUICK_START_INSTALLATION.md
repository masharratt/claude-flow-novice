# Claude Flow Novice - Quick Start Installation Guide

## Overview

Complete installation in **under 5 minutes** with our automated quick-start wizard.

## Installation Methods

### Method 1: Quick Start Wizard (Recommended)

The fastest way to get started with intelligent defaults and automated setup.

```bash
# Interactive wizard with automated Redis installation
npx claude-flow-novice init --quick-start

# Non-interactive mode (accepts all defaults)
npx claude-flow-novice init --quick-start --auto-accept

# Skip intro animation
npx claude-flow-novice init --quick-start --skip-intro
```

**Time:** 2-5 minutes (depends on Redis installation method)

### Method 2: Quick Install Script

Direct installation script with minimal prompts.

```bash
# Run quick installation
npm run quick-install

# Skip Redis installation (if already installed)
node scripts/install/quick-install.js --skip-redis

# Verbose mode for debugging
node scripts/install/quick-install.js --verbose
```

**Time:** 3-5 minutes

### Method 3: Standard Installation

Traditional installation with full control.

```bash
# Standard init
npx claude-flow-novice init

# With specific options
npx claude-flow-novice init --force --minimal
```

**Time:** 10-15 minutes (includes manual configuration)

## What Gets Installed

### Phase 1: Dependency Checks (5-10 seconds)

Parallel checks for:
- Node.js v20+ (required)
- npm v9+ (required)
- Redis (auto-installed if missing)
- Docker (optional, for Redis)
- Git (optional)

### Phase 2: Redis Installation (30-90 seconds)

Three installation methods (automatic selection):

1. **Docker** (fastest - 30 seconds)
   ```bash
   docker run -d --name claude-flow-redis -p 6379:6379 redis:alpine
   ```

2. **Native Package Manager** (60-90 seconds)
   - Windows: Chocolatey or Scoop
   - macOS: Homebrew
   - Linux: apt/yum/pacman

3. **Existing** (0 seconds)
   - Uses already running Redis instance

### Phase 3: Configuration (5 seconds)

Creates minimal configuration with smart defaults:
- `.claude/settings.json` - System settings
- `.claude/quick-start.json` - Installation metadata
- `CLAUDE.md` - Main configuration
- Directory structure (memory/, coordination/)

### Phase 4: Template Deployment (5-10 seconds)

Deploys pre-bundled templates:
- `CLAUDE.md` - Quick-start configuration
- `.claude/settings.json` - Hooks and Redis config
- `memory/README.md` - Memory system docs
- `coordination/README.md` - Coordination docs

### Phase 5: Validation (5 seconds)

Validates:
- Redis connectivity
- File structure
- Configuration integrity

## Performance Benchmarks

Target installation time: **< 5 minutes**

### Typical Performance

| Scenario | Time | Method |
|----------|------|--------|
| Docker + Quick Start | 2-3 min | Fastest |
| Native + Quick Start | 3-5 min | Typical |
| No Redis + Quick Start | 1-2 min | Existing Redis |
| Standard Installation | 10-15 min | Full control |

### Run Your Own Benchmark

```bash
# Run 3 installation benchmarks
npm run install:benchmark

# Custom iterations and settings
node scripts/install/installation-benchmark.js --iterations=5 --verbose
```

## Quick Start Commands

After installation:

### Check System Status
```bash
npx claude-flow-novice status
```

### Start Your First Swarm
```bash
npx claude-flow-novice swarm "Create a REST API with authentication"
```

### List Available Agents
```bash
npx claude-flow-novice agents list
```

### Test Redis Connection
```bash
redis-cli ping
# Expected: PONG
```

## Configuration

### Minimal Configuration (Quick Start)

```json
{
  "version": "1.6.6",
  "quickStart": true,
  "features": {
    "swarmOrchestration": true,
    "memoryPersistence": true,
    "autoSpawn": true
  },
  "redis": {
    "host": "localhost",
    "port": 6379
  }
}
```

### Advanced Configuration

For custom settings, decline defaults during wizard:
- Max agents per swarm
- Redis port
- Optional features (monitoring, neural learning)

## Redis Management

### Docker Redis

```bash
# Check status
docker ps | grep claude-flow-redis

# Stop Redis
docker stop claude-flow-redis

# Start Redis
docker start claude-flow-redis

# Remove container
docker rm claude-flow-redis
```

### Native Redis

```bash
# Check status
redis-cli ping

# Start Redis (Linux/macOS)
redis-server

# Start Redis (Windows)
redis-server.exe

# Check Redis info
redis-cli INFO server
```

## Troubleshooting

### Redis Connection Issues

**Problem:** Redis not responding

**Solutions:**

1. **Check if Redis is running:**
   ```bash
   redis-cli ping
   ```

2. **Try Docker method:**
   ```bash
   docker run -d -p 6379:6379 --name claude-flow-redis redis:alpine
   ```

3. **Check firewall/port:**
   ```bash
   netstat -an | grep 6379
   ```

### Node.js Version Issues

**Problem:** Node.js version too old

**Solution:**
```bash
# Check version
node --version

# Install Node.js v20+
# Visit: https://nodejs.org/
```

### Permission Issues

**Problem:** Write permission denied

**Solutions:**

1. **Check directory permissions:**
   ```bash
   ls -la
   ```

2. **Fix ownership (Linux/macOS):**
   ```bash
   sudo chown -R $USER:$USER .
   ```

3. **Run without sudo:**
   ```bash
   # DO NOT run with sudo
   npx claude-flow-novice init --quick-start
   ```

### Installation Timeout

**Problem:** Installation exceeds 5 minutes

**Possible Causes:**
- Slow internet connection (Docker image pull)
- System resource constraints
- Package manager cache issues

**Solutions:**

1. **Use existing Redis:**
   ```bash
   node scripts/install/quick-install.js --skip-redis
   ```

2. **Pre-install Redis:**
   ```bash
   # Docker
   docker pull redis:alpine

   # Or native
   # See platform-specific instructions below
   ```

3. **Verbose mode for debugging:**
   ```bash
   node scripts/install/quick-install.js --verbose
   ```

## Platform-Specific Instructions

### Windows

**Prerequisites:**
- Node.js v20+
- Chocolatey or Scoop (for Redis)

**Quick Start:**
```powershell
# Install Chocolatey (if not installed)
# See: https://chocolatey.org/install

# Run wizard
npx claude-flow-novice init --quick-start
```

**Manual Redis (if needed):**
```powershell
# Via Chocolatey
choco install redis-64 -y

# Via Scoop
scoop install redis
```

### macOS

**Prerequisites:**
- Node.js v20+
- Homebrew (for Redis)

**Quick Start:**
```bash
# Install Homebrew (if not installed)
# See: https://brew.sh/

# Run wizard
npx claude-flow-novice init --quick-start
```

**Manual Redis (if needed):**
```bash
# Via Homebrew
brew install redis
brew services start redis
```

### Linux (Ubuntu/Debian)

**Prerequisites:**
- Node.js v20+
- sudo access (for Redis)

**Quick Start:**
```bash
npx claude-flow-novice init --quick-start
```

**Manual Redis (if needed):**
```bash
sudo apt-get update
sudo apt-get install redis-server -y
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### Linux (CentOS/RHEL/Fedora)

**Manual Redis:**
```bash
sudo yum install redis -y
sudo systemctl start redis
sudo systemctl enable redis
```

### Linux (Arch)

**Manual Redis:**
```bash
sudo pacman -S redis --noconfirm
sudo systemctl start redis
sudo systemctl enable redis
```

## Next Steps

After successful installation:

1. **Review Configuration**
   ```bash
   cat CLAUDE.md
   cat .claude/settings.json
   ```

2. **Test Redis Connection**
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

3. **Start First Swarm**
   ```bash
   npx claude-flow-novice swarm "Build a todo list API"
   ```

4. **Explore Commands**
   ```bash
   npx claude-flow-novice --help
   ```

5. **Check System Health**
   ```bash
   npx claude-flow-novice status
   ```

## Advanced Topics

### Customizing Installation

Create custom configuration file:

```json
{
  "redis": {
    "host": "localhost",
    "port": 6379,
    "password": "optional-password"
  },
  "maxAgents": 20,
  "features": {
    "monitoring": true,
    "neural": true,
    "git": true
  }
}
```

Use with:
```bash
npx claude-flow-novice init --config=custom-config.json
```

### Performance Tuning

```bash
# Increase Redis memory
docker run -d -p 6379:6379 \
  --name claude-flow-redis \
  redis:alpine redis-server \
  --maxmemory 512mb \
  --maxmemory-policy allkeys-lru
```

### Multi-Instance Setup

Run multiple Claude Flow instances:

```bash
# Instance 1 (default port)
docker run -d -p 6379:6379 --name redis-instance-1 redis:alpine

# Instance 2 (custom port)
docker run -d -p 6380:6379 --name redis-instance-2 redis:alpine

# Configure instance 2
REDIS_PORT=6380 npx claude-flow-novice init --quick-start
```

## Support

### Get Help

- **GitHub Issues:** https://github.com/masharratt/claude-flow-novice/issues
- **Documentation:** https://github.com/masharratt/claude-flow-novice#readme
- **Community:** [Join discussions](https://github.com/masharratt/claude-flow-novice/discussions)

### Report Installation Issues

When reporting issues, include:

1. **System Info:**
   ```bash
   node --version
   npm --version
   uname -a  # Linux/macOS
   systeminfo  # Windows
   ```

2. **Installation Log:**
   ```bash
   node scripts/install/quick-install.js --verbose 2>&1 | tee install.log
   ```

3. **Redis Status:**
   ```bash
   redis-cli INFO server
   ```

### Benchmark Results

Share your installation time:

```bash
npm run install:benchmark
# Share results in GitHub Discussions
```

## License

MIT License - See LICENSE file for details

---

**Quick Start Installation Guide v1.0**
*Target: <5 minute installation for novice users*
*Last Updated: 2025-10-09*
