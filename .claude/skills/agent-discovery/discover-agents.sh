#!/usr/bin/env bash
# Agent Discovery - Recursively scans .claude/agents/ and builds JSON registry

set -euo pipefail

AGENTS_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/agents"
OUTPUT_FILE="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/agent-discovery/agents-registry.json"

# Detailed debug logging
echo "Current working directory: $(pwd)"
echo "Scanning agents in directory: $AGENTS_DIR"

# Remove old registry if exists
[[ -f "$OUTPUT_FILE" ]] && rm "$OUTPUT_FILE"

# Helper function to clean Windows line endings and parse frontmatter
parse_frontmatter() {
    local file="$1"
    echo "DEBUG: Parsing frontmatter for $file"

    # Use verbose sed to see what's happening
    local content=$(sed -e 's/\r//g' "$file")
    local frontmatter=$(echo "$content" | awk '
    BEGIN {
        frontmatter = "";
        in_frontmatter = 0;
        print "Starting frontmatter parsing" > "/dev/stderr";
    }
    /^---$/ {
        in_frontmatter++;
        print "Found frontmatter delimiter, current state: " in_frontmatter > "/dev/stderr";
        if (in_frontmatter == 2) {
            print "Exiting on second delimiter" > "/dev/stderr";
            exit;
        }
        next;
    }
    in_frontmatter == 1 {
        frontmatter = frontmatter $0 "\n";
        print "Collecting frontmatter line: " $0 > "/dev/stderr";
    }
    END {
        print "Collected frontmatter:\n" frontmatter > "/dev/stderr";
        print frontmatter;
    }
    ')

    echo "$frontmatter"
}

# Function to generate agent entry
generate_agent_entry() {
    local agent_file="$1"
    local frontmatter="$2"

    # Robust field extraction
    local name=$(echo "$frontmatter" | grep -m1 "^name:" | sed 's/^name:[ ]*//' | xargs)
    local description=$(echo "$frontmatter" | grep -m1 "^description:" | sed 's/^description:[ ]*//' | xargs)
    local type=$(echo "$frontmatter" | grep -m1 "^type:" | sed 's/^type:[ ]*//' | xargs)
    local keywords=$(echo "$frontmatter" | grep -m1 "^keywords:" | sed -E 's/^keywords:[ ]*\[?|\]?$//' | tr -d ' ' | tr ',' '\n')

    # Fallback description
    [[ -z "$description" ]] && description=$(head -n1 "$agent_file" | sed 's/^# //')

    # Default type
    type=${type:-specialist}

    # Determine loop
    local loop=""
    case "$type" in
        backend-dev|frontend-dev|coder|developer|api-designer|devops|security-specialist)
            loop="loop3"
            ;;
        reviewer|tester|validator|auditor)
            loop="loop2"
            ;;
        coordinator|strategic)
            loop="coordinator"
            ;;
        *)
            loop="strategic"
            ;;
    esac

    # JSON escaping
    local name_escaped=$(printf '%s' "$name" | sed 's/"/\\"/g')
    local description_escaped=$(printf '%s' "$description" | sed 's/"/\\"/g')
    local type_escaped=$(printf '%s' "$type" | sed 's/"/\\"/g')
    local loop_escaped=$(printf '%s' "$loop" | sed 's/"/\\"/g')

    # Create keywords JSON
    local keywords_json="[]"
    if [[ -n "$keywords" ]]; then
        keywords_json="["
        while read -r keyword; do
            [[ -n "$keyword" ]] && keywords_json+="\"$keyword\","
        done <<< "$keywords"
        keywords_json="${keywords_json%,}]"
    fi

    # Build and echo agent entry
    echo "{\"name\":\"$name_escaped\",\"description\":\"$description_escaped\",\"type\":\"$type_escaped\",\"loop\":\"$loop_escaped\",\"keywords\":$keywords_json,\"file\":\"$agent_file\"}"
}

# Collect agent entries
agents_json=""
total_agents=0

# Process agent files recursively
mapfile -t agent_files < <(find "$AGENTS_DIR" -type f -name "*.md")

echo "Total files found: ${#agent_files[@]}"

for agent_file in "${agent_files[@]}"; do
    # Skip documentation files and hidden directories
    basename=$(basename "$agent_file")
    if [[ "$basename" =~ ^(AGENT_LIFECYCLE|CLAUDE|README|README-VALIDATION|index.md)$ ]] || [[ "$agent_file" == *"/.git/"* ]]; then
        echo "Skipping doc file or git file: $agent_file"
        continue
    fi

    echo "Parsing file: $agent_file"

    # Parse frontmatter
    frontmatter=$(parse_frontmatter "$agent_file")

    if [[ -z "$frontmatter" ]]; then
        echo "WARN: No frontmatter found in $agent_file"
        continue
    fi

    # Extract name and verify
    name=$(echo "$frontmatter" | grep -m1 "^name:" | sed 's/^name:[ ]*//' | xargs)
    if [[ -z "$name" ]]; then
        echo "WARN: No name found in $agent_file"
        continue
    fi

    # Generate agent entry
    agent_entry=$(generate_agent_entry "$agent_file" "$frontmatter")

    # Append to list
    [[ -n "$agents_json" ]] && agents_json+=","
    agents_json+="$agent_entry"
    ((total_agents++))

    echo "Processed agent: $name"
done

echo "Processed total agents: $total_agents"

# Generate final JSON manually
final_json="{\n  \"agents\": [$agents_json],\n  \"last_updated\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\n  \"total_agents\": $total_agents\n}"

# Ensure directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Write to file
printf "$final_json" > "$OUTPUT_FILE"

# Verify file write
if [[ -f "$OUTPUT_FILE" ]]; then
    echo "Agent registry generated: $OUTPUT_FILE"
    echo "Total agents discovered: $total_agents"
    cat "$OUTPUT_FILE"
else
    echo "ERROR: Failed to generate agent registry file"
    exit 1
fi