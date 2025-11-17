#!/bin/bash
# End-to-End Approval Workflow Test Suite
# Tests complete workflow: create → approve → agent usage → analytics

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Test environment
TEST_DB="$SCRIPT_DIR/e2e-skills.db"
TEST_SKILL_DIR="$SCRIPT_DIR/e2e-skills"
CLI_SCRIPT="$PROJECT_ROOT/src/cli/skill-cli.ts"

export CFN_SKILLS_DB_PATH="$TEST_DB"
export CFN_SKILLS_DATABASE=true

# Cleanup
cleanup() {
    rm -f "$TEST_DB"
    rm -rf "$TEST_SKILL_DIR"
}

# Setup
setup_e2e_env() {
    echo -e "${BLUE}Setting up E2E test environment...${NC}"
    cleanup

    # Initialize database
    sqlite3 "$TEST_DB" < "$PROJECT_ROOT/.claude/skills-database/schema-v2.sql"

    # Create test skill directory
    mkdir -p "$TEST_SKILL_DIR"

    # Create test skills
    cat > "$TEST_SKILL_DIR/jwt-auth.md" <<'EOF'
---
name: jwt-authentication
category: domain
approval_level: human
tags: [security, auth, jwt]
version: 1.0.0
owner: backend-team
---

# JWT Authentication Skill

Implements JWT token generation and validation patterns for secure authentication.

## Usage
```typescript
const token = generateJWT(payload, secret);
const verified = verifyJWT(token, secret);
```
EOF

    cat > "$TEST_SKILL_DIR/redis-coord.md" <<'EOF'
---
name: redis-coordination
category: coordination
approval_level: auto
tags: [redis, coordination, async]
version: 2.1.0
owner: cfn-core
---

# Redis Coordination Skill

Redis-based agent coordination patterns for CFN Loop.
EOF

    echo -e "${GREEN}Setup complete${NC}\n"
}

# Test assertions
assert_success() {
    local exit_code="$1"
    local test_name="$2"

    ((TESTS_RUN++))

    if [[ "$exit_code" -eq 0 ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name (exit code: $exit_code)"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local test_name="$3"

    ((TESTS_RUN++))

    if [[ "$haystack" == *"$needle"* ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected to contain: $needle"
        ((TESTS_FAILED++))
        return 1
    fi
}

assert_count() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    ((TESTS_RUN++))

    if [[ "$expected" -eq "$actual" ]]; then
        echo -e "${GREEN}✓${NC} $test_name"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $test_name"
        echo "  Expected: $expected, Got: $actual"
        ((TESTS_FAILED++))
        return 1
    fi
}

# ============================================================================
# E2E Test Scenario 1: Auto-Approved Skill Workflow
# ============================================================================

test_auto_approved_workflow() {
    echo -e "\n${BLUE}=== E2E Scenario 1: Auto-Approved Skill Workflow ===${NC}\n"

    # Step 1: Create auto-approved skill
    echo "Step 1: Creating auto-approved skill..."
    npx tsx "$CLI_SCRIPT" create \
        --name=redis-coordination \
        --category=coordination \
        --team=cfn \
        --content-path="$TEST_SKILL_DIR/redis-coord.md" \
        --tags=redis,coordination \
        --version=2.1.0 \
        --approval-level=auto \
        --owner=cfn-core > /dev/null 2>&1
    assert_success $? "Create auto-approved skill"

    # Step 2: Verify no approval required
    local pending_count
    pending_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skills WHERE name='redis-coordination' AND approval_level='auto';")
    assert_count 1 "$pending_count" "Skill has auto approval level"

    # Step 3: Auto-approve the skill
    echo "Step 2: Auto-approving skill..."
    npx tsx "$CLI_SCRIPT" approve \
        --skill=redis-coordination \
        --decision=approved \
        --approver=system \
        --reasoning="Auto-approved based on criteria" > /dev/null 2>&1
    assert_success $? "Auto-approve skill"

    # Step 4: Verify approval history
    local approval_count
    approval_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM approval_history WHERE skill_id=1 AND decision='approved';")
    assert_count 1 "$approval_count" "Approval recorded in history"

    # Step 5: Assign to agent
    echo "Step 3: Assigning skill to agent..."
    npx tsx "$CLI_SCRIPT" assign \
        --agent=backend-developer \
        --skill=redis-coordination \
        --priority=1 \
        --required > /dev/null 2>&1
    assert_success $? "Assign skill to agent"

    # Step 6: Simulate skill usage logging
    echo "Step 4: Simulating skill usage..."
    sqlite3 "$TEST_DB" <<EOF
INSERT INTO skill_usage_log (agent_id, agent_type, skill_id, task_id, phase, confidence_before, confidence_after, execution_time_ms)
VALUES ('backend-1', 'backend-developer', 1, 'task-auto-1', 'loop3', 0.70, 0.85, 8);
EOF
    local usage_count
    usage_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM skill_usage_log WHERE skill_id=1;")
    assert_count 1 "$usage_count" "Skill usage logged"

    # Step 7: Check analytics
    echo "Step 5: Verifying analytics..."
    local output
    output=$(npx tsx "$CLI_SCRIPT" analytics effectiveness --days=30 2>&1)
    assert_contains "$output" "AUTO" "Analytics show auto-approved skills"
}

# ============================================================================
# E2E Test Scenario 2: Human-Approved Skill Workflow
# ============================================================================

test_human_approved_workflow() {
    echo -e "\n${BLUE}=== E2E Scenario 2: Human-Approved Skill Workflow ===${NC}\n"

    # Step 1: Create human-approval skill
    echo "Step 1: Creating skill requiring human approval..."
    npx tsx "$CLI_SCRIPT" create \
        --name=jwt-authentication \
        --category=domain \
        --team=backend \
        --content-path="$TEST_SKILL_DIR/jwt-auth.md" \
        --tags=security,auth,jwt \
        --version=1.0.0 \
        --approval-level=human \
        --owner=backend-team > /dev/null 2>&1
    assert_success $? "Create human-approval skill"

    # Step 2: Verify pending approval
    echo "Step 2: Checking pending approvals..."
    local output
    output=$(npx tsx "$CLI_SCRIPT" pending --approval-level=human 2>&1)
    assert_contains "$output" "jwt-authentication" "Skill appears in pending list"

    # Step 3: Check approval status (should show no history)
    echo "Step 3: Checking approval status..."
    output=$(npx tsx "$CLI_SCRIPT" approval-status --skill=jwt-authentication 2>&1)
    assert_contains "$output" "Approval Status" "Approval status displays"

    # Step 4: Expert approves the skill
    echo "Step 4: Expert approving skill..."
    npx tsx "$CLI_SCRIPT" approve \
        --skill=jwt-authentication \
        --decision=approved \
        --approver=expert@example.com \
        --reasoning="Security review passed, test coverage 95%" > /dev/null 2>&1
    assert_success $? "Expert approves skill"

    # Step 5: Verify approval history
    local approval_count
    approval_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM approval_history WHERE skill_id=2 AND decision='approved' AND approver='expert@example.com';")
    assert_count 1 "$approval_count" "Approval recorded with expert details"

    # Step 6: Verify no longer in pending
    echo "Step 5: Verifying removal from pending..."
    output=$(npx tsx "$CLI_SCRIPT" pending --approval-level=human 2>&1)
    assert_contains "$output" "No pending\|0" "Skill removed from pending list"

    # Step 7: Assign to agent with conditions
    echo "Step 6: Assigning skill with conditions..."
    npx tsx "$CLI_SCRIPT" assign \
        --agent=backend-developer \
        --skill=jwt-authentication \
        --priority=3 \
        --condition=auth > /dev/null 2>&1
    assert_success $? "Assign skill with condition"
}

# ============================================================================
# E2E Test Scenario 3: Escalation Workflow
# ============================================================================

test_escalation_workflow() {
    echo -e "\n${BLUE}=== E2E Scenario 3: Escalation Workflow ===${NC}\n"

    # Step 1: Create a skill
    echo "Step 1: Creating skill for escalation..."
    cat > "$TEST_SKILL_DIR/redis-cluster.md" <<'EOF'
# Redis Cluster Skill
Advanced Redis clustering configuration.
EOF

    npx tsx "$CLI_SCRIPT" create \
        --name=redis-cluster \
        --category=infrastructure \
        --team=devops \
        --content-path="$TEST_SKILL_DIR/redis-cluster.md" \
        --tags=redis,cluster,infra \
        --version=1.1.0 \
        --approval-level=auto \
        --owner=devops-team > /dev/null 2>&1
    assert_success $? "Create skill for escalation"

    # Step 2: Escalate the skill
    echo "Step 2: Escalating skill for security review..."
    npx tsx "$CLI_SCRIPT" escalate \
        --skill=redis-cluster \
        --reason="Requires security review for external Redis connection" > /dev/null 2>&1
    assert_success $? "Escalate skill"

    # Step 3: Verify approval level changed
    local new_level
    new_level=$(sqlite3 "$TEST_DB" "SELECT approval_level FROM skills WHERE name='redis-cluster';")
    [[ "$new_level" == "escalate" ]]
    assert_success $? "Approval level changed to escalate"

    # Step 4: Verify escalation recorded
    local escalation_count
    escalation_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM approval_history WHERE skill_id=3 AND decision='escalated';")
    assert_count 1 "$escalation_count" "Escalation recorded in history"

    # Step 5: Check pending escalations
    echo "Step 3: Checking pending escalations..."
    local output
    output=$(npx tsx "$CLI_SCRIPT" pending --approval-level=escalate 2>&1)
    assert_contains "$output" "redis-cluster" "Escalated skill in pending list"
}

# ============================================================================
# E2E Test Scenario 4: Rejection Workflow
# ============================================================================

test_rejection_workflow() {
    echo -e "\n${BLUE}=== E2E Scenario 4: Rejection Workflow ===${NC}\n"

    # Step 1: Create a skill
    echo "Step 1: Creating skill for rejection..."
    cat > "$TEST_SKILL_DIR/unsafe-skill.md" <<'EOF'
# Unsafe Skill
This skill has security vulnerabilities.
EOF

    npx tsx "$CLI_SCRIPT" create \
        --name=unsafe-skill \
        --category=domain \
        --team=test \
        --content-path="$TEST_SKILL_DIR/unsafe-skill.md" \
        --tags=test \
        --version=1.0.0 \
        --approval-level=human \
        --owner=test-team > /dev/null 2>&1
    assert_success $? "Create skill for rejection"

    # Step 2: Reject the skill
    echo "Step 2: Rejecting skill..."
    npx tsx "$CLI_SCRIPT" approve \
        --skill=unsafe-skill \
        --decision=rejected \
        --approver=security@example.com \
        --reasoning="Security vulnerabilities found in implementation" > /dev/null 2>&1
    assert_success $? "Reject skill"

    # Step 3: Verify status changed to archived
    local status
    status=$(sqlite3 "$TEST_DB" "SELECT status FROM skills WHERE name='unsafe-skill';")
    [[ "$status" == "archived" ]]
    assert_success $? "Status changed to archived"

    # Step 4: Verify rejection recorded
    local rejection_count
    rejection_count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM approval_history WHERE skill_id=4 AND decision='rejected';")
    assert_count 1 "$rejection_count" "Rejection recorded in history"
}

# ============================================================================
# E2E Test Scenario 5: Analytics Workflow
# ============================================================================

test_analytics_workflow() {
    echo -e "\n${BLUE}=== E2E Scenario 5: Analytics Workflow ===${NC}\n"

    # Add more usage data
    echo "Step 1: Adding usage data..."
    sqlite3 "$TEST_DB" <<EOF
INSERT INTO skill_usage_log (agent_id, agent_type, skill_id, task_id, phase, confidence_before, confidence_after, execution_time_ms)
VALUES
    ('backend-2', 'backend-developer', 1, 'task-analytics-1', 'loop3', 0.75, 0.88, 10),
    ('backend-3', 'backend-developer', 2, 'task-analytics-2', 'loop3', 0.70, 0.92, 12),
    ('backend-4', 'backend-developer', 2, 'task-analytics-3', 'loop3', 0.72, 0.90, 11);
EOF

    # Test effectiveness analytics
    echo "Step 2: Testing effectiveness analytics..."
    local output
    output=$(npx tsx "$CLI_SCRIPT" analytics effectiveness --days=30 2>&1)
    assert_contains "$output" "Effectiveness" "Effectiveness analytics displays"
    assert_contains "$output" "AUTO\|HUMAN" "Shows approval level breakdown"

    # Test velocity analytics
    echo "Step 3: Testing velocity analytics..."
    output=$(npx tsx "$CLI_SCRIPT" analytics velocity --days=30 2>&1)
    assert_contains "$output" "Velocity\|approved" "Velocity analytics displays"

    # Test bottlenecks
    echo "Step 4: Testing bottlenecks analytics..."
    output=$(npx tsx "$CLI_SCRIPT" analytics bottlenecks 2>&1)
    assert_contains "$output" "Bottlenecks\|Pending\|No pending" "Bottlenecks analytics displays"

    # Test by-approval
    echo "Step 5: Testing by-approval analytics..."
    output=$(npx tsx "$CLI_SCRIPT" analytics by-approval 2>&1)
    assert_contains "$output" "AUTO\|HUMAN" "By-approval analytics displays"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "======================================================================"
    echo "  E2E Approval Workflow Test Suite"
    echo "  Phase 5: Integration & Testing"
    echo "======================================================================"

    setup_e2e_env

    test_auto_approved_workflow
    test_human_approved_workflow
    test_escalation_workflow
    test_rejection_workflow
    test_analytics_workflow

    cleanup

    echo ""
    echo "======================================================================"
    echo "  Test Summary"
    echo "======================================================================"
    echo "Tests run:    $TESTS_RUN"
    echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        echo ""
        echo -e "${GREEN}✓ All E2E tests passed!${NC}"
        COVERAGE_PERCENT=$(echo "scale=2; ($TESTS_PASSED / $TESTS_RUN) * 100" | bc)
        echo "Test Coverage: ${COVERAGE_PERCENT}%"
        exit 0
    else
        echo ""
        echo -e "${RED}✗ Some E2E tests failed${NC}"
        exit 1
    fi
}

main
