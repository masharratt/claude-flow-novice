#!/usr/bin/env bash
# Agent Selection Skill
# Selects appropriate agents based on task classification and mode

set -euo pipefail

# Parse arguments
TASK_CLASSIFICATION=""
MODE="standard"
LOOP_TYPE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --classification)
            TASK_CLASSIFICATION="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --loop)
            LOOP_TYPE="$2"
            shift 2
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1
            ;;
    esac
done

if [[ -z "$TASK_CLASSIFICATION" ]]; then
    echo "Usage: $0 --classification <type> [--mode <mode>] [--loop <3|2>]" >&2
    exit 1
fi

# Agent mapping based on classification
declare -A LOOP3_AGENTS
LOOP3_AGENTS[frontend]="react-frontend-engineer"
LOOP3_AGENTS[backend]="backend-developer"
LOOP3_AGENTS[devops]="devops-engineer"
LOOP3_AGENTS[testing]="tester"
LOOP3_AGENTS[security]="security-specialist"
LOOP3_AGENTS[data]="database-architect"
LOOP3_AGENTS[performance]="performance-optimizer"
LOOP3_AGENTS[general]="backend-developer"

declare -A LOOP2_AGENTS
LOOP2_AGENTS[frontend]="code-reviewer,ui-designer"
LOOP2_AGENTS[backend]="code-reviewer,security-specialist"
LOOP2_AGENTS[devops]="code-reviewer,security-specialist"
LOOP2_AGENTS[testing]="code-reviewer,qa-specialist"
LOOP2_AGENTS[security]="code-reviewer,security-specialist"
LOOP2_AGENTS[data]="code-reviewer,database-architect"
LOOP2_AGENTS[performance]="code-reviewer,perf-analyzer"
LOOP2_AGENTS[general]="code-reviewer,tester"

# Select agents based on classification
SELECTED_LOOP3=()
SELECTED_LOOP2=()

IFS=',' read -ra CLASSIFICATIONS <<< "$TASK_CLASSIFICATION"
for classification in "${CLASSIFICATIONS[@]}"; do
    if [[ -n "${LOOP3_AGENTS[$classification]:-}" ]]; then
        SELECTED_LOOP3+=("${LOOP3_AGENTS[$classification]}")
    fi

    if [[ -n "${LOOP2_AGENTS[$classification]:-}" ]]; then
        IFS=',' read -ra VALIDATORS <<< "${LOOP2_AGENTS[$classification]}"
        SELECTED_LOOP2+=("${VALIDATORS[@]}")
    fi
done

# Remove duplicates and join
LOOP3_UNIQUE=$(printf '%s\n' "${SELECTED_LOOP3[@]}" | sort -u | tr '\n' ',' | sed 's/,$//')
LOOP2_UNIQUE=$(printf '%s\n' "${SELECTED_LOOP2[@]}" | sort -u | tr '\n' ',' | sed 's/,$//')

# Output based on loop type
if [[ "$LOOP_TYPE" == "3" ]]; then
    echo "$LOOP3_UNIQUE"
elif [[ "$LOOP_TYPE" == "2" ]]; then
    echo "$LOOP2_UNIQUE"
else
    # Output both as JSON
    cat <<EOF
{
  "loop3": "$LOOP3_UNIQUE",
  "loop2": "$LOOP2_UNIQUE",
  "mode": "$MODE",
  "classifications": "$TASK_CLASSIFICATION"
}
EOF
fi
