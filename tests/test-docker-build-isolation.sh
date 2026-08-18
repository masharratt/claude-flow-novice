#!/usr/bin/env bash
# tests/test-docker-build-isolation.sh
# Tests Docker build isolation for multi-worktree environments
# Verifies Linux storage requirements and build script compliance

set -euo pipefail

# Source test utilities
source "$(dirname "$0")/test-utils.sh"

# ============================================================================
# CONFIGURATION
# ============================================================================

export TEST_TIMEOUT="${TEST_TIMEOUT:-300}"  # 5 minutes for builds
export TEST_DIR
TEST_DIR="$(create_temp_dir)"

# Test image names
export TEST_IMAGE_NAME="cfn-test-agent"
export TEST_DOCKERFILE="docker/Dockerfile.agent"

# ============================================================================
# TEST SETUP AND TEARDOWN
# ============================================================================

setup_docker_build_test() {
    setup_test "docker-build-isolation"
    
    log_step "Setting up Docker build isolation test"
    
    # Check if we're on Linux filesystem (WSL2 requirement)
    if ! check_linux_filesystem; then
        log_warn "Not on Linux filesystem - build may be slow"
    fi
    
    # Ensure Docker is available
    if ! command -v docker &>/dev/null; then
        log_error "Docker not available"
        return 1
    fi
    
    # Check build script exists
    if [[ ! -f "./.claude/skills/docker-build/build.sh" ]]; then
        log_error "Docker build script not found"
        return 1
    fi
    
    log_success "Docker build test setup complete"
}

teardown_docker_build_test() {
    log_step "Cleaning up Docker build test"
    
    # Remove test images
    docker images "$TEST_IMAGE_NAME" -q | xargs -r docker rmi -f >/dev/null 2>&1 || true
    
    # Clean up test directories
    cleanup_temp_dir "$TEST_DIR"
    
    print_test_summary
}

check_linux_filesystem() {
    # Check if current directory is on Linux filesystem (WSL2 requirement)
    local df_output
    df_output=$(df -T "$(pwd)" | tail -1)
    
    if echo "$df_output" | grep -q "ext4\|xfs\|btrfs"; then
        return 0
    else
        return 1
    fi
}

# ============================================================================
# BUILD SCRIPT TESTS
# ============================================================================

test_build_script_exists() {
    log_step "Testing Docker build script exists and is executable"
    
    local build_script="./.claude/skills/docker-build/build.sh"
    
    assert_file_exists "$build_script" "Docker build script exists"
    assert_success "Build script is executable" test -x "$build_script"
}

test_build_script_help() {
    log_step "Testing build script help functionality"
    
    local help_output
    help_output=$(./.claude/skills/docker-build/build.sh --help 2>&1 || true)
    
    assert_contains "$help_output" "Usage:" "Help usage section"
    assert_contains "$help_output" "--dockerfile" "Dockerfile parameter"
    assert_contains "$help_output" "--tag" "Tag parameter"
}

test_build_script_validation() {
    log_step "Testing build script parameter validation"
    
    # Test missing required parameters
    assert_failure "Missing dockerfile parameter" ./.claude/skills/docker-build/build.sh
    
    # Test invalid dockerfile path
    assert_failure "Invalid dockerfile path" ./.claude/skills/docker-build/build.sh --dockerfile "/nonexistent/file"
    
    # Test missing tag parameter
    assert_failure "Missing tag parameter" ./.claude/skills/docker-build/build.sh --dockerfile "$TEST_DOCKERFILE"
}

# ============================================================================
# DOCKERFILE TESTS
# ============================================================================

test_dockerfile_exists() {
    log_step "Testing Dockerfile exists"
    
    assert_file_exists "$TEST_DOCKERFILE" "Agent Dockerfile exists"
    
    # Check for Linux build requirement comment
    local dockerfile_content
    dockerfile_content=$(cat "$TEST_DOCKERFILE")
    
    # Look for Linux build requirement documentation
    if ! grep -q -i "linux.*build\|build.*linux\|wsl.*linux" "$TEST_DOCKERFILE"; then
        log_warn "Dockerfile should document Linux build requirement"
    fi
}

test_dockerfile_syntax() {
    log_step "Testing Dockerfile syntax"
    
    # Basic syntax check using docker build (dry run)
    if docker build --no-cache --dry-run -f "$TEST_DOCKERFILE" . >/dev/null 2>&1; then
        log_success "Dockerfile syntax valid"
    else
        # Fallback: check for basic Dockerfile structure
        local dockerfile_content
        dockerfile_content=$(cat "$TEST_DOCKERFILE")
        
        assert_contains "$dockerfile_content" "FROM" "Dockerfile has FROM instruction"
        assert_contains "$dockerfile_content" "WORKDIR" "Dockerfile has WORKDIR instruction"
    fi
}

# ============================================================================
# BUILD ISOLATION TESTS
# ============================================================================

test_build_with_script() {
    log_step "Testing Docker build using build script"
    
    # Check if build will use Linux filesystem
    if ! check_linux_filesystem; then
        log_warn "Build will be slow - not on Linux filesystem"
        log_warn "Expected build time: ~755s from Windows mount vs <20s from Linux"
    fi
    
    # Use the build script (this may take a while)
    local build_start_time
    build_start_time=$(date +%s)
    
    # Try to build with timeout
    if timeout 300 ./.claude/skills/docker-build/build.sh --dockerfile "$TEST_DOCKERFILE" --tag "$TEST_IMAGE_NAME:latest" 2>&1 | tee "$TEST_DIR/build.log"; then
        local build_end_time
        build_end_time=$(date +%s)
        local build_duration=$((build_end_time - build_start_time))
        
        log_success "Build completed in ${build_duration}s"
        
        # Verify image was created
        local image_id
        image_id=$(docker images "$TEST_IMAGE_NAME:latest" -q)
        assert_not_empty "$image_id" "Test image was created"
        
        # Check build duration expectations
        if check_linux_filesystem; then
            if [[ $build_duration -gt 60 ]]; then
                log_warn "Linux build took longer than expected: ${build_duration}s"
            fi
        else
            if [[ $build_duration -lt 60 ]]; then
                log_info "Build completed quickly despite non-Linux filesystem"
            fi
        fi
    else
        log_error "Build failed or timed out"
        if [[ -f "$TEST_DIR/build.log" ]]; then
            log_error "Build log:"
            tail -20 "$TEST_DIR/build.log" >&2
        fi
        return 1
    fi
}

test_build_isolation_verification() {
    log_step "Testing build isolation verification"
    
    # Check that the build uses appropriate isolation
    local build_log_content
    build_log_content=$(cat "$TEST_DIR/build.log" 2>/dev/null || echo "")
    
    # Look for build isolation indicators
    if echo "$build_log_content" | grep -q "linux\|Linux"; then
        log_success "Build indicates Linux filesystem usage"
    fi
    
    # Check for build script usage compliance
    if echo "$build_log_content" | grep -q "build.sh\|build script"; then
        log_success "Build script used correctly"
    fi
}

# ============================================================================
# MULTI-WORKTREE BUILD ISOLATION
# ============================================================================

test_worktree_build_isolation() {
    log_step "Testing worktree-specific build isolation"
    
    # Simulate different worktree environments
    local test_worktrees=("main" "feature-auth" "bugfix-validation")
    
    for worktree in "${test_worktrees[@]}"; do
        log_info "Testing build isolation for worktree: $worktree"
        
        # Create worktree-specific tag
        local worktree_tag="$TEST_IMAGE_NAME:$worktree"
        
        # Build with worktree-specific context (simulated)
        local worktree_build_start
        worktree_build_start=$(date +%s)
        
        if timeout 300 ./.claude/skills/docker-build/build.sh \
            --dockerfile "$TEST_DOCKERFILE" \
            --tag "$worktree_tag" 2>&1 | tee "$TEST_DIR/build-$worktree.log"; then
            
            local worktree_build_end
            worktree_build_end=$(date +%s)
            local worktree_build_duration=$((worktree_build_end - worktree_build_start))
            
            log_success "Worktree $worktree build completed in ${worktree_build_duration}s"
            
            # Verify worktree-specific image exists
            local worktree_image_id
            worktree_image_id=$(docker images "$worktree_tag" -q)
            assert_not_empty "$worktree_image_id" "Worktree $worktree image created"
            
            # Clean up worktree image
            docker rmi "$worktree_tag" >/dev/null 2>&1 || true
        else
            log_error "Worktree $worktree build failed"
            return 1
        fi
    done
}

# ============================================================================
# BUILD PERFORMANCE TESTS
# ============================================================================

test_build_performance_compliance() {
    log_step "Testing build performance compliance"
    
    # Read build logs to check performance indicators
    local main_build_log
    main_build_log=$(cat "$TEST_DIR/build.log" 2>/dev/null || echo "")
    
    # Check for performance warnings
    if echo "$main_build_log" | grep -q "slow\|timeout\|warning"; then
        log_warn "Build performance warnings detected"
    fi
    
    # Verify build script compliance indicators
    local build_script_content
    build_script_content=$(cat ./.claude/skills/docker-build/build.sh)
    
    assert_contains "$build_script_content" "linux\|Linux" "Build script mentions Linux requirement"
    assert_contains "$build_script_content" "build.sh" "Build script is self-referencing"
}

# ============================================================================
# ERROR HANDLING TESTS
# ============================================================================

test_build_error_handling() {
    log_step "Testing build error handling"
    
    # Test with invalid Dockerfile
    local invalid_dockerfile="/tmp/invalid.Dockerfile"
    echo "INVALID SYNTAX" > "$invalid_dockerfile"
    
    assert_failure "Invalid Dockerfile handling" \
        ./.claude/skills/docker-build/build.sh \
        --dockerfile "$invalid_dockerfile" \
        --tag "$TEST_IMAGE_NAME:invalid"
    
    rm -f "$invalid_dockerfile"
    
    # Test with non-existent Dockerfile
    assert_failure "Non-existent Dockerfile handling" \
        ./.claude/skills/docker-build/build.sh \
        --dockerfile "/tmp/nonexistent.Dockerfile" \
        --tag "$TEST_IMAGE_NAME:nonexistent"
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

main() {
    # Setup test environment
    setup_docker_build_test
    
    # Run all test suites
    log_step "Running Docker build isolation tests"
    
    # Build script tests
    test_build_script_exists
    test_build_script_help
    test_build_script_validation
    
    # Dockerfile tests
    test_dockerfile_exists
    test_dockerfile_syntax
    
    # Build isolation tests
    test_build_with_script
    test_build_isolation_verification
    
    # Multi-worktree isolation tests
    test_worktree_build_isolation
    
    # Performance tests
    test_build_performance_compliance
    
    # Error handling tests
    test_build_error_handling
    
    # Cleanup
    teardown_docker_build_test
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi