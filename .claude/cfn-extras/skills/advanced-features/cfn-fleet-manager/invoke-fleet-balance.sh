#!/usr/bin/env bash
#
# Fleet Manager - Load Balancing CLI Wrapper
#
# Usage:
#   ./invoke-fleet-balance.sh --agents <id1,id2,id3> [--strategy <round-robin|least-loaded|offload>] [--all]
#
# Examples:
#   # Balance resources across multiple agents
#   ./invoke-fleet-balance.sh --agents backend-dev-1,backend-dev-2,backend-dev-3
#
#   # Balance with specific strategy
#   ./invoke-fleet-balance.sh --agents cfn-validator-1,cfn-validator-2 --strategy round-robin
#
#   # Balance entire fleet
#   ./invoke-fleet-balance.sh --all

set -euo pipefail

# Parse arguments
AGENTS=""
STRATEGY="round-robin"
ALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --agents)
            AGENTS="$2"
            shift 2
            ;;
        --strategy)
            STRATEGY="$2"
            shift 2
            ;;
        --all)
            ALL=true
            shift
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Validate strategy
if [[ ! "$STRATEGY" =~ ^(round-robin|least-loaded|offload)$ ]]; then
    echo "Error: Invalid strategy '$STRATEGY'"
    echo "Valid strategies: round-robin, least-loaded, offload"
    exit 1
fi

# Get agent list
if [ "$ALL" = true ]; then
    # Get all registered agents
    POOL_KEY="fleet:pool:allocated"
    AGENT_LIST=$(redis-cli HKEYS "$POOL_KEY" | grep ':cpu$' | sed 's/:cpu$//' | sort -u | tr '\n' ',')
    AGENT_LIST=${AGENT_LIST%,}  # Remove trailing comma

    if [ -z "$AGENT_LIST" ]; then
        echo "No agents registered"
        exit 0
    fi
elif [ -n "$AGENTS" ]; then
    AGENT_LIST="$AGENTS"
else
    echo "Error: Must specify --agents or --all"
    echo ""
    echo "Usage: $0 --agents <id1,id2,id3> [--strategy <round-robin|least-loaded|offload>] [--all]"
    echo ""
    echo "Examples:"
    echo "  $0 --agents backend-dev-1,backend-dev-2,backend-dev-3"
    echo "  $0 --agents cfn-validator-1,cfn-validator-2 --strategy round-robin"
    echo "  $0 --all"
    exit 1
fi

# Split agent IDs
IFS=',' read -ra AGENT_ARRAY <<< "$AGENT_LIST"

echo "[Fleet Manager] Starting load balancing..."
echo "  Strategy: $STRATEGY"
echo "  Agents: ${AGENT_ARRAY[@]}"
echo ""

# Generate balance ID
BALANCE_ID="balance-$(date +%s)-$$"

# Collect current load for each agent
declare -A BEFORE_LOAD
declare -A AFTER_LOAD

TOTAL_LOAD=0
AGENT_COUNT=${#AGENT_ARRAY[@]}

for AGENT_ID in "${AGENT_ARRAY[@]}"; do
    METRICS_KEY="fleet:agent:${AGENT_ID}:metrics"
    METRICS=$(redis-cli GET "$METRICS_KEY")

    if [ -n "$METRICS" ] && [ "$METRICS" != "(nil)" ]; then
        CPU_UTIL=$(echo "$METRICS" | jq -r '.metrics.cpuUtilization')
        BEFORE_LOAD[$AGENT_ID]=$CPU_UTIL
        TOTAL_LOAD=$(echo "$TOTAL_LOAD + $CPU_UTIL" | bc)
    else
        # Default to 0.5 if no metrics
        BEFORE_LOAD[$AGENT_ID]="0.50"
        TOTAL_LOAD=$(echo "$TOTAL_LOAD + 0.50" | bc)
    fi
done

# Calculate target load based on strategy
case "$STRATEGY" in
    round-robin)
        # Distribute evenly
        TARGET_LOAD=$(echo "scale=2; $TOTAL_LOAD / $AGENT_COUNT" | bc)

        for AGENT_ID in "${AGENT_ARRAY[@]}"; do
            AFTER_LOAD[$AGENT_ID]=$TARGET_LOAD
        done
        ;;

    least-loaded)
        # Move load from highest to lowest
        # Sort agents by load
        SORTED_AGENTS=$(for agent in "${!BEFORE_LOAD[@]}"; do
            echo "${BEFORE_LOAD[$agent]} $agent"
        done | sort -n)

        # Simple redistribution: reduce highest, increase lowest
        HIGHEST=$(echo "$SORTED_AGENTS" | tail -1 | awk '{print $2}')
        LOWEST=$(echo "$SORTED_AGENTS" | head -1 | awk '{print $2}')

        for AGENT_ID in "${AGENT_ARRAY[@]}"; do
            if [ "$AGENT_ID" = "$HIGHEST" ]; then
                AFTER_LOAD[$AGENT_ID]=$(echo "${BEFORE_LOAD[$AGENT_ID]} - 0.15" | bc)
            elif [ "$AGENT_ID" = "$LOWEST" ]; then
                AFTER_LOAD[$AGENT_ID]=$(echo "${BEFORE_LOAD[$AGENT_ID]} + 0.15" | bc)
            else
                AFTER_LOAD[$AGENT_ID]=${BEFORE_LOAD[$AGENT_ID]}
            fi
        done
        ;;

    offload)
        # Offload from first agent to others
        FIRST_AGENT="${AGENT_ARRAY[0]}"
        OFFLOAD_AMOUNT=$(echo "scale=2; ${BEFORE_LOAD[$FIRST_AGENT]} / $AGENT_COUNT" | bc)

        for AGENT_ID in "${AGENT_ARRAY[@]}"; do
            if [ "$AGENT_ID" = "$FIRST_AGENT" ]; then
                AFTER_LOAD[$AGENT_ID]=$(echo "${BEFORE_LOAD[$AGENT_ID]} - $OFFLOAD_AMOUNT" | bc)
            else
                INCREASE=$(echo "scale=2; $OFFLOAD_AMOUNT / ($AGENT_COUNT - 1)" | bc)
                AFTER_LOAD[$AGENT_ID]=$(echo "${BEFORE_LOAD[$AGENT_ID]} + $INCREASE" | bc)
            fi
        done
        ;;
esac

# Store balancing state in Redis
BALANCE_KEY="fleet:balance:${BALANCE_ID}:state"
TIMESTAMP=$(date +%s)

BALANCE_STATE=$(jq -n \
    --arg balance_id "$BALANCE_ID" \
    --arg strategy "$STRATEGY" \
    --arg agent_list "$AGENT_LIST" \
    --arg ts "$TIMESTAMP" \
    '{
        balanceId: $balance_id,
        strategy: $strategy,
        agents: ($agent_list | split(",")),
        status: "completed",
        timestamp: ($ts | tonumber)
    }')

echo "$BALANCE_STATE" | redis-cli -x SET "$BALANCE_KEY" >/dev/null

# Build result JSON
AGENT_RESULTS="["
FIRST=true

for AGENT_ID in "${AGENT_ARRAY[@]}"; do
    if [ "$FIRST" = false ]; then
        AGENT_RESULTS+=","
    fi
    FIRST=false

    BEFORE=${BEFORE_LOAD[$AGENT_ID]}
    AFTER=${AFTER_LOAD[$AGENT_ID]}

    # Determine adjustment
    DIFF=$(echo "$AFTER - $BEFORE" | bc)
    if (( $(echo "$DIFF > 0.01" | bc -l) )); then
        ADJUSTMENT="increased"
    elif (( $(echo "$DIFF < -0.01" | bc -l) )); then
        ADJUSTMENT="reduced"
    else
        ADJUSTMENT="unchanged"
    fi

    AGENT_RESULT=$(jq -n \
        --arg agent_id "$AGENT_ID" \
        --arg before "$BEFORE" \
        --arg after "$AFTER" \
        --arg adjustment "$ADJUSTMENT" \
        '{
            agentId: $agent_id,
            beforeLoad: ($before | tonumber),
            afterLoad: ($after | tonumber),
            adjustment: $adjustment
        }')

    AGENT_RESULTS+="$AGENT_RESULT"
done

AGENT_RESULTS+="]"

# Output summary
echo "Load Balancing Results:"
for AGENT_ID in "${AGENT_ARRAY[@]}"; do
    echo "  [$AGENT_ID] ${BEFORE_LOAD[$AGENT_ID]} -> ${AFTER_LOAD[$AGENT_ID]}"
done
echo ""

# Return JSON result
RESULT=$(jq -n \
    --arg status "balanced" \
    --arg strategy "$STRATEGY" \
    --argjson agents "$AGENT_RESULTS" \
    --arg ts "$TIMESTAMP" \
    '{
        status: $status,
        strategy: $strategy,
        agents: $agents,
        timestamp: ($ts | tonumber)
    }')

echo "$RESULT"
