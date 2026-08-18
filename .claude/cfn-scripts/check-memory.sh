#!/usr/bin/env bash
# Memory Leak Prevention Script (ANTI-024)
# Detects and kills orphaned test processes (jest, vitest, node test runners)
#
# Usage:
#   ./scripts/check-memory.sh           # Report only
#   ./scripts/check-memory.sh --kill    # Kill orphans
#   ./scripts/check-memory.sh --kill 500  # Kill if total MB > 500

set -euo pipefail

KILL_MODE=false
THRESHOLD_MB=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --kill)
            KILL_MODE=true
            shift
            if [[ "${1:-}" =~ ^[0-9]+$ ]]; then
                THRESHOLD_MB="$1"
                shift
            fi
            ;;
        --help|-h)
            echo "Usage: $0 [--kill [threshold_mb]]"
            echo "  --kill        Kill orphaned test processes"
            echo "  --kill 500    Only kill if total memory > 500MB"
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# Find test-related processes
find_test_processes() {
    # Jest, Vitest, and generic node test runners
    pgrep -af "(jest|vitest|node.*test)" 2>/dev/null || true
}

# Calculate memory usage of test processes (in MB)
get_test_memory_mb() {
    ps aux 2>/dev/null | grep -E "(jest|vitest|node.*test)" | grep -v grep | \
        awk '{sum+=$6} END {print int(sum/1024)}' || echo "0"
}

# Find orphaned processes (parent PID = 1 or parent dead)
find_orphans() {
    local orphans=()

    while IFS= read -r line; do
        local pid=$(echo "$line" | awk '{print $1}')
        if [[ -z "$pid" ]]; then continue; fi

        local ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ' || echo "")
        if [[ -z "$ppid" ]]; then continue; fi

        # Check if parent is init (1) or parent process doesn't exist
        if [[ "$ppid" == "1" ]] || ! ps -p "$ppid" > /dev/null 2>&1; then
            orphans+=("$pid")
        fi
    done < <(find_test_processes)

    echo "${orphans[@]:-}"
}

# Kill processes gracefully
kill_processes() {
    local pids=("$@")

    for pid in "${pids[@]}"; do
        if [[ -z "$pid" ]]; then continue; fi

        echo "Killing orphaned process: $pid"

        # Try SIGTERM first
        kill -TERM "$pid" 2>/dev/null || continue

        # Wait up to 5 seconds for graceful shutdown
        local count=0
        while ps -p "$pid" > /dev/null 2>&1 && [[ $count -lt 5 ]]; do
            sleep 1
            ((count++))
        done

        # Force kill if still running
        if ps -p "$pid" > /dev/null 2>&1; then
            echo "Force killing: $pid"
            kill -KILL "$pid" 2>/dev/null || true
        fi
    done
}

# Main
main() {
    local total_mb=$(get_test_memory_mb)
    local orphans=($(find_orphans))
    local orphan_count=${#orphans[@]}

    echo "=== Memory Check (ANTI-024) ==="
    echo "Test process memory: ${total_mb}MB"
    echo "Orphaned processes: ${orphan_count}"

    if [[ $orphan_count -gt 0 ]]; then
        echo ""
        echo "Orphan PIDs: ${orphans[*]}"

        if $KILL_MODE; then
            if [[ $THRESHOLD_MB -gt 0 ]] && [[ $total_mb -lt $THRESHOLD_MB ]]; then
                echo "Memory ($total_mb MB) below threshold ($THRESHOLD_MB MB), skipping kill"
                exit 0
            fi

            echo ""
            echo "Killing orphaned processes..."
            kill_processes "${orphans[@]}"

            # Verify cleanup
            sleep 1
            local remaining=$(find_orphans | wc -w)
            echo "Remaining orphans: $remaining"

            if [[ $remaining -gt 0 ]]; then
                echo "WARNING: Some processes could not be killed"
                exit 1
            fi
        else
            echo ""
            echo "Run with --kill to terminate orphaned processes"
        fi
    else
        echo "No orphaned test processes found"
    fi

    # Report current test processes
    local running=$(find_test_processes | wc -l)
    if [[ $running -gt 0 ]]; then
        echo ""
        echo "Running test processes: $running"
        find_test_processes | head -5
        if [[ $running -gt 5 ]]; then
            echo "... and $((running - 5)) more"
        fi
    fi
}

main "$@"
