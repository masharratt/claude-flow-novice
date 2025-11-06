#!/bin/bash
# Simple mode detection test

set -euo pipefail

echo "=== Testing Mode Detection ==="

# Test 1: Empty environment (should default to task)
unset TASK_ID AGENT_ID CFN_MODE LOOP3_AGENTS
source .claude/skills/cfn-task-mode-safety/mode-detection.sh
mode=$(detect_execution_mode 2>/dev/null)
echo "Test 1 - Empty environment: $mode (expected: task)"

# Test 2: CLI environment
export TASK_ID='task_123' AGENT_ID='agent_456' CFN_MODE='cli'
mode=$(detect_execution_mode 2>/dev/null)
echo "Test 2 - CLI environment: $mode (expected: cli)"

# Test 3: Task environment
export CFN_MODE='task'
mode=$(detect_execution_mode 2>/dev/null)
echo "Test 3 - Task environment: $mode (expected: task)"

echo "=== Mode Detection Complete ==="