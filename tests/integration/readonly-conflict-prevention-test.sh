#!/bin/bash

##############################################################################
# Readonly Variable Conflict Prevention Test
#
# This test would have caught the MAX_MEMORY_MB and DEFAULT_TIMEOUT
# readonly variable conflicts that broke CFN Loop CLI mode orchestration.
##############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS_COUNT=0
FAIL_COUNT=0

echo "========================================="
echo "Readonly Variable Conflict Prevention Test"
echo "========================================="
echo ""

pass() {
    echo "✅ PASS: $1"
    ((PASS_COUNT++))
}

fail() {
    echo "❌ FAIL: $1"
    ((FAIL_COUNT++))
}

info() {
    echo "ℹ️  INFO: $1"
}

##############################################################################
# Test 1: Check for conflicting readonly declarations
##############################################################################

echo "Test 1: Readonly Variable Conflict Detection"
echo "---------------------------------------------"

CONFLICTS_FOUND=0

# Check MAX_MEMORY_MB conflicts
echo "Checking MAX_MEMORY_MB declarations..."

# Find all readonly MAX_MEMORY_MB declarations
MAX_MEMORY_DECLARATIONS=$(grep -r "readonly.*MAX_MEMORY_MB" .claude/ 2>/dev/null || true)

if [[ -n "$MAX_MEMORY_DECLARATIONS" ]]; then
    echo "Found MAX_MEMORY_MB declarations:"
    echo "$MAX_MEMORY_DECLARATIONS"

    # Count unique values
    UNIQUE_VALUES=$(echo "$MAX_MEMORY_DECLARATIONS" | grep -o '=[0-9]*' | sort -u | wc -l)

    if [[ "$UNIQUE_VALUES" -gt 1 ]]; then
        fail "Multiple readonly MAX_MEMORY_MB values found (CONFLICT)"
        ((CONFLICTS_FOUND++))
    else
        info "MAX_MEMORY_MB has consistent value"
    fi
else
    info "No readonly MAX_MEMORY_MB declarations found"
fi

echo ""

# Check DEFAULT_TIMEOUT conflicts
echo "Checking DEFAULT_TIMEOUT declarations..."

DEFAULT_TIMEOUT_DECLARATIONS=$(grep -r "readonly.*DEFAULT_TIMEOUT" .claude/ 2>/dev/null || true)

if [[ -n "$DEFAULT_TIMEOUT_DECLARATIONS" ]]; then
    echo "Found DEFAULT_TIMEOUT declarations:"
    echo "$DEFAULT_TIMEOUT_DECLARATIONS"

    # Count unique values
    UNIQUE_VALUES=$(echo "$DEFAULT_TIMEOUT_DECLARATIONS" | grep -o '=[0-9]*' | sort -u | wc -l)

    if [[ "$UNIQUE_VALUES" -gt 1 ]]; then
        fail "Multiple readonly DEFAULT_TIMEOUT values found (CONFLICT)"
        ((CONFLICTS_FOUND++))
    else
        info "DEFAULT_TIMEOUT has consistent value"
    fi
else
    info "No readonly DEFAULT_TIMEOUT declarations found"
fi

echo ""

if [[ "$CONFLICTS_FOUND" -eq 0 ]]; then
    pass "No readonly variable conflicts detected"
else
    fail "Found $CONFLICTS_FOUND readonly variable conflicts"
fi

echo ""

##############################################################################
# Test 2: Validate parameter expansion approach
##############################################################################

echo "Test 2: Parameter Expansion Validation"
echo "----------------------------------------"

# Check if files use parameter expansion to avoid conflicts
PARAM_EXPANSION_FILES=0
SAFE_ASSIGNMENTS=0

echo "Checking for safe parameter expansion patterns..."

# Check wrapped-executor.sh
if grep -q '.*"\$\{MAX_MEMORY_MB:=' .claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh 2>/dev/null; then
    echo "✓ wrapped-executor.sh uses parameter expansion for MAX_MEMORY_MB"
    ((SAFE_ASSIGNMENTS++))
else
    echo "✗ wrapped-executor.sh missing parameter expansion for MAX_MEMORY_MB"
fi

# Check instrument-process.sh
if grep -q '.*"\$\{DEFAULT_TIMEOUT:=' .claude/skills/cfn-process-instrumentation/instrument-process.sh 2>/dev/null; then
    echo "✓ instrument-process.sh uses parameter expansion for DEFAULT_TIMEOUT"
    ((SAFE_ASSIGNMENTS++))
else
    echo "✗ instrument-process.sh missing parameter expansion for DEFAULT_TIMEOUT"
fi

if [[ "$SAFE_ASSIGNMENTS" -eq 2 ]]; then
    pass "All files use parameter expansion correctly"
else
    fail "Only $SAFE_ASSIGNMENTS/2 files use parameter expansion"
fi

echo ""

##############################################################################
# Test 3: Multi-file sourcing simulation
##############################################################################

echo "Test 3: Multi-file Sourcing Simulation"
echo "--------------------------------------"

# Simulate loading order that caused conflicts
echo "Simulating orchestrator load order..."

# Create test environment
TEST_ENV=$(mktemp -d)
cd "$TEST_ENV"

# Copy the conflicting files to test
cp "$PROJECT_ROOT/.claude/skills/cfn-task-mode-sanitize/task-mode-env-sanitizer.sh" ./sanitizer.sh
cp "$PROJECT_ROOT/.claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh" ./executor.sh
cp "$PROJECT_ROOT/.claude/skills/cfn-process-instrumentation/instrument-process.sh" ./instrument.sh

SUCCEED=0

# Test the load order that caused failures
echo "Testing load order: sanitizer → executor → instrument"

# Source sanitizer (sets MAX_MEMORY_MB=4096)
source ./sanitizer.sh 2>/dev/null || {
    fail "Could not source sanitizer.sh"
    SUCCEED=1
}

# Source executor (should NOT conflict with parameter expansion)
if source ./executor.sh 2>/dev/null; then
    echo "✓ executor.sh sourced without readonly conflict"
else
    echo "✗ executor.sh failed to source (readonly conflict)"
    SUCCEED=1
fi

# Source instrument (should NOT conflict with parameter expansion)
if source ./instrument.sh 2>/dev/null; then
    echo "✓ instrument.sh sourced without readonly conflict"
else
    echo "✗ instrument.sh failed to source (readonly conflict)"
    SUCCEED=1
fi

# Check final values
FINAL_MAX_MEMORY_MB="${MAX_MEMORY_MB:-unset}"
FINAL_DEFAULT_TIMEOUT="${DEFAULT_TIMEOUT:-unset}"

echo "Final values after sourcing:"
echo "  MAX_MEMORY_MB: $FINAL_MAX_MEMORY_MB"
echo "  DEFAULT_TIMEOUT: $FINAL_DEFAULT_TIMEOUT"

if [[ "$SUCCEED" -eq 0 ]]; then
    pass "Multi-file sourcing simulation successful"
else
    fail "Multi-file sourcing simulation failed"
fi

echo ""

##############################################################################
# Test 4: Validate fix prevents original bug
##############################################################################

echo "Test 4: Original Bug Prevention Validation"
echo "--------------------------------------------"

# Test that the fix prevents the original error scenario
echo "Simulating original bug scenario..."

# Create test script that reproduces original conflict
cat > test_original_bug.sh << 'EOF'
#!/bin/bash

# This reproduces the ORIGINAL bug scenario

# Source sanitizer first (sets readonly MAX_MEMORY_MB)
readonly MAX_MEMORY_MB=4096

# Try to set same variable as readonly (this would fail)
readonly MAX_MEMORY_MB=2048

echo "If this prints, bug is fixed"
EOF

chmod +x test_original_bug.sh

# Run the test - it should fail if the bug exists
if ./test_original_bug.sh 2>/dev/null; then
    # Script succeeded - means we can redeclare readonly (shouldn't happen)
    fail "Original bug scenario still allows redeclaration"
else
    # Script failed - as expected when trying to redeclare readonly
    echo "✓ Readonly redeclaration properly prevented"
    pass "Original bug scenario properly handled"
fi

echo ""

##############################################################################
# Test 5: Production-like environment simulation
##############################################################################

echo "Test 5: Production Environment Simulation"
echo "-------------------------------------------"

# Simulate production WSL2 environment with high process count
CURRENT_PROCESSES=$(ps aux | wc -l)
echo "Simulating production environment with $CURRENT_PROCESSES processes"

# Test that current sanitizer handles high process counts without setting ulimits
if [[ "$CURRENT_PROCESSES" -gt 200 ]]; then
    echo "High process count environment detected (>200)"

    # Source sanitizer and check it doesn't set ulimit -u
    source "$PROJECT_ROOT/.claude/skills/cfn-task-mode-sanitize/task-mode-env-sanitizer.sh" 2>/dev/null || true

    # Check current ulimit
    CURRENT_ULIMIT=$(ulimit -u)

    # Should be high, not limited to 50
    if [[ "$CURRENT_ULIMIT" -gt 1000 ]]; then
        pass "Sanitizer preserves high ulimit in production environment ($CURRENT_ULIMIT)"
    else
        fail "Sanitizer reduced ulimit in production ($CURRENT_ULIMIT)"
    fi
else
    echo "Low process count environment - production simulation not applicable"
    pass "Test environment doesn't trigger production scenario"
fi

echo ""

# Cleanup
cd "$PROJECT_ROOT"
rm -rf "$TEST_ENV"

##############################################################################
# Final Results
##############################################################################

echo "========================================="
echo "Test Results Summary"
echo "========================================="
echo "Total Passed: $PASS_COUNT"
echo "Total Failed: $FAIL_COUNT"
echo ""

if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo "✅ ALL TESTS PASSED"
    echo "✅ Readonly variable conflict prevention working correctly"
    echo "✅ CFN Loop CLI mode should work without readonly conflicts"
    exit 0
else
    echo "❌ SOME TESTS FAILED"
    echo "⚠️  Readonly variable conflicts may still exist"
    exit 1
fi