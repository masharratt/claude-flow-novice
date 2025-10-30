#!/usr/bin/env bash

# Anti-Pattern Effectiveness Analysis Script
# Part of Epic-ACE-001 Phase 3.2 - CFN Loop Integration

set -euo pipefail

# Configuration
ANTIPATTERN_STATS_KEY="ace:stats:antipatterns"
OUTPUT_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/.artifacts/analytics"
OUTPUT_FILE="$OUTPUT_DIR/antipattern_effectiveness_$(date +%Y%m%d_%H%M%S).json"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Function to get domain-specific and global stats
get_antipattern_stats() {
    local domain="$1"
    local domain_key="${ANTIPATTERN_STATS_KEY}:${domain}"
    local global_key="${ANTIPATTERN_STATS_KEY}:global"

    # Retrieve domain-specific and global stats
    local domain_injected=$(redis-cli HGET "$domain_key" "injected" 2>/dev/null || echo 0)
    local domain_prevented=$(redis-cli HGET "$domain_key" "prevented" 2>/dev/null || echo 0)
    local global_injected=$(redis-cli HGET "$global_key" "injected" 2>/dev/null || echo 0)
    local global_prevented=$(redis-cli HGET "$global_key" "prevented" 2>/dev/null || echo 0)

    # Calculate effectiveness rate
    local effectiveness_rate=0
    if [[ "$domain_injected" -gt 0 ]]; then
        effectiveness_rate=$(echo "scale=4; $domain_prevented / $domain_injected" | bc)
    fi

    # Prepare JSON output
    jq -n \
        --arg domain "$domain" \
        --arg domain_injected "$domain_injected" \
        --arg domain_prevented "$domain_prevented" \
        --arg global_injected "$global_injected" \
        --arg global_prevented "$global_prevented" \
        --arg effectiveness_rate "$effectiveness_rate" \
        '{
            "domain": $domain,
            "stats": {
                "domain": {
                    "injected": ($domain_injected | tonumber),
                    "prevented": ($domain_prevented | tonumber)
                },
                "global": {
                    "injected": ($global_injected | tonumber),
                    "prevented": ($global_prevented | tonumber)
                }
            },
            "effectiveness_rate": ($effectiveness_rate | tonumber)
        }'
}

# Main execution
main() {
    # Initialize output array
    local results="[]"

    # Predefined list of domains
    domains=("general" "backend" "frontend" "security" "devops" "testing")

    # Collect stats for each domain
    for domain in "${domains[@]}"; do
        local domain_stats
        domain_stats=$(get_antipattern_stats "$domain")
        results=$(echo "$results" | jq --argjson stats "$domain_stats" '. + [$stats]')
    done

    # Calculate overall effectiveness
    local overall_effectiveness
    overall_effectiveness=$(echo "$results" | jq 'map(.effectiveness_rate) | add / length')

    # Final output
    local final_output
    final_output=$(jq -n \
        --argjson results "$results" \
        --arg overall_effectiveness "$overall_effectiveness" \
        '{
            "timestamp": "'"$(date -u +"%Y-%m-%dT%H:%M:%SZ")"'",
            "domains": $results,
            "overall_effectiveness": ($overall_effectiveness | tonumber)
        }')

    # Write to output file
    echo "$final_output" | jq . > "$OUTPUT_FILE"

    # Display results
    echo "Anti-Pattern Effectiveness Analysis"
    echo "Output File: $OUTPUT_FILE"
    echo "$final_output" | jq .
}

# Execute
main