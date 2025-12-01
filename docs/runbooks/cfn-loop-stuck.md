# CFN Loop Stuck Runbook

## Alert Information
- **Alert Name:** `CFNLoopStuck`
- **Severity:** P1
- **Notification:** PagerDuty + Slack #cfn-alerts
- **Threshold:** Task running >1 hour without progress

## Symptoms
- CFN Loop not progressing through phases
- Agents spawned but not completing
- Coordination signals not delivered
- Task stuck in same status for >30 minutes
- No new agent activity despite pending work
- Redis coordination queue backing up

**Grafana Dashboards:**
- Agent Performance Dashboard → CFN Loop Status panel
- Team Activity Dashboard → Task Progress panel

**Common Error Messages:**
```
WARNING: Task [id] in phase 'loop3' for 45 minutes (no progress)
ERROR: Coordination signal timeout for task [id]
ERROR: Gate check blocked - no test results received
WARNING: Product Owner decision timeout after 30 minutes
ERROR: Agent [id] stuck - no output for 20 minutes
```

## Diagnosis

### 1. Check Task Status
```bash
# Query task status from PostgreSQL
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT
    task_id,
    status,
    current_phase,
    EXTRACT(EPOCH FROM (NOW() - updated_at)) / 60 as minutes_since_update
  FROM tasks
  WHERE status NOT IN ('completed', 'failed')
    AND updated_at < NOW() - INTERVAL '30 minutes'
  ORDER BY updated_at ASC;
"

# Check Redis coordination queue
redis-cli LLEN "task:queue"
redis-cli LRANGE "task:queue" 0 10

# Check for stuck coordination signals
redis-cli KEYS "swarm:*:*"
```

### 2. Identify Stuck Phase
```bash
# Determine which CFN Loop phase is stuck
TASK_ID="task-abc123"  # Replace with actual task ID

# Check current phase
redis-cli GET "task:${TASK_ID}:phase"
# Expected: loop3 / loop2 / product-owner

# Check waiting agents
redis-cli SMEMBERS "task:${TASK_ID}:waiting"

# Check completed agents
redis-cli SMEMBERS "task:${TASK_ID}:completed"

# Check gate status (if stuck in Loop 3)
redis-cli GET "task:${TASK_ID}:gate:passed"
# Expected: true (if gate passed)
```

### 3. Check Agent Status
```bash
# List agents for stuck task
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT
    id,
    agent_type,
    status,
    EXTRACT(EPOCH FROM (NOW() - spawned_at)) / 60 as runtime_minutes
  FROM agents
  WHERE task_id = '$TASK_ID'
  ORDER BY spawned_at DESC;
"

# Check if agents are still running (containers)
docker ps --filter "label=cfn.task.id=$TASK_ID"

# Check agent logs for errors
docker ps --filter "label=cfn.task.id=$TASK_ID" -q | while read container; do
  echo "=== Container: $container ==="
  docker logs "$container" --tail 50 2>&1 | grep -i "error\|timeout\|stuck"
done
```

### 4. Check Orchestrator Status
```bash
# Check coordinator/orchestrator containers
docker ps | grep -E "cfn-coordinator|cfn-orchestrator"

# Check orchestrator logs
docker logs cfn-orchestrator --tail 100 2>&1 | grep "$TASK_ID"

# Look for orchestration errors
docker logs cfn-orchestrator 2>&1 | grep -i "error\|timeout\|stuck\|deadlock"

# Check if orchestrator is responsive
redis-cli PING
# Expected: PONG
```

### 5. Identify Root Cause

**Common root causes:**
- Agent crashed/exited without signaling completion
- Coordination signal lost (Redis connection issue)
- Gate check waiting for test results that never arrived
- Product Owner decision timeout (no decision made)
- Orchestrator deadlock (waiting for signal that won't come)
- Redis key TTL expired prematurely
- Agent stuck in infinite loop (not exiting)

## Resolution

### Immediate Actions (P1 - 15 minute response)

**Action 1: Resend Coordination Signal**
```bash
TASK_ID="task-abc123"  # Replace with actual task ID

# Check which signal is missing
PHASE=$(redis-cli GET "task:${TASK_ID}:phase")

case $PHASE in
  loop3)
    # If Loop 3 stuck, check if all agents completed
    WAITING=$(redis-cli SCARD "task:${TASK_ID}:waiting")

    if [ "$WAITING" -eq 0 ]; then
      # All agents done, trigger gate check manually
      redis-cli RPUSH "swarm:${TASK_ID}:gate-check" "manual-trigger"
      echo "Triggered gate check for $TASK_ID"
    else
      echo "Still waiting for $WAITING agents in Loop 3"
    fi
    ;;

  loop2)
    # If Loop 2 stuck, check if gate passed
    GATE_PASSED=$(redis-cli GET "task:${TASK_ID}:gate:passed")

    if [ "$GATE_PASSED" == "true" ]; then
      # Gate passed, wake Loop 2 validators
      redis-cli RPUSH "swarm:${TASK_ID}:gate-passed" "manual-trigger"
      echo "Triggered Loop 2 wake for $TASK_ID"
    else
      echo "Gate not passed - Loop 3 needs to iterate"
    fi
    ;;

  product-owner)
    # If Product Owner stuck, trigger decision collection
    redis-cli RPUSH "swarm:${TASK_ID}:decision" "COLLECT"
    echo "Triggered decision collection for $TASK_ID"
    ;;
esac
```

**Action 2: Kill Stuck Agents**
```bash
# Find agents running >45 minutes for this task
docker exec cfn-postgres psql -U cfn_user -d cfn -t -c "
  SELECT id FROM agents
  WHERE task_id = '$TASK_ID'
    AND status = 'running'
    AND spawned_at < NOW() - INTERVAL '45 minutes';
" | while read agent_id; do
  echo "Killing stuck agent: $agent_id"

  container=$(docker ps --filter "label=cfn.agent.id=$agent_id" -q)

  if [ -n "$container" ]; then
    docker stop "$container"

    # Mark as failed in database
    docker exec cfn-postgres psql -U cfn_user -d cfn -c "
      UPDATE agents SET status = 'failed', completed_at = NOW()
      WHERE id = '$agent_id';
    "

    # Remove from waiting set
    redis-cli SREM "task:${TASK_ID}:waiting" "$agent_id"
  fi
done
```

**Action 3: Restart Orchestrator (if deadlocked)**
```bash
# Only if orchestrator is unresponsive
docker restart cfn-orchestrator

# Wait for restart
sleep 10

# Check if orchestrator resumed processing
docker logs cfn-orchestrator --tail 20 2>&1 | grep "Orchestrator.*started"

# Trigger task resumption
redis-cli RPUSH "task:queue" "$TASK_ID"
echo "Re-queued task $TASK_ID after orchestrator restart"
```

### Complete Fix

**Step 1: Diagnose Stuck Phase**
```bash
# Generate detailed task status report
cat > /tmp/task-status.sh <<'EOF'
#!/bin/bash
TASK_ID="$1"

echo "=== Task Status Report: $TASK_ID ==="
echo

echo "Phase: $(redis-cli GET task:${TASK_ID}:phase)"
echo "Gate Passed: $(redis-cli GET task:${TASK_ID}:gate:passed)"
echo "Iteration: $(redis-cli GET task:${TASK_ID}:iteration)"
echo

echo "=== Waiting Agents ==="
redis-cli SMEMBERS "task:${TASK_ID}:waiting"
echo

echo "=== Completed Agents ==="
redis-cli SMEMBERS "task:${TASK_ID}:completed"
echo

echo "=== Agent Details ==="
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT id, agent_type, status, confidence,
         EXTRACT(EPOCH FROM (NOW() - spawned_at)) / 60 as runtime_min
  FROM agents WHERE task_id = '$TASK_ID';
"
echo

echo "=== Running Containers ==="
docker ps --filter "label=cfn.task.id=$TASK_ID" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}"
EOF

chmod +x /tmp/task-status.sh
/tmp/task-status.sh "$TASK_ID"
```

**Step 2: Fix Gate Check Issues**
```bash
# If stuck waiting for test results
TASK_ID="task-abc123"

# Check if test results exist
redis-cli HGETALL "task:${TASK_ID}:test-results"

# If no results, check agent output
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT id, agent_type, metadata
  FROM agents
  WHERE task_id = '$TASK_ID'
    AND agent_type IN ('tester', 'validator')
  ORDER BY spawned_at DESC
  LIMIT 5;
"

# If tests never ran, trigger manual test execution
# (See: .claude/skills/cfn-loop-orchestration/orchestrate.sh)
```

**Step 3: Fix Product Owner Decision Timeout**
```bash
# If Product Owner never made decision
TASK_ID="task-abc123"

# Check if Product Owner agent completed
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT id, status, metadata
  FROM agents
  WHERE task_id = '$TASK_ID'
    AND agent_type = 'product-owner'
  ORDER BY spawned_at DESC
  LIMIT 1;
"

# If completed but decision not extracted, manually parse
AGENT_ID=$(docker exec cfn-postgres psql -U cfn_user -d cfn -t -c "
  SELECT id FROM agents
  WHERE task_id = '$TASK_ID' AND agent_type = 'product-owner'
  ORDER BY spawned_at DESC LIMIT 1;
" | tr -d ' ')

# Extract decision from logs
container=$(docker ps -a --filter "label=cfn.agent.id=$AGENT_ID" -q)
if [ -n "$container" ]; then
  decision=$(docker logs "$container" 2>&1 | grep -oE "PROCEED|ITERATE|ABORT" | head -1)

  if [ -n "$decision" ]; then
    redis-cli SET "task:${TASK_ID}:decision" "$decision"
    redis-cli RPUSH "swarm:${TASK_ID}:decision" "$decision"
    echo "Manually set decision: $decision"
  fi
fi
```

**Step 4: Implement Timeout Protection**
```bash
# Add timeout monitoring to orchestrator
# (See: .claude/skills/cfn-loop-orchestration/orchestrate.sh)

# Add agent timeout enforcement
vi /mnt/wsl/.../trigger-dev/config/cfn-loop.json

# Set timeouts:
{
  "agent_timeout_minutes": 45,
  "phase_timeout_minutes": 60,
  "gate_check_timeout_minutes": 10,
  "decision_timeout_minutes": 15
}

# Restart coordinator
docker restart cfn-coordinator
```

## Verification Checklist
- [ ] Alert cleared (task progressing)
- [ ] Task moved to next phase
- [ ] No agents stuck >45 minutes
- [ ] Coordination signals flowing
- [ ] Gate checks completing within 10 minutes
- [ ] Product Owner decisions within 15 minutes
- [ ] Orchestrator logs show normal operation
- [ ] Redis coordination queue empty
- [ ] Grafana metrics show progress
- [ ] No new stuck tasks

## Prevention

### Configuration Changes
1. **Agent timeout:** Kill agents after 45 minutes
2. **Phase timeout:** Abort phase after 60 minutes
3. **Gate check timeout:** Fail gate after 10 minutes
4. **Decision timeout:** Default to ITERATE after 15 minutes
5. **Orchestrator health check:** Monitor orchestrator liveness

### Monitoring Improvements
1. **Add alert:** Task in same phase >30 minutes
2. **Add alert:** Agent runtime >30 minutes
3. **Add alert:** Gate check timeout (>10 minutes)
4. **Add dashboard:** CFN Loop phase progression timeline
5. **Add metric:** Time spent in each phase (P50, P95, P99)

### Process Changes
1. **Automatic recovery:** Orchestrator self-healing for deadlocks
2. **Manual intervention:** Runbook for force-advancing stuck tasks
3. **Timeout policies:** Document when to abort vs iterate
4. **Post-mortem:** Review all stuck tasks weekly
5. **Chaos testing:** Monthly test of recovery procedures

## Post-Incident

### Required Actions
1. Create post-incident review within 24 hours
2. Update this runbook with specific stuck phase details
3. Implement timeout protections within 1 week
4. Test recovery procedures in staging
5. Review orchestrator reliability

### Post-Incident Review Template
```markdown
# PIR: CFN Loop Stuck - [DATE]

## Timeline
- [TIME]: Alert fired (task stuck >1 hour)
- [TIME]: On-call notified
- [TIME]: Root cause identified
- [TIME]: Stuck phase: [loop3/loop2/product-owner]
- [TIME]: Recovery action taken
- [TIME]: Task resumed/aborted
- [TIME]: Alert cleared

## Root Cause
[Agent crash / signal loss / gate timeout / decision timeout / orchestrator deadlock]

## Impact
- **Duration:** [X hours stuck]
- **Affected task:** [task ID]
- **Stuck phase:** [phase name]
- **User impact:** Task blocked, no progress

## Resolution
[Resent signal / killed agents / restarted orchestrator / manual trigger]

## Lessons Learned
- No timeout enforcement
- Coordination signals not resilient
- Orchestrator lacks self-healing
- Manual intervention required

## Action Items
1. Implement phase timeouts - Owner: Platform - Due: [date]
2. Add orchestrator health check - Owner: DevOps - Due: [date]
3. Improve coordination resilience - Owner: Platform - Due: [date]
4. Add automatic recovery - Owner: DevOps - Due: [date]
5. Test recovery procedures - Owner: SRE - Due: [date]
```

## Related Alerts
- `HighAgentSpawnFailureRate` → [agent-spawn-failure.md](agent-spawn-failure.md)
- `RedisConnectionLoss` → [redis-connection-loss.md](redis-connection-loss.md)
- `HighCostPerTeam` → [high-cost-per-team.md](high-cost-per-team.md)

## References
- **Grafana:** http://localhost:3000/d/agent-performance
- **Prometheus:** http://localhost:9090/alerts
- **Docs:** [MONITORING_GUIDE.md](/mnt/wsl/.../docs/MONITORING_GUIDE.md)
- **Orchestrator:** [.claude/skills/cfn-loop-orchestration/orchestrate.sh](/mnt/wsl/.../.claude/skills/cfn-loop-orchestration/orchestrate.sh)
- **Coordination:** [.claude/skills/cfn-coordination/SKILL.md](/mnt/wsl/.../.claude/skills/cfn-coordination/SKILL.md)

---
**Last Updated:** 2025-11-24
**Version:** 1.0
**Maintainer:** Platform Team
