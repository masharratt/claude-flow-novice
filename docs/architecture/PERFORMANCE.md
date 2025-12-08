# Performance Optimization - Architecture Reference

Performance patterns, bottlenecks, and optimization strategies for CFN agent systems.

## Table of Contents
1. [Performance Metrics](#performance-metrics)
2. [Critical Bottlenecks](#critical-bottlenecks)
3. [Optimization Strategies](#optimization-strategies)
4. [Scalability Assessment](#scalability-assessment)
5. [Database Performance](#database-performance)
6. [Redis Performance](#redis-performance)
7. [Docker Performance](#docker-performance)
8. [Agent Performance](#agent-performance)
9. [Monitoring & Benchmarking](#monitoring--benchmarking)

---

## Performance Metrics

### Current Baseline (Skills Database)

| Operation | Current | Target | Status |
|-----------|---------|--------|--------|
| Skill deployment | 268ms | <500ms | ✅ PASS |
| Skill loading (cached) | 25ms | <30ms | ✅ PASS |
| Skill loading (cold) | 27ms | <30ms | ✅ PASS |
| Analytics queries | 22-56ms | <100ms | ✅ PASS |
| **Skill update** | **535ms** | **<500ms** | ❌ FAIL |
| Dual logging | 24ms | <50ms | ✅ PASS |
| Concurrent operations (20 queries) | 109ms | <200ms | ✅ PASS |

### System-Level Metrics

| Metric | Value | Threshold |
|--------|-------|-----------|
| Agent spawn time | 2-5s | <10s |
| Redis response time | <1ms | <5ms |
| SQLite query time | 10-50ms | <100ms |
| Docker container start | 1-2s | <5s |
| Memory usage per agent | 512MB-1GB | <2GB |
| CPU usage per agent | 0.5-1.0 cores | <2 cores |

### Performance Score Calculation

```
Overall Score: 7.8/10
Expected After Optimization: 8.6/10 (+1.0 point, -30% latency)
```

---

## Critical Bottlenecks

### 1. Skill Update Performance (CRITICAL)

**Impact:** High | **Frequency:** Low | **Fix Difficulty:** Medium

**Location:** `.claude/skills/workflow-codification/deploy-approved-skill.sh`

**Root Cause:** Multiple separate `sqlite3` invocations:
```bash
# Current: 5+ separate calls = 350ms overhead
sqlite3 "$DB" "INSERT INTO skills..."                    # 50-80ms
sqlite3 "$DB" "INSERT INTO approval_history..."           # 50-80ms
sqlite3 "$DB" "UPDATE skills SET..."                      # 50-80ms
sqlite3 "$DB" "INSERT INTO agent_skill_mappings..."       # 50-80ms per agent
```

**Solution:** Batch into single transaction:
```bash
# Optimized: 1-2 calls = 60ms overhead
sqlite3 "$DB" <<'EOF'
BEGIN TRANSACTION;
INSERT INTO skills ...;
INSERT INTO approval_history ...;
UPDATE skills SET ...;
INSERT INTO agent_skill_mappings ...;
COMMIT;
EOF
```

**Expected Improvement:** 535ms → 150ms (-72% latency)

### 2. LRU Cache Inefficiency (MEDIUM)

**Impact:** Medium | **Frequency:** High | **Fix Difficulty:** Low

**Root Cause:** Cache misses due to small cache size (50 items).

**Solution:** Implement adaptive cache sizing:
```bash
# Increase cache size based on system memory
SYSTEM_MEMORY=$(free -g | awk '/^Mem:/{print $2}')
CACHE_SIZE=$((SYSTEM_MEMORY * 100))  # 100 items per GB
```

**Expected Improvement:** 40% hit rate → 75% hit rate

### 3. Missing Database Indexes (MEDIUM)

**Impact:** Medium | **Frequency:** High | **Fix Difficulty:** Low

**Solution:**
```sql
CREATE INDEX idx_skills_name_hash ON skills(name, content_hash);
CREATE INDEX idx_approval_history_skill_created ON approval_history(skill_id, created_at);
CREATE INDEX idx_agent_mappings_agent_skill ON agent_skill_mappings(agent_id, skill_id);
```

**Expected Improvement:** Query time -40%

---

## Optimization Strategies

### Batch Operations Pattern

**Before:** Individual operations
```bash
for skill in $SKILLS; do
  sqlite3 "$DB" "INSERT INTO skills VALUES (...)"  # 50ms each
done
```

**After:** Batched transactions
```bash
sqlite3 "$DB" <<'EOF'
BEGIN TRANSACTION;
$(printf "INSERT INTO skills VALUES (...);\n" $SKILLS)
COMMIT;
EOF
```

**Performance Gain:** 10x improvement for bulk operations

### Connection Pooling

**Implementation:**
```javascript
class ConnectionPool {
  constructor(maxSize = 10) {
    this.pool = [];
    this.maxSize = maxSize;
  }

  async acquire() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    return new Promise((resolve, reject) => {
      const conn = new Redis(config.redis);
      conn.on('connect', () => resolve(conn));
      conn.on('error', reject);
    });
  }

  release(conn) {
    if (this.pool.length < this.maxSize) {
      this.pool.push(conn);
    } else {
      conn.quit();
    }
  }
}
```

**Performance Gain:** 60-80% reduction in connection overhead

### Query Result Caching

**Redis Cache Layer:**
```bash
# Cache query results with TTL
cache_query() {
  local query="$1"
  local ttl="${2:-3600}"
  local key="cache:query:$(echo "$query" | sha256sum | cut -c1-16)"

  # Check cache first
  local cached=$(redis-cli GET "$key" 2>/dev/null)
  if [ -n "$cached" ]; then
    echo "$cached"
    return 0
  fi

  # Execute query and cache result
  local result=$(sqlite3 "$DB" "$query")
  redis-cli SETEX "$key" "$ttl" "$result" >/dev/null
  echo "$result"
}
```

**Performance Gain:** 90% reduction for repeated queries

---

## Scalability Assessment

### Current State (11 skills, 50 logs)
- Database size: 228KB
- Query response: 22-56ms
- Cache hit rate: ~40%
- Capacity utilization: <2%

### Projected Growth

| Scale | Database Size | Query Time | Concerns | Recommendations |
|-------|---------------|------------|----------|-----------------|
| 100 skills | ~2MB | 25-70ms | Low | Monitor cache hit rate |
| 1,000 skills | ~20MB | 30-90ms | Medium | Increase cache to 500 items |
| 10,000+ skills | ~200MB | 100-500ms | High | Migrate to PostgreSQL |

### Scaling Strategies

**Phase 1: SQLite Optimizations (0-1,000 skills)**
- Implement aggressive caching
- Batch operations
- Optimize indexes

**Phase 2: Hybrid Approach (1,000-10,000 skills)**
- SQLite for hot data
- PostgreSQL for analytics
- Redis for coordination

**Phase 3: Full Migration (10,000+ skills)**
- PostgreSQL primary
- Read replicas for analytics
- Sharding for massive scale

---

## Database Performance

### SQLite Optimization

**PRAGMA Settings:**
```sql
PRAGMA journal_mode = WAL;          -- Better concurrency
PRAGMA synchronous = NORMAL;        -- Balance safety/performance
PRAGMA cache_size = -64000;         -- 64MB cache
PRAGMA temp_store = MEMORY;         -- Temp tables in memory
PRAGMA mmap_size = 268435456;       -- 256MB memory mapping
```

**Batch Insert Pattern:**
```bash
# Prepare batch data
batch_data=""
for record in "$@"; do
  batch_data+="INSERT INTO skills VALUES ($record);"
done

# Execute as single transaction
{
  echo "PRAGMA journal_mode = WAL;"
  echo "BEGIN TRANSACTION;"
  echo "$batch_data"
  echo "COMMIT;"
} | sqlite3 "$DB"
```

**Vacuum and Analyze:**
```bash
# Schedule regular maintenance
sqlite3 "$DB" "VACUUM;"
sqlite3 "$DB" "ANALYZE;"
```

### PostgreSQL Migration Benefits

**Advantages for High Scale:**
- True concurrent writes
- Better query planner
- Partitioning support
- Native replication

**Migration Path:**
```bash
# Export SQLite data
sqlite3 "$DB" ".dump --data-only" > data.sql

# Import to PostgreSQL
psql "$PG_URL" < data.sql
```

---

## Redis Performance

### Memory Optimization

**Key Expiry Strategy:**
```bash
# Set appropriate TTLs
redis-cli SETEX "session:$TASK_ID" 3600 "$DATA"        # 1 hour
redis-cli SETEX "coord:$TASK_ID" 86400 "$STATE"       # 24 hours
redis-cli SETEX "cache:query:$HASH" 300 "$RESULT"     # 5 minutes
```

**Memory Monitoring:**
```bash
# Check memory usage
redis-cli INFO memory | grep used_memory_human

# Monitor key expiration
redis-cli CONFIG SET notify-keyspace-events Ex
```

### Pipeline Operations

**Batch Commands:**
```javascript
// Redis pipeline for multiple operations
const pipeline = redis.pipeline();
pipeline.hset('context:task1', 'field1', 'value1');
pipeline.hset('context:task1', 'field2', 'value2');
pipeline.expire('context:task1', 3600);
await pipeline.exec();
```

**Performance Gain:** 5-10x improvement for bulk operations

### Connection Management

**Connection Pool Configuration:**
```javascript
const redis = new Redis({
  port: 6379,
  host: 'redis',
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
  keepAlive: 30000,
  maxMemoryPolicy: 'allkeys-lru'
});
```

---

## Docker Performance

### Build Optimization

**Linux Native Build:**
```bash
# REQUIRED: Build from Linux filesystem
export DOCKER_BUILDKIT=1
docker build \
  --file docker/Dockerfile.agent \
  --target production \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --cache-from cfn-agent:cache \
  --tag cfn-agent:latest \
  .

# Build times:
# Windows mount: ~755s
# Linux native: <20s
```

### Container Resource Tuning

**Memory Limits:**
```yaml
services:
  agent:
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
        reservations:
          memory: 512M
          cpus: '0.5'
    environment:
      - NODE_OPTIONS=--max-old-space-size=768
```

**CPU Pinning (for high-performance):**
```yaml
services:
  agent:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          cpuset: '0,1'  # Pin to specific cores
```

### Volume Performance

**Optimized Volume Configuration:**
```yaml
services:
  agent:
    volumes:
      - type: tmpfs
        target: /tmp
        tmpfs:
          size: 1G
          mode: 1777
      - type: bind
        source: ${PWD}/.claude
        target: /root/.claude
        bind:
          propagation: shared
```

---

## Agent Performance

### Spawn Time Optimization

**Pre-warming Strategy:**
```bash
# Maintain pool of warm containers
docker run -d --name agent-pool-1 cfn-agent:latest sleep infinity
docker run -d --name agent-pool-2 cfn-agent:latest sleep infinity

# Quick spawn from pool
docker exec agent-pool-1 /root/.claude/agents/entrypoint.sh
```

**Parallel Spawning:**
```bash
# Spawn agents in parallel
for agent_id in $AGENT_IDS; do
  (
    export AGENT_ID="$agent_id"
    ./spawn-agent.sh "$agent_id" "$TASK_ID"
  ) &
done
wait
```

### Memory Management

**Garbage Collection Tuning:**
```bash
export NODE_OPTIONS="--max-old-space-size=768 --max-new-space-size=128"
```

**Memory Cleanup:**
```bash
# Cleanup after agent completion
cleanup_agent() {
  local agent_id="$1"
  docker stop "agent-${agent_id}" || true
  docker rm "agent-${agent_id}" || true

  # Clear Redis keys
  redis-cli DEL "coord:${TASK_ID}:${agent_id}:*" 2>/dev/null || true
}
```

### Execution Optimization

**Timeout Management:**
```bash
# Adaptive timeout based on task complexity
calculate_timeout() {
  local complexity="$1"
  local base_timeout=300

  case "$complexity" in
    "low") echo $((base_timeout / 2)) ;;
    "medium") echo $base_timeout ;;
    "high") echo $((base_timeout * 2)) ;;
  esac
}
```

---

## Monitoring & Benchmarking

### Performance Metrics Collection

**Prometheus Metrics:**
```javascript
// Custom metrics registry
const client = require('prom-client');

const agentSpawnDuration = new client.Histogram({
  name: 'agent_spawn_duration_seconds',
  help: 'Time to spawn agent container',
  labelNames: ['agent_type', 'mode']
});

const queryDuration = new client.Histogram({
  name: 'database_query_duration_seconds',
  help: 'Database query execution time',
  labelNames: ['query_type', 'table']
});
```

### Benchmarking Tools

**Database Benchmark:**
```bash
#!/bin/bash
# Benchmark script for SQLite operations

benchmark_sql() {
  local iterations="$1"
  local query="$2"

  echo "Benchmarking: $query"

  for i in $(seq 1 $iterations); do
    start=$(date +%s%N)
    sqlite3 "$DB" "$query" >/dev/null
    end=$(date +%s%N)

    duration=$(((end - start) / 1000000))
    echo "$duration"
  done
}

# Run benchmarks
benchmark_sql 1000 "SELECT * FROM skills WHERE name = 'test'"
benchmark_sql 100 "INSERT INTO skills VALUES (...)"

# Calculate statistics
awk '{sum+=$1; sumsq+=$1*$1} END {print "Avg:", sum/NR, "Std:", sqrt(sumsq/NR - (sum/NR)^2)}'
```

### Performance Alerts

**Alert Rules:**
```yaml
# alerts.yml
groups:
  - name: performance
    rules:
      - alert: SlowQuery
        expr: histogram_quantile(0.95, database_query_duration_seconds) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow database queries detected"

      - alert: HighMemoryUsage
        expr: container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.9
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Container approaching memory limit"
```

### Continuous Performance Testing

**Load Test Script:**
```bash
#!/bin/bash
# Load test CFN Loop with concurrent agents

concurrent_agents=${1:-10}
test_duration=${2:-300}

echo "Starting load test: $concurrent_agents agents for ${test_duration}s"

# Spawn test agents
for i in $(seq 1 $concurrent_agents); do
  AGENT_ID="test-agent-$i" \
  TASK_ID="load-test-$(date +%s)" \
  ./spawn-agent.sh &
done

# Monitor metrics during test
start_time=$(date +%s)
while [ $(($(date +%s) - start_time)) -lt $test_duration ]; do
  # Collect metrics
  memory_usage=$(docker stats --no-stream --format "{{.MemUsage}}" | head -1)
  redis_ops=$(redis-cli INFO stats | grep instantaneous_ops_per_sec)

  echo "$(date): Memory: $memory_usage, Redis ops: $redis_ops"
  sleep 10
done
```

---

## Performance Quick Reference

### Optimization Priority Matrix

| Area | Impact | Effort | Priority | Est. Time |
|------|--------|--------|----------|-----------|
| Skill Update | High | 2h | P0 | 1-2 days |
| LRU Cache | Medium | 3h | P1 | 3-5 days |
| Indexes | Medium | 1h | P1 | 1 day |
| Connection Pooling | Medium | 4h | P1 | 2-3 days |
| Query Caching | High | 6h | P1 | 3-4 days |
| PostgreSQL Migration | Strategic | 16h | P3 | 1-2 weeks |

### Performance Check Commands

```bash
# Database performance
sqlite3 "$DB" "EXPLAIN QUERY PLAN SELECT * FROM skills WHERE name = 'test'"
sqlite3 "$DB" "PRAGMA table_info(skills)"

# Redis performance
redis-cli LATENCY LATEST
redis-cli INFO stats

# Container performance
docker stats --no-stream
docker exec $CONTAINER cat /proc/meminfo

# Network performance
iperf3 -c redis -t 30
```

### Performance Tuning Checklist

**Database:**
- [ ] Add appropriate indexes
- [ ] Use WAL journal mode
- [ ] Implement query result caching
- [ ] Batch operations in transactions
- [ ] Regular VACUUM and ANALYZE

**Redis:**
- [ ] Set appropriate key TTLs
- [ ] Use pipelines for bulk operations
- [ ] Monitor memory usage
- [ ] Implement connection pooling

**Docker:**
- [ ] Build from Linux filesystem
- [ ] Set appropriate resource limits
- [ ] Use tmpfs for temporary data
- [ ] Pin CPUs for performance-critical tasks

**Agents:**
- [ ] Implement timeouts
- [ ] Cleanup resources after completion
- [ ] Use parallel spawning where appropriate
- [ ] Monitor memory usage