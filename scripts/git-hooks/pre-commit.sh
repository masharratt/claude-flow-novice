#!/bin/bash
# Pre-commit hook for Claude Flow Novice
# Runs validation checks before allowing commits

set -e

echo "🔍 Running pre-commit validation..."
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR)

if [ -z "$STAGED_FILES" ]; then
  echo -e "${YELLOW}⚠️  No files staged for commit${NC}"
  exit 0
fi

# Check if npm is available
if ! command -v npm &> /dev/null; then
  echo -e "${RED}❌ npm not found${NC}"
  exit 1
fi

# Run security scan on staged files
echo ""
echo "🔒 Security Scan..."
if npm run security:check --silent; then
  echo -e "${GREEN}✅ Security check passed${NC}"
else
  echo -e "${RED}❌ Security issues found${NC}"
  exit 1
fi

# Run linting on staged JS/TS files
STAGED_JS_FILES=$(echo "$STAGED_FILES" | grep -E '\.(js|ts|jsx|tsx)$' || true)

if [ -n "$STAGED_JS_FILES" ]; then
  echo ""
  echo "📝 Linting staged files..."

  if npm run lint --silent; then
    echo -e "${GREEN}✅ Linting passed${NC}"
  else
    echo -e "${YELLOW}⚠️  Linting issues found (not blocking)${NC}"
  fi
fi

# Check for hardcoded secrets in staged files
echo ""
echo "🔐 Checking for hardcoded secrets..."
SECRETS_FOUND=0

# Patterns to check for secrets
declare -a SECRET_PATTERNS=(
  "api[_-]?key\s*[:=]\s*['\"][a-zA-Z0-9]{20,}['\"]"
  "password\s*[:=]\s*['\"][^'\"]{8,}['\"]"
  "secret[_-]?token\s*[:=]\s*['\"][a-zA-Z0-9]{20,}['\"]"
  "-----BEGIN (RSA )?PRIVATE KEY-----"
  "AKIA[0-9A-Z]{16}"
)

for file in $STAGED_FILES; do
  if [ -f "$file" ]; then
    for pattern in "${SECRET_PATTERNS[@]}"; do
      if grep -qE "$pattern" "$file" 2>/dev/null; then
        echo -e "${RED}❌ Potential secret found in: $file${NC}"
        SECRETS_FOUND=1
      fi
    done
  fi
done

if [ $SECRETS_FOUND -eq 1 ]; then
  echo -e "${RED}❌ Commit blocked: Remove hardcoded secrets${NC}"
  exit 1
fi

echo -e "${GREEN}✅ No secrets found${NC}"

# Check for large files (>1MB)
echo ""
echo "📦 Checking file sizes..."
LARGE_FILES=0

for file in $STAGED_FILES; do
  if [ -f "$file" ]; then
    FILE_SIZE=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)
    if [ $FILE_SIZE -gt 1048576 ]; then
      echo -e "${YELLOW}⚠️  Large file detected: $file ($(($FILE_SIZE / 1024))KB)${NC}"
      LARGE_FILES=1
    fi
  fi
done

if [ $LARGE_FILES -eq 1 ]; then
  echo -e "${YELLOW}⚠️  Consider using Git LFS for large files${NC}"
fi

# Check for package.json changes
if echo "$STAGED_FILES" | grep -q "package.json"; then
  echo ""
  echo "📦 package.json changed - validating..."

  if node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" 2>/dev/null; then
    echo -e "${GREEN}✅ package.json is valid JSON${NC}"
  else
    echo -e "${RED}❌ package.json is invalid${NC}"
    exit 1
  fi

  # Check if package-lock.json should be updated
  if [ -f "package-lock.json" ] && ! echo "$STAGED_FILES" | grep -q "package-lock.json"; then
    echo -e "${YELLOW}⚠️  package.json changed but package-lock.json not staged${NC}"
    echo -e "${YELLOW}   Consider running: npm install && git add package-lock.json${NC}"
  fi
fi

# Check for CLAUDE.md changes
if echo "$STAGED_FILES" | grep -q "CLAUDE.md"; then
  echo ""
  echo "📋 CLAUDE.md changed - validating format..."

  if grep -q "## 1) Critical Rules" "CLAUDE.md" && grep -q "## 2) When Agents Are Mandatory" "CLAUDE.md"; then
    echo -e "${GREEN}✅ CLAUDE.md format valid${NC}"
  else
    echo -e "${RED}❌ CLAUDE.md appears to be malformed${NC}"
    exit 1
  fi
fi

# Final summary
echo ""
echo "======================================"
echo -e "${GREEN}✅ Pre-commit validation passed${NC}"
echo "======================================"

exit 0
