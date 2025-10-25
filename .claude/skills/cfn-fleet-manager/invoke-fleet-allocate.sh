#!/bin/bash
#
# Fleet Manager - Resource Allocation CLI Wrapper
#
# Usage:
#   ./invoke-fleet-allocate.sh --agent-id <id> --cpu <value> --memory <value> [--priority <low|normal|high>]
#
# Examples:
#   # Allocate custom resources
#   ./invoke-fleet-allocate.sh --agent-id backend-dev-1 --cpu 3.0 --memory 3072
#
#   # Allocate with priority flag
#   ./invoke-fleet-allocate.sh --agent-id cfn-validator-1 --cpu 4.0 --memory 4096 --priority high

set -euo pipefail

# Parse arguments
AGENT_ID=""
CPU=""
MEMORY=""
PRIORITY="normal"

while [[ $# -gt 0 ]]; do
    case $1 in
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --cpu)
            CPU="$2"
            shift 2
            ;;
        --memory)
            MEMORY="$2"
            shift 2
            ;;
        --priority)
            PRIORITY="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$AGENT_ID" ] || [ -z "$CPU" ] || [ -z "$MEMORY" ]; then
    echo "Error: --agent-id, --cpu, and --memory are required"
    echo ""
    echo "Usage: $0 --agent-id <id> --cpu <value> --memory <value> [--priority <low|normal|high>]"
    echo ""
    echo "Examples:"
    echo "  $0 --agent-id backend-dev-1 --cpu 3.0 --memory 3072"
    echo "  $0 --agent-id cfn-validator-1 --cpu 4.0 --memory 4096 --priority high"
    exit 1
fi

# Validate priority
if [[ ! "$PRIORITY" =~ ^(low|normal|high)$ ]]; then
    echo "Error: Invalid priority '$PRIORITY'"
    echo "Valid priorities: low, normal, high"
    exit 1
fi

# Check if agent is registered
REGISTRATION_KEY="fleet:agent:${AGENT_ID}:registration"
REGISTRATION=$(redis-cli GET "$REGISTRATION_KEY")

if [ -z "$REGISTRATION" ] || [ "$REGISTRATION" = "(nil)" ]; then
    echo "Error: Agent $AGENT_ID not registered"
    echo "Suggestion: Register agent first using invoke-fleet-register.sh"

    ERROR_RESULT=$(jq -n \
        --arg error "AGENT_NOT_FOUND" \
        --arg message "Agent $AGENT_ID not registered" \
        --arg suggestion "Register agent first using invoke-fleet-register.sh" \
        '{
            error: $error,
            message: $message,
            suggestion: $suggestion
        }')

    echo "$ERROR_RESULT"
    exit 1
fi

# Calculate available resources (mock calculation for demo)
# In production, this would check actual resource pool
TOTAL_CPU=100.0
TOTAL_MEMORY=102400

# Get currently allocated resources
POOL_KEY="fleet:pool:allocated"
ALLOCATED_CPU=$(redis-cli HGET "$POOL_KEY" "${AGENT_ID}:cpu" || echo "0")
ALLOCATED_MEMORY=$(redis-cli HGET "$POOL_KEY" "${AGENT_ID}:memory" || echo "0")

# Calculate remaining resources (simplified for demo)
CPU_REMAINING=$(echo "$TOTAL_CPU - $CPU" | bc)
MEMORY_REMAINING=$(echo "$TOTAL_MEMORY - $MEMORY" | bc)

# Check resource availability
if (( $(echo "$CPU_REMAINING < 0" | bc -l) )) || (( $(echo "$MEMORY_REMAINING < 0" | bc -l) )); then
    echo "Error: Insufficient resources"

    ERROR_RESULT=$(jq -n \
        --arg error "RESOURCE_UNAVAILABLE" \
        --arg message "Requested resources exceed available pool" \
        --arg req_cpu "$CPU" \
        --arg req_mem "$MEMORY" \
        --arg avail_cpu "$CPU_REMAINING" \
        --arg avail_mem "$MEMORY_REMAINING" \
        '{
            error: $error,
            message: $message,
            requested: {
                cpu: ($req_cpu | tonumber),
                memory: ($req_mem | tonumber)
            },
            available: {
                cpu: ($avail_cpu | tonumber),
                memory: ($avail_mem | tonumber)
            }
        }')

    echo "$ERROR_RESULT"
    exit 1
fi

# Create allocation record in Redis
ALLOCATION_KEY="fleet:agent:${AGENT_ID}:allocation"
TIMESTAMP=$(date +%s)

ALLOCATION_DATA=$(jq -n \
    --arg cpu "$CPU" \
    --arg memory "$MEMORY" \
    --arg priority "$PRIORITY" \
    --arg ts "$TIMESTAMP" \
    '{
        cpu: ($cpu | tonumber),
        memory: ($memory | tonumber),
        priority: $priority,
        timestamp: ($ts | tonumber)
    }')

echo "$ALLOCATION_DATA" | redis-cli -x SET "$ALLOCATION_KEY" >/dev/null

# Update resource pool
redis-cli HSET "$POOL_KEY" "${AGENT_ID}:cpu" "$CPU" >/dev/null
redis-cli HSET "$POOL_KEY" "${AGENT_ID}:memory" "$MEMORY" >/dev/null

# Output success message
echo "[$AGENT_ID] Resources allocated"
echo "  CPU: $CPU cores"
echo "  Memory: $MEMORY MB"
echo "  Priority: $PRIORITY"

# Return JSON result
RESULT=$(jq -n \
    --arg status "allocated" \
    --arg agent_id "$AGENT_ID" \
    --arg cpu "$CPU" \
    --arg memory "$MEMORY" \
    --arg cpu_rem "$CPU_REMAINING" \
    --arg mem_rem "$MEMORY_REMAINING" \
    --arg ts "$TIMESTAMP" \
    '{
        status: $status,
        agentId: $agent_id,
        allocated: {
            cpu: ($cpu | tonumber),
            memory: ($memory | tonumber)
        },
        availability: {
            cpuRemaining: ($cpu_rem | tonumber),
            memoryRemaining: ($mem_rem | tonumber)
        },
        timestamp: ($ts | tonumber)
    }')

echo "$RESULT"
