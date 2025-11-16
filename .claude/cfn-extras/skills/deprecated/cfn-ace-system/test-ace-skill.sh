#!/usr/bin/env bash

##############################################################################
# ACE System Skill Test Suite
# Validates all ACE skill wrapper functionality
#
# Usage:
#   ./test-ace-skill.sh
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR=$(mktemp -d)
trap "rm -rf $TEST_DIR" EXIT

PASS_COUNT=0
FAIL_COUNT=0

# Test helper functions
pass() {
  echo "[PASS] $1"
  ((PASS_COUNT++))
}

fail() {
  echo "[FAIL] $1"
  ((FAIL_COUNT++))
}

# Test 1: Context Reflection
test_context_reflect() {
  echo "Running: Context Reflection Test"

  local test_context='{"task": "test-reflection", "complexity": "high", "constraints": ["time", "budget"]}'

  if result=$("$SCRIPT_DIR/invoke-context-reflect.sh" \
    --context "$test_context" \
    --memory-path "$TEST_DIR/test-reflections.sqlite" 2>&1); then

    # Validate JSON output
    if echo "$result" | jq . > /dev/null 2>&1; then
      # Check required fields
      if echo "$result" | jq -e '.id and .timestamp and .complexity and .insights' > /dev/null 2>&1; then
        pass "Context reflection generates valid output"
      else
        fail "Context reflection missing required fields"
      fi
    else
      fail "Context reflection returned invalid JSON"
    fi
  else
    fail "Context reflection script failed: $result"
  fi
}

# Test 2: Context Stats - Reflections Query
test_context_stats() {
  echo "Running: Context Stats Test"

  # First create some reflections
  "$SCRIPT_DIR/invoke-context-reflect.sh" \
    --context '{"task": "stats-test-1"}' \
    --memory-path "$TEST_DIR/test-stats.sqlite" > /dev/null 2>&1

  "$SCRIPT_DIR/invoke-context-reflect.sh" \
    --context '{"task": "stats-test-2"}' \
    --complexity 0.8 \
    --memory-path "$TEST_DIR/test-stats.sqlite" > /dev/null 2>&1

  # Query reflections
  if result=$("$SCRIPT_DIR/invoke-context-stats.sh" \
    --query reflections \
    --filter '{"complexity": {"$gt": 0.5}}' \
    --limit 10 \
    --memory-path "$TEST_DIR/test-stats.sqlite" 2>&1); then

    if echo "$result" | jq . > /dev/null 2>&1; then
      # Check if array returned
      if echo "$result" | jq -e 'type == "array"' > /dev/null 2>&1; then
        pass "Context stats returns filtered reflections"
      else
        fail "Context stats did not return array"
      fi
    else
      fail "Context stats returned invalid JSON"
    fi
  else
    fail "Context stats script failed: $result"
  fi
}

# Test 3: Context Stats - Summary Query
test_context_stats_summary() {
  echo "Running: Context Stats Summary Test"

  # Use same database as previous test
  if result=$("$SCRIPT_DIR/invoke-context-stats.sh" \
    --query summary \
    --memory-path "$TEST_DIR/test-stats.sqlite" 2>&1); then

    if echo "$result" | jq . > /dev/null 2>&1; then
      # Check summary fields
      if echo "$result" | jq -e '.totalReflections and .avgComplexity and .maxComplexity' > /dev/null 2>&1; then
        pass "Context stats summary provides analytics"
      else
        fail "Context stats summary missing required fields"
      fi
    else
      fail "Context stats summary returned invalid JSON"
    fi
  else
    fail "Context stats summary script failed: $result"
  fi
}

# Test 4: Context Query
test_context_query() {
  echo "Running: Context Query Test"

  # Create reflections with specific keywords
  "$SCRIPT_DIR/invoke-context-reflect.sh" \
    --context '{"task": "authentication", "features": ["JWT", "OAuth"]}' \
    --memory-path "$TEST_DIR/test-query.sqlite" > /dev/null 2>&1

  "$SCRIPT_DIR/invoke-context-reflect.sh" \
    --context '{"task": "deployment", "features": ["Docker", "K8s"]}' \
    --memory-path "$TEST_DIR/test-query.sqlite" > /dev/null 2>&1

  # Query for authentication-related contexts
  if result=$("$SCRIPT_DIR/invoke-context-query.sh" \
    --keywords "authentication,JWT" \
    --similarity-threshold 0.3 \
    --max-results 5 \
    --memory-path "$TEST_DIR/test-query.sqlite" 2>&1); then

    if echo "$result" | jq . > /dev/null 2>&1; then
      # Check if results have similarity scores
      if echo "$result" | jq -e '.[0].similarity' > /dev/null 2>&1; then
        pass "Context query finds similar contexts"
      else
        fail "Context query results missing similarity scores"
      fi
    else
      fail "Context query returned invalid JSON"
    fi
  else
    fail "Context query script failed: $result"
  fi
}

# Test 5: Context Injection
test_context_inject() {
  echo "Running: Context Injection Test"

  # Create source context file
  local context_file="$TEST_DIR/inject-source.json"
  echo '{"historical": "data", "priority": 0.9, "insights": ["learned behavior"]}' > "$context_file"

  # Test deep merge strategy
  if result=$("$SCRIPT_DIR/invoke-context-inject.sh" \
    --context-file "$context_file" \
    --target-task "test-inject-task" \
    --merge-strategy deep 2>&1); then

    if echo "$result" | jq . > /dev/null 2>&1; then
      # Check injection metadata
      if echo "$result" | jq -e '.taskId and .mergeStrategy and .context' > /dev/null 2>&1; then
        pass "Context injection merges successfully"
      else
        fail "Context injection missing required fields"
      fi
    else
      fail "Context injection returned invalid JSON"
    fi
  else
    fail "Context injection script failed: $result"
  fi
}

# Test 6: Context Curation - Simple Merge
test_context_curate_simple() {
  echo "Running: Context Curation (Simple) Test"

  # Create multiple context files
  local ctx1="$TEST_DIR/curate-ctx1.json"
  local ctx2="$TEST_DIR/curate-ctx2.json"
  local ctx3="$TEST_DIR/curate-ctx3.json"

  echo '{"agent": "coder-1", "confidence": 0.85, "result": "implemented"}' > "$ctx1"
  echo '{"agent": "reviewer-1", "confidence": 0.90, "result": "approved"}' > "$ctx2"
  echo '{"agent": "tester-1", "confidence": 0.80, "result": "validated"}' > "$ctx3"

  # Test simple merge
  if result=$("$SCRIPT_DIR/invoke-context-curate.sh" \
    --contexts "$ctx1,$ctx2,$ctx3" \
    --strategy simple 2>&1); then

    if echo "$result" | jq . > /dev/null 2>&1; then
      # Check curation metadata
      if echo "$result" | jq -e '.curated and .strategy == "simple" and .sourceCount == 3' > /dev/null 2>&1; then
        pass "Context curation handles simple merge"
      else
        fail "Context curation metadata incorrect"
      fi
    else
      fail "Context curation returned invalid JSON"
    fi
  else
    fail "Context curation script failed: $result"
  fi
}

# Test 7: Context Curation - Consensus Weighted
test_context_curate_consensus() {
  echo "Running: Context Curation (Consensus) Test"

  # Use same files as simple test
  local ctx1="$TEST_DIR/curate-ctx1.json"
  local ctx2="$TEST_DIR/curate-ctx2.json"
  local ctx3="$TEST_DIR/curate-ctx3.json"

  # Test consensus-weighted merge
  if result=$("$SCRIPT_DIR/invoke-context-curate.sh" \
    --contexts "$ctx1,$ctx2,$ctx3" \
    --strategy consensus-weighted 2>&1); then

    if echo "$result" | jq . > /dev/null 2>&1; then
      if echo "$result" | jq -e '.strategy == "consensus-weighted"' > /dev/null 2>&1; then
        pass "Context curation handles consensus weighting"
      else
        fail "Context curation strategy not applied"
      fi
    else
      fail "Context curation consensus returned invalid JSON"
    fi
  else
    fail "Context curation consensus script failed: $result"
  fi
}

# Test 8: Integration Test - Full CFN Loop Workflow
test_cfn_loop_integration() {
  echo "Running: CFN Loop Integration Test"

  local loop_db="$TEST_DIR/cfn-loop.sqlite"

  # Loop 3: Primary implementation
  "$SCRIPT_DIR/invoke-context-reflect.sh" \
    --context '{"phase": "loop3", "agent": "coder-1", "task": "implement-feature"}' \
    --memory-path "$loop_db" \
    --output "$TEST_DIR/loop3-agent1.json" > /dev/null 2>&1

  "$SCRIPT_DIR/invoke-context-reflect.sh" \
    --context '{"phase": "loop3", "agent": "devops-1", "task": "deploy-infrastructure"}' \
    --memory-path "$loop_db" \
    --output "$TEST_DIR/loop3-agent2.json" > /dev/null 2>&1

  # Loop 2: Validation consensus
  "$SCRIPT_DIR/invoke-context-curate.sh" \
    --contexts "$TEST_DIR/loop3-agent1.json,$TEST_DIR/loop3-agent2.json" \
    --strategy consensus-weighted \
    --output "$TEST_DIR/loop2-merged.json" > /dev/null 2>&1

  # Product Owner: Final decision
  if "$SCRIPT_DIR/invoke-context-inject.sh" \
    --context-file "$TEST_DIR/loop2-merged.json" \
    --target-task "cfn-loop-final" \
    --merge-strategy deep \
    --output "$TEST_DIR/final-context.json" > /dev/null 2>&1; then

    # Validate final output exists and is valid JSON
    if [ -f "$TEST_DIR/final-context.json" ] && jq . "$TEST_DIR/final-context.json" > /dev/null 2>&1; then
      pass "CFN Loop integration workflow completes successfully"
    else
      fail "CFN Loop final context invalid"
    fi
  else
    fail "CFN Loop integration workflow failed"
  fi
}

# Run all tests
echo "========================================="
echo "ACE System Skill Test Suite"
echo "========================================="
echo ""

test_context_reflect
test_context_stats
test_context_stats_summary
test_context_query
test_context_inject
test_context_curate_simple
test_context_curate_consensus
test_cfn_loop_integration

echo ""
echo "========================================="
echo "Test Results"
echo "========================================="
echo "PASS: $PASS_COUNT"
echo "FAIL: $FAIL_COUNT"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
  echo "All tests passed!"
  exit 0
else
  echo "Some tests failed."
  exit 1
fi
