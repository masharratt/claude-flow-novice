#!/usr/bin/env bash

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
readonly GREEN='\033[0;32m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

echo "CFN Integration Validation Test"
echo "=============================="

# Test 1: Environment sanitization script exists
if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh" ]]; then
    log_pass "Environment sanitization script exists"
else
    log_fail "Environment sanitization script missing"
fi

# Test 2: Process instrumentation script exists
if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-process-instrumentation/instrument-process.sh" ]]; then
    log_pass "Process instrumentation script exists"
else
    log_fail "Process instrumentation script missing"
fi

# Test 3: Orchestration script integration
if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh" ]]; then
    if grep -q "cfn-environment-sanitization" "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"; then
        log_pass "Orchestration script has environment sanitization"
    else
        log_fail "Orchestration script missing environment sanitization"
    fi

    if grep -q "cfn-process-instrumentation" "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"; then
        log_pass "Orchestration script has process instrumentation"
    else
        log_fail "Orchestration script missing process instrumentation"
    fi

    if grep -q "ANTI-023" "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate.sh"; then
        log_pass "Orchestration script has ANTI-023 protection"
    else
        log_fail "Orchestration script missing ANTI-023 protection"
    fi
else
    log_fail "Orchestration script not found"
fi

# Test 4: Agent spawning integration
if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh" ]]; then
    if grep -q "cfn-environment-sanitization" "$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"; then
        log_pass "Agent spawning script has environment sanitization"
    else
        log_fail "Agent spawning script missing environment sanitization"
    fi

    if grep -q "ANTI-023" "$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"; then
        log_pass "Agent spawning script has ANTI-023 protection"
    else
        log_fail "Agent spawning script missing ANTI-023 protection"
    fi
else
    log_fail "Agent spawning script not found"
fi

# Test 5: Environment sanitization functionality
export TEST_PASSWORD="secret123"
export TEST_TOKEN="abc123xyz"

if source "$PROJECT_ROOT/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh" 2>/dev/null; then
    if [[ -z "${TEST_PASSWORD:-}" && -z "${TEST_TOKEN:-}" ]]; then
        log_pass "Environment sanitization works correctly"
    else
        log_fail "Environment sanitization not working"
    fi
else
    log_fail "Environment sanitization script cannot be sourced"
fi

# Test 6: Resource limits enforcement
export CFN_MODE="cli"
export TASK_ID="test-task"
if source "$PROJECT_ROOT/.claude/skills/cfn-environment-sanitization/sanitize-environment.sh" --strict 2>/dev/null; then
    if [[ -n "${CFN_MAX_AGENTS:-}" && -n "${CFN_TIMEOUT:-}" && -n "${CFN_MEMORY_LIMIT:-}" ]]; then
        log_pass "Resource limits are enforced"
    else
        log_fail "Resource limits not enforced"
    fi
else
    log_fail "Cannot enforce resource limits"
fi

echo ""
echo "Test Summary:"
echo "  Passed: $TESTS_PASSED"
echo "  Failed: $TESTS_FAILED"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✅ All integration tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ $TESTS_FAILED test(s) failed${NC}"
    exit 1
fi