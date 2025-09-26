# MCP Tools Quick Reference

Fast reference guide for claude-flow MCP integration with Claude Code.

## 🚀 Quick Start

### Setup MCP Server
```bash
# Add claude-flow MCP server to Claude Code
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Verify setup
claude mcp status claude-flow
```

### Basic Pattern
```javascript
// 1. Setup coordination (optional)
mcp__claude-flow__swarm_init({ topology: "mesh", maxAgents: 4 })

// 2. Spawn working agents via Task tool
Task("Developer", "Build REST API with authentication", "backend-dev")
Task("Tester", "Write comprehensive tests", "tester")
```

---

## 📚 Core MCP Tools

### Swarm Management
```javascript
// Initialize swarm
mcp__claude-flow__swarm_init({
  topology: "mesh|hierarchical|ring|star|adaptive",
  maxAgents: 8,
  strategy: "collaborative|enterprise|development-focused"
})

// Check status
mcp__claude-flow__swarm_status({ verbose: true })

// Monitor activity
mcp__claude-flow__swarm_monitor({ duration: 300, interval: 30 })
```

### Agent Management
```javascript
// Define agent types (use with Task tool)
mcp__claude-flow__agent_spawn({
  type: "backend-dev|frontend-dev|tester|security-manager",
  capabilities: ["javascript", "nodejs", "testing"],
  name: "custom-agent-name"
})

// List agents
mcp__claude-flow__agent_list({ filter: "all|active|idle|busy" })

// Get metrics
mcp__claude-flow__agent_metrics({ agentId: "agent-001", metric: "performance" })
```

### Task Orchestration
```javascript
// Orchestrate complex tasks
mcp__claude-flow__task_orchestrate({
  task: "Build full-stack application",
  strategy: "parallel|sequential|adaptive",
  maxAgents: 6,
  priority: "low|medium|high|critical"
})

// Check progress
mcp__claude-flow__task_status({ taskId: "task-123", detailed: true })

// Get results
mcp__claude-flow__task_results({ taskId: "task-123", format: "summary|detailed" })
```

### Memory Management
```javascript
// Store data
mcp__claude-flow__memory_usage({
  action: "store",
  key: "project/config",
  value: JSON.stringify(data),
  namespace: "project-context",
  ttl: 86400
})

// Retrieve data
mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "project/config",
  namespace: "project-context"
})

// Search
mcp__claude-flow__memory_search({
  pattern: "project/*",
  namespace: "project-context",
  limit: 10
})
```

---

## 🎯 Task Tool Patterns

### Basic Agent Spawning
```javascript
Task("Agent Name", "Clear task description", "agent-type")
```

### With Coordination
```javascript
Task("Backend Developer", `
  Build REST API with team coordination:

  COORDINATION PROTOCOL:
  - Pre-task: npx claude-flow@alpha hooks pre-task --description "API development"
  - Progress: npx claude-flow@alpha hooks notify --message "Milestone reached"
  - Memory: npx claude-flow@alpha memory store backend/progress

  IMPLEMENTATION:
  - Create Express.js server
  - Implement authentication
  - Write comprehensive tests
`, "backend-dev")
```

### Parallel Development
```javascript
// Spawn multiple coordinated agents
Task("Backend Team", "Build API services", "backend-dev")
Task("Frontend Team", "Build user interface", "frontend-dev")
Task("DevOps Team", "Setup infrastructure", "cicd-engineer")
Task("QA Team", "Comprehensive testing", "tester")
```

---

## 🔄 Common Workflows

### Simple Development
```javascript
// 1. Basic coordination
mcp__claude-flow__swarm_init({ topology: "mesh" })

// 2. Spawn agents
Task("Developer", "Build feature X", "coder")
Task("Tester", "Test feature X", "tester")
```

### Team Collaboration
```javascript
// 1. Team coordination setup
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  coordinator: "tech-lead",
  maxAgents: 8
})

// 2. Store project context
mcp__claude-flow__memory_usage({
  action: "store",
  key: "project/requirements",
  value: JSON.stringify(requirements),
  namespace: "shared"
})

// 3. Spawn coordinated team
Task("Tech Lead", "Coordinate development", "tech-lead")
Task("Backend Dev", "API implementation", "backend-dev")
Task("Frontend Dev", "UI implementation", "frontend-dev")
Task("QA Engineer", "Quality assurance", "tester")
```

### Full-Stack Development
```javascript
// 1. Advanced coordination
mcp__claude-flow__swarm_init({
  topology: "adaptive",
  strategy: "enterprise",
  maxAgents: 10
})

// 2. Orchestrate complex project
mcp__claude-flow__task_orchestrate({
  task: "Build enterprise application",
  strategy: "adaptive",
  maxAgents: 8
})

// 3. Spawn specialized teams
Task("Architecture Team", "System design", "system-architect")
Task("Backend Team", "Microservices", "backend-dev")
Task("Frontend Team", "User interfaces", "frontend-dev")
Task("Infrastructure Team", "Cloud deployment", "cicd-engineer")
Task("Security Team", "Security hardening", "security-manager")
```

---

## 🧠 Advanced Features

### Autonomous Agents (DAA)
```javascript
// Initialize DAA system
mcp__claude-flow__daa_init({
  enableCoordination: true,
  enableLearning: true
})

// Create autonomous agent
mcp__claude-flow__daa_agent_create({
  id: "autonomous-dev",
  cognitivePattern: "adaptive",
  capabilities: ["fullstack-development"]
})

// Create autonomous workflow
mcp__claude-flow__daa_workflow_create({
  id: "auto-development",
  strategy: "adaptive"
})

// Execute autonomous workflow
mcp__claude-flow__daa_workflow_execute({
  workflow_id: "auto-development"
})
```

### Neural Training
```javascript
// Train agents
mcp__claude-flow__neural_train({
  agentId: "coder-001",
  iterations: 50
})

// Analyze patterns
mcp__claude-flow__neural_patterns({
  pattern: "convergent|divergent|systems|critical"
})

// Check neural status
mcp__claude-flow__neural_status({ agentId: "agent-001" })
```

### GitHub Integration
```javascript
// Repository analysis
mcp__claude-flow__github_repo_analyze({
  repo: "owner/repository",
  analysis_type: "code_quality|security|performance"
})

// PR management
mcp__claude-flow__github_pr_manage({
  repo: "owner/repo",
  pr_number: 123,
  action: "review|merge|close"
})
```

---

## 📊 Monitoring and Analytics

### Performance Monitoring
```javascript
// Monitor swarm performance
mcp__claude-flow__swarm_monitor({
  duration: 300,
  interval: 30
})

// System benchmarks
mcp__claude-flow__benchmark_run({
  type: "all|swarm|agent|task",
  iterations: 10
})

// Memory usage
mcp__claude-flow__memory_usage({
  detail: "summary|detailed|by-agent"
})
```

### Health Checks
```javascript
// System health
mcp__claude-flow__health_check({
  components: ["swarm", "memory", "agents"]
})

// Feature detection
mcp__claude-flow__features_detect({
  category: "all|wasm|simd|memory"
})
```

---

## 🛠️ Troubleshooting

### Common Issues
```bash
# MCP server not responding
claude mcp restart claude-flow

# Connection issues
claude mcp status claude-flow
claude mcp logs claude-flow

# Reset if needed
claude mcp remove claude-flow
claude mcp add claude-flow npx claude-flow@alpha mcp start
```

### Memory Issues
```javascript
// Check memory usage
mcp__claude-flow__memory_usage({ detail: "detailed" })

// Clean up expired entries
mcp__claude-flow__memory_usage({
  action: "search",
  pattern: "*",
  namespace: "cleanup"
})
```

### Coordination Issues
```javascript
// Check swarm status
mcp__claude-flow__swarm_status({ verbose: true })

// Analyze coordination efficiency
mcp__claude-flow__agent_metrics({ metric: "coordination" })

// Restart coordination if needed
mcp__claude-flow__swarm_init({ topology: "mesh" })
```

---

## 🎯 Best Practices

### Memory Organization
- Use consistent key naming: `project/feature/item`
- Set appropriate TTL values
- Use namespaces to avoid conflicts
- Regular cleanup of expired data

### Task Instructions
- Be specific and actionable
- Include coordination protocols
- Define clear deliverables
- Specify error handling

### Coordination
- Start simple (mesh topology)
- Scale gradually as needed
- Monitor efficiency metrics
- Use appropriate agent types

### Performance
- Monitor coordination overhead
- Optimize memory usage
- Use appropriate topology
- Scale agents based on workload

---

## 📖 Quick Links

- [Full MCP Tools Reference](./README.md)
- [Integration Patterns](./integration-patterns.md)
- [Task Tool Integration](./task-tool-integration.md)
- [Dual Access Workflows](./dual-access-workflows.md)
- [Session Management](./session-management.md)
- [Getting Started Guide](../../getting-started/claude-code-mcp/README.md)