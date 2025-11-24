# High Cost Per Team Runbook

## Alert Information
- **Alert Name:** `HighCostPerTeam`
- **Severity:** P2
- **Notification:** Slack #cfn-alerts + #finance
- **Threshold:** >$10/hour per team over 1 hour

## Symptoms
- Cost metrics spiking for specific team
- Excessive agent spawns or long-running agents
- High-cost model usage (Anthropic vs Z.ai)
- Runaway loops or stuck workflows
- Inefficient task distribution
- Grafana cost dashboard showing red zones

**Grafana Dashboards:**
- Cost Allocation Dashboard → Team Cost panel
- Team Activity Dashboard → Agent Utilization panel

**Common Error Messages:**
```
WARNING: Team [name] cost rate $12.50/hour (threshold: $10/hour)
WARNING: Agent [id] running for 45 minutes (expected: <15 minutes)
INFO: Model switched to Anthropic (cost: 30x Z.ai baseline)
```

## Diagnosis

### 1. Check Current Cost Metrics
```bash
# Query Prometheus for team costs
curl -s 'http://localhost:9090/api/v1/query?query=rate(cost_per_team_dollars[1h])' | \
  jq '.data.result[] | select(.value[1] | tonumber > 10)'

# View in Grafana
# Navigate to: http://localhost:3000/d/cost-allocation
# Panel: Cost by Team (Last Hour)

# Check cost allocation script output
/mnt/wsl/.../scripts/cost-allocation-tracker.sh --report
```

### 2. Identify High-Cost Teams
```bash
# Get team cost breakdown from PostgreSQL
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT
    team,
    COUNT(*) as agent_count,
    AVG(duration_seconds) as avg_duration_sec,
    SUM(cost_usd) as total_cost_usd,
    SUM(cost_usd) / EXTRACT(EPOCH FROM (MAX(completed_at) - MIN(spawned_at))) * 3600 as cost_per_hour
  FROM agents
  WHERE spawned_at > NOW() - INTERVAL '1 hour'
  GROUP BY team
  HAVING SUM(cost_usd) / EXTRACT(EPOCH FROM (MAX(completed_at) - MIN(spawned_at))) * 3600 > 10
  ORDER BY cost_per_hour DESC;
"
```

### 3. Analyze Agent Activity
```bash
# Check for long-running agents
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT
    id,
    agent_type,
    team,
    provider,
    model,
    EXTRACT(EPOCH FROM (NOW() - spawned_at)) / 60 as runtime_minutes,
    cost_usd
  FROM agents
  WHERE status = 'running'
    AND spawned_at < NOW() - INTERVAL '30 minutes'
  ORDER BY spawned_at ASC;
"

# Check for high spawn rates
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT
    team,
    COUNT(*) as spawns_last_hour,
    COUNT(*) / 60.0 as spawns_per_minute
  FROM agents
  WHERE spawned_at > NOW() - INTERVAL '1 hour'
  GROUP BY team
  ORDER BY spawns_last_hour DESC;
"
```

### 4. Check Model Usage
```bash
# Identify expensive model usage
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  SELECT
    team,
    provider,
    model,
    COUNT(*) as usage_count,
    SUM(cost_usd) as total_cost
  FROM agents
  WHERE spawned_at > NOW() - INTERVAL '1 hour'
  GROUP BY team, provider, model
  ORDER BY total_cost DESC;
"

# Expected: Most usage on Z.ai (glm-4.6), not Anthropic
# If high Anthropic usage, investigate why expensive model chosen
```

### 5. Identify Root Cause

**Common root causes:**
- Runaway CFN Loop (iteration >10 without convergence)
- Agent stuck in infinite loop (not exiting properly)
- High-cost model selected unnecessarily (Anthropic vs Z.ai)
- Inefficient task requiring excessive agents
- Memory leak causing agent to run indefinitely
- Coordination deadlock preventing agent completion
- Excessive validator spawns in Loop 2

## Resolution

### Immediate Actions (P2 - 30 minute response)

**Action 1: Kill Long-Running Agents**
```bash
# Identify agents running >45 minutes
LONG_RUNNING=$(docker exec cfn-postgres psql -U cfn_user -d cfn -t -c "
  SELECT id FROM agents
  WHERE status = 'running'
    AND spawned_at < NOW() - INTERVAL '45 minutes';
")

# Kill each long-running agent
for agent_id in $LONG_RUNNING; do
  echo "Killing agent: $agent_id"

  # Find container by agent ID
  container=$(docker ps --filter "label=cfn.agent.id=$agent_id" -q)

  if [ -n "$container" ]; then
    docker stop "$container"

    # Update database status
    docker exec cfn-postgres psql -U cfn_user -d cfn -c "
      UPDATE agents SET status = 'killed', completed_at = NOW()
      WHERE id = '$agent_id';
    "
  fi
done
```

**Action 2: Pause High-Cost Team Workflows**
```bash
# Identify team exceeding cost threshold
TEAM=$(curl -s 'http://localhost:9090/api/v1/query?query=rate(cost_per_team_dollars[1h])' | \
  jq -r '.data.result[] | select(.value[1] | tonumber > 10) | .metric.team' | head -1)

echo "Pausing workflows for team: $TEAM"

# Stop all active agents for this team
docker ps --filter "label=cfn.team=$TEAM" -q | xargs -r docker stop

# Add team to blocked list (temporary)
redis-cli SADD "blocked:teams" "$TEAM"
redis-cli EXPIRE "blocked:teams" 3600  # 1 hour block

echo "Team $TEAM workflows paused. Review before unblocking."
```

**Action 3: Switch to Cost-Optimized Models**
```bash
# Force all new spawns to use Z.ai (cost-optimized)
redis-cli SET "default:provider" "zai"
redis-cli SET "default:model" "glm-4.6"

# Expire override after 1 hour (allow manual review)
redis-cli EXPIRE "default:provider" 3600
redis-cli EXPIRE "default:model" 3600

echo "Switched to Z.ai (glm-4.6) for cost optimization"
```

### Complete Fix

**Step 1: Analyze Cost Root Cause**
```bash
# Generate detailed cost report
/mnt/wsl/.../scripts/cost-allocation-tracker.sh --report --team "$TEAM" --hours 2

# Review report for patterns:
# - Runaway loops (high iteration count)
# - Stuck agents (long runtime)
# - Expensive models (Anthropic usage)
# - High spawn rate (>10/min)
```

**Step 2: Fix Runaway Loops**
```bash
# If CFN Loop not converging, add iteration limit
# Edit coordinator configuration
vi /mnt/wsl/.../trigger-dev/config/cfn-loop.json

# Set iteration limit:
{
  "max_iterations": 10,
  "iteration_timeout_minutes": 30,
  "abort_on_timeout": true
}

# Restart coordinator
docker restart cfn-coordinator
```

**Step 3: Implement Cost Controls**
```bash
# Add team-specific cost limits to configuration
docker exec cfn-postgres psql -U cfn_user -d cfn -c "
  CREATE TABLE IF NOT EXISTS team_cost_limits (
    team VARCHAR(100) PRIMARY KEY,
    hourly_limit_usd DECIMAL(10,2),
    daily_limit_usd DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW()
  );

  INSERT INTO team_cost_limits (team, hourly_limit_usd, daily_limit_usd)
  VALUES ('$TEAM', 10.00, 200.00)
  ON CONFLICT (team) DO UPDATE SET hourly_limit_usd = 10.00, daily_limit_usd = 200.00;
"

# Add enforcement logic to spawning system
# (See: src/cli/agent-spawner.ts - cost check before spawn)
```

**Step 4: Optimize Model Selection**
```bash
# Review agent profiles for model configuration
cd /mnt/wsl/.../.claude/agents/cfn-dev-team/

# Check for hardcoded Anthropic usage
grep -r "provider.*anthropic" .
grep -r "model.*claude" .

# Update agent profiles to use Z.ai by default
for agent in *.md; do
  # Replace Anthropic with Z.ai if no specific need
  sed -i 's/provider: anthropic/provider: zai/' "$agent"
  sed -i 's/model: claude-sonnet-4-5/model: glm-4.6/' "$agent"
done

# Verify changes
git diff .
```

**Step 5: Unblock Team (After Review)**
```bash
# Remove team from blocked list
redis-cli SREM "blocked:teams" "$TEAM"

# Notify team
echo "Team $TEAM workflows unblocked. Cost optimizations applied."

# Monitor for 1 hour
watch -n 300 'curl -s "http://localhost:9090/api/v1/query?query=rate(cost_per_team_dollars{team=\"$TEAM\"}[1h])" | jq ".data.result[0].value[1]"'
```

## Verification Checklist
- [ ] Alert cleared (team cost <$10/hour)
- [ ] No agents running >45 minutes
- [ ] Model usage optimized (>80% Z.ai usage)
- [ ] CFN Loop convergence within 10 iterations
- [ ] Team cost limits enforced in database
- [ ] Agent profiles updated for cost optimization
- [ ] No runaway loops detected
- [ ] Grafana cost metrics in green zone
- [ ] Team workflows functional (not blocked)
- [ ] Cost report shows normal patterns

## Prevention

### Configuration Changes
1. **Iteration limits:** Max 10 iterations per CFN Loop
2. **Agent timeout:** Kill agents after 45 minutes
3. **Cost limits:** Enforce $10/hour per team limit
4. **Model selection:** Default to Z.ai (97% cost savings vs Anthropic)
5. **Spawn rate limits:** Max 10 agents/minute per team

### Monitoring Improvements
1. **Add alert:** Team cost >$8/hour (early warning)
2. **Add alert:** Agent runtime >30 minutes
3. **Add alert:** CFN Loop iteration >8
4. **Add dashboard:** Model cost comparison over time
5. **Add metric:** Cost per successful task completion

### Process Changes
1. **Weekly cost review:** Review team cost trends
2. **Model selection guidelines:** Document when Anthropic justified
3. **Cost optimization training:** Educate teams on cost-efficient patterns
4. **Automatic reports:** Daily cost summary to team leads
5. **Capacity planning:** Forecast team budgets monthly
6. **Cost attribution:** Detailed cost breakdown by task type

## Post-Incident

### Required Actions
1. Create post-incident review within 24 hours
2. Update this runbook with specific cost drivers
3. Implement cost controls within 1 week
4. Train team on cost optimization
5. Review model selection policies

### Post-Incident Review Template
```markdown
# PIR: High Cost Per Team - [DATE]

## Timeline
- [TIME]: Alert fired (cost >$10/hour)
- [TIME]: On-call notified
- [TIME]: Root cause identified
- [TIME]: Long-running agents killed
- [TIME]: Team workflows paused
- [TIME]: Cost controls implemented
- [TIME]: Alert cleared

## Root Cause
[Runaway loop / stuck agents / expensive models / high spawn rate]

## Impact
- **Duration:** [X hours of high cost]
- **Total cost:** $[X] (budget: $[Y])
- **Affected team:** [team name]
- **Root issue:** [specific workflow or agent]

## Cost Breakdown
- Agent spawns: $[X]
- Model usage: $[X] (Z.ai vs Anthropic split)
- Long-running agents: $[X]
- Total: $[X]

## Resolution
[Killed agents / switched models / added limits / fixed loop]

## Lessons Learned
- No cost limits enforced
- Expensive models used unnecessarily
- No agent timeout configured
- Runaway loop not detected early

## Action Items
1. Implement cost limits - Owner: Platform - Due: [date]
2. Add agent timeout - Owner: DevOps - Due: [date]
3. Optimize model selection - Owner: Team Lead - Due: [date]
4. Add early warning alert - Owner: SRE - Due: [date]
5. Train team on cost efficiency - Owner: Manager - Due: [date]
```

## Related Alerts
- `CFNLoopStuck` → [cfn-loop-stuck.md](cfn-loop-stuck.md)
- `HighAgentSpawnFailureRate` → [agent-spawn-failure.md](agent-spawn-failure.md)
- `MemoryExhaustion` → [memory-exhaustion.md](memory-exhaustion.md)

## References
- **Grafana:** http://localhost:3000/d/cost-allocation
- **Prometheus:** http://localhost:9090/alerts
- **Docs:** [MONITORING_GUIDE.md](/mnt/wsl/.../docs/MONITORING_GUIDE.md)
- **Cost Script:** [scripts/cost-allocation-tracker.sh](/mnt/wsl/.../scripts/cost-allocation-tracker.sh)
- **Provider Routing:** [docs/CUSTOM_PROVIDER_ROUTING.md](/mnt/wsl/.../docs/CUSTOM_PROVIDER_ROUTING.md)

---
**Last Updated:** 2025-11-24
**Version:** 1.0
**Maintainer:** Platform Team + Finance
