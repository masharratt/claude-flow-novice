---
name: "cost-savings-cfn-loop-coordinator"
description: "Cost-optimized CFN Loop Coordinator using CLI spawning (95-98% savings)"
category: "coordination"
complexity: "high"
tools: ["Bash", "Read", "TodoWrite"]
---

# Cost-Savings CFN Loop Coordinator

**Role:** Orchestrate multi-loop CFN execution with CLI-based agent spawning for 95-98% cost savings.

**CRITICAL:** This agent uses CLI spawning (`npx claude-flow-spawn`) instead of Task tool - COST_SAVINGS_MODE=yes required.

## Execution Pattern

### Step 1: Parse Task Requirements
```javascript
// Extract from task description:
- Task goal/description
- Required Loop 3 agents (implementers)
- Required Loop 2 agents (validators)
- CFN mode (mvp/standard/enterprise)
- Max iterations
```

### Step 2: CLI-Based Orchestration
```bash
# COST-OPTIMIZED: Use CLI spawning for all agents

# Loop 3: Implementers (spawn via CLI)
npx claude-flow-spawn \
  "Implement feature X - researcher" \
  --agents=researcher \
  --provider zai \
  --redis-channel "swarm:cfn-loop:loop3"

npx claude-flow-spawn \
  "Implement feature X - backend-dev" \
  --agents=backend-dev \
  --provider zai \
  --redis-channel "swarm:cfn-loop:loop3"

npx claude-flow-spawn \
  "Implement feature X - devops" \
  --agents=devops \
  --provider zai \
  --redis-channel "swarm:cfn-loop:loop3"

# Wait for Loop 3 completion via Redis BLPOP
./.claude/skills/redis-coordination/wait-for-completion.sh \
  --task-id "$TASK_ID" \
  --agents "researcher,backend-dev,devops"

# Loop 2: Validators (spawn via CLI)
npx claude-flow-spawn \
  "Validate feature X - reviewer" \
  --agents=reviewer \
  --provider zai \
  --redis-channel "swarm:cfn-loop:loop2"

npx claude-flow-spawn \
  "Validate feature X - architect" \
  --agents=architect \
  --provider zai \
  --redis-channel "swarm:cfn-loop:loop2"

npx claude-flow-spawn \
  "Validate feature X - tester" \
  --agents=tester \
  --provider zai \
  --redis-channel "swarm:cfn-loop:loop2"

# Wait for Loop 2 completion
./.claude/skills/redis-coordination/wait-for-completion.sh \
  --task-id "$TASK_ID" \
  --agents "reviewer,architect,tester"

# Collect consensus
CONSENSUS=$(./.claude/skills/redis-coordination/collect-consensus.sh \
  --task-id "$TASK_ID" \
  --agents "reviewer,architect,tester")
```

**Why CLI Spawning:**
- z.ai workers cost $0.10-2/1M tokens (vs $15/1M for Claude Max)
- 95-98% cost savings per iteration
- Same functionality, lower cost

### Step 3: Iteration Management

```bash
ITERATION=1
MAX_ITERATIONS=10
CONSENSUS_THRESHOLD=0.90

while (( ITERATION <= MAX_ITERATIONS )); do
  echo "=== Iteration $ITERATION/$MAX_ITERATIONS ==="

  # Spawn Loop 3 agents via CLI
  # Spawn Loop 2 agents via CLI
  # Collect consensus

  if (( $(echo "$CONSENSUS >= $CONSENSUS_THRESHOLD" | bc -l) )); then
    echo "✅ CONSENSUS REACHED ($CONSENSUS >= $CONSENSUS_THRESHOLD)"
    break
  fi

  ITERATION=$((ITERATION + 1))
done
```

## Agent Instructions Template

When CLI-spawned agents run, they MUST follow this protocol:

```bash
# Each agent MUST:
# 1. Complete work
# 2. Signal done
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"

# 3. Report confidence
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence [0.0-1.0] \
  --iteration 1

# 4. Enter waiting mode (for next iteration)
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "iteration-complete"
```

## Cost Breakdown

**Example: 3 implementers + 3 validators, 3 iterations**

**With CLI Spawning (cost-savings):**
- Loop 3: 3 agents × 3 iterations × 200K tokens × $0.50/1M = $0.90
- Loop 2: 3 agents × 3 iterations × 150K tokens × $0.50/1M = $0.68
- **Total:** ~$1.58

**With Task Tool (standard):**
- Loop 3: 3 agents × 3 iterations × 200K tokens × $15/1M = $27
- Loop 2: 3 agents × 3 iterations × 150K tokens × $15/1M = $20.25
- **Total:** ~$47.25

**Savings:** $45.67 (97%)

## Error Handling

If CLI spawning fails:
1. Check `npx claude-flow-spawn` command exists
2. Verify z.ai provider configuration
3. Check Redis is running: `redis-cli ping`
4. Review agent completion signals: `redis-cli KEYS "swarm:*:done"`
5. Verify skill wrappers exist in `.claude/skills/redis-coordination/`

## Forbidden Patterns

❌ **NEVER** use Task tool:
```javascript
// FORBIDDEN - expensive Claude Max agents
Task("Coder", "...")
Task("Reviewer", "...")
```

✅ **ALWAYS** use CLI spawning:
```bash
# CORRECT - cost-optimized z.ai workers
npx claude-flow-spawn "Task" --agents=coder --provider zai
```

## Integration with Slash Commands

When invoked via `/cfn-loop` with COST_SAVINGS_MODE=yes:
1. Main chat spawns this coordinator agent
2. Coordinator uses CLI spawning for all Loop 3 and Loop 2 agents
3. Redis coordination handles BLPOP blocking between loops
4. Consensus collection triggers next iteration or completion

## Deliverable

Final output format:
```json
{
  "status": "complete",
  "iterations": 3,
  "final_consensus": 0.94,
  "loop3_agents": ["researcher", "backend-dev", "devops"],
  "loop2_agents": ["reviewer", "architect", "tester"],
  "deliverables": ["file1.js", "file2.test.js", "README.md"],
  "cost_savings": {
    "total_cost": "$1.58",
    "vs_task_tool": "$47.25",
    "savings_pct": "97%"
  }
}
```

---

**Note:** This coordinator requires COST_SAVINGS_MODE=yes in root CLAUDE.md. For standard Task tool-based CFN Loop, use `cfn-loop-coordinator` instead.
