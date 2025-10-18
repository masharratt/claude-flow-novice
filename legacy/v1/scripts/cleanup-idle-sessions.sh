#!/bin/bash
# Cleanup Idle Claude Sessions
# Kills Claude processes with 0% CPU (idle/orphaned) older than 30 minutes
# Safe for automated execution - preserves active sessions
# FIXED: Now checks process age to avoid killing long-running agents

set -e

LOGFILE="${HOME}/.claude-flow/logs/session-cleanup.log"
mkdir -p "$(dirname "$LOGFILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"
}

log "=== Starting Idle Session Cleanup ==="

# Get list of idle Claude sessions (0% CPU) that are OLDER than 30 minutes
# Format: PID CPU_TIME ELAPSED_TIME COMMAND
# ELAPSED_TIME format: MM:SS or HH:MM:SS - we need to convert to minutes
IDLE_PIDS=$(ps -eo pid,%cpu,etime,cmd | \
    grep claude | \
    grep -v grep | \
    grep -v "cleanup-idle-sessions" | \
    grep -v "^[[:space:]]*[0-9]*[[:space:]]*0.0.*bash" | \
    awk '
    function elapsed_minutes(elapsed) {
        if (match(elapsed, /^([0-9]+):([0-9]{2}):([0-9]{2})$/)) {
            # HH:MM:SS format
            hours = substr(elapsed, RSTART, RLENGTH);
            h = substr(hours, 1, index(hours, ":") - 1);
            rest = substr(hours, index(hours, ":") + 1);
            m = substr(rest, 1, index(rest, ":") - 1);
            return h * 60 + m;
        } else if (match(elapsed, /^([0-9]+):([0-9]{2})$/)) {
            # MM:SS format
            return substr(elapsed, 1, index(elapsed, ":") - 1);
        }
        return 0;
    }
    $2 == 0.0 && elapsed_minutes($3) >= 30 {print $1}
    ' || true)

# Log all Claude processes for debugging (before filtering)
ALL_CLAUDE=$(ps -eo pid,%cpu,etime,cmd | grep claude | grep -v grep | grep -v "cleanup-idle-sessions" || true)
if [ -n "$ALL_CLAUDE" ]; then
    log "DEBUG: All Claude processes found:"
    echo "$ALL_CLAUDE" | while IFS= read -r line; do
        log "  $line"
    done
else
    log "DEBUG: No Claude processes found"
fi

if [ -z "$IDLE_PIDS" ]; then
    log "No idle sessions older than 30 minutes found. All sessions active or recent."
    exit 0
fi

# Count idle sessions
IDLE_COUNT=$(echo "$IDLE_PIDS" | wc -l)
log "Found $IDLE_COUNT idle Claude session(s) older than 30 minutes"

# Get memory before cleanup
BEFORE_MEM=$(ps aux | grep -E '(claude|node)' | grep -v grep | grep -v snapfuse | awk '{sum+=$6} END {printf "%.1f", sum/1024/1024}')
log "Memory before cleanup: ${BEFORE_MEM}GB"

# Kill idle sessions (with protection for known long-running agents)
for PID in $IDLE_PIDS; do
    # Get process details before killing
    DETAILS=$(ps -eo pid,etime,cputime,%cpu,%mem,rss,cmd | grep "^${PID}" | head -1 || echo "N/A")

    # Check if this is a known long-running agent process that should be protected
    CMD=$(ps -o cmd -p "$PID" --no-headers 2>/dev/null || echo "")
    PROTECTED=false

    case "$CMD" in
        *cfn-coordinator*|*coordinator*|*product-owner*|*system-architect*|*refinement*)
            PROTECTED=true
            log "PROTECTED: Skipping known long-running agent: $DETAILS"
            ;;
        *agent*|*swarm*|*task*)
            # Check if process has been running less than 2 hours (might still be working)
            ELAPSED=$(ps -o etime -p "$PID" --no-headers 2>/dev/null | tr -d ' ')
            if [ -n "$ELAPSED" ]; then
                MINUTES=$(echo "$ELAPSED" | awk -F: '{if(NF==2) print $1; else print $1*60 + $2}')
                if [ "$MINUTES" -lt 120 ]; then
                    PROTECTED=true
                    log "PROTECTED: Skip recent agent process (${MINUTES}min old): $DETAILS"
                fi
            fi
            ;;
    esac

    if [ "$PROTECTED" = false ]; then
        log "Killing idle session: $DETAILS"
        kill -9 "$PID" 2>/dev/null || log "  Warning: Could not kill PID $PID (already terminated?)"
    fi
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
