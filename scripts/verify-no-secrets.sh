#!/bin/bash
# Verify npm package contains no secrets before publishing

set -e

echo "🔍 Scanning npm package for secrets..."

# Get list of files that would be included (without actually packing)
PACKAGE_FILES=$(npm pack --dry-run 2>&1 | grep -E '^[0-9.]+[kKMG]?B?\s+' | awk '{print $2}' || true)

# Check for sensitive file patterns
if echo "$PACKAGE_FILES" | grep -E '\.(env|key|pem|secrets|credentials)$' > /dev/null 2>&1; then
  echo "❌ ERROR: Sensitive files detected in package:"
  echo "$PACKAGE_FILES" | grep -E '\.(env|key|pem|secrets|credentials)$'
  exit 1
fi

# Check for .claude/api-configs directory
if echo "$PACKAGE_FILES" | grep -q '.claude/api-configs' 2>/dev/null; then
  echo "❌ ERROR: API config directory included in package"
  exit 1
fi

# Check actual file contents for secret patterns
# Use dist/ and .claude/ directories since those are included in package
SECRET_PATTERNS='(ANTHROPIC_API_KEY|ZAI_API_KEY|NPM_API_KEY|REDIS_PASSWORD)=[A-Za-z0-9_-]{20,}'
KEY_PATTERNS='(sk-ant-api03-[A-Za-z0-9_-]{95}|npm_[A-Za-z0-9]{36})'

if [ -d "dist" ]; then
  if grep -r -E "$SECRET_PATTERNS" dist/ 2>/dev/null; then
    echo "❌ ERROR: API key environment variables detected in dist/"
    exit 1
  fi

  if grep -r -E "$KEY_PATTERNS" dist/ 2>/dev/null; then
    echo "❌ ERROR: Live API keys detected in dist/"
    exit 1
  fi
fi

if [ -d ".claude" ]; then
  # Check .claude directory (excluding known safe locations)
  if grep -r -E "$SECRET_PATTERNS" .claude/ --exclude-dir=legacy 2>/dev/null; then
    echo "❌ ERROR: API key environment variables detected in .claude/"
    exit 1
  fi

  if grep -r -E "$KEY_PATTERNS" .claude/ --exclude-dir=legacy 2>/dev/null; then
    echo "❌ ERROR: Live API keys detected in .claude/"
    exit 1
  fi
fi

echo "✅ No secrets detected in package"
exit 0
