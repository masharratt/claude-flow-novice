# Memory Exhaustion Runbook

## Alert Information
- **Alert Name:** `HighMemoryUsagePerAgent`
- **Severity:** P1
- **Notification:** PagerDuty + Slack #cfn-alerts
- **Threshold:** Agent using >2GB memory

## Symptoms
- Agent container consuming excessive memory
- System memory pressure (high swap usage)
- OOM (Out of Memory) killer terminating processes
- Slow agent performance
- Container restarts due to memory limits
- System unresponsiveness

**Grafana Dashboards:**
- Agent Performance Dashboard → Memory Usage panel
- System Resources Dashboard → Memory panel

**Common Error Messages:**
```
WARNING: Agent [id] memory usage: 2.3GB (limit: 2GB)
ERROR: Container [id] killed by OOM killer
ERROR: Cannot allocate memory
WARNING: Swap usage high: 4GB/8GB used
FATAL: Out of memory: Killed process [pid]
```

## Diagnosis

### 1. Check System Memory Status
```bash
# Check overall memory usage
free -h
# Look for high swap usage (>50%)

# Check per-process memory usage
ps aux --sort=-%mem | head -20

# Check Docker container memory
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"

# Identify top memory consumers
docker stats --no-stream | sort -k4 -rh | head -10
```

### 2. Identify High-Memory Agents
```bash
# Find agents exceeding memory threshold
docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}" | \
  awk -F'[/ \t]' '$2 ~ /[0-9]+/ && $3 ~ /GiB/ && $2 > 2 {print $1, $2$3}'

# Get agent details from database
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT
    id,
    agent_type,
    team,
    EXTRACT(EPOCH FROM (NOW() - spawned_at)) / 60 as runtime_minutes
  FROM agents
  WHERE status = 'running'
  ORDER BY spawned_at ASC;
"

# Cross-reference with container memory
for agent_id in $(docker exec cfn-postgres psql -U cfn_user -d cfn -t -c "SELECT id FROM agents WHERE status = 'running';"); do
  container=$(docker ps --filter "label=cfn.agent.id=$agent_id" -q)
  if [ -n "$container" ]; then
    mem=$(docker stats --no-stream --format "{{.MemUsage}}" "$container")
    echo "$agent_id: $mem"
  fi
done
```

### 3. Check for Memory Leaks
```bash
# Monitor memory growth over time (5 samples, 10s interval)
CONTAINER="agent-abc123"

for i in {1..5}; do
  echo "Sample $i: $(date)"
  docker stats --no-stream --format "{{.MemUsage}}" "$CONTAINER"
  sleep 10
done

# If memory consistently increasing, likely memory leak

# Check agent logs for memory-related errors
docker logs "$CONTAINER" 2>&1 | grep -i "memory\|heap\|leak\|oom"
```

### 4. Check Container Resource Limits
```bash
# Verify container memory limits
docker inspect --format='{{.HostConfig.Memory}}' "$CONTAINER"
# Expected: 2147483648 (2GB in bytes)

# Check if container hit limit
docker inspect --format='{{.State.OOMKilled}}' "$CONTAINER"
# Expected: false (true if OOM killed)

# Review Docker daemon memory configuration
docker info | grep -i memory
```

### 5. Identify Root Cause

**Common root causes:**
- Memory leak in agent code (unbounded data structures)
- Large model context loaded into memory
- Excessive caching without eviction
- Large file processing (logs, data files)
- Recursive operations without bounds
- Third-party library memory leak
- Improper resource cleanup

## Resolution

### Immediate Actions (P1 - 10 minute response)

**Action 1: Restart High-Memory Agents**
```bash
# Find agents using >2GB
docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}" | \
  awk -F'[/ \t]' '$2 ~ /[0-9]+/ && $3 ~ /GiB/ && $2 > 2 {print $1}' | \
  while read container; do
    echo "Restarting high-memory container: $container"
    docker restart "$container"
  done

# Verify memory usage after restart
sleep 10
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
```

**Action 2: Increase Memory Limits (Temporary)**
```bash
# If agents legitimately need more memory
# Update docker-compose configuration
vi docker-compose.monitoring.yml

# Increase agent memory limit:
services:
  cfn-agent:
    deploy:
      resources:
        limits:
          memory: 4G  # Was 2G
        reservations:
          memory: 1G

# Recreate containers with new limits
docker-compose -f docker-compose.monitoring.yml up -d --force-recreate

# Verify new limits applied
docker inspect --format='{{.HostConfig.Memory}}' cfn-agent
# Expected: 4294967296 (4GB)
```

**Action 3: Clear System Memory Pressure**
```bash
# Drop kernel page cache (safe operation)
sudo sync
sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'

# Verify memory freed
free -h

# Check swap usage
swapon --show

# If swap high, consider restarting non-critical services
docker stop $(docker ps --filter "label=cfn.priority=low" -q)
```

### Complete Fix

**Step 1: Diagnose Memory Leak**
```bash
# Enable memory profiling for problematic agent type
AGENT_TYPE="backend-developer"

# Add memory profiling to agent
# (For Node.js agents)
docker exec -it "$CONTAINER" node --inspect=0.0.0.0:9229 /app/agent.js

# Connect Chrome DevTools to inspect memory
# chrome://inspect -> Open dedicated DevTools for Node

# Take heap snapshots over time to identify leak
```

**Step 2: Implement Memory Monitoring**
```bash
# Add memory monitoring to agent code
# (Example for Node.js - add to agent-executor.ts)

cat >> /mnt/wsl/.../src/cli/agent-executor.ts <<'EOF'

// Memory monitoring
setInterval(() => {
  const usage = process.memoryUsage();
  console.log(`Memory: RSS=${Math.round(usage.rss / 1024 / 1024)}MB, Heap=${Math.round(usage.heapUsed / 1024 / 1024)}MB/${Math.round(usage.heapTotal / 1024 / 1024)}MB`);

  // Alert if memory exceeds threshold
  if (usage.rss > 1.5 * 1024 * 1024 * 1024) { // 1.5GB
    console.warn('WARNING: Agent memory usage high:', Math.round(usage.rss / 1024 / 1024), 'MB');
  }
}, 60000); // Every 60 seconds
EOF
```

**Step 3: Implement Memory Limits in Code**
```bash
# Add memory cleanup in agent code
# (Example for Node.js)

cat > /tmp/memory-cleanup.js <<'EOF'
// Add to agent code
class MemoryManager {
  constructor(maxCacheSize = 100) {
    this.cache = new Map();
    this.maxCacheSize = maxCacheSize;
  }

  set(key, value) {
    // Implement LRU cache with size limit
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  cleanup() {
    this.cache.clear();
    if (global.gc) {
      global.gc(); // Force garbage collection if enabled
    }
  }
}

// Use at agent exit
process.on('exit', () => {
  memoryManager.cleanup();
});
EOF

# Integrate memory manager into agent code
```

**Step 4: Configure Memory Limits**
```bash
# Set proper memory limits in docker-compose
vi docker-compose.monitoring.yml

# Configure based on agent type:
services:
  cfn-agent-lightweight:
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M

  cfn-agent-standard:
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G

  cfn-agent-heavy:
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G

# Apply configuration
docker-compose -f docker-compose.monitoring.yml up -d
```

**Step 5: Add Automatic Cleanup**
```bash
# Create memory cleanup script
sudo tee /usr/local/bin/memory-cleanup.sh <<'EOF'
#!/bin/bash
set -euo pipefail

# Find high-memory agents and restart them
docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}" | \
  awk -F'[/ \t]' '$2 ~ /[0-9]+/ && $3 ~ /GiB/ && $2 > 2 {print $1}' | \
  while read container; do
    echo "$(date): Restarting high-memory container: $container"
    docker restart "$container"
  done

# Drop kernel caches if system memory >80%
mem_used=$(free | awk '/Mem:/ {printf "%.0f", $3/$2 * 100}')
if [ "$mem_used" -gt 80 ]; then
  echo "$(date): System memory high ($mem_used%), dropping caches"
  sync
  echo 3 > /proc/sys/vm/drop_caches
fi
EOF

sudo chmod +x /usr/local/bin/memory-cleanup.sh

# Add to crontab (every 30 minutes)
(crontab -l 2>/dev/null; echo "*/30 * * * * /usr/local/bin/memory-cleanup.sh >> /var/log/memory-cleanup.log 2>&1") | crontab -
```

## Verification Checklist
- [ ] Alert cleared (agent memory <2GB)
- [ ] No agents using >2GB memory
- [ ] System memory pressure relieved (<80% usage)
- [ ] Swap usage low (<20%)
- [ ] No OOM kills in kernel logs
- [ ] Memory limits configured properly
- [ ] Memory monitoring active
- [ ] Automatic cleanup scheduled
- [ ] No memory growth over time
- [ ] Agent performance normal

## Prevention

### Configuration Changes
1. **Memory limits:** Set appropriate limits per agent type (1G/2G/4G)
2. **Memory reservations:** Reserve minimum memory to prevent starvation
3. **Swap configuration:** Ensure adequate swap space (8GB minimum)
4. **OOM behavior:** Configure Docker to handle OOM gracefully
5. **Cache limits:** Implement bounded caches in agent code

### Monitoring Improvements
1. **Add alert:** Agent memory >1.5GB (early warning)
2. **Add alert:** System memory >80%
3. **Add alert:** Swap usage >50%
4. **Add dashboard:** Memory usage trends over time
5. **Add metric:** Memory growth rate per agent type

### Process Changes
1. **Code reviews:** Check for unbounded data structures
2. **Memory profiling:** Profile agents before production
3. **Resource sizing:** Right-size containers based on actual usage
4. **Capacity planning:** Monitor memory trends monthly
5. **Automatic cleanup:** Restart agents approaching limits
6. **Documentation:** Document memory requirements per agent type

## Post-Incident

### Required Actions
1. Create post-incident review within 24 hours
2. Identify and fix memory leak if found
3. Implement memory monitoring within 1 week
4. Test memory limits in staging
5. Update agent documentation with memory requirements

### Post-Incident Review Template
```markdown
# PIR: Memory Exhaustion - [DATE]

## Timeline
- [TIME]: Alert fired (agent >2GB memory)
- [TIME]: On-call notified
- [TIME]: High-memory agents identified
- [TIME]: Agents restarted
- [TIME]: Memory leak diagnosed (if applicable)
- [TIME]: Alert cleared

## Root Cause
[Memory leak / large model / excessive caching / unbounded data structure]

## Impact
- **Duration:** [X minutes of degraded performance]
- **Affected agents:** [agent IDs or types]
- **System impact:** [OOM kills / swap thrashing / slow performance]
- **User impact:** [Task delays / failures]

## Memory Analysis
- **Peak usage:** [X GB]
- **Expected usage:** [Y GB]
- **Growth rate:** [MB/minute]
- **Leak location:** [code reference if found]

## Resolution
[Restart / increase limits / fix leak / implement cleanup]

## Lessons Learned
- No memory limits configured
- No memory monitoring in agents
- Memory leak in [component]
- Insufficient testing with large inputs

## Action Items
1. Fix memory leak in [component] - Owner: Dev - Due: [date]
2. Add memory monitoring - Owner: Platform - Due: [date]
3. Configure memory limits - Owner: DevOps - Due: [date]
4. Add memory profiling to CI - Owner: SRE - Due: [date]
5. Document memory requirements - Owner: Tech Writer - Due: [date]
```

## Related Alerts
- `HighAgentSpawnFailureRate` → [agent-spawn-failure.md](agent-spawn-failure.md)
- `CFNLoopStuck` → [cfn-loop-stuck.md](cfn-loop-stuck.md)
- `DockerDaemonUnavailable` → [docker-daemon-unavailable.md](docker-daemon-unavailable.md)

## References
- **Grafana:** http://localhost:3000/d/agent-performance
- **Prometheus:** http://localhost:9090/alerts
- **Docs:** [MONITORING_GUIDE.md](/mnt/wsl/.../docs/MONITORING_GUIDE.md)
- **Docker Memory:** https://docs.docker.com/config/containers/resource_constraints/
- **Node.js Profiling:** https://nodejs.org/en/docs/guides/simple-profiling/

---
**Last Updated:** 2025-11-24
**Version:** 1.0
**Maintainer:** Platform Team
