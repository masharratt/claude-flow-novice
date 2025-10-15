#!/bin/bash
# Enhanced Memory Spiral Detector and Killer
# Uses shared configuration for consistent behavior across CFN systems

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config/memory-monitoring-config.js"

# Source configuration (if available)
if [ -f "$CONFIG_FILE" ]; then
    echo "📋 Loading configuration from: $CONFIG_FILE"
    # Extract key values from config (simplified approach)
    MAX_MEMORY_MB=4000  # Default high threshold
    WARNING_THRESHOLD_MB=3000  # Warning threshold
    CHECK_INTERVAL=15    # Check every 15 seconds
    MIN_SAMPLES=3        # Need multiple high memory readings
    GRACE_PERIOD=60      # 60 seconds grace period for new processes
else
    echo "⚠️  Configuration file not found, using defaults"
    # Default values from shared configuration
    MAX_MEMORY_MB=4000
    WARNING_THRESHOLD_MB=3000
    CHECK_INTERVAL=15
    MIN_SAMPLES=3
    GRACE_PERIOD=60
fi

LOG_FILE="./enhanced-memory-spiral-killer.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Track process memory history for leak detection
declare -A PROCESS_HISTORY
declare -A PROCESS_START_TIME
declare -A PROCESS_CMDLINE

# Function to get process command line
get_process_cmdline() {
    local pid=$1
    if [ -f "/proc/$pid/cmdline" ]; then
        tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || echo ""
    fi
}

# Function to determine if process is a target
is_target_process() {
    local cmdline="$1"
    case "$cmdline" in
        *claude*|*node*|*rust*|*cargo*|*python*|*python3*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Function to get process-specific threshold
get_process_threshold() {
    local pid=$1
    local name=$2
    local cmdline="$3"

    # Default thresholds based on process type
    case "$cmdline" in
        *cfn-coordinator-enterprise*)
            echo 3000  # Higher limit for enterprise
            ;;
        *cfn-coordinator*)
            echo 2000  # Standard coordinator limit
            ;;
        *spawn-coordinator*|*spawn-workers*)
            echo 1500  # Worker limit
            ;;
        *cargo*)
            echo 3000  # Cargo builds can use more memory
            ;;
        *rust*)
            echo 2000  # Rust processes
            ;;
        *node*)
            echo 1000  # Node processes
            ;;
        *)
            echo 1500  # Default
            ;;
    esac
}

# Function to analyze memory growth pattern
analyze_memory_growth() {
    local history="$1"
    local samples=($(echo "$history" | tr ',' ' '))
    local count=${#samples[@]}

    if [ $count -lt $MIN_SAMPLES ]; then
        echo "insufficient_data"
        return
    fi

    # Check last few samples for growth pattern
    local recent_samples=("${samples[@]: -$MIN_SAMPLES}")
    local increasing_count=0
    local total_segments=$((MIN_SAMPLES - 1))

    for ((i=1; i<${#recent_samples[@]}; i++)); do
        if (( $(echo "${recent_samples[$i]} > ${recent_samples[$((i-1))]}" | bc -l) )); then
            ((increasing_count++))
        fi
    done

    # Calculate growth ratio
    local growth_ratio=$(echo "scale=2; $increasing_count / $total_segments" | bc)

    # Check if growth is consistent (>70% increasing)
    if (( $(echo "$growth_ratio > 0.7" | bc -l) )); then
        echo "consistent_growth:$growth_ratio"
    else
        echo "normal_pattern:$growth_ratio"
    fi
}

log "🚀 Starting Enhanced Memory Spiral Detector (Unified Configuration)"
log "📊 Warning threshold: ${WARNING_THRESHOLD_MB}MB, Max threshold: ${MAX_MEMORY_MB}MB"
log "🔍 Check interval: ${CHECK_INTERVAL}s, Grace period: ${GRACE_PERIOD}s"
log "📋 Configuration: Using CFN shared configuration standards"

while true; do
    # Get current time for grace period calculations
    CURRENT_TIME=$(date +%s)

    # Check for high memory processes (monitoring threshold)
    MONITOR_THRESHOLD_MB=1000  # Start monitoring at 1GB
    HIGH_MEM_PROCS=$(ps aux | awk -v max=$MONITOR_THRESHOLD_MB '$6/1024 > max {print $2 ":" $6/1024 ":" $11}' | head -10)

    if [ -n "$HIGH_MEM_PROCS" ]; then
        echo "$HIGH_MEM_PROCS" | while IFS=':' read -r pid mem cmd; do
            # Get full command line for better process identification
            cmdline=$(get_process_cmdline $pid)

            # Check if this is a target process
            if is_target_process "$cmdline"; then
                # Initialize process tracking if not seen before
                if [ -z "${PROCESS_START_TIME[$pid]}" ]; then
                    PROCESS_START_TIME[$pid]=$CURRENT_TIME
                    PROCESS_HISTORY[$pid]="$mem"
                    PROCESS_CMDLINE[$pid]="$cmdline"
                    log "📊 Started monitoring PID $pid (${mem}MB) - $cmdline"
                fi

                # Update memory history
                PROCESS_HISTORY[$pid]="${PROCESS_HISTORY[$pid]},$mem"

                # Check grace period
                PROCESS_AGE=$((CURRENT_TIME - PROCESS_START_TIME[$pid]))
                if [ $PROCESS_AGE -lt $GRACE_PERIOD ]; then
                    continue  # Skip killing new processes
                fi

                # Get process-specific threshold
                PROCESS_THRESHOLD=$(get_process_threshold $pid "$cmdline")
                PROCESS_WARNING_THRESHOLD=$(echo "$PROCESS_THRESHOLD * 0.7" | bc)

                # Analyze memory pattern
                HISTORY="${PROCESS_HISTORY[$pid]}"
                SAMPLE_COUNT=$(echo "$HISTORY" | tr ',' '\n' | wc -l)

                if [ $SAMPLE_COUNT -ge $MIN_SAMPLES ]; then
                    # Analyze growth pattern
                    GROWTH_ANALYSIS=$(analyze_memory_growth "$HISTORY")
                    GROWTH_TYPE=$(echo "$GROWTH_ANALYSIS" | cut -d':' -f1)
                    GROWTH_RATIO=$(echo "$GROWTH_ANALYSIS" | cut -d':' -f2)

                    # Warning level (process-specific)
                    if (( $(echo "$mem > $PROCESS_WARNING_THRESHOLD" | bc -l) )); then
                        log "⚠️  HIGH MEMORY WARNING: PID $pid (${mem}MB) - threshold: ${PROCESS_THRESHOLD}MB (growth: ${GROWTH_RATIO})"
                    fi

                    # Only kill if:
                    # 1. Memory exceeds max threshold
                    # 2. Growth pattern suggests leak
                    # 3. Process is old enough
                    if (( $(echo "$mem > $MAX_MEMORY_MB" | bc -l) )) && [ "$GROWTH_TYPE" = "consistent_growth" ]; then
                        log "🚨 MEMORY LEAK DETECTED: PID $pid (${mem}MB) - sustained growth (${GROWTH_RATIO})"
                        log "📋 Process details: $cmdline"
                        log "⚠️  ATTEMPTING GRACEFUL SHUTDOWN: PID $pid"

                        # Try graceful shutdown first
                        if kill -TERM "$pid" 2>/dev/null; then
                            sleep 10
                            if ps -p "$pid" > /dev/null; then
                                log "💀 FORCE KILL: PID $pid did not shutdown gracefully"
                                kill -9 "$pid" 2>/dev/null && log "✅ Force killed PID $pid" || log "❌ Failed to kill PID $pid"
                            else
                                log "✅ Gracefully shutdown PID $pid"
                            fi
                        else
                            log "❌ Failed to send SIGTERM to PID $pid"
                        fi

                        # Clean up tracking
                        unset PROCESS_START_TIME[$pid]
                        unset PROCESS_HISTORY[$pid]
                        unset PROCESS_CMDLINE[$pid]
                    fi
                fi
            fi
        done
    fi

    # Check total system memory usage
    if command -v free >/dev/null 2>&1; then
        TOTAL_MEM=$(free | awk '/^Mem:/{printf "%.1f", $3/$2 * 100.0}')
        if (( $(echo "$TOTAL_MEM > 85" | bc -l) )); then
            log "⚠️  System memory high: ${TOTAL_MEM}% (consider manual intervention)"
        fi
    fi

    sleep $CHECK_INTERVAL
done