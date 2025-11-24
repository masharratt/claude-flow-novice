# Redis Connection Loss Runbook

## Alert Information
- **Alert Name:** `RedisConnectionLoss`
- **Severity:** P0
- **Notification:** PagerDuty + Slack #cfn-alerts (immediate escalation)
- **Threshold:** Redis unavailable for >30 seconds

## Symptoms
- All CFN coordination workflows blocked
- Agent spawn attempts timing out
- Task queue operations failing
- Coordination signals not delivered
- Grafana metrics show `redis_up: 0`
- Widespread "connection refused" errors

**Grafana Dashboards:**
- Agent Performance Dashboard → Redis Health panel
- Team Activity Dashboard → Coordination Layer panel

**Common Error Messages:**
```
Error: Redis connection refused (ECONNREFUSED)
Error: Redis coordination timeout after 30s
Error: Could not connect to Redis at localhost:6379
Error: BLPOP timeout waiting for coordination signal
CRITICAL: Coordination layer unavailable
```

## Diagnosis

### 1. Check Redis Service Status
```bash
# Check Redis container status
docker ps -a | grep redis
# Expected: UP status

# If container is down:
docker logs cfn-redis --tail 100
# Look for crash reasons

# Check Redis process inside container
docker exec cfn-redis redis-cli PING
# Expected: PONG
```

### 2. Verify Network Connectivity
```bash
# Test Redis port accessibility
nc -zv localhost 6379
# Expected: Connection succeeded

# Check Docker network
docker network inspect cfn-network | jq '.[0].Containers'
# Expected: Redis container present

# Test from another container
docker exec cfn-coordinator redis-cli -h redis PING
# Expected: PONG
```

### 3. Review Redis Logs
```bash
# Check for errors in Redis logs
docker logs cfn-redis 2>&1 | grep -i "error\|fatal\|warning"

# Check for OOM (Out of Memory) issues
docker logs cfn-redis 2>&1 | grep -i "out of memory"

# Check for persistence errors
docker logs cfn-redis 2>&1 | grep -i "rdb\|aof"
```

### 4. Check Redis Resource Usage
```bash
# Check memory usage
docker exec cfn-redis redis-cli INFO memory | grep used_memory_human
# Expected: <2GB (based on maxmemory config)

# Check connected clients
docker exec cfn-redis redis-cli CLIENT LIST | wc -l
# Expected: <100 clients

# Check for blocked clients
docker exec cfn-redis redis-cli CLIENT LIST | grep -i blocked
# Expected: Empty or <5 blocked clients
```

### 5. Identify Root Cause

**Common root causes:**
- Redis container crashed or stopped
- Network connectivity issue (Docker network down)
- Out of memory (OOM kill)
- Persistence failure (disk full, RDB/AOF corruption)
- Port conflict (another process using 6379)
- Redis configuration error after restart

## Resolution

### Immediate Actions (P0 - 5 minute response)

**Action 1: Restart Redis Container (if stopped)**
```bash
# Check if container exists
docker ps -a | grep cfn-redis

# If stopped, start it
docker start cfn-redis

# Verify startup
docker logs cfn-redis --tail 20
# Expected: "Ready to accept connections"

# Test connectivity
docker exec cfn-redis redis-cli PING
# Expected: PONG
```

**Action 2: Recreate Redis Container (if crashed)**
```bash
# If container is in bad state, recreate
docker-compose -f docker-compose.monitoring.yml stop redis
docker-compose -f docker-compose.monitoring.yml rm -f redis

# Start fresh container
docker-compose -f docker-compose.monitoring.yml up -d redis

# Wait for Redis to initialize
sleep 5

# Verify startup
docker exec cfn-redis redis-cli PING
# Expected: PONG
```

**Action 3: Verify Data Persistence (if recreated)**
```bash
# Check if RDB snapshot exists
docker exec cfn-redis ls -lh /data/dump.rdb

# Check if AOF file exists
docker exec cfn-redis ls -lh /data/appendonly.aof

# Verify data integrity
docker exec cfn-redis redis-cli DBSIZE
# Expected: >0 keys (if data existed before)

# Test key retrieval
docker exec cfn-redis redis-cli GET "test:key"
```

### Complete Fix

**Step 1: Diagnose Root Cause**
```bash
# Check for OOM kill in system logs
dmesg | grep -i "redis\|oom"

# Check disk space (persistence failure)
df -h /var/lib/docker
# If <10% free, clean up:
docker system prune -af

# Check for port conflicts
netstat -tlnp | grep :6379
# Expected: Only Docker proxy listening
```

**Step 2: Fix Persistence Issues**
```bash
# If RDB/AOF corrupted, restore from backup
docker exec cfn-redis redis-cli SHUTDOWN NOSAVE
docker stop cfn-redis

# Restore from backup (see backup-failure.md)
cp /backups/redis/latest/dump.rdb /var/lib/docker/volumes/cfn-redis-data/_data/
cp /backups/redis/latest/appendonly.aof /var/lib/docker/volumes/cfn-redis-data/_data/

# Start Redis with data
docker start cfn-redis

# Verify data restored
docker exec cfn-redis redis-cli DBSIZE
```

**Step 3: Tune Redis Configuration**
```bash
# Edit Redis config (if memory issues)
docker exec cfn-redis redis-cli CONFIG GET maxmemory
# Expected: 2gb

# Increase if needed (to 4GB)
docker exec cfn-redis redis-cli CONFIG SET maxmemory 4gb
docker exec cfn-redis redis-cli CONFIG SET maxmemory-policy allkeys-lru

# Persist configuration
docker exec cfn-redis redis-cli CONFIG REWRITE
```

**Step 4: Restart Dependent Services**
```bash
# After Redis is stable, restart services that depend on it
docker restart cfn-coordinator
docker restart cfn-orchestrator

# Wait for services to reconnect
sleep 10

# Verify coordination working
redis-cli PUBLISH "test:channel" "test message"
# Expected: (integer) 1 (one subscriber)
```

## Verification Checklist
- [ ] Alert cleared in Prometheus (redis_up: 1)
- [ ] Redis responding to PING within <10ms
- [ ] All dependent containers reconnected
- [ ] Coordination signals flowing (test BLPOP)
- [ ] Agent spawn attempts succeeding
- [ ] Task queues processing normally
- [ ] No errors in coordinator/orchestrator logs
- [ ] Data persistence verified (RDB + AOF)
- [ ] Grafana metrics showing healthy state
- [ ] No blocked clients in Redis

## Prevention

### Configuration Changes
1. **Increase memory limit:** Set `maxmemory: 4gb` in docker-compose
2. **Add health check:** Docker health check with 30s interval
3. **Enable persistence:** Ensure RDB + AOF both enabled
4. **Add restart policy:** `restart: unless-stopped` in docker-compose
5. **Resource reservation:** Reserve 4GB memory for Redis container

### Monitoring Improvements
1. **Add alert:** Redis memory >80% usage
2. **Add alert:** Redis client connections >200
3. **Add alert:** Redis persistence failure (RDB/AOF write error)
4. **Add dashboard:** Redis replication lag (if using replicas)
5. **Add metric:** Redis command latency (P99)

### Process Changes
1. **Backup automation:** Hourly RDB snapshots to persistent storage
2. **Disaster recovery:** Document Redis restore procedures
3. **Capacity planning:** Monthly review of Redis memory growth
4. **High availability:** Consider Redis Sentinel for automatic failover
5. **Regular testing:** Monthly chaos engineering test (kill Redis)

## Post-Incident

### Required Actions
1. Create post-incident review within 4 hours (P0 incident)
2. Update this runbook with specific failure details
3. Test Redis restore procedures in staging
4. Implement HA solution if outage >10 minutes
5. Review coordination layer resilience

### Post-Incident Review Template
```markdown
# PIR: Redis Connection Loss - [DATE]

## Timeline
- [TIME]: Alert fired (Redis down)
- [TIME]: On-call paged
- [TIME]: On-call acknowledged
- [TIME]: Root cause identified
- [TIME]: Redis restarted/restored
- [TIME]: Services reconnected
- [TIME]: Alert cleared

## Root Cause
[OOM kill / disk full / container crash / network issue]

## Impact
- **Duration:** [X minutes of downtime]
- **Affected workflows:** All CFN coordination
- **Failed operations:** [count] agent spawns, [count] task completions
- **Data loss:** [none / X minutes of operations]
- **User impact:** All CFN Loop tasks blocked

## Resolution
[What fixed it - container restart / data restore / config change]

## Lessons Learned
- Redis single point of failure
- Need faster detection (<30s threshold may be too long)
- Backup/restore procedures need improvement
- HA architecture required

## Action Items
1. Implement Redis Sentinel HA - Owner: Platform - Due: [date]
2. Add Redis backup validation - Owner: DevOps - Due: [date]
3. Improve alert threshold to <10s - Owner: SRE - Due: [date]
4. Document Redis restore runbook - Owner: Platform - Due: [date]
```

## Related Alerts
- `PostgresConnectionLoss` → [postgres-connection-loss.md](postgres-connection-loss.md)
- `HighAgentSpawnFailureRate` → [agent-spawn-failure.md](agent-spawn-failure.md)
- `CFNLoopStuck` → [cfn-loop-stuck.md](cfn-loop-stuck.md)
- `BackupFailure` → [backup-failure.md](backup-failure.md)

## References
- **Grafana:** http://localhost:3000/d/agent-performance
- **Prometheus:** http://localhost:9090/alerts
- **Docs:** [MONITORING_GUIDE.md](/mnt/wsl/.../docs/MONITORING_GUIDE.md)
- **Redis Config:** [docker-compose.monitoring.yml](/mnt/wsl/.../docker-compose.monitoring.yml)
- **Coordination Skill:** [.claude/skills/cfn-coordination/SKILL.md](/mnt/wsl/.../.claude/skills/cfn-coordination/SKILL.md)
- **Backup Procedures:** [backup-failure.md](backup-failure.md)

---
**Last Updated:** 2025-11-24
**Version:** 1.0
**Maintainer:** Platform Team
