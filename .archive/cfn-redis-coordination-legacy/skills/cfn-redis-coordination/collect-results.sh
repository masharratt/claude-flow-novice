#!/bin/bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: coordination-wrapper.js
#
# This script will be removed in 90 days. Please migrate to TypeScript.
#
# Migration Guide: See docs/BASH_DEPRECATION_NOTICE.md
# TypeScript Benefits:
#   - Type safety (zero runtime type errors)
#   - 90%+ test coverage
#   - Better performance
#   - Comprehensive documentation
#
# Automatic Migration:
#   Set USE_TYPESCRIPT=true to use TypeScript implementation automatically
#
##############################################################################


# Redis Results Collection Primitive
# Updated interface to match orchestrator expectations
# Supports both legacy (--key) and new (--task-id --agent-ids --namespace) interfaces

# Initialize variables
task_id=""
agent_ids=""
key=""
namespace="swarm"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-id)
            task_id="$2"
            shift 2
            ;;
        --agent-ids)
            agent_ids="$2"
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
if [[ -n "$task_id" && -n "$agent_ids" ]]; then
    # New interface: collect from multiple agents
    # Format: {namespace}:{task_id}:results
    redis_key="${namespace}:${task_id}:results"

    # Collect results from each agent
    IFS=',' read -ra AGENTS <<< "$agent_ids"
    results=""
    for agent in "${AGENTS[@]}"; do
        agent_key="${namespace}:${task_id}:${agent}:result"
        agent_result=$(redis-cli get "$agent_key" 2>/dev/null)
        if [[ -n "$agent_result" && "$agent_result" != "(nil)" ]]; then
            results="${results}${agent}:${agent_result}"$'\n'
        fi
    done

    # Print collected results
    echo -n "$results"
elif [[ -n "$key" ]]; then
    # Legacy interface: key is used directly (list-based)
    redis_key="$key"

    # Collect results from Redis list
    results=$(redis-cli lrange "$redis_key" 0 -1 2>/dev/null)

    # Print the results
    echo "$results"
else
    echo "Error: Either (--task-id and --agent-ids) or --key is required" >&2
    echo "Usage: $0 --task-id <id> --agent-ids <comma-separated-ids> [--namespace <ns>]" >&2
    echo "   or: $0 --key <full-key>" >&2
    exit 1
fi

# Exit successfully
exit 0
