#!/bin/bash
# Z.ai Cost Tracking Script

set -euo pipefail

# Configuration
COST_PER_MILLION=0.50
REDIS_KEY_PREFIX="zai_team_costs"

# Track token usage and calculate costs
track_zai_costs() {
    local team="$1"
    local tokens_used="$2"

    local total_cost=$(echo "scale=4; ($tokens_used / 1000000) * $COST_PER_MILLION" | bc)

    # Store in Redis with team-specific key
    redis-cli HSET "$REDIS_KEY_PREFIX" "$team" "$total_cost"

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Team $team: $tokens_used tokens = \$$total_cost"
}

# Example usage tracking
main() {
    track_zai_costs "engineering" 500000
    track_zai_costs "c-suite" 250000
}

main