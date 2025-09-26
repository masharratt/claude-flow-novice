# Claude Code MCP Setup Guide

**Complete step-by-step setup** for integrating Claude Flow Novice with Claude Code via MCP (Model Context Protocol). Get up and running in under 5 minutes!

## 🎯 What You'll Accomplish

By the end of this guide, you'll have:
- ✅ Claude Flow Novice MCP server installed and running
- ✅ Seamless integration with Claude Code
- ✅ Access to 50+ MCP tools for AI orchestration
- ✅ Ability to spawn and coordinate AI agents from Claude Code

## 📋 Prerequisites

### Required:
- **Claude Code** installed and working
- **Node.js 18+** (check with `node --version`)
- **Internet connection** for package downloads

### Recommended:
- **Git** for version control integration
- **Basic terminal familiarity** for troubleshooting

## 🚀 Step 1: Install the MCP Server

### Option A: Direct Installation (Recommended)

```bash
# Add Claude Flow Novice MCP server to Claude Code
claude mcp add claude-flow-novice npx claude-flow-novice@latest mcp start

# Expected output:
✅ MCP server 'claude-flow-novice' added successfully
🔧 Server configured with 50+ tools
🚀 Starting MCP server...
✅ MCP server started on port 3001
```

### Option B: Global Installation First

```bash
# Install globally first (optional)
npm install -g claude-flow-novice

# Then add to Claude Code
claude mcp add claude-flow-novice claude-flow-novice mcp start
```

### Option C: Using Local Installation

```bash
# In your project directory
npm install claude-flow-novice

# Add to Claude Code with local path
claude mcp add claude-flow-novice ./node_modules/.bin/claude-flow-novice mcp start
```

## 🔍 Step 2: Verify Installation

### Check MCP Server Status

```bash
# Verify the server is running
claude mcp status

# Expected output:
📊 MCP Server Status:
┌─────────────────────┬──────────┬──────────┬─────────────┐
│ Name                │ Status   │ Port     │ Tools       │
├─────────────────────┼──────────┼──────────┼─────────────┤
│ claude-flow-novice  │ Running  │ 3001     │ 52 active   │
└─────────────────────┴──────────┴──────────┴─────────────┘
```

### List Available Tools

```bash
# See what MCP tools are available
claude mcp tools claude-flow-novice

# Should show tools like:
Tools Available (52 total):
├── mcp__claude-flow__swarm_init
├── mcp__claude-flow__agent_spawn
├── mcp__claude-flow__task_orchestrate
├── mcp__claude-flow__github_analyze
└── [48 more tools...]
```

## 🧪 Step 3: Test Basic Functionality

### Test 1: Simple Health Check

Open Claude Code and try this command:

```
Use the claude-flow-novice MCP tools to check system health
```

**Expected response:**
Claude Code will use the MCP tools to check the system and report:
- ✅ MCP server connectivity
- ✅ Tool availability
- ✅ Basic functionality
- 🎉 Ready for agent orchestration!

### Test 2: Initialize a Simple Swarm

In Claude Code, ask:

```
Initialize a mesh swarm with 3 agents using the MCP tools
```

**Expected behavior:**
- Claude Code calls `mcp__claude-flow__swarm_init`
- Creates a mesh topology with 3 agent slots
- Reports swarm ID and status
- Shows available agent types

### Test 3: Spawn Your First Agent

In Claude Code, try:

```
Spawn a coder agent to create a simple JavaScript function that adds two numbers
```

**Expected workflow:**
1. Claude Code uses MCP coordination tools
2. Spawns actual agents via Claude Code's Task tool
3. Agent creates the function
4. Shows results and saves output

## ⚙️ Step 4: Configuration Options

### Basic Configuration

Create a `.claude-flow` directory in your project:

```bash
# Create configuration directory
mkdir .claude-flow

# Create basic config file
cat > .claude-flow/config.json << 'EOF'
{
  "mcp": {
    "port": 3001,
    "maxAgents": 10,
    "defaultTopology": "mesh"
  },
  "agents": {
    "defaultTimeout": 300,
    "retryAttempts": 3
  },
  "coordination": {
    "enableMemory": true,
    "enableHooks": true
  }
}
EOF
```

### Advanced Configuration

```bash
# Create advanced config with all options
cat > .claude-flow/config.json << 'EOF'
{
  "mcp": {
    "port": 3001,
    "host": "localhost",
    "maxAgents": 20,
    "defaultTopology": "hierarchical",
    "enableCORS": true
  },
  "agents": {
    "defaultTimeout": 300,
    "retryAttempts": 3,
    "fallbackAgent": "general-coder",
    "enableParallel": true
  },
  "coordination": {
    "enableMemory": true,
    "enableHooks": true,
    "memoryTTL": 86400,
    "sessionPersistence": true
  },
  "sparc": {
    "defaultMode": "tdd",
    "enableValidation": true,
    "coverageThreshold": 80
  },
  "github": {
    "enableIntegration": true,
    "autoReview": false,
    "defaultReviewers": ["reviewer", "security-manager"]
  },
  "logging": {
    "level": "info",
    "enableMetrics": true,
    "exportFormat": "json"
  }
}
EOF
```

### Environment Variables

```bash
# Create .env file for sensitive configuration
cat > .env << 'EOF'
# Claude Flow Configuration
CLAUDE_FLOW_PORT=3001
CLAUDE_FLOW_MAX_AGENTS=10

# GitHub Integration (optional)
GITHUB_TOKEN=your_token_here
GITHUB_WEBHOOK_SECRET=your_secret

# Performance Settings
CLAUDE_FLOW_MEMORY_LIMIT=512MB
CLAUDE_FLOW_TIMEOUT=300

# Logging
CLAUDE_FLOW_LOG_LEVEL=info
CLAUDE_FLOW_METRICS=true
EOF
```

## 🔧 Step 5: Test Advanced Features

### Multi-Agent Coordination

In Claude Code, try:

```
Use MCP tools to set up a hierarchical swarm with a coordinator and 4 specialized agents (coder, tester, reviewer, documenter). Then orchestrate them to build a simple todo application.
```

**Expected workflow:**
1. MCP tools initialize hierarchical topology
2. Coordinator agent is established
3. Specialized agents are spawned via Task tool
4. Task is broken down and distributed
5. Real-time coordination and progress updates

### GitHub Integration Test

```
Use the GitHub MCP tools to analyze this repository and suggest improvements
```

**Should demonstrate:**
- Repository analysis via MCP tools
- Code quality assessment
- Security vulnerability scanning
- Performance optimization suggestions

### SPARC Methodology Test

```
Run a complete SPARC workflow using MCP coordination to build a user authentication system
```

**Expected phases:**
1. **Specification**: Requirements analysis
2. **Pseudocode**: Algorithm design
3. **Architecture**: System design
4. **Refinement**: TDD implementation
5. **Completion**: Integration testing

## 📊 Step 6: Monitor and Validate

### Performance Monitoring

```bash
# Check MCP server performance
claude mcp stats claude-flow-novice

# Expected metrics:
📈 Performance Metrics:
├── Uptime: 2h 15m 32s
├── Requests handled: 247
├── Average response time: 1.2s
├── Active agents: 3
├── Memory usage: 128MB
└── Error rate: 0.0%
```

### Log Monitoring

```bash
# View MCP server logs
claude mcp logs claude-flow-novice --tail 50

# Check for successful operations:
[INFO] MCP server started on port 3001
[INFO] Tool mcp__claude-flow__swarm_init registered
[INFO] Agent coder-001 spawned successfully
[INFO] Task orchestration completed
```

## 🛠️ Step 7: Optional Enhancements

### Enhanced Coordination (Optional)

```bash
# Add ruv-swarm for advanced coordination
claude mcp add ruv-swarm npx ruv-swarm mcp start

# Verify both servers
claude mcp status
```

### Cloud Features (Optional)

```bash
# Add flow-nexus for cloud capabilities (requires registration)
claude mcp add flow-nexus npx flow-nexus@latest mcp start

# Register for cloud features
npx flow-nexus@latest register
```

### IDE Integration (Optional)

```bash
# Setup VS Code integration
npm install -g @claude-flow/vscode-extension

# Or for other editors
claude mcp add editor-integration npx claude-flow-editor-bridge mcp start
```

## ✅ Setup Validation Checklist

Go through this checklist to ensure everything is working:

### Basic Setup ✅
- [ ] MCP server installed and running
- [ ] Claude Code can connect to MCP server
- [ ] Basic tools are available and functional
- [ ] Can spawn a simple agent successfully

### Configuration ✅
- [ ] Configuration file created and valid
- [ ] Environment variables set (if needed)
- [ ] Log files are being created
- [ ] Performance monitoring is working

### Advanced Features ✅
- [ ] Multi-agent coordination works
- [ ] SPARC workflows can be executed
- [ ] GitHub integration functions (if configured)
- [ ] Memory and hooks are operational

### Integration ✅
- [ ] Claude Code Task tool works with MCP coordination
- [ ] Agents can communicate and share context
- [ ] Real-time monitoring and updates work
- [ ] Results are properly saved and accessible

## 🎉 Success! You're Ready

Congratulations! You now have Claude Flow Novice fully integrated with Claude Code. Here's what you can do:

### Immediate Next Steps:
1. **[Try the MCP Quick Start](../quick-start/mcp-tutorial.md)** - Hands-on tutorial
2. **[Explore Usage Examples](usage-examples.md)** - Real-world scenarios
3. **[Learn Coordination Patterns](../../core-concepts/coordination/README.md)** - Advanced techniques

### Explore Capabilities:
- **Agent Orchestration**: Coordinate multiple AI specialists
- **SPARC Workflows**: Systematic development methodology
- **GitHub Integration**: Automated repository management
- **Real-time Collaboration**: Human-AI pair programming

## 🆘 Troubleshooting

### Common Issues:

**MCP Server Won't Start:**
```bash
# Check Node.js version
node --version  # Should be 18+

# Check port availability
lsof -i :3001

# Restart with different port
claude mcp add claude-flow-novice npx claude-flow-novice@latest mcp start --port 3002
```

**Tools Not Available:**
```bash
# Restart MCP server
claude mcp restart claude-flow-novice

# Check logs for errors
claude mcp logs claude-flow-novice --tail 100

# Reinstall if needed
claude mcp remove claude-flow-novice
claude mcp add claude-flow-novice npx claude-flow-novice@latest mcp start
```

**Performance Issues:**
```bash
# Increase memory limit
export CLAUDE_FLOW_MEMORY_LIMIT=1GB

# Reduce max agents
export CLAUDE_FLOW_MAX_AGENTS=5

# Enable performance monitoring
export CLAUDE_FLOW_METRICS=true
```

For more troubleshooting help, see:
- **[Installation Troubleshooting](../installation/troubleshooting.md)**
- **[MCP Specific Issues](../../troubleshooting/mcp-issues.md)**
- **[Performance Optimization](../../troubleshooting/performance.md)**

---

**🎊 Excellent! Claude Flow Novice is now seamlessly integrated with Claude Code!**

**Next:** [Try the MCP Tutorial →](../quick-start/mcp-tutorial.md)