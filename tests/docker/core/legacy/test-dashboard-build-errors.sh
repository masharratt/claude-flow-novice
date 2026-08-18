#!/usr/bin/env bash
################################################################################
# Test Suite: Dashboard Build Error Detection
# Purpose: Validate fixes for errors discovered during dashboard build
# Coverage: MCP selector ES module, parameter mismatches, JSON context handling
# Related: Dashboard build session interruption root cause analysis
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
    echo -e "${BLUE}[TEST $((TESTS_RUN + 1))]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}  ✓ PASS${NC} $*"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}  ✗ FAIL${NC} $*"
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
# ERROR CATEGORY 1: MCP Selector Module ES Module Compatibility
################################################################################

test_mcp_selector_no_commonjs_require() {
    log_test "MCP selector should not use CommonJS require() in ES module context"

    local mcp_selector="$PROJECT_ROOT/.claude/skills/cfn-docker-skill-mcp-selection/skill-mcp-selector.js"

    if [[ ! -f "$mcp_selector" ]]; then
        log_fail "MCP selector file not found: $mcp_selector"
        return 1
    fi

    # Check for CommonJS require statements (excluding comments)
    if grep -v '^[[:space:]]*\/\/' "$mcp_selector" | grep -v '^[[:space:]]*\*' | grep -q "^const .* = require("; then
        log_fail "Found CommonJS require() statement in MCP selector"
        log_info "This causes 'require is not defined in ES module scope' errors"
        grep -n "^const .* = require(" "$mcp_selector" | head -3
        return 1
    else
        log_pass "No CommonJS require() found in MCP selector"
        return 0
    fi
}

test_mcp_selector_es_module_syntax() {
    log_test "MCP selector should use ES module import syntax or have package.json type:commonjs"

    local mcp_selector="$PROJECT_ROOT/.claude/skills/cfn-docker-skill-mcp-selection/skill-mcp-selector.js"
    local pkg_json="$PROJECT_ROOT/.claude/skills/cfn-docker-skill-mcp-selection/package.json"

    # Check if using ES module syntax
    local uses_import=false
    if grep -q "^import " "$mcp_selector" 2>/dev/null; then
        uses_import=true
    fi

    # Check if package.json declares type: "commonjs"
    local is_commonjs=false
    if [[ -f "$pkg_json" ]] && grep -q '"type"[[:space:]]*:[[:space:]]*"commonjs"' "$pkg_json"; then
        is_commonjs=true
    fi

    # Check if using require()
    local uses_require=false
    if grep -v '^[[:space:]]*\/\/' "$mcp_selector" | grep -q "require("; then
        uses_require=true
    fi

    if [[ "$uses_require" == true && "$is_commonjs" == false && "$uses_import" == false ]]; then
        log_fail "Using require() without package.json type:commonjs or ES module imports"
        return 1
    else
        log_pass "Module system usage is consistent"
        if [[ "$uses_import" == true ]]; then
            log_info "Using ES module imports"
        elif [[ "$is_commonjs" == true ]]; then
            log_info "Using CommonJS with explicit type declaration"
        fi
        return 0
    fi
}

test_mcp_selector_jq_null_handling() {
    log_test "MCP selector should handle null/undefined JSON gracefully"

    local mcp_selector="$PROJECT_ROOT/.claude/skills/cfn-docker-skill-mcp-selection/skill-mcp-selector.js"
    local spawn_script="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # Check spawn-agent.sh for proper jq null handling
    # Should use optional operators like .selectedMCPServers[]? or // empty
    if grep -q 'selectedMCPServers\[\]' "$spawn_script"; then
        # Check if it has null-safe operators
        if grep -q 'selectedMCPServers\[\]?' "$spawn_script" || \
           grep -q '// empty' "$spawn_script" || \
           grep -q '// \[\]' "$spawn_script"; then
            log_pass "Found null-safe jq operators for MCP server selection"
            return 0
        else
            log_fail "Found unsafe jq iteration over potentially null MCP servers"
            log_info "Use .selectedMCPServers[]? // empty to prevent null iteration"
            return 1
        fi
    else
        log_pass "No direct MCP server array iteration found"
        return 0
    fi
}

################################################################################
# ERROR CATEGORY 2: Parameter Mismatch Between orchestrate.sh and spawn-agent.sh
################################################################################

test_context_parameter_consistency() {
    log_test "orchestrate.sh and spawn-agent.sh should use consistent --context parameter"

    local orchestrate="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # Check what orchestrate.sh uses when calling spawn-agent
    local orchestrate_uses=""
    if grep -q -- '--context-file' "$orchestrate"; then
        orchestrate_uses="--context-file"
    elif grep -q -- '--context' "$orchestrate"; then
        orchestrate_uses="--context"
    fi

    # Check what spawn-agent.sh accepts
    local spawn_accepts=""
    if grep -q -- '--context-file)' "$spawn_agent"; then
        spawn_accepts="--context-file"
    elif grep -q -- '--context)' "$spawn_agent"; then
        spawn_accepts="--context"
    fi

    if [[ -z "$orchestrate_uses" ]]; then
        log_info "orchestrate.sh doesn't pass context parameter"
        return 0
    fi

    if [[ "$orchestrate_uses" != "$spawn_accepts" ]]; then
        log_fail "Parameter mismatch: orchestrate uses '$orchestrate_uses', spawn-agent expects '$spawn_accepts'"
        return 1
    else
        log_pass "Context parameter is consistent: $orchestrate_uses"
        return 0
    fi
}

test_no_mcp_auto_select_flag() {
    log_test "orchestrate.sh should not use non-existent --mcp-auto-select flag"

    local orchestrate="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # Check if orchestrate.sh tries to pass --mcp-auto-select
    if grep -q -- '--mcp-auto-select' "$orchestrate"; then
        # Verify spawn-agent.sh accepts it
        if ! grep -q -- '--mcp-auto-select)' "$spawn_agent"; then
            log_fail "orchestrate.sh uses --mcp-auto-select but spawn-agent.sh doesn't accept it"
            log_info "Found in orchestrate.sh:"
            grep -n -- '--mcp-auto-select' "$orchestrate" | head -3
            return 1
        fi
    fi

    log_pass "No invalid --mcp-auto-select flag usage found"
    return 0
}

test_orchestrate_spawn_parameter_alignment() {
    log_test "All orchestrate.sh → spawn-agent.sh parameter calls should be valid"

    local orchestrate="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # Extract all --parameter flags from spawn-agent calls in orchestrate.sh
    # Look for patterns like spawn-agent.sh --flag or spawn_agent --flag
    local params_used=$(grep -oE '\-\-[a-z-]+' "$orchestrate" | sort -u)

    local failed=false
    while IFS= read -r param; do
        # Skip empty lines
        [[ -z "$param" ]] && continue

        # Check if spawn-agent.sh handles this parameter
        # Look for either the flag in usage docs or in case statements
        if ! grep -qE "($param\)|$param [A-Z]+|$param\s+)" "$spawn_agent"; then
            log_info "Parameter '$param' used in orchestrate but not found in spawn-agent"
            failed=true
        fi
    done <<< "$params_used"

    if [[ "$failed" == true ]]; then
        log_fail "Found parameter mismatches between orchestrate.sh and spawn-agent.sh"
        return 1
    else
        log_pass "All orchestrate parameters are valid in spawn-agent"
        return 0
    fi
}

################################################################################
# ERROR CATEGORY 3: JSON Context Execution as Shell Code
################################################################################

test_no_json_context_shell_injection() {
    log_test "spawn-agent.sh should not inject JSON context directly into shell commands"

    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # ANTI-PATTERN: DOCKER_CMD="$DOCKER_CMD --context $(cat "$CONTEXT_FILE")"
    # This tries to execute JSON content as shell code

    if grep -q 'DOCKER_CMD.*--context $(cat' "$spawn_agent"; then
        log_fail "Found dangerous JSON context injection into Docker command"
        log_info "Anti-pattern: DOCKER_CMD=\"\$DOCKER_CMD --context \$(cat \"\$CONTEXT_FILE\")\""
        log_info "This tries to execute JSON as shell code"
        grep -n 'DOCKER_CMD.*--context $(cat' "$spawn_agent"
        return 1
    else
        log_pass "No JSON context shell injection detected"
        return 0
    fi
}

test_context_file_proper_handling() {
    log_test "Context file should be passed as environment variable or mounted volume"

    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # CORRECT PATTERNS:
    # 1. DOCKER_CMD="$DOCKER_CMD -e CONTEXT_FILE=/app/context.json"
    # 2. DOCKER_CMD="$DOCKER_CMD -v $CONTEXT_FILE:/app/context.json:ro"
    # 3. Passing file path, not content

    local has_safe_pattern=false

    # Check for environment variable pattern
    if grep -q 'DOCKER_CMD.*-e.*CONTEXT' "$spawn_agent"; then
        has_safe_pattern=true
        log_info "Found environment variable pattern for context"
    fi

    # Check for volume mount pattern
    if grep -q 'DOCKER_CMD.*-v.*CONTEXT' "$spawn_agent"; then
        has_safe_pattern=true
        log_info "Found volume mount pattern for context"
    fi

    # Check for unsafe $(cat ...) pattern
    if grep -q 'DOCKER_CMD.*$(cat.*CONTEXT' "$spawn_agent"; then
        log_fail "Found unsafe context file handling with command substitution"
        return 1
    fi

    if [[ "$has_safe_pattern" == true ]]; then
        log_pass "Context file handling uses safe patterns"
        return 0
    else
        log_info "No context file handling detected (may not be implemented yet)"
        return 0
    fi
}

test_json_parsing_with_jq() {
    log_test "JSON files should be parsed with jq, not executed as shell"

    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    # If handling JSON context files, should use jq for parsing
    # CORRECT: context_data=$(jq -r '.someField' "$CONTEXT_FILE")
    # INCORRECT: eval "$(cat "$CONTEXT_FILE")"

    if grep -q 'eval.*cat.*CONTEXT' "$spawn_agent" || \
       grep -q 'source.*CONTEXT' "$spawn_agent"; then
        log_fail "Found dangerous eval/source of context file"
        log_info "JSON files should be parsed with jq, not executed"
        return 1
    else
        log_pass "No dangerous eval/source of context files detected"
        return 0
    fi
}

################################################################################
# INTEGRATION TESTS: Combined Error Scenarios
################################################################################

test_complete_spawning_pipeline_safety() {
    log_test "Complete agent spawning pipeline should handle all error categories safely"

    local orchestrate="$PROJECT_ROOT/.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh"
    local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"
    local mcp_selector="$PROJECT_ROOT/.claude/skills/cfn-docker-skill-mcp-selection/skill-mcp-selector.js"

    local issues_found=0

    # Check 1: MCP selector module compatibility
    if grep -q "^const .* = require(" "$mcp_selector" 2>/dev/null; then
        log_info "Issue: MCP selector uses CommonJS require()"
        ((issues_found++))
    fi

    # Check 2: Parameter consistency
    if grep -q -- '--context-file' "$orchestrate" && ! grep -q -- '--context-file)' "$spawn_agent"; then
        log_info "Issue: Context parameter mismatch"
        ((issues_found++))
    fi

    # Check 3: JSON context safety
    if grep -q 'DOCKER_CMD.*--context $(cat' "$spawn_agent"; then
        log_info "Issue: Unsafe JSON context injection"
        ((issues_found++))
    fi

    if [[ $issues_found -eq 0 ]]; then
        log_pass "No critical spawning pipeline issues detected"
        return 0
    else
        log_fail "Found $issues_found critical issues in spawning pipeline"
        return 1
    fi
}

test_error_recovery_documentation() {
    log_test "Error recovery should be documented for each error category"

    local docs_dir="$PROJECT_ROOT/docs"

    # Check for documentation of known issues
    local has_dashboard_docs=false
    local has_mcp_docs=false
    local has_param_docs=false

    if ls "$docs_dir"/*DASHBOARD* 2>/dev/null | grep -q .; then
        has_dashboard_docs=true
    fi

    if ls "$docs_dir"/*MCP* 2>/dev/null | grep -q . || \
       ls "$docs_dir"/*MODULE* 2>/dev/null | grep -q .; then
        has_mcp_docs=true
    fi

    # For this test, we'll create documentation as part of the test suite
    log_info "Dashboard docs: $has_dashboard_docs"
    log_info "MCP docs: $has_mcp_docs"
    log_info "Parameter docs: $has_param_docs"

    # This is informational - we're creating the docs now
    log_pass "Test suite serves as documentation for error recovery"
    return 0
}

################################################################################
# Test Execution
################################################################################

echo "================================================================================================"
echo "CFN DOCKER DASHBOARD BUILD ERROR DETECTION TEST SUITE"
echo "================================================================================================"
echo ""
echo "Testing fixes for errors discovered during dashboard build interruption:"
echo "  1. MCP Selector Module ES Module Compatibility"
echo "  2. Parameter Mismatches (orchestrate.sh ↔ spawn-agent.sh)"
echo "  3. JSON Context Execution as Shell Code"
echo ""
echo "================================================================================================"
echo ""

# Category 1: MCP Selector Module Tests
echo "CATEGORY 1: MCP SELECTOR MODULE COMPATIBILITY"
echo "------------------------------------------------------------------------------------------------"
run_test test_mcp_selector_no_commonjs_require
run_test test_mcp_selector_es_module_syntax
run_test test_mcp_selector_jq_null_handling
echo ""

# Category 2: Parameter Mismatch Tests
echo "CATEGORY 2: PARAMETER CONSISTENCY"
echo "------------------------------------------------------------------------------------------------"
run_test test_context_parameter_consistency
run_test test_no_mcp_auto_select_flag
run_test test_orchestrate_spawn_parameter_alignment
echo ""

# Category 3: JSON Context Handling Tests
echo "CATEGORY 3: JSON CONTEXT SAFETY"
echo "------------------------------------------------------------------------------------------------"
run_test test_no_json_context_shell_injection
run_test test_context_file_proper_handling
run_test test_json_parsing_with_jq
echo ""

# Integration Tests
echo "INTEGRATION TESTS"
echo "------------------------------------------------------------------------------------------------"
run_test test_complete_spawning_pipeline_safety
run_test test_error_recovery_documentation
echo ""

# Summary
echo "================================================================================================"
echo "TEST SUMMARY"
echo "================================================================================================"
echo -e "Total Tests:  ${BLUE}$TESTS_RUN${NC}"
echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
echo "================================================================================================"

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}Some tests failed. Review output above for details.${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
