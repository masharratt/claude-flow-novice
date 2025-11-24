# Docker Daemon Unavailable Runbook

## Alert Information
- **Alert Name:** `DockerDaemonUnavailable`
- **Severity:** P0
- **Notification:** PagerDuty + Slack #cfn-alerts (immediate escalation)
- **Threshold:** Docker daemon unresponsive for >1 minute

## Symptoms
- All container operations hanging or failing
- Agent spawns timing out
- Container health checks failing
- `docker ps` command hangs or times out
- CFN orchestration completely blocked
- System load abnormally high
- Docker API returning 500 errors

**Grafana Dashboards:**
- Agent Performance Dashboard → Container Health panel
- System Resources Dashboard → Docker Daemon panel

**Common Error Messages:**
```
Error: Cannot connect to Docker daemon at unix:///var/run/docker.sock
Error: docker ps timeout after 60s
Error: Cannot start container [id]: context deadline exceeded
Error: failed to create endpoint on network: context deadline exceeded
CRITICAL: Docker daemon not responding
```

## Diagnosis

### 1. Check Docker Daemon Status
```bash
# Check systemd service status
systemctl status docker
# Expected: active (running)

# If not running:
systemctl status docker | grep -i "failed\|error\|dead"

# Check daemon logs
journalctl -u docker --since "5 minutes ago" --no-pager
```

### 2. Test Docker Connectivity
```bash
# Test basic Docker command (with timeout)
timeout 10 docker ps
# Expected: Returns within 2 seconds

# If hangs, check socket
ls -l /var/run/docker.sock
# Expected: srw-rw---- 1 root docker

# Check socket permissions
groups | grep docker
# Expected: User in docker group
```

### 3. Check System Resources
```bash
# Check CPU load
uptime
# If load >20 on 8-core system, investigate

# Check memory
free -h
# If swap usage high, memory pressure

# Check disk I/O
iostat -x 1 5
# If %util consistently >90%, disk bottleneck

# Check inode usage
df -i
# If >90% on /var, may affect Docker
```

### 4. Check Docker Process Health
```bash
# Check dockerd process
ps aux | grep dockerd
# Expected: Single dockerd process running

# Check for zombie processes
ps aux | grep "Z"
# Expected: None or very few

# Check Docker containerd
ps aux | grep containerd
# Expected: containerd process running
```

### 5. Identify Root Cause

**Common root causes:**
- Docker daemon crashed (segfault, OOM)
- Disk I/O saturation (storage driver issue)
- Network namespace corruption
- Containerd unresponsive
- Socket permission issue
- Kernel deadlock
- Too many containers (>1000)
- Docker storage driver corruption

## Resolution

### Immediate Actions (P0 - 2 minute response)

**Action 1: Restart Docker Daemon (Graceful)**
```bash
# Try graceful restart first
sudo systemctl restart docker

# Wait for daemon to stabilize
sleep 10

# Test connectivity
timeout 5 docker ps
# Expected: Returns container list

# Check daemon logs for errors
journalctl -u docker --since "1 minute ago" --no-pager | grep -i error
```

**Action 2: Force Restart (if graceful fails)**
```bash
# Stop Docker forcefully
sudo systemctl stop docker
sudo killall dockerd
sudo killall docker-containerd-shim

# Wait for cleanup
sleep 5

# Start Docker
sudo systemctl start docker

# Wait for startup
sleep 10

# Verify
timeout 5 docker ps
```

**Action 3: Emergency Recovery (if restart fails)**
```bash
# Check for file system corruption
sudo fsck -f /var/lib/docker
# Only if Docker volume is separate partition

# Reboot server (LAST RESORT for P0)
# Only if Docker daemon won't recover and impact is total outage
sudo reboot
```

### Complete Fix

**Step 1: Diagnose Root Cause**
```bash
# Check daemon logs for crash reason
journalctl -u docker --since "1 hour ago" --no-pager | less
# Look for: panic, fatal, segfault, OOM

# Check kernel logs
dmesg | tail -100
# Look for: OOM killer, memory allocation failures

# Check Docker storage driver
docker info | grep "Storage Driver"
# Expected: overlay2

# Check Docker data directory space
du -sh /var/lib/docker
df -h /var/lib/docker
```

**Step 2: Fix Storage Issues (if disk full)**
```bash
# Clean up unused resources
docker system prune -af --volumes
# Expected: Reclaim >10GB

# Remove old container logs
truncate -s 0 /var/lib/docker/containers/*/*-json.log
# Or configure log rotation

# Check space after cleanup
df -h /var/lib/docker
# Expected: >20% free
```

**Step 3: Fix Configuration Issues**
```bash
# Review Docker daemon configuration
cat /etc/docker/daemon.json
# Verify valid JSON syntax

# Recommended production config:
sudo tee /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "storage-opts": [
    "overlay2.override_kernel_check=true"
  ],
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 10,
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  },
  "live-restore": true
}
EOF

# Restart to apply
sudo systemctl restart docker
```

**Step 4: Restart All CFN Services**
```bash
# After Docker is stable, restart CFN stack
cd /mnt/wsl/.../

# Stop all CFN containers
docker-compose -f docker-compose.monitoring.yml down

# Wait for cleanup
sleep 5

# Start services
docker-compose -f docker-compose.monitoring.yml up -d

# Verify all services running
docker ps | grep cfn
# Expected: All containers UP

# Check service health
docker ps --format "table {{.Names}}\t{{.Status}}"
```

## Verification Checklist
- [ ] Docker daemon active (systemctl status docker)
- [ ] Docker commands respond within 2 seconds
- [ ] All CFN containers restarted successfully
- [ ] Redis and PostgreSQL data intact
- [ ] Agent spawns working
- [ ] No errors in daemon logs
- [ ] System load returned to normal
- [ ] Disk space adequate (>20% free)
- [ ] Prometheus alert cleared
- [ ] Grafana shows healthy metrics

## Prevention

### Configuration Changes
1. **Enable live-restore:** Prevents container restarts on daemon updates
2. **Configure log rotation:** Limit container logs to 10MB × 3 files
3. **Storage driver tuning:** Use overlay2 with proper options
4. **Resource limits:** Set memory/CPU limits on containers
5. **Healthchecks:** Add HEALTHCHECK to all Dockerfiles

### Monitoring Improvements
1. **Add alert:** Docker daemon CPU >80% for 5 minutes
2. **Add alert:** Docker data directory >80% full
3. **Add alert:** Container restarts >10/hour
4. **Add dashboard:** Docker daemon metrics (CPU, memory, goroutines)
5. **Add metric:** Docker API response time (P95, P99)

### Process Changes
1. **Regular maintenance:** Weekly Docker system prune
2. **Log rotation:** Configure logrotate for Docker logs
3. **Capacity monitoring:** Monthly review of /var/lib/docker growth
4. **Daemon updates:** Scheduled Docker version updates (quarterly)
5. **Backup strategy:** Daily backup of Docker volumes
6. **Chaos testing:** Monthly Docker daemon restart test

## Post-Incident

### Required Actions
1. Create post-incident review within 4 hours (P0 incident)
2. Update this runbook with specific crash details
3. Implement identified prevention measures within 1 week
4. Test Docker failover procedures
5. Review system resource allocation

### Post-Incident Review Template
```markdown
# PIR: Docker Daemon Unavailable - [DATE]

## Timeline
- [TIME]: Alert fired (daemon unresponsive)
- [TIME]: On-call paged
- [TIME]: On-call acknowledged
- [TIME]: Root cause identified
- [TIME]: Daemon restarted
- [TIME]: Services restored
- [TIME]: Alert cleared

## Root Cause
[Crash / OOM / disk full / corruption / deadlock]

## Impact
- **Duration:** [X minutes of total outage]
- **Affected functionality:** All container operations, entire CFN system
- **Failed operations:** [count] agent spawns, all coordination blocked
- **Data loss:** [none / status of persistent volumes]
- **User impact:** Complete system unavailability

## Resolution
[Daemon restart / disk cleanup / config fix / server reboot]

## Lessons Learned
- Docker daemon single point of failure
- Need better resource monitoring
- Log rotation not configured
- Recovery procedures need improvement

## Action Items
1. Configure log rotation - Owner: DevOps - Due: [date]
2. Add daemon resource alerts - Owner: SRE - Due: [date]
3. Implement Docker Swarm HA - Owner: Platform - Due: [date]
4. Automate disk cleanup - Owner: DevOps - Due: [date]
5. Test failover procedures - Owner: SRE - Due: [date]
```

## Related Alerts
- `HighAgentSpawnFailureRate` → [agent-spawn-failure.md](agent-spawn-failure.md)
- `DiskSpaceExhaustion` → [disk-space-exhaustion.md](disk-space-exhaustion.md)
- `RedisConnectionLoss` → [redis-connection-loss.md](redis-connection-loss.md)
- `PostgresConnectionLoss` → [postgres-connection-loss.md](postgres-connection-loss.md)

## References
- **Grafana:** http://localhost:3000/d/system-resources
- **Prometheus:** http://localhost:9090/alerts
- **Docs:** [MONITORING_GUIDE.md](/mnt/wsl/.../docs/MONITORING_GUIDE.md)
- **Docker Config:** [daemon.json](/etc/docker/daemon.json)
- **Docker Docs:** https://docs.docker.com/config/daemon/

---
**Last Updated:** 2025-11-24
**Version:** 1.0
**Maintainer:** Platform Team
