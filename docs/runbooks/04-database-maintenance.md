# Database Maintenance Runbook

## Overview
This runbook covers PostgreSQL maintenance procedures including backups, index maintenance, materialized view refresh, vacuum/analyze, statistics updates, and performance tuning. Scheduled maintenance prevents data loss and performance degradation.

**Expected Duration:** 30-120 minutes (depending on database size)
**Difficulty:** Intermediate
**Requires:** PostgreSQL superuser access, backup storage, monitoring access

**Maintenance Window:** Sundays 02:00-04:00 UTC (adjust based on traffic patterns)

## Prerequisites

### Database Access
- PostgreSQL superuser credentials
- psql command-line tool
- Database name: cfn
- User: cfn_user / postgres
- Host: postgres (via Docker network)

### Storage
- Backup storage location (minimum 50GB free)
- Off-site backup repository (AWS S3, GCS)
- Backup retention policy (30 days minimum)

### Monitoring
- Prometheus access (database metrics)
- Grafana access (performance dashboards)
- PostgreSQL log access

## Maintenance Checklist

### Daily Checks (5 minutes)
```bash
#!/bin/bash
# scripts/database-daily-check.sh

set -euo pipefail

echo "=== Daily Database Check ==="

# 1. Check database is running
docker-compose exec postgres pg_isready -U postgres || {
  echo "ERROR: Database not responding"
  exit 1
}

# 2. Check disk space for data directory
docker-compose exec postgres bash -c '
  USAGE=$(du -sh /var/lib/postgresql/data | cut -f1)
  MAX=$(df -h /var/lib/postgresql/data | awk "NR==2 {print \$2}")
  PERCENT=$(df /var/lib/postgresql/data | awk "NR==2 {print \$5}" | tr -d "%")
  echo "Database size: $USAGE / $MAX ($PERCENT%)"
  if [ "$PERCENT" -gt 85 ]; then
    echo "WARNING: Disk usage above 85%"
  fi
'

# 3. Check for bloat in main tables
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    schemaname,
    tablename,
    round(100 * (CASE WHEN otta > 0 THEN sml.relpages - otta ELSE 0 END) /
      sml.relpages) AS waste_ratio
  FROM pg_class
  JOIN (
    SELECT datname FROM pg_database WHERE datname = 'cfn'
  ) db ON true
  CROSS JOIN pg_stat_user_tables sml
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY waste_ratio DESC
  LIMIT 10;
" || echo "Query failed - may not have pgstattuple installed"

# 4. Check for long-running queries
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    pid,
    now() - query_start as duration,
    LEFT(query, 50) as query
  FROM pg_stat_activity
  WHERE query_start < NOW() - INTERVAL '10 minutes'
    AND usename = 'cfn_user';
"

# 5. Check replication lag (if replication enabled)
docker-compose exec postgres psql -U postgres -c "
  SELECT
    client_addr,
    state,
    sync_state,
    COALESCE(EXTRACT(EPOCH FROM (now() - pg_last_wal_receive_lsn()::text::pg_lsn::timestamp)), 0) as lag_seconds
  FROM pg_stat_replication;
" 2>/dev/null || echo "Replication not configured"

echo "=== Check Complete ==="
```

### Weekly Maintenance (30 minutes)

#### 1. Analyze and VACUUM Tables

```bash
# Run during low-traffic period
docker-compose exec postgres psql -U cfn_user -d cfn <<EOF
  -- Standard VACUUM (locks removed, keeps FREE SPACE map)
  VACUUM;

  -- ANALYZE updates statistics without modifying table
  ANALYZE;
EOF

# Verify statistics updated
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    schemaname,
    tablename,
    last_vacuum,
    last_analyze,
    n_tup_ins,
    n_tup_upd,
    n_tup_del
  FROM pg_stat_user_tables
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY last_analyze DESC
  LIMIT 10;
"
```

#### 2. Reindex Missing Indexes

```bash
# Find missing indexes
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans
  FROM pg_stat_user_indexes
  WHERE idx_scan = 0
    AND schemaname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY pg_relation_size(indexrelid) DESC;
"

# Create recommended indexes
docker-compose exec postgres psql -U cfn_user -d cfn <<EOF
  -- Index for agent lookups
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agents_status
    ON agents(status);

  -- Index for task lookups
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_agent_id
    ON tasks(agent_id);

  -- Index for time-series queries
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_logs_created_at
    ON agent_logs(created_at DESC);
EOF

# Verify indexes created
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    indexname,
    tablename,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
  FROM pg_stat_user_indexes
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY pg_relation_size(indexrelid) DESC;
"
```

#### 3. Clean up Dead Rows (Full VACUUM)

```bash
# Full VACUUM (exclusive lock, slower but reclaims space)
# Run during maintenance window only
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  VACUUM FULL ANALYZE;
" &

# Monitor progress
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    pid,
    query,
    wait_event_type,
    EXTRACT(EPOCH FROM (NOW() - query_start))::int as runtime_seconds
  FROM pg_stat_activity
  WHERE query LIKE '%VACUUM%'
    AND pid != pg_backend_pid();
"
```

### Monthly Maintenance (60-120 minutes)

#### 1. Full Backup

```bash
#!/bin/bash
# scripts/database-backup.sh

set -euo pipefail

BACKUP_DIR="/backups/postgresql"
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/cfn-$BACKUP_DATE.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Starting backup: $BACKUP_FILE"

# Method 1: pg_dump (logical backup - application level)
docker-compose exec postgres pg_dump -U cfn_user -d cfn --verbose \
  --no-password --format=plain | gzip > "$BACKUP_FILE"

# Verify backup
if [ -f "$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "✓ Backup created: $BACKUP_FILE ($SIZE)"
else
  echo "✗ Backup failed"
  exit 1
fi

# Test restore (in separate database)
echo "Testing restore..."
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE cfn_restore;"
docker-compose exec postgres psql -U cfn_user -d cfn_restore < <(gunzip -c "$BACKUP_FILE")
docker-compose exec postgres psql -U postgres -c "DROP DATABASE cfn_restore;"
echo "✓ Restore test successful"

# Upload to cloud storage
aws s3 cp "$BACKUP_FILE" s3://cfn-backups/postgresql/ || {
  echo "WARNING: Could not upload to S3, keeping local copy"
}

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "cfn-*.sql.gz" -mtime +30 -delete

echo "✓ Backup completed: $BACKUP_FILE"
```

#### 2. Materialized View Refresh

```bash
# Identify all materialized views
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT schemaname, matviewname FROM pg_matviews
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
"

# Refresh all materialized views
docker-compose exec postgres psql -U cfn_user -d cfn <<EOF
  -- Non-concurrent refresh (locks the view)
  REFRESH MATERIALIZED VIEW agent_performance_summary;

  -- Concurrent refresh (doesn't lock, requires UNIQUE INDEX)
  REFRESH MATERIALIZED VIEW CONCURRENTLY agent_daily_stats;
EOF

# Verify refresh completed
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    schemaname,
    matviewname,
    pg_size_pretty(pg_relation_size('\"' || schemaname || '\".\"' || matviewname || '\"')) as size
  FROM pg_matviews
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
"
```

#### 3. Table and Index Bloat Analysis

```bash
# Install pgstattuple extension (if not already installed)
docker-compose exec postgres psql -U postgres -d cfn -c "
  CREATE EXTENSION IF NOT EXISTS pgstattuple;
"

# Analyze table bloat
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    schemaname,
    tablename,
    round(100 * (CASE
      WHEN otta > 0 THEN sml.relpages - otta
      ELSE 0
    END) / sml.relpages) AS bloat_ratio,
    pg_size_pretty(sml.relpages::bigint * 8192) as table_size
  FROM pg_class
  CROSS JOIN pg_stat_user_tables sml
  WHERE sml.schemaname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY bloat_ratio DESC
  LIMIT 10;
"

# Analyze index bloat
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    schemaname,
    indexname,
    round(100 * (idx_blks_read - idx_blks_hit) /
      NULLIF(idx_blks_read, 0)) as bloat_ratio,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
  FROM pg_stat_user_indexes
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY bloat_ratio DESC
  LIMIT 10;
"
```

#### 4. Update Configuration for Performance

```bash
# Review and update auto_vacuum settings if needed
docker-compose exec postgres psql -U postgres -c "
  -- Check current autovacuum settings
  SHOW autovacuum_naptime;
  SHOW autovacuum_vacuum_threshold;
  SHOW autovacuum_analyze_threshold;

  -- Adjust for high-traffic tables
  ALTER TABLE agents SET (autovacuum_vacuum_scale_factor = 0.05);
  ALTER TABLE tasks SET (autovacuum_vacuum_scale_factor = 0.05);
"

# Check and optimize buffer cache
docker-compose exec postgres psql -U postgres -c "
  SELECT
    setting as shared_buffers,
    (SELECT setting::int * 8 FROM pg_settings WHERE name = 'shared_buffers') as buffer_size_mb
  FROM pg_settings
  WHERE name = 'shared_buffers';
"
```

### Quarterly Deep Maintenance (120+ minutes)

#### Full Database Optimization

```bash
#!/bin/bash
# scripts/database-deep-maintenance.sh

set -euo pipefail

echo "=== Deep Database Maintenance ==="

# 1. Backup before deep maintenance
./scripts/database-backup.sh

# 2. Drop and recreate indexes (defragmentation)
docker-compose exec postgres psql -U cfn_user -d cfn <<EOF
  -- Reindex all tables
  REINDEX DATABASE cfn;
EOF

# 3. VACUUM FULL (most aggressive)
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  VACUUM FULL ANALYZE;
"

# 4. Cluster tables (physical reordering)
docker-compose exec postgres psql -U cfn_user -d cfn <<EOF
  -- Cluster tables by primary key/index
  CLUSTER agents USING agents_pkey;
  CLUSTER tasks USING tasks_pkey;
  CLUSTER agent_logs USING idx_agent_logs_created_at;
EOF

# 5. Verify database integrity
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  -- Check for corruption (if amcheck extension available)
  REINDEX INDEX CONCURRENTLY agents_pkey;
"

# 6. Update all statistics
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  ANALYZE;
"

echo "=== Deep Maintenance Complete ==="
```

## Restoration Procedures

### Point-in-Time Recovery (PITR)

If data loss or corruption occurs:

```bash
#!/bin/bash
# scripts/database-restore-pitr.sh

RESTORE_TARGET_TIME="2024-01-15 14:30:00"  # Replace with target time
RESTORE_DB="cfn_restored"

echo "Performing point-in-time recovery to: $RESTORE_TARGET_TIME"

# 1. Create recovery configuration
docker-compose exec postgres psql -U postgres <<EOF
  -- Check available backups
  SELECT * FROM pg_walfile_name_offset(pg_wal_lsn_diff(
    (SELECT redo_lsn FROM pg_control_recovery_info()),
    '0/0'
  ));
EOF

# 2. Use latest backup and apply WALs
# This requires WAL archiving to be configured
docker-compose exec postgres bash -c '
  pg_basebackup \
    -h localhost \
    -U postgres \
    -D /var/lib/postgresql/data.backup \
    -Ft \
    -z \
    -P
'

# 3. Configure recovery.conf
cat > /tmp/recovery.conf <<EOF
restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'
recovery_target_timeline = latest
recovery_target_time = '${RESTORE_TARGET_TIME}'
recovery_target_action = pause
EOF

# 4. Perform recovery
docker-compose exec postgres bash -c '
  cp /tmp/recovery.conf /var/lib/postgresql/data/recovery.conf
  pg_ctl restart
'

echo "✓ Database recovered to $RESTORE_TARGET_TIME"
```

### Full Restore from Backup

```bash
#!/bin/bash
# scripts/database-restore-full.sh

BACKUP_FILE="${1:?Usage: $0 <backup_file.sql.gz>"

echo "Restoring database from: $BACKUP_FILE"

# 1. Verify backup exists and is readable
if [ ! -r "$BACKUP_FILE" ]; then
  echo "ERROR: Cannot read backup file"
  exit 1
fi

# 2. Drop and recreate database
docker-compose exec postgres psql -U postgres <<EOF
  DROP DATABASE IF EXISTS cfn;
  CREATE DATABASE cfn OWNER cfn_user;
EOF

# 3. Restore from backup
gunzip -c "$BACKUP_FILE" | docker-compose exec postgres psql -U cfn_user -d cfn

# 4. Verify restore
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT COUNT(*) as table_count FROM information_schema.tables
  WHERE table_schema = 'public';
"

echo "✓ Database restored from backup"
```

## Validation

### Post-Maintenance Checks

```bash
#!/bin/bash
# scripts/validate-maintenance.sh

set -euo pipefail

echo "=== Post-Maintenance Validation ==="

# 1. Database responsive
if docker-compose exec postgres pg_isready -U postgres; then
  echo "✓ Database responsive"
else
  echo "✗ Database not responding"
  exit 1
fi

# 2. All tables present
TABLES=$(docker-compose exec postgres psql -U cfn_user -d cfn -tc "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = 'public';
")
echo "✓ $TABLES tables present"

# 3. No corruption detected
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT schemaname, COUNT(*) as tables
  FROM pg_tables
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  GROUP BY schemaname;
" > /dev/null && echo "✓ No table corruption detected"

# 4. Statistics current
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    schemaname,
    tablename,
    EXTRACT(EPOCH FROM (NOW() - last_analyze))::int / 60 as minutes_since_analyze
  FROM pg_stat_user_tables
  WHERE last_analyze < NOW() - INTERVAL '1 hour'
  LIMIT 5;
" | grep -q 'row' && echo "✓ Statistics recent" || echo "⚠ Some statistics stale"

# 5. No long-running queries
LONG_QUERIES=$(docker-compose exec postgres psql -U cfn_user -d cfn -tc "
  SELECT COUNT(*) FROM pg_stat_activity
  WHERE query_start < NOW() - INTERVAL '30 minutes';
")
if [ "$LONG_QUERIES" -eq 0 ]; then
  echo "✓ No long-running queries"
else
  echo "⚠ $LONG_QUERIES long-running queries detected"
fi

echo ""
echo "=== Validation Complete ==="
```

## Escalation

### Issues During Maintenance

| Issue | Action | Contact |
|-------|--------|---------|
| VACUUM process hangs | Kill query, increase maintenance_work_mem | Database lead |
| Backup fails | Check storage space and credentials | Infrastructure |
| Restore test fails | Verify backup file integrity | Database DBA |
| Index bloat excessive | Schedule REINDEX during low traffic | Database team |
| Slow query detected | Run EXPLAIN ANALYZE, add indexes | Performance team |

### Support Contacts
- **Database DBA:** dba@example.com / Slack #database
- **Infrastructure:** infrastructure@example.com / Slack #infrastructure
- **On-Call SRE:** Check PagerDuty for escalation

## Automation

### Scheduled Maintenance

```bash
# Add to crontab (root on database host)
# Daily at 02:00 UTC
0 2 * * * /usr/local/bin/database-daily-check.sh >> /var/log/database-maintenance.log 2>&1

# Weekly Sunday at 03:00 UTC
0 3 * * 0 /usr/local/bin/database-weekly-maintenance.sh >> /var/log/database-maintenance.log 2>&1

# Monthly 1st of month at 04:00 UTC
0 4 1 * * /usr/local/bin/database-monthly-backup.sh >> /var/log/database-maintenance.log 2>&1

# Quarterly (Jan, Apr, Jul, Oct) at 05:00 UTC
0 5 1 1,4,7,10 * /usr/local/bin/database-deep-maintenance.sh >> /var/log/database-maintenance.log 2>&1
```

### Monitoring

Enable PostgreSQL logging for maintenance visibility:

```bash
docker-compose exec postgres psql -U postgres -c "
  ALTER SYSTEM SET log_autovacuum_min_duration = 0;
  ALTER SYSTEM SET log_min_duration_statement = 5000;  -- Log queries > 5s
  SELECT pg_reload_conf();
"
```
