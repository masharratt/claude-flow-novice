# Memory Operations Template

## Storage Architecture
- **Primary**: SQLite (Persistent)
- **Cache**: Redis (Hot, 1h TTL)
- **Retention**: 30-365 days

## Access Control Levels (ACL)

| Level | Scope | Encryption | Use Case |
|-------|-------|------------|----------|
| 1 | Agent | AES-256 | Personal workspace |
| 2 | Team | AES-256 | Team collaboration |
| 3 | Swarm | None | Cross-agent sharing |
| 4 | Project | None | Long-term context |
| 5 | System | Master Key | Audit logs |

## Core Operations

### Write Pattern
```python
await memory.memoryAdapter.set(
    key='task/progress',
    value={'confidence': 0.85, 'status': 'in_progress'},
    options={
        'agentId': current_agent_id,
        'aclLevel': 1,  # Agent-only
        'ttl': 2592000  # 30 days
    }
)
```

### Read Pattern
```python
result = await memory.memoryAdapter.get(
    key='task/progress',
    options={'agentId': current_agent_id}
)
```

## Memory Key Structure
```
swarm:{swarmId}:{agentId}:{category}:{key}
```

## Confidence Tracking
- **Scope**: Per task, per agent
- **Stored**: SQLite (persistent)
- **Cached**: Redis (fast access)

## Performance Metrics
- **Write Latency**:
  * SQLite: <60ms
  * Redis: <5ms
- **Read Latency**:
  * Redis (cache hit): <5ms
  * SQLite: <20ms

## Error Handling
- Connection loss fallback
- Exponential backoff
- Circuit breaker
- Hybrid storage mode

## Best Practices
- Minimize payload size
- Use structured keys
- Implement idempotent operations
- Log all interactions
- Validate before persist

## Retention & Cleanup
- Automatic key expiration
- Configurable retention periods
- Compliance with data policies

**Last Updated**: 2025-10-17
**Status**: Production-ready