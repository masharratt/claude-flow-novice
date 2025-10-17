#!/bin/bash

# Worker status monitoring script
WORKER_NAME=$1

# Initialize worker status
redis-cli set "swarm:worker:$WORKER_NAME:status" "arrived"

# Increment agents waiting counter
redis-cli INCR "swarm:gate:agents_waiting"

echo "Worker $WORKER_NAME has arrived and is waiting at the gate"

# Wait for release signal
while true; do
    RELEASE_STATUS=$(redis-cli get "swarm:gate:release")
    if [ "$RELEASE_STATUS" = "true" ]; then
        redis-cli set "swarm:worker:$WORKER_NAME:status" "released"
        echo "Worker $WORKER_NAME has been released!"
        break
    fi
    sleep 1
done