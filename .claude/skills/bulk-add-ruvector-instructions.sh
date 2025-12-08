#!/bin/bash
set -eu

# Add RuVector instructions to key agent profiles

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="${SCRIPT_DIR}/../agents"

# Define which agents to update (high-impact ones)
AGENTS_TO_UPDATE=(
    "custom/cfn-docker-expert.md"
    "custom/cfn-loops-cli-expert.md"
    "custom/cfn-redis-operations.md"
    "custom/cfn-system-expert.md"
    "custom/claude-code-expert.md"
    "custom/mdap-trigger-specialist.md"
    "custom/trigger-dev-expert.md"
    "development/backend-developer.md"
    "development/frontend-developer.md"
    "development/database-architect.md"
    "testing/tester.md"
    "validation/code-reviewer.md"
    "validation/security-specialist.md"
)

# Function to add instructions after post-edit pipeline section
add_ruvector_instructions() {
    local file="$1"
    local temp_file=$(mktemp)

    # Check if file already has RuVector instructions
    if grep -q "RuVector Semantic Search" "$file"; then
        echo "⚠️  $file already has RuVector instructions"
        rm -f "$temp_file"
        return 0
    fi

    # Find the line with post-edit pipeline and insert after it
    if grep -q "Post-Edit Pipeline Requirement" "$file"; then
        # Add after the entire post-edit section (look for the empty line after it)
        awk '
        /^# IMPORTANT: Post-Edit Pipeline Requirement/ {in_section=1}
        in_section && /^$/ && !added {
            print ""
            print ""
            print "# IMPORTANT: RuVector Semantic Search (Before Making Changes)"
            print "# Before implementing any changes, ALWAYS query the codebase for similar patterns:"
            print "#   /codebase-search \"relevant search terms for your task\" --top 5"
            print "#   /codebase-search \"error pattern or issue you\"re fixing\" --top 3"
            print "# Also query past errors and learnings:"
            print "#   ./.claude/skills/cfn-ruvector-codebase-index/query-error-patterns.sh --task-description \"Your task description\""
            print "#   ./.claude/skills/cfn-ruvector-codebase-index/query-learnings.sh --task-description \"Your task description\" --category PATTERN"
            print "# This prevents duplicated work and leverages existing solutions."
            added=1
        }
        {print}
        ' "$file" > "$temp_file"
        mv "$temp_file" "$file"
        echo "✅ Added RuVector instructions to $file"
    else
        echo "❌ Could not find Post-Edit section in $file"
        rm -f "$temp_file"
    fi
}

# Process each agent
echo "🔄 Adding RuVector instructions to key agent profiles..."
echo ""

updated=0
skipped=0

for agent in "${AGENTS_TO_UPDATE[@]}"; do
    agent_path="${AGENT_DIR}/$agent"

    if [[ ! -f "$agent_path" ]]; then
        echo "⚠️  $agent not found, skipping"
        ((skipped++))
        continue
    fi

    add_ruvector_instructions "$agent_path"
    ((updated++))
done

echo ""
echo "=== Summary ==="
echo "✅ Updated: $updated agents"
echo "⚠️  Skipped: $skipped agents"
