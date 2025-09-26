# Claude Flow Troubleshooting Guide

Welcome to the comprehensive troubleshooting documentation for Claude Flow Novice. This guide covers common issues, diagnostic procedures, and solutions for both CLI and MCP usage.

## Quick Navigation

### 🚨 Emergency Solutions
- [Critical Errors](#critical-errors) - System-breaking issues
- [Installation Failures](#installation-failures) - Setup problems
- [Performance Issues](#performance-issues) - Slow operation fixes

### 📋 Common Issues
- [CLI Issues](./cli-troubleshooting.md) - Command line problems
- [MCP Issues](./mcp-troubleshooting.md) - Model Context Protocol issues
- [Configuration Issues](./configuration-troubleshooting.md) - Setup and config problems
- [Performance Issues](./performance-troubleshooting.md) - Speed and optimization

### 🔧 Platform-Specific
- [Windows Issues](./windows-troubleshooting.md) - Windows-specific problems
- [macOS Issues](./macos-troubleshooting.md) - macOS-specific problems
- [Linux Issues](./linux-troubleshooting.md) - Linux-specific problems

### 🔍 Diagnostic Tools
- [Error Analysis](./error-analysis.md) - Understanding error messages
- [Log Analysis](./log-analysis.md) - Reading and interpreting logs
- [Debug Mode](./debug-mode.md) - Using debug features

## Getting Help

### 🚀 Quick Start Troubleshooting

**New to troubleshooting?** Start here:
1. [Quick Reference Guide](./quick-reference.md) - Emergency fixes and common solutions
2. [Error Analysis Guide](./error-analysis.md) - Understanding error messages
3. [Debug Mode Guide](./debug-mode.md) - Enabling detailed diagnostics

### Self-Diagnosis Checklist

Before seeking help, try these steps:

1. **Check System Requirements**
   ```bash
   node --version  # Should be >= 20.0.0
   npm --version   # Should be >= 9.0.0
   ```

2. **Verify Installation**
   ```bash
   claude-flow-novice --version
   claude-flow-novice status
   ```

3. **Check Recent Changes**
   - Recent system updates
   - New software installations
   - Configuration changes

4. **Review Error Messages**
   - Copy full error messages
   - Note when the error occurs
   - Identify patterns or triggers

5. **Try Quick Fixes**
   ```bash
   # Quick recovery sequence
   npm cache clean --force
   claude-flow-novice config validate
   claude-flow-novice diagnose --verbose
   ```

### Quick Health Check

Run this command to check system health:

```bash
# Basic health check
claude-flow-novice health-check

# Detailed diagnostics
claude-flow-novice diagnose --verbose

# Test all components
npm run test:health
```

## Critical Errors

### System Won't Start

**Symptoms:**
- Command not found errors
- Module loading failures
- Immediate crashes

**Quick Fixes:**
```bash
# Reinstall dependencies
npm install

# Clear cache
npm cache clean --force

# Rebuild project
npm run clean && npm run build

# Reset configuration
claude-flow-novice config reset
```

### Data Corruption

**Symptoms:**
- Unexpected behavior
- Missing data
- Corrupt configurations

**Recovery Steps:**
```bash
# Backup current state
claude-flow-novice backup create

# Reset to defaults
claude-flow-novice config reset --hard

# Restore from backup if needed
claude-flow-novice backup restore --latest
```

## Installation Failures

### Node.js Version Issues

**Error:** `Error: Node.js version not supported`

**Solution:**
```bash
# Check current version
node --version

# Install Node.js 20+ using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

### Permission Errors

**Error:** `EACCES: permission denied`

**Solutions:**

**Option 1: Use npx (Recommended)**
```bash
npx claude-flow-novice@latest init
```

**Option 2: Fix npm permissions**
```bash
# Configure npm to use different directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

**Option 3: Use sudo (Not recommended)**
```bash
sudo npm install -g claude-flow-novice
```

### Network Issues

**Error:** `npm ERR! network request failed`

**Solutions:**
```bash
# Check network connectivity
ping registry.npmjs.org

# Configure proxy if needed
npm config set proxy http://proxy-server:port
npm config set https-proxy http://proxy-server:port

# Use different registry
npm config set registry https://registry.npmjs.org/

# Clear npm cache
npm cache clean --force
```

## Performance Issues

### Slow Operations

**Symptoms:**
- Commands take too long
- High memory usage
- System becomes unresponsive

**Diagnostic Commands:**
```bash
# Check system resources
claude-flow-novice status --performance

# Monitor resource usage
npm run test:performance

# Profile operations
claude-flow-novice profile --operation="swarm init"
```

**Optimization Steps:**
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=8192"

# Use performance mode
claude-flow-novice config set performance.mode high

# Disable unnecessary features
claude-flow-novice config set features.analytics false
```

## Error Code Reference

### Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| E001 | Configuration not found | Run `claude-flow-novice init` |
| E002 | Invalid project structure | Check package.json and directory structure |
| E003 | MCP server connection failed | Verify MCP server is running |
| E004 | Permission denied | Check file permissions |
| E005 | Network timeout | Check internet connection |
| E006 | Memory limit exceeded | Increase Node.js memory limit |
| E007 | Invalid command syntax | Check command documentation |
| E008 | Dependency conflict | Run `npm install` |
| E009 | File system error | Check disk space and permissions |
| E010 | Plugin loading failed | Verify plugin installation |

### Severity Levels

- **CRITICAL**: System cannot function
- **ERROR**: Feature broken but system usable
- **WARNING**: Potential issue, degraded performance
- **INFO**: Informational message
- **DEBUG**: Development information

## Getting Support

### Before Contacting Support

1. **Gather Information**
   ```bash
   # System info
   claude-flow-novice info --system

   # Generate diagnostic report
   claude-flow-novice diagnose --export=report.json

   # Recent logs
   claude-flow-novice logs --last=100
   ```

2. **Document the Issue**
   - Exact error messages
   - Steps to reproduce
   - Expected vs actual behavior
   - System environment

### Support Channels

1. **GitHub Issues** (Primary)
   - Bug reports
   - Feature requests
   - Technical discussions

2. **Documentation**
   - [Official Documentation](../../README.md)
   - [API Reference](../api/)
   - [Examples](../../../examples/)

3. **Community**
   - Stack Overflow (tag: claude-flow)
   - Discord community
   - Reddit discussions

### Filing Bug Reports

Include this information:

```markdown
## Environment
- OS: [Windows/macOS/Linux version]
- Node.js: [version]
- Claude Flow: [version]
- Browser: [if applicable]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [And so on...]

## Expected Behavior
[What you expected to happen]

## Actual Behavior
[What actually happened]

## Error Messages
```
[Paste any error messages here]
```

## Additional Context
[Any other context about the problem here]
```

## Best Practices

### Prevention

1. **Regular Updates**
   ```bash
   npm update claude-flow-novice
   claude-flow-novice update --check
   ```

2. **Configuration Backups**
   ```bash
   claude-flow-novice backup create --config-only
   ```

3. **Health Monitoring**
   ```bash
   # Add to crontab for regular health checks
   0 */6 * * * claude-flow-novice health-check --quiet
   ```

4. **Log Rotation**
   ```bash
   claude-flow-novice logs --rotate --keep=7
   ```

### Recovery Strategies

1. **Graceful Degradation**
   - Disable problematic features
   - Use fallback modes
   - Reduce complexity

2. **Clean Slate Recovery**
   ```bash
   claude-flow-novice reset --preserve-data
   claude-flow-novice init --fresh
   ```

3. **Partial Recovery**
   ```bash
   claude-flow-novice repair --component=config
   claude-flow-novice repair --component=cache
   ```

## Advanced Troubleshooting

For complex issues, see specialized guides:

- [Advanced Debugging](./advanced-debugging.md)
- [Custom Plugin Issues](./plugin-troubleshooting.md)
- [Enterprise Deployment](./enterprise-troubleshooting.md)
- [Development Environment](./development-troubleshooting.md)

## 📚 Complete Guide Index

### Core Troubleshooting
- [README](./README.md) - Main troubleshooting guide (this file)
- [Quick Reference](./quick-reference.md) - Emergency fixes and quick solutions
- [Error Analysis](./error-analysis.md) - Understanding error codes and messages
- [Debug Mode](./debug-mode.md) - Advanced debugging and diagnostics
- [Log Analysis](./log-analysis.md) - Log monitoring and analysis techniques

### Interface-Specific Guides
- [CLI Troubleshooting](./cli-troubleshooting.md) - Command line interface issues
- [MCP Troubleshooting](./mcp-troubleshooting.md) - Model Context Protocol issues
- [Configuration Troubleshooting](./configuration-troubleshooting.md) - Config and setup issues
- [Performance Troubleshooting](./performance-troubleshooting.md) - Speed and optimization

### Platform-Specific Guides
- [Windows Troubleshooting](./windows-troubleshooting.md) - Windows-specific issues
- [macOS Troubleshooting](./macos-troubleshooting.md) - macOS-specific issues
- [Linux Troubleshooting](./linux-troubleshooting.md) - Linux-specific issues

### Quick Navigation by Issue Type

#### 🚨 **Critical Issues**
- System won't start → [Quick Reference](./quick-reference.md#emergency-quick-fixes)
- Data corruption → [Error Analysis](./error-analysis.md#critical-errors)
- Complete failure → [CLI Troubleshooting](./cli-troubleshooting.md#command-not-found)

#### ⚡ **Performance Issues**
- Slow operations → [Performance Troubleshooting](./performance-troubleshooting.md)
- Memory problems → [Performance Troubleshooting](./performance-troubleshooting.md#memory-optimization)
- High CPU usage → [Performance Troubleshooting](./performance-troubleshooting.md#cpu-and-processing-optimization)

#### 🔧 **Configuration Issues**
- Config not found → [Configuration Troubleshooting](./configuration-troubleshooting.md#configuration-file-issues)
- Invalid settings → [Configuration Troubleshooting](./configuration-troubleshooting.md#configuration-validation)
- Migration problems → [Configuration Troubleshooting](./configuration-troubleshooting.md#migration-and-compatibility)

#### 🌐 **Network Issues**
- Connection failures → [MCP Troubleshooting](./mcp-troubleshooting.md#mcp-server-connection-issues)
- Timeout errors → [Network troubleshooting across all guides]
- Proxy problems → [Platform-specific guides]

#### 🖥️ **Platform Issues**
- Windows problems → [Windows Troubleshooting](./windows-troubleshooting.md)
- macOS problems → [macOS Troubleshooting](./macos-troubleshooting.md)
- Linux problems → [Linux Troubleshooting](./linux-troubleshooting.md)

#### 🔍 **Diagnostic Tools**
- Error codes → [Error Analysis](./error-analysis.md#error-code-reference)
- Log analysis → [Log Analysis](./log-analysis.md)
- Debug output → [Debug Mode](./debug-mode.md)

## 📞 Support Escalation Path

1. **Self-Service** (Start here)
   - [Quick Reference](./quick-reference.md)
   - [Error Analysis](./error-analysis.md)
   - Platform-specific guides

2. **Community Support**
   - GitHub Discussions
   - Stack Overflow (tag: claude-flow)
   - Discord community

3. **Technical Support**
   - GitHub Issues (with diagnostic info)
   - Include system information from diagnostic commands

4. **Emergency Support**
   - Critical production issues
   - Security vulnerabilities
   - Data loss scenarios

---

**Last Updated:** September 2024
**Version:** 1.0.0

For the most current troubleshooting information, visit our [GitHub repository](https://github.com/masharratt/claude-flow-novice/issues).