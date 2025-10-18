# Agent Coordination Guide

This guide covers swarm initialization, agent types, topology selection, and memory sharing patterns for effective multi-agent coordination.

---

## Swarm Initialization (MANDATORY)

### Why Swarm Initialization Matters

**WITHOUT swarm_init (problematic):**
```javascript
// ❌ BAD: Agents work independently with no coordination
[Single Message]:
  Task("Agent 1", "Fix JWT secret issue", "coder")
  Task("Agent 2", "Fix JWT secret issue", "coder")
  Task("Agent 3", "Fix JWT secret issue", "coder")

// Result: 3 different solutions
// - Agent 1: Environment variable
// - Agent 2: Config file
// - Agent 3: Hardcoded
// Problem: Inconsistent approach, wasted effort, integration conflicts
```

**WITH swarm_init (correct):**
```javascript
// ✅ GOOD: Agents coordinate through swarm
[Single Message]:
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  Task("Agent 1", "Fix JWT secret issue", "coder")
  Task("Agent 2", "Fix JWT secret issue", "coder")
  Task("Agent 3", "Fix JWT secret issue", "coder")

// Result: All 3 agents agree on environment variable approach
// Benefit: Consistent solution, shared context, coordinated implementation
```

### Initialization Pattern

```javascript
// Universal pattern for ALL multi-agent tasks
[Single Message]:
  // Step 1: ALWAYS initialize swarm first
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",          // or "hierarchical" for 8+ agents
    maxAgents: X,              // match your actual agent count
    strategy: "balanced"       // or "adaptive" for complex tasks
  })

  // Step 2: Spawn ALL agents concurrently
  Task("Agent Name", "Specific task instructions", "agent-type")
  Task("Agent Name", "Specific task instructions", "agent-type")
  Task("Agent Name", "Specific task instructions", "agent-type")
```

---

## Topology Selection

### Mesh Topology (2-7 Agents)

**Characteristics:**
- Peer-to-peer coordination
- Equal collaboration
- No central coordinator
- Best for simple to medium tasks

**When to Use:**
- 2-7 agents
- Collaborative work (all agents contribute equally)
- Rapid iteration needed
- No strict hierarchy required

**Example:**
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 5,
  strategy: "balanced"
})

// 5 agents coordinate directly with each other
// Communication: O(n²) - every agent talks to every agent
```

**Communication Pattern:**
```
     Agent1 ←→ Agent2
        ↕  ╳   ↕
     Agent3 ←→ Agent4
        ↕      ↕
     Agent5 ←→ Agent5
```

### Hierarchical Topology (8+ Agents)

**Characteristics:**
- Coordinator-led structure
- Specialized roles
- Structured delegation
- Best for complex tasks

**When to Use:**
- 8+ agents
- Complex multi-phase projects
- Clear role separation needed
- Coordinator can manage sub-teams

**Example:**
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "hierarchical",
  maxAgents: 12,
  strategy: "adaptive"
})

// 1 coordinator + 11 specialists
// Communication: O(n) - agents report to coordinator
```

**Communication Pattern:**
```
           Coordinator
          ╱   ╱   ╲   ╲
    Backend Frontend Security DevOps
      ╱ ╲      ╱ ╲       |       |
   Dev1 Dev2  UI1 UI2  Audit  Deploy
```

---

## Strategy Selection

### Balanced Strategy

**Characteristics:**
- Even workload distribution
- All agents have equal priority
- Predictable resource usage

**When to Use:**
- Tasks with similar complexity across agents
- Uniform skill requirements
- Consistent quality expectations

**Example:**
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 4,
  strategy: "balanced"
})
```

### Adaptive Strategy

**Characteristics:**
- Dynamic workload adjustment
- Priority-based task allocation
- Handles variable complexity

**When to Use:**
- Complex tasks with varying difficulty
- Some agents more critical than others
- Need to optimize for completion time

**Example:**
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "hierarchical",
  maxAgents: 12,
  strategy: "adaptive"
})
```

---

## Agent Types and Roles

### Core Development Agents

#### coder
**Role:** General-purpose implementation
**Use Cases:** Feature development, bug fixes, refactoring
**Skills:** Programming, debugging, code quality

**Example:**
```javascript
Task("Full-Stack Coder", `
  Implement user authentication:
  - Create login/logout endpoints
  - Add JWT token generation
  - Implement session management
`, "coder")
```

#### backend-dev
**Role:** Backend-specific implementation
**Use Cases:** APIs, databases, server logic
**Skills:** Node.js, databases, REST/GraphQL

**Example:**
```javascript
Task("Backend Developer", `
  Build REST API:
  - Design endpoints
  - Implement business logic
  - Add database queries
`, "backend-dev")
```

#### frontend-dev
**Role:** Frontend-specific implementation
**Use Cases:** UI components, client logic, state management
**Skills:** React, Vue, CSS, UX

**Example:**
```javascript
Task("Frontend Developer", `
  Build user dashboard:
  - Create React components
  - Implement state management
  - Add responsive design
`, "frontend-dev")
```

### Quality Assurance Agents

#### tester
**Role:** Test writing and validation
**Use Cases:** Unit tests, integration tests, E2E tests
**Skills:** Jest, Mocha, Playwright, test design

**Example:**
```javascript
Task("Test Engineer", `
  Write comprehensive tests:
  - Unit tests for all functions
  - Integration tests for API
  - Achieve 80%+ coverage
`, "tester")
```

#### reviewer
**Role:** Code quality review
**Use Cases:** Architecture review, maintainability, best practices
**Skills:** Design patterns, refactoring, code review

**Example:**
```javascript
Task("Code Reviewer", `
  Comprehensive review:
  - Check code quality
  - Validate architecture
  - Ensure best practices
`, "reviewer")
```

#### security-specialist
**Role:** Security auditing
**Use Cases:** Auth systems, vulnerability scanning, compliance
**Skills:** Security best practices, OWASP, penetration testing

**Example:**
```javascript
Task("Security Specialist", `
  Security audit:
  - Check for vulnerabilities
  - Validate authentication
  - Ensure encryption
`, "security-specialist")
```

### Architecture & Planning Agents

#### system-architect
**Role:** System design and architecture
**Use Cases:** High-level design, scalability, integration
**Skills:** Architecture patterns, system design, scalability

**Example:**
```javascript
Task("System Architect", `
  Design microservices architecture:
  - Define service boundaries
  - Plan communication patterns
  - Ensure scalability
`, "system-architect")
```

#### researcher
**Role:** Technical research and exploration
**Use Cases:** Technology evaluation, proof of concept
**Skills:** Research, documentation review, prototyping

**Example:**
```javascript
Task("Researcher", `
  Research authentication solutions:
  - Compare OAuth2 vs JWT
  - Evaluate libraries
  - Recommend best approach
`, "researcher")
```

### Operations & Documentation Agents

#### devops-engineer
**Role:** Deployment and infrastructure
**Use Cases:** Docker, Kubernetes, CI/CD
**Skills:** DevOps, containerization, automation

**Example:**
```javascript
Task("DevOps Engineer", `
  Setup deployment pipeline:
  - Create Dockerfile
  - Configure K8s manifests
  - Setup CI/CD workflow
`, "devops-engineer")
```

#### api-docs
**Role:** Documentation writing
**Use Cases:** API docs, README, guides
**Skills:** Technical writing, OpenAPI, Markdown

**Example:**
```javascript
Task("API Documenter", `
  Document API:
  - Create OpenAPI spec
  - Write endpoint documentation
  - Add usage examples
`, "api-docs")
```

---

## Agent Selection Guide

### Simple Tasks (3-5 Steps)
**Example:** Add REST endpoint, fix bug, refactor function

**Recommended Team (2-3 agents):**
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 3,
  strategy: "balanced"
})

Task("Coder", "Implement feature", "coder")
Task("Tester", "Write tests", "tester")
Task("Reviewer", "Review code", "reviewer")
```

### Medium Tasks (6-10 Steps)
**Example:** WebSocket real-time chat, OAuth integration

**Recommended Team (4-6 agents):**
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 6,
  strategy: "balanced"
})

Task("Backend Dev", "Server implementation", "backend-dev")
Task("Frontend Dev", "Client implementation", "frontend-dev")
Task("Security", "Security audit", "security-specialist")
Task("Tester", "Integration tests", "tester")
Task("Reviewer", "Code review", "reviewer")
Task("API Docs", "Documentation", "api-docs")
```

### Complex Tasks (11-20 Steps)
**Example:** Microservices API gateway, full auth system

**Recommended Team (8-12 agents):**
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "hierarchical",
  maxAgents: 12,
  strategy: "adaptive"
})

Task("Architect", "System design", "system-architect")
Task("Backend Dev", "Core implementation", "backend-dev")
Task("Security", "Security implementation", "security-specialist")
Task("DevOps", "Infrastructure setup", "devops-engineer")
Task("Perf Analyzer", "Performance optimization", "perf-analyzer")
Task("DB Specialist", "Database design", "database-specialist")
Task("Network Engineer", "Load balancing", "network-engineer")
Task("Monitoring", "Observability", "monitoring-specialist")
Task("Tester", "Comprehensive testing", "tester")
Task("API Docs", "Documentation", "api-docs")
Task("Compliance", "Regulatory audit", "compliance-auditor")
Task("Reviewer", "Final review", "reviewer")
```

### Enterprise Tasks (20+ Steps)
**Example:** Complete SaaS platform, multi-tenant system

**Recommended Team (15-20 agents):**
- All agents from Complex + additional specialists
- Multiple agents per domain (e.g., 2 backend devs, 2 frontend devs)
- Dedicated coordinator role

---

## Memory Sharing Patterns

### SwarmMemory Architecture

**Purpose:** Enable cross-agent coordination through shared state

**Storage:** `.swarm/swarm-memory.db` (SQLite)

**Namespace Hierarchy:**
```
swarm/
├── {swarm-id}/
│   ├── agents/
│   │   ├── {agent-id}/
│   │   │   ├── tasks/
│   │   │   │   └── {task-id}/
│   │   │   │       ├── deliverables
│   │   │   │       ├── confidence
│   │   │   │       └── validation
│   │   │   └── learning/
│   │   │       ├── patterns
│   │   │       └── errors
│   ├── consensus/
│   │   └── {round-id}/
│   │       ├── validators
│   │       └── decision
│   └── iterations/
│       └── round-{n}/
│           └── feedback
```

### Memory Key Patterns

#### Agent Task Memory
```javascript
// Format: swarm/{agent-id}/{task-name}
const key = "swarm/backend-dev/jwt-auth";

await swarmMemory.store(key, {
  timestamp: Date.now(),
  agent: "backend-dev",
  task: "jwt-auth",
  deliverables: {
    files: ["src/auth/jwt-handler.js", "tests/auth/jwt.test.js"],
    linesChanged: 247
  },
  validation: {
    confidence: 0.92,
    coverage: 87,
    passed: true
  }
});
```

#### Consensus Round Memory
```javascript
// Format: swarm/consensus/{task-id}/round-{n}
const key = "swarm/consensus/jwt-auth/round-1";

await swarmMemory.store(key, {
  round: 1,
  validators: [
    { id: "reviewer", approve: true, confidence: 0.93 },
    { id: "security", approve: true, confidence: 0.95 }
  ],
  agreementRate: 1.0,
  decision: "PASS"
});
```

#### Learning Patterns Memory
```javascript
// Format: swarm/{agent-id}/learning/patterns
const key = "swarm/backend-dev/learning/patterns";

await swarmMemory.store(key, {
  successPatterns: [
    {
      pattern: "JWT authentication",
      approach: "bcrypt + jsonwebtoken",
      confidence: 0.95,
      occurrences: 3
    }
  ],
  commonErrors: [
    {
      error: "Hardcoded secrets",
      solution: "Environment variables",
      occurrences: 5
    }
  ]
});
```

### Memory Access Patterns

#### Store Operation
```javascript
import { SwarmMemory } from '../memory/swarm-memory.js';

const memory = new SwarmMemory({
  swarmId: 'jwt-auth-swarm',
  directory: '.swarm',
  filename: 'swarm-memory.db'
});

await memory.initialize();

await memory.store('swarm/backend-dev/jwt-auth', {
  confidence: 0.92,
  deliverables: ['jwt-handler.js']
});
```

#### Retrieve Operation
```javascript
// Retrieve specific task data
const taskData = await memory.retrieve('swarm/backend-dev/jwt-auth');

// Retrieve all agent tasks
const agentTasks = await memory.search('swarm/backend-dev/*');

// Retrieve consensus history
const consensusHistory = await memory.search('swarm/consensus/*/round-*');
```

#### Search with Filters
```javascript
// Find all high-confidence tasks
const highConfidenceTasks = await memory.search('swarm/*/tasks/*', {
  filter: (data) => data.validation?.confidence >= 0.90
});

// Find all failed consensus rounds
const failedRounds = await memory.search('swarm/consensus/*/round-*', {
  filter: (data) => data.decision === 'FAIL'
});
```

---

## Coordination Checklist

### Before Spawning Agents

- ✅ Task analyzed and complexity assessed
- ✅ Agent count determined from requirements
- ✅ Agent types selected for specific needs
- ✅ Topology chosen (mesh 2-7, hierarchical 8+)
- ✅ All agents will spawn in SINGLE message
- ✅ Each agent has specific, non-overlapping instructions

### During Execution

- ✅ Agents coordinate through SwarmMemory
- ✅ Self-validation runs for each agent
- ✅ Post-edit hooks execute after file changes
- ✅ Feedback shared across iterations

### After Completion

- ✅ Consensus validation achieved (≥90% agreement)
- ✅ Results stored in memory
- ✅ Next steps determined
- ✅ Patterns recorded for future learning

---

## Best Practices

### DO: Agent Coordination
- ✅ ALWAYS initialize swarm for multi-agent tasks
- ✅ Match topology to agent count (mesh 2-7, hierarchical 8+)
- ✅ Select specialist agents for specific domains
- ✅ Spawn all agents in single message
- ✅ Use SwarmMemory for cross-agent communication

### DON'T: Common Mistakes
- ❌ Skip swarm_init (causes inconsistent solutions)
- ❌ Use generic agent names (agent1, agent2)
- ❌ Spawn agents sequentially (slower, less coordination)
- ❌ Use hierarchical for <8 agents (unnecessary overhead)
- ❌ Ignore memory namespacing (causes data collisions)

---

## Next Steps

- **[Confidence Scores](Confidence-Scores.md)** - Understand scoring system
- **[Security](Security.md)** - Security best practices
- **[Troubleshooting](Troubleshooting.md)** - Fix coordination issues
- **[API Reference](API-Reference.md)** - Deep dive into SwarmMemory API

---

**Last Updated:** 2025-10-02
**Version:** 1.5.22
