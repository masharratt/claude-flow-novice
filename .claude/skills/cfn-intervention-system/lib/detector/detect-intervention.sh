#!/usr/bin/env bash
set -euo pipefail

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --feedback-summary) FEEDBACK_SUMMARY="$2"; shift 2 ;;
        --confidence-trend) CONFIDENCE_TREND="$2"; shift 2 ;;
        --iteration-count) ITERATION_COUNT="$2"; shift 2 ;;
        --confidence-threshold) CONFIDENCE_THRESHOLD="${2:-0.8}"; shift 2 ;;
        --plateau-threshold) PLATEAU_THRESHOLD="${2:-0.02}"; shift 2 ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

# Validate inputs
if [[ -z "${FEEDBACK_SUMMARY:-}" || -z "${CONFIDENCE_TREND:-}" || -z "${ITERATION_COUNT:-}" ]]; then
    echo '{"error": "Missing required parameters: feedback-summary, confidence-trend, iteration-count"}' | jq .
    exit 1
fi

# Extract confidence scores from trend (format: "0.5,0.55,0.57,0.58,0.59")
IFS=',' read -ra CONFIDENCES <<< "$CONFIDENCE_TREND"
CONFIDENCE_COUNT=${#CONFIDENCES[@]}

# Calculate confidence improvement
if [[ $CONFIDENCE_COUNT -lt 2 ]]; then
    CONFIDENCE_IMPROVEMENT=0
else
    LATEST_CONFIDENCE="${CONFIDENCES[-1]}"
    EARLIEST_CONFIDENCE="${CONFIDENCES[0]}"
    CONFIDENCE_IMPROVEMENT=$(echo "$LATEST_CONFIDENCE - $EARLIEST_CONFIDENCE" | bc -l)
fi

# Detect intervention triggers
intervention_needed="false"
trigger=""
details=""

# Check 1: Confidence plateau detection
if [[ $CONFIDENCE_COUNT -ge 3 ]]; then
    # Calculate average improvement over last 3 iterations
    SECOND_LAST="${CONFIDENCES[-2]}"
    THIRD_LAST="${CONFIDENCES[-3]}"
    
    IMPROVEMENT_1=$(echo "${CONFIDENCES[-1]} - $SECOND_LAST" | bc -l)
    IMPROVEMENT_2=$(echo "$SECOND_LAST - $THIRD_LAST" | bc -l)
    AVG_IMPROVEMENT=$(echo "($IMPROVEMENT_1 + $IMPROVEMENT_2) / 2" | bc -l)
    
    # Use bc for floating point comparison
    IS_PLATEAU=$(echo "$AVG_IMPROVEMENT < $PLATEAU_THRESHOLD" | bc -l)
    
    if [[ $IS_PLATEAU == "1" ]]; then
        intervention_needed="true"
        trigger="confidence_plateau"
        details="Confidence improvement averaged $(printf "%.3f" $AVG_IMPROVEMENT) over last 2 iterations, below threshold $(printf "%.3f" $PLATEAU_THRESHOLD)"
    fi
fi

# Check 2: Recurring feedback themes (simple keyword detection)
if echo "$FEEDBACK_SUMMARY" | grep -qi "recurring\|repeated\|again\|still"; then
    if [[ "$intervention_needed" == "false" ]]; then
        intervention_needed="true"
        trigger="recurring_feedback"
        details="Recurring feedback patterns detected in summary"
    fi
fi

# Check 3: High iteration count with low confidence
if [[ $ITERATION_COUNT -gt 5 ]]; then
    LATEST_CONFIDENCE="${CONFIDENCES[-1]}"
    IS_BELOW_THRESHOLD=$(echo "$LATEST_CONFIDENCE < $CONFIDENCE_THRESHOLD" | bc -l)
    
    if [[ $IS_BELOW_THRESHOLD == "1" && "$intervention_needed" == "false" ]]; then
        intervention_needed="true"
        trigger="low_confidence_high_iterations"
        details="Iteration count ($ITERATION_COUNT) exceeds threshold with confidence $(printf "%.3f" $LATEST_CONFIDENCE) below threshold $(printf "%.3f" $CONFIDENCE_THRESHOLD)"
    fi
fi

# Generate output
jq -n \
    --argjson intervention_needed "$intervention_needed" \
    --arg trigger "$trigger" \
    --arg details "$details" \
    '{
        "intervention_needed": $intervention_needed,
        "trigger": $trigger,
        "details": $details,
        "recommended_action": (
            if $trigger == "confidence_plateau" then "swap_agent"
            elif $trigger == "recurring_feedback" then "add_specialist"
            elif $trigger == "low_confidence_high_iterations" then "escalate_for_review"
            else null
            end
        ),
        "reasoning": (
            if $trigger == "confidence_plateau" then "Confidence improving too slowly, underperforming agent detected"
            elif $trigger == "recurring_feedback" then "Persistent feedback theme requires specialist intervention"
            elif $trigger == "low_confidence_high_iterations" then "High iteration count with low confidence suggests need for escalation"
            else null
            end
        )
    }'

exit 0