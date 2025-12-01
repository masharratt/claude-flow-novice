#!/bin/bash
set -euo pipefail

# Loop 2 Output Processing: Enhanced Validator Output Processing
# BUG #27 FIX: Enforce structured output template and reject defaults
# BUG #30 FIX: Add context sanitization and environment validation

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

# BUG #30 FIX: Context sanitization function
# Sanitizes context by removing dangerous characters and validating JSON structure
validate_and_sanitize_context() {
  local context="$1"
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)

  echo "[Validator] [$timestamp] Sanitizing context (length: ${#context} chars)" >&2
  echo "[Validator] [$timestamp] Context preview: ${context:0:100}..." >&2

  # Strip dangerous characters: null bytes, backticks, $, backslash
  # Also strip control characters and other special chars that can break shell parsing
  local sanitized=$(echo "$context" | tr -d '\0' | sed 's/[`$\\]//g' | sed 's/[[:cntrl:]]/ /g')

  # Log sanitization results
  local removed_chars=$((${#context} - ${#sanitized}))
  if [ "$removed_chars" -gt 0 ]; then
    echo "[Validator] [$timestamp] Sanitized context: removed $removed_chars dangerous characters" >&2
  else
    echo "[Validator] [$timestamp] No dangerous characters found in context" >&2
  fi

  # Validate that context is not empty after sanitization
  if [ -z "$sanitized" ]; then
    echo "ERROR: Context became empty after sanitization" >&2
    return 1
  fi

  echo "$sanitized"
}

# BUG #30 FIX: Environment validation function
# Validates that required environment variables exist before spawning agents
validate_environment() {
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  local missing_vars=()

  echo "[Validator] [$timestamp] Validating environment variables" >&2

  # Check required variables
  if [ -z "${REDIS_HOST:-}" ]; then
    missing_vars+=("REDIS_HOST")
  fi

  if [ -z "${HOME:-}" ]; then
    missing_vars+=("HOME")
  fi

  if [ -z "${PATH:-}" ]; then
    missing_vars+=("PATH")
  fi

  # Log validation results
  if [ ${#missing_vars[@]} -gt 0 ]; then
    echo "ERROR: Missing required environment variables: ${missing_vars[*]}" >&2
    echo "[Validator] [$timestamp] Current environment state:" >&2
    echo "[Validator] REDIS_HOST=${REDIS_HOST:-<not set>}" >&2
    echo "[Validator] HOME=${HOME:-<not set>}" >&2
    echo "[Validator] PATH=${PATH:-<not set>}" >&2
    return 1
  fi

  echo "[Validator] [$timestamp] Environment validation passed" >&2
  echo "[Validator] REDIS_HOST=${REDIS_HOST}" >&2
  echo "[Validator] HOME=${HOME}" >&2
  echo "[Validator] PATH=${PATH:0:100}..." >&2

  return 0
}

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

# BUG #30 FIX: Validate environment before spawning
if ! validate_environment; then
  echo "ERROR: Environment validation failed, cannot spawn validator agent" >&2
  exit 1
fi

# BUG #30 FIX: Sanitize context before passing to agent
SANITIZED_CONTEXT=$(validate_and_sanitize_context "$ENHANCED_CONTEXT")
if [ $? -ne 0 ]; then
  echo "ERROR: Context sanitization failed" >&2
  exit 1
fi

# BUG #30 FIX: Enhanced agent spawning with controlled environment and error capture
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "[Validator] [$TIMESTAMP] Spawning $AGENT_TYPE with sanitized context" >&2
echo "[Validator] [$TIMESTAMP] Sanitized context length: ${#SANITIZED_CONTEXT} chars" >&2

# Capture both stdout and stderr separately, plus exit code
SPAWN_TMP_OUT=$(mktemp)
SPAWN_TMP_ERR=$(mktemp)
EXIT_CODE=0

# Use env -i for controlled environment with explicit variable passing
env -i \
  HOME="$HOME" \
  PATH="$PATH" \
  REDIS_HOST="$REDIS_HOST" \
  timeout "$TIMEOUT" npx claude-flow-novice agent "$AGENT_TYPE" \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" \
    --context "$SANITIZED_CONTEXT" \
  > "$SPAWN_TMP_OUT" 2> "$SPAWN_TMP_ERR" || EXIT_CODE=$?

AGENT_OUTPUT=$(cat "$SPAWN_TMP_OUT")
AGENT_STDERR=$(cat "$SPAWN_TMP_ERR")

# BUG #30 FIX: Enhanced error logging on spawn failure
if [ $EXIT_CODE -ne 0 ]; then
  TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "[Validator] [$TIMESTAMP] ⚠️  Agent spawn failed with exit code: $EXIT_CODE" >&2
  echo "[Validator] [$TIMESTAMP] Agent STDOUT (length: ${#AGENT_OUTPUT}):" >&2
  echo "$AGENT_OUTPUT" >&2
  echo "[Validator] [$TIMESTAMP] Agent STDERR (length: ${#AGENT_STDERR}):" >&2
  echo "$AGENT_STDERR" >&2
  echo "[Validator] [$TIMESTAMP] Context used (first 200 chars): ${SANITIZED_CONTEXT:0:200}..." >&2
fi

# Cleanup temp files
rm -f "$SPAWN_TMP_OUT" "$SPAWN_TMP_ERR"

# Log successful spawn
if [ $EXIT_CODE -eq 0 ]; then
  TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "[Validator] [$TIMESTAMP] Agent spawn successful (output length: ${#AGENT_OUTPUT} chars)" >&2
fi

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
