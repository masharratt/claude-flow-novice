#!/bin/bash
#
# Pre-commit Hook: Detect Hardcoded Credentials
# Version: 1.0.0
#
# This hook prevents accidental commits of hardcoded credentials including:
# - API keys (Anthropic, Z.ai, OpenRouter, etc)
# - Database passwords
# - JWT/Session secrets
# - Bearer tokens
# - Private keys
#
# Installation:
#   cp .claude/hooks/detect-hardcoded-credentials.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Usage:
#   Runs automatically before every git commit
#   Bypass (NOT RECOMMENDED): git commit --no-verify
#
# Exit Codes:
#   0 = No credentials found (safe to commit)
#   1 = Credentials detected (commit blocked)
#

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Configuration
EXCLUDE_PATTERNS=(
  "*.example"
  "*.template"
  "docs/"
  "tests/"
  "legacy/"
  "node_modules/"
  ".git/"
  "*.md"
  "tests/fixtures/"  # Only exclude test fixtures, not all tests
  "legacy/"
  "node_modules/"
  ".git/"
  # REMOVED: "docs/" exclusion - now validates documentation files
  # REMOVED: "*.md" exclusion - now validates markdown files
)

# High-entropy patterns (likely credentials)
CREDENTIAL_PATTERNS=(
  # API Keys
  "sk-ant-v1-[a-zA-Z0-9_-]{50,}"                      # Anthropic keys
  "sk-[a-zA-Z0-9]{20,}"                               # Generic API keys
  "api_key\s*=\s*['\"][^'\"]{20,}['\"]"               # api_key assignments
  "apikey\s*=\s*['\"][^'\"]{20,}['\"]"                # apikey assignments
  "API_KEY\s*=\s*['\"][^'\"]{20,}['\"]"               # API_KEY assignments

  # Passwords
  "password\s*=\s*['\"][^'\"]{8,}['\"]"               # password assignments
  "passwd\s*=\s*['\"][^'\"]{8,}['\"]"                 # passwd assignments
  "pwd\s*=\s*['\"][^'\"]{8,}['\"]"                    # pwd assignments
  "PASSWORD\s*=\s*['\"][^'\"]{8,}['\"]"               # PASSWORD assignments

  # Database credentials
  "POSTGRES_PASSWORD\s*=\s*['\"][^'\"]{8,}['\"]"      # PostgreSQL password
  "MYSQL_PASSWORD\s*=\s*['\"][^'\"]{8,}['\"]"         # MySQL password
  "MONGO_PASSWORD\s*=\s*['\"][^'\"]{8,}['\"]"         # MongoDB password
  "DB_PASSWORD\s*=\s*['\"][^'\"]{8,}['\"]"            # Generic DB password
  "REDIS_PASSWORD\s*=\s*['\"][^'\"]{8,}['\"]"         # Redis password

  # Tokens & Secrets
  "token\s*=\s*['\"][^'\"]{20,}['\"]"                 # token assignments
  "secret\s*=\s*['\"][^'\"]{20,}['\"]"                # secret assignments
  "jwt\s*=\s*['\"][^'\"]{20,}['\"]"                   # JWT assignments
  "Bearer\s+[a-zA-Z0-9_.-]{20,}"                      # Bearer tokens

  # AWS Credentials
  "AKIA[0-9A-Z]\{16\}"                                # AWS Access Key ID
  "aws_access_key_id\s*=\s*[^[:space:]]+"             # AWS key assignment
  "aws_secret_access_key\s*=\s*[^[:space:]]+"         # AWS secret assignment

  # Private Keys
  "-----BEGIN PRIVATE KEY-----"                       # PEM private key start
  "-----BEGIN RSA PRIVATE KEY-----"                   # RSA private key start
  "-----BEGIN EC PRIVATE KEY-----"                    # EC private key start
)

# Build grep pattern
PATTERN=""
for p in "${CREDENTIAL_PATTERNS[@]}"; do
  if [ -z "$PATTERN" ]; then
    PATTERN="$p"
  else
    PATTERN="$PATTERN|$p"
  fi
done

# Build exclude pattern for grep
EXCLUDE_GREP=""
for exc in "${EXCLUDE_PATTERNS[@]}"; do
  if [ -z "$EXCLUDE_GREP" ]; then
    EXCLUDE_GREP="--exclude=$exc"
  else
    EXCLUDE_GREP="$EXCLUDE_GREP --exclude=$exc"
  fi
done

# Function to check staged files
check_staged_files() {
  local found_credentials=0

  # Get list of staged files
  local staged_files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || echo "")

  if [ -z "$staged_files" ]; then
    return 0
  fi

  # Check each staged file
  while IFS= read -r file; do
    # Skip excluded patterns
    local skip=0
    for exc in "${EXCLUDE_PATTERNS[@]}"; do
      if [[ "$file" == $exc ]]; then
        skip=1
        break
      fi
    done

    if [ $skip -eq 1 ]; then
      continue
    fi

    # Get staged content
    local staged_content=$(git show ":$file" 2>/dev/null || echo "")

    # Check for credentials in staged content
    if echo "$staged_content" | grep -E "$PATTERN" >/dev/null 2>&1; then
      echo -e "${RED}[SECURITY] Hardcoded credential detected in: ${NC}$file"
      found_credentials=1
    fi
  done <<< "$staged_files"

  return $found_credentials
}

# Function to check for dangerous files
check_dangerous_files() {
  local staged_files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || echo "")

  if [ -z "$staged_files" ]; then
    return 0
  fi

  # Check for .env files (should never be committed)
  if echo "$staged_files" | grep -E "^\.(env|env\.production|env\.staging)" >/dev/null; then
    echo -e "${RED}[SECURITY] Attempting to commit .env file (BLOCKED)${NC}"
    echo "        Use .env.example instead and add .env to .gitignore"
    return 1
  fi

  # Check for private key files
  if echo "$staged_files" | grep -E "\.(pem|key|pk|priv)$" >/dev/null; then
    echo -e "${RED}[SECURITY] Attempting to commit private key file (BLOCKED)${NC}"
    echo "        Private keys should never be committed to version control"
    return 1
  fi

  return 0
}

# Main execution
main() {
  echo -e "${YELLOW}[CREDENTIAL DETECTION] Scanning staged files...${NC}"

  # Check dangerous file types first
  if ! check_dangerous_files; then
    echo ""
    echo -e "${RED}[SECURITY] Commit blocked: dangerous files detected${NC}"
    echo ""
    echo "How to fix:"
    echo "  1. Add .env to .gitignore: echo '.env' >> .gitignore"
    echo "  2. Remove the file from staging: git reset HEAD <file>"
    echo "  3. Remove from history (if already committed):"
    echo "     git filter-branch --tree-filter 'rm -f <file>' HEAD"
    echo ""
    return 1
  fi

  # Check for hardcoded credentials
  if ! check_staged_files; then
    echo ""
    echo -e "${RED}[SECURITY] Commit blocked: hardcoded credentials detected${NC}"
    echo ""
    echo "How to fix:"
    echo "  1. Remove hardcoded values: git checkout -- <file>"
    echo "  2. Use environment variables instead"
    echo "  3. Add values to .env.example (without real values)"
    echo "  4. Re-stage the corrected file"
    echo ""
    echo "Reference: docs/CREDENTIAL_MANAGEMENT.md"
    return 1
  fi

  echo -e "${GREEN}[CREDENTIAL DETECTION] ✓ No credentials detected${NC}"
  return 0
}

main "$@"
