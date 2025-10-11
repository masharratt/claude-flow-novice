# Installation Guide

**Complete setup instructions for Claude Flow Novice**

This guide will walk you through installing Claude Flow Novice on your system, from basic installation to advanced configuration.

---

## 📋 Table of Contents

- [System Requirements](#system-requirements)
- [Quick Installation](#quick-installation)
- [Detailed Installation](#detailed-installation)
- [Platform-Specific Setup](#platform-specific-setup)
- [Configuration](#configuration)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## 🔧 System Requirements

### Minimum Requirements
- **Node.js**: 20.0.0 or higher
- **npm**: 9.0.0 or higher
- **Memory**: 512MB RAM
- **Storage**: 100MB free disk space
- **Network**: Internet connection for package installation

### Recommended Requirements
- **Node.js**: 20.x LTS or latest
- **npm**: 9.x or latest
- **Memory**: 2GB RAM or more
- **Storage**: 500MB free disk space
- **Redis Server**: 6.0 or higher (for persistence)

### Optional Dependencies
- **Redis**: For data persistence and agent coordination
- **Docker**: For containerized deployments
- **Git**: For version control integration
- **Make**: For building from source (if needed)

---

## 🚀 Quick Installation

### Option 1: Global Installation (Recommended)
```bash
# Install globally
npm install -g claude-flow-novice

# Verify installation
claude-flow-novice --version
```

### Option 2: Project-Specific Installation
```bash
# Install in your project
npm install claude-flow-novice

# Add to package.json scripts
npm pkg set scripts.start="claude-flow-novice start"
npm pkg set scripts.swarm="claude-flow-novice swarm"
```

### Option 3: Using npx (No Installation)
```bash
# Run directly without installation
npx claude-flow-novice init my-project
npx claude-flow-novice swarm "Build a REST API"
```

---

## 📖 Detailed Installation

### Step 1: Check Prerequisites

#### Check Node.js Version
```bash
node --version
# Should output v20.0.0 or higher
```

#### Check npm Version
```bash
npm --version
# Should output 9.0.0 or higher
```

#### Update Node.js if Needed
```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Or download from nodejs.org
# https://nodejs.org/
```

### Step 2: Install Claude Flow Novice

#### Global Installation
```bash
# Install globally
npm install -g claude-flow-novice

# Add to PATH (if not automatically added)
echo 'export PATH="$PATH:/usr/local/bin"' >> ~/.bashrc
source ~/.bashrc
```

#### Local Installation
```bash
# Create new directory
mkdir my-ai-project
cd my-ai-project

# Initialize npm project
npm init -y

# Install locally
npm install claude-flow-novice

# Create CLI script
echo '#!/usr/bin/env node
require("claude-flow-novice/dist/src/cli/main.js");' > cli.js
chmod +x cli.js
```

### Step 3: Install Redis (Optional but Recommended)

#### macOS
```bash
# Using Homebrew
brew install redis
brew services start redis

# Or download directly
# https://redis.io/download
```

#### Ubuntu/Debian
```bash
# Update package list
sudo apt update

# Install Redis
sudo apt install redis-server

# Start Redis service
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Windows
```bash
# Using WSL2 (recommended)
wsl --install
# Then follow Linux instructions

# Or use Docker
docker run -d -p 6379:6379 redis:latest
```

#### Verify Redis Installation
```bash
redis-cli ping
# Should return: PONG
```

### Step 4: Configure Environment

#### Create Environment File
```bash
# Create .env file in project directory
touch .env
```

#### Basic Configuration
```bash
# Add to .env file
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
NODE_ENV=development
```

#### Advanced Configuration
```bash
# Production settings
NODE_ENV=production
LOG_LEVEL=warn
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password

# Optional API keys
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key

# Performance settings
NODE_OPTIONS="--max-old-space-size=4096"
UV_THREADPOOL_SIZE=16
```

---

## 🖥️ Platform-Specific Setup

### macOS

#### Install Homebrew (if not installed)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### Install Dependencies
```bash
# Install Node.js
brew install node

# Install Redis
brew install redis

# Start Redis
brew services start redis
```

#### Permissions Setup
```bash
# Fix npm global permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Install Claude Flow Novice
npm install -g claude-flow-novice
```

### Linux (Ubuntu/Debian)

#### Update System
```bash
sudo apt update && sudo apt upgrade -y
```

#### Install Node.js
```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Or using snap
sudo snap install node --classic
```

#### Install Redis
```bash
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Install Build Tools
```bash
sudo apt install build-essential
```

### Windows

#### Option 1: WSL2 (Recommended)
```bash
# Enable WSL
wsl --install

# Restart computer and complete setup

# Install Ubuntu from Microsoft Store
# Then follow Linux instructions
```

#### Option 2: Native Windows
```powershell
# Download and install Node.js from nodejs.org
# Download LTS version (20.x or higher)

# Verify installation
node --version
npm --version

# Install globally
npm install -g claude-flow-novice
```

#### Option 3: Docker
```bash
# Pull Docker image
docker pull claude-flow-novice:latest

# Run container
docker run -it -p 3000:3000 claude-flow-novice:latest
```

---

## ⚙️ Configuration

### Basic Configuration

#### Create Configuration File
```bash
# Create config directory
mkdir -p ~/.claude-flow-novice

# Create config file
touch ~/.claude-flow-novice/config.json
```

#### Configuration File Content
```json
{
  "version": "1.0.0",
  "settings": {
    "maxAgents": 10,
    "strategy": "development",
    "mode": "mesh",
    "persistence": true,
    "logging": {
      "level": "info",
      "format": "text",
      "destination": "console"
    },
    "redis": {
      "host": "localhost",
      "port": 6379,
      "db": 0,
      "password": null
    },
    "performance": {
      "timeout": 30000,
      "retries": 3,
      "concurrency": 5
    }
  },
  "agents": {
    "backend-dev": {
      "enabled": true,
      "maxInstances": 3,
      "capabilities": ["api", "database", "authentication"]
    },
    "frontend-dev": {
      "enabled": true,
      "maxInstances": 2,
      "capabilities": ["react", "vue", "styling"]
    },
    "tester": {
      "enabled": true,
      "maxInstances": 2,
      "capabilities": ["unit", "integration", "e2e"]
    }
  }
}
```

### Environment Variables

#### Required Variables
```bash
# Redis configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-password

# Environment
NODE_ENV=development
LOG_LEVEL=info
```

#### Optional Variables
```bash
# API Keys
ANTHROPIC_API_KEY=your-key
OPENAI_API_KEY=your-key

# Performance
NODE_OPTIONS="--max-old-space-size=4096"
UV_THREADPOOL_SIZE=16

# Features
ENABLE_DASHBOARD=true
ENABLE_METRICS=true
ENABLE_PERSISTENCE=true
```

---

## ✅ Verification

### Verify Installation
```bash
# Check version
claude-flow-novice --version

# Check help
claude-flow-novice --help

# Check system requirements
claude-flow-novice doctor
```

### Test Basic Functionality
```bash
# Create test project
mkdir test-project
cd test-project

# Initialize project
claude-flow-novice init test-project

# Start development server
claude-flow-novice start

# Test swarm (in another terminal)
claude-flow-novice swarm "Create a simple Hello World API"
```

### Check Dependencies
```bash
# Verify Redis connection
redis-cli ping

# Check network connectivity
curl -I https://registry.npmjs.org

# Verify Node.js modules
npm list claude-flow-novice
```

---

## 🆘 Troubleshooting

### Common Issues

#### Issue: "command not found: claude-flow-novice"
```bash
# Check installation
npm list -g claude-flow-novice

# Reinstall if needed
npm uninstall -g claude-flow-novice
npm install -g claude-flow-novice

# Check PATH
echo $PATH | grep -o "[^:]*npm[^:]*"
```

#### Issue: Node.js version too old
```bash
# Check current version
node --version

# Update using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Or download from nodejs.org
```

#### Issue: Redis connection failed
```bash
# Check Redis status
redis-cli ping

# Start Redis server
redis-server

# Or start as service
sudo systemctl start redis-server
brew services start redis
```

#### Issue: Permission denied
```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use nvm for permission-free installation
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
```

#### Issue: Memory errors
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Or add to shell profile
echo 'export NODE_OPTIONS="--max-old-space-size=4096"' >> ~/.bashrc
source ~/.bashrc
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=claude-flow-novice:* claude-flow-novice start

# Verbose output
claude-flow-novice --verbose start

# Check configuration
claude-flow-novice config show
```

### Clean Installation
```bash
# Remove existing installation
npm uninstall -g claude-flow-novice
rm -rf ~/.claude-flow-novice

# Clear npm cache
npm cache clean --force

# Reinstall
npm install -g claude-flow-novice
```

### Getting Help

#### Check Documentation
```bash
claude-flow-novice --help
claude-flow-novice doctor
```

#### Community Support
- **GitHub Issues**: [Report bugs](https://github.com/masharratt/claude-flow-novice/issues)
- **Discussions**: [Ask questions](https://github.com/masharratt/claude-flow-novice/discussions)
- **Documentation**: [Full docs](https://github.com/masharratt/claude-flow-novice/wiki)

#### System Information
```bash
# Generate system report
claude-flow-novice info

# Include this in bug reports
node --version
npm --version
uname -a
```

---

## 📦 Next Steps

After successful installation:

1. **[Quick Start Guide](./README.md#-quick-start)** - Run your first swarm
2. **[Configuration Guide](./CONFIGURATION.md)** - Customize your setup
3. **[Examples](./EXAMPLES.md)** - Explore use cases
4. **[API Documentation](./API.md)** - Build custom integrations

---

## 🎯 Pro Tips

### Performance Optimization
```bash
# Use LTS Node.js version
nvm install --lts
nvm use --lts

# Increase memory for large projects
export NODE_OPTIONS="--max-old-space-size=4096"

# Use SSD for better Redis performance
# Place Redis data on SSD if available
```

### Security Best Practices
```bash
# Set Redis password
redis-cli CONFIG SET requirepass your-strong-password

# Use environment variables for API keys
# Never commit API keys to version control

# Regular updates
npm update -g claude-flow-novice
```

### Development Workflow
```bash
# Create aliases for common commands
alias cfn="claude-flow-novice"
alias cfns="claude-flow-novice start"
alias cfnsw="claude-flow-novice swarm"

# Use project-specific configuration
echo "claude-flow-novice.config.json" >> .gitignore
```

---

**🎉 Installation Complete!**

You're now ready to start orchestrating AI agents with Claude Flow Novice. Check out the [Quick Start Guide](./README.md#-quick-start) to begin your journey.