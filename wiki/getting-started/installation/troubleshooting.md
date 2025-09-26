# Installation Troubleshooting Guide

**Comprehensive troubleshooting solutions** for Claude Flow Novice installation issues across all platforms and access methods.

## 🎯 Quick Diagnostic

### Step 1: System Check
```bash
# Run comprehensive diagnostic
npx claude-flow-novice@latest doctor

# If that fails, check prerequisites
node --version  # Should be 18.0.0+
npm --version   # Should be 8.0.0+
```

### Step 2: Error Classification
Identify your issue category:
- **[Installation Errors](#installation-errors)** - Package installation fails
- **[Permission Issues](#permission-issues)** - Access denied errors
- **[Command Not Found](#command-not-found-errors)** - CLI not available
- **[MCP Connection Issues](#mcp-connection-issues)** - Claude Code integration problems
- **[Platform-Specific Issues](#platform-specific-issues)** - OS-related problems
- **[Performance Issues](#performance-issues)** - Slow or hanging operations

## 🚨 Installation Errors

### Error: `npm ERR! peer dep missing`

**Symptoms:**
```bash
npm ERR! peer dep missing: react@>=16.8.0, required by @some/package
```

**Solution:**
```bash
# Install missing peer dependencies
npm install react@latest react-dom@latest

# Or use --legacy-peer-deps flag
npm install -g claude-flow-novice --legacy-peer-deps

# Alternative: Use yarn
yarn global add claude-flow-novice
```

### Error: `ENOSPC: no space left on device`

**Symptoms:**
```bash
Error: ENOSPC: no space left on device, write
```

**Solution:**
```bash
# Check disk space
df -h

# Clear npm cache
npm cache clean --force

# Clear system temp files (Linux/macOS)
sudo rm -rf /tmp/*

# Increase inotify watchers (Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Error: `Network timeout`

**Symptoms:**
```bash
npm ERR! network timeout at: https://registry.npmjs.org/claude-flow-novice
```

**Solution:**
```bash
# Increase timeout
npm config set timeout 120000

# Use different registry
npm config set registry https://registry.npmjs.org/

# Or use alternative registry
npm install -g claude-flow-novice --registry https://registry.npm.taobao.org

# Reset network config
npm config delete proxy
npm config delete https-proxy
```

### Error: `package.json not found`

**Symptoms:**
```bash
npm ERR! enoent ENOENT: no such file or directory, open 'package.json'
```

**Solution:**
```bash
# For global installation (should work anywhere)
npm install -g claude-flow-novice

# For local installation, initialize project first
npm init -y
npm install claude-flow-novice

# Or use npx (no installation needed)
npx claude-flow-novice@latest --version
```

## 🔒 Permission Issues

### Error: `EACCES: permission denied`

**Symptoms:**
```bash
npm ERR! Error: EACCES: permission denied, access '/usr/local/lib/node_modules'
```

**Solution (Linux/macOS):**
```bash
# Method 1: Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Now install without sudo
npm install -g claude-flow-novice

# Method 2: Use nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
npm install -g claude-flow-novice

# Method 3: Change ownership (not recommended)
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

**Solution (Windows):**
```powershell
# Run PowerShell as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Install in user directory
npm config set prefix $env:APPDATA\\npm
npm install -g claude-flow-novice

# Add to PATH
$env:PATH += \";$env:APPDATA\\npm\"
```

### Error: `access denied` on Windows

**Symptoms:**
```powershell
npm ERR! Error: EPERM: operation not permitted, mkdir 'C:\Program Files\nodejs'
```

**Solution:**
```powershell
# Option 1: Install in user directory
npm config set prefix $env:LOCALAPPDATA\\npm
npm config set cache $env:LOCALAPPDATA\\npm-cache
npm install -g claude-flow-novice

# Option 2: Use Windows Subsystem for Linux (WSL)
wsl --install Ubuntu-22.04
# Then follow Linux installation instructions

# Option 3: Use Chocolatey (run as Administrator)
choco install nodejs
npm install -g claude-flow-novice
```

## 🔍 Command Not Found Errors

### Error: `claude-flow-novice: command not found`

**Symptoms:**
```bash
bash: claude-flow-novice: command not found
```

**Diagnosis:**
```bash
# Check if installed globally
npm list -g claude-flow-novice

# Check PATH
echo $PATH
which node
which npm
```

**Solution:**
```bash
# Method 1: Add npm global bin to PATH
echo 'export PATH=$PATH:$(npm config get prefix)/bin' >> ~/.bashrc
source ~/.bashrc

# Method 2: Use npx instead
npx claude-flow-novice@latest --version

# Method 3: Create symlink
sudo ln -s $(npm config get prefix)/lib/node_modules/claude-flow-novice/bin/cli.js /usr/local/bin/claude-flow-novice

# Method 4: Reinstall with proper PATH
npm uninstall -g claude-flow-novice
export PATH=$PATH:$(npm config get prefix)/bin
npm install -g claude-flow-novice
```

### Error: `Module not found` when using npx

**Symptoms:**
```bash
npx: installed 1 in 2.3s
Error: Cannot find module 'claude-flow-novice'
```

**Solution:**
```bash
# Clear npx cache
npx --clear-cache

# Use specific version
npx claude-flow-novice@latest --version

# Force reinstall
npx --yes claude-flow-novice@latest --version

# Use full package name
npx @claude-flow/novice@latest --version
```

## 🔗 MCP Connection Issues

### Error: `MCP server failed to start`

**Symptoms:**
```bash
✗ MCP server 'claude-flow-novice' failed to start
Error: spawn npx ENOENT
```

**Diagnosis:**
```bash
# Check if Claude Code can find npx
which npx

# Test npx command directly
npx claude-flow-novice@latest --version

# Check MCP configuration
claude mcp status
```

**Solution:**
```bash
# Method 1: Use full path to npx
claude mcp remove claude-flow-novice
claude mcp add claude-flow-novice $(which npx) claude-flow-novice@latest mcp start

# Method 2: Install globally first
npm install -g claude-flow-novice
claude mcp add claude-flow-novice claude-flow-novice mcp start

# Method 3: Use explicit path
claude mcp add claude-flow-novice /usr/local/bin/npx claude-flow-novice@latest mcp start
```

### Error: `Port already in use`

**Symptoms:**
```bash
Error: listen EADDRINUSE: address already in use :::3001
```

**Solution:**
```bash
# Find process using port 3001
lsof -i :3001
netstat -tulpn | grep 3001

# Kill process if safe
kill -9 <PID>

# Use different port
claude mcp add claude-flow-novice npx claude-flow-novice@latest mcp start --port 3002

# Configure Claude Code to use new port
```

### Error: `MCP tools not available`

**Symptoms:**
```bash
No MCP tools available for claude-flow-novice
```

**Solution:**
```bash
# Restart MCP server
claude mcp restart claude-flow-novice

# Check MCP logs
claude mcp logs claude-flow-novice --tail 50

# Reinstall MCP server
claude mcp remove claude-flow-novice
claude mcp add claude-flow-novice npx claude-flow-novice@latest mcp start

# Verify tools are loaded
claude mcp tools claude-flow-novice
```

## 🖥️ Platform-Specific Issues

### Linux Issues

**Issue: `gyp ERR! build error` on Ubuntu/Debian**
```bash
# Install build tools
sudo apt update
sudo apt install build-essential python3-dev

# Rebuild native modules
npm rebuild

# Install claude-flow-novice
npm install -g claude-flow-novice
```

**Issue: `GLIBC version` error**
```bash
# Check GLIBC version
ldd --version

# If too old, consider using Docker
docker run -it node:20-alpine
npm install -g claude-flow-novice
```

### macOS Issues

**Issue: `xcode-select: error` during installation**
```bash
# Install Xcode command line tools
xcode-select --install

# Accept license
sudo xcodebuild -license accept

# Install claude-flow-novice
npm install -g claude-flow-novice
```

**Issue: `Operation not permitted` on macOS Catalina+**
```bash
# Use Homebrew Node.js
brew install node

# Or use nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
npm install -g claude-flow-novice
```

### Windows Issues

**Issue: `MSBuild not found` error**
```powershell
# Install Visual Studio Build Tools
npm install -g windows-build-tools

# Or install Visual Studio 2022 with C++ tools
# Then reinstall
npm install -g claude-flow-novice
```

**Issue: Long path names in Windows**
```powershell
# Enable long paths in Windows
New-ItemProperty -Path \"HKLM:\\SYSTEM\\CurrentControlSet\\Control\\FileSystem\" -Name \"LongPathsEnabled\" -Value 1 -PropertyType DWORD -Force

# Use flat node_modules
npm config set legacy-peer-deps true
npm install -g claude-flow-novice --no-optional
```

## ⚡ Performance Issues

### Issue: Slow installation

**Symptoms:**
- Installation takes > 5 minutes
- Commands are slow to respond

**Solution:**
```bash
# Use faster registry
npm config set registry https://registry.npmjs.org/

# Disable optional dependencies
npm install -g claude-flow-novice --no-optional

# Use yarn instead
yarn global add claude-flow-novice

# Clear cache first
npm cache clean --force
```

### Issue: High memory usage

**Symptoms:**
- System becomes slow during operation
- Out of memory errors

**Solution:**
```bash
# Limit Node.js memory
export NODE_OPTIONS=\"--max-old-space-size=4096\"

# Use lighter installation
npm install -g claude-flow-novice --production

# Monitor memory usage
npx claude-flow-novice@latest doctor --memory
```

### Issue: Command hangs

**Symptoms:**
- Commands never complete
- No response from CLI

**Solution:**
```bash
# Enable debug mode
DEBUG=claude-flow:* npx claude-flow-novice@latest --version

# Set timeout
export CLAUDE_FLOW_TIMEOUT=30000

# Check for network issues
ping registry.npmjs.org

# Use offline mode if available
npx claude-flow-novice@latest --offline doctor
```

## 🔧 Advanced Troubleshooting

### Complete Clean Installation

If all else fails, perform a complete clean installation:

```bash
# 1. Remove all installations
npm uninstall -g claude-flow-novice
rm -rf ~/.npm
rm -rf ~/.claude-flow

# 2. Clear all caches
npm cache clean --force
npx --clear-cache

# 3. Remove MCP integration
claude mcp remove claude-flow-novice

# 4. Restart terminal/shell
# Close and reopen your terminal

# 5. Reinstall from scratch
npm install -g claude-flow-novice

# 6. Verify installation
claude-flow-novice --version

# 7. Reinstall MCP integration
claude mcp add claude-flow-novice claude-flow-novice mcp start
```

### Debug Mode Installation

Enable maximum debugging to diagnose issues:

```bash
# Enable all debug output
export DEBUG=*
export NPM_CONFIG_LOGLEVEL=verbose
export CLAUDE_FLOW_DEBUG=true

# Install with debug output
npm install -g claude-flow-novice --verbose

# Save debug output
npm install -g claude-flow-novice --verbose 2>&1 | tee install-debug.log
```

### Network Diagnostics

Test network connectivity and npm configuration:

```bash
# Test npm registry connectivity
npm ping

# Check npm configuration
npm config list

# Test package availability
npm view claude-flow-novice

# Check DNS resolution
nslookup registry.npmjs.org

# Test with different registry
npm install -g claude-flow-novice --registry https://registry.npmmirror.com/
```

## 📋 Error Reference

### Common Error Codes

| Error Code | Description | Solution |
|------------|-------------|----------|
| ENOENT | File not found | Check paths and permissions |
| EACCES | Permission denied | Fix npm permissions or use sudo |
| EADDRINUSE | Port in use | Kill process or use different port |
| ENETUNREACH | Network unreachable | Check internet connection |
| ETIMEOUT | Operation timeout | Increase timeout or check network |
| ENOSPC | No space left | Free disk space or clear cache |

### Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | Success | Operation completed successfully |
| 1 | General error | Check error message and logs |
| 2 | Missing dependency | Install required dependencies |
| 126 | Permission denied | Fix file permissions |
| 127 | Command not found | Check PATH and installation |
| 130 | User interrupt | Operation was cancelled |

## 🆘 Getting Additional Help

### Collect Diagnostic Information

```bash
# Generate comprehensive diagnostic report
npx claude-flow-novice@latest doctor --export diagnostic.json

# Include system information
npx claude-flow-novice@latest doctor --system --export full-diagnostic.json

# Check installation integrity
npx claude-flow-novice@latest doctor --verify --export verification.json
```

### Report Issues

When reporting issues, include:

1. **Operating system and version**
2. **Node.js and npm versions**
3. **Complete error message**
4. **Steps to reproduce**
5. **Diagnostic output from `doctor` command**

```bash
# Quick system info
echo \"OS: $(uname -a)\"
echo \"Node: $(node --version)\"
echo \"NPM: $(npm --version)\"
echo \"Claude Flow: $(npx claude-flow-novice@latest --version)\"
```

### Support Channels

- **[GitHub Issues](https://github.com/ruvnet/claude-flow-novice/issues)** - Bug reports and feature requests
- **[Community Discussions](../../community/discussions/README.md)** - General help and questions
- **[Troubleshooting Wiki](../../troubleshooting/README.md)** - Additional troubleshooting resources

## ✅ Success Verification

After resolving issues, verify your installation:

```bash
# 1. Check version
claude-flow-novice --version

# 2. Run health check
claude-flow-novice doctor

# 3. Test basic functionality
claude-flow-novice agents list

# 4. Test MCP integration (if using Claude Code)
claude mcp status claude-flow-novice

# 5. Run quick test
claude-flow-novice agent spawn coder \"Create hello world function\"
```

If all tests pass, your installation is working correctly!

---

**Need more help?** Check the [complete troubleshooting section](../../troubleshooting/README.md) or [join our community](../../community/discussions/README.md) for additional support.