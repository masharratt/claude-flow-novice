#!/bin/bash
set -e

# Resolve the canonical pipeline by absolute path. This script is reached from
# every project through the ~/.claude/skills reverse symlink, so readlink -f
# first or SCRIPT_DIR lands in $HOME; then prefer git for the repo root and fall
# back to the known depth (.claude/skills/cfn-edit-safety/lib/hooks -> repo).
# The previous `node config/hooks/post-edit-pipeline.js` was cwd-relative and
# resolved only when the caller happened to be sitting in the CFN repo root.
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"
[ -n "$REPO_ROOT" ] || REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
POST_EDIT_PIPELINE="$REPO_ROOT/.claude/hooks/post-edit-pipeline.js"

RESULTS_FILE=".artifacts/analytics/root-warning-test.json"
LOG_FILE=".artifacts/logs/post-edit-pipeline.log"
mkdir -p .artifacts/analytics .artifacts/logs

echo "═══════════════════════════════════════════════════════════"
echo "🧪 Testing ROOT_WARNING Detection (50 test files)"
echo "Hook Pipeline: Detect files in root, warn with suggested location"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Track results
TOTAL_FILES=0
WARNINGS_DETECTED=0
FAILED_DETECTION=0
declare -a FAILED_TESTS

test_root_warning() {
  local filename=$1
  local expected_location=$2

  TOTAL_FILES=$((TOTAL_FILES + 1))

  # Create file in root directory (trigger ROOT_WARNING)
  echo "Test content $TOTAL_FILES - $(date)" > "$filename"

  echo -n "[Test $TOTAL_FILES] Creating $filename in root... "

  # Run post-edit hook to detect ROOT_WARNING
  local warning_detected=false
  local suggested=""

  # Check if hook script exists
  if [ -f "$POST_EDIT_PIPELINE" ]; then
    # Run actual hook (captures output)
    HOOK_OUTPUT=$(node "$POST_EDIT_PIPELINE" "$filename" --memory-key "test/root-warning/$TOTAL_FILES" 2>&1)

    # Check if ROOT_WARNING was printed
    if echo "$HOOK_OUTPUT" | grep -q "ROOT DIRECTORY WARNING"; then
      warning_detected=true
      # Extract suggested location from output
      suggested=$(echo "$HOOK_OUTPUT" | grep -A 1 "SUGGESTED LOCATIONS" | tail -1 | sed 's/.*\. \(.*\) (.*/\1/' | xargs)
    fi

    # Also check log file if it exists
    if [ -f "$LOG_FILE" ]; then
      LAST_LOG=$(tail -1 "$LOG_FILE" 2>/dev/null || echo '{}')
      status=$(echo "$LAST_LOG" | jq -r '.status // "UNKNOWN"' 2>/dev/null || echo "UNKNOWN")
      if [ "$status" = "ROOT_WARNING" ]; then
        warning_detected=true
      fi
    fi
  fi

  # Validate warning detection
  if [ "$warning_detected" = true ]; then
    echo "✅ WARNING detected (suggested: $suggested or similar)"
    WARNINGS_DETECTED=$((WARNINGS_DETECTED + 1))
  else
    echo "❌ No WARNING detected"
    FAILED_DETECTION=$((FAILED_DETECTION + 1))
    FAILED_TESTS+=("$filename (expected warning)")
  fi

  # Cleanup
  rm -f "$filename"
}

echo "──────────────────────────────────────"
echo "Testing source files (10 tests)"
echo "──────────────────────────────────────"
for i in {1..10}; do
  test_root_warning "test-source-$i.js" "src/test-source-$i.js"
done

echo ""
echo "──────────────────────────────────────"
echo "Testing documentation files (10 tests)"
echo "──────────────────────────────────────"
for i in {1..10}; do
  test_root_warning "test-doc-$i.md" "docs/test-doc-$i.md"
done

echo ""
echo "──────────────────────────────────────"
echo "Testing configuration files (10 tests)"
echo "──────────────────────────────────────"
for i in {1..10}; do
  test_root_warning "test-config-$i.json" "config/test-config-$i.json"
done

echo ""
echo "──────────────────────────────────────"
echo "Testing test files (10 tests)"
echo "──────────────────────────────────────"
for i in {1..10}; do
  test_root_warning "test-spec-$i.test.js" "tests/test-spec-$i.test.js"
done

echo ""
echo "──────────────────────────────────────"
echo "Testing script files (10 tests)"
echo "──────────────────────────────────────"
for i in {1..10}; do
  test_root_warning "test-script-$i.sh" "scripts/test-script-$i.sh"
done

# Calculate detection rate
DETECTION_RATE=$(echo "scale=2; ($WARNINGS_DETECTED / $TOTAL_FILES) * 100" | bc)

# Generate report
cat > $RESULTS_FILE << REPORT
{
  "total_files_tested": $TOTAL_FILES,
  "warnings_detected": $WARNINGS_DETECTED,
  "failed_detection": $FAILED_DETECTION,
  "detection_rate": $DETECTION_RATE,
  "passed": $(echo "$DETECTION_RATE == 100.00" | bc -l | grep -q 1 && echo "true" || echo "false"),
  "threshold": 100,
  "test_type": "warning_detection",
  "test_date": "$(date -I)"
}
REPORT

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "TEST RESULTS"
echo "═══════════════════════════════════════════════════════════"
cat $RESULTS_FILE
echo ""

if [ $FAILED_DETECTION -gt 0 ]; then
  echo "⚠️  Failed tests:"
  for test in "${FAILED_TESTS[@]}"; do
    echo "   - $test"
  done
  echo ""
fi

if echo "$DETECTION_RATE == 100.00" | bc -l | grep -q 1; then
  echo "✅ SUCCESS: 100% ROOT_WARNING detection rate ($WARNINGS_DETECTED/$TOTAL_FILES)"
  exit 0
else
  echo "❌ FAILED: ${DETECTION_RATE}% detection rate ($WARNINGS_DETECTED/$TOTAL_FILES detected)"
  exit 1
fi
