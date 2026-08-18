#!/usr/bin/env bash
# ==============================================================================
# Encrypt .env File using Age Encryption
# ==============================================================================
#
# Purpose: Encrypt .env file containing sensitive credentials
#
# Features:
# - Age encryption (simple, no cloud dependencies)
# - Automatic key generation if missing
# - Metadata header (timestamp, key fingerprint)
# - Atomic write operations (prevents corruption)
# - Proper error handling
#
# Usage:
#   ./scripts/security/encrypt-env.sh                  # Encrypt docker/trigger-dev/.env
#   ./scripts/security/encrypt-env.sh /path/to/.env   # Encrypt custom .env file
#
# Requirements:
#   - age encryption tool: https://github.com/FiloSottile/age
#   - Install: brew install age (macOS) or apt-get install age (Linux)
#
# Returns:
#   0 - Success
#   1 - Missing age tool
#   2 - Key file not found (and not generated)
#   3 - .env file not found
#   4 - Encryption failed
#   5 - Key fingerprint extraction failed
#
# ==============================================================================

set -euo pipefail

# ==============================================================================
# Configuration
# ==============================================================================

# Default .env path
ENV_FILE="${1:-docker/trigger-dev/.env}"
ENV_ENCRYPTED="${ENV_FILE}.encrypted"

# Age key location
AGE_KEY_DIR="${HOME}/.age"
AGE_KEY_FILE="${AGE_KEY_DIR}/key.txt"

# Backup location
BACKUP_DIR=".backups/encryption"
BACKUP_FILE=""

# ==============================================================================
# Logging Functions
# ==============================================================================

log_step() {
  echo "[ENCRYPT] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
}

log_error() {
  echo "[ENCRYPT ERROR] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
}

log_success() {
  echo "[ENCRYPT SUCCESS] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
}

log_debug() {
  if [[ "${DEBUG:-false}" == "true" ]]; then
    echo "[ENCRYPT DEBUG] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
  fi
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

  log_step "Age encryption tool found: $(age --version)"
  return 0
}

check_env_file_exists() {
  if [[ ! -f "$ENV_FILE" ]]; then
    log_error ".env file not found: $ENV_FILE"
    return 3
  fi

  log_step "Found .env file: $ENV_FILE ($(wc -l < "$ENV_FILE") lines)"
  return 0
}

generate_age_key() {
  log_step "Age key not found at $AGE_KEY_FILE"
  log_step "Generating new age key..."

  # Create directory if needed
  if [[ ! -d "$AGE_KEY_DIR" ]]; then
    mkdir -p "$AGE_KEY_DIR"
    chmod 700 "$AGE_KEY_DIR"
    log_step "Created age key directory: $AGE_KEY_DIR"
  fi

  # Generate key (prints to stdout)
  if ! age-keygen -o "$AGE_KEY_FILE" 2>/dev/null; then
    log_error "Failed to generate age key"
    return 2
  fi

  # Set restrictive permissions
  chmod 600 "$AGE_KEY_FILE"
  log_success "Generated new age key: $AGE_KEY_FILE"
  log_step "Key is restricted to owner only (chmod 600)"

  return 0
}

ensure_age_key() {
  if [[ ! -f "$AGE_KEY_FILE" ]]; then
    if ! generate_age_key; then
      return 2
    fi
  else
    log_step "Using existing age key: $AGE_KEY_FILE"
  fi

  # Verify key is readable
  if [[ ! -r "$AGE_KEY_FILE" ]]; then
    log_error "Age key file is not readable: $AGE_KEY_FILE"
    return 2
  fi

  return 0
}

get_age_public_key() {
  # Extract public key from private key file
  # Format: "age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  local public_key
  public_key=$(age-keygen -y "$AGE_KEY_FILE" 2>/dev/null || true)

  if [[ -z "$public_key" ]]; then
    log_error "Failed to extract age public key"
    return 5
  fi

  echo "$public_key"
  return 0
}

create_backup() {
  log_step "Creating backup of unencrypted .env file"

  # Create backup directory
  if [[ ! -d "$BACKUP_DIR" ]]; then
    mkdir -p "$BACKUP_DIR"
  fi

  # Create timestamped backup
  local timestamp
  timestamp=$(date +%Y%m%d-%H%M%S)
  local hash
  hash=$(md5sum "$ENV_FILE" | awk '{print $1}' | cut -c1-8)

  BACKUP_FILE="${BACKUP_DIR}/${timestamp}_${hash}.env.backup"

  if ! cp "$ENV_FILE" "$BACKUP_FILE"; then
    log_error "Failed to create backup: $BACKUP_FILE"
    return 1
  fi

  chmod 600 "$BACKUP_FILE"
  log_step "Backup created: $BACKUP_FILE"
  log_step "Keep this backup SECURE - it contains unencrypted credentials"

  return 0
}

create_metadata_header() {
  local public_key
  public_key=$(get_age_public_key) || return 5

  local timestamp
  timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')

  # Create header with metadata
  cat << EOF
# ==============================================================================
# Encrypted Credential File - DO NOT EDIT MANUALLY
# ==============================================================================
# This file is encrypted using age encryption: https://github.com/FiloSottile/age
#
# Encryption Metadata:
# - Tool: age
# - Encrypted at: $timestamp
# - Public key (fingerprint): ${public_key:0:20}...${public_key: -10}
# - Original file: $ENV_FILE
#
# To decrypt:
#   ./scripts/security/decrypt-env.sh .env.encrypted
#   (requires AGE_KEY at $AGE_KEY_FILE)
#
# ==============================================================================

EOF
}

encrypt_file() {
  log_step "Encrypting .env file..."

  # Verify age key exists and is readable
  if [[ ! -r "$AGE_KEY_FILE" ]]; then
    log_error "Age key is not readable: $AGE_KEY_FILE"
    return 2
  fi

  # Create temporary file for encrypted content
  local temp_encrypted
  temp_encrypted=$(mktemp)
  trap "rm -f $temp_encrypted" RETURN

  # Create header
  if ! create_metadata_header >> "$temp_encrypted" 2>/dev/null; then
    log_error "Failed to create metadata header"
    rm -f "$temp_encrypted"
    return 4
  fi

  # Encrypt .env content and append
  if ! age -R <(age-keygen -y "$AGE_KEY_FILE") "$ENV_FILE" >> "$temp_encrypted" 2>/dev/null; then
    log_error "Age encryption failed"
    rm -f "$temp_encrypted"
    return 4
  fi

  # Atomic write to final location
  if ! mv "$temp_encrypted" "$ENV_ENCRYPTED"; then
    log_error "Failed to write encrypted file: $ENV_ENCRYPTED"
    rm -f "$temp_encrypted"
    return 4
  fi

  # Set restrictive permissions
  chmod 600 "$ENV_ENCRYPTED"

  log_success "Encryption complete: $ENV_ENCRYPTED"
  return 0
}

# ==============================================================================
# Cleanup
# ==============================================================================

cleanup() {
  local exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    log_step "Encryption completed successfully"
    log_step ""
    log_step "Encrypted file: $ENV_ENCRYPTED"
    log_step "Backup file: $BACKUP_FILE"
    log_step "Key location: $AGE_KEY_FILE"
    log_step ""
    log_step "Next steps:"
    log_step "1. Add $ENV_ENCRYPTED to git (encrypted credentials)"
    log_step "2. Add $AGE_KEY_FILE to .gitignore (private key)"
    log_step "3. Distribute $AGE_KEY_FILE securely to team (e.g., 1Password, HashiCorp Vault)"
    log_step "4. On other machines, run: decrypt-env.sh $ENV_ENCRYPTED"
  else
    log_error "Encryption failed with exit code: $exit_code"
  fi

  return $exit_code
}

trap cleanup EXIT

# ==============================================================================
# Main Execution Flow
# ==============================================================================

main() {
  log_step "==================================================================="
  log_step "Encrypt .env File using Age Encryption"
  log_step "==================================================================="
  log_step ""

  # Check age tool installed
  if ! check_age_installed; then
    return 1
  fi

  # Check .env file exists
  if ! check_env_file_exists; then
    return 3
  fi

  # Ensure age key exists (generate if needed)
  if ! ensure_age_key; then
    return 2
  fi

  # Create backup before encryption
  if ! create_backup; then
    log_error "Backup creation failed - aborting encryption"
    return 1
  fi

  # Encrypt the file
  if ! encrypt_file; then
    return 4
  fi

  log_step ""
  log_step "Encryption successful!"

  return 0
}

main "$@"
