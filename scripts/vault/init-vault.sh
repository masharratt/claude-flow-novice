#!/bin/bash
# scripts/vault/init-vault.sh
# Part of IMPL-001 Security Hardening - Stream 1
# Initialize HashiCorp Vault and create root token

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
VAULT_TOKEN_FILE="${VAULT_TOKEN_FILE:-$PROJECT_ROOT/.vault-token}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

check_vault_available() {
    log_info "Checking Vault availability at $VAULT_ADDR..."

    if ! command -v vault &> /dev/null; then
        log_error "Vault CLI not found. Installing..."
        install_vault_cli
    fi

    local retries=0
    local max_retries=30

    while [ $retries -lt $max_retries ]; do
        if vault status -address="$VAULT_ADDR" &>/dev/null || [ $? -eq 2 ]; then
            log_success "Vault is available"
            return 0
        fi

        retries=$((retries + 1))
        log_info "Waiting for Vault to start... ($retries/$max_retries)"
        sleep 2
    done

    log_error "Vault not available after $max_retries attempts"
    return 1
}

install_vault_cli() {
    log_info "Installing Vault CLI..."

    # Detect OS
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        local OS="linux"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        local OS="darwin"
    else
        log_error "Unsupported OS: $OSTYPE"
        return 1
    fi

    # Detect architecture
    local ARCH=$(uname -m)
    case "$ARCH" in
        x86_64)
            ARCH="amd64"
            ;;
        aarch64|arm64)
            ARCH="arm64"
            ;;
        *)
            log_error "Unsupported architecture: $ARCH"
            return 1
            ;;
    esac

    local VAULT_VERSION="1.15.4"
    local DOWNLOAD_URL="https://releases.hashicorp.com/vault/${VAULT_VERSION}/vault_${VAULT_VERSION}_${OS}_${ARCH}.zip"

    log_info "Downloading Vault CLI from $DOWNLOAD_URL..."

    local TEMP_DIR=$(mktemp -d)
    trap "rm -rf $TEMP_DIR" EXIT

    cd "$TEMP_DIR"
    curl -sS -o vault.zip "$DOWNLOAD_URL"
    unzip -q vault.zip

    # Install to user bin directory
    mkdir -p "$HOME/.local/bin"
    mv vault "$HOME/.local/bin/"
    chmod +x "$HOME/.local/bin/vault"

    # Add to PATH if not already there
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        export PATH="$HOME/.local/bin:$PATH"
        log_warning "Added $HOME/.local/bin to PATH for this session"
        log_warning "Add to your shell profile: export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi

    log_success "Vault CLI installed to $HOME/.local/bin/vault"
}

initialize_vault() {
    log_info "Initializing Vault..."

    export VAULT_ADDR

    # Check if already initialized
    local status_output
    status_output=$(vault status -format=json 2>/dev/null || echo '{}')

    local initialized=$(echo "$status_output" | grep -o '"initialized":[^,}]*' | cut -d: -f2 | tr -d ' ')

    if [ "$initialized" = "true" ]; then
        log_info "Vault is already initialized"

        # Check if we have a token
        if [ -f "$VAULT_TOKEN_FILE" ]; then
            export VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
            log_success "Using existing token from $VAULT_TOKEN_FILE"
            return 0
        else
            log_error "Vault is initialized but no token found at $VAULT_TOKEN_FILE"
            log_error "If running in dev mode, set VAULT_DEV_ROOT_TOKEN_ID in .env"
            return 1
        fi
    fi

    # Initialize Vault (production mode)
    log_info "Performing initial Vault setup..."

    local init_output
    init_output=$(vault operator init -format=json -key-shares=5 -key-threshold=3)

    # Extract unseal keys and root token
    local unseal_key_1=$(echo "$init_output" | jq -r '.unseal_keys_b64[0]')
    local unseal_key_2=$(echo "$init_output" | jq -r '.unseal_keys_b64[1]')
    local unseal_key_3=$(echo "$init_output" | jq -r '.unseal_keys_b64[2]')
    local root_token=$(echo "$init_output" | jq -r '.root_token')

    # Save credentials securely (dev mode only - use proper secrets management in production)
    local creds_file="$PROJECT_ROOT/.vault-credentials.json"
    echo "$init_output" > "$creds_file"
    chmod 600 "$creds_file"

    log_success "Vault initialized. Credentials saved to $creds_file"
    log_warning "IMPORTANT: Back up these credentials securely and remove from disk"

    # Unseal Vault
    log_info "Unsealing Vault..."
    vault operator unseal "$unseal_key_1" >/dev/null
    vault operator unseal "$unseal_key_2" >/dev/null
    vault operator unseal "$unseal_key_3" >/dev/null

    log_success "Vault unsealed"

    # Save root token
    echo "$root_token" > "$VAULT_TOKEN_FILE"
    chmod 600 "$VAULT_TOKEN_FILE"

    export VAULT_TOKEN="$root_token"

    log_success "Root token saved to $VAULT_TOKEN_FILE"
}

enable_audit_logging() {
    log_info "Enabling audit logging..."

    export VAULT_ADDR VAULT_TOKEN

    # Check if audit already enabled
    if vault audit list 2>/dev/null | grep -q "file/"; then
        log_info "Audit logging already enabled"
        return 0
    fi

    # Enable file audit backend
    vault audit enable file file_path=/vault/audit/audit.log

    log_success "Audit logging enabled"
}

configure_dev_mode() {
    log_info "Configuring Vault in dev mode..."

    # In dev mode, Vault is already initialized and unsealed
    local dev_token="${VAULT_DEV_ROOT_TOKEN_ID:-dev-root-token}"

    echo "$dev_token" > "$VAULT_TOKEN_FILE"
    chmod 600 "$VAULT_TOKEN_FILE"

    export VAULT_TOKEN="$dev_token"
    export VAULT_ADDR

    log_success "Dev mode token saved to $VAULT_TOKEN_FILE"
}

main() {
    log_info "Starting Vault initialization..."
    log_info "Vault address: $VAULT_ADDR"

    # Check Vault availability
    check_vault_available

    # Determine if running in dev mode
    local is_dev_mode=false
    if docker ps --format '{{.Command}}' | grep -q "server -dev"; then
        is_dev_mode=true
        log_info "Detected dev mode Vault"
    fi

    if [ "$is_dev_mode" = true ]; then
        configure_dev_mode
    else
        initialize_vault
        enable_audit_logging
    fi

    # Verify authentication
    log_info "Verifying authentication..."
    if vault token lookup >/dev/null 2>&1; then
        log_success "Authentication successful"
    else
        log_error "Authentication failed"
        return 1
    fi

    log_success "Vault initialization complete"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Run: scripts/vault/setup-secrets-engine.sh"
    log_info "  2. Run: scripts/vault/create-policies.sh"
    log_info "  3. Run: scripts/vault/secrets-fetch.sh"
    log_info ""
    log_info "To use Vault CLI:"
    log_info "  export VAULT_ADDR=$VAULT_ADDR"
    log_info "  export VAULT_TOKEN=\$(cat $VAULT_TOKEN_FILE)"
}

main "$@"
