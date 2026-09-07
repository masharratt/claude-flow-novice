#!/bin/bash

TASK_ID="$1"
CONTEXT="$2"

echo "=== CFN Loop Coordinator Fallback Test ==="
echo "Task ID: $TASK_ID"
echo "Context: $CONTEXT"
echo ""

# Simulate orchestrator failure
echo "Step 1: Attempting orchestrator..."

# Simulate orchestrator failure (invalid agent list)
if ./.claude/skills/cfn-loop-orchestration/orchestrate.sh \
  --task-id "$TASK_ID" \
  --mode "standard" \
  --loop3-agents "" \
  --loop2-agents "" \
  --product-owner "product-owner" \
  --max-iterations 1 \
  --success-criteria '{}' 2>/dev/null; then
    echo "✓ Orchestrator succeeded (unexpected)"
    exit 1
else
    echo "✓ Orchestrator failed as expected"
fi

# Simulate fallback agent spawning
echo "Step 2: Attempting fallback agent spawning..."

# Test direct agent spawning
AGENT_ID="${TASK_ID}-fallback-agent-$(date +%s)"

# Try to spawn an agent directly
if npx claude-flow-novice agent technical-writer \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$CONTEXT" \
  --timeout 30 \
  --background=true 2>/dev/null; then
    echo "✓ Fallback agent spawn initiated"
    exit 0
else
    echo "✗ Fallback agent spawn failed"
    exit 1
fi
