# CLI Troubleshooting Guide

This guide covers common issues with the Claude Flow CLI interface and their solutions.

## Table of Contents

1. [Command Not Found](#command-not-found)
2. [Permission Issues](#permission-issues)
3. [Syntax Errors](#syntax-errors)
4. [Performance Problems](#performance-problems)
5. [Configuration Issues](#configuration-issues)
6. [Agent Spawning Problems](#agent-spawning-problems)
7. [Debugging CLI Commands](#debugging-cli-commands)

## Command Not Found

### Error: `claude-flow-novice: command not found`

**Cause:** CLI not properly installed or not in PATH

**Solutions:**

#### Option 1: Use npx (Recommended)
```bash
# Instead of global install, use npx
npx claude-flow-novice@latest init
npx claude-flow-novice status
```

#### Option 2: Global Installation
```bash
# Install globally
npm install -g claude-flow-novice

# Verify installation
which claude-flow-novice
claude-flow-novice --version
```

#### Option 3: Local Installation with npm scripts
```bash
# In your project directory
npm install claude-flow-novice
npx claude-flow-novice init
```

#### Option 4: Fix PATH Issues
```bash
# Check npm global path
npm config get prefix

# Add to PATH (add to ~/.bashrc or ~/.zshrc)
export PATH="$(npm config get prefix)/bin:$PATH"

# Reload shell
source ~/.bashrc  # or source ~/.zshrc
```

### Error: `Module not found`

**Cause:** Incomplete installation or corrupted dependencies

**Solutions:**
```bash
# Clean install
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Verify all dependencies
npm list --depth=0

# Rebuild if necessary
npm run build
```

## Permission Issues

### Error: `EACCES: permission denied`

**For Global Installation:**
```bash
# Option 1: Configure npm to use different directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'

# Add to ~/.bashrc or ~/.zshrc
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Now install globally
npm install -g claude-flow-novice
```

**For Local Operations:**
```bash
# Check file permissions
ls -la ~/.claude-flow/

# Fix permissions if needed
chmod -R 755 ~/.claude-flow/
chown -R $USER:$USER ~/.claude-flow/
```

### Error: `EPERM: operation not permitted`

**Windows-specific solutions:**
```powershell
# Run PowerShell as Administrator
# Then execute the command

# Or use Windows Subsystem for Linux (WSL)
wsl
# Continue with Linux commands
```

**macOS-specific solutions:**
```bash
# Grant Terminal full disk access in System Preferences
# Security & Privacy > Privacy > Full Disk Access

# Or use sudo carefully
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}
```

## Syntax Errors

### Error: `Invalid command syntax`

**Common Syntax Issues:**

#### 1. Missing Quotes for Multi-word Arguments
```bash
# ❌ Wrong
claude-flow-novice sparc run "Create user authentication system"

# ✅ Correct
claude-flow-novice sparc run "Create user authentication system"
```

#### 2. Incorrect Flag Usage
```bash
# ❌ Wrong
claude-flow-novice init --config=development

# ✅ Correct
claude-flow-novice init --config development
# or
claude-flow-novice init --config=development
```

#### 3. Command Order Issues
```bash
# ❌ Wrong
claude-flow-novice --verbose sparc run "task"

# ✅ Correct
claude-flow-novice sparc run "task" --verbose
```

### Error: `Unknown command or option`

**Check Available Commands:**
```bash
# List all commands
claude-flow-novice --help

# Get help for specific command
claude-flow-novice sparc --help
claude-flow-novice swarm --help

# Check command exists
claude-flow-novice commands list
```

**Common Typos:**
```bash
# ❌ Common mistakes
claude-flow-novice spac run    # Missing 'r' in sparc
claude-flow-novice swrm init   # Typo in swarm
claude-flow-novice stauts      # Typo in status

# ✅ Correct commands
claude-flow-novice sparc run
claude-flow-novice swarm init
claude-flow-novice status
```

## Performance Problems

### Slow Command Execution

**Diagnostic Commands:**
```bash
# Enable performance monitoring
claude-flow-novice config set performance.monitoring true

# Run with timing
time claude-flow-novice sparc run "simple task"

# Profile command execution
claude-flow-novice profile --command="sparc run 'task'"

# Check system resources
claude-flow-novice status --system
```

**Optimization Solutions:**

#### 1. Increase Memory Limit
```bash
# Set Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=8192"

# Make permanent (add to ~/.bashrc)
echo 'export NODE_OPTIONS="--max-old-space-size=8192"' >> ~/.bashrc
```

#### 2. Enable Performance Mode
```bash
# Enable high-performance mode
claude-flow-novice config set performance.mode high

# Disable unnecessary features
claude-flow-novice config set features.analytics false
claude-flow-novice config set features.telemetry false
```

#### 3. Optimize Agent Configuration
```bash
# Reduce concurrent agents
claude-flow-novice config set swarm.maxAgents 3

# Use simpler topology
claude-flow-novice config set swarm.topology simple
```

### Memory Issues

**Error: `JavaScript heap out of memory`**

**Solutions:**
```bash
# Increase heap size
export NODE_OPTIONS="--max-old-space-size=16384"

# Use streaming for large operations
claude-flow-novice sparc run "task" --stream

# Process in chunks
claude-flow-novice batch --chunk-size=10 tasks.json
```

**Memory Monitoring:**
```bash
# Check memory usage
claude-flow-novice status --memory

# Monitor during operation
claude-flow-novice monitor --memory &
claude-flow-novice sparc run "memory-intensive task"
```

## Configuration Issues

### Error: `Configuration file not found`

**Solutions:**
```bash
# Initialize configuration
claude-flow-novice init

# Create minimal config
claude-flow-novice config create --minimal

# Use specific config file
claude-flow-novice --config /path/to/config.json sparc run "task"
```

### Error: `Invalid configuration`

**Validate Configuration:**
```bash
# Validate current config
claude-flow-novice config validate

# Show current config
claude-flow-novice config show

# Reset to defaults
claude-flow-novice config reset
```

**Fix Common Config Issues:**
```bash
# Fix JSON syntax errors
claude-flow-novice config fix --syntax

# Migrate old config format
claude-flow-novice config migrate

# Backup before changes
claude-flow-novice config backup
```

### Environment Variables Issues

**Check Environment:**
```bash
# List all environment variables
claude-flow-novice env list

# Check specific variables
echo $CLAUDE_FLOW_CONFIG
echo $NODE_ENV

# Set required variables
export CLAUDE_FLOW_CONFIG=/path/to/config.json
export NODE_ENV=development
```

## Agent Spawning Problems

### Error: `Failed to spawn agent`

**Common Causes and Solutions:**

#### 1. Resource Constraints
```bash
# Check available resources
claude-flow-novice status --resources

# Reduce concurrent agents
claude-flow-novice config set swarm.maxConcurrent 2

# Increase timeout
claude-flow-novice config set agent.spawnTimeout 60000
```

#### 2. Agent Type Issues
```bash
# List available agent types
claude-flow-novice agents list

# Verify agent type exists
claude-flow-novice agents info researcher

# Use fallback agent
claude-flow-novice sparc run "task" --agent fallback
```

#### 3. Network Issues
```bash
# Test connectivity
claude-flow-novice network test

# Use offline mode
claude-flow-novice sparc run "task" --offline

# Configure proxy
claude-flow-novice config set network.proxy "http://proxy:8080"
```

### Error: `Agent communication failed`

**Diagnostic Steps:**
```bash
# Test agent communication
claude-flow-novice agents test-communication

# Check network ports
netstat -an | grep 3000

# Verify firewall settings
# Windows: Check Windows Firewall
# macOS: Check System Preferences > Security & Privacy
# Linux: Check iptables/ufw
```

**Solutions:**
```bash
# Use different communication method
claude-flow-novice config set agents.communication file

# Increase timeout
claude-flow-novice config set agents.timeout 30000

# Use local mode
claude-flow-novice sparc run "task" --local
```

## Debugging CLI Commands

### Enable Debug Mode

```bash
# Enable all debug output
DEBUG=* claude-flow-novice sparc run "task"

# Enable specific debug categories
DEBUG=cli:* claude-flow-novice sparc run "task"
DEBUG=agent:* claude-flow-novice sparc run "task"
DEBUG=config:* claude-flow-novice status

# Save debug output to file
DEBUG=* claude-flow-novice sparc run "task" 2> debug.log
```

### Verbose Output

```bash
# Enable verbose mode
claude-flow-novice --verbose sparc run "task"

# Maximum verbosity
claude-flow-novice --verbose=3 sparc run "task"

# Silent mode (errors only)
claude-flow-novice --quiet sparc run "task"
```

### Logging and Tracing

```bash
# Enable request tracing
claude-flow-novice config set logging.trace true

# Set log level
claude-flow-novice config set logging.level debug

# View logs
claude-flow-novice logs --tail=50
claude-flow-novice logs --follow

# Export logs
claude-flow-novice logs --export debug-session.log
```

## Common CLI Patterns

### Working with Large Projects

```bash
# Initialize large project
claude-flow-novice init --large-project

# Use batch processing
claude-flow-novice batch --config batch-config.json

# Process incrementally
claude-flow-novice sparc run "task" --incremental
```

### CI/CD Integration

```bash
# Non-interactive mode
claude-flow-novice sparc run "task" --no-interactive

# Fail fast on errors
claude-flow-novice sparc run "task" --fail-fast

# Generate reports
claude-flow-novice sparc run "task" --report=json > results.json
```

### Development Workflow

```bash
# Watch mode for development
claude-flow-novice sparc watch --pattern "*.ts"

# Development server
claude-flow-novice dev --hot-reload

# Test mode
claude-flow-novice sparc run "task" --test-mode
```

## Error Recovery

### Graceful Shutdown

```bash
# Stop all operations gracefully
claude-flow-novice stop --graceful

# Force stop if needed
claude-flow-novice stop --force

# Cleanup resources
claude-flow-novice cleanup
```

### Recovery Commands

```bash
# Recover from interrupted operation
claude-flow-novice recover --last-session

# Reset to known good state
claude-flow-novice reset --soft

# Full system reset
claude-flow-novice reset --hard --confirm
```

### Backup and Restore

```bash
# Create backup before risky operations
claude-flow-novice backup create --name "before-major-change"

# Restore from backup
claude-flow-novice backup restore --name "before-major-change"

# List available backups
claude-flow-novice backup list
```

## Platform-Specific Issues

### Windows CMD/PowerShell

```powershell
# Use proper escaping in CMD
claude-flow-novice sparc run "Create \"user\" authentication"

# PowerShell execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Bash/Zsh

```bash
# Use proper quoting
claude-flow-novice sparc run 'Create "user" authentication'

# Handle special characters
claude-flow-novice sparc run "Create \$variable handling"
```

### Fish Shell

```fish
# Fish-specific syntax
claude-flow-novice sparc run "Create user authentication"

# Handle variables
set task "Create user authentication"
claude-flow-novice sparc run $task
```

## Getting More Help

```bash
# Built-in help system
claude-flow-novice help
claude-flow-novice help sparc
claude-flow-novice help swarm

# Interactive help
claude-flow-novice help --interactive

# Documentation
claude-flow-novice docs --open

# Version and system info
claude-flow-novice --version
claude-flow-novice info --system
```

---

**Next Steps:**
- [MCP Troubleshooting](./mcp-troubleshooting.md)
- [Performance Troubleshooting](./performance-troubleshooting.md)
- [Configuration Troubleshooting](./configuration-troubleshooting.md)