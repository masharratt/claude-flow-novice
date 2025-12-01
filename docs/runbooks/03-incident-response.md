# Incident Response Runbook

## Overview
This runbook covers response procedures for critical production incidents including high CPU, memory leaks, connection pool exhaustion, and service degradation. Designed for rapid triage and resolution under pressure.

**Expected Duration:** 15-30 minutes for initial response
**Difficulty:** Advanced
**Requires:** Root/admin access, monitoring tools, command-line proficiency

## Prerequisites

### Access and Permissions
- Docker host SSH access
- PostgreSQL superuser credentials
- Redis authentication
- Kubernetes cluster access (if applicable)
- PagerDuty/incident management system access
- Communication channels (Slack, email)

### Tools Required
- Docker CLI
- psql (PostgreSQL client)
- redis-cli
- curl or wget
- System profiling tools (top, htop, iotop, vmstat, iostat)
- Log analysis tools (grep, jq, awk)

## Incident Classification

### Severity Levels

| Level | Impact | Response Time | Owner | Examples |
|-------|--------|---------------|-------|----------|
| P1-Critical | System down | Immediate (0 min) | On-call SRE | All agents down, data loss risk |
| P2-High | Degraded service | 15 minutes | Team lead | 50% task failure rate, queue overflow |
| P3-Medium | Minor impact | 1 hour | Team member | Single agent stuck, high latency |
| P4-Low | Informational | Next business day | Backlog | Non-urgent optimizations |

## Detection / Incident Triage

### Initial Response (2-3 minutes)

1. **Acknowledge incident and start timer**
   ```bash
   # Log incident start
   INCIDENT_START=$(date +%s)
   INCIDENT_ID="INC-$(date +%Y%m%d-%H%M%S)"

   # Notify team
   # Send to #incidents channel:
   # "[INCIDENT] $INCIDENT_ID: [Severity] [Brief description] - Response started at $(date)"

   # Create incident tracking
   mkdir -p /tmp/incidents/$INCIDENT_ID
   cd /tmp/incidents/$INCIDENT_ID
   ```

2. **Gather initial system state (snapshot)**
   ```bash
   #!/bin/bash
   # scripts/incident-snapshot.sh

   OUTPUT_DIR="${1:-.}"
   mkdir -p "$OUTPUT_DIR"

   # Container status
   docker ps --all --format json > "$OUTPUT_DIR/containers.json"
   docker stats --no-stream --format json > "$OUTPUT_DIR/container-stats.json"

   # System resources
   free -h > "$OUTPUT_DIR/memory.txt"
   df -h > "$OUTPUT_DIR/disk.txt"
   top -bn1 > "$OUTPUT_DIR/top.txt"
   ps aux > "$OUTPUT_DIR/processes.txt"

   # Network
   netstat -an | head -50 > "$OUTPUT_DIR/netstat.txt"
   ip a > "$OUTPUT_DIR/ip-addr.txt"

   # Container logs (last 100 lines)
   for container in $(docker ps -q); do
     NAME=$(docker inspect -f '{{.Name}}' "$container" | sed 's/^///')
     docker logs --tail 100 "$container" > "$OUTPUT_DIR/logs-$NAME.txt" 2>&1
   done

   echo "Incident snapshot collected to $OUTPUT_DIR"
   ```

3. **Check system health dashboard**
   ```bash
   # Open Grafana: http://localhost:3000
   # View dashboards:
   # - System Resources (CPU, memory, disk)
   # - Docker Containers (container stats)
   # - Agent Performance (agent metrics)

   # Or query Prometheus directly:
   curl -s 'http://localhost:9090/api/v1/query' \
     --data-urlencode 'query=up' | jq '.data.result[] | select(.value[1] == "0")'
   ```

## Response Steps

### Incident Type: High CPU Usage

**Symptoms:**
- Agent CPU > 90%
- System CPU > 95%
- Alerts: `HighCPUUsage`, `CPUThrottling`
- System sluggish, slow task processing

**Response:**

```bash
# 1. Identify CPU-consuming processes
ps aux --sort=-%cpu | head -20

# Find top container by CPU
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}" | sort -t'%' -k2 -rn | head -5

# 2. Check what's causing CPU spike
CONTAINER="cfn-agent-1"  # Replace with actual container

# Get process list inside container
docker exec $CONTAINER ps aux

# Monitor real-time CPU usage
docker stats $CONTAINER --no-stream

# Check for runaway processes
docker exec $CONTAINER ps aux | sort -k3 -rn

# 3. Analyze application logs
docker logs $CONTAINER --tail 50 | grep -E "ERROR|WARN|CPU|loop"

# 4. Check for infinite loops or deadlocks
docker exec $CONTAINER curl http://localhost:3001/debug/pprof/goroutine 2>/dev/null || true

# 5. If safe to restart agent
docker restart $CONTAINER

# 6. Monitor CPU drop
watch -n 2 "docker stats $CONTAINER --no-stream"
```

**Prevention:**
- Set CPU limits: `--cpus="1.5"`
- Enable CPU throttling monitoring
- Regular profiling of agent code

### Incident Type: Memory Leak / High Memory Usage

**Symptoms:**
- Agent memory steadily increasing
- Memory > 2GB per agent
- Alerts: `HighMemoryUsage`, `OOMKilled`
- Swap usage high, system slowdown

**Response:**

```bash
# 1. Identify memory consumer
docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}" | sort -t'/' -k1 -rn

# 2. Monitor memory growth over time
CONTAINER="cfn-agent-1"
for i in {1..10}; do
  MEM=$(docker inspect $CONTAINER --format '{{.State.Pid}}' | xargs -I{} cat /proc/{}/status | grep VmRSS | awk '{print $2}')
  echo "$(date +%H:%M:%S) - $MEM KB"
  sleep 30
done

# 3. Check for memory leak patterns
docker logs $CONTAINER --tail 200 | grep -E "memory|leak|alloc|gc"

# 4. Dump memory usage by process
docker exec $CONTAINER ps aux | sort -k6 -rn

# 5. If memory keeps growing, restart agent
docker restart $CONTAINER

# 6. Increase swap if needed (temporary)
# Check current swap
free -h

# If swap exhausted, add temporary swap
sudo dd if=/dev/zero of=/swapfile bs=1G count=8
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

**Investigation:**
```bash
# Generate heap dump if Java/Node.js based
docker exec $CONTAINER kill -3 $(pgrep node) 2>/dev/null || true

# Get memory maps
docker inspect $CONTAINER --format '{{.State.Pid}}' | xargs -I{} cat /proc/{}/maps | head -30

# Check for zombie processes
docker exec $CONTAINER ps aux | grep -E "Z|defunct"
```

### Incident Type: Connection Pool Exhaustion

**Symptoms:**
- "too many connections" error
- Alerts: `PostgreSQLConnectionsHigh`, `RedisConnectionsHigh`
- New tasks can't connect to database/Redis
- Task queue grows indefinitely

**Response:**

**PostgreSQL Connection Exhaustion:**

```bash
# 1. Check current connections
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    datname,
    usename,
    count(*) as connections
  FROM pg_stat_activity
  GROUP BY datname, usename
  ORDER BY connections DESC;
"

# 2. Identify idle connections
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    pid,
    usename,
    application_name,
    state,
    query_start,
    query
  FROM pg_stat_activity
  WHERE state = 'idle'
  AND query_start < NOW() - INTERVAL '5 minutes'
  ORDER BY query_start ASC;
"

# 3. Terminate idle connections
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE usename = 'cfn_user'
    AND state = 'idle'
    AND query_start < NOW() - INTERVAL '10 minutes';
"

# 4. Identify problematic queries
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    pid,
    now() - pg_stat_activity.query_start as duration,
    query
  FROM pg_stat_activity
  WHERE (now() - pg_stat_activity.query_start) > INTERVAL '5 minutes';
"

# 5. Increase connection limit temporarily
docker-compose exec postgres psql -U postgres -c "
  ALTER SYSTEM SET max_connections = 300;
"
docker-compose restart postgres

# 6. Fix application (connection leak)
# Restart affected agents to clear connections
docker restart cfn-agent-1 cfn-agent-2 cfn-agent-3
```

**Redis Connection Exhaustion:**

```bash
# 1. Check Redis connections
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO clients

# Expected: connected_clients < 100

# 2. Identify which clients connected
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CLIENT LIST

# 3. Check for blocked clients
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CLIENT LIST | grep -c "flags=b"

# 4. If many blocked clients, check blocking operations
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" INFO stats | grep blocked_clients

# 5. Kill idle clients
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" CLIENT KILL TYPE normal SKIPME yes

# 6. Restart agents
docker restart cfn-agent-1 cfn-agent-2
```

### Incident Type: Disk Space Exhaustion

**Symptoms:**
- Alerts: `DiskSpaceHigh`, `DiskSpaceCritical`
- df -h shows 95%+ usage
- Write errors in logs
- Database can't write to tables

**Response:**

```bash
# 1. Check disk usage
df -h /

# 2. Identify largest directories
du -sh /* | sort -rh | head -10

# 3. Check Docker volumes
docker volume ls --format "{{.Name}}" | while read vol; do
  SIZE=$(docker run --rm -v $vol:/data busybox du -sh /data 2>/dev/null | cut -f1)
  echo "$vol: $SIZE"
done | sort -rh

# 4. Check database size
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT
    datname,
    pg_size_pretty(pg_database_size(datname)) as size
  FROM pg_database
  WHERE datname = 'cfn';
"

# 5. Check logs size
du -sh /var/lib/docker/containers/*/
docker system df

# 6. Free up space
# Option 1: Clean up old logs
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  DELETE FROM agent_logs WHERE created_at < NOW() - INTERVAL '30 days';
  VACUUM ANALYZE;
"

# Option 2: Remove old containers
docker container prune -f

# Option 3: Clean up unused images
docker image prune -f

# Option 4: Clean up unused volumes (CAREFUL)
docker volume prune -f

# 7. Expand volumes if needed
# For Docker Desktop:
# - Settings → Resources → Disk Image Size
# For Linux:
# - Increase LVM logical volume size
```

### Incident Type: Service Unresponsive

**Symptoms:**
- Service endpoints not responding
- Health checks failing
- Alerts: `ServiceDown`, `HealthCheckFailed`
- No response on expected ports

**Response:**

```bash
# 1. Check service health
curl -v http://cfn-orchestrator:3001/health 2>&1

# 2. Check if container is running
docker ps | grep cfn-orchestrator

# If not running:
docker-compose up -d cfn-orchestrator

# 3. Check container logs for startup errors
docker logs cfn-orchestrator --tail 100

# 4. Check service status
docker inspect cfn-orchestrator | jq '.State'

# 5. If container stuck, restart it
docker restart cfn-orchestrator

# 6. Check dependencies (database, Redis)
docker-compose exec postgres pg_isready -U postgres
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" PING

# 7. Check network connectivity
docker exec cfn-orchestrator curl -v http://postgres:5432/ 2>&1
docker exec cfn-orchestrator redis-cli -h redis -p 6379 PING

# 8. If all else fails, rebuild container
docker-compose up -d --force-recreate cfn-orchestrator
```

## Validation

### Post-Incident Validation Checklist

```bash
#!/bin/bash
# scripts/validate-incident-resolved.sh

set -euo pipefail

echo "=== Incident Resolution Validation ==="

# Check all critical services running
CRITICAL_SERVICES=("postgres" "redis" "cfn-orchestrator")
for service in "${CRITICAL_SERVICES[@]}"; do
  if docker-compose exec $service true 2>/dev/null; then
    echo "✓ $service healthy"
  else
    echo "✗ $service not responding"
    exit 1
  fi
done

# Check queue depth normal
QUEUE=$(curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=cfn_agent_queue_depth' | \
  jq '.data.result[0].value[1]')
echo "✓ Queue depth: $QUEUE (target: <50)"

# Check agent task failure rate
FAILURE_RATE=$(curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=rate(cfn_agent_task_failures_total[5m])' | \
  jq '.data.result[0].value[1]')
echo "✓ Task failure rate: $FAILURE_RATE (target: <0.02)"

# Check resource usage
docker stats --no-stream --format "table {{.Names}}\t{{.MemPerc}}\t{{.CPUPerc}}" | grep -E "cfn-|postgres|redis"

echo ""
echo "=== Validation Complete ==="
```

## Escalation

### Escalation Decision Tree

```
Incident detected
  ├─ Is system completely down?
  │  └─ YES → Page on-call SRE immediately (P1)
  │
  ├─ Is >50% of traffic affected?
  │  └─ YES → Wake up team lead (P2)
  │
  ├─ Is <50% affected and degraded?
  │  └─ YES → Create ticket, notify team (P3)
  │
  └─ Is informational/future problem?
     └─ YES → Backlog item (P4)
```

### Who to Contact

| Issue | First Responder | Escalation | Timeline |
|-------|-----------------|------------|----------|
| Database down | On-call SRE | DBA team | 5 min |
| All agents stuck | On-call SRE | Backend lead | 5 min |
| High memory leak | On-call SRE | Engineering lead | 10 min |
| Connection pool exhausted | On-call SRE | Database team | 10 min |
| Disk space critical | On-call SRE | Infrastructure | 15 min |

### Notification Procedure

```bash
# Immediate notification (synchronous)
# 1. Page on-call SRE: `pagerduty trigger --severity critical`
# 2. Post to Slack #incidents: [INCIDENT] [P1] System down - investigating
# 3. Update status page: incident.example.com

# Follow-up notifications (asynchronous)
# Every 5 minutes: Update Slack with current status
# On resolution: Post summary to #incidents
# 24 hours: Scheduled postmortem
```

## Post-Incident

### Incident Summary Report

```markdown
# Incident Report: $INCIDENT_ID

## Summary
- **Date/Time:** YYYY-MM-DD HH:MM UTC
- **Duration:** X minutes
- **Severity:** P1/P2/P3/P4
- **Impact:** X agents down, Y% traffic affected

## Root Cause
[What caused the issue]

## Timeline
- HH:MM: Alert triggered
- HH:MM: On-call responded
- HH:MM: Root cause identified
- HH:MM: Fix deployed
- HH:MM: System back to normal

## Actions Taken
1. [Action 1]
2. [Action 2]
3. [Action 3]

## Prevention
- [Change 1]
- [Change 2]
- [Change 3]

## Follow-up
- [ ] Code change deployed
- [ ] Monitoring alert added
- [ ] Documentation updated
- [ ] Team trained
```

### Post-Incident Checklist

1. **Within 1 hour:**
   - [ ] Acknowledge incident resolved
   - [ ] Post summary to #incidents
   - [ ] Archive incident logs
   - [ ] Update incident tracker

2. **Within 24 hours:**
   - [ ] Hold postmortem meeting
   - [ ] Document root cause
   - [ ] Create prevention tickets

3. **Within 1 week:**
   - [ ] Deploy prevention changes
   - [ ] Update runbooks
   - [ ] Train team on new procedures

### Related Runbooks
- [Memory Exhaustion Runbook](memory-exhaustion.md)
- [Disk Space Exhaustion Runbook](disk-space-exhaustion.md)
- [PostgreSQL Connection Loss Runbook](postgres-connection-loss.md)
- [Redis Connection Loss Runbook](redis-connection-loss.md)
