#!/usr/bin/env bash
set -euo pipefail

# learning-loop.sh
# Updates task intelligence models based on execution outcomes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_INTELLIGENCE_DIR="$(dirname "$SCRIPT_DIR")"

# Parse arguments
TASK_ID=""
FINAL_OUTCOME=""
ACTUAL_ITERATIONS=""
FINAL_CONFIDENCE=""
CLASSIFICATION_PREDICTION=""
COMPLEXITY_PREDICTION=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-id) TASK_ID="$2"; shift 2 ;;
        --final-outcome) FINAL_OUTCOME="$2"; shift 2 ;;  # success, failure, partial
        --actual-iterations) ACTUAL_ITERATIONS="$2"; shift 2 ;;
        --final-confidence) FINAL_CONFIDENCE="$2"; shift 2 ;;
        --classification-file) CLASSIFICATION_PREDICTION="$(cat "$2")"; shift 2 ;;
        --complexity-file) COMPLEXITY_PREDICTION="$(cat "$2")"; shift 2 ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

# Validate inputs
if [[ -z "$TASK_ID" || -z "$FINAL_OUTCOME" ]]; then
    echo "Error: --task-id and --final-outcome are required" >&2
    exit 1
fi

echo "Processing learning data for task $TASK_ID..." >&2

# Calculate accuracy metrics
classification_accuracy="unknown"
complexity_accuracy="unknown"

if [[ -n "${CLASSIFICATION_PREDICTION:-}" && -n "${COMPLEXITY_PREDICTION:-}" ]]; then
    # Extract predicted values
    predicted_category=$(echo "$CLASSIFICATION_PREDICTION" | jq -r '.category // "unknown"')
    predicted_iterations=$(echo "$COMPLEXITY_PREDICTION" | jq -r '.estimated_iterations // 0')
    predicted_confidence=$(echo "$COMPLEXITY_PREDICTION" | jq -r '.confidence // 0')
    
    # Calculate classification accuracy based on outcome
    case "$FINAL_OUTCOME" in
        "success")
            classification_accuracy="correct"
            ;;
        "failure")
            classification_accuracy="incorrect"
            ;;
        *)
            classification_accuracy="partial"
            ;;
    esac
    
    # Calculate complexity accuracy
    if [[ -n "${ACTUAL_ITERATIONS:-}" && "$ACTUAL_ITERATIONS" != "0" ]]; then
        actual_iter=$(echo "$ACTUAL_ITERATIONS" | jq -r '. // 0')
        predicted_iter=$(echo "$predicted_iterations" | jq -r '. // 0')
        
        # Calculate percentage error
        if [[ "$predicted_iter" != "0" ]]; then
            error_pct=$(echo "scale=2; ($actual_iter - $predicted_iter) / $predicted_iter * 100" | bc -l 2>/dev/null || echo "unknown")
            complexity_accuracy=$(echo "$error_pct" | jq -R 'if . != "unknown" then (. | tonumber | if . < 20 then "accurate" elif . < 50 then "moderate" else "inaccurate" end) else "unknown" end')
        fi
    fi
fi

# Generate learning record
learning_record=$(jq -n \
    --arg task_id "$TASK_ID" \
    --arg outcome "$FINAL_OUTCOME" \
    --argjson actual_iterations "${ACTUAL_ITERATIONS:-0}" \
    --argjson final_confidence "${FINAL_CONFIDENCE:-0}" \
    --arg classification_accuracy "$classification_accuracy" \
    --arg complexity_accuracy "$complexity_accuracy" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
        task_id: $task_id,
        execution_outcome: $outcome,
        actual_iterations: $actual_iterations,
        final_confidence: $final_confidence,
        accuracy_metrics: {
            classification: $classification_accuracy,
            complexity: $complexity_accuracy
        },
        timestamp: $timestamp
    }')

# Store learning data
LEARNING_DIR="/tmp/cfn-task-intelligence/learning"
mkdir -p "$LEARNING_DIR"

# Append to learning log
echo "$learning_record" >> "$LEARNING_DIR/learning_log.jsonl"

# Also save individual record
echo "$learning_record" > "$LEARNING_DIR/task_${TASK_ID}_learning.json"

# Generate summary statistics (last 100 records)
generate_summary() {
    if [[ -f "$LEARNING_DIR/learning_log.jsonl" ]]; then
        tail -n 100 "$LEARNING_DIR/learning_log.jsonl" | jq -s '
            group_by(.accuracy_metrics.classification) | 
            map({classification: .[0].accuracy_metrics.classification, count: length}) |
            sort_by(.count) |
            reverse
        ' > "$LEARNING_DIR/classification_accuracy_summary.json"
        
        tail -n 100 "$LEARNING_DIR/learning_log.jsonl" | jq -s '
            group_by(.accuracy_metrics.complexity) |
            map({complexity: .[0].accuracy_metrics.complexity, count: length}) |
            sort_by(.count) |
            reverse
        ' > "$LEARNING_DIR/complexity_accuracy_summary.json"
    fi
}

generate_summary

echo "Learning data processed for task $TASK_ID" >&2
echo "$learning_record"