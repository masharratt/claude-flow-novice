# Backup Failure Runbook

## Alert Information
- **Alert Name:** `BackupFailure`
- **Severity:** P1
- **Notification:** PagerDuty + Slack #cfn-alerts + #data-team
- **Threshold:** Backup job failed or last backup >24 hours old

## Symptoms
- Backup script exited with error
- No recent backup files in backup directory
- PostgreSQL/Redis backup missing
- Disk full preventing backup write
- Backup verification failed
- Prometheus metric showing backup failure

**Grafana Dashboards:**
- System Resources Dashboard → Backup Status panel

**Common Error Messages:**
```
ERROR: PostgreSQL backup failed: pg_dump error
ERROR: Redis backup failed: cannot write RDB snapshot
ERROR: Backup directory not writable: Permission denied
ERROR: No space left on device during backup
WARNING: Last successful backup: 36 hours ago (threshold: 24 hours)
ERROR: Backup verification failed: corrupted archive
```

## Diagnosis

### 1. Check Backup Status
```bash
# Check last backup times
ls -lh /backups/postgres/ | tail -5
ls -lh /backups/redis/ | tail -5

# Check backup ages
find /backups -type f -name "*.sql.gz" -mtime +1 -ls  # >24h old
find /backups -type f -name "*.rdb" -mtime +1 -ls

# Verify Prometheus backup metrics
curl -s 'http://localhost:9090/api/v1/query?query=backup_last_success_timestamp_seconds' | jq

# Check backup script logs
tail -100 /var/log/postgres-backup.log
tail -100 /var/log/redis-backup.log
```

### 2. Identify Backup Failure Type
```bash
# Check PostgreSQL backup script status
systemctl status postgres-backup.timer  # If using systemd
crontab -l | grep postgres-backup

# Check Redis backup configuration
docker exec cfn-redis redis-cli CONFIG GET save
docker exec cfn-redis redis-cli LASTSAVE

# Check backup script execution
ls -l /backups/*.log
grep -i error /backups/*.log
```

### 3. Check Storage Availability
```bash
# Check disk space on backup destination
df -h /backups
# Expected: >20% free space

# Check inode availability
df -i /backups

# Check write permissions
touch /backups/test-write && rm /backups/test-write
# Should succeed without error

# Check backup directory ownership
ls -ld /backups
# Expected: writable by backup user
```

### 4. Check Database Connectivity
```bash
# Test PostgreSQL connectivity
docker exec cfn-postgres pg_isready -U cfn_user -d cfn
# Expected: "accepting connections"

# Test PostgreSQL backup command
docker exec cfn-postgres pg_dump -U cfn_user -d cfn --schema-only
# Should output schema without error

# Test Redis connectivity
docker exec cfn-redis redis-cli PING
# Expected: PONG

# Test Redis save command
docker exec cfn-redis redis-cli BGSAVE
# Expected: Background saving started
```

### 5. Identify Root Cause

**Common root causes:**
- Disk full on backup destination
- Permission denied (backup user can't write)
- Database connection failure
- pg_dump/redis-cli command failed
- Backup script crashed (syntax error, missing dependency)
- Backup verification failed (corrupted data)
- Cron job not running (systemd timer disabled)
- Network mount unavailable (NFS/SMB)

## Resolution

### Immediate Actions (P1 - 15 minute response)

**Action 1: Free Disk Space**
```bash
# If disk full, remove old backups
cd /backups

# Remove backups older than 7 days
find . -type f -name "*.sql.gz" -mtime +7 -delete
find . -type f -name "*.rdb" -mtime +7 -delete
find . -type f -name "*.aof" -mtime +7 -delete

# Verify space freed
df -h /backups
# Expected: >20% free
```

**Action 2: Run Manual Backup**
```bash
# PostgreSQL manual backup
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

docker exec cfn-postgres pg_dump -U cfn_user -d cfn | \
  gzip > /backups/postgres/cfn-manual-${TIMESTAMP}.sql.gz

# Verify backup created
ls -lh /backups/postgres/cfn-manual-${TIMESTAMP}.sql.gz
# Expected: Non-zero file size

# Redis manual backup
docker exec cfn-redis redis-cli BGSAVE
sleep 5  # Wait for background save

docker exec cfn-redis redis-cli LASTSAVE
# Verify timestamp is recent

# Copy RDB to backup directory
docker cp cfn-redis:/data/dump.rdb /backups/redis/dump-${TIMESTAMP}.rdb
gzip /backups/redis/dump-${TIMESTAMP}.rdb
```

**Action 3: Verify Backup Integrity**
```bash
# Test PostgreSQL backup restoration
gunzip -c /backups/postgres/cfn-manual-${TIMESTAMP}.sql.gz | head -100
# Should show valid SQL

# Test backup size (should be >1MB for production data)
du -h /backups/postgres/cfn-manual-${TIMESTAMP}.sql.gz

# Verify compressed file integrity
gunzip -t /backups/postgres/cfn-manual-${TIMESTAMP}.sql.gz
# Expected: OK

# Check Redis backup
file /backups/redis/dump-${TIMESTAMP}.rdb.gz
# Expected: gzip compressed data
```

### Complete Fix

**Step 1: Fix Backup Script**
```bash
# Create/update PostgreSQL backup script
sudo tee /usr/local/bin/postgres-backup.sh <<'EOF'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS=7

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Run backup
docker exec cfn-postgres pg_dump -U cfn_user -d cfn | \
  gzip > "$BACKUP_DIR/cfn-${TIMESTAMP}.sql.gz"

# Verify backup created
if [ ! -s "$BACKUP_DIR/cfn-${TIMESTAMP}.sql.gz" ]; then
  echo "ERROR: Backup file empty or not created"
  exit 1
fi

# Test backup integrity
if ! gunzip -t "$BACKUP_DIR/cfn-${TIMESTAMP}.sql.gz"; then
  echo "ERROR: Backup file corrupted"
  exit 1
fi

# Update Prometheus metric
echo "backup_last_success_timestamp_seconds $(date +%s)" > /var/lib/node_exporter/textfile_collector/postgres_backup.prom

# Remove old backups
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed successfully: $BACKUP_DIR/cfn-${TIMESTAMP}.sql.gz"
EOF

sudo chmod +x /usr/local/bin/postgres-backup.sh

# Create Redis backup script
sudo tee /usr/local/bin/redis-backup.sh <<'EOF'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/backups/redis"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS=7

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Trigger Redis background save
docker exec cfn-redis redis-cli BGSAVE

# Wait for save to complete (max 60 seconds)
for i in {1..60}; do
  if docker exec cfn-redis redis-cli LASTSAVE | grep -q "$(date +%s)"; then
    break
  fi
  sleep 1
done

# Copy RDB file
docker cp cfn-redis:/data/dump.rdb "$BACKUP_DIR/dump-${TIMESTAMP}.rdb"

# Compress backup
gzip "$BACKUP_DIR/dump-${TIMESTAMP}.rdb"

# Verify backup
if [ ! -s "$BACKUP_DIR/dump-${TIMESTAMP}.rdb.gz" ]; then
  echo "ERROR: Backup file empty or not created"
  exit 1
fi

# Update Prometheus metric
echo "backup_last_success_timestamp_seconds $(date +%s)" > /var/lib/node_exporter/textfile_collector/redis_backup.prom

# Remove old backups
find "$BACKUP_DIR" -type f -name "*.rdb.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed successfully: $BACKUP_DIR/dump-${TIMESTAMP}.rdb.gz"
EOF

sudo chmod +x /usr/local/bin/redis-backup.sh
```

**Step 2: Configure Automatic Backups**
```bash
# Using cron (simple approach)
(crontab -l 2>/dev/null | grep -v postgres-backup; echo "0 */6 * * * /usr/local/bin/postgres-backup.sh >> /var/log/postgres-backup.log 2>&1") | crontab -
(crontab -l 2>/dev/null | grep -v redis-backup; echo "15 */6 * * * /usr/local/bin/redis-backup.sh >> /var/log/redis-backup.log 2>&1") | crontab -

# Or using systemd timers (recommended)
sudo tee /etc/systemd/system/postgres-backup.service <<EOF
[Unit]
Description=PostgreSQL Backup
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/postgres-backup.sh
EOF

sudo tee /etc/systemd/system/postgres-backup.timer <<EOF
[Unit]
Description=PostgreSQL Backup Timer

[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

# Enable and start timer
sudo systemctl daemon-reload
sudo systemctl enable postgres-backup.timer
sudo systemctl start postgres-backup.timer

# Verify timer
sudo systemctl list-timers | grep postgres-backup
```

**Step 3: Implement Backup Verification**
```bash
# Create backup verification script
sudo tee /usr/local/bin/verify-backups.sh <<'EOF'
#!/bin/bash
set -euo pipefail

echo "=== Backup Verification Report ==="
echo "Date: $(date)"
echo

# Check PostgreSQL backups
echo "PostgreSQL Backups:"
if [ -d /backups/postgres ]; then
  latest_pg=$(ls -t /backups/postgres/*.sql.gz 2>/dev/null | head -1)
  if [ -n "$latest_pg" ]; then
    age_hours=$(( ($(date +%s) - $(stat -c %Y "$latest_pg")) / 3600 ))
    size=$(du -h "$latest_pg" | cut -f1)
    echo "  Latest: $(basename "$latest_pg")"
    echo "  Age: ${age_hours} hours"
    echo "  Size: $size"

    # Test integrity
    if gunzip -t "$latest_pg" 2>/dev/null; then
      echo "  Integrity: OK"
    else
      echo "  Integrity: FAILED"
      exit 1
    fi
  else
    echo "  ERROR: No backups found"
    exit 1
  fi
fi
echo

# Check Redis backups
echo "Redis Backups:"
if [ -d /backups/redis ]; then
  latest_redis=$(ls -t /backups/redis/*.rdb.gz 2>/dev/null | head -1)
  if [ -n "$latest_redis" ]; then
    age_hours=$(( ($(date +%s) - $(stat -c %Y "$latest_redis")) / 3600 ))
    size=$(du -h "$latest_redis" | cut -f1)
    echo "  Latest: $(basename "$latest_redis")"
    echo "  Age: ${age_hours} hours"
    echo "  Size: $size"

    # Test integrity
    if gunzip -t "$latest_redis" 2>/dev/null; then
      echo "  Integrity: OK"
    else
      echo "  Integrity: FAILED"
      exit 1
    fi
  else
    echo "  ERROR: No backups found"
    exit 1
  fi
fi
echo

echo "=== Backup Verification Complete ==="
EOF

sudo chmod +x /usr/local/bin/verify-backups.sh

# Run verification daily
(crontab -l 2>/dev/null; echo "0 7 * * * /usr/local/bin/verify-backups.sh | mail -s 'Backup Verification Report' ops@example.com") | crontab -
```

**Step 4: Test Backup Restoration**
```bash
# Test PostgreSQL restoration (in test environment)
TEST_DB="cfn_test_restore"

docker exec cfn-postgres psql -U postgres -c "DROP DATABASE IF EXISTS $TEST_DB;"
docker exec cfn-postgres psql -U postgres -c "CREATE DATABASE $TEST_DB OWNER cfn_user;"

gunzip -c /backups/postgres/cfn-latest.sql.gz | \
  docker exec -i cfn-postgres psql -U cfn_user -d "$TEST_DB"

# Verify restoration
docker exec cfn-postgres psql -U cfn_user -d "$TEST_DB" -c "SELECT count(*) FROM agents;"
# Expected: Non-zero count

# Cleanup test database
docker exec cfn-postgres psql -U postgres -c "DROP DATABASE $TEST_DB;"
```

## Verification Checklist
- [ ] Alert cleared (successful backup within 24 hours)
- [ ] PostgreSQL backup created and verified
- [ ] Redis backup created and verified
- [ ] Backup files non-zero size
- [ ] Backup integrity tests pass
- [ ] Automatic backup scheduled (cron/systemd)
- [ ] Backup retention policy enforced
- [ ] Disk space adequate (>20% free)
- [ ] Backup restoration tested successfully
- [ ] Prometheus backup metrics updated

## Prevention

### Configuration Changes
1. **Automated backups:** Every 6 hours via systemd timers
2. **Retention policy:** Keep 7 days of backups
3. **Disk space monitoring:** Alert at >80% on backup volume
4. **Backup verification:** Daily integrity checks
5. **Offsite backups:** Copy to remote storage (S3/NFS)

### Monitoring Improvements
1. **Add alert:** No successful backup in 24 hours
2. **Add alert:** Backup file size <1MB (likely incomplete)
3. **Add alert:** Backup disk space <20%
4. **Add dashboard:** Backup status and trends
5. **Add metric:** Backup duration and size over time

### Process Changes
1. **Quarterly restore test:** Full restoration in staging environment
2. **Disaster recovery drill:** Annual DR simulation
3. **Backup validation:** Automated daily integrity checks
4. **Documentation:** Maintain restoration runbook
5. **Offsite replication:** Sync backups to remote location
6. **Compliance:** Document retention policy for audits

## Post-Incident

### Required Actions
1. Create post-incident review within 24 hours
2. Fix backup failure root cause within 48 hours
3. Test backup restoration in staging
4. Implement automated verification
5. Update disaster recovery documentation

### Post-Incident Review Template
```markdown
# PIR: Backup Failure - [DATE]

## Timeline
- [TIME]: Alert fired (no backup in 24h)
- [TIME]: On-call notified
- [TIME]: Root cause identified
- [TIME]: Manual backup completed
- [TIME]: Backup script fixed
- [TIME]: Automated backups restored
- [TIME]: Alert cleared

## Root Cause
[Disk full / permission denied / database offline / script error]

## Impact
- **Duration:** [X hours without backups]
- **Data at risk:** [amount] of data
- **Last good backup:** [timestamp]
- **Potential data loss:** [X hours] if disaster occurred

## Resolution
[Freed disk space / fixed permissions / repaired script / restored cron]

## Lessons Learned
- No backup monitoring in place
- Disk space not monitored
- Backup verification not automated
- Restoration never tested

## Action Items
1. Fix backup script - Owner: DevOps - Due: [date]
2. Add backup monitoring - Owner: SRE - Due: [date]
3. Implement verification - Owner: DevOps - Due: [date]
4. Test restoration - Owner: DBA - Due: [date]
5. Configure offsite backups - Owner: Security - Due: [date]
```

## Related Alerts
- `DiskSpaceExhaustion` → [disk-space-exhaustion.md](disk-space-exhaustion.md)
- `PostgresConnectionLoss` → [postgres-connection-loss.md](postgres-connection-loss.md)
- `RedisConnectionLoss` → [redis-connection-loss.md](redis-connection-loss.md)

## References
- **Grafana:** http://localhost:3000/d/system-resources
- **Prometheus:** http://localhost:9090/alerts
- **Docs:** [MONITORING_GUIDE.md](/mnt/wsl/.../docs/MONITORING_GUIDE.md)
- **Backup Scripts:** [/usr/local/bin/*-backup.sh]
- **PostgreSQL Backup:** https://www.postgresql.org/docs/current/backup-dump.html
- **Redis Backup:** https://redis.io/docs/manual/persistence/

---
**Last Updated:** 2025-11-24
**Version:** 1.0
**Maintainer:** Platform Team + Data Team
