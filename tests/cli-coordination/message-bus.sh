#!/bin/bash
# Message Bus Foundation v1.0
# Agent-to-agent messaging infrastructure for CFN MVP coordination

set -euo pipefail

# Configuration
MESSAGE_BASE_DIR="${MESSAGE_BASE_DIR:-/dev/shm/cfn-mvp/messages}"
MESSAGE_VERSION="1.0"

# Logging
log_info() {
    echo "[$(date '+%H:%M:%S')] [MESSAGE-BUS] $*" >&2
}

log_error() {
    echo "[$(date '+%H:%M:%S')] [MESSAGE-BUS] ERROR: $*" >&2
}

# Initialize message bus for an agent
# Usage: init_message_bus <agent-id>
init_message_bus() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Agent ID required"
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
    local seq_file="$MESSAGE_BASE_DIR/$from/.sequences/$to"
    local lock_file="$MESSAGE_BASE_DIR/$from/.sequences/$to.lock"

    mkdir -p "$MESSAGE_BASE_DIR/$from/.sequences"

    # Initialize sequence file to 0 if it doesn't exist
    if [[ ! -f "$seq_file" ]]; then
        echo "0" > "$seq_file"
    fi

    # ATOMIC increment with flock to prevent race conditions
    # Retry up to 3 times with exponential backoff if lock acquisition fails
    local retries=3
    local wait_time=10

    while [ $retries -gt 0 ]; do
        {
            if flock -x -w $wait_time 200; then
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

    local recipient_inbox="$MESSAGE_BASE_DIR/$to/inbox"

    # Validate recipient inbox exists
    if [[ ! -d "$recipient_inbox" ]]; then
        log_error "Recipient inbox not found: $to"
        return 1
    fi

    # Inbox overflow protection: FIFO eviction at 100 messages
    local inbox_count=$(find "$recipient_inbox" -maxdepth 1 -name "*.json" -type f 2>/dev/null | wc -l)

    if [[ $inbox_count -ge 100 ]]; then
        # Find oldest message by modification time
        local oldest_msg=$(find "$recipient_inbox" -maxdepth 1 -name "*.json" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | head -n 1 | cut -d' ' -f2-)

        if [[ -n "$oldest_msg" ]]; then
            local oldest_msg_id=$(basename "$oldest_msg" .json)
            rm -f "$oldest_msg"
            log_info "WARN: Inbox overflow for $to (${inbox_count} messages), evicted oldest: $oldest_msg_id"
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

    local inbox_dir="$MESSAGE_BASE_DIR/$agent_id/inbox"

    if [[ ! -d "$inbox_dir" ]]; then
        log_error "Inbox not found for agent: $agent_id"
        return 1
    fi

    # Count messages
    local msg_count=$(find "$inbox_dir" -maxdepth 1 -name "*.json" -type f 2>/dev/null | wc -l)

    if [[ $msg_count -eq 0 ]]; then
        echo "[]"
        return 0
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

    local inbox_dir="$MESSAGE_BASE_DIR/$agent_id/inbox"

    if [[ ! -d "$inbox_dir" ]]; then
        log_error "Inbox not found for agent: $agent_id"
        return 1
    fi

    local msg_count=$(find "$inbox_dir" -maxdepth 1 -name "*.json" -type f 2>/dev/null | wc -l)

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

    local box_dir="$MESSAGE_BASE_DIR/$agent_id/$box_type"

    if [[ ! -d "$box_dir" ]]; then
        echo "0"
        return 0
    fi

    find "$box_dir" -maxdepth 1 -name "*.json" -type f 2>/dev/null | wc -l
}

# Cleanup message bus for an agent
# Usage: cleanup_message_bus <agent-id>
cleanup_message_bus() {
    local agent_id="$1"

    if [[ -z "$agent_id" ]]; then
        log_error "Agent ID required"
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
        local agent_count=$(find "$MESSAGE_BASE_DIR" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l)
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
