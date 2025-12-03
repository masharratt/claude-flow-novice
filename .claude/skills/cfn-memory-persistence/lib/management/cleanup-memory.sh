#!/bin/bash

# Memory Cleanup Script for CFN Operations
# Post-execution hook to clean up memory resources

set -euo pipefail

# Configuration
CLEANUP_DELAY=5  # Seconds to wait before cleanup
LOG_FILE="/tmp/cfn-memory-cleanup.log"
PROFILE_DIR="/tmp/claude-memory-profiles"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

cleanup_temp_files() {
    log "Cleaning up temporary files"

    # Clean old profile files (older than 24 hours)
    if [[ -d "$PROFILE_DIR" ]]; then
        local old_profiles=$(find "$PROFILE_DIR" -name "*.heapprofile" -mtime +1 2>/dev/null || true)
        if [[ -n "$old_profiles" ]]; then
            echo "$old_profiles" | xargs rm -f 2>/dev/null || true
            log "Removed old heap profiles"
        fi
    fi

    # Clean temp directories
    find /tmp -name "claude-*" -type d -mtime +1 -exec rm -rf {} + 2>/dev/null || true
    find /tmp -name "*claude*" -type f -mtime +1 -delete 2>/dev/null || true
}

cleanup_zombie_processes() {
    log "Checking for zombie Claude processes"

    local zombie_pids=$(ps aux | awk '$8 ~ /^Z/ && $11 ~ /claude/ {print $2}' || true)

    if [[ -n "$zombie_pids" ]]; then
        echo -e "${YELLOW}Found zombie Claude processes: $zombie_pids${NC}"
        # Zombies can't be killed directly, but we can log them
        log "Zombie processes detected: $zombie_pids"
    fi
}

cleanup_hanging_processes() {
    log "Checking for hanging Claude processes"

    # Find processes that have been running > 2 hours
    local hanging_pids=$(ps -eo pid,etime,cmd | awk '$3 ~ /claude/ && $2 ~ /([0-9]{2}:|[0-9]{3}-)/ {print $1}' || true)

    if [[ -n "$hanging_pids" ]]; then
        echo -e "${YELLOW}Found long-running Claude processes: $hanging_pids${NC}"

        for pid in $hanging_pids; do
            if kill -0 "$pid" 2>/dev/null; then
                local process_info=$(ps -p "$pid" -o pid,etime,pcpu,rss,cmd --no-headers)
                echo "  PID $pid: $process_info"

                # Check if process is consuming excessive memory (>4GB)
                local rss_kb=$(ps -p "$pid" -o rss= --no-headers 2>/dev/null || echo "0")
                local rss_mb=$((rss_kb / 1024))

                if [[ $rss_mb -gt 4096 ]]; then
                    echo -e "${YELLOW}  ⚠️  High memory usage: ${rss_mb}MB${NC}"
                    log "High memory process detected: PID $pid, Memory: ${rss_mb}MB"

                    # Ask user before killing (interactive mode)
                    if [[ -t 0 ]]; then
                        echo -n "Kill this process? (y/N): "
                        read -r response
                        if [[ "$response" =~ ^[Yy]$ ]]; then
                            kill -TERM "$pid" 2>/dev/null || true
                            sleep 2
                            kill -KILL "$pid" 2>/dev/null || true
                            echo "Process $pid terminated"
                            log "Terminated high memory process: PID $pid"
                        fi
                    else
                        # Non-interactive mode - just log
                        log "High memory process (non-interactive): PID $pid, Memory: ${rss_mb}MB"
                    fi
                fi
            fi
        done
    fi
}

cleanup_network_resources() {
    log "Cleaning up network resources"

    # Find and close hanging network connections
    local hanging_connections=$(netstat -tnp 2>/dev/null | grep 'ESTABLISHED' | grep 'claude' || true)

    if [[ -n "$hanging_connections" ]]; then
        local connection_count=$(echo "$hanging_connections" | wc -l)
        echo -e "${BLUE}Found $connection_count established Claude connections${NC}"

        # Just log them - don't actively close as it might disrupt valid operations
        log "Active connections: $connection_count"
    fi
}

trim_memory_usage() {
    log "Triggering memory trim operations"

    # Trigger garbage collection if Node.js processes are running
    local node_pids=$(pgrep -f "node.*claude" || true)

    if [[ -n "$node_pids" ]]; then
        echo -e "${BLUE}Triggering garbage collection for Node.js processes${NC}"

        while read -r pid; do
            if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
                # Send SIGUSR2 to trigger heap dump (if the process is configured to handle it)
                kill -USR2 "$pid" 2>/dev/null || true
                log "Sent memory trim signal to PID $pid"
            fi
        done <<< "$node_pids"
    fi

    # Linux-specific memory operations
    if [[ -f /proc/sys/vm/drop_caches ]]; then
        # Note: This requires root privileges
        if [[ $EUID -eq 0 ]]; then
            echo -e "${BLUE}Dropping system caches${NC}"
            sync
            echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
            log "Dropped system caches"
        else
            echo -e "${YELLOW}System cache drop requires root privileges${NC}"
        fi
    fi
}

generate_cleanup_report() {
    log "Generating cleanup report"

    echo ""
    echo -e "${GREEN}=== Memory Cleanup Report ===${NC}"

    # Current memory status
    if command -v free &> /dev/null; then
        echo -e "${BLUE}Current Memory Status:${NC}"
        free -h
        echo ""
    fi

    # Claude processes
    local claude_pids=$(pgrep -f "claude" || true)
    if [[ -n "$claude_pids" ]]; then
        echo -e "${BLUE}Active Claude Processes:${NC}"
        ps -p $claude_pids -o pid,pcpu,rss,etime,cmd 2>/dev/null || true
        echo ""
    else
        echo -e "${GREEN}No active Claude processes found${NC}"
        echo ""
    fi

    # Temporary files
    if [[ -d "$PROFILE_DIR" ]]; then
        local profile_count=$(find "$PROFILE_DIR" -name "*.heapprofile" 2>/dev/null | wc -l)
        echo -e "${BLUE}Profile files: $profile_count${NC}"
    fi

    echo -e "${GREEN}Cleanup completed${NC}"
    log "Cleanup report generated"
}

main() {
    echo -e "${BLUE}Starting memory cleanup...${NC}"
    log "Memory cleanup started"

    # Wait a bit to allow processes to finish naturally
    sleep $CLEANUP_DELAY

    # Perform cleanup operations
    cleanup_temp_files
    cleanup_zombie_processes
    cleanup_hanging_processes
    cleanup_network_resources
    trim_memory_usage

    # Generate final report
    generate_cleanup_report

    log "Memory cleanup completed"
}

# Run main function
main "$@"