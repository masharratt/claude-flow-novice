#!/bin/bash
# test-hello-world-creation.sh
# Test for hello-world.txt deliverable creation (Task ID: cfn-1763690853)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
    # Remove test file if it exists
    rm -f "$PROJECT_ROOT/hello-world.txt"
}
trap cleanup EXIT

test_hello_world_file_creation() {
    log_step "GIVEN no hello-world.txt file exists"
    
    # Verify file doesn't exist initially
    if [ -f "$PROJECT_ROOT/hello-world.txt" ]; then
        log_info "ERROR: File already exists, removing it"
        rm -f "$PROJECT_ROOT/hello-world.txt"
    fi
    
    log_step "WHEN hello-world.txt should be created"
    
    # Check if file exists (this should fail initially)
    if [ ! -f "$PROJECT_ROOT/hello-world.txt" ]; then
        log_info "EXPECTED FAILURE: File does not exist yet"
        return 1
    fi
    
    log_step "THEN file should exist with proper content"
    
    # Check file exists
    assert_file_exists "$PROJECT_ROOT/hello-world.txt"
    
    # Check file has content
    if [ ! -s "$PROJECT_ROOT/hello-world.txt" ]; then
        log_info "ERROR: File exists but is empty"
        return 1
    fi
    
    log_info "SUCCESS: hello-world.txt created with content"
}

echo "Running failing test for deliverable creation..."
test_hello_world_file_creation || echo "Test failed as expected - deliverable not yet implemented"