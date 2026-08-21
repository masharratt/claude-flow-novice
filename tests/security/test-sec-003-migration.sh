#!/usr/bin/env bash
# tests/security/test-sec-003-migration.sh
# Phase 1 :: SEC-003 SQL Injection Prevention - Comprehensive Test Suite
# Validates migration of 13 vulnerable scripts to parameterized queries

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test database path
TEST_DB="/tmp/sec-003-test-$$.db"

cleanup() {
    rm -f "$TEST_DB"
}
trap cleanup EXIT

# Test 1: Verify sqlite-params library exists and loads correctly
test_library_loading() {
    log_step "TEST 1: Verify sqlite-params library loading"

    local library_path="$PROJECT_ROOT/.claude/shared-lib/bootstrap/sqlite-params.sh"

    if [[ ! -f "$library_path" ]]; then
        log_error "sqlite-params library not found at $library_path"
        return 1
    fi

    # Test library sourcing
    if source "$library_path" 2>/dev/null; then
        log_info "✓ Library loads successfully"
    else
        log_error "✗ Library failed to load"
        return 1
    fi

    # Verify required functions exist
    local required_functions=("sqlite_select" "sqlite_insert" "sqlite_exec")
    for func in "${required_functions[@]}"; do
        if declare -f "$func" > /dev/null; then
            log_info "✓ Function $func exists"
        else
            log_error "✗ Function $func missing"
            return 1
        fi
    done

    log_info "PASS: Library loading validation"
    return 0
}

# Test 2: Verify priority script #1 - store-benchmarks.sh
test_store_benchmarks_migration() {
    log_step "TEST 2: Verify store-benchmarks.sh uses parameterized queries"

    local script_path="$PROJECT_ROOT/.claude/skills/cfn-test-runner/store-benchmarks.sh"

    if [[ ! -f "$script_path" ]]; then
        log_error "Script not found: $script_path"
        return 1
    fi

    # Check for library sourcing
    if grep -q "source.*sqlite-params.sh" "$script_path"; then
        log_info "✓ Sources sqlite-params library"
    else
        log_error "✗ Does not source sqlite-params library"
        return 1
    fi

    # Check for vulnerable patterns (should not exist)
    if grep -E 'sqlite3.*"\$' "$script_path" | grep -v "sqlite_" | grep -qv "#"; then
        log_error "✗ Contains vulnerable direct variable interpolation"
        return 1
    fi

    # Check for secure patterns (should exist)
    if grep -q "sqlite_select\|sqlite_insert\|sqlite_exec" "$script_path"; then
        log_info "✓ Uses parameterized query functions"
    else
        log_error "✗ Does not use parameterized query functions"
        return 1
    fi

    log_info "PASS: store-benchmarks.sh migration"
    return 0
}

# Test 3: Verify priority script #2 - test-memory-persistence.sh
test_memory_persistence_migration() {
    log_step "TEST 3: Verify test-memory-persistence.sh uses parameterized queries"

    local script_path="$PROJECT_ROOT/.claude/skills/cfn-automatic-memory-persistence/test-memory-persistence.sh"

    if [[ ! -f "$script_path" ]]; then
        log_error "Script not found: $script_path"
        return 1
    fi

    # Check for library sourcing
    if grep -q "source.*sqlite-params.sh" "$script_path"; then
        log_info "✓ Sources sqlite-params library"
    else
        log_error "✗ Does not source sqlite-params library"
        return 1
    fi

    # Check for vulnerable patterns in active code (exclude heredocs)
    local vulnerable_count=$(grep -n 'sqlite3.*"\$' "$script_path" | grep -v "sqlite_" | grep -v "<<" | grep -v "#" | wc -l)
    if [[ $vulnerable_count -gt 0 ]]; then
        log_error "✗ Contains $vulnerable_count vulnerable patterns"
        grep -n 'sqlite3.*"\$' "$script_path" | grep -v "sqlite_" | grep -v "<<" | head -5
        return 1
    fi

    log_info "PASS: test-memory-persistence.sh migration"
    return 0
}

# Test 4: Verify priority script #3 - ttl-cleanup.sh
test_ttl_cleanup_migration() {
    log_step "TEST 4: Verify ttl-cleanup.sh uses parameterized queries"

    local script_path="$PROJECT_ROOT/.claude/skills/cfn-sqlite-memory/ttl-cleanup.sh"

    if [[ ! -f "$script_path" ]]; then
        log_error "Script not found: $script_path"
        return 1
    fi

    # Check for library sourcing
    if grep -q "source.*sqlite-params.sh" "$script_path"; then
        log_info "✓ Sources sqlite-params library"
    else
        log_error "✗ Does not source sqlite-params library"
        return 1
    fi

    # Verify no vulnerable patterns in DELETE/UPDATE statements
    if grep -E 'DELETE.*FROM.*\$|UPDATE.*SET.*\$' "$script_path" | grep -qv "sqlite_"; then
        log_error "✗ Contains vulnerable DELETE/UPDATE patterns"
        return 1
    fi

    log_info "PASS: ttl-cleanup.sh migration"
    return 0
}

# Test 5: Verify priority script #4 - agent-handoff.sh
test_agent_handoff_migration() {
    log_step "TEST 5: Verify agent-handoff.sh uses parameterized queries"

    local script_path="$PROJECT_ROOT/.claude/skills/integration/agent-handoff.sh"

    if [[ ! -f "$script_path" ]]; then
        log_error "Script not found: $script_path"
        return 1
    fi

    # Check for library sourcing
    if grep -q "source.*sqlite-params.sh" "$script_path"; then
        log_info "✓ Sources sqlite-params library"
    else
        log_error "✗ Does not source sqlite-params library"
        return 1
    fi

    # Check for parameterized queries in JSON operations
    if grep -E 'sqlite3.*-json.*\$' "$script_path" | grep -qv "\.parameter"; then
        log_error "✗ Contains vulnerable JSON query patterns"
        return 1
    fi

    log_info "PASS: agent-handoff.sh migration"
    return 0
}

# Test 6: Verify additional scripts (batch check)
test_additional_scripts_migration() {
    log_step "TEST 6: Verify additional 9 scripts use parameterized queries"

    local scripts=(
        ".claude/skills/cfn-test-runner/detect-regressions.sh"
        ".claude/skills/cfn-test-runner/init-benchmark-db.sh"
        ".claude/skills/cfn-sqlite-memory/check-dependencies.sh"
        ".claude/skills/workflow-codification/track-cost-savings.sh"
        ".claude/skills/workflow-codification/track-edge-case.sh"
        "scripts/cleanup-workspaces.sh"
        "scripts/skills-db/seed-from-filesystem.sh"
        "scripts/skills-db/init-database-v2.sh"
        "scripts/skills-db/approve-skill.sh"
    )

    local failed_count=0
    local passed_count=0

    for script in "${scripts[@]}"; do
        local full_path="$PROJECT_ROOT/$script"

        if [[ ! -f "$full_path" ]]; then
            log_warn "Script not found: $script (skipping)"
            continue
        fi

        # Check if script uses sqlite3
        if ! grep -q "sqlite3" "$full_path"; then
            log_info "✓ $script (no sqlite usage)"
            ((passed_count++))
            continue
        fi

        # Check for parameterized queries
        if grep -q "source.*sqlite-params.sh" "$full_path" && grep -q "sqlite_select\|sqlite_insert\|sqlite_exec" "$full_path"; then
            log_info "✓ $script uses parameterized queries"
            ((passed_count++))
        else
            log_error "✗ $script not migrated"
            ((failed_count++))
        fi
    done

    log_info "Additional scripts: $passed_count passed, $failed_count failed"

    if [[ $failed_count -gt 0 ]]; then
        return 1
    fi

    log_info "PASS: Additional scripts migration"
    return 0
}

# Test 7: Verify pre-commit hook exists and blocks vulnerable patterns
test_precommit_hook() {
    log_step "TEST 7: Verify pre-commit hook prevents SQL injection"

    local hook_path="$PROJECT_ROOT/.git/hooks/pre-commit"

    if [[ ! -f "$hook_path" ]]; then
        log_error "Pre-commit hook not found at $hook_path"
        return 1
    fi

    if [[ ! -x "$hook_path" ]]; then
        log_error "Pre-commit hook is not executable"
        return 1
    fi

    # Check if hook includes SQL injection detection
    if grep -q "sql.*injection\|sqlite3.*\\\$" "$hook_path"; then
        log_info "✓ Hook includes SQL injection detection"
    else
        log_error "✗ Hook missing SQL injection detection"
        return 1
    fi

    log_info "PASS: Pre-commit hook validation"
    return 0
}

# Test 8: Verify linting script exists and detects vulnerable patterns
test_linting_script() {
    log_step "TEST 8: Verify SQL injection linting script"

    local lint_script="$PROJECT_ROOT/.claude/hooks/cfn-lint-sql-injection.sh"

    if [[ ! -f "$lint_script" ]]; then
        log_error "Linting script not found at $lint_script"
        return 1
    fi

    if [[ ! -x "$lint_script" ]]; then
        log_error "Linting script is not executable"
        return 1
    fi

    # Test linting script with vulnerable pattern
    local test_file="/tmp/test-vulnerable-$$.sh"
    cat > "$test_file" << 'EOF'
#!/bin/bash
USER_INPUT="$1"
sqlite3 "$DB" "SELECT * FROM users WHERE name='$USER_INPUT'"
EOF

    if "$lint_script" "$test_file" 2>/dev/null; then
        log_error "✗ Linter did not detect vulnerable pattern"
        rm -f "$test_file"
        return 1
    else
        log_info "✓ Linter correctly detected vulnerable pattern"
    fi

    rm -f "$test_file"
    log_info "PASS: Linting script validation"
    return 0
}

# Test 9: Functional test - Parameterized query prevents injection
test_functional_injection_prevention() {
    log_step "TEST 9: Functional test - parameterized queries prevent injection"

    source "$PROJECT_ROOT/.claude/shared-lib/bootstrap/sqlite-params.sh"

    # Create test database
    sqlite3 "$TEST_DB" << 'EOF'
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT);
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');
INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com');
EOF

    # Test injection attempt with parameterized query (should be safe)
    local injection_attempt="'; DROP TABLE users; --"
    local result=$(sqlite_select "$TEST_DB" "SELECT name FROM users WHERE name = ?1" "$injection_attempt" 2>&1 || true)

    # Verify table still exists (injection was prevented)
    local table_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users'")

    if [[ "$table_count" == "1" ]]; then
        log_info "✓ Parameterized query prevented DROP TABLE injection"
    else
        log_error "✗ Table was dropped - injection succeeded"
        return 1
    fi

    # Verify data integrity
    local record_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM users")
    if [[ "$record_count" == "2" ]]; then
        log_info "✓ Data integrity maintained"
    else
        log_error "✗ Data was modified"
        return 1
    fi

    log_info "PASS: Functional injection prevention"
    return 0
}

# Test 10: Coverage check - All vulnerable patterns migrated
test_coverage_check() {
    log_step "TEST 10: Coverage check - scan for remaining vulnerabilities"

    local vulnerable_files=$(find "$PROJECT_ROOT/.claude/skills" "$PROJECT_ROOT/scripts" -name "*.sh" -type f -exec grep -l 'sqlite3.*"\$' {} \; 2>/dev/null | grep -v "sqlite-params.sh" | grep -v ".backup" || true)

    if [[ -z "$vulnerable_files" ]]; then
        log_info "✓ No vulnerable patterns found in production scripts"
        log_info "PASS: Coverage check - 100% migration"
        return 0
    fi

    # Check if remaining files are false positives (heredocs, comments, etc.)
    local true_vulnerabilities=0
    while IFS= read -r file; do
        if [[ -z "$file" ]]; then
            continue
        fi

        # Check if patterns are in actual SQL queries (not heredocs/comments)
        if grep -E 'sqlite3.*"\$' "$file" | grep -v "<<" | grep -v "#" | grep -qv "sqlite_"; then
            log_warn "Potential vulnerability in: $file"
            ((true_vulnerabilities++))
        fi
    done <<< "$vulnerable_files"

    if [[ $true_vulnerabilities -gt 0 ]]; then
        log_error "✗ Found $true_vulnerabilities files with potential vulnerabilities"
        return 1
    fi

    log_info "✓ All flagged files are false positives"
    log_info "PASS: Coverage check - 100% migration"
    return 0
}

# Execute all tests
main() {
    log_step "=== SEC-003 SQL INJECTION PREVENTION TEST SUITE ==="
    log_info "Testing migration of 13 vulnerable scripts to parameterized queries"
    log_info ""

    local total_tests=10
    local passed_tests=0
    local failed_tests=0

    local tests=(
        "test_library_loading"
        "test_store_benchmarks_migration"
        "test_memory_persistence_migration"
        "test_ttl_cleanup_migration"
        "test_agent_handoff_migration"
        "test_additional_scripts_migration"
        "test_precommit_hook"
        "test_linting_script"
        "test_functional_injection_prevention"
        "test_coverage_check"
    )

    for test in "${tests[@]}"; do
        if $test; then
            ((passed_tests++))
        else
            ((failed_tests++))
        fi
        echo ""
    done

    # Calculate pass rate
    local pass_rate=$(awk "BEGIN {printf \"%.2f\", $passed_tests / $total_tests}")

    log_step "=== TEST RESULTS ==="
    log_info "Total tests: $total_tests"
    log_info "Passed: $passed_tests"
    log_info "Failed: $failed_tests"
    log_info "Pass rate: $pass_rate (${pass_rate}00%)"

    # Gate validation (95% threshold for standard mode)
    local pass_threshold=0.95
    if (( $(echo "$pass_rate >= $pass_threshold" | bc -l) )); then
        log_info "✓ GATE PASSED: Pass rate $pass_rate meets threshold $pass_threshold"
        return 0
    else
        log_error "✗ GATE FAILED: Pass rate $pass_rate below threshold $pass_threshold"
        return 1
    fi
}

main "$@"
