# Quick Start Guide (5 Minutes)

Get up and running with Claude Flow Novice in just 5 minutes. This guide covers both CLI and Claude Code MCP access methods.

## 🚀 Choose Your Path

### Path A: CLI Access (Terminal Users)
Quick setup for direct command-line usage.

### Path B: Claude Code MCP (Claude Code Users)
Seamless integration with Claude Code.

---

## 🛤️ Path A: CLI Quick Start

### Step 1: Install (30 seconds)
```bash
# Install globally (optional)
npm install -g claude-flow-novice

# Or use npx (recommended)
npx claude-flow@alpha --version
```

### Step 2: Initialize Project (1 minute)
```bash
# Create new project
mkdir my-ai-project && cd my-ai-project

# Initialize claude-flow
npx claude-flow@alpha init

# This creates:
# ├── .claude-flow/
# │   ├── config.json
# │   └── agents/
# └── package.json
```

### Step 3: Spawn Your First Agent (1 minute)
```bash
# Spawn a coder agent
npx claude-flow@alpha agents spawn coder "create a simple Express.js API"

# Monitor progress
npx claude-flow@alpha agents status
```

### Step 4: Run SPARC Workflow (2 minutes)
```bash
# Complete TDD cycle
npx claude-flow@alpha sparc tdd "user authentication system"

# This runs:
# Specification → Pseudocode → Architecture → Refinement → Completion
```

### Step 5: View Results (30 seconds)
```bash
# Check generated files
ls -la src/
cat src/app.js

# View agent logs
npx claude-flow@alpha logs show
```

**🎉 Success!** You've just run your first AI-assisted development workflow.

---

## 🛤️ Path B: Claude Code MCP Quick Start

### Step 1: Add MCP Server (1 minute)
```bash
# Add claude-flow-novice MCP server
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start

# Verify installation
claude mcp status
```

### Step 2: Initialize Coordination (1 minute)
```javascript
// In Claude Code, run this MCP command:
mcp__claude-flow__swarm_init({
  topology: "mesh",
  maxAgents: 5,
  strategy: "adaptive"
})
```

### Step 3: Spawn Agent Team (2 minutes)
```javascript
// Spawn coordinated agents via Claude Code's Task tool
Task("Backend Developer", "Create Express.js API with authentication", "coder")
Task("Test Engineer", "Write comprehensive test suite", "tester")
Task("Code Reviewer", "Review code quality and security", "reviewer")

// MCP coordination
mcp__claude-flow__task_orchestrate({
  task: "Build secure REST API",
  strategy: "parallel"
})
```

### Step 4: Monitor Progress (1 minute)
```javascript
// Real-time monitoring
mcp__claude-flow__swarm_monitor({ duration: 60, interval: 5 })

// Check agent status
mcp__claude-flow__agent_metrics({ metric: "performance" })
```

**🎉 Success!** You've coordinated multiple AI agents through Claude Code.

---

## 🎯 What Just Happened?

### CLI Path Results:
- ✅ Installed claude-flow-novice
- ✅ Created project structure
- ✅ Spawned specialized AI agent
- ✅ Ran complete SPARC TDD workflow
- ✅ Generated working code with tests

### MCP Path Results:
- ✅ Integrated with Claude Code
- ✅ Set up swarm coordination
- ✅ Spawned multiple coordinated agents
- ✅ Real-time monitoring and metrics

## 🧠 Understanding Your Results

### Generated Files (CLI)
```
my-ai-project/
├── .claude-flow/
│   ├── config.json          # Project configuration
│   ├── agents/              # Agent definitions
│   └── logs/               # Execution logs
├── src/
│   ├── app.js              # Main application
│   ├── auth/               # Authentication module
│   └── routes/             # API routes
├── tests/
│   ├── unit/               # Unit tests
│   └── integration/        # Integration tests
└── package.json            # Dependencies
```

### Agent Coordination (MCP)
- **Swarm Topology**: Mesh network for peer coordination
- **Memory Sharing**: Cross-agent knowledge exchange
- **Real-time Monitoring**: Live progress tracking
- **Quality Gates**: Automated code review

## 🎮 Interactive Features

### CLI Interactive Mode
```bash
# Start interactive wizard
npx claude-flow@alpha interactive

# Available options:
# 1. Spawn Agent
# 2. Run SPARC Workflow
# 3. Configure Project
# 4. View Logs
# 5. Exit
```

### MCP Integration Features
- **Real-time collaboration** with Claude Code
- **Seamless agent spawning** via Task tool
- **Automatic coordination** between agents
- **Live progress updates** in conversation

## 🚀 Next Steps

### Beginner Path
1. **[Core Concepts](../../core-concepts/README.md)** - Understand agents and SPARC
2. **[Beginner Tutorials](../../tutorials/beginner/README.md)** - Step-by-step learning
3. **[Basic Projects](../../examples/basic-projects/README.md)** - Hands-on practice

### Intermediate Path
1. **[Multi-Agent Workflows](../../tutorials/intermediate/README.md)** - Complex coordination
2. **[Language Guides](../../languages/README.md)** - Technology-specific patterns
3. **[Integration Patterns](../../examples/integration-patterns/README.md)** - Real-world examples

### Advanced Path
1. **[Advanced Tutorials](../../tutorials/advanced/README.md)** - Complex orchestration
2. **[Custom Agent Development](../../api-reference/README.md)** - Build your own agents
3. **[Enterprise Patterns](../../examples/use-cases/README.md)** - Production workflows

## 🛠️ Customization Options

### Configuration (CLI)
```bash
# Set default agent
npx claude-flow@alpha config set agent.default coder

# Configure SPARC preferences
npx claude-flow@alpha config set sparc.mode tdd
npx claude-flow@alpha config set sparc.coverage 90
```

### MCP Configuration
```javascript
// Enhanced swarm configuration
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  coordinator: "architect",
  maxAgents: 10,
  enableLearning: true,
  persistenceMode: "auto"
})
```

## 🆘 Quick Troubleshooting

### Common Issues
```bash
# CLI not found
npm install -g claude-flow-novice

# Permission errors
sudo npm install -g claude-flow-novice

# MCP server not responding
claude mcp restart claude-flow
```

### Getting Help
- **[Troubleshooting Guide](../../troubleshooting/README.md)**
- **[Community Discussions](../../community/discussions/README.md)**
- **[GitHub Issues](https://github.com/ruvnet/claude-flow/issues)**

## 📊 Performance Metrics

After this quick start, you should see:
- **Agent spawn time**: < 10 seconds
- **Code generation**: 50-200 lines in 2-3 minutes
- **Test coverage**: 80-90% automated
- **Quality score**: 8.5/10 with review agent

---

**Ready for more?** Choose your next adventure:
- **Learn the fundamentals**: [Core Concepts](../../core-concepts/README.md)
- **Build something real**: [Examples](../../examples/README.md)
- **Master advanced patterns**: [Advanced Tutorials](../../tutorials/advanced/README.md)