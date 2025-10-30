#!/usr/bin/env bash
# test-tag-extraction.sh - Integration test for extract-tags.sh
# Part of ACE System Phase 2.1

set -euo pipefail

PROJECT_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice"
SKILL_PATH="$PROJECT_ROOT/.claude/skills/cfn-ace-system/extract-tags.sh"
TEST_RESULTS=()
PASS_COUNT=0
FAIL_COUNT=0

# ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test helper functions
assert_json_field() {
    local result="$1"
    local field="$2"
    local expected="$3"
    local actual=$(echo "$result" | jq -r ".$field")

    if [[ "$actual" == "$expected" ]]; then
        echo -e "${GREEN}✓${NC} Field '$field' = '$expected'"
        return 0
    else
        echo -e "${RED}✗${NC} Field '$field' = '$actual' (expected: '$expected')"
        return 1
    fi
}

assert_array_contains() {
    local result="$1"
    local field="$2"
    local value="$3"

    if echo "$result" | jq -e ".$field | contains([\"$value\"])" > /dev/null; then
        echo -e "${GREEN}✓${NC} Array '$field' contains '$value'"
        return 0
    else
        echo -e "${RED}✗${NC} Array '$field' does not contain '$value'"
        return 1
    fi
}

assert_tag_count_in_range() {
    local result="$1"
    local min="$2"
    local max="$3"
    local count=$(echo "$result" | jq -r '.tag_count')

    if [[ $count -ge $min ]] && [[ $count -le $max ]]; then
        echo -e "${GREEN}✓${NC} Tag count $count is in range [$min, $max]"
        return 0
    else
        echo -e "${RED}✗${NC} Tag count $count is out of range [$min, $max]"
        return 1
    fi
}

run_test() {
    local test_name="$1"
    echo ""
    echo -e "${YELLOW}[TEST]${NC} $test_name"
    echo "----------------------------------------"
}

pass_test() {
    local test_name="$1"
    echo -e "${GREEN}[PASS]${NC} $test_name"
    TEST_RESULTS+=("PASS: $test_name")
    ((PASS_COUNT++))
}

fail_test() {
    local test_name="$1"
    echo -e "${RED}[FAIL]${NC} $test_name"
    TEST_RESULTS+=("FAIL: $test_name")
    ((FAIL_COUNT++))
}

# Test 1: Authentication task with security focus
run_test "Test 1: JWT Authentication (Security Focus)"
RESULT=$(bash "$SKILL_PATH" \
    --task-description "Implement JWT authentication with token refresh and secure password hashing" \
    --files "src/auth/jwt.ts,src/auth/password.ts,tests/auth.test.ts" \
    --agents "backend-dev,security-specialist" \
    --output json)

if assert_array_contains "$RESULT" "tags" "jwt" && \
   assert_array_contains "$RESULT" "tags" "authentication" && \
   assert_array_contains "$RESULT" "domains" "security" && \
   assert_array_contains "$RESULT" "agents" "security-specialist" && \
   assert_tag_count_in_range "$RESULT" 5 15; then
    pass_test "Test 1"
else
    fail_test "Test 1"
fi

# Test 2: DevOps task with Docker/Kubernetes
run_test "Test 2: Docker + Kubernetes Deployment"
RESULT=$(bash "$SKILL_PATH" \
    --task-description "Build Docker container for Python microservice with Kubernetes deployment" \
    --files "Dockerfile,k8s/deployment.yaml,src/app.py" \
    --agents "devops,backend-dev" \
    --output json)

if assert_array_contains "$RESULT" "tags" "docker" && \
   assert_array_contains "$RESULT" "tags" "kubernetes" && \
   assert_array_contains "$RESULT" "domains" "devops" && \
   assert_array_contains "$RESULT" "file_tags" "python" && \
   assert_tag_count_in_range "$RESULT" 5 15; then
    pass_test "Test 2"
else
    fail_test "Test 2"
fi

# Test 3: Frontend task with React
run_test "Test 3: Frontend Dashboard (React)"
RESULT=$(bash "$SKILL_PATH" \
    --task-description "Create responsive dashboard with real-time data visualization using React" \
    --files "src/components/Dashboard.tsx,src/styles/dashboard.css" \
    --agents "frontend-dev,designer" \
    --output json)

if assert_array_contains "$RESULT" "tags" "react" && \
   assert_array_contains "$RESULT" "tags" "dashboard" && \
   assert_array_contains "$RESULT" "domains" "frontend" && \
   assert_array_contains "$RESULT" "file_tags" "typescript" && \
   assert_tag_count_in_range "$RESULT" 5 15; then
    pass_test "Test 3"
else
    fail_test "Test 3"
fi

# Test 4: Minimal input (edge case)
run_test "Test 4: Minimal Input (Edge Case)"
RESULT=$(bash "$SKILL_PATH" \
    --task-description "Fix bug" \
    --output json)

if assert_tag_count_in_range "$RESULT" 2 15; then
    pass_test "Test 4"
else
    fail_test "Test 4"
fi

# Test 5: Testing-focused task
run_test "Test 5: Testing Infrastructure"
RESULT=$(bash "$SKILL_PATH" \
    --task-description "Create comprehensive test suite with coverage reporting" \
    --files "tests/unit/auth.test.ts,tests/integration/api.test.ts,jest.config.js" \
    --agents "tester,qa-specialist" \
    --output json)

if assert_array_contains "$RESULT" "tags" "test" && \
   assert_array_contains "$RESULT" "domains" "testing" && \
   assert_array_contains "$RESULT" "agents" "tester" && \
   assert_tag_count_in_range "$RESULT" 5 15; then
    pass_test "Test 5"
else
    fail_test "Test 5"
fi

# Test 6: Database task
run_test "Test 6: Database Schema + Migration"
RESULT=$(bash "$SKILL_PATH" \
    --task-description "Design database schema with migration scripts for user authentication" \
    --files "migrations/001_users.sql,models/user.ts,database/schema.sql" \
    --agents "backend-dev,database-specialist" \
    --output json)

if assert_array_contains "$RESULT" "tags" "database" && \
   assert_array_contains "$RESULT" "domains" "database" && \
   assert_tag_count_in_range "$RESULT" 5 15; then
    pass_test "Test 6"
else
    fail_test "Test 6"
fi

# Test 7: Multi-domain task (API + Security + Testing)
run_test "Test 7: Multi-Domain Task (API + Security + Testing)"
RESULT=$(bash "$SKILL_PATH" \
    --task-description "Implement REST API with OAuth2 authentication and comprehensive test coverage" \
    --files "src/api/routes.ts,src/auth/oauth.ts,tests/api.test.ts,docs/API.md" \
    --agents "backend-dev,security-specialist,tester" \
    --output json)

if assert_array_contains "$RESULT" "domains" "api" && \
   assert_array_contains "$RESULT" "domains" "security" && \
   assert_array_contains "$RESULT" "domains" "testing" && \
   assert_tag_count_in_range "$RESULT" 5 15; then
    pass_test "Test 7"
else
    fail_test "Test 7"
fi

# Test 8: Text output format
run_test "Test 8: Text Output Format"
RESULT=$(bash "$SKILL_PATH" \
    --task-description "Simple task" \
    --output text)

if echo "$RESULT" | grep -q "Tags:" && \
   echo "$RESULT" | grep -q "Keywords:" && \
   echo "$RESULT" | grep -q "Domains:" && \
   echo "$RESULT" | grep -q "Tag Count:"; then
    echo -e "${GREEN}✓${NC} Text output contains expected fields"
    pass_test "Test 8"
else
    echo -e "${RED}✗${NC} Text output missing expected fields"
    fail_test "Test 8"
fi

# Test 9: Domain inference from keywords only (no files)
run_test "Test 9: Domain Inference from Keywords (No Files)"
RESULT=$(bash "$SKILL_PATH" \
    --task-description "Deploy Docker container to Kubernetes cluster with monitoring" \
    --output json)

if assert_array_contains "$RESULT" "domains" "devops"; then
    pass_test "Test 9"
else
    fail_test "Test 9"
fi

# Test 10: Custom tag count limits
run_test "Test 10: Custom Min/Max Tag Limits"
RESULT=$(bash "$SKILL_PATH" \
    --task-description "Implement feature with many keywords: authentication authorization security jwt oauth2 token refresh cache redis database postgresql" \
    --min-tags 3 \
    --max-tags 8 \
    --output json)

if assert_tag_count_in_range "$RESULT" 3 8; then
    pass_test "Test 10"
else
    fail_test "Test 10"
fi

# Summary
echo ""
echo "========================================"
echo "TEST SUMMARY"
echo "========================================"
echo -e "Total: $((PASS_COUNT + FAIL_COUNT))"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
echo -e "${RED}Failed: $FAIL_COUNT${NC}"
echo ""

for result in "${TEST_RESULTS[@]}"; do
    if [[ "$result" =~ ^PASS ]]; then
        echo -e "${GREEN}✓${NC} $result"
    else
        echo -e "${RED}✗${NC} $result"
    fi
done

echo ""
if [[ $FAIL_COUNT -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
fi
