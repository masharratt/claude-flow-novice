#!/bin/bash

export TASK_ID="test-123"
export AGENT_ID="agent-001"

source ./test_mode_detection.sh

echo "Testing CLI mode..."
echo "Mode: $(detect_execution_mode)"
echo "Task Mode: $(is_task_mode && echo 'YES' || echo 'NO')"
echo "CLI Mode: $(is_cli_mode && echo 'YES' || echo 'NO')"
