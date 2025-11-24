#!/bin/bash
# scripts/vault/create-policies.sh
# Part of IMPL-001 Security Hardening - Stream 1
# Create team isolation policies for Vault

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

create_admin_policy() {
    log_info "Creating admin policy..."

    cat > /tmp/cfn-admin-policy.hcl <<'EOF'
# Admin policy - Full access to all secrets and system operations
# Use: Platform administrators, SRE team

# Full access to secrets
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Full access to transit engine
path "transit/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Manage auth methods
path "auth/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# Manage policies
path "sys/policies/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Manage audit backends
path "sys/audit" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

path "sys/audit/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# System health and metrics
path "sys/health" {
  capabilities = ["read"]
}

path "sys/metrics" {
  capabilities = ["read"]
}

# Seal/unseal operations
path "sys/seal" {
  capabilities = ["update", "sudo"]
}

path "sys/unseal" {
  capabilities = ["update"]
}
EOF

    vault policy write cfn-admin /tmp/cfn-admin-policy.hcl
    rm /tmp/cfn-admin-policy.hcl

    log_success "Admin policy created"
}

create_backend_team_policy() {
    log_info "Creating backend team policy..."

    cat > /tmp/cfn-backend-policy.hcl <<'EOF'
# Backend team policy - Database credentials and API keys
# Use: Backend developers, microservices

# Read database credentials
path "secret/data/database/*" {
  capabilities = ["read", "list"]
}

# Read API keys for backend services
path "secret/data/api-keys/openai" {
  capabilities = ["read"]
}

path "secret/data/api-keys/anthropic" {
  capabilities = ["read"]
}

path "secret/data/api-keys/zai" {
  capabilities = ["read"]
}

# Read JWT secrets
path "secret/data/auth/jwt" {
  capabilities = ["read"]
}

# Use transit encryption
path "transit/encrypt/cfn-encryption-key" {
  capabilities = ["update"]
}

path "transit/decrypt/cfn-encryption-key" {
  capabilities = ["update"]
}

# Read-only access to metadata
path "secret/metadata/*" {
  capabilities = ["read", "list"]
}
EOF

    vault policy write cfn-backend-team /tmp/cfn-backend-policy.hcl
    rm /tmp/cfn-backend-policy.hcl

    log_success "Backend team policy created"
}

create_frontend_team_policy() {
    log_info "Creating frontend team policy..."

    cat > /tmp/cfn-frontend-policy.hcl <<'EOF'
# Frontend team policy - Limited access to public API keys
# Use: Frontend developers, UI team

# Read public API keys only (no sensitive backend keys)
path "secret/data/api-keys/stripe" {
  capabilities = ["read"]
}

path "secret/data/api-keys/analytics" {
  capabilities = ["read"]
}

# Read webhook secrets for client-side validation
path "secret/data/webhooks/github" {
  capabilities = ["read"]
}

# Read-only access to metadata
path "secret/metadata/*" {
  capabilities = ["read", "list"]
}
EOF

    vault policy write cfn-frontend-team /tmp/cfn-frontend-policy.hcl
    rm /tmp/cfn-frontend-policy.hcl

    log_success "Frontend team policy created"
}

create_devops_team_policy() {
    log_info "Creating DevOps team policy..."

    cat > /tmp/cfn-devops-policy.hcl <<'EOF'
# DevOps team policy - Infrastructure and deployment credentials
# Use: DevOps engineers, CI/CD pipelines

# Full access to infrastructure secrets
path "secret/data/infrastructure/*" {
  capabilities = ["create", "read", "update", "list"]
}

# Read database credentials for backup/maintenance
path "secret/data/database/*" {
  capabilities = ["read", "list"]
}

# Read TLS certificates
path "secret/data/certs/*" {
  capabilities = ["read", "list"]
}

# Rotate API keys
path "secret/data/api-keys/*" {
  capabilities = ["create", "read", "update"]
}

# Use transit encryption
path "transit/encrypt/*" {
  capabilities = ["update"]
}

path "transit/decrypt/*" {
  capabilities = ["update"]
}

# Manage encryption keys (rotate)
path "transit/keys/*" {
  capabilities = ["read", "list"]
}

path "transit/keys/*/rotate" {
  capabilities = ["update"]
}

# Read audit logs
path "sys/audit" {
  capabilities = ["read", "list"]
}

# System health monitoring
path "sys/health" {
  capabilities = ["read"]
}

path "sys/metrics" {
  capabilities = ["read"]
}
EOF

    vault policy write cfn-devops-team /tmp/cfn-devops-policy.hcl
    rm /tmp/cfn-devops-policy.hcl

    log_success "DevOps team policy created"
}

create_cicd_policy() {
    log_info "Creating CI/CD policy..."

    cat > /tmp/cfn-cicd-policy.hcl <<'EOF'
# CI/CD pipeline policy - Deployment credentials
# Use: GitHub Actions, Jenkins, CI/CD runners

# Read-only access to deployment secrets
path "secret/data/deployment/*" {
  capabilities = ["read"]
}

# Read API keys for testing
path "secret/data/api-keys/test-*" {
  capabilities = ["read"]
}

# Read database credentials for migrations
path "secret/data/database/*" {
  capabilities = ["read"]
}

# Use transit encryption for test data
path "transit/encrypt/cfn-encryption-key" {
  capabilities = ["update"]
}

path "transit/decrypt/cfn-encryption-key" {
  capabilities = ["update"]
}
EOF

    vault policy write cfn-cicd /tmp/cfn-cicd-policy.hcl
    rm /tmp/cfn-cicd-policy.hcl

    log_success "CI/CD policy created"
}

create_readonly_policy() {
    log_info "Creating read-only policy..."

    cat > /tmp/cfn-readonly-policy.hcl <<'EOF'
# Read-only policy - Audit and monitoring
# Use: Security team, auditors, monitoring tools

# Read-only access to all secrets metadata
path "secret/metadata/*" {
  capabilities = ["read", "list"]
}

# List encryption keys (no access to key material)
path "transit/keys/*" {
  capabilities = ["read", "list"]
}

# System health and metrics
path "sys/health" {
  capabilities = ["read"]
}

path "sys/metrics" {
  capabilities = ["read"]
}

# Read audit logs
path "sys/audit" {
  capabilities = ["read", "list"]
}
EOF

    vault policy write cfn-readonly /tmp/cfn-readonly-policy.hcl
    rm /tmp/cfn-readonly-policy.hcl

    log_success "Read-only policy created"
}

create_agent_policy() {
    log_info "Creating agent policy..."

    cat > /tmp/cfn-agent-policy.hcl <<'EOF'
# Agent policy - Limited access for CFN Loop agents
# Use: CFN agent containers, automated workflows

# Read API keys for agent operations
path "secret/data/api-keys/*" {
  capabilities = ["read"]
}

# Read database credentials
path "secret/data/database/*" {
  capabilities = ["read"]
}

# Use transit encryption
path "transit/encrypt/cfn-encryption-key" {
  capabilities = ["update"]
}

path "transit/decrypt/cfn-encryption-key" {
  capabilities = ["update"]
}

path "transit/encrypt/cfn-api-token-key" {
  capabilities = ["update"]
}

path "transit/decrypt/cfn-api-token-key" {
  capabilities = ["update"]
}

# Sign JWTs
path "transit/sign/cfn-jwt-signing-key" {
  capabilities = ["update"]
}

path "transit/verify/cfn-jwt-signing-key" {
  capabilities = ["update"]
}
EOF

    vault policy write cfn-agent /tmp/cfn-agent-policy.hcl
    rm /tmp/cfn-agent-policy.hcl

    log_success "Agent policy created"
}

create_example_tokens() {
    log_info "Creating example tokens for each policy..."

    # Admin token (24h TTL)
    local admin_token=$(vault token create -policy=cfn-admin -period=24h -format=json | jq -r '.auth.client_token')
    echo "$admin_token" > "$PROJECT_ROOT/.vault-token-admin"
    chmod 600 "$PROJECT_ROOT/.vault-token-admin"
    log_success "Admin token: $PROJECT_ROOT/.vault-token-admin"

    # Backend team token (8h TTL, renewable)
    local backend_token=$(vault token create -policy=cfn-backend-team -ttl=8h -renewable -format=json | jq -r '.auth.client_token')
    echo "$backend_token" > "$PROJECT_ROOT/.vault-token-backend"
    chmod 600 "$PROJECT_ROOT/.vault-token-backend"
    log_success "Backend team token: $PROJECT_ROOT/.vault-token-backend"

    # DevOps team token (24h TTL, renewable)
    local devops_token=$(vault token create -policy=cfn-devops-team -ttl=24h -renewable -format=json | jq -r '.auth.client_token')
    echo "$devops_token" > "$PROJECT_ROOT/.vault-token-devops"
    chmod 600 "$PROJECT_ROOT/.vault-token-devops"
    log_success "DevOps team token: $PROJECT_ROOT/.vault-token-devops"

    # CI/CD token (no expiry, limited access)
    local cicd_token=$(vault token create -policy=cfn-cicd -period=720h -format=json | jq -r '.auth.client_token')
    echo "$cicd_token" > "$PROJECT_ROOT/.vault-token-cicd"
    chmod 600 "$PROJECT_ROOT/.vault-token-cicd"
    log_success "CI/CD token: $PROJECT_ROOT/.vault-token-cicd"

    # Agent token (1h TTL, for container use)
    local agent_token=$(vault token create -policy=cfn-agent -ttl=1h -renewable -format=json | jq -r '.auth.client_token')
    echo "$agent_token" > "$PROJECT_ROOT/.vault-token-agent"
    chmod 600 "$PROJECT_ROOT/.vault-token-agent"
    log_success "Agent token: $PROJECT_ROOT/.vault-token-agent"

    log_warning "Tokens saved to .vault-token-* files (add to .gitignore)"
}

display_summary() {
    log_info ""
    log_info "Policy Summary:"
    log_info "==============="
    log_info ""

    vault policy list

    log_info ""
    log_info "Policy details:"
    log_info ""
    log_info "cfn-admin           - Full access (SRE team)"
    log_info "cfn-backend-team    - Database + API keys (backend devs)"
    log_info "cfn-frontend-team   - Public API keys only (frontend devs)"
    log_info "cfn-devops-team     - Infrastructure secrets (DevOps)"
    log_info "cfn-cicd            - Deployment credentials (CI/CD)"
    log_info "cfn-readonly        - Audit and monitoring"
    log_info "cfn-agent           - Limited access for agents"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Test policy access with different tokens"
    log_info "  2. Run: scripts/vault/secrets-fetch.sh"
    log_info "  3. Integrate with application"
    log_info ""
}

main() {
    log_info "Creating Vault policies..."

    # Authenticate
    check_auth

    # Create policies
    create_admin_policy
    create_backend_team_policy
    create_frontend_team_policy
    create_devops_team_policy
    create_cicd_policy
    create_readonly_policy
    create_agent_policy

    # Create example tokens
    create_example_tokens

    # Display summary
    display_summary

    log_success "Policy creation complete"
}

main "$@"
