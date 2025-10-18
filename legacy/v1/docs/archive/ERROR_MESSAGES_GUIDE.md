# Error Messages & Troubleshooting Guide

**Clear, actionable error messages for Claude Flow Novice**

This guide provides comprehensive error messages with solutions and troubleshooting steps for all common issues.

---

## Error Message Format

All error messages in Claude Flow Novice follow this structure:

```json
{
  "errorId": "err_1234567890_abc123",
  "type": "network|validation|security|system|business|unknown",
  "securityLevel": "critical|high|medium|low|info",
  "message": "Clear description of what went wrong",
  "solution": "Specific steps to fix the issue",
  "documentation": "https://docs-url",
  "troubleshooting": [
    "Step 1: Check this",
    "Step 2: Do that"
  ],
  "timestamp": 1234567890
}
```

---

## Common Error Categories

### 1. Network Errors

#### Redis Connection Failed

**Error Message:**
```
Error: Redis connection failed
Type: network
Level: high
```

**Cause:**
- Redis server not running
- Incorrect Redis URL
- Firewall blocking connection
- Redis not installed

**Solution:**
```bash
# Check if Redis is running
redis-cli ping

# If not running, start Redis
redis-server

# Or using Homebrew (macOS)
brew services start redis

# Or using Docker
docker run -d -p 6379:6379 --name redis redis:latest

# Verify connection
claude-flow-novice health-check --service redis
```

**Troubleshooting Steps:**
1. Check if Redis is running: `redis-cli ping`
2. Start Redis: `redis-server` or `brew services start redis`
3. Verify connection: `claude-flow-novice health-check --service redis`
4. Check firewall settings if using remote Redis
5. Verify REDIS_URL environment variable if configured

**Documentation:** [Redis Setup Guide](https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#redis-connection-failed)

---

#### Network Timeout

**Error Message:**
```
Error: Connection timeout
Type: network
Level: high
```

**Cause:**
- Slow network connection
- Service unavailable
- Firewall blocking request
- DNS resolution issues

**Solution:**
```bash
# Check internet connectivity
ping google.com

# Check DNS resolution
nslookup google.com

# Increase timeout in config
claude-flow-novice config set timeout 10000

# Retry the operation
# The system will automatically retry with exponential backoff
```

**Troubleshooting Steps:**
1. Check internet connectivity: `ping google.com`
2. Verify firewall settings
3. Increase timeout: `claude-flow-novice config set timeout 10000`
4. Wait a moment and retry the operation

---

### 2. System Errors

#### Out of Memory

**Error Message:**
```
Error: JavaScript heap out of memory
Type: system
Level: critical
```

**Cause:**
- Too many agents running
- Large datasets in memory
- Memory leak
- Insufficient system RAM

**Solution:**
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Reduce agent count
claude-flow-novice config set maxAgents 3

# Run in sequential mode
claude-flow-novice swarm "Build app" --mode sequential

# Clean up memory
claude-flow-novice clean --all

# Monitor memory usage
claude-flow-novice metrics --type system
```

**Troubleshooting Steps:**
1. Increase Node.js memory: `export NODE_OPTIONS="--max-old-space-size=4096"`
2. Reduce concurrent agents: `claude-flow-novice config set maxAgents 3`
3. Clean cache: `claude-flow-novice clean --all`
4. Close other applications
5. Add more RAM if issue persists

**Documentation:** [Memory Management](https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#out-of-memory)

---

#### Permission Denied

**Error Message:**
```
Error: EACCES: permission denied
Type: system
Level: high
```

**Cause:**
- Insufficient file permissions
- Trying to write to protected directory
- Incorrect ownership

**Solution:**
```bash
# Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Or change directory ownership
sudo chown -R $USER:$USER .

# Or use different directory
cd ~/projects
claude-flow-novice init my-project
```

**Troubleshooting Steps:**
1. Check current directory permissions: `ls -la`
2. Fix npm permissions (see solution above)
3. Use different directory: `cd ~/projects`
4. Change ownership if needed: `sudo chown -R $USER:$USER .`

**Documentation:** [Permission Issues](https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#permission-denied)

---

### 3. Validation Errors

#### Invalid Configuration

**Error Message:**
```
Error: Configuration validation failed
Type: validation
Level: high
```

**Cause:**
- Invalid JSON syntax
- Missing required fields
- Invalid field values
- Type mismatches

**Solution:**
```bash
# Validate configuration
claude-flow-novice config validate

# Show validation details
claude-flow-novice config validate --detailed

# Reset to defaults
claude-flow-novice config reset --defaults

# Manually fix JSON syntax
# Common issues:
# - Missing commas
# - Unquoted strings
# - Wrong data types
```

**Common JSON Errors:**
```json
// ❌ Wrong - missing comma
{
  "maxAgents": 5
  "strategy": "development"
}

// ✅ Correct
{
  "maxAgents": 5,
  "strategy": "development"
}

// ❌ Wrong - string instead of number
{
  "maxAgents": "5"
}

// ✅ Correct
{
  "maxAgents": 5
}
```

**Troubleshooting Steps:**
1. Run validation: `claude-flow-novice config validate --detailed`
2. Check JSON syntax (commas, quotes, brackets)
3. Verify field types match requirements
4. Reset to defaults if corrupted: `claude-flow-novice config reset`

**Documentation:** [Configuration Guide](https://github.com/masharratt/claude-flow-novice/wiki/CONFIGURATION)

---

#### Missing Required Parameters

**Error Message:**
```
Error: Required parameters are missing
Type: validation
Level: high
```

**Cause:**
- Command called without required arguments
- Missing configuration values
- Incomplete API request

**Solution:**
```bash
# Check command syntax
claude-flow-novice help <command>

# Example: swarm command requires objective
claude-flow-novice swarm "Build REST API"

# View API documentation
claude-flow-novice help api

# Check which parameters are missing in error details
```

**Troubleshooting Steps:**
1. Check command syntax: `claude-flow-novice help <command>`
2. Review API documentation for required parameters
3. Add missing parameters and retry
4. Use `--help` flag for any command

**Documentation:** [API Reference](https://github.com/masharratt/claude-flow-novice/wiki/API)

---

### 4. Security Errors

#### Authentication Failed

**Error Message:**
```
Error: Authentication failed
Type: security
Level: high
```

**Cause:**
- Invalid API key
- Expired token
- Missing credentials
- Incorrect permissions

**Solution:**
```bash
# Verify API key is set
echo $ANTHROPIC_API_KEY

# Set API key
export ANTHROPIC_API_KEY=your-key-here

# Or add to .env file
echo "ANTHROPIC_API_KEY=your-key-here" >> .env

# Verify credentials
claude-flow-novice config show --section auth

# Generate new token if expired
```

**Troubleshooting Steps:**
1. Verify authentication credentials
2. Check API key or token expiration
3. Review security documentation
4. Regenerate credentials if needed

**Documentation:** [Authentication Setup](https://github.com/masharratt/claude-flow-novice/wiki/AUTHENTICATION)

---

### 5. Agent Errors

#### Failed to Spawn Agent

**Error Message:**
```
Error: Failed to spawn agent 'backend-dev'
Type: system
Level: high
```

**Cause:**
- Too many agents requested
- Insufficient system resources
- Agent configuration error
- Timeout during initialization

**Solution:**
```bash
# Reduce agent count
claude-flow-novice config set maxAgents 3

# Increase timeout
claude-flow-novice config set timeout 7200

# Check system resources
claude-flow-novice health-check

# Validate agent configuration
claude-flow-novice config validate --section agents

# Monitor system metrics
claude-flow-novice metrics --type system
```

**Troubleshooting Steps:**
1. Reduce agent count: `claude-flow-novice config set maxAgents 3`
2. Check available memory and CPU
3. Increase timeout: `claude-flow-novice config set timeout 7200`
4. Validate configuration: `claude-flow-novice config validate --section agents`

**Documentation:** [Agent Configuration](https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#failed-to-spawn-agent)

---

#### Swarm Not Progressing

**Error Message:**
```
Warning: Swarm progress stalled at 0%
Type: business
Level: medium
```

**Cause:**
- Agents not coordinating properly
- Resource constraints
- Configuration issues
- Task too complex

**Solution:**
```bash
# Check swarm status
claude-flow-novice status --detailed

# Restart swarm
claude-flow-novice swarm stop
claude-flow-novice swarm "Build app" --strategy development

# Try sequential mode
claude-flow-novice swarm "Build app" --mode sequential

# Monitor in real-time
claude-flow-novice monitor
```

**Troubleshooting Steps:**
1. Check detailed status: `claude-flow-novice status --detailed`
2. View logs: `claude-flow-novice logs --follow`
3. Try different strategy or mode
4. Break task into smaller subtasks

**Documentation:** [Swarm Troubleshooting](https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting#swarm-not-progressing)

---

## Error Severity Levels

### Critical
- System completely unavailable
- Data loss imminent
- Security breach detected
- **Action:** Immediate intervention required

### High
- Core functionality impaired
- Operation cannot proceed
- Security risk present
- **Action:** Fix before continuing

### Medium
- Degraded performance
- Non-critical feature unavailable
- Workaround available
- **Action:** Fix when convenient

### Low
- Minor issues
- Cosmetic problems
- Optional features affected
- **Action:** Optional fix

### Info
- Informational messages
- Status updates
- No action required

---

## Diagnostic Commands

### System Health Check
```bash
# Run comprehensive health check
claude-flow-novice health-check

# Check specific service
claude-flow-novice health-check --service redis

# Detailed output
claude-flow-novice health-check --verbose

# Auto-fix common issues
claude-flow-novice health-check --fix
```

### View Logs
```bash
# Follow logs in real-time
claude-flow-novice logs --follow

# Error logs only
claude-flow-novice logs --level error

# Last 100 lines
claude-flow-novice logs --tail 100

# Export logs
claude-flow-novice logs --export logs.txt
```

### System Metrics
```bash
# Real-time metrics
claude-flow-novice metrics --real-time

# System resources
claude-flow-novice metrics --type system

# Agent performance
claude-flow-novice metrics --type agents

# Export metrics
claude-flow-novice metrics --export metrics.json
```

### Configuration Validation
```bash
# Validate current config
claude-flow-novice config validate

# Detailed validation
claude-flow-novice config validate --detailed

# Show current config
claude-flow-novice config show

# Reset to defaults
claude-flow-novice config reset --defaults
```

---

## Emergency Recovery

### Complete System Reset
```bash
# WARNING: This will delete all state

# 1. Stop all processes
pkill -f claude-flow-novice

# 2. Clean cache and data
claude-flow-novice clean --all

# 3. Reset configuration
claude-flow-novice config reset --defaults

# 4. Verify system health
claude-flow-novice health-check

# 5. Restart
claude-flow-novice start
```

### Recover from Corrupted State
```bash
# Backup current state
cp -r .swarm .swarm.backup

# Clear corrupted data
rm -rf .swarm

# Reinitialize
claude-flow-novice init

# Restore from backup if needed
# (only restore specific files, not the entire directory)
```

---

## Getting Help

### Documentation
- **Full Documentation:** https://github.com/masharratt/claude-flow-novice/wiki
- **API Reference:** https://github.com/masharratt/claude-flow-novice/wiki/API
- **Troubleshooting:** https://github.com/masharratt/claude-flow-novice/wiki/Troubleshooting

### Community Support
- **GitHub Issues:** https://github.com/masharratt/claude-flow-novice/issues
- **GitHub Discussions:** https://github.com/masharratt/claude-flow-novice/discussions

### Reporting Bugs

When reporting issues, include:

```bash
# System information
claude-flow-novice --version
node --version
npm --version

# Configuration
claude-flow-novice config show

# Recent logs
claude-flow-novice logs --tail 50 --level error

# Health check results
claude-flow-novice health-check --verbose
```

---

## Prevention Best Practices

1. **Keep Updated**
   ```bash
   npm update -g claude-flow-novice
   ```

2. **Regular Health Checks**
   ```bash
   claude-flow-novice health-check
   ```

3. **Monitor Resources**
   ```bash
   claude-flow-novice metrics --type system
   ```

4. **Validate Configuration**
   ```bash
   claude-flow-novice config validate
   ```

5. **Clean Up Regularly**
   ```bash
   claude-flow-novice clean --all
   ```

---

**Last Updated:** 2025-10-09
**Version:** 1.6.6
