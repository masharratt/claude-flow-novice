#!/bin/bash
# Batch Worker Spawning Optimization

# Maximum concurrent workers
MAX_WORKERS=5
# Timeout for batch execution
BATCH_TIMEOUT=300  # 5 minutes

# Function to spawn workers in batch
spawn_batch_workers() {
    local task_queue=("$@")
    local pids=()
    local results=()

    # Spawn workers in parallel batches
    for task in "${task_queue[@]}"; do
        # Wait if max workers reached
        while [[ ${#pids[@]} -ge $MAX_WORKERS ]]; do
            for i in "${!pids[@]}"; do
                if ! kill -0 "${pids[i]}" 2>/dev/null; then
                    unset 'pids[i]'
                    unset 'results[i]'
                fi
            done
            sleep 1
        done

        # Background task execution with timeout
        (
            timeout $BATCH_TIMEOUT npx claude-flow-novice execute "$task" &
            wait $!
            exit_code=$?

            # Store result with task
            echo "$task:$exit_code"
        ) &

        pids+=($!)
    done

    # Wait for all workers to complete
    for pid in "${pids[@]}"; do
        wait "$pid"
    done
}

# Performance and cost tracking
calculate_batch_efficiency() {
    local total_tasks=$1
    local successful_tasks=$2
    local total_time=$3

    # Calculate metrics
    local success_rate=$(echo "scale=2; $successful_tasks / $total_tasks * 100" | bc)
    local avg_task_time=$(echo "scale=2; $total_time / $total_tasks" | bc)

    echo "Batch Efficiency Report:"
    echo "Total Tasks: $total_tasks"
    echo "Successful Tasks: $successful_tasks"
    echo "Success Rate: ${success_rate}%"
    echo "Average Task Time: ${avg_task_time}s"
}

# Main execution
main() {
    local tasks=("$@")
    local start_time=$(date +%s)

    spawn_batch_workers "${tasks[@]}"

    local end_time=$(date +%s)
    local total_time=$((end_time - start_time))

    calculate_batch_efficiency "${#tasks[@]}" "$successful_tasks" "$total_time"
}

# Allow direct script execution
if [[ "$0" == "$BASH_SOURCE" ]]; then
    # Example task queue
    sample_tasks=(
        "simple-task-1"
        "medium-task-2"
        "complex-task-3"
        "simple-task-4"
        "medium-task-5"
    )

    main "${sample_tasks[@]}"
fi