#!/bin/bash
set -u
PROJECT_ROOT=$(git rev-parse --show-toplevel)
TEST_ID="manual2-$(date +%s)-$$"
TASK_ID="cfn-cli-${TEST_ID}"
WORKSPACE="/tmp/manual-cfn-5iter-${TEST_ID}"
MODE="standard"
MAX_ITERATIONS=5
read -r -d "" CONTEXT <<EOF
TASK_DESCRIPTION='Create file hello-world.txt in directory $WORKSPACE with progressive improvements across 5 iterations:
Iteration 1: Basic file (should fail tests - missing greeting)
Iteration 2: Add Hello (should pass gate but need validator fixes - missing name)
Iteration 3: Add World (should pass all but PO wants refinement - missing punctuation)
Iteration 4: Add punctuation (should pass all but PO wants polish - no capitalization)
Iteration 5: Perfect output: Hello, World! (should PROCEED)
The file MUST be created at $WORKSPACE/hello-world.txt' MODE='$MODE' MAX_ITERATIONS=$MAX_ITERATIONS CFN_DOCKER_MODE='false' EXPECTED_FILES='hello-world.txt' WORKSPACE='$WORKSPACE'
EOF

mkdir -p "$WORKSPACE"
echo "Workspace: $WORKSPACE"
(
  cd "$PROJECT_ROOT"
  npx claude-flow-novice agent cfn-v3-coordinator \
    --task-id "$TASK_ID" \
    --context "$CONTEXT" \
    --timeout 600 \
    > "$WORKSPACE/coordinator.log" 2>&1
) &
COORD_PID=$!
echo "Coordinator PID: $COORD_PID"
elapsed=0
max_wait=480
while kill -0 $COORD_PID 2>/dev/null && [ $elapsed -lt $max_wait ]; do
  sleep 10
  elapsed=$((elapsed+10))
  echo "[wait] $elapsed s..."
done
wait $COORD_PID || true
EXIT_CODE=$?
echo "Coordinator exit: $EXIT_CODE"

if [ -f "$WORKSPACE/coordinator.log" ]; then
  echo "--- coordinator.log tail ---" 
  tail -n 200 "$WORKSPACE/coordinator.log"
  echo "--- coordinator.log head ---"
  head -n 60 "$WORKSPACE/coordinator.log"
fi

echo "Artifacts in workspace:"
ls -la "$WORKSPACE"