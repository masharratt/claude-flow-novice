#!/usr/bin/env bash

# Orchestrator Test Script
# Tests basic CFN Loop orchestration functionality

set -e

# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

TASK_ID="orchestrator-test-$(date +%s)"
TEST_DIR="/tmp/cfn-test-${TASK_ID}"

echo "Starting CFN Loop orchestrator test..."
echo "Task ID: $TASK_ID"
echo "Test directory: $TEST_DIR"

# Create test directory
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Test 1: Redis coordination
echo "Test 1: Redis coordination..."
redis-cli set "test:${TASK_ID}:status" "running" > /dev/null
REDIS_STATUS=$(redis-cli get "test:${TASK_ID}:status")

if [ "$REDIS_STATUS" = "running" ]; then
    echo "✅ Redis coordination working"
else
    echo "❌ Redis coordination failed"
    exit 1
fi

# Test 2: Agent spawning capability
echo "Test 2: Agent spawning..."
if command -v npx &> /dev/null; then
    echo "✅ npx available for agent spawning"
else
    echo "❌ npx not available"
    exit 1
fi

# Test 3: Orchestrator script availability
echo "Test 3: Orchestrator script..."
ORCHESTRATOR_SCRIPT="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"
if [ -f "$ORCHESTRATOR_SCRIPT" ]; then
    echo "✅ Orchestrator script found"
else
    echo "❌ Orchestrator script not found"
    exit 1
fi

# Test 4: Waiting mode functionality
echo "Test 4: Waiting mode functionality..."
WAITING_MODE_SCRIPT="$PROJECT_ROOT/.claude/skills/redis-coordination/invoke-waiting-mode.sh"
if [ -f "$WAITING_MODE_SCRIPT" ]; then
    echo "✅ Waiting mode script available"
else
    echo "❌ Waiting mode script not found"
    exit 1
fi

# Cleanup
redis-cli del "test:${TASK_ID}:status" > /dev/null
rm -rf "$TEST_DIR"

echo "All tests passed! ✅"
echo "CFN Loop orchestrator is ready for execution."