#!/usr/bin/env bash
set -euo pipefail

# post-feedback-hook.sh
# Hook that runs after each iteration to analyze feedback and recommend specialists

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_INTELLIGENCE_DIR="$(dirname "$SCRIPT_DIR")"

# Parse arguments
TASK_ID=""
CURRENT_AGENTS=""
FEEDBACK_SUMMARY=""
CONFIDENCE_HISTORY=""
ITERATION_COUNT=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-id) TASK_ID="$2"; shift 2 ;;
        --current-loop3) CURRENT_AGENTS="$2"; shift 2 ;;
        --feedback-summary) FEEDBACK_SUMMARY="$2"; shift 2 ;;
        --confidence-history) CONFIDENCE_HISTORY="$2"; shift 2 ;;
        --iteration-count) ITERATION_COUNT="$2"; shift 2 ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

# Validate inputs
if [[ -z "$TASK_ID" || -z "$CURRENT_AGENTS" || -z "$FEEDBACK_SUMMARY" ]]; then
    echo "Error: --task-id, --current-loop3, and --feedback-summary are required" >&2
    exit 1
fi

echo "Analyzing feedback for task $TASK_ID..." >&2

# Extract feedback themes using simple keyword detection
extract_feedback_themes() {
    local summary="$1"
    local themes=()
    
    if echo "$summary" | grep -qi -E "(security|auth|jwt|token|password|credential)"; then
        themes+=("security")
    fi
    
    if echo "$summary" | grep -qi -E "(performance|slow|fast|optimize|speed|memory|cpu)"; then
        themes+=("performance")
    fi
    
    if echo "$summary" | grep -qi -E "(test|coverage|unit|integration|e2e|spec)"; then
        themes+=("testing")
    fi
    
    if echo "$summary" | grep -qi -E "(architecture|design|pattern|structure|modular)"; then
        themes+=("architecture")
    fi
    
    if echo "$summary" | grep -qi -E "(ui|ux|frontend|interface|user|design)"; then
        themes+=("ui-ux")
    fi
    
    printf '%s\n' "${themes[@]}"
}

# Extract themes from feedback
feedback_themes=($(extract_feedback_themes "$FEEDBACK_SUMMARY"))

# Count recurring themes
declare -A theme_counts
for theme in "${feedback_themes[@]}"; do
    theme_counts["$theme"]=$((${theme_counts["$theme"]:-0} + 1))
done

# Find themes that recur multiple times
recurring_themes=()
for theme in "${!theme_counts[@]}"; do
    if [[ ${theme_counts["$theme"]} -ge 2 ]]; then
        recurring_themes+=("$theme")
    fi
done

# Generate output
output=$(jq -n \
    --arg task_id "$TASK_ID" \
    --arg current_agents "$CURRENT_AGENTS" \
    --arg feedback_summary "$FEEDBACK_SUMMARY" \
    --argjson feedback_themes "$(printf '%s\n' "${feedback_themes[@]}" | jq -R . | jq -s '.')" \
    --argjson recurring_themes "$(printf '%s\n' "${recurring_themes[@]}" | jq -R . | jq -s '.')" \
    --argjson iteration_count "${ITERATION_COUNT:-0}" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
        task_id: $task_id,
        timestamp: $timestamp,
        feedback_analysis: {
            summary: $feedback_summary,
            detected_themes: $feedback_themes,
            recurring_themes: $recurring_themes,
            iteration_count: $iteration_count | tonumber
        }
    }')

# If there are recurring themes, recommend specialists
if [[ ${#recurring_themes[@]} -gt 0 ]]; then
    echo "Recurring themes detected: ${recurring_themes[*]}" >&2
    
    # Get specialist recommendation
    specialist_result=$("$TASK_INTELLIGENCE_DIR/cfn-task-intelligence.sh" \
        --mode specialist \
        --current-loop3 "$CURRENT_AGENTS" \
        --feedback-themes "$(IFS=','; echo "${recurring_themes[*]}")" \
        --recurring-count "3")
    
    # Combine with output
    output=$(echo "$output" | jq \
        --argjson specialist "$specialist_result" \
        '. + {specialist_recommendation: $specialist}')
fi

# Output the result
echo "$output"

# Also save to file for audit trail
OUTPUT_DIR="/tmp/cfn-task-intelligence"
mkdir -p "$OUTPUT_DIR"
echo "$output" > "$OUTPUT_DIR/feedback_analysis_${TASK_ID}_$(date +%s).json"