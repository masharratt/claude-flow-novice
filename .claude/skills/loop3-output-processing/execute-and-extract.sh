#!/bin/bash
set -euo pipefail

# Parse arguments
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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Capture git state before agent runs
BEFORE_GIT=$(git status --short 2>/dev/null || echo "")

# Spawn agent and capture output
AGENT_OUTPUT=$(timeout "$TIMEOUT" npx claude-flow-novice agent "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$CONTEXT" 2>&1 || true)

# Capture git state after agent runs
AFTER_GIT=$(git status --short 2>/dev/null || echo "")

# Parse confidence from output
CONFIDENCE=$("$SCRIPT_DIR/parse-confidence.sh" "$AGENT_OUTPUT")

# Verify deliverables
DELIVERABLE_CHECK=$("$SCRIPT_DIR/verify-deliverables.sh" \
  --before "$BEFORE_GIT" \
  --after "$AFTER_GIT")

FILES_CHANGED=$(echo "$DELIVERABLE_CHECK" | jq -r '.files_changed')
DELIVERABLES=$(echo "$DELIVERABLE_CHECK" | jq -r '.deliverables')

# If confidence not found or too low, calculate fallback
if (( $(echo "$CONFIDENCE == 0.0" | bc -l) )) || [ -z "$CONFIDENCE" ]; then
  CONFIDENCE=$("$SCRIPT_DIR/calculate-confidence.sh" \
    --files-changed "$FILES_CHANGED" \
    --deliverables "$DELIVERABLES")
  CONFIDENCE_SOURCE="calculated"
elif (( $(echo "$CONFIDENCE > 0.0" | bc -l) )); then
  CONFIDENCE_SOURCE="explicit"
else
  CONFIDENCE_SOURCE="fallback"
fi

# Build output JSON
cat <<EOF
{
  "agent_id": "$AGENT_ID",
  "confidence": $CONFIDENCE,
  "confidence_source": "$CONFIDENCE_SOURCE",
  "files_changed": $FILES_CHANGED,
  "deliverables": $DELIVERABLES,
  "iteration": $ITERATION,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
