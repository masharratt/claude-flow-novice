# Disaster Recovery Runbook

## Overview
This runbook covers preparation for and response to disaster scenarios including data loss, complete infrastructure failure, multi-region failover, and business continuity. Focuses on RTO (Recovery Time Objective) and RPO (Recovery Point Objective) targets.

**Expected Duration:** Variable (5 min emergency → 120 min full recovery)
**Difficulty:** Advanced
**Requires:** Complete backup access, database credentials, cloud infrastructure access

## RTO/RPO Targets

| Scenario | RTO | RPO | Priority |
|----------|-----|-----|----------|
| Single agent down | 5 min | 0 min | P3 |
| Database corruption | 30 min | 15 min | P2 |
| Data center failure | 4 hours | 1 hour | P1 |
| Complete system loss | 24 hours | 6 hours | P1 |

## Pre-Disaster Preparation

### Backup Strategy

**Daily Backups:**
```bash
#!/bin/bash
# scripts/backup-all.sh - Run daily at 02:00 UTC

set -euo pipefail

BACKUP_DIR="/backups/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

echo "Starting daily backup at $(date)"

# 1. PostgreSQL backup
echo "Backing up PostgreSQL..."
docker-compose exec postgres pg_dump -U cfn_user -d cfn --format=custom \
  | gzip > "$BACKUP_DIR/cfn-postgres-$(date +%H%M%S).dump.gz"

# 2. Redis backup
echo "Backing up Redis..."
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
sleep 5
cp /var/lib/docker/volumes/redis-data/_data/dump.rdb \
   "$BACKUP_DIR/redis-$(date +%H%M%S).rdb"

# 3. Configuration backup
echo "Backing up configurations..."
tar -czf "$BACKUP_DIR/config-$(date +%H%M%S).tar.gz" \
  docker-compose.yml \
  docker-compose.monitoring.yml \
  monitoring/ \
  .env.production

# 4. Upload to cloud storage
echo "Uploading to cloud..."
aws s3 sync "$BACKUP_DIR" "s3://cfn-backups/$(date +%Y/%m/%d)/" --delete

# 5. Verify backups
echo "Verifying backups..."
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR" | wc -l)
if [ "$BACKUP_COUNT" -ge 3 ]; then
  echo "✓ All backups created successfully"
else
  echo "✗ Backup incomplete - only $BACKUP_COUNT files"
  exit 1
fi

echo "Backup complete at $(date)"
```

**Weekly Full System Backup:**
```bash
#!/bin/bash
# scripts/full-system-backup.sh - Run weekly Sunday at 04:00 UTC

BACKUP_FILE="/backups/full-system-$(date +%Y%m%d-%H%M%S).tar.gz"

# Backup all volumes and configurations
docker run --rm \
  -v postgres-data:/postgres \
  -v redis-data:/redis \
  -v ./monitoring:/monitoring \
  -v ./:/app:ro \
  -v /backups:/backups \
  alpine tar -czf "$BACKUP_FILE" \
  --exclude='*.log' \
  --exclude='node_modules' \
  /postgres /redis /monitoring /app

# Upload to cloud with versioning
aws s3 cp "$BACKUP_FILE" "s3://cfn-backups/full-system/" \
  --storage-class GLACIER  # Long-term storage

# Keep local copy for 7 days
find /backups -name "full-system-*.tar.gz" -mtime +7 -delete

echo "✓ Full system backup completed: $BACKUP_FILE"
```

### Backup Verification

```bash
#!/bin/bash
# scripts/verify-backups.sh - Run weekly to test restores

set -euo pipefail

echo "=== Backup Verification ==="

# Test PostgreSQL restore
echo "Testing PostgreSQL restore..."
TEST_DB="cfn_restore_test_$(date +%s)"
docker-compose exec postgres createdb "$TEST_DB"

# Restore latest backup
LATEST_BACKUP=$(ls -t /backups/cfn-postgres-*.dump.gz | head -1)
if [ -z "$LATEST_BACKUP" ]; then
  echo "ERROR: No PostgreSQL backup found"
  exit 1
fi

gunzip -c "$LATEST_BACKUP" | \
  docker-compose exec postgres pg_restore -d "$TEST_DB"

# Verify tables
TABLE_COUNT=$(docker-compose exec postgres psql -U cfn_user -d "$TEST_DB" -tc "
  SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'
")

if [ "$TABLE_COUNT" -gt 0 ]; then
  echo "✓ PostgreSQL restore successful ($TABLE_COUNT tables)"
else
  echo "✗ PostgreSQL restore failed"
  exit 1
fi

# Cleanup test database
docker-compose exec postgres dropdb "$TEST_DB"

# Test Redis restore
echo "Testing Redis restore..."
LATEST_RDB=$(ls -t /backups/redis-*.rdb | head -1)
if [ -z "$LATEST_RDB" ]; then
  echo "WARNING: No Redis backup found"
else
  echo "✓ Redis backup exists: $(ls -lh $LATEST_RDB)"
fi

echo ""
echo "=== Backup Verification Complete ==="
```

### Backup Storage Locations

**Primary Backups:**
- Location: `/backups/` on database server
- Retention: 7 days
- Frequency: Daily

**Archive Backups:**
- Location: AWS S3 (s3://cfn-backups/)
- Retention: 30 days (standard), 1 year (Glacier)
- Frequency: Daily (incremental), Weekly (full)

**Off-Site Backups:**
- Location: AWS S3 (different region)
- Retention: 1 year minimum
- Encryption: AES-256

## Disaster Scenarios

### Scenario 1: Single Database Node Failure

**Detection:**
```bash
docker-compose ps postgres
# Status: Exit 1 or Restarting
```

**Recovery Steps:**

```bash
# 1. Immediate mitigation
docker-compose restart postgres

# 2. Wait for startup
until docker-compose exec postgres pg_isready -U postgres; do
  echo "Waiting for PostgreSQL..."
  sleep 5
done

# 3. Verify data integrity
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT COUNT(*) as table_count FROM information_schema.tables
  WHERE table_schema = 'public';
"

# 4. If restart fails, restore from backup
if [ $? -ne 0 ]; then
  docker-compose down postgres

  # Restore from most recent backup
  LATEST_BACKUP=$(ls -t /backups/cfn-postgres-*.dump.gz | head -1)
  gunzip -c "$LATEST_BACKUP" | docker-compose exec postgres pg_restore

  docker-compose up -d postgres
fi

# 5. Verify recovery
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT COUNT(*) FROM agents;  -- Should return recent agent count
"

# RTO: 5 minutes, RPO: < 15 minutes
```

---

### Scenario 2: Complete Data Loss / Corruption

**Detection:**
```bash
# Alerts: DatabaseIntegrityError, TableCorruption
# Manual check: SELECT fails, data missing or inconsistent
```

**Recovery Steps:**

```bash
#!/bin/bash
# scripts/restore-from-backup.sh

RESTORE_TIME="${1:?Usage: $0 <YYYYMMDD-HHMMSS>}"  # Backup timestamp
BACKUP_FILE="/backups/cfn-postgres-${RESTORE_TIME}.dump.gz"

echo "Restoring database from backup: $BACKUP_FILE"

# 1. Verify backup exists and is readable
if [ ! -r "$BACKUP_FILE" ]; then
  echo "ERROR: Backup not found or not readable"
  exit 1
fi

# 2. Stop running services
echo "Stopping services..."
docker-compose down

# 3. Backup current corrupted data
echo "Backing up corrupted data for forensics..."
docker run --rm \
  -v postgres-data:/postgres-data \
  -v /backups:/backups \
  alpine tar -czf /backups/corrupted-postgres-$(date +%s).tar.gz /postgres-data

# 4. Drop corrupted data
echo "Removing corrupted data..."
docker volume rm postgres-data
docker volume create postgres-data

# 5. Restore from backup
echo "Restoring from backup..."
docker-compose up -d postgres

until docker-compose exec postgres pg_isready -U postgres; do
  sleep 5
done

# 6. Restore data
gunzip -c "$BACKUP_FILE" | docker-compose exec postgres pg_restore

# 7. Verify restore
echo "Verifying restore..."
AGENT_COUNT=$(docker-compose exec postgres psql -U cfn_user -d cfn -tc "
  SELECT COUNT(*) FROM agents;
")

echo "✓ Database restored with $AGENT_COUNT agents"

# 8. Restart all services
docker-compose up -d

# RTO: 30 minutes, RPO: Based on backup frequency
```

---

### Scenario 3: Replication Lag / Secondary Out of Sync

**Detection:**
```bash
# Check replication status
docker-compose exec postgres psql -U postgres -c "
  SELECT
    client_addr,
    state,
    sync_state,
    EXTRACT(EPOCH FROM (NOW() - pg_last_wal_receive_lsn()::text::pg_lsn::timestamp)) as lag_seconds
  FROM pg_stat_replication;
"

# If lag_seconds > 60, replication is lagging
```

**Recovery Steps:**

```bash
# 1. Check secondary database
docker exec postgres-replica pg_isready -U postgres

# 2. If replica stopped, restart it
docker-compose restart postgres-replica

# 3. Monitor catch-up progress
watch -n 5 'docker-compose exec postgres psql -U postgres -c "
  SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_wal_receive_lsn()::text::pg_lsn::timestamp)) as lag_seconds FROM pg_stat_replication;
"'

# 4. If replica won't catch up, resync
docker-compose exec postgres psql -U postgres -c "
  -- On primary, get current WAL position
  SELECT pg_current_wal_lsn();
"

# Stop replica, take fresh backup from primary, restore on replica

# 5. Re-establish replication
docker-compose exec postgres-replica psql -U postgres -c "
  PRIMARY_CONNINFO='host=postgres port=5432 user=replication password=\$REPLICATION_PASSWORD' \
  STANDBY_MODE=on \
  pg_start_backup('replica_resync', true);
"

# RTO: 15-30 minutes, RPO: Dependent on backup method
```

---

### Scenario 4: Disk Space Exhaustion / Failed to Write

**Detection:**
```bash
# Alerts: DiskSpaceExhausted, IOWriteError
# Symptoms: INSERT/UPDATE statements fail
```

**Emergency Recovery:**

```bash
#!/bin/bash
# scripts/emergency-disk-recovery.sh

set -euo pipefail

echo "=== Emergency Disk Recovery ==="

# 1. Stop high-volume processes
echo "Stopping agents..."
docker-compose stop cfn-agent-1 cfn-agent-2 cfn-agent-3

# 2. Identify and delete old data
echo "Clearing old logs (>30 days)..."
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  DELETE FROM agent_logs WHERE created_at < NOW() - INTERVAL '30 days';
  VACUUM ANALYZE;
" || echo "Log cleanup may have failed due to disk space"

# 3. Truncate temporary tables
echo "Clearing temporary data..."
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  TRUNCATE TABLE temporary_queue;
  TRUNCATE TABLE session_cache;
  VACUUM;
"

# 4. Check freed space
echo "Checking freed space..."
df -h / | tail -1

# 5. If still critical, export data and restore
if [ $(df / | awk 'NR==2 {print $5}' | tr -d '%') -gt 95 ]; then
  echo "Still critical, performing emergency export..."

  # Export essential data only
  docker-compose exec postgres pg_dump -U cfn_user -d cfn \
    --table="agents" --table="tasks" \
    | gzip > /tmp/cfn-essential.sql.gz

  # Delete non-essential tables
  docker-compose exec postgres psql -U cfn_user -d cfn -c "
    DROP TABLE agent_logs;
    DROP TABLE coordination_events;
    VACUUM FULL;
  "

  # Move backup to external storage
  aws s3 cp /tmp/cfn-essential.sql.gz s3://cfn-backups/emergency/
fi

# 6. Restart services
docker-compose up -d cfn-agent-1 cfn-agent-2 cfn-agent-3

echo "✓ Emergency disk recovery complete"
```

---

### Scenario 5: Complete Infrastructure Failure

**Detection:**
```bash
# All containers down or unreachable
docker ps -a
# Empty or all showing "Exited"
```

**Full Rebuild:**

```bash
#!/bin/bash
# scripts/rebuild-from-scratch.sh

set -euo pipefail

BACKUP_DATE="${1:?Usage: $0 <YYYYMMDD>}"  # Date of backup to restore from

echo "=== Full System Rebuild from Backup ==="

# 1. Verify infrastructure ready
echo "Verifying infrastructure..."
docker --version || { echo "Docker not installed"; exit 1; }
df -h / | grep -q "." || { echo "No disk space"; exit 1; }

# 2. Remove all containers and volumes (careful!)
echo "Clearing old containers..."
docker-compose down -v  # Removes containers and volumes
docker system prune -f --volumes

# 3. Recreate volumes
echo "Creating volumes..."
docker volume create postgres-data
docker volume create redis-data
docker volume create prometheus-data
docker volume create grafana-data

# 4. Download backups from cloud
echo "Downloading backups..."
aws s3 cp "s3://cfn-backups/$BACKUP_DATE/cfn-postgres-*.dump.gz" /tmp/
aws s3 cp "s3://cfn-backups/$BACKUP_DATE/redis-*.rdb" /tmp/

# 5. Start infrastructure services
echo "Starting infrastructure..."
docker-compose up -d postgres redis

until docker-compose exec postgres pg_isready -U postgres; do
  sleep 5
done

# 6. Restore PostgreSQL
echo "Restoring PostgreSQL..."
POSTGRES_BACKUP=$(ls -t /tmp/cfn-postgres-*.dump.gz | head -1)
gunzip -c "$POSTGRES_BACKUP" | docker-compose exec postgres pg_restore -d cfn

# 7. Restore Redis
echo "Restoring Redis..."
REDIS_BACKUP=$(ls -t /tmp/redis-*.rdb | head -1)
cp "$REDIS_BACKUP" /var/lib/docker/volumes/redis-data/_data/dump.rdb
docker-compose restart redis

# 8. Start application services
echo "Starting application services..."
docker-compose up -d cfn-orchestrator cfn-agent-1 cfn-agent-2 cfn-agent-3

# 9. Start monitoring
echo "Starting monitoring..."
docker-compose -f docker-compose.monitoring.yml up -d

# 10. Verify all services healthy
echo "Verifying services..."
sleep 30

docker-compose ps | grep -E "postgres|redis|cfn-orchestrator" | grep -q "Up" && \
  echo "✓ All services running" || \
  { echo "ERROR: Services not running"; exit 1; }

# 11. Verify data integrity
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT COUNT(*) as agents FROM agents;
  SELECT COUNT(*) as tasks FROM tasks;
"

echo ""
echo "✓ Full system rebuild complete"

# RTO: 2-4 hours, RPO: Backup frequency
```

## Failover Procedures (Multi-Region)

### Active-Passive Failover

```bash
#!/bin/bash
# scripts/failover-to-backup-region.sh

set -euo pipefail

PRIMARY_REGION="us-east-1"
BACKUP_REGION="us-west-2"

echo "Initiating failover from $PRIMARY_REGION to $BACKUP_REGION"

# 1. Verify primary truly down
PRIMARY_HEALTH=$(curl -s -m 5 http://cfn.primary.region/health || echo "down")
if [ "$PRIMARY_HEALTH" != "down" ]; then
  echo "ERROR: Primary still responding - abort failover"
  exit 1
fi

# 2. Promote secondary
echo "Promoting secondary database to primary..."
aws rds promote-read-replica \
  --db-instance-identifier cfn-db-secondary \
  --region "$BACKUP_REGION"

# 3. Update DNS
echo "Updating DNS records..."
aws route53 change-resource-record-sets \
  --hosted-zone-id <ZONE_ID> \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "cfn.example.com",
        "Type": "A",
        "TTL": 60,
        "ResourceRecords": [{"Value": "backup.region.ip"}]
      }
    }]
  }'

# 4. Start backup region services
echo "Starting services in backup region..."
./scripts/rebuild-from-scratch.sh

# 5. Verify traffic routing
echo "Verifying traffic routing..."
for i in {1..30}; do
  RESPONSE=$(curl -s http://cfn.example.com/health)
  [ "$RESPONSE" = "ok" ] && echo "✓ Traffic routing to backup region" && break
  sleep 2
done

# 6. Alert team
echo "Failover complete - notifying team"
# Send to #incidents channel: Failover to backup region complete

# RTO: 30 minutes, RPO: 1 hour
```

## Testing Disaster Recovery

### Quarterly DR Test

```bash
#!/bin/bash
# scripts/test-disaster-recovery.sh

set -euo pipefail

echo "=== Quarterly Disaster Recovery Test ==="

TEST_DATE=$(date +%Y%m%d-%H%M%S)
TEST_DB="cfn_dr_test_$TEST_DATE"

# 1. Create test backup
echo "Creating test backup..."
docker-compose exec postgres pg_dump -U cfn_user -d cfn \
  | gzip > "/tmp/cfn-dr-test-$TEST_DATE.sql.gz"

# 2. Restore to test database
echo "Restoring to test database: $TEST_DB"
docker-compose exec postgres createdb "$TEST_DB"
gunzip -c "/tmp/cfn-dr-test-$TEST_DATE.sql.gz" | \
  docker-compose exec postgres psql -d "$TEST_DB"

# 3. Verify restore integrity
echo "Verifying restore..."
ORIGINAL_AGENTS=$(docker-compose exec postgres psql -U cfn_user -d cfn -tc "SELECT COUNT(*) FROM agents")
RESTORED_AGENTS=$(docker-compose exec postgres psql -U cfn_user -d "$TEST_DB" -tc "SELECT COUNT(*) FROM agents")

if [ "$ORIGINAL_AGENTS" -eq "$RESTORED_AGENTS" ]; then
  echo "✓ Agent count matches ($ORIGINAL_AGENTS)"
else
  echo "✗ Agent count mismatch - Original: $ORIGINAL_AGENTS, Restored: $RESTORED_AGENTS"
  exit 1
fi

# 4. Cleanup
echo "Cleaning up test database..."
docker-compose exec postgres dropdb "$TEST_DB"
rm "/tmp/cfn-dr-test-$TEST_DATE.sql.gz"

# 5. Document test
cat >> /var/log/dr-tests.log <<EOF
Date: $(date -u)
Test: Full restore from backup
Result: PASS
Duration: [calculate from timestamps]
Agents: $ORIGINAL_AGENTS → $RESTORED_AGENTS
EOF

echo ""
echo "✓ DR test complete - Results logged"
```

## Post-Disaster Verification

```bash
#!/bin/bash
# scripts/post-disaster-verification.sh

set -euo pipefail

echo "=== Post-Disaster Verification ==="

# 1. Verify data consistency
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  -- Check for orphaned records
  SELECT COUNT(*) as orphaned_tasks FROM tasks
  WHERE agent_id NOT IN (SELECT id FROM agents);
"

# 2. Verify all services
docker-compose ps | grep -E "postgres|redis|cfn-" | grep -q "Up"

# 3. Verify agent re-registration
sleep 10
AGENTS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*" | wc -l)
echo "Agents registered: $AGENTS"

# 4. Resume normal operations
docker-compose up -d

echo "✓ Post-disaster verification complete"
```

## Escalation & Support

| Scenario | RTO | Responsible | Escalation |
|----------|-----|-------------|-----------|
| Single node failure | 5 min | On-call SRE | Infrastructure |
| Data corruption | 30 min | DBA | VP Engineering |
| Multi-region failure | 4 hours | Disaster recovery lead | CTO |
| Complete loss | 24 hours | Head of platform | CEO |

### Support Contacts
- **Disaster Recovery Lead:** dr-lead@example.com
- **Database DBA:** dba@example.com
- **Infrastructure:** infrastructure@example.com
- **On-Call SRE:** PagerDuty escalation

## Documentation

- **Backup Schedule:** Automated via cron, monitored via CloudWatch
- **Test Results:** /var/log/dr-tests.log
- **Backup Locations:** AWS S3 (encrypted)
- **Recovery Procedures:** This runbook, versioned in git
