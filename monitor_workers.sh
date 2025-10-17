#!/bin/bash

echo "Starting worker coordination monitor..."
echo "Monitoring worker arrivals at the gate..."

while true; do
    WAITING_COUNT=$(redis-cli get "swarm:gate:agents_waiting")
    if [ -z "$WAITING_COUNT" ]; then
        WAITING_COUNT=0
    fi
    
    echo "Workers waiting at gate: $WAITING_COUNT"
    
    # Check if all workers have arrived
    if [ "$WAITING_COUNT" = "3" ]; then
        echo "All workers have arrived! Releasing them now..."
        redis-cli set "swarm:gate:release" "true"
        
        # Wait a moment for release to propagate
        sleep 2
        
        # Check final status
        echo "Final worker statuses:"
        for worker in "backend-dev" "coder" "devops-engineer"; do
            status=$(redis-cli get "swarm:worker:$worker:status")
            echo "  $worker: $status"
        done
        
        break
    fi
    
    sleep 2
done