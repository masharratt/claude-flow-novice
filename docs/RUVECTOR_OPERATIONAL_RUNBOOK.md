# RuVector Operational Runbook

**Status**: Production Ready | **Version**: 1.0 | **Last Updated**: 2025-11-28

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Service Startup Procedures](#service-startup-procedures)
3. [Service Shutdown Procedures](#service-shutdown-procedures)
4. [Daily Health Checks](#daily-health-checks)
5. [Operational Scenarios](#operational-scenarios)
6. [Incident Response Playbook](#incident-response-playbook)
7. [Scaling Procedures](#scaling-procedures)
8. [Monitoring and Alerting](#monitoring-and-alerting)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Recovery Point Objectives](#recovery-point-objectives)

---

## Pre-Deployment Checklist

**Estimated Time**: 30 minutes | **Owner**: DevOps Team

### Security Validation

- [ ] Verify PostgreSQL password is strong (min 16 characters, mix of cases/numbers/symbols)
- [ ] Verify Redis password is configured and non-empty
- [ ] Check file permissions on backup directory (775 or 755)
- [ ] Verify encryption key is stored securely (not in code/logs)
- [ ] Confirm all credentials are stored in `.env` (not committed to git)
- [ ] Verify Docker images are scanned for vulnerabilities
- [ ] Check network policies restrict Redis/Postgres to internal only
- [ ] Verify TLS/SSL certificates are valid (if applicable)

### Infrastructure Validation

- [ ] Verify disk space available (minimum 10GB free)
- [ ] Check system memory available (minimum 4GB for production)
- [ ] Verify Docker daemon is running and accessible
- [ ] Check network connectivity between all services
- [ ] Verify mount points are accessible and writable
- [ ] Check CPU resources available (minimum 2 cores)
- [ ] Verify no port conflicts (5432, 6379, 3000)
- [ ] Confirm firewall rules allow inter-service communication

### Data Validation

- [ ] Verify backup directory exists and is writable
- [ ] Check latest backup file is present and accessible
- [ ] Verify backup checksums match metadata
- [ ] Test restore procedure on non-production data
- [ ] Confirm data migration scripts have been run
- [ ] Verify schema is compatible with current version

### Application Validation

- [ ] Verify all required environment variables are set
- [ ] Check application configuration is valid
- [ ] Test database connection string
- [ ] Verify API endpoints are reachable after start
- [ ] Check application health check endpoints
- [ ] Confirm logging is properly configured
- [ ] Verify monitoring and alerting systems are ready

---

## Service Startup Procedures

**Service Start Order**: PostgreSQL → Redis → RuVector → Orchestrator

**Total Estimated Time**: 2-5 minutes | **Owner**: DevOps Team

### Step 1: PostgreSQL Database Service

**Duration**: ~30 seconds | **Success Indicator**: Database is accepting connections

```bash
# Start PostgreSQL container
docker compose -f docker-compose.yml up -d postgres

# Verify PostgreSQL is running
docker ps | grep postgres

# Test database connection
docker exec <postgres-container> pg_isready -U postgres

# Check PostgreSQL logs for errors
docker logs postgres | tail -20
```

**Expected Output**:
```
postgres is accepting connections
```

**Troubleshooting**:
- If connection fails, check port 5432 is not in use
- Verify POSTGRES_PASSWORD environment variable is set
- Check disk space for database files

### Step 2: Redis Cache Service

**Duration**: ~15 seconds | **Success Indicator**: Redis is responding to ping

```bash
# Start Redis container
docker compose -f docker-compose.yml up -d redis

# Verify Redis is running
docker ps | grep redis

# Test Redis connection
docker exec <redis-container> redis-cli ping

# Verify Redis password protection
docker exec <redis-container> redis-cli -a "$REDIS_PASSWORD" PING

# Check Redis logs
docker logs redis | tail -20
```

**Expected Output**:
```
PONG
```

**Troubleshooting**:
- If connection fails, check port 6379 is not in use
- Verify REDIS_PASSWORD environment variable is set
- Check Redis memory usage: `redis-cli INFO memory`

### Step 3: RuVector Service

**Duration**: ~1-2 minutes | **Success Indicator**: Health check passes

```bash
# Start RuVector application
docker compose -f docker-compose.yml up -d ruvector

# Verify RuVector is running
docker ps | grep ruvector

# Wait for health check to pass (30 seconds)
sleep 30
docker compose -f docker-compose.yml ps

# Check RuVector logs
docker logs ruvector | tail -50

# Test API endpoints
curl -s http://localhost:3000/health | jq .
curl -s http://localhost:3000/api/status | jq .
```

**Expected Output**:
```
Container status: healthy
API response: {"status":"ready","uptime":"00:00:45"}
```

**Troubleshooting**:
- If health check fails, wait 60 seconds and retry
- Check database connectivity: `docker logs ruvector | grep "connected"`
- Verify Redis connectivity in application logs
- Check environment variables are correctly set

### Step 4: Orchestrator Service

**Duration**: ~15 seconds | **Success Indicator**: Orchestrator ready for tasks

```bash
# Start Orchestrator (if applicable)
docker compose -f docker-compose.yml up -d orchestrator

# Verify Orchestrator is running
docker ps | grep orchestrator

# Check Orchestrator logs
docker logs orchestrator | tail -20

# Verify task queue is accessible
docker exec <orchestrator-container> redis-cli PING
```

**Expected Output**:
```
orchestrator is healthy
Task queue: PONG
```

### Complete Startup Verification

```bash
# Show all services and their status
docker compose -f docker-compose.yml ps

# Run comprehensive health check
./scripts/health-check.sh

# Verify all components are integrated
docker logs ruvector | grep -E "redis|postgres|connected" | tail -5
```

**Expected Status**:
- PostgreSQL: Up (healthy)
- Redis: Up
- RuVector: Up (healthy)
- Orchestrator: Up (healthy)

---

## Service Shutdown Procedures

**Total Estimated Time**: 1-2 minutes | **Owner**: DevOps Team

### Graceful Shutdown (Recommended)

**Duration**: ~60 seconds | **Use When**: Maintenance, updates, or planned downtime

```bash
# Step 1: Stop accepting new tasks (optional)
# This allows existing tasks to complete
docker exec orchestrator curl -X POST http://localhost:3001/admin/pause

# Step 2: Wait for running tasks to complete (check task queue)
QUEUE_LENGTH=$(docker exec redis redis-cli LLEN task:queue)
while [ "$QUEUE_LENGTH" -gt 0 ]; do
    echo "Waiting for tasks to complete: $QUEUE_LENGTH remaining"
    sleep 10
    QUEUE_LENGTH=$(docker exec redis redis-cli LLEN task:queue)
done

# Step 3: Stop RuVector service (allows graceful shutdown)
docker compose -f docker-compose.yml stop ruvector

# Step 4: Stop Orchestrator
docker compose -f docker-compose.yml stop orchestrator

# Step 5: Stop Redis (flushes in-memory data)
docker compose -f docker-compose.yml stop redis

# Step 6: Stop PostgreSQL (ensures data is committed)
docker compose -f docker-compose.yml stop postgres

# Verify all services are stopped
docker compose -f docker-compose.yml ps
```

**Expected Output**:
```
All containers showing "Exited" state
```

### Forced Shutdown (Emergency)

**Duration**: ~10 seconds | **Use When**: Service hangs, emergency shutdown needed

```bash
# Kill all services immediately
docker compose -f docker-compose.yml down

# Verify containers are removed
docker ps | grep -E "postgres|redis|ruvector|orchestrator" || echo "All containers stopped"

# Remove all volumes (WARNING: data loss!)
# Only use if absolutely necessary and backups exist
# docker volume prune -f
```

**Warning**: Forced shutdown may cause:
- In-flight task loss
- Incomplete transactions
- Potential data corruption

**Recovery**: Restore from backup after shutdown

---

## Daily Health Checks

**Frequency**: Once per day (morning) | **Duration**: ~15 minutes | **Owner**: DevOps Team

### Quick Health Check Script

```bash
# Run daily health checks
./scripts/health-check.sh --full

# Output shows:
# ✓ PostgreSQL: healthy
# ✓ Redis: healthy
# ✓ RuVector: healthy
# ✓ Data integrity: verified
```

### Manual Health Checks

#### 1. Database Connectivity

```bash
# Test PostgreSQL connection
docker exec postgres pg_isready -U postgres -d ruvector
# Expected: accepting connections

# Check database size
docker exec postgres psql -U postgres -d ruvector \
  -c "SELECT pg_size_pretty(pg_database_size('ruvector'));"
# Expected: reasonable size, not growing abnormally

# Verify schema integrity
docker exec postgres psql -U postgres -d ruvector \
  -c "\dt" | head -10
# Expected: tables visible
```

#### 2. Redis Cache Status

```bash
# Check Redis memory usage
docker exec redis redis-cli INFO memory | grep used_memory_human
# Expected: <500MB for typical deployments

# Check connected clients
docker exec redis redis-cli INFO clients | grep connected_clients
# Expected: reasonable number (typically 2-5)

# Verify key count
docker exec redis redis-cli DBSIZE
# Expected: keys should be reasonable, not growing unbounded

# Check for memory pressure
docker exec redis redis-cli INFO stats | grep evicted_keys
# Expected: should be zero or very small
```

#### 3. RuVector Service Status

```bash
# Health endpoint
curl -s http://localhost:3000/health | jq .
# Expected: "healthy" status

# API status
curl -s http://localhost:3000/api/status | jq .
# Expected: "ready" status with uptime

# Check RuVector logs for errors
docker logs ruvector --since 1h | grep -i "error" | head -5

# Verify database connections
docker exec ruvector curl -s http://localhost:3000/api/db/status | jq .
# Expected: connected state
```

#### 4. Disk Space Monitoring

```bash
# Check disk usage
df -h | grep -E "/$|/data"
# Expected: >10% free space

# Check RuVector data directory size
du -sh docker/trigger-dev/data/
# Expected: growth aligned with data ingestion rate

# Check backup directory size
du -sh docker/trigger-dev/data/backups/
# Expected: <50GB (retention policy should limit)

# Verify backup file creation
ls -lh docker/trigger-dev/data/backups/ | head -5
# Expected: recent backup files with timestamps
```

#### 5. System Resource Monitoring

```bash
# Check container resource usage
docker stats --no-stream

# Expected:
# - PostgreSQL: <100MB memory, <10% CPU
# - Redis: <50MB memory, <5% CPU
# - RuVector: <500MB memory, <20% CPU
# - Total: <1GB memory, <50% CPU on 4-core system

# Check memory pressure
free -h | grep Mem
# Expected: >2GB available

# Check CPU load
uptime
# Expected: load <4 on 4-core system
```

### Weekly Deep Health Check

**Frequency**: Once per week (Friday) | **Duration**: ~30 minutes

```bash
# 1. Test backup process
./scripts/backup-ruvector.sh
# Expected: backup created successfully

# 2. Test restore procedure (dry-run)
./scripts/restore-ruvector.sh --dry-run
# Expected: restore would succeed

# 3. Verify backup integrity
./scripts/backup-ruvector.sh --verify-only
# Expected: verification passes

# 4. Check data consistency
docker exec postgres psql -U postgres -d ruvector \
  -c "PRAGMA integrity_check;"
# Expected: "ok"

# 5. Review error logs
docker logs ruvector --since 7d | grep -i "error" | wc -l
# Expected: <10 errors per week (investigate if higher)
```

---

## Operational Scenarios

### Scenario 1: Backup Verification (Monthly)

**Purpose**: Ensure backups can restore successfully | **Duration**: ~30 minutes | **Frequency**: Monthly

```bash
# Step 1: Create test backup
BACKUP_FILE=$(./scripts/backup-ruvector.sh 2>&1 | tail -1)
echo "Backup created: $BACKUP_FILE"

# Step 2: Verify backup integrity
./scripts/backup-ruvector.sh --verify-only
# Expected: "Last backup verified successfully"

# Step 3: Test restore to temporary location
TEST_DB="/tmp/ruvector-test-restore.db"
cp "$BACKUP_FILE" "$TEST_DB"

# Step 4: Validate test database
sqlite3 "$TEST_DB" "PRAGMA integrity_check;"
# Expected: "ok"

# Step 5: Check schema
sqlite3 "$TEST_DB" ".tables"
# Expected: collection and vector tables

# Step 6: Cleanup
rm -f "$TEST_DB"

# Result: Backup verified and restore tested successfully
echo "✓ Backup verification complete"
```

### Scenario 2: Database Integrity Check

**Purpose**: Detect and repair database corruption | **Duration**: ~15 minutes | **Frequency**: Weekly

```bash
# Step 1: Check database file integrity
FILE_SIZE=$(ls -l docker/trigger-dev/data/ruvector.db | awk '{print $5}')
echo "Database file size: $FILE_SIZE bytes"

# Step 2: Run SQLite integrity check
docker exec postgres sqlite3 /data/ruvector.db "PRAGMA integrity_check;"
# Expected: "ok"

# Step 3: Check for corruption indicators
docker exec postgres sqlite3 /data/ruvector.db \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"
# Expected: correct number of tables

# Step 4: Analyze table statistics
docker exec postgres sqlite3 /data/ruvector.db "ANALYZE;"

# Step 5: Verify no journaling issues
ls -la docker/trigger-dev/data/ruvector.db* | grep -E "journal|wal"
# Expected: minimal journal files (cleaned up automatically)

# Result: Database integrity verified
echo "✓ Integrity check complete"
```

### Scenario 3: Performance Monitoring

**Purpose**: Identify performance degradation | **Duration**: ~10 minutes | **Frequency**: Daily

```bash
# Step 1: Check query performance
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT query, calls, mean_time, max_time
  FROM pg_stat_statements
  ORDER BY mean_time DESC
  LIMIT 5;
"

# Step 2: Check slow queries (>100ms)
docker logs ruvector --since 1h | grep -i "slow query" | wc -l

# Step 3: Monitor connection count
docker exec postgres psql -U postgres -d ruvector -c \
  "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# Step 4: Check index efficiency
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT schemaname, tablename, indexname, idx_scan
  FROM pg_stat_user_indexes
  WHERE idx_scan = 0
  LIMIT 10;
"

# Step 5: Check cache hit ratio
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT
    sum(heap_blks_read) as heap_read,
    sum(heap_blks_hit)  as heap_hit,
    sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
  FROM pg_statio_user_tables;
"
# Expected: ratio >0.95 (95% cache hit rate)

# Result: Performance baseline established
```

### Scenario 4: Disk Space Management

**Purpose**: Prevent disk space exhaustion | **Duration**: ~20 minutes | **Frequency**: Weekly

```bash
# Step 1: Analyze disk usage
du -sh docker/trigger-dev/data/* | sort -rh

# Step 2: Check backup retention
ls -lht docker/trigger-dev/data/backups/ | head -10
# Expected: 7-day rotation visible

# Step 3: Cleanup old backups manually (if needed)
find docker/trigger-dev/data/backups -name "ruvector.db.backup-*" \
  -mtime +7 -delete
# Removes backups older than 7 days

# Step 4: Check PostgreSQL WAL files
du -sh docker/trigger-dev/data/postgres/pg_wal
# Expected: <1GB (archive_command should clean up)

# Step 5: Analyze growth rate
df -h | grep /data
# Record free space: ___ GB

# Step 6: Estimate time until full
# (current_growth_rate_mb_per_day * available_space_mb) / 24 hours

# Step 7: Projected action date
# If <30 days until full, plan expansion

# Result: Disk space status documented
echo "Free space: ___ GB | Days until full: ___"
```

### Scenario 5: Log Rotation and Cleanup

**Purpose**: Manage log files and disk usage | **Duration**: ~10 minutes | **Frequency**: Weekly

```bash
# Step 1: Check current log sizes
du -sh docker/trigger-dev/logs/* 2>/dev/null | sort -rh

# Step 2: Cleanup old Docker logs (>30 days)
find /var/lib/docker/containers -name "*.log" \
  -mtime +30 -exec rm {} \;

# Step 3: Cleanup application logs
find docker/trigger-dev/logs -name "*.log" \
  -mtime +30 -delete

# Step 4: Rotate PostgreSQL logs
docker exec postgres logrotate -f /etc/logrotate.d/postgresql

# Step 5: Rotate Redis logs
docker exec redis redis-cli --rdb /data/dump.rdb 2>/dev/null

# Step 6: Archive backup directory
tar -czf docker/trigger-dev/data/backups/archive-$(date +%Y%m%d).tar.gz \
  docker/trigger-dev/data/backups/*.backup-* 2>/dev/null || true

# Result: Logs cleaned and rotated
```

---

## Incident Response Playbook

### Incident 1: Database Corruption Recovery

**Impact**: Data loss risk | **RTO**: 15 minutes | **Severity**: Critical

#### Detection

```bash
# SQLite integrity check shows issues
sqlite3 docker/trigger-dev/data/ruvector.db "PRAGMA integrity_check;"
# Output: issues detected, not "ok"
```

#### Response Steps

```bash
# Step 1: IMMEDIATE - Verify backup exists
ls -la docker/trigger-dev/data/backups/ | head -1
# Expected: recent backup file present

# Step 2: Stop all services to prevent further corruption
docker compose -f docker-compose.yml stop

# Step 3: Backup corrupted database for analysis
cp docker/trigger-dev/data/ruvector.db \
   docker/trigger-dev/data/ruvector.db.corrupted-$(date +%Y%m%d-%H%M%S)

# Step 4: Restore from latest backup
./scripts/restore-ruvector.sh --force

# Step 5: Verify restored database
sqlite3 docker/trigger-dev/data/ruvector.db "PRAGMA integrity_check;"
# Expected: "ok"

# Step 6: Start services
docker compose -f docker-compose.yml up -d postgres redis ruvector

# Step 7: Verify data integrity
./scripts/health-check.sh

# Step 8: Post-incident analysis
# Analyze docker/trigger-dev/data/ruvector.db.corrupted-* to determine cause
```

#### Prevention

- Enable PostgreSQL WAL archiving for point-in-time recovery
- Implement daily integrity checks with automated alerting
- Monitor for disk I/O errors in system logs
- Use periodic VACUUM and ANALYZE operations

### Incident 2: Disk Full (Critical)

**Impact**: Service unavailable | **RTO**: 5 minutes | **Severity**: Critical

#### Detection

```bash
# Disk free space <1GB
df -h / | tail -1 | awk '{print $4}'
# Output: <1G indicates critical condition
```

#### Response Steps

```bash
# Step 1: IMMEDIATE - Identify disk usage
du -sh docker/trigger-dev/data/* | sort -rh

# Step 2: Stop non-critical services
docker compose -f docker-compose.yml stop orchestrator ruvector

# Step 3: Keep PostgreSQL and Redis running to preserve transactions

# Step 4: Emergency cleanup
# Remove oldest backups (keep at least 3 recent ones)
ls -1 docker/trigger-dev/data/backups/*.backup-* | head -n -3 | xargs rm -f

# Step 5: Cleanup container layers
docker container prune -f
docker image prune -f

# Step 6: Check freed space
df -h / | tail -1 | awk '{print $4}'
# Expected: >5GB free

# Step 7: Restart services
docker compose -f docker-compose.yml up -d ruvector orchestrator

# Step 8: Document and plan
# - Analyze growth rate
# - Plan storage expansion
# - Implement automated cleanup
```

#### Prevention

- Set disk usage alerts at 80%, 90%, 95%
- Implement automated backup cleanup (retention policy)
- Monitor disk growth rate weekly
- Plan storage expansion before reaching 80% capacity

### Incident 3: Connection Pool Exhaustion

**Impact**: New connections refused | **RTO**: 2 minutes | **Severity**: High

#### Detection

```bash
# PostgreSQL connections at max
docker exec postgres psql -U postgres -c \
  "SELECT count(*) FROM pg_stat_activity;"
# Output: count = max_connections (default 100)
```

#### Response Steps

```bash
# Step 1: Identify long-running queries
docker exec postgres psql -U postgres -c "
  SELECT pid, usename, state, query_start, query
  FROM pg_stat_activity
  WHERE state != 'idle'
  ORDER BY query_start;"

# Step 2: Terminate idle connections
docker exec postgres psql -U postgres -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state = 'idle'
  AND query_start < NOW() - INTERVAL '30 minutes';"

# Step 3: Check connection pool status
docker exec ruvector curl -s http://localhost:3000/api/db/connections

# Step 4: Increase PostgreSQL max_connections if needed
docker exec postgres psql -U postgres -c \
  "ALTER SYSTEM SET max_connections = 150;"

# Step 5: Restart PostgreSQL
docker compose -f docker-compose.yml restart postgres

# Step 6: Monitor new connections
docker exec postgres psql -U postgres -c \
  "SELECT count(*) FROM pg_stat_activity;"
```

#### Prevention

- Monitor connection count daily
- Implement connection pooling (PgBouncer)
- Set alerts for >80% connection pool usage
- Implement connection timeouts for idle connections
- Review application code for connection leaks

### Incident 4: Memory Leak Diagnosis

**Impact**: Degraded performance, eventual OOM | **RTO**: 5 minutes | **Severity**: High

#### Detection

```bash
# Memory usage continuously increases
docker stats --no-stream | grep ruvector
# RSS column continuously growing over hours
```

#### Response Steps

```bash
# Step 1: Check memory usage trend
docker stats --no-stream ruvector | awk '{print $1, $4}'

# Step 2: Review RuVector logs for memory issues
docker logs ruvector --since 1h | grep -i "memory\|gc"

# Step 3: Check Node.js heap usage
docker exec ruvector node -e \
  "console.log(Math.round(require('v8').getHeapStatistics().total_heap_size / 1024 / 1024) + 'MB')"

# Step 4: Enable heap profiling (temporary)
docker exec ruvector node --inspect=0.0.0.0:9229 app.js &

# Step 5: Identify memory hotspots
# Use Chrome DevTools: chrome://inspect to profile

# Step 6: Restart RuVector to release memory
docker compose -f docker-compose.yml restart ruvector

# Step 7: Monitor heap size after restart
for i in {1..10}; do
  docker exec ruvector node -e \
    "console.log(new Date().toISOString() + ': ' + Math.round(require('v8').getHeapStatistics().total_heap_size / 1024 / 1024) + 'MB')"
  sleep 60
done

# Step 8: If leak persists, escalate
# Contact development team with heap profile
```

#### Prevention

- Monitor heap usage daily
- Implement automated restart on heap threshold (e.g., >800MB)
- Profile memory usage in staging before production
- Review code for event listener leaks, circular references
- Implement periodic garbage collection tuning

### Incident 5: High Query Latency

**Impact**: Slow API responses | **RTO**: 10 minutes | **Severity**: Medium

#### Detection

```bash
# API response time >1000ms
curl -w "Time: %{time_total}s\n" http://localhost:3000/api/status
# Output: Time > 1s indicates issue
```

#### Response Steps

```bash
# Step 1: Identify slow queries
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT query, calls, mean_time, max_time
  FROM pg_stat_statements
  WHERE mean_time > 100
  ORDER BY mean_time DESC
  LIMIT 10;"

# Step 2: Check table sizes and bloat
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
  FROM pg_tables
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
  LIMIT 10;"

# Step 3: Check missing indexes
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT schemaname, tablename, indexname, idx_scan
  FROM pg_stat_user_indexes
  WHERE idx_scan = 0;"

# Step 4: Run ANALYZE to update statistics
docker exec postgres psql -U postgres -d ruvector -c "ANALYZE;"

# Step 5: Identify blocked queries
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_statement
  FROM pg_catalog.pg_locks blocked_locks
  JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
  JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
  JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
  WHERE NOT blocked_locks.granted;"

# Step 6: Kill long-running queries if necessary
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE query_start < NOW() - INTERVAL '5 minutes'
  AND state != 'idle';"

# Step 7: Restart service if needed
docker compose -f docker-compose.yml restart ruvector

# Step 8: Monitor query latency
for i in {1..5}; do
  curl -w "\n%{time_total}s\n" http://localhost:3000/api/status
  sleep 10
done
```

#### Prevention

- Monitor query latency with 95th percentile tracking
- Implement automatic ANALYZE on large table changes
- Monitor and remove unused indexes
- Implement query result caching for frequently accessed data
- Review query plans with `EXPLAIN ANALYZE`

---

## Scaling Procedures

### Scaling Scenario 1: Adding a New Database Node (Read Replica)

**Use Case**: Distribute read-heavy workloads | **Downtime**: 0 minutes (non-blocking)

```bash
# Step 1: Setup streaming replication
docker run -d \
  --name postgres-replica \
  --network cfn-network \
  -e POSTGRES_REPLICATION_MODE=slave \
  -e POSTGRES_MASTER_SERVICE=postgres \
  -v postgres-replica-data:/var/lib/postgresql/data \
  postgres:15-alpine

# Step 2: Verify replication lag
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT pid, usename, application_name, state, sync_state
  FROM pg_stat_replication;"

# Step 3: Configure application for read replica
# Update connection pool to include replica for SELECT queries
REPLICA_HOST=postgres-replica
REPLICA_PORT=5432

# Step 4: Monitor replication status
docker logs postgres-replica | tail -20

# Result: Read replica ready for SELECT queries
```

### Scaling Scenario 2: Increasing Redis Memory (Vertical Scaling)

**Use Case**: Cache more data | **Downtime**: <1 minute

```bash
# Step 1: Check current memory configuration
docker exec redis redis-cli CONFIG GET maxmemory

# Step 2: Create new Redis container with larger memory
docker stop redis
docker rename redis redis-old

docker run -d \
  --name redis \
  --network cfn-network \
  -e REDIS_MEMORY_MB=2048 \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:7-alpine

# Step 3: Verify new Redis is running
docker exec redis redis-cli PING

# Step 4: Verify data persisted
docker exec redis redis-cli DBSIZE

# Step 5: Remove old container
docker rm redis-old

# Result: Redis memory increased to 2GB
```

### Scaling Scenario 3: Rebalancing Vector Collections

**Use Case**: Distribute vector data across nodes | **Downtime**: Required

```bash
# Step 1: Identify hot collections (high access rate)
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT collection_id, COUNT(*) as vector_count
  FROM vectors
  GROUP BY collection_id
  ORDER BY vector_count DESC
  LIMIT 10;"

# Step 2: Stop RuVector to prevent writes
docker compose -f docker-compose.yml stop ruvector

# Step 3: Create sharding key index
docker exec postgres psql -U postgres -d ruvector -c "
  CREATE INDEX CONCURRENTLY idx_vectors_shard_key
  ON vectors(collection_id, shard_key);"

# Step 4: Distribute shards to nodes
# Implement shard assignment logic
# Migrate data using parallel copy operations

# Step 5: Update routing configuration
# Configure RuVector to use new shard mapping

# Step 6: Restart RuVector
docker compose -f docker-compose.yml up -d ruvector

# Step 7: Verify balanced distribution
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT collection_id, shard_key, COUNT(*) as vector_count
  FROM vectors
  GROUP BY collection_id, shard_key;"

# Result: Collections rebalanced across nodes
```

### Scaling Scenario 4: Load Testing Before Expansion

**Use Case**: Verify capacity before production traffic spike | **Duration**: ~30 minutes

```bash
# Step 1: Install load testing tool
pip install locust

# Step 2: Create load test script
cat > locustfile.py << 'EOF'
from locust import HttpUser, task, between

class RuVectorUser(HttpUser):
    wait_time = between(1, 3)

    @task
    def get_collections(self):
        self.client.get("/api/collections")

    @task
    def search_vectors(self):
        self.client.post("/api/vectors/search", json={
            "collection_id": "test",
            "query": [0.1, 0.2, 0.3],
            "limit": 10
        })
EOF

# Step 3: Run load test
locust -f locustfile.py \
  --host=http://localhost:3000 \
  --users 100 \
  --spawn-rate 10 \
  --run-time 10m \
  --headless

# Step 4: Analyze results
# - Response time: target <500ms at p95
# - Error rate: target <0.5%
# - Throughput: minimum acceptable RPS

# Step 5: Identify bottlenecks
docker stats --no-stream

# Step 6: Scale if necessary
# If CPU >80%, add nodes
# If memory >85%, increase container memory
# If disk I/O >90%, upgrade storage

# Result: Capacity validated, ready for production load
```

---

## Monitoring and Alerting

### Prometheus Metrics Collection

**Metrics to Monitor**:

| Metric | Threshold | Alert | Action |
|--------|-----------|-------|--------|
| PostgreSQL connections | >80% | Warning | Review and optimize queries |
| Redis memory | >85% | Critical | Clear cache, increase memory |
| RuVector response time | >500ms p95 | Warning | Investigate slow queries |
| Disk usage | >85% | Warning | Cleanup old data |
| CPU utilization | >80% | Warning | Scale up or optimize |
| Backup success rate | <99% | Critical | Investigate backup failures |

### Grafana Dashboards

**Key Dashboards**:
1. **System Health**: CPU, Memory, Disk I/O
2. **Database Performance**: Query latency, connection count, cache hit ratio
3. **Application Metrics**: Request rate, error rate, response time
4. **Data Pipeline**: Backup success, restore time, data consistency

### Alert Rules

```yaml
# Example alert rule
groups:
  - name: ruvector_alerts
    rules:
      - alert: DatabaseConnectionPoolExhausted
        expr: pg_stat_activity_count > 90
        for: 5m
        annotations:
          summary: "PostgreSQL connection pool exhausted"

      - alert: RedisMemoryHigh
        expr: redis_memory_used_bytes / redis_memory_max_bytes > 0.85
        for: 10m
        annotations:
          summary: "Redis memory usage >85%"

      - alert: DiskSpaceRunningOut
        expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.15
        for: 15m
        annotations:
          summary: "Disk space <15% available"
```

---

## Troubleshooting Guide

### Problem: RuVector Health Check Fails

**Symptoms**: Health endpoint returns unhealthy status

**Diagnosis Steps**:
```bash
curl -s http://localhost:3000/health
docker logs ruvector | grep -i "error" | tail -10
docker exec postgres psql -U postgres -d ruvector -c "SELECT 1"
docker exec redis redis-cli PING
```

**Solutions**:
1. Check database connectivity: `docker logs ruvector | grep "database"`
2. Check Redis connectivity: `docker logs ruvector | grep "redis"`
3. Increase startup timeout: `sleep 60 && curl http://localhost:3000/health`
4. Restart service: `docker compose restart ruvector`

### Problem: Backup Failed

**Symptoms**: Backup script exits with error

**Diagnosis Steps**:
```bash
./scripts/backup-ruvector.sh
ls -la docker/trigger-dev/data/backups/ | tail -5
du -sh docker/trigger-dev/data/
```

**Solutions**:
1. Check disk space: `df -h docker/trigger-dev/data/`
2. Check database file size: `du -sh docker/trigger-dev/data/ruvector.db`
3. Verify write permissions: `touch docker/trigger-dev/data/backups/test.txt && rm $_`
4. Retry backup: `./scripts/backup-ruvector.sh`

### Problem: High Query Latency

**Symptoms**: API responses >1000ms

**Diagnosis Steps**:
```bash
docker exec postgres psql -U postgres -d ruvector -c "
  SELECT query, calls, mean_time FROM pg_stat_statements
  ORDER BY mean_time DESC LIMIT 5;"
docker stats
```

**Solutions**:
1. Run ANALYZE: `docker exec postgres psql -U postgres -d ruvector -c "ANALYZE"`
2. Check indexes: Verify necessary indexes exist
3. Increase memory: Scale container memory allocation
4. Check disk I/O: Monitor iostat for slow storage

### Problem: Disk Usage Growing Rapidly

**Symptoms**: Disk space filling up faster than expected

**Diagnosis Steps**:
```bash
du -sh docker/trigger-dev/data/*
ls -lht docker/trigger-dev/data/backups/ | head
find docker/trigger-dev -type f -size +100M
```

**Solutions**:
1. Check backup retention: Verify old backups are deleted
2. Analyze database bloat: `VACUUM ANALYZE`
3. Cleanup WAL files: `pg_archivecleanup`
4. Remove unused data: Implement retention policies

---

## Recovery Point Objectives

### RTO/RPO Summary

| Scenario | Data Loss (RPO) | Downtime (RTO) | Recovery Steps |
|----------|-----------------|----------------|-----------------|
| Database Corruption | 24 hours | 15 minutes | Restore from daily backup |
| Disk Failure | 1 day | 30 minutes | Restore to new disk |
| Service Crash | Real-time | 5 minutes | Restart container |
| Human Error | 24 hours | 20 minutes | Restore from backup |
| Total Data Loss | 1 week | 60 minutes | Full system restore |

### Backup Strategy

**Daily Backups**:
- Schedule: 02:00 UTC daily
- Retention: 7 days
- Verification: Weekly restore test
- Location: `/docker/trigger-dev/data/backups/`

**Weekly Backups**:
- Schedule: Sundays 00:00 UTC
- Retention: 4 weeks
- Encryption: Optional (AES-256)
- Archive: Offsite storage

**Monthly Backups**:
- Schedule: 1st of month, 00:00 UTC
- Retention: 12 months
- Archive: Cold storage
- Test: Quarterly restore test

---

## Quick Reference

### Emergency Commands

```bash
# Emergency shutdown
docker compose down -v

# Emergency restart
docker compose up -d postgres redis ruvector

# Forced backup
./scripts/backup-ruvector.sh --dry-run

# Emergency restore
./scripts/restore-ruvector.sh --force

# Kill hung processes
docker kill $(docker ps -q)

# Reset everything
docker system prune -a --volumes
```

### Support Contacts

- **On-Call Engineer**: [contact info]
- **Database Admin**: [contact info]
- **Security Team**: [contact info]
- **Escalation**: [contact info]

### Related Documentation

- [RUVECTOR_STORAGE_INFRASTRUCTURE.md](RUVECTOR_STORAGE_INFRASTRUCTURE.md) - Storage architecture
- [SECURITY.md](SECURITY.md) - Security procedures
- [CFN_LOOP_ARCHITECTURE.md](CFN_LOOP_ARCHITECTURE.md) - System architecture

---

**Last Updated**: 2025-11-28 | **Next Review**: 2025-12-28 | **Owner**: DevOps Team
