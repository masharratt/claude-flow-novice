#!/bin/bash
# Z.ai Worker Model Tiering for Cost Optimization

# Function to determine appropriate model based on task complexity
select_optimal_model() {
    local task_complexity=$1

    # Simple tasks: Haiku (low cost)
    if [[ "$task_complexity" == "low" ]]; then
        echo "haiku"
        return 0
    fi

    # Medium complexity: Mixed routing
    if [[ "$task_complexity" == "medium" ]]; then
        if [[ $((RANDOM % 2)) -eq 0 ]]; then
            echo "haiku"
        else
            echo "sonnet"
        fi
        return 0
    fi

    # Complex tasks: Sonnet (high quality)
    echo "sonnet"
}

# Cost tracking
track_model_cost() {
    local model=$1
    local tokens=$2

    case "$model" in
        "haiku") echo "scale=4; 0.25 * ($tokens / 1000000)" | bc ;;
        "sonnet") echo "scale=4; 3.00 * ($tokens / 1000000)" | bc ;;
        *) echo "0" ;;
    esac
}

# Example usage demonstration
main() {
    local complexity="$1"
    local estimated_tokens="$2"

    SELECTED_MODEL=$(select_optimal_model "$complexity")
    MODEL_COST=$(track_model_cost "$SELECTED_MODEL" "$estimated_tokens")

    echo "Task Complexity: $complexity"
    echo "Selected Model: $SELECTED_MODEL"
    echo "Estimated Cost: \$${MODEL_COST}"
}

# Allow direct script execution with parameters
if [[ "$0" == "$BASH_SOURCE" ]]; then
    main "${1:-low}" "${2:-50000}"
fi