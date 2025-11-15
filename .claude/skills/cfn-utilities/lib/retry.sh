#!/usr/bin/env bash
# Retry logic with exponential backoff for CFN system

# Source logging if not already loaded
if ! declare -f log_info >/dev/null 2>&1; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "$SCRIPT_DIR/logging.sh"
fi

# Retry command with exponential backoff
# Usage: retry_with_backoff max_attempts base_delay_sec command [args...]
# Example: retry_with_backoff 3 2 curl -f https://api.example.com
retry_with_backoff() {
    local max_attempts="${1:-3}"
    local base_delay="${2:-2}"
    shift 2
    local command=("$@")

    local attempt=1
    local delay=$base_delay

    while [ $attempt -le "$max_attempts" ]; do
        log_debug "Attempt $attempt/$max_attempts: ${command[*]}" "{\"attempt\":$attempt,\"max\":$max_attempts}"

        # Execute command and capture exit code immediately
        "${command[@]}"
        local exit_code=$?

        # Check if command succeeded
        if [ $exit_code -eq 0 ]; then
            if [ $attempt -gt 1 ]; then
                log_info "Command succeeded after retries" "{\"attempts\":$attempt,\"command\":\"${command[0]}\"}"
            fi
            return 0
        fi

        # Last attempt failed
        if [ $attempt -eq "$max_attempts" ]; then
            log_error "Command failed after $max_attempts attempts" "{\"command\":\"${command[0]}\",\"exit_code\":$exit_code}"
            return $exit_code
        fi

        # Calculate next delay (exponential backoff: delay = base * 2^(attempt-1))
        log_warn "Command failed, retrying in ${delay}s" "{\"attempt\":$attempt,\"delay\":$delay,\"exit_code\":$exit_code}"
        sleep "$delay"

        attempt=$((attempt + 1))
        delay=$((delay * 2))
    done

    return 1
}

# Retry with fixed delay (no exponential backoff)
# Usage: retry_fixed max_attempts delay_sec command [args...]
retry_fixed() {
    local max_attempts="${1:-3}"
    local delay="${2:-2}"
    shift 2
    local command=("$@")

    local attempt=1

    while [ $attempt -le "$max_attempts" ]; do
        log_debug "Attempt $attempt/$max_attempts: ${command[*]}" "{\"attempt\":$attempt}"

        "${command[@]}"
        local exit_code=$?

        if [ $exit_code -eq 0 ]; then
            return 0
        fi

        if [ $attempt -eq "$max_attempts" ]; then
            log_error "Command failed after $max_attempts attempts" "{\"command\":\"${command[0]}\",\"exit_code\":$exit_code}"
            return $exit_code
        fi

        log_warn "Command failed, retrying in ${delay}s" "{\"attempt\":$attempt,\"delay\":$delay}"
        sleep "$delay"

        attempt=$((attempt + 1))
    done

    return 1
}

# Retry until timeout (wall-clock timeout instead of attempt count)
# Usage: retry_until_timeout timeout_sec delay_sec command [args...]
retry_until_timeout() {
    local timeout_sec="${1:-60}"
    local delay="${2:-2}"
    shift 2
    local command=("$@")

    local start_time
    start_time=$(date +%s)
    local end_time=$((start_time + timeout_sec))

    local attempt=1

    while [ "$(date +%s)" -lt "$end_time" ]; do
        log_debug "Attempt $attempt (timeout in $((end_time - $(date +%s)))s): ${command[*]}" "{\"attempt\":$attempt}"

        "${command[@]}"
        local exit_code=$?

        if [ $exit_code -eq 0 ]; then
            return 0
        fi

        local current_time
        current_time=$(date +%s)

        if [ "$current_time" -ge "$end_time" ]; then
            log_error "Command timed out after ${timeout_sec}s" "{\"command\":\"${command[0]}\",\"attempts\":$attempt,\"exit_code\":$exit_code}"
            return 130  # Timeout exit code
        fi

        log_warn "Command failed, retrying in ${delay}s" "{\"attempt\":$attempt,\"remaining_time\":$((end_time - current_time))}"
        sleep "$delay"

        attempt=$((attempt + 1))
    done

    return 130
}
