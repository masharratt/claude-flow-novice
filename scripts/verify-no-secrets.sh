#!/usr/bin/env bash
#
# Pre-Publish Security Verification: Detect Hardcoded Secrets
# Version: 1.0.0 - CVSS 9.0 Critical Vulnerability Prevention
#
# This script prevents publishing npm packages with hardcoded credentials.
#
# Used by: npm run prepublishOnly
# Exit Codes: 0 = safe, 1 = secrets detected
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FOUND_SECRETS=0

echo -e "${YELLOW}[SECURITY] Scanning npm package for hardcoded secrets...${NC}"

# Get list of files that would be included (without actually packing)
PACKAGE_FILES=$(npm pack --dry-run 2>&1 | grep -E '^[0-9.]+[kKMG]?B?\s+' | awk '{print $2}' || true)

# Check for sensitive file patterns that should NEVER be published
if echo "$PACKAGE_FILES" | grep -E '\.(env|key|pem|secrets|credentials|pass|pwd)$' > /dev/null 2>&1; then
  echo -e "${RED}[ERROR] Sensitive files detected in package:${NC}"
  echo "$PACKAGE_FILES" | grep -E '\.(env|key|pem|secrets|credentials|pass|pwd)$'
  FOUND_SECRETS=1
fi

# Check for .claude/api-configs directory
if echo "$PACKAGE_FILES" | grep -q '.claude/api-configs' 2>/dev/null; then
  echo -e "${RED}[ERROR] API config directory included in package${NC}"
  FOUND_SECRETS=1
fi

# Expanded secret patterns (CVSS 9.0 critical fixes)
SECRET_PATTERNS=(
  # Anthropic keys (real format, not templates)
  "sk-ant-v1-[a-zA-Z0-9_-]{50,}"

  # Environment variable assignments with ACTUAL secrets (not variables/templates)
  "(ANTHROPIC_API_KEY|ZAI_API_KEY|NPM_API_KEY|REDIS_PASSWORD|POSTGRES_PASSWORD|JWT_SECRET|SESSION_SECRET)=[A-Za-z0-9_-/+]{20,}"

  # AWS keys (real format)
  "AKIA[0-9A-Z]{16}"

  # Private keys (actual PEM format)
  "-----BEGIN.*PRIVATE KEY"
)

# Check actual file contents for secret patterns
if [ -d "dist" ]; then
  echo "Scanning dist/ directory..."
  for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -r -E "$pattern" dist/ --exclude="*.js.map" --exclude="*.map" 2>/dev/null || true | grep -q .; then
      echo -e "${RED}[ERROR] Secret pattern detected in dist/: $pattern${NC}"
      FOUND_SECRETS=1
    fi
  done
fi

if [ -d ".claude" ]; then
  echo "Scanning .claude/ directory..."
  for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -r -E "$pattern" .claude/ --exclude-dir=legacy --exclude-dir=hooks 2>/dev/null || true | grep -q .; then
      echo -e "${RED}[ERROR] Secret pattern detected in .claude/: $pattern${NC}"
      FOUND_SECRETS=1
    fi
  done
fi

if [ -d "src" ]; then
  echo "Scanning src/ directory..."
  for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -r -E "$pattern" src/ 2>/dev/null || true | grep -q .; then
      echo -e "${RED}[ERROR] Secret pattern detected in src/: $pattern${NC}"
      FOUND_SECRETS=1
    fi
  done
fi

# Final status
echo ""
if [ $FOUND_SECRETS -eq 0 ]; then
  echo -e "${GREEN}[SUCCESS] No secrets detected in package. Safe to publish.${NC}"
  exit 0
else
  echo -e "${RED}[ERROR] Hardcoded secrets detected. Publishing blocked.${NC}"
  echo ""
  echo "How to fix:"
  echo "1. Review flagged patterns above"
  echo "2. Replace hardcoded values with process.env.VARIABLE_NAME"
  echo "3. Add documentation to README or docs/CREDENTIAL_MANAGEMENT.md"
  echo "4. Run npm run prepublishOnly again to verify"
  echo ""
  echo "Reference: docs/CREDENTIAL_MANAGEMENT.md"
  exit 1
fi
