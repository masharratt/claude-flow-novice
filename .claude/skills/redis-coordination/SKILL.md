# Redis Coordination Skill

## Version
**Version:** 1.4.0
**Status:** OPERATIONAL

## Overview
Redis Coordination provides a comprehensive set of tools for managing agent interactions, consensus building, and distributed task coordination.

## Features
- Waiting Mode (Blocking/Non-Blocking)
- Agent Wake-Up Mechanism
- Consensus Collection
- **CFN Loop Orchestration with Dependency Enforcement** (NEW in v1.4.0)
- Flexible Coordination Patterns

## Agent Integration Examples

### 1. Waiting Mode Operations

#### Entering Waiting Mode
```bash
# Agent enters waiting mode
./.claude/skills/redis-coordination/invoke-redis-pattern.sh wait \
  --task-id "deploy-feature-x" \
  --agent-id "coder-1" \
  --context "iteration-1"
```

#### Waking an Agent
```bash
# Coordinator wakes agent with detailed feedback
./.claude/skills/redis-coordination/invoke-redis-pattern.sh wake \
  --task-id "deploy-feature-x" \
  --agent-id "coder-1" \
  --payload '{
    "iteration": 2,
    "feedback": "Add error handling",
    "instructions": "Improve test coverage"
  }'
```

#### Reporting Results
```bash
# Agent reports task completion and confidence
./.claude/skills/redis-coordination/invoke-redis-pattern.sh report \
  --task-id "deploy-feature-x" \
  --agent-id "coder-1" \
  --confidence 0.92 \
  --result '{
    "coverage": "90%",
    "errors_fixed": true
  }'
```

#### Collecting Consensus
```bash
# Collect results from multiple agents
result=$(
  ./.claude/skills/redis-coordination/invoke-redis-pattern.sh collect \
  --task-id "deploy-feature-x" \
  --agent-ids "coder-1,reviewer-1,tester-1"
)

# Parse consensus status
status=$(echo "$result" | jq -r '.status')
avg_confidence=$(echo "$result" | jq '.avgConfidence')

if [ "$status" == "consensus" ]; then
  echo "Consensus reached with $avg_confidence confidence"
fi
```

## CFN Loop Orchestration (NEW in v1.4.0)

### Automatic Dependency Enforcement
The Redis Coordination skill now includes **CFN Loop orchestration** with automatic dependency blocking.

**Script:** `orchestrate-cfn-loop.sh`

**Purpose:** Enforces loop dependencies so Loop 2 validators wait for Loop 3 implementers, and Product Owner waits for all validators.

### Usage
```bash
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "unique-task-id" \
  --mode standard \
  --loop3-agents "researcher,backend-dev,devops" \
  --loop2-agents "reviewer,architect,tester" \
  --product-owner "product-owner" \
  --max-iterations 10
```

### How It Works
```
1. Spawns Loop 3 implementers
2. BLPOP blocks until all Loop 3 agents signal :done
3. Collects Loop 3 confidence scores
4. If gate passes, spawns Loop 2 validators
5. BLPOP blocks until all Loop 2 agents signal :done
6. Collects Loop 2 consensus scores
7. If consensus reached → complete
8. If not → wake all agents for iteration N+1
```

### Agent Completion Protocol
Each agent MUST follow this protocol:

```bash
# 1. Complete work
# 2. Signal completion
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# 3. Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85 \
  --iteration 1

# 4. Enter waiting mode (for next iteration)
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "iteration-complete"
```

### Benefits
- ✅ **Prevents premature consensus** - Product Owner cannot collect before validators finish
- ✅ **Zero-token blocking** - BLPOP uses no tokens while waiting
- ✅ **Automatic iteration management** - Orchestrator wakes agents for retry
- ✅ **Consistent enforcement** - Same pattern across all CFN loops

## Swarm Lifecycle Management

**General primitives for ANY multi-agent workflow** (CFN Loop, independent swarms, custom orchestration).

### Initialize Swarm

Create swarm metadata for coordination tracking:

```bash
# Basic initialization
./.claude/skills/redis-coordination/init-swarm.sh \
  --swarm-id "swarm-auth-feature" \
  --agents "researcher,backend-dev,tester"

# With custom metadata
./.claude/skills/redis-coordination/init-swarm.sh \
  --swarm-id "swarm-auth-feature" \
  --agents "researcher,backend-dev,tester" \
  --task-id "task-auth-123" \
  --topology "mesh" \
  --ttl 604800 \
  --metadata '{"priority": "high", "sprint": "sprint-5"}'
```

### Complete Swarm

Mark swarm as completed with final metrics:

```bash
./.claude/skills/redis-coordination/complete-swarm.sh \
  --swarm-id "swarm-auth-feature" \
  --final-metric "success=true" \
  --final-metric "coverage=0.95"
```

### Query Swarms

List active swarms across all sessions:

```bash
# List all swarms
./.claude/skills/redis-coordination/list-active-swarms.sh

# Filter by task
./.claude/skills/redis-coordination/list-active-swarms.sh --task-id "task-auth-123"

# JSON output
./.claude/skills/redis-coordination/list-active-swarms.sh --json
```

### Swarm Metadata Structure

The swarm primitives store metadata in Redis for coordination tracking across multiple concurrent sessions:

```bash
# Swarm metadata stored in Redis
swarm:<swarm-id>:metadata
  task_id: "unique-task-id"
  mode: "standard"
  max_agents: 7
  loop3_agents: "researcher,backend-dev,devops"
  loop2_agents: "reviewer,architect,tester"
  product_owner: "product-owner"
  created_at: "2025-10-19T00:00:00Z"
  status: "in_progress|completed"
  final_consensus: "0.92"  # Set on completion
  total_iterations: "3"    # Set on completion
```

**Benefits:**
- **Namespace isolation**: Each swarm gets unique ID
- **Multi-session support**: Track multiple workflows running simultaneously
- **Resource tracking**: Know agent inventory per swarm
- **Automatic cleanup**: Configurable TTL (default: 7 days)
- **Status monitoring**: in_progress vs completed swarms
- **Custom metadata**: Extensible for workflow-specific data

**Use Cases:**
1. **CFN Loop orchestration** - Tracked automatically by `orchestrate-cfn-loop.sh`
2. **Independent swarms** - Manual init for custom multi-agent workflows
3. **Parallel feature development** - Multiple teams working on different features
4. **Long-running tasks** - Track progress over hours/days
5. **Debugging** - Query swarm status and agent inventory

### Integration
The orchestrator is automatically invoked by:
- CFN Loop Coordinator agent (`.claude/agents/cfn-loop-coordinator.md`)
- Slash commands (`/cfn-loop-single`, `/cfn-loop-sprints`, `/cfn-loop-epic`)
- CLAUDE.md CFN Loop section (mandatory usage)

## Configuration
Detailed configuration is available in `config.json`. Key parameters include:
- Redis connection details
- Waiting mode timeout
- Consensus threshold
- Enabled coordination patterns
- CFN Loop mode thresholds (mvp/standard/enterprise)

## Testing
Use the provided test script to validate the skill's functionality:
```bash
./.claude/skills/redis-coordination/test-waiting-mode.sh
```

## Performance Characteristics
- Low-latency wake-up (<100ms)
- Zero-token waiting mode
- Supports 10+ concurrent agents
- Configurable consensus thresholds
- Automatic dependency blocking via BLPOP

## Known Limitations
- Requires Redis 5.0+
- Assumes all agents have Redis access
- Consensus calculated on a per-result basis
- Orchestrator requires bash 4.0+
