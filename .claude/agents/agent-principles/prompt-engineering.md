# Prompt Engineering Best Practices

**Version:** 2.0.0
**Last Updated:** 2025-09-30

## Core Principles

Effective agent prompts require careful attention to structure, clarity, and appropriate detail level based on task complexity.

---

## 1. Clear Role Definition

```yaml
GOOD:
  "You are a senior Rust developer specializing in concurrent programming"

BAD:
  "You write code"

WHY:
  - Clear expertise domain
  - Sets expectations for quality
  - Activates relevant knowledge
```

---

## 2. Specific Responsibilities

```yaml
GOOD:
  - Implement lock-free data structures using atomics
  - Ensure memory safety with proper synchronization
  - Write linearizability tests using loom

BAD:
  - Write concurrent code
  - Make it safe

WHY:
  - Concrete and actionable
  - Measurable outcomes
  - Clear scope
```

---

## 3. Appropriate Tool Selection

```yaml
Essential Tools:
  - Read: Required for all agents (must read before editing)
  - Write: For creating new files
  - Edit: For modifying existing files
  - Bash: For running commands
  - Grep: For searching code
  - Glob: For finding files
  - TodoWrite: For task tracking

Optional Tools:
  - WebSearch: For research agents
  - Task: For coordinator agents (spawning sub-agents)

AVOID:
  - Giving unnecessary tools
  - Restricting essential tools
```

---

## 4. Integration Points

```yaml
GOOD:
  Collaboration:
    - Architect: Provides design constraints
    - Reviewer: Validates implementation
    - Tester: Ensures correctness

BAD:
  "Works with other agents"

WHY:
  - Specific integration contracts
  - Clear handoff points
  - Defined outputs/inputs
```

---

## 5. Validation and Hooks

### Mandatory Post-Edit Validation

**CRITICAL**: After **EVERY** file edit operation:

```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "agent/step" --structured
```

**Benefits:**
- TDD compliance checking
- Security analysis (XSS, eval, credentials)
- Formatting validation
- Coverage analysis
- Actionable recommendations

**Rationale:**
- Ensures quality gates
- Provides immediate feedback
- Coordinates with other agents via memory
- Maintains system-wide standards

### Four Production-Ready Validators

All agents integrate with these validators automatically:

**1. Agent Template Validator** (Priority 1 - CRITICAL)
- Validates SQLite lifecycle hooks (spawn, update, terminate)
- Validates ACL level declarations (1-5)
- Validates error handling patterns (SQLite failures, Redis connection loss)
- Validates blocking coordination imports (coordinators only)
- Automation: 95% (WASM-accelerated pattern matching)
- Execution time: <2s

**2. CFN Loop Memory Pattern Validator** (Priority 2 - HIGH)
- Validates ACL level correctness (Loop 3: Private=1, Loop 2: Swarm=3, Loop 4: Project=4)
- Validates memory key format (`cfn/phase-{id}/loop{N}/...`)
- Validates TTL values match retention policies (Loop 4: 365 days)
- Validates encryption for sensitive data
- Automation: 90% (deterministic rule matching)
- Execution time: <2s

**3. Test Coverage Validator** (Priority 3 - MEDIUM)
- Validates line coverage ≥ 80%
- Validates branch coverage ≥ 75%
- Validates function coverage ≥ 80%
- Validates agent lifecycle tests present
- Automation: 100% (quantitative metrics)
- Execution time: <2s

**4. Blocking Coordination Validator** (Priority 4 - MEDIUM)
- Validates required imports (BlockingCoordinationSignals, CoordinatorTimeoutHandler)
- Validates HMAC secret environment variable usage
- Validates signal sending/receiving patterns present
- Hybrid validation: Spawns reviewer agent for state machine logic
- Automation: 60% (complex logic requires semantic review)
- Execution time: <5s (includes agent review)

**Composite Validation:**
- Hooks compose for comprehensive validation (<5s total)
- Results merge for actionable recommendations
- False positive rate: <2%

---

## 6. Anti-Patterns to Avoid

### ❌ Over-Specification (Tunnel Vision)

```markdown
BAD (for complex tasks):

## Strict Algorithm

1. ALWAYS use bubble sort for sorting
2. NEVER use built-in sort functions
3. MUST iterate exactly 10 times
4. Check each element precisely in this order: [detailed steps]

WHY BAD:
- Prevents optimal solutions
- Ignores context-specific needs
- Reduces AI reasoning ability
- May enforce suboptimal patterns
```

### ❌ Under-Specification (Too Vague)

```markdown
BAD (for basic tasks):

## Implementation

Write some code that works.

WHY BAD:
- No guidance on patterns
- Unclear success criteria
- High iteration count
- Inconsistent quality
```

### ❌ Example Overload

```markdown
BAD (for complex tasks):

[50 code examples of every possible pattern]

WHY BAD:
- Cognitive overload
- Priming bias
- Reduces creative problem-solving
- Makes prompt harder to maintain
```

### ❌ Rigid Checklists

```markdown
BAD (for architecture):

You MUST:
[ ] Use exactly these 5 patterns
[ ] Never deviate from this structure
[ ] Follow these steps in exact order
[ ] Use only these technologies

WHY BAD:
- Context-insensitive
- Prevents trade-off analysis
- Enforces solutions before understanding problems
```

---

## Agent Profile Structure

### Required Frontmatter (YAML)

```yaml
---
name: agent-name                    # REQUIRED: Lowercase with hyphens
description: |                      # REQUIRED: Clear, keyword-rich description
  MUST BE USED when [primary use case].
  Use PROACTIVELY for [specific scenarios].
  ALWAYS delegate when user asks [trigger phrases].
  Keywords - [comma-separated keywords for search]
tools: [Read, Write, Edit, Bash, TodoWrite]  # REQUIRED: Comma-separated list
model: sonnet                       # REQUIRED: sonnet | opus | haiku
color: seagreen                     # REQUIRED: Visual identifier
type: specialist                    # OPTIONAL: specialist | coordinator | swarm
capabilities:                       # OPTIONAL: Array of capability tags
  - rust
  - error-handling
  - concurrent-programming
validation_hooks:                   # REQUIRED: Auto-triggered validators
  - agent-template-validator        # MANDATORY for all agents
  - cfn-loop-memory-validator       # MANDATORY for all agents
  - test-coverage-validator         # For implementers/testers
  - blocking-coordination-validator # For coordinators only
lifecycle:                          # REQUIRED: Hooks for SQLite lifecycle
  pre_task: |
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', '${AGENT_TYPE}', 'active', CURRENT_TIMESTAMP)"
  post_task: |
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', confidence = ${CONFIDENCE_SCORE},
                         completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"
hooks:                             # OPTIONAL: Integration points
  memory_key: "agent-name/context"
  validation: "post-edit"
triggers:                          # OPTIONAL: Automatic activation patterns
  - "build rust"
  - "implement concurrent"
constraints:                       # OPTIONAL: Limitations and boundaries
  - "Do not modify production database"
  - "Require approval for breaking changes"
---
```

### Body Structure

```markdown
# Agent Name

[Opening paragraph: WHO you are, WHAT you do]

## 🚨 MANDATORY POST-EDIT VALIDATION

**CRITICAL**: After **EVERY** file edit operation, you **MUST** run:

```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "agent/step" --structured
```

[Why this matters and what it provides]

## Core Responsibilities

[Primary duties in clear, actionable bullet points]

## Approach & Methodology

[HOW the agent accomplishes tasks - frameworks, patterns, decision-making]

## Integration & Collaboration

[How this agent works with other agents and the broader system]

## Examples & Best Practices

[Concrete examples showing the agent in action]

## Success Metrics

[How to measure agent effectiveness]
```

---

## Integration with Claude Flow

### Hook System Integration

Every agent should integrate with the Claude Flow hook system for coordination:

#### 1. Pre-Task Hook (SQLite Lifecycle)

```bash
# Register agent in SQLite on spawn (executed by lifecycle.pre_task)
sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                 VALUES ('${AGENT_ID}', '${AGENT_TYPE}', 'active', CURRENT_TIMESTAMP)"
```

**Purpose:**
- Initialize task context
- Register agent in SQLite for audit trail
- Set up memory namespace with appropriate ACL level
- Log task start
- Coordinate with other agents via Redis pub/sub

#### 2. Post-Edit Hook (MANDATORY)

```bash
npx claude-flow@alpha hooks post-edit src/auth/login.rs \
  --memory-key "coder/auth/login" \
  --structured
```

**Purpose:**
- Validate TDD compliance
- Run security analysis
- Check code formatting
- Analyze test coverage
- Store results in shared memory
- Provide actionable recommendations

**Output Includes:**
- ✅/❌ Compliance status
- 🔒 Security findings
- 🎨 Formatting issues
- 📊 Coverage metrics
- 🤖 Improvement suggestions

#### 3. Post-Task Hook (SQLite Lifecycle)

```bash
# Update agent status and confidence on completion (executed by lifecycle.post_task)
sqlite-cli exec "UPDATE agents
                 SET status = 'completed',
                     confidence = ${CONFIDENCE_SCORE},
                     completed_at = CURRENT_TIMESTAMP
                 WHERE id = '${AGENT_ID}'"
```

**Purpose:**
- Finalize task
- Update SQLite with final confidence score and status
- Export metrics
- Update coordination state
- Trigger downstream agents

#### 4. SQLite Error Handling (Best Practices)

```javascript
// Retry with exponential backoff for transient errors
try {
  await sqlite.memoryAdapter.set(key, value, { aclLevel: 1 });
} catch (error) {
  if (error.code === 'SQLITE_BUSY') {
    await retryWithBackoff(() => sqlite.memoryAdapter.set(key, value, { aclLevel: 1 }));
  } else if (error.code === 'SQLITE_LOCKED') {
    await waitForLockRelease(key);
  } else {
    console.error('SQLite failure:', error);
    // Fallback to Redis for non-critical data (ACL level < 4)
    if (aclLevel < 4) {
      await redis.set(key, value);
    } else {
      throw new Error('Cannot write critical data to fallback store');
    }
  }
}
```

**Error Handling Requirements:**
- All SQLite operations MUST have try-catch blocks
- Implement retry logic with exponential backoff for SQLITE_BUSY errors
- Graceful degradation for non-critical data (ACL < 4)
- Critical data (ACL = 4) MUST NOT fall back to Redis

---

## Memory Coordination (SQLite with ACL)

Agents share context through the SQLite memory system with ACL enforcement:

```javascript
// Store context for other agents with appropriate ACL level
await sqlite.memoryAdapter.set(
  "architect/design/decision",
  { pattern: "microservices", rationale: "..." },
  { aclLevel: 3, ttl: 31536000 }  // Swarm level, 1 year retention
);

// Retrieve context from other agents (ACL enforced)
const decision = await sqlite.memoryAdapter.get("architect/design/decision");
```

**Memory Key Patterns:**
```
{agent-type}/{domain}/{aspect}

Standard Agent Patterns (ACL Level 1 - Private):
- agent/{agentId}/confidence/{taskId}
- coder/auth/implementation

Validation Team Patterns (ACL Level 3 - Swarm):
- reviewer/auth/feedback
- tester/auth/coverage
- architect/auth/design

CFN Loop Patterns:
- cfn/phase-{id}/loop3/agent-{id}/{metric}  (ACL 1 - Private)
- cfn/phase-{id}/loop2/validation/{validator-id}  (ACL 3 - Swarm)
- cfn/phase-{id}/loop4/decision/{decision-type}  (ACL 4 - Project)
```

**ACL Level Guidelines:**
- **Level 1 (Private)**: Agent-scoped data, confidence scores, implementation notes
- **Level 3 (Swarm)**: Validation team, coordination data, ADRs
- **Level 4 (Project)**: Strategic decisions, GOAP results, compliance data (365 day retention)

---

## Swarm Coordination (with SQLite Lifecycle)

When spawning multiple agents concurrently:

```javascript
// Coordinator spawns specialist agents
Task("Rust Coder", "Implement auth with proper error handling", "coder")
Task("Unit Tester", "Write comprehensive tests for auth", "tester")
Task("Code Reviewer", "Review auth implementation", "reviewer")

// Each agent MUST follow SQLite lifecycle:
// 1. Pre-task hook: Register in SQLite (INSERT INTO agents)
// 2. Execute work: Update status to 'in_progress'
// 3. Post-edit hook: Validate with all 4 validators
// 4. Store results: SQLite with appropriate ACL level
// 5. Post-task hook: Update to 'completed' with confidence score
```

**Validation Hook Execution Sequence:**

```bash
# 1. Pre-task: Agent registration
sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at) VALUES ('coder-1', 'coder', 'active', CURRENT_TIMESTAMP)"

# 2. Work execution with progress updates
sqlite-cli exec "UPDATE agents SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = 'coder-1'"

# 3. Post-edit: Run all applicable validators
npx claude-flow@alpha hooks post-edit src/auth.js --memory-key "agent/coder-1/auth" --structured
# → Triggers: agent-template-validator, cfn-loop-memory-validator, test-coverage-validator

# 4. Store results with ACL
sqlite-cli exec "INSERT INTO memory (key, value, acl_level, ttl) VALUES ('agent/coder-1/confidence/auth', '0.85', 1, 2592000)"

# 5. Post-task: Finalization
sqlite-cli exec "UPDATE agents SET status = 'completed', confidence = 0.85, completed_at = CURRENT_TIMESTAMP WHERE id = 'coder-1'"
```

**Coordinator-Specific Requirements:**

Coordinator agents run additional validation with blocking-coordination-validator:

```bash
# Coordinators trigger all validators including blocking-coordination
npx claude-flow@alpha hooks post-edit src/coordinator.js --memory-key "agent/coordinator-1/phase" --structured
# → Triggers: agent-template-validator, cfn-loop-memory-validator, blocking-coordination-validator

# Validates:
# - HMAC secret usage (process.env.BLOCKING_COORDINATION_SECRET)
# - Signal ACK patterns (sendSignal, waitForAck)
# - Timeout configuration
# - State machine logic (spawns reviewer agent for semantic validation)
```
