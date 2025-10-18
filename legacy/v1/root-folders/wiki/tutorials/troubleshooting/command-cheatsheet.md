# Command Cheat Sheet - Essential Claude Flow Commands

**Quick reference for the most commonly used Claude Flow commands and patterns**

## Basic Commands

### Project Initialization
```bash
# Initialize new project
npx claude-flow@latest init [project-name]
npx claude-flow@latest init --template=web-app
npx claude-flow@latest init --type=api --agents=5

# Check project status
npx claude-flow@latest status
npx claude-flow@latest status --detailed
npx claude-flow@latest status --suggestions
```

### Building and Development
```bash
# Build features with natural language
npx claude-flow@latest build "create a login form with validation"
npx claude-flow@latest build --verbose "add user authentication"
npx claude-flow@latest build --fix "fix the broken navigation"

# Quick fixes and improvements
npx claude-flow@latest fix "users can't login"
npx claude-flow@latest optimize --performance
npx claude-flow@latest refactor --target=components
```

### Testing and Quality
```bash
# Run tests
npx claude-flow@latest test
npx claude-flow@latest test --coverage
npx claude-flow@latest test --e2e

# Quality checks
npx claude-flow@latest lint --fix
npx claude-flow@latest security scan
npx claude-flow@latest performance test
```

## MCP Commands (Advanced Coordination)

### Swarm Management
```bash
# Initialize swarm
npx claude-flow@latest mcp swarm_init '{"topology": "mesh", "maxAgents": 5}'
npx claude-flow@latest mcp swarm_init '{"topology": "hierarchical", "maxAgents": 8}'

# Monitor swarm
npx claude-flow@latest mcp swarm_status
npx claude-flow@latest mcp swarm_monitor --duration=30
npx claude-flow@latest mcp swarm_destroy --swarmId=abc123
```

### Agent Management
```bash
# Spawn agents
npx claude-flow@latest mcp agent_spawn '{"type": "coder", "name": "frontend-dev"}'
npx claude-flow@latest mcp agent_spawn '{"type": "tester", "capabilities": ["jest", "cypress"]}'

# List and manage agents
npx claude-flow@latest mcp agent_list
npx claude-flow@latest mcp agent_metrics --agentId=agent123
npx claude-flow@latest mcp agent_list --filter=active
```

### Task Orchestration
```bash
# Orchestrate complex tasks
npx claude-flow@latest mcp task_orchestrate '{"task": "build API", "strategy": "parallel"}'
npx claude-flow@latest mcp task_status --taskId=task123
npx claude-flow@latest mcp task_results --taskId=task123
```

## Memory and State Management

### Memory Operations
```bash
# Store and retrieve data
npx claude-flow@latest memory store "project-state" '{"phase": "development"}'
npx claude-flow@latest memory get "project-state"
npx claude-flow@latest memory search "performance"
npx claude-flow@latest memory list --namespace=project

# Clear and manage memory
npx claude-flow@latest memory clear --namespace=temp
npx claude-flow@latest memory backup --path=./backup.json
npx claude-flow@latest memory restore --path=./backup.json
```

### Neural and Learning
```bash
# Neural network operations
npx claude-flow@latest mcp neural_status
npx claude-flow@latest mcp neural_train --pattern=optimization
npx claude-flow@latest mcp neural_patterns --action=analyze
```

## Configuration and Setup

### Project Configuration
```bash
# Configure project settings
npx claude-flow@latest config
npx claude-flow@latest config set hooks.enabled true
npx claude-flow@latest config get
npx claude-flow@latest config reset

# Hooks management
npx claude-flow@latest hooks enable auto-format
npx claude-flow@latest hooks disable auto-test
npx claude-flow@latest hooks list
```

### Environment Setup
```bash
# Check system requirements
npx claude-flow@latest doctor
npx claude-flow@latest --version
npx claude-flow@latest features detect

# Update and maintenance
npm install -g claude-flow@latest
npx claude-flow@latest self-update
```

## Documentation and Help

### Getting Help
```bash
# Interactive help
npx claude-flow@latest help
npx claude-flow@latest help build
npx claude-flow@latest help --tutorial

# Command information
npx claude-flow@latest --help
npx claude-flow@latest build --help
npx claude-flow@latest mcp --help
```

### Documentation Generation
```bash
# Generate documentation
npx claude-flow@latest docs
npx claude-flow@latest docs --type=api
npx claude-flow@latest docs --format=markdown
npx claude-flow@latest docs --update-api-changes
```

## Automation and Workflows

### Automation Setup
```bash
# Create automation
npx claude-flow@latest automation create code-quality
npx claude-flow@latest automation list
npx claude-flow@latest automation enable auto-format

# Scheduled tasks
npx claude-flow@latest automation schedule daily "security audit"
npx claude-flow@latest automation schedule weekly "dependency updates"
```

### Workflow Management
```bash
# SPARC workflows
npx claude-flow@latest sparc run spec "create user system"
npx claude-flow@latest sparc tdd "shopping cart feature"
npx claude-flow@latest sparc pipeline "complete feature"

# Batch operations
npx claude-flow@latest sparc batch "spec,pseudocode,architect" "API design"
npx claude-flow@latest sparc concurrent architect "features.txt"
```

## Deployment and CI/CD

### Deployment Commands
```bash
# Deploy applications
npx claude-flow@latest deploy --environment=staging
npx claude-flow@latest deploy --environment=production --auto-promote
npx claude-flow@latest deploy --strategy=blue-green

# Rollback and recovery
npx claude-flow@latest rollback --to-previous-version
npx claude-flow@latest rollback --to-commit=abc123
```

### CI/CD Integration
```bash
# CI/CD setup
npx claude-flow@latest cicd setup --provider=github
npx claude-flow@latest cicd configure --auto-deploy
npx claude-flow@latest pipeline create --stages=build,test,deploy
```

## Debugging and Troubleshooting

### Debug Commands
```bash
# Debug issues
npx claude-flow@latest debug --verbose
npx claude-flow@latest debug performance
npx claude-flow@latest debug coordination

# Logs and analysis
npx claude-flow@latest logs --recent=1h
npx claude-flow@latest logs analyze --pattern=errors
npx claude-flow@latest status --health-check
```

### Performance Analysis
```bash
# Performance monitoring
npx claude-flow@latest performance analyze
npx claude-flow@latest benchmark run
npx claude-flow@latest metrics collect

# Optimization
npx claude-flow@latest optimize --auto
npx claude-flow@latest optimize --focus=memory
npx claude-flow@latest cache configure --strategy=redis
```

## Quick Patterns and Templates

### Common Build Patterns
```bash
# Web application
npx claude-flow@latest build "create a React app with authentication and dashboard"

# API development
npx claude-flow@latest build "build REST API with user management and JWT auth"

# Full-stack application
npx claude-flow@latest build "create full-stack e-commerce app with payment integration"

# Testing
npx claude-flow@latest build "add comprehensive test suite with 90% coverage"

# Documentation
npx claude-flow@latest build "generate API documentation and user guides"
```

### Multi-Agent Patterns
```bash
# Frontend team
npx claude-flow@latest mcp agent_spawn '{"type": "coder", "name": "ui-dev", "capabilities": ["react", "css"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "coder", "name": "frontend-arch", "capabilities": ["architecture", "performance"]}'

# Backend team
npx claude-flow@latest mcp agent_spawn '{"type": "coder", "name": "api-dev", "capabilities": ["nodejs", "express"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "coder", "name": "db-engineer", "capabilities": ["postgresql", "optimization"]}'

# Quality team
npx claude-flow@latest mcp agent_spawn '{"type": "tester", "name": "qa-engineer", "capabilities": ["automated-testing"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "reviewer", "name": "security-auditor", "capabilities": ["security-audit"]}'
```

## Environment Variables and Configuration

### Common Environment Variables
```bash
# Claude Flow configuration
export CLAUDE_FLOW_API_KEY=your_api_key
export CLAUDE_FLOW_LOG_LEVEL=debug
export CLAUDE_FLOW_CACHE_DIR=~/.claude-flow/cache

# Project configuration
export NODE_ENV=development
export PORT=3000
export DATABASE_URL=postgresql://localhost/myapp
```

### Config File Examples
```json
// .claude-flow.json
{
  "project": {
    "name": "my-app",
    "type": "web-application",
    "agents": {
      "max": 8,
      "topology": "hierarchical"
    }
  },
  "hooks": {
    "enabled": true,
    "autoFormat": true,
    "autoTest": true
  },
  "quality": {
    "coverage": 90,
    "performance": {
      "budget": "200ms"
    }
  }
}
```

## Error Resolution Quick Reference

### Common Errors and Fixes

**"Command not found"**
```bash
npm install -g claude-flow@latest
# or
npx claude-flow@latest --version
```

**"Agent spawn failed"**
```bash
npx claude-flow@latest mcp swarm_init --reset
npx claude-flow@latest config reset
```

**"Build failed"**
```bash
npx claude-flow@latest build --verbose --debug
npx claude-flow@latest status --detailed
```

**"Memory synchronization error"**
```bash
npx claude-flow@latest memory clear --namespace=temp
npx claude-flow@latest memory sync --force
```

**"Performance issues"**
```bash
npx claude-flow@latest optimize --auto
npx claude-flow@latest performance analyze
npx claude-flow@latest cache configure
```

## Useful Flags and Options

### Global Flags
- `--verbose` - Detailed output
- `--debug` - Debug information
- `--quiet` - Minimal output
- `--json` - JSON output format
- `--help` - Command help

### Build Flags
- `--fix` - Fix existing issues
- `--optimize` - Performance optimization
- `--security` - Security focus
- `--test` - Include testing
- `--docs` - Generate documentation

### MCP Flags
- `--timeout=30` - Set timeout (seconds)
- `--retry=3` - Retry attempts
- `--force` - Force operation
- `--reset` - Reset state

## Quick Start Templates

### New Project Quickstart
```bash
# 1. Create project
npx claude-flow@latest init my-awesome-app

# 2. Build first feature
npx claude-flow@latest build "create homepage with navigation"

# 3. Add testing
npx claude-flow@latest build "add comprehensive test suite"

# 4. Deploy
npx claude-flow@latest deploy --environment=staging
```

### Multi-Agent Quickstart
```bash
# 1. Initialize swarm
npx claude-flow@latest mcp swarm_init '{"topology": "mesh", "maxAgents": 6}'

# 2. Spawn team
npx claude-flow@latest mcp agent_spawn '{"type": "coder", "name": "frontend"}'
npx claude-flow@latest mcp agent_spawn '{"type": "coder", "name": "backend"}'
npx claude-flow@latest mcp agent_spawn '{"type": "tester", "name": "qa"}'

# 3. Orchestrate task
npx claude-flow@latest mcp task_orchestrate '{"task": "build web app", "strategy": "parallel"}'

# 4. Monitor progress
npx claude-flow@latest mcp swarm_monitor
```

## Performance Tips

### Speed Optimization
- Use `--cache` for repeated operations
- Enable parallel execution with `--parallel`
- Use specific agent types for better performance
- Configure memory appropriately
- Enable hooks for automation

### Memory Management
- Clear temporary memory regularly
- Use appropriate namespaces
- Backup important state
- Monitor memory usage
- Configure cache settings

---

**Pro Tips:**
- Always use `--verbose` when debugging
- Check `status` before and after operations
- Use `help` command for context-specific guidance
- Enable hooks for better automation
- Regular `doctor` checks for system health

**Bookmark this page** for quick reference during development!