#!/usr/bin/env bash
set -euo pipefail

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --iteration) ITERATION="$2"; shift 2 ;;
        --confidence-history) IFS=',' read -ra CONFIDENCE_HISTORY <<< "$2"; shift 2 ;;
        --feedback-history) IFS=';' read -ra FEEDBACK_HISTORY <<< "$2"; shift 2 ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

# Configuration
CONFIDENCE_DELTA_THRESHOLD=0.05
RECURRING_FEEDBACK_THRESHOLD=3

# Confidence Plateau Detection
detect_confidence_plateau() {
    if [[ ${#CONFIDENCE_HISTORY[@]} -lt 2 ]]; then
        echo "false"
        return
    fi

    local last_index=$((${#CONFIDENCE_HISTORY[@]} - 1))
    local delta=$(echo "${CONFIDENCE_HISTORY[last_index]} - ${CONFIDENCE_HISTORY[last_index-1]}" | bc)

    if (( $(echo "$delta < $CONFIDENCE_DELTA_THRESHOLD" | bc -l) )); then
        echo "true"
    else
        echo "false"
    fi
}

# Recurring Feedback Detection
detect_recurring_feedback() {
    declare -A feedback_counts

    for theme in "${FEEDBACK_HISTORY[@]}"; do
        # Extract main theme/keyword
        cleaned_theme=$(echo "$theme" | cut -d'|' -f1)
        feedback_counts["$cleaned_theme"]=$((${feedback_counts["$cleaned_theme"]} + 1))
    done

    for count in "${feedback_counts[@]}"; do
        if [[ $count -ge $RECURRING_FEEDBACK_THRESHOLD ]]; then
            echo "true"
            return
        fi
    done

    echo "false"
}

# Deliverables Stuck Detection
detect_deliverables_stuck() {
    # In a real implementation, this would check actual file creation
    echo "false"
}

# Main Intervention Detection
intervention_needed=false
trigger=""
details=""

if [[ $(detect_confidence_plateau) == "true" ]]; then
    intervention_needed=true
    trigger="confidence_plateau"
    details=$(jq -n \
        --arg iterations 2 \
        --arg delta "$(echo "${CONFIDENCE_HISTORY[${#CONFIDENCE_HISTORY[@]}-1]} - ${CONFIDENCE_HISTORY[${#CONFIDENCE_HISTORY[@]}-2]}" | bc)" \
        --arg threshold "$CONFIDENCE_DELTA_THRESHOLD" \
        '{
            "iterations_stuck": $iterations,
            "confidence_delta": $delta,
            "threshold": $threshold
        }')
fi

if [[ -z "$trigger" ]] && [[ $(detect_recurring_feedback) == "true" ]]; then
    intervention_needed=true
    trigger="recurring_feedback"
    details=$(jq -n \
        --arg threshold "$RECURRING_FEEDBACK_THRESHOLD" \
        '{
            "recurring_themes_count": $threshold
        }')
fi

# Generate JSON output
jq -n \
    --arg intervention_needed "$intervention_needed" \
    --arg trigger "$trigger" \
    --argjson details "${details:-null}" \
    '{
        "intervention_needed": ($intervention_needed == "true"),
        "trigger": $trigger,
        "details": $details,
        "recommended_action":
            if $trigger == "confidence_plateau" then "swap_agent"
            elif $trigger == "recurring_feedback" then "add_specialist"
            else null
            end,
        "reasoning":
            if $trigger == "confidence_plateau" then "Confidence improving too slowly, underperforming agent detected"
            elif $trigger == "recurring_feedback" then "Persistent feedback theme requires specialist intervention"
            else null
            end
    }'

exit 0