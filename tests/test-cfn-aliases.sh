#!/bin/bash
# Test suite for all cfn-* CLI aliases
# Validates that all commands execute correctly and show proper help

set -e

TEST_COUNT=0
PASS_COUNT=0
FAIL_COUNT=0

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test helper
test_cli() {
  local cmd="$1"
  local test_name="$2"
  local expected_output="$3"

  TEST_COUNT=$((TEST_COUNT + 1))
  echo -e "${YELLOW}[TEST $TEST_COUNT]${NC} $test_name"

  if output=$(node "$cmd" 2>&1); then
    if echo "$output" | grep -q "$expected_output"; then
      echo -e "${GREEN}  ✓ PASS${NC}"
      PASS_COUNT=$((PASS_COUNT + 1))
      return 0
    else
      echo -e "${RED}  ✗ FAIL${NC} - Expected output not found"
      echo "  Expected: $expected_output"
      echo "  Got: $(echo "$output" | head -1)"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      return 1
    fi
  else
    echo -e "${RED}  ✗ FAIL${NC} - Command failed to execute"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 1
  fi
}

echo "=========================================="
echo "CFN-* CLI Alias Test Suite"
echo "=========================================="
echo ""

# Test 1: cfn-spawn --help
test_cli "dist/cli/spawn.js --help" \
  "cfn-spawn --help shows usage" \
  "cfn-spawn - Claude Flow Novice Agent Spawner"

# Test 2: cfn-spawn with agent type (dry-run check)
echo -e "${YELLOW}[TEST $((TEST_COUNT + 1))]${NC} cfn-spawn argument parsing"
TEST_COUNT=$((TEST_COUNT + 1))
if timeout 2 node dist/cli/spawn.js agent researcher --task-id test-123 2>&1 | grep -q "Spawning agent: researcher"; then
  echo -e "${GREEN}  ✓ PASS${NC}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}  ✗ FAIL${NC}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Test 3: cfn-loop --help
test_cli "dist/cli/cfn-loop.js --help" \
  "cfn-loop --help shows usage" \
  "cfn-loop - CFN Loop Orchestration CLI"

# Test 4: cfn-loop subcommand parsing
echo -e "${YELLOW}[TEST $((TEST_COUNT + 1))]${NC} cfn-loop single subcommand"
TEST_COUNT=$((TEST_COUNT + 1))
if node dist/cli/cfn-loop.js single "Test task" 2>&1 | grep -q "/cfn-loop-single"; then
  echo -e "${GREEN}  ✓ PASS${NC}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}  ✗ FAIL${NC}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Test 5: cfn-swarm --help
test_cli "dist/cli/cfn-swarm.js --help" \
  "cfn-swarm --help shows usage" \
  "cfn-swarm - Swarm Coordination CLI"

# Test 6: cfn-swarm init parsing
echo -e "${YELLOW}[TEST $((TEST_COUNT + 1))]${NC} cfn-swarm init command"
TEST_COUNT=$((TEST_COUNT + 1))
if node dist/cli/cfn-swarm.js init mesh 2>&1 | grep -q "Topology: mesh"; then
  echo -e "${GREEN}  ✓ PASS${NC}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}  ✗ FAIL${NC}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Test 7: cfn-portal --help
test_cli "dist/cli/cfn-portal.js --help" \
  "cfn-portal --help shows usage" \
  "cfn-portal - Web Portal Management CLI"

# Test 8: cfn-context --help
test_cli "dist/cli/cfn-context.js --help" \
  "cfn-context --help shows usage" \
  "cfn-context - ACE Context Operations CLI"

# Test 9: cfn-context query parsing
echo -e "${YELLOW}[TEST $((TEST_COUNT + 1))]${NC} cfn-context query command"
TEST_COUNT=$((TEST_COUNT + 1))
if node dist/cli/cfn-context.js query "test search" 2>&1 | grep -q "/context-query"; then
  echo -e "${GREEN}  ✓ PASS${NC}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}  ✗ FAIL${NC}"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Test 10: cfn-metrics --help
test_cli "dist/cli/cfn-metrics.js --help" \
  "cfn-metrics --help shows usage" \
  "cfn-metrics - Monitoring and Analytics CLI"

# Test 11: cfn-redis --help
test_cli "dist/cli/cfn-redis.js --help" \
  "cfn-redis --help shows usage" \
  "cfn-redis - Redis Coordination Helpers CLI"

# Test 12: Verify all binaries exist
echo -e "${YELLOW}[TEST $((TEST_COUNT + 1))]${NC} All CLI files exist in dist/"
TEST_COUNT=$((TEST_COUNT + 1))
MISSING_FILES=0
for cli in spawn cfn-loop cfn-swarm cfn-portal cfn-context cfn-metrics cfn-redis; do
  if [ ! -f "dist/cli/${cli}.js" ]; then
    echo -e "${RED}  ✗ Missing: dist/cli/${cli}.js${NC}"
    MISSING_FILES=$((MISSING_FILES + 1))
  fi
done
if [ $MISSING_FILES -eq 0 ]; then
  echo -e "${GREEN}  ✓ PASS${NC} - All 7 CLI files exist"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}  ✗ FAIL${NC} - $MISSING_FILES files missing"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Test 13: Verify package.json binaries
echo -e "${YELLOW}[TEST $((TEST_COUNT + 1))]${NC} package.json has all binaries"
TEST_COUNT=$((TEST_COUNT + 1))
MISSING_BINS=0
for bin in cfn-spawn cfn-loop cfn-swarm cfn-portal cfn-context cfn-metrics cfn-redis; do
  if ! grep -q "\"$bin\"" package.json; then
    echo -e "${RED}  ✗ Missing bin: $bin${NC}"
    MISSING_BINS=$((MISSING_BINS + 1))
  fi
done
if [ $MISSING_BINS -eq 0 ]; then
  echo -e "${GREEN}  ✓ PASS${NC} - All 7 binaries in package.json"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}  ✗ FAIL${NC} - $MISSING_BINS binaries missing"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# Summary
echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo "Tests Run:    $TEST_COUNT"
echo -e "Tests Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Tests Failed: ${RED}$FAIL_COUNT${NC}"
echo "=========================================="

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
