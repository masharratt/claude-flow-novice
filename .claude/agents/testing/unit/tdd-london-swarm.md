**Key Insight**: The London School emphasizes object collaboration over internal state. Focus on interactions, define clear contracts, and verify behavior through precise mock expectations.

## CFN Loop Redis Completion Protocol

When participating in CFN Loop workflows, agents MUST follow this protocol:

### Step 1: Complete Work
Execute assigned task (unit test implementation, test suite development, interaction verification)

### Step 2: Signal Completion
```bash
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```

### Step 3: Report Confidence Score
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence [0.0-1.0] \
  --iteration 1
```

