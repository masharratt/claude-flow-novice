# Redis Coordination Template

## Core Communication Patterns

### Messaging Primitives
- **LPUSH/BLPOP**: Primary communication mechanism
- **Guaranteed Delivery**: Messages persist until consumed
- **FIFO Ordering**: First pushed = first consumed

### Communication Channels
- `swarm:coordination`: Global status
- `agent:{id}:status`: Individual agent status
- `agent:{id}:feedback`: Agent-specific feedback

### Message Envelope
```json
{
  "swarmId": "string",
  "agentId": "string",
  "timestamp": "ISO8601",
  "type": "status|feedback|metrics",
  "confidence": 0.0,
  "payload": {}
}
```

## Topology Patterns

### 1. Hierarchical Broadcast
- **Use**: 1:many dependencies
- **Flow**: Producer → Coordinator → Multiple Consumers
- **Ideal For**: Complex workflows with branching

### 2. Mesh Hybrid
- **Use**: 2-5 agents, peer-to-peer
- **Flow**: Producer → Multiple Consumers
- **Mechanism**: LPUSH + SET for multiple readers

### 3. Sequential Chain
- **Use**: Linear workflows A → B → C
- **Flow**: Each agent signals next after completion

## Error Handling

### Detection Strategies
- Timeout wrappers
- Connection loss checks
- State markers
- Heartbeat monitoring

### Retry Mechanisms
- Exponential backoff
- Circuit breaker
- Configurable max retries

## CFN Loop Integration

### Signaling Workflow
- Loop 3 → Aggregate Workers
- Signal Loop 2 Coordinator
- Broadcast to Validators
- Validate Implementation
- Gate Threshold Checks

## Best Practices
- Verify via Redis state
- Use explicit state markers
- Implement heartbeats
- Handle connection loss
- Minimal payload size

## Quick Commands
```bash
# Signal completion
redis-cli lpush "channel" '{"status":"done"}'

# Wait for signal
data=$(timeout 300 redis-cli --csv blpop "channel" 0)

# Verify state
redis-cli llen "channel"  # Expect 0 if consumed
```

## Confidence & Decision Tracking
- Track agent confidence
- Implement gate thresholds
- Support mode-specific rules (MVP/Standard/Enterprise)

**Last Updated**: 2025-10-17
**Status**: Production-ready