#!/usr/bin/env bash
set -euo pipefail

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --loop3-agents) IFS=',' read -ra AGENTS <<< "$2"; shift 2 ;;
        --loop3-confidences) IFS=',' read -ra CONFIDENCES <<< "$2"; shift 2 ;;
        --feedback-themes) IFS=',' read -ra THEMES <<< "$2"; shift 2 ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

# Agent Swap Rules
get_specialist_for_theme() {
    local theme="$1"
    case "$theme" in
        *security*) echo "security-specialist" ;;
        *performance*) echo "performance-engineer" ;;
        *test*|*coverage*) echo "testing-expert" ;;
        *architecture*) echo "architecture-consultant" ;;
        *) echo "generic-specialist" ;;
    esac
}

# Find lowest confidence agent
lowest_confidence_index=0
lowest_confidence="${CONFIDENCES[0]}"

for i in "${!CONFIDENCES[@]}"; do
    if (( $(echo "${CONFIDENCES[i]} < $lowest_confidence" | bc -l) )); then
        lowest_confidence="${CONFIDENCES[i]}"
        lowest_confidence_index=$i
    fi
done

# Recommend replacement specialist
recommended_specialist=""
for theme in "${THEMES[@]}"; do
    specialist=$(get_specialist_for_theme "$theme")
    if [[ -n "$specialist" ]]; then
        recommended_specialist="$specialist"
        break
    fi
done

# Generate output
jq -n \
    --arg remove_agent "${AGENTS[lowest_confidence_index]}" \
    --arg add_agent "$recommended_specialist" \
    --argjson agents "$(printf '%s\n' "${AGENTS[@]}" | jq -R . | jq -s '.')" \
    --arg lowest_confidence "$lowest_confidence" \
    --argjson themes "$(printf '%s\n' "${THEMES[@]}" | jq -R . | jq -s '.')" \
    '{
        "remove_agent": $remove_agent,
        "remove_reason": "Lowest confidence (\($lowest_confidence)), contributing to plateau",
        "add_agent": $add_agent,
        "add_reason": "Match to feedback themes: \(join(", ", $themes))",
        "new_loop3_agents": [$agents | map(select(. != $remove_agent)), $add_agent]
    }'