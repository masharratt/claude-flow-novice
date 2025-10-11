# The Definitive Guide to Agent Profile Design

**Version:** 2.0.0
**Last Updated:** 2025-09-30
**Status:** Production-Ready with Empirical Validation

This document is the single source of truth for creating, editing, and validating agent profiles in the Claude Flow ecosystem. It incorporates empirical findings from our comprehensive Rust benchmarking system and establishes evidence-based best practices.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Universal Principles](#core-universal-principles)
3. [Agent Profile Structure](#agent-profile-structure)
4. [Examples & Templates](#examples--templates)
5. [Specialized Guidance](#specialized-guidance)

---

## Quick Start

### The Three Golden Rules

1. **Complexity-Verbosity Inverse Law**: As task complexity increases, prompt verbosity should DECREASE
2. **Priming Paradox**: Verbose prompts excel at basic tasks, minimal prompts excel at complex reasoning
3. **Rust Validation**: These findings are validated for Rust; hypotheses for other languages

### Format Selection in 30 Seconds

```yaml
Is the task BASIC (parsing, simple logic, CRUD)?
  → Use CODE-HEAVY format (+43% quality improvement)

Is the task COMPLEX with clear requirements (architecture, review)?
  → Use MINIMAL format (avoid over-constraining)

Is the task MEDIUM complexity with structured steps?
  → Use METADATA format (structured guidance)
```

**For detailed format guidance:** See [Format Selection Principles](./agent-principles/format-selection.md)

---

## Core Universal Principles

### 1. Agent Profile Structure **REQUIRED FORMAT**

Every agent MUST include:

#### Frontmatter (YAML)

```yaml
---
name: agent-name                    # REQUIRED: Lowercase with hyphens
description: |                      # REQUIRED: Clear, keyword-rich description
  MUST BE USED when [primary use case].
  Use PROACTIVELY for [specific scenarios].
  ALWAYS delegate when user asks [trigger phrases].
  Keywords - [comma-separated keywords for search]
tools: [Read, Write, Edit, Bash, TodoWrite, mcp__claude-flow__swarm_init, mcp__claude-flow__agent_spawn]  # REQUIRED: Comma-separated list, can include MCP commands
model: sonnet                       # REQUIRED: sonnet | opus | haiku
provider: zai                       # OPTIONAL: zai | anthropic | custom (defaults to zai if not specified)
color: seagreen                     # REQUIRED: Visual identifier
type: specialist                    # OPTIONAL: specialist | coordinator | swarm
capabilities:                       # OPTIONAL: Array of capability tags
  - rust
  - error-handling
lifecycle:                          # OPTIONAL: Hooks for agent lifecycle
  pre_task: "npx claude-flow@alpha hooks pre-task"
  post_task: "npx claude-flow@alpha hooks post-task"
hooks:                             # OPTIONAL: Integration points
  memory_key: "agent-name/context"
  validation: "post-edit"
validation_hooks:                  # OPTIONAL: Auto-triggered validators
  - agent-template-validator       # Auto-validates on .md save
  - cfn-loop-memory-validator      # Auto-validates memory.set() calls
  - test-coverage-validator        # Auto-validates after tests
  - blocking-coordination-validator # For coordinators only
triggers:                          # OPTIONAL: Automatic activation patterns
  - "build rust"
  - "implement concurrent"
constraints:                       # OPTIONAL: Limitations and boundaries
  - "Do not modify production database"
---
```

#### Body Structure

```markdown
# Agent Name

[Opening paragraph: WHO you are, WHAT you do]

## 🚨 MANDATORY POST-EDIT VALIDATION

**CRITICAL**: After **EVERY** file edit operation, you **MUST** run the enhanced post-edit hook:

```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] --memory-key "agent/step" --structured
```

**This provides:**
- 🧪 **TDD Compliance**: Validates test-first development practices
- 🔒 **Security Analysis**: Detects eval(), hardcoded credentials, XSS vulnerabilities
- 🎨 **Formatting**: Prettier/rustfmt analysis with diff preview
- 📊 **Coverage Analysis**: Test coverage validation with configurable thresholds (≥80%)
- 🤖 **Actionable Recommendations**: Specific steps to improve code quality
- 💾 **Memory Coordination**: Stores results for cross-agent collaboration

**Additional Validators:**
- **Agent Template Validator**: Auto-validates SQLite lifecycle hooks, ACL declarations, error handling patterns (triggers on `.claude/agents/**/*.md` edits)
- **CFN Loop Memory Validator**: Auto-validates ACL levels for Loop 3/2/4 memory operations (triggers on `memory.set()` calls)
- **Test Coverage Validator**: Auto-validates 80% line coverage, 75% branch coverage thresholds (triggers after test execution)
- **Blocking Coordination Validator**: Auto-validates HMAC secrets, signal ACK patterns (coordinators only)

## Core Responsibilities

[Primary duties in clear, actionable bullet points]

## Approach & Methodology

[HOW the agent accomplishes tasks - frameworks, patterns, decision-making]

## Integration & Collaboration

[How this agent works with other agents and the broader system]

## Success Metrics

[How to measure agent effectiveness]
```

---

### 2. The Complexity-Verbosity Inverse Law

**Empirical Finding:** Task complexity and prompt verbosity have an inverse relationship.

```
Basic Tasks (parsing, CRUD):
  - Code-Heavy: 85.3% quality (+43% vs Minimal)
  - Best approach: Detailed examples with step-by-step guidance

Complex Tasks (architecture, lock-free algorithms):
  - Minimal: 87.2% quality (+31% vs Code-Heavy)
  - Best approach: High-level principles with reasoning freedom
```

**Why This Matters:**
- Basic tasks benefit from concrete patterns (priming effect)
- Complex tasks need creative freedom (over-specification creates tunnel vision)
- Medium tasks need structured scaffolding without over-constraining

**For detailed analysis:** See [Format Selection Principles](./agent-principles/format-selection.md)

---

### 3. Mandatory Post-Edit Validation System

**UNIVERSAL REQUIREMENT:** Every agent MUST run post-edit hooks after file modifications.

```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] \
  --memory-key "agent-name/context" \
  --structured
```

**Core Benefits:**
- TDD compliance verification
- Security analysis (XSS, eval(), hardcoded credentials)
- Formatting validation (Prettier, rustfmt)
- Test coverage analysis (≥80% line, ≥75% branch)
- Cross-agent memory coordination
- Actionable recommendations

**Four Production-Ready Validators:**

1. **Agent Template Validator** (Priority 1 - CRITICAL)
   - Validates SQLite lifecycle hooks (spawn, update, terminate)
   - Validates ACL level declarations (1-5)
   - Validates error handling patterns (SQLite failures, Redis connection loss)
   - Validates blocking coordination imports (coordinators only)
   - Triggers: On edit to `.claude/agents/**/*.md` files
   - Automation: 95% (WASM-accelerated pattern matching)

2. **CFN Loop Memory Pattern Validator** (Priority 2 - HIGH)
   - Validates ACL level correctness (Loop 3: Private=1, Loop 2: Swarm=3, Loop 4: Project=4)
   - Validates memory key format (`cfn/phase-{id}/loop{N}/...`)
   - Validates TTL values match retention policies (Loop 4: 365 days)
   - Validates encryption for sensitive data (Loop 3 private data)
   - Triggers: On `memory.set()` calls in code
   - Automation: 90% (deterministic rule matching)

3. **Test Coverage Validator** (Priority 3 - MEDIUM)
   - Validates line coverage ≥ 80%
   - Validates branch coverage ≥ 75%
   - Validates function coverage ≥ 80%
   - Validates agent lifecycle tests present
   - Validates signal ACK protocol tests present
   - Triggers: After test execution
   - Automation: 100% (quantitative metrics)

4. **Blocking Coordination Validator** (Priority 4 - MEDIUM)
   - Validates required imports (BlockingCoordinationSignals, CoordinatorTimeoutHandler)
   - Validates HMAC secret environment variable usage
   - Validates signal sending/receiving patterns present
   - Hybrid validation: Spawns reviewer agent for state machine logic
   - Triggers: For coordinator agents only
   - Automation: 60% (complex logic requires semantic review)

**Hook Composition Pattern:**

Hooks compose for comprehensive validation:

```javascript
// CompositeHook pattern enables layered validation
const agentValidation = new CompositeHook(
  new AgentTemplateValidator(),
  new CFNLoopMemoryValidator(),
  new TestCoverageValidator()
);

// Results merge for actionable recommendations
const result = await agentValidation.validate(file, content);
// → { valid: boolean, results: [], combinedRecommendations: [] }
```

**Performance Expectations:**
- Individual validator: <2s (WASM-accelerated)
- Composite validation: <5s total (parallel execution)
- False positive rate: <2%

**For integration details:** See [Prompt Engineering Best Practices](./agent-principles/prompt-engineering.md)

---

### 4. Agent Template Validator Specification

**Purpose:** Ensures all agent templates follow SQLite lifecycle, ACL, and error handling best practices.

**Validation Criteria:**

✅ **SQLite Lifecycle Hooks** (All agents MUST persist to SQLite for audit trail)
```typescript
// Agent spawn registration
await sqlite.execute(`
  INSERT INTO agents (id, type, status, spawned_at)
  VALUES (?, ?, 'active', CURRENT_TIMESTAMP)
`, [agentId, agentType]);

// Confidence score updates during execution
await sqlite.execute(`
  UPDATE agents SET status = ?, confidence = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`, [status, confidenceScore, agentId]);

// Agent termination and cleanup
await sqlite.execute(`
  UPDATE agents SET status = 'completed', completed_at = CURRENT_TIMESTAMP
  WHERE id = ?
`, [agentId]);
```

✅ **ACL Level Declaration** (Data access control by agent type)
```yaml
# ACL Level Guidelines by Agent Type:
implementers:
  acl_level: 1  # Private (agent-scoped data)
  example: "coder, backend-dev, frontend-dev"

validators:
  acl_level: 3  # Swarm (shared across validation team)
  example: "reviewer, security-specialist, tester"

coordinators:
  acl_level: 3  # Swarm (coordinate multiple agents)
  example: "architect, planner, devops-engineer"

product_owner:
  acl_level: 4  # Project (strategic decisions, audit trail)
  example: "product-owner (CFN Loop 4 only)"
```

✅ **Error Handling for SQLite Failures**
```javascript
try {
  await sqlite.memoryAdapter.set(key, value, { aclLevel: 1 });
} catch (error) {
  if (error.code === 'SQLITE_BUSY') {
    // Retry with exponential backoff
    await retryWithBackoff(() => sqlite.memoryAdapter.set(key, value));
  } else if (error.code === 'SQLITE_LOCKED') {
    // Wait for lock release
    await waitForLockRelease(key);
  } else {
    // Log and gracefully degrade
    console.error('SQLite failure:', error);
    // Fallback to Redis for non-critical data
    await redis.set(key, value);
  }
}
```

✅ **Blocking Coordination Imports** (Coordinators only)
```javascript
// Required imports for coordinator agents
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals';
import { CoordinatorTimeoutHandler } from '../cfn-loop/coordinator-timeout-handler';

// Usage pattern validation
const signals = new BlockingCoordinationSignals(coordinatorId, hmacSecret);
await signals.sendSignal('READY', targetAgentId);
await signals.waitForAck(requestId, timeoutMs);
```

**Memory Key Patterns:**

```yaml
# Standard agent memory patterns
agent_memory:
  format: "agent/{agentId}/confidence/{taskId}"
  example: "agent/coder-1/confidence/auth-implementation"
  acl_level: 1  # Private to agent

# CFN Loop memory patterns
cfn_loop_memory:
  loop_3: "cfn/phase-{id}/loop3/agent-{id}/{metric}"
  loop_2: "cfn/phase-{id}/loop2/validation/{validator-id}"
  loop_4: "cfn/phase-{id}/loop4/decision/{decision-type}"

  # ACL levels by loop
  loop_3_acl: 1  # Private (implementation details)
  loop_2_acl: 3  # Swarm (validation team access)
  loop_4_acl: 4  # Project (strategic decisions)
```

**Validation Trigger:**
- File path: `.claude/agents/**/*.md`
- Trigger event: File save/edit
- Execution time: <2s (WASM-accelerated)
- Integration: Automatic via post-edit hook

**Validation Output Example:**

```json
{
  "validator": "agent-template-validator",
  "file": ".claude/agents/backend/coder.md",
  "valid": false,
  "violations": [
    {
      "type": "missing_sqlite_lifecycle",
      "severity": "error",
      "message": "Missing agent spawn registration (INSERT INTO agents)",
      "line": null,
      "recommendation": "Add SQLite lifecycle hooks in agent initialization"
    },
    {
      "type": "missing_acl_declaration",
      "severity": "error",
      "message": "No ACL level declared for memory operations",
      "line": 45,
      "recommendation": "Add aclLevel: 1 for implementer agents"
    }
  ],
  "warnings": [
    {
      "type": "error_handling_basic",
      "message": "Basic error handling present, consider retry logic",
      "recommendation": "Implement exponential backoff for SQLite BUSY errors"
    }
  ]
}
```

**For CFN Loop integration:** See section on SQLite Integration Requirements below.

---

### 5. SQLite Integration Requirements

**All agents MUST persist to SQLite for audit trail and cross-session recovery.**

**ACL Level Guidelines:**

| Agent Type | ACL Level | Scope | Example Use Cases |
|-----------|-----------|-------|-------------------|
| **Implementers** | 1 (Private) | Agent-scoped data | Code snippets, temporary state, confidence scores |
| **Validators** | 3 (Swarm) | Validation team shared | Review feedback, security findings, test results |
| **Coordinators** | 3 (Swarm) | Multi-agent coordination | Task assignments, progress tracking, blocking signals |
| **Product Owner** | 4 (Project) | Strategic decisions | GOAP decisions, backlog items, phase approvals |

**Memory Key Patterns:**

```javascript
// Standard agent memory
const agentKey = `agent/${agentId}/confidence/${taskId}`;
await sqlite.memoryAdapter.set(agentKey, confidenceScore, {
  aclLevel: 1,  // Private to agent
  ttl: 2592000  // 30 days
});

// CFN Loop patterns
const loop3Key = `cfn/phase-auth/loop3/agent-coder-1/implementation`;
await sqlite.memoryAdapter.set(loop3Key, implementationDetails, {
  aclLevel: 1,  // Private (Loop 3 implementation)
  ttl: 2592000  // 30 days
});

const loop2Key = `cfn/phase-auth/loop2/validation/reviewer-1`;
await sqlite.memoryAdapter.set(loop2Key, validationResults, {
  aclLevel: 3,  // Swarm (Loop 2 validation team)
  ttl: 7776000  // 90 days
});

const loop4Key = `cfn/phase-auth/loop4/decision/proceed`;
await sqlite.memoryAdapter.set(loop4Key, goapDecision, {
  aclLevel: 4,  // Project (Loop 4 strategic decision)
  ttl: 31536000  // 365 days (compliance requirement)
});
```

**Error Handling Patterns:**

```javascript
// Retry with exponential backoff for transient errors
async function retryWithBackoff(operation, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 100; // 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

// Graceful degradation for non-critical data
async function writeWithFallback(key, value, options) {
  try {
    await sqlite.memoryAdapter.set(key, value, options);
  } catch (error) {
    console.warn('SQLite write failed, falling back to Redis:', error);
    // Fallback to Redis for non-audit data only
    if (options.aclLevel < 4) {
      await redis.set(key, JSON.stringify(value));
    } else {
      // Critical data MUST persist to SQLite
      throw new Error('Cannot write critical data to fallback store');
    }
  }
}
```

**Agent Lifecycle Hooks Integration:**

```yaml
# In agent frontmatter
lifecycle:
  pre_task: |
    # Register agent in SQLite on spawn
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', '${AGENT_TYPE}', 'active', CURRENT_TIMESTAMP)"

  post_task: |
    # Update agent status and confidence on completion
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed',
                         confidence = ${CONFIDENCE_SCORE},
                         completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"
```

**For CFN Loop memory patterns:** See CFN Loop Memory Pattern Validator above.

---

### 6. Integration with Claude Flow

#### Hook System

Every agent integrates with:
- **Pre-task hooks**: Initialize context, set up memory namespace, register in SQLite
- **Post-edit hooks**: Validate quality, coordinate with other agents, run validators
- **Post-task hooks**: Finalize task, export metrics, update SQLite status
- **Session management**: Persist state across sessions via SQLite

#### Memory Coordination (SQLite + ACL)

```javascript
// Standard memory key pattern: {agent-type}/{domain}/{aspect}
await sqlite.memoryAdapter.set("architect/auth/design", designDoc, { aclLevel: 3 });
await sqlite.memoryAdapter.set("coder/auth/implementation", code, { aclLevel: 1 });
await sqlite.memoryAdapter.set("reviewer/auth/feedback", feedback, { aclLevel: 3 });
await sqlite.memoryAdapter.set("tester/auth/coverage", coverage, { aclLevel: 3 });

// CFN Loop memory pattern: cfn/phase-{id}/loop{N}/{agent-id}/{metric}
await sqlite.memoryAdapter.set("cfn/phase-auth/loop3/coder-1/confidence", 0.85, {
  aclLevel: 1,  // Loop 3: Private implementation data
  ttl: 2592000  // 30 days
});

await sqlite.memoryAdapter.set("cfn/phase-auth/loop2/reviewer-1/consensus", 0.92, {
  aclLevel: 3,  // Loop 2: Swarm validation data
  ttl: 7776000  // 90 days
});

await sqlite.memoryAdapter.set("cfn/phase-auth/loop4/decision", "DEFER", {
  aclLevel: 4,  // Loop 4: Project strategic decision
  ttl: 31536000  // 365 days (compliance)
});
```

**ACL Enforcement:**
- ACL Level 1 (Private): Only creating agent can read
- ACL Level 3 (Swarm): All agents in same swarm can read
- ACL Level 4 (Project): All agents in project can read
- ACL Level 5 (Team/System): Reserved for infrastructure

#### Swarm Coordination with SQLite Lifecycle

When spawning multiple agents:
1. **Pre-task hook**: Register agent in SQLite, initialize memory namespace
2. **Execute work**: Implement task with progress updates to SQLite
3. **Post-edit hook**: Validate each file with all 4 validators (agent-template, cfn-loop-memory, test-coverage, blocking-coordination)
4. **Store results**: Persist to SQLite with appropriate ACL level
5. **Post-task hook**: Finalize task, update agent status to 'completed', export metrics

**Hook Execution Sequence:**

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

**Hook Composition for Coordinators:**

Coordinator agents run additional validation:

```bash
# Coordinators also trigger blocking-coordination-validator
npx claude-flow@alpha hooks post-edit src/coordinator.js --memory-key "agent/coordinator-1/phase" --structured
# → Triggers: agent-template-validator, cfn-loop-memory-validator, blocking-coordination-validator

# Validates:
# - HMAC secret usage
# - Signal ACK patterns
# - Timeout configuration
# - State machine logic (spawns reviewer agent for semantic validation)
```

**Performance:**
- Sequential validators: ~5-8s total
- Parallel validators (independent): ~2-3s total (recommended)
- WASM acceleration: 52x speedup for pattern matching

**For detailed integration:** See [Prompt Engineering Best Practices](./agent-principles/prompt-engineering.md)

---

## Agent Profile Structure

### The Three Formats

1. **MINIMAL (200-400 lines)**: For complex, strategic tasks requiring reasoning freedom
2. **METADATA (400-700 lines)**: For medium complexity with structured workflows
3. **CODE-HEAVY (700-1200 lines)**: For basic tasks benefiting from concrete examples

**Detailed format specifications:** [Format Selection Principles](./agent-principles/format-selection.md)

### Format Selection Decision Tree

```
Task Complexity Assessment
        │
    ┌───┴────┐
    │        │
  BASIC   COMPLEX
    │        │
CODE-HEAVY MINIMAL
```

**Full decision tree and factors:** [Format Selection Principles](./agent-principles/format-selection.md)

---

## Examples & Templates

### Example 1: Minimal Format (Complex Tasks)

**File:** `.claude/agents/architecture/system-architect.md`

```markdown
---
name: system-architect
description: |
  MUST BE USED when designing enterprise-grade system architecture.
  Use PROACTIVELY for distributed systems, event-driven architecture.
  Keywords - architecture, system design, microservices, scalability
tools: [Read, Write, Edit, Bash, Grep, Glob, TodoWrite]
model: sonnet
color: seagreen
type: coordinator
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
lifecycle:
  pre_task: |
    sqlite-cli exec "INSERT INTO agents (id, type, status, spawned_at)
                     VALUES ('${AGENT_ID}', 'system-architect', 'active', CURRENT_TIMESTAMP)"
  post_task: |
    sqlite-cli exec "UPDATE agents
                     SET status = 'completed', confidence = ${CONFIDENCE_SCORE},
                         completed_at = CURRENT_TIMESTAMP
                     WHERE id = '${AGENT_ID}'"
---

# System Architect Agent

You are a senior system architect with deep expertise in designing
scalable, maintainable, and robust software systems.

## 🚨 MANDATORY POST-EDIT VALIDATION

After EVERY file edit:
```bash
npx claude-flow@alpha hooks post-edit [FILE] --memory-key "architect/${AGENT_ID}/step" --structured
```

This triggers: agent-template-validator, cfn-loop-memory-validator

## SQLite Integration

All architectural decisions MUST persist to SQLite with ACL Level 3 (Swarm):

```javascript
// Store ADR in SQLite
await sqlite.memoryAdapter.set(
  `architect/${agentId}/adr/${componentName}`,
  architectureDecisionRecord,
  { aclLevel: 3, ttl: 31536000 }  // 1 year retention
);

// Error handling with retry
try {
  await sqlite.memoryAdapter.set(key, value, options);
} catch (error) {
  if (error.code === 'SQLITE_BUSY') {
    await retryWithBackoff(() => sqlite.memoryAdapter.set(key, value, options));
  } else {
    throw error;
  }
}
```

## Core Responsibilities

- Design system architectures from business requirements
- Make strategic technical decisions with clear rationale
- Define component boundaries and interactions
- Ensure scalability, security, and maintainability
- Create Architecture Decision Records (ADRs)
- Persist all decisions to SQLite for audit trail

## Architectural Approach

### Requirements Analysis
Extract functional and non-functional requirements, identify constraints
and quality attributes, understand stakeholder needs.

### Design Process
Apply appropriate patterns (microservices, event-driven, CQRS), consider
trade-offs, document decisions with ADRs.

### Quality Attributes
- Performance: Response times, throughput
- Scalability: Horizontal and vertical scaling
- Security: Zero-trust, defense-in-depth
- Maintainability: Modular design, clear interfaces
- Reliability: Fault tolerance, disaster recovery

## Collaboration

- Work with Coder agents for implementation guidance (ACL 1)
- Coordinate with Reviewer agents for design validation (ACL 3)
- Provide specifications to DevOps for infrastructure (ACL 3)
- Share ADRs via SQLite memory system (ACL 3)

## Success Metrics

- Architecture meets quality attributes
- Team can implement the design
- Documentation is clear and comprehensive
- Trade-offs are explicitly documented
- All decisions persisted to SQLite with appropriate ACL
```

**For more examples:** [Format Selection Principles](./agent-principles/format-selection.md)

---

### Example 2: Metadata Format (Medium Tasks with CFN Loop Integration)

**File:** `.claude/agents/development/api-developer.md`

**Key additions for CFN Loop:**
```yaml
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - test-coverage-validator
lifecycle:
  pre_task: "sqlite-cli exec 'INSERT INTO agents ...'"
  post_task: "sqlite-cli exec 'UPDATE agents SET status=completed ...'"
```

**CFN Loop Memory Persistence:**
```javascript
// Loop 3: Implementation confidence (Private)
await sqlite.memoryAdapter.set(
  `cfn/phase-api/loop3/api-developer-1/confidence`,
  0.85,
  { aclLevel: 1, ttl: 2592000 }  // Private, 30 days
);

// Loop 2: Validation feedback (Swarm)
await sqlite.memoryAdapter.set(
  `cfn/phase-api/loop2/reviewer-1/feedback`,
  reviewFeedback,
  { aclLevel: 3, ttl: 7776000 }  // Swarm, 90 days
);
```

**For complete example:** See API Developer template in [Format Selection Principles](./agent-principles/format-selection.md)

---

### Example 3: Code-Heavy Format (Basic Tasks with Blocking Coordination)

**File:** `.claude/agents/coordination/coordinator.md`

**Key additions for coordinators:**
```yaml
type: coordinator
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
  - blocking-coordination-validator  # Coordinator-specific
```

**Blocking Coordination Pattern:**
```javascript
import { BlockingCoordinationSignals } from '../cfn-loop/blocking-coordination-signals';
import { CoordinatorTimeoutHandler } from '../cfn-loop/coordinator-timeout-handler';

// Initialize with HMAC secret from environment
const signals = new BlockingCoordinationSignals(
  coordinatorId,
  process.env.BLOCKING_COORDINATION_SECRET
);

// Send signal to agent
await signals.sendSignal('READY', 'coder-1');

// Wait for ACK with timeout
const ack = await signals.waitForAck(requestId, 30000);  // 30s timeout

// Error handling
try {
  await signals.sendSignal('START', targetAgentId);
} catch (error) {
  if (error.code === 'TIMEOUT') {
    // Handle timeout
    await timeoutHandler.handleTimeout(targetAgentId);
  } else if (error.code === 'REDIS_CONNECTION_LOST') {
    // Graceful degradation
    await fallbackCoordination(targetAgentId);
  }
}
```

**For complete example:** See Rust Coder template in [Format Selection Principles](./agent-principles/format-selection.md)

---

## Specialized Guidance

### By Agent Type

Different agent types have different format requirements and validation hooks:

- **Coder Agents (Implementers)**:
  - Format: Code-Heavy for basic tasks, Minimal for complex algorithms
  - ACL Level: 1 (Private)
  - Validators: agent-template-validator, cfn-loop-memory-validator, test-coverage-validator
  - SQLite: Persist confidence scores, implementation notes

- **Reviewer Agents (Validators)**:
  - Format: Minimal (requires contextual reasoning)
  - ACL Level: 3 (Swarm)
  - Validators: agent-template-validator, cfn-loop-memory-validator
  - SQLite: Persist review feedback, validation consensus

- **Architect Agents (Coordinators)**:
  - Format: Minimal (strategic thinking)
  - ACL Level: 3 (Swarm)
  - Validators: agent-template-validator, cfn-loop-memory-validator
  - SQLite: Persist ADRs, design decisions (1 year retention)

- **Coordinator Agents**:
  - Format: Metadata (structured workflows)
  - ACL Level: 3 (Swarm)
  - Validators: agent-template-validator, cfn-loop-memory-validator, blocking-coordination-validator
  - SQLite: Persist coordination signals, agent assignments
  - Special: HMAC secret validation, signal ACK patterns

- **Tester Agents (Validators)**:
  - Format: Code-Heavy for unit tests, Metadata for test strategy
  - ACL Level: 3 (Swarm)
  - Validators: agent-template-validator, test-coverage-validator
  - SQLite: Persist test results, coverage metrics

- **Researcher Agents**:
  - Format: Minimal (open-ended exploration)
  - ACL Level: 1 (Private) or 3 (Swarm) depending on context
  - Validators: agent-template-validator
  - SQLite: Persist research findings, competitive analysis

- **DevOps Agents**:
  - Format: Metadata (structured workflows)
  - ACL Level: 3 (Swarm)
  - Validators: agent-template-validator, cfn-loop-memory-validator
  - SQLite: Persist deployment logs, infrastructure state

- **Product Owner (CFN Loop 4 only)**:
  - Format: Minimal (strategic GOAP decisions)
  - ACL Level: 4 (Project)
  - Validators: agent-template-validator, cfn-loop-memory-validator
  - SQLite: Persist GOAP decisions, backlog items (365 day retention for compliance)

**Full type-specific guidance:** [Agent Type Guidelines](./agent-principles/agent-type-guidelines.md)

---

### Prompt Engineering

Key principles for effective agent prompts:

1. **Clear Role Definition**: Establish expertise domain
2. **Specific Responsibilities**: Concrete, actionable duties
3. **Appropriate Tool Selection**: Only essential tools
4. **Integration Points**: Explicit collaboration contracts
5. **Validation Hooks**: Mandatory quality gates (4 production-ready validators)
6. **SQLite Lifecycle**: Agent spawn, update, completion hooks
7. **ACL Declaration**: Appropriate access control level by agent type
8. **Error Handling**: SQLite retry logic, graceful degradation

**Hook-Agent Collaboration Interface:**

For complex validation requiring semantic understanding:

```javascript
class HybridValidator {
  async validate(file, content) {
    // Hook performs pattern detection (95% automation)
    const patterns = await this.detectPatterns(content);

    if (patterns.hasComplexLogic) {
      // Delegate semantic analysis to reviewer agent (5% requiring human-level understanding)
      const agentReview = await this.requestAgentReview({
        file,
        content,
        concern: 'State machine correctness',
        context: patterns.extracted
      });

      return { ...patterns, agentReview };
    }

    return patterns;
  }
}
```

**Incremental Validation with Caching:**

Avoid re-validating unchanged files (10-100x speedup):

```javascript
const hash = computeHash(content);
if (cache.has(hash)) {
  return cache.get(hash);  // Instant validation for unchanged files
}
```

**Anti-patterns to avoid:**
- Over-specification (tunnel vision)
- Under-specification (too vague)
- Example overload (cognitive burden)
- Rigid checklists (context-insensitive)
- Missing SQLite lifecycle hooks (no audit trail)
- Wrong ACL level (data exposure or access denial)
- Missing error handling (cascading failures)

**Detailed best practices:** [Prompt Engineering Best Practices](./agent-principles/prompt-engineering.md)

---

### Quality Metrics & Validation

**Pre-Deployment Checklist:**
- [ ] Valid YAML frontmatter (including validation_hooks, lifecycle)
- [ ] Format matches task complexity (Minimal/Metadata/Code-Heavy)
- [ ] Clear responsibilities defined
- [ ] Integration points specified (memory keys, ACL levels)
- [ ] Post-edit hook included (mandatory)
- [ ] SQLite lifecycle hooks present (pre_task, post_task)
- [ ] ACL level declared (1-5 based on agent type)
- [ ] Error handling patterns implemented (retry, fallback)
- [ ] Blocking coordination imports (coordinators only)

**Hook Validation Metrics:**
- Agent template validation pass rate (target: 100%)
- CFN Loop ACL compliance rate (target: 100%, zero violations in production)
- Test coverage above thresholds (≥80% line, ≥75% branch)
- Blocking coordination pattern correctness (coordinators: 100%)
- Hook execution time (<5s total for composite validation)
- False positive rate (<2%)

**Ongoing Monitoring:**
- First-time success rate (>80%)
- Iteration count (<3)
- Quality score (>85%)
- User satisfaction (>4.5/5)
- SQLite persistence success rate (>99.9%)
- ACL violation rate (0% in production)
- Agent lifecycle completion rate (>95%)

**Hook Performance Targets:**
- Individual validator: <2s (WASM-accelerated)
- Composite validation: <5s (parallel execution)
- Cache hit rate: >70% during development (incremental validation)
- Manual validation required: <2% (only semantic edge cases)

**Comprehensive validation guide:** [Quality Metrics & Validation](./agent-principles/quality-metrics.md)

---

## Benchmark System

### Running Benchmarks

```bash
cd benchmark/agent-benchmarking

# Run Rust benchmarks (VALIDATED)
node index.js run 5 --rust --verbose

# Run JavaScript benchmarks (HYPOTHESIS)
node index.js run 5 --verbose

# Analyze results
node index.js analyze
```

**Detailed benchmarking guide:** [Quality Metrics & Validation](./agent-principles/quality-metrics.md)

---

## Conclusion

### Key Takeaways

1. **Format matters**: Choose based on task complexity (inverse relationship)
2. **Validation is critical**: 4 production-ready hooks ensure quality and coordination
3. **SQLite integration**: All agents MUST persist lifecycle and data for audit trail
4. **ACL enforcement**: Appropriate access control prevents data exposure
5. **Hook composition**: CompositeHook pattern enables layered validation (<5s total)
6. **Hybrid validation**: Hooks automate 85%, agents handle semantic understanding (15%)
7. **Integration is essential**: Memory, swarm, and event bus enable collaboration
8. **Continuous improvement**: Use metrics to refine agents

### Four Production-Ready Validators

1. **Agent Template Validator**: SQLite lifecycle, ACL, error handling (95% automation)
2. **CFN Loop Memory Pattern Validator**: ACL correctness, key format, TTL (90% automation)
3. **Test Coverage Validator**: Line/branch/function coverage thresholds (100% automation)
4. **Blocking Coordination Validator**: HMAC, signals, state machines (60% automation + agent review)

### Next Steps

1. Choose appropriate format for your agent (Minimal/Metadata/Code-Heavy)
2. Use templates as starting points (includes SQLite lifecycle hooks)
3. Add validation_hooks to frontmatter (agent-template, cfn-loop-memory, test-coverage, blocking-coordination)
4. Implement SQLite lifecycle hooks (pre_task, post_task)
5. Declare ACL level (1=Private, 3=Swarm, 4=Project)
6. Add error handling patterns (retry, fallback)
7. Test with benchmark system
8. Deploy with validation hooks (automatic on save)
9. Monitor hook metrics (<5s validation, <2% false positives)
10. Iterate based on metrics and agent feedback

---

## Reference Documents

- **[Format Selection Principles](./agent-principles/format-selection.md)**: Detailed format guidance, benchmarking findings, decision tree
- **[Agent Type Guidelines](./agent-principles/agent-type-guidelines.md)**: Type-specific recommendations for coders, reviewers, architects, testers, researchers, DevOps
- **[Prompt Engineering Best Practices](./agent-principles/prompt-engineering.md)**: Effective prompt patterns, anti-patterns, integration with Claude Flow
- **[Quality Metrics & Validation](./agent-principles/quality-metrics.md)**: Validation checklists, benchmark system, continuous improvement

---

**Document Version:** 2.0.0
**Last Updated:** 2025-09-30
**Maintained By:** Claude Flow Core Team
**Feedback:** Document improvements and findings for future versions
