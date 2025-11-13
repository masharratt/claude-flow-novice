#!/usr/bin/env bash
set -e

echo "=== Testing Tool Implementation ==="
echo ""

TASK_ID="tool-test-$(date +%s)"
TEST_FILE="/mnt/c/Users/masha/Documents/claude-flow-novice/test-output-${TASK_ID}.txt"

echo "Task ID: $TASK_ID"
echo "Test file: $TEST_FILE"
echo ""

# Clean up any existing test file
rm -f "$TEST_FILE"

echo "[1/3] Testing tool parsing..."
PARSE_OUTPUT=$(npx claude-flow-novice agent backend-dev --task-id "$TASK_ID" --prompt "test" 2>&1 | head -20 || true)

if echo "$PARSE_OUTPUT" | grep -q "Tools: Read, Write, Edit, Bash, TodoWrite"; then
  echo "✅ Tools parsed correctly"
else
  echo "❌ Tools NOT parsed"
  echo "$PARSE_OUTPUT"
  exit 1
fi

echo ""
echo "[2/3] Testing file creation with Write tool..."

# Spawn agent with file creation task (no waiting mode - direct execution)
timeout 60 npx claude-flow-novice agent backend-dev \
  --task-id "$TASK_ID" \
  --prompt "Create a file at ${TEST_FILE} with the text 'Tool test successful'. Use the Write tool. Do not enter waiting mode - just create the file and report success." \
  2>&1 | tee /tmp/agent-output.log &

AGENT_PID=$!

# Wait for agent to complete or timeout
wait $AGENT_PID || echo "Agent completed"

echo ""
echo "[3/3] Verifying file was created..."

if [ -f "$TEST_FILE" ]; then
  CONTENT=$(cat "$TEST_FILE")
  echo "✅ File created successfully!"
  echo "Content: $CONTENT"

  # Cleanup
  rm -f "$TEST_FILE"

  echo ""
  echo "=== TEST PASSED ==="
  exit 0
else
  echo "❌ File was NOT created"
  echo ""
  echo "Agent output:"
  tail -50 /tmp/agent-output.log

  echo ""
  echo "=== TEST FAILED ==="
  exit 1
fi
