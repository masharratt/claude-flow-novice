## Redis Coordination Template

### Core Patterns

#### Worker-Coordinator Signaling

```bash
# Worker signals completion
redis-cli lpush "swarm:cfn:${mode}:loop3:worker${WORKER_ID}:done" \
  '{"confidence":${CONFIDENCE},"mode":"${mode}"}'

# Coordinator aggregates worker results
coordinator_result=$(redis-cli blpop "swarm:cfn:${mode}:loop3:complete" 0)
```

#### Validation Broadcast

```bash
# Loop 2 Coordinator broadcasts to validators
for i in $(seq 1 $validator_count); do
  redis-cli lpush "swarm:cfn:${mode}:validator${i}:inbox" "$loop3_result"
done
```

#### Mode-Specific Channels

```javascript
const redisChannels = {
  mvp: {
    loop3: `swarm:cfn:mvp:loop3`,
    loop2: `swarm:cfn:mvp:loop2`
  },
  standard: {
    loop3: `swarm:cfn:standard:loop3`,
    loop2: `swarm:cfn:standard:loop2`
  },
  enterprise: {
    loop3: `swarm:cfn:enterprise:loop3`,
    loop2: `swarm:cfn:enterprise:loop2`,
    loop2b: `swarm:cfn:enterprise:loop2b`
  }
};
```

### Swarm Coordination Event Publishing

```javascript
// Swarm coordination initiation
await redis.publish('swarm:coordination:start', JSON.stringify({
  coordinatorId: process.env.AGENT_ID,
  swarmId: process.env.SWARM_ID,
  mode: process.env.MODE || 'standard',
  timestamp: new Date().toISOString()
}));

// Topology adaptation
await redis.publish('swarm:topology:adaptation', JSON.stringify({
  coordinatorId: process.env.AGENT_ID,
  swarmId: process.env.SWARM_ID,
  adaptation: {
    from: 'current_topology',
    to: 'target_topology',
    confidence: 0.87,
    timestamp: new Date().toISOString()
  }
}));
```

### Connection Loss Handling

```typescript
try {
  await redis.publish('swarm:decision', JSON.stringify(decisionData));
} catch (error) {
  if (error.code === 'REDIS_CONNECTION_LOST') {
    console.warn('Redis connection lost - notification skipped');
    // Log to SQLite audit trail
    await sqlite.query(`
      INSERT INTO audit_log (agent_id, action, details, timestamp)
      VALUES (?, 'redis_notification_failed', ?, datetime('now'))
    `, [process.env.AGENT_ID, JSON.stringify({ error: error.message })]);
  }
}
```

### Key Coordination Principles

1. Use BLPOP for destructive, guaranteed message consumption
2. Coordinator acts as message aggregator and broadcaster
3. Each validator receives unique message
4. Mode-specific channel separation
5. Timeout handling for reliability
6. Use consistent channel naming conventions
7. Implement retry and fallback mechanisms
8. Add timeouts to prevent hanging subscriptions
9. Use Redis transactions for atomic operations
10. Keep payloads small (<64KB)
11. Use structured JSON
12. Minimize serialization/deserialization overhead

### Error Handling

```javascript
async function publishWithFallback(channel, message) {
  try {
    await redis.publish(channel, message);
  } catch (error) {
    console.error('Redis publish failed:', error);
    // Store event for replay
    await sqlite.query(`
      INSERT INTO pending_events (channel, message, created_at, retry_count)
      VALUES (?, ?, datetime('now'), 0)
    `, [channel, message]);
  }
}
```

### Authentication and Security

```bash
# Redis authentication with strong password
redis-cli --pass "$REDIS_PASSWORD" --no-auth-warning
```

### Monitoring and Metrics

```javascript
// Track Redis coordination metrics
await sqlite.query(`
  INSERT INTO redis_metrics (metric_type, value, timestamp)
  VALUES ('publish_latency', ?, datetime('now'))
`, [publishLatency]);
```

### Reliability Considerations

1. Ensure SQLite as primary record
2. Use Redis for ephemeral, non-critical notifications
3. Log all connection loss events
4. Implement distributed retry mechanisms