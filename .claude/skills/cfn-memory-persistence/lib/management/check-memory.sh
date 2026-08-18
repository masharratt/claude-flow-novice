#!/usr/bin/env bash

# Memory Check Script for CFN Operations
# Pre-execution hook to ensure sufficient memory is available

set -euo pipefail

# Configuration
MIN_FREE_MB=2048  # Minimum 2GB free memory required
WARNING_THRESHOLD_MB=4096  # Warning at 4GB
LOG_FILE="/tmp/cfn-memory-check.log"

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

check_system_memory() {
    local total_mb=0
    local available_mb=0
    local used_mb=0

    if command -v free &> /dev/null; then
        # Linux/WSL
        local mem_info=$(free -m | awk 'NR==2{print $2,$3,$7}')
        total_mb=$(echo "$mem_info" | cut -d' ' -f1)
        used_mb=$(echo "$mem_info" | cut -d' ' -f2)
        available_mb=$(echo "$mem_info" | cut -d' ' -f3)
    elif command -v vm_stat &> /dev/null; then
        # macOS
        local page_size=$(vm_stat | head -1 | sed 's/.*page size of \([0-9]*\).*/\1/')
        local free_pages=$(vm_stat | awk '/free/ {gsub(/\./, "", $3); print $3}')
        local active_pages=$(vm_stat | awk '/active/ {gsub(/\./, "", $3); print $3}')
        local inactive_pages=$(vm_stat | awk '/inactive/ {gsub(/\./, "", $3); print $3}')
        local wired_pages=$(vm_stat | awk '/wired/ {gsub(/\./, "", $3); print $3}')

        total_mb=$(((active_pages + inactive_pages + wired_pages + free_pages) * page_size / 1024 / 1024))
        available_mb=$((free_pages * page_size / 1024 / 1024))
        used_mb=$((total_mb - available_mb))
    else
        log "ERROR: Cannot determine system memory (free/vm_stat not available)"
        return 1
    fi

    echo "${total_mb},${used_mb},${available_mb}"
}

check_claude_processes() {
    local claude_pids=$(pgrep -f "claude" || true)
    local total_claude_memory=0
    local process_count=0

    if [[ -n "$claude_pids" ]]; then
        while read -r pid; do
            if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
                local rss_kb=$(ps -p "$pid" -o rss= --no-headers 2>/dev/null || echo "0")
                local rss_mb=$((rss_kb / 1024))
                total_claude_memory=$((total_claude_memory + rss_mb))
                process_count=$((process_count + 1))
            fi
        done <<< "$claude_pids"
    fi

    echo "${process_count},${total_claude_memory}"
}

main() {
    log "Starting memory check for CFN operation"

    # Check system memory
    local mem_info=$(check_system_memory)
    IFS=',' read -r total_mb used_mb available_mb <<< "$mem_info"

    echo "System Memory Status:"
    echo "  Total: ${total_mb}MB"
    echo "  Used: ${used_mb}MB"
    echo "  Available: ${available_mb}MB"

    # Check Claude processes
    local claude_info=$(check_claude_processes)
    IFS=',' read -r claude_count claude_memory_mb <<< "$claude_info"

    if [[ $claude_count -gt 0 ]]; then
        echo "Claude Processes:"
        echo "  Count: $claude_count"
        echo "  Memory: ${claude_memory}MB"
    fi

    # Calculate available memory for new operation
    local available_for_operation=$((available_mb - claude_memory_mb))

    echo "Available for CFN operation: ${available_for_operation}MB"

    # Check thresholds
    if [[ $available_for_operation -lt $MIN_FREE_MB ]]; then
        echo -e "${RED}❌ Insufficient memory for CFN operation${NC}"
        echo "Required: ${MIN_FREE_MB}MB, Available: ${available_for_operation}MB"
        echo ""
        echo "Suggestions:"
        echo "  1. Close existing Claude processes: pkill -f claude"
        echo "  2. Free system memory: sudo sync && sudo sysctl vm.drop_caches=3"
        echo "  3. Restart your terminal/shell session"
        echo "  4. Reduce memory requirements with smaller tasks"

        log "CRITICAL: Insufficient memory - Required: ${MIN_FREE_MB}MB, Available: ${available_for_operation}MB"
        return 1
    elif [[ $available_for_operation -lt $WARNING_THRESHOLD_MB ]]; then
        echo -e "${YELLOW}⚠️  Low memory warning${NC}"
        echo "Available: ${available_for_operation}MB (Recommended: ${WARNING_THRESHOLD_MB}MB+)"
        echo "Consider closing other applications for optimal performance"

        log "WARNING: Low memory - Available: ${available_for_operation}MB"
    else
        echo -e "${GREEN}✅ Sufficient memory available${NC}"
        log "OK: Sufficient memory - Available: ${available_for_operation}MB"
    fi

    # Check for memory leak indicators
    if [[ $claude_count -gt 0 ]]; then
        local avg_claude_memory=$((claude_memory_mb / claude_count))
        if [[ $avg_claude_memory -gt 4096 ]]; then
            echo -e "${YELLOW}⚠️  High Claude memory usage detected${NC}"
            echo "Average per process: ${avg_claude_memory}MB"
            echo "Consider restarting Claude processes"

            log "WARNING: High Claude memory usage - Average: ${avg_claude_memory}MB"
        fi
    fi

    # Check WSL-specific issues
    if [[ -f /proc/version ]] && grep -qi microsoft /proc/version; then
        echo "WSL Environment Detected:"

        # Check WSL memory limits
        if [[ -f /proc/meminfo ]]; then
            local wsl_total=$(grep MemTotal /proc/meminfo | awk '{print int($2/1024)}')
            if [[ $wsl_total -lt 8192 ]]; then
                echo -e "${YELLOW}⚠️  Low WSL memory limit: ${wsl_total}MB${NC}"
                echo "Consider increasing WSL memory in .wslconfig"
                echo ""
                echo "Create %USERPROFILE%\\.wslconfig with:"
                echo "[wsl2]"
                echo "memory=16GB"
                echo "swap=4GB"
            fi
        fi
    fi

    echo ""
    echo "Memory check completed successfully"
    return 0
}

# Run main function
main "$@"