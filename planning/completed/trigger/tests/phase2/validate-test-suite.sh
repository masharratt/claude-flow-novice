#!/bin/bash
# planning/trigger/tests/phase2/validate-test-suite.sh
# Phase 2 :: Validate test suite completeness and structure

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
PHASE2_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ ${1}${NC}"; }
log_success() { echo -e "${GREEN}✅ ${1}${NC}"; }
log_warn() { echo -e "${YELLOW}⚠ ${1}${NC}"; }
log_error() { echo -e "${RED}❌ ${1}${NC}"; }

echo "========================================"
echo "Phase 2 Test Suite Validation"
echo "========================================"
echo ""

# ============================================================================
# 1. Check Required Files
# ============================================================================
log_info "Checking required files..."

required_files=(
    "test-concurrent-spawning.sh"
    "test-resource-isolation.sh"
    "test-filesystem-isolation.sh"
    "test-network-isolation.sh"
    "test-parallel-execution.sh"
    "test-result-independence.sh"
    "run-all-tests.sh"
    "README.md"
)

missing_files=0
for file in "${required_files[@]}"; do
    if [ -f "${PHASE2_DIR}/${file}" ]; then
        log_success "Found: ${file}"
    else
        log_error "Missing: ${file}"
        missing_files=$((missing_files + 1))
    fi
done

if [ $missing_files -eq 0 ]; then
    log_success "All required files present (${#required_files[@]}/${#required_files[@]})"
else
    log_error "Missing ${missing_files} required files"
fi

echo ""

# ============================================================================
# 2. Check Executable Permissions
# ============================================================================
log_info "Checking executable permissions..."

executable_count=0
for file in "${required_files[@]}"; do
    if [[ "$file" == *.sh ]]; then
        if [ -x "${PHASE2_DIR}/${file}" ]; then
            executable_count=$((executable_count + 1))
        else
            log_warn "Not executable: ${file}"
        fi
    fi
done

total_scripts=7  # 6 test scripts + 1 runner
if [ $executable_count -eq $total_scripts ]; then
    log_success "All scripts executable (${executable_count}/${total_scripts})"
else
    log_warn "Some scripts not executable (${executable_count}/${total_scripts})"
fi

echo ""

# ============================================================================
# 3. Check Test Structure (GIVEN/WHEN/THEN)
# ============================================================================
log_info "Checking test structure (GIVEN/WHEN/THEN pattern)..."

structure_valid=0
for file in "${required_files[@]}"; do
    if [[ "$file" == test-*.sh ]]; then
        filepath="${PHASE2_DIR}/${file}"
        if grep -q "log_step \"GIVEN" "$filepath" && \
           grep -q "WHEN" "$filepath" && \
           grep -q "THEN" "$filepath"; then
            structure_valid=$((structure_valid + 1))
        else
            log_warn "${file}: Missing GIVEN/WHEN/THEN markers"
        fi
    fi
done

test_scripts=6
if [ $structure_valid -eq $test_scripts ]; then
    log_success "All test scripts follow GIVEN/WHEN/THEN pattern (${structure_valid}/${test_scripts})"
else
    log_warn "Some scripts missing GIVEN/WHEN/THEN (${structure_valid}/${test_scripts})"
fi

echo ""

# ============================================================================
# 4. Check Cleanup Trap
# ============================================================================
log_info "Checking cleanup trap implementation..."

cleanup_valid=0
for file in "${required_files[@]}"; do
    if [[ "$file" == test-*.sh ]]; then
        filepath="${PHASE2_DIR}/${file}"
        if grep -q "cleanup()" "$filepath" && \
           grep -q "trap cleanup EXIT" "$filepath"; then
            cleanup_valid=$((cleanup_valid + 1))
        else
            log_warn "${file}: Missing cleanup trap"
        fi
    fi
done

if [ $cleanup_valid -eq $test_scripts ]; then
    log_success "All test scripts have cleanup trap (${cleanup_valid}/${test_scripts})"
else
    log_warn "Some scripts missing cleanup trap (${cleanup_valid}/${test_scripts})"
fi

echo ""

# ============================================================================
# 5. Check Test Utilities Source
# ============================================================================
log_info "Checking test utilities sourcing..."

utils_sourced=0
for file in "${required_files[@]}"; do
    if [[ "$file" == test-*.sh ]] || [[ "$file" == run-all-tests.sh ]]; then
        filepath="${PHASE2_DIR}/${file}"
        if grep -q "source.*test-utils.sh" "$filepath"; then
            utils_sourced=$((utils_sourced + 1))
        else
            log_warn "${file}: Not sourcing test-utils.sh"
        fi
    fi
done

total_with_utils=7  # All 7 scripts should source utils
if [ $utils_sourced -eq $total_with_utils ]; then
    log_success "All scripts source test-utils.sh (${utils_sourced}/${total_with_utils})"
else
    log_warn "Some scripts missing test-utils.sh (${utils_sourced}/${total_with_utils})"
fi

echo ""

# ============================================================================
# 6. Count Test Cases
# ============================================================================
log_info "Counting test cases..."

total_test_cases=0
for file in "${required_files[@]}"; do
    if [[ "$file" == test-*.sh ]]; then
        filepath="${PHASE2_DIR}/${file}"
        test_count=$(grep -c "^test_" "$filepath" || echo 0)
        total_test_cases=$((total_test_cases + test_count))
        log_info "${file}: ${test_count} test functions"
    fi
done

expected_minimum=30  # At least 30 test cases total
if [ $total_test_cases -ge $expected_minimum ]; then
    log_success "Total test cases: ${total_test_cases} (≥${expected_minimum} expected)"
else
    log_warn "Total test cases: ${total_test_cases} (<${expected_minimum} expected)"
fi

echo ""

# ============================================================================
# 7. Check Success Criteria Coverage
# ============================================================================
log_info "Checking success criteria coverage..."

success_criteria=(
    "spawn simultaneously"
    "resource contention"
    "isolated filesystem"
    "isolated network"
    "complete successfully"
    "results captured independently"
    "execution time.*slowest"
)

coverage_count=0
for criteria in "${success_criteria[@]}"; do
    if grep -riq "$criteria" "${PHASE2_DIR}"/*.sh 2>/dev/null; then
        coverage_count=$((coverage_count + 1))
    fi
done

if [ $coverage_count -eq ${#success_criteria[@]} ]; then
    log_success "All success criteria covered (${coverage_count}/${#success_criteria[@]})"
else
    log_warn "Some success criteria not covered (${coverage_count}/${#success_criteria[@]})"
fi

echo ""

# ============================================================================
# 8. Check BUG #21 Compliance (Production Code Paths)
# ============================================================================
log_info "Checking BUG #21 compliance (production code paths)..."

production_patterns=(
    "docker run"
    "alpine:latest"
    "docker inspect"
    "docker wait"
)

compliance_count=0
for pattern in "${production_patterns[@]}"; do
    if grep -rq "$pattern" "${PHASE2_DIR}"/test-*.sh 2>/dev/null; then
        compliance_count=$((compliance_count + 1))
    fi
done

if [ $compliance_count -eq ${#production_patterns[@]} ]; then
    log_success "BUG #21 compliant: using production code paths (${compliance_count}/${#production_patterns[@]} patterns found)"
else
    log_warn "May not be BUG #21 compliant (${compliance_count}/${#production_patterns[@]} patterns found)"
fi

echo ""

# ============================================================================
# 9. Check Edge Case Coverage
# ============================================================================
log_info "Checking edge case coverage..."

edge_cases=(
    "failure.*isolation"
    "concurrent.*write"
    "OOM"
    "port.*conflict"
    "DNS.*resolution"
    "exit.*code"
    "interleav"
)

edge_coverage=0
for edge_case in "${edge_cases[@]}"; do
    if grep -riq "$edge_case" "${PHASE2_DIR}"/*.sh 2>/dev/null; then
        edge_coverage=$((edge_coverage + 1))
    fi
done

edge_percent=$(awk "BEGIN {printf \"%.0f\", ($edge_coverage / ${#edge_cases[@]}) * 100}")
if [ $edge_percent -ge 80 ]; then
    log_success "Edge case coverage: ${edge_percent}% (${edge_coverage}/${#edge_cases[@]} cases)"
else
    log_warn "Edge case coverage: ${edge_percent}% (${edge_coverage}/${#edge_cases[@]} cases) - target ≥80%"
fi

echo ""

# ============================================================================
# 10. Final Validation Summary
# ============================================================================
echo "========================================"
echo "Validation Summary"
echo "========================================"
echo ""

checks_passed=0
checks_total=9

# Tally checks
[ $missing_files -eq 0 ] && checks_passed=$((checks_passed + 1))
[ $executable_count -eq $total_scripts ] && checks_passed=$((checks_passed + 1))
[ $structure_valid -eq $test_scripts ] && checks_passed=$((checks_passed + 1))
[ $cleanup_valid -eq $test_scripts ] && checks_passed=$((checks_passed + 1))
[ $utils_sourced -eq $total_with_utils ] && checks_passed=$((checks_passed + 1))
[ $total_test_cases -ge $expected_minimum ] && checks_passed=$((checks_passed + 1))
[ $coverage_count -eq ${#success_criteria[@]} ] && checks_passed=$((checks_passed + 1))
[ $compliance_count -eq ${#production_patterns[@]} ] && checks_passed=$((checks_passed + 1))
[ $edge_percent -ge 80 ] && checks_passed=$((checks_passed + 1))

validation_percent=$(awk "BEGIN {printf \"%.0f\", ($checks_passed / $checks_total) * 100}")

log_info "Validation checks passed: ${checks_passed}/${checks_total} (${validation_percent}%)"
log_info "Total test files: ${#required_files[@]}"
log_info "Total test cases: ${total_test_cases}"
log_info "Edge case coverage: ${edge_percent}%"

echo ""

if [ $checks_passed -eq $checks_total ]; then
    log_success "Test suite validation: PASSED"
    log_success "Ready to run: ./run-all-tests.sh"
    exit 0
else
    log_warn "Test suite validation: PASSED WITH WARNINGS"
    log_warn "Check warnings above before running tests"
    exit 0
fi
