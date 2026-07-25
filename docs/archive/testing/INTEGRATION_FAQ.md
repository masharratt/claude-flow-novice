# Integration FAQ (Frequently Asked Questions)

**Version:** 1.0
**Last Updated:** 2025-11-16
**Status:** Complete

## Table of Contents

1. [General Questions](#general-questions)
2. [Database Questions](#database-questions)
3. [Coordination Questions](#coordination-questions)
4. [Artifact Storage Questions](#artifact-storage-questions)
5. [Transaction Questions](#transaction-questions)
6. [Performance Questions](#performance-questions)
7. [Migration Questions](#migration-questions)
8. [Troubleshooting Questions](#troubleshooting-questions)
9. [Architecture Questions](#architecture-questions)
10. [Operational Questions](#operational-questions)

---

## General Questions

### Q: What is the integration standardization system?

**A:** The standardization system is a set of unified APIs, protocols, and patterns for coordinating multiple systems (databases, caching, coordination, artifact storage, skill execution). It replaces ad-hoc implementations with standardized, well-documented approaches.

**Benefits:**
- Consistent error handling across all systems
- Complete traceability via correlation keys
- Automatic caching and performance optimization
- ACID guarantees for transactions
- Built-in monitoring and metrics

**See Also:** [INTEGRATION_STANDARDIZATION_OVERVIEW.md](./INTEGRATION_STANDARDIZATION_OVERVIEW.md)

---

### Q: Do I need to migrate immediately?

**A:** No. The standardization system can coexist with legacy code. You can migrate:
- One system at a time (database first, then coordination, etc.)
- One module at a time
- One team at a time

**Migration Timeline:** 10-18 days for complete migration (see [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md))

---

### Q: What are the performance implications?

**A:** Standardized system is typically **faster** than ad-hoc implementations:

| Operation | Before | After | Change |
|-----------|--------|-------|--------|
| Query (no cache) | 50-100ms | 45-95ms | -5% |
| Query (cache hit) | N/A | <1ms | 50-100x faster |
| Coordination signal | 50-200ms | 10-50ms | 4-5x faster |
| Transaction commit | manual (error-prone) | 30-50ms | reliable |

**Key insight:** Caching more than compensates for abstraction overhead.

---

### Q: Is there vendor lock-in?

**A:** No. The system uses:
- **Standard databases**: SQLite or PostgreSQL (not proprietary)
- **Standard caching**: Redis (open source)
- **Standard protocols**: JSON over HTTP/Redis
- **No external APIs**: Everything self-hosted

You can migrate away anytime by extracting data as JSON.

---

## Database Questions

### Q: Why do I need to register schemas?

**A:** Schemas enable:
1. **Validation**: Prevent invalid data (wrong types, out-of-range values)
2. **Performance**: Tell optimizer which fields are indexed
3. **Documentation**: Schema is self-documenting API contract
4. **Migration**: Clear transformation rules when changing schemas

**Example:**
```typescript
// Without schema: garbage in, garbage out
const data = {confidence: "not a number"};  // No error!

// With schema: validation prevents errors
const schema = {fields: [{name: "confidence", type: "number", min: 0, max: 1}]};
await databaseService.query({...});  // Validates before insert
```

---

### Q: How long are query results cached?

**A:** Configurable per query:
- **Default**: 1 hour (3600 seconds)
- **Short-lived**: 5 minutes (300 seconds) for frequently changing data
- **Long-lived**: 24 hours (86400 seconds) for rarely changing data
- **No cache**: 0 seconds for real-time data

**Example:**
```typescript
await databaseService.query({
  operation: "select",
  table: "agents",
  filters: {status: "completed"},
  options: {
    cache_ttl_seconds: 300  // Cache for 5 minutes
  }
});
```

---

### Q: What if I need to disable caching?

**A:** Set `cache_ttl_seconds: 0`:

```typescript
await databaseService.query({
  // ... query parameters ...
  options: {
    cache_ttl_seconds: 0  // No caching
  }
});
```

**Caution**: Disabling cache may impact performance for high-frequency queries.

---

### Q: Can I query across multiple databases?

**A:** Yes, via schema mapping:

```typescript
const result = await databaseService.executeSchemaMapping({
  source_database: "primary",
  target_database: "cache",
  schema: "agents",
  filters: {status: "completed"}
});
```

This automatically:
1. Queries source database
2. Maps fields according to schema
3. Queries target database
4. Merges results
5. Returns unified dataset

---

### Q: What happens when database connection fails?

**A:** Automatic retry with exponential backoff:
1. Attempt 1: Immediate
2. Attempt 2: Wait 1 second, retry
3. Attempt 3: Wait 2 seconds, retry
4. Attempt 4: Wait 4 seconds, retry
5. Attempt 5: Wait 8 seconds, retry
6. Max retries: 3 (configurable)

If all retries fail, operation returns error with `retry_after_seconds` hint.

---

### Q: Can I use existing database with standardized system?

**A:** Yes! Migration path:
1. Keep existing database as-is
2. Register schema matching existing structure
3. Use DatabaseService for new queries
4. Gradually migrate old queries to new API
5. No downtime required

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) for detailed process.

---

## Coordination Questions

### Q: How do agents know when to proceed?

**A:** Via signals published to Redis topics:

```typescript
// Agent 1: Wait for Agent 2
await coordinationManager.wait({
  agent_id: "agent-1",
  topic: "swarm:task-001:agent-2:ready"
});

// Agent 2: Signal readiness
await coordinationManager.broadcastSignal({
  topic: "swarm:task-001:agent-2:ready",
  agents: ["agent-1"],
  message: {status: "ready"}
});
```

Maximum wait time: 5 minutes (configurable). After timeout, agent automatically proceeds or fails.

---

### Q: What happens if an agent crashes during coordination?

**A:** Orchestrator detects crash and:
1. Detects process death within 30 seconds
2. Marks agent as failed
3. Wakes waiting agents with timeout
4. Allows waiting agents to retry or proceed
5. Logs incident with correlation key

---

### Q: Can I have consensus from multiple agents?

**A:** Yes, via consensus collection:

```typescript
const consensus = await coordinationManager.collectConsensus({
  task_id: "task-001",
  validator_ids: ["validator-1", "validator-2", "validator-3"],
  consensus_type: "threshold",
  threshold: 0.90  // 90% agreement required
});

if (consensus.status === "passed") {
  // Consensus reached!
  console.log(`Average confidence: ${consensus.average_confidence}`);
}
```

---

### Q: What's the maximum number of agents?

**A:** Redis Pub/Sub can handle:
- **100s of agents**: No problem
- **1000s of agents**: Fine with proper Redis scaling
- **10000s of agents**: May need Redis cluster

For 100+ agents, ensure Redis memory configured:
```bash
redis-cli CONFIG SET maxmemory 4gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

---

## Artifact Storage Questions

### Q: How do I store artifacts?

**A:**
```typescript
const response = await artifactStorage.storeArtifact({
  correlation_key: "op-123:iter-1:1731752400000",
  artifact_name: "analysis-report",
  artifact_type: "document",
  content: "# Analysis Report\n...",
  format: "markdown",
  metadata: {
    created_by: "agent-123",
    tags: ["important"]
  }
});

console.log(response.artifact_info.version);  // Version number
```

---

### Q: How do I retrieve a specific version?

**A:**
```typescript
// Get latest version
const artifact = await artifactStorage.retrieveArtifact({
  artifact_name: "analysis-report",
  version: "latest"
});

// Get specific version (e.g., version 2)
const artifact = await artifactStorage.retrieveArtifact({
  artifact_name: "analysis-report",
  version: 2
});
```

---

### Q: Can I see what changed between versions?

**A:** Yes, get version diff:

```typescript
const diff = await artifactStorage.getVersionDiff(
  "analysis-report",
  1,  // from version
  2   // to version
);

console.log(diff.diff_content);  // Unified diff
console.log(diff.added_lines);   // Count of additions
console.log(diff.removed_lines); // Count of deletions
```

---

### Q: How long are artifacts stored?

**A:**
- **Active versions**: 90 days from creation
- **Archived versions**: Permanent (moved to cheaper storage)
- **Deleted artifacts**: 7-day recovery period before permanent deletion

---

### Q: Can I limit artifact storage size?

**A:** Set storage quota:
```bash
# Configure max storage
echo "max_artifacts_gb=100" > config/storage.conf

# Monitor current usage
du -sh /artifacts
```

When quota is exceeded:
1. Attempt to archive old versions
2. If that's insufficient, return `STORAGE_FULL` error
3. Clean up manually or expand storage

---

## Transaction Questions

### Q: When should I use transactions?

**A:** Use transactions when:
- **Multiple writes** across one or more databases
- **Atomicity required**: All updates must succeed or all fail
- **Consistency critical**: No partial states visible

**Example:**
```typescript
// Atomic: both updates succeed or both fail
const txn = await transactionManager.beginTransaction({
  transaction_type: "write",
  databases: ["primary", "cache"]
});

await txn.query({operation: "update", table: "agents", ...});
await txn.query({operation: "update", table: "tasks", ...});

await txn.commit();  // Atomic!
```

---

### Q: What happens if a transaction times out?

**A:** Automatic rollback:
1. Transaction exceeds timeout (default: 60 seconds)
2. System automatically rolls back all changes
3. Operation fails with `TRANSACTION_TIMEOUT` error
4. Caller can retry

**Configure timeout:**
```typescript
const txn = await transactionManager.beginTransaction({
  timeout_seconds: 300  // 5 minutes
});
```

---

### Q: How do I handle write-write conflicts?

**A:** Savepoints enable retry logic:

```typescript
const txn = await transactionManager.beginTransaction({...});

const sp = await txn.createSavepoint("before_update");

try {
  await txn.query({operation: "update", ...});
  await txn.commit();
} catch (e) {
  if (e.code === "CONFLICT_DETECTED") {
    // Rollback to savepoint
    await txn.rollbackToSavepoint("before_update");
    // Retry with different approach
  }
}
```

---

### Q: What's the difference between rollback() and rollbackToSavepoint()?

**A:**
- `rollback()`: Undo all operations in transaction, back to start
- `rollbackToSavepoint(sp)`: Undo operations after savepoint sp

**Example:**
```typescript
const txn = ...

await txn.query({operation: "op1", ...});  // Step 1
const sp = await txn.createSavepoint("after_op1");

await txn.query({operation: "op2", ...});  // Step 2 fails

await txn.rollbackToSavepoint("after_op1");  // Undo only op2
// Now op1 is committed, op2 is undone

await txn.query({operation: "op2_retry", ...});  // Retry step 2
await txn.commit();  // Commit both
```

---

## Performance Questions

### Q: Why is my query slow?

**A:** Diagnosis checklist:

1. **Check cache status**:
   ```json
   {
     "metadata": {
       "from_cache": false  // Not cached?
     }
   }
   ```
   → Enable caching

2. **Check for full table scan**:
   ```sql
   EXPLAIN QUERY PLAN SELECT * FROM agents WHERE status = 'completed';
   ```
   → Missing index?

3. **Check for timeout**:
   ```json
   {
     "error": {
       "code": "QUERY_TIMEOUT"
     }
   }
   ```
   → Increase timeout or optimize query

See [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md) for detailed debugging.

---

### Q: How can I monitor query performance?

**A:** Enable query profiling:

```typescript
// Check execution metadata
const result = await databaseService.query({...});
console.log(result.metadata.execution_time_ms);  // Actual duration
console.log(result.metadata.from_cache);        // From cache?
```

Aggregate across operations:
```bash
# Get average query time
sqlite3 /data/primary.db "SELECT AVG(duration_ms) FROM query_log WHERE operation='select'"
```

---

### Q: Should I cache everything?

**A:** No. Cache strategically:

**Cache (TTL: 1 hour):**
- Agent statuses (slow to compute)
- Schema definitions (rarely change)
- System metrics (aggregate data)

**Don't cache:**
- Real-time sensor data
- User preferences (change frequently)
- Session data (cache ttl: session duration)

---

### Q: How much memory does caching use?

**A:** Depends on:
- **Number of queries**: 1000s of queries = 10-50MB
- **Result size**: Large result sets use more memory
- **TTL**: Longer TTL = more accumulated data

Monitor Redis:
```bash
redis-cli INFO memory
# Used memory: 50MB? 500MB? 5GB?
```

---

## Migration Questions

### Q: How do I migrate without downtime?

**A:** Canary deployment:

1. Start new system alongside old (both running)
2. Route 10% traffic to new system
3. Monitor for errors (1 hour)
4. If healthy, increase to 50% traffic
5. If still healthy, cutover to 100% new system

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) section "Canary Deployment".

---

### Q: Can I rollback if migration fails?

**A:** Yes. Maintain old system for 2 weeks:

```bash
# If new system has issues
systemctl stop cfn-new-system
systemctl start cfn-old-system

# Old system takes over
```

After 2 weeks of stable operation, safe to decommission old system.

---

### Q: What about data consistency during migration?

**A:** Use write-through caching:
1. All writes go to **both** old and new system
2. Reads come from new system (if available) else old system
3. After migration complete, decommission old system
4. No data loss, no downtime

---

## Troubleshooting Questions

### Q: How do I debug an operation?

**A:** Use correlation key:

```bash
# Query logs for all events related to this operation
correlation_key="query-001:iter-1:1731752400000"
grep "$correlation_key" /var/log/cfn/*.log

# Find timing issues
grep "$correlation_key" /var/log/cfn/*.log | grep -E "started|completed"

# Find errors
grep "$correlation_key" /var/log/cfn/error.log
```

---

### Q: My Redis is running out of memory. What do I do?

**A:**

1. **Check what's using memory**:
   ```bash
   redis-cli INFO memory
   redis-cli DBSIZE
   ```

2. **Clear old cache entries**:
   ```bash
   redis-cli FLUSHDB  # ⚠ Clears all data
   ```

3. **Implement TTL policy**:
   ```bash
   redis-cli CONFIG SET maxmemory-policy allkeys-lru
   redis-cli CONFIG SET maxmemory 4gb
   ```

See [TROUBLESHOOTING_GUIDE.md](./TROUBLESHOOTING_GUIDE.md) "Redis Out of Memory" section.

---

### Q: Database integrity check is failing. What's wrong?

**A:** Database may be corrupted:

```bash
# Run integrity check
sqlite3 /data/primary.db "PRAGMA integrity_check;"

# If failed, try repair
sqlite3 /data/primary.db "PRAGMA integrity_check(QUICK);"

# If still failed, restore from backup
bash ./recover-from-backup.sh /backups/latest-backup/
```

---

## Architecture Questions

### Q: Why dual-layer persistence (Redis + SQLite)?

**A:** Different needs:
- **Redis** (L1): Fast transient data (query cache, coordination signals)
- **SQLite/PostgreSQL** (L2): Durable persistent data (logs, schemas, transactions)

**Benefits:**
- Query caching 50-100x faster
- No unnecessary disk writes
- Automatic signal expiration
- Optimal cost/performance tradeoff

See ADR-001 in [ARCHITECTURE_DECISION_RECORDS.md](./ARCHITECTURE_DECISION_RECORDS.md).

---

### Q: Why correlation keys?

**A:** For complete operation tracing:
- Follow single ID across all systems
- MTTR (Mean Time To Recovery) reduced by 70%
- Complete audit trail for compliance
- Conflict detection in transactions

See ADR-002 in [ARCHITECTURE_DECISION_RECORDS.md](./ARCHITECTURE_DECISION_RECORDS.md).

---

### Q: Can I customize the system?

**A:** Yes:
1. **Extend APIs**: Subclass DatabaseService, etc.
2. **Add skills**: Create new .sh files with frontmatter
3. **Custom protocols**: Add new coordination topics
4. **Custom schemas**: Register domain-specific schemas

See documentation for each component.

---

## Operational Questions

### Q: How do I deploy a new skill?

**A:**
```bash
#!/bin/bash
# Create skill file
cat > analyze-custom.sh << 'EOF'
#!/bin/bash
# SKILL_NAME: "analyze-custom"
# SKILL_VERSION: "1.0"
# OUTPUT_FORMAT: "json"

echo '{"status": "success", "result": {}}'
EOF

# Deploy
bash ./deploy-skill.sh analyze-custom.sh
```

See [OPERATIONAL_RUNBOOKS.md](./OPERATIONAL_RUNBOOKS.md) "Skill Deployment" section.

---

### Q: How often should I backup?

**A:** Recommended schedule:
- **Daily backup**: Every night (7-day retention)
- **Weekly backup**: Every Sunday (30-day retention)
- **Monthly backup**: First of month (1-year retention)

Configure in cron:
```bash
0 2 * * * bash /scripts/daily-backup.sh      # Daily
0 3 * * 0 bash /scripts/weekly-backup.sh     # Weekly Sunday
0 4 1 * * bash /scripts/monthly-backup.sh    # Monthly 1st
```

---

### Q: How do I monitor system health?

**A:** Use health check script:
```bash
# Run every hour
0 * * * * bash /scripts/hourly-health-check.sh

# Monitor key metrics
watch -n 5 'curl -s http://localhost:8000/metrics'

# Check logs
tail -f /var/log/cfn/error.log
```

---

---

**Document Reference:** INTEGRATION_FAQ.md
**Maintained By:** API Documentation Specialist
**Last Reviewed:** 2025-11-16
