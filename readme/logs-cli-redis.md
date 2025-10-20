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

## CFN-Redis CLI Wrapper

### cfn-redis - Redis Coordination Helpers

**Purpose**: Execute Redis coordination patterns and waiting mode operations

**Usage**:
```bash
cfn-redis pattern <name> [options]
cfn-redis waiting-mode [options]
cfn-redis event
```

#### Pattern Command

Apply coordination patterns.

**Signature**: `cfn-redis pattern <name> --task-id <id>`

**Patterns**:
- `simple-chain` - Linear agent coordination
- `hierarchical-broadcast` - Coordinator broadcasts to agents
- `mesh-hybrid` - Peer-to-peer with coordinator

**Example**:
```bash
cfn-redis pattern mesh-hybrid --task-id task-123
```

#### Waiting Mode Command

Manage agent waiting states.

**Signature**: `cfn-redis waiting-mode --task-id <id> --agent-id <id> --action <action>`

**Actions**:
- `enter` - Agent enters waiting mode (BLPOP)
- `wake` - Coordinator wakes agent
- `report` - Agent reports completion
- `collect` - Coordinator collects results

**Flags**:
- `--task-id` (string, required) - Task ID for coordination
- `--agent-id` (string, required) - Agent ID
- `--action` (string, default: enter) - Action to perform
- `--context` (string) - Context description
- `--reason` (string) - Wake reason
- `--iteration` (number) - Iteration number

**Examples**:
```bash
# Agent enters waiting
cfn-redis waiting-mode --task-id task-123 --agent-id coder-1 --action enter

# Coordinator wakes agent
cfn-redis waiting-mode --task-id task-123 --agent-id coder-1 \
  --action wake --reason iteration --iteration 2
```

#### Event Command

Monitor Redis pub/sub events.

**Signature**: `cfn-redis event`

**Example**:
```bash
cfn-redis event
# Subscribes to: swarm:events, swarm:coordination
```

## CLI Agent Spawning

### Agent Execution

**Purpose**: Spawn agents via CLI with Z.ai routing

**Signature**: `npx claude-flow-novice agent <type> [options]`

**Parameters**:
- `<type>`: Agent type (researcher, backend-dev, tester, etc.)
- `--task-id`: Unique task identifier
- `--task`: Task description
- `--iteration`: Iteration number (default: 1)
- `--context`: Additional context
- `--mode`: Execution mode (cli, cfn-loop)
- `--priority`: Task priority (1-10)

**Example**:
```bash
npx claude-flow-novice agent researcher \
  --task-id "cfn-task-123" \
  --task "Analyze authentication patterns" \
  --iteration 1
```

**Provider Configuration**:
```bash
# .env file
CLAUDE_API_PROVIDER=zai
ZAI_API_KEY=your-api-key
ZAI_BASE_URL=https://api.z.ai/api/anthropic
```

**Model Selection**:
- Primary: `glm-4.6` (Z.ai)
- Fallback: `glm-4.5-air` (automatic retry on error)
- Timeout: 120s with 2 retries

**Output**:
```
[anthropic-client] Provider: zai
[anthropic-client] Model: glm-4.6
[anthropic-client] Stream: disabled

=== Agent Execution Complete ===
Input tokens: 874
Output tokens: 489
Status: ✓ Success
Exit Code: 0
```

**Integration with CFN Loop**:
```bash
# Coordinator spawns agents via CLI
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$TASK_ID" \
  --mode standard \
  --loop3-agents "researcher,backend-dev" \
  --loop2-agents "reviewer,tester"

# Orchestrator internally calls:
# npx claude-flow-novice agent researcher --task-id "$TASK_ID" ...
# npx claude-flow-novice agent backend-dev --task-id "$TASK_ID" ...
```

**Testing**:
```bash
# Direct CLI test (uses latest build)
node dist/cli/index.js agent researcher \
  --task-id "test-123" \
  --task "What is 2+2?" \
  --iteration 1
```

**Status**: ✅ Operational (v2.5.2)

---

## Version
**Current CLI Version**: 2.5.2
**Last Updated**: 2025-10-20