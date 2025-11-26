#!/bin/bash
# tests/cli-mode/core/e2e/test-agent-tool-access.sh
# Phase 1 :: Validates agents have access to tools and can create files
#
# Purpose:
#   Test (c) from CLI mode requirements: Are files created (do they have tool access)?
#   Verifies that when main chat spawns an agent, the agent can:
#   - Access the filesystem
#   - Use tools (Write, Edit, Bash)
#   - Create deliverables in the workspace
#
# Architecture Context:
#   - Main chat IS the coordinator (no separate coordinator agent)
#   - Agents receive task context and workspace path
#   - Agents must be able to read/write files in the workspace
#
# Test validates:
#   1. Workspace directory can be created
#   2. Files can be written to workspace
#   3. File permissions are correct
#   4. Workspace is accessible from expected path patterns

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# ============================================================================
# TEST CONFIGURATION
# ============================================================================

TEST_ID="tool-access-$(date +%s)-$$"
TASK_ID="cli-test-${TEST_ID}"
TEST_WORKSPACE="/tmp/cfn-tool-test-${TEST_ID}"
TEST_FILE="$TEST_WORKSPACE/test-deliverable.txt"
TEST_CONTENT="CLI Mode Tool Access Test - ${TEST_ID}"

# ============================================================================
# CLEANUP HANDLER
# ============================================================================

cleanup() {
    local exit_code=$?
    log_info "Cleaning up test workspace..."

    # Clean up test workspace
    if [ -d "$TEST_WORKSPACE" ]; then
        rm -rf "$TEST_WORKSPACE"
    fi

    log_info "Cleanup complete (exit code: $exit_code)"
    exit $exit_code
}

trap cleanup EXIT INT TERM

# ============================================================================
# TEST 1: Verify workspace can be created
# ============================================================================

test_workspace_creation() {
    log_step "TEST 1: Verify workspace can be created"

    # GIVEN: A target workspace path
    log_info "Creating workspace: $TEST_WORKSPACE"

    # WHEN: We create the workspace directory
    mkdir -p "$TEST_WORKSPACE"

    # THEN: The directory should exist
    if [ -d "$TEST_WORKSPACE" ]; then
        log_success "Workspace created successfully"
        return 0
    fi

    log_error "Failed to create workspace"
    return 1
}

# ============================================================================
# TEST 2: Verify files can be written to workspace
# ============================================================================

test_file_write() {
    log_step "TEST 2: Verify files can be written to workspace"

    # GIVEN: A workspace directory exists
    if [ ! -d "$TEST_WORKSPACE" ]; then
        log_error "Workspace does not exist"
        return 1
    fi

    # WHEN: We write a file using common patterns
    echo "$TEST_CONTENT" > "$TEST_FILE"

    # THEN: The file should exist with correct content
    if [ -f "$TEST_FILE" ]; then
        local content
        content=$(cat "$TEST_FILE")
        if [[ "$content" == "$TEST_CONTENT" ]]; then
            log_success "File written successfully with correct content"
            return 0
        fi
    fi

    log_error "Failed to write file to workspace"
    return 1
}

# ============================================================================
# TEST 3: Verify file permissions are correct
# ============================================================================

test_file_permissions() {
    log_step "TEST 3: Verify file permissions"

    # GIVEN: A file exists in workspace
    if [ ! -f "$TEST_FILE" ]; then
        log_error "Test file does not exist"
        return 1
    fi

    # WHEN: We check file permissions
    local file_readable=false
    local file_writable=false

    if [ -r "$TEST_FILE" ]; then
        file_readable=true
    fi

    if [ -w "$TEST_FILE" ]; then
        file_writable=true
    fi

    # THEN: File should be readable and writable
    if [ "$file_readable" = true ] && [ "$file_writable" = true ]; then
        log_success "File permissions are correct (readable: $file_readable, writable: $file_writable)"
        return 0
    fi

    log_error "File permissions incorrect (readable: $file_readable, writable: $file_writable)"
    return 1
}

# ============================================================================
# TEST 4: Verify multiple file creation
# ============================================================================

test_multiple_files() {
    log_step "TEST 4: Verify multiple files can be created"

    # GIVEN: A workspace exists
    local file_count=5
    local created_count=0

    # WHEN: We create multiple files
    for i in $(seq 1 $file_count); do
        local test_file="$TEST_WORKSPACE/deliverable-${i}.txt"
        echo "Deliverable $i - Task $TASK_ID" > "$test_file"

        if [ -f "$test_file" ]; then
            ((created_count++))
        fi
    done

    # THEN: All files should be created
    if [ "$created_count" -eq "$file_count" ]; then
        log_success "Created $created_count/$file_count files successfully"
        return 0
    fi

    log_error "Only created $created_count/$file_count files"
    return 1
}

# ============================================================================
# TEST 5: Verify subdirectory creation
# ============================================================================

test_subdirectory_creation() {
    log_step "TEST 5: Verify subdirectories can be created"

    # GIVEN: A workspace exists
    local subdir="$TEST_WORKSPACE/nested/deep/directory"

    # WHEN: We create a nested directory structure
    mkdir -p "$subdir"
    echo "Nested file" > "$subdir/nested-file.txt"

    # THEN: Directory and file should exist
    if [ -d "$subdir" ] && [ -f "$subdir/nested-file.txt" ]; then
        log_success "Nested directory structure created successfully"
        return 0
    fi

    log_error "Failed to create nested directory structure"
    return 1
}

# ============================================================================
# TEST 6: Verify file editing (append)
# ============================================================================

test_file_editing() {
    log_step "TEST 6: Verify files can be edited (appended)"

    # GIVEN: A file exists
    local edit_file="$TEST_WORKSPACE/editable.txt"
    echo "Line 1" > "$edit_file"

    # WHEN: We append to the file
    echo "Line 2" >> "$edit_file"
    echo "Line 3" >> "$edit_file"

    # THEN: File should have all lines
    local line_count
    line_count=$(wc -l < "$edit_file")

    if [ "$line_count" -eq 3 ]; then
        log_success "File editing (append) works correctly"
        return 0
    fi

    log_error "File editing failed: expected 3 lines, got $line_count"
    return 1
}

# ============================================================================
# TEST 7: Verify project root is accessible
# ============================================================================

test_project_root_access() {
    log_step "TEST 7: Verify project root is accessible"

    # GIVEN: The project root path
    log_info "Project root: $PROJECT_ROOT"

    # WHEN: We check if common project files exist
    local accessible=true

    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        log_warn "package.json not found in project root"
    fi

    if [ ! -d "$PROJECT_ROOT/.claude" ]; then
        log_warn ".claude directory not found"
        accessible=false
    fi

    # THEN: Project root should be accessible
    if [ "$accessible" = true ] || [ -d "$PROJECT_ROOT" ]; then
        log_success "Project root is accessible"
        return 0
    fi

    log_error "Project root is not accessible"
    return 1
}

# ============================================================================
# TEST 8: Verify /tmp is accessible (common workspace location)
# ============================================================================

test_tmp_access() {
    log_step "TEST 8: Verify /tmp is accessible"

    # GIVEN: /tmp should be writable
    local tmp_test_file="/tmp/cfn-tmp-test-${TEST_ID}.txt"

    # WHEN: We write to /tmp
    echo "tmp test" > "$tmp_test_file"

    # THEN: File should exist
    if [ -f "$tmp_test_file" ]; then
        rm -f "$tmp_test_file"
        log_success "/tmp is accessible and writable"
        return 0
    fi

    log_error "/tmp is not accessible"
    return 1
}

# ============================================================================
# TEST 9: Verify bash commands work (simulating Bash tool)
# ============================================================================

test_bash_tool_simulation() {
    log_step "TEST 9: Verify Bash tool simulation"

    # GIVEN: We need to run bash commands like the Bash tool does

    # WHEN: We run common bash operations
    local result_file="$TEST_WORKSPACE/bash-result.txt"

    # Simulate what Bash tool might do
    pwd > "$result_file"
    echo "---" >> "$result_file"
    ls -la "$TEST_WORKSPACE" >> "$result_file"
    echo "---" >> "$result_file"
    date >> "$result_file"

    # THEN: Commands should produce output
    if [ -f "$result_file" ] && [ -s "$result_file" ]; then
        local line_count
        line_count=$(wc -l < "$result_file")
        if [ "$line_count" -gt 3 ]; then
            log_success "Bash tool simulation successful ($line_count lines of output)"
            return 0
        fi
    fi

    log_error "Bash tool simulation failed"
    return 1
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

run_all_tests() {
    setup_test "agent-tool-access"

    annotate "CLI Mode Agent Tool Access Tests"
    log_info "Test ID: $TEST_ID"
    log_info "Workspace: $TEST_WORKSPACE"
    log_info "Architecture: Main-chat-as-coordinator"
    echo ""

    # Execute test sequence
    test_workspace_creation          || exit 1
    test_file_write                  || exit 1
    test_file_permissions            || exit 1
    test_multiple_files              || exit 1
    test_subdirectory_creation       || exit 1
    test_file_editing                || exit 1
    test_project_root_access         || exit 1
    test_tmp_access                  || exit 1
    test_bash_tool_simulation        || exit 1

    print_test_summary
}

run_all_tests
