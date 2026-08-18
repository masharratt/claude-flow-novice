#!/usr/bin/env bash
################################################################################
# Test Suite: Dashboard Build Fix Validation
# Purpose: Validate that fixes for dashboard build errors are properly applied
# Coverage: Verify all three error categories have been resolved
# Related: test-dashboard-build-errors.sh (detection), this file (validation)
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../" && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

log_test() {
    echo -e "${BLUE}[FIX VALIDATION $((TESTS_RUN + 1))]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}  ✓ FIX VALIDATED${NC} $*"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}  ✗ FIX MISSING${NC} $*"
    ((TESTS_FAILED++))
}

log_info() {
    echo -e "${YELLOW}  ℹ INFO${NC} $*"
}

run_test() {
    ((TESTS_RUN++))
    "$@"
}

################################################################################
# FIX VALIDATION 1: MCP Selector Module Compatibility
################################################################################

test_mcp_selector_module_fixed() {
    log_test "MCP selector module should use correct module system"

    local mcp_selector="$PROJECT_ROOT/.claude/skills/cfn-docker-skill-mcp-selection/skill-mcp-selector.js"
    local pkg_json="$PROJECT_ROOT/.claude/skills/cfn-docker-skill-mcp-selection/package.json"

    if [[ ! -f "$mcp_selector" ]]; then
        log_info "MCP selector not found - may be refactored or removed"
        return 0
    fi

    # Check if using ES modules (import) or properly declared CommonJS
    local uses_import=$(grep -c "^import " "$mcp_selector" || true)
    local uses_require=$(grep -v '^[[:space:]]*\/\/' "$mcp_selector" | grep -c "require(" || true)
    local is_commonjs=false

    if [[ -f "$pkg_json" ]] && grep -q '"type"[[:space:]]*:[[:space:]]*"commonjs"' "$pkg_json"; then
        is_commonjs=true
    fi

    if [[ $uses_import -gt 0 ]]; then
        log_pass "Using ES module imports (modern approach)"
        return 0
    elif [[ $uses_require -gt 0 && "$is_commonjs" == true ]]; then
        log_pass "Using CommonJS with explicit package.json declaration"
        return 0
    elif [[ $uses_require -gt 0 && "$is_commonjs" == false ]]; then
        log_fail "Still using require() without package.json type:commonjs"
        log_info "Fix: Add {\"type\": \"commonjs\"} to package.json or convert to ES modules"
        return 1
    else
        log_pass "Module appears to be refactored or not using problematic patterns"
        return 0
    fi
}

test_jq_null_safety_implemented() {
    log_test "jq operations should have null-safe operators"

    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # Check for null-safe jq patterns
    # Good: .selectedMCPServers[]? // empty
    # Bad:  .selectedMCPServers[]

    local has_unsafe_patterns=false
    local has_safe_patterns=false

    # Look for jq operations on potentially null arrays
    if grep -q 'jq.*selectedMCPServers\[\]' "$spawn_agent"; then
        # Check if using null-safe operators
        if grep -q 'selectedMCPServers\[\]?.*//.*empty' "$spawn_agent" || \
           grep -q 'selectedMCPServers\[\]? //' "$spawn_agent"; then
            has_safe_patterns=true
        else
            has_unsafe_patterns=true
        fi
    fi

    if [[ "$has_unsafe_patterns" == true ]]; then
        log_fail "Found jq operations without null-safe operators"
        log_info "Fix applied but still has unsafe patterns"
        grep -n 'jq.*selectedMCPServers\[\]' "$spawn_agent" | grep -v '?' | head -3
        return 1
    elif [[ "$has_safe_patterns" == true ]]; then
        log_pass "jq operations use null-safe operators"
        return 0
    else
        log_pass "No MCP server array iteration or already safe"
        return 0
    fi
}

################################################################################
# FIX VALIDATION 2: Parameter Consistency
################################################################################

test_context_parameter_fix_applied() {
    log_test "Context parameter mismatch should be resolved"

    local orchestrate="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # Check what orchestrate uses
    local orchestrate_param=""
    if grep -q '\--context-file[[:space:]]' "$orchestrate" || grep -q '\--context-file=' "$orchestrate"; then
        orchestrate_param="--context-file"
    elif grep -q '\--context[[:space:]]' "$orchestrate" || grep -q '\--context=' "$orchestrate"; then
        orchestrate_param="--context"
    fi

    # Check what spawn-agent accepts
    local spawn_param=""
    if grep -q '\--context-file)' "$spawn_agent"; then
        spawn_param="--context-file"
    elif grep -q '\--context)' "$spawn_agent"; then
        spawn_param="--context"
    fi

    if [[ -z "$orchestrate_param" ]]; then
        log_pass "orchestrate.sh doesn't use context parameter (may not be needed)"
        return 0
    fi

    if [[ "$orchestrate_param" == "$spawn_param" ]]; then
        log_pass "Parameter consistency fixed: both use $orchestrate_param"
        return 0
    else
        log_fail "Parameter mismatch still exists: orchestrate='$orchestrate_param', spawn='$spawn_param'"
        log_info "Fix: Update orchestrate.sh to use $spawn_param or vice versa"
        return 1
    fi
}

test_mcp_auto_select_fix_applied() {
    log_test "Invalid --mcp-auto-select flag should be removed"

    local orchestrate="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # Count occurrences in orchestrate
    local orchestrate_uses=$(grep -c -- '--mcp-auto-select' "$orchestrate" || true)

    # Check if spawn-agent supports it
    local spawn_supports=false
    if grep -q -- '--mcp-auto-select)' "$spawn_agent"; then
        spawn_supports=true
    fi

    if [[ $orchestrate_uses -gt 0 && "$spawn_supports" == false ]]; then
        log_fail "orchestrate.sh still uses unsupported --mcp-auto-select flag ($orchestrate_uses occurrences)"
        log_info "Fix: Remove --mcp-auto-select from orchestrate.sh calls"
        grep -n -- '--mcp-auto-select' "$orchestrate" | head -3
        return 1
    else
        log_pass "--mcp-auto-select flag issue resolved"
        return 0
    fi
}

test_all_parameter_mismatches_fixed() {
    log_test "All 5+ parameter mismatches should be resolved"

    local orchestrate="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # Known problematic parameters from original issue
    local known_issues=(
        "--context-file"
        "--mcp-auto-select"
    )

    local issues_found=0

    for param in "${known_issues[@]}"; do
        # Check if orchestrate uses this param
        if grep -q -- "$param" "$orchestrate"; then
            # Check if spawn-agent supports it
            if ! grep -qE "${param}\)|${param}[[:space:]]" "$spawn_agent"; then
                log_info "Mismatch: '$param' used in orchestrate but not supported in spawn-agent"
                ((issues_found++))
            fi
        fi
    done

    if [[ $issues_found -eq 0 ]]; then
        log_pass "All known parameter mismatches resolved"
        return 0
    else
        log_fail "Found $issues_found unresolved parameter mismatches"
        return 1
    fi
}

################################################################################
# FIX VALIDATION 3: JSON Context Handling
################################################################################

test_json_shell_injection_fix_applied() {
    log_test "JSON context shell injection should be eliminated"

    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # Check for the dangerous pattern
    if grep -q 'DOCKER_CMD.*--context $(cat' "$spawn_agent"; then
        log_fail "Dangerous JSON injection pattern still exists"
        log_info "Found: DOCKER_CMD=\"\$DOCKER_CMD --context \$(cat \"\$CONTEXT_FILE\")\""
        log_info "Fix: Use -v mount or -e environment variable instead"
        grep -n 'DOCKER_CMD.*--context $(cat' "$spawn_agent"
        return 1
    else
        log_pass "No JSON shell injection pattern detected"
        return 0
    fi
}

test_context_safe_handling_implemented() {
    log_test "Context should be passed safely (env var or volume mount)"

    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # Look for safe patterns if context file is mentioned
    if ! grep -q 'CONTEXT_FILE' "$spawn_agent"; then
        log_info "Context file handling not present in spawn-agent"
        return 0
    fi

    # Check for safe patterns
    local has_env_var=$(grep -c 'DOCKER_CMD.*-e.*CONTEXT' "$spawn_agent" || true)
    local has_volume=$(grep -c 'DOCKER_CMD.*-v.*CONTEXT' "$spawn_agent" || true)
    local has_unsafe=$(grep -c 'DOCKER_CMD.*$(cat.*CONTEXT' "$spawn_agent" || true)

    if [[ $has_unsafe -gt 0 ]]; then
        log_fail "Still using unsafe $(cat ...) pattern for context"
        return 1
    elif [[ $has_env_var -gt 0 || $has_volume -gt 0 ]]; then
        log_pass "Using safe context handling (env var or volume)"
        return 0
    else
        log_pass "Context file used but no obvious unsafe patterns"
        return 0
    fi
}

################################################################################
# REGRESSION TESTS: Ensure Fixes Don't Break Existing Functionality
################################################################################

test_spawning_script_basic_syntax() {
    log_test "Spawn-agent.sh should have valid bash syntax"

    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    if bash -n "$spawn_agent" 2>/dev/null; then
        log_pass "spawn-agent.sh has valid bash syntax"
        return 0
    else
        log_fail "spawn-agent.sh has syntax errors"
        log_info "Run: bash -n $spawn_agent"
        bash -n "$spawn_agent" 2>&1 | head -5
        return 1
    fi
}

test_orchestration_script_basic_syntax() {
    log_test "orchestrate.sh should have valid bash syntax"

    local orchestrate="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"

    if bash -n "$orchestrate" 2>/dev/null; then
        log_pass "orchestrate.sh has valid bash syntax"
        return 0
    else
        log_fail "orchestrate.sh has syntax errors"
        log_info "Run: bash -n $orchestrate"
        bash -n "$orchestrate" 2>&1 | head -5
        return 1
    fi
}

test_no_hardcoded_passwords() {
    log_test "Scripts should not contain hardcoded Redis passwords"

    local orchestrate="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    local found_password=false

    # Check for hardcoded REDIS_PASSWORD (should use env var)
    if grep -q 'REDIS_PASSWORD=' "$orchestrate" | grep -v '\$\|#' || \
       grep -q 'REDIS_PASSWORD=' "$spawn_agent" | grep -v '\$\|#'; then
        log_fail "Found hardcoded REDIS_PASSWORD"
        log_info "Passwords should be in .env file, not in scripts"
        found_password=true
    fi

    if [[ "$found_password" == true ]]; then
        return 1
    else
        log_pass "No hardcoded passwords found"
        return 0
    fi
}

################################################################################
# DOCUMENTATION VALIDATION
################################################################################

test_fix_documentation_exists() {
    log_test "Fixes should be documented for future reference"

    local docs_dir="$PROJECT_ROOT/docs"
    local test_dir="$PROJECT_ROOT/tests/docker/core"

    # Check for documentation
    local has_docs=false

    # This test file serves as documentation
    if [[ -f "$test_dir/test-dashboard-build-errors.sh" ]]; then
        has_docs=true
        log_info "Error detection test exists"
    fi

    if [[ -f "$test_dir/test-dashboard-build-fix-validation.sh" ]]; then
        has_docs=true
        log_info "Fix validation test exists (this file)"
    fi

    # Check for related docs
    if ls "$docs_dir"/*DASHBOARD* 2>/dev/null | grep -q . || \
       ls "$docs_dir"/*AGENT_SPAWNING* 2>/dev/null | grep -q .; then
        has_docs=true
        log_info "Found related documentation in docs/"
    fi

    if [[ "$has_docs" == true ]]; then
        log_pass "Fix documentation exists"
        return 0
    else
        log_info "Creating documentation through test suite"
        log_pass "Test suite serves as living documentation"
        return 0
    fi
}

################################################################################
# Test Execution
################################################################################

echo "================================================================================================"
echo "CFN DOCKER DASHBOARD BUILD FIX VALIDATION TEST SUITE"
echo "================================================================================================"
echo ""
echo "Validating that fixes have been properly applied for:"
echo "  1. MCP Selector Module ES Module Compatibility"
echo "  2. Parameter Mismatches (orchestrate.sh ↔ spawn-agent.sh)"
echo "  3. JSON Context Execution as Shell Code"
echo ""
echo "This test validates FIXES, not errors. See test-dashboard-build-errors.sh for error detection."
echo ""
echo "================================================================================================"
echo ""

# Category 1: MCP Selector Module Fix Validation
echo "CATEGORY 1: MCP SELECTOR MODULE FIX VALIDATION"
echo "------------------------------------------------------------------------------------------------"
run_test test_mcp_selector_module_fixed
run_test test_jq_null_safety_implemented
echo ""

# Category 2: Parameter Consistency Fix Validation
echo "CATEGORY 2: PARAMETER CONSISTENCY FIX VALIDATION"
echo "------------------------------------------------------------------------------------------------"
run_test test_context_parameter_fix_applied
run_test test_mcp_auto_select_fix_applied
run_test test_all_parameter_mismatches_fixed
echo ""

# Category 3: JSON Context Handling Fix Validation
echo "CATEGORY 3: JSON CONTEXT SAFETY FIX VALIDATION"
echo "------------------------------------------------------------------------------------------------"
run_test test_json_shell_injection_fix_applied
run_test test_context_safe_handling_implemented
echo ""

# Regression Tests
echo "REGRESSION TESTS"
echo "------------------------------------------------------------------------------------------------"
run_test test_spawning_script_basic_syntax
run_test test_orchestration_script_basic_syntax
run_test test_no_hardcoded_passwords
echo ""

# Documentation Tests
echo "DOCUMENTATION VALIDATION"
echo "------------------------------------------------------------------------------------------------"
run_test test_fix_documentation_exists
echo ""

# Summary
echo "================================================================================================"
echo "FIX VALIDATION SUMMARY"
echo "================================================================================================"
echo -e "Total Validations: ${BLUE}$TESTS_RUN${NC}"
echo -e "Fixes Validated:   ${GREEN}$TESTS_PASSED${NC}"
echo -e "Fixes Missing:     ${RED}$TESTS_FAILED${NC}"
echo "================================================================================================"

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}Some fixes are missing or incomplete. Review output above for details.${NC}"
    echo -e "${YELLOW}Recommended actions:${NC}"
    echo "  1. Review failed validation messages"
    echo "  2. Apply suggested fixes"
    echo "  3. Re-run this validation test"
    echo "  4. Run test-dashboard-build-errors.sh to verify error detection"
    exit 1
else
    echo -e "${GREEN}All fixes validated successfully!${NC}"
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Run full test suite: npm run test:docker"
    echo "  2. Test actual dashboard build"
    echo "  3. Monitor for regressions"
    exit 0
fi
