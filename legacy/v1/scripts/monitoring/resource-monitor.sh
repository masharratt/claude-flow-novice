#!/bin/bash
# Resource monitoring script for 100-agent coordination test
# Tracks memory, CPU, file descriptors, processes, and disk I/O

set -euo pipefail

# Configuration
SAMPLE_INTERVAL=1
OUTPUT_DIR="${1:-./monitoring-results}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CSV_FILE="${OUTPUT_DIR}/resource-usage-${TIMESTAMP}.csv"
LOG_FILE="${OUTPUT_DIR}/monitor-${TIMESTAMP}.log"
PID_FILE="${OUTPUT_DIR}/monitor.pid"

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Store monitor PID for cleanup
echo $$ > "${PID_FILE}"

# Cleanup function
cleanup() {
    echo "[$(date +%H:%M:%S)] Monitoring stopped. Results: ${CSV_FILE}" | tee -a "${LOG_FILE}"
    rm -f "${PID_FILE}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Initialize CSV with headers
echo "timestamp,elapsed_sec,memory_rss_mb,memory_vsz_mb,memory_shm_mb,cpu_percent,fd_count,process_count,node_processes,io_read_mb,io_write_mb" > "${CSV_FILE}"

echo "[$(date +%H:%M:%S)] Resource monitoring started" | tee -a "${LOG_FILE}"
echo "[$(date +%H:%M:%S)] Output: ${CSV_FILE}" | tee -a "${LOG_FILE}"
echo "[$(date +%H:%M:%S)] Sampling every ${SAMPLE_INTERVAL}s" | tee -a "${LOG_FILE}"

# Baseline metrics
START_TIME=$(date +%s)
BASELINE_IO_READ=0
BASELINE_IO_WRITE=0

# Get baseline I/O if available
if [ -f /proc/diskstats ]; then
    BASELINE_IO_READ=$(awk '/sda/ {sum+=$6} END {print sum}' /proc/diskstats 2>/dev/null || echo 0)
    BASELINE_IO_WRITE=$(awk '/sda/ {sum+=$10} END {print sum}' /proc/diskstats 2>/dev/null || echo 0)
fi

# Monitoring loop
while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    TIMESTAMP=$(date +%Y-%m-%d_%H:%M:%S)

    # Memory metrics (RSS and VSZ for all node processes)
    MEMORY_RSS=0
    MEMORY_VSZ=0
    if pgrep -f "node|npm" > /dev/null 2>&1; then
        MEMORY_RSS=$(ps aux | grep -E "node|npm" | grep -v grep | awk '{sum+=$6} END {print sum/1024}' || echo 0)
        MEMORY_VSZ=$(ps aux | grep -E "node|npm" | grep -v grep | awk '{sum+=$5} END {print sum/1024}' || echo 0)
    fi

    # Shared memory (tmpfs /dev/shm)
    MEMORY_SHM=0
    if [ -d /dev/shm ]; then
        MEMORY_SHM=$(du -sm /dev/shm 2>/dev/null | cut -f1 || echo 0)
    fi

    # CPU usage (average across all node processes)
    CPU_PERCENT=0
    if pgrep -f "node|npm" > /dev/null 2>&1; then
        CPU_PERCENT=$(ps aux | grep -E "node|npm" | grep -v grep | awk '{sum+=$3} END {print sum}' || echo 0)
    fi

    # File descriptor count (sample from first node process for speed)
    FD_COUNT=0
    FIRST_NODE_PID=$(pgrep -f "node|npm" 2>/dev/null | head -1 | tr -d '\n' || echo "")
    if [ -n "${FIRST_NODE_PID}" ] && [ -d "/proc/${FIRST_NODE_PID}/fd" ]; then
        FD_COUNT=$(ls "/proc/${FIRST_NODE_PID}/fd" 2>/dev/null | wc -l | tr -d '\n' || echo 0)
    fi

    # Process count (all node/npm processes) - ensure single line
    PROCESS_COUNT=$(pgrep -f "node|npm" 2>/dev/null | wc -l | tr -d '\n' || echo 0)
    NODE_PROCESSES=$(pgrep -f "node" 2>/dev/null | wc -l | tr -d '\n' || echo 0)

    # Disk I/O (if available via /proc/diskstats)
    IO_READ_MB=0
    IO_WRITE_MB=0
    if [ -f /proc/diskstats ]; then
        CURRENT_IO_READ=$(awk '/sda/ {sum+=$6} END {print sum}' /proc/diskstats 2>/dev/null || echo 0)
        CURRENT_IO_WRITE=$(awk '/sda/ {sum+=$10} END {print sum}' /proc/diskstats 2>/dev/null || echo 0)
        IO_READ_MB=$(echo "scale=2; ($CURRENT_IO_READ - $BASELINE_IO_READ) * 512 / 1024 / 1024" | bc 2>/dev/null || echo 0)
        IO_WRITE_MB=$(echo "scale=2; ($CURRENT_IO_WRITE - $BASELINE_IO_WRITE) * 512 / 1024 / 1024" | bc 2>/dev/null || echo 0)
    fi

    # Round floating point values
    MEMORY_RSS=$(printf "%.2f" "${MEMORY_RSS}")
    MEMORY_VSZ=$(printf "%.2f" "${MEMORY_VSZ}")
    CPU_PERCENT=$(printf "%.2f" "${CPU_PERCENT}")

    # Write CSV row
    echo "${TIMESTAMP},${ELAPSED},${MEMORY_RSS},${MEMORY_VSZ},${MEMORY_SHM},${CPU_PERCENT},${FD_COUNT},${PROCESS_COUNT},${NODE_PROCESSES},${IO_READ_MB},${IO_WRITE_MB}" >> "${CSV_FILE}"

    # Log significant events
    if (( $(echo "${MEMORY_RSS} > 5000" | bc -l 2>/dev/null || echo 0) )); then
        echo "[$(date +%H:%M:%S)] WARNING: High memory usage: ${MEMORY_RSS}MB RSS" | tee -a "${LOG_FILE}"
    fi

    if (( $(echo "${CPU_PERCENT} > 80" | bc -l 2>/dev/null || echo 0) )); then
        echo "[$(date +%H:%M:%S)] WARNING: High CPU usage: ${CPU_PERCENT}%" | tee -a "${LOG_FILE}"
    fi

    if [ "${FD_COUNT}" -gt 10000 ]; then
        echo "[$(date +%H:%M:%S)] WARNING: High FD count: ${FD_COUNT}" | tee -a "${LOG_FILE}"
    fi

    if [ "${PROCESS_COUNT}" -gt 500 ]; then
        echo "[$(date +%H:%M:%S)] WARNING: High process count: ${PROCESS_COUNT}" | tee -a "${LOG_FILE}"
    fi

    # Progress indicator every 10 seconds
    if [ $((ELAPSED % 10)) -eq 0 ] && [ "${ELAPSED}" -gt 0 ]; then
        echo "[$(date +%H:%M:%S)] ${ELAPSED}s | MEM: ${MEMORY_RSS}MB | CPU: ${CPU_PERCENT}% | FD: ${FD_COUNT} | PROC: ${PROCESS_COUNT}" | tee -a "${LOG_FILE}"
    fi

    sleep "${SAMPLE_INTERVAL}"
done
