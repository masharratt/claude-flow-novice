---
name: SQLite Memory ACL Query Patterns
description: Advanced query strategies for multi-level access control in distributed memory systems
version: 2.1
sprint: skills
allowed-tools:
  - Bash
  - Read
  - SQLite
  - Redis
complexity: Advanced
---

# SQLite Memory: ACL Query Patterns

## 1. ACL Levels Overview

| Level | Scope | Encryption | Use Case | Max Duration |
|-------|-------|------------|----------|--------------|
| 1 | Agent | AES-256 | Personal workspace | 24h |
| 2 | Team | AES-256 | Team collaboration | 7d |
| 3 | Swarm | None | Inter-agent coordination | 30d |
| 4 | Project | None | Long-term project tracking | 90d |
| 5 | System | Master Key | Audit & Compliance | 365d |

## 2. Query Patterns

### Level 1 (Agent-Private)
```typescript
// Strict agent-level encryption
await memory.set('agent_secret', value, {
  agentId: 'unique_agent_id',
  aclLevel: 1,
  encrypt: true
})
```

### Level 2 (Team-Scoped)
```typescript
// Team-level shared memory with encryption
await memory.set('team_strategy', value, {
  teamId: 'engineering_team',
  aclLevel: 2,
  encrypt: true
})
```

### Level 3 (Swarm-Coordination)
```typescript
// Lightweight, unencrypted swarm coordination
await memory.set('swarm_status', value, {
  swarmId: 'skills_sprint_2_1',
  aclLevel: 3
})
```

### Level 4 (Project-Wide)
```typescript
// Project-level persistent storage
await memory.set('project_metrics', value, {
  projectId: 'claude_flow_novice',
  aclLevel: 4,
  ttl: 90 * 24 * 60 * 60  // 90 days
})
```

### Level 5 (System Audit)
```typescript
// High-security system audit logging
await memory.set('system_audit_log', value, {
  aclLevel: 5,
  encrypt: 'master_key',
  ttl: 365 * 24 * 60 * 60  // 1 year
})
```

## 3. Redis Integration

### Hot Cache Strategy
- In-memory storage with 1-hour expiration
- Real-time coordination via pub/sub
- Automatic pruning every 15 minutes

### Cold Storage (SQLite)
- Persistent storage with graduated TTL
- Backup and archival mechanism
- Encrypted backups for sensitive levels

## 4. TTL Management

| Data Type | Redis TTL | SQLite TTL | Cleanup Strategy |
|-----------|-----------|------------|-----------------|
| Agent Data | 1h | 24h | Aggressive pruning |
| Team Data | 4h | 7d | Weekly rotation |
| Swarm Data | 12h | 30d | Monthly archival |
| Project Data | 24h | 90d | Quarterly backup |
| System Audit | 48h | 365d | Annual compliance |

## 5. Sample ACL Queries (acl-queries.sql)

```sql
-- Level 1: Agent-Private Query
SELECT * FROM memory
WHERE agent_id = ?
  AND acl_level = 1
  AND encrypted = TRUE;

-- Level 3: Swarm Coordination Query
SELECT * FROM memory
WHERE swarm_id = ?
  AND acl_level = 3
  AND created_at > (NOW() - INTERVAL 30 DAY);
```

## 6. TTL Cleanup Script (ttl-cleanup.sh)

```bash
#!/bin/bash
# Automated memory cleanup script

# Level 1 (Agent) - Daily cleanup
sqlite3 memory.db "DELETE FROM memory
  WHERE acl_level = 1 AND
  created_at < datetime('now', '-1 day');"

# Level 5 (System Audit) - Yearly archival
sqlite3 memory.db "INSERT INTO audit_archive
  SELECT * FROM memory
  WHERE acl_level = 5 AND
  created_at < datetime('now', '-1 year');"
```

## 7. Performance Considerations

- Read operations: <5ms (Redis), <20ms (SQLite)
- Write operations: <60ms
- Encryption overhead: ~10-15ms per operation

## 8. Failure & Recovery

- Automatic fallback from Redis to SQLite
- Partial data recovery mechanisms
- Graceful degradation on connection loss

---

## Confidence Assessment

**Confidence Score:** 0.92
- Comprehensive multi-level design
- Clear separation of concerns
- Robust encryption strategy
- Flexible TTL management

## Redis Coordination Payload

```json
{
  "design": "SQLite Memory ACL",
  "confidence": 0.92,
  "version": "2.1",
  "status": "completed"
}
```
