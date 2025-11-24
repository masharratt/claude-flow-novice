# Disk Space Exhaustion Runbook

## Alert Information
- **Alert Name:** `HighDiskUsage`
- **Severity:** P1
- **Notification:** Slack #cfn-alerts
- **Threshold:** >90% disk usage

## Symptoms
- Container operations failing
- PostgreSQL unable to write WAL files
- Redis persistence failing (RDB/AOF)
- Agent logs not being written
- Docker build failures
- System performance degradation
- "No space left on device" errors

**Grafana Dashboards:**
- System Resources Dashboard → Disk Usage panel
- Agent Performance Dashboard → Log Volume panel

**Common Error Messages:**
```
Error: No space left on device
Error: failed to write WAL file: disk full
Error: RDB snapshot save failed: ENOSPC
Error: Cannot create container: no space left on device
FATAL: could not write lock file "postmaster.pid": No space left on device
```

## Diagnosis

### 1. Check Disk Space Usage
```bash
# Check all mounted filesystems
df -h
# Look for >90% usage

# Check Docker data directory specifically
df -h /var/lib/docker
# Expected: <80% usage

# Check inode usage
df -i
# Inode exhaustion can also cause "no space" errors
```

### 2. Identify Large Space Consumers
```bash
# Find top 20 directories by size
du -h / 2>/dev/null | sort -rh | head -20

# Check Docker space usage breakdown
docker system df
# Shows: Images, Containers, Volumes, Build Cache

# Check container log sizes
du -sh /var/lib/docker/containers/*/*-json.log | sort -rh | head -20

# Check Docker volumes
docker volume ls -q | xargs -I {} docker volume inspect {} --format '{{.Name}}: {{.Mountpoint}}' | \
  while read vol; do echo "$vol $(du -sh $(echo $vol | cut -d: -f2) 2>/dev/null | cut -f1)"; done | sort -k2 -rh
```

### 3. Check Temporary Files
```bash
# Check /tmp directory
du -sh /tmp/*
# Large build artifacts may accumulate

# Check system logs
du -sh /var/log/*
# Old logs may not be rotated

# Check backups
du -sh /backups/*
# Old backups may need cleanup
```

### 4. Check Docker Resources
```bash
# List dangling images
docker images -f "dangling=true" -q | wc -l

# List stopped containers
docker ps -a -f "status=exited" -q | wc -l

# List unused volumes
docker volume ls -f "dangling=true" -q | wc -l

# Check build cache
docker builder du
```

### 5. Identify Root Cause

**Common root causes:**
- Docker images not pruned regularly
- Container logs growing unbounded
- Stopped containers accumulating
- Build cache not cleared
- Database backups not cleaned up
- Application logs not rotated
- Docker volumes growing (PostgreSQL/Redis data)

## Resolution

### Immediate Actions (P1 - 15 minute response)

**Action 1: Clean Docker Resources**
```bash
# Remove dangling images and stopped containers
docker system prune -af
# Expected: Reclaim >10GB

# Verify space freed
df -h /var/lib/docker
# Expected: <80% usage after cleanup
```

**Action 2: Truncate Large Container Logs**
```bash
# Find largest container logs
du -sh /var/lib/docker/containers/*/*-json.log | sort -rh | head -10

# Truncate logs >1GB (replace path)
truncate -s 0 /var/lib/docker/containers/[CONTAINER_ID]/*-json.log

# Or truncate all logs
find /var/lib/docker/containers -name "*-json.log" -exec truncate -s 0 {} \;

# Verify space freed
df -h /var/lib/docker
```

**Action 3: Remove Old Backups**
```bash
# List backups older than 7 days
find /backups -type f -mtime +7 -ls

# Remove old backups (keep last 7 days)
find /backups -type f -mtime +7 -delete

# Verify space freed
df -h /backups
```

### Complete Fix

**Step 1: Implement Log Rotation**
```bash
# Configure Docker daemon log rotation
sudo tee /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

# Restart Docker to apply
sudo systemctl restart docker

# Configure logrotate for system logs
sudo tee /etc/logrotate.d/docker-containers <<EOF
/var/lib/docker/containers/*/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
```

**Step 2: Automate Docker Cleanup**
```bash
# Create cleanup script
sudo tee /usr/local/bin/docker-cleanup.sh <<'EOF'
#!/bin/bash
# Automated Docker cleanup script

set -euo pipefail

echo "$(date): Starting Docker cleanup"

# Prune stopped containers older than 24h
docker container prune -f --filter "until=24h"

# Prune unused images older than 7 days
docker image prune -af --filter "until=168h"

# Prune build cache older than 7 days
docker builder prune -af --filter "until=168h"

# Prune unused volumes (be careful!)
docker volume prune -f

# Show space freed
docker system df

echo "$(date): Docker cleanup complete"
EOF

sudo chmod +x /usr/local/bin/docker-cleanup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/docker-cleanup.sh >> /var/log/docker-cleanup.log 2>&1") | crontab -
```

**Step 3: Clean Up PostgreSQL/Redis Data**
```bash
# PostgreSQL: Remove old data (if applicable)
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  DELETE FROM tasks WHERE created_at < NOW() - INTERVAL '30 days';
  VACUUM FULL;
"

# Redis: Check memory usage
docker exec cfn-redis redis-cli INFO memory | grep used_memory_human

# Redis: Remove old keys (if TTL-based cleanup needed)
docker exec cfn-redis redis-cli --scan --pattern "task:*" | \
  xargs -L 1 docker exec cfn-redis redis-cli TTL | \
  awk '$1 < 0 {print $1}' | \
  xargs -r -L 1 docker exec cfn-redis redis-cli DEL
```

**Step 4: Monitor and Alert Tuning**
```bash
# Verify Prometheus alert is working
curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | select(.labels.alertname=="HighDiskUsage")'

# Adjust threshold if needed (in prometheus-rules.yml)
# Current: >90%
# Consider: >85% for earlier warning
```

## Verification Checklist
- [ ] Alert cleared in Prometheus (disk usage <90%)
- [ ] Docker data directory <80% usage
- [ ] PostgreSQL and Redis containers operational
- [ ] Agent spawns working normally
- [ ] Log rotation configured
- [ ] Automated cleanup script scheduled
- [ ] Backup retention policy enforced
- [ ] System performance returned to normal
- [ ] No "no space" errors in logs
- [ ] Grafana metrics show healthy disk usage

## Prevention

### Configuration Changes
1. **Docker log rotation:** max-size=10m, max-file=3
2. **Automated cleanup:** Daily docker system prune cron job
3. **Backup retention:** Keep only 7 days of backups
4. **Volume monitoring:** Add alerts for volume growth rate
5. **Build cache limits:** Prune cache older than 7 days

### Monitoring Improvements
1. **Add alert:** Disk usage >80% (early warning)
2. **Add alert:** Disk growth rate >10GB/day
3. **Add alert:** Inode usage >80%
4. **Add dashboard:** Disk usage trends over 30 days
5. **Add metric:** Largest directories by size

### Process Changes
1. **Daily cleanup:** Automated docker system prune
2. **Weekly review:** Disk usage capacity planning
3. **Monthly audit:** Large file identification and cleanup
4. **Capacity planning:** Forecast disk needs for 6 months
5. **Log rotation:** All application logs rotate daily
6. **Backup strategy:** Implement tiered backup retention (7 daily, 4 weekly, 3 monthly)

## Post-Incident

### Required Actions
1. Create post-incident review within 24 hours
2. Update this runbook with specific findings
3. Implement all prevention measures within 1 week
4. Test automated cleanup procedures
5. Review disk capacity planning

### Post-Incident Review Template
```markdown
# PIR: Disk Space Exhaustion - [DATE]

## Timeline
- [TIME]: Alert fired (disk >90%)
- [TIME]: On-call notified
- [TIME]: On-call acknowledged
- [TIME]: Root cause identified
- [TIME]: Cleanup started
- [TIME]: Disk space recovered
- [TIME]: Alert cleared

## Root Cause
[Docker logs / images / backups / database growth]

## Impact
- **Duration:** [X minutes of degraded service]
- **Affected functionality:** [Container operations / database writes / builds]
- **Failed operations:** [count] spawns, [count] database writes
- **Data loss:** [none / details]
- **User impact:** [Service degradation / partial outage]

## Resolution
[docker prune / log truncation / backup cleanup]

## Space Recovered
- Docker images: [X GB]
- Container logs: [X GB]
- Backups: [X GB]
- Build cache: [X GB]
- Total: [X GB]

## Lessons Learned
- No automated cleanup in place
- Log rotation not configured
- Backup retention too long
- Monitoring threshold too high (90%)

## Action Items
1. Configure log rotation - Owner: DevOps - Due: [date]
2. Automate daily cleanup - Owner: DevOps - Due: [date]
3. Adjust alert threshold to 85% - Owner: SRE - Due: [date]
4. Implement backup retention policy - Owner: Platform - Due: [date]
5. Add disk growth rate alert - Owner: SRE - Due: [date]
```

## Related Alerts
- `DockerDaemonUnavailable` → [docker-daemon-unavailable.md](docker-daemon-unavailable.md)
- `PostgresConnectionLoss` → [postgres-connection-loss.md](postgres-connection-loss.md)
- `RedisConnectionLoss` → [redis-connection-loss.md](redis-connection-loss.md)
- `BackupFailure` → [backup-failure.md](backup-failure.md)

## References
- **Grafana:** http://localhost:3000/d/system-resources
- **Prometheus:** http://localhost:9090/alerts
- **Docs:** [MONITORING_GUIDE.md](/mnt/wsl/.../docs/MONITORING_GUIDE.md)
- **Docker Config:** [daemon.json](/etc/docker/daemon.json)
- **Cleanup Script:** [/usr/local/bin/docker-cleanup.sh]
- **Docker Docs:** https://docs.docker.com/config/containers/logging/

---
**Last Updated:** 2025-11-24
**Version:** 1.0
**Maintainer:** Platform Team
