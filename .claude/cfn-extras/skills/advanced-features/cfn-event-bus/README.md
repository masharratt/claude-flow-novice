# Event Bus Skill

**Version:** 1.0.0
**Status:** Operational

## Quick Start

```bash
# Publish an event
./.claude/skills/event-bus/invoke-event-publish.sh \
  --topic "task:completed" \
  --payload '{"taskId": "auth", "confidence": 0.92}'

# Track agent lifecycle
./.claude/skills/event-bus/invoke-lifecycle-track.sh \
  --agent-id "backend-dev-1" \
  --event "complete" \
  --metadata '{"confidence": 0.92, "duration": 45000}'

# Subscribe to events (blocking)
./.claude/skills/event-bus/invoke-event-subscribe.sh \
  --topic "agent:completed" \
  --callback "handle_completion"

# Run tests
./.claude/skills/event-bus/test-event-bus.sh
```

## Overview

Event Bus provides a centralized pub/sub system for:
- Decoupled agent communication
- Lifecycle event tracking
- System-wide notifications
- Event filtering and statistics

Built on the QEEventBus architecture from `.claude/core/cfn-event-bus.js`.

## Available Scripts

### 1. invoke-event-publish.sh
Publish events to topics.

**Arguments:**
- `--topic` (required) - Event topic/channel
- `--payload` (required) - JSON event payload
- `--trace-id` (optional) - Distributed tracing ID

**Example:**
```bash
./invoke-event-publish.sh \
  --topic "validation:passed" \
  --payload '{"validator": "security", "checks": ["auth", "csrf"]}' \
  --trace-id "trace-123"
```

### 2. invoke-event-subscribe.sh
Subscribe to event topics with optional filtering.

**Arguments:**
- `--topic` (required) - Event topic
- `--callback` (required) - Bash callback function name
- `--filter` (optional) - JQ filter expression

**Example:**
```bash
# Define callback
handle_event() {
  local data="$1"
  echo "Received: $(echo "$data" | jq -r '.taskId')"
}

# Subscribe
./invoke-event-subscribe.sh \
  --topic "agent:completed" \
  --filter 'select(.confidence >= 0.90)' \
  --callback "handle_event"
```

### 3. invoke-lifecycle-track.sh
Track agent lifecycle events.

**Arguments:**
- `--agent-id` (required) - Agent identifier
- `--event` (required) - Lifecycle stage (spawn|complete|fail|timeout)
- `--metadata` (required) - JSON metadata

**Example:**
```bash
./invoke-lifecycle-track.sh \
  --agent-id "backend-dev-1" \
  --event "spawn" \
  --metadata '{
    "taskId": "auth-system",
    "role": "backend-developer",
    "timestamp": '$(date +%s)'
  }'
```

### 4. test-event-bus.sh
Comprehensive test suite with 13+ tests covering:
- Event publishing
- Lifecycle tracking (all stages)
- Event filtering
- Statistics collection
- Error handling
- ID uniqueness

## Configuration

Environment variables for customization:

```bash
# Enable verbose logging
export EVENTBUS_DEBUG=true

# Collect detailed statistics
export EVENTBUS_STATS=true

# Persist lifecycle events to Redis
export EVENTBUS_PERSIST=true

# Set max listeners per event
export EVENTBUS_MAX_LISTENERS=100
```

## Event Types

### System Events
- `agent:spawned` - New agent created
- `agent:completed` - Agent finished successfully
- `agent:failed` - Agent encountered error
- `agent:timeout` - Agent exceeded time limit
- `task:started` - Task execution begins
- `task:completed` - Task finished
- `consensus:reached` - CFN Loop consensus achieved
- `validation:passed` - Validation gate passed
- `validation:failed` - Validation gate failed

### Lifecycle Stages
- `spawn` - Agent initialization
- `complete` - Successful completion
- `fail` - Critical error
- `timeout` - Execution time exceeded

## Integration Patterns

### With Redis Coordination
Combine event-driven notifications with blocking synchronization:

```bash
# Event Bus: Notify watchers
./.claude/skills/event-bus/invoke-event-publish.sh \
  --topic "agent:waiting" \
  --payload '{"agentId": "coder-1", "status": "blocked"}'

# Redis: Block until ready
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "auth" --agent-id "coder-1" --context "waiting"
```

### CFN Loop Lifecycle Tracking
Track agent progress across iterations:

```bash
# Iteration 1 - Spawn
./invoke-lifecycle-track.sh \
  --agent-id "coder-1" --event "spawn" \
  --metadata '{"iteration": 1, "taskId": "auth"}'

# Iteration 1 - Complete
./invoke-lifecycle-track.sh \
  --agent-id "coder-1" --event "complete" \
  --metadata '{"iteration": 1, "confidence": 0.75}'

# Iteration 2 - Spawn (after feedback)
./invoke-lifecycle-track.sh \
  --agent-id "coder-1" --event "spawn" \
  --metadata '{"iteration": 2, "taskId": "auth", "feedback": "Add error handling"}'
```

### Consensus Broadcasting
Notify all agents when consensus is reached:

```bash
./invoke-event-publish.sh \
  --topic "consensus:reached" \
  --payload '{
    "taskId": "auth-system",
    "avgConfidence": 0.93,
    "iteration": 3,
    "agents": ["coder-1", "reviewer-1", "tester-1"]
  }'
```

## Event Schema

### Standard Event
```json
{
  "eventId": "evt-1729311234-1234",
  "topic": "agent:completed",
  "payload": {
    "taskId": "auth-system",
    "agentId": "backend-dev-1",
    "confidence": 0.92
  },
  "traceId": "trace-123-abc",
  "timestamp": 1729311234
}
```

### Lifecycle Event
```json
{
  "trackingId": "track-1729311234-5678",
  "eventType": "lifecycle",
  "stage": "complete",
  "agentId": "backend-dev-1",
  "timestamp": 1729311234,
  "metadata": {
    "taskId": "auth-system",
    "confidence": 0.92,
    "duration": 45000
  }
}
```

## Troubleshooting

### Event Not Received
1. Verify topic name matches exactly
2. Check callback function is defined
3. Enable debug: `EVENTBUS_DEBUG=true`
4. Check statistics: `eventBus.getEventStats()`

### High Memory Usage
Reset event statistics:
```bash
node -e "
  const { eventBus } = require('./.claude/core/cfn-event-bus.js');
  eventBus.resetStats();
"
```

### Lifecycle Events Missing
1. Ensure invoke-lifecycle-track.sh is called
2. Validate JSON metadata
3. Check agent-id format

## Related Skills

- **Redis Coordination** (`.claude/skills/redis-coordination/`) - Blocking coordination
- **Agent Spawning** (`.claude/skills/agent-spawning/`) - Agent creation
- **CFN Loop Validation** (`.claude/skills/cfn-loop-validation/`) - Consensus loops

## Documentation

Full documentation: [SKILL.md](./SKILL.md)

## Testing

Run the test suite:
```bash
./test-event-bus.sh
```

Expected output:
```
========================================
Event Bus Skill - Test Suite
========================================
[Test 1] Event Publishing - Basic
✓ PASSED
...
========================================
Test Summary
========================================
Total Tests:  13
Passed:       13
Failed:       0
========================================
All tests passed!
```

## Future Enhancements

- WASM JSON processing for performance
- Event replay and time-travel debugging
- Persistent event store integration
- Event sourcing for agent state
- Real-time event streaming API

## Support

For issues or questions:
1. Run test suite: `./test-event-bus.sh`
2. Enable debug logging: `EVENTBUS_DEBUG=true`
3. Review SKILL.md for detailed documentation
