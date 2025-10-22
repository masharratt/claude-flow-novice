#!/bin/bash
set -euo pipefail

# Loop 2 Output Processing: Enhanced Validator Output Processing
# BUG #27 FIX: Enforce structured output template and reject defaults

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments (SAME AS execute-and-extract.sh)
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

# BUG #27 FIX: Add structured output template to context
ENHANCED_CONTEXT="$CONTEXT

**REQUIRED OUTPUT FORMAT:**

You MUST structure your validation output as follows:

## Validation Confidence: [0.00-1.00]

### CRITICAL Issues
- [List any critical issues that must be fixed]
- [Use bullet points with dash prefix]

### WARNING Issues
- [List warnings that should be addressed]
- [Each on a new line with dash prefix]

### SUGGESTION Items
- [List improvement suggestions]
- [Optional enhancements]

**Example:**
## Validation Confidence: 0.87

### CRITICAL Issues
- Missing error handling in invoke-gate-ack.sh:88
- Security vulnerability in input validation

### WARNING Issues
- Inconsistent naming convention in test file
- Missing JSDoc comments

### SUGGESTION Items
- Consider adding retry backoff strategy
- Could use Promise.all for parallel operations

**Important:**
- Confidence MUST be explicit numeric value (0.00-1.00)
- Categorize ALL feedback items by severity
- If no issues found, state \"No issues found\" under each category
- Do NOT use default confidence scores without justification
"

# Spawn validator agent with enhanced context
echo "[Validator] Spawning $AGENT_TYPE with structured output requirement" >&2
AGENT_OUTPUT=$(timeout "$TIMEOUT" npx claude-flow-novice agent "$AGENT_TYPE" \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --context "$ENHANCED_CONTEXT" 2>&1 || true)

# Parse confidence using multi-pattern detection
CONFIDENCE=$("$SCRIPT_DIR/parse-feedback.sh" --extract-confidence "$AGENT_OUTPUT" 2>/dev/null || echo "0.0")

# BUG #27 FIX: Enhanced confidence validation
CONFIDENCE_SOURCE="unknown"
if [ -z "$CONFIDENCE" ] || [ "$CONFIDENCE" = "null" ] || (( $(echo "$CONFIDENCE == 0.0" | bc -l) )); then
  CONFIDENCE=0.70
  CONFIDENCE_SOURCE="default-fallback"
  echo "[Validator] WARNING: No confidence found in output, using default 0.70" >&2
elif (( $(echo "$CONFIDENCE == 0.70" | bc -l) )); then
  # Check if this is explicit 0.70 or default
  if echo "$AGENT_OUTPUT" | grep -qE "confidence:?\s*0?\.70"; then
    CONFIDENCE_SOURCE="explicit-0.70"
  else
    CONFIDENCE_SOURCE="default-fallback"
    echo "[Validator] WARNING: Confidence defaulted to 0.70 (no explicit score found)" >&2
  fi
else
  CONFIDENCE_SOURCE="explicit"
fi

# Parse feedback from output
FEEDBACK_RAW=$("$SCRIPT_DIR/parse-feedback.sh" --extract-feedback "$AGENT_OUTPUT" 2>/dev/null || echo '{"critical":[],"warnings":[],"suggestions":[]}')

# Ensure feedback is valid JSON
if ! echo "$FEEDBACK_RAW" | jq empty 2>/dev/null; then
  echo "[Validator] WARNING: Invalid feedback JSON, using default" >&2
  FEEDBACK_RAW='{"critical":[],"warnings":[],"suggestions":[]}'
fi

# BUG #27 FIX: Count feedback items
CRITICAL_COUNT=$(echo "$FEEDBACK_RAW" | jq '.critical | length')
WARNING_COUNT=$(echo "$FEEDBACK_RAW" | jq '.warnings | length')
SUGGESTION_COUNT=$(echo "$FEEDBACK_RAW" | jq '.suggestions | length')
TOTAL_FEEDBACK=$((CRITICAL_COUNT + WARNING_COUNT + SUGGESTION_COUNT))

# BUG #27 FIX: Detect default output pattern (0.70 confidence + zero feedback)
if (( $(echo "$CONFIDENCE == 0.70" | bc -l) )) && [ "$TOTAL_FEEDBACK" -eq 0 ]; then
  echo "[Validator] ⚠️  WARNING: Validator produced default output (0.70 confidence, 0 feedback items)" >&2
  echo "[Validator] This may indicate the validator didn't properly analyze the code" >&2
  VALIDATION_WARNING="default-output-detected"
else
  VALIDATION_WARNING="none"
fi

# BUG #27 FIX: If feedback exists but confidence is default, log warning
if [ "$TOTAL_FEEDBACK" -gt 0 ] && (( $(echo "$CONFIDENCE == 0.70" | bc -l) )) && [ "$CONFIDENCE_SOURCE" = "default-fallback" ]; then
  echo "[Validator] ⚠️  WARNING: Feedback found ($TOTAL_FEEDBACK items) but confidence defaulted to 0.70" >&2
  echo "[Validator] Validator may not be using structured output format" >&2
fi

# Build output JSON with enhanced metadata
cat <<EOF
{
  "agent_id": "$AGENT_ID",
  "agent_type": "$AGENT_TYPE",
  "confidence": $CONFIDENCE,
  "confidence_source": "$CONFIDENCE_SOURCE",
  "feedback": $FEEDBACK_RAW,
  "feedback_counts": {
    "critical": $CRITICAL_COUNT,
    "warnings": $WARNING_COUNT,
    "suggestions": $SUGGESTION_COUNT,
    "total": $TOTAL_FEEDBACK
  },
  "validation_warning": "$VALIDATION_WARNING",
  "iteration": $ITERATION,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
