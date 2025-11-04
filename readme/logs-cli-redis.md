# Redis Key Patterns for CFN Loop Coordination

## Standard Key Patterns (v2.14.6)

### Agent Completion
**Pattern**: `swarm:${TASK_ID}:${AGENT_ID}:done`

**Purpose**: Signal agent work completion

**Usage**:
```bash
# Signal completion
redis-cli LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# Wait for completion (blocking)
redis-cli BLPOP "swarm:${TASK_ID}:${AGENT_ID}:done" 0
```

### Confidence Reporting
**Pattern**: `swarm:${TASK_ID}:${AGENT_ID}:confidence`

**Purpose**: Report agent confidence score

**Usage**:
```bash
# Store confidence (hash-based)
redis-cli HSET "swarm:${TASK_ID}:${AGENT_ID}:result" "confidence" "0.85"

# Store confidence (list-based)
redis-cli LPUSH "swarm:${TASK_ID}:confidence" "0.85"
```

### Product Owner Decision
**Pattern**: `swarm:${TASK_ID}:decision`

**Purpose**: Store Product Owner decision (PROCEED/ITERATE/ABORT)

**Implementation**: `.claude/skills/cfn-product-owner-decision/execute-decision.sh`

**Usage**:
```bash
# Store decision with TTL (1 hour)
redis-cli SET "swarm:${TASK_ID}:decision" "PROCEED" EX 3600

# Check existence
redis-cli EXISTS "swarm:${TASK_ID}:decision"

# Get decision
redis-cli GET "swarm:${TASK_ID}:decision"
```

**Note**: Task-level key (NOT agent-scoped)

### Gate Check
**Patterns**:
- `swarm:${TASK_ID}:gate-passed`
- `swarm:${TASK_ID}:gate-failed`

**Purpose**: Signal Loop 3 self-validation result

**Usage**:
```bash
# Signal gate passed
redis-cli LPUSH "swarm:${TASK_ID}:gate-passed" "1"

# Signal gate failed (iterate)
redis-cli LPUSH "swarm:${TASK_ID}:gate-failed" "1"

# Loop 2 waits for gate pass (blocking)
redis-cli BLPOP "swarm:${TASK_ID}:gate-passed" 0
```

### Loop 2 Consensus
**Pattern**: `swarm:${TASK_ID}:loop2:consensus`

**Purpose**: Store validator consensus score

**Usage**:
```bash
# Store consensus
redis-cli SET "swarm:${TASK_ID}:loop2:consensus" "0.93"

# Retrieve
redis-cli GET "swarm:${TASK_ID}:loop2:consensus"
```

### Metrics (Global)
**Patterns**:
- `swarm:metrics:decisions:proceed`
- `swarm:metrics:decisions:iterate`
- `swarm:metrics:decisions:abort`

**Purpose**: Global decision tracking (NOT task-scoped)

**Usage**:
```bash
# Increment decision counter
redis-cli INCR "swarm:metrics:decisions:proceed"

# Get total proceeds
redis-cli GET "swarm:metrics:decisions:proceed"
```

## Validation and Consistency

### Automated Validator
**Script**: `.claude/skills/cfn-test-runner/validate-redis-keys.sh`

**Checks**:
- Anti-pattern detection (non-standard keys)
- Product Owner key validation
- Namespace consistency (swarm: prefix)
- TTL enforcement

**Usage**:
```bash
# Run validator
./.claude/skills/cfn-test-runner/validate-redis-keys.sh

# Exit codes:
# 0 = PASS
# 1 = FAIL (violations found)
```

### Audit Results
**Documentation**: `docs/REDIS_KEY_CONSISTENCY_AUDIT.md`

**Findings** (3 independent agents):
- Overall confidence: 0.92 (High)
- Consistency: 90%+ adherence
- Minor inconsistencies: 1 documentation file

**Standard compliance**: 95%+ for runtime patterns

## Feedback and Validation Keys

### `swarm:${TASK_ID}:feedback:history`

**Purpose**:
Accumulate iteration-level feedback across CFN Loop

**Schema**:
```json
[
  {
    "iteration": 0,
    "source": "string",
    "feedback": "string",
    "timestamp": "ISO8601 timestamp"
  }
]
```

**Configuration**:
- Type: JSON array
- TTL: 86400 seconds (24 hours)
- Max entries: 50

**Redis CLI Access**:
```bash
# Store feedback
redis-cli lpush swarm:task-123:feedback:history '{"iteration": 1, "source": "validator", "feedback": "Requires refactoring", "timestamp": "2025-10-21T12:34:56Z"}'

# Retrieve feedback history
redis-cli lrange swarm:task-123:feedback:history 0 -1
```

### `swarm:${TASK_ID}:validator:history`

**Purpose**:
Record structured validator feedback for iterative refinement

**Schema**:
```json
[
  {
    "iteration": 0,
    "severity": "CRITICAL|WARNING|SUGGESTION",
    "issue": "string",
    "suggestion": "string",
    "timestamp": "ISO8601 timestamp"
  }
]
```

**Configuration**:
- Type: JSON array
- TTL: 86400 seconds (24 hours)
- Max entries: 50

**Redis CLI Access**:
```bash
# Store validator feedback
redis-cli lpush swarm:task-123:validator:history '{"iteration": 1, "severity": "CRITICAL", "issue": "Security vulnerability detected", "suggestion": "Apply input validation", "timestamp": "2025-10-21T12:34:56Z"}'

# Retrieve validator history
redis-cli lrange swarm:task-123:validator:history 0 -1
```

## CFN v3 Context Storage

**Redis Keys**:
```
cfn_loop:task:{TASK_ID}:context          # Full task context
cfn_loop:task:{TASK_ID}:v3_config        # V3 configuration
cfn_loop:task:{TASK_ID}:epic_context     # Epic-level context
cfn_loop:task:{TASK_ID}:phase_context    # Phase-level context
```

**Context Structure**:
```json
{
  "task_id": "auth-001",
  "task_type": "software-development",
  "iteration": 1,
  "deliverables": ["auth.ts", "auth.test.ts"],
  "acceptance_criteria": ["Tests pass", "JWT expiry works"],
  "loop3_agents": ["backend-dev", "security-specialist"],
  "loop2_agents": ["reviewer", "tester"]
}
```

**Storage**: Coordinator stores context before spawning orchestrator

**Retrieval**: CLI agents read via `redis-cli HGETALL "cfn_loop:task:$TASK_ID:context"`

**Benefits**: Swarm recovery, no JSON escaping, single source of truth

### Enhanced CLI Context Parsing (v2.9.0)

**Purpose**: Automatic JSON-to-natural-language conversion for CLI agents

**Supported Fields**:
```typescript
{
  task: string,              // Task description
  files: string | array,     // Files to process (comma-separated or array)
  requirements: array,       // Task requirements
  deliverables: array,       // Expected outputs
  instructions: array,       // Step-by-step instructions
  acceptanceCriteria: array, // Success criteria
  batch: string,             // Batch identifier
  directory: string          // Working directory
}
```

**Transformation**:
```bash
# Input (JSON)
--context '{"task":"Add keywords","files":"file1.md,file2.md","requirements":["Add field","Run hook"]}'

# Agent receives (Markdown)
**Task:** Add keywords

**Files to process:**
- file1.md
- file2.md

**Requirements:**
1. Add field
2. Run hook
```

**Implementation**: `src/cli/agent-prompt-builder.ts:77-194`

**Fallback**: Plain text if not valid JSON

## Key Lifecycle Management

- Automatic cleanup after 24 hours
- Entries limited to 50 most recent items
- Designed for iterative context injection in CFN Loop workflows