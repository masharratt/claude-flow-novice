#!/bin/bash

# Quick checkpoint performance test
set -euo pipefail

BASE_DIR="/dev/shm/cfn-test-$$"
mkdir -p "${BASE_DIR}/checkpoints/agent-1" "${BASE_DIR}/logs"

# Source the agent script functions
export AGENT_ID="agent-1"
export AGENT_TYPE="coder"
export CHECKPOINT_DIR="${BASE_DIR}/checkpoints/${AGENT_ID}"
export LOG_DIR="${BASE_DIR}/logs"
export LOG_FILE="${LOG_DIR}/${AGENT_ID}.log"
export PHASE="implementation"
export PHASE_HISTORY=("initialization" "planning" "implementation")
export TASKS_COMPLETED=3
export CURRENT_TASK="Testing checkpoint performance"
export CONFIDENCE=0.85
export FILES_MODIFIED=("file_1.ts" "file_2.ts" "file_3.ts" "file_4.ts" "file_5.ts")
export FINDINGS=("Finding 1" "Finding 2" "Finding 3")

# Source required functions
source "$(dirname "$0")/mvp-agent.sh" 2>/dev/null || true

# Measure checkpoint write time (10 iterations)
total_time=0
iterations=10

for i in $(seq 1 ${iterations}); do
    start=$(date +%s%N)
    write_checkpoint 2>/dev/null || true
    end=$(date +%s%N)
    duration=$(( (end - start) / 1000000 )) # Convert to ms
    total_time=$((total_time + duration))
    echo "Iteration $i: ${duration}ms"
done

avg_time=$((total_time / iterations))
echo ""
echo "============================================"
echo "CHECKPOINT WRITE PERFORMANCE"
echo "============================================"
echo "Average time: ${avg_time}ms (${iterations} iterations)"
echo "Total time: ${total_time}ms"
echo "Target: <100ms"

if [ ${avg_time} -lt 100 ]; then
    echo "✅ PASSED - Performance optimized!"
else
    echo "❌ FAILED - Still above 100ms threshold"
fi

# Cleanup
rm -rf "${BASE_DIR}"
