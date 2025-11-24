# Cache Management Runbook

## Overview
This runbook covers Redis cache management, including monitoring eviction behavior, memory tuning, key expiration management, persistence verification, and performance optimization. Redis is the coordination backbone for agent distribution.

**Expected Duration:** 15-30 minutes
**Difficulty:** Intermediate
**Requires:** Redis CLI access, monitoring tools, basic Redis knowledge

**Production Configuration:**
- Maxmemory: 512MB (scalable to 2GB+)
- Eviction Policy: allkeys-lru (Least Recently Used)
- Persistence: RDB + AOF (Both enabled)
- Database: 0 (default, no database switching)

## Prerequisites

### Access and Tools
- Redis CLI (redis-cli)
- Docker Compose access
- Redis credentials
- Monitoring dashboards (Prometheus/Grafana)

### Knowledge
- Redis data structures (strings, lists, hashes)
- LRU eviction policy
- RDB and AOF persistence
- Redis memory management

## Monitoring

### Health Check

```bash
#!/bin/bash
# scripts/redis-health-check.sh

set -euo pipefail

echo "=== Redis Health Check ==="

# 1. Connection test
if docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" PING | grep -q PONG; then
  echo "✓ Redis responding to PING"
else
  echo "✗ Redis not responding"
  exit 1
fi

# 2. Memory statistics
echo ""
echo "Memory Usage:"
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO memory | grep -E "used_memory|maxmemory|evicted_keys"

# 3. Connected clients
CLIENTS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO clients | grep connected_clients)
echo ""
echo "$CLIENTS"

# 4. Key statistics
KEYS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" DBSIZE)
echo "$KEYS"

# 5. Eviction rate
echo ""
echo "Eviction Statistics:"
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep -E "evicted|lru"

# 6. Replication status
echo ""
echo "Replication Status:"
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO replication | grep -E "role|connected_slaves"

# 7. Persistence status
echo ""
echo "Persistence Status:"
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO persistence | grep -E "rdb_changes|aof_current"

echo ""
echo "✓ Health check complete"
```

## Response Steps

### Scenario 1: High Memory Usage (>80%)

**Detection:**
```bash
# Check memory usage
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO memory | grep -E "used_memory_human|maxmemory_human"

# If output shows used_memory > 0.8 * maxmemory, proceed with remediation
```

**Response:**

```bash
# 1. Identify memory consumers
echo "Top 20 keys by memory usage:"
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" --memkeys | head -20

# 2. Check if eviction is happening
EVICTED=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep evicted_keys | cut -d: -f2)
if [ "$EVICTED" -gt 0 ]; then
  echo "Eviction active - $EVICTED keys evicted"
fi

# 3. Identify keys with high TTL (can be deleted earlier)
echo ""
echo "Keys with high TTL:"
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "*" | while read key; do
  TTL=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" TTL "$key")
  if [ "$TTL" -gt 3600 ]; then
    SIZE=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" DEBUG OBJECT "$key" 2>/dev/null | grep "serializedlength" | awk '{print $NF}')
    echo "$key: TTL ${TTL}s, Size ~${SIZE}B"
  fi
done | sort -t: -k3 -rn | head -20

# 4. Reduce memory by:
#    Option A: Decrease maxmemory
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET maxmemory 1073741824  # 1GB

#    Option B: Adjust eviction policy to more aggressive
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET maxmemory-policy "volatile-lru"

#    Option C: Scale Redis vertically (cluster)
# See "Redis Cluster Scaling" section

# 5. Monitor memory after changes
watch -n 5 'docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO memory | grep -E "used_memory|evicted"'
```

### Scenario 2: High Eviction Rate (>100 keys/min)

**Detection:**
```bash
# Monitor eviction rate
for i in {1..5}; do
  EVICTED=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep evicted_keys | cut -d: -f2)
  echo "$(date +%H:%M:%S) - Evicted keys: $EVICTED"
  sleep 10
done
```

**Analysis:**
```bash
# High eviction indicates either:
# 1. Cache hit ratio is low (ineffective caching)
# 2. Keys have too short TTL
# 3. Memory allocation is insufficient

# Check cache hit ratio
HITS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep keyspace_hits | cut -d: -f2)
MISSES=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep keyspace_misses | cut -d: -f2)
HIT_RATIO=$(echo "scale=2; $HITS / ($HITS + $MISSES) * 100" | bc)
echo "Cache hit ratio: $HIT_RATIO%"

# Expected: >90% hit ratio
# If <90%, eviction is removing frequently used keys
```

**Response:**

```bash
# Option 1: Increase memory limit
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET maxmemory 2147483648  # 2GB

# Option 2: Adjust TTL on keys
# Example: Increase agent session TTL from 3600s to 7200s
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*" | while read key; do
  CURRENT_TTL=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" TTL "$key")
  if [ "$CURRENT_TTL" -gt 0 ]; then
    NEW_TTL=$((CURRENT_TTL * 2))
    docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" EXPIRE "$key" "$NEW_TTL"
  fi
done

# Option 3: Delete unused keys
# Clean up abandoned agent sessions (not seen in 30 minutes)
THRESHOLD=$(($(date +%s) - 1800))  # 30 minutes ago
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*" | while read key; do
  LAST_SEEN=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" HGET "$key" "last_seen" || echo "0")
  if [ "$LAST_SEEN" -lt "$THRESHOLD" ]; then
    docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" DEL "$key"
    echo "Deleted abandoned agent: $key"
  fi
done

# Option 4: Implement cache warming strategy
# Pre-populate Redis with frequently accessed data during low-traffic periods

# 5. Verify eviction rate decreased
watch -n 10 'docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep -E "evicted_keys|keyspace_hits|keyspace_misses"'
```

### Scenario 3: Connection Pool Exhaustion

**Detection:**
```bash
# Check connected clients
CLIENTS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO clients | grep connected_clients | cut -d: -f2)
echo "Connected clients: $CLIENTS (limit typically 10000)"

# Check blocked clients (waiting on BLPOP/BRPOP)
BLOCKED=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO clients | grep blocked_clients | cut -d: -f2)
echo "Blocked clients: $BLOCKED"

# If CLIENTS > 200, investigate
```

**Response:**

```bash
# 1. List all connected clients
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CLIENT LIST

# 2. Identify clients not making progress (idle >5 minutes)
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CLIENT LIST | \
  awk -F'[= ]' '$9 > 300000 {print $0}' | \
  cut -d' ' -f1-3

# 3. Kill stuck clients (use with caution)
# Get client ID and kill it
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CLIENT KILL TYPE normal SKIPME yes

# 4. Verify agents reconnect
sleep 10
CLIENTS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO clients | grep connected_clients | cut -d: -f2)
echo "Connected clients after cleanup: $CLIENTS"

# 5. Check application connection pooling
# Verify application is reusing connections, not creating new ones for each operation
docker-compose exec cfn-agent-1 curl -s http://localhost:3000/debug/redis/connections || echo "Debug endpoint not available"
```

### Scenario 4: Slow Commands Detected

**Detection:**
```bash
# Enable slowlog monitoring
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET slowlog-log-slower-than 1000  # 1ms

# Get recent slow commands
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" SLOWLOG GET 10
```

**Analysis & Response:**

```bash
# 1. Analyze slowlog for patterns
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" SLOWLOG GET 20 | grep -E "SCAN|KEYS|MGET|MSET"

# Common slow commands:
# - KEYS * (O(N) - iterates all keys)
# - SCAN (better, but still slow with large datasets)
# - FLUSHDB/FLUSHALL
# - RANDOMKEY (O(N))

# 2. Fix: Replace KEYS with SCAN
# KEYS: redis-cli KEYS "agent:*"
# SCAN: redis-cli SCAN 0 MATCH "agent:*"

# 3. For agent discovery, use prefixes instead of SCAN
# Store agent IDs in a set instead:
# SADD active_agents agent-123 agent-456
# SMEMBERS active_agents

# 4. Refactor blocking operations
# If BLPOP is blocking too long, set timeout
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" BLPOP task_queue 5  # 5 second timeout

# 5. Enable slow-command alerts
# Add to monitoring rules (Prometheus/Grafana)
```

## Persistence Management

### RDB (Redis Database) Snapshots

```bash
# Check RDB configuration
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET "save"

# Expected output:
# save "" (disabled - handle via AOF)
# or
# save 900 1 (save if 1 key changed in 900s)

# Manual RDB snapshot
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" BGSAVE

# Monitor background save
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" LASTSAVE

# Verify RDB file created
docker-compose exec redis ls -lh /data/dump.rdb

# Backup RDB file
cp /var/lib/docker/volumes/redis-data/_data/dump.rdb \
   /backups/redis/dump-$(date +%Y%m%d-%H%M%S).rdb
```

### AOF (Append-Only File)

```bash
# Check AOF configuration
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET "appendonly"

# Expected: appendonly yes

# Check AOF file size
docker-compose exec redis ls -lh /data/appendonly.aof

# Rewrite AOF to compact it
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" BGREWRITEAOF

# Monitor rewrite progress
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO persistence | grep -E "aof_rewrite|aof_current"

# Verify AOF sync configuration
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET "appendfsync"

# Expected: appendfsync everysec (balance between durability and performance)
```

### Data Recovery

```bash
#!/bin/bash
# scripts/redis-restore-from-backup.sh

BACKUP_FILE="${1:?Usage: $0 <dump.rdb>"

# 1. Stop Redis
docker-compose stop redis

# 2. Backup current dump
cp /var/lib/docker/volumes/redis-data/_data/dump.rdb \
   /var/lib/docker/volumes/redis-data/_data/dump.rdb.backup

# 3. Restore from backup
cp "$BACKUP_FILE" /var/lib/docker/volumes/redis-data/_data/dump.rdb

# 4. Start Redis
docker-compose up -d redis

# 5. Verify recovery
sleep 5
KEYS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" DBSIZE)
echo "Keys after restore: $KEYS"

# 6. Verify data integrity
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO keyspace
```

## Key Management

### Expiration Policy

```bash
# View all keys with TTL
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "*" | while read key; do
  TTL=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" TTL "$key")
  if [ "$TTL" -gt 0 ]; then
    echo "$key: TTL ${TTL}s"
  elif [ "$TTL" -eq -1 ]; then
    echo "$key: NO EXPIRY (permanent)"
  fi
done | sort -t: -k2 -n | head -50

# Set expiration on keys missing TTL
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "temporary:*" | while read key; do
  if [ "$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" TTL "$key")" -eq -1 ]; then
    docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" EXPIRE "$key" 3600  # 1 hour
    echo "Set expiry on $key"
  fi
done

# Delete expired keys manually (usually automatic)
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" EVAL '
  local keys = redis.call("keys", "*")
  local deleted = 0
  for _, key in ipairs(keys) do
    if redis.call("ttl", key) == -2 then
      redis.call("del", key)
      deleted = deleted + 1
    end
  end
  return deleted
' 0
```

### Backup Strategy

```bash
#!/bin/bash
# scripts/redis-backup.sh

BACKUP_DIR="/backups/redis"
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# 1. Create RDB backup
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
sleep 5
cp /var/lib/docker/volumes/redis-data/_data/dump.rdb \
   "$BACKUP_DIR/dump-$BACKUP_DATE.rdb"

# 2. Compress backup
gzip "$BACKUP_DIR/dump-$BACKUP_DATE.rdb"

# 3. Verify backup
if [ -f "$BACKUP_DIR/dump-$BACKUP_DATE.rdb.gz" ]; then
  echo "✓ Backup created: $BACKUP_DIR/dump-$BACKUP_DATE.rdb.gz"
else
  echo "✗ Backup failed"
  exit 1
fi

# 4. Upload to cloud storage
aws s3 cp "$BACKUP_DIR/dump-$BACKUP_DATE.rdb.gz" s3://cfn-backups/redis/

# 5. Clean up old backups (keep 7 days)
find "$BACKUP_DIR" -name "dump-*.rdb.gz" -mtime +7 -delete
```

## Configuration Tuning

### Memory Optimization

```bash
# Current settings
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET "maxmemory*"

# Tune for production
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET maxmemory 2147483648  # 2GB
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET maxmemory-policy "allkeys-lru"
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET maxmemory-samples 5

# Persist settings
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG REWRITE

# Verify
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET "maxmemory*"
```

### Network Optimization

```bash
# Check current settings
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET "timeout"
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET "tcp-backlog"

# Increase backlog for high concurrency
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET tcp-backlog 511

# Disable timeout for persistent connections
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET timeout 0

# Persist changes
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG REWRITE
```

## Monitoring

### Prometheus Queries

```
# Memory usage percentage
redis_memory_used_bytes / redis_memory_max_bytes * 100

# Eviction rate (per second)
rate(redis_evicted_keys_total[1m])

# Hit ratio
redis_keyspace_hits_total / (redis_keyspace_hits_total + redis_keyspace_misses_total) * 100

# Connected clients
redis_connected_clients

# Command latency (p95)
redis_command_duration_seconds{quantile="0.95"}
```

### Grafana Dashboards

Create dashboard with panels for:
- Memory usage over time
- Eviction rate
- Cache hit ratio
- Connected clients
- Command latency
- Key count

## Escalation

### When to Escalate

| Condition | Action | Contact |
|-----------|--------|---------|
| Memory exhaustion (>95%) | Trigger cluster scaling | Infrastructure |
| Eviction rate >1000/min | Reduce TTL or increase memory | Performance team |
| High latency >100ms | Analyze commands, optimize queries | Backend team |
| AOF file corruption | Restore from RDB | Database DBA |
| Connection leak (>500 clients) | Restart agents | Platform team |

### Support Contacts
- **Cache Team:** cache@example.com / Slack #redis
- **Infrastructure:** infrastructure@example.com / Slack #infrastructure
- **On-Call SRE:** Check PagerDuty

## Automation

### Scheduled Tasks

```bash
# Daily backup
0 2 * * * /usr/local/bin/redis-backup.sh >> /var/log/redis-backup.log 2>&1

# Daily health check
0 * * * * /usr/local/bin/redis-health-check.sh >> /var/log/redis-health.log 2>&1

# AOF rewrite (weekly)
0 3 * * 0 docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" BGREWRITEAOF

# Monitor eviction rate
*/5 * * * * docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep evicted_keys >> /var/log/redis-eviction.log
```
