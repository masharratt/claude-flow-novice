#!/usr/bin/env bash
# Structured logging utilities for CFN system
# Compatible with TypeScript logging.ts format

# Get current timestamp in ISO 8601 format (UTC)
get_timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Output structured JSON log
# Usage: log_json "level" "message" '{"context":"json"}'
log_json() {
    local level="${1:-info}"
    local message="${2:-}"
    local context="${3:-{}}"
    local timestamp
    timestamp=$(get_timestamp)

    # Escape message for JSON (basic escaping)
    message=$(echo "$message" | sed 's/"/\\"/g' | sed 's/\\/\\\\/g')

    # Output JSON (ensure context is valid JSON)
    if [ "$context" = "{}" ]; then
        echo "{\"timestamp\":\"$timestamp\",\"level\":\"$level\",\"message\":\"$message\"}"
    else
        # Remove outer braces from context and merge
        context_inner=$(echo "$context" | sed 's/^{//' | sed 's/}$//')
        echo "{\"timestamp\":\"$timestamp\",\"level\":\"$level\",\"message\":\"$message\",\"context\":{$context_inner}}"
    fi
}

# Info level log
# Usage: log_info "message" '{"key":"value"}'
log_info() {
    local message="${1:-}"
    local context="${2:-{}}"
    log_json "info" "$message" "$context" >&2
}

# Warning level log
# Usage: log_warn "message" '{"key":"value"}'
log_warn() {
    local message="${1:-}"
    local context="${2:-{}}"
    log_json "warn" "$message" "$context" >&2
}

# Error level log
# Usage: log_error "message" '{"key":"value"}'
log_error() {
    local message="${1:-}"
    local context="${2:-{}}"
    log_json "error" "$message" "$context" >&2
}

# Debug level log (respects LOG_LEVEL env var)
# Usage: LOG_LEVEL=debug log_debug "message" '{"key":"value"}'
log_debug() {
    local message="${1:-}"
    local context="${2:-{}}"

    # Only output if LOG_LEVEL is debug or trace
    if [[ "${LOG_LEVEL:-info}" =~ ^(debug|trace)$ ]]; then
        log_json "debug" "$message" "$context" >&2
    fi
}

# Generate correlation ID (compatible with TypeScript UUID format)
# Usage: CORRELATION_ID=$(generate_correlation_id)
generate_correlation_id() {
    # Try uuidgen first, fallback to timestamp+pid+random
    if command -v uuidgen >/dev/null 2>&1; then
        uuidgen | tr '[:upper:]' '[:lower:]'
    else
        echo "$(date +%s)-$$-$RANDOM"
    fi
}
