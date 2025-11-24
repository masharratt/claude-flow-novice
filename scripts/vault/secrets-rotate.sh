#!/bin/bash
# scripts/vault/secrets-rotate.sh
# Part of IMPL-001 Security Hardening - Stream 1
# Rotate API keys and certificates in Vault

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

usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Rotate secrets and encryption keys in Vault.

OPTIONS:
    --type TYPE             Rotation type: api-key, database, cert, transit
    --path PATH             Secret path to rotate
    --new-value VALUE       New secret value (if not auto-generated)
    --rotation-days DAYS    Rotation interval in days (default: 90)
    --dry-run               Show what would be rotated without making changes
    --help                  Show this help message

EXAMPLES:
    # Rotate API key (auto-generate new value)
    $0 --type api-key --path secret/api-keys/anthropic

    # Rotate database password with specific value
    $0 --type database --path secret/database/postgres --new-value "newpass123"

    # Rotate TLS certificate
    $0 --type cert --path secret/certs/tls

    # Rotate transit encryption key
    $0 --type transit --path transit/keys/cfn-encryption-key

    # Dry run to see what would be rotated
    $0 --type api-key --path secret/api-keys/zai --dry-run
EOF
    exit 0
}

# Parse arguments
TYPE_ARG=""
PATH_ARG=""
NEW_VALUE=""
ROTATION_DAYS=90
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --type)
            TYPE_ARG="$2"
            shift 2
            ;;
        --path)
            PATH_ARG="$2"
            shift 2
            ;;
        --new-value)
            NEW_VALUE="$2"
            shift 2
            ;;
        --rotation-days)
            ROTATION_DAYS="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            ;;
    esac
done

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
}

validate_args() {
    if [ -z "$TYPE_ARG" ]; then
        log_error "Rotation type is required (--type)"
        usage
    fi

    if [ -z "$PATH_ARG" ]; then
        log_error "Secret path is required (--path)"
        usage
    fi

    # Validate rotation type
    case "$TYPE_ARG" in
        api-key|database|cert|transit)
            ;;
        *)
            log_error "Invalid rotation type: $TYPE_ARG"
            log_error "Valid types: api-key, database, cert, transit"
            return 1
            ;;
    esac
}

generate_random_string() {
    local length="${1:-32}"
    openssl rand -base64 "$length" | tr -d "=+/" | cut -c1-"$length"
}

rotate_api_key() {
    local path="$1"
    local new_key="$2"

    log_info "Rotating API key at: $path"

    # Fetch current secret
    local current_secret=$(vault kv get -format=json "$path" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_error "Failed to fetch current secret from $path"
        return 1
    fi

    # Generate new key if not provided
    if [ -z "$new_key" ]; then
        new_key=$(generate_random_string 64)
        log_info "Generated new API key"
    fi

    # Extract metadata
    local provider=$(echo "$current_secret" | jq -r '.data.data.provider // "unknown"')
    local tier=$(echo "$current_secret" | jq -r '.data.data.tier // "production"')

    if [ "$DRY_RUN" = true ]; then
        log_warning "[DRY RUN] Would rotate API key for provider: $provider"
        return 0
    fi

    # Update secret with new key
    vault kv put "$path" \
        key="$new_key" \
        provider="$provider" \
        tier="$tier" \
        created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        rotation_days="$ROTATION_DAYS" \
        rotated_by="$USER" \
        rotation_reason="scheduled"

    log_success "API key rotated for provider: $provider"
    log_warning "Update application configuration with new key"
}

rotate_database_password() {
    local path="$1"
    local new_password="$2"

    log_info "Rotating database password at: $path"

    # Fetch current secret
    local current_secret=$(vault kv get -format=json "$path" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_error "Failed to fetch current secret from $path"
        return 1
    fi

    # Generate new password if not provided
    if [ -z "$new_password" ]; then
        new_password=$(generate_random_string 32)
        log_info "Generated new password"
    fi

    # Extract metadata
    local username=$(echo "$current_secret" | jq -r '.data.data.username')
    local host=$(echo "$current_secret" | jq -r '.data.data.host')
    local port=$(echo "$current_secret" | jq -r '.data.data.port // 5432')
    local database=$(echo "$current_secret" | jq -r '.data.data.database')

    if [ "$DRY_RUN" = true ]; then
        log_warning "[DRY RUN] Would rotate password for database: $database"
        return 0
    fi

    # Update secret with new password
    vault kv put "$path" \
        username="$username" \
        password="$new_password" \
        host="$host" \
        port="$port" \
        database="$database" \
        ssl_mode="require" \
        rotation_days="$ROTATION_DAYS" \
        rotated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        rotated_by="$USER"

    log_success "Database password rotated for: $database"
    log_warning "Update database server with new password:"
    log_warning "  ALTER USER $username WITH PASSWORD '$new_password';"
}

rotate_certificate() {
    local path="$1"

    log_info "Rotating TLS certificate at: $path"

    if [ "$DRY_RUN" = true ]; then
        log_warning "[DRY RUN] Would rotate TLS certificate"
        log_warning "Certificate rotation requires:"
        log_warning "  1. Generate new CSR"
        log_warning "  2. Submit to CA"
        log_warning "  3. Update Vault with new cert"
        return 0
    fi

    log_warning "Certificate rotation requires manual steps:"
    log_warning ""
    log_warning "1. Generate new private key and CSR:"
    log_warning "   openssl req -new -newkey rsa:4096 -nodes -keyout server.key -out server.csr"
    log_warning ""
    log_warning "2. Submit CSR to Certificate Authority"
    log_warning ""
    log_warning "3. Update Vault with new certificate:"
    log_warning "   vault kv put $path cert=@server.crt key=@server.key ca=@ca.crt"
    log_warning ""
    log_error "Automatic certificate rotation not yet implemented"
    return 1
}

rotate_transit_key() {
    local path="$1"

    log_info "Rotating transit encryption key at: $path"

    # Extract key name from path
    local key_name=$(basename "$path")

    if [ "$DRY_RUN" = true ]; then
        log_warning "[DRY RUN] Would rotate transit key: $key_name"
        return 0
    fi

    # Rotate key (creates new version)
    vault write -f "$path/rotate"

    # Get current version
    local key_info=$(vault read -format=json "$path")
    local latest_version=$(echo "$key_info" | jq -r '.data.latest_version')

    log_success "Transit key rotated: $key_name (version $latest_version)"
    log_info "Previous versions remain available for decryption"
    log_info "New encryptions will use version $latest_version"
}

check_rotation_needed() {
    local path="$1"

    log_info "Checking if rotation is needed for: $path"

    # Fetch current secret
    local current_secret=$(vault kv get -format=json "$path" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_warning "Secret not found, skipping rotation check"
        return 1
    fi

    # Extract rotation metadata
    local created_at=$(echo "$current_secret" | jq -r '.data.data.created_at // .data.data.rotated_at // empty')
    local rotation_days_config=$(echo "$current_secret" | jq -r '.data.data.rotation_days // 90')

    if [ -z "$created_at" ]; then
        log_warning "No rotation metadata found, assuming rotation needed"
        return 0
    fi

    # Calculate age in days
    local created_timestamp=$(date -d "$created_at" +%s 2>/dev/null || echo 0)
    local now_timestamp=$(date +%s)
    local age_days=$(( (now_timestamp - created_timestamp) / 86400 ))

    log_info "Secret age: $age_days days (rotation interval: $rotation_days_config days)"

    if [ "$age_days" -ge "$rotation_days_config" ]; then
        log_warning "Rotation recommended (age: $age_days days)"
        return 0
    else
        log_success "No rotation needed (age: $age_days days)"
        return 1
    fi
}

main() {
    log_info "Starting secret rotation..."

    # Authenticate
    check_auth

    # Validate arguments
    validate_args

    # Check if rotation is needed
    if [ "$TYPE_ARG" != "transit" ]; then
        check_rotation_needed "$PATH_ARG" || {
            log_info "Skipping rotation (not needed yet)"
            exit 0
        }
    fi

    # Perform rotation based on type
    case "$TYPE_ARG" in
        api-key)
            rotate_api_key "$PATH_ARG" "$NEW_VALUE"
            ;;
        database)
            rotate_database_password "$PATH_ARG" "$NEW_VALUE"
            ;;
        cert)
            rotate_certificate "$PATH_ARG"
            ;;
        transit)
            rotate_transit_key "$PATH_ARG"
            ;;
    esac

    log_success "Secret rotation complete"
}

main "$@"
