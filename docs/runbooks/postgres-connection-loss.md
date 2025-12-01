# PostgreSQL Connection Loss Runbook

## Alert Information
- **Alert Name:** `PostgresConnectionLoss`
- **Severity:** P0
- **Notification:** PagerDuty + Slack #cfn-alerts (immediate escalation)
- **Threshold:** PostgreSQL unavailable for >30 seconds

## Symptoms
- Task metadata persistence failing
- Agent lifecycle tracking unavailable
- Cost allocation data not recorded
- Prometheus `postgres_up: 0` metric
- Database connection pool exhausted
- Application errors about database connectivity

**Grafana Dashboards:**
- Cost Allocation Dashboard → Database Health panel
- Agent Performance Dashboard → Persistence Layer panel

**Common Error Messages:**
```
Error: Connection to database failed (ECONNREFUSED)
Error: FATAL: database "cfn" does not exist
Error: FATAL: password authentication failed for user "cfn_user"
Error: Connection pool timeout after 30s
SQLSTATE[08006]: Connection failure
```

## Diagnosis

### 1. Check PostgreSQL Service Status
```bash
# Check Postgres container status
docker ps -a | grep postgres
# Expected: UP status

# If container is down:
docker logs cfn-postgres --tail 100
# Look for crash/startup errors

# Check PostgreSQL process
docker exec cfn-postgres pg_isready -U cfn_user -d cfn
# Expected: "accepting connections"
```

### 2. Verify Network Connectivity
```bash
# Test PostgreSQL port
nc -zv localhost 5432
# Expected: Connection succeeded

# Check Docker network
docker network inspect cfn-network | jq '.[0].Containers' | grep postgres

# Test from application container
docker exec cfn-coordinator psql -h postgres -U cfn_user -d cfn -c "SELECT 1;"
# Expected: Returns 1
```

### 3. Review PostgreSQL Logs
```bash
# Check for errors
docker logs cfn-postgres 2>&1 | grep -i "error\|fatal\|panic"

# Check for crash recovery
docker logs cfn-postgres 2>&1 | grep -i "recovery\|checkpoint"

# Check for connection errors
docker logs cfn-postgres 2>&1 | grep -i "connection\|authentication"

# Check for disk/IO errors
docker logs cfn-postgres 2>&1 | grep -i "disk\|write\|fsync"
```

### 4. Check Database Resource Usage
```bash
# Check active connections
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT count(*) as active_connections
  FROM pg_stat_activity
  WHERE state = 'active';
"
# Expected: <20 (based on max_connections)

# Check database size
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT pg_size_pretty(pg_database_size('cfn'));
"
# Expected: <10GB

# Check for long-running queries
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query
  FROM pg_stat_activity
  WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '5 minutes';
"
```

### 5. Identify Root Cause

**Common root causes:**
- PostgreSQL container crashed
- Database corruption after crash
- Connection pool exhausted (max_connections reached)
- Disk full (no space for WAL writes)
- Authentication configuration changed
- Port conflict (another process using 5432)
- Docker volume mount issue

## Resolution

### Immediate Actions (P0 - 5 minute response)

**Action 1: Restart PostgreSQL Container (if stopped)**
```bash
# Check if container exists
docker ps -a | grep cfn-postgres

# If stopped, start it
docker start cfn-postgres

# Wait for PostgreSQL to accept connections
sleep 10

# Verify startup
docker exec cfn-postgres pg_isready -U cfn_user -d cfn
# Expected: "accepting connections"
```

**Action 2: Check Database Integrity (if crashed)**
```bash
# Connect to database
docker exec -it cfn-postgres psql -U cfn_user -d cfn

# Check for corruption
SELECT pg_database.datname, pg_size_pretty(pg_database_size(pg_database.datname))
FROM pg_database;

# Run consistency check
\q

# If corruption suspected, run VACUUM
docker exec cfn-postgres psql -U cfn_user -d cfn -c "VACUUM FULL ANALYZE;"
```

**Action 3: Kill Long-Running Queries**
```bash
# Identify blocking queries
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query
  FROM pg_stat_activity
  WHERE state = 'active'
  ORDER BY duration DESC
  LIMIT 10;
"

# Kill problematic queries (replace PID)
docker exec cfn-postgres psql -U cfn_user -d cfn -c "SELECT pg_terminate_backend(12345);"
```

### Complete Fix

**Step 1: Diagnose Root Cause**
```bash
# Check for disk space issues
df -h /var/lib/docker
# If <10% free:
docker system prune -af

# Check PostgreSQL data directory
docker exec cfn-postgres du -sh /var/lib/postgresql/data
# If >50GB, investigate large tables

# Check for authentication issues
docker exec cfn-postgres cat /var/lib/postgresql/data/pg_hba.conf
# Expected: host all entries allowing Docker network
```

**Step 2: Fix Connection Pool Exhaustion**
```bash
# Increase max_connections (if needed)
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  ALTER SYSTEM SET max_connections = 200;
"
# Was: 100

# Restart PostgreSQL to apply
docker restart cfn-postgres
sleep 10

# Verify new limit
docker exec cfn-postgres psql -U cfn_user -d cfn -c "SHOW max_connections;"
# Expected: 200
```

**Step 3: Restore from Backup (if corruption)**
```bash
# Stop PostgreSQL
docker stop cfn-postgres

# Backup corrupted data (just in case)
docker run --rm -v cfn-postgres-data:/source -v /tmp:/dest alpine \
  cp -r /source /dest/postgres-corrupted-$(date +%Y%m%d-%H%M%S)

# Restore from latest backup
LATEST_BACKUP=$(ls -t /backups/postgres/*.sql.gz | head -1)
echo "Restoring from: $LATEST_BACKUP"

# Start PostgreSQL
docker start cfn-postgres
sleep 10

# Drop and recreate database
docker exec cfn-postgres psql -U postgres -c "DROP DATABASE IF EXISTS cfn;"
docker exec cfn-postgres psql -U postgres -c "CREATE DATABASE cfn OWNER cfn_user;"

# Restore data
gunzip -c "$LATEST_BACKUP" | docker exec -i cfn-postgres psql -U cfn_user -d cfn

# Verify restoration
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT count(*) FROM agents;
  SELECT count(*) FROM tasks;
"
```

**Step 4: Restart Dependent Services**
```bash
# After PostgreSQL is stable, restart applications
docker restart cfn-coordinator
docker restart cfn-orchestrator

# Wait for reconnection
sleep 10

# Verify connectivity
docker logs cfn-coordinator 2>&1 | grep -i "database.*connected"
# Expected: "Connected to database"
```

## Verification Checklist
- [ ] Alert cleared in Prometheus (postgres_up: 1)
- [ ] PostgreSQL accepting connections
- [ ] All tables accessible (SELECT 1 succeeds)
- [ ] Connection pool healthy (<50% utilization)
- [ ] No long-running queries (>5 minutes)
- [ ] Application containers reconnected
- [ ] Task metadata persisting correctly
- [ ] Cost allocation tracking working
- [ ] Agent lifecycle data recording
- [ ] No errors in application logs

## Prevention

### Configuration Changes
1. **Increase max_connections:** Set to 200 (from 100)
2. **Add connection pooling:** Use PgBouncer for connection management
3. **Tune checkpoint settings:** Reduce checkpoint frequency to avoid I/O spikes
4. **Add health check:** Docker health check with pg_isready
5. **Resource limits:** Reserve 4GB memory for PostgreSQL container

### Monitoring Improvements
1. **Add alert:** PostgreSQL connection pool >80% utilization
2. **Add alert:** Long-running queries (>10 minutes)
3. **Add alert:** Database size >80% of allocated space
4. **Add dashboard:** Connection pool metrics over time
5. **Add metric:** Query latency (P50, P95, P99)

### Process Changes
1. **Automated backups:** Hourly pg_dump snapshots
2. **Backup validation:** Weekly restore test in staging
3. **Disaster recovery:** Document PostgreSQL restore procedures
4. **Capacity planning:** Monthly database growth review
5. **High availability:** Consider PostgreSQL replication for failover
6. **Regular maintenance:** Weekly VACUUM and ANALYZE

## Post-Incident

### Required Actions
1. Create post-incident review within 4 hours (P0 incident)
2. Update this runbook with specific failure mode
3. Test PostgreSQL restore procedures
4. Review connection pool configuration
5. Implement HA if outage >10 minutes

### Post-Incident Review Template
```markdown
# PIR: PostgreSQL Connection Loss - [DATE]

## Timeline
- [TIME]: Alert fired (PostgreSQL down)
- [TIME]: On-call paged
- [TIME]: On-call acknowledged
- [TIME]: Root cause identified
- [TIME]: PostgreSQL restarted/restored
- [TIME]: Applications reconnected
- [TIME]: Alert cleared

## Root Cause
[Crash / disk full / corruption / connection exhaustion / auth issue]

## Impact
- **Duration:** [X minutes of downtime]
- **Affected functionality:** Task persistence, cost tracking, lifecycle data
- **Data loss:** [none / X minutes of records]
- **Failed operations:** [count] task writes, [count] cost records
- **User impact:** Task metadata not recorded

## Resolution
[Container restart / backup restore / config change / disk cleanup]

## Lessons Learned
- PostgreSQL single point of failure
- Connection pool limits too low
- Backup/restore needs improvement
- Monitoring gaps (late detection)

## Action Items
1. Implement PostgreSQL replication - Owner: Platform - Due: [date]
2. Add PgBouncer connection pooler - Owner: DevOps - Due: [date]
3. Increase connection limit to 200 - Owner: DBA - Due: [date]
4. Automate weekly restore tests - Owner: SRE - Due: [date]
5. Add connection pool monitoring - Owner: SRE - Due: [date]
```

## Related Alerts
- `RedisConnectionLoss` → [redis-connection-loss.md](redis-connection-loss.md)
- `DiskSpaceExhaustion` → [disk-space-exhaustion.md](disk-space-exhaustion.md)
- `BackupFailure` → [backup-failure.md](backup-failure.md)

## References
- **Grafana:** http://localhost:3000/d/cost-allocation
- **Prometheus:** http://localhost:9090/alerts
- **Docs:** [MONITORING_GUIDE.md](/mnt/wsl/.../docs/MONITORING_GUIDE.md)
- **PostgreSQL Config:** [docker-compose.monitoring.yml](/mnt/wsl/.../docker-compose.monitoring.yml)
- **Backup Script:** [scripts/backup/postgres-backup.sh](/mnt/wsl/.../scripts/backup/postgres-backup.sh)

---
**Last Updated:** 2025-11-24
**Version:** 1.0
**Maintainer:** Platform Team
