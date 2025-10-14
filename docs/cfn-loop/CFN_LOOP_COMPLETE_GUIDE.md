# CFN Loop Complete Implementation Guide

**🔄 SELF-LOOPING SYSTEM**: The CFN Loop operates autonomously. Claude continues through iterations without human intervention. Each failure triggers IMMEDIATE self-correction with feedback injection. NO WAIT for approval required.

**Version**: 2.0.0
**Last Updated**: 2025-10-03
**Compatible With**: Claude Flow Novice v1.5.22+

---

## Table of Contents

1. [Overview & Architecture](#overview--architecture)
2. [Command Reference](#command-reference)
3. [Agent Execution Guide](#agent-execution-guide)
4. [Hook System](#hook-system)
5. [Confidence Score System](#confidence-score-system)
6. [Flowcharts](#flowcharts)
7. [Memory Coordination](#memory-coordination)
8. [Security Implementation](#security-implementation)
9. [Performance Optimization](#performance-optimization)
10. [Troubleshooting Guide](#troubleshooting-guide)
11. [Real-World Examples](#real-world-examples)

---

## 1. Overview & Architecture

### What is the CFN Loop?

The **CFN (Claude Flow Novice) Loop** is a **self-correcting, self-looping development system** that ensures high-quality deliverables through:

- **3 nested validation loops** (Initialization → Execution → Consensus)
- **Confidence-based gating** (0.75 self-validation, 0.90 consensus)
- **Byzantine consensus voting** across validator agents
- **Autonomous self-correction with feedback injection** (max 10 rounds)
- **Memory-coordinated learning** across all agents

**CRITICAL: This is a SELF-LOOPING PROCESS** - Claude autonomously continues through iterations without human intervention until consensus is achieved or iteration limits are reached.

**Key Benefit**: Catches 80% of errors before human review through agent self-validation and consensus verification.

### 3-Loop Structure

```
Loop 1: SWARM INITIALIZATION
  ↓ (Establishes coordination infrastructure)
Loop 2: EXECUTION LOOP
  ↓ (Primary agents produce deliverables)
Loop 3: CONSENSUS VERIFICATION
  ↓ (Validators approve via Byzantine consensus)
EXIT: Next Steps Guidance
```

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CFN LOOP SYSTEM                             │
│                     (Self-Correcting Development)                    │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  LOOP 1: SWARM INITIALIZATION (MANDATORY for Multi-Agent)   │
    │  ─────────────────────────────────────────────────────────  │
    │  • mcp__claude-flow-novice__swarm_init(topology, maxAgents) │
    │  • Topology: mesh (2-7 agents) | hierarchical (8+)          │
    │  • Establishes SwarmMemory coordination                     │
    │  • Byzantine consensus preparation                          │
    └─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  LOOP 2: EXECUTION LOOP (Primary Swarm)                     │
    │  ─────────────────────────────────────────────────────────  │
    │  Round Counter: r = 1                                       │
    │                                                             │
    │  Step 2.1: Spawn Primary Agents (3-20 agents)               │
    │  Step 2.2: Each Agent File Edit + Post-Edit Hook           │
    │  Step 2.3: Self-Validation (Confidence Score)               │
    │                                                             │
    │  GATE 1: Self-Assessment Check                              │
    │  • IF min(C_agent) ≥ 0.75 → Proceed to Loop 3               │
    │  • ELSE → Collect feedback → r++ → Retry (max 3)            │
    └─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ (Self-validation passed)
    ┌─────────────────────────────────────────────────────────────┐
    │  LOOP 3: CONSENSUS VERIFICATION LOOP                        │
    │  ─────────────────────────────────────────────────────────  │
    │  Round Counter: v = 1                                       │
    │                                                             │
    │  Step 3.1: Spawn Validator Swarm (2-4 validators)           │
    │  Step 3.2: Multi-Dimensional Validation                     │
    │  Step 3.3: Byzantine Consensus Voting                       │
    │                                                             │
    │  GATE 2: Consensus Decision                                 │
    │  • PASS (A≥90%, C≥90%) → Store results → Exit               │
    │  • FAIL → Inject feedback → v++ → Loop 2 (max 10)           │
    └─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  EXIT: NEXT STEPS GUIDANCE                                  │
    │  1. ✅ What was completed                                    │
    │  2. 📊 Validation results                                   │
    │  3. 🔍 Identified issues                                    │
    │  4. 💡 Recommended next steps                               │
    └─────────────────────────────────────────────────────────────┘
```

### Component Integration Map

```
CFN Loop Orchestrator
├── Swarm Initializer (MCP)
│   ├── Topology Manager (mesh/hierarchical)
│   ├── SwarmMemory Setup
│   └── Byzantine Consensus Prep
│
├── Execution Engine (Loop 2)
│   ├── Agent Spawner (Claude Code Task tool)
│   ├── Enhanced Post-Edit Hooks
│   │   ├── Validation Engine
│   │   ├── Test Engine (TDD)
│   │   ├── Formatting Engine
│   │   └── Security Scanner
│   └── Confidence Scorer
│
├── Consensus Engine (Loop 3)
│   ├── Validator Spawner
│   ├── Multi-Dimensional Checker
│   └── Byzantine Voting System
│
├── Feedback System
│   ├── Feedback Injection
│   ├── Deduplication Registry
│   └── Priority Ranking
│
├── Circuit Breaker
│   ├── Timeout Management
│   ├── State Machine (CLOSED/OPEN/HALF_OPEN)
│   └── Cooldown Controller
│
└── Memory Coordination
    ├── SwarmMemory (SQLite)
    ├── Namespace Manager
    └── Learning Patterns
```

---

## 2. Command Reference

### Sprint and Phase Orchestration Commands (NEW)

```bash
# Single-phase execution (original CFN loop)
/cfn-loop "Implement JWT authentication" --phase=auth --max-loop2=10 --max-loop3=10

# Multi-sprint phase execution (NEW - execute multiple sprints in sequence)
/cfn-loop-sprints "Authentication System" --sprints=3 --max-loop2=10
# Executes:
#   Sprint 1: JWT Token Generation (CFN loop with 10 iterations)
#   Sprint 2: Password Hashing (CFN loop with 10 iterations)
#   Sprint 3: Auth Middleware (CFN loop with 10 iterations)

# Multi-phase epic execution (NEW - execute complete epic with phases)
/cfn-loop-epic "Complete User Management System" --phases=4 --max-loop2=10
# Executes:
#   Phase 1: Authentication (3 sprints)
#   Phase 2: Authorization (2 sprints)
#   Phase 3: User Profile (2 sprints)
#   Phase 4: Integration Tests (1 sprint)
```

### All CLI Commands Agents Need to Execute

#### Swarm Initialization (MCP Tool)

```javascript
// MANDATORY: Call BEFORE spawning multiple agents
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",          // "mesh" (2-7 agents) | "hierarchical" (8+ agents)
  maxAgents: 3,              // Must match actual agent count
  strategy: "balanced"       // "balanced" | "adaptive"
})
```

**Parameters**:
- `topology` (string): Coordination pattern
  - `mesh`: Peer-to-peer (2-7 agents) - equal collaboration
  - `hierarchical`: Coordinator-led (8+ agents) - structured delegation
- `maxAgents` (number): Total agent count (must match spawned agents)
- `strategy` (string): Coordination strategy
  - `balanced`: Even workload distribution
  - `adaptive`: Dynamic adjustment based on agent performance

**Returns**:
```json
{
  "success": true,
  "swarmId": "swarm-abc123",
  "topology": "mesh",
  "maxAgents": 3,
  "coordinationReady": true
}
```

#### Agent Spawning (Claude Code Task Tool)

```javascript
// Spawn ALL agents in SINGLE message
Task("Agent Name", "Specific task instructions", "agent-type")
```

**Agent Types**:
- `coder`: General implementation
- `tester`: Test writing and validation
- `reviewer`: Code quality review
- `security-specialist`: Security auditing
- `system-architect`: Architecture design
- `backend-dev`: Backend implementation
- `frontend-dev`: Frontend implementation
- `devops-engineer`: Deployment and infrastructure
- `api-docs`: Documentation
- `perf-analyzer`: Performance optimization
- `database-specialist`: Database design
- `mobile-dev`: Mobile development
- `compliance-auditor`: Regulatory compliance
- `product-owner`: GOAP-based scope control and autonomous decision-making

#### Post-Edit Hook (MANDATORY After Every File Edit)

```bash
# Enhanced post-edit hook
npx enhanced-hooks post-edit "<file-path>" \
  --memory-key "swarm/<agent>/<task>" \
  --minimum-coverage 80 \
  --structured

# Alternative: Direct execution
node src/hooks/enhanced-post-edit-pipeline.js post-edit "<file-path>" \
  --memory-key "<key>" \
  --structured
```

**Options**:
- `--memory-key <key>`: Store results in SwarmMemory namespace
- `--minimum-coverage <N>`: Coverage threshold (default: 80%)
- `--structured`: Return structured JSON
- `--block-on-critical`: Block on critical validation failures
- `--enable-tdd`: Enable TDD testing (default: true)

**Output**:
```json
{
  "success": true,
  "file": "src/component.js",
  "validation": {
    "passed": true,
    "issues": [],
    "coverage": "advanced"
  },
  "testing": {
    "framework": "jest",
    "passed": 12,
    "failed": 0,
    "coverage": 85
  },
  "tddCompliance": {
    "hasTests": true,
    "coverage": 85,
    "phase": "green"
  },
  "recommendations": [...]
}
```

#### Memory Management Commands

```bash
# Store in memory
npx claude-flow-novice memory store "key" "value" --namespace "swarm"

# Retrieve from memory
npx claude-flow-novice memory retrieve "key" --namespace "swarm"

# Search memory
npx claude-flow-novice memory search "swarm/*"

# Export memory
npx claude-flow-novice memory export --format json > memory.json
```

#### Monitoring Commands

```bash
# Check swarm status
npx claude-flow-novice swarm status --swarm-id <id>

# View agent metrics
npx claude-flow-novice agent metrics --agent-id <id>

# Get task results
npx claude-flow-novice task results --task-id <id>

# Export metrics
npx claude-flow-novice metrics export --format json

# Validate configuration
npx claude-flow-novice config validate
```

### Slash Command Usage

#### /cfn-loop Command

```bash
# Auto-detected project type and complexity
/cfn-loop "Implement user authentication with JWT"

# With explicit configuration
/cfn-loop "Build real-time chat" --agents 6 --topology mesh --confidence 0.80

# Complex task with custom thresholds
/cfn-loop "Build microservices gateway" \
  --agents 12 \
  --topology hierarchical \
  --consensus-threshold 0.95 \
  --max-rounds 15
```

**Options**:
- `--agents <N>`: Number of primary agents (default: auto-detect)
- `--topology <type>`: mesh | hierarchical (default: auto-select)
- `--confidence <N>`: Self-validation threshold (default: 0.75)
- `--consensus-threshold <N>`: Consensus threshold (default: 0.90)
- `--max-rounds <N>`: Max consensus rounds (default: 10)
- `--coverage <N>`: Minimum test coverage % (default: 80)

#### /hooks Command

```bash
# Run post-edit hook
/hooks post-edit <file> --memory-key "<key>" --structured

# Run pre-edit hook
/hooks pre-edit <file> --auto-assign-agents true

# Run session-end hook
/hooks session-end --generate-summary true
```

---

## 3. Agent Execution Guide

### Step-by-Step Workflow for Agents

#### Phase 1: Swarm Initialization

**What to Do**:
1. Analyze task complexity (Simple/Medium/Complex/Enterprise)
2. Determine agent count from requirements
3. Select topology (mesh for 2-7, hierarchical for 8+)
4. Call `mcp__claude-flow-novice__swarm_init`

**Example**:
```javascript
[Single Message]:
  // Step 1: Initialize swarm
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  // Step 2: Spawn all agents
  Task("Backend Dev", "Implement JWT auth", "backend-dev")
  Task("Security Analyst", "Security audit", "security-specialist")
  Task("Test Engineer", "Write tests", "tester")
```

#### Phase 2: Execution (Primary Agents)

**What Each Agent Does**:

1. **Receive task instructions**
2. **Execute implementation**
3. **Run post-edit hook AFTER every file edit**
4. **Calculate self-validation confidence**
5. **Store results in SwarmMemory**

**Example (Backend Dev Agent)**:
```bash
# Edit file
# (create src/auth/jwt-handler.js)

# MANDATORY: Run post-edit hook
npx enhanced-hooks post-edit "src/auth/jwt-handler.js" \
  --memory-key "swarm/backend-dev/jwt-auth" \
  --minimum-coverage 80 \
  --structured

# Output: Confidence score 0.92 → PASS
```

#### Phase 3: Self-Validation Gate

**Confidence Score Calculation**:
```javascript
const confidence =
  (testsPassed ? 0.30 : 0) +
  (coverage >= 80 ? 0.25 : coverage/80 * 0.25) +
  (noSyntaxErrors ? 0.15 : 0) +
  (noSecurityIssues ? 0.20 : 0) +
  (formattingCorrect ? 0.10 : 0);

if (confidence >= 0.75) {
  // PASS: Proceed to consensus
} else {
  // FAIL: Retry with feedback
}
```

#### Phase 4: Consensus Verification

**What Validators Do**:

1. **Receive primary agent work**
2. **Perform multi-dimensional assessment**:
   - Code quality (maintainability, patterns)
   - Security (XSS, SQL injection, secrets)
   - Performance (complexity, resource usage)
   - Tests (coverage, edge cases, integration)
   - Documentation (comments, API docs)
3. **Vote approve/reject with confidence score**
4. **Provide structured feedback**

**Example (Security Specialist Validator)**:
```javascript
{
  validatorId: "security-specialist",
  approve: true,
  confidence: 0.95,
  dimensions: {
    security: {
      score: 0.95,
      issues: [],
      warnings: ["Rate limiting recommended"]
    }
  },
  criticalIssues: [],
  recommendations: [
    "Add rate limiting middleware"
  ]
}
```

#### Phase 5: Product Owner Decision Gate (GOAP Authority)

**NEW**: Product Owner agent uses Goal-Oriented Action Planning (GOAP) to make autonomous scope-aware decisions.

**GOAP Decision Process**:

1. **Retrieve Scope Boundaries**
   ```javascript
   const scope = await memory_usage({
     action: "retrieve",
     namespace: "scope-control",
     key: "project-boundaries"
   });
   ```

2. **Classify Validator Concerns**
   - **In-scope**: Relates to defined scope items (GOAP cost: 50-100)
   - **Out-of-scope**: Scope expansion attempt (GOAP cost: 1000)

3. **Execute A* Search**
   - Generate action space with costs
   - Find optimal path to goal state (consensus ≥90%, scope intact)
   - Select action with lowest total cost

4. **Make Decision (Autonomous)**
   - **PROCEED**: In-scope blockers → Relaunch Loop 3 with targeted agents
   - **DEFER**: Out-of-scope concerns → Save to backlog, approve phase
   - **ESCALATE**: Critical ambiguity → Generate options (rare)

**Example: Security Validator Suggests JWT (Out-of-Scope)**

**Scenario**: Internal admin tool, validator suggests JWT auth

**Scope**:
- In-scope: Basic auth, admin CRUD
- Out-of-scope: JWT, OAuth

**Product Owner GOAP Decision**:
- Classify: OUT-OF-SCOPE (cost 1000 for JWT expansion)
- Alternative: Defer to backlog (cost 20)
- A* result: Defer (20 < 1000)

**Output**:
```json
{
  "decision": "DEFER",
  "reasoning": "JWT is out-of-scope. A* search: cost 20 (defer) vs 1000 (expand)",
  "deferred_items": ["JWT authentication - Phase 2 candidate"],
  "next_action": "AUTO-TRANSITION to next phase"
}
```

**Autonomous Execution Rules**:

**FORBIDDEN**:
- ❌ Asking "Should I retry?"
- ❌ Waiting for approval to proceed
- ❌ Pausing for confirmation

**REQUIRED**:
- ✅ Execute GOAP decision immediately
- ✅ No permission needed for PROCEED/DEFER
- ✅ Autonomous Loop 3 relaunch for in-scope issues

**Traditional Decision Gate (When Scope Control Disabled)**:
- **PASS**: ≥90% validator agreement + all critical criteria met → Exit to next phase
- **FAIL**: <90% agreement OR critical criterion failed → Retry Loop 2

#### Phase 6: Scope Control Initialization

**Setting Up Scope Boundaries at Project Start**:

```javascript
// Initialize scope control before spawning agents
await memory_usage({
  action: "store",
  namespace: "scope-control",
  key: "project-boundaries",
  value: {
    projectName: "Internal Admin Tool",
    inScope: [
      "Basic username/password authentication",
      "Admin user CRUD operations",
      "Role-based access (admin/viewer)",
      "Session management"
    ],
    outOfScope: [
      "JWT/OAuth integration",
      "Multi-factor authentication",
      "Password reset email flow",
      "Third-party SSO"
    ],
    deferredBacklog: [],
    strictMode: true  // GOAP will block out-of-scope suggestions
  }
});
```

**Scope Control During Consensus**:

When validators provide feedback, Product Owner agent:

1. **Retrieves scope boundaries** from `scope-control/project-boundaries`
2. **Classifies each recommendation**:
   - Match against `inScope` → PROCEED with fix
   - Match against `outOfScope` → DEFER to backlog
   - Ambiguous → ESCALATE for clarification
3. **Executes GOAP A* search** to find lowest-cost path
4. **Makes autonomous decision** without human approval

**GOAP Cost Matrix**:
```javascript
{
  "in-scope-blocker": 50,        // Fix required, low cost
  "in-scope-enhancement": 100,   // Improve quality, medium cost
  "out-of-scope-defer": 20,      // Add to backlog, very low cost
  "out-of-scope-expand": 1000,   // Scope creep, very high cost
  "critical-ambiguity": 500      // Need clarification, high cost
}
```

**Example Flow with Scope Control**:

```
Validator feedback: "Add JWT authentication for better security"

Product Owner GOAP Analysis:
1. Retrieve scope: JWT in outOfScope list
2. Classify: OUT-OF-SCOPE
3. A* search:
   - Option A: Expand scope (cost 1000)
   - Option B: Defer to backlog (cost 20)
   - Optimal: Option B (20 < 1000)
4. Decision: DEFER

Action: Save to backlog, approve phase, AUTO-TRANSITION
```

### What Each Agent Type Does

| Agent Type | Primary Responsibilities | When to Use |
|------------|-------------------------|-------------|
| **coder** | General implementation, feature development | All development tasks |
| **tester** | Test writing, validation, TDD compliance | ALWAYS include for code changes |
| **reviewer** | Code quality, architecture review | All non-trivial features |
| **security-specialist** | Security audit, vulnerability scanning | Auth, payments, user data |
| **system-architect** | Architecture design, scalability | Complex systems, API design |
| **backend-dev** | Server-side implementation | APIs, databases, services |
| **frontend-dev** | Client-side implementation | UI, React/Vue components |
| **devops-engineer** | Infrastructure, deployment | Docker, K8s, CI/CD |
| **api-docs** | API documentation, OpenAPI specs | Public APIs, SDKs |
| **perf-analyzer** | Performance optimization | High-traffic systems |
| **database-specialist** | Schema design, query optimization | Complex data models |
| **compliance-auditor** | GDPR, HIPAA, SOC2 compliance | Regulated industries |
| **product-owner** | GOAP-based scope control, autonomous decision-making | Consensus validation, scope enforcement |

### Coordination Patterns

#### Mesh Topology (2-7 Agents)
```
Agent 1 ←→ Agent 2
   ↕          ↕
Agent 3 ←→ Agent 4

• Peer-to-peer communication
• Equal collaboration
• Best for: Simple to medium tasks
```

#### Hierarchical Topology (8+ Agents)
```
     Coordinator
    /     |     \
  Team1  Team2  Team3
 /  \    /  \    /  \
A1  A2  A3  A4  A5  A6

• Structured delegation
• Clear responsibility chains
• Best for: Complex enterprise tasks
```

### Memory Namespace Usage

**Namespace Structure**:
```
swarm/
├── {swarm-id}/
│   ├── agents/
│   │   ├── {agent-id}/
│   │   │   ├── tasks/{task-id}/
│   │   │   ├── learning/
│   │   │   └── metrics
│   ├── consensus/{round-id}/
│   ├── iterations/round-{n}/
│   └── results/
```

**Example Usage**:
```javascript
// Agent stores task result
await swarmMemory.store("swarm/backend-dev/jwt-auth", {
  deliverables: ["jwt-handler.js"],
  confidence: 0.92,
  coverage: 87
});

// Validator retrieves for review
const taskData = await swarmMemory.retrieve("swarm/backend-dev/jwt-auth");

// Consensus stores decision
await swarmMemory.store("swarm/consensus/jwt-auth/round-1", {
  agreementRate: 1.0,
  decision: "PASS"
});
```

---

## 4. Hook System

### Pre-Edit Hooks

**Purpose**: Setup and validation before editing files.

**Command**:
```bash
npx claude-flow-novice hooks pre-edit \
  --file "<file>" \
  --auto-assign-agents true \
  --load-context true
```

**What It Does**:
1. Validates file exists and is writable
2. Auto-assigns appropriate agent types
3. Loads relevant context from memory
4. Prepares workspace environment

**Output**:
```json
{
  "file": "src/auth.js",
  "assignedAgents": ["backend-dev", "security-specialist"],
  "context": { "relatedFiles": [...], "dependencies": [...] },
  "readyForEdit": true
}
```

### Post-Edit Hooks (MANDATORY)

**Purpose**: Comprehensive validation after every file edit.

**Command**:
```bash
npx enhanced-hooks post-edit "<file>" \
  --memory-key "swarm/<agent>/<task>" \
  --minimum-coverage 80 \
  --structured
```

**What It Does**:
1. **Syntax Validation**: Checks for syntax errors
2. **Type Checking**: TypeScript/Flow validation
3. **Linting**: ESLint, Prettier, RustFmt
4. **Security Scanning**: XSS, SQL injection, secrets
5. **TDD Testing**: Single-file test execution
6. **Coverage Analysis**: Line, branch, function coverage
7. **TDD Compliance**: Red-Green-Refactor phase detection
8. **Formatting**: Diff preview and change detection
9. **Memory Storage**: Store results in SwarmMemory

**Multi-Language Support**:
- **JavaScript/TypeScript**: Jest, Mocha, Prettier, ESLint
- **Rust**: cargo check, cargo test, cargo-tarpaulin, rustfmt, clippy
- **Python**: pytest, unittest, black, pylint
- **Go**: go test, go fmt, go vet
- **Java**: JUnit, TestNG, google-java-format
- **C/C++**: GTest, Catch2, clang-format

### Hook Execution Examples

#### JavaScript/TypeScript Example
```bash
npx enhanced-hooks post-edit "src/api/users.ts" \
  --memory-key "swarm/backend-dev/user-api" \
  --minimum-coverage 85 \
  --structured
```

**Output**:
```json
{
  "success": true,
  "validation": {
    "passed": true,
    "coverage": "advanced",
    "framework": "TypeScript + ESLint"
  },
  "testing": {
    "framework": "jest",
    "passed": 15,
    "failed": 0,
    "coverage": 88
  },
  "formatting": {
    "formatter": "prettier",
    "needed": false
  },
  "security": {
    "vulnerabilities": [],
    "warnings": []
  }
}
```

#### Rust Example
```bash
npx enhanced-hooks post-edit "src/lib.rs" \
  --memory-key "swarm/rust-dev/core-lib" \
  --minimum-coverage 90 \
  --structured
```

**Output**:
```json
{
  "success": true,
  "validation": {
    "passed": true,
    "coverage": "fast-static-analysis",
    "workspaceRoot": "/path/to/cargo/project"
  },
  "testing": {
    "framework": "cargo test",
    "passed": 23,
    "failed": 0,
    "coverage": 92
  },
  "formatting": {
    "formatter": "rustfmt",
    "needed": false
  }
}
```

### Hook Output Format

**Structured JSON Response**:
```json
{
  "success": true,
  "editId": "edit-1696234567-abc123",
  "file": "src/component.js",
  "timestamp": "2025-10-02T10:30:00Z",

  "validation": {
    "passed": true,
    "issues": [
      {
        "type": "security",
        "severity": "medium",
        "message": "Potential XSS vulnerability",
        "line": 42,
        "column": 15,
        "suggestion": "Use textContent instead of innerHTML"
      }
    ],
    "suggestions": ["Add input sanitization"],
    "coverage": "advanced"
  },

  "formatting": {
    "needed": true,
    "changes": 5,
    "formatter": "prettier",
    "preview": "Line 10: Remove trailing whitespace\nLine 23: Add space before brace"
  },

  "testing": {
    "executed": true,
    "framework": "jest",
    "results": {
      "summary": {
        "total": 15,
        "passed": 15,
        "failed": 0,
        "skipped": 0
      }
    },
    "coverage": {
      "lines": { "percentage": 85, "covered": 42, "total": 50 },
      "functions": { "percentage": 90, "covered": 9, "total": 10 },
      "branches": { "percentage": 80, "covered": 12, "total": 15 }
    }
  },

  "tddCompliance": {
    "hasTests": true,
    "coverage": 85,
    "phase": "green",
    "recommendations": [
      {
        "type": "tdd_green",
        "priority": "low",
        "message": "All tests passing - consider refactoring",
        "action": "Improve code design while keeping tests green"
      }
    ]
  },

  "recommendations": [
    {
      "type": "security",
      "priority": "medium",
      "message": "Address XSS vulnerability",
      "action": "Sanitize user input before rendering"
    },
    {
      "type": "formatting",
      "priority": "low",
      "message": "Run prettier to fix 5 formatting issues",
      "action": "npx prettier --write src/component.js"
    }
  ],

  "memory": {
    "stored": true,
    "enhancedStore": true,
    "key": "edit:edit-1696234567-abc123"
  }
}
```

### When to Use Each Hook

| Hook | When | Purpose |
|------|------|---------|
| **pre-command** | Before CLI commands | Safety validation, resource prep |
| **pre-edit** | Before file edits | Agent assignment, context loading |
| **post-edit** | After EVERY file edit | Validation, testing, memory storage |
| **post-command** | After CLI commands | Metrics tracking, result storage |
| **session-end** | End of work session | Summary generation, state persistence |

---

## 5. Confidence Score System

### How Confidence Scores Are Calculated

**Formula**:
```javascript
confidence =
  (testsPassed ? 0.30 : 0) +                           // Weight: 30%
  (coverage >= 80 ? 0.25 : coverage/80 * 0.25) +      // Weight: 25%
  (noSyntaxErrors ? 0.15 : 0) +                       // Weight: 15%
  (securityScore * 0.20) +                            // Weight: 20%
  (formattingCorrect ? 0.10 : 0);                     // Weight: 10%

// Security score calculation
securityScore = Math.max(0, 1.0 - totalSecurityPenalty);
```

### Formula Breakdown with Examples

#### Example 1: Perfect Score (1.0)
```javascript
{
  testsPassed: true,          // 0.30
  coverage: 92,               // 0.25 (92/80 = 1.15, capped at 1.0)
  noSyntaxErrors: true,       // 0.15
  securityIssues: [],         // 0.20 (score = 1.0)
  formattingCorrect: true,    // 0.10
}
// Total: 0.30 + 0.25 + 0.15 + 0.20 + 0.10 = 1.00 (100%)
```

#### Example 2: Good Score (0.88)
```javascript
{
  testsPassed: true,          // 0.30
  coverage: 82,               // 0.25 (82/80 = 1.025, capped at 1.0)
  noSyntaxErrors: true,       // 0.15
  securityIssues: [
    { severity: "low" }       // 0.20 * 0.9 = 0.18 (10% penalty)
  ],
  formattingCorrect: true,    // 0.10
}
// Total: 0.30 + 0.25 + 0.15 + 0.18 + 0.10 = 0.98 (98%)
```

#### Example 3: Below Threshold (0.72)
```javascript
{
  testsPassed: true,          // 0.30
  coverage: 68,               // 0.25 * (68/80) = 0.2125
  noSyntaxErrors: true,       // 0.15
  securityIssues: [],         // 0.20
  formattingCorrect: false,   // 0.00
}
// Total: 0.30 + 0.2125 + 0.15 + 0.20 + 0.00 = 0.8625
// BUT: Coverage penalty → 0.8625 * 0.85 = 0.733 ≈ 0.73 → RETRY REQUIRED
```

#### Example 4: Critical Failure (0.45)
```javascript
{
  testsPassed: false,         // 0.00 (critical)
  coverage: 45,               // 0.25 * (45/80) = 0.141
  noSyntaxErrors: true,       // 0.15
  securityIssues: [
    { severity: "high" }      // 0.20 * 0.5 = 0.10
  ],
  formattingCorrect: true,    // 0.10
}
// Total: 0.00 + 0.141 + 0.15 + 0.10 + 0.10 = 0.491
// Critical failure: tests not passing → BLOCK
```

### Weighting by Agent Type

**Agent-Specific Adjustments**:
```javascript
const agentWeights = {
  'tester': {
    testsPassed: 0.40,    // Higher weight (was 0.30)
    coverage: 0.30        // Higher weight (was 0.25)
  },
  'security-specialist': {
    security: 0.35,       // Higher weight (was 0.20)
    testsPassed: 0.25
  },
  'reviewer': {
    formatting: 0.15,     // Higher weight (was 0.10)
    syntax: 0.20          // Higher weight (was 0.15)
  }
};
```

### Threshold Interpretation

#### Self-Validation Threshold: 0.75 (75%)

**Meaning**:
- Minimum acceptable confidence to proceed to consensus
- Ensures basic quality standards met
- Allows minor issues (warnings, low-priority recommendations)

**Decision Logic**:
```javascript
if (min(agentConfidences) >= 0.75) {
  console.log("✅ Self-validation PASSED");
  proceedToConsensus();
} else {
  console.log("❌ Self-validation FAILED");
  collectFeedback();
  retryWithFeedback();
}
```

#### Consensus Threshold: 0.90 (90%)

**Meaning**:
- High agreement among validators required
- Ensures multi-dimensional quality
- Prevents single-agent bias

**Decision Logic**:
```javascript
const agreementRate = approvals / totalValidators;
const avgConfidence = sum(validatorConfidences) / totalValidators;

if (agreementRate >= 0.90 && avgConfidence >= 0.90) {
  console.log("✅ Consensus PASSED");
  storeResults();
  exit();
} else {
  console.log("❌ Consensus FAILED");
  aggregateFeedback();
  retryLoop2();
}
```

### Confidence Gate Logic

**Gate 1: Self-Validation**:
```javascript
function evaluateGate1(agentConfidences) {
  const minConfidence = Math.min(...agentConfidences);

  if (minConfidence >= 0.75) {
    return {
      pass: true,
      action: "PROCEED_TO_CONSENSUS",
      message: `Self-validation passed (min: ${minConfidence})`
    };
  } else {
    return {
      pass: false,
      action: "RETRY_WITH_FEEDBACK",
      message: `Self-validation failed (min: ${minConfidence} < 0.75)`,
      failedAgents: agentConfidences
        .map((c, i) => ({ agent: i, confidence: c }))
        .filter(a => a.confidence < 0.75)
    };
  }
}
```

**Gate 2: Consensus**:
```javascript
function evaluateGate2(validatorResults) {
  const approvals = validatorResults.filter(v => v.approve).length;
  const agreementRate = approvals / validatorResults.length;

  const avgConfidence = validatorResults
    .reduce((sum, v) => sum + v.confidence, 0) / validatorResults.length;

  const criticalPassing = validatorResults
    .every(v => v.criticalIssues.length === 0);

  if (agreementRate >= 0.90 && avgConfidence >= 0.90 && criticalPassing) {
    return {
      pass: true,
      action: "SUCCESS",
      agreementRate,
      avgConfidence
    };
  } else {
    return {
      pass: false,
      action: "RETRY_LOOP_2",
      agreementRate,
      avgConfidence,
      criticalBlocking: !criticalPassing,
      dissenting: validatorResults.filter(v => !v.approve)
    };
  }
}
```

### Example Calculations with Real Numbers

**Scenario: JWT Authentication Implementation**

**Agent: Backend Developer**
```javascript
{
  testsPassed: true,                    // ✅ 15 tests passing
  coverage: 87,                         // ✅ 87% line coverage
  noSyntaxErrors: true,                 // ✅ ESLint clean
  securityIssues: [
    { severity: "medium", type: "rate-limiting-missing" }
  ],                                    // ⚠️ Rate limiting recommended
  formattingCorrect: true               // ✅ Prettier formatted
}

// Calculation:
confidence = 0.30 + 0.25 + 0.15 + (0.20 * 0.8) + 0.10
          = 0.30 + 0.25 + 0.15 + 0.16 + 0.10
          = 0.96 (96%)
// PASS ✅
```

**Validator: Security Specialist**
```javascript
{
  approve: true,
  confidence: 0.88,
  dimensions: {
    security: {
      score: 0.85,
      warnings: ["Rate limiting recommended"],
      criticalIssues: []
    },
    performance: { score: 0.90 },
    tests: { score: 0.92 }
  }
}
```

**Consensus Calculation**:
```javascript
validators = [
  { approve: true, confidence: 0.92 },  // Reviewer
  { approve: true, confidence: 0.88 },  // Security Specialist
  { approve: true, confidence: 0.95 },  // System Architect
  { approve: true, confidence: 0.90 }   // Tester
];

agreementRate = 4/4 = 1.0 (100%)
avgConfidence = (0.92 + 0.88 + 0.95 + 0.90) / 4 = 0.9125 (91.25%)

// Both thresholds met → PASS ✅
```

---

## 6. Flowcharts

### Overall CFN Loop Flow (ASCII)

```
START
  │
  ▼
┌─────────────────────────┐
│ Analyze Task Complexity │
│ • Simple (3-5 steps)    │
│ • Medium (6-10 steps)   │
│ • Complex (11-20 steps) │
│ • Enterprise (20+ steps)│
└─────────────────────────┘
  │
  ▼
┌─────────────────────────┐
│ Determine Agent Count   │
│ • Simple: 2-3 agents    │
│ • Medium: 4-6 agents    │
│ • Complex: 8-12 agents  │
│ • Enterprise: 15-20     │
└─────────────────────────┘
  │
  ▼
┌─────────────────────────┐
│ LOOP 1: Initialize      │
│ mcp__swarm_init({       │
│   topology: "mesh",     │
│   maxAgents: N          │
│ })                      │
└─────────────────────────┘
  │
  ▼
┌─────────────────────────┐
│ Spawn ALL Primary       │
│ Agents (Single Message) │
│ • Task(..., type)       │
│ • Task(..., type)       │
└─────────────────────────┘
  │
  ▼
┌─────────────────────────┐
│ LOOP 2: Execute         │
│ Round r = 1             │
└─────────────────────────┘
  │
  ▼
┌─────────────────────────┐
│ Agents Work             │
│ Concurrently            │
└─────────────────────────┘
  │
  ▼
┌─────────────────────────┐
│ Each File Edit →        │
│ Post-Edit Hook          │
│ (MANDATORY)             │
└─────────────────────────┘
  │
  ▼
┌─────────────────────────┐
│ Self-Validation         │
│ Calculate Confidence    │
└─────────────────────────┘
  │
  ▼
┌─────────────────────────┐
│ GATE 1: Check           │
│ min(C) ≥ 0.75?          │
└─────────────────────────┘
  │
  ├─ YES ─────────────────┐
  │                       │
  └─ NO                   │
     │                    │
     ▼                    │
  ┌──────────────┐        │
  │ r++ (retry)  │        │
  │ IF r ≤ 3:    │        │
  │   Inject     │        │
  │   Feedback   │        │
  │   → Loop 2   │        │
  │ ELSE:        │        │
  │   Escalate   │        │
  └──────────────┘        │
                          │
                          ▼
                  ┌─────────────────┐
                  │ LOOP 3: Spawn   │
                  │ Validators (2-4)│
                  └─────────────────┘
                          │
                          ▼
                  ┌─────────────────┐
                  │ Multi-Dimensional│
                  │ Validation      │
                  └─────────────────┘
                          │
                          ▼
                  ┌─────────────────┐
                  │ Byzantine       │
                  │ Consensus Vote  │
                  └─────────────────┘
                          │
                          ▼
                  ┌─────────────────┐
                  │ GATE 2: Check   │
                  │ A≥90% & C≥90%?  │
                  └─────────────────┘
                          │
                  ├─ PASS ─────────┐
                  │                │
                  └─ FAIL          │
                     │             │
                     ▼             │
                  ┌──────────────┐ │
                  │ v++ (round)  │ │
                  │ IF v ≤ 10:   │ │
                  │   Feedback   │ │
                  │   → Loop 2   │ │
                  │ ELSE:        │ │
                  │   Escalate   │ │
                  └──────────────┘ │
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ Store Results   │
                          │ in SwarmMemory  │
                          └─────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ EXIT: Next      │
                          │ Steps Guidance  │
                          └─────────────────┘
                                   │
                                   ▼
                                  END
```

### Loop 2 (Self-Validation) Flow

```
LOOP 2 START (r = 1)
  │
  ▼
┌────────────────────────────┐
│ Primary Agents Execute     │
│ Tasks Concurrently         │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ File Edit                  │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Post-Edit Hook             │
│ • Syntax validation        │
│ • TDD testing              │
│ • Coverage analysis        │
│ • Security scan            │
│ • Formatting check         │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Calculate Confidence       │
│ C = Σ(weights × scores)    │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Store in SwarmMemory       │
│ Key: swarm/<agent>/<task>  │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ All Agents Complete?       │
└────────────────────────────┘
  │
  ├─ NO → Wait for agents
  │
  └─ YES
     │
     ▼
┌────────────────────────────┐
│ Collect All Confidence     │
│ Scores: [C1, C2, C3, ...]  │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ GATE 1: min(C) ≥ 0.75?     │
└────────────────────────────┘
  │
  ├─ YES → Exit to Loop 3 ✅
  │
  └─ NO
     │
     ▼
  ┌────────────────────────┐
  │ Identify Failed Agents │
  │ (C < 0.75)             │
  └────────────────────────┘
     │
     ▼
  ┌────────────────────────┐
  │ Aggregate Feedback     │
  │ from Hook Results      │
  └────────────────────────┘
     │
     ▼
  ┌────────────────────────┐
  │ Round Counter r++      │
  └────────────────────────┘
     │
     ▼
  ┌────────────────────────┐
  │ r ≤ 3?                 │
  └────────────────────────┘
     │
     ├─ YES → Inject Feedback → Loop 2 🔄
     │
     └─ NO → Escalate with Next Steps 🚨
```

### Loop 3 (Consensus) Flow

```
LOOP 3 START (v = 1)
  │
  ▼
┌────────────────────────────┐
│ Spawn Validator Swarm      │
│ • reviewer                 │
│ • security-specialist      │
│ • system-architect         │
│ • tester                   │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Each Validator Reviews     │
│ Primary Agent Work         │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Multi-Dimensional Check    │
│ • Quality                  │
│ • Security                 │
│ • Performance              │
│ • Tests                    │
│ • Documentation            │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Each Validator Votes       │
│ V_i = {approve, confidence}│
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ All Validators Complete?   │
└────────────────────────────┘
  │
  ├─ NO → Wait for validators
  │
  └─ YES
     │
     ▼
┌────────────────────────────┐
│ Byzantine Consensus        │
│ A = approvals / total      │
│ C_avg = Σ(C_i) / total     │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Check Critical Issues      │
│ All validators: critical=0?│
└────────────────────────────┘
  │
  ├─ NO → FAIL (critical blocking)
  │
  └─ YES
     │
     ▼
┌────────────────────────────┐
│ GATE 2:                    │
│ A ≥ 0.90 AND C_avg ≥ 0.90? │
└────────────────────────────┘
  │
  ├─ YES (PASS)
  │   │
  │   ▼
  │ ┌──────────────────────┐
  │ │ Store in SwarmMemory │
  │ │ consensus/{round}    │
  │ └──────────────────────┘
  │   │
  │   ▼
  │ ┌──────────────────────┐
  │ │ Generate Next Steps  │
  │ │ Guidance             │
  │ └──────────────────────┘
  │   │
  │   ▼
  │  EXIT ✅
  │
  └─ NO (FAIL)
     │
     ▼
  ┌────────────────────────┐
  │ Aggregate Validator    │
  │ Feedback               │
  └────────────────────────┘
     │
     ▼
  ┌────────────────────────┐
  │ Round Counter v++      │
  └────────────────────────┘
     │
     ▼
  ┌────────────────────────┐
  │ v ≤ 10?                │
  └────────────────────────┘
     │
     ├─ YES → Inject Feedback → Loop 2 🔄
     │
     └─ NO → Escalate with Next Steps 🚨
```

### Feedback Injection Flow

```
FEEDBACK INJECTION START
  │
  ▼
┌────────────────────────────┐
│ Source: Failed Validation  │
│ • Loop 2 (self)            │
│ • Loop 3 (consensus)       │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Collect Issues from:       │
│ • Hook results             │
│ • Validator assessments    │
│ • Confidence scores        │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Sanitize Feedback          │
│ • Remove prompt injection  │
│ • Limit length (5000 char)│
│ • Validate format          │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Deduplicate Issues         │
│ • Check registry           │
│ • Filter seen issues       │
│ • Track by phase ID        │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Prioritize by Severity     │
│ • critical: 1.0            │
│ • high: 0.8                │
│ • medium: 0.5              │
│ • low: 0.3                 │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Group by Category          │
│ • security                 │
│ • coverage                 │
│ • performance              │
│ • maintainability          │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Format for Agent Retry     │
│ • Specific issues          │
│ • Actionable steps         │
│ • Code examples            │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Store in Memory            │
│ swarm/iterations/round-N/  │
│ feedback                   │
└────────────────────────────┘
  │
  ▼
┌────────────────────────────┐
│ Inject into Agent          │
│ Instructions for Retry     │
└────────────────────────────┘
  │
  ▼
RETURN TO LOOP 2 🔄
```

### Circuit Breaker State Machine

```
              ┌─────────────┐
              │   CLOSED    │
              │  (Normal)   │
              └─────────────┘
                     │
                     │ Failure
                     ▼
              ┌─────────────┐
              │Failure Count│
              │   F++       │
              └─────────────┘
                     │
                     │ F >= Threshold
                     ▼
              ┌─────────────┐
         ┌────│    OPEN     │
         │    │  (Blocking) │
         │    └─────────────┘
         │           │
         │           │ Cooldown elapsed
         │           ▼
         │    ┌─────────────┐
         │    │ HALF_OPEN   │
         │    │  (Testing)  │
         │    └─────────────┘
         │           │
         │           ├─ Success ────────┐
         │           │                  │
         │           └─ Failure         │
         │                  │           │
         │                  ▼           │
         │           ┌─────────────┐    │
         └───────────│    OPEN     │    │
                     │  (Blocking) │    │
                     └─────────────┘    │
                                        │
                                        ▼
                                 ┌─────────────┐
                                 │   CLOSED    │
                                 │  (Normal)   │
                                 └─────────────┘
```

---

## 7. Memory Coordination

### Namespace Structure

```
.swarm/swarm-memory.db (SQLite)
│
└── memory table
    ├── key (TEXT PRIMARY KEY)
    ├── value (TEXT - JSON)
    ├── namespace (TEXT)
    ├── timestamp (TEXT)
    └── metadata (TEXT - JSON)

Logical Structure:
swarm/
├── {swarm-id}/
│   ├── agents/
│   │   ├── {agent-id}/
│   │   │   ├── tasks/
│   │   │   │   ├── {task-id}/
│   │   │   │   │   ├── deliverables
│   │   │   │   │   ├── confidence
│   │   │   │   │   ├── validation
│   │   │   │   │   └── feedback
│   │   │   ├── learning/
│   │   │   │   ├── patterns
│   │   │   │   ├── errors
│   │   │   │   └── successes
│   │   │   └── metrics
│   ├── consensus/
│   │   ├── {round-id}/
│   │   │   ├── validators
│   │   │   ├── votes
│   │   │   ├── agreement
│   │   │   └── decision
│   ├── iterations/
│   │   ├── round-{n}/
│   │   │   ├── feedback
│   │   │   ├── changes
│   │   │   └── improvements
│   └── results/
│       ├── final-deliverable
│       ├── validation-summary
│       └── next-steps
```

### Storage Patterns

#### Agent Task Memory
```javascript
const key = "swarm/backend-dev/jwt-auth";
const value = {
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
  },
  issues: [],
  recommendations: ["Add rate limiting"]
};

await swarmMemory.store(key, value);
```

#### Consensus Round Memory
```javascript
const key = "swarm/consensus/jwt-auth/round-1";
const value = {
  round: 1,
  validators: [
    { id: "reviewer", approve: true, confidence: 0.93 },
    { id: "security", approve: true, confidence: 0.95 },
    { id: "architect", approve: true, confidence: 0.91 },
    { id: "tester", approve: true, confidence: 0.94 }
  ],
  agreementRate: 1.0,
  avgConfidence: 0.9325,
  decision: "PASS"
};

await swarmMemory.store(key, value);
```

#### Iteration Feedback Memory
```javascript
const key = "swarm/iterations/round-2/feedback";
const value = {
  round: 2,
  source: "consensus-validators",
  aggregatedFeedback: {
    criticalIssues: ["JWT secret hardcoded"],
    recommendations: [
      "Use environment variable for JWT_SECRET",
      "Add token refresh mechanism"
    ]
  },
  targetAgents: ["backend-dev"],
  status: "injected"
};

await swarmMemory.store(key, value);
```

### Cross-Agent Sharing

**Pattern**: Agents read each other's work via SwarmMemory

```javascript
// Agent 1 (Backend Dev) stores work
await swarmMemory.store("swarm/backend-dev/jwt-auth", {
  implementation: "jwt-handler.js",
  confidence: 0.92
});

// Agent 2 (Security Specialist) retrieves for audit
const backendWork = await swarmMemory.retrieve("swarm/backend-dev/jwt-auth");

// Security Specialist audits and stores findings
await swarmMemory.store("swarm/security-specialist/jwt-audit", {
  reviewed: backendWork.implementation,
  findings: ["Rate limiting recommended"],
  confidence: 0.88
});

// Validator accesses both for consensus
const backendWork = await swarmMemory.retrieve("swarm/backend-dev/jwt-auth");
const securityAudit = await swarmMemory.retrieve("swarm/security-specialist/jwt-audit");

// Validator makes informed decision
const validatorDecision = {
  approve: true,
  confidence: (backendWork.confidence + securityAudit.confidence) / 2,
  review: "Both implementations solid, recommend rate limiting"
};
```

### Persistence Strategy

**Automatic Persistence**:
- Every `store()` operation writes to SQLite immediately
- No manual save required
- Atomic transactions ensure data integrity

**Memory Lifecycle**:
```javascript
// 1. Initialize (loads existing data)
const memory = new SwarmMemory({ directory: '.swarm' });
await memory.initialize();

// 2. Store operations (auto-persist)
await memory.store(key, value);  // Writes to disk immediately

// 3. Retrieve operations (from memory + disk)
const data = await memory.retrieve(key);

// 4. Search operations (indexed queries)
const results = await memory.search('swarm/*/tasks/*');

// 5. Cleanup (optional)
await memory.cleanup();  // Removes old entries
memory.close();          // Final persist and close
```

### Cleanup Mechanisms

**LRU Eviction** (Least Recently Used):
```javascript
// Automatic cleanup in FeedbackInjectionSystem
class FeedbackInjectionSystem {
  storeFeedbackInHistory(phaseId, feedback) {
    if (!this.feedbackHistory[phaseId]) {
      this.feedbackHistory[phaseId] = [];
    }

    this.feedbackHistory[phaseId].push(feedback);

    // LRU eviction: max 100 entries per phase
    if (this.feedbackHistory[phaseId].length > 100) {
      this.feedbackHistory[phaseId].shift();  // Remove oldest
    }
  }
}
```

**Manual Cleanup**:
```bash
# Remove old entries (>30 days)
npx claude-flow-novice memory cleanup --retention-days 30

# Export before cleanup
npx claude-flow-novice memory export --format json > backup.json

# Clear specific namespace
npx claude-flow-novice memory clear --namespace "swarm/old-project/*"
```

**Database Maintenance**:
```bash
# Vacuum SQLite database (reclaim space)
sqlite3 .swarm/swarm-memory.db "VACUUM;"

# Analyze query performance
sqlite3 .swarm/swarm-memory.db "ANALYZE;"

# Backup database
cp .swarm/swarm-memory.db .swarm/swarm-memory-backup-$(date +%Y%m%d).db
```

---

## 8. Security Implementation

### CVE Fixes (001, 002, 003)

#### CVE-CFN-2025-001: Iteration Limit Validation

**Vulnerability**: Unbounded iteration limits could cause infinite loops.

**Fix**:
```javascript
function validateIterationLimits(maxLoop2, maxLoop3) {
  // SECURITY: Validate iteration limits (1-100)
  if (!Number.isInteger(maxLoop2) || maxLoop2 < 1 || maxLoop2 > 100) {
    throw new Error('Invalid Loop 2 iteration limit (must be 1-100)');
  }
  if (!Number.isInteger(maxLoop3) || maxLoop3 < 1 || maxLoop3 > 100) {
    throw new Error('Invalid Loop 3 iteration limit (must be 1-100)');
  }
}

// Usage
const maxLoop2 = parseInt(userInput) || 10;
const maxLoop3 = parseInt(userInput) || 10;
validateIterationLimits(maxLoop2, maxLoop3);
```

#### CVE-CFN-2025-002: Prompt Injection in Feedback

**Vulnerability**: Validator feedback could contain prompt injection attacks.

**Fix** (Automatic in `FeedbackInjectionSystem`):
```javascript
sanitizeFeedback(feedback) {
  const dangerousPatterns = [
    /IGNORE\s+PREVIOUS\s+INSTRUCTIONS/gi,
    /SYSTEM:|ASSISTANT:|USER:/gi,
    /ACT\s+AS|PRETEND\s+TO\s+BE/gi,
    /DISREGARD|FORGET/gi
  ];

  let sanitized = feedback;

  for (const pattern of dangerousPatterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  // Length limit: 5000 characters
  if (sanitized.length > 5000) {
    sanitized = sanitized.substring(0, 5000) + '... [TRUNCATED]';
  }

  return sanitized;
}
```

#### CVE-CFN-2025-003: Memory Leak in Feedback Registry

**Vulnerability**: Unbounded feedback storage caused memory leaks.

**Fix** (LRU Eviction):
```javascript
class FeedbackInjectionSystem {
  constructor() {
    this.feedbackHistory = {};
    this.issueDeduplicationRegistry = {};
    this.MAX_FEEDBACK_PER_PHASE = 100;
    this.MAX_REGISTRY_PER_PHASE = 100;
  }

  storeFeedbackInHistory(phaseId, feedback) {
    if (!this.feedbackHistory[phaseId]) {
      this.feedbackHistory[phaseId] = [];
    }

    this.feedbackHistory[phaseId].push(feedback);

    // LRU eviction
    if (this.feedbackHistory[phaseId].length > this.MAX_FEEDBACK_PER_PHASE) {
      this.feedbackHistory[phaseId].shift();  // Remove oldest
    }
  }

  cleanup() {
    // Cleanup old registries
    for (const phaseId in this.issueDeduplicationRegistry) {
      if (this.issueDeduplicationRegistry[phaseId].size > this.MAX_REGISTRY_PER_PHASE) {
        this.issueDeduplicationRegistry[phaseId].clear();
      }
    }
  }
}
```

### Input Validation

**Command Arguments**:
```javascript
function validateCommandInput(args) {
  const validCommands = ['swarm_init', 'agent_spawn', 'memory_store'];

  if (!validCommands.includes(args.command)) {
    throw new Error(`Invalid command: ${args.command}`);
  }

  // Validate file paths
  if (args.file && !args.file.match(/^[a-zA-Z0-9_\-./]+$/)) {
    throw new Error('Invalid file path format');
  }

  // Validate memory keys
  if (args.memoryKey && !args.memoryKey.match(/^swarm\/[a-zA-Z0-9_\-/]+$/)) {
    throw new Error('Invalid memory key format');
  }
}
```

**File Path Sanitization**:
```javascript
import path from 'path';

function sanitizeFilePath(filePath) {
  // Resolve to absolute path
  const resolved = path.resolve(filePath);

  // Ensure within project directory
  const projectRoot = process.cwd();
  if (!resolved.startsWith(projectRoot)) {
    throw new Error('File path outside project directory');
  }

  // Block dangerous patterns
  if (resolved.includes('..') || resolved.includes('~')) {
    throw new Error('Path traversal attempt detected');
  }

  return resolved;
}
```

### Sanitization Patterns

**XSS Prevention**:
```javascript
function sanitizeOutput(text) {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}
```

**SQL Injection Prevention** (Prepared Statements):
```javascript
// GOOD: Parameterized query
const stmt = db.prepare('INSERT INTO memory (key, value) VALUES (?, ?)');
stmt.run(key, value);

// BAD: String concatenation
// const query = `INSERT INTO memory (key, value) VALUES ('${key}', '${value}')`;
```

**Command Injection Prevention**:
```javascript
import { execSync } from 'child_process';

// NEVER use shell: true with user input
function runCommand(command, args) {
  // Whitelist allowed commands
  const allowedCommands = ['node', 'npm', 'git', 'cargo', 'rustfmt'];

  if (!allowedCommands.includes(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }

  // Use array args (no shell interpolation)
  return execSync(command, args, { shell: false });
}
```

### Circuit Breaker Protection

**Timeout Management**:
```javascript
const circuitBreaker = new CFNCircuitBreakerManager();

const result = await circuitBreaker.execute(
  'jwt-auth-implementation',
  async () => {
    return await orchestrator.executePhase(task);
  },
  {
    timeoutMs: 30 * 60 * 1000,    // 30 minutes
    failureThreshold: 3,           // Open after 3 failures
    cooldownMs: 5 * 60 * 1000      // 5 minute cooldown
  }
);

if (result.circuitOpen) {
  console.error('Circuit breaker OPEN - system protection activated');
  console.error(`Next attempt allowed at: ${result.nextAttemptTime}`);
}
```

---

## 9. Performance Optimization

### Parallel Confidence Collection

**Implementation**:
```javascript
// Agents validate concurrently (not sequentially)
const confidenceScores = await Promise.all(
  agents.map(agent => agent.calculateConfidence())
);

// 3x faster than sequential:
// Sequential: T1 + T2 + T3 = 15 seconds
// Parallel: max(T1, T2, T3) = 5 seconds
```

**Benchmark**:
- 3 agents: **3x speedup** (15s → 5s)
- 6 agents: **6x speedup** (30s → 5s)
- 12 agents: **12x speedup** (60s → 5s)

### Memory Efficiency

**LRU Cache**:
```javascript
class FeedbackInjectionSystem {
  constructor() {
    this.MAX_FEEDBACK_PER_PHASE = 100;
    this.feedbackHistory = {};
  }

  storeFeedbackInHistory(phaseId, feedback) {
    if (!this.feedbackHistory[phaseId]) {
      this.feedbackHistory[phaseId] = [];
    }

    this.feedbackHistory[phaseId].push(feedback);

    // Automatic eviction
    if (this.feedbackHistory[phaseId].length > this.MAX_FEEDBACK_PER_PHASE) {
      this.feedbackHistory[phaseId].shift();
    }
  }
}
```

**Memory Usage**:
- Without LRU: **Unbounded growth** (memory leak)
- With LRU: **Capped at 100 entries** per phase
- Typical usage: **~5MB** for 10 phases

### Timeout Management

**Hierarchical Timeouts**:
```javascript
const timeouts = {
  hookExecution: 30000,        // 30 seconds per hook
  agentTask: 5 * 60000,        // 5 minutes per agent task
  consensusRound: 10 * 60000,  // 10 minutes per consensus
  totalPhase: 30 * 60000       // 30 minutes total phase
};

// Example: Agent task with timeout
const taskPromise = agent.executeTask(instructions);
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Task timeout')), timeouts.agentTask)
);

const result = await Promise.race([taskPromise, timeoutPromise]);
```

### Scalability Patterns

**Agent Batching**:
```javascript
// Spawn ALL agents in single message (not one-by-one)
[Single Message]:
  Task("Agent 1", "...", "type1")
  Task("Agent 2", "...", "type2")
  Task("Agent 3", "...", "type3")
  // ... up to 20 agents

// Result: Single coordination overhead vs N overheads
```

**Memory Pooling**:
```javascript
class SwarmMemoryPool {
  constructor() {
    this.connections = new Map();
  }

  async getConnection(swarmId) {
    if (!this.connections.has(swarmId)) {
      const conn = new SwarmMemory({ swarmId });
      await conn.initialize();
      this.connections.set(swarmId, conn);
    }
    return this.connections.get(swarmId);
  }

  closeAll() {
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
  }
}
```

**Incremental Validation**:
```javascript
// Only validate changed files (not entire project)
const changedFiles = getChangedFilesSinceLastRun();

for (const file of changedFiles) {
  await runPostEditHook(file);
}

// Result: 10x faster for large projects (100+ files)
```

---

## 10. Troubleshooting Guide

### Common Issues

#### Issue 1: Agents Not Coordinating

**Symptom**: Agents produce conflicting solutions (e.g., 3 different auth methods).

**Cause**: `swarm_init` not called before spawning agents.

**Solution**:
```javascript
// ❌ BAD: No swarm initialization
Task("Agent 1", "Fix auth", "coder")
Task("Agent 2", "Fix auth", "coder")

// ✅ GOOD: Initialize swarm first
mcp__claude-flow-novice__swarm_init({ topology: "mesh", maxAgents: 2 })
Task("Agent 1", "Fix auth", "coder")
Task("Agent 2", "Fix auth", "coder")
```

#### Issue 2: Post-Edit Hook Failures

**Symptom**: `enhanced-hooks` command fails or returns errors.

**Cause**: Missing dependencies (prettier, eslint, jest, etc.).

**Solution**:
```bash
# Check what's missing
npx enhanced-hooks post-edit "file.js" --structured

# Install missing dependencies
npm install --save-dev prettier eslint jest

# Re-run hook
npx enhanced-hooks post-edit "file.js" --structured
```

**Alternative**: Enable graceful degradation
```javascript
// config/cfn-loop-config.js
export const CFN_CONFIG = {
  selfValidation: {
    blockOnCritical: false,
    gracefulDegradation: true
  }
};
```

#### Issue 3: Low Confidence Scores

**Symptom**: Self-validation always fails, confidence < 0.75.

**Cause**: Unrealistic coverage requirements or missing tests.

**Diagnosis**:
```bash
npx enhanced-hooks post-edit "file.js" --structured
```

**Solution**:
```bash
# 1. Lower coverage threshold temporarily
npx enhanced-hooks post-edit "file.js" --minimum-coverage 60 --structured

# 2. Add missing tests (priority)
# Focus on test coverage first

# 3. Adjust confidence weights in config
# Reduce coverage weight if prototyping
```

#### Issue 4: Consensus Never Reached

**Symptom**: Validators disagree after 5+ rounds.

**Cause**: Contradictory validator feedback or ambiguous requirements.

**Diagnosis**:
```javascript
// Validator 1: "Use Redis for rate limiting"
// Validator 2: "Use in-memory rate limiting"
// → Contradiction! Clarify requirements
```

**Solution**:
1. **Review validator feedback for conflicts**
2. **Manually resolve ambiguity**:
   ```markdown
   **Clarification**: Use Redis for production (scalable)
   Use in-memory for development (simple setup)
   ```
3. **Re-initialize swarm with clarified requirements**

#### Issue 5: Memory Storage Failures

**Symptom**: SwarmMemory operations fail or return null.

**Cause**: SQLite database initialization issues.

**Solution**:
```bash
# Check if .swarm directory exists
ls -la .swarm

# Create if missing
mkdir -p .swarm

# Re-initialize SwarmMemory
npx claude-flow-novice swarm init

# Verify database
sqlite3 .swarm/swarm-memory.db "SELECT * FROM memory LIMIT 5;"
```

#### Issue 6: Task Timeout

**Symptom**: CFN Loop aborts with "timeout exceeded".

**Cause**: Task too complex for single iteration or agent count too low.

**Solution**:
1. **Break into smaller tasks**:
   ```markdown
   # Instead of:
   "Build complete authentication system"

   # Use:
   Task 1: "Implement JWT token generation"
   Task 2: "Implement JWT token validation"
   Task 3: "Implement password hashing"
   Task 4: "Add authentication middleware"
   ```

2. **Increase agent count**:
   ```javascript
   mcp__claude-flow-novice__swarm_init({
     topology: "mesh",
     maxAgents: 6  // Was 3
   })
   ```

3. **Extend timeout**:
   ```javascript
   // config/cfn-loop-config.js
   export const CFN_CONFIG = {
     timeout: {
       taskTimeout: 600000,      // 10 minutes (was 5)
       consensusTimeout: 300000  // 5 minutes (was 3)
     }
   };
   ```

### Debug Commands

```bash
# Check swarm status
npx claude-flow-novice swarm status --swarm-id jwt-auth-swarm

# View memory contents
sqlite3 .swarm/swarm-memory.db "SELECT key, value FROM memory WHERE key LIKE 'swarm/%';"

# Trace agent execution
DEBUG=* npx claude-flow-novice swarm execute --task jwt-auth

# Export metrics for analysis
npx claude-flow-novice metrics export --format json > cfn-metrics.json

# Validate configuration
npx claude-flow-novice config validate

# Check circuit breaker state
npx claude-flow-novice circuit-breaker status --name jwt-auth

# View feedback history
npx claude-flow-novice feedback history --phase jwt-auth --format json
```

### Error Interpretation

**Common Error Messages**:

| Error | Meaning | Solution |
|-------|---------|----------|
| `Circuit breaker OPEN` | Too many failures, system protection active | Wait for cooldown or reset breaker |
| `Confidence below threshold` | Self-validation failed | Add tests, fix validation issues |
| `Consensus not reached` | Validators disagree | Review feedback, clarify requirements |
| `Memory store failed` | Database write error | Check `.swarm/` permissions |
| `Hook execution timeout` | Post-edit hook took too long | Optimize tests, increase timeout |
| `Invalid iteration limit` | Out of range (1-100) | Adjust to valid range |
| `Feedback sanitization` | Potential prompt injection | Review validator feedback |

### Recovery Procedures

**Stuck in Loop 2 (Self-Validation)**:
```bash
# 1. Check agent confidence scores
npx claude-flow-novice agent metrics --agent-id backend-dev

# 2. Review hook output
npx enhanced-hooks post-edit "src/file.js" --structured

# 3. Lower threshold temporarily
# config/cfn-loop-config.js
selfValidation: { confidenceThreshold: 0.70 }

# 4. Proceed to consensus with warnings
```

**Stuck in Loop 3 (Consensus)**:
```bash
# 1. Review validator feedback
npx claude-flow-novice consensus results --round-id jwt-auth/round-5

# 2. Identify contradictions
# Look for conflicting recommendations

# 3. Manual resolution
# Clarify requirements, re-initialize swarm

# 4. Skip to next steps (if acceptable)
npx claude-flow-novice phase skip --reason "Manual override"
```

**Circuit Breaker Recovery**:
```bash
# 1. Check breaker state
npx claude-flow-novice circuit-breaker status --name jwt-auth

# 2. Wait for cooldown
# Next attempt time shown in output

# 3. Force reset (if safe)
npx claude-flow-novice circuit-breaker reset --name jwt-auth

# 4. Retry with adjustments
# Increase timeout, reduce complexity
```

---

## 11. Real-World Examples

### Example 1: Simple Feature (3 Agents)

**Task**: Add user profile endpoint to REST API

**Complexity**: Simple (3-5 steps)

**Full Execution Trace**:

#### Phase 1: Initialization
```javascript
[Single Message]:
  // Initialize swarm
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  // Spawn agents
  Task("Backend Coder", `
    Implement GET /api/users/:id endpoint:
    - Retrieve user profile from database
    - Return JSON response with user data
    - Handle user not found (404)
    - Add input validation for user ID
  `, "coder")

  Task("Test Engineer", `
    Write integration tests for /api/users/:id:
    - Test successful user retrieval
    - Test user not found (404)
    - Test invalid user ID format
    - Achieve 80%+ coverage
  `, "tester")

  Task("Code Reviewer", `
    Review implementation for:
    - Code quality and maintainability
    - Error handling completeness
    - API design consistency
    - Security best practices
  `, "reviewer")
```

#### Phase 2: Execution (Round 1)

**Agent: Backend Coder**
```bash
# Edit file: src/routes/users.js
# Added GET /api/users/:id endpoint (45 lines)

# MANDATORY: Run post-edit hook
npx enhanced-hooks post-edit "src/routes/users.js" \
  --memory-key "swarm/backend-coder/user-profile" \
  --structured
```

**Hook Response**:
```json
{
  "success": true,
  "validation": { "passed": true },
  "testing": {
    "passed": 0,
    "failed": 0,
    "coverage": 0
  },
  "recommendations": [
    { "type": "test", "message": "No tests found for this file" }
  ]
}
```

**Self-Validation**:
```javascript
confidence = 0.00 + 0.00 + 0.15 + 0.20 + 0.10 = 0.45
// ❌ Below threshold (0.75) - no tests yet
```

**Agent: Test Engineer**
```bash
# Edit file: tests/routes/users.test.js
# Added integration tests (98 lines)

npx enhanced-hooks post-edit "tests/routes/users.test.js" \
  --memory-key "swarm/test-engineer/user-profile" \
  --structured
```

**Hook Response**:
```json
{
  "success": true,
  "testing": {
    "framework": "jest",
    "passed": 5,
    "failed": 0,
    "coverage": 87
  }
}
```

**Self-Validation**:
```javascript
confidence = 0.30 + 0.25 + 0.15 + 0.20 + 0.10 = 1.00
// ✅ Pass
```

**Agent: Code Reviewer**
```javascript
confidence = 0.88  // ✅ Pass
```

**GATE 1: Self-Assessment**
```javascript
minConfidence = min(0.45, 1.00, 0.88) = 0.45
// ❌ FAIL: Below threshold (0.75)
// → Round 2 with feedback
```

#### Phase 3: Execution (Round 2 with Feedback)

**Feedback to Backend Coder**:
```
Previous validation failed:
- No tests found for src/routes/users.js
- Work with Test Engineer to ensure tests cover your implementation
```

**Backend Coder re-runs hook after tests added**:
```bash
npx enhanced-hooks post-edit "src/routes/users.js" \
  --memory-key "swarm/backend-coder/user-profile" \
  --structured
```

**Updated Confidence**:
```javascript
confidence = 0.30 + 0.25 + 0.15 + 0.20 + 0.10 = 1.00
// ✅ Pass (tests now available)

minConfidence = min(1.00, 1.00, 0.88) = 0.88
// ✅ PASS: Proceed to Loop 3
```

#### Phase 4: Consensus Verification

```javascript
[Single Message]:
  Task("Quality Reviewer", "Comprehensive quality review", "reviewer")
  Task("Security Auditor", "Security and performance audit", "security-specialist")
```

**Validator Assessments**:
```javascript
// Quality Reviewer
{
  approve: true,
  confidence: 0.92,
  issues: ["Consider extracting validation logic to middleware"]
}

// Security Auditor
{
  approve: true,
  confidence: 0.95,
  issues: []
}
```

**GATE 2: Consensus Decision**
```javascript
agreementRate = 2/2 = 1.0 (100%)
avgConfidence = (0.92 + 0.95) / 2 = 0.935 (93.5%)
decision = "PASS"  // ✅
```

#### Phase 5: Exit - Next Steps Guidance

```json
{
  "completed": "User profile endpoint (GET /api/users/:id)",
  "validationResults": {
    "confidence": 0.935,
    "coverage": 87,
    "consensusApproval": true
  },
  "identifiedIssues": [],
  "nextSteps": [
    "Consider extracting validation logic to reusable middleware",
    "Add user profile update endpoint (PUT /api/users/:id)",
    "Deploy to staging environment"
  ]
}
```

**Total Rounds**: 2 (1 retry in Loop 2, 1 consensus pass)

---

### Example 2: Medium Complexity (6 Agents)

**Task**: Implement real-time chat feature with WebSockets

**Complexity**: Medium (6-10 steps)

#### Phase 1: Initialization
```javascript
[Single Message]:
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 6,
    strategy: "balanced"
  })

  Task("Backend Developer", "Implement WebSocket server with socket.io", "backend-dev")
  Task("Frontend Developer", "Implement WebSocket client and chat UI", "frontend-dev")
  Task("Test Engineer", "Write integration tests for WebSocket flow", "tester")
  Task("Security Specialist", "Audit WebSocket security and authentication", "security-specialist")
  Task("Code Reviewer", "Review code quality and architecture", "reviewer")
  Task("API Documenter", "Document WebSocket API and events", "api-docs")
```

#### Phase 2: Execution (Round 1)

**Self-Validation Results**:
```javascript
{
  "backend-dev": { confidence: 0.82 },
  "frontend-dev": { confidence: 0.78 },
  "tester": { confidence: 0.85 },
  "security-specialist": { confidence: 0.68 },  // ❌ Below threshold
  "reviewer": { confidence: 0.88 },
  "api-docs": { confidence: 0.92 }
}

minConfidence = 0.68
// ❌ FAIL: Security concerns identified
// Feedback: "WebSocket connections lack authentication middleware"
```

#### Phase 3: Execution (Round 2 with Feedback)

**Feedback to Backend Developer**:
```
Security validation failed:
- WebSocket connections lack authentication middleware
- Implement JWT verification before accepting socket connections
```

**Backend Developer adds authentication**:
```javascript
// Updated confidence
{
  "backend-dev": { confidence: 0.95 },
  "security-specialist": { confidence: 0.91 }  // ✅ Now passes
}

minConfidence = 0.78
// ✅ PASS: Proceed to Loop 3
```

#### Phase 4: Consensus

```javascript
{
  agreementRate: 1.0,        // 100% (4/4 approve)
  avgConfidence: 0.9125,     // 91.25%
  decision: "PASS"           // ✅
}
```

**Total Rounds**: 2 (1 retry in Loop 2, 1 consensus pass)

---

### Example 3: Complex System (12 Agents)

**Task**: Build microservices API gateway with authentication, rate limiting, and monitoring

**Complexity**: Complex (11-20 steps)

#### Phase 1: Initialization
```javascript
[Single Message]:
  mcp__claude-flow-novice__swarm_init({
    topology: "hierarchical",  // 12 agents → hierarchical
    maxAgents: 12,
    strategy: "adaptive"
  })

  Task("System Architect", "Design API gateway architecture", "system-architect")
  Task("Backend Developer", "Implement gateway routing logic", "backend-dev")
  Task("Security Specialist", "Implement JWT auth and encryption", "security-specialist")
  Task("Network Engineer", "Configure load balancing and proxying", "network-engineer")
  Task("DevOps Engineer", "Setup Docker and Kubernetes deployment", "devops-engineer")
  Task("Database Specialist", "Design rate limiting storage (Redis)", "database-specialist")
  Task("Performance Analyzer", "Optimize request latency and throughput", "perf-analyzer")
  Task("Monitoring Specialist", "Setup Prometheus and Grafana dashboards", "monitoring-specialist")
  Task("Test Engineer", "Write integration and load tests", "tester")
  Task("API Documenter", "Document gateway endpoints and configuration", "api-docs")
  Task("Compliance Auditor", "Ensure GDPR and security compliance", "compliance-auditor")
  Task("Code Reviewer", "Review overall quality and consistency", "reviewer")
```

#### Phase 2: Execution (Rounds 1-5)

**Round 1**: Architecture design and initial implementation
**Round 2**: Security hardening after security audit feedback
**Round 3**: Performance optimization after load testing
**Round 4**: Configuration refinement after devops feedback
**Round 5**: Final integration and documentation updates

**Self-Validation Results (Round 5)**:
```javascript
{
  minConfidence: 0.87,       // ✅ All agents above 0.75
  avgConfidence: 0.91
}
// ✅ PASS: Proceed to Loop 3
```

#### Phase 3: Consensus (Rounds 1-3)

**Round 1**: Initial consensus with 75% agreement (below threshold)
**Round 2**: Re-validation after addressing feedback (85% agreement)
**Round 3**: Final consensus with full alignment

**Consensus Result (Round 3)**:
```javascript
{
  agreementRate: 0.95,       // 95% (19/20 validator assessments approve)
  avgConfidence: 0.93,       // 93%
  decision: "PASS"           // ✅
}
```

**Total Rounds**: 5 (Loop 2) + 3 (Loop 3) = **8 total iterations**

---

## Appendix: Quick Reference

### CFN Loop Checklist

**Before Starting**:
- [ ] Task complexity assessed (Simple/Medium/Complex/Enterprise)
- [ ] Agent count determined (3/6/12/20)
- [ ] Topology selected (mesh for 2-7, hierarchical for 8+)
- [ ] Configuration reviewed (thresholds, coverage, etc.)

**Loop 1 (Initialization)**:
- [ ] `swarm_init` called with correct parameters
- [ ] All agents spawned in SINGLE message
- [ ] Each agent has specific, non-overlapping instructions

**Loop 2 (Execution)**:
- [ ] Each file edit followed by post-edit hook
- [ ] Hook results stored in memory
- [ ] Self-validation confidence calculated
- [ ] GATE 1 passed (confidence ≥ 0.75) OR feedback injected

**Loop 3 (Consensus)**:
- [ ] 2-4 validators spawned
- [ ] Each validator performs multi-dimensional assessment
- [ ] Byzantine consensus voting executed
- [ ] GATE 2 passed (agreement ≥ 0.90) OR feedback injected

**Exit**:
- [ ] Results stored in SwarmMemory
- [ ] Next Steps Guidance provided
- [ ] Documentation updated (if required)

### Command Quick Reference

```bash
# Initialize swarm (MCP)
mcp__claude-flow-novice__swarm_init({ topology, maxAgents, strategy })

# Spawn agents (Claude Code Task tool)
Task("Name", "Instructions", "type")

# Post-edit hook (MANDATORY)
npx enhanced-hooks post-edit "file" --memory-key "key" --structured

# Check swarm status
npx claude-flow-novice swarm status

# View memory
npx claude-flow-novice memory search "swarm/*"

# Export metrics
npx claude-flow-novice metrics export
```

### Confidence Thresholds Summary

| Phase | Threshold | Description |
|-------|-----------|-------------|
| Self-Validation | 0.75 | Minimum agent confidence to proceed to consensus |
| Consensus Agreement | 0.90 | Minimum validator approval rate |
| Consensus Confidence | 0.90 | Minimum average validator confidence |
| Coverage Minimum | 0.80 | Minimum test coverage (80%) |

### Agent Type Reference

| Type | Role | Use Cases |
|------|------|-----------|
| `coder` | General implementation | Feature development, bug fixes |
| `tester` | Test writing and validation | Unit tests, integration tests |
| `reviewer` | Code quality review | Architecture, maintainability |
| `security-specialist` | Security auditing | Auth, encryption, vulnerability scan |
| `system-architect` | Architecture design | System design, scalability |
| `backend-dev` | Backend implementation | APIs, databases, servers |
| `frontend-dev` | Frontend implementation | UI, client-side logic |
| `devops-engineer` | Deployment and infrastructure | Docker, K8s, CI/CD |
| `api-docs` | Documentation | API specs, README, guides |
| `perf-analyzer` | Performance optimization | Profiling, caching, optimization |
| `database-specialist` | Database design | Schema, queries, migrations |
| `mobile-dev` | Mobile development | iOS, Android, React Native |
| `compliance-auditor` | Regulatory compliance | GDPR, HIPAA, SOC2 |
| `product-owner` | GOAP scope control | Consensus validation, scope enforcement |

---

**End of CFN Loop Complete Implementation Guide**

For issues or questions, consult the main documentation or GitHub Issues.
