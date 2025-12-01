# Agent Spawn Failure Runbook

## Alert Information
- **Alert Name:** `HighAgentSpawnFailureRate`
- **Severity:** P1
- **Notification:** PagerDuty + Slack #cfn-alerts
- **Threshold:** >10% spawn failure rate over 5 minutes

## Symptoms
- Multiple agent spawn attempts failing
- Task queues backing up in Redis
- CFN Loop workflows stuck in spawn phase
- Grafana metrics show spike in `agent_spawn_failures_total`
- User complaints about slow task execution

**Grafana Dashboards:**
- Agent Performance Dashboard → Agent Lifecycle panel
- Team Activity Dashboard → Spawn Rate panel

**Common Error Messages:**
```
Error: Failed to spawn agent [agent-type]: timeout after 30s
Error: Docker daemon connection refused
Error: Redis coordination lock timeout
Error: Insufficient resources to spawn agent
```

## Diagnosis

### 1. Check Agent Spawn Metrics
```bash
# View spawn failure rate in Grafana
# Navigate to: http://localhost:3000/d/agent-performance

# Query Prometheus directly
curl -s 'http://localhost:9090/api/v1/query?query=rate(agent_spawn_failures_total[5m])' | jq '.data.result'

# Expected: <0.10 (10%)
# Alert fires: >0.10
```

### 2. Review Recent Spawn Attempts
```bash
# Check agent spawning logs
docker logs cfn-orchestrator 2>&1 | grep -A 5 "spawn.*failed"

# Check coordination layer logs
docker logs cfn-coordinator 2>&1 | grep "agent_spawn"

# Review Redis spawn queue
redis-cli LLEN "spawn:queue"
redis-cli LRANGE "spawn:queue" 0 10
```

### 3. Verify Docker Daemon Health
```bash
# Check Docker daemon status
systemctl status docker
# Expected: active (running)

# Test Docker connectivity
docker ps
# Expected: Container list (should not timeout)

# Check Docker resource usage
docker system df
docker stats --no-stream
```

### 4. Check Redis Coordination
```bash
# Verify Redis connectivity
redis-cli PING
# Expected: PONG

# Check coordination locks
redis-cli KEYS "spawn:lock:*"
# Expected: Empty or small list (<10 locks)

# Check for stuck locks (>5 minutes old)
redis-cli --scan --pattern "spawn:lock:*" | while read key; do
  echo "$key: $(redis-cli TTL "$key")"
done
```

### 5. Identify Root Cause

**Common root causes:**
- Docker daemon unresponsive (high load)
- Redis connection pool exhausted
- Insufficient system resources (CPU/memory/disk)
- Stale coordination locks blocking spawns
- Network connectivity issues
- Container image pull failures

## Resolution

### Immediate Actions (P1 - 15 minute response)

**Action 1: Clear Stuck Coordination Locks**
```bash
# Remove locks older than 5 minutes
redis-cli --scan --pattern "spawn:lock:*" | while read key; do
  TTL=$(redis-cli TTL "$key")
  if [ "$TTL" -gt 300 ]; then
    redis-cli DEL "$key"
    echo "Removed stuck lock: $key"
  fi
done

# Expected: Locks cleared, spawn rate improves
```

**Action 2: Restart Docker Daemon (if unresponsive)**
```bash
# Only if docker ps hangs or times out
sudo systemctl restart docker

# Wait for daemon to stabilize
sleep 10

# Verify connectivity
docker ps
# Expected: Container list returns within 2 seconds
```

**Action 3: Scale Down Non-Critical Agents**
```bash
# Reduce resource pressure by stopping idle agents
docker ps --filter "label=cfn.agent.status=idle" -q | xargs -r docker stop

# Verify resources freed
docker stats --no-stream | head -20
```

### Complete Fix

**Step 1: Identify Resource Bottleneck**
```bash
# Check system resources
free -h
df -h
docker system df

# If disk >90%:
docker system prune -af --volumes
# Expected: Reclaim >10GB

# If memory >80%:
# Scale down agent pool in cfn-coordinator config
```

**Step 2: Tune Spawn Retry Configuration**
```bash
# Edit coordinator configuration
vi /mnt/wsl/.../trigger-dev/config/spawn.json

# Increase retry timeout:
{
  "spawn_timeout_seconds": 60,  # Was 30
  "spawn_retry_attempts": 5,    # Was 3
  "spawn_backoff_ms": 2000      # Was 1000
}

# Restart coordinator to apply
docker restart cfn-coordinator
```

**Step 3: Verify Agent Image Availability**
```bash
# Ensure agent images are cached locally
docker images | grep cfn-agent
# Expected: Recent images present

# If missing, pre-pull images:
docker pull cfn-agent:latest
docker pull cfn-orchestrator:latest
```

**Step 4: Check Docker Daemon Configuration**
```bash
# Review daemon.json for resource limits
cat /etc/docker/daemon.json

# Ensure adequate limits:
{
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 10,
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  }
}

# Restart if changed
sudo systemctl restart docker
```

## Verification Checklist
- [ ] Alert cleared in Prometheus (spawn failure rate <10%)
- [ ] Agent spawn metrics show green in Grafana
- [ ] No coordination locks stuck >5 minutes
- [ ] Docker daemon responsive (docker ps <2s)
- [ ] Redis connectivity stable (PING returns <10ms)
- [ ] Task queues draining in Redis
- [ ] CFN Loop workflows completing successfully
- [ ] No new spawn failures for 10 minutes

## Prevention

### Configuration Changes
1. **Increase spawn timeout:** Set `spawn_timeout_seconds: 60` in coordinator config
2. **Add lock expiration:** Ensure all spawn locks have 5-minute TTL
3. **Resource monitoring:** Add Prometheus alert for disk space >80%
4. **Docker daemon monitoring:** Add systemd restart on-failure

### Monitoring Improvements
1. **Add alert:** Docker daemon unresponsive (docker ps timeout)
2. **Add dashboard panel:** Coordination lock count over time
3. **Add log aggregation:** Centralize spawn failure logs in Loki
4. **Add trend analysis:** Weekly spawn failure rate trends

### Process Changes
1. **Pre-pull images:** Nightly cron job to pull latest agent images
2. **Resource cleanup:** Hourly job to prune stopped containers
3. **Lock monitoring:** Alert on coordination locks >5 minutes old
4. **Capacity planning:** Monthly review of spawn rate trends

## Post-Incident

### Required Actions
1. Create post-incident review within 24 hours
2. Update this runbook with lessons learned
3. Document root cause in incident report
4. Implement prevention measures within 1 week
5. Test spawn failure scenarios in staging

### Post-Incident Review Template
```markdown
# PIR: Agent Spawn Failure - [DATE]

## Timeline
- [TIME]: Alert fired
- [TIME]: On-call acknowledged
- [TIME]: Root cause identified
- [TIME]: Issue resolved
- [TIME]: Alert cleared

## Root Cause
[Detailed explanation]

## Impact
- Duration: [X minutes]
- Affected agents: [count]
- Failed spawns: [count]
- User impact: [description]

## Resolution
[What fixed it]

## Lessons Learned
[What we learned]

## Action Items
1. [Action] - Owner: [name] - Due: [date]
2. [Action] - Owner: [name] - Due: [date]
```

## Related Alerts
- `DockerDaemonUnavailable` → [docker-daemon-unavailable.md](docker-daemon-unavailable.md)
- `RedisConnectionLoss` → [redis-connection-loss.md](redis-connection-loss.md)
- `HighMemoryUsage` → [memory-exhaustion.md](memory-exhaustion.md)
- `CFNLoopStuck` → [cfn-loop-stuck.md](cfn-loop-stuck.md)

## References
- **Grafana:** http://localhost:3000/d/agent-performance
- **Prometheus:** http://localhost:9090/alerts
- **Docs:** [MONITORING_GUIDE.md](/mnt/wsl/.../docs/MONITORING_GUIDE.md)
- **Code:** [agent-spawner.ts](/mnt/wsl/.../src/cli/agent-spawner.ts)
- **Coordination:** [.claude/skills/cfn-agent-spawning/SKILL.md](/mnt/wsl/.../.claude/skills/cfn-agent-spawning/SKILL.md)

---
**Last Updated:** 2025-11-24
**Version:** 1.0
**Maintainer:** Platform Team
