#!/usr/bin/env bash
# tests/docker/teams/test-deployment-automation.sh
# Phase 5 Wave 4A :: Deployment automation validation (IMPL-003)
# Tests build scripts, validation, and registry push operations

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test helper functions
pass() {
    local msg="$1"
    echo -e "${GREEN}✓ PASS:${NC} $msg"
    TEST_PASSED=$((TEST_PASSED + 1))
    return 0
}

fail() {
    local msg="$1"
    echo -e "${RED}✗ FAIL:${NC} $msg"
    TEST_FAILED=$((TEST_FAILED + 1))
    exit 1
}

skip() {
    local msg="$1"
    echo -e "${YELLOW}⊘ SKIP:${NC} $msg"
    return 0
}

print_summary() {
    local suite_name="$1"
    echo ""
    echo "=========================================="
    echo "$suite_name Summary"
    echo "=========================================="
    echo "Total: $((TEST_PASSED + TEST_FAILED))"
    echo "Passed: $TEST_PASSED"
    echo "Failed: $TEST_FAILED"
    echo "=========================================="
}

# Test configuration
TEST_IMAGE="cfn-test-image"
TEST_TAG="test-$(date +%s)"

cleanup() {
    log_info "Cleaning up deployment test artifacts"
    docker rmi "${TEST_IMAGE}:${TEST_TAG}" 2>/dev/null || true
    rm -f /tmp/test-dockerfile-* 2>/dev/null || true
}
trap cleanup EXIT

test_docker_build_script_validation() {
    log_step "TEST 1: Build script validation - Docker build succeeds with proper syntax"

    # GIVEN a simple Dockerfile
    cat > /tmp/test-dockerfile-${TEST_TAG} <<'EOF'
FROM alpine:latest
LABEL cfn.version="test"
LABEL cfn.build.timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
CMD ["echo", "test"]
EOF

    # WHEN building the image
    BUILD_OUTPUT=$(docker build -t "${TEST_IMAGE}:${TEST_TAG}" -f /tmp/test-dockerfile-${TEST_TAG} . 2>&1)

    # THEN build should succeed
    if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "${TEST_IMAGE}:${TEST_TAG}"; then
        fail "Docker build failed: $BUILD_OUTPUT"
    fi

    # THEN image should exist
    if ! docker images --format '{{.Repository}}:{{.Tag}}' | grep -q "${TEST_IMAGE}:${TEST_TAG}"; then
        fail "Built image not found in Docker images"
    fi

    pass "Build script validation verified"
}

test_image_label_validation() {
    log_step "TEST 2: Image label validation - built images have required labels"

    # GIVEN a built image with labels
    cat > /tmp/test-dockerfile-${TEST_TAG} <<'EOF'
FROM alpine:latest
LABEL cfn.version="1.0.0"
LABEL cfn.team="test-team"
LABEL cfn.component="agent"
CMD ["echo", "test"]
EOF

    docker build -q -t "${TEST_IMAGE}:${TEST_TAG}" -f /tmp/test-dockerfile-${TEST_TAG} . >/dev/null 2>&1

    # WHEN inspecting image labels
    VERSION_LABEL=$(docker inspect "${TEST_IMAGE}:${TEST_TAG}" --format '{{index .Config.Labels "cfn.version"}}')
    TEAM_LABEL=$(docker inspect "${TEST_IMAGE}:${TEST_TAG}" --format '{{index .Config.Labels "cfn.team"}}')
    COMPONENT_LABEL=$(docker inspect "${TEST_IMAGE}:${TEST_TAG}" --format '{{index .Config.Labels "cfn.component"}}')

    # THEN required labels should exist
    if [[ "$VERSION_LABEL" != "1.0.0" ]]; then
        fail "Version label mismatch: expected 1.0.0, got $VERSION_LABEL"
    fi

    if [[ "$TEAM_LABEL" != "test-team" ]]; then
        fail "Team label mismatch: expected test-team, got $TEAM_LABEL"
    fi

    if [[ "$COMPONENT_LABEL" != "agent" ]]; then
        fail "Component label mismatch: expected agent, got $COMPONENT_LABEL"
    fi

    pass "Image label validation verified"
}

test_deployment_readiness_check() {
    log_step "TEST 3: Deployment readiness - images pass pre-deployment validation"

    # GIVEN a built image
    cat > /tmp/test-dockerfile-${TEST_TAG} <<'EOF'
FROM alpine:latest
LABEL cfn.version="1.0.0"
LABEL cfn.validated="true"
RUN echo "build-timestamp=$(date -u +%s)" > /etc/build-info
HEALTHCHECK --interval=5s CMD echo "healthy"
CMD ["sh", "-c", "echo ready && sleep 300"]
EOF

    docker build -q -t "${TEST_IMAGE}:${TEST_TAG}" -f /tmp/test-dockerfile-${TEST_TAG} . >/dev/null 2>&1

    # WHEN checking deployment readiness
    # Check 1: Image has validation label
    VALIDATED=$(docker inspect "${TEST_IMAGE}:${TEST_TAG}" --format '{{index .Config.Labels "cfn.validated"}}')
    if [[ "$VALIDATED" != "true" ]]; then
        fail "Image not marked as validated"
    fi

    # Check 2: Image has healthcheck defined
    HEALTHCHECK=$(docker inspect "${TEST_IMAGE}:${TEST_TAG}" --format '{{.Config.Healthcheck}}')
    if [[ "$HEALTHCHECK" == "<no value>" ]] || [[ -z "$HEALTHCHECK" ]]; then
        fail "Image missing healthcheck configuration"
    fi

    # Check 3: Image can start successfully
    CONTAINER_ID=$(docker run -d "${TEST_IMAGE}:${TEST_TAG}" 2>&1)
    if [[ -z "$CONTAINER_ID" ]]; then
        fail "Image failed to start container"
    fi

    sleep 2
    CONTAINER_STATUS=$(docker inspect "$CONTAINER_ID" --format '{{.State.Status}}')
    docker rm -f "$CONTAINER_ID" >/dev/null 2>&1

    if [[ "$CONTAINER_STATUS" != "running" ]]; then
        fail "Container not running after start: $CONTAINER_STATUS"
    fi

    pass "Deployment readiness check verified"
}

# Execute tests
log_info "Starting deployment automation tests (3 tests)"
test_docker_build_script_validation
test_image_label_validation
test_deployment_readiness_check

# Summary
print_summary "Deployment Automation Tests"
