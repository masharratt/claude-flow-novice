#!/bin/bash
# Memory monitoring script for agent swarms

LOG_FILE="memory-monitor.log"
INTERVAL=5  # seconds

echo "=== Memory Monitor Started ===" | tee -a "$LOG_FILE"
echo "Timestamp: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # Total memory usage
    TOTAL_MEM=$(ps aux | grep -E "(claude|node)" | grep -v grep | awk '{sum+=$6} END {print sum/1024}')

    # Node process count
    NODE_COUNT=$(ps aux | grep node | grep -v grep | grep -v snapfuse | wc -l)

    # Claude process count
    CLAUDE_COUNT=$(ps aux | grep claude | grep -v grep | wc -l)

    # Zombie processes
    ZOMBIE_COUNT=$(ps aux | grep "<defunct>" | grep -v grep | wc -l)

    # Find processes (stuck)
    FIND_COUNT=$(ps aux | grep "find /mnt/c" | grep -v grep | wc -l)

    echo "[$TIMESTAMP] MEM: ${TOTAL_MEM}MB | Node: $NODE_COUNT | Claude: $CLAUDE_COUNT | Zombies: $ZOMBIE_COUNT | Find: $FIND_COUNT" | tee -a "$LOG_FILE"

    # Alert if memory exceeds 10GB
    if (( $(echo "$TOTAL_MEM > 10000" | bc -l) )); then
        echo "⚠️  WARNING: Memory usage exceeds 10GB!" | tee -a "$LOG_FILE"
    fi

    # Alert if too many node processes
    if [ "$NODE_COUNT" -gt 20 ]; then
        echo "⚠️  WARNING: $NODE_COUNT node processes detected (orphaned agents?)" | tee -a "$LOG_FILE"
    fi

    # Alert if find commands stuck
    if [ "$FIND_COUNT" -gt 0 ]; then
        echo "🔴 CRITICAL: $FIND_COUNT find commands running on /mnt/c (memory bomb!)" | tee -a "$LOG_FILE"
    fi

    sleep $INTERVAL
done
