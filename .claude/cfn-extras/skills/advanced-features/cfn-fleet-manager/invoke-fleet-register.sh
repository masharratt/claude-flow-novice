#!/bin/bash
#
# Fleet Manager - Agent Registration CLI Wrapper
#
# Usage:
#   ./invoke-fleet-register.sh --agent-id <id> --tier <shared|dedicated|premium>
#
# Examples:
#   # Register agent with shared tier
#   ./invoke-fleet-register.sh --agent-id researcher-1 --tier shared
#
#   # Register agent with dedicated tier
#   ./invoke-fleet-register.sh --agent-id backend-dev-1 --tier dedicated
#
#   # Register agent with premium tier
#   ./invoke-fleet-register.sh --agent-id cfn-validator-1 --tier premium

set -euo pipefail

# Parse arguments
AGENT_ID=""
TIER="shared"  # Default tier

while [[ $# -gt 0 ]]; do
    case $1 in
        --agent-id)
            AGENT_ID="$2"
            shift 2
            ;;
        --tier)
            TIER="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$AGENT_ID" ]; then
    echo "Error: --agent-id is required"
    echo ""
    echo "Usage: $0 --agent-id <id> --tier <shared|dedicated|premium>"
    echo ""
    echo "Examples:"
    echo "  $0 --agent-id researcher-1 --tier shared"
    echo "  $0 --agent-id backend-dev-1 --tier dedicated"
    echo "  $0 --agent-id cfn-validator-1 --tier premium"
    exit 1
fi

# Validate tier
if [[ ! "$TIER" =~ ^(shared|dedicated|premium)$ ]]; then
    echo "Error: Invalid tier '$TIER'"
    echo "Valid tiers: shared, dedicated, premium"
    exit 1
fi

# Define tier resources
case "$TIER" in
    shared)
        CPU=0.5
        MEMORY=512
        ;;
    dedicated)
        CPU=2.0
        MEMORY=2048
        ;;
    premium)
        CPU=4.0
        MEMORY=4096
        ;;
esac

# Create registration record in Redis
REGISTRATION_KEY="fleet:agent:${AGENT_ID}:registration"
TIMESTAMP=$(date +%s)

REGISTRATION_DATA=$(jq -n \
    --arg tier "$TIER" \
    --arg cpu "$CPU" \
    --arg memory "$MEMORY" \
    --arg ts "$TIMESTAMP" \
    '{
        tier: $tier,
        cpu: ($cpu | tonumber),
        memory: ($memory | tonumber),
        timestamp: ($ts | tonumber)
    }')

echo "$REGISTRATION_DATA" | redis-cli -x SET "$REGISTRATION_KEY" >/dev/null

# Update resource pool allocation
POOL_KEY="fleet:pool:allocated"
redis-cli HSET "$POOL_KEY" "${AGENT_ID}:cpu" "$CPU" >/dev/null
redis-cli HSET "$POOL_KEY" "${AGENT_ID}:memory" "$MEMORY" >/dev/null

# Output success message
echo "[$AGENT_ID] Registered with $TIER tier"
echo "  CPU: $CPU cores"
echo "  Memory: $MEMORY MB"

# Return JSON result
RESULT=$(jq -n \
    --arg status "registered" \
    --arg agent_id "$AGENT_ID" \
    --arg tier "$TIER" \
    --arg cpu "$CPU" \
    --arg memory "$MEMORY" \
    --arg ts "$TIMESTAMP" \
    '{
        status: $status,
        agentId: $agent_id,
        tier: $tier,
        resources: {
            cpu: ($cpu | tonumber),
            memory: ($memory | tonumber)
        },
        timestamp: ($ts | tonumber)
    }')

echo "$RESULT"
