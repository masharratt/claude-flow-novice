#!/usr/bin/env bash
##############################################################################
# Agent Execution Script
#
# Executes CLI-spawned agents by invoking Claude API with agent prompt.
# Supports both Anthropic and z.ai provider routing.
#
# Environment Variables:
#   AGENT_TYPE      - Agent type/name (e.g., "rust-enterprise-developer")
#   AGENT_ID        - Unique agent identifier (e.g., "rust-enterprise-1")
#   AGENT_MODEL     - Model to use (haiku, sonnet, opus)
#   AGENT_TOOLS     - Comma-separated list of tools
#   TASK_ID         - Task identifier for CFN Loop coordination
#   ITERATION       - Current iteration number
#   MODE            - Execution mode (cli, api, hybrid)
#   PROMPT_FILE     - Path to file containing agent prompt
#
# Usage:
#   ./execute-agent.sh
##############################################################################

set -euo pipefail

# Validate required environment variables
if [ -z "${AGENT_TYPE:-}" ]; then
  echo "Error: AGENT_TYPE environment variable required" >&2
  exit 1
fi

if [ -z "${PROMPT_FILE:-}" ] || [ ! -f "${PROMPT_FILE:-}" ]; then
  echo "Error: PROMPT_FILE must be set and file must exist" >&2
  exit 1
fi

# Default values
AGENT_ID="${AGENT_ID:-${AGENT_TYPE}-1}"
AGENT_MODEL="${AGENT_MODEL:-haiku}"
TASK_ID="${TASK_ID:-}"
ITERATION="${ITERATION:-1}"
MODE="${MODE:-cli}"

echo "=== Agent Execution ==="
echo "Agent Type: $AGENT_TYPE"
echo "Agent ID: $AGENT_ID"
echo "Model: $AGENT_MODEL"
echo "Task ID: ${TASK_ID:-N/A}"
echo "Iteration: $ITERATION"
echo "Mode: $MODE"
echo ""

# Read prompt from file
PROMPT=$(cat "$PROMPT_FILE")

# Determine API provider
API_PROVIDER="anthropic"
if [ -f ".claude/cfn-config/api-provider.json" ]; then
  PROVIDER_CONFIG=$(cat .claude/cfn-config/api-provider.json)
  if echo "$PROVIDER_CONFIG" | grep -q '"provider".*"zai"'; then
    API_PROVIDER="zai"
  fi
fi

if [ "${CLAUDE_API_PROVIDER:-}" = "zai" ]; then
  API_PROVIDER="zai"
fi

echo "API Provider: $API_PROVIDER"
echo ""

# Map agent model to API model name
case "$AGENT_MODEL" in
  haiku)
    API_MODEL="claude-3-5-haiku-20241022"
    ;;
  sonnet)
    API_MODEL="claude-3-5-sonnet-20241022"
    ;;
  opus)
    API_MODEL="claude-3-opus-20240229"
    ;;
  *)
    echo "Warning: Unknown model '$AGENT_MODEL', defaulting to haiku" >&2
    API_MODEL="claude-3-5-haiku-20241022"
    ;;
esac

# For now, we'll simulate agent execution by echoing the prompt
# TODO: Implement actual API calls when API client is ready
echo "=== Agent Prompt (First 500 chars) ==="
echo "$PROMPT" | head -c 500
echo "..."
echo ""
echo "=== Agent Execution Status ==="
echo "✅ Agent prompt prepared successfully"
echo "⚠️  Note: Direct API execution not yet implemented"
echo ""
echo "Next Steps:"
echo "1. Integrate with Claude API SDK"
echo "2. Implement streaming response handling"
echo "3. Add tool execution support"
echo ""

# For CFN Loop agents, simulate completion protocol
if [ -n "$TASK_ID" ]; then
  echo "=== CFN Loop Simulation ==="
  echo "This agent would execute the following protocol:"
  echo ""
  echo "1. Execute task work"
  echo "2. redis-cli lpush \"swarm:${TASK_ID}:${AGENT_ID}:done\" \"complete\""
  echo "3. ./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh report \\"
  echo "     --task-id \"$TASK_ID\" \\"
  echo "     --agent-id \"$AGENT_ID\" \\"
  echo "     --confidence 0.85 \\"
  echo "     --iteration $ITERATION"
  echo "4. ./.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh enter \\"
  echo "     --task-id \"$TASK_ID\" \\"
  echo "     --agent-id \"$AGENT_ID\" \\"
  echo "     --context \"iteration-complete\""
  echo ""
fi

# Clean up prompt file
rm -f "$PROMPT_FILE"

# Exit with success (temporary until real execution implemented)
exit 0
