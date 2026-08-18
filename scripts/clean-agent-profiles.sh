#!/usr/bin/env bash
# Clean agent profiles: Remove CLI-mode-only commands that cause Exit 127 in Task Mode
# These profiles get copied to npm package via copy-claude-assets script

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS_DIR="$PROJECT_ROOT/.claude/agents/cfn-dev-team"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=================================================="
echo "Agent Profile Cleaning Script"
echo "=================================================="
echo ""
echo "Removing CLI-mode-only commands from agent profiles"
echo "Profiles are used in Task Mode where these commands fail with Exit 127"
echo ""

# Find all agent profiles with problematic patterns
PROFILES=$(grep -l "parse-test-results.sh\|report-completion.sh\|redis-cli HSET\|redis-cli LPUSH" "$AGENTS_DIR"/**/*.md 2>/dev/null || true)

if [ -z "$PROFILES" ]; then
    echo -e "${GREEN}✓ No profiles need cleaning${NC}"
    exit 0
fi

PROFILE_COUNT=$(echo "$PROFILES" | wc -l)
echo "Found $PROFILE_COUNT profiles to clean"
echo ""

CLEANED=0
for profile in $PROFILES; do
    PROFILE_NAME=$(basename "$profile" .md)
    echo -e "${YELLOW}Cleaning: $PROFILE_NAME${NC}"

    # Create backup
    cp "$profile" "$profile.backup"

    # Remove the "Report Test Results" section that has CLI commands
    # Strategy: Find the section and replace with clean Task Mode version

    # Create cleaned version with native bash parsing
    cat > /tmp/clean-section.txt << 'EOF'
### 3. Report Test Results (NOT Confidence)

Execute tests and return structured output:

```bash
# Execute tests and capture output
TEST_OUTPUT=$(npm test 2>&1)

# Parse results natively (no CFN Loop infrastructure dependency)
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= passing)' || echo "0")
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -oP '\d+(?= failing)' || echo "0")
TOTAL=$((PASS_COUNT + FAIL_COUNT))

# Calculate pass rate
if [ "$TOTAL" -gt 0 ]; then
    PASS_RATE=$(awk "BEGIN {printf \"%.2f\", $PASS_COUNT/$TOTAL}")
else
    PASS_RATE="0.00"
fi

# Return structured output (Main Chat receives this automatically in Task Mode)
cat << RESULT
{
  "passed": $PASS_COUNT,
  "failed": $FAIL_COUNT,
  "total": $TOTAL,
  "pass_rate": $PASS_RATE
}
RESULT
```

**Note:** In Task Mode, simply return results. Main Chat receives your output automatically.
EOF

    # Use sed to replace the section
    # Find from "### 3. Report Test Results" to next "###" or "##"
    sed -i '/^### 3\. Report Test Results/,/^##/{
        /^### 3\. Report Test Results/!{
            /^##/!d
        }
    }' "$profile"

    # Insert clean section after "### 2. TDD Protocol"
    sed -i '/^### 2\. TDD Protocol/r /tmp/clean-section.txt' "$profile"

    echo -e "  ${GREEN}✓ Cleaned${NC}"
    ((CLEANED++))
done

echo ""
echo "=================================================="
echo -e "${GREEN}Cleaned $CLEANED profiles${NC}"
echo "=================================================="
echo ""
echo "Backups saved with .backup extension"
echo ""
echo "Next steps:"
echo "1. Review changes: git diff .claude/agents/"
echo "2. Test a profile: npx claude-flow-novice agent-spawn backend-developer"
echo "3. Rebuild: npm run build"
echo "4. Publish: npm version patch && npm publish"

# Cleanup
rm -f /tmp/clean-section.txt
