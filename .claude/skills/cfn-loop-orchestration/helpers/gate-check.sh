#!/usr/bin/env bash

##############################################################################
# Gate Check Helper - Test-Driven Validation with Hybrid Fallback
# Validates Loop 3 self-assessment using test-driven or confidence-based strategies
#
# Usage:
#   gate-check.sh --task-id <id> \
#                 --agents <agent1,agent2,...> \
#                 --threshold <0.0-1.0> \
#                 --min-quorum <n|n%|0.n> \
#                 [--mode <mvp|standard|enterprise>] \
#                 [--success-criteria <json>] \
#                 [--strategy <test-driven|confidence|auto>]
#
# Environment:
#   CFN_GATE_STRATEGY: test-driven|confidence|auto (default: auto)
#
# Returns:
#   Exit 0: Gate passed
#   Exit 1: Gate failed (needs iteration)
##############################################################################

set -euo pipefail

# Script directory for helper resolution
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# SECURITY FIX #1: Path Traversal Prevention (CWE-22)
# Validate PROJECT_ROOT is within expected location to prevent symlink attacks
EXPECTED_PREFIX="/home/user/claude-flow-novice"
if [[ ! "$PROJECT_ROOT" =~ ^${EXPECTED_PREFIX//./\\.} ]]; then
    echo "❌ SECURITY ERROR: Invalid project root detected" >&2
    echo "   Expected prefix: $EXPECTED_PREFIX" >&2
    echo "   Actual path: $PROJECT_ROOT" >&2
    echo "   Risk: Path traversal / symlink attack" >&2
    exit 1
fi

# Parameters
TASK_ID=""
AGENTS=""
THRESHOLD=""
MIN_QUORUM=""
MODE="standard"
SUCCESS_CRITERIA=""
STRATEGY="${CFN_GATE_STRATEGY:-auto}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --agents) AGENTS="$2"; shift 2 ;;
    --threshold) THRESHOLD="$2"; shift 2 ;;
    --min-quorum) MIN_QUORUM="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --success-criteria) SUCCESS_CRITERIA="$2"; shift 2 ;;
    --strategy) STRATEGY="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validation
if [ -z "$TASK_ID" ] || [ -z "$AGENTS" ] || [ -z "$THRESHOLD" ] || [ -z "$MIN_QUORUM" ]; then
  echo "Error: Missing required parameters" >&2
  exit 1
fi

##############################################################################
# Helper Functions
##############################################################################

# Validate JSON structure of success criteria
# SECURITY FIX #2: JSON Schema Validation (CWE-400)
# Prevents DoS via excessively large test suite arrays and invalid field values
validate_success_criteria() {
  local CRITERIA="$1"
  local MAX_TEST_SUITES=50  # DoS prevention: max 50 test suites
  local MAX_FIELD_LENGTH=256  # Field name length limit
  local PASS_THRESHOLD_MIN=0.0
  local PASS_THRESHOLD_MAX=1.0
  local TIMEOUT_MIN=1
  local TIMEOUT_MAX=3600

  if [ -z "$CRITERIA" ]; then
    echo "❌ No success criteria provided" >&2
    return 1
  fi

  # Validate JSON structure
  if ! echo "$CRITERIA" | jq empty 2>/dev/null; then
    echo "❌ Invalid JSON in success criteria" >&2
    return 1
  fi

  # Check for required fields
  if ! echo "$CRITERIA" | jq -e '.test_suites' >/dev/null 2>&1; then
    echo "❌ Missing test_suites array in success criteria" >&2
    return 1
  fi

  # SECURITY FIX #2a: Array size validation - prevent DoS
  local TEST_SUITE_COUNT
  TEST_SUITE_COUNT=$(echo "$CRITERIA" | jq '.test_suites | length')

  if [ -z "$TEST_SUITE_COUNT" ] || [ "$TEST_SUITE_COUNT" -lt 0 ]; then
    echo "❌ Invalid test_suites array" >&2
    return 1
  fi

  if [ "$TEST_SUITE_COUNT" -gt "$MAX_TEST_SUITES" ]; then
    echo "❌ SECURITY ERROR: test_suites array exceeds maximum size" >&2
    echo "   Count: $TEST_SUITE_COUNT (max: $MAX_TEST_SUITES)" >&2
    echo "   Risk: DoS via resource exhaustion" >&2
    return 1
  fi

  # SECURITY FIX #2b: Field-level validation
  local SUITE_INDEX=0
  while [ "$SUITE_INDEX" -lt "$TEST_SUITE_COUNT" ]; do
    local SUITE
    SUITE=$(echo "$CRITERIA" | jq ".test_suites[$SUITE_INDEX]")

    # Validate pass_threshold (0.0-1.0)
    local PASS_THRESHOLD
    PASS_THRESHOLD=$(echo "$SUITE" | jq -r '.pass_threshold // 0.5')

    if ! [[ "$PASS_THRESHOLD" =~ ^[0-9]+\.?[0-9]*$ ]]; then
      echo "❌ Invalid pass_threshold in test suite $SUITE_INDEX: $PASS_THRESHOLD" >&2
      return 1
    fi

    # Use bc for floating point comparison
    if (( $(echo "$PASS_THRESHOLD < $PASS_THRESHOLD_MIN" | bc -l) )) || \
       (( $(echo "$PASS_THRESHOLD > $PASS_THRESHOLD_MAX" | bc -l) )); then
      echo "❌ pass_threshold out of range [0.0-1.0] in suite $SUITE_INDEX: $PASS_THRESHOLD" >&2
      return 1
    fi

    # SECURITY FIX #2c: Timeout range validation (1-3600 seconds)
    local TIMEOUT
    TIMEOUT=$(echo "$SUITE" | jq -r '.timeout // 300')

    if ! [[ "$TIMEOUT" =~ ^[0-9]+$ ]]; then
      echo "❌ Invalid timeout in test suite $SUITE_INDEX: $TIMEOUT (must be integer)" >&2
      return 1
    fi

    if [ "$TIMEOUT" -lt "$TIMEOUT_MIN" ] || [ "$TIMEOUT" -gt "$TIMEOUT_MAX" ]; then
      echo "❌ Timeout out of range [${TIMEOUT_MIN}-${TIMEOUT_MAX}s] in suite $SUITE_INDEX: ${TIMEOUT}s" >&2
      return 1
    fi

    # Validate suite name length
    local SUITE_NAME
    SUITE_NAME=$(echo "$SUITE" | jq -r '.name // "unnamed"')

    if [ ${#SUITE_NAME} -gt "$MAX_FIELD_LENGTH" ]; then
      echo "❌ Test suite name exceeds maximum length in suite $SUITE_INDEX" >&2
      return 1
    fi

    SUITE_INDEX=$((SUITE_INDEX + 1))
  done

  return 0
}

# Check if success criteria exists and is valid
has_success_criteria() {
  if [ -z "$SUCCESS_CRITERIA" ]; then
    return 1
  fi

  validate_success_criteria "$SUCCESS_CRITERIA" >/dev/null 2>&1
}

# Get mode-specific test pass threshold
get_mode_threshold() {
  local MODE="$1"

  case "$MODE" in
    mvp) echo "0.80" ;;
    standard) echo "0.95" ;;
    enterprise) echo "0.99" ;;
    *) echo "0.95" ;;  # Default to standard
  esac
}

# Validate command safety (prevent shell injection)
validate_command_safety() {
  local COMMAND="$1"

  # Check for dangerous shell patterns
  # Allow: && (AND operator), || (OR operator)
  # Block: ; (command separator), | (pipe), > < (redirects), ` (backticks), $() (command substitution), {} (brace expansion)

  # Remove safe operators first
  local SANITIZED="${COMMAND//&&/}"
  SANITIZED="${SANITIZED//||/}"

  # Now check for remaining dangerous metacharacters
  if [[ "$SANITIZED" =~ [\;\|\>\<\`\$\(\)\{\}] ]]; then
    echo "❌ Unsafe command detected: contains dangerous shell metacharacters" >&2
    echo "   Blocked patterns: ; | > < \` \$() {}" >&2
    return 1
  fi

  return 0
}

# Check if command is required or optional
is_required() {
  local SUITE_JSON="$1"
  local REQUIRED=$(echo "$SUITE_JSON" | jq -r '.required // true')

  [ "$REQUIRED" = "true" ]
}

# Execute a single test suite
execute_test_suite() {
  local SUITE_JSON="$1"
  local SUITE_NAME=$(echo "$SUITE_JSON" | jq -r '.name // "unnamed"')
  local COMMAND=$(echo "$SUITE_JSON" | jq -r '.command')
  local TIMEOUT=$(echo "$SUITE_JSON" | jq -r '.timeout // 300')
  local FRAMEWORK=$(echo "$SUITE_JSON" | jq -r '.framework // "auto"')

  echo "  Executing test suite: $SUITE_NAME" >&2

  # Validate command safety
  if ! validate_command_safety "$COMMAND"; then
    echo "    ❌ Command validation failed" >&2
    return 1
  fi

  # Execute with timeout
  local OUTPUT
  local EXIT_CODE=0

  OUTPUT=$(cd "$PROJECT_ROOT" && timeout "$TIMEOUT" bash -c "$COMMAND" 2>&1) || EXIT_CODE=$?

  if [ $EXIT_CODE -eq 124 ]; then
    echo "    ⚠️  Test execution timed out after ${TIMEOUT}s" >&2
    echo '{"pass_rate": 0.0, "passed": 0, "failed": 0, "total": 0, "status": "timeout"}'
    return 1
  elif [ $EXIT_CODE -ne 0 ]; then
    echo "    ⚠️  Test execution failed with exit code $EXIT_CODE" >&2
  fi

  # Parse test results
  local RESULTS
  if [ -x "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh" ]; then
    # Use dedicated parser if available (expects positional params: framework, output)
    RESULTS=$("$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh" \
      "$FRAMEWORK" \
      "$OUTPUT" 2>/dev/null) || {
      echo "    ⚠️  Failed to parse test results" >&2
      RESULTS='{"pass_rate": 0.0, "passed": 0, "failed": 0, "total": 0, "status": "parse_error"}'
    }
  else
    # Fallback: simple pattern matching
    RESULTS=$(parse_test_results_fallback "$OUTPUT" "$FRAMEWORK" "$EXIT_CODE")
  fi

  local PASS_RATE=$(echo "$RESULTS" | jq -r '.pass_rate // 0.0')
  local PASSED=$(echo "$RESULTS" | jq -r '.passed // 0')
  local TOTAL=$(echo "$RESULTS" | jq -r '.total // 0')

  echo "    Pass rate: $PASS_RATE ($PASSED/$TOTAL tests)" >&2

  echo "$RESULTS"
}

# Fallback test result parser (simple pattern matching)
parse_test_results_fallback() {
  local OUTPUT="$1"
  local FRAMEWORK="$2"
  local EXIT_CODE="$3"

  local PASSED=0
  local FAILED=0
  local TOTAL=0

  # Try common test output patterns
  if echo "$OUTPUT" | grep -qE "([0-9]+) passed.*([0-9]+) failed"; then
    PASSED=$(echo "$OUTPUT" | grep -oE "([0-9]+) passed" | grep -oE "[0-9]+" | head -1)
    FAILED=$(echo "$OUTPUT" | grep -oE "([0-9]+) failed" | grep -oE "[0-9]+" | head -1)
  elif echo "$OUTPUT" | grep -qE "([0-9]+)/([0-9]+) tests? passed"; then
    PASSED=$(echo "$OUTPUT" | grep -oE "([0-9]+)/([0-9]+)" | cut -d'/' -f1)
    TOTAL=$(echo "$OUTPUT" | grep -oE "([0-9]+)/([0-9]+)" | cut -d'/' -f2)
    FAILED=$((TOTAL - PASSED))
  fi

  TOTAL=$((PASSED + FAILED))

  # Calculate pass rate
  local PASS_RATE="0.0"
  if [ $TOTAL -gt 0 ]; then
    PASS_RATE=$(echo "scale=2; $PASSED / $TOTAL" | bc -l)
  elif [ $EXIT_CODE -eq 0 ]; then
    # No test output but exit code 0 - assume success
    PASS_RATE="1.0"
    PASSED=1
    TOTAL=1
  fi

  echo "{\"pass_rate\": $PASS_RATE, \"passed\": $PASSED, \"failed\": $FAILED, \"total\": $TOTAL, \"status\": \"parsed\"}"
}

# Calculate aggregate pass rate from multiple test suites
calculate_aggregate_pass_rate() {
  local RESULTS_FILE="$1"

  local TOTAL_PASSED=0
  local TOTAL_TESTS=0

  while IFS= read -r RESULT; do
    local PASSED=$(echo "$RESULT" | jq -r '.passed // 0')
    local TOTAL=$(echo "$RESULT" | jq -r '.total // 0')

    TOTAL_PASSED=$((TOTAL_PASSED + PASSED))
    TOTAL_TESTS=$((TOTAL_TESTS + TOTAL))
  done < "$RESULTS_FILE"

  if [ $TOTAL_TESTS -eq 0 ]; then
    echo "0.0"
  else
    echo "scale=4; $TOTAL_PASSED / $TOTAL_TESTS" | bc -l
  fi
}

# Store test results (Redis for CLI mode, file for Task mode)
store_test_results() {
  local TASK_ID="$1"
  local PASS_RATE="$2"
  local RESULTS_FILE="$3"

  # Check if running in CLI mode (Redis available)
  if command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then
    # Store in Redis
    redis-cli HSET "task:$TASK_ID:gate" "test_pass_rate" "$PASS_RATE" >/dev/null
    redis-cli HSET "task:$TASK_ID:gate" "test_results" "$(cat "$RESULTS_FILE")" >/dev/null
    redis-cli EXPIRE "task:$TASK_ID:gate" 86400 >/dev/null  # 24h TTL
  else
    # Task mode: store in temp file for coordinator to read
    local OUTPUT_DIR="/tmp/cfn-gate-results"
    mkdir -p "$OUTPUT_DIR"
    echo "$PASS_RATE" > "$OUTPUT_DIR/$TASK_ID.pass_rate"
    cp "$RESULTS_FILE" "$OUTPUT_DIR/$TASK_ID.results.json"
  fi
}

# Generate iteration context for failed gate
generate_iteration_context() {
  local TASK_ID="$1"
  local PASS_RATE="$2"
  local THRESHOLD="$3"
  local RESULTS_FILE="$4"

  local CONTEXT_FILE="/tmp/cfn-iteration-context-$TASK_ID.json"

  # Extract failed test details
  local FAILED_TESTS=$(jq -s '[.[] | select(.pass_rate < 1.0)]' "$RESULTS_FILE")

  # Generate context
  cat > "$CONTEXT_FILE" <<EOF
{
  "gate_status": "failed",
  "pass_rate": $PASS_RATE,
  "threshold": $THRESHOLD,
  "gap": $(echo "$THRESHOLD - $PASS_RATE" | bc -l),
  "failed_tests": $FAILED_TESTS,
  "recommendations": [
    "Review failed test suites",
    "Fix implementation issues",
    "Re-run validation"
  ]
}
EOF

  echo "  Iteration context saved to: $CONTEXT_FILE" >&2
}

##############################################################################
# Test-Driven Gate Check
##############################################################################

gate_check_test_driven() {
  local TASK_ID="$1"
  local MODE="$2"
  local SUCCESS_CRITERIA="$3"

  # SECURITY FIX #3: DoS Prevention - Total Time Limit
  # Prevent unbounded test execution time (default 30 min, configurable)
  local MAX_TOTAL_TIME=${CFN_MAX_GATE_TIME:-1800}  # Default 30 minutes (1800 seconds)
  local START_TIME=$(date +%s)

  echo "🧪 Test-Driven Gate Check"
  echo "  Task ID: $TASK_ID"
  echo "  Mode: $MODE"
  echo "  Max Total Time: ${MAX_TOTAL_TIME}s"
  echo ""

  # Validate success criteria
  if ! validate_success_criteria "$SUCCESS_CRITERIA"; then
    echo "❌ Invalid success criteria" >&2
    return 1
  fi

  # Extract test suites
  local TEST_SUITES=$(echo "$SUCCESS_CRITERIA" | jq -c '.test_suites[]')

  if [ -z "$TEST_SUITES" ]; then
    echo "❌ No test suites defined in success criteria" >&2
    return 1
  fi

  # Temporary file for results
  # SECURITY FIX #4: Secure Temp File Permissions
  # Set restrictive permissions (owner read/write only) to prevent information disclosure
  local RESULTS_FILE=$(mktemp)
  chmod 600 "$RESULTS_FILE"
  trap "rm -f '$RESULTS_FILE'" EXIT

  # Execute each test suite
  local SUITE_COUNT=0
  local FAILED_REQUIRED=0

  while IFS= read -r SUITE; do
    SUITE_COUNT=$((SUITE_COUNT + 1))

    # SECURITY FIX #3 (continued): Check total execution time
    local CURRENT_TIME=$(date +%s)
    local ELAPSED=$((CURRENT_TIME - START_TIME))

    if [ $ELAPSED -gt $MAX_TOTAL_TIME ]; then
      echo "❌ SECURITY ERROR: Total execution time exceeded" >&2
      echo "   Elapsed: ${ELAPSED}s > Max: ${MAX_TOTAL_TIME}s" >&2
      echo "   Risk: DoS via unbounded execution" >&2
      return 1
    fi

    local RESULT
    RESULT=$(execute_test_suite "$SUITE") || {
      if is_required "$SUITE"; then
        FAILED_REQUIRED=$((FAILED_REQUIRED + 1))
        echo "    ❌ Required test suite failed" >&2
      fi
    }

    echo "$RESULT" >> "$RESULTS_FILE"
  done <<< "$TEST_SUITES"

  # If any required test suite failed completely, gate fails immediately
  if [ $FAILED_REQUIRED -gt 0 ]; then
    echo ""
    echo "❌ Gate FAILED: $FAILED_REQUIRED required test suite(s) failed completely" >&2
    generate_iteration_context "$TASK_ID" "0.0" "$(get_mode_threshold "$MODE")" "$RESULTS_FILE"
    return 1
  fi

  # Calculate aggregate pass rate
  local TOTAL_PASS_RATE
  TOTAL_PASS_RATE=$(calculate_aggregate_pass_rate "$RESULTS_FILE")

  # Store results
  store_test_results "$TASK_ID" "$TOTAL_PASS_RATE" "$RESULTS_FILE"

  # Get threshold for mode
  local TEST_THRESHOLD
  TEST_THRESHOLD=$(get_mode_threshold "$MODE")

  echo ""
  echo "Test Results Summary:"
  echo "  Aggregate Pass Rate: $TOTAL_PASS_RATE"
  echo "  Required Threshold: $TEST_THRESHOLD ($MODE mode)"
  echo ""

  # Check threshold
  if (( $(echo "$TOTAL_PASS_RATE >= $TEST_THRESHOLD" | bc -l) )); then
    echo "✅ Gate PASSED: Test-driven validation successful"
    return 0
  else
    echo "❌ Gate FAILED: Pass rate below threshold"
    echo "   Gap: $(echo "$TEST_THRESHOLD - $TOTAL_PASS_RATE" | bc -l)"
    generate_iteration_context "$TASK_ID" "$TOTAL_PASS_RATE" "$TEST_THRESHOLD" "$RESULTS_FILE"
    return 1
  fi
}

##############################################################################
# Confidence-Based Gate Check (Original Implementation)
##############################################################################

gate_check_confidence() {
  local TASK_ID="$1"
  local AGENTS="$2"
  local THRESHOLD="$3"
  local MIN_QUORUM="$4"

  # Deprecation warning
  echo "⚠️  Using legacy confidence-based gate check" >&2
  echo "   Consider migrating to test-driven validation" >&2
  echo ""

  # Use Redis Coordination skill to collect confidence scores
  local REDIS_COORD_SKILL="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination"

  echo "Gate Check Configuration:"
  echo "  Task ID: $TASK_ID"
  echo "  Agent IDs: $AGENTS"
  echo "  Min Quorum: $MIN_QUORUM"
  echo ""

  # Collect Loop 3 confidence scores
  local CONSENSUS
  CONSENSUS=$("$REDIS_COORD_SKILL/invoke-waiting-mode.sh" collect \
    --task-id "$TASK_ID" \
    --agent-ids "$AGENTS" \
    --min-quorum "$MIN_QUORUM" 2>/dev/null) || {
    echo "❌ Error: Failed to collect Loop 3 confidence scores" >&2
    echo "   Agent IDs: $AGENTS" >&2
    return 1
  }

  # Validate consensus is a valid number
  if ! [[ "$CONSENSUS" =~ ^[0-9]+\.?[0-9]*$ ]]; then
    echo "⚠️  WARNING: Invalid consensus value: $CONSENSUS (expected numeric)" >&2
    echo "   Defaulting to 0.0" >&2
    CONSENSUS="0.0"
  fi

  echo "Loop 3 Gate Check:"
  echo "  Consensus: $CONSENSUS"
  echo "  Threshold: $THRESHOLD"
  echo "  Required: >= $THRESHOLD"
  echo ""

  # Compare consensus to gate threshold
  if (( $(echo "$CONSENSUS >= $THRESHOLD" | bc -l) )); then
    echo "✅ Gate PASSED - Loop 3 self-validation successful"
    return 0
  else
    echo "❌ Gate FAILED - Loop 3 needs improvement"
    echo "   Gap: $(echo "$THRESHOLD - $CONSENSUS" | bc -l)"
    return 1
  fi
}

##############################################################################
# Main Execution - Strategy Selection
##############################################################################

echo "========================================="
echo "CFN Loop Gate Check v2.0"
echo "Strategy: $STRATEGY"
echo "========================================="
echo ""

case "$STRATEGY" in
  test-driven)
    if [ -z "$SUCCESS_CRITERIA" ]; then
      echo "❌ Error: test-driven strategy requires --success-criteria" >&2
      exit 1
    fi
    gate_check_test_driven "$TASK_ID" "$MODE" "$SUCCESS_CRITERIA"
    ;;

  confidence)
    gate_check_confidence "$TASK_ID" "$AGENTS" "$THRESHOLD" "$MIN_QUORUM"
    ;;

  auto)
    # Hybrid mode: prefer test-driven if criteria exists, fallback to confidence
    if has_success_criteria; then
      echo "Auto-detected: Using test-driven validation" >&2
      echo ""
      gate_check_test_driven "$TASK_ID" "$MODE" "$SUCCESS_CRITERIA"
    else
      echo "Auto-detected: Using confidence-based validation (no success criteria)" >&2
      echo ""
      gate_check_confidence "$TASK_ID" "$AGENTS" "$THRESHOLD" "$MIN_QUORUM"
    fi
    ;;

  *)
    echo "❌ Error: Invalid strategy '$STRATEGY'" >&2
    echo "   Valid options: test-driven, confidence, auto" >&2
    exit 1
    ;;
esac

exit $?
