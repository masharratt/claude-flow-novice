#!/bin/bash
# .claude/skills/cfn-seo/validate-domain.sh
# Domain validation with SSRF protection
#
# Purpose: Validate domain names against OWASP SSRF prevention rules
# - Rejects internal/reserved IPs (127.x, 10.x, 192.168.x, 169.254.x, localhost)
# - Blocks special characters that enable injection
# - Validates domain format with strict regex
# - Optional DNS resolution verification
#
# Usage: validate-domain.sh <domain> [--check-dns]
# Exit codes: 0 = valid, 1 = invalid
#
# Reference: OWASP Server Side Request Forgery Prevention Cheat Sheet

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

# Domain format regex (RFC 1123 compatible)
# - Starts with alphanumeric
# - Allows hyphens in middle (not start/end)
# - Must have at least one dot and valid TLD (2+ chars)
DOMAIN_REGEX='^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$'

# Characters that indicate injection attempts
DANGEROUS_CHARS='<>'"'"'";&|$()[]{}%*'

# Reserved/internal IP patterns (SSRF prevention)
declare -a RESERVED_IPS=(
  "127.0.0.1"
  "127.0.0.0/8"
  "::1"
  "0.0.0.0"
  "0.0.0.0/8"
  "10.0.0.0/8"
  "192.168.0.0/16"
  "169.254.0.0/16"
  "172.16.0.0/12"
  "240.0.0.0/4"
  "255.255.255.255"
  "localhost"
)

# ============================================================================
# FUNCTIONS
# ============================================================================

# Print error message to stderr
error() {
  echo "ERROR: $*" >&2
}

# Check if string contains dangerous characters
has_dangerous_chars() {
  local input="$1"
  local char

  for char in $(echo "$DANGEROUS_CHARS" | grep -o .); do
    if [[ "$input" == *"$char"* ]]; then
      return 0  # Found dangerous char
    fi
  done

  return 1  # No dangerous chars found
}

# Check if input matches domain format
is_valid_format() {
  local domain="$1"

  # Must not be empty
  if [[ -z "$domain" ]]; then
    error "Domain cannot be empty"
    return 1
  fi

  # Max length 255 (DNS limit)
  if [[ ${#domain} -gt 255 ]]; then
    error "Domain exceeds maximum length (255 characters)"
    return 1
  fi

  # Match regex
  if ! [[ "$domain" =~ $DOMAIN_REGEX ]]; then
    error "Domain format invalid. Expected: example.com or subdomain.example.com"
    return 1
  fi

  return 0
}

# Check if domain contains special characters that enable injection
is_safe_chars() {
  local domain="$1"

  if has_dangerous_chars "$domain"; then
    error "Domain contains characters that indicate injection attempts: $DANGEROUS_CHARS"
    return 1
  fi

  return 0
}

# Check if hostname is a reserved/internal IP or pattern
is_not_reserved_ip() {
  local domain="$1"
  local lower_domain="${domain,,}"

  # Check against reserved IP list
  local reserved_ip
  for reserved_ip in "${RESERVED_IPS[@]}"; do
    if [[ "$lower_domain" == "$reserved_ip" ]]; then
      error "Domain resolves to reserved/internal IP: $reserved_ip (SSRF protection)"
      return 1
    fi
  done

  # Additional pattern checks for localhost variants
  if [[ "$lower_domain" =~ ^(localhost|localhost\..+|0\.0\.0\.0)$ ]]; then
    error "Domain is localhost variant (SSRF protection)"
    return 1
  fi

  # Check for IPv4 addresses (domains should not be IPs)
  if [[ "$lower_domain" =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
    error "Domain appears to be IPv4 address (not allowed)"
    return 1
  fi

  # Check for IPv6 addresses
  if [[ "$lower_domain" =~ \: ]]; then
    error "Domain appears to be IPv6 address (not allowed)"
    return 1
  fi

  return 0
}

# Verify domain resolves via DNS (optional)
check_dns_resolution() {
  local domain="$1"

  # Check if dig/nslookup/getent available
  if ! command -v dig &>/dev/null && \
     ! command -v nslookup &>/dev/null && \
     ! command -v getent &>/dev/null; then
    # DNS tools not available, skip check (not a failure)
    return 0
  fi

  # Try dig first (most reliable)
  if command -v dig &>/dev/null; then
    if ! dig +short "$domain" @8.8.8.8 &>/dev/null | grep -q '[^[:space:]]'; then
      error "Domain does not resolve via DNS: $domain"
      return 1
    fi
    return 0
  fi

  # Fall back to nslookup
  if command -v nslookup &>/dev/null; then
    if ! nslookup "$domain" 8.8.8.8 &>/dev/null; then
      error "Domain does not resolve via DNS: $domain"
      return 1
    fi
    return 0
  fi

  # Fall back to getent
  if command -v getent &>/dev/null; then
    if ! getent hosts "$domain" &>/dev/null; then
      error "Domain does not resolve via DNS: $domain"
      return 1
    fi
    return 0
  fi

  return 0
}

# ============================================================================
# MAIN
# ============================================================================

main() {
  local domain="${1:-}"
  local check_dns="${2:-}"

  # Validate arguments
  if [[ -z "$domain" ]]; then
    error "Usage: $0 <domain> [--check-dns]"
    return 1
  fi

  # Normalize domain to lowercase
  domain="${domain,,}"

  # Remove trailing dot (valid in DNS but we normalize)
  domain="${domain%.}"

  # Run validation checks
  is_valid_format "$domain" || return 1
  is_safe_chars "$domain" || return 1
  is_not_reserved_ip "$domain" || return 1

  # Optional DNS check
  if [[ "$check_dns" == "--check-dns" ]]; then
    check_dns_resolution "$domain" || return 1
  fi

  # All checks passed
  echo "OK: Domain is valid: $domain"
  return 0
}

main "$@"
