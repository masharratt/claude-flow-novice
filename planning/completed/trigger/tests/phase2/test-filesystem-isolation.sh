#!/bin/bash
# planning/trigger/tests/phase2/test-filesystem-isolation.sh
# Phase 2 :: Validate filesystem isolation between concurrent agents
# Tests: Independent workspaces, volume mounts, file write conflicts

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TASK_ID="phase2-fs-$(date +%s)"
WORKSPACE_BASE="/tmp/trigger-workspace-${TASK_ID}"

cleanup() {
    log_info "Cleaning up test artifacts"
    docker rm -f "cfn-fs-test-${TASK_ID}-0" "cfn-fs-test-${TASK_ID}-1" "cfn-fs-test-${TASK_ID}-2" 2>/dev/null || true
    docker rm -f "cfn-rw-test-${TASK_ID}-0" "cfn-rw-test-${TASK_ID}-1" "cfn-rw-test-${TASK_ID}-2" 2>/dev/null || true
    docker network rm "cfn-fs-net-${TASK_ID}" 2>/dev/null || true
    rm -rf "${WORKSPACE_BASE}" 2>/dev/null || true
}
trap cleanup EXIT

# ============================================================================
# Test 1: Independent Workspace Directories
# ============================================================================
test_independent_workspaces() {
    log_step "GIVEN 3 agents with separate workspace directories"

    # Create isolated workspaces
    for idx in 0 1 2; do
        mkdir -p "${WORKSPACE_BASE}/agent-${idx}"
        echo "Agent ${idx} workspace" > "${WORKSPACE_BASE}/agent-${idx}/marker.txt"
    done

    docker network create "cfn-fs-net-${TASK_ID}" >/dev/null 2>&1

    # WHEN spawning agents with different volume mounts
    log_info "Spawning agents with isolated workspaces"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-fs-test-${TASK_ID}-${idx}" \
            --network "cfn-fs-net-${TASK_ID}" \
            -v "${WORKSPACE_BASE}/agent-${idx}:/workspace:rw" \
            alpine:latest \
            sh -c "echo 'Agent ${idx} output' > /workspace/output.txt; sleep 30" >/dev/null 2>&1
    done

    sleep 3  # Let file writes complete

    # THEN each agent should have independent workspace
    log_info "Verifying workspace isolation"

    local isolated_count=0
    for idx in 0 1 2; do
        local marker_content=$(cat "${WORKSPACE_BASE}/agent-${idx}/marker.txt" 2>/dev/null || echo "missing")
        local output_content=$(cat "${WORKSPACE_BASE}/agent-${idx}/output.txt" 2>/dev/null || echo "missing")

        if [[ "$marker_content" == "Agent ${idx} workspace" ]] && [[ "$output_content" == "Agent ${idx} output" ]]; then
            log_success "✓ Agent ${idx}: Workspace isolated"
            isolated_count=$((isolated_count + 1))
        else
            log_warn "✗ Agent ${idx}: Workspace contamination detected"
            log_info "  Marker: $marker_content"
            log_info "  Output: $output_content"
        fi
    done

    # Cleanup
    docker rm -f "cfn-fs-test-${TASK_ID}-0" "cfn-fs-test-${TASK_ID}-1" "cfn-fs-test-${TASK_ID}-2" 2>/dev/null || true

    if [ "$isolated_count" -eq 3 ]; then
        log_success "✓ All 3 workspaces remain isolated"
        return 0
    else
        log_error "✗ Workspace isolation failures: $((3 - isolated_count))/3"
        return 1
    fi
}

# ============================================================================
# Test 2: No Cross-Agent File Visibility
# ============================================================================
test_no_cross_visibility() {
    log_step "GIVEN agents with separate volume mounts"

    # Create isolated workspaces with unique content
    for idx in 0 1 2; do
        mkdir -p "${WORKSPACE_BASE}/agent-${idx}"
        echo "SECRET-${idx}-$(date +%s)" > "${WORKSPACE_BASE}/agent-${idx}/secret.txt"
    done

    # WHEN spawning agents
    log_info "Testing cross-agent file visibility"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-fs-test-${TASK_ID}-${idx}" \
            --network "cfn-fs-net-${TASK_ID}" \
            -v "${WORKSPACE_BASE}/agent-${idx}:/workspace:rw" \
            alpine:latest \
            sh -c "ls /workspace; sleep 30" >/dev/null 2>&1
    done

    sleep 2

    # THEN agents should only see their own files
    log_info "Verifying file visibility boundaries"

    local violations=0
    for idx in 0 1 2; do
        local file_list=$(docker exec "cfn-fs-test-${TASK_ID}-${idx}" ls /workspace 2>/dev/null || echo "")

        # Should see own secret.txt but not other agents' files
        if [[ "$file_list" =~ "secret.txt" ]]; then
            # Verify no files from other agents visible
            local other_files=$(echo "$file_list" | grep -v "secret.txt" | wc -l)
            if [ "$other_files" -eq 0 ]; then
                log_success "✓ Agent ${idx}: Only sees own workspace"
            else
                log_warn "✗ Agent ${idx}: Sees files from other agents"
                violations=$((violations + 1))
            fi
        else
            log_warn "✗ Agent ${idx}: Cannot see own secret.txt"
            violations=$((violations + 1))
        fi
    done

    # Cleanup
    docker rm -f "cfn-fs-test-${TASK_ID}-0" "cfn-fs-test-${TASK_ID}-1" "cfn-fs-test-${TASK_ID}-2" 2>/dev/null || true

    if [ "$violations" -eq 0 ]; then
        log_success "✓ File visibility isolation verified"
        return 0
    else
        log_error "✗ File visibility violations: ${violations}/3"
        return 1
    fi
}

# ============================================================================
# Test 3: Concurrent File Write Safety
# ============================================================================
test_concurrent_writes() {
    log_step "GIVEN 3 agents writing to separate files"

    # Create isolated workspaces
    for idx in 0 1 2; do
        mkdir -p "${WORKSPACE_BASE}/agent-${idx}"
    done

    # WHEN agents write concurrently to same filename in different workspaces
    log_info "Testing concurrent write safety"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-rw-test-${TASK_ID}-${idx}" \
            --network "cfn-fs-net-${TASK_ID}" \
            -v "${WORKSPACE_BASE}/agent-${idx}:/workspace:rw" \
            alpine:latest \
            sh -c "for i in \$(seq 1 100); do echo 'Agent ${idx} line \$i' >> /workspace/output.log; done; sleep 5" >/dev/null 2>&1
    done

    sleep 3  # Let writes complete

    # THEN verify no write conflicts or corrupted files
    log_info "Verifying write integrity"

    local corrupted=0
    for idx in 0 1 2; do
        local line_count=$(wc -l < "${WORKSPACE_BASE}/agent-${idx}/output.log" 2>/dev/null || echo 0)
        local expected_lines=100

        if [ "$line_count" -eq "$expected_lines" ]; then
            # Verify all lines belong to this agent
            local wrong_agent=$(grep -v "Agent ${idx}" "${WORKSPACE_BASE}/agent-${idx}/output.log" 2>/dev/null | wc -l)
            if [ "$wrong_agent" -eq 0 ]; then
                log_success "✓ Agent ${idx}: ${line_count} lines written correctly"
            else
                log_warn "✗ Agent ${idx}: ${wrong_agent} lines from other agents detected"
                corrupted=$((corrupted + 1))
            fi
        else
            log_warn "✗ Agent ${idx}: Expected ${expected_lines} lines, got ${line_count}"
            corrupted=$((corrupted + 1))
        fi
    done

    # Cleanup
    docker rm -f "cfn-rw-test-${TASK_ID}-0" "cfn-rw-test-${TASK_ID}-1" "cfn-rw-test-${TASK_ID}-2" 2>/dev/null || true

    if [ "$corrupted" -eq 0 ]; then
        log_success "✓ Concurrent writes remain isolated (0 corruptions)"
        return 0
    else
        log_error "✗ File corruption detected: ${corrupted}/3"
        return 1
    fi
}

# ============================================================================
# Test 4: Volume Mount Permissions
# ============================================================================
test_volume_permissions() {
    log_step "GIVEN agents with read-write volume mounts"

    # Create workspace with test file
    mkdir -p "${WORKSPACE_BASE}/perms-test"
    echo "test content" > "${WORKSPACE_BASE}/perms-test/readonly.txt"
    chmod 644 "${WORKSPACE_BASE}/perms-test/readonly.txt"

    # WHEN spawning agent with RW mount
    log_info "Testing volume mount permissions"

    docker run -d \
        --name "cfn-fs-test-${TASK_ID}-perms" \
        -v "${WORKSPACE_BASE}/perms-test:/workspace:rw" \
        alpine:latest \
        sleep 30 >/dev/null 2>&1

    sleep 1

    # THEN verify read and write access
    local can_read=$(docker exec "cfn-fs-test-${TASK_ID}-perms" cat /workspace/readonly.txt 2>/dev/null | wc -l)
    local can_write=$(docker exec "cfn-fs-test-${TASK_ID}-perms" sh -c "echo 'write test' > /workspace/write-test.txt; echo $?" 2>/dev/null)

    docker rm -f "cfn-fs-test-${TASK_ID}-perms" 2>/dev/null || true

    if [ "$can_read" -gt 0 ] && [ "$can_write" -eq 0 ]; then
        log_success "✓ Volume mount permissions verified (read + write OK)"
        return 0
    else
        log_error "✗ Volume mount permission issues (read=$can_read, write=$can_write)"
        return 1
    fi
}

# ============================================================================
# Test 5: Workspace Cleanup Isolation
# ============================================================================
test_workspace_cleanup() {
    log_step "GIVEN agents writing to temporary workspaces"

    # Create isolated workspaces
    for idx in 0 1 2; do
        mkdir -p "${WORKSPACE_BASE}/cleanup-${idx}"
        echo "initial content" > "${WORKSPACE_BASE}/cleanup-${idx}/initial.txt"
    done

    # WHEN agents create and remove files
    log_info "Testing workspace cleanup isolation"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-fs-test-${TASK_ID}-${idx}" \
            --network "cfn-fs-net-${TASK_ID}" \
            -v "${WORKSPACE_BASE}/cleanup-${idx}:/workspace:rw" \
            alpine:latest \
            sh -c "echo 'temp' > /workspace/temp.txt; rm /workspace/temp.txt; sleep 5" >/dev/null 2>&1
    done

    sleep 3

    # THEN verify cleanup doesn't affect other workspaces
    local intact_count=0
    for idx in 0 1 2; do
        local initial_exists=$(test -f "${WORKSPACE_BASE}/cleanup-${idx}/initial.txt" && echo "yes" || echo "no")
        local temp_exists=$(test -f "${WORKSPACE_BASE}/cleanup-${idx}/temp.txt" && echo "yes" || echo "no")

        if [ "$initial_exists" = "yes" ] && [ "$temp_exists" = "no" ]; then
            log_success "✓ Agent ${idx}: Workspace cleanup isolated"
            intact_count=$((intact_count + 1))
        else
            log_warn "✗ Agent ${idx}: Workspace state incorrect (initial=$initial_exists, temp=$temp_exists)"
        fi
    done

    # Cleanup
    docker rm -f "cfn-fs-test-${TASK_ID}-0" "cfn-fs-test-${TASK_ID}-1" "cfn-fs-test-${TASK_ID}-2" 2>/dev/null || true

    if [ "$intact_count" -eq 3 ]; then
        log_success "✓ Workspace cleanup isolation verified"
        return 0
    else
        log_error "✗ Cleanup isolation failures: $((3 - intact_count))/3"
        return 1
    fi
}

# ============================================================================
# Execute Tests
# ============================================================================
annotate "Phase 2 :: Filesystem Isolation Tests"

test_independent_workspaces
test_no_cross_visibility
test_concurrent_writes
test_volume_permissions
test_workspace_cleanup

# ============================================================================
# Test Summary
# ============================================================================
annotate "Test Summary: Filesystem Isolation"
log_info "Total tests: $TEST_TOTAL"
log_info "Passed: $TEST_PASSED"
log_info "Failed: $TEST_FAILED"

if [ "$TEST_FAILED" -eq 0 ]; then
    log_success "All filesystem isolation tests passed"
    exit 0
else
    log_error "Some tests failed"
    exit 1
fi
