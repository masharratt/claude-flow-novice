# Agent Spawning Skill

## Overview

Agent spawning is the foundational skill for multi-agent coordination in Claude Flow Novice. This skill enables efficient, cost-optimized parallel task execution through CLI-based agent orchestration with explicit agent typing.

**Core Value Proposition:**
- $0 coordinator cost (Claude Max subscription)
- ~$0.50 worker cost (z.ai provider @ $0.50/1M tokens)
- 95-98% cost savings vs pure Claude execution
- Redis-backed coordination with SQLite persistence

---

## 1. CLI Spawning Pattern (REQUIRED)

### 1.1 Correct Pattern (REQUIRED --agents flag)

```bash
# ✅ CORRECT: Explicit typed agents
node src/cli/hybrid-routing/spawn-workers.js \
  "Implement authentication system" \
  --agents=architect,backend-dev,security-specialist,tester \
  --provider zai \
  --redis-channel swarm:auth
```

**Required Parameters:**
- `--agents`: Comma-separated list of agent types (REQUIRED)
- `--provider`: AI provider (default: zai)
- `--redis-channel`: Redis coordination channel (optional)

**Optional Parameters:**
- `--model`: Model selection (default: haiku)
- `--topology`: Coordination pattern (default: sequential)
- `--timeout`: Worker timeout in ms (default: 120000)
- `--background`: Run in background mode (default: false)

### 1.2 Invalid Patterns (WILL ERROR)

```bash
# ❌ WRONG: Missing --agents flag
node src/cli/hybrid-routing/spawn-workers.js \
  "Build feature" --max-agents 3

# ❌ WRONG: No agent types specified
node src/cli/hybrid-routing/spawn-workers.js \
  "Task description"

# ❌ WRONG: Invalid agent types
node src/cli/hybrid-routing/spawn-workers.js \
  "Task" --agents=invalid-agent,fake-type
```

**Error Handling:**
- Missing `--agents` flag → CLI will error immediately
- Invalid agent types → CLI will warn and suggest valid alternatives
- All agent types MUST exist in `.claude/agents/` with valid frontmatter

---

## 2. Agent Selection Strategy

### 2.1 Selection Principles

**Domain-Based Selection:**
1. Identify task domain (security, performance, architecture, development, testing)
2. Select primary agents from domain specialists
3. Add supporting agents for validation/quality
4. Consider CFN Loop mode for enterprise requirements

**Capability-Based Selection:**
| Task Type | Primary Agents | Supporting Agents |
|-----------|----------------|-------------------|
| Feature Development | architect, coder | tester, code-analyzer |
| Security Audit | security-specialist | code-analyzer, tester, production-validator |
| Performance Optimization | perf-analyzer, code-booster | tester |
| System Architecture | system-architect, architect | devops-engineer, security-architect-persona |
| API Development | api-designer-persona, backend-dev | api-docs, security-specialist, tester |
| Mobile Development | mobile-dev, react-frontend-engineer | tester |
| Infrastructure Setup | devops-engineer, system-architect | security-specialist |

### 2.2 Agent Count Guidelines

**Mesh Topology (2-7 agents):**
- Simple parallel execution
- Minimal coordination overhead
- Suitable for most standard tasks

**Hierarchical Topology (8+ agents):**
- Complex multi-level coordination
- Coordinator + team leads + workers
- Enterprise-scale implementations

**Example Scaling:**
```bash
# Small task (2-3 agents)
--agents=coder,tester

# Medium task (4-5 agents)
--agents=architect,backend-dev,security-specialist,tester,reviewer

# Large task (6-7 agents)
--agents=analyst,system-architect,backend-dev,frontend-dev,security-specialist,tester,reviewer

# Enterprise task (8+ agents) - Use coordinator-hybrid to manage
--agents=coordinator-hybrid  # Will spawn sub-teams dynamically
```

---

## 3. Topology Selection

### 3.1 Available Topologies

**Sequential (Default):**
- Linear task execution
- Timeout: 2 minutes (120000ms)
- Use for: Simple parallel work without dependencies

**Bidirectional:**
- Iterative feedback loops
- Timeout: 5 minutes (300000ms)
- Use for: Tasks requiring peer review/iteration

**Collaborative:**
- Q&A coordination + collaborative work
- Timeout: 6 minutes (360000ms)
- Use for: Complex problem-solving requiring discussion

**Release-Gate:**
- Barrier synchronization + validation gates
- Timeout: 6 minutes (360000ms)
- Use for: Production deployments with quality gates

### 3.2 Topology Selection Examples

```bash
# Sequential (default) - fast parallel execution
node src/cli/hybrid-routing/spawn-workers.js \
  "Implement CRUD endpoints" \
  --agents=backend-dev,tester \
  --topology sequential

# Bidirectional - iterative design review
node src/cli/hybrid-routing/spawn-workers.js \
  "Design system architecture" \
  --agents=architect,reviewer \
  --topology bidirectional

# Collaborative - complex problem solving
node src/cli/hybrid-routing/spawn-workers.js \
  "Optimize distributed query performance" \
  --agents=perf-analyzer,backend-dev,devops-engineer \
  --topology collaborative

# Release-Gate - production deployment
node src/cli/hybrid-routing/spawn-workers.js \
  "Deploy v2.0 to production" \
  --agents=devops-engineer,security-specialist,production-validator \
  --topology release-gate
```

---

## 4. Cost Optimization

### 4.1 Cost Structure

**Coordinator (Main Chat):**
- Cost: $0 (Claude Max subscription)
- Model: Claude 3.5 Sonnet
- Quality: Highest available
- Role: Intelligent orchestration, error recovery, consensus calculation

**Workers (CLI-spawned agents):**
- Cost: ~$0.10-2/1M tokens (z.ai provider)
- Model: GLM-4.6 (haiku equivalent)
- Quality: Good for implementation work
- Role: Actual task execution

### 4.2 Typical Phase Cost Example

**5-agent Feature Development:**
```
Workers: 5 agents × 200K tokens × $0.50/1M = $0.50
Coordinator: $0 (subscription)
Total: $0.50

Pure Claude Equivalent: 5 agents × 200K tokens × $15/1M = $15
Savings: $14.50 (97% cost reduction)
```

**Enterprise 10-agent System:**
```
Workers: 10 agents × 250K tokens × $0.50/1M = $1.25
Coordinator: $0 (subscription)
Total: $1.25

Pure Claude Equivalent: 10 agents × 250K tokens × $15/1M = $37.50
Savings: $36.25 (97% cost reduction)
```

### 4.3 Cost Optimization Strategies

1. **Use coordinator-hybrid for orchestration** (no cost, highest quality)
2. **Spawn workers with z.ai provider** (97% cost reduction)
3. **Batch agent spawning** (single message = single spawn overhead)
4. **Right-size agent count** (3-5 agents optimal for most tasks)
5. **Use Redis persistence** (enable recovery without re-spawning)

---

## 5. Redis Integration Patterns

### 5.1 Coordination Channels

**Channel Naming Convention:**
```
swarm:{scope}:{phase}:{detail}
```

**Examples:**
```bash
# Feature-level coordination
--redis-channel swarm:auth:implementation

# Sprint-level coordination
--redis-channel swarm:skills:sprint-1.2

# Phase-level coordination
--redis-channel swarm:phase-0:mcp-less-foundation

# System-level coordination
--redis-channel swarm:system:deployment
```

### 5.2 Agent Communication Patterns

**LPUSH/BLPOP Queue Pattern:**
```javascript
// Worker pushes result
await redis.lpush('swarm:auth:results', JSON.stringify({
  agent: 'backend-dev',
  status: 'complete',
  confidence: 0.92,
  artifacts: ['auth.ts', 'auth.test.ts']
}));

// Coordinator blocks and waits
const result = await redis.blpop('swarm:auth:results', 30); // 30s timeout
```

**Pub/Sub Broadcast Pattern:**
```javascript
// Coordinator broadcasts update
await redis.publish('swarm:auth:coordination', JSON.stringify({
  event: 'phase-complete',
  phase: 'implementation',
  nextPhase: 'validation'
}));

// All workers subscribe
await redis.subscribe('swarm:auth:coordination', (message) => {
  const event = JSON.parse(message);
  // Handle event
});
```

### 5.3 Dependency Coordination

**See: `.claude/redis-agent-dependencies.md`**

```javascript
// Worker signals dependency completion
await redis.set('agent:architect:design-complete', '1');
await redis.publish('swarm:auth:dependencies', JSON.stringify({
  agent: 'architect',
  dependency: 'design-complete',
  artifact: 'system-design.md'
}));

// Dependent worker waits for signal
const ready = await redis.get('agent:architect:design-complete');
if (!ready) {
  await redis.blpop('swarm:auth:dependencies', 60); // Wait up to 60s
}
```

---

## 6. SQLite Memory Integration

### 6.1 ACL Levels for Agent Spawning

| ACL Level | Scope | Encryption | Use Case |
|-----------|-------|------------|----------|
| 1 | Agent-private | AES-256 | Agent internal state |
| 2 | Team-shared | AES-256 | Team coordination data |
| 3 | Swarm-wide | None | Swarm artifacts, results |
| 4 | Project-wide | None | Cross-swarm knowledge |
| 5 | System-wide | Master key | Audit logs, metrics |

### 6.2 Memory Patterns for Spawned Agents

```javascript
// Worker stores result at ACL Level 3 (swarm-wide)
await memory.memoryAdapter.set(
  'swarm/auth/backend-dev/jwt-impl',
  {
    implementation: 'complete',
    tests: 12,
    coverage: 0.92,
    files: ['jwt.ts', 'jwt.test.ts']
  },
  {
    agentId: 'backend-dev',
    aclLevel: 3,
    namespace: 'swarm/auth',
    ttl: 2592000 // 30 days
  }
);

// Coordinator retrieves all swarm results
const results = await memory.memoryAdapter.query({
  namespace: 'swarm/auth',
  aclLevel: 3
});
```

---

## 7. Acceptance Criteria Validation

### 7.1 Test Scenarios for Agent Selection

**Scenario 1: Feature Development**
```
Task: "Implement user authentication"
Expected: architect, backend-dev, security-specialist, tester
Rationale: Design → Implementation → Security → Validation
```

**Scenario 2: Security Audit**
```
Task: "Audit application for vulnerabilities"
Expected: security-specialist, code-analyzer, tester, production-validator
Rationale: Security lead → Code review → Testing → Production validation
```

**Scenario 3: Performance Optimization**
```
Task: "Optimize slow database queries"
Expected: perf-analyzer, code-booster, backend-dev, tester
Rationale: Analysis → Optimization → Implementation → Validation
```

**Scenario 4: System Architecture**
```
Task: "Design microservices architecture"
Expected: system-architect, architect, devops-engineer, security-architect-persona
Rationale: System design → Component design → Infrastructure → Security
```

**Scenario 5: API Development**
```
Task: "Create REST API for user management"
Expected: api-designer-persona, backend-dev, api-docs, security-specialist, tester
Rationale: API design → Implementation → Documentation → Security → Testing
```

**Scenario 6: Mobile Development**
```
Task: "Build React Native mobile app"
Expected: mobile-dev, react-frontend-engineer, tester
Rationale: Mobile implementation → UI components → Testing
```

**Scenario 7: Infrastructure Setup**
```
Task: "Set up Kubernetes cluster"
Expected: devops-engineer, system-architect, security-specialist
Rationale: Infrastructure → Architecture → Security
```

**Scenario 8: Code Quality Review**
```
Task: "Review codebase for technical debt"
Expected: code-analyzer, code-quality-validator, perf-analyzer
Rationale: General analysis → Deep quality → Performance assessment
```

**Scenario 9: Production Deployment**
```
Task: "Deploy v2.0 to production"
Expected: devops-engineer, security-specialist, production-validator, tester
Rationale: Deployment → Security check → Production validation → Testing
```

**Scenario 10: Multi-Agent Coordination**
```
Task: "Coordinate 8+ agents for enterprise feature"
Expected: coordinator-hybrid, task-coordinator
Rationale: Primary coordination → Workflow management
```

### 7.2 Validation Metrics

**100% Test Coverage:** All 10 scenarios must select correct agent types
**Cost Efficiency:** Coordinator = $0, Workers = ~$0.50 average
**Topology Accuracy:** Correct topology selected based on agent count and task complexity
**Redis Integration:** All spawns must include Redis coordination channel
**SQLite Persistence:** All results stored at correct ACL level

---

## 8. Common Patterns & Best Practices

### 8.1 Single-Message Batch Spawning

**✅ CORRECT:**
```javascript
// Coordinator spawns all agents in single message
await Bash(`
  node src/cli/hybrid-routing/spawn-workers.js
  "Implement authentication system"
  --agents=architect,backend-dev,security-specialist,tester
  --provider zai
  --redis-channel swarm:auth
`);
```

**❌ WRONG:**
```javascript
// ANTI-PATTERN: Multiple spawn calls
await Bash(`node src/cli/hybrid-routing/spawn-workers.js "Task 1" --agents=coder`);
await Bash(`node src/cli/hybrid-routing/spawn-workers.js "Task 2" --agents=tester`);
await Bash(`node src/cli/hybrid-routing/spawn-workers.js "Task 3" --agents=reviewer`);
```

### 8.2 Error Recovery Pattern

```javascript
// Coordinator monitors worker completion
const results = await monitorWorkerCompletions(4, 'swarm:auth');

// Calculate aggregate confidence
const aggregate = {
  consensus: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
  filesModified: results.flatMap(r => r.filesModified),
  testsWritten: results.reduce((sum, r) => sum + r.testsWritten, 0)
};

// Apply CFN Loop decision logic
if (aggregate.consensus < 0.75 && iteration < maxIterations) {
  // LOOP: Relaunch immediately (NO PERMISSION NEEDED)
  await Bash(`
    node src/cli/hybrid-routing/spawn-workers.js
    "Fix identified issues: ${aggregate.issues.join(', ')}"
    --agents=coder,tester
    --provider zai
    --redis-channel swarm:auth:retry-${iteration}
  `);
}
```

### 8.3 Coordinator vs Worker Roles

**Coordinator (Main Chat) Responsibilities:**
- Intelligent task decomposition
- Agent selection via --agents flag
- Progress monitoring via Redis
- Error recovery and re-spawning
- Consensus calculation
- Final validation

**Worker (CLI-spawned) Responsibilities:**
- Execute assigned tasks
- Report progress via Redis
- Store artifacts in SQLite
- Self-validate and report confidence
- Communicate dependencies

---

## 9. Quick Reference

### 9.1 Agent Category Quick Reference

```
🔧 Implementation: coder, backend-dev, react-frontend-engineer, mobile-dev
🏗️  Architecture: architect, system-architect, state-architect
🔒 Security: security-specialist, security-architect-persona, security-manager
✅ Testing: tester, playwright-tester, interaction-tester, production-validator
📊 Analysis: analyst, code-analyzer, perf-analyzer, researcher
🚀 DevOps: devops-engineer, performance-benchmarker
📝 Documentation: api-docs, api-designer-persona
🎯 Coordination: coordinator-hybrid, task-coordinator, adaptive-coordinator
🔄 CFN Loop: cfn-coordinator-mvp, cfn-coordinator-standard, cfn-coordinator-enterprise
```

### 9.2 Common Agent Combinations

```bash
# Standard Feature (4 agents)
--agents=architect,coder,tester,reviewer

# Security-Critical Feature (5 agents)
--agents=architect,backend-dev,security-specialist,tester,production-validator

# High-Performance Feature (5 agents)
--agents=architect,coder,perf-analyzer,code-booster,tester

# Mobile Feature (4 agents)
--agents=mobile-dev,react-frontend-engineer,ui-designer,tester

# API Development (5 agents)
--agents=api-designer-persona,backend-dev,api-docs,security-specialist,tester

# Infrastructure (4 agents)
--agents=devops-engineer,system-architect,security-specialist,tester

# Enterprise System (6 agents)
--agents=system-architect,architect,backend-dev,security-specialist,devops-engineer,production-validator
```

---

## 10. Skill Mastery Checklist

### Level 1: Basic Spawning
- [ ] Understand CLI spawning syntax with --agents flag
- [ ] Select correct agent types from AVAILABLE-AGENTS.md
- [ ] Implement proper topology selection (sequential vs bidirectional vs collaborative)
- [ ] Handle spawning errors gracefully

### Level 2: Coordination
- [ ] Design Redis coordination channels
- [ ] Implement LPUSH/BLPOP queue patterns
- [ ] Use Pub/Sub for broadcast coordination
- [ ] Handle agent dependencies via Redis

### Level 3: Optimization
- [ ] Calculate cost efficiency (coordinator vs workers)
- [ ] Optimize agent count for task complexity
- [ ] Implement SQLite persistence with correct ACL levels
- [ ] Apply error recovery patterns

### Level 4: Enterprise
- [ ] Coordinate 8+ agents with hierarchical topology
- [ ] Implement CFN Loop integration with consensus thresholds
- [ ] Design multi-phase spawning strategies
- [ ] Monitor and optimize swarm performance metrics

---

## 11. Related Documentation

- **AVAILABLE-AGENTS.md** - Complete agent type reference with capabilities
- **spawn-templates.sh** - Reusable CLI invocation templates
- **agent-selection-guide.md** - Decision tree for agent selection
- **.claude/redis-agent-dependencies.md** - Redis coordination patterns
- **.claude/cfn-loop-rules.md** - CFN Loop integration rules
- **readme/additional-commands.md** - SQLite memory & ACL commands

---

## 12. Support & Troubleshooting

### Common Errors

**Error: "Missing required --agents flag"**
```bash
# Solution: Add --agents flag with comma-separated agent types
--agents=coder,tester
```

**Error: "Invalid agent type: xyz"**
```bash
# Solution: Check AVAILABLE-AGENTS.md for valid agent types
# Valid example:
--agents=coder,backend-dev,security-specialist
```

**Error: "Redis connection failed"**
```bash
# Solution: Ensure Redis is running
redis-cli ping  # Should return PONG

# Start Redis if needed
redis-server
```

**Error: "SQLite database locked"**
```bash
# Solution: Close other connections or increase timeout
# Handled automatically by MemoryStoreAdapter
```

### Performance Tuning

**Slow spawning (> 30s):**
- Check Redis connectivity
- Reduce agent count if possible
- Use sequential topology for simple tasks

**High cost (> $2 per feature):**
- Verify z.ai provider is selected
- Reduce token usage by clarifying task scope
- Batch multiple small tasks into single spawn

**Low consensus (< 0.70):**
- Add more specific task descriptions
- Include relevant context in spawn command
- Add specialist agents (security, performance, etc.)

---

**Last Updated:** 2025-10-18
**Version:** 1.0.0
**Maintainer:** Claude Flow Novice Core Team
