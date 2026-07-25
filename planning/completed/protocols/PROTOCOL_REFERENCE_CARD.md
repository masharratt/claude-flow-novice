# Protocol Reference Card

**Quick lookup guide for Claude Flow Novice integration protocols**

---

## Data Envelope Template

```json
{
  "metadata": {
    "timestamp": "2025-11-15T10:30:00Z",
    "source": "component-name",
    "destination": "optional-target",
    "correlationId": "uuid-here",
    "traceId": "parent-uuid",
    "sessionId": "task-id-here"
  },
  "control": {
    "version": "1.0.0",
    "schemaVersion": "1.0.0",
    "operationType": "request|response|event|signal",
    "priority": "critical|high|normal|low"
  },
  "tracking": {
    "taskId": "task-id",
    "agentId": "agent-id",
    "phase": "initialization|execution|validation|completion",
    "retryCount": 0
  },
  "payload": { /* actual data */ },
  "status": {
    "success": true,
    "code": "200",
    "message": "optional message"
  }
}
```

---

## Error Code Quick Reference

| Category | Code  | Meaning | Retryable |
|----------|-------|---------|-----------|
| Database | DB-001 | Connection failed | ✓ |
| Database | DB-002 | Query execution failed | ✓ |
| Database | DB-003 | Transaction rollback | ✓ |
| Database | DB-004 | Schema mismatch | ✗ |
| Database | DB-005 | Data integrity violation | ✗ |
| File | FILE-001 | File not found | ✗ |
| File | FILE-002 | Permission denied | ✗ |
| File | FILE-003 | Disk full | ✓ |
| File | FILE-005 | Atomic write failure | ✓ |
| Network | NET-001 | Connection refused | ✓ |
| Network | NET-002 | Timeout | ✓ |
| Network | NET-003 | DNS resolution failed | ✓ |
| Network | NET-006 | Service unavailable | ✓ |
| Validation | VAL-001 | Schema validation failed | ✗ |
| Validation | VAL-002 | Type mismatch | ✗ |
| Timeout | TIMEOUT-001 | Request timeout | ✓ |

---

## Log Levels

```
FATAL   → Process termination imminent
ERROR   → Non-fatal failure (operation failed)
WARN    → Warning condition (recoverable)
INFO    → General information
DEBUG   → Detailed diagnostics (dev only)
```

---

## Retry Policy

```yaml
Default Retry Policy:
  maxRetries: 3
  initialDelay: 100ms
  maxDelay: 30s
  backoffMultiplier: 2
  jitter: 0-100ms
  retryableErrors:
    - DATABASE
    - NETWORK
    - TIMEOUT
  nonRetryableErrors:
    - VAL-*
    - AUTH-*
    - FILE-001
```

---

## Correlation Key Patterns

```
Task Level:        task:{task_id}:{entity_type}
Agent Level:       task:{task_id}:agent:{agent_id}:{entity_type}
Resource Level:    task:{task_id}:agent:{agent_id}:resource:{resource_id}:{type}

Example:
  task:task-001:agents
  task:task-001:agent:agent-backend-dev-uuid:status
  task:task-001:agent:agent-backend-dev-uuid:deliverables
```

---

## Timestamp Format

**Standard:** ISO 8601 with milliseconds and Z suffix

```
✓ Correct:   2025-11-15T10:30:00.123Z
✗ Wrong:     2025-11-15 10:30:00
✗ Wrong:     11/15/2025 10:30:00

# Generate in bash:
date -u +%Y-%m-%dT%H:%M:%S.%3NZ

# Generate in JavaScript:
new Date().toISOString()
```

---

## API Function Signatures

### Spawn Agent
```bash
spawn_agent --agent-type TYPE --task-id ID --task DESCRIPTION [--priority LEVEL]
# Returns: Agent ID or error
```

### Signal Agent
```bash
signal_agent --agent-id ID --signal-type TYPE [--data JSON]
# Types: wake, proceed, iterate, abort, heartbeat
```

### Acquire Lock
```bash
acquire_lock --resource-id ID --owner-id OWNER [--ttl SECONDS]
# Returns: Lock ID
```

### Storage Operations
```bash
storage_read --storage TYPE --key KEY [--format FORMAT]
storage_write --storage TYPE --key KEY --value VALUE [--ttl SECONDS]
storage_query --storage TYPE --pattern PATTERN [--limit N]
# Types: redis, sqlite, file
```

---

## Gate Thresholds

```
MVP:        ≥ 0.70 confidence
Standard:   ≥ 0.75 confidence
Enterprise: ≥ 0.85 confidence

Consensus:
  MVP:        ≥ 0.80 (2 validators)
  Standard:   ≥ 0.90 (3-4 validators)
  Enterprise: ≥ 0.95 (5+ validators)
```

---

## File Operations Checklist

### Atomic Write
```bash
1. Create temp file in same directory
2. Write content to temp file
3. Calculate SHA256 hash
4. Verify hash matches expected
5. Backup existing file (if enabled)
6. Move temp to target (atomic operation)
7. Verify final state
```

### Safe Operations
```bash
✓ write-then-move     (atomic)
✓ read-then-backup    (safe)
✓ lock-then-write     (concurrent safe)
✗ direct write        (not atomic)
✗ append without lock (concurrent unsafe)
```

---

## Common Envelopes

### Agent Spawn Request
```json
{
  "payload": {
    "agentType": "backend-developer",
    "parameters": {
      "skill": "authentication",
      "task": "Implement JWT validation"
    }
  }
}
```

### Agent Completion
```json
{
  "payload": {
    "decision": "PROCEED|ITERATE|ABORT",
    "confidence": 0.92,
    "deliverables": ["/path/file1", "/path/file2"],
    "summary": "Brief summary of work"
  }
}
```

### Error Response
```json
{
  "status": {
    "success": false,
    "code": "503",
    "message": "Service unavailable"
  },
  "payload": {
    "code": "DB-001",
    "category": "DATABASE",
    "recovery": {
      "retryable": true,
      "fallbackAction": "use_cache"
    }
  }
}
```

---

## Structured Logging

### Format
```json
{
  "timestamp": "2025-11-15T10:30:00.123Z",
  "level": "INFO|WARN|ERROR|DEBUG|FATAL",
  "message": "Operation started",
  "correlationId": "uuid-here",
  "source": "agent-id",
  "context": {
    "taskId": "task-001",
    "agentId": "agent-001",
    "phase": "execution"
  },
  "data": { /* custom fields */ },
  "error": { /* if applicable */ }
}
```

### Examples
```bash
# INFO
{"timestamp":"2025-11-15T10:30:00Z","level":"INFO","message":"Agent spawning","source":"coordinator","context":{"taskId":"task-001"}}

# ERROR
{"timestamp":"2025-11-15T10:30:05Z","level":"ERROR","message":"Database query failed","source":"agent-001","context":{"taskId":"task-001"},"error":{"code":"DB-002"}}

# WARN
{"timestamp":"2025-11-15T10:30:10Z","level":"WARN","message":"Slow query detected","source":"agent-001","data":{"duration":5000,"threshold":1000}}
```

---

## TypeScript Imports

```typescript
// Protocol types
import {
  DataEnvelope,
  StandardError,
  LogEntry,
  AgentSpawnRequest,
  AgentCompletion,
  RetryPolicy,
  ErrorCategory
} from '@cfn/protocols';

// Utilities
import {
  createEnvelope,
  validateEnvelope,
  normalizeError,
  handleWithRetry,
  Logger
} from '@cfn/protocol-utils';
```

---

## Bash Utilities

```bash
# Source protocol helpers
source ~/.cfn/protocols/bash-helpers.sh

# Functions available
create_envelope()       # Create JSON envelope
validate_envelope()     # Validate envelope
normalize_error()       # Convert to StandardError
retry_with_backoff()    # Retry with exponential backoff
log_structured()        # Structured JSON logging
atomic_write()          # Atomic file write
acquire_lock()          # Distributed lock
```

---

## Decision Tree: Which Protocol to Use

```
┌─ Need to send/receive data?
│  └─ YES → Use Data Envelope Protocol
│
├─ Operation might fail?
│  ├─ Transient failure → Use Retry Policy
│  └─ Permanent failure → Use Error Protocol with Fallback
│
├─ Need to track request across systems?
│  └─ YES → Use Correlation IDs in metadata
│
├─ Need to write/update file safely?
│  └─ YES → Use Atomic Write Pattern
│
├─ Need concurrent access to resource?
│  └─ YES → Use File Lock or Distributed Lock
│
├─ Need to query multiple databases?
│  └─ YES → Use Cross-Database Query Pattern
│
├─ Need to spawn/monitor agent?
│  └─ YES → Use Agent Communication Protocol
│
└─ Need to observe system behavior?
   └─ YES → Use Structured Logging Protocol
```

---

## Performance Baselines

```
Operation                 Latency    Notes
────────────────────────────────────────────────
Create envelope           <1ms       Serialization only
Validate envelope         <1ms       Schema check
Redis read (hit)          1-2ms      Network + parsing
Redis write               2-3ms      Network + persistence
SQLite query              10-20ms    Disk I/O
File read                 5-50ms     Depends on size
Atomic file write         20-100ms   Includes verification
Log to stdout             <1ms       Buffered
Log aggregation send      5-10ms     Batch flush

Retry attempt             100ms+     Exponential backoff
Lock acquisition          <1ms       (immediate if available)
Lock wait per attempt     100ms      Poll interval
```

---

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Missing correlationId | Untraceable requests | Always generate UUID |
| Wrong timestamp format | Parsing failures | Use ISO 8601 with Z |
| No retry policy | Cascading failures | Define per error category |
| Direct file write | Data loss | Use atomic write pattern |
| Logging without correlation ID | Unrelated logs mixed | Inject into all logs |
| Synchronous retries | Thread starvation | Use exponential backoff |
| Silent failures | Undiagnosed errors | Log all errors |
| Hard-coded timeouts | Inflexible systems | Use configurable timeouts |

---

## Quick Checklist

Before deploying code:

- [ ] All outgoing messages use DataEnvelope
- [ ] All errors create StandardError instances
- [ ] All logs include correlationId
- [ ] Timestamps in ISO 8601 format
- [ ] Retry policy defined for retryable errors
- [ ] Fallback strategy for failures
- [ ] File operations use atomic write
- [ ] Agent spawn uses proper protocol
- [ ] Correlation keys consistently generated
- [ ] Database queries handle missing data
- [ ] Logging covers happy and error paths
- [ ] Tests validate protocol compliance

---

## Resources

- **Full specification:** `STANDARD_INTEGRATION_PROTOCOLS.md`
- **Implementation guide:** `PROTOCOL_IMPLEMENTATION_GUIDE.md`
- **Example code:** Search for "Example" in guides
- **Troubleshooting:** See "Troubleshooting Common Issues" section

---

## Support Contacts

- **Protocol questions:** Architecture team
- **Implementation help:** Reach out in #protocols Slack channel
- **Bug reports:** File issue with [PROTOCOL] prefix
- **Enhancement proposals:** Create RFC in planning directory

---

**Last Updated:** 2025-11-15
**Protocol Version:** 1.0.0
