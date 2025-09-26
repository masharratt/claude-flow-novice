# CLI Access Guide

Learn how to use Claude Flow Novice through the traditional command-line interface for direct terminal control and scripting.

## 🎯 Overview

CLI access provides direct command-line control over claude-flow-novice with full scripting capabilities and CI/CD integration.

**Best for:**
- Terminal-first developers
- CI/CD pipeline integration
- Batch processing and automation
- Server environments

## 🚀 Quick Setup

```bash
# Install globally
npm install -g claude-flow-novice

# Or use with npx (recommended)
npx claude-flow@alpha --version

# Initialize project
npx claude-flow@alpha init
```

## 📋 Core CLI Commands

### Agent Management
```bash
# List available agents
npx claude-flow@alpha agents list

# Spawn an agent
npx claude-flow@alpha agents spawn coder "build REST API"

# Check agent status
npx claude-flow@alpha agents status
```

### SPARC Workflows
```bash
# Run full TDD workflow
npx claude-flow@alpha sparc tdd "user authentication"

# Run specific SPARC mode
npx claude-flow@alpha sparc run architect "design microservices"

# Batch multiple modes
npx claude-flow@alpha sparc batch spec,arch "payment system"
```

### Swarm Coordination
```bash
# Initialize swarm
npx claude-flow@alpha swarm init --topology mesh

# Orchestrate task across swarm
npx claude-flow@alpha swarm orchestrate "build full-stack app"

# Monitor swarm activity
npx claude-flow@alpha swarm monitor
```

## 🔧 Configuration

### Project Configuration
```bash
# Generate config file
npx claude-flow@alpha config init

# Set preferences
npx claude-flow@alpha config set agent.default coder
npx claude-flow@alpha config set sparc.mode tdd

# View configuration
npx claude-flow@alpha config list
```

### Environment Variables
```bash
# Set in .env file
CLAUDE_FLOW_API_KEY=your_key
CLAUDE_FLOW_MODEL=claude-3.5-sonnet
CLAUDE_FLOW_MAX_AGENTS=10
```

## 📂 Project Structure

```
my-project/
├── .claude-flow/
│   ├── config.json
│   ├── agents/
│   ├── memory/
│   └── logs/
├── src/
├── tests/
└── package.json
```

## 🎭 Agent Spawning Examples

### Single Agent
```bash
# Spawn coder agent
npx claude-flow@alpha agents spawn coder "implement user login"

# With specific configuration
npx claude-flow@alpha agents spawn reviewer \
  --mode security \
  --files "src/auth/*" \
  "review authentication code"
```

### Multiple Agents
```bash
# Spawn coordinated team
npx claude-flow@alpha agents spawn-team \
  coder:"build API" \
  tester:"write tests" \
  reviewer:"security review"
```

## 🔄 SPARC CLI Workflows

### Complete TDD Cycle
```bash
# Full cycle with monitoring
npx claude-flow@alpha sparc tdd "shopping cart" \
  --watch \
  --coverage 90 \
  --agents coder,tester,reviewer
```

### Custom Pipeline
```bash
# Custom SPARC sequence
npx claude-flow@alpha sparc pipeline \
  "spec → pseudocode → arch → tdd → integration" \
  "payment processing system"
```

## 🎮 Interactive Mode

```bash
# Start interactive CLI
npx claude-flow@alpha interactive

# Interactive SPARC wizard
npx claude-flow@alpha sparc wizard

# Agent selection menu
npx claude-flow@alpha agents wizard
```

## 🔗 Integration Examples

### GitHub Integration
```bash
# Analyze repository
npx claude-flow@alpha github analyze

# Create PR with agent review
npx claude-flow@alpha github pr-create \
  --agents reviewer,tester \
  --branch feature/auth
```

### CI/CD Integration
```bash
# Jenkins pipeline
pipeline {
    stage('AI Review') {
        steps {
            sh 'npx claude-flow@alpha agents spawn reviewer "review PR changes"'
        }
    }
}

# GitHub Actions
- name: AI Code Review
  run: npx claude-flow@alpha github pr-review --pr ${{ github.event.number }}
```

## 📊 Monitoring and Logs

### Real-time Monitoring
```bash
# Monitor all agents
npx claude-flow@alpha monitor

# Monitor specific agent
npx claude-flow@alpha monitor --agent coder-001

# Export metrics
npx claude-flow@alpha metrics export --format json
```

### Log Management
```bash
# View logs
npx claude-flow@alpha logs show

# Filter logs
npx claude-flow@alpha logs show --level error --agent reviewer

# Export logs
npx claude-flow@alpha logs export --since "1 hour ago"
```

## 🛠️ Advanced CLI Features

### Hooks System
```bash
# List available hooks
npx claude-flow@alpha hooks list

# Run pre-task hook
npx claude-flow@alpha hooks pre-task --description "API development"

# Custom hook configuration
npx claude-flow@alpha hooks config set pre-edit "npm run lint"
```

### Memory Management
```bash
# View memory
npx claude-flow@alpha memory show

# Store data
npx claude-flow@alpha memory store api-design "REST endpoints schema"

# Retrieve data
npx claude-flow@alpha memory get api-design
```

## 🎯 Best Practices

### Command Structure
```bash
# Good: Clear, specific commands
npx claude-flow@alpha agents spawn coder "implement JWT authentication"

# Better: With context and constraints
npx claude-flow@alpha agents spawn coder \
  --context "Express.js API" \
  --constraints "security-first" \
  "implement JWT authentication with refresh tokens"
```

### Error Handling
```bash
# With retry logic
npx claude-flow@alpha agents spawn coder "build API" \
  --retry 3 \
  --timeout 300

# With fallback agent
npx claude-flow@alpha agents spawn coder "complex task" \
  --fallback reviewer
```

## 🚨 Troubleshooting

### Common Issues
```bash
# Check CLI health
npx claude-flow@alpha doctor

# Reset configuration
npx claude-flow@alpha config reset

# Clear cache
npx claude-flow@alpha cache clear
```

### Debug Mode
```bash
# Enable verbose output
npx claude-flow@alpha --verbose agents spawn coder "debug task"

# Debug specific component
DEBUG=claude-flow:agents npx claude-flow@alpha agents list
```

## 📚 Further Reading

- **[SPARC Methodology](../../core-concepts/sparc-methodology/README.md)** - Detailed workflow guide
- **[Agent Reference](../../core-concepts/agents/README.md)** - Complete agent documentation
- **[Command Reference](../../command-reference/README.md)** - Full command listing
- **[Troubleshooting](../../troubleshooting/README.md)** - Common issues and solutions

---

**Next Steps:**
- Try the [Quick Start Tutorial](../quick-start/README.md)
- Explore [Core Concepts](../../core-concepts/README.md)
- Practice with [Beginner Tutorials](../../tutorials/beginner/README.md)