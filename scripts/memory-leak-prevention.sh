#!/bin/bash

# Memory Leak Detection and Prevention Script
# Implements recommendations from memory leak analysis

set -euo pipefail

# Configuration
DEFAULT_MEMORY_LIMIT="8192"  # 8GB limit instead of 16GB
DEFAULT_NODE_OPTIONS="--max-old-space-size=$DEFAULT_MEMORY_LIMIT"
PROFILING_DIR="/tmp/claude-memory-profiles"
LOG_FILE="/tmp/claude-memory-monitor.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create profiling directory
mkdir -p "$PROFILING_DIR"

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

show_help() {
    cat << EOF
Memory Leak Detection and Prevention Tool

Usage: $0 [COMMAND] [OPTIONS]

Commands:
    profile           Start Claude with heap profiling enabled
    monitor           Monitor existing Claude process memory usage
    limit             Set memory limits for Claude sessions
    install-tools     Install strace and perf for WSL
    analyze           Analyze existing memory profiles
    config            Show current memory configuration

Options:
    --limit MB        Set memory limit in MB (default: 8192)
    --pid PID         Monitor specific process ID
    --duration SEC    Monitoring duration in seconds (default: 300)
    --output DIR      Output directory for profiles (default: /tmp/claude-memory-profiles)

Examples:
    $0 profile --limit 6144                    # Start Claude with 6GB limit and profiling
    $0 monitor --pid 12345 --duration 600     # Monitor PID 12345 for 10 minutes
    $0 install-tools                          # Install strace and perf
    $0 analyze --output ./profiles            # Analyze existing profiles
EOF
}

install_debug_tools() {
    log "${BLUE}Installing strace and perf for debugging...${NC}"

    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y strace linux-tools-generic linux-perf
    elif command -v yum &> /dev/null; then
        sudo yum install -y strace perf
    else
        log "${RED}Unsupported package manager. Please install strace and perf manually.${NC}"
        return 1
    fi

    # Configure perf for non-root users
    echo -1 | sudo tee /proc/sys/kernel/perf_event_paranoid >/dev/null 2>&1 || true
    echo 0 | sudo tee /proc/sys/kernel/kptr_restrict >/dev/null 2>&1 || true

    log "${GREEN}Debug tools installed successfully${NC}"
}

start_with_profiling() {
    local memory_limit=${1:-$DEFAULT_MEMORY_LIMIT}

    log "${BLUE}Starting Claude with heap profiling and memory limit: ${memory_limit}MB${NC}"

    # Set up environment for profiling
    export NODE_OPTIONS="--max-old-space-size=$memory_limit --inspect=0.0.0.0:9229 --heap-prof"
    export CLAUDE_MEMORY_PROFILE_DIR="$PROFILING_DIR"

    # Create profile filename with timestamp
    local profile_file="${PROFILING_DIR}/claude-profile-$(date +%Y%m%d-%H%M%S)"

    log "${GREEN}Environment variables set:${NC}"
    log "  NODE_OPTIONS: $NODE_OPTIONS"
    log "  Profile directory: $PROFILING_DIR"
    log "${YELLOW}Claude will start with debugging enabled on port 9229${NC}"
    log "${YELLOW}Use Chrome DevTools or chrome://inspect to connect${NC}"

    # Start Claude CLI with profiling
    log "${BLUE}Starting Claude CLI...${NC}"
    npx claude-flow-novice "$@"
}

monitor_memory() {
    local target_pid=${1:-}
    local duration=${2:-300}
    local output_file="${PROFILING_DIR}/memory-monitor-$(date +%Y%m%d-%H%M%S).csv"

    if [[ -z "$target_pid" ]]; then
        log "${RED}Error: PID required for monitoring. Use --pid to specify.${NC}"
        return 1
    fi

    log "${BLUE}Monitoring PID $target_pid for ${duration} seconds...${NC}"
    log "Results will be saved to: $output_file"

    # Create CSV header
    echo "timestamp,pid,rss_mb,vms_mb,cpu_percent,open_files,connections" > "$output_file"

    local start_time=$(date +%s)
    local end_time=$((start_time + duration))

    while [[ $(date +%s) -lt $end_time ]]; do
        if ! kill -0 "$target_pid" 2>/dev/null; then
            log "${RED}Process $target_pid is no longer running${NC}"
            break
        fi

        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
        local stats=$(ps -p "$target_pid" -o pid,rss,vms,pcpu --no-headers 2>/dev/null || echo "")

        if [[ -n "$stats" ]]; then
            local rss_mb=$(echo "$stats" | awk '{print int($2/1024)}')
            local vms_mb=$(echo "$stats" | awk '{print int($3/1024)}')
            local cpu_percent=$(echo "$stats" | awk '{print $4}')

            # Count open files and network connections
            local open_files=$(lsof -p "$target_pid" 2>/dev/null | wc -l || echo "0")
            local connections=$(netstat -p 2>/dev/null | grep "$target_pid/" | wc -l || echo "0")

            echo "$timestamp,$target_pid,$rss_mb,$vms_mb,$cpu_percent,$open_files,$connections" >> "$output_file"

            # Alert if memory exceeds threshold
            if [[ $rss_mb -gt 8192 ]]; then
                log "${RED}⚠️  High memory usage detected: ${rss_mb}MB RSS${NC}"
            fi

            log "Memory: ${rss_mb}MB RSS, ${vms_mb}MB VMS, CPU: ${cpu_percent}%, Files: $open_files, Connections: $connections"
        fi

        sleep 10
    done

    log "${GREEN}Monitoring completed. Data saved to: $output_file${NC}"
}

set_memory_limits() {
    local limit_mb=${1:-8192}

    log "${BLUE}Setting memory limits to ${limit_mb}MB...${NC}"

    # Update shell configuration
    local shell_rc="$HOME/.bashrc"
    if [[ -f "$HOME/.zshrc" ]]; then
        shell_rc="$HOME/.zshrc"
    fi

    # Remove existing NODE_OPTIONS lines
    sed -i '/^export NODE_OPTIONS="--max-old-space-size=/d' "$shell_rc" 2>/dev/null || true

    # Add new limit
    echo "export NODE_OPTIONS=\"--max-old-space-size=$limit_mb\"" >> "$shell_rc"

    log "${GREEN}Memory limit set to ${limit_mb}MB in $shell_rc${NC}"
    log "${YELLOW}Restart your shell or run: source $shell_rc${NC}"
}

analyze_profiles() {
    local profile_dir=${1:-$PROFILING_DIR}

    log "${BLUE}Analyzing memory profiles in $profile_dir...${NC}"

    if [[ ! -d "$profile_dir" ]]; then
        log "${RED}Profile directory $profile_dir does not exist${NC}"
        return 1
    fi

    # Find heap profile files
    local heap_profiles=($(find "$profile_dir" -name "*.heapprofile" 2>/dev/null))

    if [[ ${#heap_profiles[@]} -eq 0 ]]; then
        log "${YELLOW}No heap profiles found in $profile_dir${NC}"
        return 1
    fi

    log "${GREEN}Found ${#heap_profiles[@]} heap profile(s)${NC}"

    for profile in "${heap_profiles[@]}"; do
        log "${BLUE}Analyzing: $(basename "$profile")${NC}"

        # Basic analysis - find top allocations
        if command -v node &> /dev/null; then
            echo "Top 10 allocations in $(basename "$profile"):" > "${profile}.analysis"
            node -e "
                const fs = require('fs');
                const data = JSON.parse(fs.readFileSync('$profile', 'utf8'));
                const allocations = data.heapProfile || data;
                if (allocations && allocations.samples) {
                    allocations.samples
                        .sort((a, b) => b.size - a.size)
                        .slice(0, 10)
                        .forEach((sample, i) => {
                            console.log(\`\${i+1}. \${sample.functionName || 'unknown'}: \${(sample.size/1024/1024).toFixed(2)}MB\`);
                        });
                }
            " >> "${profile}.analysis"

            log "${GREEN}Analysis saved to: ${profile}.analysis${NC}"
        fi
    done
}

show_config() {
    log "${BLUE}Current Memory Configuration:${NC}"

    # Show current NODE_OPTIONS
    if [[ -n "${NODE_OPTIONS:-}" ]]; then
        log "  NODE_OPTIONS: $NODE_OPTIONS"
    else
        log "  NODE_OPTIONS: (not set)"
    fi

    # Show current limits
    local current_limit=$(echo "$NODE_OPTIONS" | grep -o 'max-old-space-size=[0-9]*' | cut -d'=' -f2 || echo "unlimited")
    log "  Memory limit: ${current_limit}MB"

    # Show available memory
    if command -v free &> /dev/null; then
        local total_mem=$(free -m | awk 'NR==2{print $2}')
        local available_mem=$(free -m | awk 'NR==2{print $7}')
        log "  System memory: ${available_mem}MB available / ${total_mem}MB total"
    fi

    # Show profile directory
    log "  Profile directory: $PROFILING_DIR"
    log "  Log file: $LOG_FILE"
}

# Parse command line arguments
case "${1:-}" in
    "profile")
        shift
        local limit=$DEFAULT_MEMORY_LIMIT
        while [[ $# -gt 0 ]]; do
            case $1 in
                --limit) limit="$2"; shift 2 ;;
                *) shift ;;
            esac
        done
        start_with_profiling "$limit"
        ;;
    "monitor")
        shift
        local pid=""
        local duration=300
        while [[ $# -gt 0 ]]; do
            case $1 in
                --pid) pid="$2"; shift 2 ;;
                --duration) duration="$2"; shift 2 ;;
                *) shift ;;
            esac
        done
        monitor_memory "$pid" "$duration"
        ;;
    "limit")
        shift
        local limit=$DEFAULT_MEMORY_LIMIT
        while [[ $# -gt 0 ]]; do
            case $1 in
                --limit) limit="$2"; shift 2 ;;
                *) shift ;;
            esac
        done
        set_memory_limits "$limit"
        ;;
    "install-tools")
        install_debug_tools
        ;;
    "analyze")
        shift
        local dir=$PROFILING_DIR
        while [[ $# -gt 0 ]]; do
            case $1 in
                --output) dir="$2"; shift 2 ;;
                *) shift ;;
            esac
        done
        analyze_profiles "$dir"
        ;;
    "config")
        show_config
        ;;
    "help"|"-h"|"--help")
        show_help
        ;;
    *)
        log "${RED}Unknown command: ${1:-}${NC}"
        show_help
        exit 1
        ;;
esac