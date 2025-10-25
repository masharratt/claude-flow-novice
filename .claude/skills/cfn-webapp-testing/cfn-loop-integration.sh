#!/bin/bash
# Webapp Testing Skill - CFN Loop Integration Helper
# Purpose: Helper functions for integrating visual regression testing into CFN Loop workflows

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Function: Capture all screenshots for a component
# Usage: capture_component_screenshots <project> <component> <url> <task-id> <agent-id> [viewports...]
capture_component_screenshots() {
  local PROJECT="$1"
  local COMPONENT="$2"
  local URL="$3"
  local TASK_ID="$4"
  local AGENT_ID="$5"
  shift 5
  local VIEWPORTS=("${@:-1920x1080}")  # Default to desktop

  local STATES=("default" "hover" "error")
  local VARIANTS=("light-mode" "dark-mode")

  echo "Capturing screenshots for component: $COMPONENT" >&2
  local TOTAL=$((${#VIEWPORTS[@]} * ${#STATES[@]} * ${#VARIANTS[@]}))
  local COUNT=0

  for VIEWPORT in "${VIEWPORTS[@]}"; do
    for STATE in "${STATES[@]}"; do
      for VARIANT in "${VARIANTS[@]}"; do
        COUNT=$((COUNT + 1))
        echo "[$COUNT/$TOTAL] Capturing: $VIEWPORT / $STATE / $VARIANT" >&2

        "$SCRIPT_DIR/capture-screenshot.sh" \
          --project "$PROJECT" \
          --component "$COMPONENT" \
          --viewport "$VIEWPORT" \
          --state "$STATE" \
          --variant "$VARIANT" \
          --url "$URL" \
          --task-id "$TASK_ID" \
          --agent-id "$AGENT_ID" || echo "Warning: Failed to capture $VIEWPORT/$STATE/$VARIANT" >&2
      done
    done
  done

  echo "✅ Captured $COUNT screenshots" >&2
}

# Function: Compare all screenshots in task queue to baselines
# Usage: compare_all_screenshots <task-id> [threshold]
compare_all_screenshots() {
  local TASK_ID="$1"
  local THRESHOLD="${2:-0.95}"

  echo "Comparing all screenshots in task queue: $TASK_ID" >&2

  # Get all screenshot keys from Redis queue
  local SCREENSHOT_KEYS=$(redis-cli lrange "screenshot:queue:${TASK_ID}" 0 -1 2>/dev/null || echo "")

  if [ -z "$SCREENSHOT_KEYS" ]; then
    echo "Warning: No screenshots found in queue for task: $TASK_ID" >&2
    return 1
  fi

  local TOTAL=$(echo "$SCREENSHOT_KEYS" | wc -l)
  local COUNT=0
  local PASSED=0
  local FAILED=0
  local NO_BASELINE=0

  echo "$SCREENSHOT_KEYS" | while read -r SCREENSHOT_KEY; do
    [ -z "$SCREENSHOT_KEY" ] && continue

    COUNT=$((COUNT + 1))
    echo "[$COUNT/$TOTAL] Comparing: $SCREENSHOT_KEY" >&2

    RESULT=$("$SCRIPT_DIR/compare-screenshots.sh" \
      --screenshot-key "$SCREENSHOT_KEY" \
      --task-id "$TASK_ID" \
      --threshold "$THRESHOLD" 2>/dev/null || echo '{"status":"error"}')

    STATUS=$(echo "$RESULT" | jq -r '.status')

    case "$STATUS" in
      passed)
        PASSED=$((PASSED + 1))
        echo "  ✅ PASSED ($(echo "$RESULT" | jq -r '.similarity_score'))" >&2
        ;;
      failed)
        FAILED=$((FAILED + 1))
        echo "  ❌ FAILED ($(echo "$RESULT" | jq -r '.diff_percentage')% difference)" >&2
        ;;
      no-baseline)
        NO_BASELINE=$((NO_BASELINE + 1))
        echo "  ⚠️  NO BASELINE" >&2
        ;;
      *)
        echo "  ❌ ERROR" >&2
        ;;
    esac
  done

  # Calculate overall status
  if [ "$FAILED" -eq 0 ] && [ "$NO_BASELINE" -eq 0 ]; then
    echo "✅ All comparisons passed: $PASSED/$TOTAL" >&2
    return 0
  elif [ "$NO_BASELINE" -gt 0 ]; then
    echo "⚠️  Some screenshots lack baselines: $NO_BASELINE missing" >&2
    return 2
  else
    echo "❌ Visual regressions detected: $FAILED/$TOTAL failed" >&2
    return 1
  fi
}

# Function: Calculate validation consensus from comparison results
# Usage: calculate_validation_consensus <task-id>
calculate_validation_consensus() {
  local TASK_ID="$1"

  echo "Calculating validation consensus for task: $TASK_ID" >&2

  # Get all comparison results from Redis
  local DIFF_KEYS=$(redis-cli keys "screenshot:diff:${TASK_ID}:*" 2>/dev/null || echo "")

  if [ -z "$DIFF_KEYS" ]; then
    echo '{"confidence": 0.0, "status": "no-comparisons", "message": "No comparison results found"}' | jq '.'
    return 1
  fi

  local TOTAL=0
  local PASSED=0
  local FAILED=0
  local TOTAL_SIMILARITY=0

  echo "$DIFF_KEYS" | while read -r KEY; do
    [ -z "$KEY" ] && continue

    RESULT=$(redis-cli get "$KEY" 2>/dev/null || echo '{}')
    STATUS=$(echo "$RESULT" | jq -r '.status // "unknown"')
    SIMILARITY=$(echo "$RESULT" | jq -r '.similarity_score // 0')

    TOTAL=$((TOTAL + 1))
    TOTAL_SIMILARITY=$(echo "$TOTAL_SIMILARITY + $SIMILARITY" | bc -l)

    if [ "$STATUS" = "passed" ]; then
      PASSED=$((PASSED + 1))
    elif [ "$STATUS" = "failed" ]; then
      FAILED=$((FAILED + 1))
    fi
  done

  # Calculate average similarity and confidence
  AVG_SIMILARITY=$(echo "scale=4; $TOTAL_SIMILARITY / $TOTAL" | bc -l)
  PASS_RATE=$(echo "scale=4; $PASSED / $TOTAL" | bc -l)

  # Confidence = weighted average of pass rate and similarity
  # Pass rate weighted 60%, average similarity weighted 40%
  CONFIDENCE=$(echo "scale=4; ($PASS_RATE * 0.6) + ($AVG_SIMILARITY * 0.4)" | bc -l)

  # Determine overall status
  if [ "$FAILED" -eq 0 ]; then
    STATUS="passed"
    MESSAGE="All visual regression tests passed"
  else
    STATUS="failed"
    MESSAGE="Visual regressions detected in $FAILED/$TOTAL screenshots"
  fi

  # Output JSON result
  cat <<EOF | jq '.'
{
  "confidence": ${CONFIDENCE},
  "status": "${STATUS}",
  "message": "${MESSAGE}",
  "total_comparisons": ${TOTAL},
  "passed": ${PASSED},
  "failed": ${FAILED},
  "average_similarity": ${AVG_SIMILARITY},
  "pass_rate": ${PASS_RATE},
  "task_id": "${TASK_ID}"
}
EOF
}

# Function: Update all baselines after Product Owner approval
# Usage: update_all_baselines <task-id> <reason> <approved-by>
update_all_baselines() {
  local TASK_ID="$1"
  local REASON="$2"
  local APPROVED_BY="$3"

  echo "Updating baselines for task: $TASK_ID" >&2

  # Get all comparison results from Redis
  local DIFF_KEYS=$(redis-cli keys "screenshot:diff:${TASK_ID}:*" 2>/dev/null || echo "")

  if [ -z "$DIFF_KEYS" ]; then
    echo "Error: No comparison results found for task: $TASK_ID" >&2
    return 1
  fi

  local TOTAL=0
  local UPDATED=0

  echo "$DIFF_KEYS" | while read -r KEY; do
    [ -z "$KEY" ] && continue

    RESULT=$(redis-cli get "$KEY" 2>/dev/null || echo '{}')
    SCREENSHOT_KEY=$(echo "$KEY" | sed "s|screenshot:diff:${TASK_ID}:||")
    CURRENT_FILE=$(echo "$RESULT" | jq -r '.current_path')
    STATUS=$(echo "$RESULT" | jq -r '.status')

    TOTAL=$((TOTAL + 1))

    # Only update if comparison failed (visual change detected)
    if [ "$STATUS" = "failed" ]; then
      echo "[$TOTAL] Updating baseline: $SCREENSHOT_KEY" >&2

      "$SCRIPT_DIR/set-baseline.sh" \
        --screenshot-key "$SCREENSHOT_KEY" \
        --current-file "$CURRENT_FILE" \
        --reason "$REASON (approved by $APPROVED_BY)" >/dev/null 2>&1 && UPDATED=$((UPDATED + 1))
    else
      echo "[$TOTAL] Skipping (no change): $SCREENSHOT_KEY" >&2
    fi
  done

  echo "✅ Updated $UPDATED baselines" >&2
}

# Export functions for use in other scripts
export -f capture_component_screenshots
export -f compare_all_screenshots
export -f calculate_validation_consensus
export -f update_all_baselines

# If script is run directly, show usage
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  cat <<EOF
CFN Loop Integration Helper Functions

Usage: source $0

Available Functions:
  capture_component_screenshots <project> <component> <url> <task-id> <agent-id> [viewports...]
  compare_all_screenshots <task-id> [threshold]
  calculate_validation_consensus <task-id>
  update_all_baselines <task-id> <reason> <approved-by>

Example (Loop 3 - Implementation):
  source ./.claude/skills/webapp-testing/cfn-loop-integration.sh
  capture_component_screenshots "auth-system" "login-form" "http://localhost:3000/login" "\$TASK_ID" "\$AGENT_ID" "1920x1080" "375x667"

Example (Loop 2 - Validation):
  compare_all_screenshots "\$TASK_ID" 0.95
  CONSENSUS=\$(calculate_validation_consensus "\$TASK_ID")
  echo "\$CONSENSUS" | jq -r '.confidence'

Example (Product Owner Decision):
  update_all_baselines "\$TASK_ID" "Approved visual changes from PR #123" "product-owner-agent"

EOF
fi
