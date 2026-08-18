#!/usr/bin/env bash
set -eu

# Add CodeSearch instructions to all agent profiles with Post-Edit Pipeline

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="${SCRIPT_DIR}/../agents/cfn-dev-team"

# CodeSearch instruction block to add
CODESEARCH_BLOCK='
# IMPORTANT: CodeSearch Semantic Search (Before Making Changes)
# Before implementing any changes, ALWAYS query the codebase for similar patterns:
#   /codebase-search "relevant search terms for your task" --top 5
#   /codebase-search "error pattern or issue you'\''re fixing" --top 3
# Also query past errors and learnings:
#   ./.claude/skills/cfn-codesearch-codebase-index/query-error-patterns.sh --task-description "Your task description"
#   ./.claude/skills/cfn-codesearch-codebase-index/query-learnings.sh --task-description "Your task description" --category PATTERN
# This prevents duplicated work and leverages existing solutions.'

# Function to add instructions after post-edit pipeline section
add_codesearch_instructions() {
    local file="$1"
    local temp_file=$(mktemp)

    # Check if file already has CodeSearch instructions
    if grep -q "CodeSearch Semantic Search" "$file"; then
        echo "⚠️  $(basename "$file") already has CodeSearch instructions"
        rm -f "$temp_file"
        return 0
    fi

    # Find the line with post-edit pipeline and insert after its block
    if grep -q "Post-Edit Pipeline Requirement" "$file"; then
        awk -v block="$CODESEARCH_BLOCK" '
        /^# IMPORTANT: Post-Edit Pipeline Requirement/ {in_section=1}
        in_section && /^$/ && !added {
            print block
            added=1
            in_section=0
        }
        {print}
        ' "$file" > "$temp_file"
        mv "$temp_file" "$file"
        echo "✅ Added CodeSearch to $(basename "$file")"
        return 1
    else
        rm -f "$temp_file"
        return 0
    fi
}

# Process all agent files recursively
echo "🔄 Adding CodeSearch instructions to agent profiles..."
echo ""

updated=0
skipped=0
no_postedit=0

while IFS= read -r -d '' agent_file; do
    # Skip non-agent files
    if [[ "$(basename "$agent_file")" == "CLAUDE.md" ]] || \
       [[ "$(basename "$agent_file")" == "README.md" ]]; then
        continue
    fi

    if add_codesearch_instructions "$agent_file"; then
        ((skipped++)) || true
    else
        ((updated++)) || true
    fi
done < <(find "$AGENT_DIR" -name "*.md" -type f -print0 2>/dev/null)

echo ""
echo "=== Summary ==="
echo "✅ Updated: $updated agents"
echo "⚠️  Already had instructions: $skipped agents"
