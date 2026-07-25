# CFN Docker Infrastructure Quick Reference

**Print this page and keep it handy!**

---

## Emergency Commands

```bash
# Emergency stop all CFN containers
docker stop $(docker ps -q --filter "name=cfn-")

# Emergency restart main coordinator
docker restart cfn-docker-main-coordinator

# Check overall health
docker ps --format "table {{.Names}}\t{{.Status}}" | grep cfn-
```

---

## Daily Health Check (5 min)

```bash
# 1. All containers running?
docker ps --format "table {{.Names}}\t{{.Status}}" | grep cfn-

# 2. Resource usage normal? (< 80% CPU, < 85% memory)
docker stats --no-stream | grep cfn-

# 3. Redis alive?
docker exec cfn-redis redis-cli PING

# 4. PostgreSQL alive?
docker exec cfn-postgres pg_isready

# 5. Any errors overnight?
docker logs cfn-docker-main-coordinator --since 12h | grep -i error
```

---

## Common Tasks

### Restart a Team Coordinator

```bash
TEAM="seo"  # Replace: seo, marketing, frontend, backend, devops, qa, csuite
docker restart cfn-docker-team-coordinator-$TEAM
docker logs cfn-docker-team-coordinator-$TEAM --tail 20
```

### Check Team Resource Usage

```bash
TEAM="backend"
docker stats --no-stream | grep $TEAM
cat docker/config/teams/$TEAM.yaml | grep -A 5 resources
```

### Provision New Team

```bash
# 1. Create config: docker/config/teams/newteam.yaml
# 2. Validate
./docker/scripts/validate-team-config.sh docker/config/teams/newteam.yaml

# 3. Dry-run
./docker/scripts/provision-team.sh --config docker/config/teams/newteam.yaml --dry-run

# 4. Provision
./docker/scripts/provision-team.sh \
  --config docker/config/teams/newteam.yaml \
  --create-workspace \
  --create-network \
  --spawn-redis \
  --spawn-coordinator
```

### Stop All Agents for a Team

```bash
TEAM="seo"
docker stop $(docker ps -q --filter "name=cfn-agent-$TEAM-")
```

---

## Troubleshooting Quick Fixes

### Container Won't Start

```bash
# Check logs
docker logs [CONTAINER_NAME] --tail 50

# Common fixes:
docker start cfn-redis         # Start Redis first
docker start cfn-postgres      # Start PostgreSQL first
docker restart [CONTAINER_NAME]  # Then restart container
```

### Resource Exhaustion

```bash
# Stop idle agents
docker stop $(docker ps -q --filter "name=cfn-agent-")

# Clean up
docker container prune -f
docker image prune -af
docker volume prune -f
```

### Network Issues

```bash
# Reconnect to network
docker network connect cfn-coordination [CONTAINER_NAME]
docker restart [CONTAINER_NAME]
```

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker ps | grep cfn-postgres

# Test connection
docker exec cfn-docker-main-coordinator \
  psql -h cfn-postgres -U cfn_user -d cfn_corporate -c "SELECT 1"

# Fix: restart PostgreSQL, then coordinator
docker restart cfn-postgres && sleep 10
docker restart cfn-docker-main-coordinator
```

---

## Incident Severity Guide

| Severity | Response Time | Examples |
|----------|---------------|----------|
| **SEV-1** | Immediate | Main coordinator down, PostgreSQL offline, all teams affected |
| **SEV-2** | 30 minutes | Multiple coordinators down, significant performance degradation |
| **SEV-3** | 4 hours | Single team issues, agent spawn failures |

**SEV-1:** Page on-call immediately
**SEV-2:** Call on-call within 30 min
**SEV-3:** Email on-call, resolve within business hours

---

## Useful Logs

```bash
# Main coordinator
docker logs cfn-docker-main-coordinator --tail 50 --follow

# Team coordinator
docker logs cfn-docker-team-coordinator-seo --tail 50 --follow

# All coordinators (last 5 lines each)
for c in $(docker ps --format "{{.Names}}" | grep coordinator); do
  echo "=== $c ===";
  docker logs $c --tail 5;
done
```

---

## Resource Limits Reference

| Team | Memory | CPU | Max Agents | Skills |
|------|--------|-----|-----------|--------|
| SEO | 12GB | 4 | 5 | content-generation, keyword-research, database-readonly, web-scraping |
| Marketing | 10GB | 3 | 4 | content-generation, database-readonly, web-scraping, social-media |
| Frontend | 12GB | 4 | 5 | database-readonly, testing |
| Backend | 16GB | 5 | 6 | database-readwrite, testing |
| DevOps | 12GB | 4 | 4 | database-readwrite, deployment |
| QA | 10GB | 3 | 4 | database-readonly, testing |
| C-Suite | 8GB | 2 | 3 | database-readonly, reporting |

**Total:** 80GB memory, 25 CPU cores, 31 max agents

---

## Network Reference

| Network | Subnet | Purpose |
|---------|--------|---------|
| cfn-coordination | 172.18.0.0/24 | Main coordinator + PostgreSQL + Redis |
| team-frontend | 172.18.1.0/24 | Frontend team |
| team-backend | 172.18.2.0/24 | Backend team |
| team-devops | 172.18.3.0/24 | DevOps team |
| team-qa | 172.18.4.0/24 | QA team |
| team-seo | 172.18.5.0/24 | SEO team |
| team-marketing | 172.18.6.0/24 | Marketing team |
| team-csuite | 172.18.7.0/24 | C-Suite team |

---

## Backup Locations

- PostgreSQL: `/backups/postgresql/YYYYMMDD/cfn-postgres-YYYYMMDD-HHMM.sql.gz`
- Redis: `/backups/redis/YYYYMMDD/dump-YYYYMMDD-HHMM.rdb.gz`
- Workspaces: `/backups/workspaces/YYYYMMDD/workspace-[TEAM]-YYYYMMDD.tar.gz`
- Config: `/backups/config/YYYYMMDD/team-configs-YYYYMMDD.tar.gz`
- Remote: `s3://cfn-backups/[hostname]/YYYY/MM/DD/`

**Retention:** 7 days local, 30 days remote

---

## Emergency Contacts

**Operations:** ops@company.com | #cfn-ops | +1-XXX-XXX-XXXX
**Infrastructure:** infra@company.com | #infra-team
**Security:** security@company.com | #security-incidents
**On-Call:** [PagerDuty/OpsGenie]

---

## File Locations

**Team Configs:** `docker/config/teams/*.yaml`
**Scripts:** `docker/scripts/*.sh`
**Playbooks:** `docker/playbooks/*.md`
**Logs:** `/var/log/cfn/`
**Workspaces:** `/workspace/[TEAM]/`

---

## Weekly Maintenance (Sundays 2-4 AM)

```bash
# 1. Update images
docker pull node:20-slim && docker pull postgres:15-alpine && docker pull redis:7-alpine

# 2. Rebuild coordinators
docker build -f docker/Dockerfile.main-coordinator -t cfn-docker-main-coordinator:latest .
docker build -f docker/Dockerfile.team-coordinator -t cfn-docker-team-coordinator:latest .

# 3. Restart coordinators
docker restart cfn-docker-main-coordinator && sleep 30
for team in seo marketing frontend backend devops qa csuite; do
  docker restart cfn-docker-team-coordinator-$team && sleep 15
done

# 4. Clean up
docker container prune -f && docker image prune -af

# 5. Verify
docker ps --format "table {{.Names}}\t{{.Status}}" | grep cfn-
```

---

## Quick Diagnostic Script

```bash
#!/bin/bash
echo "=== CFN Quick Diagnostic ==="
echo "Timestamp: $(date)"
echo ""
echo "Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}"
echo ""
echo "Resource Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
echo ""
echo "Redis:"
docker exec cfn-redis redis-cli PING || echo "FAILED"
echo ""
echo "PostgreSQL:"
docker exec cfn-postgres pg_isready || echo "FAILED"
```

Save to `/usr/local/bin/cfn-quick-check` and run with `cfn-quick-check`

---

## Remember

1. **Always dry-run first:** Use `--dry-run` flag for provisioning/deprovisioning
2. **Check logs before restart:** `docker logs [CONTAINER] --tail 50`
3. **One change at a time:** Restart coordinators sequentially, not in parallel
4. **Document everything:** Log all actions during incidents
5. **When in doubt, escalate:** Better safe than sorry

---

**Full Documentation:**
- Troubleshooting: `docker/playbooks/TROUBLESHOOTING_PLAYBOOK.md`
- Operations: `docker/playbooks/OPERATIONAL_RUNBOOK.md`
- Incidents: `docker/playbooks/INCIDENT_RESPONSE_GUIDE.md`
- Disaster Recovery: `docker/playbooks/DISASTER_RECOVERY_GUIDE.md`
