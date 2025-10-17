## Memory Operations Template

### SQLite Lifecycle Hooks

```typescript
// Agent spawn registration
await sqlite.query(`
  INSERT INTO agents (id, type, status, spawned_at)
  VALUES (?, ?, 'active', CURRENT_TIMESTAMP)
`, [agentId, agentType]);

// Confidence score update
await sqlite.query(`
  UPDATE agents
  SET status = ?,
      confidence = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`, [status, confidenceScore, agentId]);

// Agent termination
await sqlite.query(`
  UPDATE agents
  SET status = 'completed',
      completed_at = CURRENT_TIMESTAMP
  WHERE id = ?
`, [agentId]);
```

### ACL Level Guidelines

| Level | Scope | Encryption | Retention | Use Cases |
|-------|-------|------------|-----------|-----------|
| 1 (Private) | Agent-scoped | AES-256 | 30 days | Temporary state, confidence scores, implementation details |
| 3 (Swarm) | Validation team | None | 90 days | Shared review feedback, test results |
| 4 (Project) | Project-wide | None | 365 days | Strategic decisions, backlog items |

### Mode-Specific Memory Keys

```typescript
const modeMemoryKeys = {
  mvp: {
    loop3: `cfn/phase-{id}/mvp/loop3/implementation`,
    loop2: `cfn/phase-{id}/mvp/loop2/validation`
  },
  standard: {
    loop3: `cfn/phase-{id}/standard/loop3/implementation`,
    loop2: `cfn/phase-{id}/standard/loop2/validation`
  },
  enterprise: {
    loop3: `cfn/phase-{id}/enterprise/loop3/implementation`,
    loop2: `cfn/phase-{id}/enterprise/loop2/validation`,
    loop2b: `cfn/phase-{id}/enterprise/loop2b/board-decision`
  }
};
```

### Memory Operations with ACL

```javascript
// Store agent-specific data (ACL Level 1)
await sqlite.memoryAdapter.set(
  `agent/${agentId}/confidence/${taskId}`,
  confidenceScore,
  {
    aclLevel: 1,    // Private to agent
    ttl: 2592000    // 30 days
  }
);

// Store swarm-level data (ACL Level 3)
await sqlite.memoryAdapter.set(
  `cfn/phase-${phaseId}/loop2/validation/${validatorId}`,
  validationResults,
  {
    aclLevel: 3,    // Swarm-accessible
    ttl: 7776000    // 90 days
  }
);
```

### Memory Persistence Pattern

```typescript
async function persistWithRetry(key, value, options) {
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await sqlite.memoryAdapter.set(key, value, options);
      return;
    } catch (error) {
      if (error.code === 'SQLITE_BUSY' && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Fallback to Redis for non-critical data
        if (options.aclLevel < 4) {
          await redis.set(key, JSON.stringify(value));
        } else {
          throw new Error('Critical data persistence failed');
        }
      }
    }
  }
}
```

### Performance Optimization

```javascript
// Caching mechanism to reduce SQLite write overhead
class MemoryOptimizer {
  private writeCache = new Map<string, any>();
  private lastFlushTime = Date.now();

  async set(key, value, options) {
    // Cache write to reduce SQLite overhead
    this.writeCache.set(key, { value, options });

    // Periodic flush to prevent cache growth
    if (Date.now() - this.lastFlushTime > 5000) {
      await this.flushCache();
    }
  }

  async flushCache() {
    const flushStart = Date.now();
    const batchWrites = [];

    for (const [key, { value, options }] of this.writeCache) {
      batchWrites.push(
        persistWithRetry(key, value, options).catch(console.error)
      );
    }

    await Promise.all(batchWrites);

    // Record performance metrics
    await sqlite.query(`
      INSERT INTO memory_operation_metrics
      (operation_type, key, acl_level, latency_ms, success)
      VALUES ('batch_write', ?, ?, ?, ?)
    `, [
      Array.from(this.writeCache.keys()).join(','),
      options.aclLevel,
      Date.now() - flushStart,
      true
    ]);

    this.writeCache.clear();
    this.lastFlushTime = Date.now();
  }
}
```

### Monitoring and Metrics

```sql
-- Track memory operation performance
CREATE TABLE memory_operation_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_type TEXT NOT NULL,  -- 'set', 'get', 'delete'
  key TEXT NOT NULL,
  acl_level INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Key Coordination Principles

1. Use mode-specific memory namespaces
2. Implement retry logic for transient errors
3. Fallback to Redis for non-critical data
4. Maintain strict ACL levels
5. Preserve audit trail with comprehensive logging
6. Always specify ACL level
7. Use appropriate TTL for data retention
8. Minimize direct SQLite writes with caching
9. Log all memory operations
10. Keep keys descriptive and structured
11. Monitor memory operation performance

### Reliability Strategies

- Use exponential backoff for retries
- Fallback to Redis for non-critical data
- Implement periodic cache flushing
- Track memory operation metrics
- Handle SQLite lock and busy states gracefully

### Security Considerations

- Encrypt sensitive data (AES-256 for Level 1)
- Validate and sanitize input before writing
- Use prepared statements to prevent injection
- Rotate encryption keys periodically
- Implement access logging for sensitive operations