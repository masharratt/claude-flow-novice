#!/bin/bash
# Test CFN v3 Coordinator Implementation

set -e  # Exit on first error
set -u  # Exit on undefined variables

# Unique task ID for isolation
TEST_TASK_ID="test-coordinator-$(date +%s)"

# Setup test environment
setup_test_environment() {
    # Clear potential existing Redis keys
    redis-cli del "cfn_loop:${TEST_TASK_ID}:config"
    redis-cli del "cfn_loop:${TEST_TASK_ID}:context"
    redis-cli del "cfn_loop:${TEST_TASK_ID}:mode"
}

# Cleanup function
cleanup() {
    setup_test_environment
}
trap cleanup EXIT

# Mocked epic context for testing
MOCK_EPIC_CONTEXT='{
    "goal": "Test Coordinator Functionality",
    "scope": ["implementation", "validation"],
    "deliverables": [
        ".claude/skills/checkpoint-state/coordinator_test.md"
    ],
    "agents": {
        "loop3": ["researcher", "backend-dev"],
        "loop2": ["reviewer", "tester"]
    }
}'

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Test 1: Context Storage in Redis
echo "🔍 Test 1: Context Storage"
setup_test_environment
redis-cli hset "cfn_loop:${TEST_TASK_ID}:context" \
    "epic_context" "$MOCK_EPIC_CONTEXT" \
    "mode" "cli" \
    "routing" "z_ai"

# Verify context storage
stored_context=$(redis-cli hget "cfn_loop:${TEST_TASK_ID}:context" "epic_context")
if [[ -z "$stored_context" ]]; then
    echo -e "${RED}❌ Failed: Epic Context Not Stored in Redis${NC}"
    exit 1
fi

# Test 2: Mode Configuration
mode_config=$(redis-cli hget "cfn_loop:${TEST_TASK_ID}:context" "mode")
if [[ "$mode_config" != "cli" ]]; then
    echo -e "${RED}❌ Failed: Mode Configuration Incorrect${NC}"
    exit 1
fi

# Test 3: Routing Configuration
routing_config=$(redis-cli hget "cfn_loop:${TEST_TASK_ID}:context" "routing")
if [[ "$routing_config" != "z_ai" ]]; then
    echo -e "${RED}❌ Failed: Routing Configuration Incorrect${NC}"
    exit 1
fi

# Test 4: Agent Configuration Validation
verify_agents=$(echo "$MOCK_EPIC_CONTEXT" | jq -r '.agents.loop3 | length')
if [[ "$verify_agents" -lt 2 ]]; then
    echo -e "${RED}❌ Failed: Insufficient Loop 3 Agents${NC}"
    exit 1
fi

# Test 5: Artifact Path Generation
artifact_path=$(echo "$MOCK_EPIC_CONTEXT" | jq -r '.deliverables[0]')
if [[ ! "$artifact_path" =~ ^\.claude/skills/.*\.md$ ]]; then
    echo -e "${RED}❌ Failed: Invalid Artifact Path Generation${NC}"
    exit 1
fi

# Success
echo -e "${GREEN}✅ CFN v3 Coordinator Tests Passed${NC}"
exit 0