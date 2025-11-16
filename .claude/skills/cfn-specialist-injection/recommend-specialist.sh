#!/usr/bin/env bash
set -euo pipefail

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --current-loop3) IFS=',' read -ra CURRENT_AGENTS <<< "$2"; shift 2 ;;
        --feedback-themes) IFS=',' read -ra THEMES <<< "$2"; shift 2 ;;
        --recurring-count) RECURRING_COUNT="$2"; shift 2 ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

# Specialist Mapping
get_specialist_for_theme() {
    local theme="$1"
    case "$theme" in
        *security*|*authentication*|*jwt*) echo "security-specialist" ;;
        *performance*) echo "performance-engineer" ;;
        *test*|*coverage*) echo "testing-expert" ;;
        *architecture*) echo "architecture-consultant" ;;
        *) echo "" ;;
    esac
}

# Find most appropriate specialist based on recurring themes
recommended_specialist=""
for theme in "${THEMES[@]}"; do
    specialist=$(get_specialist_for_theme "$theme")
    if [[ -n "$specialist" ]]; then
        recommended_specialist="$specialist"
        break
    fi
done

# Validate recurring theme requirement
if [[ -z "$recommended_specialist" ]] || [[ -z "${RECURRING_COUNT:-}" ]]; then
    echo '{"add_specialist": null, "error": "No matching specialist or missing recurring count"}' | jq .
    exit 1
fi

# Check if specialist is already in current team
if [[ " ${CURRENT_AGENTS[*]} " == *" $recommended_specialist "* ]]; then
    echo '{"add_specialist": null, "error": "Specialist already in team"}' | jq .
    exit 0
fi

# Generate output
jq -n \
    --arg specialist "$recommended_specialist" \
    --argjson current_agents "$(printf '%s\n' "${CURRENT_AGENTS[@]}" | jq -R . | jq -s '.')" \
    --argjson themes "$(printf '%s\n' "${THEMES[@]}" | jq -R . | jq -s '.')" \
    '{
        "add_specialist": $specialist,
        "reasoning": "Recurring feedback themes: \(join(", ", $themes)). Added as number of occurrences reached required threshold.",
        "new_loop3_agents": [$current_agents, $specialist]
    }'