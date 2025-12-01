#!/bin/bash
# scripts/vault/setup-secrets-engine.sh
# Part of IMPL-001 Security Hardening - Stream 1
# Configure KV v2 and Transit secrets engines

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
VAULT_TOKEN_FILE="${VAULT_TOKEN_FILE:-$PROJECT_ROOT/.vault-token}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

check_auth() {
    if [ ! -f "$VAULT_TOKEN_FILE" ]; then
        log_error "Vault token not found at $VAULT_TOKEN_FILE"
        log_error "Run: scripts/vault/init-vault.sh first"
        return 1
    fi

    export VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")
    export VAULT_ADDR

    if ! vault token lookup >/dev/null 2>&1; then
        log_error "Invalid or expired Vault token"
        return 1
    fi

    log_success "Authenticated with Vault"
}

enable_kv_engine() {
    log_info "Enabling KV v2 secrets engine..."

    # Check if already enabled
    if vault secrets list -format=json | jq -e '.["secret/"]' >/dev/null 2>&1; then
        log_info "KV v2 engine already enabled at secret/"
        return 0
    fi

    # Enable KV v2 engine
    vault secrets enable -version=2 -path=secret kv

    # Configure max versions
    vault write secret/config max_versions=10

    log_success "KV v2 secrets engine enabled at secret/"
}

enable_transit_engine() {
    log_info "Enabling Transit secrets engine..."

    # Check if already enabled
    if vault secrets list -format=json | jq -e '.["transit/"]' >/dev/null 2>&1; then
        log_info "Transit engine already enabled at transit/"
        return 0
    fi

    # Enable Transit engine
    vault secrets enable transit

    log_success "Transit secrets engine enabled at transit/"
}

create_encryption_keys() {
    log_info "Creating encryption keys..."

    # Main encryption key for sensitive data
    if ! vault list transit/keys 2>/dev/null | grep -q "cfn-encryption-key"; then
        vault write -f transit/keys/cfn-encryption-key \
            type=aes256-gcm96 \
            exportable=false \
            allow_plaintext_backup=false \
            deletion_allowed=false

        log_success "Created encryption key: cfn-encryption-key"
    else
        log_info "Encryption key already exists: cfn-encryption-key"
    fi

    # Key for API tokens
    if ! vault list transit/keys 2>/dev/null | grep -q "cfn-api-token-key"; then
        vault write -f transit/keys/cfn-api-token-key \
            type=aes256-gcm96 \
            exportable=false \
            allow_plaintext_backup=false \
            deletion_allowed=false

        log_success "Created encryption key: cfn-api-token-key"
    else
        log_info "Encryption key already exists: cfn-api-token-key"
    fi

    # Signing key for JWTs
    if ! vault list transit/keys 2>/dev/null | grep -q "cfn-jwt-signing-key"; then
        vault write -f transit/keys/cfn-jwt-signing-key \
            type=ecdsa-p256 \
            exportable=false \
            allow_plaintext_backup=false \
            deletion_allowed=false

        log_success "Created signing key: cfn-jwt-signing-key"
    else
        log_info "Signing key already exists: cfn-jwt-signing-key"
    fi
}

setup_default_secrets() {
    log_info "Setting up default secret structure..."

    # API keys structure
    vault kv put secret/api-keys/anthropic \
        key="[REDACTED]" \
        provider="anthropic" \
        tier="production" \
        created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        rotation_days=90 || log_warning "Failed to create anthropic key placeholder"

    vault kv put secret/api-keys/openai \
        key="[REDACTED]" \
        provider="openai" \
        tier="production" \
        created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        rotation_days=90 || log_warning "Failed to create openai key placeholder"

    vault kv put secret/api-keys/zai \
        key="[REDACTED]" \
        provider="zai" \
        tier="cost-optimized" \
        created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        rotation_days=90 || log_warning "Failed to create zai key placeholder"

    # Database credentials
    vault kv put secret/database/postgres \
        username="cfn_user" \
        password="[REDACTED]" \
        host="postgres" \
        port=5432 \
        database="cfn_loop" \
        ssl_mode="require" \
        rotation_days=30 || log_warning "Failed to create postgres credentials"

    vault kv put secret/database/redis \
        password="[REDACTED]" \
        host="redis" \
        port=6379 \
        tls_enabled=true \
        rotation_days=30 || log_warning "Failed to create redis credentials"

    # JWT secrets
    vault kv put secret/auth/jwt \
        secret="[REDACTED]" \
        algorithm="ES256" \
        expiry_hours=24 \
        issuer="cfn-platform" \
        rotation_days=90 || log_warning "Failed to create JWT secret"

    # Webhook secrets
    vault kv put secret/webhooks/github \
        secret="[REDACTED]" \
        created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        rotation_days=180 || log_warning "Failed to create github webhook secret"

    # Certificates (placeholders)
    vault kv put secret/certs/tls \
        cert="[REDACTED]" \
        key="[REDACTED]" \
        ca="[REDACTED]" \
        expiry="$(date -u -d '+1 year' +%Y-%m-%dT%H:%M:%SZ)" \
        rotation_days=30 || log_warning "Failed to create TLS cert placeholders"

    log_success "Default secret structure created"
    log_warning "IMPORTANT: Replace [REDACTED] placeholders with real secrets"
}

configure_secret_metadata() {
    log_info "Configuring secret metadata and policies..."

    # Set up metadata for tracking
    vault kv metadata put secret/api-keys/anthropic \
        max_versions=10 \
        delete_version_after=0 \
        custom_metadata='{"team":"platform","cost_center":"engineering","compliance":"pci"}' \
        2>/dev/null || log_info "Metadata already configured"

    vault kv metadata put secret/database/postgres \
        max_versions=5 \
        delete_version_after=0 \
        custom_metadata='{"team":"backend","cost_center":"engineering","compliance":"soc2"}' \
        2>/dev/null || log_info "Metadata already configured"

    log_success "Secret metadata configured"
}

display_summary() {
    log_info ""
    log_info "Secrets Engine Summary:"
    log_info "======================="
    log_info ""

    # List secrets engines
    log_info "Enabled secrets engines:"
    vault secrets list -format=table

    log_info ""
    log_info "KV v2 secrets:"
    vault kv list secret/ 2>/dev/null || log_warning "No secrets created yet"

    log_info ""
    log_info "Transit encryption keys:"
    vault list transit/keys 2>/dev/null || log_warning "No encryption keys created yet"

    log_info ""
    log_info "Next steps:"
    log_info "  1. Update [REDACTED] placeholders with real secrets"
    log_info "  2. Run: scripts/vault/create-policies.sh"
    log_info "  3. Run: scripts/vault/secrets-fetch.sh"
    log_info ""
}

main() {
    log_info "Setting up Vault secrets engines..."

    # Authenticate
    check_auth

    # Enable engines
    enable_kv_engine
    enable_transit_engine

    # Create encryption keys
    create_encryption_keys

    # Setup default structure
    setup_default_secrets

    # Configure metadata
    configure_secret_metadata

    # Display summary
    display_summary

    log_success "Secrets engines setup complete"
}

main "$@"
