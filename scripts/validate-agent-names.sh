#!/bin/bash

# Validate Agent Name Consistency
# Ensures frontmatter 'name:' field matches filename for all agent definitions
# Usage: bash scripts/validate-agent-names.sh

set -e

echo "🔍 Validating agent name consistency..."
echo ""

MISMATCHES=0
VALIDATED=0
SKIPPED=0

# Find all agent markdown files
find .claude/agents -name "*.md" -type f | while read -r file; do
    filename=$(basename "$file" .md)

    # Skip documentation/template files
    if [[ "$filename" =~ ^(README|CLAUDE|SPARSE_LANGUAGE_FINDINGS|CLAUDE_AGENT_DESIGN_PRINCIPLES|CODER_AGENT_GUIDELINES|README-VALIDATION)$ ]]; then
        ((SKIPPED++)) || true
        continue
    fi

    # Extract frontmatter name
    frontmatter_name=$(grep "^name:" "$file" 2>/dev/null | head -1 | cut -d":" -f2- | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | tr -d '#')

    # Skip files without name field (templates)
    if [ -z "$frontmatter_name" ]; then
        ((SKIPPED++)) || true
        continue
    fi

    ((VALIDATED++)) || true

    # Check for mismatch
    if [ "$filename" != "$frontmatter_name" ]; then
        echo "❌ MISMATCH: $file"
        echo "   Filename:    $filename"
        echo "   Frontmatter: $frontmatter_name"
        echo "   Fix: sed -i 's/^name: .*/name: $filename/' $file"
        echo ""
        ((MISMATCHES++)) || true
    fi
done

# Read results from subshell
VALIDATED=$(find .claude/agents -name "*.md" -type f | wc -l)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Validation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Count actual results
TOTAL_FILES=$(find .claude/agents -name "*.md" -type f | wc -l | tr -d ' ')
ACTUAL_MISMATCHES=$(bash -c 'MISMATCHES=0; find .claude/agents -name "*.md" -type f | while read file; do filename=$(basename "$file" .md); if [[ "$filename" =~ ^(README|CLAUDE|SPARSE_LANGUAGE_FINDINGS|CLAUDE_AGENT_DESIGN_PRINCIPLES|CODER_AGENT_GUIDELINES|README-VALIDATION)$ ]]; then continue; fi; frontmatter_name=$(grep "^name:" "$file" 2>/dev/null | head -1 | cut -d":" -f2- | sed "s/^[[:space:]]*//;s/[[:space:]]*$//" | tr -d "#"); if [ -z "$frontmatter_name" ]; then continue; fi; if [ "$filename" != "$frontmatter_name" ]; then ((MISMATCHES++)); fi; done; echo $MISMATCHES')

echo "Total Files:  $TOTAL_FILES"
echo "Mismatches:   $ACTUAL_MISMATCHES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$ACTUAL_MISMATCHES" -gt 0 ]; then
    echo ""
    echo "❌ Validation FAILED - $ACTUAL_MISMATCHES mismatches found"
    echo ""
    echo "To fix all mismatches automatically:"
    echo "  bash scripts/fix-all-agent-names.sh"
    echo ""
    exit 1
else
    echo ""
    echo "✅ All agent names are consistent!"
    echo ""
    exit 0
fi
