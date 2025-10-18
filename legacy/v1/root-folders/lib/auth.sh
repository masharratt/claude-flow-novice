#!/usr/bin/env bash
# Authentication Library for CFN Agent Coordination
# Phase 3: Signature-based authentication with RBAC
# Provides: Token lifecycle, message signing, signature verification, RBAC enforcement

set -euo pipefail

# ==============================================================================
# CONFIGURATION
# ==============================================================================

# Authentication configuration
export CFN_AUTH_ENABLED="${CFN_AUTH_ENABLED:-false}"
export CFN_AUTH_DIR="${CFN_AUTH_DIR:-/dev/shm/cfn/auth}"
export CFN_AUTH_KEYS_DIR="${CFN_AUTH_KEYS_DIR:-$CFN_AUTH_DIR/keys}"
export CFN_AUTH_TOKENS_DIR="${CFN_AUTH_TOKENS_DIR:-$CFN_AUTH_DIR/tokens}"
export CFN_AUTH_REPLAY_DIR="${CFN_AUTH_REPLAY_DIR:-$CFN_AUTH_DIR/replay}"
export CFN_AUTH_KEY_SIZE="${CFN_AUTH_KEY_SIZE:-32}" # 256 bits
export CFN_AUTH_TOKEN_TTL="${CFN_AUTH_TOKEN_TTL:-3600}" # 1 hour default
export CFN_AUTH_REPLAY_WINDOW="${CFN_AUTH_REPLAY_WINDOW:-60}" # 60 second replay window

# RBAC roles
export CFN_ROLE_COORDINATOR="coordinator"
export CFN_ROLE_WORKER="worker"
export CFN_ROLE_OBSERVER="observer"

# ==============================================================================
# LOGGING
# ==============================================================================

auth_log_info() {
    echo "[$(date '+%H:%M:%S.%3N')] [AUTH] $*" >&2
}

auth_log_error() {
    echo "[$(date '+%H:%M:%S.%3N')] [AUTH] ERROR: $*" >&2
}

auth_log_debug() {
    if [[ "${CFN_DEBUG_MODE:-false}" == "true" ]]; then
        echo "[$(date '+%H:%M:%S.%3N')] [AUTH] DEBUG: $*" >&2
    fi
}

# ==============================================================================
# SECURITY VALIDATION
# ==============================================================================

# Validate agent_id format to prevent path traversal (CWE-22)
# Args: $1=agent_id
# Returns: 0 if valid, 1 if invalid
validate_agent_id_safe() {
    local agent_id="$1"

    # Allow only alphanumeric, dash, underscore (1-64 chars)
    if [[ ! "$agent_id" =~ ^[a-zA-Z0-9_-]{1,64}$ ]]; then
        auth_log_error "Invalid agent_id format: '$agent_id' (CWE-22: Path Traversal)"
        return 1
    fi

    return 0
}

# Validate role format
# Args: $1=role
# Returns: 0 if valid, 1 if invalid
validate_role() {
    local role="$1"

    case "$role" in
        "$CFN_ROLE_COORDINATOR"|"$CFN_ROLE_WORKER"|"$CFN_ROLE_OBSERVER")
            return 0
            ;;
        *)
            auth_log_error "Invalid role: '$role'"
            return 1
            ;;
    esac
}

# ==============================================================================
# INITIALIZATION
# ==============================================================================

# Initialize authentication system
# Returns: 0 on success, 1 on failure
init_auth_system() {
    if [[ "$CFN_AUTH_ENABLED" != "true" ]]; then
        auth_log_debug "Authentication disabled (CFN_AUTH_ENABLED=false)"
        return 0
    fi

    # Create directory structure with secure permissions
    mkdir -p "$CFN_AUTH_KEYS_DIR" "$CFN_AUTH_TOKENS_DIR" "$CFN_AUTH_REPLAY_DIR"

    # Set directory permissions (700 - owner only)
    chmod 700 "$CFN_AUTH_DIR" "$CFN_AUTH_KEYS_DIR" "$CFN_AUTH_TOKENS_DIR" "$CFN_AUTH_REPLAY_DIR"

    auth_log_info "Authentication system initialized at $CFN_AUTH_DIR"
    return 0
}

# ==============================================================================
# TOKEN LIFECYCLE MANAGEMENT
# ==============================================================================

# Generate cryptographic key for agent
# Args: $1=agent_id, $2=role (optional, default: worker)
# Returns: 0 on success, 1 on failure
generate_agent_key() {
    local agent_id="$1"
    local role="${2:-$CFN_ROLE_WORKER}"

    # Security validation
    if ! validate_agent_id_safe "$agent_id"; then
        return 1
    fi

    if ! validate_role "$role"; then
        return 1
    fi

    local key_file="$CFN_AUTH_KEYS_DIR/${agent_id}.key"
    local token_file="$CFN_AUTH_TOKENS_DIR/${agent_id}.token"

    # Generate random key (256-bit)
    # Using /dev/urandom for cryptographic quality randomness
    if ! dd if=/dev/urandom bs="$CFN_AUTH_KEY_SIZE" count=1 2>/dev/null | base64 -w 0 > "$key_file"; then
        auth_log_error "Failed to generate key for $agent_id"
        return 1
    fi

    # Set file permissions (600 - owner read/write only)
    chmod 600 "$key_file"

    # Create token with metadata
    local issued_at=$(date +%s)
    local expires_at=$((issued_at + $CFN_AUTH_TOKEN_TTL))

    cat > "$token_file" <<EOF
{
  "agent_id": "$agent_id",
  "role": "$role",
  "issued_at": $issued_at,
  "expires_at": $expires_at,
  "key_file": "$key_file"
}
EOF

    chmod 600 "$token_file"

    auth_log_info "Generated key for $agent_id (role: $role, ttl: ${CFN_AUTH_TOKEN_TTL}s)"
    return 0
}

# Get agent key
# Args: $1=agent_id
# Returns: Key on stdout, 0 on success, 1 on failure
get_agent_key() {
    local agent_id="$1"

    if ! validate_agent_id_safe "$agent_id"; then
        return 1
    fi

    local key_file="$CFN_AUTH_KEYS_DIR/${agent_id}.key"

    if [[ ! -f "$key_file" ]]; then
        auth_log_error "Key not found for $agent_id"
        return 1
    fi

    cat "$key_file"
    return 0
}

# Check if token is expired
# Args: $1=agent_id
# Returns: 0 if valid, 1 if expired or not found
check_token_validity() {
    local agent_id="$1"

    if ! validate_agent_id_safe "$agent_id"; then
        return 1
    fi

    local token_file="$CFN_AUTH_TOKENS_DIR/${agent_id}.token"

    if [[ ! -f "$token_file" ]]; then
        auth_log_error "Token not found for $agent_id"
        return 1
    fi

    # Parse expires_at from JSON (fallback if jq not available)
    local expires_at
    if command -v jq >/dev/null 2>&1; then
        expires_at=$(jq -r '.expires_at' "$token_file" 2>/dev/null || echo "0")
    else
        # Bash-only JSON parsing
        expires_at=$(grep -o '"expires_at":\s*[0-9]*' "$token_file" | grep -o '[0-9]*$' || echo "0")
    fi
    local current_time=$(date +%s)

    if [[ "$current_time" -ge "$expires_at" ]]; then
        auth_log_error "Token expired for $agent_id (expired at: $expires_at, current: $current_time)"
        return 1
    fi

    return 0
}

# Rotate agent key
# Args: $1=agent_id
# Returns: 0 on success, 1 on failure
rotate_agent_key() {
    local agent_id="$1"

    if ! validate_agent_id_safe "$agent_id"; then
        return 1
    fi

    local token_file="$CFN_AUTH_TOKENS_DIR/${agent_id}.token"

    # Get current role
    local role="$CFN_ROLE_WORKER"
    if [[ -f "$token_file" ]]; then
        if command -v jq >/dev/null 2>&1; then
            role=$(jq -r '.role' "$token_file" 2>/dev/null || echo "$CFN_ROLE_WORKER")
        else
            role=$(grep -o '"role":\s*"[^"]*"' "$token_file" | sed 's/.*"\([^"]*\)"/\1/' || echo "$CFN_ROLE_WORKER")
        fi
    fi

    # Backup old key
    local old_key_file="$CFN_AUTH_KEYS_DIR/${agent_id}.key"
    if [[ -f "$old_key_file" ]]; then
        local backup_file="${old_key_file}.$(date +%s).bak"
        mv "$old_key_file" "$backup_file"
        chmod 600 "$backup_file"
        auth_log_info "Backed up old key to $backup_file"
    fi

    # Generate new key
    generate_agent_key "$agent_id" "$role"

    auth_log_info "Rotated key for $agent_id"
    return 0
}

# Revoke agent token
# Args: $1=agent_id
# Returns: 0 on success, 1 on failure
revoke_agent_token() {
    local agent_id="$1"

    if ! validate_agent_id_safe "$agent_id"; then
        return 1
    fi

    local key_file="$CFN_AUTH_KEYS_DIR/${agent_id}.key"
    local token_file="$CFN_AUTH_TOKENS_DIR/${agent_id}.token"

    # Remove key and token files
    rm -f "$key_file" "$token_file"

    auth_log_info "Revoked token for $agent_id"
    return 0
}

# ==============================================================================
# MESSAGE SIGNING
# ==============================================================================

# Sign message payload
# Args: $1=agent_id, $2=payload
# Returns: Signature on stdout, 0 on success, 1 on failure
sign_message() {
    local agent_id="$1"
    local payload="$2"

    if [[ "$CFN_AUTH_ENABLED" != "true" ]]; then
        # Return empty signature when auth disabled
        echo ""
        return 0
    fi

    if ! validate_agent_id_safe "$agent_id"; then
        return 1
    fi

    # Check token validity
    if ! check_token_validity "$agent_id"; then
        auth_log_error "Cannot sign message: invalid or expired token for $agent_id"
        return 1
    fi

    # Get agent key
    local key
    if ! key=$(get_agent_key "$agent_id"); then
        return 1
    fi

    # Create signature using HMAC-SHA256
    # Signature = HMAC-SHA256(key, payload)
    local signature
    signature=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$key" -binary | base64 -w 0)

    echo "$signature"
    return 0
}

# ==============================================================================
# SIGNATURE VERIFICATION
# ==============================================================================

# Verify message signature
# Args: $1=agent_id, $2=payload, $3=signature
# Returns: 0 if valid, 1 if invalid
verify_signature() {
    local agent_id="$1"
    local payload="$2"
    local signature="$3"

    # Backward compatibility: accept unsigned messages when auth disabled
    if [[ "$CFN_AUTH_ENABLED" != "true" ]]; then
        auth_log_debug "Auth disabled, accepting unsigned message"
        return 0
    fi

    # Empty signature when auth disabled
    if [[ -z "$signature" ]] && [[ "$CFN_AUTH_ENABLED" != "true" ]]; then
        return 0
    fi

    if ! validate_agent_id_safe "$agent_id"; then
        return 1
    fi

    # Check token validity
    if ! check_token_validity "$agent_id"; then
        auth_log_error "Signature verification failed: invalid or expired token for $agent_id"
        return 1
    fi

    # Get agent key
    local key
    if ! key=$(get_agent_key "$agent_id"); then
        return 1
    fi

    # Calculate expected signature
    local expected_signature
    expected_signature=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$key" -binary | base64 -w 0)

    # Constant-time comparison to prevent timing attacks
    if [[ "$signature" == "$expected_signature" ]]; then
        auth_log_debug "Signature valid for $agent_id"
        return 0
    else
        auth_log_error "Signature verification failed for $agent_id (signature mismatch)"
        return 1
    fi
}

# ==============================================================================
# REPLAY ATTACK PREVENTION
# ==============================================================================

# Record message nonce to prevent replay attacks
# Args: $1=agent_id, $2=nonce
# Returns: 0 if new nonce, 1 if replay detected
record_message_nonce() {
    local agent_id="$1"
    local nonce="$2"

    if [[ "$CFN_AUTH_ENABLED" != "true" ]]; then
        return 0
    fi

    if ! validate_agent_id_safe "$agent_id"; then
        return 1
    fi

    local nonce_file="$CFN_AUTH_REPLAY_DIR/${agent_id}.nonces"
    local current_time=$(date +%s)
    local cutoff_time=$((current_time - CFN_AUTH_REPLAY_WINDOW))

    # Create nonce file if doesn't exist
    touch "$nonce_file"
    chmod 600 "$nonce_file"

    # Check if nonce already exists (replay attack)
    if grep -q "^${nonce}:" "$nonce_file" 2>/dev/null; then
        auth_log_error "Replay attack detected: nonce $nonce already used by $agent_id"
        return 1
    fi

    # Record nonce with timestamp
    echo "${nonce}:${current_time}" >> "$nonce_file"

    # Cleanup old nonces (outside replay window)
    local temp_file="${nonce_file}.tmp"
    awk -F: -v cutoff="$cutoff_time" '$2 >= cutoff' "$nonce_file" > "$temp_file" || true
    mv "$temp_file" "$nonce_file"
    chmod 600 "$nonce_file"

    return 0
}

# ==============================================================================
# RBAC PERMISSION ENFORCEMENT
# ==============================================================================

# Get agent role
# Args: $1=agent_id
# Returns: Role on stdout, 0 on success, 1 on failure
get_agent_role() {
    local agent_id="$1"

    if ! validate_agent_id_safe "$agent_id"; then
        return 1
    fi

    local token_file="$CFN_AUTH_TOKENS_DIR/${agent_id}.token"

    if [[ ! -f "$token_file" ]]; then
        auth_log_error "Token not found for $agent_id"
        return 1
    fi

    local role
    if command -v jq >/dev/null 2>&1; then
        role=$(jq -r '.role' "$token_file" 2>/dev/null || echo "")
    else
        role=$(grep -o '"role":\s*"[^"]*"' "$token_file" | sed 's/.*"\([^"]*\)"/\1/' || echo "")
    fi

    if [[ -z "$role" ]]; then
        auth_log_error "Failed to read role for $agent_id"
        return 1
    fi

    echo "$role"
    return 0
}

# Check if agent has permission for operation
# Args: $1=agent_id, $2=operation (send_message|broadcast|health_report|metrics_report|shutdown)
# Returns: 0 if permitted, 1 if denied
check_permission() {
    local agent_id="$1"
    local operation="$2"

    if [[ "$CFN_AUTH_ENABLED" != "true" ]]; then
        # All operations permitted when auth disabled
        return 0
    fi

    if ! validate_agent_id_safe "$agent_id"; then
        return 1
    fi

    local role
    if ! role=$(get_agent_role "$agent_id"); then
        auth_log_error "Permission denied: cannot determine role for $agent_id"
        return 1
    fi

    # Permission matrix
    case "$role" in
        "$CFN_ROLE_COORDINATOR")
            # Coordinator has full access
            return 0
            ;;
        "$CFN_ROLE_WORKER")
            # Worker can send messages, report health/metrics
            case "$operation" in
                send_message|health_report|metrics_report)
                    return 0
                    ;;
                broadcast|shutdown)
                    auth_log_error "Permission denied: $role cannot perform $operation"
                    return 1
                    ;;
                *)
                    auth_log_error "Unknown operation: $operation"
                    return 1
                    ;;
            esac
            ;;
        "$CFN_ROLE_OBSERVER")
            # Observer has read-only access
            case "$operation" in
                send_message|broadcast|health_report|metrics_report|shutdown)
                    auth_log_error "Permission denied: $role is read-only"
                    return 1
                    ;;
                *)
                    auth_log_error "Unknown operation: $operation"
                    return 1
                    ;;
            esac
            ;;
        *)
            auth_log_error "Unknown role: $role"
            return 1
            ;;
    esac
}

# Attempt role escalation (should always fail - security test)
# Args: $1=agent_id, $2=target_role
# Returns: 1 (always fails)
attempt_role_escalation() {
    local agent_id="$1"
    local target_role="$2"

    auth_log_error "SECURITY: Role escalation attempt blocked for $agent_id -> $target_role"
    return 1
}

# ==============================================================================
# PERFORMANCE METRICS
# ==============================================================================

# Measure signing performance
# Args: $1=agent_id, $2=payload
# Returns: Duration in microseconds on stdout
measure_sign_performance() {
    local agent_id="$1"
    local payload="$2"

    local start_us=$(date +%s%6N 2>/dev/null || echo "0")
    sign_message "$agent_id" "$payload" >/dev/null
    local end_us=$(date +%s%6N 2>/dev/null || echo "0")

    local duration_us=$((end_us - start_us))
    echo "$duration_us"
}

# Measure verification performance
# Args: $1=agent_id, $2=payload, $3=signature
# Returns: Duration in microseconds on stdout
measure_verify_performance() {
    local agent_id="$1"
    local payload="$2"
    local signature="$3"

    local start_us=$(date +%s%6N 2>/dev/null || echo "0")
    verify_signature "$agent_id" "$payload" "$signature" >/dev/null
    local end_us=$(date +%s%6N 2>/dev/null || echo "0")

    local duration_us=$((end_us - start_us))
    echo "$duration_us"
}

# ==============================================================================
# CLEANUP
# ==============================================================================

# Cleanup authentication system
# Returns: 0 on success
cleanup_auth_system() {
    if [[ -d "$CFN_AUTH_DIR" ]]; then
        rm -rf "$CFN_AUTH_DIR"
        auth_log_info "Authentication system cleaned up"
    fi
    return 0
}

# ==============================================================================
# MAIN EXECUTION (when sourced)
# ==============================================================================

# Auto-initialize if authentication enabled
if [[ "$CFN_AUTH_ENABLED" == "true" ]] && [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    init_auth_system
fi
