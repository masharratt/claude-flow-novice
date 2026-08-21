#!/usr/bin/env bash
# CFN Unified Test Runner
# Version: 1.0.0
# Purpose: Run all test suites with benchmarking and regression detection

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Two distinct anchors. CFN_ROOT is the shared CFN source tree (this repo), which is
# what tests/ refers to: this runner drives THIS repo test sources. PROJECT_DATA_ROOT
# is the invoking project, which owns .artifacts/ (the benchmark DB is per-project
# output). A BASH_SOURCE root must never be used for .artifacts/: it resolves into
# the CFN checkout that every project shares by symlink.
CFN_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
PROJECT_DATA_ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
DB_FILE="$PROJECT_DATA_ROOT/.artifacts/test-benchmarks.db"

# Parameters
SUITE="all"
BENCHMARK=false
DETECT_REGRESSIONS=false
THRESHOLD=0.10
PARALLEL=false
OUTPUT_FORMAT="text"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --suite)
      SUITE="$2"
      shift 2
      ;;
    --benchmark)
      BENCHMARK=true
      shift
      ;;
    --detect-regressions)
      DETECT_REGRESSIONS=true
      shift
      ;;
    --threshold)
      THRESHOLD="$2"
      shift 2
      ;;
    --parallel)
      PARALLEL=true
      shift
      ;;
    --output)
      OUTPUT_FORMAT="$2"
      shift 2
      ;;
    *)
      echo "Unknown parameter: $1"
      exit 1
      ;;
  esac
done

# Initialize benchmark database if needed
if [ "$BENCHMARK" = true ] && [ ! -f "$DB_FILE" ]; then
  echo -e "${BLUE}[INFO]${NC} Initializing benchmark database..."
  "$SCRIPT_DIR/init-benchmark-db.sh"
fi

# Get git info
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# Start test run
START_TIME=$(date +%s)
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

echo -e "${GREEN}=========================================="
echo "CFN Test Suite Runner"
echo -e "==========================================${NC}"
echo "Suite: $SUITE"
echo "Benchmark: $BENCHMARK"
echo "Detect Regressions: $DETECT_REGRESSIONS"
echo "Git: $GIT_BRANCH @ $GIT_COMMIT"
echo ""

# Hello World suite: removed 2026-08-20 (dead-artifacts cleanup).
# tests/hello-world/ was archived wholesale to tests/archive/{legacy-v1,experimental}/hello-world/
# -- it did NOT become tests/integration/hello-world/ (that holds an unrelated trivial test).
# Verified broken from the archive location, not just relocated:
#   Layer 0 (layer0-tool-validation.js): spawns via a cwd built from a relative path
#     hardcoded for the original tests/hello-world/ depth; from the archive it resolves
#     to the wrong directory, so `npx claude-flow-novice agent ...` fails with
#     "npm error could not determine executable to run". 0/3 agents spawn.
#   Layers 5-7 (coordinator-spawning/review/error-retry): `import { createClient } from
#     'redis'` -- this repo no longer depends on the `redis` npm package (migrated to
#     ioredis). They fail at module-resolution time (ERR_MODULE_NOT_FOUND), before ever
#     attempting a Redis connection, so this is not fixable by starting Redis.
# If reviving this suite: fix the layer0 cwd math for the new archive depth, port
# layers 5-7 to ioredis, and point at tests/archive/legacy-v1/hello-world/ (or
# tests/archive/experimental/hello-world/, which has more files). Do not point at
# tests/hello-world/ (removed) or tests/integration/hello-world/ (unrelated test).
if [ "$SUITE" = "hello-world" ]; then
  # Exit non-zero deliberately. Falling through would run zero tests and print a
  # summary, and a caller that asked for a suite and got a clean exit reasonably
  # reads that as "the suite passed".
  echo -e "${YELLOW}[WARN]${NC} The hello-world suite was archived 2026-08-20 and does not currently run." >&2
  echo -e "${YELLOW}[WARN]${NC} See the comment above run-all-tests.sh:98 for what reviving it needs." >&2
  echo -e "${YELLOW}[WARN]${NC} Refusing to report a result for a suite that executed nothing." >&2
  exit 2
fi

# Run CFN E2E tests
if [ "$SUITE" = "all" ] || [ "$SUITE" = "cfn-e2e" ]; then
  echo -e "${BLUE}[INFO]${NC} Running CFN E2E tests..."
  
  E2E_START=$(date +%s)
  
  # Run E2E test and capture results
  if timeout 600 bash "$CFN_ROOT/tests/cfn-v3/test-e2e-cfn-loop.sh" > /tmp/e2e-output.log 2>&1; then
    E2E_EXIT=0
  else
    E2E_EXIT=$?
  fi
  
  # Parse results
  E2E_PASSED=$(grep -c "PASS" /tmp/e2e-output.log || echo 0)
  E2E_FAILED=$(grep -c "FAIL" /tmp/e2e-output.log || echo 0)
  E2E_SKIPPED=$(grep -c "SKIPPED" /tmp/e2e-output.log || echo 0)
  
  if [ $E2E_EXIT -eq 0 ]; then
    echo -e "${GREEN}✅ CFN E2E: PASSED${NC}"
  else
    echo -e "${RED}❌ CFN E2E: FAILED (exit $E2E_EXIT)${NC}"
  fi
  
  E2E_END=$(date +%s)
  E2E_DURATION=$((E2E_END - E2E_START))
  
  echo -e "${BLUE}CFN E2E: ${E2E_PASSED} passed, ${E2E_FAILED} failed, ${E2E_SKIPPED} skipped (${E2E_DURATION}s)${NC}"
  echo ""
  
  TOTAL_TESTS=$((TOTAL_TESTS + E2E_PASSED + E2E_FAILED + E2E_SKIPPED))
  PASSED_TESTS=$((PASSED_TESTS + E2E_PASSED))
  FAILED_TESTS=$((FAILED_TESTS + E2E_FAILED))
  SKIPPED_TESTS=$((SKIPPED_TESTS + E2E_SKIPPED))
fi

END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))
# A suite that ran nothing has no rate. Without this guard awk dies with
# "division by zero attempted" and the script exits 1 for that accidental
# reason instead of for anything about the tests.
if [ "$TOTAL_TESTS" -gt 0 ]; then
  SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS / $TOTAL_TESTS) * 100}")
else
  SUCCESS_RATE="n/a"
fi

# Summary
echo -e "${GREEN}=========================================="
echo "Test Summary"
echo -e "==========================================${NC}"
echo "Total: $TOTAL_TESTS tests"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo "Skipped: $SKIPPED_TESTS"
echo "Duration: ${TOTAL_DURATION}s"
echo "Success Rate: ${SUCCESS_RATE}%"
echo ""

# Store benchmarks
if [ "$BENCHMARK" = true ]; then
  echo -e "${BLUE}[INFO]${NC} Storing benchmarks..."
  "$SCRIPT_DIR/store-benchmarks.sh" \
    --suite "$SUITE" \
    --total "$TOTAL_TESTS" \
    --passed "$PASSED_TESTS" \
    --failed "$FAILED_TESTS" \
    --skipped "$SKIPPED_TESTS" \
    --duration "$TOTAL_DURATION" \
    --commit "$GIT_COMMIT" \
    --branch "$GIT_BRANCH"
fi

# Detect regressions
if [ "$DETECT_REGRESSIONS" = true ]; then
  echo -e "${BLUE}[INFO]${NC} Detecting regressions..."
  if ! "$SCRIPT_DIR/detect-regressions.sh" --threshold "$THRESHOLD"; then
    echo -e "${YELLOW}⚠️  Regressions detected!${NC}"
  fi
fi

# Exit with failure if tests failed
if [ $FAILED_TESTS -gt 0 ]; then
  exit 1
fi
