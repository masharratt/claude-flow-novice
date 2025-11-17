#!/usr/bin/env bash
# score-relevance.sh - Multi-factor relevance scoring for ACE System
# Part of ACE System Phase 2.2

set -euo pipefail

# Default values
CURRENT_TAGS=""
CURRENT_DOMAIN=""
CURRENT_AGENTS=""
HISTORICAL_RECORD=""
TIME_DECAY_FACTOR=30  # Days for exponential decay

# Weight factors (must sum to 1.0)
WEIGHT_KEYWORD=0.30
WEIGHT_AGENT=0.25
WEIGHT_DOMAIN=0.20
WEIGHT_RECENCY=0.15
WEIGHT_SUCCESS=0.10

# Usage function
usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Calculate relevance score between current task and historical context

OPTIONS:
    --current-tags JSON        JSON array of current task tags
    --current-domain TEXT      Current task domain
    --current-agents TEXT      Comma-separated current agent types
    --historical-record JSON   Historical context record JSON
    --time-decay-factor NUM    Days for time decay (default: 30)
    -h, --help                 Show this help message

WEIGHTS (configurable in script):
    Keyword similarity: 30% (Jaccard index)
    Agent type overlap: 25% (% same agents)
    Domain match:       20% (exact=1.0, overlap=0.5, none=0.0)
    Recency score:      15% (exp(-days_old / 30))
    Success rate:       10% (historical confidence)

EXAMPLES:
    $0 --current-tags '["backend","authentication","jwt"]' \\
       --current-domain "security" \\
       --current-agents "backend-dev,security-specialist" \\
       --historical-record '{"tags":["backend","auth","oauth"],"domain":"security","agents":"backend-dev","timestamp":"2025-10-25","confidence":0.92}'

OUTPUT:
    Single relevance score: 0.0 - 1.0
EOF
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --current-tags)
            CURRENT_TAGS="$2"
            shift 2
            ;;
        --current-domain)
            CURRENT_DOMAIN="$2"
            shift 2
            ;;
        --current-agents)
            CURRENT_AGENTS="$2"
            shift 2
            ;;
        --historical-record)
            HISTORICAL_RECORD="$2"
            shift 2
            ;;
        --time-decay-factor)
            TIME_DECAY_FACTOR="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Error: Unknown option: $1" >&2
            usage
            ;;
    esac
done

# Validate required parameters
if [[ -z "$CURRENT_TAGS" ]] || [[ -z "$HISTORICAL_RECORD" ]]; then
    echo "Error: --current-tags and --historical-record are required" >&2
    usage
fi

# Calculate Jaccard similarity between two JSON arrays
# Formula: |A ∩ B| / |A ∪ B|
calculate_jaccard_similarity() {
    local array1="$1"
    local array2="$2"

    # Get unique elements in both arrays
    local union=$(jq -s 'add | unique' <(echo "$array1") <(echo "$array2") | jq 'length')

    # Get intersection (elements in both)
    local intersection=$(jq -s '.[0] as $a | .[1] as $b | $a | map(select(. as $x | $b | index($x) != null)) | unique | length' <(echo "$array1") <(echo "$array2"))

    # Avoid division by zero
    if [[ $union -eq 0 ]]; then
        echo "0.0"
        return
    fi

    # Calculate Jaccard index
    local similarity=$(echo "scale=4; $intersection / $union" | bc)
    echo "$similarity"
}

# Calculate agent overlap score
# Percentage of agents that match
calculate_agent_overlap() {
    local current_agents="$1"
    local historical_agents="$2"

    # Convert comma-separated to JSON arrays
    local current_array=$(echo "$current_agents" | tr ',' '\n' | jq -R . | jq -s 'map(select(length > 0))')
    local historical_array=$(echo "$historical_agents" | tr ',' '\n' | jq -R . | jq -s 'map(select(length > 0))')

    # Calculate Jaccard similarity for agents
    local overlap=$(calculate_jaccard_similarity "$current_array" "$historical_array")
    echo "$overlap"
}

# Calculate domain match score
# exact match=1.0, partial overlap=0.5, no match=0.0
calculate_domain_match() {
    local current_domain="$1"
    local historical_domain="$2"

    # Normalize to lowercase
    current_domain=$(echo "$current_domain" | tr '[:upper:]' '[:lower:]')
    historical_domain=$(echo "$historical_domain" | tr '[:upper:]' '[:lower:]')

    # Exact match
    if [[ "$current_domain" == "$historical_domain" ]]; then
        echo "1.0"
        return
    fi

    # Check for partial overlap (substring match in either direction)
    if [[ -n "$current_domain" ]] && [[ -n "$historical_domain" ]]; then
        if [[ "$current_domain" == *"$historical_domain"* ]] || [[ "$historical_domain" == *"$current_domain"* ]]; then
            echo "0.5"
            return
        fi
    fi

    # No match
    echo "0.0"
}

# Calculate recency score with exponential decay
# Formula: exp(-days_old / decay_factor)
calculate_recency_score() {
    local timestamp="$1"
    local decay_factor="$2"

    # Get current date and historical date in epoch seconds
    local current_epoch=$(date +%s)
    local historical_epoch=$(date -d "$timestamp" +%s 2>/dev/null || echo "0")

    # Handle invalid timestamps
    if [[ $historical_epoch -eq 0 ]]; then
        echo "0.0"
        return
    fi

    # Calculate days difference
    local seconds_diff=$((current_epoch - historical_epoch))
    local days_diff=$(echo "scale=4; $seconds_diff / 86400" | bc)

    # Exponential decay: e^(-days / decay_factor)
    # Use awk for exponential calculation (bc doesn't support exp)
    local recency=$(awk -v days="$days_diff" -v factor="$decay_factor" 'BEGIN { print exp(-days / factor) }')

    # Ensure non-negative
    if (( $(echo "$recency < 0" | bc -l) )); then
        echo "0.0"
    else
        printf "%.4f" "$recency"
    fi
}

# Calculate success rate score
# Use historical confidence as proxy for success
calculate_success_score() {
    local confidence="$1"

    # Validate range 0.0-1.0
    if (( $(echo "$confidence < 0.0" | bc -l) )); then
        echo "0.0"
    elif (( $(echo "$confidence > 1.0" | bc -l) )); then
        echo "1.0"
    else
        printf "%.4f" "$confidence"
    fi
}

# Main scoring function
calculate_relevance_score() {
    local current_tags="$1"
    local current_domain="$2"
    local current_agents="$3"
    local historical_record="$4"

    # Extract historical data
    local historical_tags=$(echo "$historical_record" | jq -r '.tags // []' | jq -c .)
    local historical_domain=$(echo "$historical_record" | jq -r '.domain // ""')
    local historical_agents=$(echo "$historical_record" | jq -r '.agents // ""')
    local historical_timestamp=$(echo "$historical_record" | jq -r '.timestamp // ""')
    local historical_confidence=$(echo "$historical_record" | jq -r '.confidence // 0.0')

    # Calculate component scores
    local keyword_score=$(calculate_jaccard_similarity "$current_tags" "$historical_tags")
    local agent_score=$(calculate_agent_overlap "$current_agents" "$historical_agents")
    local domain_score=$(calculate_domain_match "$current_domain" "$historical_domain")
    local recency_score=$(calculate_recency_score "$historical_timestamp" "$TIME_DECAY_FACTOR")
    local success_score=$(calculate_success_score "$historical_confidence")

    # Calculate weighted total
    local total_score=$(awk -v kw="$keyword_score" -v kww="$WEIGHT_KEYWORD" \
                            -v ag="$agent_score" -v agw="$WEIGHT_AGENT" \
                            -v dm="$domain_score" -v dmw="$WEIGHT_DOMAIN" \
                            -v rc="$recency_score" -v rcw="$WEIGHT_RECENCY" \
                            -v sc="$success_score" -v scw="$WEIGHT_SUCCESS" \
                            'BEGIN { print (kw * kww) + (ag * agw) + (dm * dmw) + (rc * rcw) + (sc * scw) }')

    # Ensure score is in range 0.0-1.0
    if (( $(echo "$total_score < 0.0" | bc -l) )); then
        total_score="0.0"
    elif (( $(echo "$total_score > 1.0" | bc -l) )); then
        total_score="1.0"
    fi

    printf "%.2f" "$total_score"
}

# Main execution
main() {
    local relevance_score=$(calculate_relevance_score "$CURRENT_TAGS" "$CURRENT_DOMAIN" "$CURRENT_AGENTS" "$HISTORICAL_RECORD")
    echo "$relevance_score"
}

# Run main
main
