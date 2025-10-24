#!/usr/bin/env bash

##############################################################################
# Iteration Manager
# Manages iteration cycles and feedback injection
#
# Usage:
#   iteration-manager.sh --task-id <id> \
#                        --iteration <n> \
#                        --agents <agent1,agent2,...> \
#                        --feedback-source <redis-key-prefix>
#
# Returns:
#   Exit 0: Agents awakened for next iteration
#   Exit 1: Error during wake process
##############################################################################

set -euo pipefail

# Parameters
TASK_ID=""
ITERATION=""
AGENTS=""
FEEDBACK_SOURCE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --iteration) ITERATION="$2"; shift 2 ;;
    --agents) AGENTS="$2"; shift 2 ;;
    --feedback-source) FEEDBACK_SOURCE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validation
if [ -z "$TASK_ID" ] || [ -z "$ITERATION" ] || [ -z "$AGENTS" ]; then
  echo "Error: Missing required parameters"
  exit 1
fi

# Use Redis Coordination skill for wake operations
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REDIS_COORD_SKILL="$SKILL_DIR/redis-coordination"

echo "Starting Iteration $ITERATION"
echo "Agents to wake: $AGENTS"

# Convert comma-separated agents to array
IFS=',' read -ra AGENT_ARRAY <<< "$AGENTS"

# Wake each agent with feedback
for agent_id in "${AGENT_ARRAY[@]}"; do
  # Retrieve agent-specific feedback if feedback source provided using Redis coordination primitive
  FEEDBACK=""
  if [ -n "$FEEDBACK_SOURCE" ]; then
    # Retrieve context from Redis using primitive
    FEEDBACK_JSON=$("$REDIS_COORD_SKILL/retrieve-context.sh" \
      --task-id "$TASK_ID" \
      --key "$agent_id" \
      --namespace "$FEEDBACK_SOURCE" 2>/dev/null || echo "{}")

    # Extract feedback message from JSON (try multiple field names)
    FEEDBACK=$(echo "$FEEDBACK_JSON" | jq -r '.message // .feedback // .data // ""' 2>/dev/null || echo "")
  fi

  # Default feedback if none exists
  if [ -z "$FEEDBACK" ]; then
    FEEDBACK="Continue iteration $ITERATION with quality improvements"
  fi

  echo "Waking $agent_id with feedback: ${FEEDBACK:0:80}..."

  # Wake agent using Redis Coordination skill
  "$REDIS_COORD_SKILL/invoke-waiting-mode.sh" wake \
    --task-id "$TASK_ID" \
    --agent-id "$agent_id" \
    --reason "cfn_loop_iteration" \
    --iteration "$ITERATION" \
    --feedback "$FEEDBACK" || {
    echo "Warning: Failed to wake $agent_id"
  }
done

echo "✅ All agents awakened for iteration $ITERATION"
exit 0
