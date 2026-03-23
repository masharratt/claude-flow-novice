#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK_INTELLIGENCE_DIR="$(dirname "$SCRIPT_DIR")"

TASK_DESCRIPTION=""
TASK_ID=""
OUTPUT_FILE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-description) TASK_DESCRIPTION="$2"; shift 2 ;;
        --task-id) TASK_ID="$2"; shift 2 ;;
        --output-file) OUTPUT_FILE="$2"; shift 2 ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
done

if [[ -z "$TASK_DESCRIPTION" || -z "$TASK_ID" ]]; then
    echo "Error: --task-description and --task-id are required" >&2
    exit 1
fi

OUTPUT_FILE="${OUTPUT_FILE:-/tmp/task_intelligence_${TASK_ID}.json}"

echo "Classifying task..." >&2
classification_result=$("$TASK_INTELLIGENCE_DIR/cfn-task-intelligence.sh" \
    --task-description "$TASK_DESCRIPTION" \
    --mode classify)

echo "Estimating complexity..." >&2
complexity_result=$("$TASK_INTELLIGENCE_DIR/cfn-task-intelligence.sh" \
    --task-description "$TASK_DESCRIPTION" \
    --mode complexity)

integrated_output=$(jq -n \
    --arg task_id "$TASK_ID" \
    --argjson classification "$(echo "$classification_result" | jq .)" \
    --argjson complexity "$(echo "$complexity_result" | jq .)" \
    --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
        task_id: $task_id,
        timestamp: $timestamp,
        task_classification: $classification,
        complexity_estimation: $complexity,
        orchestration_recommendations: {
            initial_agents: $classification.recommended_agents,
            estimated_iterations: $complexity.estimated_iterations,
            suggested_mode: $complexity.mode,
            confidence_level: ($classification.confidence + $complexity.confidence) / 2
        }
    }')

echo "$integrated_output" > "$OUTPUT_FILE"

echo "$integrated_output"

echo "Task intelligence analysis saved to: $OUTPUT_FILE" >&2