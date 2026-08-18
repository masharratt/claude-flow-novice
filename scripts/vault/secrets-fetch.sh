#!/usr/bin/env bash
# scripts/vault/secrets-fetch.sh
# Part of IMPL-001 Security Hardening - Stream 1
# Fetch secrets from Vault for application use

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

Fetch secrets from Vault and export to environment or file.

OPTIONS:
    --path PATH             Secret path (e.g., secret/api-keys/anthropic)
    --key KEY               Specific key to fetch (default: all keys)
    --format FORMAT         Output format: env, json, yaml (default: env)
    --output FILE           Write to file instead of stdout
    --token-file FILE       Vault token file (default: .vault-token)
    --encrypt               Encrypt output using transit engine
    --help                  Show this help message

EXAMPLES:
    # Fetch all API keys as env vars
    $0 --path secret/api-keys/anthropic --format env

    # Fetch specific key as JSON
    $0 --path secret/database/postgres --key password --format json

    # Fetch and write to file
    $0 --path secret/api-keys/zai --output .env.vault

    # Fetch encrypted data
    $0 --path secret/sensitive/data --encrypt
EOF
    exit 0
}

# Parse arguments
PATH_ARG=""
KEY_ARG=""
FORMAT="env"
OUTPUT_FILE=""
TOKEN_FILE="$VAULT_TOKEN_FILE"
ENCRYPT=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --path)
            PATH_ARG="$2"
            shift 2
            ;;
        --key)
            KEY_ARG="$2"
            shift 2
            ;;
        --format)
            FORMAT="$2"
            shift 2
            ;;
        --output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --token-file)
            TOKEN_FILE="$2"
            shift 2
            ;;
        --encrypt)
            ENCRYPT=true
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
    if [ ! -f "$TOKEN_FILE" ]; then
        log_error "Vault token not found at $TOKEN_FILE"
        log_error "Run: scripts/vault/init-vault.sh first"
        return 1
    fi

    export VAULT_TOKEN=$(cat "$TOKEN_FILE")
    export VAULT_ADDR

    if ! vault token lookup >/dev/null 2>&1; then
        log_error "Invalid or expired Vault token"
        return 1
    fi
}

validate_path() {
    if [ -z "$PATH_ARG" ]; then
        log_error "Secret path is required (--path)"
        usage
    fi

    # Ensure path starts with secret/data/ for KV v2
    if [[ "$PATH_ARG" != secret/data/* ]]; then
        if [[ "$PATH_ARG" == secret/* ]]; then
            PATH_ARG="${PATH_ARG/secret\//secret/data/}"
        else
            PATH_ARG="secret/data/$PATH_ARG"
        fi
    fi
}

fetch_secret() {
    local secret_data
    secret_data=$(vault kv get -format=json "$PATH_ARG" 2>/dev/null)

    if [ $? -ne 0 ]; then
        log_error "Failed to fetch secret from $PATH_ARG"
        return 1
    fi

    echo "$secret_data"
}

extract_key() {
    local secret_data="$1"
    local key="$2"

    echo "$secret_data" | jq -r ".data.data.${key} // empty"
}

format_env() {
    local secret_data="$1"

    local keys=$(echo "$secret_data" | jq -r '.data.data | keys[]')

    for key in $keys; do
        local value=$(echo "$secret_data" | jq -r ".data.data.${key}")

        # Skip sensitive fields in output (show as [REDACTED])
        if [[ "$key" =~ ^(password|key|secret|token)$ ]]; then
            if [ "$ENCRYPT" = false ]; then
                echo "${key^^}=[REDACTED]"
                continue
            fi
        fi

        echo "${key^^}=${value}"
    done
}

format_json() {
    local secret_data="$1"

    if [ -n "$KEY_ARG" ]; then
        local value=$(extract_key "$secret_data" "$KEY_ARG")
        echo "{\"${KEY_ARG}\": \"${value}\"}"
    else
        echo "$secret_data" | jq '.data.data'
    fi
}

format_yaml() {
    local secret_data="$1"

    echo "$secret_data" | jq -r '.data.data | to_entries | .[] | "\(.key): \(.value)"'
}

encrypt_output() {
    local plaintext="$1"

    # Encode to base64 first
    local encoded=$(echo -n "$plaintext" | base64 -w 0)

    # Encrypt using transit engine
    local encrypted=$(vault write -field=ciphertext transit/encrypt/cfn-encryption-key plaintext="$encoded")

    echo "$encrypted"
}

decrypt_output() {
    local ciphertext="$1"

    # Decrypt using transit engine
    local decrypted=$(vault write -field=plaintext transit/decrypt/cfn-encryption-key ciphertext="$ciphertext")

    # Decode from base64
    echo "$decrypted" | base64 -d
}

main() {
    log_info "Fetching secrets from Vault..."

    # Authenticate
    check_auth

    # Validate path
    validate_path

    log_info "Fetching from: $PATH_ARG"

    # Fetch secret
    local secret_data
    secret_data=$(fetch_secret)

    # Extract specific key if requested
    if [ -n "$KEY_ARG" ]; then
        log_info "Extracting key: $KEY_ARG"
        local value=$(extract_key "$secret_data" "$KEY_ARG")

        if [ -z "$value" ]; then
            log_error "Key not found: $KEY_ARG"
            return 1
        fi

        secret_data="{\"data\": {\"data\": {\"${KEY_ARG}\": \"${value}\"}}}"
    fi

    # Format output
    local output
    case "$FORMAT" in
        env)
            output=$(format_env "$secret_data")
            ;;
        json)
            output=$(format_json "$secret_data")
            ;;
        yaml)
            output=$(format_yaml "$secret_data")
            ;;
        *)
            log_error "Unknown format: $FORMAT"
            return 1
            ;;
    esac

    # Encrypt if requested
    if [ "$ENCRYPT" = true ]; then
        log_info "Encrypting output..."
        output=$(encrypt_output "$output")
    fi

    # Write to file or stdout
    if [ -n "$OUTPUT_FILE" ]; then
        echo "$output" > "$OUTPUT_FILE"
        chmod 600 "$OUTPUT_FILE"
        log_success "Secrets written to: $OUTPUT_FILE"
    else
        echo "$output"
    fi

    log_success "Secrets fetched successfully"
}

main "$@"
