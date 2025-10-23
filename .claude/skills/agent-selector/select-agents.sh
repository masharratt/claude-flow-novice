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

# Lowercase description for keyword matching
DESC_LOWER=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]')

# Log the selection process
exec 2> "$LOG_PATH"

# Common keyword lists for different domains
declare -A DOMAIN_KEYWORDS=(
    [software_dev]="implement build create develop test review security auth api backend frontend database ui performance fix optimize refactor"
    [infrastructure]="deploy cloud ci/cd docker kubernetes terraform infrastructure scaling monitoring network security firewall"
    [data]="data analytics pipeline etl transform query database sql nosql migration big-data machine-learning ai"
    [design]="design ux ui visual branding layout prototype accessibility interaction wireframe"
    [research]="research analyze study survey experiment data validate methodology statistical academic"
    [content]="write create edit publish seo content marketing writing copywriting"
)

# Function to extract keywords from description
extract_keywords() {
    local description="$1"
    local domain_keywords=("$2")
    echo "$description" | tr '[:upper:]' '[:lower:]' | grep -oE "\b(${domain_keywords[*]})\b" | sort -u
}

# Function to score agents
score_agents() {
    local registry_path="$1"
    local description="$2"
    local task_type="$3"

    # Use jq for advanced JSON processing
    jq -r --arg desc "$description" --arg task_type "$task_type" '
        .agents[] |
        {
            name: .name,
            score: (
                # Base type match score
                (if .type == $task_type then 10 else 0 end) +
                # Keyword matching
                ([$desc | ascii_downcase] | map(
                    select(
                        [.keywords[]] | map(
                            ascii_downcase |
                            test(.)
                        ) | any
                    )
                ) | length * 2) +
                # Description keyword score
                ([$desc | ascii_downcase] | map(
                    select(
                        . | contains(.name) or contains(.description)
                    )
                ) | length)
            )
        } |
        select(.score > 0) |
        .
    ' "$registry_path" |
    jq -s 'sort_by(.score) | reverse | .[0:3] | map(.name)'
}

# Score agents
LOOP3_AGENTS=$(score_agents "$REGISTRY_PATH" "$DESCRIPTION" "specialist")
LOOP2_AGENTS=$(score_agents "$REGISTRY_PATH" "$DESCRIPTION" "strategic")

# Default fallback
if [[ -z "$LOOP3_AGENTS" ]]; then
    LOOP3_AGENTS='["product-owner"]'
fi

if [[ -z "$LOOP2_AGENTS" ]]; then
    LOOP2_AGENTS='["product-owner"]'
fi

# Output JSON result
jq -n \
    --argjson loop3 "$LOOP3_AGENTS" \
    --argjson loop2 "$LOOP2_AGENTS" \
    '{
        "loop3": $loop3,
        "loop2": $loop2,
        "loop4": "product-owner",
        "reasoning": "Dynamic agent selection based on task description keyword scoring",
        "log_path": "'"$LOG_PATH"'"
    }'