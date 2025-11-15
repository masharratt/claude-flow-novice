# CFN Docker Infrastructure Operational Runbook

**Version:** 1.0.0
**Last Updated:** 2025-11-15
**Audience:** Operations team, daily operators
**Purpose:** Standard operating procedures for routine maintenance and operations

---

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Team Management](#team-management)
3. [Resource Management](#resource-management)
4. [Maintenance Windows](#maintenance-windows)
5. [Backup Procedures](#backup-procedures)
6. [Log Management](#log-management)
7. [Performance Monitoring](#performance-monitoring)
8. [Security Operations](#security-operations)

---

## Daily Operations

### Morning Health Check (10 minutes)

**Frequency:** Every weekday morning, 9:00 AM

**Procedure:**

1. **Check all containers are running**
   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}\t{{.RunningFor}}"
   ```

   Expected output: All `cfn-*` containers with status "Up"

2. **Verify coordinator health**
   ```bash
   # Main coordinator
   docker inspect cfn-docker-main-coordinator | grep -A 5 '"Health"'

   # Team coordinators (all 7 teams)
   for team in seo marketing frontend backend devops qa csuite; do
     echo "Team: $team"
     docker inspect cfn-docker-team-coordinator-$team | grep '"Status"' | head -1
   done
   ```

   Expected: All showing `"Status": "healthy"`

3. **Check resource usage**
   ```bash
   docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
   ```

   **Thresholds:**
   - CPU < 80% (normal operations)
   - Memory < 85% (normal operations)
   - **Action if exceeded:** Investigate, notify team lead

4. **Review overnight logs**
   ```bash
   # Check for errors in last 12 hours
   docker logs cfn-docker-main-coordinator --since 12h | grep -i error

   # Check escalations
   docker exec cfn-redis redis-cli LRANGE "main:escalations:history" 0 -1
   ```

   **Action if errors found:** Create incident ticket, follow troubleshooting playbook

5. **Verify Redis/PostgreSQL health**
   ```bash
   # Redis
   docker exec cfn-redis redis-cli PING
   # Expected: PONG

   # PostgreSQL
   docker exec cfn-postgres pg_isready
   # Expected: accepting connections
   ```

**Checklist:**
- [ ] All containers running
- [ ] All coordinators healthy
- [ ] Resource usage normal
- [ ] No critical errors in logs
- [ ] Redis responding
- [ ] PostgreSQL responding
- [ ] Escalations reviewed

**Time to complete:** 10 minutes

**Frequency:** Daily (weekdays)

---

### End-of-Day Summary (5 minutes)

**Frequency:** Every weekday, 5:00 PM

**Procedure:**

1. **Generate daily summary**
   ```bash
   cat > /tmp/cfn-daily-summary.sh <<'EOF'
   #!/bin/bash
   echo "CFN Infrastructure Daily Summary - $(date +%Y-%m-%d)"
   echo "=================================================="
   echo ""

   echo "Container Uptime:"
   docker ps --format "{{.Names}}: {{.RunningFor}}" | grep cfn-
   echo ""

   echo "Resource Usage Summary:"
   docker stats --no-stream --format "{{.Name}}: CPU {{.CPUPerc}}, Memory {{.MemUsage}}" | grep cfn-
   echo ""

   echo "Total Agents Spawned Today:"
   docker ps -a --filter "name=cfn-agent-" --filter "since=24h" | wc -l
   echo ""

   echo "Escalations Today:"
   docker exec cfn-redis redis-cli LLEN "main:escalations:$(date +%Y%m%d)"
   echo ""
   EOF

   chmod +x /tmp/cfn-daily-summary.sh
   /tmp/cfn-daily-summary.sh | tee /var/log/cfn/daily-summary-$(date +%Y%m%d).txt
   ```

2. **Email summary to team**
   ```bash
   # Optional: Send via email
   /tmp/cfn-daily-summary.sh | mail -s "CFN Daily Summary $(date +%Y-%m-%d)" ops@company.com
   ```

3. **Archive old logs** (if not automated)
   ```bash
   # Move logs older than 7 days to archive
   find /var/log/cfn/ -name "*.log" -mtime +7 -exec mv {} /var/log/cfn/archive/ \;
   ```

**Checklist:**
- [ ] Summary generated
- [ ] Summary emailed to team
- [ ] Old logs archived
- [ ] No pending alerts

---

## Team Management

### Provisioning a New Team

**Frequency:** As needed (typically monthly)

**Prerequisites:**
- Team configuration file created in `docker/config/teams/[team-id].yaml`
- Network subnet allocated (check `docker network ls` for available ranges)
- Resource budget approved

**Procedure:**

1. **Create team configuration**
   ```bash
   # Use existing team as template
   cp docker/config/teams/seo.yaml docker/config/teams/newteam.yaml

   # Edit configuration
   nano docker/config/teams/newteam.yaml
   ```

   **Required fields:**
   - team.id (lowercase, alphanumeric, hyphens only)
   - team.name (display name)
   - team.workspace.path (unique path)
   - team.resources.memory (e.g., "12GB")
   - team.resources.cpu_cores (integer)
   - team.resources.max_agents (integer)
   - team.network.subnet_id (1-254, unique)
   - team.network.coordinator_ip (172.18.0.X, unique)
   - team.allowed_skills (array of skill names)

2. **Validate configuration**
   ```bash
   ./docker/scripts/validate-team-config.sh docker/config/teams/newteam.yaml
   ```

   **Expected:** "✅ Validation PASSED"

3. **Create Docker network**
   ```bash
   # Networks are created in bulk, but can create individually:
   TEAM_ID="newteam"
   SUBNET_ID=8  # From config file

   docker network create \
     --driver bridge \
     --subnet "172.18.$SUBNET_ID.0/24" \
     --gateway "172.18.$SUBNET_ID.1" \
     "team-$TEAM_ID"
   ```

4. **Provision team** (dry-run first)
   ```bash
   # Dry-run to verify
   ./docker/scripts/provision-team.sh \
     --config docker/config/teams/newteam.yaml \
     --dry-run

   # Actual provisioning
   ./docker/scripts/provision-team.sh \
     --config docker/config/teams/newteam.yaml \
     --create-workspace \
     --create-network \
     --spawn-redis \
     --spawn-coordinator
   ```

5. **Verify provisioning**
   ```bash
   TEAM_ID="newteam"

   # Check workspace
   ls -la /workspace/$TEAM_ID/

   # Check network
   docker network inspect team-$TEAM_ID

   # Check Redis
   docker ps | grep cfn-redis-$TEAM_ID

   # Check coordinator
   docker ps | grep cfn-docker-team-coordinator-$TEAM_ID

   # Check coordinator health
   docker logs cfn-docker-team-coordinator-$TEAM_ID --tail 20
   ```

6. **Register in documentation**
   ```bash
   # Add to team list
   echo "- $TEAM_ID: [description]" >> docker/docs/TEAMS.md
   ```

**Checklist:**
- [ ] Configuration created and validated
- [ ] Network created
- [ ] Workspace created with correct permissions
- [ ] Skills copied to workspace
- [ ] Team Redis running
- [ ] Team coordinator running and healthy
- [ ] Documentation updated

**Time to complete:** 20-30 minutes

### Deprovisioning a Team

**Frequency:** As needed (rare)

**Prerequisites:**
- Team approval
- Data backup completed
- All team members notified

**Procedure:**

1. **Stop all agents for team**
   ```bash
   TEAM_ID="oldteam"

   # List agents
   docker ps --filter "name=cfn-agent-$TEAM_ID-"

   # Stop all agents
   docker stop $(docker ps -q --filter "name=cfn-agent-$TEAM_ID-")
   ```

2. **Archive workspace** (if needed)
   ```bash
   # Create archive
   sudo tar -czf /backups/workspace-$TEAM_ID-$(date +%Y%m%d).tar.gz /workspace/$TEAM_ID/

   # Verify archive
   tar -tzf /backups/workspace-$TEAM_ID-$(date +%Y%m%d).tar.gz | head
   ```

3. **Run deprovision script**
   ```bash
   # Dry-run first
   ./docker/scripts/deprovision-team.sh \
     --config docker/config/teams/$TEAM_ID.yaml \
     --dry-run

   # Actual deprovision (keeps workspace by default)
   ./docker/scripts/deprovision-team.sh \
     --config docker/config/teams/$TEAM_ID.yaml \
     --archive-workspace

   # To remove workspace (DANGEROUS)
   ./docker/scripts/deprovision-team.sh \
     --config docker/config/teams/$TEAM_ID.yaml \
     --remove-workspace \
     --force
   ```

4. **Verify cleanup**
   ```bash
   # Check no containers remaining
   docker ps -a | grep $TEAM_ID

   # Check network removed (or not, depending on options)
   docker network ls | grep team-$TEAM_ID

   # Check workspace archived or removed
   ls -la /workspace/$TEAM_ID/
   ```

**Checklist:**
- [ ] Team approval received
- [ ] Data backed up
- [ ] Agents stopped
- [ ] Workspace archived
- [ ] Containers removed
- [ ] Network removed (if applicable)
- [ ] Documentation updated

**Time to complete:** 15-20 minutes

---

## Resource Management

### Adjusting Team Resource Limits

**Frequency:** As needed (based on resource escalations)

**Procedure:**

1. **Review resource usage history**
   ```bash
   TEAM_ID="backend"

   # Current usage
   docker stats --no-stream | grep $TEAM_ID

   # Historical escalations
   docker exec cfn-redis redis-cli LRANGE "team:$TEAM_ID:escalations" 0 -1
   ```

2. **Update team configuration**
   ```bash
   # Edit config file
   nano docker/config/teams/$TEAM_ID.yaml

   # Example changes:
   # memory: 16GB -> 20GB
   # cpu_cores: 5 -> 6
   # max_agents: 6 -> 8
   ```

3. **Validate new configuration**
   ```bash
   ./docker/scripts/validate-team-config.sh docker/config/teams/$TEAM_ID.yaml
   ```

4. **Apply changes** (requires coordinator restart)
   ```bash
   # Stop team coordinator
   docker stop cfn-docker-team-coordinator-$TEAM_ID

   # Remove old coordinator
   docker rm cfn-docker-team-coordinator-$TEAM_ID

   # Spawn new coordinator with updated limits
   ./docker/scripts/provision-team.sh \
     --config docker/config/teams/$TEAM_ID.yaml \
     --spawn-coordinator
   ```

5. **Verify new limits**
   ```bash
   # Check environment variables
   docker inspect cfn-docker-team-coordinator-$TEAM_ID | grep -E "(BUDGET|MAX_AGENTS)"

   # Monitor for next 24 hours
   ```

**Checklist:**
- [ ] Usage history reviewed
- [ ] Configuration updated
- [ ] Validation passed
- [ ] Coordinator restarted with new limits
- [ ] New limits verified
- [ ] Team notified of changes

---

## Maintenance Windows

### Weekly Maintenance (Sunday 2:00 AM - 4:00 AM)

**Frequency:** Weekly, Sundays 2:00 AM

**Procedure:**

1. **Notify teams** (Friday before maintenance)
   ```bash
   # Send notification
   echo "CFN Infrastructure maintenance window: Sunday 2:00-4:00 AM UTC" | \
     mail -s "CFN Maintenance Window" all-teams@company.com
   ```

2. **Stop non-critical agents** (2:00 AM)
   ```bash
   # Stop idle agents
   docker stop $(docker ps -q --filter "name=cfn-agent-" --filter "status=running")
   ```

3. **Update Docker images** (2:10 AM)
   ```bash
   # Pull latest base images
   docker pull node:20-slim
   docker pull postgres:15-alpine
   docker pull redis:7-alpine

   # Rebuild coordinator images
   docker build -f docker/Dockerfile.main-coordinator -t cfn-docker-main-coordinator:latest .
   docker build -f docker/Dockerfile.team-coordinator -t cfn-docker-team-coordinator:latest .
   ```

4. **Restart coordinators** (2:30 AM)
   ```bash
   # Restart main coordinator
   docker restart cfn-docker-main-coordinator

   # Wait 30 seconds
   sleep 30

   # Restart team coordinators (one at a time)
   for team in seo marketing frontend backend devops qa csuite; do
     echo "Restarting $team coordinator..."
     docker restart cfn-docker-team-coordinator-$team
     sleep 15
   done
   ```

5. **Clean up old data** (3:00 AM)
   ```bash
   # Remove old agent containers
   docker rm $(docker ps -aq --filter "status=exited" --filter "name=cfn-agent-")

   # Remove unused images
   docker image prune -f

   # Clean up old logs (keeping last 7 days)
   find /var/log/cfn/ -name "*.log" -mtime +7 -delete
   ```

6. **Verify system health** (3:30 AM)
   ```bash
   # Run health check script
   ./docker/tests/test-phase2-validation.sh

   # Check all coordinators
   docker ps --format "table {{.Names}}\t{{.Status}}"
   ```

7. **Send completion notification** (4:00 AM)
   ```bash
   # Generate report
   echo "CFN Maintenance Complete - $(date)" > /tmp/maintenance-report.txt
   echo "" >> /tmp/maintenance-report.txt
   docker ps --format "table {{.Names}}\t{{.Status}}" >> /tmp/maintenance-report.txt

   # Email report
   cat /tmp/maintenance-report.txt | mail -s "CFN Maintenance Complete" ops@company.com
   ```

**Checklist:**
- [ ] Teams notified 48 hours in advance
- [ ] Non-critical agents stopped
- [ ] Docker images updated
- [ ] Coordinators restarted
- [ ] Old data cleaned up
- [ ] Health checks passed
- [ ] Completion notification sent

**Time to complete:** 2 hours

---

## Backup Procedures

### Daily Backup (1:00 AM)

**Frequency:** Daily, 1:00 AM

**What to backup:**
- PostgreSQL database
- Redis data (persistent)
- Team workspaces (code and data)
- Configuration files

**Procedure:**

1. **Backup PostgreSQL**
   ```bash
   # Create backup directory
   BACKUP_DIR="/backups/postgresql/$(date +%Y%m%d)"
   mkdir -p $BACKUP_DIR

   # Dump database
   docker exec cfn-postgres pg_dumpall -U postgres > $BACKUP_DIR/cfn-postgres-$(date +%Y%m%d-%H%M).sql

   # Compress
   gzip $BACKUP_DIR/cfn-postgres-$(date +%Y%m%d-%H%M).sql

   # Verify backup
   gunzip -t $BACKUP_DIR/cfn-postgres-$(date +%Y%m%d-%H%M).sql.gz
   ```

2. **Backup Redis** (if using persistence)
   ```bash
   BACKUP_DIR="/backups/redis/$(date +%Y%m%d)"
   mkdir -p $BACKUP_DIR

   # Trigger Redis save
   docker exec cfn-redis redis-cli SAVE

   # Copy RDB file
   docker cp cfn-redis:/data/dump.rdb $BACKUP_DIR/dump-$(date +%Y%m%d-%H%M).rdb

   # Compress
   gzip $BACKUP_DIR/dump-$(date +%Y%m%d-%H%M).rdb
   ```

3. **Backup team workspaces**
   ```bash
   BACKUP_DIR="/backups/workspaces/$(date +%Y%m%d)"
   mkdir -p $BACKUP_DIR

   # Backup each team workspace
   for team in seo marketing frontend backend devops qa csuite; do
     echo "Backing up workspace: $team"
     tar -czf $BACKUP_DIR/workspace-$team-$(date +%Y%m%d).tar.gz /workspace/$team/
   done
   ```

4. **Backup configuration files**
   ```bash
   BACKUP_DIR="/backups/config/$(date +%Y%m%d)"
   mkdir -p $BACKUP_DIR

   # Backup team configs
   tar -czf $BACKUP_DIR/team-configs-$(date +%Y%m%d).tar.gz docker/config/teams/

   # Backup Docker files
   tar -czf $BACKUP_DIR/docker-infrastructure-$(date +%Y%m%d).tar.gz \
     docker/Dockerfile* \
     docker/coordinator/ \
     docker/skills/ \
     docker/scripts/
   ```

5. **Verify backups**
   ```bash
   # List all backups created today
   find /backups/ -type f -mtime -1 -name "*$(date +%Y%m%d)*"

   # Check sizes (should not be 0)
   find /backups/ -type f -mtime -1 -name "*$(date +%Y%m%d)*" -exec ls -lh {} \;
   ```

6. **Upload to remote storage** (S3 or similar)
   ```bash
   # Example using AWS S3
   aws s3 sync /backups/ s3://cfn-backups/$(hostname)/$(date +%Y/%m/%d)/ \
     --storage-class STANDARD_IA
   ```

7. **Clean up old local backups** (keep last 7 days)
   ```bash
   find /backups/ -type f -mtime +7 -delete
   find /backups/ -type d -empty -delete
   ```

**Automated Script:**
```bash
#!/bin/bash
# /usr/local/bin/cfn-daily-backup.sh

set -euo pipefail

BACKUP_ROOT="/backups"
DATE=$(date +%Y%m%d)
TIMESTAMP=$(date +%Y%m%d-%H%M)

echo "Starting CFN backup: $TIMESTAMP"

# PostgreSQL
mkdir -p $BACKUP_ROOT/postgresql/$DATE
docker exec cfn-postgres pg_dumpall -U postgres | gzip > $BACKUP_ROOT/postgresql/$DATE/cfn-postgres-$TIMESTAMP.sql.gz

# Redis
mkdir -p $BACKUP_ROOT/redis/$DATE
docker exec cfn-redis redis-cli SAVE
docker cp cfn-redis:/data/dump.rdb $BACKUP_ROOT/redis/$DATE/dump-$TIMESTAMP.rdb
gzip $BACKUP_ROOT/redis/$DATE/dump-$TIMESTAMP.rdb

# Workspaces
mkdir -p $BACKUP_ROOT/workspaces/$DATE
for team in seo marketing frontend backend devops qa csuite; do
  tar -czf $BACKUP_ROOT/workspaces/$DATE/workspace-$team-$TIMESTAMP.tar.gz /workspace/$team/
done

# Config
mkdir -p $BACKUP_ROOT/config/$DATE
tar -czf $BACKUP_ROOT/config/$DATE/team-configs-$TIMESTAMP.tar.gz docker/config/teams/

# Upload to S3 (if configured)
if command -v aws &> /dev/null; then
  aws s3 sync $BACKUP_ROOT/ s3://cfn-backups/$(hostname)/$(date +%Y/%m/%d)/ --storage-class STANDARD_IA
fi

# Cleanup old backups
find $BACKUP_ROOT/ -type f -mtime +7 -delete
find $BACKUP_ROOT/ -type d -empty -delete

echo "Backup complete: $TIMESTAMP"
```

**Add to crontab:**
```bash
# Edit crontab
crontab -e

# Add line:
0 1 * * * /usr/local/bin/cfn-daily-backup.sh >> /var/log/cfn/backup.log 2>&1
```

**Checklist:**
- [ ] PostgreSQL backed up
- [ ] Redis backed up
- [ ] All workspaces backed up
- [ ] Configuration files backed up
- [ ] Backups verified (non-zero size)
- [ ] Backups uploaded to remote storage
- [ ] Old backups cleaned up

---

## Log Management

### Log Retention Policy

**Logs to Keep:**
- Coordinator logs: 7 days local, 30 days archived
- Agent logs: 3 days local, 7 days archived
- System logs: 30 days local, 90 days archived

### Daily Log Rotation (midnight)

**Procedure:**

```bash
#!/bin/bash
# /usr/local/bin/cfn-log-rotation.sh

set -euo pipefail

LOG_DIR="/var/log/cfn"
ARCHIVE_DIR="/var/log/cfn/archive"
DATE=$(date +%Y%m%d)

mkdir -p $ARCHIVE_DIR

# Rotate coordinator logs
for container in $(docker ps --format "{{.Names}}" | grep coordinator); do
  docker logs $container > $LOG_DIR/${container}-${DATE}.log 2>&1
done

# Compress logs older than 1 day
find $LOG_DIR -name "*.log" -mtime +1 -exec gzip {} \;

# Move compressed logs to archive
find $LOG_DIR -name "*.log.gz" -exec mv {} $ARCHIVE_DIR/ \;

# Delete archived logs older than retention period
find $ARCHIVE_DIR -name "*coordinator*.log.gz" -mtime +30 -delete
find $ARCHIVE_DIR -name "*agent*.log.gz" -mtime +7 -delete

echo "Log rotation complete: $(date)"
```

**Add to crontab:**
```bash
0 0 * * * /usr/local/bin/cfn-log-rotation.sh >> /var/log/cfn/log-rotation.log 2>&1
```

---

## Performance Monitoring

### Metrics to Monitor

**Infrastructure Metrics:**
- Container CPU usage (< 80% normal)
- Container memory usage (< 85% normal)
- Network throughput
- Disk I/O

**Application Metrics:**
- Agent spawn rate
- Agent success/failure ratio
- Query execution time
- Escalation frequency

### Monitoring Commands

```bash
# Real-time resource monitoring
docker stats

# Historical CPU usage (requires cAdvisor or similar)
# See docker/playbooks/MONITORING_PLAYBOOK.md

# Network traffic
docker exec cfn-docker-main-coordinator netstat -i

# Disk usage
df -h /workspace/
```

---

## Security Operations

### Daily Security Checks

1. **Check for vulnerable images**
   ```bash
   # Scan images (requires docker scan or trivy)
   docker scan cfn-docker-main-coordinator:latest
   docker scan cfn-docker-team-coordinator:latest
   ```

2. **Review access logs**
   ```bash
   # PostgreSQL connections
   docker logs cfn-postgres | grep "connection authorized"

   # Failed authentication attempts
   docker logs cfn-postgres | grep "authentication failed"
   ```

3. **Check for unauthorized containers**
   ```bash
   # List all containers
   docker ps -a

   # Look for containers not matching cfn-* pattern
   docker ps --format "{{.Names}}" | grep -v "^cfn-"
   ```

### Weekly Security Tasks

1. **Update base images**
   ```bash
   docker pull node:20-slim
   docker pull postgres:15-alpine
   docker pull redis:7-alpine
   ```

2. **Review team access**
   ```bash
   # List teams with database write access
   grep -l "database-readwrite" docker/config/teams/*.yaml
   ```

3. **Audit skill usage**
   ```bash
   # Check which skills are actually being used
   for team in seo marketing frontend backend devops qa csuite; do
     echo "Team: $team"
     ls -la /workspace/$team/skills/
   done
   ```

---

## Appendix: Useful Scripts

### Quick Health Check
```bash
#!/bin/bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep cfn- && \
docker stats --no-stream | grep cfn- && \
docker exec cfn-redis redis-cli ping && \
docker exec cfn-postgres pg_isready
```

### Team Resource Summary
```bash
#!/bin/bash
for team in seo marketing frontend backend devops qa csuite; do
  echo "=== Team: $team ==="
  yq -r '.team.resources' docker/config/teams/$team.yaml
  echo ""
done
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-15 | Initial runbook creation |

---

## Feedback

Improvements or corrections? Contact ops@company.com or submit a PR.
