#!/bin/bash
# test-approve-skill.sh - Comprehensive test suite for approve-skill.sh
# Tests risk assessment, approval routing, and workflow execution

set -euo pipefail

# ============================================================================
# TEST CONFIGURATION
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APPROVE_SCRIPT="$PROJECT_ROOT/scripts/skills-db/approve-skill.sh"

# Test database (will be initialized in setup_test_env)
TEST_DB_DIR=""
TEST_DB=""

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ============================================================================
# TEST UTILITIES
# ============================================================================

setup_test_env() {
    echo "Setting up test environment..."

    # Create test database directory under PROJECT_ROOT for proper path resolution
    TEST_DB_DIR="$PROJECT_ROOT/.test-skills-$$"
    mkdir -p "$TEST_DB_DIR"
    TEST_DB="$TEST_DB_DIR/skills.db"

    # Initialize test database with schema
    sqlite3 "$TEST_DB" <<'EOF'
CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  team TEXT,
  content_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  tags TEXT,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  approval_level TEXT NOT NULL DEFAULT 'human',
  approval_criteria TEXT,
  last_approved_by TEXT,
  last_approval_date TEXT,
  test_coverage REAL,
  test_suite_path TEXT,
  required_test_pass_rate REAL DEFAULT 0.95,
  phase4_pattern_id INTEGER,
  generated_by TEXT,
  is_auto_generated BOOLEAN DEFAULT 0,
  deprecation_note TEXT,
  replacement_id INTEGER,
  owner TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (replacement_id) REFERENCES skills(id) ON DELETE SET NULL
);

CREATE TABLE approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  approval_level TEXT NOT NULL,
  approver TEXT,
  decision TEXT NOT NULL,
  reasoning TEXT,
  risk_assessment TEXT,
  test_results TEXT,
  approval_criteria_check TEXT,
  escalation_reason TEXT,
  escalated_to TEXT,
  escalation_timestamp TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  review_duration_minutes INTEGER,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);
EOF

    # Create test skill files
    mkdir -p "$TEST_DB_DIR/skills"

    # Low-risk skill (should auto-approve)
    cat > "$TEST_DB_DIR/skills/low-risk.sh" <<'SKILL_EOF'
#!/bin/bash
# Simple coordination skill - low risk

simple_function() {
    echo "Hello World"
}

another_function() {
    echo "Simple operation"
}
SKILL_EOF

    # Medium-risk skill (should escalate)
    # Needs to be in [0.30, 0.60] range
    # Use larger file with more functions and external deps
    cat > "$TEST_DB_DIR/skills/medium-risk.sh" <<'SKILL_EOF'
#!/bin/bash
# Infrastructure skill with external API calls and moderate complexity

setup_infrastructure() {
    curl -X POST https://api.example.com/setup
}

configure_service() {
    local config="$1"
    echo "Configuring service with $config"
    curl -X PUT https://api.example.com/config -d "$config"
}

deploy_service() {
    curl -X POST https://api.example.com/deploy
}

monitor_service() {
    watch -n 10 curl https://api.example.com/status
}

rollback_service() {
    curl -X POST https://api.example.com/rollback
}

validate_deployment() {
    local status
    status=$(curl -s https://api.example.com/health)
    echo "$status"
}

cleanup_resources() {
    echo "Cleaning up"
    curl -X DELETE https://api.example.com/cleanup
}

send_notification() {
    curl -X POST https://api.example.com/notify
}

# Add padding to increase file size (>10KB triggers complexity score)
# This is a longer function with more logic
manage_infrastructure_lifecycle() {
    echo "Managing infrastructure"
    echo "Step 1: Validation"
    echo "Step 2: Preparation"
    echo "Step 3: Execution"
    echo "Step 4: Verification"
    echo "Step 5: Monitoring"
    echo "Step 6: Reporting"
    echo "Step 7: Cleanup"
    echo "Step 8: Documentation"
    echo "Step 9: Notification"
    echo "Step 10: Completion"
}
SKILL_EOF

    # High-risk skill (should require human review)
    cat > "$TEST_DB_DIR/skills/high-risk.sh" <<'SKILL_EOF'
#!/bin/bash
# Security-sensitive skill with crypto operations

generate_jwt_token() {
    local secret="$1"
    openssl dgst -sha256 -hmac "$secret"
}

encrypt_data() {
    openssl enc -aes-256-cbc -salt
}

decrypt_data() {
    openssl enc -d -aes-256-cbc
}

manage_api_key() {
    echo "Managing API keys"
}

store_credential() {
    echo "Storing credentials"
}

authenticate_user() {
    jwt verify "$1"
}

authorize_access() {
    echo "Authorizing"
}

create_session() {
    echo "Creating session"
}

validate_token() {
    echo "Validating token"
}

refresh_token() {
    echo "Refreshing token"
}

revoke_access() {
    echo "Revoking access"
}
SKILL_EOF

    chmod +x "$TEST_DB_DIR/skills/"*.sh

    # Create test suite files
    cat > "$TEST_DB_DIR/skills/low-risk-test.sh" <<'TEST_EOF'
#!/bin/bash
exit 0
TEST_EOF

    cat > "$TEST_DB_DIR/skills/medium-risk-test.sh" <<'TEST_EOF'
#!/bin/bash
exit 0
TEST_EOF

    chmod +x "$TEST_DB_DIR/skills/"*-test.sh

    # Insert test skills into database (use paths relative to PROJECT_ROOT)
    # Calculate relative path by removing PROJECT_ROOT prefix and leading slash
    local rel_test_path="${TEST_DB_DIR#$PROJECT_ROOT}"
    rel_test_path="${rel_test_path#/}"

    sqlite3 "$TEST_DB" <<EOF
INSERT INTO skills (name, category, content_path, content_hash, version, test_coverage, test_suite_path)
VALUES
  ('low-risk-coordination', 'coordination', '$rel_test_path/skills/low-risk.sh', 'abc123', '1.0.0', 0.98, '$rel_test_path/skills/low-risk-test.sh'),
  ('medium-risk-infrastructure', 'infrastructure', '$rel_test_path/skills/medium-risk.sh', 'def456', '1.0.0', 0.85, '$rel_test_path/skills/medium-risk-test.sh'),
  ('high-risk-security', 'domain', '$rel_test_path/skills/high-risk.sh', 'ghi789', '1.0.0', 0.75, NULL);
EOF

    echo "Test environment ready: $TEST_DB_DIR"
}

teardown_test_env() {
    echo "Cleaning up test environment..."
    rm -rf "$TEST_DB_DIR"
}

assert_equals() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [[ "$expected" == "$actual" ]]; then
        echo "✅ PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo "❌ FAIL: $test_name"
        echo "   Expected: $expected"
        echo "   Actual:   $actual"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"

    TESTS_RUN=$((TESTS_RUN + 1))

    if echo "$haystack" | grep -q "$needle"; then
        echo "✅ PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo "❌ FAIL: $test_name"
        echo "   Expected to find: $needle"
        echo "   In: $haystack"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_json_field() {
    local json="$1"
    local field="$2"
    local expected="$3"
    local test_name="$4"

    TESTS_RUN=$((TESTS_RUN + 1))

    local actual
    actual=$(echo "$json" | jq -r ".$field")

    if [[ "$actual" == "$expected" ]]; then
        echo "✅ PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo "❌ FAIL: $test_name"
        echo "   Field: $field"
        echo "   Expected: $expected"
        echo "   Actual:   $actual"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

assert_range() {
    local value="$1"
    local min="$2"
    local max="$3"
    local test_name="$4"

    TESTS_RUN=$((TESTS_RUN + 1))

    local is_in_range
    is_in_range=$(echo "$value >= $min && $value <= $max" | bc -l)

    if [[ "$is_in_range" -eq 1 ]]; then
        echo "✅ PASS: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo "❌ FAIL: $test_name"
        echo "   Value: $value not in range [$min, $max]"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# ============================================================================
# RISK ASSESSMENT TESTS
# ============================================================================

test_risk_assessment_low_risk() {
    echo ""
    echo "=== Test: Risk Assessment - Low Risk Skill ==="

    # Override DB_PATH for the approve script
    export DB_PATH="$TEST_DB"

    local output
    output=$("$APPROVE_SCRIPT" assess 1 2>&1)

    # Extract JSON from output (stop at first complete JSON object)
    local risk_json
    risk_json=$(echo "$output" | sed -n '/{/,/^}/p' | jq -c '.')

    # Validate risk components
    local total_risk
    total_risk=$(echo "$risk_json" | jq -r '.total_risk')

    assert_range "$total_risk" 0.0 0.35 "Low-risk skill has risk ≤ 0.35"

    # Validate recommended level is auto
    local recommended
    recommended=$(echo "$output" | grep "Recommended approval level:" | awk '{print $4}')

    assert_equals "auto" "$recommended" "Low-risk skill recommends auto-approval"
}

test_risk_assessment_medium_risk() {
    echo ""
    echo "=== Test: Risk Assessment - Medium Risk Skill ==="

    export DB_PATH="$TEST_DB"

    local output
    output=$("$APPROVE_SCRIPT" assess 2 2>&1)

    local risk_json
    risk_json=$(echo "$output" | sed -n '/{/,/^}/p' | jq -c '.')

    local total_risk
    total_risk=$(echo "$risk_json" | jq -r '.total_risk')

    assert_range "$total_risk" 0.30 0.65 "Medium-risk skill has risk in [0.30, 0.65]"

    local recommended
    recommended=$(echo "$output" | grep "Recommended approval level:" | awk '{print $4}')

    assert_equals "escalate" "$recommended" "Medium-risk skill recommends escalation"
}

test_risk_assessment_high_risk() {
    echo ""
    echo "=== Test: Risk Assessment - High Risk Skill ==="

    export DB_PATH="$TEST_DB"

    local output
    output=$("$APPROVE_SCRIPT" assess 3 2>&1)

    local risk_json
    risk_json=$(echo "$output" | sed -n '/{/,/^}/p' | jq -c '.')

    local total_risk
    total_risk=$(echo "$risk_json" | jq -r '.total_risk')

    # High-risk should be > 0.60 or have low coverage
    local security
    security=$(echo "$risk_json" | jq -r '.security')

    # Security-sensitive skills should have high security score
    assert_range "$security" 0.6 1.0 "Security-sensitive skill has high security score"

    local recommended
    recommended=$(echo "$output" | grep "Recommended approval level:" | awk '{print $4}')

    assert_equals "human" "$recommended" "High-risk skill requires human review"
}

test_risk_component_weights() {
    echo ""
    echo "=== Test: Risk Component Weighting ==="

    export DB_PATH="$TEST_DB"

    local output
    output=$("$APPROVE_SCRIPT" assess 1 --verbose 2>&1)

    # Check that all components are calculated
    assert_contains "$output" "Security:" "Security component calculated"
    assert_contains "$output" "Complexity:" "Complexity component calculated"
    assert_contains "$output" "Coverage:" "Coverage component calculated"
    assert_contains "$output" "Dependencies:" "Dependencies component calculated"
    assert_contains "$output" "Criticality:" "Criticality component calculated"

    # Check weights are applied
    assert_contains "$output" "weight: 0.35" "Security weight applied (35%)"
    assert_contains "$output" "weight: 0.25" "Complexity weight applied (25%)"
    assert_contains "$output" "weight: 0.20" "Coverage weight applied (20%)"
}

# ============================================================================
# APPROVAL WORKFLOW TESTS
# ============================================================================

test_auto_approval_workflow() {
    echo ""
    echo "=== Test: Auto-Approval Workflow ==="

    export DB_PATH="$TEST_DB"

    # Run approval workflow (dry-run first)
    local output
    output=$("$APPROVE_SCRIPT" approve 1 --dry-run 2>&1)

    assert_contains "$output" "Would auto-approve skill: low-risk-coordination" "Dry-run identifies auto-approval"

    # Run actual approval
    output=$("$APPROVE_SCRIPT" approve 1 2>&1)

    assert_contains "$output" "✅ Skill auto-approved" "Skill auto-approved successfully"

    # Verify database updates
    local approval_level
    approval_level=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skills WHERE id = 1;")

    assert_equals "auto" "$approval_level" "Database updated with auto approval level"

    local approved_by
    approved_by=$(sqlite3 "$TEST_DB" "SELECT last_approved_by FROM skills WHERE id = 1;")

    assert_equals "system" "$approved_by" "System recorded as approver"

    # Verify approval history
    local history_count
    history_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM approval_history WHERE skill_id = 1 AND decision = 'approved';")

    assert_equals "1" "$history_count" "Approval history record created"
}

test_escalation_workflow() {
    echo ""
    echo "=== Test: Escalation Workflow ==="

    export DB_PATH="$TEST_DB"

    # Run escalation workflow
    local output
    output=$("$APPROVE_SCRIPT" approve 2 2>&1)

    assert_contains "$output" "⚠️  Skill escalated to expert" "Skill escalated successfully"

    # Verify database updates
    local approval_level
    approval_level=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skills WHERE id = 2;")

    assert_equals "escalate" "$approval_level" "Database updated with escalate level"

    # Verify approval history
    local decision
    decision=$(sqlite3 "$TEST_DB" "SELECT decision FROM approval_history WHERE skill_id = 2;")

    assert_equals "escalated" "$decision" "Approval history shows escalated decision"

    local escalated_to
    escalated_to=$(sqlite3 "$TEST_DB" "SELECT escalated_to FROM approval_history WHERE skill_id = 2;")

    assert_contains "$escalated_to" "example.com" "Expert assigned for escalation"
}

test_human_review_workflow() {
    echo ""
    echo "=== Test: Human Review Workflow ==="

    export DB_PATH="$TEST_DB"

    # Run human review workflow
    local output
    output=$("$APPROVE_SCRIPT" approve 3 2>&1)

    assert_contains "$output" "⚠️  Skill requires human approval" "Human review required"

    # Verify database updates
    local approval_level
    approval_level=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skills WHERE id = 3;")

    assert_equals "human" "$approval_level" "Database updated with human review level"

    # Verify senior review board assignment
    local escalated_to
    escalated_to=$(sqlite3 "$TEST_DB" "SELECT escalated_to FROM approval_history WHERE skill_id = 3;")

    assert_contains "$escalated_to" "senior-review-board" "Senior review board assigned"
}

# ============================================================================
# EXPERT DECISION TESTS
# ============================================================================

test_manual_approval() {
    echo ""
    echo "=== Test: Manual Expert Approval ==="

    export DB_PATH="$TEST_DB"

    # First escalate a skill
    "$APPROVE_SCRIPT" approve 2 >/dev/null 2>&1

    # Now manually approve it
    local output
    output=$("$APPROVE_SCRIPT" accept 2 "expert@example.com" "Tests passing, infrastructure reviewed" 2>&1)

    assert_contains "$output" "✅ Skill approved by expert@example.com" "Manual approval recorded"

    # Verify database
    local approved_by
    approved_by=$(sqlite3 "$TEST_DB" "SELECT last_approved_by FROM skills WHERE id = 2;")

    assert_equals "expert@example.com" "$approved_by" "Expert recorded as approver"

    # Verify approval history updated
    local history_decision
    history_decision=$(sqlite3 "$TEST_DB" "SELECT decision FROM approval_history WHERE skill_id = 2 ORDER BY timestamp DESC LIMIT 1;")

    assert_equals "approved" "$history_decision" "Approval history updated to approved"

    local history_reasoning
    history_reasoning=$(sqlite3 "$TEST_DB" "SELECT reasoning FROM approval_history WHERE skill_id = 2 ORDER BY timestamp DESC LIMIT 1;")

    assert_contains "$history_reasoning" "Tests passing" "Reasoning recorded in history"
}

test_manual_rejection() {
    echo ""
    echo "=== Test: Manual Expert Rejection ==="

    export DB_PATH="$TEST_DB"

    # Escalate a skill first
    "$APPROVE_SCRIPT" approve 2 >/dev/null 2>&1

    # Now reject it
    local output
    output=$("$APPROVE_SCRIPT" reject 2 "expert@example.com" "Insufficient test coverage, needs refactoring" 2>&1)

    assert_contains "$output" "❌ Skill rejected by expert@example.com" "Manual rejection recorded"

    # Verify approval history
    local history_decision
    history_decision=$(sqlite3 "$TEST_DB" "SELECT decision FROM approval_history WHERE skill_id = 2 ORDER BY timestamp DESC LIMIT 1;")

    assert_equals "rejected" "$history_decision" "Approval history shows rejection"

    local history_reasoning
    history_reasoning=$(sqlite3 "$TEST_DB" "SELECT reasoning FROM approval_history WHERE skill_id = 2 ORDER BY timestamp DESC LIMIT 1;")

    assert_contains "$history_reasoning" "Insufficient test coverage" "Rejection reasoning recorded"
}

# ============================================================================
# LISTING AND SLA TESTS
# ============================================================================

test_list_pending_approvals() {
    echo ""
    echo "=== Test: List Pending Approvals ==="

    export DB_PATH="$TEST_DB"

    # Escalate multiple skills
    "$APPROVE_SCRIPT" approve 2 >/dev/null 2>&1
    "$APPROVE_SCRIPT" approve 3 >/dev/null 2>&1

    # List all pending
    local output
    output=$("$APPROVE_SCRIPT" list-pending all 2>&1)

    assert_contains "$output" "medium-risk-infrastructure" "Escalated skill listed"
    assert_contains "$output" "high-risk-security" "Human review skill listed"

    # List only escalations
    output=$("$APPROVE_SCRIPT" list-pending escalate 2>&1)

    assert_contains "$output" "medium-risk-infrastructure" "Escalate filter works"

    # List only human reviews
    output=$("$APPROVE_SCRIPT" list-pending human 2>&1)

    assert_contains "$output" "high-risk-security" "Human filter works"
}

test_sla_compliance_check() {
    echo ""
    echo "=== Test: SLA Compliance Check ==="

    export DB_PATH="$TEST_DB"

    # Escalate skills
    "$APPROVE_SCRIPT" approve 2 >/dev/null 2>&1
    "$APPROVE_SCRIPT" approve 3 >/dev/null 2>&1

    # Check SLA compliance
    local output
    output=$("$APPROVE_SCRIPT" check-sla 2>&1)

    # Should show SLA status
    assert_contains "$output" "sla_status" "SLA status displayed"
    assert_contains "$output" "hours_elapsed" "Hours elapsed calculated"

    # Both should be compliant (just created)
    assert_contains "$output" "COMPLIANT" "New approvals are SLA compliant"
}

# ============================================================================
# EDGE CASE TESTS
# ============================================================================

test_invalid_skill_id() {
    echo ""
    echo "=== Test: Invalid Skill ID Handling ==="

    export DB_PATH="$TEST_DB"

    local output
    output=$("$APPROVE_SCRIPT" assess 999 2>&1 || true)

    assert_contains "$output" "Skill ID 999 not found" "Invalid skill ID rejected"
}

test_missing_database() {
    echo ""
    echo "=== Test: Missing Database Handling ==="

    export DB_PATH="/tmp/nonexistent-$$.db"

    local output
    output=$("$APPROVE_SCRIPT" assess 1 2>&1 || true)

    assert_contains "$output" "Database not found" "Missing database detected"
}

test_dry_run_mode() {
    echo ""
    echo "=== Test: Dry-Run Mode ==="

    export DB_PATH="$TEST_DB"

    # Get initial state
    local initial_level
    initial_level=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skills WHERE id = 1;")

    # Run dry-run approval
    "$APPROVE_SCRIPT" approve 1 --dry-run >/dev/null 2>&1

    # Verify no changes
    local final_level
    final_level=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skills WHERE id = 1;")

    assert_equals "$initial_level" "$final_level" "Dry-run does not modify database"
}

# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

run_all_tests() {
    echo "========================================"
    echo "Skills Database Approval Workflow Tests"
    echo "========================================"

    setup_test_env

    # Risk Assessment Tests
    test_risk_assessment_low_risk
    test_risk_assessment_medium_risk
    test_risk_assessment_high_risk
    test_risk_component_weights

    # Approval Workflow Tests
    test_auto_approval_workflow
    test_escalation_workflow
    test_human_review_workflow

    # Expert Decision Tests
    test_manual_approval
    test_manual_rejection

    # Listing and SLA Tests
    test_list_pending_approvals
    test_sla_compliance_check

    # Edge Case Tests
    test_invalid_skill_id
    test_missing_database
    test_dry_run_mode

    teardown_test_env

    # Print summary
    echo ""
    echo "========================================"
    echo "TEST SUMMARY"
    echo "========================================"
    echo "Total Tests:  $TESTS_RUN"
    echo "Passed:       $TESTS_PASSED"
    echo "Failed:       $TESTS_FAILED"
    echo ""

    local pass_rate
    if [[ $TESTS_RUN -gt 0 ]]; then
        pass_rate=$(echo "scale=2; ($TESTS_PASSED / $TESTS_RUN) * 100" | bc -l)
        echo "Pass Rate:    ${pass_rate}%"
    fi

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo ""
        echo "✅ ALL TESTS PASSED"
        return 0
    else
        echo ""
        echo "❌ SOME TESTS FAILED"
        return 1
    fi
}

# Execute tests
run_all_tests
