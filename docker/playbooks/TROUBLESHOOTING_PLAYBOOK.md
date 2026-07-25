# CFN Docker Infrastructure Troubleshooting Playbook

**Version:** 1.0.0
**Last Updated:** 2025-11-15
**Audience:** Operations team, less technical users
**Purpose:** Quick resolution guide for common Docker infrastructure issues

---

## Table of Contents

1. [Quick Reference - Common Issues](#quick-reference)
2. [Coordinator Issues](#coordinator-issues)
3. [Team Provisioning Issues](#team-provisioning-issues)
4. [Network Issues](#network-issues)
5. [Resource Exhaustion](#resource-exhaustion)
6. [Agent Issues](#agent-issues)
7. [Skill Access Issues](#skill-access-issues)
8. [Database Connection Issues](#database-connection-issues)
9. [Health Check Failures](#health-check-failures)
10. [Escalation Procedures](#escalation-procedures)

---

## Quick Reference

### Most Common Issues (80% of Problems)

| Symptom | Quick Check | Quick Fix |
|---------|-------------|-----------|
| Coordinator won't start | `docker logs cfn-docker-main-coordinator` | Check Redis/PostgreSQL connectivity |
| Team coordinator stuck | `docker logs cfn-docker-team-coordinator-[TEAM]` | Restart coordinator container |
| Agent can't spawn | Check team resource limits | Increase team memory/CPU allocation |
| Database queries failing | Check skill permissions | Verify readonly vs readwrite skill |
| Network timeout | `docker network ls` | Verify team network exists |

### Emergency Commands

```bash
# Stop everything (emergency shutdown)
docker stop $(docker ps -q --filter "name=cfn-")

# Restart main coordinator
docker restart cfn-docker-main-coordinator

# Restart specific team coordinator
docker restart cfn-docker-team-coordinator-seo

# Check overall health
docker ps --filter "name=cfn-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

---

## Coordinator Issues

### Issue 1: Main Coordinator Won't Start

**Symptoms:**
- Container exits immediately after start
- No heartbeat in Redis
- Health check fails

**Diagnosis:**
```bash
# Check container logs
docker logs cfn-docker-main-coordinator --tail 50

# Check if Redis is accessible
docker exec cfn-docker-main-coordinator redis-cli -h cfn-redis ping

# Check if PostgreSQL is accessible
docker exec cfn-docker-main-coordinator \
  psql -h cfn-postgres -U cfn_user -d cfn_corporate -c "SELECT 1"
```

**Common Causes:**

1. **Redis not running**
   ```bash
   # Solution: Start Redis
   docker start cfn-redis
   # Verify
   docker ps | grep cfn-redis
   ```

2. **PostgreSQL not running**
   ```bash
   # Solution: Start PostgreSQL
   docker start cfn-postgres
   # Verify
   docker ps | grep cfn-postgres
   ```

3. **Missing environment variables**
   ```bash
   # Check coordinator environment
   docker inspect cfn-docker-main-coordinator | grep -A 20 "Env"

   # Required variables:
   # - REDIS_HOST
   # - REDIS_PORT
   # - POSTGRES_HOST
   # - POSTGRES_USER
   # - POSTGRES_PASSWORD
   # - POSTGRES_DB
   ```

4. **Network connectivity**
   ```bash
   # Verify coordinator is on coordination network
   docker network inspect cfn-coordination | grep cfn-docker-main-coordinator
   ```

**Resolution Steps:**
1. Verify Redis is running: `docker ps | grep cfn-redis`
2. Verify PostgreSQL is running: `docker ps | grep cfn-postgres`
3. Check environment variables: `docker inspect cfn-docker-main-coordinator`
4. Restart coordinator: `docker restart cfn-docker-main-coordinator`
5. Monitor logs: `docker logs -f cfn-docker-main-coordinator`

### Issue 2: Team Coordinator Won't Start

**Symptoms:**
- Team-specific coordinator exits immediately
- No heartbeat for team in Redis
- Agents can't spawn for this team

**Diagnosis:**
```bash
# Replace [TEAM] with actual team ID (seo, marketing, etc.)
TEAM="seo"

# Check logs
docker logs cfn-docker-team-coordinator-$TEAM --tail 50

# Check if team Redis exists
docker ps | grep cfn-redis-$TEAM
```

**Common Causes:**

1. **Team Redis not running**
   ```bash
   # Start team Redis
   docker start cfn-redis-$TEAM
   ```

2. **Missing required environment variables**
   ```bash
   # Required for team coordinator:
   # - TEAM_ID
   # - BUDGET_ALLOCATED (in MB)
   # - MAX_AGENTS
   # - REDIS_HOST (team-specific)

   # Check current values
   docker inspect cfn-docker-team-coordinator-$TEAM | grep -A 30 "Env"
   ```

3. **Network isolation issue**
   ```bash
   # Verify team coordinator is on BOTH networks
   docker network inspect cfn-coordination | grep cfn-docker-team-coordinator-$TEAM
   docker network inspect team-$TEAM | grep cfn-docker-team-coordinator-$TEAM
   ```

**Resolution:**
1. Verify team Redis: `docker ps | grep cfn-redis-$TEAM`
2. Check environment variables match team config: `cat docker/config/teams/$TEAM.yaml`
3. Restart coordinator: `docker restart cfn-docker-team-coordinator-$TEAM`

### Issue 3: Coordinator Heartbeat Missing

**Symptoms:**
- Coordinator appears running but no heartbeat in Redis
- Main coordinator reports team as offline

**Diagnosis:**
```bash
# Check Redis for heartbeat keys
docker exec cfn-redis redis-cli KEYS "team:*:coordinator:heartbeat"

# Check specific team heartbeat
docker exec cfn-redis redis-cli GET "team:seo:coordinator:heartbeat"

# Check TTL (should be ~90 seconds)
docker exec cfn-redis redis-cli TTL "team:seo:coordinator:heartbeat"
```

**Resolution:**
1. If TTL is -2 (expired), coordinator is not writing heartbeats
2. Check coordinator logs for errors
3. Restart coordinator to reset heartbeat cycle

---

## Team Provisioning Issues

### Issue 4: Team Provisioning Fails

**Symptoms:**
- `provision-team.sh` script exits with error
- Team workspace not created
- Docker network not created

**Diagnosis:**
```bash
# Run in dry-run mode to see what would happen
./docker/scripts/provision-team.sh --config docker/config/teams/seo.yaml --dry-run

# Validate team configuration
./docker/scripts/validate-team-config.sh docker/config/teams/seo.yaml
```

**Common Causes:**

1. **Invalid team configuration**
   ```bash
   # Validate config
   ./docker/scripts/validate-team-config.sh docker/config/teams/seo.yaml

   # Look for validation errors
   # Fix any issues in the YAML file
   ```

2. **Workspace permissions**
   ```bash
   # Check if workspace parent exists
   ls -la /workspace/

   # Create with correct permissions
   sudo mkdir -p /workspace/seo
   sudo chown -R 1000:1000 /workspace/seo
   ```

3. **Docker network already exists**
   ```bash
   # Check existing networks
   docker network ls | grep team-seo

   # Remove if exists and recreate
   docker network rm team-seo
   ```

4. **Skills directory not found**
   ```bash
   # Verify skills exist
   ls -la /skills/

   # Check specific skills from team config
   cat docker/config/teams/seo.yaml | grep -A 10 allowed_skills
   ```

**Resolution:**
1. Validate configuration: `./docker/scripts/validate-team-config.sh docker/config/teams/[TEAM].yaml`
2. Fix validation errors in YAML file
3. Re-run provisioning script
4. If partial provisioning occurred, deprovision first: `./docker/scripts/deprovision-team.sh --config docker/config/teams/[TEAM].yaml`

### Issue 5: Skills Not Copied to Workspace

**Symptoms:**
- Team provisioned but skills missing from `/workspace/[TEAM]/skills/`
- Agents report "skill not found" errors

**Diagnosis:**
```bash
TEAM="seo"

# Check workspace skills directory
ls -la /workspace/$TEAM/skills/

# Compare with team config
cat docker/config/teams/$TEAM.yaml | grep -A 10 allowed_skills

# Check source skills directory
ls -la /skills/
```

**Resolution:**
```bash
# Manually copy missing skills
TEAM="seo"
SKILLS=("content-generation" "keyword-research" "database-readonly" "web-scraping")

for skill in "${SKILLS[@]}"; do
  sudo cp -r /skills/$skill /workspace/$TEAM/skills/$skill
  sudo chown -R 1000:1000 /workspace/$TEAM/skills/$skill
done
```

---

## Network Issues

### Issue 6: Container Can't Reach Redis/PostgreSQL

**Symptoms:**
- "Connection refused" errors in logs
- "Unknown host" errors
- Timeout errors

**Diagnosis:**
```bash
# Check if container is on correct network
CONTAINER="cfn-docker-team-coordinator-seo"
docker network inspect cfn-coordination | grep $CONTAINER

# Check Redis connectivity from container
docker exec $CONTAINER ping -c 3 cfn-redis

# Check if Redis is listening
docker exec cfn-redis netstat -tlnp | grep 6379
```

**Resolution:**

1. **Container not on network**
   ```bash
   # Connect container to network
   docker network connect cfn-coordination $CONTAINER
   ```

2. **DNS resolution failing**
   ```bash
   # Check DNS from container
   docker exec $CONTAINER nslookup cfn-redis

   # Use IP address as fallback
   docker inspect cfn-redis | grep IPAddress
   ```

3. **Firewall blocking**
   ```bash
   # Check iptables rules
   sudo iptables -L -n | grep docker

   # Restart Docker networking
   sudo systemctl restart docker
   ```

### Issue 7: Team Network Isolation Broken

**Symptoms:**
- Team A can access Team B's resources
- Network segmentation not working

**Diagnosis:**
```bash
# Test network isolation (should FAIL - good)
docker run --rm --network team-seo alpine ping -c 3 172.18.1.20  # Frontend team IP

# Check network driver
docker network inspect team-seo | grep Driver
# Should be "bridge"

# Check if teams share networks
docker network inspect team-seo | grep Containers
docker network inspect team-frontend | grep Containers
```

**Resolution:**
1. Verify teams have separate networks: `docker network ls | grep team-`
2. Ensure containers only on their team network (except coordinator on both)
3. Recreate networks if needed:
   ```bash
   docker network rm team-seo
   ./docker/scripts/create-networks.sh
   ```

---

## Resource Exhaustion

### Issue 8: Team Exceeds Memory Budget

**Symptoms:**
- Main coordinator receives escalation
- Agents start failing to spawn
- OOM (Out of Memory) errors in logs

**Diagnosis:**
```bash
TEAM="backend"

# Check current memory usage
docker stats cfn-docker-team-coordinator-$TEAM --no-stream

# Check team budget
cat docker/config/teams/$TEAM.yaml | grep memory

# Check all containers for this team
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" | grep $TEAM
```

**Immediate Actions:**

1. **Stop non-critical agents**
   ```bash
   # List running agents for team
   docker ps --filter "name=cfn-agent-$TEAM"

   # Stop oldest agents first
   docker stop cfn-agent-$TEAM-[AGENT_ID]
   ```

2. **Check for memory leaks**
   ```bash
   # Monitor memory over time
   docker stats cfn-docker-team-coordinator-$TEAM

   # Look for continuously growing memory
   ```

**Long-term Resolution:**

1. **Increase team budget** (if justified)
   ```yaml
   # Edit docker/config/teams/backend.yaml
   team:
     resources:
       memory: 20GB  # Increased from 16GB
   ```

2. **Optimize agent memory usage**
   - Review agent code for memory leaks
   - Reduce concurrent agent count
   - Implement agent recycling

3. **Implement agent limits**
   ```yaml
   # Reduce max_agents if necessary
   team:
     resources:
       max_agents: 4  # Reduced from 6
   ```

### Issue 9: CPU Throttling

**Symptoms:**
- Agents running slowly
- High CPU usage but not at 100%
- Docker throttling warnings in logs

**Diagnosis:**
```bash
TEAM="backend"

# Check CPU usage
docker stats --no-stream | grep $TEAM

# Check CPU quota
docker inspect cfn-docker-team-coordinator-$TEAM | grep -i cpu

# Check host CPU
top -bn1 | grep "Cpu(s)"
```

**Resolution:**

1. **Increase CPU allocation**
   ```yaml
   # Edit docker/config/teams/backend.yaml
   team:
     resources:
       cpu_cores: 6  # Increased from 5
   ```

2. **Restart team coordinator with new limits**
   ```bash
   docker stop cfn-docker-team-coordinator-$TEAM
   # Reprovision with updated config
   ./docker/scripts/provision-team.sh --config docker/config/teams/$TEAM.yaml --spawn-coordinator
   ```

---

## Agent Issues

### Issue 10: Agent Won't Spawn

**Symptoms:**
- Agent spawn command succeeds but no container appears
- Agent spawn fails with error
- Timeout waiting for agent

**Diagnosis:**
```bash
TEAM="seo"

# Check team coordinator logs
docker logs cfn-docker-team-coordinator-$TEAM --tail 50

# Check current agent count
docker ps --filter "name=cfn-agent-$TEAM" | wc -l

# Check team budget
cat docker/config/teams/$TEAM.yaml | grep max_agents
```

**Common Causes:**

1. **Max agents reached**
   ```bash
   # Check current count vs limit
   CURRENT=$(docker ps --filter "name=cfn-agent-$TEAM" | wc -l)
   MAX=$(yq -r '.team.resources.max_agents' docker/config/teams/$TEAM.yaml)

   echo "Current: $CURRENT, Max: $MAX"
   ```

2. **Insufficient resources**
   ```bash
   # Check team resource usage
   docker stats --no-stream | grep $TEAM

   # Compare to budget
   cat docker/config/teams/$TEAM.yaml | grep -A 5 resources
   ```

3. **Docker image missing**
   ```bash
   # Check if agent image exists
   docker images | grep cfn-agent

   # Build if missing
   docker build -f docker/Dockerfile.agent -t cfn-agent:latest .
   ```

**Resolution:**
1. Stop idle agents: `docker stop $(docker ps -q --filter "name=cfn-agent-$TEAM-idle")`
2. Increase max_agents if appropriate
3. Check resource budgets

### Issue 11: Agent Heartbeat Timeout

**Symptoms:**
- Team coordinator reports agent as dead
- Agent appears running but no heartbeat
- Agent marked for recovery

**Diagnosis:**
```bash
TEAM="seo"
AGENT_ID="agent-123"

# Check agent container
docker ps --filter "name=cfn-agent-$TEAM-$AGENT_ID"

# Check Redis for heartbeat
docker exec cfn-redis-$TEAM redis-cli GET "team:$TEAM:agent:$AGENT_ID:heartbeat"

# Check TTL
docker exec cfn-redis-$TEAM redis-cli TTL "team:$TEAM:agent:$AGENT_ID:heartbeat"
```

**Resolution:**

1. **If agent still running, restart it**
   ```bash
   docker restart cfn-agent-$TEAM-$AGENT_ID
   ```

2. **If agent is stuck, kill and respawn**
   ```bash
   docker kill cfn-agent-$TEAM-$AGENT_ID
   docker rm cfn-agent-$TEAM-$AGENT_ID
   # Team coordinator should auto-recover
   ```

---

## Skill Access Issues

### Issue 12: Database Read-Only Skill Blocks Legitimate Query

**Symptoms:**
- SELECT query fails with "Write operations not allowed"
- Query contains keywords like "INSERT" in string literals

**Diagnosis:**
```bash
# Check query being executed
# Look in agent logs for actual query

# Test query directly
docker exec cfn-docker-team-coordinator-seo \
  /workspace/seo/skills/database-readonly/query.sh "SELECT * FROM users WHERE action='INSERT'"
```

**Workaround:**
- Query validation uses simple regex that may flag keywords in strings
- Rewrite query to avoid trigger words in string literals
- Example:
  ```sql
  -- Instead of:
  SELECT * FROM logs WHERE action = 'INSERT';

  -- Use:
  SELECT * FROM logs WHERE action = 'IN' || 'SERT';
  ```

**Long-term Fix:**
- Implement SQL parser instead of regex matching
- Add query whitelisting for known-safe patterns

### Issue 13: Database Read-Write Skill Access Denied

**Symptoms:**
- Team with read-write skill can't execute writes
- Permission denied errors
- Authentication failures

**Diagnosis:**
```bash
TEAM="backend"

# Check team's allowed skills
cat docker/config/teams/$TEAM.yaml | grep -A 10 allowed_skills

# Verify read-write skill exists in workspace
ls -la /workspace/$TEAM/skills/database-readwrite/

# Test database credentials
docker exec cfn-postgres psql -U admin_user -d cfn_corporate -c "SELECT 1"
```

**Resolution:**

1. **Verify team has read-write skill**
   ```bash
   # Check team config
   grep "database-readwrite" docker/config/teams/$TEAM.yaml

   # If missing, add to config and reprovision
   ```

2. **Check database user permissions**
   ```sql
   -- Connect to PostgreSQL
   docker exec -it cfn-postgres psql -U postgres -d cfn_corporate

   -- Check admin_user grants
   \du admin_user

   -- Grant if needed
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO admin_user;
   ```

3. **Verify environment variables**
   ```bash
   # Check admin password is set
   docker exec cfn-docker-team-coordinator-$TEAM env | grep DB_PASSWORD
   ```

---

## Database Connection Issues

### Issue 14: PostgreSQL Connection Refused

**Symptoms:**
- "Connection refused" errors
- "Could not connect to server" errors
- Database queries timeout

**Diagnosis:**
```bash
# Check if PostgreSQL is running
docker ps | grep cfn-postgres

# Check PostgreSQL logs
docker logs cfn-postgres --tail 50

# Test connection from coordinator
docker exec cfn-docker-main-coordinator \
  psql -h cfn-postgres -U cfn_user -d cfn_corporate -c "SELECT 1"
```

**Resolution:**

1. **PostgreSQL not running**
   ```bash
   docker start cfn-postgres
   ```

2. **PostgreSQL crashed**
   ```bash
   docker logs cfn-postgres --tail 100
   # Look for crash reasons

   # Restart
   docker restart cfn-postgres
   ```

3. **Wrong credentials**
   ```bash
   # Check environment variables
   docker inspect cfn-docker-main-coordinator | grep POSTGRES

   # Verify against PostgreSQL settings
   docker exec cfn-postgres env | grep POSTGRES
   ```

---

## Health Check Failures

### Issue 15: Container Health Check Failing

**Symptoms:**
- Container marked as "unhealthy"
- Automatic restarts
- Service degradation

**Diagnosis:**
```bash
# Check health status
docker ps --format "table {{.Names}}\t{{.Status}}"

# Check health check logs
docker inspect cfn-docker-main-coordinator | grep -A 20 Health

# Manually run health check
docker exec cfn-docker-main-coordinator /app/entrypoint.sh --health-check
```

**Resolution:**

1. **Health check script failing**
   ```bash
   # Check what health check does
   cat docker/coordinator/main/entrypoint.sh | grep -A 30 "health_check()"

   # Run commands manually
   docker exec cfn-docker-main-coordinator redis-cli -h cfn-redis ping
   docker exec cfn-docker-main-coordinator psql -h cfn-postgres -c "SELECT 1"
   ```

2. **Temporary network issue**
   ```bash
   # Wait 30 seconds for next health check
   # Monitor: docker ps
   ```

3. **Restart if persistently unhealthy**
   ```bash
   docker restart cfn-docker-main-coordinator
   ```

---

## Escalation Procedures

### When to Escalate

**Immediate Escalation (Page On-Call):**
- Main coordinator completely down
- All team coordinators failing
- Data corruption detected
- Security breach suspected
- PostgreSQL data loss

**Escalate Within 1 Hour:**
- Multiple team coordinators failing
- Repeated resource exhaustion
- Persistent health check failures
- Network isolation broken

**Escalate Next Business Day:**
- Single team coordinator issues
- Agent spawn failures
- Skill access issues
- Non-critical performance degradation

### Escalation Contact

**Level 1: Operations Team**
- Email: ops@company.com
- Slack: #cfn-ops
- On-Call: +1-XXX-XXX-XXXX

**Level 2: Infrastructure Team**
- Email: infra@company.com
- Slack: #infra-team
- On-Call: +1-XXX-XXX-XXXX

**Level 3: Engineering Team**
- Email: engineering@company.com
- Slack: #cfn-engineering

### Information to Collect Before Escalating

```bash
# Run this diagnostic script and attach output
cat > /tmp/cfn-diagnostic.sh <<'EOF'
#!/bin/bash
echo "=== CFN Infrastructure Diagnostic Report ==="
echo "Timestamp: $(date)"
echo ""

echo "=== Docker Containers ==="
docker ps --all --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "=== Container Health ==="
docker inspect --format='{{.Name}}: {{.State.Health.Status}}' $(docker ps -q --filter "name=cfn-")
echo ""

echo "=== Resource Usage ==="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
echo ""

echo "=== Networks ==="
docker network ls | grep -E "(cfn-|team-)"
echo ""

echo "=== Recent Logs (Main Coordinator) ==="
docker logs cfn-docker-main-coordinator --tail 20
echo ""

echo "=== Redis Connectivity ==="
docker exec cfn-redis redis-cli ping
echo ""

echo "=== PostgreSQL Connectivity ==="
docker exec cfn-postgres pg_isready
EOF

chmod +x /tmp/cfn-diagnostic.sh
/tmp/cfn-diagnostic.sh > /tmp/cfn-diagnostic-$(date +%Y%m%d-%H%M%S).txt
```

---

## Appendix: Useful Commands

### Quick Status Checks

```bash
# Overall system health
docker ps --format "table {{.Names}}\t{{.Status}}" | grep cfn-

# Resource usage summary
docker stats --no-stream | grep cfn-

# Network connectivity
for net in $(docker network ls --format "{{.Name}}" | grep -E "(cfn-|team-)"); do
  echo "Network: $net"
  docker network inspect $net --format '{{range .Containers}}  {{.Name}}{{end}}'
  echo ""
done

# All coordinator logs
for container in $(docker ps --format "{{.Names}}" | grep coordinator); do
  echo "=== $container ==="
  docker logs $container --tail 5
  echo ""
done
```

### Bulk Operations

```bash
# Restart all team coordinators
docker restart $(docker ps -q --filter "name=cfn-docker-team-coordinator-")

# Stop all agents for a team
TEAM="seo"
docker stop $(docker ps -q --filter "name=cfn-agent-$TEAM-")

# Clean up exited containers
docker rm $(docker ps -aq --filter "status=exited" --filter "name=cfn-")
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-15 | Initial playbook creation |

---

## Feedback

Found an issue not covered here? Please submit a ticket to #cfn-ops or email ops@company.com.
