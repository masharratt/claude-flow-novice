#!/bin/bash
# Direct Agent Spawning via Trigger.dev (Simplified)
# Bypasses endpoint indexing complexity

set -euo pipefail

# Configuration
TRIGGER_API_URL="${TRIGGER_API_URL:-http://localhost:3040}"
TRIGGER_API_KEY="${TRIGGER_API_KEY:-tr_dev_cfn_stress_test_key_12345}"
TRIGGER_ORG_SLUG="${TRIGGER_ORG_SLUG:-org_cfn_test}"
TRIGGER_PROJECT_SLUG="${TRIGGER_PROJECT_SLUG:-proj_cfn_test}"

# Command usage
if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <agent-type> <task-description> [num-agents]"
  echo ""
  echo "Examples:"
  echo "  $0 backend-developer 'Implement JWT auth' 1     # Single agent"
  echo "  $0 typescript-specialist 'Fix type errors' 5     # 5 parallel agents"
  echo "  $0 backend-developer 'Hello world' 100           # 100-agent stress test"
  exit 1
fi

AGENT_TYPE="$1"
TASK_DESCRIPTION="$2"
NUM_AGENTS="${3:-1}"

echo "=== Agent Spawning Configuration ==="
echo "Agent Type: $AGENT_TYPE"
echo "Task: $TASK_DESCRIPTION"
echo "Count: $NUM_AGENTS agents"
echo ""

# Function to spawn a single agent container
spawn_agent() {
  local agent_id="$1"
  local container_name="cfn-agent-${agent_id}-$(date +%s)"

  echo "[Agent $agent_id] Spawning container: $container_name"

  docker run --rm \
    --name "$container_name" \
    --network cfn-network \
    --cpus=2 \
    --memory=4g \
    -e TASK_ID="trigger-task-${agent_id}" \
    -e AGENT_TYPE="$AGENT_TYPE" \
    -e CFN_DEFAULT_PROVIDER="zai" \
    -v /tmp:/workspace \
    cfn-agent:test \
    "$TASK_DESCRIPTION" &

  echo "[Agent $agent_id] ✅ Spawned (PID: $!)"
}

# Spawn agents
echo "=== Spawning $NUM_AGENTS Agents ==="
echo ""

pids=()

for i in $(seq 1 "$NUM_AGENTS"); do
  spawn_agent "$i"
  pids+=($!)

  # Small delay between spawns to avoid overwhelming Docker
  if [ "$NUM_AGENTS" -gt 10 ]; then
    sleep 0.1
  fi
done

echo ""
echo "=== Waiting for Agents to Complete ==="
echo ""

# Wait for all agents
failed=0
for pid in "${pids[@]}"; do
  if wait "$pid"; then
    echo "✅ Agent PID $pid completed successfully"
  else
    echo "❌ Agent PID $pid failed"
    ((failed++))
  fi
done

echo ""
echo "=== Results ==="
echo "Total: $NUM_AGENTS agents"
echo "Success: $((NUM_AGENTS - failed))"
echo "Failed: $failed"
echo ""

if [ "$failed" -eq 0 ]; then
  echo "✅ All agents completed successfully"
  exit 0
else
  echo "⚠️  $failed agents failed"
  exit 1
fi
