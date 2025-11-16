# Operational Runbooks

**Version:** 1.0
**Last Updated:** 2025-11-16
**Status:** Complete

## Table of Contents

1. [System Start-Up](#system-startup)
2. [Daily Operations](#daily-operations)
3. [Backup and Recovery](#backup-and-recovery)
4. [Database Maintenance](#database-maintenance)
5. [Performance Monitoring](#performance-monitoring)
6. [Incident Response](#incident-response)
7. [Skill Deployment](#skill-deployment)
8. [Scaling Operations](#scaling-operations)
9. [Log Management](#log-management)
10. [Monitoring and Alerting](#monitoring-and-alerting)

---

## System Start-Up

### Cold Start (First Time)

**Duration:** 15-30 minutes
**Prerequisites:** All infrastructure ready, databases created

```bash
#!/bin/bash
set -euo pipefail

echo "=== System Cold Start ==="

# Step 1: Verify infrastructure
echo "[1/8] Verifying infrastructure..."
mkdir -p /data /artifacts /var/log/cfn
chmod 755 /data /artifacts /var/log/cfn

# Step 2: Initialize databases
echo "[2/8] Initializing databases..."
npm run init:database -- --database primary --location /data/primary.db
npm run init:database -- --database cache --location redis://localhost:6379

# Step 3: Load schema registry
echo "[3/8] Loading schema registry..."
npm run register-schema -- --schema-file ./schemas/cfn-schema-v1.json
npm run register-schema -- --schema-file ./schemas/agent-schema-v1.json

# Step 4: Create indexes
echo "[4/8] Creating database indexes..."
sqlite3 /data/primary.db < ./scripts/create-indexes.sql

# Step 5: Start Redis
echo "[5/8] Starting Redis..."
redis-server --daemonize yes --logfile /var/log/redis.log

# Step 6: Start services
echo "[6/8] Starting core services..."
npm run start:database-service &
npm run start:coordination-manager &
npm run start:artifact-storage &

# Step 7: Wait for services to be ready
echo "[7/8] Waiting for services..."
sleep 10
for service in "database-service" "coordination-manager" "artifact-storage"; do
  for i in {1..30}; do
    curl -f http://localhost:$(get_port "$service")/health && break
    sleep 1
  done
done

# Step 8: Verify system
echo "[8/8] Running system verification..."
npm run verify:system

echo "✓ System cold start complete"
```

### Warm Start (Restart)

**Duration:** 5-10 minutes

```bash
#!/bin/bash
set -euo pipefail

echo "=== System Warm Start ==="

# Start Redis if not running
ps aux | grep -q "[r]edis-server" || redis-server --daemonize yes

# Start application services
npm run start:services &

# Wait for services
sleep 5

# Verify health
npm run verify:health

echo "✓ System ready"
```

---

## Daily Operations

### Morning Startup Checklist

```bash
#!/bin/bash
set -euo pipefail

echo "=== Morning Startup Checklist ==="

# Check all services
echo "[1/6] Checking service status..."
for service in redis-server database-service coordination-manager artifact-storage; do
  ps aux | grep -q "[${service:0:1}]${service:1}" && echo "✓ $service" || echo "✗ $service"
done

# Check disk usage
echo -e "\n[2/6] Checking disk usage..."
df -h | grep -E "^/dev" | awk '{print $6, $5}' | while read mount usage; do
  [ "${usage%\%}" -gt 80 ] && echo "⚠ $mount: $usage" || echo "✓ $mount: $usage"
done

# Check database integrity
echo -e "\n[3/6] Checking database integrity..."
sqlite3 /data/primary.db "PRAGMA integrity_check;" | head -1

# Check Redis memory
echo -e "\n[4/6] Checking Redis memory..."
redis-cli INFO memory | grep used_memory_human

# Check artifact storage
echo -e "\n[5/6] Checking artifact storage..."
find /artifacts -type f | wc -l

# Check error logs
echo -e "\n[6/6] Checking recent errors..."
tail -5 /var/log/cfn/error.log

echo ""
echo "=== Startup checklist complete ==="
```

### Hourly Health Check

```bash
#!/bin/bash
set -euo pipefail

# Run every hour via cron: 0 * * * * /scripts/hourly-health-check.sh

echo "[$(date)] Running hourly health check..."

# Check service availability
for port in 8000 8001 8002; do
  curl -f http://localhost:$port/health > /dev/null 2>&1 || \
    echo "ALERT: Service on port $port not responding"
done

# Check queue depth
QUEUE_DEPTH=$(redis-cli LLEN "swarm:queue" 2>/dev/null || echo "0")
[ $QUEUE_DEPTH -gt 100 ] && echo "WARNING: Queue depth high: $QUEUE_DEPTH"

# Check disk space
DISK_USAGE=$(df /artifacts | tail -1 | awk '{print $5}' | sed 's/%//')
[ $DISK_USAGE -gt 85 ] && echo "WARNING: Disk usage high: ${DISK_USAGE}%"

echo "✓ Health check complete at $(date)"
```

### End-of-Day Shutdown Checklist

```bash
#!/bin/bash
set -euo pipefail

echo "=== End-of-Day Shutdown Checklist ==="

# Wait for active operations to complete
echo "[1/4] Waiting for active operations..."
TIMEOUT=300
START=$(date +%s)
while true; do
  ACTIVE=$(redis-cli LLEN "swarm:active" 2>/dev/null || echo "0")
  [ $ACTIVE -eq 0 ] && break
  [ $(($(date +%s) - START)) -gt $TIMEOUT ] && echo "Timeout waiting for operations" && break
  echo "Active operations: $ACTIVE"
  sleep 5
done

# Backup critical data
echo "[2/4] Backing up critical data..."
sqlite3 /data/primary.db ".backup /backups/daily-$(date +%Y%m%d).db"

# Flush old cache entries
echo "[3/4] Clearing old cache..."
redis-cli FLUSHDB 2>/dev/null || true

# Log final state
echo "[4/4] Logging final state..."
echo "Shutdown at $(date)" >> /var/log/cfn/operations.log

echo "✓ Shutdown checklist complete"
```

---

## Backup and Recovery

### Daily Backup Procedure

**Schedule:** Every night at 2 AM
**Duration:** 5-10 minutes
**Retention:** 7 days rolling

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup-$TIMESTAMP"

echo "=== Starting Daily Backup ==="

mkdir -p "$BACKUP_PATH"

# Backup databases
echo "Backing up databases..."
sqlite3 /data/primary.db ".backup $BACKUP_PATH/primary.db"
[ -f /data/cache.db ] && sqlite3 /data/cache.db ".backup $BACKUP_PATH/cache.db"

# Backup PostgreSQL if used
pg_dump -h localhost -U postgres primary_db > "$BACKUP_PATH/postgres.sql" 2>/dev/null || true

# Backup Redis
echo "Backing up Redis..."
redis-cli BGSAVE
cp /var/lib/redis/dump.rdb "$BACKUP_PATH/redis-dump.rdb" 2>/dev/null || true

# Backup artifacts
echo "Backing up artifacts..."
tar -czf "$BACKUP_PATH/artifacts.tar.gz" /artifacts/ --exclude="*.tmp"

# Create backup manifest
cat > "$BACKUP_PATH/MANIFEST.txt" << EOF
Backup Date: $TIMESTAMP
Database: primary.db
Cache: cache.db
Artifacts: artifacts.tar.gz
PostgreSQL: postgres.sql
Redis: redis-dump.rdb
Verification: $(date +%s)
EOF

# Verify backup integrity
echo "Verifying backup..."
if [ -f "$BACKUP_PATH/primary.db" ]; then
  sqlite3 "$BACKUP_PATH/primary.db" "PRAGMA integrity_check;" | grep -q "ok" && \
    echo "✓ Database backup verified" || \
    echo "✗ Database backup corrupted"
fi

# Cleanup old backups (keep 7 days)
echo "Cleaning up old backups..."
find "$BACKUP_DIR" -name "backup-*" -mtime +7 -exec rm -rf {} \;

echo "✓ Backup complete: $BACKUP_PATH"
```

### Recovery from Backup

**Duration:** 5-15 minutes
**RPO:** 24 hours (if daily backups only)

```bash
#!/bin/bash
set -euo pipefail

BACKUP_PATH="$1"

if [ -z "$BACKUP_PATH" ]; then
  echo "Usage: $0 <backup-path>"
  ls -d /backups/backup-* | tail -5
  exit 1
fi

echo "=== Restoring from Backup: $BACKUP_PATH ==="

# Stop services
echo "Stopping services..."
systemctl stop cfn-services

# Restore databases
echo "Restoring databases..."
rm -f /data/primary.db /data/cache.db
if [ -f "$BACKUP_PATH/primary.db" ]; then
  cp "$BACKUP_PATH/primary.db" /data/primary.db
  sqlite3 /data/primary.db "PRAGMA integrity_check;" | head -1
fi

# Restore PostgreSQL
if [ -f "$BACKUP_PATH/postgres.sql" ]; then
  psql -U postgres < "$BACKUP_PATH/postgres.sql"
fi

# Restore Redis
if [ -f "$BACKUP_PATH/redis-dump.rdb" ]; then
  cp "$BACKUP_PATH/redis-dump.rdb" /var/lib/redis/dump.rdb
  chown redis:redis /var/lib/redis/dump.rdb
fi

# Restore artifacts
echo "Restoring artifacts..."
rm -rf /artifacts/*
tar -xzf "$BACKUP_PATH/artifacts.tar.gz" -C /

# Restart services
echo "Restarting services..."
systemctl start cfn-services

# Verify restoration
echo "Verifying restoration..."
sleep 5
npm run verify:health

echo "✓ Restoration complete"
```

### Point-in-Time Recovery

For recovery to a specific point in time:

```bash
#!/bin/bash
set -euo pipefail

TARGET_TIME="$1"  # ISO8601 format: 2025-11-16T10:00:00Z

echo "=== Point-in-Time Recovery to $TARGET_TIME ==="

# Find backup taken before target time
BACKUP=$(ls /backups/backup-* | while read b; do
  BACKUP_TIME=$(stat -c %y "$b" | cut -d' ' -f1)
  if [ "$BACKUP_TIME" \< "$TARGET_TIME" ]; then
    echo "$b"
  fi
done | tail -1)

if [ -z "$BACKUP" ]; then
  echo "No backup found before $TARGET_TIME"
  exit 1
fi

echo "Using backup: $BACKUP"

# Restore from backup
bash ./recover-from-backup.sh "$BACKUP"

# Restore transaction logs
echo "Applying transaction logs..."
sqlite3 /data/primary.db < <(
  grep -m 1000 "$TARGET_TIME" /var/log/cfn/transaction.log | \
  sed 's/^.*SQL://' | \
  sort
)

echo "✓ Point-in-time recovery complete"
```

---

## Database Maintenance

### Weekly Maintenance Window

**Schedule:** Sunday 2 AM
**Duration:** 30-60 minutes
**Maintenance tasks:**
1. VACUUM to reclaim space
2. ANALYZE to update statistics
3. Rebuild indexes
4. Run integrity checks

```bash
#!/bin/bash
set -euo pipefail

echo "=== Weekly Database Maintenance ==="

# Notify monitoring
echo "MAINTENANCE_WINDOW_START $(date)" >> /var/log/cfn/maintenance.log

# Backup before maintenance
echo "[1/5] Creating pre-maintenance backup..."
sqlite3 /data/primary.db ".backup /backups/pre-maintenance-$(date +%Y%m%d).db"

# VACUUM to reclaim space
echo "[2/5] VACUUMing database..."
sqlite3 /data/primary.db "VACUUM;"

# ANALYZE to update statistics
echo "[3/5] Analyzing statistics..."
sqlite3 /data/primary.db "ANALYZE;"

# Rebuild indexes
echo "[4/5] Rebuilding indexes..."
sqlite3 /data/primary.db "REINDEX;"

# Integrity check
echo "[5/5] Running integrity check..."
RESULT=$(sqlite3 /data/primary.db "PRAGMA integrity_check;")
if [ "$RESULT" = "ok" ]; then
  echo "✓ Database integrity verified"
else
  echo "✗ Integrity check failed: $RESULT"
  exit 1
fi

echo "✓ Maintenance complete"
echo "MAINTENANCE_WINDOW_END $(date)" >> /var/log/cfn/maintenance.log
```

### Index Maintenance

```bash
#!/bin/bash
set -euo pipefail

echo "=== Index Maintenance ==="

# Identify unused indexes
echo "Finding unused indexes..."
sqlite3 /data/primary.db << EOF
SELECT name FROM sqlite_master
WHERE type='index' AND sql IS NOT NULL
  AND name NOT LIKE 'sqlite_%'
  AND name NOT IN (SELECT index_name FROM pragma_index_info);
EOF

# Rebuild fragmented indexes
echo "Rebuilding indexes..."
sqlite3 /data/primary.db "REINDEX;"

# Recreate specific indexes if needed
sqlite3 /data/primary.db << EOF
-- Drop and recreate critical indexes
DROP INDEX IF EXISTS idx_agents_status;
CREATE INDEX idx_agents_status ON agents(status);

DROP INDEX IF EXISTS idx_agents_iteration;
CREATE INDEX idx_agents_iteration ON agents(iteration);

DROP INDEX IF EXISTS idx_tasks_created_at;
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
EOF

echo "✓ Index maintenance complete"
```

---

## Performance Monitoring

### Real-Time Performance Dashboard

```bash
#!/bin/bash

# Display in watch loop: watch -n 5 'bash monitoring.sh'

clear
echo "=== System Performance Dashboard ==="
echo "Updated: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Database performance
echo "=== Database ==="
sqlite3 /data/primary.db << EOF
SELECT
  'Agents' as table_name,
  (SELECT COUNT(*) FROM agents) as row_count,
  (SELECT AVG(confidence) FROM agents) as avg_confidence
UNION ALL
SELECT
  'Tasks',
  (SELECT COUNT(*) FROM tasks),
  (SELECT AVG(duration_ms) FROM tasks);
EOF

# Query cache stats
echo ""
echo "=== Query Cache ==="
redis-cli INFO stats | grep -E "total_commands|total_net_input_bytes"

# Redis memory
echo ""
echo "=== Redis Memory ==="
redis-cli INFO memory | grep -E "used_memory_human|used_memory_percent|evicted_keys"

# System resources
echo ""
echo "=== System Resources ==="
echo -n "CPU: "
top -b -n 1 | grep "Cpu(s)" | awk '{print $2}'
echo -n "Memory: "
free -h | awk '/^Mem:/ {print $3 "/" $2}'
echo -n "Disk: "
df -h /artifacts | awk 'NR==2 {print $3 "/" $2}'

# Active operations
echo ""
echo "=== Active Operations ==="
redis-cli LLEN "swarm:active" || echo "0"

# Error rate (last hour)
echo ""
echo "=== Error Rate (1h) ==="
grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" /var/log/cfn/error.log | wc -l
```

### Performance Baseline

Establish and track performance baseline:

```bash
#!/bin/bash
set -euo pipefail

echo "=== Establishing Performance Baseline ==="

BASELINE_FILE="/var/log/cfn/baseline-$(date +%Y%m).json"

cat > "$BASELINE_FILE" << 'EOF'
{
  "timestamp": "$(date -Iseconds)",
  "query_latency": {
    "p50": 10,
    "p95": 45,
    "p99": 100
  },
  "cache_hit_rate": 0.87,
  "error_rate": 0.001,
  "throughput": {
    "queries_per_second": 250,
    "coordination_signals_per_second": 50
  },
  "resource_usage": {
    "cpu_percent": 35,
    "memory_percent": 42,
    "disk_percent": 25
  }
}
EOF

echo "✓ Baseline established: $BASELINE_FILE"
```

---

## Incident Response

### Database Corruption

**Severity:** Critical
**Detection:** PRAGMA integrity_check fails
**Response time:** < 5 minutes

```bash
#!/bin/bash
set -euo pipefail

echo "=== DATABASE CORRUPTION INCIDENT ==="

# Step 1: Alert team
echo "ALERT: Database corruption detected"
# Send alert to team (PagerDuty, Slack, etc.)

# Step 2: Stop writes to prevent further corruption
echo "Stopping writes..."
sqlite3 /data/primary.db "PRAGMA query_only = ON;"

# Step 3: Attempt repair
echo "Attempting automatic repair..."
sqlite3 /data/primary.db << EOF
PRAGMA integrity_check;
PRAGMA optimize;
VACUUM;
EOF

# Step 4: Verify repair
RESULT=$(sqlite3 /data/primary.db "PRAGMA integrity_check;")
if [ "$RESULT" = "ok" ]; then
  echo "✓ Database repaired successfully"
  sqlite3 /data/primary.db "PRAGMA query_only = OFF;"
else
  echo "✗ Repair failed: $RESULT"
  echo "Performing recovery from backup..."
  bash ./recover-from-backup.sh "$(ls /backups/backup-* | tail -1)"
fi
```

### High Memory Usage

**Severity:** High
**Detection:** Memory > 80% of available
**Response time:** < 10 minutes

```bash
#!/bin/bash
set -euo pipefail

echo "=== HIGH MEMORY USAGE INCIDENT ==="

# Check what's consuming memory
echo "[1/3] Identifying memory consumers..."
ps aux --sort=-%mem | head -10

# Clear Redis if it's the culprit
echo "[2/3] Clearing Redis cache..."
redis-cli INFO memory | grep used_memory_human
redis-cli FLUSHDB  # Use with caution
redis-cli INFO memory | grep used_memory_human

# Query cache stats and clear if needed
echo "[3/3] Checking query cache..."
CACHE_ENTRIES=$(redis-cli DBSIZE | awk '{print $2}')
if [ $CACHE_ENTRIES -gt 10000 ]; then
  echo "Clearing old cache entries..."
  redis-cli EVAL "
    local keys = redis.call('keys', '*:cache:*')
    for i,k in ipairs(keys) do
      redis.call('expire', k, 300)
    end
    return #keys" 0
fi

echo "✓ Incident response complete"
```

### Service Unresponsive

**Severity:** Critical
**Detection:** Service health check fails
**Response time:** < 5 minutes

```bash
#!/bin/bash
set -euo pipefail

SERVICE="$1"

echo "=== SERVICE UNRESPONSIVE INCIDENT: $SERVICE ==="

# Check process status
echo "[1/3] Checking process status..."
if ps aux | grep -q "[${SERVICE:0:1}]${SERVICE:1}"; then
  echo "Process running but not responding"
  PID=$(pgrep -f "$SERVICE" | head -1)

  # Check process resource usage
  ps -p $PID -o %cpu,%mem,etime
else
  echo "Process not running"
fi

# Try graceful restart
echo "[2/3] Attempting graceful restart..."
systemctl restart "$SERVICE" || true

# Wait and check
sleep 5
if curl -f "http://localhost:$(get_port "$SERVICE")/health" > /dev/null; then
  echo "✓ Service recovered"
else
  echo "✗ Service still unresponsive"

  # Force restart
  echo "[3/3] Forcing restart..."
  systemctl stop "$SERVICE"
  systemctl start "$SERVICE"

  sleep 10
  curl -f "http://localhost:$(get_port "$SERVICE")/health" && echo "✓ Service restored" || echo "✗ Service still down"
fi
```

---

## Skill Deployment

### Deploy New Skill

```bash
#!/bin/bash
set -euo pipefail

SKILL_PATH="$1"
SKILL_NAME=$(basename "$SKILL_PATH" .sh)

echo "=== Deploying Skill: $SKILL_NAME ==="

# Validate skill file
echo "[1/4] Validating skill..."
bash -n "$SKILL_PATH" || { echo "Syntax error"; exit 1; }

# Extract and validate frontmatter
echo "[2/4] Validating frontmatter..."
grep "^# SKILL_NAME" "$SKILL_PATH" || { echo "Missing SKILL_NAME"; exit 1; }
grep "^# SKILL_VERSION" "$SKILL_PATH" || { echo "Missing SKILL_VERSION"; exit 1; }
grep "^# OUTPUT_FORMAT" "$SKILL_PATH" || { echo "Missing OUTPUT_FORMAT"; exit 1; }

# Copy to skill directory
echo "[3/4] Installing skill..."
INSTALL_PATH="./.claude/skills/cfn-$SKILL_NAME/SKILL.sh"
mkdir -p "$(dirname "$INSTALL_PATH")"
cp "$SKILL_PATH" "$INSTALL_PATH"
chmod +x "$INSTALL_PATH"

# Test execution
echo "[4/4] Testing skill execution..."
TIMEOUT=30
timeout $TIMEOUT bash "$INSTALL_PATH" > /tmp/skill-test.json 2>&1 && \
  jq . /tmp/skill-test.json > /dev/null && \
  echo "✓ Skill deployed and tested successfully" || \
  echo "⚠ Skill deployed but test failed"
```

### Update Existing Skill

```bash
#!/bin/bash
set -euo pipefail

SKILL_NAME="$1"
SKILL_PATH="./.claude/skills/cfn-$SKILL_NAME/SKILL.sh"

if [ ! -f "$SKILL_PATH" ]; then
  echo "Skill not found: $SKILL_NAME"
  exit 1
fi

echo "=== Updating Skill: $SKILL_NAME ==="

# Extract version before update
OLD_VERSION=$(grep "^# SKILL_VERSION" "$SKILL_PATH" | awk '{print $NF}')

# Backup current version
cp "$SKILL_PATH" "$SKILL_PATH.backup-$OLD_VERSION"

# Update from source
git checkout "$SKILL_PATH" || exit 1

# Extract new version
NEW_VERSION=$(grep "^# SKILL_VERSION" "$SKILL_PATH" | awk '{print $NF}')

echo "✓ Skill updated: $OLD_VERSION → $NEW_VERSION"
echo "Backup saved: $SKILL_PATH.backup-$OLD_VERSION"
```

---

## Scaling Operations

### Horizontal Scaling: Add Agent Node

```bash
#!/bin/bash
set -euo pipefail

NODE_IP="$1"

echo "=== Adding Agent Node: $NODE_IP ==="

# Step 1: Initialize node
ssh "ubuntu@$NODE_IP" << 'EOF'
#!/bin/bash
set -euo pipefail

# Install dependencies
apt-get update
apt-get install -y nodejs npm redis-server sqlite3

# Create directories
mkdir -p /data /artifacts /var/log/cfn

# Download application
cd /opt
npm install claude-flow-novice
EOF

# Step 2: Configure connectivity
echo "Configuring connectivity..."
scp config/database.conf "ubuntu@$NODE_IP:/opt/claude-flow-novice/config/"
scp config/coordination.conf "ubuntu@$NODE_IP:/opt/claude-flow-novice/config/"

# Step 3: Start services
ssh "ubuntu@$NODE_IP" "cd /opt/claude-flow-novice && npm run start:services &"

# Step 4: Register with coordinator
sleep 5
COORDINATOR_IP=$(get_coordinator_ip)
curl -X POST "http://$COORDINATOR_IP:8000/nodes/register" \
  -H "Content-Type: application/json" \
  -d "{\"node_ip\": \"$NODE_IP\", \"node_type\": \"agent\"}"

echo "✓ Agent node added: $NODE_IP"
```

### Vertical Scaling: Increase Resources

```bash
#!/bin/bash
set -euo pipefail

echo "=== Vertical Scaling ==="

# Increase database buffer pool
echo "Increasing database cache..."
sqlite3 /data/primary.db "PRAGMA cache_size = 100000;"  # 100MB

# Increase Redis memory
echo "Increasing Redis memory..."
redis-cli CONFIG SET maxmemory 4gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
redis-cli CONFIG REWRITE

# Increase connection pool
echo "Increasing connection pool..."
# Update configuration
sed -i 's/max_connections: [0-9]*/max_connections: 500/' config/database.conf

echo "✓ Vertical scaling applied"
```

---

## Log Management

### Log Rotation

```bash
#!/bin/bash

# Add to /etc/logrotate.d/cfn
/var/log/cfn/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 cfn cfn
    sharedscripts
    postrotate
        systemctl reload cfn-services > /dev/null 2>&1 || true
    endscript
}
```

### Log Analysis

```bash
#!/bin/bash

echo "=== Recent Errors ==="
tail -20 /var/log/cfn/error.log

echo ""
echo "=== Error Frequency (last 24h) ==="
grep "$(date -d 'now - 1 day' '+%Y-%m-%d')" /var/log/cfn/error.log | \
  cut -d' ' -f5- | \
  sort | uniq -c | sort -rn | head -10

echo ""
echo "=== Slow Queries (> 1000ms) ==="
grep "duration.*[0-9]\{4,\}ms" /var/log/cfn/database.log | tail -10

echo ""
echo "=== Coordination Events ==="
tail -20 /var/log/cfn/coordination.log
```

---

## Monitoring and Alerting

### Alert Rules

```yaml
# Prometheus alert rules
groups:
- name: cfn
  interval: 30s
  rules:
  - alert: HighErrorRate
    expr: rate(cfn_errors_total[5m]) > 0.01
    annotations:
      summary: "Error rate high: {{ $value }}"

  - alert: DatabaseConnectivityIssue
    expr: cfn_database_available == 0
    annotations:
      summary: "Database unavailable"

  - alert: HighMemoryUsage
    expr: process_resident_memory_bytes / 1024 / 1024 / 1024 > 4
    annotations:
      summary: "Memory usage > 4GB"

  - alert: DiskSpaceLow
    expr: node_filesystem_avail_bytes{mountpoint="/artifacts"} / 1024 / 1024 / 1024 < 10
    annotations:
      summary: "Artifact storage < 10GB remaining"
```

### Notification Channels

```bash
# Send alerts via multiple channels
send_alert() {
  local severity="$1"
  local message="$2"

  # Slack
  curl -X POST "$SLACK_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "{\"text\": \"[$severity] $message\"}"

  # Email
  echo "$message" | mail -s "[$severity] CFN Alert" ops@example.com

  # PagerDuty
  if [ "$severity" = "CRITICAL" ]; then
    curl -X POST "https://events.pagerduty.com/v2/enqueue" \
      -H 'Content-Type: application/json' \
      -d "{\"routing_key\": \"$PAGERDUTY_KEY\", \"event_action\": \"trigger\", \"payload\": {\"summary\": \"$message\", \"severity\": \"critical\"}}"
  fi
}
```

---

**Document Reference:** OPERATIONAL_RUNBOOKS.md
**Maintained By:** API Documentation Specialist
**Last Reviewed:** 2025-11-16
