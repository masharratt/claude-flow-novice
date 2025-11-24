#!/bin/bash
# Test utilities for CFN test suite
# Provides: logging, assertions, cleanup helpers

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_failure() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

annotate() {
    echo -e "${YELLOW}[NOTE]${NC} $1"
}

# Assertion functions
assert_success() {
    local description="$1"
    local exit_code="${2:-$?}"

    if [ "$exit_code" -eq 0 ]; then
        log_success "$description"
        return 0
    else
        log_failure "$description (exit code: $exit_code)"
        return 1
    fi
}

assert_failure() {
    local description="$1"
    local exit_code="${2:-$?}"

    if [ "$exit_code" -ne 0 ]; then
        log_success "$description"
        return 0
    else
        log_failure "$description (expected failure but got success)"
        return 1
    fi
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local description="$3"

    if [ "$expected" = "$actual" ]; then
        log_success "$description"
        return 0
    else
        log_failure "$description (expected: '$expected', got: '$actual')"
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local description="$3"

    if [[ "$haystack" == *"$needle"* ]]; then
        log_success "$description"
        return 0
    else
        log_failure "$description (expected to contain: '$needle')"
        return 1
    fi
}

assert_file_exists() {
    local file_path="$1"
    local description="${2:-File $file_path should exist}"

    if [ -f "$file_path" ]; then
        log_success "$description"
        return 0
    else
        log_failure "$description"
        return 1
    fi
}

assert_dir_exists() {
    local dir_path="$1"
    local description="${2:-Directory $dir_path should exist}"

    if [ -d "$dir_path" ]; then
        log_success "$description"
        return 0
    else
        log_failure "$description"
        return 1
    fi
}

# Test summary
print_test_summary() {
    echo ""
    echo "================================================"
    echo -e "Test Results:"
    echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "${RED}Failed:${NC} $TESTS_FAILED"
    echo -e "Total:  $((TESTS_PASSED + TESTS_FAILED))"
    echo "================================================"

    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        return 0
    else
        echo -e "${RED}Some tests failed${NC}"
        return 1
    fi
}

# Docker helpers
docker_cleanup_container() {
    local container_name="$1"
    if docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
        docker rm -f "$container_name" >/dev/null 2>&1 || true
    fi
}

docker_cleanup_network() {
    local network_name="$1"
    if docker network ls --format '{{.Name}}' | grep -q "^${network_name}$"; then
        docker network rm "$network_name" >/dev/null 2>&1 || true
    fi
}

# Wait for service to be ready
wait_for_service() {
    local service_check="$1"
    local max_wait="${2:-30}"
    local count=0

    while [ $count -lt $max_wait ]; do
        if eval "$service_check" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
        ((count++))
    done

    return 1
}
