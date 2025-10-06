# Message Routing Protocol

**Version**: 1.0.0
**Status**: Draft
**Last Updated**: 2025-10-06

## Overview

This document specifies the message routing protocol for CLI-based agent coordination. The protocol enables asynchronous, file-based message passing between agents and coordinators with at-most-once delivery semantics.

## Design Principles

- **Simplicity**: File-based messaging without external dependencies
- **Transparency**: Human-readable JSON for debugging and monitoring
- **Performance**: Sub-100ms read/write latency targets
- **Reliability**: Message validation and overflow protection
- **Scalability**: Support for 20+ concurrent agents

## Message Format Specification

### JSON Schema

All messages MUST conform to the following JSON schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "msg_id", "from", "to", "timestamp", "sequence", "type", "payload"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "description": "Protocol version (semver)",
      "example": "1.0.0"
    },
    "msg_id": {
      "type": "string",
      "pattern": "^msg_[a-f0-9]{8}$",
      "description": "Unique message identifier",
      "example": "msg_a3f5d8b2"
    },
    "from": {
      "type": "string",
      "pattern": "^[a-z0-9_-]+$",
      "description": "Sender agent or coordinator ID",
      "example": "coordinator-main"
    },
    "to": {
      "type": "string",
      "pattern": "^[a-z0-9_-]+$",
      "description": "Recipient agent or coordinator ID",
      "example": "backend-dev-1"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 UTC timestamp",
      "example": "2025-10-06T14:32:15.234Z"
    },
    "sequence": {
      "type": "integer",
      "minimum": 1,
      "description": "Per-recipient sequence number (1-based, incrementing)",
      "example": 42
    },
    "type": {
      "type": "string",
      "enum": ["status-update", "task-delegation", "result", "command", "heartbeat"],
      "description": "Message type determining payload structure"
    },
    "payload": {
      "type": "object",
      "description": "Type-specific message data"
    },
    "requires_ack": {
      "type": "boolean",
      "default": false,
      "description": "Whether recipient must acknowledge receipt"
    },
    "correlation_id": {
      "type": "string",
      "pattern": "^msg_[a-f0-9]{8}$",
      "description": "Links reply to original request message"
    },
    "priority": {
      "type": "integer",
      "minimum": 0,
      "maximum": 10,
      "default": 5,
      "description": "Message priority (0=lowest, 10=highest)"
    }
  }
}
```

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `version` | string | Protocol version (semver) | `"1.0.0"` |
| `msg_id` | string | Unique message identifier | `"msg_a3f5d8b2"` |
| `from` | string | Sender ID (agent or coordinator) | `"coordinator-main"` |
| `to` | string | Recipient ID (agent or coordinator) | `"backend-dev-1"` |
| `timestamp` | string | ISO 8601 UTC timestamp | `"2025-10-06T14:32:15.234Z"` |
| `sequence` | integer | Per-recipient sequence number (1-based) | `42` |
| `type` | enum | Message type (see types below) | `"task-delegation"` |
| `payload` | object | Type-specific message data | `{"task": "implement auth"}` |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `requires_ack` | boolean | `false` | Whether recipient must acknowledge |
| `correlation_id` | string | `null` | Links reply to original request |
| `priority` | integer | `5` | Message priority (0-10) |

### Message Ordering Guarantees

**Chronological Delivery**:
- Messages delivered to recipients in **timestamp order** (chronological)
- `receive_messages()` automatically sorts by timestamp field before returning
- Within-millisecond ordering not guaranteed (depends on filesystem timestamp precision)

**Sequence Numbering**:
- Each sender maintains per-recipient sequence counter (1-based, incrementing)
- `sequence` field tracks message order from specific sender to specific recipient
- Sequence counter state stored in: `state/agents/{sender_id}/.sequences/{recipient_id}`
- Gaps in sequence numbers indicate message loss/eviction
- Sequence resets to 1 when sender reinitializes or on system restart

## Message Types Catalog

### 1. status-update

**Direction**: Agent → Coordinator
**Purpose**: Progress reports and state changes

**Payload Schema**:
```json
{
  "status": "in_progress" | "completed" | "failed" | "blocked",
  "progress": 0.0-1.0,
  "message": "Human-readable status description",
  "confidence": 0.0-1.0,
  "blockers": ["Optional array of blocking issues"]
}
```

**Example**:
```json
{
  "version": "1.0.0",
  "msg_id": "msg_b4e2a7c1",
  "from": "coder-1",
  "to": "coordinator-main",
  "timestamp": "2025-10-06T14:35:22.123Z",
  "sequence": 5,
  "type": "status-update",
  "payload": {
    "status": "in_progress",
    "progress": 0.65,
    "message": "Implemented authentication logic, starting tests",
    "confidence": 0.80,
    "blockers": []
  }
}
```

### 2. task-delegation

**Direction**: Agent → Agent OR Coordinator → Agent
**Purpose**: Forward task to another agent

**Payload Schema**:
```json
{
  "task": "Task description string",
  "context": {
    "files": ["Array of relevant file paths"],
    "dependencies": ["Array of prerequisite tasks"],
    "deadline": "ISO 8601 timestamp (optional)"
  },
  "metadata": {
    "original_requester": "agent-id",
    "delegation_reason": "Why this agent was chosen"
  }
}
```

**Example**:
```json
{
  "version": "1.0.0",
  "msg_id": "msg_c7f3d9a5",
  "from": "backend-dev-1",
  "to": "security-specialist-1",
  "timestamp": "2025-10-06T14:40:15.456Z",
  "sequence": 1,
  "type": "task-delegation",
  "requires_ack": true,
  "payload": {
    "task": "Security audit of JWT implementation",
    "context": {
      "files": ["/src/auth/jwt.ts", "/src/middleware/auth.ts"],
      "dependencies": ["msg_b4e2a7c1"],
      "deadline": "2025-10-06T16:00:00.000Z"
    },
    "metadata": {
      "original_requester": "coordinator-main",
      "delegation_reason": "Specialized security expertise required"
    }
  }
}
```

### 3. result

**Direction**: Agent → Agent/Coordinator
**Purpose**: Report task completion with deliverables

**Payload Schema**:
```json
{
  "status": "success" | "failure" | "partial",
  "deliverables": {
    "files_modified": ["Array of changed file paths"],
    "tests_added": ["Array of test file paths"],
    "artifacts": ["Array of generated artifact paths"]
  },
  "metrics": {
    "confidence": 0.0-1.0,
    "test_coverage": 0.0-1.0,
    "duration_ms": 12345
  },
  "issues": ["Array of warnings or concerns"],
  "next_steps": ["Recommended follow-up actions"]
}
```

**Example**:
```json
{
  "version": "1.0.0",
  "msg_id": "msg_d8a4f2b6",
  "from": "coder-1",
  "to": "coordinator-main",
  "timestamp": "2025-10-06T15:10:42.789Z",
  "sequence": 6,
  "type": "result",
  "correlation_id": "msg_c7f3d9a5",
  "payload": {
    "status": "success",
    "deliverables": {
      "files_modified": ["/src/auth/jwt.ts", "/src/middleware/auth.ts"],
      "tests_added": ["/tests/auth/jwt.test.ts"],
      "artifacts": []
    },
    "metrics": {
      "confidence": 0.88,
      "test_coverage": 0.92,
      "duration_ms": 45230
    },
    "issues": ["JWT secret hardcoded - should use environment variable"],
    "next_steps": ["Move JWT_SECRET to .env configuration"]
  }
}
```

### 4. command

**Direction**: Coordinator → Agent
**Purpose**: Control messages for agent lifecycle management

**Payload Schema**:
```json
{
  "action": "start" | "pause" | "resume" | "stop" | "health_check",
  "parameters": {
    "reason": "Optional explanation",
    "timeout_ms": 30000
  }
}
```

**Example**:
```json
{
  "version": "1.0.0",
  "msg_id": "msg_e9b5c3d7",
  "from": "coordinator-main",
  "to": "tester-2",
  "timestamp": "2025-10-06T15:15:00.000Z",
  "sequence": 3,
  "type": "command",
  "requires_ack": true,
  "priority": 10,
  "payload": {
    "action": "pause",
    "parameters": {
      "reason": "Critical security issue detected - awaiting fix",
      "timeout_ms": 300000
    }
  }
}
```

### 5. heartbeat

**Direction**: Agent → Coordinator
**Purpose**: Liveness signal and health monitoring

**Payload Schema**:
```json
{
  "health": "healthy" | "degraded" | "unhealthy",
  "metrics": {
    "cpu_usage": 0.0-1.0,
    "memory_mb": 123,
    "active_tasks": 3
  },
  "uptime_ms": 123456
}
```

**Example**:
```json
{
  "version": "1.0.0",
  "msg_id": "msg_f1c6d8e2",
  "from": "backend-dev-1",
  "to": "coordinator-main",
  "timestamp": "2025-10-06T15:20:00.000Z",
  "sequence": 12,
  "type": "heartbeat",
  "payload": {
    "health": "healthy",
    "metrics": {
      "cpu_usage": 0.35,
      "memory_mb": 128,
      "active_tasks": 2
    },
    "uptime_ms": 3600000
  }
}
```

## Routing Rules

### Unicast (Default)

**Pattern**: Single sender → Single recipient

**Mechanism**:
- Message written to recipient's inbox: `state/agents/{to}/inbox/{msg_id}.json`
- Sender does NOT write to own outbox (stateless fire-and-forget)
- Recipient polls inbox directory for new messages

**Example Flow**:
```
Agent A → Agent B
1. Agent A writes: state/agents/agent-b/inbox/msg_xyz.json
2. Agent B polls: state/agents/agent-b/inbox/
3. Agent B reads and processes message
4. Agent B optionally deletes message after processing
```

### Broadcast (Future Enhancement)

**Pattern**: Coordinator → All agents

**Mechanism** (not implemented in MVP):
- Coordinator writes to all agent inboxes in parallel
- Agents process independently
- No guaranteed ordering across recipients

**Reserved for future use**: Shutdown commands, global state updates

### Reply Pattern

**Pattern**: Request/Response correlation

**Mechanism**:
- Original message includes unique `msg_id`
- Reply message sets `correlation_id` = original `msg_id`
- Allows sender to match responses to requests

**Example**:
```
Request (msg_abc123):
  from: coordinator-main
  to: coder-1
  type: task-delegation

Response (msg_def456):
  from: coder-1
  to: coordinator-main
  type: result
  correlation_id: msg_abc123  // Links to original request
```

## Error Handling

### Message Validation

**Schema Validation**:
- All messages MUST pass JSON schema validation before processing
- Invalid messages are logged and discarded
- No automatic retry on validation failure

**Validation Failures**:
```json
{
  "error": "VALIDATION_FAILED",
  "msg_id": "msg_invalid",
  "issues": [
    "Missing required field: timestamp",
    "Invalid type: expected 'status-update', got 'status_update'"
  ],
  "action": "Message discarded, logged to error.log"
}
```

### Delivery Failures

**At-Most-Once Semantics**:
- No automatic retry on delivery failure
- Sender responsibility to monitor for responses (if correlation_id used)
- Failed writes logged but not re-attempted

**Common Failures**:
- Inbox directory does not exist → Create directory and retry once
- Filesystem write error → Log and discard message
- Recipient agent offline → Message queued until agent starts

### Inbox Overflow Protection

**Overflow Policy**:
- Max inbox depth: 100 messages per agent
- Overflow behavior: Automatic FIFO (First-In-First-Out) eviction
- Trigger: When inbox reaches 100 messages, oldest message removed before new message written
- Eviction logged via message bus logging system with message ID and current inbox count

**Implementation**:
The message bus implements automatic overflow protection in the `send_message()` function. Before writing a new message, the inbox is checked:

1. Count current messages in recipient inbox
2. If count >= 100:
   - Find oldest message by modification time (FIFO ordering)
   - Remove oldest message atomically
   - Log eviction event with message ID
3. Write new message to inbox

**Bash Implementation**:
```bash
# Check inbox message count
local inbox_count=$(find "$recipient_inbox" -maxdepth 1 -name "*.json" -type f 2>/dev/null | wc -l)

if [[ $inbox_count -ge 100 ]]; then
  # Find oldest message by modification time
  local oldest_msg=$(find "$recipient_inbox" -maxdepth 1 -name "*.json" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | head -n 1 | cut -d' ' -f2-)

  if [[ -n "$oldest_msg" ]]; then
    local oldest_msg_id=$(basename "$oldest_msg" .json)
    rm -f "$oldest_msg"
    log_info "WARN: Inbox overflow for $to (${inbox_count} messages), evicted oldest: $oldest_msg_id"
  fi
fi
```

**JavaScript/TypeScript Implementation**:
```javascript
const inboxFiles = fs.readdirSync(inboxPath);
if (inboxFiles.length >= 100) {
  // Sort by modification time (oldest first)
  const filesWithTime = inboxFiles.map(file => ({
    name: file,
    mtime: fs.statSync(path.join(inboxPath, file)).mtime.getTime()
  })).sort((a, b) => a.mtime - b.mtime);

  const oldestFile = filesWithTime[0].name;
  fs.unlinkSync(path.join(inboxPath, oldestFile));
  console.log(`WARN: Inbox overflow for ${agentId}, evicted oldest: ${oldestFile}`);
}
```

**Guarantees**:
- Messages never lost silently - all evictions logged
- FIFO ordering preserved - oldest messages evicted first
- Atomic eviction - message removed before new message written
- No unbounded inbox growth - hard limit at 100 messages
- Performance maintained - constant time overflow check

## Performance Targets

### Latency Requirements

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Message write | <50ms | Time from send() call to file write complete |
| Message read | <100ms | Time from poll() call to message parsed |
| Inbox scan | <200ms | Time to list and sort 100 messages |
| Schema validation | <10ms | Time to validate message against JSON schema |

### Scalability Limits

| Metric | Limit | Rationale |
|--------|-------|-----------|
| Max message size | 10KB | Prevents filesystem bottlenecks |
| Max inbox depth | 100 messages | FIFO eviction prevents unbounded growth |
| Max concurrent agents | 20 | Filesystem polling overhead limit |
| Message retention | None (manual cleanup) | Agents delete after processing |

### Performance Monitoring

**Key Metrics**:
- `message_write_latency_ms`: Histogram of write times
- `message_read_latency_ms`: Histogram of read times
- `inbox_depth`: Current message count per agent
- `eviction_count`: Total messages evicted due to overflow

**Alerting Thresholds**:
- Write latency >100ms (2x target)
- Read latency >200ms (2x target)
- Inbox depth >80 (80% of max)

## Implementation Notes

### File Naming Convention

```
state/agents/{agent_id}/inbox/msg_{8_hex_chars}.json

Examples:
- state/agents/coordinator-main/inbox/msg_a3f5d8b2.json
- state/agents/backend-dev-1/inbox/msg_c7f3d9a5.json
```

**msg_id Generation**:
```javascript
function generateMessageId() {
  const randomHex = crypto.randomBytes(4).toString('hex');
  return `msg_${randomHex}`;
}
```

### Timestamp Format

**ISO 8601 UTC**:
```javascript
const timestamp = new Date().toISOString();
// Example: "2025-10-06T14:32:15.234Z"
```

### Atomic Writes

**Pattern**: Write to temp file, then rename
```javascript
const tempPath = `${inboxPath}/${msg_id}.tmp`;
const finalPath = `${inboxPath}/${msg_id}.json`;

fs.writeFileSync(tempPath, JSON.stringify(message, null, 2));
fs.renameSync(tempPath, finalPath); // Atomic operation
```

## Security Considerations

**Trust Model**: All agents trusted (no authentication)
**Validation**: Schema validation prevents malformed messages
**Injection**: No code execution in message processing (JSON only)
**Privacy**: Messages readable by filesystem users (no encryption)

**Future Enhancements**:
- Message signing with agent keypairs
- Encrypted payloads for sensitive data
- Rate limiting per agent

## Version Compatibility

**Protocol Versioning**:
- Current version: `1.0.0`
- Breaking changes increment major version
- Backward-compatible additions increment minor version

**Version Negotiation** (future):
- Agents advertise supported protocol versions
- Coordinator selects highest common version

## Appendix: Complete Message Examples

### Task Delegation with Full Context

```json
{
  "version": "1.0.0",
  "msg_id": "msg_1a2b3c4d",
  "from": "coordinator-main",
  "to": "rust-expert-1",
  "timestamp": "2025-10-06T16:00:00.000Z",
  "sequence": 8,
  "type": "task-delegation",
  "requires_ack": true,
  "priority": 8,
  "payload": {
    "task": "Optimize tiered-router.ts for performance",
    "context": {
      "files": ["/src/providers/tiered-router.ts"],
      "dependencies": [],
      "deadline": "2025-10-06T18:00:00.000Z"
    },
    "metadata": {
      "original_requester": "coordinator-main",
      "delegation_reason": "Performance expertise required for optimization"
    }
  }
}
```

### Result with Comprehensive Metrics

```json
{
  "version": "1.0.0",
  "msg_id": "msg_5e6f7a8b",
  "from": "rust-expert-1",
  "to": "coordinator-main",
  "timestamp": "2025-10-06T17:30:00.000Z",
  "sequence": 2,
  "type": "result",
  "correlation_id": "msg_1a2b3c4d",
  "payload": {
    "status": "success",
    "deliverables": {
      "files_modified": ["/src/providers/tiered-router.ts"],
      "tests_added": ["/tests/providers/tiered-router.perf.test.ts"],
      "artifacts": ["/benchmarks/tiered-router-results.json"]
    },
    "metrics": {
      "confidence": 0.92,
      "test_coverage": 0.95,
      "duration_ms": 5400000
    },
    "issues": [],
    "next_steps": ["Monitor production performance after deployment"]
  }
}
```
