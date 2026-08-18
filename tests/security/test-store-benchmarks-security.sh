#!/usr/bin/env bash
# tests/security/test-store-benchmarks-security.sh
# Phase 2 :: Validate store-benchmarks.sh SQL injection protection (Iteration 2/10)
# Tests Pattern B parameterized query implementation against OWASP attack vectors

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test database path
TEST_DB="/tmp/test-benchmark-security-$$.db"
SCRIPT_PATH="$PROJECT_ROOT/.claude/skills/cfn-test-runner/store-benchmarks.sh"

# OWASP SQL Injection Attack Vectors
declare -a ATTACK_VECTORS=(
    "'; DROP TABLE test_runs; --"
    "' OR '1'='1"
    "' UNION SELECT * FROM sqlite_master --"
    "'; DELETE FROM test_suites; --"
    "' AND 1=2 UNION SELECT null, sqlite_version() --"
    "admin'--"
    "' OR 1=1--"
    "' OR 'x'='x"
    "'; ATTACH DATABASE 'evil.db' AS evil; --"
    "1'; UPDATE test_runs SET passed='999999' WHERE '1'='1"
)

cleanup() {
    rm -f "$TEST_DB" "$TEST_DB-journal" "$TEST_DB-wal" "$TEST_DB-shm"
}
trap cleanup EXIT

# Initialize test database with schema (matches production schema)
init_test_db() {
    sqlite3 "$TEST_DB" <<'EOF'
CREATE TABLE IF NOT EXISTS test_suites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suite_id INTEGER NOT NULL,
  run_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  git_commit TEXT,
  git_branch TEXT,
  total_tests INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  skipped INTEGER NOT NULL,
  duration_seconds REAL NOT NULL,
  success_rate REAL,
  FOREIGN KEY (suite_id) REFERENCES test_suites(id)
);
EOF
}

# Test 1: Verify Pattern B implementation exists
test_pattern_b_implementation() {
    log_step "Test 1: Verify Pattern B implementation"

    # GIVEN: store-benchmarks.sh script
    # WHEN: Checking for Pattern B implementation
    if grep -q "sqlite_insert\|sqlite_select" "$SCRIPT_PATH"; then
        log_info "✓ Uses sqlite helper functions (Pattern B)"
    else
        log_error "✗ Missing sqlite helper functions"
        return 1
    fi

    # THEN: Should source sqlite-params.sh
    if grep -q "source.*sqlite-params.sh" "$SCRIPT_PATH"; then
        log_info "✓ Sources sqlite-params.sh library"
    else
        log_error "✗ Does not source sqlite-params.sh"
        return 1
    fi

    log_info "PASS: Pattern B implementation verified"
}

# Test 2: SQL injection via malicious suite name
test_injection_suite_name() {
    log_step "Test 2: SQL injection via malicious suite name"

    init_test_db

    # GIVEN: Database with clean state
    local initial_count
    initial_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM test_suites;")

    for vector in "${ATTACK_VECTORS[@]}"; do
        # WHEN: Attempting injection via suite name
        log_info "Testing vector: ${vector:0:30}..."

        # Modify script temporarily to use test DB
        DB_BACKUP="$PROJECT_ROOT/.artifacts/test-benchmarks.db"
        export DB_FILE="$TEST_DB"

        # Execute with injection payload
        if bash "$SCRIPT_PATH" \
            --suite "$vector" \
            --total 10 \
            --passed 8 \
            --failed 2 \
            --skipped 0 \
            --duration 45.5 \
            --commit "abc123" \
            --branch "main" 2>/dev/null; then

            # THEN: Attack should be neutralized (stored as literal string)
            local suite_count
            suite_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM test_suites;")

            # Should have one more suite (injection stored as data, not executed)
            if [[ $((suite_count - initial_count)) -ne 1 ]]; then
                log_error "✗ Injection may have altered database structure"
                return 1
            fi

            # Verify injection string was stored as literal data
            local stored_name
            stored_name=$(sqlite3 "$TEST_DB" "SELECT name FROM test_suites ORDER BY id DESC LIMIT 1;")
            if [[ "$stored_name" != "$vector" ]]; then
                log_error "✗ Injection string was not stored correctly"
                log_error "Expected: $vector"
                log_error "Got: $stored_name"
                return 1
            fi

            log_info "✓ Vector neutralized: ${vector:0:30}"
            initial_count=$suite_count
        else
            log_error "✗ Script failed with vector: $vector"
            return 1
        fi
    done

    log_info "PASS: All suite name injection vectors neutralized"
}

# Test 3: SQL injection via git parameters
test_injection_git_params() {
    log_step "Test 3: SQL injection via git parameters"

    init_test_db

    # GIVEN: Database with test suite
    bash "$SCRIPT_PATH" \
        --suite "test-suite" \
        --total 10 \
        --passed 10 \
        --failed 0 \
        --skipped 0 \
        --duration 30 \
        --commit "baseline" \
        --branch "main" 2>/dev/null || true

    local initial_runs
    initial_runs=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM test_runs;")

    # WHEN: Attempting injection via commit hash
    local malicious_commit="'; DROP TABLE test_runs; --"

    bash "$SCRIPT_PATH" \
        --suite "test-suite" \
        --total 5 \
        --passed 5 \
        --failed 0 \
        --skipped 0 \
        --duration 20 \
        --commit "$malicious_commit" \
        --branch "main" 2>/dev/null || true

    # THEN: Database structure should be intact
    local table_exists
    table_exists=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='test_runs';")

    if [[ "$table_exists" -ne 1 ]]; then
        log_error "✗ test_runs table was dropped by injection"
        return 1
    fi

    # Verify malicious string stored as data
    local stored_commit
    stored_commit=$(sqlite3 "$TEST_DB" "SELECT git_commit FROM test_runs ORDER BY id DESC LIMIT 1;")
    if [[ "$stored_commit" != "$malicious_commit" ]]; then
        log_error "✗ Malicious commit not stored correctly"
        return 1
    fi

    log_info "✓ Git parameter injection neutralized"
    log_info "PASS: Git parameters are safely parameterized"
}

# Test 4: Numeric parameter injection
test_numeric_injection() {
    log_step "Test 4: Numeric parameter injection"

    init_test_db

    # GIVEN: Database with clean state
    bash "$SCRIPT_PATH" \
        --suite "numeric-test" \
        --total 10 \
        --passed 10 \
        --failed 0 \
        --skipped 0 \
        --duration 25 \
        --commit "abc123" \
        --branch "main" 2>/dev/null || true

    # WHEN: Attempting injection via numeric parameters
    local malicious_total="10; DELETE FROM test_runs; --"

    # Should fail gracefully (not a valid number)
    if bash "$SCRIPT_PATH" \
        --suite "numeric-test" \
        --total "$malicious_total" \
        --passed 5 \
        --failed 0 \
        --skipped 0 \
        --duration 15 \
        --commit "def456" \
        --branch "main" 2>/dev/null; then

        # THEN: If it succeeds, verify no SQL was executed
        local run_count
        run_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM test_runs;")
        if [[ $run_count -eq 0 ]]; then
            log_error "✗ Injection deleted test_runs"
            return 1
        fi
        log_info "✓ Numeric injection stored as data (success case)"
    else
        # Expected: script should reject invalid numeric input
        log_info "✓ Script rejected invalid numeric input (expected behavior)"
    fi

    log_info "PASS: Numeric parameters handled safely"
}

# Test 5: Verify no direct string concatenation
test_no_string_concatenation() {
    log_step "Test 5: Verify no direct string concatenation"

    # GIVEN: store-benchmarks.sh source code
    # WHEN: Checking for dangerous patterns

    # THEN: Should not have direct variable substitution in SQL
    if grep -E 'sqlite3.*"\$\{' "$SCRIPT_PATH" | grep -v "\.parameter"; then
        log_error "✗ Found direct variable substitution in SQL"
        return 1
    fi

    log_info "✓ No direct string concatenation found"
    log_info "PASS: All SQL uses parameterized queries"
}

# Test 6: Integration test with realistic workflow
test_realistic_workflow() {
    log_step "Test 6: Realistic workflow integration test"

    # Use fresh database for this test
    rm -f "$TEST_DB"
    init_test_db

    # GIVEN: Real-world test execution scenario
    # WHEN: Storing multiple test runs
    for i in {1..5}; do
        bash "$SCRIPT_PATH" \
            --suite "integration-suite-$i" \
            --total 100 \
            --passed $((90 + i)) \
            --failed $((10 - i)) \
            --skipped 0 \
            --duration $((30 + i * 5)) \
            --commit "commit-$i" \
            --branch "feature-branch-$i" 2>/dev/null || {
                log_error "✗ Failed to store benchmark $i"
                return 1
            }
    done

    # THEN: All records should be stored correctly
    local suite_count
    suite_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM test_suites;")
    if [[ $suite_count -ne 5 ]]; then
        log_error "✗ Expected 5 suites, got $suite_count"
        return 1
    fi

    local run_count
    run_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM test_runs;")
    if [[ $run_count -ne 5 ]]; then
        log_error "✗ Expected 5 runs, got $run_count"
        return 1
    fi

    log_info "✓ All benchmarks stored correctly"
    log_info "PASS: Realistic workflow completed successfully"
}

# Main execution
main() {
    log_step "Starting store-benchmarks.sh Security Test Suite"

    # Override DB path for all tests
    export DB_FILE="$TEST_DB"

    local failed=0

    test_pattern_b_implementation || ((failed++))
    test_injection_suite_name || ((failed++))
    test_injection_git_params || ((failed++))
    test_numeric_injection || ((failed++))
    test_no_string_concatenation || ((failed++))
    test_realistic_workflow || ((failed++))

    echo ""
    if [[ $failed -eq 0 ]]; then
        log_info "=== ALL TESTS PASSED (6/6) ==="
        log_info "store-benchmarks.sh is secure against SQL injection"
        exit 0
    else
        log_error "=== TESTS FAILED ($failed/6) ==="
        log_error "Security vulnerabilities detected"
        exit 1
    fi
}

main "$@"
