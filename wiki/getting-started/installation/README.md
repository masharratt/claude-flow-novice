# Complete Installation Guide

Comprehensive installation instructions for Claude Flow Novice across all platforms and access methods.

## 🎯 Installation Overview

Claude Flow Novice supports multiple installation methods:
- **NPM Package** (recommended)
- **Global Installation**
- **Docker Container**
- **Source Installation**

## 📋 Prerequisites

### System Requirements
- **Node.js 18+** (18.12.0 or higher)
- **npm 8+** or **yarn 1.22+**
- **Git** (for source installation)
- **Docker** (optional, for containerized setup)

### Platform Support
- ✅ **Linux** (Ubuntu 20.04+, CentOS 8+)
- ✅ **macOS** (10.15+)
- ✅ **Windows** (10/11, WSL2 recommended)
- ✅ **Docker** (any platform)

### Claude Code Integration
- **Claude Code** application
- **MCP support** enabled

---

## 🚀 Method 1: NPM Package (Recommended)

### Quick Install
```bash
# Using npx (no installation required)
npx claude-flow@alpha --version

# Verify installation
npx claude-flow@alpha doctor
```

### Global Installation
```bash
# Install globally
npm install -g claude-flow-novice

# Verify installation
claude-flow-novice --version
```

### Project-Specific Installation
```bash
# Add to existing project
npm install claude-flow-novice
# or
yarn add claude-flow-novice

# Add to package.json scripts
{
  "scripts": {
    "ai": "claude-flow",
    "sparc": "claude-flow-novice sparc",
    "agents": "claude-flow-novice agents"
  }
}
```

---

## 🐳 Method 2: Docker Installation

### Using Pre-built Image
```bash
# Pull official image
docker pull ruvnet/claude-flow-novice:latest

# Run container
docker run -it --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  ruvnet/claude-flow-novice:latest
```

### Docker Compose Setup
```yaml
# docker-compose.yml
version: '3.8'
services:
  claude-flow:
    image: ruvnet/claude-flow-novice:latest
    volumes:
      - .:/workspace
      - ~/.claude-flow:/root/.claude-flow
    working_dir: /workspace
    environment:
      - CLAUDE_FLOW_API_KEY=${CLAUDE_FLOW_API_KEY}
    stdin_open: true
    tty: true
```

```bash
# Start with docker-compose
docker-compose run claude-flow
```

---

## 📦 Method 3: Source Installation

### Clone and Build
```bash
# Clone repository
git clone https://github.com/ruvnet/claude-flow-novice.git
cd claude-flow-novice

# Install dependencies
npm install

# Build project
npm run build

# Link globally (optional)
npm link
```

### Development Setup
```bash
# Clone with submodules
git clone --recursive https://github.com/ruvnet/claude-flow-novice.git

# Install dev dependencies
npm install --include=dev

# Run in development mode
npm run dev

# Run tests
npm test
```

---

## 🔧 Claude Code MCP Setup

### Step 1: Add MCP Server
```bash
# Add claude-flow-novice MCP server
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start

# Optional: Enhanced coordination
claude mcp add ruv-swarm npx ruv-swarm mcp start

# Flow-nexus integration removed
```

### Step 2: Verify MCP Installation
```bash
# Check MCP status
claude mcp status

# List available tools
claude mcp tools claude-flow

# Test MCP connection
claude mcp test claude-flow
```

### Step 3: Configure MCP Settings
```json
// ~/.claude/mcp-config.json
{
  "claude-flow": {
    "command": "npx",
    "args": ["claude-flow@alpha", "mcp", "start"],
    "timeout": 30000,
    "retries": 3
  }
}
```

---

## ⚙️ Configuration

### Environment Variables
```bash
# Core configuration
export CLAUDE_FLOW_API_KEY="your-api-key"
export CLAUDE_FLOW_MODEL="claude-3.5-sonnet"
export CLAUDE_FLOW_MAX_AGENTS=10

# Advanced configuration
export CLAUDE_FLOW_LOG_LEVEL="info"
export CLAUDE_FLOW_CACHE_DIR="~/.claude-flow/cache"
export CLAUDE_FLOW_CONFIG_DIR="~/.claude-flow"
```

### Configuration File
```bash
# Initialize configuration
npx claude-flow@alpha config init

# Generated config at ~/.claude-flow/config.json
{
  "model": "claude-3.5-sonnet",
  "maxAgents": 10,
  "defaultTopology": "mesh",
  "sparc": {
    "mode": "tdd",
    "coverage": 90
  },
  "agents": {
    "default": "coder",
    "timeout": 300
  }
}
```

### Project Configuration
```bash
# Initialize project
npx claude-flow@alpha init

# Creates .claude-flow/config.json in project root
{
  "project": {
    "name": "my-project",
    "type": "javascript",
    "framework": "express"
  },
  "agents": {
    "preferred": ["coder", "tester", "reviewer"]
  },
  "workflows": {
    "default": "sparc-tdd"
  }
}
```

---

## 🔐 Authentication Setup

### API Key Configuration
```bash
# Set API key interactively
npx claude-flow@alpha auth login

# Set via environment variable
export CLAUDE_FLOW_API_KEY="your-key-here"

# Set via config file
npx claude-flow@alpha config set auth.apiKey "your-key-here"
```

### Cloud Features (Optional)
```bash
# Flow-nexus registration removed
```

---

## 🛠️ Platform-Specific Instructions

### Linux (Ubuntu/Debian)
```bash
# Update package manager
sudo apt update

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install claude-flow
npm install -g claude-flow-novice
```

### macOS
```bash
# Install Node.js via Homebrew
brew install node@18

# Install claude-flow
npm install -g claude-flow-novice

# Or use MacPorts
sudo port install nodejs18
```

### Windows
```powershell
# Install Node.js via Chocolatey
choco install nodejs

# Or download from nodejs.org

# Install claude-flow
npm install -g claude-flow-novice

# WSL2 (recommended)
wsl --install Ubuntu-22.04
# Then follow Linux instructions
```

---

## 🧪 Verification and Testing

### Health Check
```bash
# Run diagnostic
npx claude-flow@alpha doctor

# Expected output:
# ✅ Node.js version: 18.12.0
# ✅ npm version: 8.19.2
# ✅ claude-flow-novice version: 2.0.0
# ✅ Configuration: valid
# ✅ API access: connected
# ✅ MCP integration: available
```

### Test Installation
```bash
# Test basic functionality
npx claude-flow@alpha agents list

# Test SPARC workflow
npx claude-flow@alpha sparc run spec "test project"

# Test MCP integration (if using Claude Code)
npx claude-flow@alpha mcp test
```

### Performance Benchmark
```bash
# Run performance test
npx claude-flow@alpha benchmark

# Expected metrics:
# Agent spawn time: < 5s
# Command response: < 2s
# Memory usage: < 200MB
# CPU usage: < 50%
```

---

## 🚨 Troubleshooting Installation

### Common Issues

#### Node.js Version Error
```bash
# Check version
node --version

# If < 18.0.0, update Node.js
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

#### Permission Errors (macOS/Linux)
```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

#### Windows PATH Issues
```powershell
# Add to PATH manually or reinstall Node.js
# Ensure npm is in PATH: C:\Users\{user}\AppData\Roaming\npm
```

#### MCP Connection Issues
```bash
# Restart MCP server
claude mcp restart claude-flow

# Check MCP logs
claude mcp logs claude-flow

# Reinstall MCP server
claude mcp remove claude-flow
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start
```

### Getting Help
```bash
# Enable debug mode
DEBUG=claude-flow:* npx claude-flow@alpha agents list

# Export diagnostic information
npx claude-flow@alpha doctor --export diagnostic.json

# Contact support with diagnostic.json
```

---

## 🔄 Updates and Maintenance

### Updating claude-flow
```bash
# Update global installation
npm update -g claude-flow-novice

# Update project installation
npm update claude-flow-novice

# Update MCP servers
claude mcp update claude-flow
```

### Version Management
```bash
# Check current version
npx claude-flow@alpha --version

# List available versions
npm view claude-flow-novice versions --json

# Install specific version
npm install -g claude-flow-novice@2.0.0
```

### Cache Management
```bash
# Clear cache
npx claude-flow@alpha cache clear

# Reset configuration
npx claude-flow@alpha config reset

# Rebuild cache
npx claude-flow@alpha cache rebuild
```

---

## 📚 Next Steps

After successful installation:

1. **[Quick Start Guide](../quick-start/README.md)** - Get running in 5 minutes
2. **[Core Concepts](../../core-concepts/README.md)** - Understand the fundamentals
3. **[CLI Access Guide](../cli-access/README.md)** - Master terminal usage
4. **[MCP Integration Guide](../claude-code-mcp/README.md)** - Claude Code setup

---

**Installation complete!** 🎉

Run `npx claude-flow@alpha --help` to see available commands or jump to the [Quick Start Guide](../quick-start/README.md) to begin your AI-assisted development journey.