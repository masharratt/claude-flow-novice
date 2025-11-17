# Troubleshooting Guide

**Version:** 1.0
**Last Updated:** 2025-11-16
**Status:** Complete

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Database Issues](#database-issues)
3. [Coordination Issues](#coordination-issues)
4. [Artifact Storage Issues](#artifact-storage-issues)
5. [Transaction Issues](#transaction-issues)
6. [Skill Execution Issues](#skill-execution-issues)
7. [Performance Issues](#performance-issues)
8. [Known Issues](#known-issues)
9. [Diagnostic Commands](#diagnostic-commands)
10. [Support Escalation](#support-escalation)

---

## Quick Diagnostics

### Health Check Script

Run this script to perform comprehensive system health checks:

```bash
#!/bin/bash
set -euo pipefail

echo "=== System Health Check ==="

# Check Redis
echo -n "Redis: "
redis-cli ping > /dev/null 2>&1 && echo "OK" || echo "FAILED"

# Check SQLite
echo -n "SQLite: "
sqlite3 /data/primary.db "SELECT 1" > /dev/null 2>&1 && echo "OK" || echo "FAILED"

# Check File System
echo -n "Artifact Storage: "
[ -w /artifacts ] && echo "OK" || echo "FAILED (no write permission)"

# Check Coordination Manager
echo -n "Coordination Manager: "
curl -s http://localhost:8000/health > /dev/null 2>&1 && echo "OK" || echo "FAILED"

# Check Database Service
echo -n "Database Service: "
curl -s http://localhost:8001/health > /dev/null 2>&1 && echo "OK" || echo "FAILED"

echo ""
echo "=== Service Status ==="
ps aux | grep -E "redis|sqlite|coordin|database" | grep -v grep
```

### Quick Symptom Check

| Symptom | Likely Cause | Next Step |
|---------|-------------|-----------|
| "REDIS_UNAVAILABLE" errors | Redis not running or unreachable | Check Redis section |
| "QUERY_TIMEOUT" errors | Database slow or unresponsive | Check Database section |
| "TIMEOUT" on coordination | Agents not responding | Check Coordination section |
| "ARTIFACT_NOT_FOUND" | Wrong artifact name or missing | Check Artifact Storage section |
| "SCHEMA_NOT_FOUND" | Schema not registered | See Database Issues > Schema Problems |
| Slow performance generally | Cache misses or inefficient queries | Check Performance section |

---

## Database Issues

### Problem: QUERY_TIMEOUT

**Error:** `Query exceeded 30 second timeout`

**Root Causes:**
1. Database is overloaded
2. Missing query indexes
3. Large result set (millions of rows)
4. Network latency spike

**Diagnosis Steps:**

```bash
# Check database responsiveness
time sqlite3 /data/primary.db "SELECT COUNT(*) FROM agents"

# Check for long-running queries
sqlite3 /data/primary.db "SELECT name FROM sqlite_master WHERE type='table'"

# Check table size
sqlite3 /data/primary.db "SELECT name, page_count * 4096 as size FROM pragma_page_count, sqlite_master WHERE type='table'"
```

**Solutions:**

1. **Increase timeout** (if acceptable):
   ```json
   {
     "options": {
       "timeout_seconds": 60
     }
   }
   ```

2. **Optimize query**:
   - Add filters to reduce result set
   - Limit fields with `SELECT specific_fields`
   - Use pagination for large datasets

3. **Create indexes**:
   ```sql
   CREATE INDEX idx_agents_status ON agents(status);
   CREATE INDEX idx_agents_confidence ON agents(confidence);
   ```

4. **Scale database**:
   - Move to PostgreSQL for better concurrency
   - Implement read replicas
   - Add connection pooling

---

### Problem: SCHEMA_NOT_FOUND

**Error:** `Requested schema not found`

**Root Causes:**
1. Schema not registered yet
2. Schema name misspelled
3. Schema cache expired

**Diagnosis Steps:**

```bash
# List registered schemas
sqlite3 /data/primary.db "SELECT schema_id, schema_version FROM schemas"

# Check cache in Redis
redis-cli KEYS "*schema*"

# Check schema definition file
grep -r "schema_id" ./src/schemas/
```

**Solutions:**

1. **Register the schema**:
   ```typescript
   await databaseService.registerSchema({
     schema_id: "cfn-agents-v1",
     schema_version: 1,
     source_database: "primary",
     fields: [...]
   });
   ```

2. **Verify schema spelling**:
   ```typescript
   // Check what schemas exist
   const schemas = await databaseService.listSchemas();
   console.log(schemas);
   ```

3. **Clear schema cache** (if stale):
   ```bash
   redis-cli DEL "*schema-cfn-agents*"
   ```

---

### Problem: SCHEMA_VALIDATION_FAILED

**Error:** `Field 'confidence' must be number 0-1`

**Root Causes:**
1. Wrong data type (string instead of number)
2. Value out of range
3. Missing required field

**Diagnosis Steps:**

```typescript
// Check schema definition
const schema = await databaseService.getSchema("cfn-agents-v1");
console.log(schema.fields.find(f => f.name === "confidence"));

// Inspect problematic data
const result = await databaseService.query({
  operation: "select",
  table: "agents",
  fields: ["id", "confidence"],
  filters: { confidence: { $or: [{ $lt: 0 }, { $gt: 1 }] } }
});
```

**Solutions:**

1. **Type convert before insert**:
   ```typescript
   const confidence = Number(rawValue);
   if (confidence < 0 || confidence > 1) {
     throw new Error("Confidence must be 0-1");
   }
   ```

2. **Update schema if range is wrong**:
   ```typescript
   // Re-register with correct range
   await databaseService.registerSchema({
     ...oldSchema,
     fields: oldSchema.fields.map(f =>
       f.name === "confidence" ? {...f, min: 0, max: 100} : f
     )
   });
   ```

3. **Fix invalid data**:
   ```sql
   UPDATE agents SET confidence = ROUND(confidence, 2)
   WHERE confidence > 1;
   UPDATE agents SET confidence = 0 WHERE confidence < 0;
   ```

---

### Problem: DATABASE_UNAVAILABLE

**Error:** `Cannot establish database connection`

**Root Causes:**
1. Database service not running
2. Connection string wrong
3. Credentials incorrect
4. Network connectivity issue

**Diagnosis Steps:**

```bash
# Check database service status
systemctl status postgresql  # or sqlite if local

# Check connection string
echo $DATABASE_URL
sqlite3 /data/primary.db "SELECT 1"  # Test SQLite
psql -c "SELECT 1"  # Test PostgreSQL

# Check network connectivity
nc -zv localhost 5432  # PostgreSQL port
telnet localhost 5432
```

**Solutions:**

1. **Start database service**:
   ```bash
   systemctl start postgresql
   # or for SQLite, ensure file exists
   touch /data/primary.db
   ```

2. **Fix connection string**:
   ```bash
   export DATABASE_URL="sqlite:////data/primary.db"  # Note: 4 slashes for absolute path
   # or
   export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"
   ```

3. **Check credentials**:
   ```bash
   # PostgreSQL
   psql -U username -d dbname -c "SELECT 1"
   ```

---

## Coordination Issues

### Problem: TIMEOUT on wait()

**Error:** `Agent waited 300 seconds without receiving signal`

**Root Causes:**
1. Broadcasting agent crashed
2. Signal never published
3. Agent ID mismatch
4. Topic subscription issue

**Diagnosis Steps:**

```bash
# Monitor Redis Pub/Sub
redis-cli SUBSCRIBE "swarm:*"

# Check agent process
ps aux | grep agent-123

# Check Redis connectivity
redis-cli PING

# Monitor published messages
redis-cli PUBSUB CHANNELS "swarm:*"
```

**Solutions:**

1. **Increase wait timeout** (if coordinating processes are slow):
   ```typescript
   await coordinationManager.wait({
     agent_id: "agent-123",
     topic: "swarm:task-001:gate:passed",
     timeout_seconds: 600  // 10 minutes
   });
   ```

2. **Ensure signal is being published**:
   ```typescript
   const result = await coordinationManager.broadcastSignal({
     signal_type: "broadcast",
     topic: "swarm:task-001:gate:passed",
     agents: ["agent-123"],
     message: { status: "gate_passed" }
   });
   console.log(result.delivered_to); // Verify delivery
   ```

3. **Check agent is alive**:
   ```bash
   # Restart stuck agent
   pkill -f agent-123
   # Let coordinator respawn it
   ```

4. **Clear stale subscriptions**:
   ```bash
   redis-cli FLUSHDB  # WARNING: Clears all Redis data
   ```

---

### Problem: EMPTY_AGENT_LIST

**Error:** `No agents specified in broadcast`

**Root Causes:**
1. Agent array is empty
2. Agent filtering removed all agents
3. Bug in agent collection logic

**Diagnosis Steps:**

```typescript
// Check agent list
const agents = await coordinationManager.listActiveAgents();
console.log(agents); // Should not be empty

// Check filtering logic
const filtered = agents.filter(a => a.status === "running");
console.log(filtered); // Ensure at least one agent
```

**Solutions:**

1. **Populate agent list before broadcasting**:
   ```typescript
   const agents = await coordinationManager.listActiveAgents();
   if (agents.length === 0) {
     throw new Error("No agents available for broadcast");
   }

   await coordinationManager.broadcastSignal({
     agents,
     // ...
   });
   ```

2. **Verify agent registration**:
   ```typescript
   await coordinationManager.registerAgent({
     agent_id: "agent-123",
     agent_type: "backend-developer",
     process_id: 12345
   });
   ```

---

### Problem: REDIS_UNAVAILABLE

**Error:** `Redis not available`

**Root Causes:**
1. Redis not running
2. Redis connection string wrong
3. Redis memory exhausted
4. Network connectivity issue

**Diagnosis Steps:**

```bash
# Check Redis status
redis-cli ping

# Check memory usage
redis-cli INFO memory

# Check Redis logs
tail -f /var/log/redis/redis-server.log

# Check network
telnet localhost 6379
```

**Solutions:**

1. **Start Redis**:
   ```bash
   systemctl start redis-server
   # or
   redis-server --daemonize yes
   ```

2. **Fix connection string**:
   ```bash
   export REDIS_URL="redis://localhost:6379"
   ```

3. **Clear Redis memory** (if exhausted):
   ```bash
   redis-cli FLUSHDB
   redis-cli DBSIZE
   ```

4. **Increase Redis memory**:
   ```
   # In redis.conf
   maxmemory 2gb
   maxmemory-policy allkeys-lru
   ```

---

## Artifact Storage Issues

### Problem: ARTIFACT_NOT_FOUND

**Error:** `Artifact 'analysis-report' not found`

**Root Causes:**
1. Wrong artifact name
2. Artifact never created
3. Artifact deleted
4. Wrong storage location

**Diagnosis Steps:**

```bash
# List all artifacts
ls -la /artifacts/

# Check artifact metadata
sqlite3 /data/primary.db "SELECT * FROM artifacts WHERE name='analysis-report'"

# Search for similar names
find /artifacts -name "*analysis*"
```

**Solutions:**

1. **Check artifact name**:
   ```typescript
   // List available artifacts
   const artifacts = await artifactStorage.listArtifacts();
   console.log(artifacts);
   ```

2. **Create artifact if missing**:
   ```typescript
   await artifactStorage.storeArtifact({
     correlation_key: "op-123:iter-1:1731752400000",
     artifact_name: "analysis-report",
     artifact_type: "document",
     content: "# Analysis Report",
     format: "markdown"
   });
   ```

3. **Check storage location**:
   ```bash
   # Verify /artifacts directory exists and is writable
   mkdir -p /artifacts
   chmod 755 /artifacts
   ```

---

### Problem: STORAGE_FULL

**Error:** `Storage quota exceeded`

**Root Causes:**
1. Disk full
2. Storage quota exhausted
3. Too many artifact versions

**Diagnosis Steps:**

```bash
# Check disk usage
df -h /artifacts
du -sh /artifacts

# Check artifact versions
sqlite3 /data/primary.db "SELECT name, COUNT(*) as versions FROM artifact_versions GROUP BY name ORDER BY versions DESC"

# Find large artifacts
find /artifacts -type f -size +100M
```

**Solutions:**

1. **Clean up old versions**:
   ```bash
   # Keep only last 5 versions of each artifact
   sqlite3 /data/primary.db "
   DELETE FROM artifact_versions
   WHERE version < (SELECT MAX(version) - 5 FROM artifact_versions ava WHERE ava.name = artifact_versions.name)
   "
   ```

2. **Remove large artifacts**:
   ```bash
   # Archive or delete unneeded artifacts
   rm /artifacts/large-artifact/*
   ```

3. **Expand storage**:
   ```bash
   # Mount new storage
   mount /dev/sdb1 /artifacts
   # or increase partition size
   ```

---

## Transaction Issues

### Problem: CONFLICT_DETECTED

**Error:** `Write-write conflict detected`

**Root Causes:**
1. Two transactions updating same record
2. Concurrent modifications to shared state
3. Missing locking

**Diagnosis Steps:**

```typescript
// Check transaction isolation level
const txn = await transactionManager.beginTransaction({
  isolation_level: "repeatable_read"
});

// Monitor transaction log
sqlite3 /data/primary.db "SELECT * FROM transaction_log WHERE status='conflict'"
```

**Solutions:**

1. **Retry transaction** (automatic with backoff):
   ```typescript
   let attempts = 0;
   while (attempts < 3) {
     try {
       const txn = await transactionManager.beginTransaction({...});
       await txn.query({...});
       await txn.commit();
       break;
     } catch (e) {
       if (e.code === "CONFLICT_DETECTED") {
         attempts++;
         await new Promise(r => setTimeout(r, 1000 * attempts));
       } else throw e;
     }
   }
   ```

2. **Use savepoints to isolate operations**:
   ```typescript
   const txn = await transactionManager.beginTransaction({...});

   const sp1 = await txn.createSavepoint("before_update");
   await txn.query({operation: "update", ...});

   try {
     await txn.commit();
   } catch (e) {
     await txn.rollbackToSavepoint("before_update");
     // Handle and retry
   }
   ```

3. **Increase isolation level**:
   ```typescript
   const txn = await transactionManager.beginTransaction({
     isolation_level: "serializable"  // Strongest isolation
   });
   ```

---

### Problem: TRANSACTION_TIMEOUT

**Error:** `Transaction exceeded 60 second timeout`

**Root Causes:**
1. Long-running operations
2. Database slow
3. Timeout too aggressive

**Diagnosis Steps:**

```typescript
// Profile transaction operations
const startTime = Date.now();
const txn = await transactionManager.beginTransaction({...});

for (const op of operations) {
  const opStart = Date.now();
  await txn.query(op);
  console.log(`Operation took ${Date.now() - opStart}ms`);
}

console.log(`Total: ${Date.now() - startTime}ms`);
```

**Solutions:**

1. **Increase transaction timeout**:
   ```typescript
   const txn = await transactionManager.beginTransaction({
     timeout_seconds: 300  // 5 minutes
   });
   ```

2. **Optimize operations**:
   ```typescript
   // Use batch operations instead of individual updates
   await txn.query({
     operation: "update",
     table: "agents",
     filters: { status: "running" },  // Update multiple rows in one operation
     values: { status: "completed" }
   });
   ```

3. **Break into smaller transactions**:
   ```typescript
   // Instead of one big transaction
   for (const batch of getBatches(1000)) {
     const txn = await transactionManager.beginTransaction({...});
     await txn.query({...});
     await txn.commit();
   }
   ```

---

## Skill Execution Issues

### Problem: SKILL_NOT_FOUND

**Error:** `Skill 'analyze-database' not found`

**Root Causes:**
1. Skill name misspelled
2. Skill file not in skill directory
3. Skill deployment not reloaded

**Diagnosis Steps:**

```bash
# List available skills
ls -la .claude/skills/cfn-*/

# Search for skill
find . -name "*analyze-database*" -type f

# Check skill directory structure
tree .claude/skills/ | head -30
```

**Solutions:**

1. **Verify skill exists**:
   ```typescript
   const skills = await skillDeployment.listSkills();
   console.log(skills.map(s => s.name));
   ```

2. **Create missing skill**:
   ```bash
   cat > .claude/skills/cfn-analyze-database/SKILL.sh << 'EOF'
   #!/bin/bash
   # SKILL_NAME: "analyze-database"
   # SKILL_VERSION: "1.0"

   # Implementation
   EOF
   chmod +x .claude/skills/cfn-analyze-database/SKILL.sh
   ```

3. **Reload skill registry**:
   ```typescript
   await skillDeployment.reloadSkills();
   ```

---

### Problem: EXECUTION_TIMEOUT

**Error:** `Skill exceeded 60 second timeout`

**Root Causes:**
1. Skill is slow (network I/O, computation)
2. Skill is stuck in infinite loop
3. Skill is waiting for I/O

**Diagnosis Steps:**

```bash
# Check skill execution time manually
time /path/to/skill.sh

# Check for infinite loops
grep -n "while true\|for.*in.*;" .claude/skills/cfn-analyze-database/SKILL.sh

# Monitor process during execution
watch -n 1 'ps aux | grep skill'
```

**Solutions:**

1. **Increase timeout**:
   ```typescript
   await skillDeployment.executeSkill({
     skill_name: "analyze-database",
     timeout_seconds: 300  // 5 minutes
   });
   ```

2. **Optimize skill**:
   - Remove unnecessary loops
   - Cache expensive lookups
   - Use parallelism with `&` and `wait`

3. **Add progress indicators**:
   ```bash
   # In skill
   for i in {1..1000}; do
     [ $((i % 100)) -eq 0 ] && echo "Progress: $i/1000" >&2
     # Process item
   done
   ```

---

### Problem: INVALID_JSON_OUTPUT

**Error:** `Skill output is not valid JSON`

**Root Causes:**
1. Skill outputs non-JSON text
2. JSON is malformed
3. Skill crashes before producing output

**Diagnosis Steps:**

```bash
# Test skill output manually
.claude/skills/cfn-analyze-database/SKILL.sh | jq .

# Check if output is redirected to stderr
.claude/skills/cfn-analyze-database/SKILL.sh 2>&1 | jq .

# Validate JSON
echo "$OUTPUT" | jq empty && echo "Valid JSON" || echo "Invalid JSON"
```

**Solutions:**

1. **Ensure JSON output**:
   ```bash
   #!/bin/bash
   # SKILL_OUTPUT_FORMAT: "json"

   set -euo pipefail

   # ... processing ...

   # Always output valid JSON
   cat <<EOF
   {
     "status": "success",
     "result": { "metrics": {...} }
   }
   EOF
   ```

2. **Debug skill output**:
   ```bash
   # Run with debugging
   bash -x .claude/skills/cfn-analyze-database/SKILL.sh 2>&1 | tail -50
   ```

3. **Escape output**:
   ```bash
   # If output contains special characters
   jq -n --arg result "$(command)" '{result: $result}'
   ```

---

## Performance Issues

### Problem: Slow Queries

**Symptoms:** Queries take 5+ seconds

**Root Causes:**
1. Missing indexes
2. Full table scans
3. Large result sets
4. Network latency

**Solutions:**

```bash
# Create missing indexes
sqlite3 /data/primary.db "
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_iteration ON agents(iteration);
CREATE INDEX idx_agents_created_at ON agents(created_at);
"

# Analyze query performance
.explain QUERY PLAN
SELECT * FROM agents WHERE status = 'completed' AND iteration = 1;

# Use LIMIT for large result sets
SELECT * FROM agents LIMIT 1000 OFFSET 0;

# Consider materialized views for frequent queries
CREATE TABLE agents_summary AS
SELECT status, COUNT(*) as count, AVG(confidence) as avg_confidence
FROM agents
GROUP BY status;
```

---

### Problem: High Memory Usage

**Symptoms:** Application uses too much RAM

**Root Causes:**
1. Large query results cached in memory
2. Redis memory exhausted
3. Memory leaks in agent processes

**Solutions:**

```bash
# Check top memory consumers
ps aux --sort=-%mem | head -10

# Limit result set size
SELECT * FROM agents LIMIT 10000;  # Don't fetch all

# Reduce cache TTL
{
  "options": {
    "cache_ttl_seconds": 60  # Was 3600
  }
}

# Monitor Redis memory
redis-cli INFO memory
redis-cli CONFIG SET maxmemory 1gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

---

### Problem: High CPU Usage

**Symptoms:** CPU at 100%

**Root Causes:**
1. Inefficient query (full table scan)
2. Runaway skill process
3. Busy-wait loop

**Solutions:**

```bash
# Identify top CPU consumer
top -b -n 1 | head -20

# Kill runaway process
pkill -f skill-name

# Optimize queries to use indexes
EXPLAIN QUERY PLAN SELECT * FROM agents WHERE status = 'completed';
```

---

## Known Issues

### Issue 1: Redis Connection Pool Exhaustion

**Affects:** Coordination under high load (100+ concurrent agents)

**Symptoms:**
- "Connection pool exhausted" errors
- Coordination timeouts
- Memory growth

**Workaround:**
```bash
# Increase Redis max connections
redis-cli CONFIG SET maxclients 50000
```

**Fix Status:** Fixed in v1.1 (auto-scaling connection pool)

---

### Issue 2: SQLite Write Contention

**Affects:** High-concurrency writes (10+ simultaneous transactions)

**Symptoms:**
- "database is locked" errors
- Transaction conflicts
- Slow commits

**Workaround:**
```bash
# Migrate to PostgreSQL for better concurrency
export DATABASE_URL="postgresql://localhost/cfn"
```

**Fix Status:** Documented in MIGRATION_GUIDE.md

---

### Issue 3: Artifact Version Explosion

**Affects:** Long-running processes with frequent artifact updates

**Symptoms:**
- Disk space exhaustion
- Slow artifact retrieval
- High I/O

**Workaround:**
```sql
-- Run cleanup daily
DELETE FROM artifact_versions
WHERE created_at < datetime('now', '-30 days');
```

**Fix Status:** Auto-cleanup scheduled in v1.1

---

## Diagnostic Commands

### Database Diagnostics

```bash
# Check database integrity
sqlite3 /data/primary.db "PRAGMA integrity_check;"

# Analyze table statistics
sqlite3 /data/primary.db "ANALYZE;"

# Show query execution plan
sqlite3 /data/primary.db ".explain"
sqlite3 /data/primary.db "EXPLAIN QUERY PLAN SELECT ..."

# Dump schema
sqlite3 /data/primary.db ".schema"

# Get database size
du -h /data/primary.db

# Check write-ahead log
ls -lh /data/primary.db*
```

### Coordination Diagnostics

```bash
# Monitor Pub/Sub activity
redis-cli SUBSCRIBE "swarm:*"

# Check queue depth
redis-cli LLEN "swarm:task-001:queue"

# List all topics
redis-cli PUBSUB CHANNELS

# Monitor agent registrations
redis-cli HGETALL "agents:*"

# Check Redis memory
redis-cli INFO memory
redis-cli MEMORY STATS
```

### System Diagnostics

```bash
# Check disk usage
df -h
du -sh /artifacts /data

# Check process health
ps aux | grep -E "agent|coordinator|redis|sqlite"

# Monitor system resources
vmstat 1 5
iostat 1 5

# Check network connectivity
netstat -an | grep ESTABLISHED
```

---

## Support Escalation

### When to Contact Support

Contact the development team if:

1. **Issue persists after troubleshooting**
   - Include error logs
   - Include diagnostic command output
   - Include reproduction steps

2. **Suspected software bug**
   - Error occurs consistently
   - Not user-configuration related
   - Regression (worked before)

3. **Data corruption**
   - Database integrity check fails
   - Artifacts missing or corrupted
   - Logs show unexpected states

### Information to Include

```bash
# Collect diagnostic information
cat > diagnostics.txt << 'EOF'
=== System Info ===
$(uname -a)

=== Database Health ===
$(sqlite3 /data/primary.db "PRAGMA integrity_check;")

=== Redis Health ===
$(redis-cli PING)

=== Process Status ===
$(ps aux | grep -E "agent|coordinator|redis")

=== Error Logs ===
$(tail -100 /var/log/application.log)

=== Recent Errors ===
$(sqlite3 /data/primary.db "SELECT * FROM error_log ORDER BY created_at DESC LIMIT 20;")
EOF

# Upload for support
curl -F "file=@diagnostics.txt" https://support.example.com/upload
```

---

**Document Reference:** TROUBLESHOOTING_GUIDE.md
**Maintained By:** API Documentation Specialist
**Last Reviewed:** 2025-11-16
