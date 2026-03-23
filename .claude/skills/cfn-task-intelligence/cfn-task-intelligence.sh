#!/usr/bin/env bash
set -euo pipefail

# cfn-task-intelligence - Main CLI interface
# Provides task classification, complexity estimation, and specialist recommendation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB_DIR="$SCRIPT_DIR/lib"

# Default values
TASK_DESCRIPTION=""
MODE="classify"  # classify, complexity, specialist, all
CURRENT_AGENTS=()
FEEDBACK_THEMES=()
RECURRING_COUNT=""

# Helper functions
log_info() {
    echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

log_error() {
    echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

show_usage() {
    cat << EOF
Usage: cfn-task-intelligence [OPTIONS]

Task Intelligence CLI - Classify tasks, estimate complexity, and recommend specialists

OPTIONS:
    --task-description TEXT    Task description to analyze
    --mode MODE               Operation mode: classify, complexity, specialist, all (default: classify)
    --current-loop3 AGENTS    Comma-separated list of current Loop 3 agents
    --feedback-themes THEMES  Comma-separated list of feedback themes
    --recurring-count COUNT   Number of recurring feedback occurrences
    --help, -h                Show this help message

EXAMPLES:
    # Classify a task
    cfn-task-intelligence --task-description "Implement user authentication" --mode classify

    # Estimate complexity
    cfn-task-intelligence --task-description "Build microservice architecture" --mode complexity

    # Recommend specialist based on feedback
    cfn-task-intelligence \\
        --mode specialist \\
        --current-loop3 "implementer,validator" \\
        --feedback-themes "security,authentication" \\
        --recurring-count 3

    # Run full analysis
    cfn-task-intelligence \\
        --task-description "Add OAuth2 integration with SSO" \\
        --mode all
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-description)
            TASK_DESCRIPTION="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --current-loop3)
            IFS=',' read -ra CURRENT_AGENTS <<< "$2"
            shift 2
            ;;
        --feedback-themes)
            IFS=',' read -ra FEEDBACK_THEMES <<< "$2"
            shift 2
            ;;
        --recurring-count)
            RECURRING_COUNT="$2"
            shift 2
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown parameter: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate arguments
if [[ -z "$TASK_DESCRIPTION" && "$MODE" != "specialist" ]]; then
    log_error "Task description is required for mode: $MODE"
    exit 1
fi

if [[ "$MODE" == "specialist" && (-z "${FEEDBACK_THEMES:-}" || -z "${RECURRING_COUNT:-}") ]]; then
    log_error "Specialist mode requires --feedback-themes and --recurring-count"
    exit 1
fi

# Execute based on mode
case "$MODE" in
    "classify")
        log_info "Classifying task: ${TASK_DESCRIPTION:0:50}..."
        "$LIB_DIR/classifier/classify-task.sh" --task "$TASK_DESCRIPTION"
        ;;
    "complexity")
        log_info "Estimating complexity for: ${TASK_DESCRIPTION:0:50}..."
        "$LIB_DIR/complexity/estimate-complexity.sh" --task "$TASK_DESCRIPTION"
        ;;
    "specialist")
        log_info "Recommending specialist based on themes: ${FEEDBACK_THEMES[*]}"
        "$LIB_DIR/specialist/recommend-specialist.sh" \
            --current-loop3 "$(IFS=','; echo "${CURRENT_AGENTS[*]}")" \
            --feedback-themes "$(IFS=','; echo "${FEEDBACK_THEMES[*]}")" \
            --recurring-count "$RECURRING_COUNT"
        ;;
    "all")
        log_info "Running full task intelligence analysis..."
        
        # Run classification
        echo "=== Task Classification ==="
        classification_result=$("$LIB_DIR/classifier/classify-task.sh" --task "$TASK_DESCRIPTION")
        echo "$classification_result"
        echo
        
        # Run complexity estimation
        echo "=== Complexity Estimation ==="
        complexity_result=$("$LIB_DIR/complexity/estimate-complexity.sh" --task "$TASK_DESCRIPTION")
        echo "$complexity_result"
        echo
        
        # Create combined output
        jq -n \
            --argjson classification "$(echo "$classification_result" | jq .)" \
            --argjson complexity "$(echo "$complexity_result" | jq .)" \
            '{
                task_classification: $classification,
                complexity_estimation: $complexity,
                recommendations: {
                    initial_agents: $classification.recommended_agents,
                    estimated_iterations: $complexity.estimated_iterations,
                    confidence_level: $complexity.confidence
                }
            }'
        ;;
    *)
        log_error "Invalid mode: $MODE"
        show_usage
        exit 1
        ;;
esac