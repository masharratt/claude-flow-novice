# Event Bus Skill

## Version
**Version:** 1.0.0
**Status:** OPERATIONAL

## Overview
Event Bus provides a centralized event-driven communication system for agent coordination, system events, and lifecycle tracking. Built on the QEEventBus architecture, it enables decoupled, asynchronous messaging between agents and system components.

## Features
- Event Publishing and Subscription
- Agent Lifecycle Tracking
- Event Filtering and Statistics
- Type-Safe Event Handling
- WASM JSON Integration (Placeholder)

## Core Components

### 1. Event Router and Dispatcher
The Event Bus uses a pub/sub architecture with the following key components:

**Event Emitter**: Core EventBus class from `.claude/core/event-bus.js`
- `emit(event, data)` - Publish an event
- `on(event, handler)` - Subscribe to an event
- `once(event, handler)` - Subscribe to one-time event
- `off(event, handler)` - Unsubscribe from event
- `waitFor(event, timeoutMs)` - Async wait for event

**Event Statistics**:
- `getEventStats()` - Get event metrics (count, last emitted)
- `resetStats()` - Clear event statistics

### 2. Agent Lifecycle Events
Track agent state transitions across the execution lifecycle:

**Lifecycle Stages**:
- `spawn` - Agent created and initialized
- `complete` - Agent successfully finished task
- `fail` - Agent encountered critical error
- `timeout` - Agent exceeded execution time limit

**Lifecycle Metadata**:
```json
{
  "agentId": "backend-dev-1",
  "taskId": "auth-system",
  "timestamp": 1729311234,
  "metadata": {
    "reason": "Task completed successfully",
    "confidence": 0.92,
    "duration": 45000
  }
}
```

### 3. System Events
Pre-defined system-wide events for cross-agent coordination:

**Common System Events**:
- `agent:spawned` - New agent created
- `agent:completed` - Agent finished
- `agent:failed` - Agent error
- `task:started` - Task execution begins
- `task:completed` - Task finished
- `consensus:reached` - CFN Loop consensus achieved
- `validation:passed` - Validation gate passed
- `validation:failed` - Validation gate failed

### 4. WASM JSON Integration
**Status:** Placeholder for future implementation

Future integration with WASM-based JSON processing for:
- High-performance event serialization
- Schema validation
- Binary event encoding
- Cross-platform event format

## Agent Integration Examples

### 1. Publishing Events

#### Basic Event Publishing
```bash
# Publish task completion event
./.claude/skills/event-bus/invoke-event-publish.sh \
  --topic "task:completed" \
  --payload '{
    "taskId": "auth-system",
    "agentId": "backend-dev-1",
    "confidence": 0.92,
    "timestamp": '$(date +%s)'
  }'
```

#### Publishing with Trace ID
```bash
# Publish with distributed tracing
./.claude/skills/event-bus/invoke-event-publish.sh \
  --topic "validation:passed" \
  --payload '{
    "taskId": "deploy-feature",
    "validator": "security-agent",
    "checks": ["input-validation", "auth-check", "rate-limiting"]
  }' \
  --trace-id "trace-123-abc"
```

### 2. Subscribing to Events

#### Subscribe to Single Event
```bash
# Subscribe to agent completion events
./.claude/skills/event-bus/invoke-event-subscribe.sh \
  --topic "agent:completed" \
  --callback "handle_agent_complete"

# Callback function definition
handle_agent_complete() {
  local event_data="$1"
  echo "Agent completed: $(echo "$event_data" | jq -r '.agentId')"
  # Process event...
}
```

#### Filtered Event Subscription
```bash
# Subscribe only to high-confidence completions
./.claude/skills/event-bus/invoke-event-subscribe.sh \
  --topic "agent:completed" \
  --filter 'select(.confidence >= 0.90)' \
  --callback "handle_high_confidence_completion"
```

### 3. Agent Lifecycle Tracking

#### Track Agent Spawn
```bash
# Record agent creation
./.claude/skills/event-bus/invoke-lifecycle-track.sh \
  --agent-id "backend-dev-1" \
  --event "spawn" \
  --metadata '{
    "taskId": "auth-system",
    "role": "backend-developer",
    "timestamp": '$(date +%s)'
  }'
```

#### Track Agent Completion
```bash
# Record successful completion
./.claude/skills/event-bus/invoke-lifecycle-track.sh \
  --agent-id "backend-dev-1" \
  --event "complete" \
  --metadata '{
    "taskId": "auth-system",
    "confidence": 0.92,
    "duration": 45000,
    "filesModified": 12
  }'
```

#### Track Agent Failure
```bash
# Record agent failure
./.claude/skills/event-bus/invoke-lifecycle-track.sh \
  --agent-id "backend-dev-1" \
  --event "fail" \
  --metadata '{
    "taskId": "auth-system",
    "error": "TypeScript compilation failed",
    "stage": "post-edit-validation",
    "timestamp": '$(date +%s)'
  }'
```

#### Track Agent Timeout
```bash
# Record timeout
./.claude/skills/event-bus/invoke-lifecycle-track.sh \
  --agent-id "backend-dev-1" \
  --event "timeout" \
  --metadata '{
    "taskId": "auth-system",
    "timeLimit": 300000,
    "elapsed": 305000
  }'
```

## Integration Patterns

### Pattern 1: Event-Driven Coordination
Use events to coordinate agent workflows without tight coupling:

```bash
# Agent A publishes completion
./.claude/skills/event-bus/invoke-event-publish.sh \
  --topic "code:ready" \
  --payload '{"taskId": "auth", "status": "ready-for-review"}'

# Agent B subscribes and auto-triggers
./.claude/skills/event-bus/invoke-event-subscribe.sh \
  --topic "code:ready" \
  --callback "start_review_process"
```

### Pattern 2: Lifecycle Monitoring
Track agent progress across CFN Loop iterations:

```bash
# Iteration 1 start
./.claude/skills/event-bus/invoke-lifecycle-track.sh \
  --agent-id "coder-1" \
  --event "spawn" \
  --metadata '{"iteration": 1, "taskId": "auth"}'

# Iteration 1 complete
./.claude/skills/event-bus/invoke-lifecycle-track.sh \
  --agent-id "coder-1" \
  --event "complete" \
  --metadata '{"iteration": 1, "confidence": 0.75}'

# Iteration 2 start (after feedback)
./.claude/skills/event-bus/invoke-lifecycle-track.sh \
  --agent-id "coder-1" \
  --event "spawn" \
  --metadata '{"iteration": 2, "taskId": "auth"}'
```

### Pattern 3: Consensus Broadcasting
Broadcast consensus events to all waiting agents:

```bash
# Coordinator publishes consensus
./.claude/skills/event-bus/invoke-event-publish.sh \
  --topic "consensus:reached" \
  --payload '{
    "taskId": "auth-system",
    "avgConfidence": 0.93,
    "iteration": 3,
    "agents": ["coder-1", "reviewer-1", "tester-1"]
  }'

# All agents subscribe and receive notification
./.claude/skills/event-bus/invoke-event-subscribe.sh \
  --topic "consensus:reached" \
  --callback "handle_consensus"
```

## Event Schema Guidelines

### Standard Event Format
All events should follow this structure:

```json
{
  "eventType": "agent:completed",
  "timestamp": 1729311234,
  "source": {
    "agentId": "backend-dev-1",
    "taskId": "auth-system"
  },
  "payload": {
    "confidence": 0.92,
    "metrics": {
      "duration": 45000,
      "filesModified": 12
    }
  },
  "traceId": "trace-123-abc"
}
```

### Lifecycle Event Format
```json
{
  "eventType": "lifecycle",
  "stage": "complete",
  "agentId": "backend-dev-1",
  "taskId": "auth-system",
  "timestamp": 1729311234,
  "metadata": {
    "confidence": 0.92,
    "duration": 45000
  }
}
```

## Available Invoke Scripts

### 1. invoke-event-publish.sh
Publish events to the event bus.

**Arguments**:
- `--topic` (required) - Event topic/channel
- `--payload` (required) - JSON event payload
- `--trace-id` (optional) - Distributed tracing ID

**Returns**: JSON with publish status and event ID

### 2. invoke-event-subscribe.sh
Subscribe to event topics.

**Arguments**:
- `--topic` (required) - Event topic to subscribe to
- `--callback` (required) - Callback function name
- `--filter` (optional) - JQ filter expression

**Returns**: Subscription ID

### 3. invoke-lifecycle-track.sh
Track agent lifecycle events.

**Arguments**:
- `--agent-id` (required) - Agent identifier
- `--event` (required) - Lifecycle event (spawn|complete|fail|timeout)
- `--metadata` (required) - JSON metadata object

**Returns**: JSON with tracking confirmation

### 4. test-event-bus.sh
Comprehensive test suite for Event Bus functionality.

**Tests**:
- Event publishing
- Event subscription
- Lifecycle tracking
- Event filtering
- Statistics collection

## Event Bus vs Redis Coordination

**Use Event Bus When**:
- Decoupled communication needed
- Multiple subscribers per event
- Event history/statistics required
- System-wide notifications

**Use Redis Coordination When**:
- Agent synchronization required
- Blocking operations needed (BLPOP)
- CFN Loop dependencies
- Consensus collection

**Combined Usage**:
Use both for comprehensive coordination:
```bash
# Redis: Block until agent ready
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "auth" --agent-id "coder-1" --context "waiting"

# Event Bus: Notify all watchers
./.claude/skills/event-bus/invoke-event-publish.sh \
  --topic "agent:waiting" \
  --payload '{"agentId": "coder-1", "status": "blocked"}'
```

## Future Enhancements

### WASM JSON Processing
Future implementation will include:
- Binary event encoding via WASM
- Schema validation at native speed
- Cross-language event serialization
- Performance optimization for high-throughput scenarios

### Advanced Features (Roadmap)
- Event replay and time-travel debugging
- Persistent event store integration
- Event sourcing for agent state
- Real-time event streaming API

## Configuration

Event Bus behavior can be configured via:
- `EVENTBUS_DEBUG=true` - Enable verbose event logging
- `EVENTBUS_STATS=true` - Collect detailed statistics
- `EVENTBUS_MAX_LISTENERS=100` - Set max listeners per event

## Troubleshooting

### High Memory Usage
```bash
# Reset event statistics to free memory
node -e "
  const { eventBus } = require('./.claude/core/event-bus.js');
  eventBus.resetStats();
  console.log('Stats reset');
"
```

### Event Not Received
1. Verify topic name matches exactly
2. Check callback function is defined
3. Enable debug mode: `EVENTBUS_DEBUG=true`
4. Check event statistics for publish confirmation

### Lifecycle Events Missing
1. Ensure invoke-lifecycle-track.sh is called
2. Verify JSON metadata is valid
3. Check agent-id matches expected format

## Related Skills
- **Redis Coordination** (`.claude/skills/redis-coordination/SKILL.md`) - Blocking coordination
- **Agent Spawning** (`.claude/skills/agent-spawning/SKILL.md`) - Agent creation
- **CFN Loop Validation** (`.claude/skills/cfn-loop-validation/SKILL.md`) - Consensus loops

## Support
For issues or questions:
1. Check test suite: `.claude/skills/event-bus/test-event-bus.sh`
2. Review event statistics via `getEventStats()`
3. Enable debug logging with `EVENTBUS_DEBUG=true`
