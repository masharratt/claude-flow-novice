#!/bin/bash
# Test script for Claude Flow Novice Docker images
# Tests both minimal and Playwright versions

set -euo pipefail

# Configuration
MINIMAL_IMAGE="claude-flow-novice:minimal"
PLAYWRIGHT_IMAGE="claude-flow-novice:with-playwright"
TEST_TIMEOUT=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test functions
test_image_exists() {
    local image=$1
    log_info "Testing if image exists: $image"

    if docker image inspect "$image" >/dev/null 2>&1; then
        log_info "✓ Image exists: $image"
        return 0
    else
        log_error "✗ Image not found: $image"
        return 1
    fi
}

test_container_startup() {
    local image=$1
    local container_name="test-$(echo "$image" | tr ':' '-')-$(date +%s)"

    log_info "Testing container startup for: $image"

    # Start container in background
    if timeout "$TEST_TIMEOUT" docker run --rm --name "$container_name" "$image" /app/monitor-wrapper.sh health-check; then
        log_info "✓ Container startup successful: $image"
        return 0
    else
        log_error "✗ Container startup failed: $image"
        return 1
    fi
}

test_memory_monitoring() {
    local image=$1

    log_info "Testing memory monitoring for: $image"

    # Run memory monitoring check
    if docker run --rm "$image" /app/monitor-wrapper.sh health-check | grep -q "Health check passed"; then
        log_info "✓ Memory monitoring working: $image"
        return 0
    else
        log_error "✗ Memory monitoring failed: $image"
        return 1
    fi
}

test_playwright_functionality() {
    local image=$1

    log_info "Testing Playwright functionality for: $image"

    # Test Playwright CLI
    if docker run --rm "$image" npx playwright --version >/dev/null 2>&1; then
        log_info "✓ Playwright CLI working: $image"

        # Test browser availability (quick check)
        if docker run --rm "$image" npx playwright install --help >/dev/null 2>&1; then
            log_info "✓ Playwright commands accessible: $image"
            return 0
        else
            log_warn "⚠ Playwright installed but commands not accessible: $image"
            return 1
        fi
    else
        log_error "✗ Playwright not working: $image"
        return 1
    fi
}

test_database_clients() {
    local image=$1

    log_info "Testing database clients for: $image"

    # Test PostgreSQL client
    if docker run --rm "$image" psql --version >/dev/null 2>&1; then
        log_info "✓ PostgreSQL client available: $image"
    else
        log_warn "⚠ PostgreSQL client not available: $image"
    fi

    # Test MySQL client
    if docker run --rm "$image" mysql --version >/dev/null 2>&1; then
        log_info "✓ MySQL client available: $image"
    else
        log_warn "⚠ MySQL client not available: $image"
    fi

    return 0
}

get_image_info() {
    local image=$1

    log_info "Image information for: $image"

    # Get image size
    local size=$(docker image inspect "$image" --format='{{.Size}}' | awk '{printf "%.1f MB", $1/1024/1024}')
    echo "  Size: $size"

    # Get image labels
    docker image inspect "$image" --format='{{json .Config.Labels}}' | jq -r 'to_entries[] | "  \(.key): \(.value)"' 2>/dev/null || echo "  Labels: Not available"

    echo ""
}

# Main test execution
main() {
    log_info "Starting Claude Flow Novice Docker image tests"
    echo ""

    # Test minimal image
    log_info "=== Testing Minimal Image ==="
    if test_image_exists "$MINIMAL_IMAGE"; then
        get_image_info "$MINIMAL_IMAGE"
        test_container_startup "$MINIMAL_IMAGE"
        test_memory_monitoring "$MINIMAL_IMAGE"
        test_database_clients "$MINIMAL_IMAGE"
    fi
    echo ""

    # Test Playwright image
    log_info "=== Testing Playwright Image ==="
    if test_image_exists "$PLAYWRIGHT_IMAGE"; then
        get_image_info "$PLAYWRIGHT_IMAGE"
        test_container_startup "$PLAYWRIGHT_IMAGE"
        test_memory_monitoring "$PLAYWRIGHT_IMAGE"
        test_playwright_functionality "$PLAYWRIGHT_IMAGE"
        test_database_clients "$PLAYWRIGHT_IMAGE"
    fi
    echo ""

    log_info "=== Test Summary ==="
    log_info "All tests completed. Review output above for any errors or warnings."
}

# Run main function
main "$@"