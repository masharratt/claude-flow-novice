#!/usr/bin/env bash
# Run command with memory limit enforcement (ANTI-024)
# Uses systemd-run when available, falls back to ulimit
#
# Usage:
#   ./scripts/run-with-memory-limit.sh <memory_limit> <command...>
#   ./scripts/run-with-memory-limit.sh 6G npm test
#   ./scripts/run-with-memory-limit.sh 2G npm run test:unit

set -euo pipefail

MEMORY_LIMIT="${1:-6G}"
shift

if [[ $# -eq 0 ]]; then
    echo "Usage: $0 <memory_limit> <command...>"
    echo "Example: $0 6G npm test"
    exit 1
fi

# Parse memory limit to bytes for ulimit fallback
parse_memory_to_kb() {
    local mem="$1"
    local num="${mem%[GgMmKk]*}"
    local unit="${mem: -1}"

    case "$unit" in
        G|g) echo $((num * 1024 * 1024)) ;;
        M|m) echo $((num * 1024)) ;;
        K|k) echo "$num" ;;
        *)   echo "$mem" ;;  # Assume KB if no unit
    esac
}

# Check systemd availability
use_systemd() {
    # Check if systemd-run exists and user session is available
    command -v systemd-run >/dev/null 2>&1 && \
    systemctl --user is-system-running >/dev/null 2>&1
}

# Check if running in WSL (systemd support varies)
is_wsl() {
    grep -qi microsoft /proc/version 2>/dev/null
}

echo "=== Memory-Limited Execution (ANTI-024) ==="
echo "Limit: $MEMORY_LIMIT"
echo "Command: $*"
echo ""

if use_systemd; then
    echo "Using: systemd-run (cgroups v2)"
    echo ""

    # Run with systemd memory limit
    # --user: run as current user
    # --scope: transient scope (not a service)
    # -p MemoryMax: hard memory limit
    # -p MemorySwapMax=0: disable swap so OOM killer triggers at limit
    exec systemd-run --user --scope \
        -p MemoryMax="$MEMORY_LIMIT" \
        -p MemorySwapMax=0 \
        --description="CFN test run with memory limit" \
        "$@"

elif is_wsl; then
    # WSL may not have full systemd support
    echo "Using: ulimit (WSL detected, systemd unavailable)"
    echo ""

    MEM_KB=$(parse_memory_to_kb "$MEMORY_LIMIT")

    # Set virtual memory limit (soft enforcement)
    ulimit -v "$MEM_KB" 2>/dev/null || true

    # Also set resident set size limit
    ulimit -m "$MEM_KB" 2>/dev/null || true

    exec "$@"

else
    echo "Using: ulimit (systemd unavailable)"
    echo ""

    MEM_KB=$(parse_memory_to_kb "$MEMORY_LIMIT")
    ulimit -v "$MEM_KB" 2>/dev/null || true
    ulimit -m "$MEM_KB" 2>/dev/null || true

    exec "$@"
fi
