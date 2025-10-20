#!/usr/bin/env bash

set -e

TESTS_PASSED=0
TESTS_FAILED=0
REDIS_PREFIX="swarm:test-fork"

# Cleanup function
cleanup() {
  echo "Cleaning up test data..."
  redis-cli keys "${REDIS_PREFIX}:*" | xargs -r redis-cli del >/dev/null 2>&1 || true
}

trap cleanup EXIT

# Test helper
assert_equals() {
  if [ "$1" = "$2" ]; then
    echo "  ✓ PASS: $3"
    ((TESTS_PASSED++))
  else
    echo "  ✗ FAIL: $3"
    echo "    Expected: $2"
    echo "    Got: $1"
    ((TESTS_FAILED++))
  fi
}

# Helper function to generate unique identifiers
generate_unique_id() {
  date +"%Y%m%d%H%M%S%N"
}

# Test 1: Create fork after iteration 1
test_create_fork() {
  echo "Test 1: Create fork after iteration 1"

  TASK_ID="test-fork-$(generate_unique_id)"
  AGENT_ID="test-agent-1"

  # Simulate storing initial messages
  redis-cli hmset "${REDIS_PREFIX}:${TASK_ID}:${AGENT_ID}:messages" \
    "message1" "Initial user message" \
    "message2" "Initial assistant response"

  # Create fork
  FORK_ID=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 1 2>/dev/null)

  if [ -n "$FORK_ID" ]; then
    assert_equals "${#FORK_ID}" "36" "Fork ID is a valid UUID"

    # Verify fork metadata stored
    FORK_METADATA=$(redis-cli hgetall "${REDIS_PREFIX}:${TASK_ID}:${AGENT_ID}:forks:${FORK_ID}")
    assert_equals "$(echo "$FORK_METADATA" | grep -c .)" "4" "Fork metadata stored correctly"
  else
    echo "  ✗ FAIL: Fork creation failed"
    ((TESTS_FAILED++))
  fi
}

# Test 2: Get current fork for agent
test_get_current_fork() {
  echo "Test 2: Get current fork for agent"

  TASK_ID="test-fork-$(generate_unique_id)"
  AGENT_ID="test-agent-2"

  # Create multiple forks
  FORK_ID1=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 1 2>/dev/null)
  FORK_ID2=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 2 2>/dev/null)

  # Get current fork
  CURRENT_FORK=$(npx cfn-fork current --task-id "$TASK_ID" --agent-id "$AGENT_ID" 2>/dev/null)

  assert_equals "$CURRENT_FORK" "$FORK_ID2" "Current fork is the most recent fork"
}

# Test 3: List all forks for agent
test_list_forks() {
  echo "Test 3: List all forks for agent"

  TASK_ID="test-fork-$(generate_unique_id)"
  AGENT_ID="test-agent-3"

  # Create multiple forks
  FORK_ID1=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 1 2>/dev/null)
  FORK_ID2=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 2 2>/dev/null)
  FORK_ID3=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 3 2>/dev/null)

  # List forks
  FORKS_LIST=$(npx cfn-fork list --task-id "$TASK_ID" --agent-id "$AGENT_ID" 2>/dev/null)

  FORK_COUNT=$(echo "$FORKS_LIST" | wc -l)
  assert_equals "$FORK_COUNT" "3" "Correct number of forks listed"
}

# Test 4: Get fork metadata
test_get_fork_metadata() {
  echo "Test 4: Get fork metadata"

  TASK_ID="test-fork-$(generate_unique_id)"
  AGENT_ID="test-agent-4"

  # Create fork with specific metadata
  FORK_ID=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 1 \
    --metadata '{"confidence": 0.85, "iteration": 1}' 2>/dev/null)

  # Get fork metadata
  FORK_METADATA=$(npx cfn-fork metadata --task-id "$TASK_ID" --agent-id "$AGENT_ID" --fork-id "$FORK_ID" 2>/dev/null)

  assert_equals "$(echo "$FORK_METADATA" | jq -r '.confidence')" "0.85" "Fork metadata retrieved correctly"
}

# Test 5: Store user message
test_store_user_message() {
  echo "Test 5: Store user message"

  TASK_ID="test-fork-$(generate_unique_id)"
  AGENT_ID="test-agent-5"
  FORK_ID=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 1 2>/dev/null)

  # Store user message
  npx cfn-fork message --task-id "$TASK_ID" --agent-id "$AGENT_ID" \
    --fork-id "$FORK_ID" --type user --content "Test user message" 2>/dev/null

  # Retrieve message
  STORED_MESSAGE=$(redis-cli hget "${REDIS_PREFIX}:${TASK_ID}:${AGENT_ID}:forks:${FORK_ID}:messages" "user_last")

  assert_equals "$STORED_MESSAGE" "Test user message" "User message stored correctly"
}

# Test 6: Store assistant message
test_store_assistant_message() {
  echo "Test 6: Store assistant message"

  TASK_ID="test-fork-$(generate_unique_id)"
  AGENT_ID="test-agent-6"
  FORK_ID=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 1 2>/dev/null)

  # Store assistant message
  npx cfn-fork message --task-id "$TASK_ID" --agent-id "$AGENT_ID" \
    --fork-id "$FORK_ID" --type assistant --content "Test assistant response" 2>/dev/null

  # Retrieve message
  STORED_MESSAGE=$(redis-cli hget "${REDIS_PREFIX}:${TASK_ID}:${AGENT_ID}:forks:${FORK_ID}:messages" "assistant_last")

  assert_equals "$STORED_MESSAGE" "Test assistant response" "Assistant message stored correctly"
}

# Test 7: Load messages from fork
test_load_messages() {
  echo "Test 7: Load messages from fork"

  TASK_ID="test-fork-$(generate_unique_id)"
  AGENT_ID="test-agent-7"
  FORK_ID=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 1 2>/dev/null)

  # Store multiple messages
  npx cfn-fork message --task-id "$TASK_ID" --agent-id "$AGENT_ID" \
    --fork-id "$FORK_ID" --type user --content "User message 1" 2>/dev/null
  npx cfn-fork message --task-id "$TASK_ID" --agent-id "$AGENT_ID" \
    --fork-id "$FORK_ID" --type assistant --content "Assistant response 1" 2>/dev/null

  # Load messages
  MESSAGES=$(npx cfn-fork messages --task-id "$TASK_ID" --agent-id "$AGENT_ID" --fork-id "$FORK_ID" 2>/dev/null)

  MESSAGE_COUNT=$(echo "$MESSAGES" | jq '. | length')
  assert_equals "$MESSAGE_COUNT" "2" "Messages loaded correctly"
}

# Test 8: Fork with no messages (error handling)
test_fork_no_messages() {
  echo "Test 8: Fork with no messages"

  TASK_ID="test-fork-$(generate_unique_id)"
  AGENT_ID="test-agent-8"
  FORK_ID=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 1 2>/dev/null)

  # Try to retrieve messages
  MESSAGES=$(npx cfn-fork messages --task-id "$TASK_ID" --agent-id "$AGENT_ID" --fork-id "$FORK_ID" 2>/dev/null)

  MESSAGE_COUNT=$(echo "$MESSAGES" | jq '. | length')
  assert_equals "$MESSAGE_COUNT" "0" "Empty fork handles gracefully"
}

# Test 9: Fork ID not found
test_fork_not_found() {
  echo "Test 9: Fork ID not found"

  TASK_ID="test-fork-$(generate_unique_id)"
  AGENT_ID="test-agent-9"
  FAKE_FORK_ID="00000000-0000-0000-0000-000000000000"

  # Try to retrieve non-existent fork
  FORK_RESULT=$(npx cfn-fork metadata --task-id "$TASK_ID" --agent-id "$AGENT_ID" --fork-id "$FAKE_FORK_ID" 2>&1)

  if [[ "$FORK_RESULT" == *"Fork not found"* ]]; then
    assert_equals "1" "1" "Non-existent fork returns appropriate error"
  else
    echo "  ✗ FAIL: Expected 'Fork not found' error"
    ((TESTS_FAILED++))
  fi
}

# Test 10: Multiple forks per agent
test_multiple_forks() {
  echo "Test 10: Multiple forks per agent"

  TASK_ID="test-fork-$(generate_unique_id)"
  AGENT_ID="test-agent-10"

  # Create multiple forks with different confidence levels
  FORK_ID1=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 1 \
    --metadata '{"confidence": 0.6}' 2>/dev/null)
  FORK_ID2=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 2 \
    --metadata '{"confidence": 0.8}' 2>/dev/null)
  FORK_ID3=$(npx cfn-fork create --task-id "$TASK_ID" --agent-id "$AGENT_ID" --iteration 3 \
    --metadata '{"confidence": 0.9}' 2>/dev/null)

  # List forks and check confidence levels
  FORKS_LIST=$(npx cfn-fork list --task-id "$TASK_ID" --agent-id "$AGENT_ID" --detailed 2>/dev/null)

  CONFIDENCE_HIGHEST=$(echo "$FORKS_LIST" | jq -r 'max_by(.metadata.confidence) | .metadata.confidence')

  assert_equals "$CONFIDENCE_HIGHEST" "0.9" "Can handle multiple forks with different metadata"
}

# Run all tests
echo "=== Conversation Forking Test Suite ==="
echo ""

test_create_fork
test_get_current_fork
test_list_forks
test_get_fork_metadata
test_store_user_message
test_store_assistant_message
test_load_messages
test_fork_no_messages
test_fork_not_found
test_multiple_forks

echo ""
echo "=== Test Results ==="
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo "✅ All tests passed!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi