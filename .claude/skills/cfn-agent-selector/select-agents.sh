#!/usr/bin/env bash
# Dynamic Agent Selection with JSON Registry

set -euo pipefail

# Paths
REGISTRY_PATH=".claude/skills/cfn-agent-discovery/agents-registry.json"
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

# Smart agent selection for React Router and specialized tasks
smart_agent_selection() {
    local description="$1"
    local task_type="$2"

    # React Router specialization - Zone A fix
    if [[ "$description" =~ (React Router|react-router|TS2786|jsx.*component|route.*migration) ]]; then
        echo '["react-frontend-engineer", "reviewer", "tester"]'
        return 0
    fi

    # TypeScript/TSX specialization
    if [[ "$description" =~ (TypeScript|tsx|TS[0-9]+|interface.*error) ]]; then
        echo '["react-frontend-engineer", "reviewer", "tester"]'
        return 0
    fi

    # Frontend UI specialization
    if [[ "$description" =~ (frontend|ui|component|css|style|responsive) ]]; then
        echo '["react-frontend-engineer", "reviewer", "accessibility-advocate-persona"]'
        return 0
    fi

    # Authentication/Security specialization
    if [[ "$description" =~ (auth|jwt|token|security|password|login|register) ]]; then
        echo '["backend-developer", "security-specialist", "reviewer"]'
        return 0
    fi

    # API/Backend specialization
    if [[ "$description" =~ (api|endpoint|server|backend|database|orm|sql) ]]; then
        echo '["backend-developer", "reviewer", "tester"]'
        return 0
    fi

    return 1  # Fall back to registry-based selection
}

# Score agents function with improved flat namespace matching
score_agents() {
    local registry_path="$1"
    local description="$2"
    local task_type="$3"

    # Try smart selection first
    local smart_result
    if smart_result=$(smart_agent_selection "$description" "$task_type"); then
        echo "$smart_result"
        return 0
    fi

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
