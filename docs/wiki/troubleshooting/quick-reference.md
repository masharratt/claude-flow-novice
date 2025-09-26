# Quick Troubleshooting Reference

This is a condensed reference guide for common Claude Flow issues and their quick fixes.

## 🚨 Emergency Quick Fixes

### System Won't Start
```bash
# Quick recovery sequence
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
npm run build
claude-flow-novice config reset
```

### Command Not Found
```bash
# Use npx instead of global install
npx claude-flow-novice@latest init
npx claude-flow-novice@latest status

# Or fix PATH
export PATH="$HOME/.npm-global/bin:$PATH"
```

### Memory Issues
```bash
# Increase Node.js memory
export NODE_OPTIONS="--max-old-space-size=8192"

# Clear caches
claude-flow-novice cache clear --all
claude-flow-novice cleanup --temp-files
```

### Permission Denied
```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH="$HOME/.npm-global/bin:$PATH"

# Fix file permissions
chmod -R 755 ~/.claude-flow/
chown -R $USER:$USER ~/.claude-flow/
```

## 📊 Quick Diagnostics

### System Health Check
```bash
# One-liner health check
claude-flow-novice status --health && \
node --version && \
npm --version && \
echo "✅ System OK" || echo "❌ Issues detected"
```

### Error Information
```bash
# Get error details
claude-flow-novice logs --level error --last 1h
claude-flow-novice config validate
claude-flow-novice diagnose --verbose
```

### Performance Check
```bash
# Quick performance assessment
time claude-flow-novice sparc run "simple test"
claude-flow-novice status --performance
free -h  # Linux/WSL
```

## 🔧 Common Error Codes

| Code | Quick Fix |
|------|-----------|
| **E001** | `claude-flow-novice init` |
| **E003** | `claude-flow-novice mcp restart` |
| **E006** | `export NODE_OPTIONS="--max-old-space-size=8192"` |
| **E101** | `claude-flow-novice config set swarm.maxAgents 3` |
| **E201** | `claude-flow-novice mcp test-connection` |

## 🖥️ Platform-Specific Quick Fixes

### Windows
```powershell
# PowerShell execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Path issues
$env:PATH += ";$env:APPDATA\npm"

# Use WSL for complex issues
wsl
```

### macOS
```bash
# Permission issues
sudo chown -R $(whoami) $(npm config get prefix)/*

# Missing Xcode tools
xcode-select --install

# Homebrew fixes
brew doctor && brew update
```

### Linux
```bash
# Missing build tools (Ubuntu/Debian)
sudo apt-get install build-essential python3-dev

# Permission fixes
sudo chown -R $(whoami) ~/.npm-global/
```

## 🌐 Network Quick Fixes

### Connection Issues
```bash
# Test connectivity
ping -c 4 google.com
curl -I https://api.anthropic.com

# Proxy configuration
npm config set proxy http://proxy:8080
export HTTP_PROXY=http://proxy:8080
```

### Firewall Issues
```bash
# Quick firewall check
# Linux: sudo ufw allow 3001
# macOS: System Preferences → Security & Privacy → Firewall
# Windows: Windows Defender Firewall → Allow an app
```

## 🔍 Debug Mode Quick Start

### Enable Debug Output
```bash
# All debugging
DEBUG=* claude-flow-novice sparc run "task"

# Specific categories
DEBUG=agent:*,mcp:* claude-flow-novice status

# Save to file
DEBUG=* claude-flow-novice sparc run "task" 2> debug.log
```

### Performance Profiling
```bash
# Quick CPU profile
node --prof $(which claude-flow-novice) sparc run "task"

# Memory monitoring
claude-flow-novice monitor --memory --real-time
```

## 📝 Log Analysis Quick Commands

### View Recent Errors
```bash
# Last errors
claude-flow-novice logs --level error --tail 20

# Search for patterns
claude-flow-novice logs --search "agent spawn failed"

# Export for analysis
claude-flow-novice logs --export debug-$(date +%Y%m%d).log
```

### Log Monitoring
```bash
# Real-time monitoring
claude-flow-novice logs --follow

# Filter by component
claude-flow-novice logs --component AGENT --follow
```

## 🔄 Recovery Procedures

### Soft Reset
```bash
# Reset configuration but keep data
claude-flow-novice config reset --soft
claude-flow-novice cache clear
```

### Hard Reset
```bash
# Complete reset (⚠️ destroys data)
claude-flow-novice config reset --hard
rm -rf ~/.claude-flow/
claude-flow-novice init
```

### Backup and Restore
```bash
# Create backup
claude-flow-novice backup create --name emergency-$(date +%Y%m%d)

# Restore from backup
claude-flow-novice backup restore --name emergency-20240926
```

## 🚀 Performance Quick Wins

### Memory Optimization
```bash
# Increase memory limits
export NODE_OPTIONS="--max-old-space-size=16384"

# Enable garbage collection
export NODE_OPTIONS="$NODE_OPTIONS --expose-gc"

# Reduce concurrent operations
claude-flow-novice config set swarm.maxConcurrent 2
```

### Speed Optimization
```bash
# Enable performance mode
claude-flow-novice config set performance.mode high

# Disable analytics
claude-flow-novice config set features.analytics false

# Use connection pooling
claude-flow-novice config set network.connectionPool true
```

## 🔐 Security Quick Checks

### Permission Audit
```bash
# Check file permissions
ls -la ~/.claude-flow/
ls -la ~/.npm-global/

# Check running processes
ps aux | grep claude-flow
```

### Network Security
```bash
# Check open ports
netstat -an | grep LISTEN | grep 3001

# Check firewall status
# Linux: sudo ufw status
# macOS: sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
```

## 📱 MCP Quick Fixes

### MCP Server Issues
```bash
# Restart MCP server
claude-flow-novice mcp restart

# Test MCP connection
claude-flow-novice mcp test-connection

# List available tools
claude-flow-novice mcp tools list
```

### Tool Invocation Failures
```bash
# Check tool parameters
claude-flow-novice mcp tools describe swarm_init

# Test with minimal parameters
claude-flow-novice mcp invoke swarm_init --topology mesh
```

## 📞 Getting Help

### Information Gathering
```bash
# System information
claude-flow-novice info --system

# Generate diagnostic report
claude-flow-novice diagnose --export report.json

# Get configuration details
claude-flow-novice config show --effective
```

### Support Channels
1. **GitHub Issues**: Bug reports and feature requests
2. **Documentation**: Check the full troubleshooting guides
3. **Community**: Stack Overflow, Discord, Reddit

### Before Contacting Support
```bash
# Gather this information:
echo "OS: $(uname -a)"
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo "Claude Flow: $(claude-flow-novice --version)"
claude-flow-novice logs --level error --last 24h > error-log.txt
claude-flow-novice config show > config-dump.json
```

## 🎯 Escalation Path

1. **Self-Service**: Use this quick reference
2. **Documentation**: Check detailed troubleshooting guides
3. **Community**: Search existing issues and discussions
4. **Support**: File bug report with diagnostic information

---

**For detailed troubleshooting, see:**
- [CLI Issues](./cli-troubleshooting.md)
- [MCP Issues](./mcp-troubleshooting.md)
- [Performance Issues](./performance-troubleshooting.md)
- [Platform-Specific Issues](./windows-troubleshooting.md)

**Last Updated:** September 2024