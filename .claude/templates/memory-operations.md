# Memory Operations Template

## SQLite Memory Persistence Patterns

### Store Decision with ACL
```typescript
// Store strategic decision with 365-day retention
await sqlite.memoryAdapter.set(
  `cfn/phase-/loop4/decision`,
  {
    decision: decision.action,
    consensus: loop2Data[0]?.consensus_score,
    cost: decision.cost,
    timestamp: Date.now()
  },
  { 
    aclLevel: 4,  // Project-level access
    ttl: 31536000  // 365 days
  }
);
```

### Retrieve Scope Boundaries
```typescript
const scopeBoundaries = await sqlite.memoryAdapter.get(
  'project-boundaries', 
  { aclLevel: 4 }  // Project-level access
);
```

## Error Handling for Memory Operations

### Retry with Exponential Backoff
```typescript
async function memoryWrite(key, value, options) {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await sqlite.memoryAdapter.set(key, value, options);
    } catch (error) {
      if (error.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

## ACL Level Guidelines

- **Level 1 (Private)**: Agent-scoped data
- **Level 3 (Swarm)**: Team/validator shared data
- **Level 4 (Project)**: Strategic decisions, compliance data
- **Retention**: Adjust TTL based on ACL level and compliance needs
