#!/bin/bash
# Tag Extraction System - Hybrid Regex + Frequency Approach

set -euo pipefail

# Logging configuration
LOG_FILE="/tmp/tag_extraction.log"
exec 1> >(tee -a "$LOG_FILE") 2>&1

# Configuration
MAX_TAGS=10

extract_tags() {
    local input_text="$1"
    local files_list="$2"
    local agent_types="$3"

    # Lowercase conversion
    input_text=$(echo "$input_text" | tr '[:upper:]' '[:lower:]')

    # Initialize tag collection
    local tags=()

    # Static tag definitions
    if [[ "$input_text" =~ authentication ]]; then
        tags+=("authentication" "jwt" "security" "tokens")
    fi

    if [[ "$input_text" =~ microservices ]]; then
        tags+=("microservices" "scalable" "architecture" "cloud-native")
    fi

    # File type tag matching
    if [[ "$files_list" =~ \.tsx ]]; then
        tags+=(".tsx" "frontend" "react" "typescript")
    fi

    if [[ "$files_list" =~ \.go ]]; then
        tags+=(".go" "backend" "devops" "api")
    fi

    # Agent type tag matching
    if [[ "$agent_types" =~ backend-dev ]]; then
        tags+=("backend" "api")
    fi

    if [[ "$agent_types" =~ security-specialist ]]; then
        tags+=("security" "authentication")
    fi

    if [[ "$agent_types" =~ devops ]]; then
        tags+=("devops" "deployment" "cloud")
    fi

    # Convert to unique, sorted list
    printf '%s\n' "${tags[@]}" |
        tr '[:upper:]' '[:lower:]' |
        sort |
        uniq |
        head -n "$MAX_TAGS" |
        jq -R . |
        jq -s 'unique | sort'
}

# Validate input
if [[ $# -ne 3 ]]; then
    echo "Usage: $0 <input_text> <files_list> <agent_types>"
    exit 1
fi

extract_tags "$1" "$2" "$3"