# Troubleshooting Guide

Comprehensive troubleshooting resources for resolving common issues, performance problems, and complex system challenges.

## 🎯 Quick Issue Resolution

```
                    🚨 TROUBLESHOOTING DECISION TREE

    ┌─────────────────────────────────────────────────────────────────┐
    │                    ISSUE IDENTIFICATION FLOW                    │
    └─────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ WHAT'S BROKEN?  │
                    └─────────┬───────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────┐          ┌─────▼─────┐          ┌───▼───┐
   │ AGENTS  │          │   SYSTEM  │          │ USER  │
   │ ISSUE   │          │   ISSUE   │          │ ERROR │
   └────┬────┘          └─────┬─────┘          └───┬───┘
        │                     │                    │
        ▼                     ▼                    ▼
   ┌─────────┐          ┌─────────────┐      ┌─────────────┐
   │• Stuck  │          │• MCP Failed │      │• Wrong Cmds │
   │• No Spawn│         │• Config Err │      │• Syntax Err │
   │• Memory │          │• Performance│      │• Need Help  │
   │• Timeout│          │• Network    │      │• Learning   │
   └────┬────┘          └─────┬───────┘      └─────┬───────┘
        │                     │                    │
        ▼                     ▼                    ▼
   ┌─────────┐          ┌─────────────┐      ┌─────────────┐
   │AGENT FIX│          │SYSTEM FIX   │      │USER SUPPORT │
   │WORKFLOW │          │WORKFLOW     │      │WORKFLOW     │
   └─────────┘          └─────────────┘      └─────────────┘

    🔧 EMERGENCY TRIAGE:
    ┌─────────────────────────────────────────────────────────────────┐
    │ Priority Level → First Action → Expected Resolution Time        │
    ├─────────────────────────────────────────────────────────────────┤
    │ 🚨 CRITICAL    → doctor + restart → 2-5 minutes               │
    │ ⚠️  HIGH       → logs + diagnosis → 5-15 minutes              │
    │ 📋 MEDIUM      → config check     → 10-30 minutes             │
    │ 💡 LOW         → docs + community → 30+ minutes               │
    └─────────────────────────────────────────────────────────────────┘
```

### Most Common Issues
1. **[Agent not responding](#agent-not-responding)** - Agent stuck or unresponsive
2. **[MCP connection failed](#mcp-connection-failed)** - Claude Code integration issues
3. **[SPARC workflow stuck](#sparc-workflow-stuck)** - Workflow not progressing
4. **[Configuration errors](#configuration-errors)** - Invalid or missing config
5. **[Performance degradation](#performance-degradation)** - Slow response times

### Emergency Commands
```bash
# Quick health check
npx claude-flow@alpha doctor

# Restart all agents
npx claude-flow@alpha agents restart --all

# Reset configuration
npx claude-flow@alpha config reset

# Clear cache and rebuild
npx claude-flow@alpha cache clear && npx claude-flow@alpha cache rebuild
```

## 📚 Troubleshooting Categories

### [Common Issues](common-issues/README.md)
Frequent problems and their solutions for everyday usage.

### [Error Codes](error-codes/README.md)
Complete error code reference with explanations and fixes.

### [Performance Issues](performance/README.md)
System performance problems and optimization guides.

### [Debugging](debugging/README.md)
Advanced debugging techniques and diagnostic tools.

---

## 🚨 Agent Issues

```
                        🤖 AGENT DIAGNOSTIC FLOWCHART

    ┌─────────────────────────────────────────────────────────────────┐
    │                    AGENT ISSUE DIAGNOSIS                        │
    └─────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ AGENT PROBLEMS? │
                    └─────────┬───────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼────┐          ┌─────▼─────┐          ┌───▼───┐
   │ STUCK/  │          │  SPAWN    │          │MEMORY │
   │ TIMEOUT │          │ FAILURE   │          │ISSUES │
   └────┬────┘          └─────┬─────┘          └───┬───┘
        │                     │                    │
        ▼                     ▼                    ▼
   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
   │1. Check Status│     │1. Resources │     │1. Memory Use│
   │   agents status│    │   doctor    │     │   memory usage│
   │                │    │   check-res │     │             │
   │2. View Logs   │     │             │     │2. Clean Up  │
   │   logs <id>   │     │2. Config    │     │   cleanup   │
   │               │     │   maxConcur │     │   --older   │
   │3. Resources   │     │             │     │             │
   │   doctor      │     │3. Cache     │     │3. Increase  │
   │   --resources │     │   clear-cache│    │   limits    │
   └─────┬─────────┘     └─────┬───────┘     └─────┬───────┘
         │                     │                   │
         ▼                     ▼                   ▼
   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
   │RESTART FLOW │      │RESOURCE FIX │      │MEMORY FIX   │
   │             │      │             │      │             │
   │1. restart   │      │1. Reduce    │      │1. rebuild   │
   │   <agent-id>│      │   concurrent│      │   indexes   │
   │             │      │             │      │             │
   │2. timeout   │      │2. Clear     │      │2. Export    │
   │   increase  │      │   cache     │      │   important │
   │             │      │             │      │             │
   │3. force     │      │3. Reset     │      │3. Fresh    │
   │   stop+spawn│      │   agents    │      │   start     │
   └─────────────┘      └─────────────┘      └─────────────┘

    ⚡ QUICK RECOVERY COMMANDS:
    ┌─────────────────────────────────────────────────────────────────┐
    │ Symptom              → Command                → Success Rate     │
    ├─────────────────────────────────────────────────────────────────┤
    │ Agent not responding → agents restart --all   → 85%              │
    │ Can't spawn agents   → doctor + cache clear   → 90%              │
    │ Memory errors        → memory cleanup         → 80%              │
    │ All broken           → reset --soft           → 95%              │
    └─────────────────────────────────────────────────────────────────┘
```

### Agent Not Responding

**Symptoms:**
- Agent shows "Working" status but no progress
- Task appears stuck at same percentage
- No file changes or outputs generated

**Diagnostic Steps:**
```bash
# Check agent status
npx claude-flow@alpha agents status

# View agent logs
npx claude-flow@alpha agents logs <agent-id>

# Check system resources
npx claude-flow@alpha doctor --check-resources
```

**Solutions:**
```bash
# Method 1: Restart specific agent
npx claude-flow@alpha agents restart <agent-id>

# Method 2: Increase timeout
npx claude-flow@alpha config set agents.timeout 600

# Method 3: Check network connectivity
npx claude-flow@alpha doctor --check-network

# Method 4: Force stop and respawn
npx claude-flow@alpha agents stop <agent-id> --force
npx claude-flow@alpha agents spawn <type> "<task>"
```

### Agent Spawning Failures

**Symptoms:**
- "Failed to spawn agent" error messages
- Agent creation timeout
- Resource allocation errors

**Solutions:**
```bash
# Check available resources
npx claude-flow@alpha doctor --check-resources

# Reduce concurrent agents
npx claude-flow@alpha config set agents.maxConcurrent 3

# Clear agent cache
npx claude-flow@alpha agents clear-cache

# Reset agent system
npx claude-flow@alpha agents reset
```

### Agent Memory Issues

**Symptoms:**
- Agent forgets previous context
- Inconsistent behavior across sessions
- Memory allocation errors

**Solutions:**
```bash
# Check memory usage
npx claude-flow@alpha memory usage

# Clean up old memories
npx claude-flow@alpha memory cleanup --older-than 7d

# Increase memory limits
npx claude-flow@alpha config set memory.maxSize 1GB

# Rebuild memory indexes
npx claude-flow@alpha memory rebuild-indexes
```

---

## 🔌 MCP Integration Issues

### MCP Connection Failed

**Symptoms:**
- "MCP server not responding" errors
- Claude Code can't access claude-flow-novice tools
- Connection timeout messages

**Diagnostic Steps:**
```bash
# Check MCP server status
claude mcp status claude-flow

# Test MCP connection
claude mcp test claude-flow

# View MCP logs
claude mcp logs claude-flow
```

**Solutions:**
```bash
# Method 1: Restart MCP server
claude mcp restart claude-flow

# Method 2: Reinstall MCP server
claude mcp remove claude-flow
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start

# Method 3: Check Node.js version
node --version  # Should be 18+

# Method 4: Clear MCP cache
rm -rf ~/.claude/mcp-cache
```

### MCP Tools Not Available

**Symptoms:**
- `mcp__claude-flow__*` commands not recognized
- "Tool not found" errors in Claude Code
- Incomplete tool list

**Solutions:**
```bash
# Verify MCP installation
npx claude-flow@alpha --version

# Update to latest version
npm update -g claude-flow-novice

# Re-register MCP server
claude mcp remove claude-flow
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start

# Check tool availability
claude mcp tools claude-flow
```

---

## 🔄 SPARC Workflow Issues

### SPARC Workflow Stuck

**Symptoms:**
- Workflow progress stops at specific phase
- "Phase timeout" error messages
- Incomplete deliverables

**Diagnostic Steps:**
```bash
# Check SPARC status
npx claude-flow@alpha sparc status

# View SPARC logs
npx claude-flow@alpha sparc logs

# Check agent assignments
npx claude-flow@alpha sparc agents
```

**Solutions:**
```bash
# Method 1: Resume from last checkpoint
npx claude-flow@alpha sparc resume

# Method 2: Skip to next phase
npx claude-flow@alpha sparc skip-phase --confirm

# Method 3: Restart specific phase
npx claude-flow@alpha sparc restart-phase architecture

# Method 4: Reset and start over
npx claude-flow@alpha sparc reset
npx claude-flow@alpha sparc tdd "<feature>"
```

### Phase-Specific Issues

#### Specification Phase Problems
```bash
# Increase analysis timeout
npx claude-flow@alpha config set sparc.specification.timeout 600

# Use more detailed prompts
npx claude-flow@alpha sparc run specification \
  --detailed-requirements true \
  "detailed user authentication system with OAuth2 support"
```

#### Refinement Phase Problems
```bash
# Check test framework availability
npm list jest

# Ensure testing dependencies
npx claude-flow@alpha sparc run refinement \
  --ensure-test-deps true \
  "implement authentication with comprehensive testing"
```

---

## ⚙️ Configuration Issues

### Configuration Errors

**Symptoms:**
- "Invalid configuration" error messages
- Commands fail with config-related errors
- Unexpected behavior with settings

**Diagnostic Steps:**
```bash
# Validate configuration
npx claude-flow@alpha config validate

# Show current configuration
npx claude-flow@alpha config show

# Check for config file existence
ls -la .claude-flow/config.json
```

**Solutions:**
```bash
# Method 1: Reset to defaults
npx claude-flow@alpha config reset

# Method 2: Regenerate configuration
npx claude-flow@alpha config init --force

# Method 3: Manual config repair
npx claude-flow@alpha config repair

# Method 4: Use configuration wizard
npx claude-flow@alpha config wizard
```

### Environment Variable Issues

**Symptoms:**
- API authentication failures
- Missing environment-specific settings
- Inconsistent behavior across environments

**Solutions:**
```bash
# Check environment variables
npx claude-flow@alpha config env-check

# Set required variables
export CLAUDE_FLOW_API_KEY="your-key"
export CLAUDE_FLOW_MODEL="claude-3.5-sonnet"

# Use .env file
echo "CLAUDE_FLOW_API_KEY=your-key" > .env
echo "CLAUDE_FLOW_MODEL=claude-3.5-sonnet" >> .env
```

---

## 📈 Performance Issues

### System Performance Degradation

**Symptoms:**
- Slow agent response times
- High memory usage
- Increased command execution time

**Diagnostic Steps:**
```bash
# Performance health check
npx claude-flow@alpha doctor --performance

# Check resource usage
npx claude-flow@alpha monitor --metrics

# Analyze bottlenecks
npx claude-flow@alpha performance analyze
```

**Solutions:**
```bash
# Method 1: Optimize configuration
npx claude-flow@alpha optimize --auto-tune

# Method 2: Reduce concurrent operations
npx claude-flow@alpha config set agents.maxConcurrent 2
npx claude-flow@alpha config set sparc.parallelPhases false

# Method 3: Clear caches
npx claude-flow@alpha cache clear
npx claude-flow@alpha memory cleanup

# Method 4: Increase resource limits
npx claude-flow@alpha config set system.memoryLimit 2GB
npx claude-flow@alpha config set agents.timeout 300
```

### Network Connectivity Issues

**Symptoms:**
- "Network timeout" errors
- Slow API responses
- Connection refused messages

**Solutions:**
```bash
# Test network connectivity
npx claude-flow@alpha doctor --check-network

# Configure proxy if needed
npx claude-flow@alpha config set network.proxy "http://proxy:port"

# Increase network timeouts
npx claude-flow@alpha config set network.timeout 30000

# Use different API endpoint
npx claude-flow@alpha config set api.endpoint "alternative-endpoint"
```

---

## 🔧 System Issues

### Installation Problems

**Symptoms:**
- "Command not found" errors
- Permission denied errors
- Incomplete installation

**Solutions:**
```bash
# Reinstall globally
npm uninstall -g claude-flow-novice
npm install -g claude-flow-novice

# Fix permissions (macOS/Linux)
sudo chown -R $(whoami) ~/.npm

# Use npx instead of global install
npx claude-flow@alpha --version

# Check Node.js version
node --version  # Should be 18+
```

### Dependency Issues

**Symptoms:**
- Missing dependency errors
- Version conflict warnings
- Module not found errors

**Solutions:**
```bash
# Update dependencies
npm update

# Clear npm cache
npm cache clean --force

# Reinstall node_modules
rm -rf node_modules package-lock.json
npm install

# Check for peer dependency issues
npm list --depth=0
```

---

## 🔍 Advanced Debugging

### Enable Debug Mode

```bash
# Enable comprehensive debugging
DEBUG=claude-flow:* npx claude-flow@alpha <command>

# Enable specific component debugging
DEBUG=claude-flow:agents npx claude-flow@alpha agents spawn coder "test"
DEBUG=claude-flow:sparc npx claude-flow@alpha sparc tdd "test feature"
DEBUG=claude-flow:memory npx claude-flow@alpha memory get "test"
```

### Verbose Logging

```bash
# Enable verbose output for any command
npx claude-flow@alpha --verbose <command>

# Enable trace-level logging
npx claude-flow@alpha --trace <command>

# Save debug output to file
npx claude-flow@alpha --verbose agents spawn coder "test" 2>&1 | tee debug.log
```

### Log Analysis

```bash
# View system logs
npx claude-flow@alpha logs show

# Filter logs by level
npx claude-flow@alpha logs show --level error

# Export logs for analysis
npx claude-flow@alpha logs export --format json --output logs.json

# Real-time log monitoring
npx claude-flow@alpha logs tail --follow
```

---

## 🚨 Emergency Recovery

### System Reset Procedures

```bash
# Level 1: Soft reset (preserve data)
npx claude-flow@alpha reset --soft

# Level 2: Configuration reset
npx claude-flow@alpha config reset
npx claude-flow@alpha cache clear

# Level 3: Complete reset (lose all data)
npx claude-flow@alpha reset --hard --confirm

# Level 4: Reinstallation
npm uninstall -g claude-flow-novice
rm -rf ~/.claude-flow
npm install -g claude-flow-novice
npx claude-flow@alpha init
```

### Data Recovery

```bash
# Recover from backup
npx claude-flow@alpha recovery restore --backup latest

# Export important data before reset
npx claude-flow@alpha memory export --output backup-memory.json
npx claude-flow@alpha config export --output backup-config.json

# Import after recovery
npx claude-flow@alpha memory import backup-memory.json
npx claude-flow@alpha config import backup-config.json
```

---

## 📞 Getting Help

### Self-Help Resources
1. **Health Check**: Run `npx claude-flow@alpha doctor` first
2. **Documentation**: Use `npx claude-flow@alpha docs` for guides
3. **Examples**: Check `npx claude-flow@alpha examples`
4. **Community**: Visit [Community Discussions](../community/discussions/README.md)

### Reporting Issues
When reporting issues, include:
```bash
# Generate diagnostic report
npx claude-flow@alpha doctor --export diagnostic.json

# Include system information
npx claude-flow@alpha --version --detailed

# Capture recent logs
npx claude-flow@alpha logs export --since "1 hour ago" --output recent-logs.txt
```

### Expert Support
For complex issues:
- **Performance problems**: [Performance Guide](performance/README.md)
- **Enterprise issues**: [Enterprise Support](../community/README.md)
- **Custom agent problems**: [Agent Development Guide](../api-reference/README.md)

---

## 📚 Detailed Troubleshooting Guides

### By Category
- **[Common Issues](common-issues/README.md)** - Frequent problems and quick fixes
- **[Error Codes](error-codes/README.md)** - Complete error reference
- **[Performance](performance/README.md)** - Performance optimization guide
- **[Debugging](debugging/README.md)** - Advanced debugging techniques

### By User Level
- **Novice**: Start with [Common Issues](common-issues/README.md)
- **Intermediate**: Check [Performance Guide](performance/README.md)
- **Expert**: Use [Advanced Debugging](debugging/README.md)

---

**Quick tip:** Most issues can be resolved with `npx claude-flow@alpha doctor` followed by the suggested fixes. When in doubt, restart with `npx claude-flow@alpha agents restart --all`.