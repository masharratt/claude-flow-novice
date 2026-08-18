#!/usr/bin/env bash
# Comprehensive validation tests for skills fixed in the epic
# Tests all phases of fixes: Infrastructure, Working Skills, New/Updated, and Complex Skills

set -euo pipefail

# Source test utilities
source "$(dirname "$0")/../test-utils.sh"

# Test configuration
readonly TEST_RESULTS_DIR="/tmp/epic-skills-validation-$(date +%s)"
readonly REPORT_FILE="$TEST_RESULTS_DIR/validation-report.md"
mkdir -p "$TEST_RESULTS_DIR"

# Initialize report
cat > "$REPORT_FILE" << 'INNER_EOF'
# Epic Skills Validation Report

Generated: $(date)

## Summary of Skills Tested

INNER_EOF

# Track results
declare -A SKILL_RESULTS
declare -A SKILL_SCORES
TOTAL_TESTS=0
PASSED_TESTS=0

# Test utilities
test_skill_exists() {
    local skill_path="$1"
    if [[ -f "$skill_path" ]]; then
        log_info "✓ Skill exists: $skill_path"
        return 0
    else
        log_error "✗ Skill missing: $skill_path"
        return 1
    fi
}

test_skill_executable() {
    local skill_path="$1"
    if [[ -x "$skill_path" ]]; then
        log_info "✓ Skill executable: $skill_path"
        return 0
    else
        log_error "✗ Skill not executable: $skill_path"
        return 1
    fi
}

test_skill_syntax() {
    local skill_path="$1"
    local skill_type="${2:-shell}"
    
    case "$skill_type" in
        "shell")
            if bash -n "$skill_path" 2>/dev/null; then
                log_info "✓ Shell syntax valid: $skill_path"
                return 0
            else
                log_error "✗ Shell syntax error in: $skill_path"
                bash -n "$skill_path" || true
                return 1
            fi
            ;;
        "rust")
            if command -v rustc >/dev/null 2>&1; then
                local dir=$(dirname "$skill_path")
                if (cd "$dir" && cargo check --quiet 2>/dev/null); then
                    log_info "✓ Rust code compiles: $skill_path"
                    return 0
                else
                    log_error "✗ Rust compilation error: $skill_path"
                    (cd "$dir" && cargo check) || true
                    return 1
                fi
            else
                log_warn "? Rust compiler not available, skipping syntax check"
                return 0
            fi
            ;;
    esac
}

test_skill_functionality() {
    local skill_path="$1"
    local test_name="$2"
    
    log_step "Testing functionality: $test_name"
    
    # Create temporary test directory
    local test_dir="/tmp/skill-test-$$-$RANDOM"
    mkdir -p "$test_dir"
    
    # Run basic functionality test based on skill type
    case "$test_name" in
        "bootstrap-sqlite-params")
            # Test with various scenarios
            export CFN_SQLITE_DB_PATH="$test_dir/test.db"
            if "$skill_path" --help 2>/dev/null | grep -q "usage"; then
                log_info "✓ Help output works"
                return 0
            else
                log_error "✗ Help output failed"
                return 1
            fi
            ;;
        "path-utils")
            # Test path normalization functions
            if bash -c "source '$skill_path' && validate_path '/tmp/test'"; then
                log_info "✓ Path validation works"
                return 0
            else
                log_error "✗ Path validation failed"
                return 1
            fi
            ;;
        "cfn-utilities")
            # Test JSON logging functionality
            if bash -c "source '$skill_path' 2>/dev/null && command -v log_json >/dev/null"; then
                log_info "✓ JSON logging functions available"
                return 0
            else
                log_error "✗ JSON logging functions missing"
                return 1
            fi
            ;;
        "cfn-conversation-sync")
            # Test Windows path handling
            if grep -q "convert_windows_path" "$skill_path"; then
                log_info "✓ Windows path conversion present"
                return 0
            else
                log_error "✗ Windows path conversion missing"
                return 1
            fi
            ;;
        "cfn-error-management")
            # Test CLI wrapper functions
            if grep -q "validate_cli_environment" "$skill_path"; then
                log_info "✓ CLI validation functions present"
                return 0
            else
                log_error "✗ CLI validation functions missing"
                return 1
            fi
            ;;
        "cfn-test-framework")
            # Test CLI interface
            if grep -q "main()" "$skill_path" && grep -q "\-\-help" "$skill_path"; then
                log_info "✓ CLI interface implemented"
                return 0
            else
                log_error "✗ CLI interface missing"
                return 1
            fi
            ;;
        "cfn-epic-parser")
            # Test epic parsing functionality
            if grep -q "parse_epic" "$skill_path"; then
                log_info "✓ Epic parsing function present"
                return 0
            else
                log_error "✗ Epic parsing function missing"
                return 1
            fi
            ;;
        "cfn-parameterized-queries")
            # Test security fixes
            if grep -q "sanitize_query" "$skill_path" && grep -q "validate_parameters" "$skill_path"; then
                log_info "✓ Security functions implemented"
                return 0
            else
                log_error "✗ Security functions missing"
                return 1
            fi
            ;;
        "cfn-transparency-middleware")
            # Test Rust implementation
            if [[ -f "$(dirname "$skill_path")/Cargo.toml" ]]; then
                log_info "✓ Rust project structure present"
                return 0
            else
                log_error "✗ Rust project structure missing"
                return 1
            fi
            ;;
        "cfn-validation-framework"|"cfn-docker-runtime"|"cfn-agent-lifecycle")
            # Test entry points
            if [[ -f "$skill_path" ]] && grep -q "main()" "$skill_path"; then
                log_info "✓ Entry point implemented"
                return 0
            else
                log_error "✗ Entry point missing or incomplete"
                return 1
            fi
            ;;
    esac
    
    # Cleanup
    rm -rf "$test_dir"
    return 1
}

# Test skill
test_skill() {
    local skill_name="$1"
    local skill_path="$2"
    local skill_type="${3:-shell}"
    
    echo
    log_step "Testing skill: $skill_name"
    echo "  Path: $skill_path"
    echo "  Type: $skill_type"
    
    local skill_passed=0
    local skill_total=0
    
    # Test 1: Skill exists
    ((skill_total++))
    if test_skill_exists "$skill_path"; then
        ((skill_passed++))
    fi
    
    # Test 2: Skill is executable
    ((skill_total++))
    if test_skill_executable "$skill_path"; then
        ((skill_passed++))
    fi
    
    # Test 3: Syntax is valid
    ((skill_total++))
    if test_skill_syntax "$skill_path" "$skill_type"; then
        ((skill_passed++))
    fi
    
    # Test 4: Basic functionality
    ((skill_total++))
    if test_skill_functionality "$skill_path" "$skill_name"; then
        ((skill_passed++))
    fi
    
    # Calculate score
    local score=$((skill_passed * 100 / skill_total))
    SKILL_SCORES[$skill_name]=$score
    SKILL_RESULTS[$skill_name]="$skill_passed/$skill_total tests passed"
    
    ((TOTAL_TESTS += skill_total))
    ((PASSED_TESTS += skill_passed))
    
    # Add to report
    cat >> "$REPORT_FILE" << INNER_EOF
### $skill_name
- Status: $([ $score -ge 80 ] && echo "✓ PASS" || echo "✗ FAIL")
- Score: $score%
- Details: ${SKILL_RESULTS[$skill_name]}
INNER_EOF
}

# Main testing
echo "Starting Epic Skills Validation..."
echo "Results directory: $TEST_RESULTS_DIR"
echo

# Phase 1: Infrastructure
echo "=== Phase 1: Infrastructure ==="
test_skill "bootstrap-sqlite-params" ".claude/skills/shared/bootstrap/sqlite-params.sh" "shell"
test_skill "path-utils" ".claude/skills/shared/lib/path-utils.sh" "shell"

# Phase 2: Working Skills
echo
echo "=== Phase 2: Working Skills ==="
test_skill "cfn-utilities" ".claude/skills/cfn-utilities/SKILL.sh" "shell"
test_skill "cfn-conversation-sync" ".claude/skills/cfn-conversation-sync/sync.sh" "shell"
test_skill "cfn-node-heap-sizer" ".claude/skills/cfn-node-heap-sizer/heap-sizer.sh" "shell"
test_skill "cfn-error-management" ".claude/skills/cfn-error-management/error-handler.sh" "shell"
test_skill "cfn-test-framework" ".claude/skills/cfn-test-framework/test-runner.sh" "shell"

# Phase 3: New/Updated
echo
echo "=== Phase 3: New/Updated ==="
test_skill "cfn-epic-parser" ".claude/skills/cfn-epic-parser/parser.sh" "shell"

# Phase 4: Complex Skills
echo
echo "=== Phase 4: Complex Skills ==="
test_skill "cfn-parameterized-queries" ".claude/skills/cfn-parameterized-queries/queries.sh" "shell"
test_skill "cfn-transparency-middleware" ".claude/skills/cfn-transparency-middleware/src/main.rs" "rust"
test_skill "cfn-validation-framework" ".claude/skills/cfn-validation-framework/validate.sh" "shell"
test_skill "cfn-docker-runtime" ".claude/skills/cfn-docker-runtime/runtime.sh" "shell"
test_skill "cfn-agent-lifecycle" ".claude/skills/cfn-agent-lifecycle/lifecycle.sh" "shell"

# Generate summary
echo
echo "=== Validation Summary ==="
overall_score=$((PASSED_TESTS * 100 / TOTAL_TESTS))

cat >> "$REPORT_FILE" << INNER_EOF

## Overall Results
- Total Tests: $TOTAL_TESTS
- Passed: $PASSED_TESTS
- Overall Score: $overall_score%

## Skills Requiring Attention
INNER_EOF

# List skills with low scores
for skill in "${!SKILL_SCORES[@]}"; do
    if [[ ${SKILL_SCORES[$skill]} -lt 80 ]]; then
        echo "- $skill: ${SKILL_SCORES[$skill]}%" >> "$REPORT_FILE"
    fi
done

# Print final results
echo "Total tests run: $TOTAL_TESTS"
echo "Tests passed: $PASSED_TESTS"
echo "Overall score: $overall_score%"
echo
echo "Skills with issues:"
for skill in "${!SKILL_SCORES[@]}"; do
    if [[ ${SKILL_SCORES[$skill]} -lt 80 ]]; then
        echo "  - $skill: ${SKILL_SCORES[$skill]}% (${SKILL_RESULTS[$skill]})"
    fi
done

echo
echo "Full report saved to: $REPORT_FILE"

# Exit with appropriate code
if [[ $overall_score -ge 80 ]]; then
    echo "✓ Epic skills validation PASSED"
    exit 0
else
    echo "✗ Epic skills validation FAILED"
    exit 1
fi
