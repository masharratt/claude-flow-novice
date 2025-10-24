#!/bin/bash

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --key)
            key="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$key" ]]; then
    echo "Error: Key is required"
    exit 1
fi

# Retrieve context from Redis
context=$(redis-cli get "$key")

# Print the context (if exists)
echo "$context"

# Exit successfully
exit 0
