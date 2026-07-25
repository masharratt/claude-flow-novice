# Migration Guide: Ad-Hoc to Standardized System

**Version:** 1.0
**Last Updated:** 2025-11-16
**Status:** Complete

## Table of Contents

1. [Migration Overview](#migration-overview)
2. [Before You Start](#before-you-start)
3. [Phase 1: Assessment](#phase-1-assessment)
4. [Phase 2: Database Migration](#phase-2-database-migration)
5. [Phase 3: Coordination Migration](#phase-3-coordination-migration)
6. [Phase 4: Artifact Migration](#phase-4-artifact-migration)
7. [Phase 5: Validation & Testing](#phase-5-validation--testing)
8. [Phase 6: Deployment](#phase-6-deployment)
9. [Rollback Procedures](#rollback-procedures)
10. [Migration Runbook](#migration-runbook)

---

## Migration Overview

### What's Changing

| Aspect | Before | After |
|--------|--------|-------|
| **Database Access** | Direct SQL queries | DatabaseService API |
| **Coordination** | Custom Redis logic | CoordinationManager API |
| **Artifact Storage** | File system only | Versioned artifact storage |
| **Transaction Management** | Manual, error-prone | TransactionManager with ACID |
| **Schema Management** | Implicit, no validation | Explicit schemas with validation |
| **Error Handling** | Inconsistent | Standardized error codes |
| **Monitoring** | Ad-hoc logging | Correlation-based tracing |

### Benefits of Migration

- **Type Safety**: Schema validation prevents data corruption
- **Reliability**: Automatic retry with exponential backoff
- **Observability**: Correlation keys enable complete tracing
- **Maintainability**: Standardized APIs reduce cognitive load
- **Scalability**: Connection pooling and caching improve performance
- **Recovery**: Transactional semantics enable rollback

### Migration Timeline

- **Phase 1 (Assessment)**: 1-2 days
- **Phase 2 (Database)**: 3-5 days
- **Phase 3 (Coordination)**: 2-3 days
- **Phase 4 (Artifacts)**: 1-2 days
- **Phase 5 (Validation)**: 2-3 days
- **Phase 6 (Deployment)**: 1-2 days
- **Total**: 10-18 days for complete migration

---

## Before You Start

### Prerequisites

1. **Backup existing systems**:
   ```bash
   # Backup databases
   sqlite3 /data/primary.db ".backup /backups/primary.db.backup"
   pg_dump -h localhost -U postgres dbname > /backups/postgres.sql

   # Backup artifact files
   tar -czf /backups/artifacts.tar.gz /artifacts/

   # Backup configuration
   cp -r /etc/cfn /backups/etc-cfn/
   ```

2. **Understand current architecture**:
   - Map all existing database schemas
   - Document all inter-service communication
   - List all artifacts and their purposes
   - Identify critical dependencies

3. **Prepare new infrastructure**:
   ```bash
   # Install standardized system
   npm install claude-flow-novice

   # Initialize databases
   npm run init:databases

   # Start services
   npm run start:database-service
   npm run start:coordination-manager
   npm run start:artifact-storage
   ```

4. **Assemble migration team**:
   - Database specialist (1 person)
   - System architect (1 person)
   - QA engineer (1 person)
   - DevOps engineer (1 person)

---

## Phase 1: Assessment

### Step 1a: Catalog Current Systems

```bash
#!/bin/bash

echo "=== Database Assessment ==="
# List all databases
ls -la /data/ /var/lib/postgresql/

# List all tables
sqlite3 /data/primary.db ".tables"
psql -l

# Count records
sqlite3 /data/primary.db "
SELECT name, COUNT(*) as records
FROM sqlite_master m
JOIN (SELECT 1) p
WHERE type='table'
GROUP BY name;
"

echo "=== Artifact Assessment ==="
# Count artifact files
find /artifacts -type f | wc -l

# List artifact types
file /artifacts/* | cut -d: -f2 | sort | uniq -c

echo "=== Coordination Assessment ==="
# Check Redis usage
redis-cli INFO keyspace
redis-cli DBSIZE

# List all channels
redis-cli PUBSUB CHANNELS
```

### Step 1b: Identify Integration Points

Create a spreadsheet documenting:

| System A | System B | Current Method | After Migration |
|----------|----------|-----------------|-----------------|
| Agent 1 | Database | Direct SQL | DatabaseService |
| Agent 2 | Redis | Custom client | CoordinationManager |
| Agent 3 | Files | Direct I/O | ArtifactStorage |

### Step 1c: Risk Assessment

For each system:
- **Data volume**: Will it fit in memory cache?
- **Complexity**: Are custom features needed?
- **Dependencies**: What's upstream/downstream?
- **Criticality**: How important is this system?
- **Rollback**: Can we revert if needed?

---

## Phase 2: Database Migration

### Step 2a: Schema Registration

Convert ad-hoc schemas to standard format:

**Before:**
```sql
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  status TEXT,
  confidence REAL,
  created_at TIMESTAMP
);
```

**After:**
```typescript
await databaseService.registerSchema({
  schema_id: "agents-v1",
  schema_version: 1,
  source_database: "primary",
  fields: [
    {
      name: "id",
      type: "string",
      required: true,
      description: "Unique agent identifier"
    },
    {
      name: "status",
      type: "enum",
      enum_values: ["spawned", "running", "completed", "failed"],
      required: true
    },
    {
      name: "confidence",
      type: "number",
      min: 0,
      max: 1,
      description: "Confidence score"
    },
    {
      name: "created_at",
      type: "datetime",
      required: true
    }
  ]
});
```

### Step 2b: Migrate Queries

**Before:**
```javascript
// Direct database access with error handling
try {
  const result = await db.query("SELECT * FROM agents WHERE status = ?", ["completed"]);
  return result.rows;
} catch (error) {
  logger.error("Query failed:", error);
  throw error;
}
```

**After:**
```typescript
const response = await databaseService.query({
  correlation_key: "migration-001:iter-1:1731752400000",
  operation: "select",
  table: "agents",
  schema: "agents-v1",
  filters: { status: "completed" },
  options: {
    cache_ttl_seconds: 300,
    timeout_seconds: 30
  }
});

if (response.status === "success") {
  return response.result.rows;
} else {
  // Standardized error handling
  logError(response.errors);
  throw new Error(response.errors[0].message);
}
```

### Step 2c: Validation Script

```javascript
// Validate query results match between old and new systems
async function validateQueryMigration() {
  // Query using old method
  const oldResult = await oldDatabase.query("SELECT * FROM agents");

  // Query using new method
  const newResult = await databaseService.query({
    operation: "select",
    table: "agents",
    schema: "agents-v1"
  });

  // Compare
  if (oldResult.length !== newResult.result.rows.length) {
    throw new Error("Row count mismatch");
  }

  for (let i = 0; i < oldResult.length; i++) {
    if (JSON.stringify(oldResult[i]) !== JSON.stringify(newResult.result.rows[i])) {
      throw new Error(`Row ${i} mismatch`);
    }
  }

  console.log("✓ Query migration validated");
}
```

---

## Phase 3: Coordination Migration

### Step 3a: Migrate Signal Publishing

**Before:**
```javascript
// Custom Redis publishing
const redis = require("redis").createClient();
redis.publish("agent-events", JSON.stringify({
  type: "completed",
  agent_id: "agent-123",
  confidence: 0.92
}));
```

**After:**
```typescript
await coordinationManager.broadcastSignal({
  signal_type: "broadcast",
  topic: "swarm:task-001:*:completed",
  agents: ["agent-123"],
  message: {
    operation: "report_completion",
    confidence: 0.92,
    status: "success"
  }
});
```

### Step 3b: Migrate Signal Subscriptions

**Before:**
```javascript
// Custom subscription with manual error handling
redis.subscribe("agent-events", (error, count) => {
  redis.on("message", (channel, message) => {
    const data = JSON.parse(message);
    handleAgentCompletion(data);
  });
});
```

**After:**
```typescript
const response = await coordinationManager.wait({
  agent_id: "agent-123",
  topic: "swarm:task-001:gate:passed",
  timeout_seconds: 300,
  callback: (signal) => {
    console.log("Gate passed!", signal);
  }
});
```

### Step 3c: Migrate Consensus Logic

**Before:**
```javascript
// Manual consensus collection
const votes = {};
for (const agent of agents) {
  votes[agent] = await getVote(agent);
}
const avgConfidence = Object.values(votes).reduce((a, b) => a + b) / agents.length;
const passed = avgConfidence > 0.9;
```

**After:**
```typescript
const consensus = await coordinationManager.collectConsensus({
  task_id: "task-001",
  validator_ids: ["validator-1", "validator-2", "validator-3"],
  consensus_type: "threshold",
  threshold: 0.90,
  timeout_seconds: 300
});

const passed = consensus.status === "passed";
```

---

## Phase 4: Artifact Migration

### Step 4a: Migrate File Storage

**Before:**
```javascript
// Direct file system operations
const fs = require("fs");
fs.writeFileSync("/artifacts/report.md", content);
const data = fs.readFileSync("/artifacts/report.md");
```

**After:**
```typescript
// Versioned artifact storage
await artifactStorage.storeArtifact({
  correlation_key: "migration-001:iter-1:1731752400000",
  artifact_name: "report",
  artifact_type: "document",
  content: content,
  format: "markdown",
  metadata: {
    created_by: "migration-script",
    tags: ["important"]
  }
});

const artifact = await artifactStorage.retrieveArtifact({
  artifact_name: "report",
  version: "latest"
});
```

### Step 4b: Version Existing Artifacts

```javascript
async function migrateExistingArtifacts() {
  const files = fs.readdirSync("/artifacts");

  for (const file of files) {
    const content = fs.readFileSync(`/artifacts/${file}`);
    const stats = fs.statSync(`/artifacts/${file}`);

    await artifactStorage.storeArtifact({
      correlation_key: `migration-artifact-${file}:0:${Date.now()}`,
      artifact_name: file.replace(/\.[^.]+$/, ""), // Remove extension
      artifact_type: inferType(file),
      content: content.toString(),
      format: inferFormat(file),
      metadata: {
        created_by: "migration",
        original_path: `/artifacts/${file}`,
        original_mtime: stats.mtime.toISOString()
      }
    });
  }
}
```

---

## Phase 5: Validation & Testing

### Step 5a: Functional Testing

```bash
#!/bin/bash
set -euo pipefail

echo "=== Testing Database Migration ==="
npm test -- tests/migration/database.test.js

echo "=== Testing Coordination Migration ==="
npm test -- tests/migration/coordination.test.js

echo "=== Testing Artifact Migration ==="
npm test -- tests/migration/artifacts.test.js

echo "=== Testing Transaction Migration ==="
npm test -- tests/migration/transactions.test.js

echo "=== Testing Schema Validation ==="
npm test -- tests/migration/schema-validation.test.js
```

### Step 5b: Performance Baseline

```javascript
// Compare performance: old vs new
async function performanceBenchmark() {
  const queries = [
    "SELECT * FROM agents WHERE status = 'completed'",
    "SELECT * FROM tasks WHERE iteration > 0",
    "SELECT COUNT(*) FROM events"
  ];

  console.log("=== OLD SYSTEM ===");
  for (const query of queries) {
    const start = Date.now();
    await oldDatabase.query(query);
    console.log(`${query.substring(0, 40)}... took ${Date.now() - start}ms`);
  }

  console.log("\n=== NEW SYSTEM ===");
  for (const query of queries) {
    const start = Date.now();
    await databaseService.query({...});
    console.log(`${query.substring(0, 40)}... took ${Date.now() - start}ms`);
  }
}
```

### Step 5c: Data Integrity Checks

```sql
-- Verify no data loss
SELECT 'agents' as table_name,
  (SELECT COUNT(*) FROM agents_old) as old_count,
  (SELECT COUNT(*) FROM agents) as new_count,
  CASE WHEN (SELECT COUNT(*) FROM agents_old) = (SELECT COUNT(*) FROM agents)
    THEN 'PASS' ELSE 'FAIL' END as status;

-- Check for schema violations
SELECT table_name, column_name, COUNT(*) as null_count
FROM information_schema.columns
JOIN (SELECT * FROM information_schema.columns WHERE is_nullable = 'NO')
WHERE NULL IS NOT NULL
GROUP BY table_name, column_name;
```

---

## Phase 6: Deployment

### Step 6a: Pre-Deployment Checklist

- [ ] All backups created
- [ ] New system tested thoroughly
- [ ] Performance baseline established
- [ ] Rollback procedure documented
- [ ] Team trained on new APIs
- [ ] Monitoring alerts configured
- [ ] Deployment window scheduled
- [ ] Stakeholders notified

### Step 6b: Canary Deployment

```bash
#!/bin/bash
set -euo pipefail

echo "=== Canary Deployment ==="

# Step 1: Start new system alongside old
npm run start:new-system &
OLD_SYSTEM_PID=$!

# Step 2: Route 10% traffic to new system
# Update load balancer config
sed -i 's/new_system_weight: 0/new_system_weight: 10/' config.yaml

# Step 3: Monitor for 1 hour
sleep 3600

# Step 4: Check metrics
ERROR_RATE_NEW=$(get_error_rate "new-system")
ERROR_RATE_OLD=$(get_error_rate "old-system")

if [ "$ERROR_RATE_NEW" -lt "$ERROR_RATE_OLD" ]; then
  echo "✓ Canary deployment successful, proceeding..."
  # Increase traffic to 50%
  sed -i 's/new_system_weight: 10/new_system_weight: 50/' config.yaml
else
  echo "✗ Canary failed, rolling back..."
  kill $OLD_SYSTEM_PID
  exit 1
fi
```

### Step 6c: Full Cutover

```bash
#!/bin/bash
set -euo pipefail

echo "=== Full Cutover to Standardized System ==="

# Gradually migrate remaining traffic
for weight in 60 70 80 90 100; do
  echo "Setting new system weight to $weight%"
  sed -i "s/new_system_weight: [0-9]*/new_system_weight: $weight/" config.yaml
  sleep 1800  # Wait 30 minutes between steps

  # Check health
  if ! curl -f http://localhost:8000/health > /dev/null; then
    echo "Health check failed, rolling back..."
    exit 1
  fi
done

echo "✓ Full migration complete"
```

---

## Rollback Procedures

### Scenario: Data Corruption Detected

```bash
#!/bin/bash
set -euo pipefail

echo "=== ROLLBACK: Data Corruption ==="

# Stop new system
systemctl stop cfn-services

# Restore database backup
rm /data/primary.db
sqlite3 /data/primary.db < /backups/primary.db.backup

# Restore artifacts
rm -rf /artifacts/*
tar -xzf /backups/artifacts.tar.gz -C /

# Restart old system
systemctl start old-system

echo "✓ Rollback complete"
```

### Scenario: Performance Degradation

```bash
#!/bin/bash
set -euo pipefail

echo "=== ROLLBACK: Performance Issue ==="

# Revert traffic routing
echo "weight: 0" > .claude/config/new-system-weight

# Kill new system gracefully
systemctl stop cfn-new-system --timeout=30

# Verify old system responsiveness
for i in {1..5}; do
  curl -f http://old-system:8000/health || exit 1
  sleep 5
done

echo "✓ Rolled back to old system"
```

---

## Migration Runbook

### Execution Sequence

**Day 1-2: Assessment**
```bash
# 1. Run assessment scripts
./scripts/assessment.sh > assessment-report.txt

# 2. Document current architecture
./scripts/diagram-current.sh > current-architecture.md

# 3. Create migration plan
vim migration-plan.md
```

**Day 3-7: Development**
```bash
# 1. Register all schemas
./scripts/register-schemas.sh

# 2. Migrate queries
for file in src/queries/*.js; do
  npm run migrate:query -- "$file"
done

# 3. Migrate coordination logic
./scripts/migrate-coordination.sh

# 4. Migrate artifact handling
./scripts/migrate-artifacts.sh
```

**Day 8-10: Testing**
```bash
# 1. Run functional tests
npm test:migration

# 2. Performance benchmarking
npm run benchmark:old-vs-new

# 3. Data integrity validation
npm run validate:data-integrity
```

**Day 11-12: Deployment**
```bash
# 1. Pre-deployment checks
./scripts/pre-deployment-checklist.sh

# 2. Canary deployment
./scripts/canary-deploy.sh

# 3. Monitor metrics
./scripts/monitor-deployment.sh

# 4. Full cutover if healthy
./scripts/full-cutover.sh
```

---

## Post-Migration

### Monitoring

```bash
# Monitor key metrics
watch -n 5 'curl -s http://localhost:8000/metrics | grep -E "query_count|error_rate|p99_latency"'

# Check for errors
tail -f /var/log/cfn/error.log

# Monitor database performance
sqlite3 /data/primary.db "PRAGMA query_only = ON; SELECT * FROM performance_stats;"
```

### Cleanup

```bash
# After 2 weeks, remove old system
systemctl disable old-system
systemctl stop old-system
rm -rf /opt/old-system/

# Archive old backups
tar -czf /backups/pre-migration.tar.gz /backups/*.backup
rm /backups/*.backup
```

### Documentation

Update documentation:
- [ ] API reference for new system
- [ ] Troubleshooting guide
- [ ] Operational procedures
- [ ] Team training materials

---

**Document Reference:** MIGRATION_GUIDE.md
**Maintained By:** API Documentation Specialist
**Last Reviewed:** 2025-11-16
