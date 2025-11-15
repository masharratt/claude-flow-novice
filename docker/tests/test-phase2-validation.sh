#!/bin/bash
# Phase 2 Validation Test Suite
# Tests coordinator code, skills, and provisioning scripts without requiring Docker

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Logging functions
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Test function
run_test() {
    local test_name="$1"
    local test_command="$2"

    ((TESTS_RUN++))
    log_test "$test_name"

    if eval "$test_command" &>/dev/null; then
        log_pass "$test_name"
        return 0
    else
        log_fail "$test_name"
        return 1
    fi
}

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo ""
log_info "=== Phase 2 Validation Test Suite ==="
log_info "Project Root: $PROJECT_ROOT"
echo ""

# ============================================================================
# Test Category 1: Coordinator Code Validation
# ============================================================================
log_info "--- Category 1: Coordinator Code Validation ---"
echo ""

# Test 1.1: Main coordinator syntax
run_test "Main coordinator syntax validation" \
    "node --check docker/coordinator/main/coordinator.js"

# Test 1.2: Main coordinator entrypoint syntax
run_test "Main coordinator entrypoint syntax" \
    "bash -n docker/coordinator/main/entrypoint.sh"

# Test 1.3: Team coordinator syntax
run_test "Team coordinator syntax validation" \
    "node --check docker/coordinator/team/coordinator.js"

# Test 1.4: Team coordinator entrypoint syntax
run_test "Team coordinator entrypoint syntax" \
    "bash -n docker/coordinator/team/entrypoint.sh"

# Test 1.5: Main coordinator package.json validity
run_test "Main coordinator package.json validity" \
    "node -e \"JSON.parse(require('fs').readFileSync('docker/coordinator/main/package.json'))\""

# Test 1.6: Team coordinator package.json validity
run_test "Team coordinator package.json validity" \
    "node -e \"JSON.parse(require('fs').readFileSync('docker/coordinator/team/package.json'))\""

echo ""

# ============================================================================
# Test Category 2: Dockerfile Validation
# ============================================================================
log_info "--- Category 2: Dockerfile Validation ---"
echo ""

# Test 2.1: Main coordinator Dockerfile exists
run_test "Main coordinator Dockerfile exists" \
    "test -f docker/Dockerfile.main-coordinator"

# Test 2.2: Team coordinator Dockerfile exists
run_test "Team coordinator Dockerfile exists" \
    "test -f docker/Dockerfile.team-coordinator"

# Test 2.3: Main coordinator Dockerfile has valid syntax (basic check)
run_test "Main coordinator Dockerfile syntax" \
    "grep -q '^FROM node:20-slim' docker/Dockerfile.main-coordinator"

# Test 2.4: Team coordinator Dockerfile has valid syntax
run_test "Team coordinator Dockerfile syntax" \
    "grep -q '^FROM node:20-slim' docker/Dockerfile.team-coordinator"

# Test 2.5: Main coordinator uses non-root user
run_test "Main coordinator non-root user" \
    "grep -q 'USER cfnagent' docker/Dockerfile.main-coordinator"

# Test 2.6: Team coordinator uses non-root user
run_test "Team coordinator non-root user" \
    "grep -q 'USER cfnagent' docker/Dockerfile.team-coordinator"

echo ""

# ============================================================================
# Test Category 3: Skill Scripts Validation
# ============================================================================
log_info "--- Category 3: Skill Scripts Validation ---"
echo ""

# Test 3.1: Database readonly skill exists
run_test "Database readonly skill exists" \
    "test -f docker/skills/database-readonly/query.sh"

# Test 3.2: Database readwrite skill exists
run_test "Database readwrite skill exists" \
    "test -f docker/skills/database-readwrite/query.sh"

# Test 3.3: Readonly query script syntax
run_test "Readonly query script syntax" \
    "bash -n docker/skills/database-readonly/query.sh"

# Test 3.4: Readwrite query script syntax
run_test "Readwrite query script syntax" \
    "bash -n docker/skills/database-readwrite/query.sh"

# Test 3.5: Readonly skill blocks write operations
log_test "Readonly skill blocks write operations"
((TESTS_RUN++))
if docker/skills/database-readonly/query.sh "INSERT INTO test VALUES (1)" 2>&1 | grep -q "Write operations are not allowed"; then
    log_pass "Readonly skill blocks write operations"
else
    log_fail "Readonly skill blocks write operations"
fi

# Test 3.6: Readwrite skill has migrate.sh
run_test "Readwrite skill has migrate.sh" \
    "test -f docker/skills/database-readwrite/migrate.sh"

echo ""

# ============================================================================
# Test Category 4: Team Configuration Validation
# ============================================================================
log_info "--- Category 4: Team Configuration Validation ---"
echo ""

TEAMS=("seo" "marketing" "frontend" "backend" "devops" "qa" "csuite")

for team in "${TEAMS[@]}"; do
    # Test 4.x: Team config exists
    run_test "Team config exists: $team" \
        "test -f docker/config/teams/${team}.yaml"

    # Test 4.x: Team config has valid YAML syntax
    run_test "Team config valid YAML: $team" \
        "yq eval '.' docker/config/teams/${team}.yaml > /dev/null 2>&1 || python3 -c \"import yaml; yaml.safe_load(open('docker/config/teams/${team}.yaml'))\""
done

echo ""

# ============================================================================
# Test Category 5: Automation Scripts Validation
# ============================================================================
log_info "--- Category 5: Automation Scripts Validation ---"
echo ""

# Test 5.1: Provisioning script exists
run_test "Provisioning script exists" \
    "test -f docker/scripts/provision-team.sh"

# Test 5.2: Provisioning script syntax
run_test "Provisioning script syntax" \
    "bash -n docker/scripts/provision-team.sh"

# Test 5.3: Deprovisioning script exists
run_test "Deprovisioning script exists" \
    "test -f docker/scripts/deprovision-team.sh"

# Test 5.4: Deprovisioning script syntax
run_test "Deprovisioning script syntax" \
    "bash -n docker/scripts/deprovision-team.sh"

# Test 5.5: Validation script exists
run_test "Validation script exists" \
    "test -f docker/scripts/validate-team-config.sh"

# Test 5.6: Validation script syntax
run_test "Validation script syntax" \
    "bash -n docker/scripts/validate-team-config.sh"

# Test 5.7: Network creation script exists
run_test "Network creation script exists" \
    "test -f docker/scripts/create-networks.sh"

# Test 5.8: Network creation script syntax
run_test "Network creation script syntax" \
    "bash -n docker/scripts/create-networks.sh"

# Test 5.9: Provision script dry-run (SEO team)
log_test "Provision script dry-run (SEO team)"
((TESTS_RUN++))
if docker/scripts/provision-team.sh seo --dry-run 2>&1 | grep -q "DRY RUN"; then
    log_pass "Provision script dry-run (SEO team)"
else
    log_fail "Provision script dry-run (SEO team)"
fi

# Test 5.10: Validate-team-config script (SEO team)
log_test "Validate team config script (SEO team)"
((TESTS_RUN++))
if docker/scripts/validate-team-config.sh docker/config/teams/seo.yaml 2>&1 | grep -q "Validation passed"; then
    log_pass "Validate team config script (SEO team)"
else
    log_fail "Validate team config script (SEO team)"
fi

echo ""

# ============================================================================
# Test Category 6: Documentation Validation
# ============================================================================
log_info "--- Category 6: Documentation Validation ---"
echo ""

# Test 6.1: Phase 1 README exists
run_test "Phase 1 README exists" \
    "test -f docker/PHASE_1_README.md"

# Test 6.2: SPARC requirements spec exists
run_test "SPARC requirements spec exists" \
    "test -f docker/docs/SPARC/CFN_DOCKER_INFRASTRUCTURE_REQUIREMENTS_SPEC.md"

# Test 6.3: Organizational architecture doc exists
run_test "Organizational architecture doc exists" \
    "test -f docker/docs/SPARC/CFN_DOCKER_ORGANIZATIONAL_ARCHITECTURE.md"

# Test 6.4: Team provisioning guide exists
run_test "Team provisioning guide exists" \
    "test -f docker/docs/SPARC/CFN_DOCKER_TEAM_PROVISIONING_GUIDE.md"

# Test 6.5: Scripts README exists
run_test "Scripts README exists" \
    "test -f docker/scripts/README.md"

echo ""

# ============================================================================
# Summary
# ============================================================================
log_info "=== Test Summary ==="
echo ""
log_info "Tests Run:    $TESTS_RUN"
log_pass "Tests Passed: $TESTS_PASSED"

if [ $TESTS_FAILED -gt 0 ]; then
    log_fail "Tests Failed: $TESTS_FAILED"
    echo ""
    exit 1
else
    echo ""
    log_pass "=== All Tests Passed ==="
    echo ""
    exit 0
fi
