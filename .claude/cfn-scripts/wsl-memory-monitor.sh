#!/usr/bin/env bash
set -euo pipefail

# WSL2 Memory Monitor
# Kills any non-essential process consuming >15% of total memory.
# Targets: node test runners, Rust binaries with large RSS, runaway builds.
# Never kills: bash, sh, zsh, claude, code-server, docker, containerd, systemd.

LOG="/tmp/wsl-memory-monitor.log"
THRESHOLD=${MEMORY_KILL_THRESHOLD:-15}              # percent — generic non-protected procs
TEST_RUNNER_THRESHOLD=${MEMORY_TEST_THRESHOLD:-10}  # percent — node test runners (more aggressive)
GROUP_THRESHOLD=${MEMORY_GROUP_THRESHOLD:-15}       # percent — parent+children combined
CHECK_INTERVAL=${MEMORY_CHECK_INTERVAL:-10}         # seconds

# Processes that must never be killed
PROTECTED_PROCS="bash|sh|zsh|claude|code-server|dockerd|containerd|systemd|init|sshd|tmux|tmux: server|dbus|cron|snapd|PID"

# Node test runner / browser automation signatures — killed at TEST_RUNNER_THRESHOLD
# Matched against /proc/PID/cmdline (full args), not basename.
TEST_RUNNER_REGEX='vitest|jest|mocha|@playwright|playwright[^ ]*test|cypress|/ava\b|node_modules/tap'

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

status() {
    if [ -f /tmp/wsl-memory-monitor.pid ]; then
        local pid
        pid=$(cat /tmp/wsl-memory-monitor.pid)
        if kill -0 "$pid" 2>/dev/null; then
            echo "Running (PID: $pid, threshold: ${THRESHOLD}%)"
            echo "Log: $LOG"
            tail -5 "$LOG" 2>/dev/null || true
            return 0
        else
            echo "Stale PID file (process $pid not running)"
            rm -f /tmp/wsl-memory-monitor.pid
            return 1
        fi
    else
        echo "Not running"
        return 1
    fi
}

stop() {
    if [ -f /tmp/wsl-memory-monitor.pid ]; then
        local pid
        pid=$(cat /tmp/wsl-memory-monitor.pid)
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            log "Monitor stopped (PID: $pid)"
        fi
        rm -f /tmp/wsl-memory-monitor.pid
    else
        echo "Not running"
    fi
}

# Normalized program name from a ps command string: first token, basename, trailing
# colon stripped. Needed because tmux rewrites its argv to 'tmux: server', whose first
# token is 'tmux:' and would otherwise slip past the protected-name match.
proc_cmd_base() {
    local first=${1%% *}
    first=${first##*/}
    echo "${first%:}"
}

# True (0) when the ps command string names a protected process.
is_protected_proc() {
    local base
    base=$(proc_cmd_base "$1")
    [[ "$base" =~ ^($PROTECTED_PROCS)$ ]]
}

# Selection seam: print the kill reason for (mem%, ps command, full cmdline), or nothing.
proc_kill_reason() {
    local mem=$1 command=$2 full_cmd=$3
    if is_protected_proc "$command"; then
        return 0
    fi
    if echo "$full_cmd" | grep -qE "$TEST_RUNNER_REGEX" && (( $(echo "$mem >= $TEST_RUNNER_THRESHOLD" | bc -l) )); then
        echo "test-runner-over-${TEST_RUNNER_THRESHOLD}%"
        return 0
    fi
    if (( $(echo "$mem >= $THRESHOLD" | bc -l) )); then
        echo "generic-over-${THRESHOLD}%"
    fi
}

# Read full cmdline for a pid (null-separated args -> space-joined). Empty on failure.
proc_cmdline() {
    local pid=$1
    tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true
}

# Log a proc tree rooted at pid for forensics (parent, self, descendants).
log_proc_tree() {
    local pid=$1
    local ppid
    ppid=$(awk '{print $4}' /proc/"$pid"/stat 2>/dev/null || echo "?")
    log "  parent($ppid): $(proc_cmdline "$ppid" | head -c 200)"
    log "  self($pid): $(proc_cmdline "$pid" | head -c 200)"
    # descendants via ps --ppid (one level — usually enough for test runners)
    while read -r cpid crss ccmd; do
        [ -n "$cpid" ] && log "  child($cpid, $((crss/1024))MB): ${ccmd:0:180}"
    done < <(ps --ppid "$pid" -o pid=,rss=,args= 2>/dev/null)
}

# Kill a pid with grace, with reason + proc tree dump.
kill_with_reason() {
    local pid=$1 reason=$2 mem_pct=$3 rss_mb=$4
    log "KILL[$reason]: PID $pid mem=${mem_pct}% rss=${rss_mb}MB"
    log_proc_tree "$pid"
    kill -15 "$pid" 2>/dev/null || true
    sleep 3
    if kill -0 "$pid" 2>/dev/null; then
        log "FORCE KILL: PID $pid did not exit on SIGTERM, sending SIGKILL"
        kill -9 "$pid" 2>/dev/null || true
    fi
}

# Aggregate RSS of pid + its direct children, return MB.
group_rss_kb() {
    local pid=$1
    local self_rss
    self_rss=$(awk '{print $2}' /proc/"$pid"/statm 2>/dev/null)
    # statm field 2 is RSS in pages; convert to kB (page=4kB)
    self_rss=$(( ${self_rss:-0} * 4 ))
    local child_rss
    child_rss=$(ps --ppid "$pid" -o rss= 2>/dev/null | awk '{s+=$1} END{print s+0}')
    echo $(( self_rss + child_rss ))
}

check_and_kill() {
    # Local relaxation: many ps/grep/[ tests legitimately return nonzero (no match,
    # numeric-zero, race on disappearing pid). They are control flow, not failure.
    set +e
    local total_mem
    total_mem=$(awk '/MemTotal/ {print $2}' /proc/meminfo)  # kB

    # PASS 1: single-process offenders (generic threshold + lower test-runner threshold)
    ps aux --sort=-%mem | tail -n +2 | while read -r _ pid _ mem _ rss _ _ _ _ command; do
        # Below both thresholds — stop scanning (sorted desc).
        if (( $(echo "$mem < $TEST_RUNNER_THRESHOLD" | bc -l) )); then
            break
        fi

        # Skip protected processes
        if is_protected_proc "$command"; then
            continue
        fi

        # Skip docker container processes
        if grep -q "containerd-shim" /proc/"$pid"/status 2>/dev/null; then
            continue
        fi

        local rss_mb=$((rss / 1024))
        local full_cmd
        full_cmd=$(proc_cmdline "$pid")

        # Test-runner pattern kills at the lower threshold, others at the main one.
        local reason
        reason=$(proc_kill_reason "$mem" "$command" "$full_cmd")
        if [ -n "$reason" ]; then
            kill_with_reason "$pid" "$reason" "$mem" "$rss_mb"
        fi
    done

    # PASS 2: parent+children aggregation (catches many small leaks under one runner)
    # Build candidate list: parents of children matching TEST_RUNNER_REGEX or generic node.
    # We only consider parents that themselves are non-protected.
    local mem_total_kb=$total_mem
    ps -eo pid=,ppid=,args= | while read -r pid ppid args; do
        # Only consider procs with at least one child (cheap filter via /proc).
        local child_count
        child_count=$(ps --ppid "$pid" -o pid= 2>/dev/null | wc -l)
        [ "$child_count" -lt 2 ] && continue  # need ≥2 children to be worth aggregating

        # Skip protected parents
        if is_protected_proc "$args"; then
            continue
        fi

        local group_kb pct
        group_kb=$(group_rss_kb "$pid")
        # Integer percent of total memory
        pct=$(( group_kb * 100 / mem_total_kb ))
        if [ "$pct" -ge "$GROUP_THRESHOLD" ]; then
            local rss_mb=$(( group_kb / 1024 ))
            log "KILL-GROUP[parent+children-over-${GROUP_THRESHOLD}%]: parent PID $pid pct=${pct}% rss=${rss_mb}MB children=$((child_count-1))"
            log_proc_tree "$pid"
            # Kill children first, then parent, to avoid reparent-then-leak.
            ps --ppid "$pid" -o pid= 2>/dev/null | while read -r cpid; do
                [ -n "$cpid" ] && kill -15 "$cpid" 2>/dev/null || true
            done
            sleep 2
            ps --ppid "$pid" -o pid= 2>/dev/null | while read -r cpid; do
                [ -n "$cpid" ] && kill -9 "$cpid" 2>/dev/null || true
            done
            kill -15 "$pid" 2>/dev/null || true
        fi
    done
}

monitor_loop() {
    # Check if already running
    if [ -f /tmp/wsl-memory-monitor.pid ]; then
        local existing_pid
        existing_pid=$(cat /tmp/wsl-memory-monitor.pid)
        if kill -0 "$existing_pid" 2>/dev/null; then
            echo "Already running (PID: $existing_pid). Use --stop first."
            exit 1
        fi
        rm -f /tmp/wsl-memory-monitor.pid
    fi

    echo $BASHPID > /tmp/wsl-memory-monitor.pid
    log "Monitor started (PID: $BASHPID, threshold: ${THRESHOLD}%, interval: ${CHECK_INTERVAL}s)"

    trap 'log "Monitor stopped"; rm -f /tmp/wsl-memory-monitor.pid; exit 0' TERM INT

    while true; do
        check_and_kill
        sleep "$CHECK_INTERVAL"
    done
}

# Source guard: tests source this file to exercise the selection functions.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
    return 0
fi

case "${1:-}" in
    --status)
        status
        ;;
    --stop)
        stop
        ;;
    --check)
        # Single check, no daemon
        check_and_kill
        ;;
    --daemon)
        # Run in background
        monitor_loop &
        disown
        echo "Monitor started in background (PID: $!)"
        ;;
    "")
        # Foreground
        monitor_loop
        ;;
    *)
        echo "Usage: $0 [--status|--stop|--check|--daemon]"
        echo ""
        echo "Environment:"
        echo "  MEMORY_KILL_THRESHOLD  Kill threshold in % (default: 15)"
        echo "  MEMORY_CHECK_INTERVAL  Check interval in seconds (default: 10)"
        exit 1
        ;;
esac
