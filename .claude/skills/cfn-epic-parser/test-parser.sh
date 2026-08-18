#!/usr/bin/env bash

# Test script for cfn-epic-parser
# Runs various tests to verify parser functionality

set -euo pipefail

# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test result tracking
log_test() {
    local name="$1"
    local expected="$2"
    local actual="$3"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    if [[ "$expected" == "$actual" ]]; then
        echo -e "${GREEN}✓${NC} $name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗${NC} $name"
        echo -e "  Expected: $expected"
        echo -e "  Actual: $actual"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# Helper functions
setup_test_dir() {
    TEST_DIR=$(mktemp -d)
    cd "$TEST_DIR"
    echo "Created test directory: $TEST_DIR"
}

cleanup_test_dir() {
    cd /
    rm -rf "$TEST_DIR"
    echo "Cleaned up test directory: $TEST_DIR"
}

# Test files
create_test_epic() {
    cat > test-epic.md << 'EOF'
# Test Epic Implementation

**Epic ID**: `test-epic-001`
**Status**: ❌ Not Started
**Estimated Duration**: 10 weeks
**Owner**: Test Team
**Priority**: High

## Epic Description

This is a test epic for verifying the parser functionality. It includes all required sections and metadata.

## Strategic Goals

1. Implement feature X with high quality
2. Ensure proper testing coverage
3. Document all components
4. Deploy to production

## Phases

### Phase 1: Foundation
**Status**: Not Started
**Duration**: 3 weeks
**Dependencies**: None

Build the foundational components for the epic.

### Phase 2: Implementation
**Status**: Not Started
**Duration**: 5 weeks
**Dependencies**: Phase 1

Implement the main features.

### Phase 3: Testing & Deployment
**Status**: Not Started
**Duration**: 2 weeks
**Dependencies**: Phase 2

Test and deploy the features.

EOF
}

create_minimal_epic() {
    cat > minimal-epic.md << 'EOF'
# Minimal Epic

Simple epic with minimal structure.
EOF
}

# Test functions
test_help_output() {
    local output
    output=$(./parse.sh --help 2>&1 || true)
    log_test "Help output contains usage" "0" "$(echo "$output" | grep -q "USAGE:" && echo 0 || echo 1)"
}

test_missing_file() {
    local output
    output=$(./parse.sh nonexistent.md 2>&1 || true)
    log_test "Missing file error" "0" "$(echo "$output" | grep -q "not found" && echo 0 || echo 1)"
}

test_invalid_mode() {
    create_test_epic
    local output
    output=$(./parse.sh test-epic.md --mode invalid 2>&1 || true)
    log_test "Invalid mode error" "0" "$(echo "$output" | grep -q "Invalid mode" && echo 0 || echo 1)"
}

test_metadata_extraction() {
    create_test_epic
    local output
    output=$(./parse.sh test-epic.md --mode mdap)

    # Check epic ID
    local epic_id
    epic_id=$(echo "$output" | jq -r '.metadata.epicId // empty')
    log_test "Epic ID extracted" "test-epic-001" "$epic_id"

    # Check status
    local status
    status=$(echo "$output" | jq -r '.metadata.status // empty')
    log_test "Status extracted" "not_started" "$status"

    # Check priority
    local priority
    priority=$(echo "$output" | jq -r '.metadata.priority // empty')
    log_test "Priority extracted" "High" "$priority"

    # Check duration
    local duration
    duration=$(echo "$output" | jq -r '.metadata.estimatedDuration // empty')
    log_test "Duration extracted" "10 weeks" "$duration"

    # Check owner
    local owner
    owner=$(echo "$output" | jq -r '.metadata.owner // empty')
    log_test "Owner extracted" "Test Team" "$owner"
}

test_phase_extraction() {
    create_test_epic
    local output
    output=$(./parse.sh test-epic.md --mode cfn-loop)

    # Check phase count
    local phase_count
    phase_count=$(echo "$output" | jq '.phases | length')
    log_test "Phase count" "3" "$phase_count"

    # Check first phase
    local phase1_name
    phase1_name=$(echo "$output" | jq -r '.phases[0].name // empty')
    log_test "Phase 1 name" "Foundation" "$phase1_name"

    # Check phase dependencies
    local phase2_deps
    phase2_deps=$(echo "$output" | jq -r '.phases[1].dependencies | join(", ") // empty')
    log_test "Phase 2 dependencies" "Phase 1" "$phase2_deps"
}

test_goal_extraction() {
    create_test_epic
    local output
    output=$(./parse.sh test-epic.md --mode mdap)

    # Check goal count
    local goal_count
    goal_count=$(echo "$output" | jq '.goals | length')
    log_test "Goal count" "4" "$goal_count"

    # Check first goal
    local goal1
    goal1=$(echo "$output" | jq -r '.goals[0] // empty')
    log_test "First goal" "Implement feature X with high quality" "$goal1"
}

test_mode_detection() {
    create_test_epic
    local output
    output=$(./parse.sh test-epic.md --mode auto)

    # Should detect cfn-loop due to phases
    local mode
    mode=$(echo "$output" | jq -r '.executionMode // empty')
    log_test "Auto mode detection" "cfn-loop" "$mode"
}

test_validation() {
    create_test_epic
    local output
    output=$(./parse.sh test-epic.md --validate 2>&1 || true)
    log_test "Validation passes" "0" "$(echo "$output" | grep -q "Validation passed" && echo 0 || echo 1)"
}

test_minimal_epic() {
    create_minimal_epic
    local output
    output=$(./parse.sh minimal-epic.md --mode auto 2>&1 || true)

    # Should still generate valid JSON
    local is_json
    is_json=$(echo "$output" | jq . >/dev/null 2>&1 && echo 0 || echo 1)
    log_test "Minimal epic generates valid JSON" "0" "$is_json"

    # Should generate epic ID from filename
    local epic_id
    epic_id=$(echo "$output" | jq -r '.metadata.epicId // empty')
    log_test "Generated epic ID" "epic-minimal-epic" "$epic_id"
}

test_output_file() {
    create_test_epic
    local output_file="test-output.json"

    ./parse.sh test-epic.md --output "$output_file" >/dev/null 2>&1
    local file_exists
    file_exists=$([[ -f "$output_file" ]] && echo 0 || echo 1)
    log_test "Output file created" "0" "$file_exists"

    # Check file content is valid JSON
    local is_json
    is_json=$(jq . "$output_file" >/dev/null 2>&1 && echo 0 || echo 1)
    log_test "Output file contains valid JSON" "0" "$is_json"
}

# Run all tests
run_all_tests() {
    echo "Running cfn-epic-parser tests..."
    echo

    # Setup
    setup_test_dir

    # Copy parser script
    cp $PROJECT_ROOT/.claude/skills/cfn-epic-parser/parse.sh ./

    # Run tests
    test_help_output
    test_missing_file
    test_invalid_mode
    test_metadata_extraction
    test_phase_extraction
    test_goal_extraction
    test_mode_detection
    test_validation
    test_minimal_epic
    test_output_file

    # Cleanup
    cleanup_test_dir

    # Report results
    echo
    echo "Test Results:"
    echo "------------"
    echo -e "Total:  $TESTS_TOTAL"
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo -e "\n${GREEN}All tests passed!${NC}"
        return 0
    else
        echo -e "\n${RED}Some tests failed.${NC}"
        return 1
    fi
}

# Check if jq is available
if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required but not installed."
    echo "Install jq to run tests:"
    echo "  - Ubuntu/Debian: sudo apt-get install jq"
    echo "  - macOS: brew install jq"
    exit 1
fi

# Run tests
run_all_tests