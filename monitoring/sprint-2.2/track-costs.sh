#!/bin/bash

# Track Z.ai worker costs for sprint 2.2
COST_FILE="/mnt/c/Users/masha/Documents/claude-flow-novice/monitoring/sprint-2.2/zai-costs.csv"

echo "Timestamp,Worker ID,Task Duration,Token Usage,Cost" > "$COST_FILE"

while true; do
    for worker in worker-1 worker-2 worker-3 worker-4 worker-5; do
        TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
        TASK_DURATION=$(docker logs "sprint-2.2_${worker}" 2>/dev/null | grep -o "Task Duration: [0-9.]*" | cut -d' ' -f3)
        TOKEN_USAGE=$(docker logs "sprint-2.2_${worker}" 2>/dev/null | grep -o "Tokens Used: [0-9]*" | cut -d' ' -f3)
        COST=$(echo "scale=4; $TOKEN_USAGE * 0.001" | bc)  # $0.001 per 1000 tokens

        echo "$TIMESTAMP,$worker,$TASK_DURATION,$TOKEN_USAGE,$COST" >> "$COST_FILE"
    done

    sleep 3600  # Update every hour
done