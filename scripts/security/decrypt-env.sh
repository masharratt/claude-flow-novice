#!/usr/bin/env bash
# ==============================================================================
# Decrypt Encrypted .env File
# ==============================================================================
#
# Purpose: Decrypt age-encrypted .env file to temporary location
#
# Features:
# - Age decryption (supports age private key)
# - Automatic key lookup (~/.age/key.txt)
# - Restrictive permissions on decrypted file (600)
# - Automatic cleanup on script exit (signals: INT, TERM, EXIT)
# - Metadata extraction and validation
# - Explicit decryption confirmation
#
# Usage:
#   # Decrypt to temporary location with auto-cleanup
#   source ./scripts/security/decrypt-env.sh docker/trigger-dev/.env.encrypted
#
#   # Use decrypted file in current session
#   source .env
#
#   # Cleanup on exit (automatic)
#   exit
#
# Environment Variables:
#   AGE_KEY_FILE - Path to age private key (default: ~/.age/key.txt)
#   DEBUG - Enable debug logging
#
# Returns:
#   0 - Success
#   1 - Missing age tool
#   2 - Key file not found
#   3 - Encrypted file not found
#   4 - Decryption failed
#   5 - Metadata validation failed
#
# Creates:
#   $DECRYPTED_ENV_FILE - Temporary decrypted .env file (auto-cleaned)
#
# ==============================================================================

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

# Encrypted .env file
ENCRYPTED_FILE="${1:-docker/trigger-dev/.env.encrypted}"

# Age key location
AGE_KEY_FILE="${AGE_KEY_FILE:-${HOME}/.age/key.txt}"

# Decrypted output
DECRYPTED_ENV_FILE=""
TEMP_DIR=""

# ==============================================================================
# Logging Functions
# ==============================================================================

log_step() {
  echo "[DECRYPT] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
}

log_error() {
  echo "[DECRYPT ERROR] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
}

log_success() {
  echo "[DECRYPT SUCCESS] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
}

log_debug() {
  if [[ "${DEBUG:-false}" == "true" ]]; then
    echo "[DECRYPT DEBUG] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
  fi
}

log_warning() {
  echo "[DECRYPT WARNING] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
}

# ==============================================================================
# Utility Functions
# ==============================================================================

check_age_installed() {
  if ! command -v age &> /dev/null; then
    log_error "age encryption tool is not installed"
    log_error "Install via: brew install age (macOS) or apt-get install age (Linux)"
    log_error "See: https://github.com/FiloSottile/age"
    return 1
  fi

  log_debug "Age encryption tool found: $(age --version)"
  return 0
}

check_encrypted_file_exists() {
  if [[ ! -f "$ENCRYPTED_FILE" ]]; then
    log_error "Encrypted file not found: $ENCRYPTED_FILE"
    return 3
  fi

  log_step "Found encrypted file: $ENCRYPTED_FILE ($(wc -l < "$ENCRYPTED_FILE") lines)"
  return 0
}

check_key_file_exists() {
  if [[ ! -f "$AGE_KEY_FILE" ]]; then
    log_error "Age private key not found: $AGE_KEY_FILE"
    log_error "Expected location: $AGE_KEY_FILE"
    log_error "Generate with: age-keygen -o ~/.age/key.txt"
    return 2
  fi

  log_step "Using age private key: $AGE_KEY_FILE"

  # Verify key permissions (should be 600)
  local perms
  perms=$(stat -c %a "$AGE_KEY_FILE" 2>/dev/null || stat -f %A "$AGE_KEY_FILE" 2>/dev/null || echo "unknown")
  if [[ "$perms" != "600" ]]; then
    log_warning "Age key has permissive permissions ($perms) - fixing to 600"
    chmod 600 "$AGE_KEY_FILE"
  fi

  return 0
}

extract_metadata() {
  log_step "Extracting metadata from encrypted file..."

  # Extract metadata lines (between # comments at start)
  local encrypted_at
  local public_key

  encrypted_at=$(grep "^# - Encrypted at:" "$ENCRYPTED_FILE" | cut -d: -f2- | xargs || echo "unknown")
  public_key=$(grep "^# - Public key" "$ENCRYPTED_FILE" | grep -oP 'age1[a-z0-9]{50,}' || echo "unknown")

  log_debug "Metadata - Encrypted at: $encrypted_at"
  log_debug "Metadata - Public key (fingerprint): ${public_key:0:20}...${public_key: -10}"

  return 0
}

setup_temp_dir() {
  log_step "Setting up temporary directory for decrypted file..."

  # Create secure temporary directory
  TEMP_DIR=$(mktemp -d -t age-decrypt.XXXXXX)
  chmod 700 "$TEMP_DIR"

  DECRYPTED_ENV_FILE="${TEMP_DIR}/.env.decrypted"

  log_step "Temporary directory: $TEMP_DIR"
  log_debug "Decrypted file location: $DECRYPTED_ENV_FILE"

  return 0
}

decrypt_file() {
  log_step "Decrypting file..."

  # Extract encrypted content (everything after metadata block)
  # Encrypted content starts with "age-encryption.org/v1" marker
  local temp_encrypted
  temp_encrypted=$(mktemp)
  trap "rm -f $temp_encrypted" RETURN

  # Extract only the encrypted payload (skip metadata header)
  if ! sed -n '/^-----BEGIN AGE ENCRYPTED FILE-----/,/^-----END AGE ENCRYPTED FILE-----/p' "$ENCRYPTED_FILE" > "$temp_encrypted" 2>/dev/null; then
    # Alternative: extract everything after last comment line
    if ! awk '/^[^#]/ {flag=1} flag' "$ENCRYPTED_FILE" > "$temp_encrypted" 2>/dev/null; then
      log_error "Failed to extract encrypted payload from file"
      return 4
    fi
  fi

  log_debug "Encrypted payload extracted: $(wc -c < "$temp_encrypted") bytes"

  # Decrypt using age
  if ! age -d -i "$AGE_KEY_FILE" "$temp_encrypted" > "$DECRYPTED_ENV_FILE" 2>/dev/null; then
    log_error "Age decryption failed"
    log_error "Possible causes:"
    log_error "  1. Wrong age private key"
    log_error "  2. Corrupted encrypted file"
    log_error "  3. File was encrypted with different key"
    rm -f "$temp_encrypted" "$DECRYPTED_ENV_FILE"
    return 4
  fi

  # Verify decryption produced output
  if [[ ! -s "$DECRYPTED_ENV_FILE" ]]; then
    log_error "Decrypted file is empty"
    rm -f "$temp_encrypted" "$DECRYPTED_ENV_FILE"
    return 4
  fi

  # Set restrictive permissions
  chmod 600 "$DECRYPTED_ENV_FILE"

  log_success "Decryption successful: $DECRYPTED_ENV_FILE"
  log_step "Decrypted file size: $(wc -c < "$DECRYPTED_ENV_FILE") bytes"

  return 0
}

validate_decrypted_content() {
  log_step "Validating decrypted content..."

  # Check for expected .env format (KEY=VALUE lines)
  local env_lines
  env_lines=$(grep -c "^[A-Z_][A-Z0-9_]*=" "$DECRYPTED_ENV_FILE" || echo "0")

  if [[ "$env_lines" -lt 5 ]]; then
    log_warning "Decrypted file has few environment variables ($env_lines lines)"
    log_warning "This might indicate a decryption failure"
  fi

  log_step "Found $env_lines environment variable definitions"
  log_debug "First few lines:"
  head -3 "$DECRYPTED_ENV_FILE" | sed 's/=.*/=[REDACTED]/g' | sed 's/^/  /' >&2

  return 0
}

# ==============================================================================
# Cleanup
# ==============================================================================

cleanup_on_exit() {
  local exit_code=$?

  if [[ -n "$TEMP_DIR" ]] && [[ -d "$TEMP_DIR" ]]; then
    log_step "Cleaning up temporary files..."

    # Securely wipe sensitive content before deleting
    if [[ -f "$DECRYPTED_ENV_FILE" ]]; then
      # Overwrite with random data before deletion (best-effort security)
      if command -v shred &> /dev/null; then
        shred -vfz -n 3 "$DECRYPTED_ENV_FILE" 2>/dev/null || true
        log_debug "Securely wiped with shred"
      elif command -v dd &> /dev/null; then
        dd if=/dev/urandom of="$DECRYPTED_ENV_FILE" bs=1 count=$(stat -c%s "$DECRYPTED_ENV_FILE" 2>/dev/null || stat -f%z "$DECRYPTED_ENV_FILE" 2>/dev/null || echo 0) 2>/dev/null || true
        log_debug "Securely wiped with dd"
      fi
      rm -f "$DECRYPTED_ENV_FILE"
    fi

    rm -rf "$TEMP_DIR"
    log_step "Temporary directory cleaned: $TEMP_DIR"
  fi

  if [[ $exit_code -eq 0 ]]; then
    log_success "Decryption completed successfully"
  else
    log_error "Decryption failed with exit code: $exit_code"
  fi

  return $exit_code
}

# Register cleanup for all exit scenarios
trap cleanup_on_exit EXIT INT TERM

# ==============================================================================
# Main Execution Flow
# ==============================================================================

main() {
  log_step "==================================================================="
  log_step "Decrypt Age-Encrypted .env File"
  log_step "==================================================================="
  log_step ""

  # Check age tool installed
  if ! check_age_installed; then
    return 1
  fi

  # Check encrypted file exists
  if ! check_encrypted_file_exists; then
    return 3
  fi

  # Check key file exists
  if ! check_key_file_exists; then
    return 2
  fi

  # Extract and display metadata
  if ! extract_metadata; then
    return 5
  fi

  # Setup temporary directory
  if ! setup_temp_dir; then
    return 1
  fi

  # Decrypt the file
  if ! decrypt_file; then
    return 4
  fi

  # Validate decrypted content
  if ! validate_decrypted_content; then
    return 5
  fi

  log_step ""
  log_step "Decryption successful!"
  log_step ""
  log_step "Decrypted .env file: $DECRYPTED_ENV_FILE"
  log_step "Auto-cleanup: on script exit (via trap)"
  log_step ""
  log_step "To use the decrypted credentials:"
  log_step "  source $DECRYPTED_ENV_FILE"
  log_step "  (credentials available in current shell session)"

  # Export the decrypted file path for parent shell
  export DECRYPTED_ENV_FILE
  echo "$DECRYPTED_ENV_FILE"

  return 0
}

main "$@"
