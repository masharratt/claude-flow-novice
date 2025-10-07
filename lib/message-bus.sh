#!/bin/bash
# Message Bus Foundation v1.1
# Agent-to-agent messaging infrastructure for CFN MVP coordination
# Phase 3: Authenticated message signing and verification

set -euo pipefail

# Configuration
MESSAGE_BASE_DIR="${MESSAGE_BASE_DIR:-/dev/shm/cfn-mvp/messages}"
MESSAGE_VERSION="1.1"

# Authentication configuration
export CFN_AUTH_ENABLED="${CFN_AUTH_ENABLED:-false}"
export CFN_AUTH_MODE="${CFN_AUTH_MODE:-disabled}"  # disabled|warn|enforce

# Source auth library if available (for message signing/verification)
AUTH_LIB="${AUTH_LIB:-$(dirname "${BASH_SOURCE[0]}")/auth.sh}"
if [[ -f "$AUTH_LIB" ]]; then
    source "$AUTH_LIB"
fi

# Source resource limits library for DoS prevention
RESOURCE_LIMITS_LIB="${RESOURCE_LIMITS_LIB:-$(dirname "${BASH_SOURCE[0]}")/resource-limits.sh}"
if [[ -f "$RESOURCE_LIMITS_LIB" ]]; then
    source "$RESOURCE_LIMITS_LIB"
fi

# Logging
log_info() {
    echo "[$(date '+%H:%M:%S')] [MESSAGE-BUS] $*" >&2
}

log_error() {
    echo "[$(date '+%H:%M:%S')] [MESSAGE-BUS] ERROR: $*" >&2
}

log_warn() {
    echo "[$(date '+%H:%M:%S')] [MESSAGE-BUS] WARN: $*" >&2
}

# Validate agent_id format to prevent path traversal attacks
# Usage: validate_agent_id <agent_id>
# Returns: 0 if valid, 1 if invalid
validate_agent_id() {
    local agent_id="$1"

    # SECURITY: Prevent path traversal (CWE-22)
    # Allow only alphanumeric, dash, underscore (1-64 chars)
    if [[ ! "$agent_id" =~ ^[a-zA-Z0-9_-]{1,64}$ ]]; then
        log_error "Invalid agent_id format: '$agent_id' (must be alphanumeric, dash, underscore, 1-64 chars)"
        return 1
    fi

    return 0
}

# Initialize message bus for an agent
# Usage: init_message_bus <agent-id>
init_message_bus() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Agent ID required"
        return 1
    fi

    # SECURITY: Validate agent_id to prevent path traversal
    if ! validate_agent_id "$agent_id"; then
        return 1
    fi

    local agent_dir="$MESSAGE_BASE_DIR/$agent_id"
    local inbox_dir="$agent_dir/inbox"
    local outbox_dir="$agent_dir/outbox"

    # Create directory structure
    mkdir -p "$inbox_dir" "$outbox_dir"

    # Set permissions for shared memory access
    chmod 755 "$agent_dir"
    chmod 755 "$inbox_dir" "$outbox_dir"

    log_info "Initialized message bus for $agent_id"
    log_info "  Inbox: $inbox_dir"
    log_info "  Outbox: $outbox_dir"

    return 0
}

# Generate unique message ID
# Format: msg-<timestamp>-<counter>
generate_message_id() {
    local timestamp=$(date +%s)
    local counter=$(printf "%03d" $((RANDOM % 1000)))
    echo "msg-$timestamp-$counter"
}

# Sequence counter tracking per sender-recipient pair
# Usage: get_next_sequence <from> <to>
get_next_sequence() {
    local from="$1"
    local to="$2"

    # SECURITY: Validate agent IDs to prevent path traversal
    if ! validate_agent_id "$from"; then
        return 1
    fi
    if ! validate_agent_id "$to"; then
        return 1
    fi

    local seq_file="$MESSAGE_BASE_DIR/$from/.sequences/$to"
    local lock_file="$MESSAGE_BASE_DIR/$from/.sequences/$to.lock"

    mkdir -p "$MESSAGE_BASE_DIR/$from/.sequences"

    # ATOMIC increment with flock to prevent race conditions
    # Retry up to 3 times with exponential backoff if lock acquisition fails
    local retries=3
    local wait_time=10

    while [ $retries -gt 0 ]; do
        {
            if flock -x -w $wait_time 200; then
                # CRITICAL FIX: Initialize sequence file INSIDE flock to prevent TOCTOU race
                if [[ ! -f "$seq_file" ]]; then
                    echo "0" > "$seq_file"
                fi

                local current_seq=$(cat "$seq_file")
                local next_seq=$((current_seq + 1))
                echo "$next_seq" > "$seq_file"
                sync  # Ensure sequence file flush
                echo "$next_seq"
                return 0
            fi
        } 200>"$lock_file"

        retries=$((retries - 1))
        if [ $retries -gt 0 ]; then
            sleep 0.1  # Brief backoff before retry
            wait_time=$((wait_time * 2))  # Exponential backoff
        fi
    done

    log_error "Failed to acquire sequence lock after 3 retries: $from -> $to"
    return 1
}

# Send message to another agent
# Usage: send_message <from> <to> <type> <payload-json>
send_message() {
    local from="$1"
    local to="$2"
    local msg_type="$3"
    local payload="$4"

    if [[ -z "$from" || -z "$to" || -z "$msg_type" ]]; then
        log_error "Usage: send_message <from> <to> <type> <payload-json>"
        return 1
    fi

    # SECURITY: Validate agent IDs to prevent path traversal
    if ! validate_agent_id "$from"; then
        return 1
    fi
    if ! validate_agent_id "$to"; then
        return 1
    fi

    local recipient_inbox="$MESSAGE_BASE_DIR/$to/inbox"

    # Validate recipient inbox exists
    if [[ ! -d "$recipient_inbox" ]]; then
        log_error "Recipient inbox not found: $to"
        return 1
    fi

    # RESOURCE LIMITS: Check global message count (DoS prevention)
    if command -v check_global_message_count >/dev/null 2>&1; then
        if ! check_global_message_count; then
            log_error "Cannot send message: global message limit exceeded"
            return 1
        fi
    fi

    # RESOURCE LIMITS: Validate payload size (disk exhaustion prevention)
    if command -v validate_payload_size >/dev/null 2>&1; then
        if ! validate_payload_size "$payload"; then
            log_error "Cannot send message: payload size limit exceeded"
            return 1
        fi
    fi

    # Inbox overflow protection: FIFO eviction at 1000 messages (100-agent scale)
    # Use ls instead of find (WSL-safe, <10ms vs 2-10s with find)
    local inbox_count=$(ls -1 "$recipient_inbox"/*.json 2>/dev/null | wc -l)

    if [[ $inbox_count -ge 1000 ]]; then
        # Find oldest message by modification time using ls -t (reverse chronological)
        # ls -t sorts newest first, tail -n 1 gets oldest
        local oldest_msg=$(ls -t "$recipient_inbox"/*.json 2>/dev/null | tail -n 1)

        if [[ -n "$oldest_msg" ]]; then
            local oldest_msg_id=$(basename "$oldest_msg" .json)
            rm -f "$oldest_msg"
            log_info "WARN: Inbox overflow for $to (${inbox_count} messages), evicted oldest: $oldest_msg_id"

            # Emit backpressure metric for inbox overflow
            if command -v emit_metric >/dev/null 2>&1; then
                emit_metric "backpressure.inbox_overflow" "1" "count" "{\"agent\":\"$to\",\"inbox_size\":$inbox_count,\"evicted\":\"$oldest_msg_id\"}"
            fi
        fi
    fi

    # Generate message metadata
    local msg_id=$(generate_message_id)
    local timestamp=$(date +%s)
    local sequence=$(get_next_sequence "$from" "$to")
    local msg_file="$recipient_inbox/$msg_id.json"

    # Construct message JSON with sequence number
    local message=$(cat <<EOF
{
  "version": "$MESSAGE_VERSION",
  "msg_id": "$msg_id",
  "from": "$from",
  "to": "$to",
  "timestamp": $timestamp,
  "sequence": $sequence,
  "type": "$msg_type",
  "payload": $payload,
  "requires_ack": false
}
EOF
)

    # Sign message if authentication is enabled
    if [[ "${CFN_AUTH_ENABLED}" == "true" ]] && command -v sign_message >/dev/null 2>&1; then
        # Create canonical payload for signing (message without signature)
        local canonical
        if command -v jq >/dev/null 2>&1; then
            canonical=$(echo "$message" | jq -S -c .)
        else
            # Bash fallback: use message as-is for signing
            canonical="$message"
        fi

        # Generate signature
        local signature
        if signature=$(sign_message "$from" "$canonical" 2>&1); then
            # Add signature field to message
            if command -v jq >/dev/null 2>&1; then
                message=$(echo "$message" | jq -c --arg sig "$signature" '. + {signature: $sig}')
            else
                # Bash fallback: insert signature before final closing brace
                message="${message%\}},\"signature\":\"$signature\"}"
            fi
            log_info "Message signed for $from -> $to (sig: ${signature:0:16}...)"
        else
            log_warn "Signature generation failed for $from: $signature"
            # Continue with unsigned message in warn mode, fail in enforce mode
            if [[ "${CFN_AUTH_MODE}" == "enforce" ]]; then
                log_error "Cannot send unsigned message in enforce mode"
                return 1
            fi
        fi
    fi

    # Write message atomically with inbox-level lock to prevent concurrent write races
    local inbox_lock="$recipient_inbox/.lock"
    {
        flock -x 201

        # Write to temp file first
        local temp_file="$msg_file.tmp"
        echo "$message" > "$temp_file"
        sync  # Force filesystem flush to ensure durability
        mv "$temp_file" "$msg_file"
        sync  # Force final flush after move

    } 201>"$inbox_lock"

    # Also copy to sender's outbox for record-keeping
    local sender_outbox="$MESSAGE_BASE_DIR/$from/outbox"
    if [[ -d "$sender_outbox" ]]; then
        cp "$msg_file" "$sender_outbox/$msg_id.json"
        sync  # Ensure outbox write is flushed
    fi

    log_info "Sent message: $from -> $to [$msg_type] ($msg_id)"

    echo "$msg_id"
    return 0
}

# Receive messages for an agent
# Usage: receive_messages <agent-id>
# Returns: JSON array of messages sorted by timestamp (chronological order)
receive_messages() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Agent ID required"
        return 1
    fi

    # SECURITY: Validate agent_id to prevent path traversal
    if ! validate_agent_id "$agent_id"; then
        return 1
    fi

    local inbox_dir="$MESSAGE_BASE_DIR/$agent_id/inbox"

    if [[ ! -d "$inbox_dir" ]]; then
        log_error "Inbox not found for agent: $agent_id"
        return 1
    fi

    # Count messages (WSL-safe: use ls instead of find)
    local msg_count=$(ls -1 "$inbox_dir"/*.json 2>/dev/null | wc -l)

    if [[ $msg_count -eq 0 ]]; then
        echo "[]"
        return 0
    fi

    # Verify signatures if authentication is enabled
    if [[ "${CFN_AUTH_ENABLED}" == "true" ]] && [[ "${CFN_AUTH_MODE}" != "disabled" ]] && command -v verify_signature >/dev/null 2>&1; then
        local verified_count=0
        local rejected_count=0

        for msg_file in "$inbox_dir"/*.json; do
            if [[ ! -f "$msg_file" ]]; then
                continue
            fi

            # Extract message details using jq or bash fallback
            local msg_from
            local msg_signature
            local msg_version

            if command -v jq >/dev/null 2>&1; then
                msg_from=$(jq -r '.from // ""' "$msg_file" 2>/dev/null)
                msg_signature=$(jq -r '.signature // ""' "$msg_file" 2>/dev/null)
                msg_version=$(jq -r '.version // "1.0"' "$msg_file" 2>/dev/null)
            else
                # Bash fallback: extract fields using grep/sed
                msg_from=$(grep -o '"from":\s*"[^"]*"' "$msg_file" | sed 's/.*"\([^"]*\)"/\1/' || echo "")
                msg_signature=$(grep -o '"signature":\s*"[^"]*"' "$msg_file" | sed 's/.*"\([^"]*\)"/\1/' || echo "")
                msg_version=$(grep -o '"version":\s*"[^"]*"' "$msg_file" | sed 's/.*"\([^"]*\)"/\1/' || echo "1.0")
            fi

            # Skip verification for v1.0 messages (backward compatibility)
            if [[ "$msg_version" == "1.0" ]] || [[ -z "$msg_signature" ]]; then
                log_warn "Unsigned message from $msg_from (version: $msg_version) - backward compatibility"
                continue
            fi

            # Create canonical message for verification (without signature)
            local canonical
            if command -v jq >/dev/null 2>&1; then
                canonical=$(jq -S -c 'del(.signature)' "$msg_file" 2>/dev/null)
            else
                # Bash fallback: remove signature field
                canonical=$(sed 's/,"signature":"[^"]*"//g' "$msg_file")
            fi

            # Verify signature
            if verify_signature "$msg_from" "$canonical" "$msg_signature" 2>/dev/null; then
                verified_count=$((verified_count + 1))
                log_info "Signature verified for message from $msg_from"
            else
                rejected_count=$((rejected_count + 1))
                log_error "Signature verification FAILED for message from $msg_from"

                # Enforce mode: reject invalid messages
                if [[ "${CFN_AUTH_MODE}" == "enforce" ]]; then
                    rm -f "$msg_file"
                    log_info "Rejected unsigned/invalid message from $msg_from (enforce mode)"
                else
                    log_warn "Invalid signature from $msg_from (warn mode - message retained)"
                fi
            fi
        done

        if [[ $verified_count -gt 0 ]] || [[ $rejected_count -gt 0 ]]; then
            log_info "Signature verification: $verified_count verified, $rejected_count rejected (mode: ${CFN_AUTH_MODE})"
        fi
    fi

    # Extract timestamp and sequence from message files and sort
    # Format: timestamp:sequence:filename (e.g., 1696594335:5:msg-1696594335-042.json)
    local sorted_files=$(mktemp)

    for msg_file in "$inbox_dir"/*.json; do
        if [[ ! -f "$msg_file" ]]; then
            continue
        fi

        # Extract timestamp from JSON (field 5 in the message structure)
        local timestamp=$(grep '"timestamp":' "$msg_file" | head -n 1 | sed 's/.*"timestamp":\s*\([0-9]*\).*/\1/')
        # Extract sequence from JSON
        local sequence=$(grep '"sequence":' "$msg_file" | head -n 1 | sed 's/.*"sequence":\s*\([0-9]*\).*/\1/')
        local filename=$(basename "$msg_file")

        # Output timestamp:sequence:filename for sorting
        echo "$timestamp:$sequence:$filename" >> "$sorted_files"
    done

    # Sort by timestamp (field 1, numeric), then sequence (field 2, numeric) and build JSON array
    echo "["
    local first=true

    while IFS=: read -r timestamp sequence filename; do
        local msg_file="$inbox_dir/$filename"

        if [[ "$first" == "true" ]]; then
            first=false
        else
            echo ","
        fi

        cat "$msg_file"
    done < <(sort -t: -k1,1n -k2,2n "$sorted_files")

    echo "]"

    # Cleanup temp file
    rm -f "$sorted_files"

    log_info "Retrieved $msg_count messages for $agent_id (sorted by timestamp)"
    return 0
}

# Clear inbox messages after processing
# Usage: clear_inbox <agent-id>
clear_inbox() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Agent ID required"
        return 1
    fi

    # SECURITY: Validate agent_id to prevent path traversal
    if ! validate_agent_id "$agent_id"; then
        return 1
    fi

    local inbox_dir="$MESSAGE_BASE_DIR/$agent_id/inbox"

    if [[ ! -d "$inbox_dir" ]]; then
        log_error "Inbox not found for agent: $agent_id"
        return 1
    fi

    # WSL-safe: use ls instead of find
    local msg_count=$(ls -1 "$inbox_dir"/*.json 2>/dev/null | wc -l)

    if [[ $msg_count -gt 0 ]]; then
        rm -f "$inbox_dir"/*.json
        log_info "Cleared $msg_count messages from $agent_id inbox"
    fi

    return 0
}

# Get message count for an agent
# Usage: message_count <agent-id> <inbox|outbox>
message_count() {
    local agent_id="$1"
    local box_type="${2:-inbox}"

    if [[ -z "$agent_id" ]]; then
        log_error "Agent ID required"
        return 1
    fi

    # SECURITY: Validate agent_id to prevent path traversal
    if ! validate_agent_id "$agent_id"; then
        return 1
    fi

    local box_dir="$MESSAGE_BASE_DIR/$agent_id/$box_type"

    if [[ ! -d "$box_dir" ]]; then
        echo "0"
        return 0
    fi

    # WSL-safe: use ls instead of find (<10ms)
    ls -1 "$box_dir"/*.json 2>/dev/null | wc -l
}

# Cleanup message bus for an agent
# Usage: cleanup_message_bus <agent-id>
cleanup_message_bus() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Agent ID required"
        return 1
    fi

    # SECURITY: Validate agent_id to prevent path traversal
    if ! validate_agent_id "$agent_id"; then
        return 1
    fi

    local agent_dir="$MESSAGE_BASE_DIR/$agent_id"

    if [[ -d "$agent_dir" ]]; then
        local inbox_count=$(message_count "$agent_id" "inbox")
        local outbox_count=$(message_count "$agent_id" "outbox")

        rm -rf "$agent_dir"
        log_info "Cleaned up message bus for $agent_id (inbox: $inbox_count, outbox: $outbox_count)"
    else
        log_info "No message bus to cleanup for $agent_id"
    fi

    return 0
}

# Initialize entire message bus system
# Usage: init_message_bus_system
init_message_bus_system() {
    mkdir -p "$MESSAGE_BASE_DIR"
    chmod 755 "$MESSAGE_BASE_DIR"
    log_info "Message bus system initialized at $MESSAGE_BASE_DIR"
    return 0
}

# Cleanup entire message bus system
# Usage: cleanup_message_bus_system
cleanup_message_bus_system() {
    if [[ -d "$MESSAGE_BASE_DIR" ]]; then
        # WSL-safe: count directories with glob expansion
        local agent_count=0
        for agent_dir in "$MESSAGE_BASE_DIR"/*; do
            [[ -d "$agent_dir" ]] && agent_count=$((agent_count + 1))
        done
        rm -rf "$MESSAGE_BASE_DIR"
        log_info "Message bus system cleaned up ($agent_count agents)"
    fi
    return 0
}

# Main command dispatcher
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    command="${1:-}"
    shift || true

    case "$command" in
        init)
            init_message_bus "$@"
            ;;
        send)
            send_message "$@"
            ;;
        receive)
            receive_messages "$@"
            ;;
        clear)
            clear_inbox "$@"
            ;;
        count)
            message_count "$@"
            ;;
        cleanup)
            cleanup_message_bus "$@"
            ;;
        init-system)
            init_message_bus_system
            ;;
        cleanup-system)
            cleanup_message_bus_system
            ;;
        *)
            echo "Usage: $0 {init|send|receive|clear|count|cleanup|init-system|cleanup-system} [args]"
            echo ""
            echo "Commands:"
            echo "  init <agent-id>                     - Initialize message bus for agent"
            echo "  send <from> <to> <type> <payload>   - Send message between agents"
            echo "  receive <agent-id>                  - Receive messages (JSON array)"
            echo "  clear <agent-id>                    - Clear inbox after processing"
            echo "  count <agent-id> [inbox|outbox]     - Get message count"
            echo "  cleanup <agent-id>                  - Cleanup agent's message bus"
            echo "  init-system                         - Initialize message bus system"
            echo "  cleanup-system                      - Cleanup entire message bus"
            exit 1
            ;;
    esac
fi
