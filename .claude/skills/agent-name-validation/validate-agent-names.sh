#!/bin/bash

# Script to validate agent filenames match frontmatter names
# Usage: ./scripts/validate-agent-names.sh

AGENTS_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/agents"
MISMATCHES=0

echo "Validating agent filenames match frontmatter names..."
echo "=============================================="

# Find all .md files in agents directory recursively
while IFS= read -r -d '' agent_file; do
    # Get filename without extension
    filename=$(basename "$agent_file" .md)

    # Skip CLAUDE.md files
    if [ "$filename" = "CLAUDE" ]; then
        continue
    fi

    # Extract frontmatter name (between --- blocks, look for 'name:' field)
    frontmatter_name=$(awk 'BEGIN{in_fm=0} /^---$/{in_fm++; next} in_fm==1 && /^name:/{print $2; exit}' "$agent_file")

    # Skip if no frontmatter name found
    if [ -z "$frontmatter_name" ]; then
        echo "⚠️  WARNING: No frontmatter name found in $agent_file"
        continue
    fi

    # Compare filename with frontmatter name
    if [ "$filename" != "$frontmatter_name" ]; then
        echo "❌ MISMATCH: $agent_file"
        echo "   Filename:    $filename"
        echo "   Frontmatter: $frontmatter_name"
        echo ""
        ((MISMATCHES++))
    fi
done < <(find "$AGENTS_DIR" -name "*.md" -type f -print0)

echo "=============================================="
if [ $MISMATCHES -eq 0 ]; then
    echo "✅ All agent files have matching names!"
else
    echo "❌ Found $MISMATCHES mismatch(es)"
    exit 1
fi
