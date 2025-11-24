# Scaling Runbook

## Overview
This runbook covers horizontal scaling of the CFN Loop system, including agent pool scaling, database scaling, Redis scaling, and capacity planning. Used when demand exceeds current infrastructure capacity.

**Expected Duration:** 20-40 minutes
**Difficulty:** Intermediate-Advanced
**Requires:** Docker Compose/Kubernetes, monitoring access, database access

## Prerequisites

### Monitoring Access
- Prometheus dashboard access (http://localhost:9090)
- Grafana access (http://localhost:3000)
- Container metrics visibility (docker stats)
- Application performance monitoring

### Database Access
- PostgreSQL superuser credentials
- Connection pool configuration access
- Table size analysis tools

### Infrastructure Access
- Docker Compose/Kubernetes cluster management
- Network configuration
- Storage provisioning
- Resource allocation capabilities

## Detection / When to Scale

### Scaling Indicators

**Agent Pool Scaling Needed When:**
```
- Agent Queue Depth: > 100 pending tasks (5min average)
- Agent CPU: > 80% on majority of agents (10min average)
- Agent Memory: > 85% on any agent (5min average)
- Task Latency: P95 > 30 seconds
- Agent Error Rate: > 2% of tasks (5min average)
```

**Redis Scaling Needed When:**
```
- Memory Usage: > 80% of max (threshold: 512MB default)
- Command Latency: > 10ms (P95)
- Eviction Rate: > 1000 operations/minute
- Connected Clients: > 100
- CPU: > 60% sustained
```

**PostgreSQL Scaling Needed When:**
```
- Connection Count: > 80% of max (default: 100)
- Query Latency: P95 > 500ms
- Cache Hit Ratio: < 90%
- Disk Usage: > 75% of allocated space
- Replication Lag: > 10 seconds
```

### Check Current Resource Usage

```bash
#!/bin/bash
# scripts/check-scaling-metrics.sh

set -euo pipefail

echo "=== Scaling Metrics Report ==="
echo ""

# Agent metrics
echo "AGENT POOL:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep cfn-agent
echo ""

# Redis metrics
echo "REDIS:"
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep -E 'ops_per_sec|connected_clients|used_memory_human'
echo ""

# PostgreSQL metrics
echo "POSTGRESQL:"
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    count(*) as total_connections,
    sum(query_start is not null)::int as active_queries,
    extract(epoch from (now() - max(query_start)))::int as longest_query_seconds
  FROM pg_stat_activity;
"
echo ""

# Prometheus query for agent saturation
echo "AGENT QUEUE DEPTH (last 5 minutes):"
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=increase(cfn_agent_queue_depth_total[5m])' | \
  jq '.data.result[0].value[1]'
```

## Response Steps

### Phase 1: Agent Pool Scaling (10 minutes)

**Horizontal Scaling - Add More Agents**

1. **Assess current agent capacity**
   ```bash
   # Get current agent count
   CURRENT_AGENTS=$(docker ps --filter "label=cfn.component=agent" --quiet | wc -l)
   echo "Current agents: $CURRENT_AGENTS"

   # Get average CPU and memory usage
   docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | \
     grep cfn-agent | \
     awk '{print $2, $3}' | \
     awk -F'%' '{cpu+=$1; mem+=$3} END {
       printf "Average CPU: %.1f%%\n", cpu/NR;
       printf "Average Memory: %s\n", mem/NR
     }'

   # Calculate optimal agent count
   # Rule: Add 2 agents for every 100 pending tasks
   PENDING_TASKS=$(curl -s http://localhost:9090/api/v1/query \
     --data-urlencode 'query=cfn_agent_queue_depth' | \
     jq '.data.result[0].value[1]')

   NEW_AGENTS=$((CURRENT_AGENTS + (PENDING_TASKS / 50)))
   echo "Recommended agent count: $NEW_AGENTS"
   ```

2. **Build and push agent image**
   ```bash
   # Build latest agent image
   docker build -t cfn-agent:latest ./docker/agent/

   # Tag for registry
   docker tag cfn-agent:latest registry.example.com/cfn-agent:latest

   # Push to registry
   docker push registry.example.com/cfn-agent:latest

   # Verify push
   docker pull registry.example.com/cfn-agent:latest
   ```

3. **Deploy additional agents**
   ```bash
   #!/bin/bash
   # scripts/scale-agents.sh

   SCALE_BY=${1:-2}
   CURRENT=$(docker ps --filter "label=cfn.component=agent" -q | wc -l)
   TARGET=$((CURRENT + SCALE_BY))

   echo "Scaling agents from $CURRENT to $TARGET"

   for i in $(seq $((CURRENT + 1)) $TARGET); do
     docker run -d \
       --name cfn-agent-$i \
       --network cfn-network \
       --label "cfn.component=agent" \
       --label "cfn.agent.id=agent-$i" \
       -e AGENT_ID="agent-$i" \
       -e REDIS_HOST=redis \
       -e REDIS_PORT=6379 \
       -e REDIS_PASSWORD="$REDIS_PASSWORD" \
       -e POSTGRES_HOST=postgres \
       -e POSTGRES_USER=cfn_user \
       -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
       -e ENVIRONMENT=production \
       -m 2g \
       --cpus="1.5" \
       --restart unless-stopped \
       registry.example.com/cfn-agent:latest

     echo "Deployed agent-$i"
     sleep 2
   done

   # Verify agents registered
   sleep 10
   REGISTERED=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*" | wc -l)
   echo "Total agents registered: $REGISTERED"
   ```

4. **Verify agent scaling**
   ```bash
   # Check all agents are healthy
   docker ps --filter "label=cfn.component=agent" --format "table {{.Names}}\t{{.Status}}"

   # Verify agents registered in Redis
   docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*"

   # Monitor new agents taking tasks
   watch -n 5 'docker stats --no-stream --format "table {{.Names}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep cfn-agent'
   ```

### Phase 2: Redis Scaling (8 minutes)

**Vertical Scaling - Increase Memory Limit**

1. **Check current memory usage**
   ```bash
   # Get Redis memory stats
   docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO memory

   # Expected output includes:
   # used_memory_human: 256M
   # maxmemory: 512M
   ```

2. **Increase Redis memory limit**
   ```bash
   # Update docker-compose.yml maxmemory setting
   # From: --maxmemory 512mb
   # To: --maxmemory 1gb

   # Or use CONFIG SET for immediate effect
   docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET maxmemory 1073741824

   # Verify change
   docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET maxmemory

   # Update maxmemory policy (if needed)
   docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET maxmemory-policy allkeys-lru
   ```

3. **Monitor eviction rate**
   ```bash
   # High eviction rate indicates need for more memory
   docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep evicted_keys

   # Monitor over time
   for i in {1..5}; do
     EVICTED=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep evicted_keys | cut -d: -f2)
     echo "$(date): Evicted: $EVICTED"
     sleep 10
   done
   ```

**Redis Cluster Scaling (Enterprise)**

For Redis cluster deployments:

```bash
# Add new Redis node to cluster
docker run -d \
  --name redis-node-4 \
  --network cfn-network \
  -p 6383:6379 \
  redis:7-alpine \
  redis-server --cluster-enabled yes --cluster-config-file nodes.conf

# Join cluster
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" --cluster add-node \
  redis-node-4:6379 \
  redis-node-1:6379

# Rebalance cluster
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" --cluster rebalance \
  redis-node-1:6379 --cluster-use-empty-masters
```

### Phase 3: PostgreSQL Scaling (12 minutes)

**Connection Pool Scaling**

1. **Check current connection usage**
   ```bash
   # Get connection statistics
   docker-compose exec postgres psql -U cfn_user -d cfn -c "
     SELECT
       datname,
       count(*) as connections,
       max_conn,
       round(100.0 * count(*) / max_conn, 2) as usage_percent
     FROM pg_stat_activity
     JOIN (SELECT setting::int as max_conn FROM pg_settings WHERE name='max_connections') ON true
     GROUP BY datname, max_conn
     ORDER BY usage_percent DESC;
   "

   # Get idle vs active connections
   docker-compose exec postgres psql -U cfn_user -d cfn -c "
     SELECT
       state,
       count(*) as count
     FROM pg_stat_activity
     GROUP BY state;
   "
   ```

2. **Increase connection limit**
   ```bash
   # Temporary increase (requires restart)
   docker-compose exec postgres psql -U postgres -c "
     ALTER SYSTEM SET max_connections = 200;
   "

   # Restart PostgreSQL
   docker-compose restart postgres

   # Wait for restart
   until docker-compose exec postgres pg_isready -U postgres; do
     echo "Waiting for PostgreSQL..."
     sleep 5
   done

   # Verify new limit
   docker-compose exec postgres psql -U postgres -c "
     SHOW max_connections;
   "
   ```

3. **Adjust shared_buffers for better cache**
   ```bash
   # Calculate optimal shared_buffers (25% of system memory)
   # Current: 256MB, recommended: 4GB for 16GB system

   docker-compose exec postgres psql -U postgres -c "
     ALTER SYSTEM SET shared_buffers = '4GB';
   "

   docker-compose restart postgres

   # Verify
   docker-compose exec postgres psql -U postgres -c "
     SHOW shared_buffers;
   "
   ```

**Database Optimization for Scaling**

```bash
# Analyze table sizes
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
  FROM pg_catalog.pg_tables
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"

# Create missing indexes
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  CREATE INDEX CONCURRENTLY idx_agents_status ON agents(status);
  CREATE INDEX CONCURRENTLY idx_agents_spawned_at ON agents(spawned_at DESC);
"

# Vacuum and analyze
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  VACUUM ANALYZE;
"

# Update table statistics
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  ANALYZE agents;
  ANALYZE tasks;
  ANALYZE coordination_events;
"
```

### Phase 4: Monitoring and Load Balancing (5 minutes)

1. **Configure load balancing (if not present)**
   ```bash
   # For Docker Compose, use container health checks
   # For Kubernetes, use service selectors and replicas

   # Verify agents are load balanced
   docker ps --filter "label=cfn.component=agent" --format "{{.ID}} {{.Names}}" | while read ID NAME; do
     TASK_COUNT=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" \
       HGETALL "agent:${NAME}" | grep -c task_)
     echo "$NAME: $TASK_COUNT tasks"
   done
   ```

2. **Monitor post-scaling metrics**
   ```bash
   # Watch queue depth (should decrease)
   watch -n 10 'curl -s "http://localhost:9090/api/v1/query?query=cfn_agent_queue_depth" | jq ".data.result[0].value[1]"'

   # Watch task latency (should stabilize)
   watch -n 10 'curl -s "http://localhost:9090/api/v1/query?query=cfn_task_duration_seconds_p95" | jq ".data.result[0].value[1]"'

   # Watch agent utilization (should be more balanced)
   docker stats --no-stream --format "table {{.Names}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep cfn-agent
   ```

## Validation

### Post-Scaling Validation Checklist

```bash
#!/bin/bash
# scripts/validate-scaling.sh

set -euo pipefail

echo "=== Post-Scaling Validation ==="

# 1. Verify new containers are running
EXPECTED=$1
RUNNING=$(docker ps --filter "label=cfn.component=agent" -q | wc -l)
if [ "$RUNNING" -eq "$EXPECTED" ]; then
  echo "✓ $RUNNING agents running (expected: $EXPECTED)"
else
  echo "✗ Only $RUNNING agents running (expected: $EXPECTED)"
  exit 1
fi

# 2. Verify agents are registered
AGENTS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*" | wc -l)
echo "✓ $AGENTS agents registered in Redis"

# 3. Check queue depth decreased
QUEUE=$(curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=cfn_agent_queue_depth' | \
  jq '.data.result[0].value[1]')
echo "✓ Current queue depth: $QUEUE"

# 4. Verify no OOM errors
OOM_COUNT=$(docker logs $(docker ps -q -f "label=cfn.component=agent") 2>&1 | grep -c "OOMKilled" || true)
if [ "$OOM_COUNT" -eq 0 ]; then
  echo "✓ No OOM errors detected"
else
  echo "✗ $OOM_COUNT OOM errors detected"
  exit 1
fi

# 5. Check latency improvement
LATENCY=$(curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=cfn_task_duration_seconds_p95' | \
  jq '.data.result[0].value[1]')
echo "✓ P95 task latency: ${LATENCY}s"

echo ""
echo "=== Validation Complete ==="
```

### Expected Improvements After Scaling

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Agent Count | 3 | 5 | 5+ |
| Queue Depth | 150 | 45 | <50 |
| P95 Latency | 45s | 22s | <30s |
| Agent CPU | 85% | 55% | <70% |
| Agent Memory | 88% | 62% | <80% |

## Rollback

### If Scaling Causes Issues

```bash
# 1. Stop new agents
docker stop cfn-agent-4 cfn-agent-5

# 2. Reduce Redis memory limit
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG SET maxmemory 536870912

# 3. Reduce PostgreSQL connections (if increased)
docker-compose exec postgres psql -U postgres -c "
  ALTER SYSTEM SET max_connections = 100;
"
docker-compose restart postgres

# 4. Remove new agents
docker rm cfn-agent-4 cfn-agent-5

# 5. Verify system stability
docker stats --no-stream | grep -E "cfn-agent|redis|postgres"
```

## Escalation

### Escalation Matrix

| Issue | Action | Contact |
|-------|--------|---------|
| Agent scaling reaches infrastructure limits | Request additional compute resources | Infrastructure team |
| Redis eviction rate remains high after scaling | Design Redis cluster topology | Database team |
| PostgreSQL connections hit OS limit | Increase system ulimits | System administrator |
| Query latency doesn't improve after scaling | Analyze slow queries | Database performance team |
| Scaling fails due to network issues | Check network configuration | Network team |

### Support Contacts
- **Infrastructure Team:** infrastructure@example.com / Slack #infrastructure
- **Database Team:** database@example.com / Slack #database
- **On-Call SRE:** Check PagerDuty escalation

### Post-Scaling Tasks

1. **Document scaling event**
   ```bash
   cat >> scaling-log.txt <<EOF
   Date: $(date -u)
   Reason: Queue depth exceeded 100
   Before: 3 agents
   After: 5 agents
   Queue reduction: 150 → 45 tasks
   Latency improvement: 45s → 22s
   Performed by: $(whoami)
   EOF
   ```

2. **Update capacity plan**
   - Record new baseline metrics
   - Update runbook thresholds if needed
   - Schedule next scaling review

3. **Update infrastructure documentation**
   - Document current resource allocation
   - Update scaling procedures if improved
   - Share findings with team
