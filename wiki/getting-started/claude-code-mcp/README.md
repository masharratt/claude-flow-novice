# Claude Code MCP Integration Guide

Learn how to use Claude Flow Novice seamlessly integrated with Claude Code through MCP (Model Context Protocol) for enhanced AI-assisted development.

## 🎯 Overview

Claude Code MCP integration provides seamless access to claude-flow-novice directly within Claude Code, enabling real-time AI-assisted development with full swarm coordination.

**Best for:**
- Claude Code users
- AI-pair programming
- Real-time collaboration
- Integrated development workflows

## 🚀 Quick Setup

### 1. Install MCP Server
```bash
# Add claude-flow-novice MCP server to Claude Code
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start

# Optional: Enhanced coordination features
claude mcp add ruv-swarm npx ruv-swarm mcp start

# Optional: Cloud features (requires registration)
claude mcp add flow-nexus npx flow-nexus@latest mcp start
```

### 2. Verify Installation
```bash
# Check MCP status
claude mcp status

# List available tools
claude mcp tools claude-flow
```

## 🛠️ MCP Tool Categories

### Core Coordination
```javascript
// Initialize swarm topology
mcp__claude-flow__swarm_init({ topology: "mesh", maxAgents: 5 })

// Spawn agents for coordination
mcp__claude-flow__agent_spawn({ type: "coder", capabilities: ["javascript", "testing"] })

// Orchestrate tasks across swarm
mcp__claude-flow__task_orchestrate({
  task: "Build REST API with authentication",
  strategy: "adaptive"
})
```

### GitHub Integration
```javascript
// Analyze repository
mcp__claude-flow__github_analyze({ repo: "owner/repo" })

// Enhanced PR management
mcp__claude-flow__pr_enhance({
  prNumber: 123,
  agents: ["reviewer", "security-auditor"]
})

// Automated issue triage
mcp__claude-flow__issue_triage({
  labels: ["bug", "enhancement"],
  priority: "high"
})
```

### Monitoring & Metrics
```javascript
// Real-time swarm monitoring
mcp__claude-flow__swarm_monitor({ duration: 30, interval: 2 })

// Agent performance metrics
mcp__claude-flow__agent_metrics({ metric: "performance" })

// Task progress tracking
mcp__claude-flow__task_status({ detailed: true })
```

## 🎭 Dual Architecture: MCP + Claude Code Task Tool

### The Correct Pattern

**MCP tools coordinate strategy**, **Claude Code's Task tool executes with real agents**:

```javascript
// Step 1: MCP tools set up coordination topology (optional)
mcp__claude-flow__swarm_init({ topology: "mesh", maxAgents: 6 })
mcp__claude-flow__agent_spawn({ type: "researcher" })
mcp__claude-flow__agent_spawn({ type: "coder" })

// Step 2: Claude Code Task tool spawns ACTUAL agents that do work
Task("Research Agent", "Analyze API requirements and patterns", "researcher")
Task("Coder Agent", "Implement REST endpoints with auth", "coder")
Task("Test Agent", "Create comprehensive test suite", "tester")
Task("Review Agent", "Security and quality review", "reviewer")
```

### Concurrent Execution Pattern

```javascript
// ✅ CORRECT: All operations in single message
[Single Message]:
  // Optional MCP coordination setup
  mcp__claude-flow__swarm_init({ topology: "hierarchical" })

  // Claude Code Task tool for actual work
  Task("Backend Dev", "Build Express.js API with JWT auth", "coder")
  Task("Frontend Dev", "Create React authentication UI", "coder")
  Task("Database Architect", "Design user schema and migrations", "code-analyzer")
  Task("Security Auditor", "Review authentication implementation", "reviewer")
  Task("Test Engineer", "Write comprehensive test suite", "tester")

  // Batch all todos
  TodoWrite({ todos: [...10 todos...] })

  // Parallel file operations
  Write("backend/server.js", content)
  Write("frontend/App.jsx", content)
  Write("database/schema.sql", content)
```

## 🔧 Agent Coordination Protocol

Every agent spawned via Claude Code's Task tool MUST follow the coordination protocol:

### Before Work
```bash
npx claude-flow@alpha hooks pre-task --description "implement user auth"
npx claude-flow@alpha hooks session-restore --session-id "swarm-auth-001"
```

### During Work
```bash
npx claude-flow@alpha hooks post-edit --file "src/auth.js" --memory-key "swarm/auth/progress"
npx claude-flow@alpha hooks notify --message "authentication endpoints complete"
```

### After Work
```bash
npx claude-flow@alpha hooks post-task --task-id "auth-implementation"
npx claude-flow@alpha hooks session-end --export-metrics true
```

## 🚀 SPARC Integration

### Complete SPARC Workflow via MCP

```javascript
// Orchestrate full SPARC methodology
mcp__claude-flow__sparc_orchestrate({
  task: "e-commerce checkout system",
  phases: ["specification", "pseudocode", "architecture", "refinement", "completion"],
  agents: {
    specification: "researcher",
    pseudocode: "architect",
    architecture: "system-architect",
    refinement: "coder",
    completion: "tester"
  }
})

// Then execute with Claude Code agents
Task("Spec Agent", "Analyze checkout requirements and user flows", "researcher")
Task("Design Agent", "Create system architecture and APIs", "architect")
Task("Code Agent", "Implement checkout with payment integration", "coder")
Task("Test Agent", "Create end-to-end test coverage", "tester")
```

## 🔄 Memory and Context Management

### Cross-Session Memory
```javascript
// Store context for future sessions
mcp__claude-flow__memory_store({
  key: "project/auth-system",
  data: {
    requirements: "JWT with refresh tokens",
    constraints: "GDPR compliant",
    progress: "API endpoints complete"
  }
})

// Retrieve context in new session
mcp__claude-flow__memory_retrieve({ key: "project/auth-system" })
```

### Agent Memory Sharing
```javascript
// Enable knowledge sharing between agents
mcp__claude-flow__knowledge_share({
  source_agent: "researcher-001",
  target_agents: ["coder-001", "tester-001"],
  knowledge_domain: "authentication-patterns",
  knowledge_content: { patterns: ["JWT", "OAuth2"], security: ["CSRF", "XSS"] }
})
```

## 🎯 Real-World Examples

### Full-Stack Development
```javascript
// Single message: Complete full-stack coordination
mcp__claude-flow__swarm_init({ topology: "star", coordinator: "fullstack-lead" })

Task("Backend Lead", "Design and implement Node.js API", "backend-dev")
Task("Frontend Lead", "Create React SPA with routing", "coder")
Task("Database Expert", "Design PostgreSQL schema and migrations", "code-analyzer")
Task("DevOps Engineer", "Setup Docker and CI/CD pipeline", "cicd-engineer")
Task("QA Engineer", "Comprehensive testing strategy", "tester")
Task("Security Expert", "Security audit and recommendations", "reviewer")
```

### GitHub Repository Enhancement
```javascript
// Repository analysis and improvement
mcp__claude-flow__github_analyze({
  repo: "myorg/myproject",
  focus: ["code-quality", "security", "performance"]
})

Task("Code Reviewer", "Analyze codebase for quality improvements", "reviewer")
Task("Security Auditor", "Security vulnerability assessment", "security-manager")
Task("Performance Optimizer", "Identify performance bottlenecks", "perf-analyzer")
Task("Documentation Writer", "Update README and API docs", "api-docs")
```

## 🔗 Advanced Integration Patterns

### Adaptive Workflows
```javascript
// Workflow that adapts based on project detection
mcp__claude-flow__project_detect({ path: "./project" })
mcp__claude-flow__adaptive_workflow({
  project_type: "react-typescript",
  complexity: "medium",
  auto_agents: true
})

// Spawns appropriate agents based on detection
```

### Performance Monitoring
```javascript
// Real-time performance tracking
mcp__claude-flow__performance_monitor({
  metrics: ["token_usage", "response_time", "agent_efficiency"],
  alerts: { token_threshold: 1000, time_threshold: 30 }
})
```

## 🛡️ Error Handling and Fallbacks

### Graceful Degradation
```javascript
// Setup fallback agents
mcp__claude-flow__fallback_config({
  primary: "specialized-coder",
  fallback: "general-coder",
  conditions: ["timeout", "error", "unavailable"]
})
```

### Recovery Strategies
```javascript
// Auto-recovery configuration
mcp__claude-flow__recovery_setup({
  strategy: "checkpoint-restore",
  frequency: "per-task",
  backup_agents: true
})
```

## 📊 Performance Benefits

With Claude Code MCP integration:
- **84.8% SWE-Bench solve rate**
- **32.3% token reduction** through coordination
- **2.8-4.4x speed improvement** with parallel execution
- **Real-time collaboration** between human and AI agents

## 🔧 Troubleshooting MCP Integration

### Common Issues
```bash
# Check MCP server status
claude mcp status claude-flow

# Restart MCP server
claude mcp restart claude-flow

# View MCP logs
claude mcp logs claude-flow
```

### Debug Mode
```javascript
// Enable verbose MCP logging
mcp__claude-flow__debug_enable({ level: "verbose", components: ["swarm", "agents"] })
```

## 📚 Further Reading

- **[Core Concepts](../../core-concepts/README.md)** - Understanding agents and swarms
- **[MCP Tools Reference](../../command-reference/mcp-tools/README.md)** - Complete MCP tool documentation
- **[Advanced Tutorials](../../tutorials/advanced/README.md)** - Complex orchestration patterns
- **[Troubleshooting](../../troubleshooting/README.md)** - MCP-specific issues

---

**Next Steps:**
- Try the [Quick Start with MCP](../quick-start/README.md#mcp-integration)
- Explore [Advanced Tutorials](../../tutorials/advanced/README.md)
- Practice [Integration Patterns](../../examples/integration-patterns/README.md)