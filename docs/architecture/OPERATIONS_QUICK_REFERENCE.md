# Operations Quick Reference - RuVector Phase 1

**Last Updated:** 2025-11-28
**Status:** For Operations Teams
**Format:** Quick-lookup reference (not comprehensive - see DEVOPS_VALIDATION_LOOP2.md for full assessment)

---

## PRE-DEPLOYMENT CHECKLIST

Before starting the system in production:

```bash
# 1. Environment Variables Ready
[ ] REDIS_PASSWORD set (32+ chars, mixed case+numbers)
[ ] ANTHROPIC_API_KEY configured
[ ] All .secrets/* files present
[ ] .env file loaded (source .env)

# 2. Docker Daemon Ready
[ ] Docker running: docker ps ✓
[ ] Docker Compose available: docker-compose --version ✓
[ ] Sufficient disk space: docker system df
[ ] Network clean: docker network ls (no conflicts)

# 3. Ports Available
[ ] REDIS_COORDINATOR_PORT (default 6380) free
[ ] ORCHESTRATOR_PORT (default 3001) free
[ ] GRAFANA_PORT (default 3002) free
[ ] PROMETHEUS_PORT (default 9091) free
[ ] Check: netstat -tulpn | grep LISTEN

# 4. Backup Current State (if redeploying)
[ ] ./scripts/backup-ruvector.sh --verify-only
[ ] Backup file exists and verified
[ ] Store backup path for reference

# 5. Configuration Validation
[ ] docker-compose config > /dev/null
[ ] All environment files valid
[ ] Secrets readable (ls -la .secrets/)

# 6. Volume Cleanup (if fresh start)
[ ] docker volume prune -f
[ ] df -h (check disk space available)
```

---

## STARTUP PROCEDURE

```bash
# 1. Start Services
./scripts/docker/run-in-worktree.sh up -d

# Monitor startup (takes 2-3 minutes):
docker-compose ps

# Expected output:
# NAME                   STATUS              PORTS
# redis-coordinator      Up (healthy)        6380:6379
# orchestrator           Up (starting)       3001:3000
# agent-pool             Up (starting)       (none)
# prometheus             Up (healthy)        9091:9090
# grafana                Up (healthy)        3002:3000
# ...

# 2. Verify All Services Healthy (wait up to 5 minutes)
for i in {1..30}; do
  ./scripts/deployment/health-checks.sh && break
  echo "Waiting for services... ($i/30)"
  sleep 10
done

# 3. Check Logs for Errors
docker-compose logs --tail=50 orchestrator
docker-compose logs --tail=50 redis-coordinator

# Expected: No ERROR or FATAL messages

# 4. Validate Connectivity
docker-compose exec redis-coordinator redis-cli ping
# Expected: PONG

# 5. System Ready
echo "System startup complete"
docker-compose ps
```

---

## DAILY OPERATIONS

### Health Check (run hourly)

```bash
./scripts/deployment/health-checks.sh

# Checks 10 items - all should be ✓
# If any fail: review associated log
```

### Monitor Performance

```bash
# CPU & Memory
docker stats

# Acceptable Limits:
# redis-coordinator: <20% CPU, <256M memory
# orchestrator: <50% CPU, <500M memory
# agent-pool (all): <1000M memory combined

# Redis Queue Status
docker-compose exec redis-coordinator redis-cli INFO stats

# Agent Count
docker ps --filter "name=agent-" | wc -l

# Should vary (0-10 typical, max depends on task)
```

### View Logs

```bash
# Orchestrator
docker-compose logs -f orchestrator

# Specific service
docker-compose logs -f --tail=100 redis-coordinator

# Search for errors
docker-compose logs orchestrator | grep ERROR

# Exit: Ctrl+C
```

---

## TROUBLESHOOTING QUICK FIXES

### Problem: Service Won't Start

```bash
# Check docker daemon
sudo systemctl status docker

# Check image exists
docker images | grep cfn-

# Rebuild if missing
./.claude/skills/docker-build/build.sh --dockerfile Dockerfile.optimized

# Try explicit startup with logs
docker-compose up (no -d flag) to see errors
```

### Problem: Memory Usage Growing

```bash
# Check memory limits
docker stats

# If approaching limit:
1. Count active agents: docker ps --filter "name=agent-" | wc -l
2. If >20 agents, increase agent-pool memory limit
3. Check for stuck agents: docker logs agent-xyz
4. If stuck, stop it: docker stop agent-xyz

# Restart service if needed
docker-compose restart orchestrator
```

### Problem: Redis Connection Refused

```bash
# Check Redis running
docker-compose ps redis-coordinator

# Test connection
docker-compose exec redis-coordinator redis-cli ping

# If NOAUTH error: missing password
# Verify REDIS_PASSWORD env var set

# Restart Redis
docker-compose restart redis-coordinator
```

### Problem: High Agent Failure Rate

```bash
# Check agent logs
docker logs $(docker ps --filter "name=agent-" -q | head -1)

# Common causes:
# - Out of memory (check docker stats)
# - Task too complex (check Redis queue: redis-cli LLEN task:queue)
# - Network issues (docker network ls, inspect network)

# Recovery steps:
1. Stop all agents: docker stop $(docker ps --filter "name=agent-" -q)
2. Check orchestrator logs
3. Restart orchestrator: docker-compose restart orchestrator
4. Monitor for recovery
```

### Problem: Orchestrator Not Spawning Agents

```bash
# Check orchestrator healthy
docker-compose ps orchestrator

# Check logs for errors
docker-compose logs orchestrator | grep -i error

# Verify Redis connectivity
docker-compose exec orchestrator redis-cli -a $REDIS_PASSWORD ping

# Check task queue
docker-compose exec redis-coordinator redis-cli LLEN task:queue

# If queue empty: no tasks to process (check upstream)
# If queue has items: check orchestrator logs for spawn errors

# Reset if stuck
docker-compose exec redis-coordinator redis-cli FLUSHALL  # WARNING: clears all
docker-compose restart orchestrator
```

---

## SHUTDOWN PROCEDURE

### Graceful Shutdown

```bash
# Stop accepting new tasks (if applicable)
# This is manual - no automatic pause

# Stop agent pool first (allows in-progress completion)
docker-compose stop agent-pool

# Wait for agents to finish (check: docker ps --filter "name=agent-")
# Typically 5-10 minutes

# Stop orchestrator
docker-compose stop orchestrator

# Stop remaining services
docker-compose down

# Verify all stopped
docker ps | grep cfn- (should return empty)

# Data preserved in volumes
docker volume ls | grep cfn-
```

### Emergency Stop

```bash
# If system unstable and needs immediate stop:
docker-compose down -v  # WARNING: removes volumes!

# Or targeted:
docker kill $(docker ps --filter "name=cfn-" -q)
docker network prune -f
```

---

## BACKUP & RESTORE

### Create Backup

```bash
./scripts/backup-ruvector.sh

# Output:
# Backup created: /path/to/docker/trigger-dev/data/backups/ruvector-20251128-143022.db
# Checksum: sha256:abc123...

# Store backup path for reference
```

### Verify Backup

```bash
./scripts/backup-ruvector.sh --verify-only

# Should return: ✓ Backup valid
```

### Restore from Backup (when implemented)

```bash
# NOTE: restore-ruvector.sh not yet implemented
# Manual steps:
1. Stop services: docker-compose down
2. Backup current: cp ruvector.db ruvector.db.corrupt
3. Restore: cp backups/ruvector-{timestamp}.db ruvector.db
4. Restart: docker-compose up -d
5. Verify: docker-compose exec db sqlite3 ruvector.db ".tables"
```

---

## MONITORING DASHBOARDS

### Grafana Access

```bash
# URL: http://localhost:3002 (or offset port from run-in-worktree.sh)
# Default: admin / admin123
# CHANGE DEFAULT PASSWORD IMMEDIATELY IN PRODUCTION

# Key Dashboards:
- CFN System Overview (if created)
- Redis Metrics (via redis_exporter)
- Container Metrics (via cAdvisor if available)
```

### Prometheus Access

```bash
# URL: http://localhost:9091 (or offset port)
# Query examples:
- redis_info_memory_used_bytes
- container_memory_usage_bytes
- container_cpu_usage_seconds_total

# Check targets:
http://localhost:9091/targets
```

---

## SCALING OPERATIONS

### Increase Agent Capacity

```bash
# Edit docker-compose.production.yml:
services:
  agent-pool:
    deploy:
      replicas: 5  # Increase from 3

# Apply: docker-compose up -d

# Monitor: docker stats
```

### Increase Memory Limits

```bash
# For specific service in docker-compose.production.yml:
deploy:
  resources:
    limits:
      memory: 1.5G      # Increase from 1G
      cpus: '0.75'      # Increase from 0.5

# Apply: docker-compose up -d

# Verify: docker stats
```

---

## INCIDENT RESPONSE

### Service Down

1. **Verify Status**
   ```bash
   docker-compose ps
   docker-compose logs {service-name} | tail -20
   ```

2. **Check Logs for Root Cause**
   - OOM killer: `docker inspect {container} | grep OOMKilled`
   - Exit code: `docker inspect {container} | grep ExitCode`
   - Network: `docker network inspect {network}`

3. **Recovery Options**
   - Service restart: `docker-compose restart {service}`
   - Full restart: `docker-compose down && docker-compose up -d`
   - Manual restart: `docker start {container}`

4. **Prevent Recurrence**
   - If memory: increase limits and redeploy
   - If network: check network connectivity and DNS
   - If dependency: verify upstream services healthy

### Data Corruption

1. **Stop Services**
   ```bash
   docker-compose down
   ```

2. **Backup Corrupted Data**
   ```bash
   cp docker/trigger-dev/data/ruvector.db \
      docker/trigger-dev/data/ruvector.db.corrupted-20251128
   ```

3. **Restore from Backup** (when procedure implemented)
   ```bash
   cp docker/trigger-dev/data/backups/ruvector-{latest}.db \
      docker/trigger-dev/data/ruvector.db
   ```

4. **Verify Integrity**
   ```bash
   sqlite3 docker/trigger-dev/data/ruvector.db ".tables"
   ```

5. **Restart Services**
   ```bash
   docker-compose up -d
   ./scripts/deployment/health-checks.sh
   ```

### Performance Degradation

1. **Identify Resource Constraint**
   ```bash
   docker stats
   # High memory? High CPU? High disk I/O?
   ```

2. **Check Agent Count**
   ```bash
   docker ps --filter "name=agent-" | wc -l
   # Normal: 0-10, Max capacity: ~20
   ```

3. **Investigate Task Queue**
   ```bash
   docker-compose exec redis-coordinator redis-cli LLEN task:queue
   # Growing queue = agents can't keep up
   # Long-running tasks = increase agent pool
   ```

4. **Review Recent Changes**
   - Code changes?
   - Config changes?
   - Increased load?

5. **Mitigation**
   - Increase replicas: docker-compose up -d
   - Increase memory: edit docker-compose.production.yml
   - Optimize tasks: review agent logs for bottlenecks
   - Scale out: add more workers if supported

---

## MAINTENANCE WINDOWS

### Schedule
- Best time: Off-peak hours (3 AM - 5 AM typical)
- Duration: 30 minutes to 1 hour typical
- Frequency: Weekly (if needed), Monthly (patches)

### Steps

```bash
# 1. Announce maintenance window
# 2. Wait for agents to complete (monitor: docker ps)
# 3. Stop new task acceptance (manual - stop orchestrator)
# 4. Perform maintenance (restart, update, etc.)
# 5. Verify health: ./scripts/deployment/health-checks.sh
# 6. Resume operations
# 7. Announce maintenance complete
```

---

## CONTACT & ESCALATION

**For Issues:**
1. Check logs: `docker-compose logs {service}`
2. Review TROUBLESHOOTING_QUICK_FIXES section above
3. If unresolved: Escalate to DevOps team with:
   - Error message/logs
   - `docker-compose ps` output
   - `docker stats` snapshot
   - List of recent changes

**Critical Emergency:**
- System completely down
- Data loss detected
- Security incident
- Execute: INCIDENT_RESPONSE procedures above, escalate immediately

---

## REFERENCE COMMANDS

```bash
# System Status
docker-compose ps
docker stats
docker system df

# Logs
docker-compose logs -f orchestrator
docker logs {container-id}

# Services
docker-compose up -d
docker-compose down
docker-compose restart {service}

# Cleanup
docker-compose down -v
docker system prune -f
docker volume prune -f

# Debugging
docker exec {container} /bin/bash
docker inspect {container}
docker network inspect {network}

# Performance
docker top {container}
docker stats
htop (if available)
```

---

**For comprehensive troubleshooting and architectural details, see: DEVOPS_VALIDATION_LOOP2.md**

**For operational runbook (when complete), see: docs/OPERATIONS_RUNBOOK.md (not yet created)**
