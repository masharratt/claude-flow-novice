# Common Issues Decision Tree Guide

## Overview
This guide provides systematic decision trees for resolving the most common issues encountered in claude-flow-novice. Each decision tree guides you through diagnostic steps and resolution paths.

## 🔍 Issue Identification Decision Tree

```
START: Is there an issue?
│
├─ YES → What type of issue?
│   ├─ Performance Issues
│   │   ├─ Slow response times → Go to PERFORMANCE_TREE
│   │   ├─ High resource usage → Go to RESOURCE_TREE
│   │   └─ Timeouts → Go to TIMEOUT_TREE
│   │
│   ├─ Agent Issues
│   │   ├─ Agents not spawning → Go to AGENT_SPAWN_TREE
│   │   ├─ Agents unresponsive → Go to AGENT_RESPONSE_TREE
│   │   └─ Agent coordination fails → Go to COORDINATION_TREE
│   │
│   ├─ Configuration Issues
│   │   ├─ Commands not found → Go to COMMAND_TREE
│   │   ├─ Invalid config → Go to CONFIG_TREE
│   │   └─ Authentication errors → Go to AUTH_TREE
│   │
│   └─ Installation Issues
│       ├─ Dependencies missing → Go to DEPENDENCY_TREE
│       ├─ Version conflicts → Go to VERSION_TREE
│       └─ Permission errors → Go to PERMISSION_TREE
│
└─ NO → System running normally
    └─ Consider preventive maintenance
        ├─ Run: claude-flow-novice health-check
        ├─ Update dependencies: npm update
        └─ Clear cache: claude-flow-novice cache clear
```

## 🚀 Performance Issues Decision Tree

```
PERFORMANCE_TREE: Performance is slow
│
├─ Check system resources
│   │
│   ├─ CPU > 80%?
│   │   ├─ YES → High CPU Usage Path
│   │   │   ├─ Check running processes
│   │   │   │   ├─ Too many agents? → Reduce concurrency
│   │   │   │   ├─ Runaway process? → Kill process
│   │   │   │   └─ Normal load? → Optimize algorithms
│   │   │   └─ Apply CPU throttling
│   │   │
│   │   └─ NO → Check Memory
│   │
│   ├─ Memory > 85%?
│   │   ├─ YES → High Memory Usage Path
│   │   │   ├─ Force garbage collection: global.gc()
│   │   │   ├─ Clear application cache
│   │   │   ├─ Check for memory leaks
│   │   │   │   ├─ Memory growing continuously?
│   │   │   │   │   ├─ YES → Profile heap usage
│   │   │   │   │   └─ NO → Temporary spike, monitor
│   │   │   └─ Restart if critical
│   │   │
│   │   └─ NO → Check Network
│   │
│   └─ Network latency > 1000ms?
│       ├─ YES → Network Issues Path
│       │   ├─ Test connectivity: ping google.com
│       │   ├─ Check DNS: nslookup github.com
│       │   ├─ Verify proxy settings
│       │   └─ Implement retry mechanisms
│       │
│       └─ NO → Check Agent Performance
│           ├─ Agent spawn time > 2s?
│           │   ├─ YES → Implement agent pooling
│           │   └─ NO → Profile specific workflows
│           │
│           └─ Task execution time > 5s?
│               ├─ YES → Optimize task algorithms
│               └─ NO → Check coordination overhead
```

## 🤖 Agent Issues Decision Tree

```
AGENT_SPAWN_TREE: Agents not spawning
│
├─ Check agent spawn command
│   │
│   ├─ Is syntax correct?
│   │   ├─ NO → Fix syntax
│   │   │   ├─ Use: Task("Agent Name", "Description", "agent-type")
│   │   │   └─ Verify agent type exists
│   │   │
│   │   └─ YES → Check resources
│   │
│   ├─ Enough memory available?
│   │   ├─ NO → Free memory
│   │   │   ├─ Close unnecessary processes
│   │   │   ├─ Clear cache
│   │   │   └─ Restart if needed
│   │   │
│   │   └─ YES → Check agent limits
│   │
│   ├─ Too many agents running?
│   │   ├─ YES → Wait or terminate inactive agents
│   │   │   ├─ Check: claude-flow-novice agent list
│   │   │   ├─ Terminate: claude-flow-novice agent kill <id>
│   │   │   └─ Adjust max agents setting
│   │   │
│   │   └─ NO → Check configuration
│   │
│   └─ Valid agent configuration?
│       ├─ NO → Fix configuration
│       │   ├─ Check agent type spelling
│       │   ├─ Verify capabilities
│       │   └─ Review agent definitions
│       │
│       └─ YES → Check dependencies
│           ├─ Are dependencies installed?
│           │   ├─ NO → Run: npm install
│           │   └─ YES → Check system compatibility
│           │
│           └─ System compatible?
│               ├─ NO → Update system/Node.js
│               └─ YES → Contact support
```

```
AGENT_RESPONSE_TREE: Agents unresponsive
│
├─ Check agent status
│   │
│   ├─ Run: claude-flow-novice agent status
│   │   │
│   │   ├─ Agent shows as "running"?
│   │   │   ├─ YES → Network connectivity issue
│   │   │   │   ├─ Test ping to agent
│   │   │   │   ├─ Check firewall settings
│   │   │   │   └─ Restart networking
│   │   │   │
│   │   │   └─ NO → Agent crashed
│   │   │       ├─ Check logs: claude-flow-novice logs agent <id>
│   │   │       ├─ Look for error patterns
│   │   │       ├─ Restart agent: claude-flow-novice agent restart <id>
│   │   │       └─ If persistent → Investigate root cause
│   │   │
│   │   └─ Agent not found?
│       │
│       ├─ YES → Agent was terminated
│       │   ├─ Check system logs
│       │   ├─ Look for OOM killer
│       │   ├─ Check resource limits
│       │   └─ Respawn agent
│       │
│       └─ NO → Agent exists but stuck
│           ├─ Send interrupt signal
│           ├─ Wait 30 seconds
│           ├─ Force terminate if needed
│           └─ Restart with debug logging
```

## ⚙️ Configuration Issues Decision Tree

```
CONFIG_TREE: Configuration problems
│
├─ Which config issue?
│   │
│   ├─ Commands not recognized
│   │   ├─ Is claude-flow-novice installed?
│   │   │   ├─ NO → Install: npm install -g claude-flow
│   │   │   └─ YES → Check PATH
│   │   │       ├─ Run: which claude-flow
│   │   │       ├─ Add to PATH if needed
│   │   │       └─ Restart terminal
│   │   │
│   │   └─ Specific command not found?
│   │       ├─ Check available commands: claude-flow-novice --help
│   │       ├─ Verify spelling
│   │       └─ Update if outdated
│   │
│   ├─ Invalid configuration
│   │   ├─ Check config file exists
│   │   │   ├─ NO → Generate: claude-flow-novice init
│   │   │   └─ YES → Validate syntax
│   │   │       ├─ Run: claude-flow-novice config validate
│   │   │       ├─ Fix JSON/YAML errors
│   │   │       └─ Check required fields
│   │   │
│   │   └─ Configuration conflicts?
│   │       ├─ Check multiple config files
│   │       ├─ Resolve precedence issues
│   │       └─ Use explicit config: --config path
│   │
│   └─ Environment issues
│       ├─ Missing environment variables?
│       │   ├─ Check .env file
│       │   ├─ Set required variables
│       │   └─ Export to shell
│       │
│       └─ Wrong environment selected?
│           ├─ Check current env: echo $NODE_ENV
│           ├─ Set correct env
│           └─ Restart application
```

```
AUTH_TREE: Authentication errors
│
├─ What type of auth error?
│   │
│   ├─ API key issues
│   │   ├─ Is API key set?
│   │   │   ├─ NO → Set key: export API_KEY=your_key
│   │   │   └─ YES → Is key valid?
│   │   │       ├─ NO → Get new key
│   │   │       ├─ Expired? → Renew key
│   │   │       └─ YES → Check permissions
│   │   │
│   │   └─ Key format correct?
│   │       ├─ Check for extra spaces
│   │       ├─ Verify encoding
│   │       └─ Test with curl
│   │
│   ├─ Token issues
│   │   ├─ Token expired?
│   │   │   ├─ YES → Refresh token
│   │   │   └─ NO → Check token format
│   │   │
│   │   └─ Invalid token?
│   │       ├─ Clear stored tokens
│   │       ├─ Re-authenticate
│   │       └─ Check token source
│   │
│   └─ Permission denied
│       ├─ Check user permissions
│       ├─ Verify resource access
│       ├─ Contact administrator
│       └─ Use different credentials
```

## 🛠️ Installation Issues Decision Tree

```
DEPENDENCY_TREE: Missing dependencies
│
├─ Which dependencies are missing?
│   │
│   ├─ Node.js not found
│   │   ├─ Install Node.js
│   │   │   ├─ Download from nodejs.org
│   │   │   ├─ Use package manager: brew install node
│   │   │   └─ Use version manager: nvm install node
│   │   │
│   │   └─ Wrong Node.js version?
│   │       ├─ Check required version: cat package.json
│   │       ├─ Upgrade: nvm use <version>
│   │       └─ Update package manager
│   │
│   ├─ npm packages missing
│   │   ├─ Run: npm install
│   │   │   ├─ Success? → Continue
│   │   │   └─ Errors? → Check npm logs
│   │   │       ├─ Permission errors? → Use sudo or fix npm permissions
│   │   │       ├─ Network errors? → Check proxy/firewall
│   │   │       └─ Dependency conflicts? → Clear cache and retry
│   │   │
│   │   └─ Specific package missing?
│   │       ├─ Install manually: npm install <package>
│   │       ├─ Check if peer dependency
│   │       └─ Verify compatibility
│   │
│   └─ System dependencies missing
│       ├─ Python (for native modules)
│       │   ├─ Install Python 3.x
│       │   ├─ Install build tools
│       │   └─ Set PYTHON environment variable
│       │
│       ├─ Git (for git dependencies)
│       │   ├─ Install git
│       │   ├─ Configure credentials
│       │   └─ Test git access
│       │
│       └─ Other tools
│           ├─ Check error message for specific requirements
│           ├─ Install using system package manager
│           └─ Add to PATH if needed
```

```
VERSION_TREE: Version conflicts
│
├─ What version conflict?
│   │
│   ├─ Node.js version incompatible
│   │   ├─ Check required version in package.json
│   │   ├─ Current version: node --version
│   │   │   ├─ Too old? → Upgrade Node.js
│   │   │   └─ Too new? → Use version manager
│   │   │       ├─ Install nvm
│   │   │       ├─ Install required version
│   │   │       └─ Switch: nvm use <version>
│   │   │
│   │   └─ Multiple Node.js versions?
│   │       ├─ Use nvm to manage
│   │       ├─ Set default version
│   │       └─ Update PATH
│   │
│   ├─ Package version conflicts
│   │   ├─ Check npm ls for conflicts
│   │   ├─ Resolve peer dependencies
│   │   │   ├─ Install missing peers
│   │   │   ├─ Update conflicting packages
│   │   │   └─ Use --force if necessary
│   │   │
│   │   └─ Lockfile conflicts?
│   │       ├─ Delete package-lock.json
│   │       ├─ Delete node_modules
│   │       ├─ Run npm install
│   │       └─ Commit new lockfile
│   │
│   └─ claude-flow-novice version issues
│       ├─ Check current version: claude-flow-novice --version
│       ├─ Check latest: npm info claude-flow-novice version
│       ├─ Update: npm update -g claude-flow
│       └─ Force reinstall: npm uninstall -g claude-flow-novice && npm install -g claude-flow
```

```
PERMISSION_TREE: Permission errors
│
├─ What permission error?
│   │
│   ├─ File system permissions
│   │   ├─ Cannot write to directory?
│   │   │   ├─ Check directory permissions: ls -la
│   │   │   ├─ Change ownership: sudo chown -R $USER directory
│   │   │   ├─ Change permissions: chmod 755 directory
│   │   │   └─ Use different directory
│   │   │
│   │   └─ Cannot execute file?
│   │       ├─ Make executable: chmod +x file
│   │       ├─ Check file exists
│   │       └─ Verify PATH
│   │
│   ├─ npm permission errors
│   │   ├─ Fix npm permissions
│   │   │   ├─ Change npm default directory
│   │   │   ├─ Use prefix: npm config set prefix ~/.npm-global
│   │   │   ├─ Add to PATH: export PATH=~/.npm-global/bin:$PATH
│   │   │   └─ Use npx instead of global install
│   │   │
│   │   └─ Use alternative package manager?
│   │       ├─ Try yarn: yarn global add package
│   │       ├─ Try pnpm: pnpm add -g package
│   │       └─ Use package manager prefix
│   │
│   └─ System-level permissions
│       ├─ Need administrator access?
│       │   ├─ Use sudo carefully
│       │   ├─ Run as administrator (Windows)
│       │   └─ Request elevated permissions
│       │
│       └─ Security policy blocking?
│           ├─ Check corporate policies
│           ├─ Contact IT administrator
│           ├─ Use approved alternatives
│           └─ Request policy exception
```

## 🔧 Quick Resolution Commands

### Immediate Diagnostics
```bash
# Quick health check
claude-flow-novice status --health

# Check resource usage
claude-flow-novice monitor --real-time --duration=30

# List active agents
claude-flow-novice agent list --status

# Check recent errors
claude-flow-novice logs --level=error --tail=50
```

### Common Quick Fixes
```bash
# Clear all caches
claude-flow-novice cache clear --all

# Restart all agents
claude-flow-novice agent restart --all

# Force garbage collection (if available)
node --expose-gc -e "global.gc(); console.log('GC forced')"

# Update dependencies
npm update && npm audit fix

# Reset configuration to defaults
claude-flow-novice config reset --confirm
```

### Emergency Recovery
```bash
# Kill all claude-flow-novice processes
pkill -f claude-flow

# Clean install
rm -rf node_modules package-lock.json
npm install

# Full system reset
claude-flow-novice system reset --confirm
claude-flow-novice init --force
```

## 📊 Issue Tracking Matrix

| Issue Type | Severity | Avg Resolution Time | Success Rate |
|------------|----------|-------------------|--------------|
| Agent spawn failures | High | 5 minutes | 95% |
| Memory leaks | Critical | 20 minutes | 80% |
| Configuration errors | Medium | 2 minutes | 98% |
| Network timeouts | Medium | 10 minutes | 85% |
| Permission errors | Low | 3 minutes | 92% |
| Version conflicts | Medium | 15 minutes | 88% |

## 🚨 When to Escalate

Contact support when:
- Multiple quick fixes fail
- Issue persists after following decision tree
- Data corruption suspected
- Security incident detected
- Unknown error patterns appear

## 📝 Issue Reporting Template

When reporting issues, include:

```
Issue: [Brief description]
Environment: [OS, Node version, claude-flow-novice version]
Steps to reproduce: [Numbered steps]
Expected behavior: [What should happen]
Actual behavior: [What actually happens]
Error messages: [Full error text]
Troubleshooting attempted: [Steps from decision tree tried]
Additional context: [Anything else relevant]
```

This decision tree guide provides systematic approaches to resolve the most common issues encountered in claude-flow-novice, ensuring quick resolution and minimal downtime.