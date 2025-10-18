#!/bin/bash
set -euo pipefail

# Minimal checkpoint performance test
BASE_DIR="/dev/shm/cfn-quick-$$"
mkdir -p "${BASE_DIR}/checkpoints/agent-1"

# Simulate checkpoint write with optimized approach
write_optimized_checkpoint() {
    local timestamp=$(date +%s)
    local checkpoint_file="${BASE_DIR}/checkpoints/agent-1/checkpoint-${timestamp}.json"
    local temp_file="${BASE_DIR}/checkpoints/agent-1/checkpoint.tmp"
    
    # Build JSON OUTSIDE flock (optimized approach)
    local files_json='["file_1.ts","file_2.ts","file_3.ts","file_4.ts","file_5.ts"]'
    local findings_json='["Finding 1","Finding 2","Finding 3"]'
    local phase_history_json='["initialization","planning","implementation"]'
    local allowed_phases_json='["testing"]'
    local schema_hash="abc123"
    
    # MINIMAL flock section
    (
        flock -x 200
        cat > "${temp_file}" <<EOF
{
  "version": "1.1",
  "schema_hash": "${schema_hash}",
  "agent_id": "agent-1",
  "timestamp": ${timestamp},
  "phase": "implementation",
  "phase_history": ${phase_history_json},
  "allowed_next_phases": ${allowed_phases_json},
  "tasks_completed": 3,
  "current_task": "Testing",
  "confidence": 0.85,
  "context": {
    "files_modified": ${files_json},
    "findings": ${findings_json}
  },
  "can_resume": true
}
EOF
        mv "${temp_file}" "${checkpoint_file}"
        chmod 600 "${checkpoint_file}"
    ) 200>"${checkpoint_file}.lock"
}

# Measure performance
total=0
for i in {1..10}; do
    start=$(date +%s%N)
    write_optimized_checkpoint
    end=$(date +%s%N)
    duration=$(( (end - start) / 1000000 ))
    total=$((total + duration))
    echo "Iteration $i: ${duration}ms"
done

avg=$((total / 10))
echo ""
echo "Average: ${avg}ms (target: <100ms)"
[ ${avg} -lt 100 ] && echo "✅ PASSED" || echo "❌ FAILED"

rm -rf "${BASE_DIR}"
