#!/bin/bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/message-bus.sh"

AGENT_ID="${1:-file-analyzer}"
BASE_DIR="/dev/shm/cfn-mvp"
STATUS_DIR="${BASE_DIR}/status"
CHECKPOINT_DIR="${BASE_DIR}/checkpoints/${AGENT_ID}"
TEST_DATA_DIR="${BASE_DIR}/test-data/logs"
TEST_RESULTS_DIR="${BASE_DIR}/test-results"

mkdir -p "${CHECKPOINT_DIR}" "${TEST_RESULTS_DIR}"

log() {
    echo "[$(date '+%H:%M:%S')] [$AGENT_ID] $*" >&2
}

update_status() {
    local status="$1"
    local progress="$2"
    local confidence="$3"
    cat > "${STATUS_DIR}/${AGENT_ID}.json" <<EOF
{
  "agent_id": "$AGENT_ID",
  "type": "file-analyzer",
  "status": "$status",
  "progress": $progress,
  "confidence": $confidence,
  "last_update": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# Real file analysis - no sleep delays
log "Starting file analysis..."
update_status "running" 0 0.5

# Count total lines across all log files
TOTAL_LINES=0
FILE_COUNT=0

for logfile in "${TEST_DATA_DIR}"/*.log; do
    if [[ -f "$logfile" ]]; then
        LINES=$(wc -l < "$logfile")
        TOTAL_LINES=$((TOTAL_LINES + LINES))
        FILE_COUNT=$((FILE_COUNT + 1))

        # Checkpoint after each file
        echo "processed:$(basename "$logfile"):$LINES" >> "${CHECKPOINT_DIR}/progress.txt"
        log "Processed $(basename "$logfile"): $LINES lines"
    fi
done

update_status "running" 50 0.7

# Extract ERROR patterns with grep (real work)
ERROR_COUNT=$(grep -h "ERROR" "${TEST_DATA_DIR}"/*.log | wc -l)
grep -h "ERROR" "${TEST_DATA_DIR}"/*.log > "${TEST_RESULTS_DIR}/errors.txt" 2>/dev/null || true

update_status "running" 75 0.8

# Write analysis report
cat > "${TEST_RESULTS_DIR}/file-analysis.txt" <<EOF
File Analysis Report
====================
Files Processed: $FILE_COUNT
Total Lines: $TOTAL_LINES
Error Count: $ERROR_COUNT
Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

log "Analysis complete: $FILE_COUNT files, $TOTAL_LINES lines, $ERROR_COUNT errors"
update_status "completed" 100 0.95

# Final checkpoint
echo "complete:$FILE_COUNT:$TOTAL_LINES:$ERROR_COUNT" >> "${CHECKPOINT_DIR}/progress.txt"
