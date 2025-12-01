# Performance Degradation Runbook

## Overview
This runbook provides systematic procedures for diagnosing and resolving performance issues including high latency, slow queries, bottlenecks, and throughput degradation.

**Expected Duration:** 30-60 minutes for diagnosis
**Difficulty:** Advanced
**Requires:** Monitoring dashboards, database access, profiling tools

## Performance Degradation Types

### Type 1: Application-Level Slowness
- **Symptoms:** Tasks taking longer, queue depth increasing, high CPU
- **Root Causes:** Inefficient algorithms, memory leaks, infinite loops
- **Tools:** Application logs, profiling, code review

### Type 2: Database Slowness
- **Symptoms:** Database queries slow, connection pool exhausted, high wait times
- **Root Causes:** Missing indexes, bloated tables, poor query plans
- **Tools:** EXPLAIN ANALYZE, slow query log, table statistics

### Type 3: Cache Slowness
- **Symptoms:** High Redis latency, eviction events, connection timeouts
- **Root Causes:** Memory pressure, inefficient caching, network issues
- **Tools:** Redis INFO, slowlog, network diagnostics

### Type 4: Infrastructure Constraints
- **Symptoms:** High CPU/memory across all containers, disk I/O bottleneck
- **Root Causes:** Resource limits, insufficient hardware, noisy neighbors
- **Tools:** docker stats, vmstat, iostat, system profiling

## Diagnosis Framework

### Step 1: Establish Baseline (5 minutes)

```bash
#!/bin/bash
# scripts/performance-baseline.sh

OUTPUT_DIR="/tmp/perf-baseline-$(date +%s)"
mkdir -p "$OUTPUT_DIR"

echo "Establishing performance baseline..."

# Application metrics
curl -s 'http://localhost:9090/api/v1/query?query=cfn_task_duration_seconds_p95' | \
  jq '.data.result[0].value[1]' > "$OUTPUT_DIR/latency-p95.txt"

curl -s 'http://localhost:9090/api/v1/query?query=cfn_agent_queue_depth' | \
  jq '.data.result[0].value[1]' > "$OUTPUT_DIR/queue-depth.txt"

# System metrics
docker stats --no-stream --format "table {{.Names}}\t{{.CPUPerc}}\t{{.MemUsage}}" > "$OUTPUT_DIR/container-stats.txt"
free -h > "$OUTPUT_DIR/memory.txt"
df -h / > "$OUTPUT_DIR/disk.txt"

# Database metrics
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT now() as timestamp, COUNT(*) as connection_count FROM pg_stat_activity;
" > "$OUTPUT_DIR/db-connections.txt"

# Redis metrics
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | \
  grep -E "ops_per_sec|connected_clients" > "$OUTPUT_DIR/redis-info.txt"

echo "Baseline saved to: $OUTPUT_DIR"
echo ""
echo "=== BASELINE METRICS ==="
cat "$OUTPUT_DIR/latency-p95.txt"
cat "$OUTPUT_DIR/queue-depth.txt"
cat "$OUTPUT_DIR/container-stats.txt" | head -3
echo ""
```

### Step 2: Identify Performance Shift (5 minutes)

```bash
# Compare current vs baseline
CURRENT_LATENCY=$(curl -s 'http://localhost:9090/api/v1/query?query=cfn_task_duration_seconds_p95' | jq '.data.result[0].value[1]')
BASELINE_LATENCY="22"  # From known good state

LATENCY_INCREASE=$(echo "scale=1; ($CURRENT_LATENCY - $BASELINE_LATENCY) / $BASELINE_LATENCY * 100" | bc)

echo "Latency increase: ${LATENCY_INCREASE}%"

# Classify severity
if (( $(echo "$LATENCY_INCREASE > 50" | bc -l) )); then
  echo "CRITICAL: Latency increased >50%"
elif (( $(echo "$LATENCY_INCREASE > 20" | bc -l) )); then
  echo "HIGH: Latency increased >20%"
else
  echo "MEDIUM: Latency increase detected"
fi
```

### Step 3: Root Cause Analysis (20-40 minutes)

## Diagnosis Procedures

### Scenario A: High Database Latency

**Indicators:**
```bash
# Slow query log shows >500ms queries
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    query,
    calls,
    mean_time,
    stddev_time,
    max_time
  FROM pg_stat_statements
  WHERE mean_time > 500
  ORDER BY mean_time DESC
  LIMIT 10;
"

# Connection pool near limit
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT COUNT(*) FROM pg_stat_activity;
"
# Expected: < 50, Warning: > 80, Critical: > 100
```

**Diagnosis Steps:**

```bash
# 1. Identify slow queries
docker-compose exec postgres psql -U cfn_user -d cfn <<EOF
  -- Enable query logging
  ALTER SYSTEM SET log_min_duration_statement = 1000;  -- Log queries > 1 second
  SELECT pg_reload_conf();

  -- Get slowest recent queries
  SELECT
    query_id,
    LEFT(query, 80),
    calls,
    total_time,
    mean_time,
    max_time
  FROM pg_stat_statements
  WHERE query NOT LIKE '%pg_stat_statements%'
  ORDER BY mean_time DESC
  LIMIT 10;
EOF

# 2. Analyze specific slow query
SLOW_QUERY="SELECT * FROM agents WHERE status = 'running'"

docker-compose exec postgres psql -U cfn_user -d cfn -c "
  EXPLAIN ANALYZE $SLOW_QUERY;
"

# Look for:
# - Seq Scan (table scan) instead of Index Scan
# - Loops > 1 (re-executing same scan)
# - High actual rows vs estimated rows
```

**Create Missing Indexes:**

```bash
docker-compose exec postgres psql -U cfn_user -d cfn <<EOF
  -- Agent status lookup
  CREATE INDEX CONCURRENTLY idx_agents_status_id
    ON agents(status, id);

  -- Task filtering
  CREATE INDEX CONCURRENTLY idx_tasks_agent_created
    ON tasks(agent_id, created_at DESC);

  -- Time series queries
  CREATE INDEX CONCURRENTLY idx_logs_agent_time
    ON agent_logs(agent_id, created_at DESC);
EOF

# Verify indexes created
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT schemaname, tablename, indexname
  FROM pg_stat_user_indexes
  ORDER BY idx_scan DESC;
"
```

**Optimize Query Plans:**

```bash
# Update table statistics
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  ANALYZE agents;
  ANALYZE tasks;
  ANALYZE agent_logs;
"

# Adjust planner settings for difficult queries
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SET random_page_cost = 1.1;  -- For SSD storage
  SET effective_cache_size = '8GB';
  SET work_mem = '256MB';
"

# Re-run EXPLAIN ANALYZE on slow query
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  EXPLAIN ANALYZE $SLOW_QUERY;
"
```

**Reduce Connection Pool Pressure:**

```bash
# Identify idle connections
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    pid,
    usename,
    state,
    query_start,
    state_change,
    query
  FROM pg_stat_activity
  WHERE state = 'idle'
  AND state_change < NOW() - INTERVAL '5 minutes';
"

# Terminate idle connections
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE usename = 'cfn_user'
    AND state = 'idle'
    AND state_change < NOW() - INTERVAL '10 minutes';
"

# Increase connection limit
docker-compose exec postgres psql -U postgres -c "
  ALTER SYSTEM SET max_connections = 200;
"
docker-compose restart postgres

until docker-compose exec postgres pg_isready -U postgres; do
  sleep 5
done
```

**Validation:**
```bash
# Query should use index
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  EXPLAIN $SLOW_QUERY;
" | grep -E "Index Scan|Seq Scan"

# Latency should improve
curl -s 'http://localhost:9090/api/v1/query?query=cfn_task_duration_seconds_p95' | jq '.data.result[0].value[1]'
```

---

### Scenario B: High Agent CPU / Memory

**Indicators:**
```bash
# Container using >90% CPU or growing memory
docker stats --no-stream --format "table {{.Names}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Queue not decreasing despite agents
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" LLEN task_queue
```

**Diagnosis Steps:**

```bash
# 1. Profile agent resource usage
CONTAINER="cfn-agent-1"
DURATION=60  # seconds

# Monitor per-process resource usage
docker exec $CONTAINER bash -c "
  for i in {1..${DURATION}}; do
    ps aux --sort=-%cpu,%mem | head -5
    sleep 1
  done
" > /tmp/agent-profile.txt

# Analyze output
echo "Top processes by CPU:"
grep "cfn-agent\|node\|python" /tmp/agent-profile.txt | cut -d' ' -f1-11 | sort | uniq -c | sort -rn | head -10

# 2. Check for memory leak patterns
docker logs $CONTAINER --tail 200 | grep -E "memory|alloc|gc|leak"

# 3. Get memory map
PID=$(docker inspect $CONTAINER --format '{{.State.Pid}}')
cat /proc/$PID/smaps | grep "Rss" | awk '{sum+=$2} END {print "Total memory:", sum/1024 " MB"}'

# 4. Check for zombie processes
docker exec $CONTAINER ps aux | grep -E "Z|defunct" | wc -l

# 5. Check for thread explosion
docker exec $CONTAINER bash -c "ps -eLf | wc -l"  # Expected: < 100 threads

# 6. Analyze slowlog for expensive operations
docker exec $CONTAINER curl -s http://localhost:3000/debug/slowlog | jq '.[0:5]'
```

**Optimization Steps:**

```bash
# 1. Reduce concurrent task processing
# Modify agent config to process fewer tasks concurrently
# TASK_CONCURRENCY=2 (instead of 5)

# 2. Implement backpressure
# Limit queue ingestion when CPU > 85%

# 3. Add garbage collection tuning (if Node.js)
# NODE_OPTIONS="--max-old-space-size=1024"

# 4. Profile CPU-intensive code
docker exec $CONTAINER \
  curl -X POST http://localhost:3000/debug/start-profiling

# Let it run for 30 seconds
sleep 30

docker exec $CONTAINER \
  curl -X POST http://localhost:3000/debug/stop-profiling | \
  jq '.top_functions'

# 5. Optimize identified hot spots
# Update application code and redeploy
```

**Scaling as Mitigation:**

```bash
# If optimization not immediately possible, scale
./scripts/scale-agents.sh 3  # Add 3 agents

# Monitor improvement
watch -n 5 'docker stats --no-stream | grep cfn-agent | head -5'
```

---

### Scenario C: High Redis Latency

**Indicators:**
```bash
# Redis command latency > 10ms
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" --latency

# Memory near limit
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO memory | grep -E "used_memory|maxmemory"

# Many blocked clients
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO clients | grep blocked_clients
```

**Diagnosis Steps:**

```bash
# 1. Check Redis slowlog
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" SLOWLOG GET 20

# Identify commands taking >1ms

# 2. Analyze command patterns
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" --stat

# Look for:
# - High instantaneous ops/sec (>50,000)
# - Unbalanced command types (many SCAN vs GET)

# 3. Check memory pressure
USED=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET maxmemory | awk 'NR==2')
PERCENT=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO memory | grep used_memory_human)
echo "Memory: $PERCENT / $USED"

# If >85%, memory is being thrashed with evictions

# 4. Check network latency
docker exec redis redis-cli -a "$REDIS_PASSWORD" PING
docker exec redis redis-cli -a "$REDIS_PASSWORD" LATENCY HELP | head -5

# 5. Identify expensive operations
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO commandstats | \
  grep "calls=" | sort -t= -k2 -rn | head -10
```

**Optimization Steps:**

```bash
# 1. Identify and remove expensive commands
# KEYS * → SCAN 0 MATCH pattern
# MGET many_keys → Pipeline GET commands
# FLUSHDB → Use DEL with expiry instead

# Example: Replace KEYS with SCAN
# OLD: redis-cli KEYS "agent:*"
# NEW: redis-cli SCAN 0 MATCH "agent:*"

# 2. Optimize data structures
# Store frequently accessed data in hashes instead of separate keys
# HSET agent:123 status running cpu 45  (vs SET agent:123:status running)

# 3. Batch operations
# Use PIPELINE to send multiple commands
# Reduces round-trip latency

# 4. Increase memory if hitting limit
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET maxmemory 2147483648  # 2GB

# 5. Adjust eviction policy
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET maxmemory-policy "volatile-lru"

# 6. Reduce TTL on temporary keys
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "temp:*" | while read key; do
  TTL=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" TTL "$key")
  NEW_TTL=$((TTL / 2))  # Reduce to half
  docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" EXPIRE "$key" "$NEW_TTL"
done
```

---

### Scenario D: Network Bottleneck

**Indicators:**
```bash
# High network latency between services
docker exec cfn-agent-1 bash -c "for i in {1..10}; do ping -c 1 postgres | grep time; done"

# Network saturation
iftop -i docker0

# Connection errors
docker logs cfn-agent-1 | grep -E "timeout|connection refused|ECONNRESET"
```

**Diagnosis Steps:**

```bash
# 1. Check Docker network health
docker network inspect cfn-network | jq '.[] | {Name, Containers}'

# 2. Measure ping latency between containers
docker exec cfn-agent-1 ping -c 10 postgres | grep "avg"
docker exec cfn-agent-1 ping -c 10 redis | grep "avg"

# Expected: < 1ms within same network

# 3. Measure throughput
docker exec -it postgres bash -c "
  iperf -s -D
"
docker exec cfn-agent-1 iperf -c postgres -t 10

# Expected: > 1Gbps

# 4. Check DNS resolution
docker exec cfn-agent-1 nslookup postgres
docker exec cfn-agent-1 nslookup redis

# Should resolve to container IPs

# 5. Check connection pooling
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT COUNT(*) FROM pg_stat_activity;
" | tail -1

# If > 100, connection pool is saturated
```

**Optimization Steps:**

```bash
# 1. Implement connection pooling in application
# Use PgBouncer for PostgreSQL
# Use Redis connection pooling in agents

# 2. Reduce DNS resolution overhead
# Use IP addresses instead of hostnames in production

# 3. Use TCP keepalive
# APPLICATION_TCP_KEEPALIVE_IDLE=60
# APPLICATION_TCP_KEEPALIVE_INTERVAL=30

# 4. Implement request batching
# Group multiple small requests into single larger request

# 5. Add monitoring
# Track connection latency in Prometheus
# Alert if > 5ms
```

## Performance Improvement Checklist

### Quick Wins (< 15 minutes)
- [ ] Restart slow container
- [ ] Scale up agents if CPU high
- [ ] Terminate idle database connections
- [ ] Clear Redis if memory high
- [ ] Check for log spamming

### Medium Term (< 1 hour)
- [ ] Add missing database indexes
- [ ] Update table statistics
- [ ] Optimize slow queries
- [ ] Increase resource limits
- [ ] Implement caching for frequently accessed data

### Long Term (< 1 week)
- [ ] Code optimization for CPU-bound operations
- [ ] Database schema redesign if needed
- [ ] Caching strategy overhaul
- [ ] Infrastructure upgrade planning
- [ ] Capacity planning and forecasting

## Validation

### Post-Remediation Checks

```bash
#!/bin/bash
# scripts/validate-performance-fix.sh

echo "=== Performance Validation ==="

# 1. Latency metric
LATENCY=$(curl -s 'http://localhost:9090/api/v1/query?query=cfn_task_duration_seconds_p95' | jq '.data.result[0].value[1]')
echo "P95 Latency: ${LATENCY}s (target: <30s)"

# 2. Queue depth
QUEUE=$(curl -s 'http://localhost:9090/api/v1/query?query=cfn_agent_queue_depth' | jq '.data.result[0].value[1]')
echo "Queue depth: $QUEUE (target: <50)"

# 3. Error rate
ERRORS=$(curl -s 'http://localhost:9090/api/v1/query?query=rate(cfn_task_errors_total[5m])' | jq '.data.result[0].value[1]')
echo "Error rate: $ERRORS (target: <0.01)"

# 4. Resource usage
docker stats --no-stream | grep -E "cfn-|NAME"

# 5. Database connections
CONNS=$(docker-compose exec postgres psql -U cfn_user -d cfn -tc "SELECT COUNT(*) FROM pg_stat_activity;")
echo "DB connections: $CONNS (target: <100)"

echo ""
echo "=== Validation Complete ==="
```

## Related Runbooks

- **Incident Response:** docs/runbooks/03-incident-response.md
- **Scaling:** docs/runbooks/02-scaling.md
- **Database Maintenance:** docs/runbooks/04-database-maintenance.md
- **Cache Management:** docs/runbooks/05-cache-management.md
