# Tutorial: Basic Workflows - Understanding CLI and MCP Approaches

**🎯 Goal:** Master fundamental workflow patterns and understand when to use CLI vs MCP approaches

**⏱ Time:** 45 minutes
**📊 Difficulty:** Beginner
**🛠 Focus:** Workflow Design, Agent Coordination

## Overview

This tutorial teaches you the core workflow patterns that form the foundation of all Claude Flow development. You'll learn the differences between CLI and MCP approaches, when to use each, and how to design efficient workflows for common development tasks.

### What You'll Learn
- CLI vs MCP approach fundamentals
- Basic workflow design patterns
- Agent coordination strategies
- Memory and hooks integration
- Troubleshooting workflow issues

### What You'll Build
- API development workflow
- Code review automation
- Documentation generation pipeline
- Performance testing workflow

## Prerequisites

- ✅ Completed [Your First Project](01-first-project.md)
- ✅ Basic understanding of development workflows
- ✅ Familiarity with command line tools

## Understanding the Two Approaches

### CLI Approach: Simple and Direct

**Best for:**
- Quick tasks and prototyping
- Learning and experimentation
- Single-developer workflows
- Simple automation scripts

**Characteristics:**
- Direct command execution
- Immediate feedback
- Easy to learn and remember
- Great for scripting

### MCP Approach: Advanced Orchestration

**Best for:**
- Complex multi-agent coordination
- Enterprise workflows
- Advanced automation
- Real-time monitoring and adaptation

**Characteristics:**
- Sophisticated agent coordination
- Memory and state management
- Neural pattern learning
- Advanced hooks integration

## Workflow Pattern 1: API Development (15 minutes)

Let's build a REST API using both approaches to see the differences.

### CLI Approach: Direct and Simple

```bash
# Step 1: Initialize API project
mkdir api-project && cd api-project
npx claude-flow@latest init --type=api

# Step 2: Build the API in one command
npx claude-flow@latest build "Create a REST API for a blog with:
- User authentication (JWT)
- CRUD operations for posts
- Comment system
- Rate limiting
- Input validation
- Comprehensive tests
- API documentation"

# Step 3: Run and test
npm run dev
npm test
```

**💡 CLI Benefits:**
- Single command execution
- Immediate results
- Easy to understand and modify
- Perfect for learning

### MCP Approach: Orchestrated and Coordinated

```bash
# Step 1: Initialize coordination topology
npx claude-flow@latest mcp swarm_init '{
  "topology": "hierarchical",
  "maxAgents": 6,
  "strategy": "specialized"
}'

# Step 2: Spawn specialized agents
npx claude-flow@latest mcp agent_spawn '{"type": "architect", "name": "api-architect"}'
npx claude-flow@latest mcp agent_spawn '{"type": "coder", "name": "backend-dev", "capabilities": ["nodejs", "express", "mongodb"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "coder", "name": "auth-specialist", "capabilities": ["jwt", "security", "bcrypt"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "tester", "name": "api-tester", "capabilities": ["jest", "supertest", "integration"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "reviewer", "name": "security-reviewer", "capabilities": ["security", "performance"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "documenter", "name": "api-docs", "capabilities": ["swagger", "openapi"]}'

# Step 3: Orchestrate the workflow
npx claude-flow@latest mcp task_orchestrate '{
  "task": "Build comprehensive blog API",
  "strategy": "parallel",
  "priority": "high",
  "dependencies": [
    {"task": "Architecture design", "agent": "api-architect", "order": 1},
    {"task": "Authentication system", "agent": "auth-specialist", "order": 2, "depends": ["Architecture design"]},
    {"task": "Core API endpoints", "agent": "backend-dev", "order": 2, "depends": ["Architecture design"]},
    {"task": "Security review", "agent": "security-reviewer", "order": 3, "depends": ["Authentication system", "Core API endpoints"]},
    {"task": "Test suite creation", "agent": "api-tester", "order": 3, "depends": ["Core API endpoints"]},
    {"task": "API documentation", "agent": "api-docs", "order": 4, "depends": ["Security review", "Test suite creation"]}
  ]
}'

# Step 4: Monitor progress
npx claude-flow@latest mcp swarm_monitor --duration=30 --interval=2
```

**💡 MCP Benefits:**
- Sophisticated coordination
- Parallel execution with dependencies
- Specialized agent expertise
- Real-time monitoring
- Advanced error recovery

### Comparing Results

**CLI Results:**
```
🚀 API Project Created!
📁 Files: 12 created
🧪 Tests: 34 passing (coverage: 87%)
⏱  Time: 8 minutes
📊 Quality Score: 8.7/10
```

**MCP Results:**
```
🤖 Swarm Coordination Complete!
👥 Agents: 6 specialized agents
📁 Files: 18 created (more detailed structure)
🧪 Tests: 52 passing (coverage: 94%)
🔒 Security: Advanced threat modeling
📚 Docs: Complete OpenAPI specification
⏱  Time: 12 minutes (with dependencies)
📊 Quality Score: 9.4/10
```

## Workflow Pattern 2: Code Review Automation (10 minutes)

### CLI Approach: Quick Review

```bash
# Simple code review for current project
npx claude-flow@latest review --auto-fix --security-check

# Output example:
# ✅ Code style: Consistent
# ⚠️  Security: 2 medium issues found and fixed
# ✅ Performance: No issues detected
# ✅ Tests: Coverage at 91%
```

### MCP Approach: Comprehensive Review System

```bash
# Initialize review swarm
npx claude-flow@latest mcp swarm_init '{"topology": "star", "maxAgents": 4}'

# Spawn specialized reviewers
npx claude-flow@latest mcp agent_spawn '{"type": "reviewer", "name": "security-specialist", "capabilities": ["owasp", "penetration-testing"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "reviewer", "name": "performance-analyst", "capabilities": ["profiling", "optimization"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "reviewer", "name": "code-quality", "capabilities": ["clean-code", "design-patterns"]}'
npx claude-flow@latest mcp agent_spawn '{"type": "coordinator", "name": "review-coordinator"}'

# Orchestrate comprehensive review
npx claude-flow@latest mcp task_orchestrate '{
  "task": "Comprehensive code review with automated fixes",
  "strategy": "parallel",
  "agents": ["security-specialist", "performance-analyst", "code-quality"],
  "coordinator": "review-coordinator"
}'
```

## Workflow Pattern 3: Documentation Generation (10 minutes)

### CLI Approach: Simple Documentation

```bash
# Generate basic documentation
npx claude-flow@latest docs --type=api --format=markdown

# This creates:
# - README.md
# - API.md
# - CONTRIBUTING.md
```

### MCP Approach: Comprehensive Documentation Suite

```bash
# Documentation swarm setup
npx claude-flow@latest mcp agent_spawn '{"type": "documenter", "name": "technical-writer"}'
npx claude-flow@latest mcp agent_spawn '{"type": "analyst", "name": "code-analyzer"}'
npx claude-flow@latest mcp agent_spawn '{"type": "designer", "name": "diagram-creator"}'

# Generate comprehensive documentation
npx claude-flow@latest mcp task_orchestrate '{
  "task": "Create comprehensive documentation suite",
  "strategy": "sequential",
  "outputs": [
    "API documentation with examples",
    "Architecture diagrams",
    "Developer onboarding guide",
    "Troubleshooting guides",
    "Performance optimization guides"
  ]
}'
```

## Workflow Pattern 4: Performance Testing (10 minutes)

### CLI Approach: Basic Performance Check

```bash
# Quick performance test
npx claude-flow@latest test --type=performance --endpoints=all

# Results:
# 📊 Average Response Time: 120ms
# 🚀 Throughput: 500 req/s
# 💾 Memory Usage: 45MB
# ⚡ CPU Usage: 12%
```

### MCP Approach: Comprehensive Performance Analysis

```bash
# Performance testing swarm
npx claude-flow@latest mcp agent_spawn '{"type": "perf-analyzer", "name": "load-tester"}'
npx claude-flow@latest mcp agent_spawn '{"type": "perf-analyzer", "name": "memory-profiler"}'
npx claude-flow@latest mcp agent_spawn '{"type": "optimizer", "name": "performance-optimizer"}'

# Orchestrated performance analysis
npx claude-flow@latest mcp task_orchestrate '{
  "task": "Comprehensive performance analysis and optimization",
  "strategy": "adaptive",
  "tests": [
    "Load testing under various conditions",
    "Memory profiling and leak detection",
    "Database query optimization",
    "Caching strategy analysis",
    "CDN configuration optimization"
  ],
  "autoFix": true
}'
```

## Understanding Workflow Memory and Hooks

### Memory Usage in Workflows

Both approaches can use Claude Flow's memory system:

```bash
# Store workflow state (works with both CLI and MCP)
npx claude-flow@latest memory store "project-state" '{
  "currentPhase": "testing",
  "lastBuild": "2024-01-15T10:30:00Z",
  "qualityScore": 9.2,
  "knownIssues": []
}'

# Retrieve state later
npx claude-flow@latest memory get "project-state"

# Search memory for patterns
npx claude-flow@latest memory search "quality score > 9"
```

### Hooks Integration

Hooks automate common workflow steps:

```bash
# Enable automatic hooks (CLI approach)
npx claude-flow@latest config set hooks.enabled true
npx claude-flow@latest config set hooks.autoFormat true
npx claude-flow@latest config set hooks.autoTest true

# This automatically:
# ✓ Formats code after changes
# ✓ Runs tests before commits
# ✓ Updates documentation
# ✓ Performs security scans
```

## Choosing the Right Approach

### Use CLI When:
- **Learning**: Understanding basic concepts
- **Prototyping**: Quick experiments and proofs of concept
- **Simple Tasks**: Single-purpose automation
- **Scripting**: Integration with existing build tools
- **Personal Projects**: Solo development work

**Example CLI Use Cases:**
```bash
# Quick fixes
npx claude-flow@latest build "fix the login bug"

# Rapid prototyping
npx claude-flow@latest build "create a simple chat app"

# Documentation updates
npx claude-flow@latest docs --update-api-changes

# Code formatting
npx claude-flow@latest format --style=prettier
```

### Use MCP When:
- **Complex Projects**: Multi-component systems
- **Team Collaboration**: Multiple developers working together
- **Enterprise Needs**: Sophisticated coordination requirements
- **Long-running Projects**: Persistent state and learning
- **Advanced Automation**: Neural pattern training

**Example MCP Use Cases:**
```bash
# Large team coordination
npx claude-flow@latest mcp swarm_init --topology=hierarchical --maxAgents=12

# Enterprise CI/CD
npx claude-flow@latest mcp task_orchestrate --strategy=pipeline --stages=build,test,security,deploy

# Machine learning integration
npx claude-flow@latest mcp neural_train --pattern=optimization --data=project-metrics

# Advanced monitoring
npx claude-flow@latest mcp swarm_monitor --alerts=true --metrics=all
```

## Common Workflow Patterns

### Pattern 1: Feature Development
```bash
# CLI: Simple feature addition
npx claude-flow@latest build "add user profile page with avatar upload"

# MCP: Coordinated feature development
npx claude-flow@latest mcp task_orchestrate '{
  "task": "User profile feature",
  "agents": ["ui-designer", "backend-dev", "security-reviewer", "tester"],
  "strategy": "coordinated-parallel"
}'
```

### Pattern 2: Bug Fixing
```bash
# CLI: Quick bug fix
npx claude-flow@latest fix "users cannot login with special characters in password"

# MCP: Systematic bug investigation
npx claude-flow@latest mcp task_orchestrate '{
  "task": "Investigate and fix login issues",
  "agents": ["bug-hunter", "security-analyst", "tester"],
  "strategy": "investigative"
}'
```

### Pattern 3: Refactoring
```bash
# CLI: Simple refactoring
npx claude-flow@latest refactor --target=components --pattern=hooks

# MCP: Comprehensive refactoring
npx claude-flow@latest mcp task_orchestrate '{
  "task": "Large-scale refactoring to microservices",
  "agents": ["architect", "refactoring-specialist", "migration-expert", "tester"],
  "strategy": "phased-approach"
}'
```

## Troubleshooting Workflows

### Common CLI Issues

**Issue: "Command not found"**
```bash
# Solution: Update to latest version
npm install -g claude-flow@latest
npx claude-flow@latest --version
```

**Issue: "Build failed"**
```bash
# Solution: Get detailed error information
npx claude-flow@latest build --verbose --debug
npx claude-flow@latest status --detailed
```

### Common MCP Issues

**Issue: "Agent coordination timeout"**
```bash
# Solution: Check agent status and restart if needed
npx claude-flow@latest mcp agent_list --filter=active
npx claude-flow@latest mcp swarm_init --reset-topology
```

**Issue: "Memory synchronization failed"**
```bash
# Solution: Clear and reinitialize memory
npx claude-flow@latest memory clear --namespace=swarm
npx claude-flow@latest mcp memory_usage --action=sync
```

## Best Practices

### CLI Best Practices
1. **Be Specific**: Detailed descriptions get better results
2. **Use Flags**: Leverage command options for fine-tuning
3. **Check Status**: Regularly verify project health
4. **Incremental Changes**: Make small, focused changes

### MCP Best Practices
1. **Plan Topology**: Choose appropriate swarm topology
2. **Specialize Agents**: Use agents for their expertise
3. **Monitor Progress**: Watch coordination in real-time
4. **Manage Memory**: Use memory for state management
5. **Enable Learning**: Let agents adapt and improve

## Practice Exercises

### Exercise 1: E-commerce Workflow (CLI)
```bash
# Create an e-commerce site using CLI approach
npx claude-flow@latest init ecommerce-cli
npx claude-flow@latest build "Create an e-commerce site with product catalog, shopping cart, and checkout"
npx claude-flow@latest test --type=e2e
npx claude-flow@latest deploy --target=staging
```

### Exercise 2: E-commerce Workflow (MCP)
```bash
# Create the same e-commerce site using MCP coordination
npx claude-flow@latest mcp swarm_init '{"topology": "mesh", "maxAgents": 8}'
# Spawn specialists: frontend-dev, backend-dev, payment-specialist, security-expert, etc.
# Orchestrate with dependencies and parallel execution
```

### Exercise 3: Compare Results
- Compare development time
- Analyze code quality differences
- Review test coverage
- Evaluate maintainability

## Summary

### Key Learnings

**CLI Approach:**
- ✅ Quick and easy to learn
- ✅ Perfect for simple tasks
- ✅ Great for learning and experimentation
- ✅ Excellent for scripting and automation

**MCP Approach:**
- ✅ Advanced coordination capabilities
- ✅ Better for complex projects
- ✅ Superior quality and coverage
- ✅ Scalable for enterprise needs

### When to Use Each

| Scenario | CLI | MCP | Why |
|----------|-----|-----|-----|
| Learning | ✅ | ❌ | Simpler to understand |
| Prototyping | ✅ | ❌ | Faster iteration |
| Personal Projects | ✅ | ❓ | Often sufficient |
| Team Projects | ❓ | ✅ | Better coordination |
| Enterprise | ❌ | ✅ | Advanced features needed |
| Complex Systems | ❌ | ✅ | Sophisticated orchestration |

### Next Steps

**Immediate Actions:**
1. Practice both approaches with your own projects
2. Try the exercises above
3. Experiment with different agent combinations

**Continue Learning:**
- [Simple Automation](03-simple-automation.md) - Automate repetitive tasks
- [Quality & Testing](04-quality-testing.md) - Deep dive into testing strategies
- [Intermediate Tutorials](../intermediate/README.md) - Advanced coordination patterns

**Pro Tips:**
- Start with CLI for learning, graduate to MCP for production
- Use CLI for quick fixes, MCP for comprehensive solutions
- Combine both approaches as needed
- Always monitor and learn from agent coordination

You now understand the fundamental workflow patterns that power all Claude Flow development. These patterns will serve as building blocks for more advanced coordination strategies in the intermediate tutorials.

---

**Questions or Need Help?**
- Check [Troubleshooting Guide](../troubleshooting/workflow-issues.md)
- Visit [Community Forums](https://community.claude-flow.dev/workflows)
- Try [Interactive Help](https://chat.claude-flow.dev)