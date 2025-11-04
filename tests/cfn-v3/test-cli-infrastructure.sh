#!/usr/bin/env bash
# CLI Infrastructure Validation Test
# Validates CFN Loop CLI mode dependencies and infrastructure

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $*"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $*"
    ((TESTS_FAILED++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

echo "=========================================="
echo "CFN CLI Infrastructure Validation"
echo "=========================================="
echo ""

# ===========================================
# TEST 1: CLI Binary Availability
# ===========================================
echo "=========================================="
echo "TEST 1: CLI Binary Availability"
echo "=========================================="

if command -v npx &> /dev/null; then
    log_success "npx command available"

    if npx claude-flow-novice --version &> /dev/null; then
        VERSION=$(npx claude-flow-novice --version 2>&1 | head -1)
        log_success "CLI binary works: $VERSION"
    else
        log_error "CLI binary doesn't work (npx claude-flow-novice --version failed)"
    fi
else
    log_error "npx command not found"
fi
echo ""

# ===========================================
# TEST 2: Required Scripts Exist
# ===========================================
echo "=========================================="
echo "TEST 2: Required Scripts Exist"
echo "=========================================="

REQUIRED_SCRIPTS=(
    ".claude/skills/cfn-redis-coordination/store-context.sh"
    ".claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh"
    ".claude/skills/cfn-loop-orchestration/orchestrate.sh"
)

for script in "${REQUIRED_SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            log_success "Script exists and executable: $script"
        else
            log_warning "Script exists but not executable: $script"
            chmod +x "$script"
            log_info "Made executable: $script"
        fi
    else
        log_error "Script missing: $script"
    fi
done
echo ""

# ===========================================
# TEST 3: Redis Context Storage
# ===========================================
echo "=========================================="
echo "TEST 3: Redis Context Storage"
echo "=========================================="

TEST_TASK_ID="infra-test-$(date +%s)"
TEST_CONTEXT="CLI infrastructure validation test"

if [ -f ".claude/skills/cfn-redis-coordination/store-context.sh" ]; then
    if ./.claude/skills/cfn-redis-coordination/store-context.sh "$TEST_TASK_ID" "$TEST_CONTEXT" &> /dev/null; then
        log_success "Context storage script works"

        # Verify context stored
        STORED=$(redis-cli HGET "cfn_loop:task:${TEST_TASK_ID}:context" "task_description" 2>/dev/null || echo "")
        if [ "$STORED" = "$TEST_CONTEXT" ]; then
            log_success "Context retrieved from Redis correctly"
        else
            log_error "Context not stored correctly in Redis"
        fi

        # Cleanup
        redis-cli DEL "cfn_loop:task:${TEST_TASK_ID}:context" > /dev/null
    else
        log_error "Context storage script failed"
    fi
else
    log_error "store-context.sh not found (skipping test)"
fi
echo ""

# ===========================================
# TEST 4: Agent Spawning Capability
# ===========================================
echo "=========================================="
echo "TEST 4: Agent Spawning Capability"
echo "=========================================="

if command -v npx &> /dev/null && npx claude-flow-novice --version &> /dev/null; then
    # Check if agent command works
    if npx claude-flow-novice agent --help &> /dev/null; then
        log_success "Agent spawning command available"
    else
        log_warning "Agent spawning command not working (may need different syntax)"
    fi
else
    log_error "Cannot test agent spawning (CLI binary not available)"
fi
echo ""

# ===========================================
# TEST 5: WSL2 Compatibility
# ===========================================
echo "=========================================="
echo "TEST 5: WSL2 Compatibility"
echo "=========================================="

# Check if running on WSL
if grep -qi microsoft /proc/version 2>/dev/null; then
    log_info "Running on WSL2"

    # Check for line ending issues
    CRLF_COUNT=0
    for script in "${REQUIRED_SCRIPTS[@]}"; do
        if [ -f "$script" ]; then
            if file "$script" 2>/dev/null | grep -q "CRLF"; then
                log_warning "CRLF line endings detected: $script"
                ((CRLF_COUNT++))
            fi
        fi
    done

    if [ $CRLF_COUNT -eq 0 ]; then
        log_success "No CRLF line ending issues detected"
    else
        log_warning "$CRLF_COUNT scripts have CRLF line endings (may need dos2unix)"
    fi
else
    log_info "Not running on WSL (skipping WSL-specific checks)"
fi
echo ""

# ===========================================
# TEST 6: Orchestrator Environment Detection
# ===========================================
echo "=========================================="
echo "TEST 6: Orchestrator Environment"
echo "=========================================="

# Check if orchestrator can be invoked
if [ -f ".claude/skills/cfn-loop-orchestration/orchestrate.sh" ]; then
    # Test orchestrator help/version (if available)
    if ./.claude/skills/cfn-loop-orchestration/orchestrate.sh --help &> /dev/null; then
        log_success "Orchestrator responds to --help"
    else
        log_info "Orchestrator doesn't have --help (expected)"
    fi

    # Check for store-context.sh references
    if grep -q "store-context.sh" .claude/skills/cfn-loop-orchestration/orchestrate.sh; then
        if [ -f ".claude/skills/cfn-redis-coordination/store-context.sh" ]; then
            log_success "Orchestrator dependency (store-context.sh) satisfied"
        else
            log_error "Orchestrator requires store-context.sh but it's missing"
        fi
    fi
else
    log_error "Orchestrator script not found"
fi
echo ""

# ===========================================
# Final Report
# ===========================================
echo ""
echo "=========================================="
echo "Infrastructure Validation Results"
echo "=========================================="
echo ""
echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL INFRASTRUCTURE TESTS PASSED${NC}"
    echo ""
    echo "CLI mode is ready for use!"
    exit 0
else
    echo -e "${YELLOW}⚠️  SOME INFRASTRUCTURE ISSUES DETECTED${NC}"
    echo ""
    echo "Review failed tests above."
    echo "CLI mode may not work correctly."
    exit 1
fi
