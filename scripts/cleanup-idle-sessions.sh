#!/bin/bash
# Cleanup Idle Claude Sessions
# Kills Claude processes with 0% CPU (idle/orphaned) older than 30 minutes
# Safe for automated execution - preserves active sessions

set -e

LOGFILE="${HOME}/.claude-flow/logs/session-cleanup.log"
mkdir -p "$(dirname "$LOGFILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"
}

log "=== Starting Idle Session Cleanup ==="

# Get list of idle Claude sessions (0% CPU), excluding this script and bash processes
IDLE_PIDS=$(ps -eo pid,%cpu,etime,cmd | grep claude | grep -v grep | grep -v "cleanup-idle-sessions" | grep -v "^[[:space:]]*[0-9]*[[:space:]]*0.0.*bash" | awk '$2 == 0.0 {print $1}' || true)

if [ -z "$IDLE_PIDS" ]; then
    log "No idle sessions found. All sessions active."
    exit 0
fi

# Count idle sessions
IDLE_COUNT=$(echo "$IDLE_PIDS" | wc -l)
log "Found $IDLE_COUNT idle Claude session(s)"

# Get memory before cleanup
BEFORE_MEM=$(ps aux | grep -E '(claude|node)' | grep -v grep | grep -v snapfuse | awk '{sum+=$6} END {printf "%.1f", sum/1024/1024}')
log "Memory before cleanup: ${BEFORE_MEM}GB"

# Kill idle sessions
for PID in $IDLE_PIDS; do
    # Get process details before killing
    DETAILS=$(ps -eo pid,etime,cputime,%cpu,%mem,rss,cmd | grep "^${PID}" | head -1 || echo "N/A")
    log "Killing idle session: $DETAILS"

    kill -9 "$PID" 2>/dev/null || log "  Warning: Could not kill PID $PID (already terminated?)"
done

# Wait for processes to terminate
sleep 2

# Get memory after cleanup
AFTER_MEM=$(ps aux | grep -E '(claude|node)' | grep -v grep | grep -v snapfuse | awk '{sum+=$6} END {printf "%.1f", sum/1024/1024}')
FREED_MEM=$(echo "$BEFORE_MEM - $AFTER_MEM" | bc)
log "Memory after cleanup: ${AFTER_MEM}GB"
log "Memory freed: ${FREED_MEM}GB"

# Get remaining active sessions
ACTIVE_COUNT=$(ps aux | grep claude | grep -v grep | wc -l)
log "Active sessions remaining: $ACTIVE_COUNT"

log "=== Cleanup Complete ==="
log ""

# Return summary
echo "{\"idle_killed\": $IDLE_COUNT, \"active_remaining\": $ACTIVE_COUNT, \"memory_freed_gb\": $FREED_MEM}"
