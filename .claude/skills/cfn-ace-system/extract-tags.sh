#!/usr/bin/env bash
# extract-tags.sh - Automatic tag extraction from sprint execution data
# Part of ACE System Phase 2.1

set -euo pipefail

# Default values
TASK_DESCRIPTION=""
FILES=""
AGENTS=""
OUTPUT_FORMAT="json"
MIN_TAGS=5
MAX_TAGS=15

# Stopwords for keyword filtering
STOPWORDS="the and or but for with from this that these those then than will can could should would"

# Usage function
usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Extract tags from sprint execution data

OPTIONS:
    --task-description TEXT    Sprint task description
    --files LIST              Comma-separated list of modified files
    --agents LIST             Comma-separated list of agent types
    --output FORMAT           Output format: json|text (default: json)
    --min-tags NUM            Minimum tags to extract (default: 5)
    --max-tags NUM            Maximum tags to extract (default: 15)
    -h, --help                Show this help message

EXAMPLES:
    $0 --task-description "Implement JWT authentication" \\
       --files "src/auth.ts,tests/auth.test.ts" \\
       --agents "backend-dev,security-specialist" \\
       --output json
EOF
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --task-description)
            TASK_DESCRIPTION="$2"
            shift 2
            ;;
        --files)
            FILES="$2"
            shift 2
            ;;
        --agents)
            AGENTS="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FORMAT="$2"
            shift 2
            ;;
        --min-tags)
            MIN_TAGS="$2"
            shift 2
            ;;
        --max-tags)
            MAX_TAGS="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Validate required parameters
if [[ -z "$TASK_DESCRIPTION" ]]; then
    echo "Error: --task-description is required"
    usage
fi

# Extract keywords from task description (frequency-based)
extract_keywords() {
    local text="$1"
    local keywords=()

    # Convert to lowercase, extract words (3+ chars), filter stopwords
    local words=$(echo "$text" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' | grep -E '^.{3,}$' || true)

    # Filter stopwords and count frequencies
    local filtered_words=""
    while IFS= read -r word; do
        if [[ -n "$word" ]] && ! echo "$STOPWORDS" | grep -wq "$word"; then
            filtered_words="$filtered_words$word"$'\n'
        fi
    done <<< "$words"

    # Get top keywords by frequency (unique + sorted)
    if [[ -n "$filtered_words" ]]; then
        keywords=($(echo "$filtered_words" | sort | uniq -c | sort -rn | head -10 | awk '{print $2}'))
    fi

    # Return as JSON array
    if [[ ${#keywords[@]} -gt 0 ]]; then
        printf '%s\n' "${keywords[@]}" | jq -R . | jq -s .
    else
        echo "[]"
    fi
}

# Infer domains from file extensions and paths
infer_domains_from_files() {
    local files="$1"
    local domains=()

    if [[ -z "$files" ]]; then
        echo "[]"
        return
    fi

    # Split files by comma
    IFS=',' read -ra file_array <<< "$files"

    for file in "${file_array[@]}"; do
        file=$(echo "$file" | xargs) # Trim whitespace

        # Frontend patterns
        if [[ "$file" =~ \.(tsx|jsx|css|html|scss|sass)$ ]] || [[ "$file" =~ /frontend/ ]] || [[ "$file" =~ /ui/ ]]; then
            domains+=("frontend")
        fi

        # Backend patterns
        if [[ "$file" =~ \.(ts|js|py|java|go|rb)$ ]] && [[ ! "$file" =~ \.(tsx|jsx)$ ]] && [[ "$file" =~ /(api|backend|server|services)/ ]]; then
            domains+=("backend")
        fi

        # Security patterns
        if [[ "$file" =~ /(auth|security|jwt|oauth)/ ]]; then
            domains+=("security")
        fi

        # DevOps patterns
        if [[ "$file" =~ \.(yaml|yml|dockerfile)$ ]] || [[ "$file" =~ /(docker|k8s|kubernetes|helm|terraform)/ ]]; then
            domains+=("devops")
        fi

        # Testing patterns
        if [[ "$file" =~ \.(test|spec)\. ]] || [[ "$file" =~ /__tests__/ ]] || [[ "$file" =~ /tests?/ ]]; then
            domains+=("testing")
        fi

        # Database patterns
        if [[ "$file" =~ /(database|db|migrations|models|schema)/ ]] || [[ "$file" =~ \.(sql)$ ]]; then
            domains+=("database")
        fi

        # Documentation patterns
        if [[ "$file" =~ \.(md|rst|txt)$ ]] || [[ "$file" =~ /(docs|documentation)/ ]]; then
            domains+=("documentation")
        fi
    done

    # Deduplicate and return as JSON array
    if [[ ${#domains[@]} -gt 0 ]]; then
        printf '%s\n' "${domains[@]}" | sort -u | jq -R . | jq -s .
    else
        echo "[]"
    fi
}

# Infer domains from keywords
infer_domains_from_keywords() {
    local keywords_json="$1"
    local domains=()

    # Extract keywords from JSON array
    local keywords=$(echo "$keywords_json" | jq -r '.[]')

    while IFS= read -r keyword; do
        [[ -z "$keyword" ]] && continue

        # Security domain
        if [[ "$keyword" =~ (auth|jwt|token|oauth|security|encryption|hash|password|credential) ]]; then
            domains+=("security")
        fi

        # API domain
        if [[ "$keyword" =~ (api|rest|graphql|endpoint|route|controller) ]]; then
            domains+=("api")
        fi

        # Database domain
        if [[ "$keyword" =~ (database|sql|query|migration|model|schema|orm) ]]; then
            domains+=("database")
        fi

        # Testing domain
        if [[ "$keyword" =~ (test|testing|spec|assertion|mock|coverage) ]]; then
            domains+=("testing")
        fi

        # DevOps domain
        if [[ "$keyword" =~ (docker|kubernetes|deploy|cicd|pipeline|container) ]]; then
            domains+=("devops")
        fi

        # Performance domain
        if [[ "$keyword" =~ (performance|optimization|cache|latency|speed) ]]; then
            domains+=("performance")
        fi
    done <<< "$keywords"

    # Deduplicate and return as JSON array
    if [[ ${#domains[@]} -gt 0 ]]; then
        printf '%s\n' "${domains[@]}" | sort -u | jq -R . | jq -s .
    else
        echo "[]"
    fi
}

# Extract file type tags
extract_file_tags() {
    local files="$1"
    local file_tags=()

    if [[ -z "$files" ]]; then
        echo "[]"
        return
    fi

    # Split files by comma
    IFS=',' read -ra file_array <<< "$files"

    for file in "${file_array[@]}"; do
        file=$(echo "$file" | xargs) # Trim whitespace

        # Extract extension
        if [[ "$file" =~ \.([^.]+)$ ]]; then
            ext="${BASH_REMATCH[1]}"

            case "$ext" in
                ts|tsx)
                    file_tags+=("typescript")
                    ;;
                js|jsx)
                    file_tags+=("javascript")
                    ;;
                py)
                    file_tags+=("python")
                    ;;
                java)
                    file_tags+=("java")
                    ;;
                go)
                    file_tags+=("golang")
                    ;;
                rb)
                    file_tags+=("ruby")
                    ;;
                sh|bash)
                    file_tags+=("bash")
                    ;;
                yaml|yml)
                    file_tags+=("yaml")
                    ;;
                json)
                    file_tags+=("json")
                    ;;
                md)
                    file_tags+=("markdown")
                    ;;
            esac
        fi
    done

    # Deduplicate and return as JSON array
    if [[ ${#file_tags[@]} -gt 0 ]]; then
        printf '%s\n' "${file_tags[@]}" | sort -u | jq -R . | jq -s .
    else
        echo "[]"
    fi
}

# Extract agent tags
extract_agent_tags() {
    local agents="$1"
    local agent_tags=()

    if [[ -z "$agents" ]]; then
        echo "[]"
        return
    fi

    # Split agents by comma
    IFS=',' read -ra agent_array <<< "$agents"

    for agent in "${agent_array[@]}"; do
        agent=$(echo "$agent" | xargs | tr '[:upper:]' '[:lower:]') # Trim and lowercase
        [[ -n "$agent" ]] && agent_tags+=("$agent")
    done

    # Return as JSON array
    if [[ ${#agent_tags[@]} -gt 0 ]]; then
        printf '%s\n' "${agent_tags[@]}" | jq -R . | jq -s .
    else
        echo "[]"
    fi
}

# Combine and deduplicate all tags
combine_tags() {
    local keywords_json="$1"
    local domains_file_json="$2"
    local domains_keyword_json="$3"
    local file_tags_json="$4"
    local agent_tags_json="$5"

    # Merge all JSON arrays
    local all_tags=$(jq -s 'add | unique' <(echo "$keywords_json") <(echo "$domains_file_json") <(echo "$domains_keyword_json") <(echo "$file_tags_json") <(echo "$agent_tags_json"))

    # Limit to MIN_TAGS - MAX_TAGS range
    local tag_count=$(echo "$all_tags" | jq 'length')

    if [[ $tag_count -lt $MIN_TAGS ]]; then
        # If below minimum, return all we have
        echo "$all_tags"
    elif [[ $tag_count -gt $MAX_TAGS ]]; then
        # If above maximum, truncate to MAX_TAGS
        echo "$all_tags" | jq ".[:$MAX_TAGS]"
    else
        echo "$all_tags"
    fi
}

# Main execution
main() {
    # Extract components
    local keywords_json=$(extract_keywords "$TASK_DESCRIPTION")
    local domains_file_json=$(infer_domains_from_files "$FILES")
    local domains_keyword_json=$(infer_domains_from_keywords "$keywords_json")
    local file_tags_json=$(extract_file_tags "$FILES")
    local agent_tags_json=$(extract_agent_tags "$AGENTS")

    # Combine domains (file + keyword based)
    local all_domains=$(jq -s 'add | unique' <(echo "$domains_file_json") <(echo "$domains_keyword_json"))

    # Combine all tags
    local combined_tags=$(combine_tags "$keywords_json" "$domains_file_json" "$domains_keyword_json" "$file_tags_json" "$agent_tags_json")

    local tag_count=$(echo "$combined_tags" | jq 'length')

    # Output format
    if [[ "$OUTPUT_FORMAT" == "json" ]]; then
        jq -n \
            --argjson tags "$combined_tags" \
            --argjson keywords "$keywords_json" \
            --argjson domains "$all_domains" \
            --argjson file_tags "$file_tags_json" \
            --argjson agents "$agent_tags_json" \
            --arg tag_count "$tag_count" \
            '{
                tags: $tags,
                keywords: $keywords,
                domains: $domains,
                agents: $agents,
                file_tags: $file_tags,
                tag_count: ($tag_count | tonumber)
            }'
    else
        # Text format
        echo "Tags: $(echo "$combined_tags" | jq -r '.[]' | tr '\n' ',' | sed 's/,$//')"
        echo "Keywords: $(echo "$keywords_json" | jq -r '.[]' | tr '\n' ',' | sed 's/,$//')"
        echo "Domains: $(echo "$all_domains" | jq -r '.[]' | tr '\n' ',' | sed 's/,$//')"
        echo "Agents: $(echo "$agent_tags_json" | jq -r '.[]' | tr '\n' ',' | sed 's/,$//')"
        echo "File Tags: $(echo "$file_tags_json" | jq -r '.[]' | tr '\n' ',' | sed 's/,$//')"
        echo "Tag Count: $tag_count"
    fi
}

# Run main
main
