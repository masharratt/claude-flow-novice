#!/usr/bin/env bash
set -euo pipefail

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --original-deliverables) IFS=',' read -ra DELIVERABLES <<< "$2"; shift 2 ;;
        --files-created) IFS=',' read -ra FILES_CREATED <<< "$2"; shift 2 ;;
        --iteration) ITERATION="$2"; shift 2 ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

# Simplification strategies
find_critical_deliverable() {
    local priority_patterns=(
        "main.ts"
        "index.ts"
        "core.ts"
        "*.config.ts"
        "auth.ts"
        "base.ts"
    )

    for pattern in "${priority_patterns[@]}"; do
        for deliverable in "${DELIVERABLES[@]}"; do
            if [[ "$deliverable" == $pattern ]]; then
                echo "$deliverable"
                return
            fi
        done
    done

    # If no priority pattern, select first deliverable
    echo "${DELIVERABLES[0]}"
}

# Check if no files were created
if [[ "${FILES_CREATED[0]}" == "none" ]]; then
    CRITICAL_DELIVERABLE=$(find_critical_deliverable)

    # Prepare deferred deliverables
    DEFERRED_DELIVERABLES=("${DELIVERABLES[@]}")
    for i in "${!DEFERRED_DELIVERABLES[@]}"; do
        if [[ "${DEFERRED_DELIVERABLES[i]}" == "$CRITICAL_DELIVERABLE" ]]; then
            unset 'DEFERRED_DELIVERABLES[i]'
        fi
    done

    jq -n \
        --arg critical "$CRITICAL_DELIVERABLE" \
        --argjson deferred "$(printf '%s\n' "${DEFERRED_DELIVERABLES[@]}" | jq -R . | jq -s '.')" \
        --arg iteration "$ITERATION" \
        '{
            "simplified_scope": true,
            "focus_deliverables": [$critical],
            "deferred_deliverables": $deferred,
            "context_injection": "FOCUS: Create ONLY \($critical) in this iteration. Prioritize its implementation. Defer other deliverables to next iterations.",
            "reasoning": "Agents stuck with no files created. Simplifying to single critical deliverable.",
            "iteration": $iteration
        }'
else
    # If files were created, no intervention needed
    jq -n '{
        "simplified_scope": false,
        "reasoning": "Deliverables are progressing. No scope simplification required."
    }'
fi