#!/usr/bin/env bash
# Mock Worker Spawner
worker_type=$1
worker_count=$2

for ((i=1; i<=worker_count; i++)); do
    echo "Worker spawned: $worker_type-worker-$i"
done
