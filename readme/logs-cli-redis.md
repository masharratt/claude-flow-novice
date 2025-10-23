# Redis Key Patterns for CFN Loop Coordination

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