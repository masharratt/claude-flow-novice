#!/usr/bin/env bash
set -euo pipefail

# CFN Epic Creator - Test Invoke Script
# Comprehensive test suite for epic-creator skill

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INVOKE_SCRIPT="${SCRIPT_DIR}/invoke.sh"
VALIDATE_SCRIPT="${SCRIPT_DIR}/validate-epic.sh"
PARSE_SCRIPT="${SCRIPT_DIR}/parse-personas.sh"
ESTIMATE_SCRIPT="${SCRIPT_DIR}/estimate-costs.sh"

# Test data
TEST_EPIC_DESCRIPTION="Build a real-time analytics dashboard with user authentication, data visualization, and automated reporting capabilities"
TEST_OUTPUT_DIR="/tmp/epic-creator-tests"
TEST_EPIC_FILE="${TEST_OUTPUT_DIR}/test-epic.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test counters
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*" >&2
}

log_test() {
    echo -e "${CYAN}[TEST]${NC} $*"
}

# Test utilities
test_start() {
    local test_name="$1"
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo ""
    log_test "Running: $test_name"
}

test_pass() {
    local message="$1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    log_success "$message"
}

test_fail() {
    local message="$1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    log_error "$message"
}

# Cleanup function
cleanup() {
    if [[ -d "$TEST_OUTPUT_DIR" ]]; then
        rm -rf "$TEST_OUTPUT_DIR"
    fi
}

# Setup test environment
setup() {
    log_info "Setting up test environment..."
    cleanup
    mkdir -p "$TEST_OUTPUT_DIR"
    
    # Check if jq is available
    if ! command -v jq >/dev/null 2>&1; then
        log_error "Required command 'jq' not found. Please install jq to run tests."
        exit 1
    fi
    
    # Check if scripts are executable
    for script in "$INVOKE_SCRIPT" "$VALIDATE_SCRIPT" "$PARSE_SCRIPT" "$ESTIMATE_SCRIPT"; do
        if [[ -f "$script" ]]; then
            chmod +x "$script"
        else
            log_error "Script not found: $script"
            exit 1
        fi
    done
    
    log_success "Test environment ready"
}

# Test help functionality
test_help() {
    test_start "Help functionality"
    
    # Test invoke.sh help
    if "$INVOKE_SCRIPT" --help | grep -q "CFN Epic Creator"; then
        test_pass "invoke.sh help displayed correctly"
    else
        test_fail "invoke.sh help not displayed"
    fi
    
    # Test validate-epic.sh help
    if "$VALIDATE_SCRIPT" --help | grep -q "Validate Epic JSON"; then
        test_pass "validate-epic.sh help displayed correctly"
    else
        test_fail "validate-epic.sh help not displayed"
    fi
    
    # Test parse-personas.sh help
    if "$PARSE_SCRIPT" --help | grep -q "Parse Personas"; then
        test_pass "parse-personas.sh help displayed correctly"
    else
        test_fail "parse-personas.sh help not displayed"
    fi
    
    # Test estimate-costs.sh help
    if "$ESTIMATE_SCRIPT" --help | grep -q "Estimate Costs"; then
        test_pass "estimate-costs.sh help displayed correctly"
    else
        test_fail "estimate-costs.sh help not displayed"
    fi
}

# Test argument validation
test_argument_validation() {
    test_start "Argument validation"
    
    # Test missing epic description
    if "$INVOKE_SCRIPT" 2>&1 | grep -q "Missing required epic description"; then
        test_pass "Missing epic description error displayed"
    else
        test_fail "Missing epic description not detected"
    fi
    
    # Test invalid mode
    if "$INVOKE_SCRIPT" "test" --mode=invalid 2>&1 | grep -q "Invalid mode"; then
        test_pass "Invalid mode error displayed"
    else
        test_fail "Invalid mode not detected"
    fi
    
    # Test unknown option
    if "$INVOKE_SCRIPT" "test" --unknown-option 2>&1 | grep -q "Unknown option"; then
        test_pass "Unknown option error displayed"
    else
        test_fail "Unknown option not detected"
    fi
}

# Test epic generation
test_epic_generation() {
    test_start "Epic generation"
    
    # Generate epic with all modes
    local modes=("mvp" "standard" "enterprise")
    
    for mode in "${modes[@]}"; do
        local output_file="${TEST_OUTPUT_DIR}/epic-${mode}.json"
        
        if "$INVOKE_SCRIPT" "$TEST_EPIC_DESCRIPTION" \
            --mode="$mode" \
            --output="$output_file" \
            --verbose > "${TEST_OUTPUT_DIR}/invoke-${mode}.log" 2>&1; then
            
            if [[ -f "$output_file" ]]; then
                test_pass "Epic generated successfully in $mode mode"
                
                # Validate generated JSON
                if "$VALIDATE_SCRIPT" "$output_file" >/dev/null 2>&1; then
                    test_pass "Generated epic JSON is valid for $mode mode"
                else
                    test_fail "Generated epic JSON is invalid for $mode mode"
                fi
            else
                test_fail "Epic file not created for $mode mode"
            fi
        else
            test_fail "Epic generation failed for $mode mode"
        fi
    done
}

# Test validate functionality
test_validation() {
    test_start "Validation functionality"
    
    # Generate a test epic first
    if ! "$INVOKE_SCRIPT" "$TEST_EPIC_DESCRIPTION" \
        --output="$TEST_EPIC_FILE" >/dev/null 2>&1; then
        test_fail "Failed to generate test epic for validation"
        return
    fi
    
    # Test normal validation
    if "$VALIDATE_SCRIPT" "$TEST_EPIC_FILE" >/dev/null 2>&1; then
        test_pass "Normal validation passed"
    else
        test_fail "Normal validation failed"
    fi
    
    # Test verbose validation
    if "$VALIDATE_SCRIPT" "$TEST_EPIC_FILE" --verbose > "${TEST_OUTPUT_DIR}/validation.log" 2>&1; then
        test_pass "Verbose validation passed"
    else
        test_fail "Verbose validation failed"
    fi
    
    # Test strict validation (should pass if generated correctly)
    if "$VALIDATE_SCRIPT" "$TEST_EPIC_FILE" --strict >/dev/null 2>&1; then
        test_pass "Strict validation passed"
    else
        test_warning "Strict validation failed (may have warnings)"
    fi
    
    # Test invalid file
    echo '{"invalid": "json"}' > "${TEST_OUTPUT_DIR}/invalid.json"
    if ! "$VALIDATE_SCRIPT" "${TEST_OUTPUT_DIR}/invalid.json" >/dev/null 2>&1; then
        test_pass "Invalid JSON rejected"
    else
        test_fail "Invalid JSON accepted"
    fi
    
    # Test missing file
    if ! "$VALIDATE_SCRIPT" "${TEST_OUTPUT_DIR}/nonexistent.json" >/dev/null 2>&1; then
        test_pass "Missing file rejected"
    else
        test_fail "Missing file accepted"
    fi
}

# Test persona parsing
test_persona_parsing() {
    test_start "Persona parsing functionality"
    
    # Generate a test epic first
    if ! "$INVOKE_SCRIPT" "$TEST_EPIC_DESCRIPTION" \
        --output="$TEST_EPIC_FILE" >/dev/null 2>&1; then
        test_fail "Failed to generate test epic for persona parsing"
        return
    fi
    
    # Test parsing all personas
    if "$PARSE_SCRIPT" "$TEST_EPIC_FILE" > "${TEST_OUTPUT_DIR}/parse-all.log" 2>&1; then
        test_pass "Parsed all personas successfully"
    else
        test_fail "Failed to parse all personas"
    fi
    
    # Test parsing specific persona
    if "$PARSE_SCRIPT" "$TEST_EPIC_FILE" --persona=architect > "${TEST_OUTPUT_DIR}/parse-architect.log" 2>&1; then
        test_pass "Parsed architect persona successfully"
    else
        test_fail "Failed to parse architect persona"
    fi
    
    # Test filtering by type
    if "$PARSE_SCRIPT" "$TEST_EPIC_FILE" --type=blocking > "${TEST_OUTPUT_DIR}/parse-blocking.log" 2>&1; then
        test_pass "Filtered by blocking type successfully"
    else
        test_fail "Failed to filter by blocking type"
    fi
    
    # Test filtering by priority
    if "$PARSE_SCRIPT" "$TEST_EPIC_FILE" --priority=critical > "${TEST_OUTPUT_DIR}/parse-critical.log" 2>&1; then
        test_pass "Filtered by critical priority successfully"
    else
        test_fail "Failed to filter by critical priority"
    fi
    
    # Test JSON format
    if "$PARSE_SCRIPT" "$TEST_EPIC_FILE" --format=json | jq . >/dev/null 2>&1; then
        test_pass "JSON format output is valid"
    else
        test_fail "JSON format output is invalid"
    fi
    
    # Test markdown format
    if "$PARSE_SCRIPT" "$TEST_EPIC_FILE" --format=markdown > "${TEST_OUTPUT_DIR}/parse-markdown.md" 2>&1; then
        test_pass "Markdown format generated successfully"
    else
        test_fail "Failed to generate markdown format"
    fi
    
    # Test count only
    if "$PARSE_SCRIPT" "$TEST_EPIC_FILE" --count > "${TEST_OUTPUT_DIR}/parse-count.log" 2>&1; then
        test_pass "Count only mode works"
    else
        test_fail "Count only mode failed"
    fi
    
    # Test invalid persona
    if ! "$PARSE_SCRIPT" "$TEST_EPIC_FILE" --persona=invalid >/dev/null 2>&1; then
        test_pass "Invalid persona rejected"
    else
        test_fail "Invalid persona accepted"
    fi
}

# Test cost estimation
test_cost_estimation() {
    test_start "Cost estimation functionality"
    
    # Generate a test epic first
    if ! "$INVOKE_SCRIPT" "$TEST_EPIC_DESCRIPTION" \
        --output="$TEST_EPIC_FILE" >/dev/null 2>&1; then
        test_fail "Failed to generate test epic for cost estimation"
        return
    fi
    
    # Test summary format
    if "$ESTIMATE_SCRIPT" "$TEST_EPIC_FILE" > "${TEST_OUTPUT_DIR}/cost-summary.log" 2>&1; then
        test_pass "Cost summary generated successfully"
    else
        test_fail "Failed to generate cost summary"
    fi
    
    # Test detailed format
    if "$ESTIMATE_SCRIPT" "$TEST_EPIC_FILE" --format=detailed > "${TEST_OUTPUT_DIR}/cost-detailed.log" 2>&1; then
        test_pass "Cost details generated successfully"
    else
        test_fail "Failed to generate cost details"
    fi
    
    # Test CSV format
    if "$ESTIMATE_SCRIPT" "$TEST_EPIC_FILE" --format=csv > "${TEST_OUTPUT_DIR}/costs.csv" 2>&1; then
        test_pass "Cost CSV generated successfully"
    else
        test_fail "Failed to generate cost CSV"
    fi
    
    # Test JSON format
    if "$ESTIMATE_SCRIPT" "$TEST_EPIC_FILE" --format=json | jq . >/dev/null 2>&1; then
        test_pass "Cost JSON format is valid"
    else
        test_fail "Cost JSON format is invalid"
    fi
    
    # Test filtering by type
    if "$ESTIMATE_SCRIPT" "$TEST_EPIC_FILE" --type=blocking > "${TEST_OUTPUT_DIR}/cost-blocking.log" 2>&1; then
        test_pass "Cost filtering by blocking type works"
    else
        test_fail "Failed to filter costs by blocking type"
    fi
    
    # Test filtering by persona
    if "$ESTIMATE_SCRIPT" "$TEST_EPIC_FILE" --persona=security-specialist > "${TEST_OUTPUT_DIR}/cost-security.log" 2>&1; then
        test_pass "Cost filtering by persona works"
    else
        test_fail "Failed to filter costs by persona"
    fi
    
    # Test sorting
    if "$ESTIMATE_SCRIPT" "$TEST_EPIC_FILE" --sort-by=total > "${TEST_OUTPUT_DIR}/cost-sorted.log" 2>&1; then
        test_pass "Cost sorting works"
    else
        test_fail "Failed to sort costs"
    fi
    
    # Test custom currency
    if "$ESTIMATE_SCRIPT" "$TEST_EPIC_FILE" --currency=£ > "${TEST_OUTPUT_DIR}/cost-currency.log" 2>&1; then
        test_pass "Custom currency works"
    else
        test_fail "Failed to use custom currency"
    fi
}

# Test error handling
test_error_handling() {
    test_start "Error handling"
    
    # Test invalid JSON file
    echo "invalid json" > "${TEST_OUTPUT_DIR}/bad.json"
    if ! "$VALIDATE_SCRIPT" "${TEST_OUTPUT_DIR}/bad.json" >/dev/null 2>&1; then
        test_pass "Invalid JSON handled correctly by validation"
    else
        test_fail "Invalid JSON not detected by validation"
    fi
    
    if ! "$PARSE_SCRIPT" "${TEST_OUTPUT_DIR}/bad.json" >/dev/null 2>&1; then
        test_pass "Invalid JSON handled correctly by parser"
    else
        test_fail "Invalid JSON not detected by parser"
    fi
    
    if ! "$ESTIMATE_SCRIPT" "${TEST_OUTPUT_DIR}/bad.json" >/dev/null 2>&1; then
        test_pass "Invalid JSON handled correctly by estimator"
    else
        test_fail "Invalid JSON not detected by estimator"
    fi
    
    # Test missing file
    if ! "$VALIDATE_SCRIPT" "${TEST_OUTPUT_DIR}/missing.json" >/dev/null 2>&1; then
        test_pass "Missing file handled correctly by validation"
    else
        test_fail "Missing file not detected by validation"
    fi
    
    # Test invalid parameters
    if ! "$PARSE_SCRIPT" "$TEST_EPIC_FILE" --persona=invalid >/dev/null 2>&1; then
        test_pass "Invalid persona parameter handled correctly"
    else
        test_fail "Invalid persona parameter not detected"
    fi
    
    if ! "$ESTIMATE_SCRIPT" "$TEST_EPIC_FILE" --format=invalid >/dev/null 2>&1; then
        test_pass "Invalid format parameter handled correctly"
    else
        test_fail "Invalid format parameter not detected"
    fi
}

# Test integration scenarios
test_integration() {
    test_start "Integration scenarios"
    
    # Test complete workflow
    local workflow_file="${TEST_OUTPUT_DIR}/workflow-epic.json"
    
    # 1. Generate epic
    if "$INVOKE_SCRIPT" "$TEST_EPIC_DESCRIPTION" \
        --mode=standard \
        --output="$workflow_file" >/dev/null 2>&1; then
        
        # 2. Validate epic
        if "$VALIDATE_SCRIPT" "$workflow_file" >/dev/null 2>&1; then
            
            # 3. Parse personas
            if "$PARSE_SCRIPT" "$workflow_file" --count >/dev/null 2>&1; then
                
                # 4. Estimate costs
                if "$ESTIMATE_SCRIPT" "$workflow_file" --format=json >/dev/null 2>&1; then
                    test_pass "Complete workflow integration successful"
                else
                    test_fail "Cost estimation failed in workflow"
                fi
            else
                test_fail "Persona parsing failed in workflow"
            fi
        else
            test_fail "Validation failed in workflow"
        fi
    else
        test_fail "Epic generation failed in workflow"
    fi
    
    # Test validate-only mode
    if "$INVOKE_SCRIPT" "$TEST_EPIC_DESCRIPTION" \
        --validate-only >/dev/null 2>&1; then
        test_pass "Validate-only mode works"
    else
        test_fail "Validate-only mode failed"
    fi
    
    # Test with DevOps enforcement
    local devops_file="${TEST_OUTPUT_DIR}/devops-epic.json"
    if "$INVOKE_SCRIPT" "$TEST_EPIC_DESCRIPTION" \
        --enforce-devops \
        --output="$devops_file" >/dev/null 2>&1; then
        
        # Check if DevOps recommendations are blocking
        local devops_blocking
        devops_blocking=$(jq -r '
            .epic.personas[] |
            select(.name == "devops-engineer") |
            .recommendations[] |
            select(.type == "blocking") |
            length
        ' "$devops_file")
        
        if [[ "$devops_blocking" -gt 0 ]]; then
            test_pass "DevOps enforcement creates blocking recommendations"
        else
            test_warning "DevOps enforcement did not create blocking recommendations"
        fi
    else
        test_fail "DevOps enforcement mode failed"
    fi
}

# Show test summary
show_summary() {
    echo ""
    echo "========================================"
    log_info "Test Summary"
    echo "========================================"
    echo -e "Total Tests: ${CYAN}${TESTS_TOTAL}${NC}"
    echo -e "Passed:      ${GREEN}${TESTS_PASSED}${NC}"
    echo -e "Failed:      ${RED}${TESTS_FAILED}${NC}"
    
    local success_rate=0
    if [[ $TESTS_TOTAL -gt 0 ]]; then
        success_rate=$(( (TESTS_PASSED * 100) / TESTS_TOTAL ))
    fi
    
    echo -e "Success Rate: ${YELLOW}${success_rate}%${NC}"
    
    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo ""
        log_success "All tests passed! ✓"
        return 0
    else
        echo ""
        log_error "Some tests failed. Check the logs in $TEST_OUTPUT_DIR"
        return 1
    fi
}

# Main execution
main() {
    local run_all=true
    local test_filter=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --test)
                test_filter="$2"
                run_all=false
                shift 2
                ;;
            --keep-logs)
                # Don't cleanup on exit
                trap - EXIT
                shift
                ;;
            -h|--help)
                cat << 'HELP_EOF'
CFN Epic Creator - Test Suite

USAGE:
    ./test-invoke.sh [OPTIONS]

OPTIONS:
    --test <name>      Run specific test only
    --keep-logs        Keep test logs and temporary files
    -h, --help         Show this help message

AVAILABLE TESTS:
    help                Test help functionality
    validation          Test argument validation
    generation          Test epic generation
    validate            Test validation functionality
    parse               Test persona parsing
    cost                Test cost estimation
    error               Test error handling
    integration         Test integration scenarios

EXAMPLES:
    # Run all tests
    ./test-invoke.sh

    # Run specific test
    ./test-invoke.sh --test generation

    # Keep logs for debugging
    ./test-invoke.sh --keep-logs

HELP_EOF
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Set cleanup trap
    trap cleanup EXIT
    
    # Setup test environment
    setup
    
    # Run tests
    if [[ "$run_all" == true ]]; then
        test_help
        test_argument_validation
        test_epic_generation
        test_validation
        test_persona_parsing
        test_cost_estimation
        test_error_handling
        test_integration
    else
        case "$test_filter" in
            "help") test_help ;;
            "validation") test_argument_validation ;;
            "generation") test_epic_generation ;;
            "validate") test_validation ;;
            "parse") test_persona_parsing ;;
            "cost") test_cost_estimation ;;
            "error") test_error_handling ;;
            "integration") test_integration ;;
            *)
                log_error "Unknown test: $test_filter"
                exit 1
                ;;
        esac
    fi
    
    # Show summary
    show_summary
}

# Execute main function
main "$@"
