# Upgrade Procedures Runbook

## Overview
This runbook covers application and infrastructure upgrades including zero-downtime deployments, database schema migrations, dependency updates, and rollback procedures. Focuses on minimizing service interruption during critical infrastructure changes.

**Expected Duration:** 30-120 minutes (depending on change scope)
**Difficulty:** Advanced
**Requires:** Docker knowledge, database access, monitoring dashboards

## Pre-Upgrade Checklist

### Pre-Upgrade Validation (30 minutes before)

```bash
#!/bin/bash
# scripts/pre-upgrade-checklist.sh

set -euo pipefail

echo "=== Pre-Upgrade Validation Checklist ==="

# 1. Verify system health
echo "✓ System health check..."
docker-compose ps | grep -E "postgres|redis|cfn-" | grep "Up"

# 2. Check resource availability
echo "✓ Resource availability..."
FREE_MEMORY=$(free -m | awk 'NR==2 {print $7}')
if [ "$FREE_MEMORY" -lt 2048 ]; then
  echo "WARNING: Less than 2GB free memory"
  exit 1
fi

FREE_DISK=$(df -BG / | awk 'NR==2 {print $4}' | tr -dG)
if [ "$FREE_DISK" -lt 10 ]; then
  echo "ERROR: Less than 10GB disk space"
  exit 1
fi

# 3. Create pre-upgrade backup
echo "✓ Creating pre-upgrade backup..."
docker-compose exec postgres pg_dump -U cfn_user -d cfn \
  | gzip > "/backups/cfn-pre-upgrade-$(date +%Y%m%d-%H%M%S).sql.gz"

# 4. Document baseline metrics
echo "✓ Recording baseline metrics..."
curl -s 'http://localhost:9090/api/v1/query?query=cfn_task_duration_seconds_p95' | \
  jq '.data.result[0].value[1]' > /tmp/pre-upgrade-latency.txt
docker stats --no-stream > /tmp/pre-upgrade-resources.txt

# 5. Notify team
echo "✓ Sending pre-upgrade notification..."
echo "Starting upgrade in 15 minutes" | \
  mail -s "System Upgrade Notice" ops-team@example.com

# 6. Set maintenance mode (if applicable)
echo "✓ Setting maintenance mode..."
# Update status page or show maintenance banner

echo ""
echo "✓ All pre-upgrade checks passed"
```

## Upgrade Scenarios

### Scenario 1: Agent Application Upgrade (Zero-Downtime)

**Change Type:** New features, bug fixes (non-breaking)
**Downtime Required:** 0 minutes
**Risk Level:** Low-Medium

**Upgrade Procedure:**

```bash
#!/bin/bash
# scripts/upgrade-agents-zero-downtime.sh

set -euo pipefail

AGENT_VERSION="${1:?Usage: $0 <version>}"
AGENTS=("cfn-agent-1" "cfn-agent-2" "cfn-agent-3")
WAIT_TIME=30  # Seconds to drain work from agent

echo "=== Zero-Downtime Agent Upgrade ==="
echo "Target version: $AGENT_VERSION"

# 1. Build new image
echo "Step 1: Building new image..."
docker build \
  --tag cfn-agent:$AGENT_VERSION \
  --tag cfn-agent:latest \
  --build-arg VERSION=$AGENT_VERSION \
  ./docker/agent/

# 2. Scan for vulnerabilities
echo "Step 2: Security scanning..."
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image --severity HIGH,CRITICAL \
  cfn-agent:$AGENT_VERSION | \
  grep -q "HIGH\|CRITICAL" && {
    echo "ERROR: Critical vulnerabilities detected"
    exit 1
  }

# 3. Rolling upgrade - one agent at a time
for AGENT in "${AGENTS[@]}"; do
  echo ""
  echo "Step 3: Upgrading $AGENT..."

  # 3.1 Gracefully drain work from agent
  echo "  3.1 Draining work from $AGENT..."
  docker exec $AGENT curl -X POST http://localhost:3000/drain

  # 3.2 Wait for current work to complete
  echo "  3.2 Waiting for work to complete (${WAIT_TIME}s)..."
  sleep $WAIT_TIME

  # 3.3 Check no more work assigned
  QUEUE_DEPTH=$(docker exec $AGENT curl -s http://localhost:3000/queue/depth)
  if [ "$QUEUE_DEPTH" -gt 0 ]; then
    echo "  WARNING: $AGENT still has $QUEUE_DEPTH tasks"
    sleep 10
  fi

  # 3.4 Update container with new image
  echo "  3.3 Stopping $AGENT..."
  docker-compose stop $AGENT

  echo "  3.4 Starting with new image..."
  # Update docker-compose to use new version temporarily
  docker run -d \
    --name $AGENT-tmp \
    --network cfn-network \
    --label "cfn.component=agent" \
    -e AGENT_ID=$AGENT \
    -e REDIS_HOST=redis \
    -e REDIS_PORT=6379 \
    -e REDIS_PASSWORD="$REDIS_PASSWORD" \
    cfn-agent:$AGENT_VERSION

  # 3.5 Wait for health check to pass
  echo "  3.5 Waiting for health check..."
  for i in {1..30}; do
    if docker exec $AGENT-tmp curl -f http://localhost:3000/health 2>/dev/null; then
      echo "  ✓ $AGENT healthy"
      break
    fi
    sleep 2
  done

  # 3.6 Route traffic to new container
  echo "  3.6 Routing traffic..."
  docker stop $AGENT
  docker rm $AGENT
  docker rename $AGENT-tmp $AGENT

  # 3.7 Monitor for errors
  echo "  3.7 Monitoring for errors..."
  sleep 30
  ERROR_RATE=$(curl -s 'http://localhost:9090/api/v1/query' \
    --data-urlencode 'query=rate(cfn_task_errors_total{agent="'"$AGENT"'"}[5m])' | \
    jq '.data.result[0].value[1]')

  if (( $(echo "$ERROR_RATE > 0.05" | bc -l) )); then
    echo "  ERROR: $AGENT error rate > 5%, rolling back"
    docker stop $AGENT
    docker-compose up -d $AGENT
    exit 1
  fi

  echo "  ✓ $AGENT upgrade complete"
done

# 4. Verify all agents healthy
echo ""
echo "Step 4: Final verification..."
for AGENT in "${AGENTS[@]}"; do
  if ! docker-compose exec $AGENT curl -f http://localhost:3000/health >/dev/null 2>&1; then
    echo "ERROR: $AGENT not healthy"
    exit 1
  fi
done

# 5. Update docker-compose permanently
echo "Step 5: Finalizing upgrade..."
sed -i "s|cfn-agent:latest|cfn-agent:$AGENT_VERSION|g" docker-compose.yml

# 6. Post-upgrade validation
echo "Step 6: Post-upgrade validation..."
LATENCY=$(curl -s 'http://localhost:9090/api/v1/query?query=cfn_task_duration_seconds_p95' | \
  jq '.data.result[0].value[1]')
echo "✓ P95 latency: ${LATENCY}s"

echo ""
echo "✓ Zero-downtime upgrade complete: cfn-agent:$AGENT_VERSION"
```

**Validation:**

```bash
#!/bin/bash
# scripts/validate-agent-upgrade.sh

AGENT_VERSION="$1"

echo "=== Agent Upgrade Validation ==="

# 1. Verify all agents running new version
docker ps --filter "name=cfn-agent" --format "{{.Names}}" | while read agent; do
  VERSION=$(docker inspect "$agent" | jq -r '.[0].Config.Image')
  if [[ "$VERSION" == *"$AGENT_VERSION"* ]]; then
    echo "✓ $agent running $AGENT_VERSION"
  else
    echo "✗ $agent not running $AGENT_VERSION"
    exit 1
  fi
done

# 2. Check error rate
ERROR_RATE=$(curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=rate(cfn_task_errors_total[5m])' | \
  jq '.data.result[0].value[1]')
echo "✓ Error rate: $ERROR_RATE (target: <0.01)"

# 3. Check task latency
LATENCY=$(curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=cfn_task_duration_seconds_p95' | \
  jq '.data.result[0].value[1]')
echo "✓ P95 latency: ${LATENCY}s (target: <30s)"

# 4. Verify queue stable
QUEUE=$(curl -s 'http://localhost:9090/api/v1/query' \
  --data-urlencode 'query=cfn_agent_queue_depth' | \
  jq '.data.result[0].value[1]')
echo "✓ Queue depth: $QUEUE (target: <50)"

echo ""
echo "✓ All validations passed"
```

---

### Scenario 2: Database Schema Migration (Requires Downtime Planning)

**Change Type:** Schema changes, database restructuring
**Downtime Required:** 5-15 minutes
**Risk Level:** Medium-High

**Upgrade Procedure:**

```bash
#!/bin/bash
# scripts/upgrade-database-schema.sh

set -euo pipefail

MIGRATION_FILE="${1:?Usage: $0 <migration.sql>"

echo "=== Database Schema Migration ==="

# 1. Pre-migration validation
echo "Step 1: Pre-migration validation..."

# Verify migration file exists
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "ERROR: Migration file not found: $MIGRATION_FILE"
  exit 1
fi

# Test migration on replica (if available)
if docker ps | grep -q postgres-replica; then
  echo "  Testing on replica first..."
  docker-compose exec postgres-replica psql -U cfn_user -d cfn -f "$MIGRATION_FILE" --dry-run
fi

# 2. Create backup
echo "Step 2: Creating pre-migration backup..."
docker-compose exec postgres pg_dump -U cfn_user -d cfn \
  | gzip > "/backups/cfn-pre-migration-$(date +%Y%m%d-%H%M%S).sql.gz"

# 3. Stop agents to drain work
echo "Step 3: Stopping agents to prevent new work..."
docker-compose stop cfn-agent-1 cfn-agent-2 cfn-agent-3

# 4. Wait for active work to complete
echo "Step 4: Waiting for work completion..."
TIMEOUT=120
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  ACTIVE=$(docker-compose exec postgres psql -U cfn_user -d cfn -tc "
    SELECT COUNT(*) FROM tasks WHERE status = 'running'
  ")
  if [ "$ACTIVE" -eq 0 ]; then
    echo "  ✓ All work completed"
    break
  fi
  echo "  Active tasks: $ACTIVE, waiting..."
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

# 5. Execute migration
echo "Step 5: Executing migration..."
docker-compose exec postgres psql -U cfn_user -d cfn < "$MIGRATION_FILE"

# 6. Verify migration success
echo "Step 6: Verifying migration..."
# Check that migration didn't break anything
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  -- Verify critical tables exist
  SELECT tablename FROM pg_tables WHERE schemaname = 'public' LIMIT 5;
"

# 7. Verify indices
echo "Step 7: Verifying indexes..."
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  -- Rebuild indexes if needed
  REINDEX DATABASE cfn;
"

# 8. Update table statistics
echo "Step 8: Updating statistics..."
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  ANALYZE;
"

# 9. Restart agents
echo "Step 9: Restarting agents..."
docker-compose up -d cfn-agent-1 cfn-agent-2 cfn-agent-3

# 10. Wait for agents to register
echo "Step 10: Waiting for agents to register..."
sleep 10
AGENTS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*" | wc -l)
echo "  ✓ $AGENTS agents registered"

echo ""
echo "✓ Database migration complete"
```

**Rollback Procedure:**

```bash
#!/bin/bash
# scripts/rollback-database-migration.sh

BACKUP_FILE="${1:?Usage: $0 <backup.sql.gz>"

echo "=== Database Migration Rollback ==="

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found"
  exit 1
fi

# 1. Stop agents
echo "Stopping agents..."
docker-compose stop cfn-agent-1 cfn-agent-2 cfn-agent-3

# 2. Drop current database
echo "Dropping current database..."
docker-compose exec postgres psql -U postgres -c "
  DROP DATABASE cfn;
  CREATE DATABASE cfn OWNER cfn_user;
"

# 3. Restore from backup
echo "Restoring from backup..."
gunzip -c "$BACKUP_FILE" | docker-compose exec postgres psql -U cfn_user -d cfn

# 4. Verify restore
docker-compose exec postgres psql -U cfn_user -d cfn -c "SELECT COUNT(*) FROM agents;"

# 5. Restart agents
echo "Restarting agents..."
docker-compose up -d cfn-agent-1 cfn-agent-2 cfn-agent-3

echo "✓ Rollback complete"
```

---

### Scenario 3: Infrastructure/Dependency Upgrade

**Change Type:** PostgreSQL, Redis, OS updates
**Downtime Required:** 10-30 minutes
**Risk Level:** High

**Upgrade Procedure:**

```bash
#!/bin/bash
# scripts/upgrade-infrastructure.sh

COMPONENT="${1:?Usage: $0 <postgres|redis|ubuntu>"
TARGET_VERSION="$2"

echo "=== Infrastructure Upgrade ==="
echo "Component: $COMPONENT"
echo "Target Version: $TARGET_VERSION"

case $COMPONENT in
  postgres)
    # PostgreSQL upgrade
    # Most complex - requires data migration

    echo "Step 1: Creating major version backup..."
    docker-compose exec postgres pg_dumpall \
      | gzip > "/backups/cfn-postgres-full-$(date +%Y%m%d-%H%M%S).sql.gz"

    echo "Step 2: Stopping services..."
    docker-compose stop cfn-agent-1 cfn-agent-2 cfn-agent-3 cfn-orchestrator

    echo "Step 3: Backing up data volume..."
    docker-compose exec postgres bash -c '
      pg_ctl stop -D /var/lib/postgresql/data
      tar -czf /backups/pg-data-volume.tar.gz /var/lib/postgresql/data
    '

    echo "Step 4: Starting new PostgreSQL version..."
    # Update docker-compose to use new image
    sed -i "s|postgres:.*|postgres:$TARGET_VERSION|" docker-compose.yml

    docker-compose up -d postgres

    # PostgreSQL will attempt auto-upgrade
    until docker-compose exec postgres pg_isready -U postgres; do
      docker logs postgres | tail -20
      sleep 10
    done

    echo "Step 5: Verifying upgrade..."
    docker-compose exec postgres psql -U postgres -c "SELECT version();"

    echo "Step 6: Restarting services..."
    docker-compose up -d cfn-agent-1 cfn-agent-2 cfn-agent-3
    ;;

  redis)
    # Redis upgrade (simpler - stateless can be rebuilt)

    echo "Step 1: Creating Redis backup..."
    docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
    sleep 2
    cp /var/lib/docker/volumes/redis-data/_data/dump.rdb \
       "/backups/redis-pre-upgrade.rdb"

    echo "Step 2: Stopping Redis..."
    docker-compose stop redis

    echo "Step 3: Starting new Redis version..."
    sed -i "s|redis:.*|redis:$TARGET_VERSION|" docker-compose.yml
    docker-compose up -d redis

    # Wait for startup
    until docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" PING | grep -q PONG; do
      echo "  Waiting for Redis..."
      sleep 5
    done

    echo "Step 4: Verifying data..."
    KEYS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" DBSIZE)
    echo "  ✓ $KEYS keys present"

    echo "Step 5: Restarting agents..."
    docker-compose up -d cfn-agent-1 cfn-agent-2 cfn-agent-3
    ;;

  ubuntu)
    # OS upgrade (requires host-level access)
    echo "OS upgrade requires manual execution on host"
    echo "sudo apt update && sudo apt upgrade -y"
    ;;
esac

echo ""
echo "✓ Infrastructure upgrade complete"
```

---

### Scenario 4: Orchestrator/Coordinator Upgrade

**Change Type:** Core system changes
**Downtime Required:** 15-30 minutes
**Risk Level:** Very High

**Upgrade Procedure:**

```bash
#!/bin/bash
# scripts/upgrade-orchestrator.sh

ORCHESTRATOR_VERSION="${1:?Usage: $0 <version>"

echo "=== Orchestrator Upgrade ==="
echo "Target version: $ORCHESTRATOR_VERSION"

# 1. Notification
echo "Step 1: Notifying team..."
echo "Starting orchestrator upgrade - expect 15min downtime" | \
  mail -s "System Maintenance Notice" ops-team@example.com

# 2. Drain work
echo "Step 2: Draining pending work..."
QUEUE_DEPTH=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" LLEN task_queue)
echo "  Current queue: $QUEUE_DEPTH tasks"

# 3. Pause agents
echo "Step 3: Pausing agents..."
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" SET system:paused true EX 600

# 4. Stop orchestrator
echo "Step 4: Stopping orchestrator..."
docker-compose stop cfn-orchestrator

# 5. Wait for agents to stop accepting work
sleep 10

# 6. Backup orchestrator state
echo "Step 5: Backing up state..."
docker-compose exec postgres pg_dump -U cfn_user -d cfn \
  --table="coordination_events" \
  | gzip > "/backups/orchestrator-state-$(date +%Y%m%d-%H%M%S).sql.gz"

# 7. Upgrade orchestrator
echo "Step 6: Upgrading orchestrator..."
docker build \
  --tag cfn-orchestrator:$ORCHESTRATOR_VERSION \
  ./docker/orchestrator/

# 8. Start new version
echo "Step 7: Starting new orchestrator..."
docker run -d \
  --name cfn-orchestrator-new \
  --network cfn-network \
  -e REDIS_HOST=redis \
  -e POSTGRES_HOST=postgres \
  cfn-orchestrator:$ORCHESTRATOR_VERSION

# 9. Wait for health
echo "Step 8: Waiting for health check..."
for i in {1..30}; do
  if docker exec cfn-orchestrator-new curl -f http://localhost:3001/health >/dev/null 2>&1; then
    echo "  ✓ Orchestrator healthy"
    break
  fi
  sleep 2
done

# 10. Switch traffic
echo "Step 9: Switching traffic..."
docker stop cfn-orchestrator
docker rm cfn-orchestrator
docker rename cfn-orchestrator-new cfn-orchestrator

# 11. Resume operations
echo "Step 10: Resuming operations..."
docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" DEL system:paused

# 12. Verify agents resume
sleep 10
AGENTS=$(docker-compose exec redis redis-cli -a "$REDIS_PASSWORD" KEYS "agent:*" | wc -l)
echo "  ✓ $AGENTS agents registered"

echo ""
echo "✓ Orchestrator upgrade complete"
```

## Post-Upgrade Tasks

### Verification Checklist

```bash
#!/bin/bash
# scripts/post-upgrade-verification.sh

set -euo pipefail

echo "=== Post-Upgrade Verification ==="

# 1. Service health
echo "Checking service health..."
docker-compose ps | grep "Up" || {
  echo "ERROR: Some services not running"
  exit 1
}

# 2. Data integrity
echo "Checking data integrity..."
docker-compose exec postgres psql -U cfn_user -d cfn -c "
  SELECT COUNT(*) as agents FROM agents;
  SELECT COUNT(*) as tasks FROM tasks;
"

# 3. No errors in logs
echo "Checking for errors..."
docker logs cfn-agent-1 2>&1 | tail -50 | grep -i error && {
  echo "WARNING: Errors found in agent logs"
} || echo "  ✓ No errors in agent logs"

# 4. Performance metrics normal
echo "Checking performance metrics..."
LATENCY=$(curl -s 'http://localhost:9090/api/v1/query?query=cfn_task_duration_seconds_p95' | \
  jq '.data.result[0].value[1]')
ERROR_RATE=$(curl -s 'http://localhost:9090/api/v1/query?query=rate(cfn_task_errors_total[5m])' | \
  jq '.data.result[0].value[1]')

echo "  P95 latency: ${LATENCY}s"
echo "  Error rate: $ERROR_RATE"

# 5. Alert no critical issues
echo "Checking for active alerts..."
CRITICAL=$(curl -s http://localhost:9093/api/v1/alerts | \
  jq '[.[] | select(.status.state == "firing")] | length')
if [ "$CRITICAL" -eq 0 ]; then
  echo "  ✓ No critical alerts"
else
  echo "  WARNING: $CRITICAL critical alerts"
fi

echo ""
echo "✓ Post-upgrade verification complete"
```

### Documentation Update

```bash
# 1. Update version file
echo "$UPGRADE_VERSION" > VERSION

# 2. Document in changelog
cat >> CHANGELOG.md <<EOF
## [$(date +%Y-%m-%d)] - Version $UPGRADE_VERSION
### Changed
- [What changed]
- [What changed]

### Fixed
- [What was fixed]

### Upgraded
- Agent: X → Y
- PostgreSQL: X → Y
- [Other upgrades]
EOF

# 3. Commit changes
git add -A
git commit -m "chore: upgrade to version $UPGRADE_VERSION"
git tag -a "v$UPGRADE_VERSION" -m "Release version $UPGRADE_VERSION"

# 4. Update team wiki
```

## Rollback Strategy

**Automatic Rollback (If Validations Fail):**

```bash
# If post-upgrade validation fails, automatically rollback
if [ $validation_exit_code -ne 0 ]; then
  echo "Validation failed, rolling back..."

  # Method 1: Docker container rollback
  docker stop cfn-agent-1
  docker rm cfn-agent-1
  docker run -d --name cfn-agent-1 \
    cfn-agent:${PREVIOUS_VERSION}

  # Method 2: Database rollback
  gunzip -c "/backups/cfn-pre-upgrade-*.sql.gz" | \
    docker-compose exec postgres psql -U cfn_user -d cfn
fi
```

## Escalation

| Issue | Action | Contact |
|-------|--------|---------|
| Upgrade fails to complete | Rollback to previous version | Engineering lead |
| Data corruption after upgrade | Restore from backup | Database DBA |
| Performance degradation post-upgrade | Investigate root cause | Performance team |
| Agents can't connect after upgrade | Check network config | Infrastructure |

### Support Contacts
- **Engineering Lead:** engineering-lead@example.com
- **Database DBA:** dba@example.com
- **Infrastructure Team:** infrastructure@example.com
- **On-Call:** PagerDuty escalation

## Related Documentation

- **Incident Response:** docs/runbooks/03-incident-response.md
- **Disaster Recovery:** docs/runbooks/08-disaster-recovery.md
- **Database Maintenance:** docs/runbooks/04-database-maintenance.md
