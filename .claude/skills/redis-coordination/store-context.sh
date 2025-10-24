#!/bin/bash

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --key)
            key="$2"
            shift 2
            ;;
        --context)
            context="$2"
            shift 2
            ;;
        --ttl)
            ttl="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$key" || -z "$context" ]]; then
    echo "Error: Both key and context are required"
    exit 1
fi

# Default TTL to 3600 if not provided
ttl=${ttl:-3600}

# Store in Redis with specified TTL
redis-cli setex "$key" "$ttl" "$context"

# Exit successfully
exit 0
