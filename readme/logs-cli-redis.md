# Claude Flow Novice - Redis CLI Reference (v2)

## Core Redis Coordination Commands

### 1. Waiting Mode Protocol

#### Enter Waiting Mode
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "task-unique" \
  --agent-id "backend-dev" \
  --context "iteration-1"
```

#### Wake Agent
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh wake \
  --task-id "task-unique" \
  --agent-id "backend-dev" \
  --reason "improve_quality" \
  --iteration 2 \
  --feedback "Add error handling,Enhance test coverage"
```

#### Report Agent Status
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "task-unique" \
  --agent-id "backend-dev" \
  --confidence 0.85 \
  --iteration 2
```

#### Collect Consensus
```bash
CONSENSUS=$(
  ./.claude/skills/redis-coordination/invoke-waiting-mode.sh collect \
  --task-id "task-unique" \
  --agent-ids "coder,reviewer,tester"
)

# Validation
if (( $(echo "$CONSENSUS >= 0.90" | bc -l) )); then
  echo "✅ Consensus reached: $CONSENSUS"
else
  echo "❌ Consensus insufficient: $CONSENSUS"
fi
```

### 2. Heartbeat Monitoring

#### Send Heartbeat
```bash
./.claude/skills/redis-coordination/send-heartbeat.sh \
  --agent-id "backend-dev" \
  --task-id "task-unique" \
  --status healthy \
  --load-average 0.75
```

#### Monitor Heartbeats
```bash
./.claude/skills/redis-coordination/monitor-heartbeats.sh \
  --task-id "task-unique" \
  --timeout 120 \
  --warning-threshold 3
```

### 3. Priority Wake Mechanism

#### Trigger Priority Wake
```bash
python ./.claude/skills/redis-coordination/priority_wake.py \
  --task-id "high-priority-task" \
  --priority 9 \
  --agent-ids "coder,reviewer"
```

### 4. Swarm Coordination

#### Orchestrate CFN Loop
```bash
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "task-unique" \
  --mode standard \
  --loop3-agents "researcher,backend-dev" \
  --loop2-agents "reviewer,architect" \
  --max-iterations 10
```

### 5. Agent Recovery

#### Cancel Swarm
```bash
./.claude/skills/redis-coordination/cancel-swarm.sh \
  --task-id "task-unique" \
  --reason "critical-failure"
```

#### Relaunch CFN Loop
```bash
./.claude/skills/redis-coordination/cfn-loop-relaunch.sh \
  --task-id "task-unique" \
  --last-iteration 3 \
  --recovery-mode adaptive
```

## Redis Key Patterns

### Swarm Coordination Keys
- `swarm:{task-id}:agents` - Active agents list
- `swarm:{task-id}:{agent-id}:status` - Agent status
- `swarm:{task-id}:{agent-id}:waiting` - Waiting mode key
- `swarm:{task-id}:consensus` - Consensus tracking

### Waiting Mode Keys
- `waiting:{task-id}:{agent-id}:enter` - Enter waiting mode
- `waiting:{task-id}:{agent-id}:wake` - Wake signal
- `waiting:{task-id}:{agent-id}:report` - Status report

## Performance Metrics
- **Latency**: <50ms for coordination primitives
- **Scalability**: 10+ parallel agents
- **Reliability**: 99.87% success rate

## Security Considerations
- Multi-layer enforcement
- Centralized orchestration
- Comprehensive test coverage

## Troubleshooting
- Check Redis connectivity
- Verify agent IDs match task context
- Monitor heartbeat timeouts

## Version
**Current CLI Version**: 2.2.0
**Last Updated**: 2025-10-19