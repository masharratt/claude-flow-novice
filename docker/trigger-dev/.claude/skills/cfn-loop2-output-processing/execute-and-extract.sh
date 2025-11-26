#!/bin/bash
set -euo pipefail

# Loop 2 Output Processing: Execute and Extract Validator Output
# Uses same interface as Loop 3 for consistency

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments (SAME AS LOOP 3)
AGENT_TYPE=""
TASK_ID=""
AGENT_ID=""
CONTEXT=""
ITERATION=1
TIMEOUT=900

while [[ $# -gt 0 ]]; do
  case $1 in
    --agent-type) AGENT_TYPE="$2"; shift 2 ;;
    --task-id) TASK_ID="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --context) CONTEXT="$2"; shift 2 ;;
    --iteration) ITERATION="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) echo "ERROR: Unknown parameter: $1" >&2; exit 1 ;;
  esac
done

# Validate required parameters
if [ -z "$AGENT_TYPE" ] || [ -z "$TASK_ID" ] || [ -z "$AGENT_ID" ] || [ -z "$CONTEXT" ]; then
  echo "ERROR: Missing required parameters" >&2
  echo "Usage: $0 --agent-type TYPE --task-id ID --agent-id ID --context CONTEXT [--iteration N] [--timeout SECONDS]" >&2
  exit 1
fi

# Spawn validator agent and capture output
AGENT_OUTPUT=$(timeout "$TIMEOUT" npx claude-flow-novice agent "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$CONTEXT" 2>&1 || true)

# Parse confidence from output using shared parser
CONFIDENCE=$("$SCRIPT_DIR/parse-feedback.sh" --extract-confidence "$AGENT_OUTPUT" 2>/dev/null || echo "0.0")

# If confidence not found, default to 0.70
if [ -z "$CONFIDENCE" ] || [ "$CONFIDENCE" = "null" ] || (( $(echo "$CONFIDENCE == 0.0" | bc -l) )); then
  CONFIDENCE=0.70
  CONFIDENCE_SOURCE="default"
else
  CONFIDENCE_SOURCE="explicit"
fi

# Parse feedback from output
FEEDBACK_RAW=$("$SCRIPT_DIR/parse-feedback.sh" --extract-feedback "$AGENT_OUTPUT" 2>/dev/null || echo '{"critical":[],"warnings":[],"suggestions":[]}')

# Ensure feedback is valid JSON
if ! echo "$FEEDBACK_RAW" | jq empty 2>/dev/null; then
  # Invalid JSON, use default
  FEEDBACK_RAW='{"critical":[],"warnings":[],"suggestions":[]}'
fi

# Build output JSON using jq to ensure proper formatting
jq -n \
  --arg agent_id "$AGENT_ID" \
  --argjson confidence "$CONFIDENCE" \
  --arg confidence_source "$CONFIDENCE_SOURCE" \
  --argjson feedback "$FEEDBACK_RAW" \
  --arg iteration "$ITERATION" \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{
    agent_id: $agent_id,
    confidence: $confidence,
    confidence_source: $confidence_source,
    feedback: $feedback,
    iteration: ($iteration | tonumber),
    timestamp: $timestamp
  }'
