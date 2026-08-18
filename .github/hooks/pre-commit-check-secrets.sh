#!/usr/bin/env bash
# ==============================================================================
# Pre-Commit Git Hook - Secret Detection
# ==============================================================================
#
# Purpose: Prevent accidental commits of sensitive credentials
#
# Features:
# - Scans staged files for API keys, passwords, tokens
# - Blocks commits containing secrets
# - Allows .env.encrypted through
# - Provides helpful error messages
# - Whitelist system for false positives
#
# Installation:
#   chmod +x .github/hooks/pre-commit-check-secrets.sh
#   cp .github/hooks/pre-commit-check-secrets.sh .git/hooks/pre-commit
#
# Bypass (emergency only):
#   git commit --no-verify
#
# Returns:
#   0 - No secrets found (safe to commit)
#   1 - Secrets detected in staged files
#
# ==============================================================================

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

# Patterns to detect (case-insensitive regex)
PATTERNS=(
  # API Keys
  'ANTHROPIC_API_KEY\s*=\s*sk-'
  'ZAI_API_KEY\s*=\s*'
  'KIMI_API_KEY\s*=\s*'
  'GEMINI_API_KEY\s*=\s*'
  'XAI_API_KEY\s*=\s*'
  'OPENROUTER_API_KEY\s*=\s*'
  'TRIGGER_API_KEY\s*=\s*tr_'
  'GITHUB_TOKEN\s*=\s*ghp_'
  'GITHUB_PAT\s*=\s*'

  # Passwords and Secrets
  'PASSWORD\s*=\s*[^"[:space:]]'
  'SECRET\s*=\s*[^"[:space:]]'
  'PRIVATE_KEY\s*=\s*'
  'CLIENT_SECRET\s*=\s*'
  'API_SECRET\s*=\s*'
  'JWT_SECRET\s*=\s*'
  'SESSION_SECRET\s*=\s*'
  'ENCRYPTION_KEY\s*=\s*'
  'DECRYPTION_KEY\s*=\s*'

  # AWS/Cloud Credentials
  'AWS_ACCESS_KEY_ID\s*=\s*'
  'AWS_SECRET_ACCESS_KEY\s*=\s*'
  'AZURE_KEY\s*=\s*'
  'GCP_KEY\s*=\s*'
  'VAULT_TOKEN\s*=\s*'

  # Database Credentials
  'DB_PASSWORD\s*=\s*[^"[:space:]]'
  'REDIS_PASSWORD\s*=\s*[^"[:space:]]'
  'POSTGRES_PASSWORD\s*=\s*[^"[:space:]]'
  'MONGO_PASSWORD\s*=\s*[^"[:space:]]'

  # OAuth Tokens
  'oauth.*token\s*:\s*'
  'access_token\s*=\s*'
  'refresh_token\s*=\s*'
  'bearer\s+[a-z0-9._-]+'
)

# Files to ignore (whitelist)
IGNORE_PATTERNS=(
  '\.env\.example'
  '\.env\.template'
  '\.env\.encrypted'
  'docker-compose\.secrets\.yml'
  'SECURITY\.md'
  '\.md$'
  '\.txt$'
  '\.example$'
  'test.*secret'
  'fixtures.*secret'
  'mock.*credential'
)

# ==============================================================================
# Logging Functions
# ==============================================================================

log_header() {
  echo ""
  echo "=================================================="
  echo "$*"
  echo "=================================================="
}

log_error() {
  echo "ERROR: $*" >&2
}

log_warning() {
  echo "WARNING: $*" >&2
}

log_success() {
  echo "✓ $*"
}

# ==============================================================================
# Utility Functions
# ==============================================================================

should_ignore_file() {
  local file="$1"

  for pattern in "${IGNORE_PATTERNS[@]}"; do
    if [[ "$file" =~ $pattern ]]; then
      log_warning "Ignoring whitelisted file: $file"
      return 0
    fi
  done

  return 1
}

check_file_for_secrets() {
  local file="$1"
  local line_num=0
  local found_secrets=0

  # Skip ignored files
  if should_ignore_file "$file"; then
    return 0
  fi

  log_header "Scanning: $file"

  # Read file line by line
  while IFS= read -r line || [[ -n "$line" ]]; do
    ((line_num++))

    # Skip empty lines and comments
    if [[ -z "$line" ]] || [[ "$line" =~ ^[[:space:]]*# ]]; then
      continue
    fi

    # Check each pattern
    for pattern in "${PATTERNS[@]}"; do
      if echo "$line" | grep -iE "$pattern" > /dev/null 2>&1; then
        # Found a potential secret
        log_error "Line $line_num: Potential secret detected"

        # Show sanitized line (redact actual secret)
        local sanitized_line
        sanitized_line=$(echo "$line" | sed -E 's/=[[:space:]]*[^[:space:]]+/=[REDACTED]/g')
        echo "  Pattern: $pattern" >&2
        echo "  Content: $sanitized_line" >&2

        found_secrets=$((found_secrets + 1))
        break  # Don't check other patterns for this line
      fi
    done
  done < "$file"

  if [[ $found_secrets -gt 0 ]]; then
    log_error "$file contains $found_secrets potential secret(s)"
    return 1
  else
    log_success "$file: No secrets detected"
    return 0
  fi
}

# ==============================================================================
# Main Execution
# ==============================================================================

main() {
  log_header "Pre-Commit Secret Detection Hook"

  # Get list of staged files
  local staged_files
  staged_files=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || echo "")

  if [[ -z "$staged_files" ]]; then
    log_success "No staged files to check"
    echo ""
    return 0
  fi

  echo "Checking $(echo "$staged_files" | wc -l) staged file(s) for secrets..."
  echo ""

  local total_files=0
  local failed_files=0

  # Check each file
  while IFS= read -r file; do
    ((total_files++))

    # Get staged content (use git show for staged version)
    local temp_staged
    temp_staged=$(mktemp)
    trap "rm -f $temp_staged" RETURN

    if ! git show ":$file" > "$temp_staged" 2>/dev/null; then
      log_warning "Could not read staged version of $file - skipping"
      continue
    fi

    # Check staged content
    if ! grep -iEf <(printf '%s\n' "${PATTERNS[@]}") "$temp_staged" > /dev/null 2>&1; then
      log_success "$file: No secrets detected"
    else
      # Show detailed error
      check_file_for_secrets "$temp_staged" || {
        failed_files=$((failed_files + 1))
      }
    fi

  done <<< "$staged_files"

  echo ""
  log_header "Secret Detection Summary"
  echo "Total files checked: $total_files"
  echo "Files with potential secrets: $failed_files"
  echo ""

  if [[ $failed_files -gt 0 ]]; then
    log_error "Commit blocked: Potential secrets detected in staged files"
    echo ""
    echo "To fix this:"
    echo "1. Remove secrets from the files:"
    echo "   - Move to .env or .secrets/"
    echo "   - Or use .env.encrypted for encrypted storage"
    echo ""
    echo "2. Stage only the fixed files:"
    echo "   git add <fixed-files>"
    echo ""
    echo "3. Try commit again:"
    echo "   git commit -m '...'"
    echo ""
    echo "To bypass this check (emergency only):"
    echo "   git commit --no-verify"
    echo ""
    return 1
  fi

  log_success "All staged files are safe to commit!"
  echo ""
  return 0
}

main "$@"
