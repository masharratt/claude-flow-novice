#!/bin/bash
# Monitor memory every 30 seconds, 20 iterations

LOG_FILE="memory-monitor-$(date +%Y%m%d-%H%M%S).log"
ITERATIONS=20
INTERVAL=30

echo "=== Memory Monitor Started ===" | tee "$LOG_FILE"
echo "Monitoring for $((ITERATIONS * INTERVAL)) seconds ($ITERATIONS checks)" | tee -a "$LOG_FILE"
echo "Timestamp: $(date)" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

for i in $(seq 1 $ITERATIONS); do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # Total memory usage
    TOTAL_MEM=$(ps aux | grep -E "(claude|node)" | grep -v grep | awk '{sum+=$6} END {printf "%.1f", sum/1024}')

    # Node process count
    NODE_COUNT=$(ps aux | grep node | grep -v grep | grep -v snapfuse | wc -l)

    # Claude process count
    CLAUDE_COUNT=$(ps aux | grep claude | grep -v grep | wc -l)

    # Zombie processes
    ZOMBIE_COUNT=$(ps aux | grep "<defunct>" | grep -v grep | wc -l)

    # Find processes (memory bombs)
    FIND_COUNT=$(ps aux | grep "find /mnt/c" | grep -v grep | wc -l)

    # Hook processes
    HOOK_COUNT=$(ps aux | grep "npx claude-flow-novice hooks" | grep -v grep | wc -l)

    echo "[$i/$ITERATIONS] [$TIMESTAMP] MEM: ${TOTAL_MEM}MB | Node: $NODE_COUNT | Claude: $CLAUDE_COUNT | Zombies: $ZOMBIE_COUNT | Find: $FIND_COUNT | Hooks: $HOOK_COUNT" | tee -a "$LOG_FILE"

    # Alerts
    if (( $(echo "$TOTAL_MEM > 10000" | bc -l 2>/dev/null || echo 0) )); then
        echo "  ⚠️  WARNING: Memory usage exceeds 10GB!" | tee -a "$LOG_FILE"
    fi

    if [ "$NODE_COUNT" -gt 20 ]; then
        echo "  ⚠️  WARNING: $NODE_COUNT node processes (orphaned agents?)" | tee -a "$LOG_FILE"
    fi

    if [ "$FIND_COUNT" -gt 0 ]; then
        echo "  🔴 CRITICAL: $FIND_COUNT find commands on /mnt/c (MEMORY BOMB!)" | tee -a "$LOG_FILE"
    fi

    if [ "$ZOMBIE_COUNT" -gt 0 ]; then
        echo "  💀 ZOMBIE: $ZOMBIE_COUNT zombie processes detected" | tee -a "$LOG_FILE"
    fi

    if [ "$HOOK_COUNT" -gt 5 ]; then
        echo "  🔁 RECURSION: $HOOK_COUNT hook processes (possible recursion!)" | tee -a "$LOG_FILE"
    fi

    # Don't sleep on last iteration
    if [ $i -lt $ITERATIONS ]; then
        sleep $INTERVAL
    fi
done

echo "" | tee -a "$LOG_FILE"
echo "=== Monitoring Complete ===" | tee -a "$LOG_FILE"
echo "Log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
