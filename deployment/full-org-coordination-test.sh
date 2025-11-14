#!/bin/bash
# Full Organizational Coordinator Test
# Validates 5-Team Mesh Communication

set -eu
set -o pipefail

# Team List
TEAMS=("marketing" "engineering" "sales" "support" "finance")

# Deployment Validation
validate_team_coordinators() {
    local success_count=0
    local total_teams=${#TEAMS[@]}

    for team in "${TEAMS[@]}"; do
        if redis-cli get "coordinator:${team}:status" | grep -q "active"; then
            ((success_count++))
        fi
    done

    echo "Coordinators Active: ${success_count}/${total_teams}"
    return $((total_teams - success_count))
}

# Cost Tracking
track_zai_costs() {
    local week_start=$(date -d "7 days ago" +%Y-%m-%d)
    local week_end=$(date +%Y-%m-%d)

    local total_cost=$(./scripts/track-zai-costs.sh \
        --start "${week_start}" \
        --end "${week_end}")

    if (( $(echo "${total_cost} < 50" | bc -l) )); then
        echo "✅ Z.ai Costs: $${total_cost} (Budget: $50)"
        return 0
    else
        echo "❌ Z.ai Costs Exceeded: $${total_cost}"
        return 1
    fi
}

# Mesh Communication Test
test_mesh_communication() {
    local test_message=$(openssl rand -hex 16)
    local response_count=0

    for team in "${TEAMS[@]}"; do
        if redis-cli publish "team-mesh:test" "${test_message}" | grep -q "1"; then
            ((response_count++))
        fi
    done

    if (( response_count == ${#TEAMS[@]} )); then
        echo "✅ Full Mesh Communication Successful"
        return 0
    else
        echo "❌ Mesh Communication Incomplete"
        return 1
    fi
}

# Main Test Execution
main() {
    echo "🔍 Running Full Organizational Coordinator Test"

    if validate_team_coordinators && \
       track_zai_costs && \
       test_mesh_communication; then

        echo "✅ Phase 2 Deployment Validation Complete"
        return 0
    else
        echo "❌ Deployment Validation Failed"
        return 1
    fi
}

# Execute Test
main