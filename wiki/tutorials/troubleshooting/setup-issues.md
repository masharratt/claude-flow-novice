# Setup Issues - Installation and Configuration Troubleshooting

**Complete guide to resolving common setup and configuration problems**

## Pre-Installation Requirements

### System Requirements Check

```bash
# Check Node.js version (required: 18+)
node --version
# If < 18, update: https://nodejs.org/

# Check npm version
npm --version
# Update if needed: npm install -g npm@latest

# Check Git installation
git --version
# Install if missing: https://git-scm.com/

# Verify system architecture
node -p "process.arch"
# Supported: x64, arm64

# Check available disk space (minimum 2GB)
df -h .
```

**Expected Output:**
```
v18.17.0 or higher
9.6.7 or higher
git version 2.40.0 or higher
```

## Installation Issues

### Issue: "npx command not found"

**Symptoms:**
```bash
npx claude-flow@latest --version
# bash: npx: command not found
```

**Solutions:**

**Option 1: Install/Update npm**
```bash
# Check if npm is installed
npm --version

# If not installed, reinstall Node.js from nodejs.org
# If installed but old version:
npm install -g npm@latest

# Verify npx is available
npx --version
```

**Option 2: Direct Installation**
```bash
# Install Claude Flow globally
npm install -g claude-flow@latest

# Then use without npx
claude-flow-novice --version
```

**Option 3: Use Alternative Method**
```bash
# Use npm instead of npx
npm create claude-flow@latest my-project
cd my-project
npm install
```

### Issue: "Permission denied" on Installation

**Symptoms:**
```bash
npm install -g claude-flow@latest
# EACCES: permission denied
```

**Solutions:**

**Option 1: Use Node Version Manager (Recommended)**
```bash
# Install nvm (macOS/Linux)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Restart terminal or reload
source ~/.bashrc

# Install latest Node.js
nvm install node
nvm use node

# Now install Claude Flow
npm install -g claude-flow@latest
```

**Option 2: Fix npm Permissions**
```bash
# Create global directory
mkdir ~/.npm-global

# Configure npm
npm config set prefix '~/.npm-global'

# Add to PATH (add to ~/.bashrc or ~/.zshrc)
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Install Claude Flow
npm install -g claude-flow@latest
```

**Option 3: Use npx (No Installation)**
```bash
# Always use npx prefix
npx claude-flow@latest init my-project
npx claude-flow@latest build "create homepage"
```

### Issue: "Package not found" or Network Errors

**Symptoms:**
```bash
npx claude-flow@latest --version
# npm ERR! 404 Not Found
# npm ERR! network timeout
```

**Solutions:**

**Check Network Connection:**
```bash
# Test network connectivity
ping registry.npmjs.org

# Check npm registry configuration
npm config get registry
# Should be: https://registry.npmjs.org/

# Reset registry if needed
npm config set registry https://registry.npmjs.org/
```

**Clear npm Cache:**
```bash
# Clear npm cache
npm cache clean --force

# Verify cache is clear
npm cache verify

# Try installation again
npx claude-flow@latest --version
```

**Corporate Network Issues:**
```bash
# Set proxy (if behind corporate firewall)
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080

# Set strict SSL to false (temporary)
npm config set strict-ssl false

# Restore security (after installation)
npm config set strict-ssl true
```

### Issue: "Module version mismatch"

**Symptoms:**
```bash
npx claude-flow@latest init
# Error: The module was compiled against a different Node.js version
```

**Solutions:**

**Rebuild Native Modules:**
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules if exists
rm -rf node_modules package-lock.json

# Reinstall with rebuild
npm install --rebuild

# Or force a fresh installation
npx claude-flow@latest --version --force
```

**Check Node.js Version:**
```bash
# Check current version
node --version

# Switch to compatible version (if using nvm)
nvm install 18
nvm use 18

# Verify and retry
npx claude-flow@latest --version
```

## Configuration Issues

### Issue: "Configuration file not found"

**Symptoms:**
```bash
npx claude-flow@latest init
# Warning: No configuration file found
# Error: Cannot determine project type
```

**Solutions:**

**Create Configuration File:**
```bash
# Create .claude-flow.json
cat > .claude-flow.json << 'EOF'
{
  "project": {
    "name": "my-project",
    "type": "web-application",
    "version": "1.0.0"
  },
  "agents": {
    "max": 5,
    "topology": "mesh"
  },
  "quality": {
    "coverage": 80,
    "performance": {
      "budget": "3s"
    }
  },
  "hooks": {
    "enabled": true,
    "autoFormat": true,
    "autoTest": false
  }
}
EOF

# Verify configuration
npx claude-flow@latest config get
```

**Initialize with Template:**
```bash
# Use template for auto-configuration
npx claude-flow@latest init --template=web-app
npx claude-flow@latest init --template=api
npx claude-flow@latest init --template=fullstack
```

### Issue: "Invalid configuration format"

**Symptoms:**
```bash
npx claude-flow@latest status
# Error: Invalid configuration format
# SyntaxError: Unexpected token
```

**Solutions:**

**Validate JSON Format:**
```bash
# Check JSON syntax
cat .claude-flow.json | python -m json.tool

# Or use online validator: jsonlint.com
```

**Reset Configuration:**
```bash
# Backup current config
cp .claude-flow.json .claude-flow.json.backup

# Reset to defaults
npx claude-flow@latest config reset

# Verify configuration works
npx claude-flow@latest config get
```

**Fix Common JSON Errors:**
```json
{
  "project": {
    "name": "my-project",     // ❌ No comments in JSON
    "type": "web-application",
    "agents": {
      "max": 5,               // ❌ Trailing comma
    }
  }
}
```

**Correct Format:**
```json
{
  "project": {
    "name": "my-project",
    "type": "web-application",
    "agents": {
      "max": 5
    }
  }
}
```

### Issue: "Environment variables not loaded"

**Symptoms:**
```bash
npx claude-flow@latest build
# Error: API key not found
# Error: Environment variables missing
```

**Solutions:**

**Set Required Environment Variables:**
```bash
# Set Claude Flow API key (if required)
export CLAUDE_FLOW_API_KEY=your_api_key

# Set other environment variables
export NODE_ENV=development
export PORT=3000

# Make permanent (add to ~/.bashrc or ~/.zshrc)
echo 'export CLAUDE_FLOW_API_KEY=your_api_key' >> ~/.bashrc
source ~/.bashrc
```

**Create .env File:**
```bash
# Create .env file
cat > .env << 'EOF'
NODE_ENV=development
PORT=3000
CLAUDE_FLOW_LOG_LEVEL=info
CLAUDE_FLOW_CACHE_DIR=./.cache
EOF

# Verify environment loading
npx claude-flow@latest config get
```

**Load Environment in Scripts:**
```bash
# Install dotenv if needed
npm install dotenv

# Load in Node.js scripts
node -r dotenv/config your-script.js
```

## MCP Connection Issues

### Issue: "MCP server connection failed"

**Symptoms:**
```bash
npx claude-flow@latest mcp swarm_init
# Error: Connection timeout
# Error: MCP server not responding
```

**Solutions:**

**Check MCP Server Status:**
```bash
# Test basic MCP functionality
npx claude-flow@latest mcp features_detect

# Check server health
npx claude-flow@latest mcp health_check

# Restart MCP server if needed
npx claude-flow@latest mcp restart
```

**Configure MCP Settings:**
```bash
# Set MCP timeout
npx claude-flow@latest config set mcp.timeout 30000

# Set retry attempts
npx claude-flow@latest config set mcp.retries 3

# Enable debug logging
npx claude-flow@latest config set logging.level debug
```

**Alternative MCP Servers:**
```bash
# Try different MCP server
npx claude-flow@latest config set mcp.server "https://alternative-server.com"

# Or use local MCP mode
npx claude-flow@latest config set mcp.local true
```

### Issue: "MCP authentication failed"

**Symptoms:**
```bash
npx claude-flow@latest mcp agent_spawn
# Error: Authentication failed
# Error: Invalid credentials
```

**Solutions:**

**Check Authentication:**
```bash
# Verify API credentials
npx claude-flow@latest auth status

# Re-authenticate if needed
npx claude-flow@latest auth login

# Set authentication token
export CLAUDE_FLOW_TOKEN=your_token
```

**Reset Authentication:**
```bash
# Clear stored credentials
npx claude-flow@latest auth logout

# Re-authenticate
npx claude-flow@latest auth login --interactive
```

## Performance and Memory Issues

### Issue: "Out of memory during build"

**Symptoms:**
```bash
npx claude-flow@latest build
# JavaScript heap out of memory
# FATAL ERROR: Reached heap limit
```

**Solutions:**

**Increase Memory Limit:**
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Or use with specific command
NODE_OPTIONS="--max-old-space-size=4096" npx claude-flow@latest build
```

**Optimize Memory Usage:**
```bash
# Clear cache before build
npx claude-flow@latest cache clear

# Use memory-efficient build
npx claude-flow@latest build --memory-efficient

# Reduce concurrent agents
npx claude-flow@latest config set agents.max 3
```

### Issue: "Slow performance during development"

**Symptoms:**
- Commands take very long to execute
- High CPU usage
- Unresponsive system

**Solutions:**

**Performance Optimization:**
```bash
# Enable performance mode
npx claude-flow@latest config set performance.mode optimized

# Reduce logging
npx claude-flow@latest config set logging.level error

# Enable caching
npx claude-flow@latest config set cache.enabled true
```

**System Resource Management:**
```bash
# Limit concurrent processes
npx claude-flow@latest config set concurrency.max 2

# Set CPU limits
npx claude-flow@latest config set cpu.limit 80

# Monitor resource usage
npx claude-flow@latest performance monitor
```

## Platform-Specific Issues

### Windows Issues

**PowerShell Execution Policy:**
```powershell
# Check execution policy
Get-ExecutionPolicy

# Set policy for current user
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Verify change
Get-ExecutionPolicy -List
```

**Path Issues:**
```cmd
# Add npm global to PATH
setx PATH "%PATH%;%APPDATA%\npm"

# Verify PATH
echo %PATH%
```

**Long Path Names:**
```cmd
# Enable long paths (Windows 10+)
# Run as Administrator
reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1

# Or use shorter project names
npx claude-flow@latest init myapp
```

### macOS Issues

**Xcode Command Line Tools:**
```bash
# Install command line tools
xcode-select --install

# Verify installation
xcode-select -p
```

**Homebrew Conflicts:**
```bash
# Check for Homebrew Node conflicts
brew list | grep node

# Uninstall Homebrew Node if needed
brew uninstall node

# Use nvm instead
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
```

### Linux Issues

**Missing Build Dependencies:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install build-essential python3

# CentOS/RHEL
sudo yum groupinstall "Development Tools"
sudo yum install python3

# Arch Linux
sudo pacman -S base-devel python
```

**SELinux Issues:**
```bash
# Check SELinux status
sestatus

# Temporarily disable (if needed)
sudo setenforce 0

# Or create proper SELinux policies
# (consult your system administrator)
```

## Validation and Testing

### Verify Complete Setup

**Run Setup Validation:**
```bash
# Comprehensive system check
npx claude-flow@latest doctor

# Expected output:
# ✓ Node.js version: 18.17.0
# ✓ npm version: 9.6.7
# ✓ Git version: 2.40.0
# ✓ Claude Flow: latest
# ✓ MCP connection: active
# ✓ Configuration: valid
# ✓ Permissions: correct
```

**Test Basic Functionality:**
```bash
# Create test project
mkdir claude-flow-test && cd claude-flow-test

# Initialize project
npx claude-flow@latest init --template=simple

# Build simple feature
npx claude-flow@latest build "create hello world page"

# Check status
npx claude-flow@latest status

# Clean up
cd .. && rm -rf claude-flow-test
```

## Getting Additional Help

### Debug Information Collection

**Collect Debug Information:**
```bash
# Generate debug report
npx claude-flow@latest debug --report > debug-report.txt

# Include system information
npx claude-flow@latest debug --system >> debug-report.txt

# Check logs
npx claude-flow@latest logs --recent=1h >> debug-report.txt
```

### Community Support

**Where to Get Help:**
- [GitHub Issues](https://github.com/claude-flow/claude-flow/issues)
- [Community Forum](https://community.claude-flow.dev)
- [Discord Chat](https://discord.gg/claude-flow)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/claude-flow)

**When Reporting Issues:**
1. Include debug report output
2. Specify your operating system and version
3. Include Node.js and npm versions
4. Describe exact error messages
5. Include steps to reproduce
6. Mention what you've already tried

### Emergency Fallbacks

**If Nothing Else Works:**

**Complete Reinstall:**
```bash
# Remove all Claude Flow installations
npm uninstall -g claude-flow
rm -rf ~/.claude-flow
rm -rf ~/.npm/_npx/*/claude-flow

# Clear npm cache
npm cache clean --force

# Fresh installation
npm install -g claude-flow@latest

# Verify installation
claude-flow-novice --version
```

**Alternative Installation Methods:**
```bash
# Use yarn instead of npm
npm install -g yarn
yarn global add claude-flow

# Use Docker (if available)
docker run -it --rm claude-flow/cli:latest

# Download and run manually
curl -O https://releases.claude-flow.dev/latest/claude-flow.tar.gz
tar -xzf claude-flow.tar.gz
./claude-flow/bin/claude-flow-novice --version
```

Remember: Most setup issues are related to Node.js version, permissions, or network connectivity. Start with the basics and work your way up to more complex solutions.

---

**Quick Recovery Commands:**
- `npx claude-flow@latest doctor` - Comprehensive health check
- `npx claude-flow@latest config reset` - Reset configuration
- `npm cache clean --force` - Clear npm cache
- `npx claude-flow@latest --version` - Verify installation