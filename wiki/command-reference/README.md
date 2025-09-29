# Claude Flow CLI Command Reference

> **Complete reference for all CLI commands, organized by user skill level**

## 📚 Quick Navigation

- [**Core Commands (Novice)**](./novice-tier.md) - 5 essential commands to get started
- [**Intermediate Commands**](./intermediate-tier.md) - 10 additional commands for experienced users
- [**Expert Commands**](./expert-tier.md) - Full access to 112 MCP tools
- [**Command Syntax**](./command-syntax.md) - Complete syntax reference
- [**Common Workflows**](./workflows.md) - Practical examples and use cases
- [**Troubleshooting**](./troubleshooting.md) - Solutions to common issues
- [**Progression Guide**](./progression-guide.md) - How to unlock new commands

## 🎯 Progressive CLI System

```
                    🎯 COMMAND HIERARCHY & PROGRESSION SYSTEM

    ┌─────────────────────────────────────────────────────────────────┐
    │              3-TIER PROGRESSIVE DISCLOSURE ARCHITECTURE         │
    └─────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    USER SKILL ASSESSMENT                        │
    │                                                                 │
    │    New User → 🌱 NOVICE     Some Experience → ⚡ INTERMEDIATE    │
    │              (5 commands)                     (15 commands)     │
    │                    │                               │            │
    │    Power User → 🚀 EXPERT (112+ commands)         │            │
    │                    └───────────────┬───────────────┘            │
    └─────────────────────────────────────┼─────────────────────────────┘
                                          │
         ┌────────────────────────────────┼────────────────────────────────┐
         │                               │                               │
    ┌────▼────┐                    ┌─────▼─────┐                    ┌───▼───┐
    │🌱 NOVICE │                    │⚡INTERMEDI│                    │🚀EXPERT│
    │(5 cmds) │                    │(15 cmds)  │                    │(112+) │
    └────┬────┘                    └─────┬─────┘                    └───┬───┘
         │                               │                               │
         ▼                               ▼                               ▼
    ┌─────────┐                    ┌─────────────┐                ┌─────────────┐
    │ESSENTIAL│                    │ AGENT MGMT  │                │  MCP TOOLS  │
    │         │                    │             │                │             │
    │• init   │                    │• agents     │                │• swarm_init │
    │• build  │                    │• test       │                │• neural_*   │
    │• status │                    │• review     │                │• memory_*   │
    │• help   │                    │• deploy     │                │• github_*   │
    │• learn  │                    │• optimize   │                │• workflow_* │
    └─────────┘                    └─────────────┘                └─────────────┘

    🔄 PROGRESSION TRIGGERS:
    ┌─────────────────────────────────────────────────────────────────┐
    │ Novice → Intermediate: 10+ commands, 4+ types, 80%+ success     │
    │ Intermediate → Expert: 25+ commands, 10+ types, 85%+ success    │
    │                                                                 │
    │ Track Progress: claude-flow-novice status | claude-flow-novice learn          │
    └─────────────────────────────────────────────────────────────────┘

    💡 COMMAND FLOW PATTERN:
    ┌─────────────────────────────────────────────────────────────────┐
    │ Input → Intelligence Engine → Task Analysis → Agent Selection → │
    │   ↓         ↓                    ↓               ↓              │
    │ Natural  Project Type       Step Planning    Best Agents       │
    │Language  Detection          & Breakdown      for Task          │
    │Commands  Framework ID       Action Items     Coordination      │
    │         Optimization         Validation      Execution         │
    └─────────────────────────────────────────────────────────────────┘
```

Claude Flow uses a **3-tier progressive disclosure system** that adapts to your experience:

### 🌱 Novice Tier (5 Commands)
**Perfect for beginners** - Simple, natural language interface
- Focus on essential operations
- Intelligent defaults and guidance
- Natural language command interpretation
- Automatic agent selection

### ⚡ Intermediate Tier (15 Commands)
**For growing confidence** - Direct control with safety nets
- Agent management capabilities
- Testing and deployment commands
- Performance optimization tools
- Code review and quality analysis

### 🚀 Expert Tier (112+ Commands)
**Full power users** - Complete MCP tool access
- All claude-flow-novice MCP tools
- All ruv-swarm coordination tools
- Advanced neural network features
- Custom workflow creation

## 🔄 Command Categories

```
                        🔄 COMMAND WORKFLOW EXECUTION FLOW

    ┌─────────────────────────────────────────────────────────────────┐
    │                    COMMAND CATEGORY MATRIX                      │
    └─────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
    ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
    │   🌱 NOVICE      │ │  ⚡ INTERMEDIATE │ │   🚀 EXPERT      │
    │   COMMANDS       │ │    COMMANDS      │ │    COMMANDS      │
    └─────────┬────────┘ └─────────┬────────┘ └─────────┬────────┘
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │ CORE DEV (5)    │  │ AGENT MGMT (8)  │  │ MCP TOOLS (112+)│
    │                 │  │                 │  │                 │
    │ • init         │  │ • agents        │  │ • swarm_*       │
    │ • build        │  │ • test          │  │ • neural_*      │
    │ • status       │  │ • review        │  │ • memory_*      │
    │ • help         │  │ • deploy        │  │ • github_*      │
    │ • learn        │  │ • optimize      │  │ • workflow_*    │
    │                 │  │ • validate      │  │ • daa_*         │
    │                 │  │ • monitor       │  │ • enterprise_*  │
    │                 │  │ • debug         │  │ • custom_*      │
    └─────────────────┘  └─────────────────┘  └─────────────────┘
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │              COMMAND EXECUTION PIPELINE                         │
    │                                                                 │
    │  Input → Parse → Validate → Analyze → Select Agents → Execute  │
    │    ↓      ↓        ↓         ↓          ↓             ↓        │
    │ Natural  Intent   Tier      Task      Best Fit     Parallel     │
    │Language  Extract  Check     Break     Agents       Execution    │
    │ or CLI   Syntax   Auth      Plan      Coordinate   Monitor      │
    │         Correct   Guard     Optimize  Configure    Report       │
    └─────────────────────────────────────────────────────────────────┘

    🎯 COMMAND PATTERNS:
    ┌─────────────────────────────────────────────────────────────────┐
    │ PROJECT LIFECYCLE:                                              │
    │ init → build → test → review → deploy → optimize → monitor     │
    │                                                                 │
    │ AGENT COORDINATION:                                             │
    │ agents spawn → swarm init → task orchestrate → status check    │
    │                                                                 │
    │ LEARNING PROGRESSION:                                           │
    │ help → learn → status → unlock → advanced → expert             │
    └─────────────────────────────────────────────────────────────────┘
```

### Core Development
```bash
# Project Management
claude-flow-novice init              # Initialize projects
claude-flow-novice build            # Build features with AI
claude-flow-novice status           # Check project status

# Learning & Help
claude-flow-novice help             # Get contextual help
claude-flow-novice learn            # Unlock new features
```

### Intermediate Features
```bash
# Agent Management
claude-flow-novice agents           # Direct agent control
claude-flow-novice test            # AI-powered testing
claude-flow-novice review          # Code quality analysis

# Deployment & Optimization
claude-flow-novice deploy          # Intelligent deployment
claude-flow-novice optimize        # Performance tuning
```

### Expert Features
```bash
# MCP Tool Integration
claude-flow-novice mcp             # Access all MCP tools
claude-flow-novice swarm           # Advanced swarm management
claude-flow-novice neural          # Neural network operations

# Advanced Workflows
claude-flow-novice workflow        # Custom workflow creation
claude-flow-novice enterprise      # Enterprise features
```

## 🚀 Getting Started

### First Time Setup
```bash
# Install Claude Flow
npm install -g claude-flow@alpha

# Add MCP servers
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start

# Initialize your first project
claude-flow-novice init

# Start building
claude-flow-novice build "create a todo app"
```

### Natural Language Interface
Claude Flow understands natural language - describe what you want:

```bash
# These all work!
claude-flow-novice build "add user authentication"
claude-flow-novice "create a REST API with JWT"
claude-flow-novice "setup testing for my React app"
claude-flow-novice "optimize my database queries"
```

## 📊 Tier Progression

**Automatic Upgrades Based on Usage:**

- **Novice → Intermediate**: Use 10+ commands, try 4+ different commands, 80%+ success rate
- **Intermediate → Expert**: Use 25+ commands, try 10+ different commands, 85%+ success rate

**Track Your Progress:**
```bash
claude-flow-novice status          # See current tier and progress
claude-flow-novice learn           # View progression dashboard
```

## 🎯 Key Features

### Intelligence Engine
- **Project Detection**: Automatically detects your project type and framework
- **Task Analysis**: Breaks down complex requests into actionable steps
- **Agent Recommendation**: Selects the best AI agents for each task
- **Workflow Optimization**: Optimizes execution for speed and quality

### Progressive Disclosure
- **Guided Learning**: System teaches you new commands as you progress
- **Contextual Help**: Help that adapts to your current tier and project
- **Smart Defaults**: Intelligent defaults that work for most scenarios
- **Safety Nets**: Protection against common mistakes

### Performance Optimization
- **Parallel Execution**: Multiple agents work simultaneously
- **Caching**: Smart caching of repeated operations
- **Resource Management**: Efficient use of system resources
- **Real-time Monitoring**: Live feedback on command execution

## 🔗 Integration Points

### MCP Server Integration
```bash
# Claude Flow MCP (Required)
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start

# RUV Swarm MCP (Enhanced coordination)
claude mcp add ruv-swarm npx ruv-swarm mcp start

# Flow Nexus MCP (Cloud features - optional)
claude mcp add flow-nexus npx flow-nexus@latest mcp start
```

### IDE Integration
- **VS Code Extension**: Native integration with development environment
- **Command Palette**: Quick access to all commands
- **Status Bar**: Real-time project status
- **Intelligent Suggestions**: Context-aware command recommendations

## 📈 Performance Metrics

**Proven Results:**
- 🎯 **84.8%** SWE-Bench solve rate
- ⚡ **2.8-4.4x** speed improvement over manual development
- 🧠 **32.3%** token reduction through intelligent optimization
- 🤖 **27+** specialized neural models for different domains

## 🆘 Quick Help

```bash
# Get help anytime
claude-flow-novice help                    # General help
claude-flow-novice help <command>          # Command-specific help
claude-flow-novice help --interactive      # Interactive help system
claude-flow-novice help --examples         # See practical examples

# Check what you can do
claude-flow-novice status                  # Current capabilities
claude-flow-novice learn                   # Learning dashboard

# Emergency help
claude-flow-novice "I need help with..."   # Natural language help
```

## 📖 Documentation Structure

This command reference is organized for progressive learning:

1. **[Novice Tier](./novice-tier.md)** - Start here if you're new
2. **[Intermediate Tier](./intermediate-tier.md)** - Advanced features
3. **[Expert Tier](./expert-tier.md)** - Full power access
4. **[Syntax Reference](./command-syntax.md)** - Complete technical reference
5. **[Workflows](./workflows.md)** - Real-world examples
6. **[Troubleshooting](./troubleshooting.md)** - Problem solving
7. **[Progression Guide](./progression-guide.md)** - Advancement strategies

---

**💡 Tip**: Start with the [Novice Tier commands](./novice-tier.md) and let the system guide your progression naturally!