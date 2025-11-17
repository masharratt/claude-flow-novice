---
name: error-handling
category: foundation
team: foundation
approval_level: auto
approval_criteria:
  max_commands: 3
  test_coverage: 0.95
  no_external_calls: true
tags: [bash, error-handling, foundation]
version: 1.0.0
owner: cfn-core
---

# Error Handling - Bootstrap Skill

## Overview
Comprehensive bash error handling patterns including strict mode, exit codes, trap usage, and cleanup handlers. Essential foundation for robust script development.

## Strict Mode

### Basic Strict Mode
```bash
#!/bin/bash
set -euo pipefail

# -e: Exit immediately if a command exits with a non-zero status
# -u: Treat unset variables as an error
# -o pipefail: Return value of a pipeline is the status of the last command to exit with a non-zero status

echo "Running in strict mode"
```

### Debugging Mode
```bash
#!/bin/bash
set -euxo pipefail

# -x: Print commands and their arguments as they are executed (debug mode)

# Conditional debug mode
if [[ "${DEBUG:-}" == "true" ]]; then
    set -x
fi
```

### Selectively Disable Strict Mode
```bash
#!/bin/bash
set -euo pipefail

# Temporarily allow errors
set +e
command_that_may_fail
EXIT_CODE=$?
set -e

if [[ $EXIT_CODE -ne 0 ]]; then
    echo "Command failed with exit code: $EXIT_CODE"
fi
```

## Exit Code Management

### Standard Exit Codes
```bash
#!/bin/bash

# Standard exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL_ERROR=1
readonly EXIT_MISUSE=2
readonly EXIT_NO_PERMISSION=126
readonly EXIT_NOT_FOUND=127
readonly EXIT_INVALID_ARG=128
readonly EXIT_SIGTERM=143

# Usage
if [[ ! -f "$FILE" ]]; then
    echo "ERROR: File not found: $FILE" >&2
    exit "$EXIT_NOT_FOUND"
fi
```

### Custom Exit Codes
```bash
#!/bin/bash

# Application-specific exit codes (64-113 reserved for application use)
readonly EXIT_CONFIG_ERROR=64
readonly EXIT_DATABASE_ERROR=65
readonly EXIT_NETWORK_ERROR=66
readonly EXIT_VALIDATION_ERROR=67
readonly EXIT_TIMEOUT=68

validate_config() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        echo "ERROR: Configuration file not found" >&2
        exit "$EXIT_CONFIG_ERROR"
    fi
}
```

### Capture and Propagate Exit Codes
```bash
run_command_with_exit_code() {
    local command="$1"
    local exit_code=0

    # Run command and capture exit code
    set +e
    $command
    exit_code=$?
    set -e

    # Log and propagate
    if [[ $exit_code -ne 0 ]]; then
        echo "ERROR: Command failed with exit code $exit_code: $command" >&2
    fi

    return $exit_code
}

# Usage
if ! run_command_with_exit_code "some_command"; then
    echo "Command execution failed"
    exit 1
fi
```

## Trap Usage and Cleanup

### Basic Trap Pattern
```bash
#!/bin/bash
set -euo pipefail

cleanup() {
    local exit_code=$?
    echo "Cleaning up... (exit code: $exit_code)"

    # Cleanup operations
    rm -f /tmp/temp-file-$$

    exit $exit_code
}

trap cleanup EXIT

# Script continues...
echo "Working..."
```

### Multiple Trap Handlers
```bash
#!/bin/bash
set -euo pipefail

cleanup_temp_files() {
    echo "Removing temporary files..."
    rm -rf /tmp/work-dir-$$
}

cleanup_locks() {
    echo "Releasing locks..."
    rm -f /tmp/script.lock
}

cleanup_all() {
    cleanup_temp_files
    cleanup_locks
}

trap cleanup_all EXIT
trap 'echo "Interrupted"; exit 130' INT TERM
```

### Error Trap with Stack Trace
```bash
#!/bin/bash
set -euo pipefail

error_handler() {
    local exit_code=$?
    local line_number=$1

    echo "ERROR: Command failed with exit code $exit_code at line $line_number" >&2

    # Print stack trace
    echo "Stack trace:" >&2
    local frame=0
    while caller $frame; do
        ((frame++))
    done

    exit $exit_code
}

trap 'error_handler ${LINENO}' ERR

# Script continues...
```

### Signal-Specific Handlers
```bash
#!/bin/bash
set -euo pipefail

# Handle SIGINT (Ctrl+C)
handle_sigint() {
    echo "Received SIGINT, performing graceful shutdown..." >&2
    cleanup
    exit 130
}

# Handle SIGTERM
handle_sigterm() {
    echo "Received SIGTERM, performing graceful shutdown..." >&2
    cleanup
    exit 143
}

# Handle SIGHUP (terminal closed)
handle_sighup() {
    echo "Received SIGHUP, continuing in background..." >&2
}

trap handle_sigint INT
trap handle_sigterm TERM
trap handle_sighup HUP
```

## Error Logging

### Structured Error Logging
```bash
log_error() {
    local level="${1:-ERROR}"
    local message="$2"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    echo "[${timestamp}] [${level}] ${message}" >&2
}

log_error "ERROR" "Database connection failed"
log_error "WARN" "Configuration file missing, using defaults"
log_error "FATAL" "Critical system error, aborting"
```

### Error Context Capture
```bash
log_error_with_context() {
    local message="$1"
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local script_name=$(basename "$0")
    local line_number="${BASH_LINENO[0]}"
    local function_name="${FUNCNAME[1]:-main}"

    cat >&2 <<EOF
[${timestamp}] ERROR in ${script_name}
  Function: ${function_name}
  Line: ${line_number}
  Message: ${message}
EOF
}

# Usage
if ! validate_input "$USER_INPUT"; then
    log_error_with_context "Invalid user input: $USER_INPUT"
    exit 1
fi
```

### Error Aggregation
```bash
declare -a ERROR_LOG=()

add_error() {
    local message="$1"
    ERROR_LOG+=("$message")
    log_error "ERROR" "$message"
}

print_error_summary() {
    if [[ ${#ERROR_LOG[@]} -gt 0 ]]; then
        echo "ERROR SUMMARY (${#ERROR_LOG[@]} errors):" >&2
        printf '  - %s\n' "${ERROR_LOG[@]}" >&2
        return 1
    fi
    return 0
}

# Usage
validate_all_inputs() {
    if [[ -z "${INPUT1:-}" ]]; then
        add_error "INPUT1 is required"
    fi

    if [[ -z "${INPUT2:-}" ]]; then
        add_error "INPUT2 is required"
    fi

    print_error_summary
}
```

## Defensive Programming

### Parameter Validation
```bash
validate_parameters() {
    local param_name="$1"
    local param_value="${2:-}"
    local param_type="${3:-string}"

    # Check if parameter is set
    if [[ -z "$param_value" ]]; then
        log_error "ERROR" "Parameter '$param_name' is required but not set"
        return 1
    fi

    # Type-specific validation
    case "$param_type" in
        int)
            if ! [[ "$param_value" =~ ^[0-9]+$ ]]; then
                log_error "ERROR" "Parameter '$param_name' must be an integer, got: $param_value"
                return 1
            fi
            ;;
        file)
            if [[ ! -f "$param_value" ]]; then
                log_error "ERROR" "File not found: $param_value"
                return 1
            fi
            ;;
        dir)
            if [[ ! -d "$param_value" ]]; then
                log_error "ERROR" "Directory not found: $param_value"
                return 1
            fi
            ;;
    esac

    return 0
}

# Usage
validate_parameters "CONFIG_FILE" "$CONFIG_FILE" "file" || exit 1
validate_parameters "TIMEOUT" "$TIMEOUT" "int" || exit 1
```

### Null/Empty Checks
```bash
# Check if variable is set and non-empty
require_variable() {
    local var_name="$1"
    local var_value="${!var_name:-}"

    if [[ -z "$var_value" ]]; then
        log_error "FATAL" "Required variable '$var_name' is not set"
        exit 1
    fi
}

# Usage
require_variable "DATABASE_PATH"
require_variable "API_KEY"
```

### Command Existence Check
```bash
require_command() {
    local command="$1"

    if ! command -v "$command" &>/dev/null; then
        log_error "FATAL" "Required command not found: $command"
        exit 127
    fi
}

# Check multiple commands
require_commands() {
    local missing=()

    for cmd in "$@"; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "FATAL" "Missing required commands: ${missing[*]}"
        exit 127
    fi
}

# Usage
require_commands sqlite3 jq curl
```

## Retry Logic

### Simple Retry Pattern
```bash
retry_command() {
    local max_attempts="$1"
    shift
    local command=("$@")
    local attempt=1

    while ((attempt <= max_attempts)); do
        if "${command[@]}"; then
            return 0
        fi

        log_error "WARN" "Attempt $attempt/$max_attempts failed: ${command[*]}"
        ((attempt++))

        if ((attempt <= max_attempts)); then
            sleep $((2 ** (attempt - 1)))  # Exponential backoff
        fi
    done

    log_error "ERROR" "Command failed after $max_attempts attempts: ${command[*]}"
    return 1
}

# Usage
retry_command 3 curl -f https://api.example.com/data
```

### Retry with Timeout
```bash
retry_with_timeout() {
    local max_attempts="$1"
    local timeout="$2"
    shift 2
    local command=("$@")
    local attempt=1

    while ((attempt <= max_attempts)); do
        if timeout "$timeout" "${command[@]}"; then
            return 0
        fi

        local exit_code=$?
        if [[ $exit_code -eq 124 ]]; then
            log_error "WARN" "Attempt $attempt/$max_attempts timed out after ${timeout}s"
        else
            log_error "WARN" "Attempt $attempt/$max_attempts failed with exit code $exit_code"
        fi

        ((attempt++))
        [[ $attempt -le $max_attempts ]] && sleep 2
    done

    return 1
}

# Usage
retry_with_timeout 3 10 curl -f https://slow-api.example.com/data
```

## Error Recovery

### Fallback Pattern
```bash
get_config_value() {
    local key="$1"
    local default="${2:-}"
    local value

    # Try primary source
    if value=$(sqlite3 config.db "SELECT value FROM config WHERE key='$key';" 2>/dev/null); then
        echo "$value"
        return 0
    fi

    log_error "WARN" "Failed to read config from database, trying file..."

    # Try fallback source
    if value=$(grep "^${key}=" config.txt 2>/dev/null | cut -d'=' -f2); then
        echo "$value"
        return 0
    fi

    log_error "WARN" "Config key '$key' not found, using default: $default"
    echo "$default"
}
```

### Graceful Degradation
```bash
process_with_degradation() {
    local input="$1"

    # Try optimal method
    if process_optimal "$input" 2>/dev/null; then
        return 0
    fi

    log_error "WARN" "Optimal processing failed, trying fallback method..."

    # Try fallback method
    if process_fallback "$input"; then
        return 0
    fi

    log_error "ERROR" "All processing methods failed"
    return 1
}
```

## Test-Driven Error Handling

### Test Error Scenarios
```bash
test_error_handling() {
    local test_name="$1"
    local expected_exit_code="$2"
    shift 2
    local command=("$@")

    local actual_exit_code=0
    set +e
    "${command[@]}" &>/dev/null
    actual_exit_code=$?
    set -e

    if [[ $actual_exit_code -eq $expected_exit_code ]]; then
        echo "PASS: $test_name (exit code: $actual_exit_code)"
        return 0
    else
        echo "FAIL: $test_name (expected: $expected_exit_code, got: $actual_exit_code)"
        return 1
    fi
}

# Usage
test_error_handling "Missing file" 127 process_file "/nonexistent/file.txt"
test_error_handling "Invalid argument" 1 validate_input ""
```

### Assert Pattern
```bash
assert_success() {
    local command=("$@")

    if ! "${command[@]}"; then
        log_error "FATAL" "Assertion failed: ${command[*]}"
        exit 1
    fi
}

assert_failure() {
    local command=("$@")

    if "${command[@]}"; then
        log_error "FATAL" "Expected failure but command succeeded: ${command[*]}"
        exit 1
    fi
}

# Usage
assert_success test -f "$REQUIRED_FILE"
assert_failure grep "should_not_exist" "$FILE"
```

## Success Criteria

- ✅ Strict mode enabled (`set -euo pipefail`)
- ✅ Trap handlers for cleanup operations
- ✅ Meaningful exit codes (standard + custom)
- ✅ Structured error logging with context
- ✅ Parameter validation before use
- ✅ Retry logic with exponential backoff
- ✅ Graceful degradation and fallback patterns
- ✅ Test assertions for error scenarios
- ✅ Signal handling for graceful shutdown
- ✅ Stack trace on unexpected errors
