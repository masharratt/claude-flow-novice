# MCP Troubleshooting Guide

This guide covers issues specific to Model Context Protocol (MCP) integration and server management.

## Table of Contents

1. [MCP Server Connection Issues](#mcp-server-connection-issues)
2. [Server Registration Problems](#server-registration-problems)
3. [Tool Invocation Failures](#tool-invocation-failures)
4. [Resource Access Issues](#resource-access-issues)
5. [Performance and Timeout Issues](#performance-and-timeout-issues)
6. [Authentication and Security](#authentication-and-security)
7. [Debugging MCP Operations](#debugging-mcp-operations)

## MCP Server Connection Issues

### Error: `MCP server connection failed`

**Common Causes:**
- Server not running
- Incorrect connection configuration
- Network connectivity issues
- Port conflicts

**Diagnostic Commands:**
```bash
# Check MCP server status
claude-flow-novice mcp status

# List registered servers
claude-flow-novice mcp list

# Test server connectivity
claude-flow-novice mcp test-connection --server claude-flow

# Check server health
claude-flow-novice mcp health-check
```

**Solutions:**

#### 1. Start MCP Server
```bash
# Start the main MCP server
npm run mcp:start

# Or start via npx
npx claude-flow-novice mcp start

# Check if server is running
ps aux | grep mcp-server
```

#### 2. Fix Connection Configuration
```bash
# Verify MCP configuration
claude-flow-novice mcp config show

# Reconfigure server
claude-flow-novice mcp config set --server claude-flow --port 3001

# Reset MCP configuration
claude-flow-novice mcp config reset
```

#### 3. Check Port Conflicts
```bash
# Check what's using the port
netstat -an | grep 3001
lsof -i :3001

# Use different port
claude-flow-novice mcp config set --port 3002
```

### Error: `Connection timeout`

**Causes:**
- Network latency
- Server overload
- Firewall blocking connection

**Solutions:**
```bash
# Increase timeout
claude-flow-novice config set mcp.timeout 30000

# Test with longer timeout
claude-flow-novice mcp test --timeout 60000

# Check firewall settings
# Windows: Windows Defender Firewall
# macOS: System Preferences > Security & Privacy > Firewall
# Linux: ufw status or iptables -L
```

### Error: `Server not responding`

**Diagnostic Steps:**
```bash
# Check server logs
claude-flow-novice mcp logs --server claude-flow

# Monitor server health
claude-flow-novice mcp monitor --real-time

# Check server process
ps aux | grep "mcp-server\|claude-flow"
```

**Recovery Steps:**
```bash
# Restart MCP server
claude-flow-novice mcp restart

# Force restart if needed
claude-flow-novice mcp restart --force

# Reinitialize server
claude-flow-novice mcp init --fresh
```

## Server Registration Problems

### Error: `Failed to register MCP server`

**Check Registration Status:**
```bash
# List all MCP servers
claude mcp list

# Check specific server
claude mcp info claude-flow

# Verify installation
which claude-flow-novice
npm list -g claude-flow-novice
```

**Manual Registration:**
```bash
# Register claude-flow MCP server
claude mcp add claude-flow npx claude-flow-novice@latest mcp start

# Register with custom config
claude mcp add claude-flow npx claude-flow-novice@latest mcp start --config /path/to/config.json

# Verify registration
claude mcp list | grep claude-flow
```

### Error: `Server already registered`

**Solutions:**
```bash
# Remove existing registration
claude mcp remove claude-flow

# Re-register with new configuration
claude mcp add claude-flow npx claude-flow-novice@latest mcp start

# Update existing registration
claude mcp update claude-flow --command "npx claude-flow-novice@latest mcp start"
```

### Error: `Invalid server configuration`

**Validate Configuration:**
```bash
# Check server configuration file
cat ~/.config/claude/mcp_servers.json

# Validate JSON syntax
python -m json.tool ~/.config/claude/mcp_servers.json

# Reset to defaults
claude mcp reset
```

**Fix Common Configuration Issues:**
```json
{
  "mcpServers": {
    "claude-flow": {
      "command": "npx",
      "args": ["claude-flow-novice@latest", "mcp", "start"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Tool Invocation Failures

### Error: `Tool not found: mcp__claude-flow__*`

**Verify Tool Availability:**
```bash
# List available MCP tools
claude-flow-novice mcp tools list

# Check specific tool
claude-flow-novice mcp tools info swarm_init

# Refresh tool registry
claude-flow-novice mcp tools refresh
```

**Common Missing Tools:**
```bash
# Core swarm tools
mcp__claude-flow__swarm_init
mcp__claude-flow__agent_spawn
mcp__claude-flow__task_orchestrate

# Check if server provides these tools
claude-flow-novice mcp server-info --tools
```

### Error: `Tool execution failed`

**Diagnostic Information:**
```bash
# Enable tool debugging
DEBUG=mcp:tools claude-flow-novice mcp test-tool swarm_init

# Check tool parameters
claude-flow-novice mcp tools describe swarm_init

# Test with minimal parameters
claude-flow-novice mcp invoke swarm_init --topology mesh
```

**Parameter Validation Issues:**
```bash
# Check required parameters
claude-flow-novice mcp tools schema swarm_init

# Validate parameter format
claude-flow-novice mcp validate-params swarm_init '{"topology": "mesh"}'

# Use parameter templates
claude-flow-novice mcp template swarm_init > params.json
```

### Error: `Tool timeout`

**Solutions:**
```bash
# Increase tool timeout
claude-flow-novice config set mcp.toolTimeout 60000

# Use async mode for long operations
claude-flow-novice mcp invoke --async task_orchestrate

# Monitor tool execution
claude-flow-novice mcp monitor-tool task_orchestrate
```

## Resource Access Issues

### Error: `Resource not found`

**List Available Resources:**
```bash
# List all MCP resources
claude-flow-novice mcp resources list

# Check specific resource
claude-flow-novice mcp resources info swarm-config

# Refresh resource cache
claude-flow-novice mcp resources refresh
```

**Resource Permission Issues:**
```bash
# Check resource permissions
claude-flow-novice mcp resources permissions

# Grant access to resource
claude-flow-novice mcp resources grant --resource swarm-config

# Check file system permissions
ls -la ~/.claude-flow/resources/
```

### Error: `Resource read failed`

**Diagnostic Steps:**
```bash
# Test resource accessibility
claude-flow-novice mcp resources test swarm-config

# Check resource format
file ~/.claude-flow/resources/swarm-config.json

# Validate resource content
claude-flow-novice mcp resources validate swarm-config
```

**Recovery Actions:**
```bash
# Recreate corrupted resource
claude-flow-novice mcp resources create swarm-config --template

# Restore from backup
claude-flow-novice mcp resources restore swarm-config

# Reset resource cache
claude-flow-novice mcp resources clear-cache
```

## Performance and Timeout Issues

### Slow MCP Operations

**Performance Monitoring:**
```bash
# Monitor MCP performance
claude-flow-novice mcp monitor --performance

# Profile tool execution
claude-flow-novice mcp profile swarm_init

# Check server metrics
claude-flow-novice mcp metrics --server claude-flow
```

**Optimization Strategies:**

#### 1. Connection Pooling
```bash
# Enable connection pooling
claude-flow-novice config set mcp.connectionPool.enabled true
claude-flow-novice config set mcp.connectionPool.maxConnections 10
```

#### 2. Caching
```bash
# Enable response caching
claude-flow-novice config set mcp.cache.enabled true
claude-flow-novice config set mcp.cache.ttl 300

# Clear cache if issues persist
claude-flow-novice mcp cache clear
```

#### 3. Batch Operations
```bash
# Use batch mode for multiple operations
claude-flow-novice mcp batch --operations batch-ops.json

# Process in parallel
claude-flow-novice mcp parallel --max-concurrent 3
```

### Memory Issues with MCP

**Monitor Memory Usage:**
```bash
# Check MCP server memory usage
claude-flow-novice mcp status --memory

# Monitor real-time usage
watch -n 5 "claude-flow-novice mcp status --memory"
```

**Memory Optimization:**
```bash
# Increase Node.js memory limit for MCP server
export NODE_OPTIONS="--max-old-space-size=4096"
claude-flow-novice mcp restart

# Enable garbage collection
claude-flow-novice config set mcp.gc.enabled true

# Reduce cache size
claude-flow-novice config set mcp.cache.maxSize 100
```

## Authentication and Security

### Error: `Authentication failed`

**Check Authentication Status:**
```bash
# Check current authentication
claude-flow-novice auth status

# List authenticated services
claude-flow-novice auth list

# Refresh authentication tokens
claude-flow-novice auth refresh
```

**Re-authenticate:**
```bash
# Re-authenticate with Claude
claude auth login

# Verify MCP server authentication
claude-flow-novice mcp auth-test

# Reset authentication
claude auth logout && claude auth login
```

### SSL/TLS Certificate Issues

**Certificate Validation:**
```bash
# Check certificate validity
openssl s_client -connect mcp-server:443 -verify_return_error

# Disable SSL verification (temporary)
claude-flow-novice config set mcp.ssl.verify false

# Update certificates
claude-flow-novice mcp update-certificates
```

### Permission Denied Errors

**Check File Permissions:**
```bash
# MCP configuration directory
ls -la ~/.config/claude/
chmod 755 ~/.config/claude/
chmod 644 ~/.config/claude/mcp_servers.json

# Claude Flow data directory
ls -la ~/.claude-flow/
chmod -R 755 ~/.claude-flow/
```

**Process Permissions:**
```bash
# Check if running with correct user
whoami
id

# Fix ownership if needed
sudo chown -R $USER:$USER ~/.config/claude/
sudo chown -R $USER:$USER ~/.claude-flow/
```

## Debugging MCP Operations

### Enable Debug Logging

```bash
# Enable all MCP debugging
DEBUG=mcp:* claude-flow-novice mcp test

# Enable specific debug categories
DEBUG=mcp:server claude-flow-novice mcp start
DEBUG=mcp:tools claude-flow-novice mcp invoke swarm_init
DEBUG=mcp:resources claude-flow-novice mcp resources list

# Save debug output
DEBUG=mcp:* claude-flow-novice mcp test 2> mcp-debug.log
```

### MCP Server Logs

```bash
# View server logs
claude-flow-novice mcp logs

# Follow logs in real-time
claude-flow-novice mcp logs --follow

# Filter logs by level
claude-flow-novice mcp logs --level error

# Export logs for analysis
claude-flow-novice mcp logs --export mcp-logs-$(date +%Y%m%d).log
```

### Network Debugging

```bash
# Trace network requests
claude-flow-novice mcp trace --network

# Monitor MCP protocol messages
claude-flow-novice mcp monitor --protocol

# Test with curl
curl -X POST http://localhost:3001/mcp/tools/list \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}'
```

### Advanced Debugging

```bash
# Enable Node.js inspector
node --inspect-brk $(which claude-flow-novice) mcp start

# Memory profiling
node --prof $(which claude-flow-novice) mcp test
node --prof-process isolate-*.log > profile.txt

# CPU profiling
node --cpu-prof $(which claude-flow-novice) mcp test
```

## Common MCP Integration Patterns

### Server Health Monitoring

```bash
# Continuous health monitoring
while true; do
  claude-flow-novice mcp health-check || echo "Server down at $(date)"
  sleep 60
done

# Automated restart on failure
claude-flow-novice mcp monitor --auto-restart
```

### Failover Configuration

```bash
# Configure backup server
claude mcp add claude-flow-backup npx claude-flow-novice@latest mcp start --port 3002

# Test failover
claude-flow-novice mcp test-failover
```

### Load Balancing

```bash
# Multiple server instances
claude mcp add claude-flow-1 npx claude-flow-novice@latest mcp start --port 3001
claude mcp add claude-flow-2 npx claude-flow-novice@latest mcp start --port 3002

# Configure load balancing
claude-flow-novice config set mcp.loadBalancing.enabled true
```

## MCP Server Development

### Testing Custom Tools

```bash
# Test tool implementation
claude-flow-novice mcp test-tool --local my_custom_tool

# Validate tool schema
claude-flow-novice mcp validate-schema my_custom_tool.json

# Test tool with various inputs
claude-flow-novice mcp stress-test my_custom_tool
```

### Server Performance Testing

```bash
# Load testing
claude-flow-novice mcp load-test --concurrent 10 --duration 60

# Memory leak detection
claude-flow-novice mcp test --memory-leak-detection

# Benchmark operations
claude-flow-novice mcp benchmark --operations tools,resources
```

## Error Recovery Strategies

### Graceful Degradation

```bash
# Enable fallback mode
claude-flow-novice config set mcp.fallback.enabled true

# Use local tools when MCP unavailable
claude-flow-novice config set tools.fallback local

# Cache responses for offline use
claude-flow-novice config set mcp.offline.cacheResponses true
```

### Automatic Recovery

```bash
# Enable auto-restart
claude-flow-novice config set mcp.autoRestart.enabled true
claude-flow-novice config set mcp.autoRestart.maxAttempts 3

# Configure health checks
claude-flow-novice config set mcp.healthCheck.interval 30
claude-flow-novice config set mcp.healthCheck.timeout 5
```

### Manual Recovery

```bash
# Stop all MCP operations
claude-flow-novice mcp stop-all

# Clear all caches
claude-flow-novice mcp clear-all-caches

# Reinitialize from scratch
claude-flow-novice mcp init --force --clean
```

## Integration with External Systems

### Proxy Configuration

```bash
# Configure HTTP proxy
claude-flow-novice config set mcp.proxy.http "http://proxy:8080"
claude-flow-novice config set mcp.proxy.https "https://proxy:8080"

# Configure authentication
claude-flow-novice config set mcp.proxy.auth "user:pass"

# Bypass proxy for local connections
claude-flow-novice config set mcp.proxy.bypass "localhost,127.0.0.1"
```

### Corporate Firewall Issues

```bash
# Use alternative ports
claude-flow-novice config set mcp.port 8080

# Enable HTTP instead of HTTPS
claude-flow-novice config set mcp.ssl.enabled false

# Configure custom CA certificates
claude-flow-novice config set mcp.ssl.ca /path/to/corporate-ca.pem
```

---

**Next Steps:**
- [Performance Troubleshooting](./performance-troubleshooting.md)
- [Configuration Troubleshooting](./configuration-troubleshooting.md)
- [Platform-Specific Issues](./platform-troubleshooting.md)