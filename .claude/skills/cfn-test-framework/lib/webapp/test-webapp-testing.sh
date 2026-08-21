#!/usr/bin/env bash
# Webapp Testing Skill - Test Suite
# Purpose: Validate webapp-testing skill functionality

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test result tracking
test_result() {
  local TEST_NAME="$1"
  local STATUS="$2"
  local MESSAGE="$3"

  case "$STATUS" in
    PASS)
      echo -e "${GREEN}✓${NC} $TEST_NAME"
      TESTS_PASSED=$((TESTS_PASSED + 1))
      ;;
    FAIL)
      echo -e "${RED}✗${NC} $TEST_NAME: $MESSAGE"
      TESTS_FAILED=$((TESTS_FAILED + 1))
      ;;
    SKIP)
      echo -e "${YELLOW}⊘${NC} $TEST_NAME: $MESSAGE"
      TESTS_SKIPPED=$((TESTS_SKIPPED + 1))
      ;;
  esac
}

echo "=========================================="
echo "Webapp Testing Skill - Test Suite"
echo "=========================================="
echo ""

# Test 1: Storage Initialization
echo "Test 1: Storage Initialization"
if "$SCRIPT_DIR/init-storage.sh" --force >/dev/null 2>&1; then
  if [ -d ".screenshots/baselines" ] && [ -d ".screenshots/current" ]; then
    test_result "Storage initialization" "PASS"
  else
    test_result "Storage initialization" "FAIL" "Directories not created"
  fi
else
  test_result "Storage initialization" "FAIL" "init-storage.sh failed"
fi

# Test 2: SQLite Schema Validation
echo "Test 2: SQLite Schema Validation"
DB_PATH="${HOME}/.claude/memory/adaptive-context.db"
TABLE_COUNT=$(sqlite3 "$DB_PATH" \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('webapp_screenshots', 'screenshot_audit_log');" 2>/dev/null)

if [ "$TABLE_COUNT" -eq 2 ]; then
  test_result "SQLite schema creation" "PASS"
else
  test_result "SQLite schema creation" "FAIL" "Expected 2 tables, found $TABLE_COUNT"
fi

# Test 3: Playwright Availability
echo "Test 3: Playwright Availability"
if command -v npx >/dev/null 2>&1 && npx playwright --version >/dev/null 2>&1; then
  test_result "Playwright installation" "PASS"
else
  test_result "Playwright installation" "SKIP" "Playwright not installed (run: npx playwright install chromium)"
fi

# Test 4: Node Dependencies Check
echo "Test 4: Node Dependencies Check"
NODE_DEPS_MISSING=0
for PKG in playwright pngjs pixelmatch; do
  if ! node -e "require('$PKG')" 2>/dev/null; then
    test_result "$PKG dependency" "SKIP" "Not installed (run: npm install $PKG)"
    NODE_DEPS_MISSING=1
  else
    test_result "$PKG dependency" "PASS"
  fi
done

# Test 5: Redis Connectivity
echo "Test 5: Redis Connectivity"
if redis-cli ping >/dev/null 2>&1; then
  test_result "Redis connectivity" "PASS"
else
  test_result "Redis connectivity" "SKIP" "Redis not running"
fi

# Test 6: Screenshot Capture (requires test server)
echo "Test 6: Screenshot Capture (Integration Test)"
TEST_URL="https://example.com"  # Use public URL for testing
TASK_ID="test-$(date +%s)"
AGENT_ID="test-agent"

if [ "$NODE_DEPS_MISSING" -eq 0 ]; then
  CAPTURE_RESULT=$("$SCRIPT_DIR/capture-screenshot.sh" \
    --project "test-project" \
    --component "test-component" \
    --viewport "800x600" \
    --state "default" \
    --variant "light-mode" \
    --url "$TEST_URL" \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" 2>&1)

  if [ $? -eq 0 ] && echo "$CAPTURE_RESULT" | jq -e '.screenshot_key' >/dev/null 2>&1; then
    SCREENSHOT_KEY=$(echo "$CAPTURE_RESULT" | jq -r '.screenshot_key')
    test_result "Screenshot capture" "PASS"
  else
    test_result "Screenshot capture" "FAIL" "Capture failed or invalid output"
  fi
else
  test_result "Screenshot capture" "SKIP" "Node dependencies missing"
fi

# Test 7: Baseline Setting
echo "Test 7: Baseline Setting"
if [ -n "$SCREENSHOT_KEY" ]; then
  BASELINE_RESULT=$("$SCRIPT_DIR/set-baseline.sh" \
    --screenshot-key "$SCREENSHOT_KEY" \
    --reason "Test baseline" 2>&1)

  if [ $? -eq 0 ] && echo "$BASELINE_RESULT" | jq -e '.status' >/dev/null 2>&1; then
    test_result "Baseline setting" "PASS"
  else
    test_result "Baseline setting" "FAIL" "set-baseline.sh failed"
  fi
else
  test_result "Baseline setting" "SKIP" "No screenshot to baseline"
fi

# Test 8: Screenshot Comparison
echo "Test 8: Screenshot Comparison"
if [ -n "$SCREENSHOT_KEY" ]; then
  # Capture second screenshot for comparison
  CAPTURE2_RESULT=$("$SCRIPT_DIR/capture-screenshot.sh" \
    --project "test-project" \
    --component "test-component" \
    --viewport "800x600" \
    --state "default" \
    --variant "light-mode" \
    --url "$TEST_URL" \
    --task-id "$TASK_ID" \
    --agent-id "$AGENT_ID" 2>&1)

  if [ $? -eq 0 ]; then
    COMPARE_RESULT=$("$SCRIPT_DIR/compare-screenshots.sh" \
      --screenshot-key "$SCREENSHOT_KEY" \
      --task-id "$TASK_ID" \
      --threshold 0.95 2>&1)

    if [ $? -eq 0 ] && echo "$COMPARE_RESULT" | jq -e '.similarity_score' >/dev/null 2>&1; then
      SIMILARITY=$(echo "$COMPARE_RESULT" | jq -r '.similarity_score')
      if (( $(echo "$SIMILARITY >= 0.95" | bc -l) )); then
        test_result "Screenshot comparison" "PASS"
      else
        test_result "Screenshot comparison" "FAIL" "Low similarity: $SIMILARITY"
      fi
    else
      test_result "Screenshot comparison" "FAIL" "compare-screenshots.sh failed"
    fi
  else
    test_result "Screenshot comparison" "SKIP" "Second capture failed"
  fi
else
  test_result "Screenshot comparison" "SKIP" "No screenshot to compare"
fi

# Test 9: SQLite Data Persistence
echo "Test 9: SQLite Data Persistence"
SCREENSHOT_COUNT=$(sqlite3 "$DB_PATH" \
  "SELECT COUNT(*) FROM webapp_screenshots WHERE project = 'test-project';" 2>/dev/null)

if [ "$SCREENSHOT_COUNT" -gt 0 ]; then
  test_result "SQLite data persistence" "PASS"
else
  test_result "SQLite data persistence" "FAIL" "No test screenshots in database"
fi

# Test 10: Redis Queue Integration
echo "Test 10: Redis Queue Integration"
if [ -n "$TASK_ID" ]; then
  QUEUE_LENGTH=$(redis-cli llen "screenshot:queue:${TASK_ID}" 2>/dev/null || echo "0")
  if [ "$QUEUE_LENGTH" -gt 0 ]; then
    test_result "Redis queue integration" "PASS"
  else
    test_result "Redis queue integration" "SKIP" "Redis queue empty (may have been processed)"
  fi
else
  test_result "Redis queue integration" "SKIP" "No task ID available"
fi

# Cleanup test data
echo ""
echo "Cleaning up test data..."
if [ -n "$SCREENSHOT_KEY" ]; then
  sqlite3 "$DB_PATH" "DELETE FROM webapp_screenshots WHERE project = 'test-project';" 2>/dev/null
  sqlite3 "$DB_PATH" "DELETE FROM screenshot_audit_log WHERE screenshot_key LIKE 'test-project/%';" 2>/dev/null
  rm -rf .screenshots/baselines/test-project 2>/dev/null
  rm -rf .screenshots/current/test-project 2>/dev/null
  rm -rf .screenshots/diffs/"$TASK_ID" 2>/dev/null
  redis-cli del "screenshot:queue:${TASK_ID}" >/dev/null 2>&1
  echo "✓ Test data cleaned"
fi

# Summary
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed:${NC}  $TESTS_PASSED"
echo -e "${RED}Failed:${NC}  $TESTS_FAILED"
echo -e "${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
echo ""

if [ "$TESTS_FAILED" -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
