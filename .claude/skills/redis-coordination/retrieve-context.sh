#!/bin/bash

# Redis Context Retrieval Primitive
# Updated interface to match orchestrator expectations
# Supports both legacy (--key) and new (--task-id --key --namespace) interfaces

# Initialize variables
task_id=""
key=""
namespace="swarm"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-id)
            task_id="$2"
            shift 2
            ;;
        --key)
            key="$2"
            shift 2
            ;;
        --namespace)
            namespace="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

# Construct Redis key based on interface mode
if [[ -n "$task_id" ]]; then
    # New interface: {namespace}:{task_id}:{key}
    redis_key="${namespace}:${task_id}:${key}"
else
    # Legacy interface: key is used directly
    redis_key="$key"
fi

# Validate required arguments
if [[ -z "$redis_key" ]]; then
    echo "Error: Key is required" >&2
    echo "Usage: $0 --task-id <id> --key <key> [--namespace <ns>]" >&2
    echo "   or: $0 --key <full-key>" >&2
    exit 1
fi

# Retrieve context from Redis
context=$(redis-cli get "$redis_key" 2>/dev/null)

# Print the context (if exists)
echo "$context"

# Exit successfully
exit 0
