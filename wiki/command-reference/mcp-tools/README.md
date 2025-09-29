# MCP Tools Reference

Claude Code Model Context Protocol (MCP) integration commands for seamless AI-assisted development within Claude Code.

## 🎯 MCP Integration Overview

MCP tools provide the coordination layer for Claude Flow Novice when used with Claude Code, enabling:
- **Real-time collaboration** between human and AI agents
- **Seamless integration** with Claude Code workflows
- **Advanced coordination** patterns with minimal setup
- **Persistent context** across development sessions
- **Dual access** - CLI and MCP work seamlessly together
- **Task orchestration** via Claude Code's native Task tool

## 📖 Quick Navigation

- [Core Coordination Tools](#core-coordination-tools) - Basic swarm setup
- [Agent Management Tools](#agent-management-tools) - Agent lifecycle
- [Task Orchestration Tools](#task-orchestration-tools) - Complex workflows
- [Claude Code Integration](#claude-code-integration) - Task tool patterns
- [Dual Access Workflows](#dual-access-workflows) - CLI + MCP workflows
- [Session Management](#session-management) - Context preservation
- [Practical Examples](#practical-examples) - Real-world scenarios
- [Troubleshooting](#troubleshooting) - Common issues

## 🔧 MCP vs Claude Code Task Tool

### The Dual Architecture

**MCP tools coordinate strategy**, **Claude Code's Task tool executes with real agents**:

```javascript
// 1. MCP tools set up coordination (optional for complex tasks)
mcp__claude-flow__swarm_init({ topology: "mesh", maxAgents: 6 })

// 2. Claude Code Task tool spawns ACTUAL working agents
Task("Backend Developer", "Build Express.js API with JWT auth", "backend-dev")
Task("Security Auditor", "Review authentication security", "security-manager")
Task("Test Engineer", "Create comprehensive test suite", "tester")
```

### Key Differences

| Aspect | MCP Tools | Claude Code Task Tool |
|--------|-----------|----------------------|
| **Purpose** | Coordination & Strategy | Execution & Implementation |
| **Output** | Coordination patterns | Real code and files |
| **Usage** | Setup and monitoring | Actual development work |
| **Agents** | Coordination definitions | Working implementations |
| **Integration** | Background coordination | Direct task execution |

### When to Use Each

**Use MCP Tools for:**
- Setting up swarm topology
- Monitoring coordination
- Managing memory and knowledge
- Advanced neural training
- GitHub integration setup

**Use Claude Code Task Tool for:**
- Spawning working agents
- Implementing actual features
- Writing and editing code
- Running tests and builds
- File system operations

## 📚 MCP Tool Categories

### Core Coordination Tools
Essential MCP tools for basic swarm setup and coordination.

### Agent Management Tools
MCP tools for spawning, monitoring, and managing agents.

### Task Orchestration Tools
Tools for coordinating complex tasks across multiple agents.

### Memory and Learning Tools
Advanced knowledge management and neural training features.

### GitHub Integration Tools
Repository management and CI/CD integration.

### Monitoring and Analytics Tools
Real-time monitoring and performance analysis.

---

## 🕸️ Core Coordination Tools

### `mcp__claude-flow__swarm_init`
Initialize swarm topology and coordination patterns.

```javascript
// Basic mesh coordination
mcp__claude-flow__swarm_init({
  topology: "mesh",
  maxAgents: 5,
  strategy: "collaborative"
})

// Hierarchical coordination with leader
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  coordinator: "system-architect",
  maxAgents: 10,
  strategy: "structured"
})

// Adaptive coordination
mcp__claude-flow__swarm_init({
  topology: "adaptive",
  strategy: "dynamic",
  autoScale: true,
  learningEnabled: true
})
```

**Parameters:**
- `topology` - "mesh", "hierarchical", "ring", "star", "adaptive"
- `maxAgents` - Maximum number of agents in swarm
- `coordinator` - Lead agent type for hierarchical topology
- `strategy` - Coordination strategy
- `autoScale` - Enable automatic agent scaling
- `learningEnabled` - Enable adaptive learning

### `mcp__claude-flow__swarm_status`
Monitor swarm health and coordination efficiency.

```javascript
// Basic status check
mcp__claude-flow__swarm_status()

// Detailed status with agent breakdown
mcp__claude-flow__swarm_status({
  verbose: true
})
```

**Returns:**
- Swarm topology and health
- Agent coordination status
- Communication efficiency metrics
- Resource utilization

### `mcp__claude-flow__swarm_monitor`
Real-time swarm activity monitoring.

```javascript
// Monitor for 60 seconds with 5-second intervals
mcp__claude-flow__swarm_monitor({
  duration: 60,
  interval: 5
})

// Continuous monitoring with specific metrics
mcp__claude-flow__swarm_monitor({
  duration: 300,
  interval: 10,
  metrics: ["coordination-efficiency", "communication-flow", "resource-usage"]
})
```

---

## 🎭 Agent Management Tools

### `mcp__claude-flow__agent_spawn`
Define agent types for coordination (use with Claude Code Task tool).

```javascript
// Define backend development agent
mcp__claude-flow__agent_spawn({
  type: "backend-dev",
  capabilities: ["javascript", "nodejs", "express", "postgresql"],
  specialization: "api-development"
})

// Define security specialist
mcp__claude-flow__agent_spawn({
  type: "security-manager",
  capabilities: ["security-audit", "vulnerability-assessment", "owasp"],
  specialization: "application-security"
})

// Then spawn actual working agents with Claude Code Task tool
Task("Backend Developer", "Build REST API with authentication", "backend-dev")
Task("Security Specialist", "Audit API security", "security-manager")
```

### `mcp__claude-flow__agent_list`
List active agents and their status.

```javascript
// List all active agents
mcp__claude-flow__agent_list()

// Filter by agent status
mcp__claude-flow__agent_list({
  filter: "active"  // "all", "active", "idle", "busy"
})
```

### `mcp__claude-flow__agent_metrics`
Get performance metrics for agents.

```javascript
// Get all metrics for all agents
mcp__claude-flow__agent_metrics({
  metric: "all"
})

// Get specific metrics for specific agent
mcp__claude-flow__agent_metrics({
  agentId: "coder-001",
  metric: "performance"  // "cpu", "memory", "tasks", "performance"
})
```

---

## 🎯 Task Orchestration Tools

### `mcp__claude-flow__task_orchestrate`
Coordinate complex tasks across the swarm.

```javascript
// Orchestrate full-stack development
mcp__claude-flow__task_orchestrate({
  task: "Build e-commerce platform with user management and payment processing",
  strategy: "adaptive",
  maxAgents: 6,
  priority: "high"
})

// Parallel task orchestration
mcp__claude-flow__task_orchestrate({
  task: "Implement authentication system with multiple providers",
  strategy: "parallel",
  maxAgents: 4,
  priority: "medium"
})

// Sequential workflow orchestration
mcp__claude-flow__task_orchestrate({
  task: "Database migration and API updates",
  strategy: "sequential",
  maxAgents: 3,
  priority: "critical"
})
```

**Strategies:**
- `parallel` - Maximum parallelization
- `sequential` - Step-by-step execution
- `adaptive` - Dynamic strategy selection

### `mcp__claude-flow__task_status`
Check progress of orchestrated tasks.

```javascript
// Check all running tasks
mcp__claude-flow__task_status()

// Detailed progress for specific task
mcp__claude-flow__task_status({
  taskId: "task-12345",
  detailed: true
})
```

### `mcp__claude-flow__task_results`
Retrieve results from completed tasks.

```javascript
// Get summary results
mcp__claude-flow__task_results({
  taskId: "task-12345",
  format: "summary"
})

// Get detailed results with all agent outputs
mcp__claude-flow__task_results({
  taskId: "task-12345",
  format: "detailed"
})
```

---

## 🧠 Memory and Learning Tools

### `mcp__claude-flow__memory_store`
Store information in the memory system.

```javascript
// Store project architecture decisions
mcp__claude-flow__memory_store({
  key: "project/architecture",
  data: {
    pattern: "microservices",
    database: "postgresql",
    authentication: "jwt",
    deployment: "kubernetes"
  },
  scope: "project",
  tags: ["architecture", "decisions", "backend"]
})

// Store successful implementation patterns
mcp__claude-flow__memory_store({
  key: "patterns/authentication-flow",
  data: {
    implementation: "JWT with refresh tokens",
    security: "bcrypt + rate limiting",
    testing: "jest + supertest"
  },
  scope: "shared",
  tags: ["authentication", "security", "patterns"]
})
```

### `mcp__claude-flow__memory_retrieve`
Access stored knowledge and context.

```javascript
// Retrieve specific information
mcp__claude-flow__memory_retrieve({
  key: "project/architecture"
})

// Search by tags
mcp__claude-flow__memory_search({
  tags: ["authentication", "security"],
  relevance: 0.8
})
```

### `mcp__claude-flow__knowledge_share`
Share knowledge between agents.

```javascript
// Share security patterns from expert to team
mcp__claude-flow__knowledge_share({
  source_agent: "security-expert-001",
  target_agents: ["backend-dev-001", "frontend-dev-001"],
  knowledge_domain: "security-best-practices",
  knowledge_content: {
    patterns: ["input-validation", "output-encoding", "auth-flows"],
    tools: ["helmet", "cors", "rate-limiting"],
    testing: ["security-tests", "penetration-testing"]
  }
})
```

---

## 🚀 Advanced Neural Tools

### `mcp__claude-flow__neural_train`
Train agents with domain-specific knowledge.

```javascript
// Train coder agent on project patterns
mcp__claude-flow__neural_train({
  agentId: "coder-001",
  iterations: 50,
  focusAreas: ["code-quality", "performance", "security"]
})

// Train all agents collaboratively
mcp__claude-flow__neural_train({
  agentId: "all",
  iterations: 25,
  mode: "collaborative"
})
```

### `mcp__claude-flow__neural_patterns`
Analyze and apply cognitive patterns.

```javascript
// Get all cognitive patterns
mcp__claude-flow__neural_patterns({
  pattern: "all"
})

// Focus on specific thinking patterns
mcp__claude-flow__neural_patterns({
  pattern: "convergent"  // "divergent", "lateral", "systems", "critical"
})
```

### `mcp__claude-flow__neural_status`
Monitor neural agent performance and learning.

```javascript
// Check neural status for all agents
mcp__claude-flow__neural_status()

// Detailed neural metrics for specific agent
mcp__claude-flow__neural_status({
  agentId: "ml-developer-001"
})
```

---

## 🔄 Autonomous Agent Tools (DAA)

### `mcp__claude-flow__daa_init`
Initialize Decentralized Autonomous Agents system.

```javascript
// Enable full autonomous operation
mcp__claude-flow__daa_init({
  enableCoordination: true,
  enableLearning: true,
  persistenceMode: "auto"
})
```

### `mcp__claude-flow__daa_agent_create`
Create autonomous agents with advanced capabilities.

```javascript
// Create adaptive autonomous coder
mcp__claude-flow__daa_agent_create({
  id: "autonomous-fullstack-dev",
  cognitivePattern: "adaptive",
  enableMemory: true,
  learningRate: 0.3,
  capabilities: ["fullstack-development", "architecture", "testing"]
})

// Create systems thinking architect
mcp__claude-flow__daa_agent_create({
  id: "systems-architect",
  cognitivePattern: "systems",
  enableMemory: true,
  learningRate: 0.2,
  capabilities: ["system-design", "scalability", "performance"]
})
```

### `mcp__claude-flow__daa_workflow_create`
Design autonomous workflows that self-organize.

```javascript
// Create adaptive development workflow
mcp__claude-flow__daa_workflow_create({
  id: "autonomous-development",
  name: "Self-Organizing Development Process",
  strategy: "adaptive",
  steps: [
    "autonomous-analysis",
    "adaptive-planning",
    "parallel-implementation",
    "continuous-optimization",
    "self-validation"
  ]
})
```

### `mcp__claude-flow__daa_workflow_execute`
Execute autonomous workflows.

```javascript
// Execute self-organizing workflow
mcp__claude-flow__daa_workflow_execute({
  workflow_id: "autonomous-development",
  agentIds: ["autonomous-fullstack-dev", "systems-architect"],
  parallelExecution: true
})
```

---

## 🐙 GitHub Integration Tools

### `mcp__claude-flow__github_analyze`
Analyze GitHub repositories with AI agents.

```javascript
// Comprehensive repository analysis
mcp__claude-flow__github_analyze({
  repo: "owner/repository",
  analysis: ["code-quality", "security", "performance", "architecture"]
})

// Security-focused analysis
mcp__claude-flow__github_analyze({
  repo: "owner/repository",
  focus: "security",
  agents: ["security-manager"]
})
```

### `mcp__claude-flow__pr_enhance`
Enhance pull requests with agent reviews.

```javascript
// Multi-agent PR review
mcp__claude-flow__pr_enhance({
  prNumber: 123,
  agents: ["reviewer", "security-manager", "performance-optimizer"],
  autoComment: true,
  suggestImprovements: true
})
```

### `mcp__claude-flow__issue_triage`
Automated issue triage and assignment.

```javascript
// Intelligent issue triage
mcp__claude-flow__issue_triage({
  repository: "owner/repo",
  labels: ["bug", "enhancement", "security"],
  priorityRules: "severity-based",
  autoAssign: true
})
```

---

## 📊 Monitoring and Analytics Tools

### `mcp__claude-flow__performance_monitor`
Monitor system performance in real-time.

```javascript
// Comprehensive performance monitoring
mcp__claude-flow__performance_monitor({
  metrics: [
    "agent-utilization",
    "coordination-efficiency",
    "memory-usage",
    "response-times"
  ],
  alertThresholds: {
    utilization: 90,
    efficiency: 80,
    memory: 85
  }
})
```

### `mcp__claude-flow__benchmark_run`
Execute performance benchmarks.

```javascript
// Run comprehensive benchmarks
mcp__claude-flow__benchmark_run({
  type: "all",
  iterations: 10
})

// Specific benchmark categories
mcp__claude-flow__benchmark_run({
  type: "swarm",  // "wasm", "agent", "task"
  iterations: 25
})
```

### `mcp__claude-flow__memory_usage`
Monitor memory system usage and efficiency.

```javascript
// Get memory usage summary
mcp__claude-flow__memory_usage({
  detail: "summary"
})

// Detailed per-agent memory usage
mcp__claude-flow__memory_usage({
  detail: "by-agent"
})
```

---

## 🎯 Integration Patterns

### Basic MCP + Task Integration
```javascript
// 1. Set up coordination
mcp__claude-flow__swarm_init({ topology: "mesh", maxAgents: 4 })

// 2. Spawn real working agents via Task tool
Task("Backend Dev", "Create REST API", "backend-dev")
Task("Frontend Dev", "Build React UI", "frontend-dev")
Task("Tester", "Write comprehensive tests", "tester")
Task("Reviewer", "Quality and security review", "reviewer")

// 3. Monitor coordination
mcp__claude-flow__swarm_monitor({ duration: 60 })
```

### Advanced Coordination Pattern
```javascript
// 1. Initialize advanced swarm
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  coordinator: "system-architect",
  maxAgents: 8,
  strategy: "enterprise"
})

// 2. Set up memory sharing
mcp__claude-flow__memory_store({
  key: "project/requirements",
  data: { /* project requirements */ },
  scope: "shared"
})

// 3. Orchestrate complex task
mcp__claude-flow__task_orchestrate({
  task: "Build enterprise application with microservices",
  strategy: "adaptive",
  maxAgents: 6
})

// 4. Spawn specialized teams via Task tool
Task("Architecture Team", "Design microservices architecture", "system-architect")
Task("Backend Team", "Implement core services", "backend-dev")
Task("Frontend Team", "Build admin dashboard", "frontend-dev")
Task("DevOps Team", "Setup CI/CD and monitoring", "cicd-engineer")
Task("Security Team", "Security audit and hardening", "security-manager")
Task("QA Team", "End-to-end testing strategy", "tester")
```

### Autonomous Development Pattern
```javascript
// 1. Initialize autonomous system
mcp__claude-flow__daa_init({
  enableCoordination: true,
  enableLearning: true,
  persistenceMode: "auto"
})

// 2. Create autonomous agents
mcp__claude-flow__daa_agent_create({
  id: "autonomous-architect",
  cognitivePattern: "systems",
  enableMemory: true,
  learningRate: 0.4
})

// 3. Create self-organizing workflow
mcp__claude-flow__daa_workflow_create({
  id: "autonomous-development",
  strategy: "adaptive"
})

// 4. Execute autonomous workflow
mcp__claude-flow__daa_workflow_execute({
  workflow_id: "autonomous-development",
  parallelExecution: true
})
```

---

## 🔧 Configuration and Setup

### MCP Server Configuration
```bash
# Add claude-flow-novice MCP server to Claude Code
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start

# Optional: Enhanced coordination features
claude mcp add ruv-swarm npx ruv-swarm mcp start

# Optional: Cloud features (requires registration)
claude mcp add flow-nexus npx flow-nexus@latest mcp start
```

### Verify MCP Setup
```bash
# Check MCP server status
claude mcp status claude-flow

# List available MCP tools
claude mcp tools claude-flow

# Test MCP connection
claude mcp test claude-flow
```

### Troubleshooting MCP Issues
```bash
# Restart MCP server
claude mcp restart claude-flow

# View MCP logs
claude mcp logs claude-flow

# Remove and re-add server
claude mcp remove claude-flow
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start
```

---

## 📚 Best Practices for MCP Integration

### Effective MCP Usage
1. **Start with basic coordination** - Use simple mesh topology first
2. **Combine MCP with Task tool** - MCP coordinates, Task executes
3. **Leverage memory system** - Store and share knowledge effectively
4. **Monitor coordination** - Use real-time monitoring tools
5. **Scale gradually** - Add complexity as you gain experience

### Common Patterns
```javascript
// Pattern 1: Simple coordination
mcp__claude-flow__swarm_init({ topology: "mesh" })
Task("Developer", "Build feature", "coder")

// Pattern 2: Multi-agent team
mcp__claude-flow__swarm_init({ topology: "hierarchical" })
Task("Team Lead", "Coordinate development", "system-architect")
Task("Developer 1", "Backend implementation", "backend-dev")
Task("Developer 2", "Frontend implementation", "frontend-dev")

// Pattern 3: Quality-focused workflow
mcp__claude-flow__swarm_init({ topology: "ring" })
Task("Developer", "Implement feature", "coder")
Task("Reviewer", "Code review", "reviewer")
Task("Tester", "Testing and validation", "tester")
```

### Avoiding Common Pitfalls
1. **Don't over-coordinate** - Simple tasks don't need complex swarms
2. **Use appropriate topology** - Match topology to team size and task
3. **Monitor performance** - Watch for coordination overhead
4. **Preserve context** - Use memory system for important information

---

## 🚀 Advanced MCP Features

### Real-Time Collaboration
MCP enables real-time collaboration between human developers and AI agents within Claude Code, providing:
- Live progress updates
- Interactive problem solving
- Dynamic task adjustment
- Continuous learning and adaptation

### Performance Benefits
With MCP integration:
- **84.8% SWE-Bench solve rate** through coordinated agents
- **32.3% token reduction** via intelligent coordination
- **2.8-4.4x speed improvement** with parallel execution
- **Real-time feedback** and course correction

---

---

## 🔄 Claude Code Integration

### Task Tool for Agent Spawning

Claude Code's Task tool is the primary way to spawn working agents that execute real development tasks:

```javascript
// ✅ CORRECT: Task tool spawns real working agents
Task("Full-Stack Developer", `
  Build a React e-commerce app with:
  - User authentication (JWT)
  - Product catalog with search
  - Shopping cart functionality
  - Payment integration (Stripe)
  - Admin dashboard

  Use MCP memory for coordination:
  - Check memory for architecture decisions
  - Store API contracts for other agents
  - Coordinate with backend team via hooks
`, "fullstack-dev")

Task("Security Specialist", `
  Perform comprehensive security audit:
  - Authentication flow analysis
  - Input validation review
  - OWASP compliance check
  - Penetration testing setup

  Coordinate with main development:
  - Review code from memory system
  - Share findings via MCP knowledge sharing
`, "security-manager")

Task("DevOps Engineer", `
  Setup production infrastructure:
  - Docker containerization
  - Kubernetes deployment
  - CI/CD pipeline (GitHub Actions)
  - Monitoring and logging

  Integration requirements:
  - Read deployment config from memory
  - Coordinate with dev team via hooks
`, "cicd-engineer")
```

### Agent Coordination Protocol

Every agent spawned via Task tool should follow this coordination protocol:

```bash
# 1. BEFORE starting work
npx claude-flow@alpha hooks pre-task --description "[task description]"
npx claude-flow@alpha hooks session-restore --session-id "swarm-[project-id]"

# 2. DURING work (after each significant step)
npx claude-flow@alpha hooks post-edit --file "[file-path]" --memory-key "swarm/[agent-type]/[step]"
npx claude-flow@alpha hooks notify --message "[progress update]"

# 3. AFTER completing work
npx claude-flow@alpha hooks post-task --task-id "[task-id]"
npx claude-flow@alpha hooks session-end --export-metrics true
```

### Memory Integration Pattern

```javascript
// Store project context for agent coordination
mcp__claude-flow__memory_usage({
  action: "store",
  key: "project/architecture",
  value: JSON.stringify({
    framework: "React + Express",
    database: "PostgreSQL",
    authentication: "JWT with refresh tokens",
    deployment: "Kubernetes",
    testing: "Jest + Cypress"
  }),
  namespace: "project-context",
  ttl: 86400 // 24 hours
})

// Agents retrieve context during execution
mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "project/architecture",
  namespace: "project-context"
})
```

---

## 🔄 Dual Access Workflows

### CLI + MCP Seamless Integration

Developers can switch between CLI and MCP access seamlessly on the same project:

#### Scenario 1: CLI Setup, MCP Execution

```bash
# Developer sets up project via CLI
npx claude-flow@alpha init --template fullstack
npx claude-flow@alpha config set topology mesh
npx claude-flow@alpha swarm spawn --agents "backend-dev,frontend-dev,tester"
```

```javascript
// Claude Code user joins via MCP and sees existing setup
mcp__claude-flow__swarm_status() // Shows CLI-created swarm

// Spawn additional agents via Task tool
Task("Security Auditor", "Review existing codebase for security issues", "security-manager")
Task("Performance Optimizer", "Analyze and optimize application performance", "performance-optimizer")
```

#### Scenario 2: MCP Setup, CLI Monitoring

```javascript
// Claude Code user initializes via MCP
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  maxAgents: 8,
  strategy: "enterprise"
})

// Task tool spawns working agents
Task("Architecture Team", "Design microservices architecture", "system-architect")
Task("Implementation Team", "Build core services", "backend-dev")
```

```bash
# CLI user monitors progress
npx claude-flow@alpha swarm status
npx claude-flow@alpha agents list
npx claude-flow@alpha memory search --pattern "architecture"
```

#### Scenario 3: Hybrid Development

```bash
# CLI: Project initialization
npx claude-flow@alpha init --template enterprise
npx claude-flow@alpha config import ./project-config.json
```

```javascript
// MCP: Agent coordination
mcp__claude-flow__task_orchestrate({
  task: "Build enterprise CRM with microservices",
  strategy: "adaptive",
  maxAgents: 6
})

// Task tool: Implementation
Task("Microservices Architect", "Design service boundaries and APIs", "system-architect")
Task("Auth Service Team", "Implement authentication microservice", "backend-dev")
Task("User Service Team", "Implement user management microservice", "backend-dev")
Task("Frontend Team", "Build admin dashboard", "frontend-dev")
```

```bash
# CLI: Monitoring and deployment
npx claude-flow@alpha monitor --real-time
npx claude-flow@alpha deploy --environment staging
```

### Session Persistence

Both CLI and MCP access maintain shared session state:

```javascript
// MCP: Store session context
mcp__claude-flow__memory_usage({
  action: "store",
  key: "session/current-sprint",
  value: JSON.stringify({
    sprint: "Sprint 3",
    goals: ["User authentication", "Product catalog", "Payment integration"],
    agents: ["backend-dev-001", "frontend-dev-001", "security-manager-001"],
    deadline: "2024-02-15"
  }),
  namespace: "session-state"
})
```

```bash
# CLI: Access same session
npx claude-flow@alpha memory get session/current-sprint
npx claude-flow@alpha session restore --session-id current-sprint
```

---

## 🎯 Session Management

### Cross-Session Persistence

```javascript
// Initialize persistent session
mcp__claude-flow__memory_usage({
  action: "store",
  key: "session/workspace",
  value: JSON.stringify({
    project: "e-commerce-platform",
    workspace: "/home/user/projects/ecommerce",
    swarm_id: "swarm-ecommerce-001",
    topology: "hierarchical",
    agents: {
      "system-architect": "active",
      "backend-dev-001": "active",
      "frontend-dev-001": "active",
      "security-manager": "on-demand"
    },
    memory_namespaces: ["project-context", "architecture-decisions", "security-findings"]
  }),
  namespace: "session-management",
  ttl: 604800 // 7 days
})

// Restore session in new Claude Code instance
mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "session/workspace",
  namespace: "session-management"
})
```

### Context Switching

```javascript
// Switch between projects seamlessly
// Project A context
mcp__claude-flow__memory_usage({
  action: "store",
  key: "context/active-project",
  value: "project-a",
  namespace: "session-state"
})

// Load Project A specific memory
mcp__claude-flow__memory_search({
  pattern: "project-a/*",
  namespace: "project-context"
})

// Switch to Project B
mcp__claude-flow__memory_usage({
  action: "store",
  key: "context/active-project",
  value: "project-b",
  namespace: "session-state"
})
```

### Session Recovery

```javascript
// Auto-recovery after interruption
mcp__claude-flow__memory_search({
  pattern: "session/workspace",
  namespace: "session-management"
})

// Restore swarm state
mcp__claude-flow__swarm_status() // Check if swarm is still active

// Restart agents if needed
Task("Recovery Coordinator", `
  Analyze current project state:
  - Check git status and recent commits
  - Review memory for incomplete tasks
  - Identify where work was interrupted
  - Resume from last checkpoint

  Coordinate with team:
  - Notify other agents of resumption
  - Update task priorities based on interruption
`, "coordinator")
```

---

## 💼 Practical Examples

### Example 1: Full-Stack E-commerce Development

```javascript
// Step 1: Initialize enterprise-grade coordination
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  maxAgents: 10,
  strategy: "enterprise"
})

// Step 2: Set up project memory
mcp__claude-flow__memory_usage({
  action: "store",
  key: "project/requirements",
  value: JSON.stringify({
    type: "e-commerce-platform",
    features: [
      "user-authentication",
      "product-catalog",
      "shopping-cart",
      "payment-processing",
      "order-management",
      "admin-dashboard"
    ],
    tech_stack: {
      frontend: "React + TypeScript",
      backend: "Node.js + Express",
      database: "PostgreSQL",
      payment: "Stripe",
      deployment: "Kubernetes"
    },
    timeline: "8 weeks",
    team_size: "6 agents"
  }),
  namespace: "project-context"
})

// Step 3: Orchestrate high-level task
mcp__claude-flow__task_orchestrate({
  task: "Build production-ready e-commerce platform with microservices architecture",
  strategy: "adaptive",
  maxAgents: 6,
  priority: "high"
})

// Step 4: Spawn specialized teams via Task tool
Task("System Architect", `
  Design the overall system architecture:
  - Microservices boundaries and communication
  - Database schema and relationships
  - API contracts and documentation
  - Security architecture and authentication flow
  - Deployment and scaling strategy

  Coordination requirements:
  - Store all architectural decisions in memory
  - Create API contracts for other teams
  - Set up coding standards and guidelines
`, "system-architect")

Task("Backend Development Team", `
  Implement core backend services:
  - User authentication service (JWT + refresh tokens)
  - Product catalog service with search
  - Shopping cart and session management
  - Order processing and payment integration
  - Admin API for dashboard

  Technical requirements:
  - Node.js + Express + TypeScript
  - PostgreSQL with proper indexing
  - Redis for session management
  - Stripe for payment processing
  - Comprehensive error handling and logging

  Coordination:
  - Follow architecture from memory
  - Implement API contracts exactly as specified
  - Share progress via hooks after each service
`, "backend-dev")

Task("Frontend Development Team", `
  Build responsive e-commerce interface:
  - Product browsing and search interface
  - User registration and login flows
  - Shopping cart and checkout process
  - User account management
  - Admin dashboard for management

  Technical requirements:
  - React + TypeScript + Tailwind CSS
  - State management with Redux Toolkit
  - Form validation with React Hook Form
  - Payment UI with Stripe Elements
  - Mobile-responsive design

  Coordination:
  - Use API contracts from memory
  - Coordinate with backend team via hooks
  - Share UI components and design patterns
`, "frontend-dev")

Task("DevOps and Infrastructure Team", `
  Setup production-ready infrastructure:
  - Docker containerization for all services
  - Kubernetes deployment manifests
  - CI/CD pipeline with GitHub Actions
  - Monitoring with Prometheus and Grafana
  - Logging with ELK stack
  - SSL certificates and domain setup

  Security requirements:
  - Network policies and security groups
  - Secret management with Kubernetes secrets
  - Database encryption and backups
  - Rate limiting and DDoS protection

  Coordination:
  - Review deployment requirements from memory
  - Coordinate with dev teams for deployment configs
`, "cicd-engineer")

Task("Quality Assurance Team", `
  Implement comprehensive testing strategy:
  - Unit tests for all business logic (90% coverage)
  - Integration tests for API endpoints
  - End-to-end tests for critical user journeys
  - Performance testing and load testing
  - Security testing and penetration testing

  Testing tools:
  - Jest for unit tests
  - Supertest for API testing
  - Cypress for E2E testing
  - Artillery for load testing
  - OWASP ZAP for security testing

  Coordination:
  - Review API contracts and requirements from memory
  - Coordinate test data setup with dev teams
`, "tester")

Task("Security and Compliance Team", `
  Ensure security and compliance:
  - Security audit of authentication and authorization
  - Payment security compliance (PCI DSS)
  - Data privacy compliance (GDPR)
  - Vulnerability assessment and remediation
  - Security documentation and procedures

  Security measures:
  - Input validation and sanitization
  - SQL injection prevention
  - XSS protection
  - CSRF protection
  - Rate limiting and brute force protection

  Coordination:
  - Review security requirements from memory
  - Share security findings and recommendations
`, "security-manager")

// Step 5: Monitor coordination and progress
mcp__claude-flow__swarm_monitor({
  duration: 300, // 5 minutes
  interval: 30   // 30 seconds
})
```

### Example 2: API Development with Security Focus

```javascript
// Step 1: Initialize security-focused swarm
mcp__claude-flow__swarm_init({
  topology: "ring", // Ensures each agent reviews the next
  maxAgents: 4,
  strategy: "security-first"
})

// Step 2: Store security requirements
mcp__claude-flow__memory_usage({
  action: "store",
  key: "security/requirements",
  value: JSON.stringify({
    compliance: ["SOC2", "GDPR", "HIPAA"],
    authentication: "OAuth2 + JWT",
    encryption: "AES-256 at rest, TLS 1.3 in transit",
    audit: "Full audit trail required",
    rate_limiting: "100 requests/minute per user",
    monitoring: "Real-time threat detection"
  }),
  namespace: "security-context"
})

// Step 3: Spawn security-focused development team
Task("API Developer", `
  Build secure REST API:
  - User management endpoints with proper authorization
  - Data endpoints with field-level permissions
  - File upload with virus scanning
  - Audit logging for all operations

  Security implementation:
  - OAuth2 with PKCE
  - JWT with short expiration and refresh tokens
  - Input validation with Joi schemas
  - SQL injection prevention with parameterized queries
  - XSS protection with content security policies

  Coordination:
  - Review security requirements from memory
  - Implement exactly as specified by security team
`, "backend-dev")

Task("Security Specialist", `
  Implement comprehensive security measures:
  - Security middleware and authentication guards
  - Rate limiting and DDoS protection
  - Encryption utilities and key management
  - Security audit logging
  - Vulnerability scanning integration

  Security tools:
  - Helmet.js for HTTP security headers
  - bcrypt for password hashing
  - jsonwebtoken for JWT handling
  - express-rate-limit for rate limiting
  - OWASP security guidelines implementation

  Coordination:
  - Review API implementation for security issues
  - Share security utilities with dev team
`, "security-manager")

Task("Security Tester", `
  Perform comprehensive security testing:
  - Penetration testing of all endpoints
  - Authentication and authorization testing
  - Input validation testing (SQL injection, XSS)
  - Rate limiting effectiveness testing
  - Session management security testing

  Testing tools:
  - OWASP ZAP for automated security scanning
  - Burp Suite for manual penetration testing
  - Postman for authentication flow testing
  - Custom scripts for edge case testing

  Coordination:
  - Test against security requirements from memory
  - Report findings to security and dev teams
`, "security-tester")

Task("Compliance Auditor", `
  Ensure regulatory compliance:
  - GDPR compliance audit (data privacy)
  - SOC2 compliance review (security controls)
  - HIPAA compliance if handling health data
  - Documentation of compliance measures

  Audit areas:
  - Data collection and processing
  - User consent management
  - Data retention and deletion
  - Access controls and logging
  - Incident response procedures

  Coordination:
  - Review compliance requirements from memory
  - Validate implementation against standards
`, "compliance-auditor")
```

### Example 3: Legacy System Migration

```javascript
// Step 1: Initialize migration-focused coordination
mcp__claude-flow__swarm_init({
  topology: "star", // Central coordinator manages migration
  coordinator: "migration-architect",
  maxAgents: 8,
  strategy: "risk-minimized"
})

// Step 2: Store migration context
mcp__claude-flow__memory_usage({
  action: "store",
  key: "migration/context",
  value: JSON.stringify({
    legacy_system: {
      technology: "PHP 5.6 + MySQL",
      architecture: "Monolithic",
      database_size: "500GB",
      daily_users: "50000",
      critical_features: ["user-management", "billing", "reporting"]
    },
    target_system: {
      technology: "Node.js + PostgreSQL",
      architecture: "Microservices",
      cloud_platform: "AWS",
      migration_strategy: "Strangler Fig Pattern"
    },
    constraints: {
      zero_downtime: true,
      data_integrity: "critical",
      rollback_plan: "required",
      timeline: "6 months"
    }
  }),
  namespace: "migration-context"
})

// Step 3: Orchestrate migration workflow
mcp__claude-flow__task_orchestrate({
  task: "Migrate legacy PHP monolith to Node.js microservices with zero downtime",
  strategy: "sequential", // Migration requires careful sequencing
  maxAgents: 6,
  priority: "critical"
})

// Step 4: Spawn specialized migration team
Task("Migration Architect", `
  Design comprehensive migration strategy:
  - Analyze legacy system architecture and dependencies
  - Design microservices boundaries and data flow
  - Plan Strangler Fig pattern implementation
  - Create rollback procedures for each phase
  - Design data migration strategy with validation

  Deliverables:
  - Migration roadmap with phases and timelines
  - Risk assessment and mitigation strategies
  - Data mapping and transformation specifications
  - Testing strategy for each migration phase

  Coordination:
  - Store all migration decisions in memory
  - Create detailed specifications for dev teams
`, "migration-architect")

Task("Legacy System Analyst", `
  Analyze and document legacy system:
  - Map all existing APIs and dependencies
  - Analyze database schema and data relationships
  - Identify critical business logic and edge cases
  - Document integration points and external systems
  - Assess performance characteristics and bottlenecks

  Analysis tools:
  - Static code analysis for PHP codebase
  - Database schema analysis and optimization
  - API traffic analysis and documentation
  - Performance profiling and bottleneck identification

  Coordination:
  - Store analysis results in memory for dev teams
  - Share findings with migration architect
`, "code-analyzer")

Task("Microservices Development Team", `
  Build new microservices to replace legacy components:
  - User management service (replace legacy auth)
  - Billing service (replace legacy payment system)
  - Reporting service (replace legacy reports)
  - API gateway for routing and authentication

  Implementation requirements:
  - Node.js + Express + TypeScript
  - PostgreSQL with proper migrations
  - Redis for caching and sessions
  - Message queues for async processing
  - Comprehensive logging and monitoring

  Migration strategy:
  - Implement Strangler Fig pattern
  - Maintain backward compatibility
  - Support gradual traffic shifting

  Coordination:
  - Follow migration architecture from memory
  - Coordinate with data migration team
`, "backend-dev")

Task("Data Migration Specialist", `
  Handle all data migration requirements:
  - Design ETL processes for data transformation
  - Implement incremental data synchronization
  - Create data validation and integrity checks
  - Plan and execute database migrations
  - Handle data cleanup and optimization

  Technical approach:
  - MySQL to PostgreSQL migration tools
  - Custom ETL scripts for data transformation
  - Real-time data synchronization during transition
  - Data validation scripts to ensure integrity

  Coordination:
  - Follow data mapping from migration architect
  - Coordinate with dev team for schema changes
`, "data-engineer")

Task("DevOps Migration Team", `
  Setup infrastructure for parallel systems:
  - AWS infrastructure for new microservices
  - Blue-green deployment setup for zero downtime
  - Monitoring and alerting for both systems
  - Load balancing and traffic routing
  - Backup and disaster recovery procedures

  Infrastructure requirements:
  - Kubernetes cluster for microservices
  - RDS PostgreSQL with read replicas
  - ElastiCache Redis cluster
  - Application Load Balancer with routing rules
  - CloudWatch monitoring and alerting

  Coordination:
  - Follow infrastructure requirements from memory
  - Support gradual traffic migration
`, "cicd-engineer")

Task("Migration Testing Team", `
  Comprehensive testing throughout migration:
  - Parallel testing of old and new systems
  - Data integrity validation after migration
  - Performance testing under production load
  - End-to-end testing of critical user journeys
  - Rollback testing and procedures

  Testing strategy:
  - Automated regression testing suite
  - Data validation scripts
  - Performance benchmarking
  - User acceptance testing scenarios
  - Chaos engineering for resilience testing

  Coordination:
  - Test against legacy system behavior
  - Validate migration requirements from memory
`, "tester")
```

---

## 🚨 Troubleshooting

### Common MCP Integration Issues

#### Issue 1: MCP Server Connection Failed

**Symptoms:**
- MCP tools return connection errors
- `claude mcp status` shows server as offline

**Solutions:**
```bash
# Check MCP server status
claude mcp status claude-flow

# Restart MCP server
claude mcp restart claude-flow

# Reinstall if needed
claude mcp remove claude-flow
claude mcp add claude-flow-novice npx claude-flow@alpha mcp start

# Check for port conflicts
lsof -i :8080  # Default MCP port
```

#### Issue 2: Task Tool Agents Not Coordinating

**Symptoms:**
- Agents work in isolation
- No shared context between agents
- Memory system not accessible

**Solutions:**
```javascript
// Ensure agents use coordination hooks
Task("Developer", `
  // Add coordination protocol to agent instructions
  Before starting:
  - Run: npx claude-flow@alpha hooks pre-task --description "[task]"
  - Run: npx claude-flow@alpha hooks session-restore --session-id "swarm-001"

  During work:
  - Run: npx claude-flow@alpha hooks post-edit --file "[file]" --memory-key "progress"

  After completion:
  - Run: npx claude-flow@alpha hooks post-task --task-id "[task]"
`, "coder")

// Verify MCP memory system is working
mcp__claude-flow__memory_usage({
  action: "store",
  key: "test/coordination",
  value: "test value",
  namespace: "troubleshooting"
})

mcp__claude-flow__memory_usage({
  action: "retrieve",
  key: "test/coordination",
  namespace: "troubleshooting"
})
```

#### Issue 3: Swarm Topology Not Effective

**Symptoms:**
- Agents duplicate work
- Poor coordination efficiency
- Bottlenecks in communication

**Solutions:**
```javascript
// Analyze current topology
mcp__claude-flow__swarm_status({ verbose: true })

// Try different topology based on team size
// Small team (2-3 agents): mesh
mcp__claude-flow__swarm_init({ topology: "mesh", maxAgents: 3 })

// Medium team (4-6 agents): ring
mcp__claude-flow__swarm_init({ topology: "ring", maxAgents: 6 })

// Large team (7+ agents): hierarchical
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  coordinator: "system-architect",
  maxAgents: 10
})

// Complex projects: adaptive
mcp__claude-flow__swarm_init({
  topology: "adaptive",
  strategy: "dynamic",
  autoScale: true
})
```

#### Issue 4: Memory System Performance Issues

**Symptoms:**
- Slow memory retrieval
- Memory namespace conflicts
- TTL issues with stored data

**Solutions:**
```javascript
// Check memory usage and performance
mcp__claude-flow__memory_usage({ detail: "detailed" })

// Clean up expired entries
mcp__claude-flow__memory_usage({
  action: "search",
  pattern: "*",
  namespace: "cleanup"
})

// Use appropriate TTL values
mcp__claude-flow__memory_usage({
  action: "store",
  key: "session/short-term",
  value: "temp data",
  ttl: 3600 // 1 hour for temporary data
})

mcp__claude-flow__memory_usage({
  action: "store",
  key: "project/architecture",
  value: "permanent data",
  ttl: 604800 // 7 days for project data
})

// Use specific namespaces to avoid conflicts
mcp__claude-flow__memory_usage({
  action: "store",
  key: "config",
  value: "project config",
  namespace: "project-alpha"
})

mcp__claude-flow__memory_usage({
  action: "store",
  key: "config",
  value: "different config",
  namespace: "project-beta"
})
```

#### Issue 5: GitHub Integration Not Working

**Symptoms:**
- GitHub MCP tools fail
- Repository access issues
- CI/CD integration problems

**Solutions:**
```bash
# Check GitHub authentication
gh auth status
gh auth login  # If not authenticated

# Verify repository access
gh repo view owner/repository

# Test GitHub MCP integration
```

```javascript
mcp__claude-flow__github_repo_analyze({
  repo: "owner/repository",
  analysis_type: "code_quality"
})
```

### Performance Optimization

#### Optimize Agent Coordination

```javascript
// Monitor coordination efficiency
mcp__claude-flow__swarm_monitor({
  duration: 120,
  interval: 10,
  metrics: ["coordination-efficiency", "communication-overhead"]
})

// Adjust coordination strategy based on metrics
mcp__claude-flow__topology_optimize({
  swarmId: "current-swarm"
})
```

#### Optimize Memory Usage

```javascript
// Compress memory data for large projects
mcp__claude-flow__memory_compress({
  namespace: "project-context"
})

// Backup important memory before cleanup
mcp__claude-flow__memory_backup({
  path: "./backups/project-memory-$(date +%Y%m%d).json"
})
```

#### Monitor System Health

```javascript
// Regular health checks
mcp__claude-flow__health_check({
  components: ["swarm", "memory", "agents", "coordination"]
})

// Performance benchmarks
mcp__claude-flow__benchmark_run({
  type: "all",
  iterations: 5
})
```

### Getting Help

**Documentation:**
- [MCP Integration Guide](../../getting-started/claude-code-mcp/README.md)
- [Core Concepts](../../core-concepts/README.md)
- [Agent Coordination](../../core-concepts/swarm-coordination/README.md)

**Community Support:**
- [GitHub Issues](https://github.com/ruvnet/claude-flow/issues)
- [Community Forum](../../community/README.md)
- [Discord Server](https://discord.gg/claude-flow)

**CLI Debugging:**
```bash
# Enable debug mode
npx claude-flow@alpha config set debug true

# View detailed logs
npx claude-flow@alpha logs --level debug

# Export system diagnostics
npx claude-flow@alpha diagnostic export --output ./debug-report.json
```

---

**Ready to integrate?** Start with basic coordination using `mcp__claude-flow__swarm_init` and gradually explore advanced features like autonomous agents and neural training.

**Need help?** Check [MCP Integration Guide](../../getting-started/claude-code-mcp/README.md) or [Troubleshooting](#troubleshooting) above.