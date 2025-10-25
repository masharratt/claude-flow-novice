#!/bin/bash

# Path replacements
SKILL_REPLACEMENTS=(
    ".claude/skills/redis-coordination/:\.claude/skills/cfn-redis-coordination/"
    ".claude/skills/agent-spawning/:\.claude/skills/cfn-agent-spawning/"
    ".claude/skills/playbook/:\.claude/skills/cfn-playbook/"
    ".claude/skills/:\.claude/skills/cfn-"
)

HOOK_REPLACEMENTS=(
    ".claude/hooks/invoke-post-edit.sh:\.claude/hooks/cfn-invoke-post-edit.sh"
    ".claude/hooks/post-edit.sh:\.claude/hooks/cfn-post-edit.sh"
    ".claude/hooks/:\.claude/hooks/cfn-"
)

DATA_REPLACEMENTS=(
    ".claude/data/:\.claude/cfn-data/"
)

# Function to perform replacements in a file
replace_paths() {
    local file="$1"
    local replacements=("${@:2}")

    # Perform replacements for each pattern
    for replacement in "${replacements[@]}"; do
        IFS=':' read -r old_path new_path <<< "$replacement"
        sed -i "s|${old_path}|${new_path}|g" "$file"
    done
}

# Find and update markdown files
find .claude/agents/cfn-dev-team -name "*.md" | while read -r file; do
    echo "Processing $file"

    # Skill path replacements
    replace_paths "$file" "${SKILL_REPLACEMENTS[@]}"

    # Hook path replacements
    replace_paths "$file" "${HOOK_REPLACEMENTS[@]}"

    # Data path replacements
    replace_paths "$file" "${DATA_REPLACEMENTS[@]}"
done

echo "Path replacements complete!"