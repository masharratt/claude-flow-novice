# Redis Coordination Template

## Pub/Sub Communication Pattern

### Publish Decision Notification
```typescript
// Publish ephemeral decision notification to Redis
await redis.publish(`cfn:loop4:decision:`, JSON.stringify({
  decision: decision.action,
  phaseId,
  consensus: loop2Data[0]?.consensus_score,
  cost: decision.cost
}));
```

### Connection Loss Handling
```typescript
try {
  await redis.publish(`cfn:loop4:decision:`, JSON.stringify(decisionData));
} catch (error) {
  if (error.code === 'REDIS_CONNECTION_LOST') {
    console.warn('Redis connection lost - decision notification skipped');
    // Log to SQLite audit trail
    await sqlite.query(`
      INSERT INTO audit_log (agent_id, action, details, timestamp)
      VALUES ('product-owner', 'redis_notification_failed', ?, datetime('now'))
    `, [JSON.stringify({ error: error.message, phaseId })]);
  }
}
```

## Redis Pub/Sub Best Practices

### Reliability Patterns
- Use retry mechanisms for critical messages
- Log all connection loss events
- Ensure SQLite persistence as primary record
- Use Redis for ephemeral, non-critical notifications

### Performance Considerations
- Keep payload small (<64KB)
- Use structured JSON
- Minimize serialization/deserialization overhead
