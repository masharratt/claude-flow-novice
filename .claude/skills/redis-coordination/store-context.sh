#!/bin/bash

# Redis Context Storage Primitive
# Updated interface to match orchestrator expectations
# Supports both legacy (--key --context) and new (--task-id --key --value --namespace) interfaces

# Initialize variables
task_id=""
key=""
value=""
namespace="swarm"
ttl=3600

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
        --value)
            value="$2"
            shift 2
            ;;
        --context)
            # Legacy support: --context is alias for --value
            value="$2"
            shift 2
            ;;
        --namespace)
            namespace="$2"
            shift 2
            ;;
        --ttl)
            ttl="$2"
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
if [[ -z "$redis_key" || -z "$value" ]]; then
    echo "Error: Both key and value are required" >&2
    echo "Usage: $0 --task-id <id> --key <key> --value <data> [--namespace <ns>] [--ttl <seconds>]" >&2
    echo "   or: $0 --key <full-key> --context <data> [--ttl <seconds>]" >&2
    exit 1
fi

# Store in Redis with specified TTL
redis-cli setex "$redis_key" "$ttl" "$value" >/dev/null

# Exit successfully
exit 0
