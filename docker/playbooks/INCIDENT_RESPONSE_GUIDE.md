# CFN Docker Infrastructure Incident Response Guide

**Version:** 1.0.0
**Last Updated:** 2025-11-15
**Audience:** Operations team, on-call engineers
**Purpose:** Procedures for handling critical incidents and service disruptions

---

## Table of Contents

1. [Incident Severity Levels](#incident-severity-levels)
2. [Incident Response Process](#incident-response-process)
3. [Critical Incidents (SEV-1)](#critical-incidents-sev-1)
4. [Major Incidents (SEV-2)](#major-incidents-sev-2)
5. [Minor Incidents (SEV-3)](#minor-incidents-sev-3)
6. [Post-Incident Review](#post-incident-review)
7. [Communication Templates](#communication-templates)

---

## Incident Severity Levels

### SEV-1: Critical (Response Time: Immediate)

**Definition:** Complete service outage or severe degradation affecting all users

**Examples:**
- Main coordinator completely down
- PostgreSQL database offline or corrupted
- All team coordinators failing
- Security breach detected
- Data loss or corruption

**Response Requirements:**
- Page on-call engineer immediately
- Notify management within 15 minutes
- Update status page every 15 minutes
- Post-incident review required

### SEV-2: Major (Response Time: 30 minutes)

**Definition:** Significant service degradation affecting multiple teams

**Examples:**
- Multiple team coordinators down
- Redis connectivity issues
- Significant performance degradation
- Resource exhaustion across teams
- Network isolation failure

**Response Requirements:**
- Contact on-call engineer within 30 minutes
- Notify affected teams
- Update status page every 30 minutes
- Post-incident review recommended

### SEV-3: Minor (Response Time: 4 hours)

**Definition:** Limited service impact affecting single team or feature

**Examples:**
- Single team coordinator issues
- Agent spawn failures for one team
- Skill access issues
- Performance degradation (single team)

**Response Requirements:**
- Create incident ticket
- Notify affected team
- Resolve within business hours
- Post-incident review optional

---

## Incident Response Process

### Step 1: Detect and Assess (0-5 minutes)

1. **Confirm the incident**
   ```bash
   # Quick health check
   docker ps --format "table {{.Names}}\t{{.Status}}" | grep cfn-
   docker stats --no-stream | grep cfn-
   ```

2. **Assess severity**
   - How many teams affected?
   - Is data at risk?
   - Can we provide workarounds?
   - What's the business impact?

3. **Classify severity level** (SEV-1, SEV-2, or SEV-3)

### Step 2: Communicate (5-10 minutes)

1. **Notify stakeholders** based on severity
   ```bash
   # SEV-1: Page immediately
   # SEV-2: Call within 30 min
   # SEV-3: Email within 4 hours
   ```

2. **Create incident channel**
   ```bash
   # Slack channel naming: #incident-YYYYMMDD-brief-description
   # Example: #incident-20251115-main-coordinator-down
   ```

3. **Update status page**
   - Navigate to status.company.com/admin
   - Create new incident
   - Select affected services
   - Post initial update

### Step 3: Investigate (Parallel with mitigation)

1. **Collect diagnostic information**
   ```bash
   # Run diagnostic script
   /tmp/cfn-diagnostic.sh > /tmp/incident-$(date +%Y%m%d-%H%M%S).txt
   ```

2. **Review recent changes**
   ```bash
   # Docker images updated?
   docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.CreatedSince}}"

   # Configuration changes?
   git log --since="24 hours ago" --oneline docker/

   # Recent deployments?
   docker ps -a --format "table {{.Names}}\t{{.CreatedAt}}" | head -20
   ```

3. **Check logs for errors**
   ```bash
   # Main coordinator
   docker logs cfn-docker-main-coordinator --since 1h | grep -i error

   # Team coordinators
   for team in seo marketing frontend backend devops qa csuite; do
     echo "=== Team: $team ==="
     docker logs cfn-docker-team-coordinator-$team --since 1h | grep -i error
   done
   ```

### Step 4: Mitigate (Immediate action)

1. **Apply immediate fixes** based on incident type (see sections below)

2. **Verify mitigation**
   ```bash
   # Check if issue resolved
   docker ps --format "table {{.Names}}\t{{.Status}}"
   docker stats --no-stream | grep cfn-
   ```

3. **Update stakeholders**
   - Post update in incident channel
   - Update status page
   - Notify affected teams

### Step 5: Monitor (Post-mitigation)

1. **Extended monitoring** (30-60 minutes)
   ```bash
   # Watch for recurring issues
   watch -n 30 'docker ps --format "table {{.Names}}\t{{.Status}}" | grep cfn-'
   ```

2. **Track key metrics**
   - Container health status
   - Resource usage trends
   - Error rates in logs

### Step 6: Resolve

1. **Confirm resolution**
   - All services operational
   - No errors in logs
   - Resource usage normal

2. **Close incident**
   - Post final update to stakeholders
   - Update status page: "Resolved"
   - Close incident channel (archive after 7 days)

3. **Schedule post-incident review** (SEV-1 and SEV-2)

---

## Critical Incidents (SEV-1)

### Incident: Main Coordinator Down

**Impact:** Entire CFN infrastructure offline, no cross-team coordination

**Immediate Actions:**

1. **Check container status**
   ```bash
   docker ps -a | grep cfn-docker-main-coordinator
   ```

2. **Review logs**
   ```bash
   docker logs cfn-docker-main-coordinator --tail 100
   ```

3. **Common fixes:**

   **A. Container crashed - restart**
   ```bash
   docker restart cfn-docker-main-coordinator

   # Wait 30 seconds
   sleep 30

   # Verify health
   docker inspect cfn-docker-main-coordinator | grep '"Status"'
   ```

   **B. Redis connection failed - verify Redis**
   ```bash
   docker ps | grep cfn-redis

   # If down, start Redis first
   docker start cfn-redis

   # Then restart coordinator
   docker restart cfn-docker-main-coordinator
   ```

   **C. PostgreSQL connection failed**
   ```bash
   docker ps | grep cfn-postgres

   # If down, start PostgreSQL first
   docker start cfn-postgres

   # Then restart coordinator
   docker restart cfn-docker-main-coordinator
   ```

   **D. Network issues**
   ```bash
   # Reconnect to coordination network
   docker network connect cfn-coordination cfn-docker-main-coordinator
   docker restart cfn-docker-main-coordinator
   ```

**Escalation:** If not resolved in 15 minutes, escalate to infrastructure team

**Post-Incident:** Full root cause analysis required

### Incident: PostgreSQL Database Offline

**Impact:** All data operations halted, coordinators unable to function

**Immediate Actions:**

1. **Check PostgreSQL status**
   ```bash
   docker ps -a | grep cfn-postgres
   docker logs cfn-postgres --tail 50
   ```

2. **Attempt restart**
   ```bash
   docker start cfn-postgres

   # Wait for startup
   sleep 10

   # Verify connectivity
   docker exec cfn-postgres pg_isready
   ```

3. **If restart fails:**

   **A. Check disk space**
   ```bash
   df -h /var/lib/docker
   # If >95%, free up space immediately
   ```

   **B. Check data corruption**
   ```bash
   docker logs cfn-postgres | grep -i "corrupt\|error"
   ```

   **C. Restore from backup** (if corrupted)
   ```bash
   # Stop PostgreSQL
   docker stop cfn-postgres

   # Get latest backup
   LATEST_BACKUP=$(ls -t /backups/postgresql/*/cfn-postgres-*.sql.gz | head -1)

   # Restore (see DISASTER_RECOVERY_GUIDE.md for full procedure)
   gunzip -c $LATEST_BACKUP | docker exec -i cfn-postgres psql -U postgres

   # Restart
   docker start cfn-postgres
   ```

**Escalation:** If not resolved in 10 minutes, page database administrator

**Communication:** Update every 10 minutes during outage

### Incident: Security Breach Detected

**Impact:** Potential data compromise, unauthorized access

**Immediate Actions:**

1. **STOP - Do not restart containers**
   ```bash
   # Preserve evidence
   # Take snapshots of current state
   ```

2. **Isolate affected containers**
   ```bash
   # Disconnect from networks
   CONTAINER="cfn-docker-team-coordinator-seo"  # Replace with affected container
   docker network disconnect cfn-coordination $CONTAINER
   docker network disconnect team-seo $CONTAINER

   # Pause container (preserves state for forensics)
   docker pause $CONTAINER
   ```

3. **Collect forensic data**
   ```bash
   # Export container filesystem
   docker export $CONTAINER > /tmp/forensics-$CONTAINER-$(date +%Y%m%d-%H%M%S).tar

   # Capture logs
   docker logs $CONTAINER > /tmp/logs-$CONTAINER-$(date +%Y%m%d-%H%M%S).log

   # Capture network connections
   docker exec $CONTAINER netstat -tulpn > /tmp/netstat-$CONTAINER-$(date +%Y%m%d-%H%M%S).txt
   ```

4. **Notify security team immediately**

5. **Change all credentials**
   ```bash
   # PostgreSQL passwords
   # Redis passwords (if configured)
   # API keys
   # SSH keys
   ```

**Escalation:** Page security team and management immediately

**Do NOT:**
- Restart affected containers
- Delete evidence
- Communicate publicly until cleared by security team

---

## Major Incidents (SEV-2)

### Incident: Multiple Team Coordinators Down

**Impact:** Multiple teams unable to spawn agents

**Immediate Actions:**

1. **Identify affected teams**
   ```bash
   # List coordinator status
   for team in seo marketing frontend backend devops qa csuite; do
     STATUS=$(docker inspect cfn-docker-team-coordinator-$team 2>/dev/null | grep '"Status"' || echo "Not Found")
     echo "$team: $STATUS"
   done
   ```

2. **Check common dependencies**
   ```bash
   # Redis
   docker ps | grep cfn-redis

   # Networks
   docker network ls | grep -E "(cfn-|team-)"
   ```

3. **Restart affected coordinators**
   ```bash
   # Restart one at a time to avoid overloading main coordinator
   for team in seo marketing frontend backend devops qa csuite; do
     if ! docker inspect cfn-docker-team-coordinator-$team | grep -q '"running"'; then
       echo "Restarting $team coordinator..."
       docker restart cfn-docker-team-coordinator-$team
       sleep 15
     fi
   done
   ```

4. **Monitor recovery**
   ```bash
   # Watch coordinator health
   watch -n 10 'docker ps --format "table {{.Names}}\t{{.Status}}" | grep coordinator'
   ```

**Escalation:** If >3 coordinators fail to restart, escalate to infrastructure team

### Incident: Resource Exhaustion (Host Level)

**Impact:** System-wide performance degradation

**Immediate Actions:**

1. **Check host resources**
   ```bash
   # CPU
   top -bn1 | head -20

   # Memory
   free -h

   # Disk
   df -h

   # Docker stats
   docker stats --no-stream
   ```

2. **Identify resource hog**
   ```bash
   # Top memory consumers
   docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" | sort -k2 -h

   # Top CPU consumers
   docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}" | sort -k2 -n
   ```

3. **Emergency actions:**

   **A. Stop idle agents**
   ```bash
   # Stop agents that haven't updated heartbeat in 5 minutes
   docker ps --filter "name=cfn-agent-" --format "{{.Names}}" | while read agent; do
     docker stop $agent
   done
   ```

   **B. Clear Docker cache**
   ```bash
   # Remove stopped containers
   docker container prune -f

   # Remove unused images
   docker image prune -af

   # Remove unused volumes
   docker volume prune -f
   ```

   **C. Increase host resources** (if cloud-based)
   ```bash
   # AWS example
   aws ec2 modify-instance-attribute --instance-id i-xxxxx --instance-type t3.xlarge
   ```

**Escalation:** If host resources cannot be freed, escalate to infrastructure team

---

## Minor Incidents (SEV-3)

### Incident: Single Team Coordinator Issues

**Impact:** One team unable to spawn agents

**Actions:**

1. **Restart team coordinator**
   ```bash
   TEAM="seo"  # Replace with affected team
   docker restart cfn-docker-team-coordinator-$TEAM
   ```

2. **Check team-specific resources**
   ```bash
   # Team Redis
   docker ps | grep cfn-redis-$TEAM

   # Team network
   docker network inspect team-$TEAM
   ```

3. **Review coordinator logs**
   ```bash
   docker logs cfn-docker-team-coordinator-$TEAM --tail 100
   ```

**Escalation:** If not resolved in 2 hours, escalate to platform team

### Incident: Agent Spawn Failures

**Impact:** Single team cannot spawn new agents

**Actions:**

1. **Check resource limits**
   ```bash
   TEAM="backend"

   # Current agent count
   docker ps --filter "name=cfn-agent-$TEAM" | wc -l

   # Max agents for team
   yq -r '.team.resources.max_agents' docker/config/teams/$TEAM.yaml
   ```

2. **Check team resource usage**
   ```bash
   docker stats --no-stream | grep $TEAM
   ```

3. **Stop idle agents to free resources**
   ```bash
   docker ps --filter "name=cfn-agent-$TEAM" --format "{{.Names}}" | while read agent; do
     # Check last activity (implement team-specific logic)
     docker stop $agent
   done
   ```

---

## Post-Incident Review

### Required For

- All SEV-1 incidents
- SEV-2 incidents with user impact >1 hour
- SEV-3 incidents with recurring issues

### Review Template

**Incident:** [Brief description]
**Date:** [YYYY-MM-DD]
**Duration:** [Start time] - [End time] ([total minutes])
**Severity:** [SEV-1/SEV-2/SEV-3]

**Timeline:**
- 00:00 - Incident detected
- 00:05 - Incident declared, stakeholders notified
- 00:15 - Root cause identified
- 00:30 - Mitigation applied
- 01:00 - Service restored
- 01:30 - Monitoring confirmed stable

**Root Cause:**
[Detailed explanation of what caused the incident]

**Impact:**
- Teams affected: [list]
- Users affected: [number]
- Data loss: [yes/no, details]
- Revenue impact: [$amount if applicable]

**Resolution:**
[What was done to resolve the incident]

**Action Items:**
1. [Preventive measure 1] - Owner: [name] - Due: [date]
2. [Preventive measure 2] - Owner: [name] - Due: [date]
3. [Documentation update] - Owner: [name] - Due: [date]

**Lessons Learned:**
- What went well:
  - [Point 1]
  - [Point 2]
- What could be improved:
  - [Point 1]
  - [Point 2]

---

## Communication Templates

### SEV-1: Initial Notification

```
Subject: [SEV-1] CFN Infrastructure Incident

We are currently experiencing a critical incident affecting the CFN Docker infrastructure.

Impact: [Describe user impact]
Start Time: [HH:MM UTC]
Current Status: Investigating

We are actively working to resolve this issue and will provide updates every 15 minutes.

Incident Channel: #incident-[date]-[description]
Status Page: https://status.company.com/incidents/[id]
```

### SEV-1: Update

```
Subject: [SEV-1] CFN Infrastructure Incident - Update [#]

Update [#] - [HH:MM UTC]

Current Status: [Investigating | Identified | Monitoring | Resolved]

[Describe current situation and progress]

Next Update: [HH:MM UTC]
```

### SEV-1: Resolution

```
Subject: [SEV-1] CFN Infrastructure Incident - RESOLVED

The CFN infrastructure incident has been resolved.

Duration: [total time]
Impact: [summary of impact]
Root Cause: [brief description]

All services are now operational and running normally.

A detailed post-incident review will be shared within 48 hours.

Thank you for your patience.
```

### SEV-2: Notification

```
Subject: [SEV-2] CFN Infrastructure Issue

We are experiencing an issue affecting [description].

Impact: [Describe impact]
Teams Affected: [list teams]
Start Time: [HH:MM UTC]

We are working to resolve this and will update every 30 minutes.

Status: https://status.company.com/incidents/[id]
```

---

## Emergency Contacts

**Operations Team:**
- Email: ops@company.com
- Slack: #cfn-ops
- Phone: +1-XXX-XXX-XXXX

**Infrastructure Team:**
- Email: infra@company.com
- Slack: #infra-team
- On-Call: [PagerDuty/OpsGenie rotation]

**Security Team:**
- Email: security@company.com
- Slack: #security-incidents
- Emergency: +1-XXX-XXX-XXXX

**Management:**
- Engineering Director: [email]
- VP Engineering: [email]

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-15 | Initial incident response guide |

---

## Related Documents

- [Troubleshooting Playbook](TROUBLESHOOTING_PLAYBOOK.md)
- [Disaster Recovery Guide](DISASTER_RECOVERY_GUIDE.md)
- [Operational Runbook](OPERATIONAL_RUNBOOK.md)
