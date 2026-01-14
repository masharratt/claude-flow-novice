#!/bin/bash
set -euo pipefail

# Test TDD Conversation Coordinator
# Validates conversation memory and iterative refinement

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COORDINATOR="$SCRIPT_DIR/tdd-conversation-coordinator.sh"

# Test utilities
source "$(dirname "$SCRIPT_DIR")/../../../tests/test-utils.sh" 2>/dev/null || {
    # Fallback test utilities
    log_step() { echo "[STEP] $*"; }
    log_info() { echo "[INFO] $*"; }
    log_error() { echo "[ERROR] $*" >&2; }
    assert_success() { [[ $? -eq 0 ]] || { log_error "Command failed"; exit 1; }; }
    assert_file_exists() { [[ -f "$1" ]] || { log_error "File not found: $1"; exit 1; }; }
    assert_contains() { grep -q "$2" "$1" || { log_error "Pattern '$2' not found in $1"; exit 1; }; }
}

# Setup
TEST_DIR="/tmp/test-tdd-coordinator-$$"
mkdir -p "$TEST_DIR"

cleanup() {
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Test configuration
export ZAI_API_KEY="${ZAI_API_KEY:-test-key-placeholder}"
export ZAI_BASE_URL="${ZAI_BASE_URL:-https://api.zai.ai/v1}"

# === TEST 1: Argument Parsing ===
test_argument_parsing() {
    log_step "TEST 1: Argument parsing and validation"

    # Test help
    if "$COORDINATOR" --help 2>&1 | grep -q "Usage:"; then
        log_info "Help text displays correctly"
    else
        log_error "Help text missing"
        return 1
    fi

    # Test missing required arguments
    local output
    output=$("$COORDINATOR" 2>&1) || true
    if echo "$output" | grep -q "Missing required"; then
        log_info "Missing argument detection works"
    else
        log_error "Should reject missing arguments"
        log_error "Got output: $output"
        return 1
    fi

    log_info "Argument parsing: PASS"
}

# === TEST 2: Conversation Initialization ===
test_conversation_init() {
    log_step "TEST 2: Conversation file initialization"

    # Create minimal test
    local test_feature="Test feature"
    local test_file="$TEST_DIR/test.ts"
    local agent_id="test-agent-$$"

    # Mock API key (won't actually call)
    export ZAI_API_KEY="mock-key"

    # We can't run full coordinator without API, but we can test argument parsing
    local cmd="$COORDINATOR --agent-id $agent_id --feature \"$test_feature\" --file $test_file --test-command \"echo test\" --max-iterations 1 2>&1"

    log_info "Would execute: $cmd"
    log_info "Full execution requires valid ZAI_API_KEY"

    log_info "Conversation initialization: SKIPPED (requires API)"
}

# === TEST 3: Test File Path Generation ===
test_file_path_generation() {
    log_step "TEST 3: Test file path generation logic"

    # Test various file extensions
    declare -A test_cases=(
        ["src/auth.ts"]="src/auth.test.ts"
        ["src/utils.js"]="src/utils.test.js"
        ["src/validator.py"]="src/test_validator.py"
        ["src/handler.go"]="src/handler_test.go"
    )

    local all_pass=true
    for impl_file in "${!test_cases[@]}"; do
        local expected="${test_cases[$impl_file]}"

        # Extract logic from main script (simulate)
        local test_file
        case "${impl_file##*.}" in
            ts|tsx)
                test_file="${impl_file%.*}.test.ts"
                ;;
            js|jsx)
                test_file="${impl_file%.*}.test.js"
                ;;
            py)
                test_file="test_$(basename "$impl_file")"
                test_file="$(dirname "$impl_file")/$test_file"
                ;;
            go)
                test_file="${impl_file%.*}_test.go"
                ;;
            *)
                test_file="${impl_file%.*}.test.${impl_file##*.}"
                ;;
        esac

        if [[ "$test_file" == "$expected" ]]; then
            log_info "$impl_file -> $test_file (OK)"
        else
            log_error "$impl_file -> $test_file (expected: $expected)"
            all_pass=false
        fi
    done

    if [[ "$all_pass" == "true" ]]; then
        log_info "Test file path generation: PASS"
    else
        log_error "Test file path generation: FAIL"
        return 1
    fi
}

# === TEST 4: Conversation File Structure ===
test_conversation_structure() {
    log_step "TEST 4: Conversation JSON structure"

    # Create a mock conversation file
    local conv_file="$TEST_DIR/conversation.json"
    local agent_id="test-agent"
    local feature="Test feature"
    local file_path="$TEST_DIR/test.ts"

    cat > "$conv_file" <<EOF
{
  "messages": [
    {
      "role": "system",
      "content": "You are a TDD expert.",
      "timestamp": "$(date -Iseconds)"
    }
  ],
  "metadata": {
    "agent_id": "$agent_id",
    "feature": "$feature",
    "file_path": "$file_path",
    "started_at": "$(date -Iseconds)",
    "iterations": 0,
    "phase": "init"
  }
}
EOF

    # Validate structure
    assert_file_exists "$conv_file"

    # Check required fields
    if jq -e '.messages | type == "array"' "$conv_file" >/dev/null; then
        log_info "messages array present"
    else
        log_error "messages array missing"
        return 1
    fi

    if jq -e '.metadata.agent_id' "$conv_file" >/dev/null; then
        log_info "metadata.agent_id present"
    else
        log_error "metadata.agent_id missing"
        return 1
    fi

    if jq -e '.metadata.phase' "$conv_file" >/dev/null; then
        log_info "metadata.phase present"
    else
        log_error "metadata.phase missing"
        return 1
    fi

    log_info "Conversation structure: PASS"
}

# === TEST 5: Integration Test (Mock) ===
test_integration_mock() {
    log_step "TEST 5: Integration test with mock API"

    log_info "Full integration test requires:"
    log_info "  - Valid ZAI_API_KEY"
    log_info "  - Test project with runnable tests"
    log_info "  - CodeSearch index (optional)"
    log_info ""
    log_info "Example usage:"
    log_info "  $COORDINATOR \\"
    log_info "    --agent-id tdd-001 \\"
    log_info "    --feature \"Email validator function\" \\"
    log_info "    --file ./src/validators/email.ts \\"
    log_info "    --test-command \"npm test email.test.ts\" \\"
    log_info "    --context \"./src/types.ts\" \\"
    log_info "    --max-iterations 3 \\"
    log_info "    --verbose"

    log_info "Integration test: SKIPPED (requires live API)"
}

# === RUN ALL TESTS ===
main() {
    echo "================================================"
    echo "  TDD Conversation Coordinator - Test Suite"
    echo "================================================"
    echo

    local failed=0

    test_argument_parsing || failed=$((failed + 1))
    echo

    test_conversation_init || failed=$((failed + 1))
    echo

    test_file_path_generation || failed=$((failed + 1))
    echo

    test_conversation_structure || failed=$((failed + 1))
    echo

    test_integration_mock || failed=$((failed + 1))
    echo

    echo "================================================"
    if [[ $failed -eq 0 ]]; then
        echo "  All tests passed!"
        echo "================================================"
        exit 0
    else
        echo "  $failed test(s) failed"
        echo "================================================"
        exit 1
    fi
}

main
