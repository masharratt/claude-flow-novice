#!/usr/bin/env bash
#
# Test: Credential Detection Hook
# Validates that the pre-commit hook catches API keys in all file types
#
# Tests:
# 1. Detects API keys in .md files
# 2. Detects API keys in .ts files
# 3. Detects API keys in .js files
# 4. Allows [REDACTED] placeholders
# 5. Blocks actual credential patterns
#

set -euo pipefail

TEST_DIR="/tmp/credential-detection-test-$$"
HOOK_PATH=".claude/hooks/detect-hardcoded-credentials.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

function cleanup() {
  rm -rf "$TEST_DIR"
}

trap cleanup EXIT

# Create test directory
mkdir -p "$TEST_DIR"

echo "Testing Credential Detection Hook"
echo "=================================="
echo ""

# Test 1: Detect API key in markdown file
echo -n "Test 1: Detect API key in .md file... "
cat > "$TEST_DIR/test.md" << 'EOF'
# Security Audit

Evidence:
```
ANTHROPIC_API_KEY=sk-ant-v1-abcdefghijklmnopqrstuvwxyz1234567890
```
EOF

cd "$TEST_DIR"
if bash "$(pwd)/../../../$HOOK_PATH" 2>&1 | grep -q "ANTHROPIC_API_KEY"; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL${NC}"
  exit 1
fi

# Test 2: Allow [REDACTED] in markdown
echo -n "Test 2: Allow [REDACTED] placeholder... "
cat > "$TEST_DIR/test.md" << 'EOF'
# Security Audit

Evidence:
```
ANTHROPIC_API_KEY=sk-ant-[REDACTED]
KIMI_API_KEY=[REDACTED]
```
EOF

if bash "$(pwd)/../../../$HOOK_PATH" 2>&1 | grep -q "No hardcoded credentials"; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL${NC} - Should allow [REDACTED] placeholders"
  exit 1
fi

# Test 3: Detect Z.ai API key
echo -n "Test 3: Detect Z.ai API key... "
# Fixture key assembled at runtime: the committed script must never contain a
# credential-shaped ZAI_API_KEY literal (the CI credential scan reads this file).
SYNTH_ZAI_KEY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.ZaiFixtureSuffix"
cat > "$TEST_DIR/test.ts" << EOF
const config = {
  ZAI_API_KEY: "$SYNTH_ZAI_KEY"
};
EOF

if bash "$(pwd)/../../../$HOOK_PATH" 2>&1 | grep -q "ZAI_API_KEY"; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL${NC}"
  exit 1
fi

# Test 4: Detect OpenRouter API key
echo -n "Test 4: Detect OpenRouter API key... "
cat > "$TEST_DIR/test.js" << 'EOF'
export const OPENROUTER_API_KEY = "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";
EOF

if bash "$(pwd)/../../../$HOOK_PATH" 2>&1 | grep -q "OPENROUTER_API_KEY"; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL${NC}"
  exit 1
fi

# Test 5: Detect NPM token
echo -n "Test 5: Detect NPM token... "
# Fixture token assembled at runtime: no credential-shaped literal in this file.
SYNTH_NPM_TOKEN="npm_$(printf 'A%.0s' $(seq 1 36))"
cat > "$TEST_DIR/.npmrc" << EOF
//registry.npmjs.org/:_authToken=$SYNTH_NPM_TOKEN
EOF

if bash "$(pwd)/../../../$HOOK_PATH" 2>&1 | grep -q "authToken"; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL${NC}"
  exit 1
fi

# Test 6: Allow .env.example with CHANGE_ME
echo -n "Test 6: Allow .env.example with placeholders... "
cat > "$TEST_DIR/.env.example" << 'EOF'
ANTHROPIC_API_KEY=CHANGE_ME_GENERATE_STRONG_KEY
ZAI_API_KEY=your-api-key-here
EOF

if bash "$(pwd)/../../../$HOOK_PATH" 2>&1 | grep -q "No hardcoded credentials"; then
  echo -e "${GREEN}PASS${NC}"
else
  echo -e "${RED}FAIL${NC} - Should allow .env.example files"
  exit 1
fi

echo ""
echo -e "${GREEN}✅ All credential detection tests passed!${NC}"
echo ""
echo "Summary:"
echo "  • Markdown files (.md) are now scanned ✓"
echo "  • API_KEY patterns detected ✓"
echo "  • [REDACTED] placeholders allowed ✓"
echo "  • Multiple credential types detected ✓"
echo ""
