# Alert Response Runbook

## Overview
This runbook provides standardized response procedures for production alerts. Each alert includes severity classification, detection method, root cause analysis, response steps, and escalation paths.

**Expected Duration:** 5-15 minutes per alert
**Difficulty:** Intermediate
**Requires:** Monitoring dashboard access, incident management system

## Alert Severity and Response SLA

| Severity | Impact | Response SLA | Acknowledgement | Example |
|----------|--------|--------------|-----------------|---------|
| P1-Critical | System down, data loss risk | Immediate (page on-call) | < 2 min | All agents down |
| P2-High | Significant degradation | 15 minutes | < 5 min | 50% error rate |
| P3-Medium | Minor degradation | 1 hour | < 30 min | Single component degraded |
| P4-Low | Informational only | Next business day | During work hours | High latency trend |

## Alert Catalog

### P1 Alerts

#### Alert: RedisDown

**Threshold:** Redis container not responding for >1 minute

**Detection:**
```bash
# Alert in Prometheus
up{job="redis"} == 0

# Manual check
docker-compose ps | grep redis | grep -v "Up"
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" PING
```

**Root Cause Analysis:**
```bash
# 1. Is container running?
docker ps | grep redis
# If not listed: docker-compose up -d redis

# 2. Check container health
docker inspect redis | jq '.State'

# 3. Check logs for startup errors
docker logs redis --tail 50

# Possible causes:
# - Out of memory (OOM killed)
# - Disk full (can't write AOF)
# - Port already in use
# - Configuration error
```

**Response Steps:**

```bash
# 1. Immediate action: Restart Redis
docker-compose restart redis

# 2. Wait for health check
until docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" PING | grep -q PONG; do
  echo "Waiting for Redis..."
  sleep 5
done

# 3. Verify data integrity
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO keyspace

# 4. Verify agents reconnected
sleep 10
AGENTS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*" | wc -l)
echo "Agents registered: $AGENTS"

# 5. If restart fails, investigate further
if [ $? -ne 0 ]; then
  echo "ERROR: Redis restart failed"

  # Check disk space
  df -h /var/lib/docker/volumes/redis-data/

  # Check system memory
  free -h

  # Clear old logs if disk is full
  docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET "dbfilename"

  # Escalate to Infrastructure team
fi
```

**Validation:**
- Redis responding to PING
- Connection pool healthy (<50 clients)
- All keys accessible
- Agents communicating via Redis

**Escalation:** If restart fails, escalate to Infrastructure team

---

#### Alert: PostgreSQLDown

**Threshold:** PostgreSQL container not responding for >1 minute

**Detection:**
```bash
# Alert
up{job="postgres"} == 0

# Manual check
docker-compose exec postgres pg_isready -U postgres
docker ps | grep postgres | grep -v "Up"
```

**Response Steps:**

```bash
# 1. Check container status
docker-compose ps postgres

# 2. Restart database
docker-compose restart postgres

# 3. Wait for startup
until docker-compose exec postgres pg_isready -U postgres; do
  echo "Waiting for PostgreSQL..."
  sleep 5
done

# 4. Verify data integrity
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT COUNT(*) as table_count FROM information_schema.tables
  WHERE table_schema = 'public';
"

# 5. Check replication status (if applicable)
docker-compose exec postgres psql -U postgres -c "
  SELECT client_addr, state, sync_state FROM pg_stat_replication;
"

# If restart fails:
docker logs postgres --tail 100 | grep -E "ERROR|FATAL"
```

**Validation:**
- PostgreSQL accepting connections
- All tables accessible
- No connection errors in agent logs
- Replication in sync (if applicable)

**Escalation:** DBA team if restart doesn't resolve

---

#### Alert: AllAgentsDown

**Threshold:** 0 agents healthy for >2 minutes

**Detection:**
```bash
# Alert
cfn_agents_healthy == 0

# Manual check
docker ps --filter "label=cfn.component=agent" -q | wc -l
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*" | wc -l
```

**Response Steps:**

```bash
# 1. Check container status
docker ps --filter "label=cfn.component=agent" --format "{{.Names}}\t{{.Status}}"

# 2. Check for crashloop
docker logs cfn-agent-1 --tail 50 | grep -E "ERROR|panic|FATAL"

# 3. Check dependencies
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" PING
docker-compose exec postgres pg_isready -U postgres

# 4. Restart all agents
docker-compose up -d cfn-agent-1 cfn-agent-2 cfn-agent-3

# 5. Monitor startup
watch -n 2 'docker ps --filter "label=cfn.component=agent" --format "{{.Names}}\t{{.Status}}"'

# 6. Verify registration
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*"

# If agents still not starting:
# Check resource constraints
docker stats --no-stream | grep cfn-agent

# Check error logs
docker logs cfn-agent-1 --tail 200
```

**Validation:**
- All agent containers running
- Agents registered in Redis
- Agents accepting tasks
- Queue depth decreasing

**Escalation:** Page on-call SRE for infrastructure issues

---

### P2 Alerts

#### Alert: HighMemoryUsage

**Threshold:** Any container >85% of memory limit

**Detection:**
```bash
# Alert
container_memory_usage_bytes / container_spec_memory_limit_bytes > 0.85

# Manual check
docker stats --no-stream --format "table {{.Names}}\t{{.MemUsage}}\t{{.MemPerc}}"
```

**Response Steps:**

```bash
# See: Incident Response Runbook → Memory Leak / High Memory Usage
# Or: Scaling Runbook → Phase 2: Agent Pool Scaling

# Quick steps:
# 1. Identify container
CONTAINER="cfn-agent-1"

# 2. Monitor growth
for i in {1..5}; do
  MEM=$(docker stats --no-stream --format "{{.MemUsage}}" "$CONTAINER")
  echo "$(date +%H:%M:%S) - $MEM"
  sleep 30
done

# 3. If memory keeps growing, restart
docker restart "$CONTAINER"

# 4. If multiple agents high, scale up
./scripts/scale-agents.sh 2

# 5. Check for memory leaks in code
docker logs "$CONTAINER" | grep -E "memory|alloc|gc"
```

**Validation:**
- Memory usage <80% after action
- No memory growth over 5 minutes
- Container stable

**Escalation:** If grows after restart, escalate to backend team

---

#### Alert: HighCPUUsage

**Threshold:** Agent CPU >90% for >5 minutes

**Detection:**
```bash
# Alert
rate(process_cpu_seconds_total[5m]) > 0.9

# Manual check
docker stats --no-stream --format "table {{.Names}}\t{{.CPUPerc}}"
```

**Response Steps:**

```bash
# 1. Identify CPU consumer
CONTAINER="cfn-agent-1"

# 2. Check what's running
docker exec $CONTAINER ps aux | sort -k3 -rn | head -10

# 3. Check logs for busy loops
docker logs $CONTAINER --tail 100 | tail -20

# 4. Reduce load by:
#    Option A: Scale up agents
./scripts/scale-agents.sh 2

#    Option B: Restart agent
docker restart $CONTAINER

# 5. Monitor CPU after action
watch -n 5 "docker stats $CONTAINER --no-stream"

# 6. Check for specific expensive operations
docker logs $CONTAINER | grep -E "processing|loop|iteration"
```

**Validation:**
- CPU < 80% after action
- Task queue not growing
- Latency improving

**Escalation:** If CPU remains high after scaling, check code for infinite loops

---

#### Alert: HighQueueDepth

**Threshold:** Pending tasks >100 for >5 minutes

**Detection:**
```bash
# Alert
cfn_agent_queue_depth > 100

# Manual check
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=cfn_agent_queue_depth' | jq '.data.result[0].value[1]'
```

**Response Steps:**

```bash
# 1. Check agent status
docker ps --filter "label=cfn.component=agent" --format "{{.Names}}\t{{.Status}}"

# 2. Check queue length
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" LLEN task_queue

# 3. If agents healthy, scale up
./scripts/scale-agents.sh 3  # Add 3 agents

# 4. Monitor queue drain
watch -n 10 'docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" LLEN task_queue'

# 5. Investigate if queue grows again
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" LRANGE task_queue 0 5

# If queue doesn't drain:
#   - Check for stuck agents
#   - Check Redis latency
#   - Check database connection pool
```

**Validation:**
- Queue depth < 50 after scaling
- Queue draining steadily
- No new tasks stuck

**Escalation:** If queue keeps growing, investigate agent health

---

### P3 Alerts

#### Alert: HighLatency

**Threshold:** P95 task latency >30 seconds

**Detection:**
```bash
# Alert
histogram_quantile(0.95, cfn_task_duration_seconds) > 30

# Manual check
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, cfn_task_duration_seconds)' | jq '.data.result[0].value[1]'
```

**Response:**

```bash
# 1. Check system resources
docker stats --no-stream | grep -E "cfn-|NAME"

# 2. Check database performance
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    pid,
    now() - query_start as duration,
    LEFT(query, 50)
  FROM pg_stat_activity
  WHERE query_start < NOW() - INTERVAL '1 minute';
"

# 3. Check Redis latency
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" --latency

# 4. Identify slow agents
docker stats --no-stream --format "table {{.Names}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep cfn-agent

# 5. Check for network issues
docker inspect cfn-orchestrator | jq '.NetworkSettings.Networks'

# Remediation options:
# - Scale up (high CPU/memory)
# - Restart slow agent
# - Check database indexes
# - Monitor trend
```

**Validation:**
- P95 latency < 30 seconds
- Trend stabilizing
- Resource usage normal

---

#### Alert: DiskSpaceHigh

**Threshold:** Disk usage >85%

**Detection:**
```bash
# Alert
node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.15

# Manual check
df -h /
du -sh /var/lib/docker/volumes/*/
```

**Response:**

```bash
# See: Incident Response Runbook → Disk Space Exhaustion

# Quick steps:
# 1. Identify large directories
du -sh /* | sort -rh | head -10

# 2. Check Docker volumes
docker volume ls --format "{{.Name}}" | while read vol; do
  SIZE=$(docker run --rm -v $vol:/data busybox du -sh /data 2>/dev/null | cut -f1)
  echo "$vol: $SIZE"
done | sort -rh

# 3. Clean old logs
docker system prune -f
docker container prune -f

# 4. Clean database old records
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  DELETE FROM agent_logs WHERE created_at < NOW() - INTERVAL '30 days';
  VACUUM ANALYZE;
"

# 5. Verify space freed
df -h /
```

**Validation:**
- Disk usage <75%
- System operational
- Alerts cleared

**Escalation:** If disk keeps filling, investigate application logging

---

### P4 Alerts

#### Alert: HighTaskErrorRate

**Threshold:** Task failure rate >1% over 5 minutes

**Detection:**
```bash
# Alert
rate(cfn_task_errors_total[5m]) > 0.01

# Manual check
curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=rate(cfn_task_errors_total[5m])' | jq '.data.result[0].value[1]'
```

**Response:**

```bash
# 1. Check error logs
docker logs cfn-agent-1 --tail 100 | grep ERROR

# 2. Identify error patterns
docker logs cfn-agent-1 | grep -E "ERROR|WARN" | cut -d: -f2- | sort | uniq -c | sort -rn | head -5

# 3. Check if specific task type fails
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    task_type,
    COUNT(*) as total,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failures
  FROM tasks
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY task_type
  ORDER BY failures DESC;
"

# 4. Create ticket for engineering team
# Include: error type, failure rate, affected task type
```

**Validation:**
- Error rate < 0.5%
- Root cause identified
- Ticket tracked

---

## Alert Management

### Alert Acknowledgement

```bash
#!/bin/bash
# scripts/acknowledge-alert.sh

ALERT_ID="$1"
ACK_MESSAGE="$2"

# 1. Log acknowledgement
echo "$(date) - ACK: $ALERT_ID - $ACK_MESSAGE" >> /var/log/alerts.log

# 2. Update incident tracking
# POST to incident system with ack timestamp

# 3. Notify team
# Slack: ACK received, investigating
```

### Alert Suppression

Use for maintenance windows:

```bash
# Suppress specific alert during maintenance (30 minutes)
curl -X POST "http://localhost:9093/api/v1/alerts" \
  -H "Content-Type: application/json" \
  -d '{
    "labels": {
      "alertname": "HighCPUUsage"
    },
    "silenceMatchers": [
      {
        "name": "alertname",
        "value": "HighCPUUsage",
        "isRegex": false
      }
    ],
    "comment": "Maintenance window: server upgrade",
    "createdBy": "$(whoami)",
    "startsAt": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "endsAt": "'"$(date -u -d '+30 minutes' +%Y-%m-%dT%H:%M:%SZ)"'"
  }'
```

## Alert Response Checklist

### Every Alert Response Should Include

- [ ] Alert acknowledged within SLA
- [ ] Root cause identified
- [ ] Response steps executed
- [ ] Validation performed
- [ ] Escalation made if needed
- [ ] Incident logged
- [ ] Post-incident ticket created (if needed)

### Post-Alert Tasks

1. **Within 1 hour:**
   - [ ] Incident documented
   - [ ] Root cause posted to team
   - [ ] Temporary fix in place

2. **Within 24 hours:**
   - [ ] Permanent fix deployed
   - [ ] Alerts tested and verified
   - [ ] Team notified of resolution

3. **Within 1 week:**
   - [ ] Prevention measures implemented
   - [ ] Runbook updated with learnings
   - [ ] Post-mortem completed (if P1/P2)

## Related Documentation

- **Incident Response:** docs/runbooks/03-incident-response.md
- **Memory Exhaustion:** docs/runbooks/memory-exhaustion.md
- **High CPU:** docs/runbooks/high-cpu.md (if exists)
- **Monitoring Setup:** monitoring/README.md
