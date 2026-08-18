#!/usr/bin/env bash
# tests/test-utils.sh
# Shared test utilities for CFN Loop test suite
# Provides: logging, assertions, Redis helpers, Docker helpers, test scaffolding

# Prevent multiple sourcing
if [ -n "${TEST_UTILS_LOADED:-}" ]; then
    return 0
fi
TEST_UTILS_LOADED=1

# Enable strict error handling
set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

# Color codes for output
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export MAGENTA='\033[0;35m'
export CYAN='\033[0;36m'
export NC='\033[0m' # No Color

# Test tracking
export TEST_TOTAL=0
export TEST_PASSED=0
export TEST_FAILED=0

# Redis configuration (from environment or defaults)
export REDIS_HOST="${CFN_REDIS_HOST:-localhost}"
export REDIS_PORT="${CFN_REDIS_PORT:-6379}"
# Use network connection (like redis-cli-wrapper.sh) instead of docker exec
# Redis allows passwordless connections on localhost interface in test environment
export REDIS_CLI_CMD="redis-cli -h $REDIS_HOST -p $REDIS_PORT"

# Docker configuration
export DOCKER_NETWORK="${DOCKER_NETWORK:-mcp-network}"
export TEST_TIMEOUT="${TEST_TIMEOUT:-30}"

# ============================================================================
# LOGGING HELPERS
# ============================================================================

# Log a test step (structured)
# Usage: log_step "Phase 1: Validate infrastructure"
log_step() {
    local message="$1"
    echo ""
    echo -e "${CYAN}▶ ${message}${NC}"
    echo "$(date -Iseconds) [STEP] $message" >> "${TEST_LOG:-/dev/null}"
}

# Log informational message
# Usage: log_info "Starting Redis container"
log_info() {
    local message="$1"
    echo -e "${BLUE}ℹ ${message}${NC}"
    echo "$(date -Iseconds) [INFO] $message" >> "${TEST_LOG:-/dev/null}"
}

# Log success message
# Usage: log_success "All tests passed"
log_success() {
    local message="$1"
    echo -e "${GREEN}✅ ${message}${NC}"
    echo "$(date -Iseconds) [SUCCESS] $message" >> "${TEST_LOG:-/dev/null}"
}

# Log warning message
# Usage: log_warn "Redis connection slow"
log_warn() {
    local message="$1"
    echo -e "${YELLOW}⚠ ${message}${NC}"
    echo "$(date -Iseconds) [WARN] $message" >> "${TEST_LOG:-/dev/null}"
}

# Log error message
# Usage: log_error "Test failed"
log_error() {
    local message="$1"
    echo -e "${RED}❌ ${message}${NC}"
    echo "$(date -Iseconds) [ERROR] $message" >> "${TEST_LOG:-/dev/null}"
}

# Annotate section for CI visibility
# Usage: annotate "Running Phase 2 tests"
annotate() {
    local message="$1"
    echo ""
    echo "========================================"
    echo "$message"
    echo "========================================"
    echo ""
}

# Backward compatibility aliases
log_pass() { log_success "$@"; }
log_fail() { log_error "$@"; }

# ============================================================================
# ASSERTION HELPERS
# ============================================================================

# Assert command succeeds
# Usage: assert_success "Test name" command args...
assert_success() {
    TEST_TOTAL=$((TEST_TOTAL + 1))
    local test_name="${1:-Test $TEST_TOTAL}"
    shift || true

    if "$@" >/dev/null 2>&1; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: $test_name"
        return 0
    else
        TEST_FAILED=$((TEST_FAILED + 1))
        log_error "FAIL: $test_name"
        log_error "Command failed: $*"
        return 1
    fi
}

# Assert command fails
# Usage: assert_failure "Test name" command args...
assert_failure() {
    TEST_TOTAL=$((TEST_TOTAL + 1))
    local test_name="${1:-Test $TEST_TOTAL}"
    shift || true

    if ! "$@" >/dev/null 2>&1; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: $test_name"
        return 0
    else
        TEST_FAILED=$((TEST_FAILED + 1))
        log_error "FAIL: $test_name (expected failure)"
        return 1
    fi
}

# Assert strings are equal
# Usage: assert_equals "Expected value" "$actual_value" "Test description"
assert_equals() {
    TEST_TOTAL=$((TEST_TOTAL + 1))
    local expected="$1"
    local actual="$2"
    local test_name="${3:-Test $TEST_TOTAL}"

    if [ "$expected" = "$actual" ]; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: $test_name"
        return 0
    else
        TEST_FAILED=$((TEST_FAILED + 1))
        log_error "FAIL: $test_name"
        log_error "Expected: $expected"
        log_error "Actual:   $actual"
        return 1
    fi
}

# Assert string contains substring
# Usage: assert_contains "$output" "expected substring" "Test description"
assert_contains() {
    TEST_TOTAL=$((TEST_TOTAL + 1))
    local haystack="$1"
    local needle="$2"
    local test_name="${3:-Test $TEST_TOTAL}"

    if echo "$haystack" | grep -qF -- "$needle"; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: $test_name"
        return 0
    else
        TEST_FAILED=$((TEST_FAILED + 1))
        log_error "FAIL: $test_name"
        log_error "String does not contain: $needle"
        return 1
    fi
}

# Assert string does not contain substring
# Usage: assert_not_contains "$output" "unexpected string" "Test description"
assert_not_contains() {
    TEST_TOTAL=$((TEST_TOTAL + 1))
    local haystack="$1"
    local needle="$2"
    local test_name="${3:-Test $TEST_TOTAL}"

    if ! echo "$haystack" | grep -qF -- "$needle"; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: $test_name"
        return 0
    else
        TEST_FAILED=$((TEST_FAILED + 1))
        log_error "FAIL: $test_name"
        log_error "String unexpectedly contains: $needle"
        return 1
    fi
}

# Assert value is not empty
# Usage: assert_not_empty "$value" "Test description"
assert_not_empty() {
    TEST_TOTAL=$((TEST_TOTAL + 1))
    local value="$1"
    local test_name="${2:-Value should not be empty}"

    if [ -n "$value" ]; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: $test_name"
        return 0
    else
        TEST_FAILED=$((TEST_FAILED + 1))
        log_error "FAIL: $test_name"
        return 1
    fi
}

# Assert file exists
# Usage: assert_file_exists "/path/to/file" "Test description"
assert_file_exists() {
    TEST_TOTAL=$((TEST_TOTAL + 1))
    local file_path="$1"
    local test_name="${2:-File exists: $file_path}"

    if [ -f "$file_path" ]; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: $test_name"
        return 0
    else
        TEST_FAILED=$((TEST_FAILED + 1))
        log_error "FAIL: $test_name"
        log_error "File not found: $file_path"
        return 1
    fi
}

# Assert directory exists
# Usage: assert_dir_exists "/path/to/dir" "Test description"
assert_dir_exists() {
    TEST_TOTAL=$((TEST_TOTAL + 1))
    local dir_path="$1"
    local test_name="${2:-Directory exists: $dir_path}"

    if [ -d "$dir_path" ]; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: $test_name"
        return 0
    else
        TEST_FAILED=$((TEST_FAILED + 1))
        log_error "FAIL: $test_name"
        log_error "Directory not found: $dir_path"
        return 1
    fi
}

# ============================================================================
# REDIS HELPERS
# ============================================================================

# Set Redis key-value pair
# Usage: redis_set "mykey" "myvalue"
redis_set() {
    local key="$1"
    local value="$2"
    local result

    result=$($REDIS_CLI_CMD SET "$key" "$value" 2>&1) || {
        log_error "Redis SET failed: $result"
        return 1
    }

    if [ "$result" = "OK" ]; then
        return 0
    else
        log_error "Redis SET returned unexpected result: $result"
        return 1
    fi
}

# Get Redis value by key
# Usage: value=$(redis_get "mykey")
redis_get() {
    local key="$1"
    $REDIS_CLI_CMD GET "$key" 2>/dev/null || echo ""
}

# Get Redis hash field value
# Usage: value=$(redis_hget "myhash" "field")
redis_hget() {
    local key="$1"
    local field="$2"
    $REDIS_CLI_CMD HGET "$key" "$field" 2>/dev/null || echo ""
}

# Get all Redis hash fields and values
# Usage: result=$(redis_hgetall "myhash")
redis_hgetall() {
    local key="$1"
    $REDIS_CLI_CMD HGETALL "$key" 2>/dev/null || echo ""
}

# Check if Redis key exists
# Usage: if redis_exists "mykey"; then ...
redis_exists() {
    local key="$1"
    local result

    result=$($REDIS_CLI_CMD EXISTS "$key" 2>/dev/null || echo "0")
    [ "$result" = "1" ]
}

# Delete Redis key
# Usage: redis_del "mykey"
redis_del() {
    local key="$1"
    $REDIS_CLI_CMD DEL "$key" >/dev/null 2>&1 || true
}

# Get all keys matching pattern
# Usage: keys=$(redis_keys "swarm:*")
redis_keys() {
    local pattern="$1"
    $REDIS_CLI_CMD KEYS "$pattern" 2>/dev/null || echo ""
}

# Flush all Redis data
# Usage: redis_flush_all
redis_flush_all() {
    log_warn "Flushing all Redis data"
    $REDIS_CLI_CMD FLUSHALL >/dev/null 2>&1 || true
}

# Wait for Redis key to exist
# Usage: redis_wait_for_key "mykey" 10
redis_wait_for_key() {
    local key="$1"
    local timeout="${2:-30}"
    local elapsed=0

    while [ $elapsed -lt "$timeout" ]; do
        if redis_exists "$key"; then
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    log_error "Timeout waiting for Redis key: $key"
    return 1
}

# Verify Redis health
# Usage: if verify_redis_health; then ...
verify_redis_health() {
    local result

    result=$($REDIS_CLI_CMD PING 2>/dev/null || echo "FAILED")

    if [ "$result" = "PONG" ]; then
        return 0
    else
        log_error "Redis health check failed: $result"
        return 1
    fi
}

# ============================================================================
# DOCKER HELPERS
# ============================================================================

# Wait for container to be healthy
# Usage: wait_for_container "container-name" 30
wait_for_container() {
    local container="$1"
    local timeout="${2:-30}"
    local elapsed=0

    log_info "Waiting for container: $container"

    while [ $elapsed -lt "$timeout" ]; do
        if docker ps --filter "name=$container" --filter "status=running" | grep -q "$container"; then
            log_success "Container running: $container"
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    log_error "Timeout waiting for container: $container"
    return 1
}

# Stop and remove container
# Usage: cleanup_container "container-name"
cleanup_container() {
    local container="$1"

    if docker ps -a --filter "name=$container" | grep -q "$container"; then
        log_info "Removing container: $container"
        docker rm -f "$container" >/dev/null 2>&1 || true
    fi
}

# Get container logs
# Usage: logs=$(get_container_logs "container-name" 50)
get_container_logs() {
    local container="$1"
    local lines="${2:-100}"

    docker logs "$container" --tail "$lines" 2>&1 || echo "FAILED_TO_GET_LOGS"
}

# Check if container is running
# Usage: if is_container_running "container-name"; then ...
is_container_running() {
    local container="$1"
    docker ps --filter "name=$container" --filter "status=running" | grep -q "$container"
}

# Execute command in container
# Usage: result=$(container_exec "container-name" "echo hello")
container_exec() {
    local container="$1"
    shift
    docker exec "$container" "$@" 2>&1
}

# Create test network if it doesn't exist
# Usage: ensure_network "test-network"
ensure_network() {
    local network="${1:-$DOCKER_NETWORK}"

    if ! docker network ls | grep -q "$network"; then
        log_info "Creating Docker network: $network"
        docker network create "$network" >/dev/null 2>&1 || true
    fi
}

# Remove test network
# Usage: cleanup_network "test-network"
cleanup_network() {
    local network="${1:-$DOCKER_NETWORK}"

    if docker network ls | grep -q "$network"; then
        log_info "Removing Docker network: $network"
        docker network rm "$network" >/dev/null 2>&1 || true
    fi
}

# ============================================================================
# TEST SCAFFOLDING
# ============================================================================

# Setup test environment
# Usage: setup_test "test-name"
setup_test() {
    local test_name="${1:-test}"

    # Create test log file
    export TEST_LOG="/tmp/${test_name}-$(date +%s).log"

    # Reset counters
    export TEST_TOTAL=0
    export TEST_PASSED=0
    export TEST_FAILED=0

    # Print header
    annotate "Test Suite: $test_name"
    log_info "Started at: $(date -Iseconds)"
    log_info "Log file: $TEST_LOG"

    # Ensure Docker network exists
    ensure_network

    # Verify Redis is available
    if ! verify_redis_health; then
        log_warn "Redis not available, attempting to start"
        docker-compose up -d redis >/dev/null 2>&1 || true
        sleep 3

        if ! verify_redis_health; then
            log_error "Failed to start Redis"
            return 1
        fi
    fi
}

# Teardown test environment (backward compatible)
# Usage: teardown_test
teardown_test() {
    print_test_summary
}

# Print test summary
# Usage: print_test_summary
print_test_summary() {
    # Print test summary
    echo ""
    annotate "Test Summary"
    echo "Total:  $TEST_TOTAL"
    echo -e "Passed: ${GREEN}$TEST_PASSED${NC}"
    echo -e "Failed: ${RED}$TEST_FAILED${NC}"
    echo ""

    if [ "$TEST_FAILED" -eq 0 ]; then
        log_success "All tests passed!"
        return 0
    else
        log_error "$TEST_FAILED test(s) failed"
        return 1
    fi
}

# Generate unique test ID
# Usage: test_id=$(generate_test_id)
generate_test_id() {
    echo "test-$(date +%s)-$$"
}

# Create temporary directory for test
# Usage: tmpdir=$(create_temp_dir)
create_temp_dir() {
    local tmpdir
    tmpdir=$(mktemp -d -t cfn-test.XXXXXX)
    echo "$tmpdir"
}

# Cleanup temporary directory
# Usage: cleanup_temp_dir "$tmpdir"
cleanup_temp_dir() {
    local tmpdir="$1"

    if [ -d "$tmpdir" ]; then
        log_info "Removing temp directory: $tmpdir"
        rm -rf "$tmpdir"
    fi
}

# ============================================================================
# SECURITY UTILITIES
# ============================================================================

# Generate secure random credential for testing
# Usage: TEST_KEY=$(generate_test_credential "hex" 32)
#        TEST_PASSWORD=$(generate_test_credential "base64" 32)
generate_test_credential() {
    local format="${1:-hex}"  # hex or base64
    local length="${2:-32}"
    
    if ! command -v openssl &> /dev/null; then
        log_error "openssl not found - required for secure credential generation"
        return 1
    fi
    
    case "$format" in
        hex)
            openssl rand -hex "$length"
            ;;
        base64)
            openssl rand -base64 "$length"
            ;;
        *)
            log_error "Invalid format: $format (use 'hex' or 'base64')"
            return 1
            ;;
    esac
}

# Mask credential for logging (show first 4 and last 4 characters)
# Usage: masked=$(mask_credential "$API_KEY")
#        log_info "API Key: $(mask_credential "$API_KEY")"
mask_credential() {
    local credential="$1"
    
    if [ -z "$credential" ]; then
        echo "[EMPTY]"
        return
    fi
    
    local length=${#credential}
    
    if [ "$length" -le 8 ]; then
        echo "****"
    else
        local prefix="${credential:0:4}"
        local suffix="${credential: -4}"
        echo "${prefix}...${suffix}"
    fi
}

# Validate required environment variables are set and non-empty
# Usage: validate_required_env "VAR1" "VAR2" "VAR3"
validate_required_env() {
    local missing_vars=()
    
    for var in "$@"; do
        if [ -z "${!var:-}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_error "Missing required environment variables: ${missing_vars[*]}"
        return 1
    fi
    
    return 0
}

# Get secure docker run flags for container hardening
# Usage: docker run $(get_secure_docker_flags) ...
get_secure_docker_flags() {
    cat << 'DOCKER_FLAGS'
--security-opt no-new-privileges
--read-only
--tmpfs /tmp:rw,noexec,nosuid,size=100m
--cap-drop ALL
DOCKER_FLAGS
}

# Export security functions
export -f generate_test_credential mask_credential validate_required_env get_secure_docker_flags

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

# Wait for condition with timeout
# Usage: wait_for_condition "test -f /tmp/file" 30 "File to exist"
wait_for_condition() {
    local condition="$1"
    local timeout="${2:-30}"
    local description="${3:-condition}"
    local elapsed=0

    log_info "Waiting for: $description"

    while [ $elapsed -lt "$timeout" ]; do
        if eval "$condition" >/dev/null 2>&1; then
            log_success "Condition met: $description"
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    log_error "Timeout waiting for: $description"
    return 1
}

# Retry command with exponential backoff
# Usage: retry 5 docker pull myimage
retry() {
    local max_attempts="$1"
    shift
    local attempt=1
    local delay=1

    while [ $attempt -le "$max_attempts" ]; do
        if "$@"; then
            return 0
        fi

        log_warn "Attempt $attempt/$max_attempts failed, retrying in ${delay}s"
        sleep "$delay"

        attempt=$((attempt + 1))
        delay=$((delay * 2))
    done

    log_error "All $max_attempts attempts failed"
    return 1
}

# Print usage information
# Usage: print_test_usage
print_test_usage() {
    cat <<EOF
Test Utilities Usage:

LOGGING:
  log_step "message"       - Log test step
  log_info "message"       - Log info message
  log_success "message"    - Log success message
  log_warn "message"       - Log warning message
  log_error "message"      - Log error message
  annotate "message"       - Section header for CI

ASSERTIONS:
  assert_success "name" cmd          - Assert command succeeds
  assert_failure "name" cmd          - Assert command fails
  assert_equals exp act "name"       - Assert strings equal
  assert_contains str sub "name"     - Assert contains substring
  assert_not_empty val "name"        - Assert value not empty
  assert_file_exists path "name"     - Assert file exists
  assert_dir_exists path "name"      - Assert directory exists

REDIS:
  redis_set key value           - Set Redis key
  redis_get key                 - Get Redis value
  redis_hget key field          - Get Redis hash field value
  redis_hgetall key             - Get all hash fields and values
  redis_exists key              - Check if key exists
  redis_del key                 - Delete Redis key
  redis_keys pattern            - Get keys matching pattern
  redis_flush_all               - Flush all Redis data
  redis_wait_for_key key [timeout]  - Wait for key to exist
  verify_redis_health           - Check Redis health

DOCKER:
  wait_for_container name [timeout]  - Wait for container
  cleanup_container name             - Stop and remove container
  get_container_logs name [lines]    - Get container logs
  is_container_running name          - Check if running
  container_exec name cmd            - Execute in container
  ensure_network [name]              - Create network if needed
  cleanup_network [name]             - Remove network

SCAFFOLDING:
  setup_test "name"             - Initialize test environment
  teardown_test                 - Print summary and exit
  print_test_summary            - Print test results
  generate_test_id              - Create unique test ID
  create_temp_dir               - Create temporary directory
  cleanup_temp_dir path         - Remove temporary directory

UTILITIES:
  wait_for_condition cond [timeout] [desc]  - Wait for condition
  retry count cmd                           - Retry with backoff
  print_test_usage                          - Show this help

EXAMPLE:
  source tests/test-utils.sh
  setup_test "my-test"

  log_step "Testing Redis"
  redis_set "testkey" "testvalue"
  value=\$(redis_get "testkey")
  assert_equals "testvalue" "\$value" "Redis read/write"

  teardown_test
EOF
}

# Pattern matching in file
# Usage: assert_pattern_in_file "file_path" "regex_pattern" ["description"]
assert_pattern_in_file() {
  local file="$1"
  local pattern="$2"
  local description="${3:-Pattern found}"

  TEST_TOTAL=$((TEST_TOTAL + 1))

  if [[ ! -f "$file" ]]; then
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "FAIL: File does not exist: $file"
    return 1
  fi

  if grep -qE "$pattern" "$file"; then
    TEST_PASSED=$((TEST_PASSED + 1))
    log_success "PASS: $description"
    return 0
  else
    TEST_FAILED=$((TEST_FAILED + 1))
    log_error "FAIL: Pattern not found in $file: $pattern"
    return 1
  fi
}

# Export all functions for use in test scripts
export -f log_step log_info log_success log_warn log_error annotate log_pass log_fail
export -f assert_success assert_failure assert_equals assert_contains assert_not_contains
export -f assert_not_empty assert_file_exists assert_dir_exists assert_pattern_in_file
export -f redis_set redis_get redis_hget redis_hgetall redis_exists redis_del redis_keys redis_flush_all
export -f redis_wait_for_key verify_redis_health
export -f wait_for_container cleanup_container get_container_logs is_container_running
export -f container_exec ensure_network cleanup_network
export -f setup_test teardown_test print_test_summary generate_test_id create_temp_dir cleanup_temp_dir
export -f wait_for_condition retry print_test_usage

# If sourced with --help, print usage
if [ "${1:-}" = "--help" ] 2>/dev/null; then
    print_test_usage
    exit 0
fi
