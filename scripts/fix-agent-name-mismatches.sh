#!/bin/bash

# Fix agent frontmatter name mismatches
# This script aligns frontmatter names with filenames for proper agent discovery

echo "🔧 Fixing agent name mismatches..."

# Function to fix a single file
fix_agent() {
    local file="$1"
    local correct_name="$2"

    # Skip if file doesn't exist or correct_name is empty
    if [ ! -f "$file" ] || [ -z "$correct_name" ]; then
        return
    fi

    echo "  Fixing: $file → $correct_name"

    # Use sed to replace the name field (cross-platform compatible)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS sed
        sed -i '' "s/^name: .*/name: $correct_name/" "$file"
    else
        # Linux sed
        sed -i "s/^name: .*/name: $correct_name/" "$file"
    fi
}

# Critical fixes (agents actively used in coordination)
fix_agent ".claude/agents/analysis/code-analyzer.md" "code-analyzer"
fix_agent ".claude/agents/analysis/code-review/analyze-code-quality.md" "analyze-code-quality"
fix_agent ".claude/agents/development/backend/dev-backend-api.md" "dev-backend-api"
fix_agent ".claude/agents/documentation/api-docs/docs-api-openapi.md" "docs-api-openapi"
fix_agent ".claude/agents/documentation/api-docs.md" "api-docs"
fix_agent ".claude/agents/security/security-specialist-existing.md" "security-specialist-existing"
fix_agent ".claude/agents/sparc/specification.md" "specification"
fix_agent ".claude/agents/specialized/mobile/mobile-dev.md" "mobile-dev"
fix_agent ".claude/agents/specialized/mobile/spec-mobile-react-native.md" "spec-mobile-react-native"
fix_agent ".claude/agents/specialized/rust-developer.md" "rust-developer"
fix_agent ".claude/agents/swarm/adaptive-coordinator.md" "adaptive-coordinator"
fix_agent ".claude/agents/swarm/test-coordinator.md" "test-coordinator"
fix_agent ".claude/agents/testing/e2e/playwright-agent.md" "playwright-agent"

echo "✅ Agent name mismatches fixed!"
echo ""
echo "To verify the fix worked:"
echo "  node src/cli/hybrid-routing/spawn-workers.js --list-agents | grep -E '(code-analyzer|backend-dev|api-docs|security-specialist|mobile-dev|rust-developer|adaptive-coordinator)'"
