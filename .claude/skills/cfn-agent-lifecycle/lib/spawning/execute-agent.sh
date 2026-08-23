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
AGENT_MODEL="${AGENT_MODEL:-sonnet}"
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

# Resolve the concrete model id from the single source of truth
# (.claude/cfn-config/provider-models.json), keyed by provider + Claude tier.
# The old hardcoded case sent claude-3-5-* Anthropic ids to whatever endpoint
# API_PROVIDER pointed at, so z.ai workers requested nonexistent models.
PROVIDER_MODELS_FILE=".claude/cfn-config/provider-models.json"
if [ ! -f "$PROVIDER_MODELS_FILE" ]; then
  echo "Error: $PROVIDER_MODELS_FILE not found (source of truth for model ids)" >&2
  exit 1
fi

API_MODEL=$(jq -r --arg p "$API_PROVIDER" --arg t "$AGENT_MODEL" \
  '.providers[$p].models[$t] // empty' "$PROVIDER_MODELS_FILE")

if [ -z "$API_MODEL" ]; then
  DEFAULT_TIER=$(jq -r '.defaultTier // "sonnet"' "$PROVIDER_MODELS_FILE")
  echo "Warning: no model for provider='$API_PROVIDER' tier='$AGENT_MODEL'; falling back to tier '$DEFAULT_TIER'" >&2
  API_MODEL=$(jq -r --arg p "$API_PROVIDER" --arg t "$DEFAULT_TIER" \
    '.providers[$p].models[$t] // empty' "$PROVIDER_MODELS_FILE")
fi

if [ -z "$API_MODEL" ]; then
  echo "Error: could not resolve a model id for provider='$API_PROVIDER'" >&2
  exit 1
fi

echo "Resolved Model: $API_MODEL"

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

# Clean up prompt file
rm -f "$PROMPT_FILE"

# Exit with success (temporary until real execution implemented)
exit 0
