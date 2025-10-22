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

## Key Lifecycle Management

- Automatic cleanup after 24 hours
- Entries limited to 50 most recent items
- Designed for iterative context injection in CFN Loop workflows