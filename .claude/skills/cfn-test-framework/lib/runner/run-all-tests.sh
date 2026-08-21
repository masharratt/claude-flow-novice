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

# Run Hello World tests
if [ "$SUITE" = "all" ] || [ "$SUITE" = "hello-world" ]; then
  echo -e "${BLUE}[INFO]${NC} Running Hello World tests..."
  
  HW_START=$(date +%s)
  HW_PASSED=0
  HW_FAILED=0
  HW_SKIPPED=0
  
  # Layer 0
  if timeout 90 node "$CFN_ROOT/tests/hello-world/layer0-tool-validation.js" > /tmp/hw-layer0.log 2>&1; then
    echo -e "${GREEN}✅ Layer 0: PASSED${NC}"
    ((HW_PASSED++))
  else
    echo -e "${RED}❌ Layer 0: FAILED${NC}"
    ((HW_FAILED++))
  fi
  
  # Layer 5
  if timeout 180 node "$CFN_ROOT/tests/hello-world/layer5-coordinator-spawning.js" > /tmp/hw-layer5.log 2>&1; then
    echo -e "${GREEN}✅ Layer 5: PASSED${NC}"
    ((HW_PASSED++))
  else
    echo -e "${RED}❌ Layer 5: FAILED${NC}"
    ((HW_FAILED++))
  fi
  
  # Layer 6
  if timeout 240 node "$CFN_ROOT/tests/hello-world/layer6-coordinator-review.js" > /tmp/hw-layer6.log 2>&1; then
    echo -e "${GREEN}✅ Layer 6: PASSED${NC}"
    ((HW_PASSED++))
  else
    echo -e "${RED}❌ Layer 6: FAILED${NC}"
    ((HW_FAILED++))
  fi
  
  # Layer 7
  if timeout 200 node "$CFN_ROOT/tests/hello-world/layer7-coordinator-error-retry.js" > /tmp/hw-layer7.log 2>&1; then
    echo -e "${GREEN}✅ Layer 7: PASSED${NC}"
    ((HW_PASSED++))
  else
    echo -e "${RED}❌ Layer 7: FAILED${NC}"
    ((HW_FAILED++))
  fi
  
  HW_END=$(date +%s)
  HW_DURATION=$((HW_END - HW_START))
  
  echo -e "${BLUE}Hello World: ${HW_PASSED} passed, ${HW_FAILED} failed, ${HW_SKIPPED} skipped (${HW_DURATION}s)${NC}"
  echo ""
  
  TOTAL_TESTS=$((TOTAL_TESTS + HW_PASSED + HW_FAILED + HW_SKIPPED))
  PASSED_TESTS=$((PASSED_TESTS + HW_PASSED))
  FAILED_TESTS=$((FAILED_TESTS + HW_FAILED))
  SKIPPED_TESTS=$((SKIPPED_TESTS + HW_SKIPPED))
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
SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS / $TOTAL_TESTS) * 100}")

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
