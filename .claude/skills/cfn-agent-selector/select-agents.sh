#!/usr/bin/env bash
# Dynamic Agent Selection with JSON Registry

set -euo pipefail

# Paths
REGISTRY_PATH=".claude/skills/agent-discovery/agents-registry.json"
LOG_PATH="/tmp/agent_selection_$(date +%s).log"

# Validate inputs
if [[ $# -lt 2 ]]; then
    echo "Usage: $0 --task-type TYPE --description 'task description'" >&2
    exit 1
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --task-type) TASK_TYPE="$2"; shift 2 ;;
        --description) DESCRIPTION="$2"; shift 2 ;;
        *) echo "Unknown parameter: $1" >&2; exit 1 ;;
    esac
done

# Validate registry
if [[ ! -f "$REGISTRY_PATH" ]]; then
    echo "Error: Agent registry not found at $REGISTRY_PATH. Run agent discovery first." >&2
    exit 1
fi

# Score agents function with improved flat namespace matching
score_agents() {
    local registry_path="$1"
    local description="$2"
    local task_type="$3"

    # Complex JQ query for flexible matching
    jq -r --arg desc "$description" --arg task_type "$task_type" '
        [
            .agents[]
            | select(
                # Type match using flat namespace
                (
                    # Direct type match
                    .type == $task_type or
                    # Case-insensitive substring match
                    (.type | ascii_downcase | contains($task_type | ascii_downcase))
                )
            )
            | {
                name: .name,
                file: .file,
                score: (
                    # Base type match score
                    10 +
                    # Filename-based scoring (flat namespace detection)
                    (
                        if (.file | ascii_downcase | contains($task_type | ascii_downcase))
                        then 5
                        else 0
                        end
                    ) +
                    # Keyword matching
                    (
                        [.keywords[]]
                        | map(select(
                            ($desc | ascii_downcase | contains(. | ascii_downcase))
                        ))
                        | length * 3
                    )
                )
            }
        ]
        | sort_by(.score)
        | reverse
        | .[0:3]
        | map(.name)
    ' "$registry_path"
}

# Score agents with strategic fallback
LOOP3_AGENTS=$(score_agents "$REGISTRY_PATH" "$DESCRIPTION" "coder,developer")
LOOP2_AGENTS=$(score_agents "$REGISTRY_PATH" "$DESCRIPTION" "reviewer,validator")

# Default fallback
if [[ -z "$LOOP3_AGENTS" || "$LOOP3_AGENTS" == "[]" ]]; then
    LOOP3_AGENTS='["product-owner"]'
fi

if [[ -z "$LOOP2_AGENTS" || "$LOOP2_AGENTS" == "[]" ]]; then
    LOOP2_AGENTS='["product-owner"]'
fi

# Log the results
{
    echo "Task Description: $DESCRIPTION"
    echo "Loop 3 Agents: $LOOP3_AGENTS"
    echo "Loop 2 Agents: $LOOP2_AGENTS"
} >> "$LOG_PATH"

# Output JSON result with detailed reasoning
jq -n \
    --argjson loop3 "$LOOP3_AGENTS" \
    --argjson loop2 "$LOOP2_AGENTS" \
    --arg desc "$DESCRIPTION" \
    '{
        "loop3": $loop3,
        "loop2": $loop2,
        "loop4": "product-owner",
        "reasoning": "Selected agents by scoring against task description: \($desc)",
        "log_path": "'"$LOG_PATH"'"
    }'
