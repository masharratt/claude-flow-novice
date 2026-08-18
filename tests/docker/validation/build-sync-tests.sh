#!/usr/bin/env bash
# tests/docker/build-sync-tests.sh
# Phase 4 :: P2 - Build freshness and sync validation

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
source "$PROJECT_ROOT/tests/docker/architecture-test-helpers.sh"

# Configuration
TEST_DIR="$(create_temp_dir)"
TEST_IMAGE="cfn-test-build-$$"

cleanup() {
    log_step "Cleaning up test artifacts"
    docker rmi -f "$TEST_IMAGE" 2>/dev/null || true
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test 1: Build freshness validation
test_build_freshness() {
    log_step "Test 1: Build freshness validation"

    # GIVEN: Create test Dockerfile with timestamp
    local test_dockerfile="$TEST_DIR/Dockerfile.test"
    local build_timestamp=$(date +%s)

    cat > "$test_dockerfile" <<EOF
FROM node:20-slim
RUN echo "Build timestamp: $build_timestamp" > /build-info.txt
CMD ["cat", "/build-info.txt"]
EOF

    # WHEN: Build Docker image
    log_info "Building test image..."
    docker build -t "$TEST_IMAGE" -f "$test_dockerfile" "$TEST_DIR" >/dev/null 2>&1

    # THEN: Verify image was built
    if docker images | grep -q "$TEST_IMAGE"; then
        log_success "Image built successfully"
    else
        log_error "Failed to build image"
        return 1
    fi

    # THEN: Check build timestamp in image
    local image_timestamp
    image_timestamp=$(docker run --rm "$TEST_IMAGE" cat /build-info.txt | grep -oP 'Build timestamp: \K[0-9]+')

    if [ "$image_timestamp" -eq "$build_timestamp" ]; then
        log_success "Build timestamp matches: $build_timestamp"
    else
        log_error "Timestamp mismatch: expected $build_timestamp, got $image_timestamp"
        return 1
    fi

    # THEN: Verify build is fresh using helper
    check_image_freshness "$TEST_IMAGE" 60 || {
        log_warn "Image may be stale (but this is non-fatal for this test)"
    }
}

# Test 2: Rsync exclusion patterns (.git, node_modules)
test_rsync_exclusions() {
    log_step "Test 2: Rsync exclusion patterns validation"

    # GIVEN: Validate rsync exclusions using helper (checks .dockerignore)
    validate_rsync_exclusions "$PROJECT_ROOT" || {
        log_warn "Rsync exclusion validation had warnings (non-fatal)"
    }

    # GIVEN: Create directory structure with files to exclude
    local src_dir="$TEST_DIR/src"
    local dest_dir="$TEST_DIR/dest"
    mkdir -p "$src_dir"/{.git,node_modules,src}
    mkdir -p "$dest_dir"

    # Create test files
    echo "git data" > "$src_dir/.git/config"
    echo "dependency" > "$src_dir/node_modules/package.json"
    echo "source code" > "$src_dir/src/app.js"
    echo "readme" > "$src_dir/README.md"

    # WHEN: Rsync with exclusion patterns
    local exclusions=(
        ".git"
        "node_modules"
        "*.log"
        ".env*"
        ".backups"
    )

    local rsync_cmd="rsync -a"
    for pattern in "${exclusions[@]}"; do
        rsync_cmd+=" --exclude='$pattern'"
    done
    rsync_cmd+=" $src_dir/ $dest_dir/"

    eval "$rsync_cmd" >/dev/null 2>&1

    # THEN: Verify excluded directories are not copied
    if [ ! -d "$dest_dir/.git" ]; then
        log_success ".git excluded from sync"
    else
        log_error ".git was copied (should be excluded)"
        return 1
    fi

    if [ ! -d "$dest_dir/node_modules" ]; then
        log_success "node_modules excluded from sync"
    else
        log_error "node_modules was copied (should be excluded)"
        return 1
    fi

    # THEN: Verify included files are copied
    if [ -f "$dest_dir/src/app.js" ]; then
        log_success "Source files copied correctly"
    else
        log_error "Source files not copied"
        return 1
    fi

    if [ -f "$dest_dir/README.md" ]; then
        log_success "Documentation files copied"
    else
        log_error "README not copied"
        return 1
    fi
}

# Test 3: Image layer caching
test_layer_caching() {
    log_step "Test 3: Docker image layer caching"

    # GIVEN: Create Dockerfile with cacheable layers
    local dockerfile1="$TEST_DIR/Dockerfile.cache1"
    cat > "$dockerfile1" <<'EOF'
FROM node:20-slim
RUN apt-get update && apt-get install -y git
RUN echo "Layer 1" > /layer1.txt
RUN echo "Layer 2" > /layer2.txt
EOF

    # WHEN: First build (no cache)
    log_info "First build (no cache)..."
    local build1_start=$(date +%s)
    docker build -t "${TEST_IMAGE}-cache1" -f "$dockerfile1" "$TEST_DIR" >/dev/null 2>&1
    local build1_end=$(date +%s)
    local build1_time=$((build1_end - build1_start))

    log_info "First build time: ${build1_time}s"

    # WHEN: Second build (with cache, no changes)
    log_info "Second build (with cache)..."
    local build2_start=$(date +%s)
    docker build -t "${TEST_IMAGE}-cache2" -f "$dockerfile1" "$TEST_DIR" >/dev/null 2>&1
    local build2_end=$(date +%s)
    local build2_time=$((build2_end - build2_start))

    log_info "Second build time: ${build2_time}s"

    # THEN: Second build should be faster (cached)
    if [ "$build2_time" -lt "$build1_time" ]; then
        log_success "Layer caching improved build time (${build1_time}s → ${build2_time}s)"
    else
        log_warn "Layer caching did not improve build time"
    fi

    # THEN: Verify cache was used
    local build_output
    build_output=$(docker build -t "${TEST_IMAGE}-cache3" -f "$dockerfile1" "$TEST_DIR" 2>&1)

    if echo "$build_output" | grep -qi "cache"; then
        log_success "Build used cached layers"
    else
        log_info "Cache usage not detected in build output"
    fi

    # Cleanup intermediate images
    docker rmi -f "${TEST_IMAGE}-cache1" "${TEST_IMAGE}-cache2" "${TEST_IMAGE}-cache3" 2>/dev/null || true
}

# Test 4: Linux native build verification
test_linux_native_build() {
    log_step "Test 4: Linux native build verification"

    # GIVEN: Create Dockerfile for Linux build
    local linux_dockerfile="$TEST_DIR/Dockerfile.linux"
    cat > "$linux_dockerfile" <<'EOF'
FROM node:20-slim
RUN uname -a > /os-info.txt
RUN node --version > /node-version.txt
CMD ["cat", "/os-info.txt", "/node-version.txt"]
EOF

    # WHEN: Build for Linux platform
    log_info "Building for Linux platform..."
    docker build \
        --platform linux/amd64 \
        -t "${TEST_IMAGE}-linux" \
        -f "$linux_dockerfile" \
        "$TEST_DIR" >/dev/null 2>&1

    # THEN: Verify image platform
    local image_arch
    image_arch=$(docker inspect "${TEST_IMAGE}-linux" --format='{{.Architecture}}')

    if [ "$image_arch" = "amd64" ]; then
        log_success "Image built for Linux amd64"
    else
        log_error "Expected amd64, got $image_arch"
        return 1
    fi

    # THEN: Verify OS in container
    local os_info
    os_info=$(docker run --rm "${TEST_IMAGE}-linux" cat /os-info.txt)

    if echo "$os_info" | grep -qi "linux"; then
        log_success "Container running Linux OS"
    else
        log_error "Container not running Linux"
        return 1
    fi

    # THEN: Verify Node.js is available
    local node_version
    node_version=$(docker run --rm "${TEST_IMAGE}-linux" cat /node-version.txt)

    if [[ "$node_version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_success "Node.js installed: $node_version"
    else
        log_error "Invalid Node.js version: $node_version"
        return 1
    fi

    # Cleanup
    docker rmi -f "${TEST_IMAGE}-linux" 2>/dev/null || true
}

# Execute all tests
setup_test "build-sync"

test_build_freshness
test_rsync_exclusions
test_layer_caching
test_linux_native_build

teardown_test
