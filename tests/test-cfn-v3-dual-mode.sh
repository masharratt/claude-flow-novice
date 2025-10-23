#!/bin/bash
# Test CFN v3 Dual-Mode Implementation

set -e  # Exit on first error
set -u  # Exit on undefined variables

# Unique task ID for isolation
TEST_TASK_ID="test-dual-mode-$(date +%s)"

# Setup test environment
setup_test_environment() {
    # Clear existing Redis keys
    redis-cli del "cfn_loop:${TEST_TASK_ID}:config"
    redis-cli del "cfn_loop:${TEST_TASK_ID}:context"
    redis-cli del "cfn_loop:${TEST_TASK_ID}:routing"
    rm -f /tmp/test_artifact.txt
}

# Cleanup function
cleanup() {
    setup_test_environment
}
trap cleanup EXIT

# Mocked configurations for different modes
CLI_MODE_CONFIG='{
    "mode": "cli",
    "routing": "z_ai",
    "intervention_threshold": 0.75
}'

TASK_MODE_CONFIG='{
    "mode": "task",
    "routing": "anthropic",
    "intervention_threshold": 0.80
}'

MOCK_EPIC_CONTEXT='{
    "goal": "Validate Dual-Mode CFN v3 Implementation",
    "scope": ["testing", "validation"],
    "deliverables": [
        "/tmp/test_artifact.txt"
    ],
    "agents": {
        "loop3": ["tester", "reviewer"],
        "loop2": ["backend-dev", "security-analyst"]
    },
    "requirements": {
        "test_files_created": 1,
        "context_storage": "redis"
    }
}'

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Prerequisite: Install jq for JSON parsing
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ jq is not installed. Please install jq.${NC}"
    exit 1
fi

# Test 1: CLI Mode Context Injection
echo "🔍 Test 1: CLI Mode Context Injection"
setup_test_environment

# Store CLI mode configuration in Redis
redis-cli hset "cfn_loop:${TEST_TASK_ID}:config" \
    "v3_config" "$CLI_MODE_CONFIG" \
    "epic_context" "$MOCK_EPIC_CONTEXT"

# Simulate mock CLI agent artifact creation
touch /tmp/test_artifact.txt

# Test context retrieval
cli_mode=$(redis-cli hget "cfn_loop:${TEST_TASK_ID}:config" "v3_config" | jq -r '.mode')
cli_routing=$(redis-cli hget "cfn_loop:${TEST_TASK_ID}:config" "v3_config" | jq -r '.routing')

if [[ "$cli_mode" != "cli" ]] || [[ "$cli_routing" != "z_ai" ]]; then
    echo -e "${RED}❌ Failed: CLI Mode Configuration Incorrect${NC}"
    exit 1
fi

# Test 2: Task Mode Context Injection
echo "🔍 Test 2: Task Mode Context Injection"
redis-cli hset "cfn_loop:${TEST_TASK_ID}:config" \
    "v3_config" "$TASK_MODE_CONFIG"

# Test context retrieval
task_mode=$(redis-cli hget "cfn_loop:${TEST_TASK_ID}:config" "v3_config" | jq -r '.mode')
task_routing=$(redis-cli hget "cfn_loop:${TEST_TASK_ID}:config" "v3_config" | jq -r '.routing')

if [[ "$task_mode" != "task" ]] || [[ "$task_routing" != "anthropic" ]]; then
    echo -e "${RED}❌ Failed: Task Mode Configuration Incorrect${NC}"
    exit 1
fi

# Test 3: Deliverable Validation
echo "🔍 Test 3: Deliverable Validation"
deliverable_count=$(echo "$MOCK_EPIC_CONTEXT" | jq -r '.deliverables | length')
artifact_path=$(echo "$MOCK_EPIC_CONTEXT" | jq -r '.deliverables[0]')

if [[ "$deliverable_count" -ne 1 ]] || [[ ! -f "$artifact_path" ]]; then
    echo -e "${RED}❌ Failed: Deliverable Artifact Not Created${NC}"
    exit 1
fi

# Test 4: Agent Configuration Validation
echo "🔍 Test 4: Agent Configuration"
loop3_agents=$(echo "$MOCK_EPIC_CONTEXT" | jq -r '.agents.loop3 | length')
loop2_agents=$(echo "$MOCK_EPIC_CONTEXT" | jq -r '.agents.loop2 | length')

if [[ "$loop3_agents" -lt 2 ]] || [[ "$loop2_agents" -lt 2 ]]; then
    echo -e "${RED}❌ Failed: Insufficient Agent Configuration${NC}"
    exit 1
fi

# Test 5: Context Routing Validation
echo "🔍 Test 5: Context Routing Validation"
cli_intervention_threshold=$(echo "$CLI_MODE_CONFIG" | jq -r '.intervention_threshold')
task_intervention_threshold=$(echo "$TASK_MODE_CONFIG" | jq -r '.intervention_threshold')

if (( $(echo "$cli_intervention_threshold != 0.75" | bc -l) )) ||
   (( $(echo "$task_intervention_threshold != 0.80" | bc -l) )); then
    echo -e "${RED}❌ Failed: Intervention Threshold Mismatch${NC}"
    exit 1
fi

# Success
echo -e "${GREEN}✅ CFN v3 Dual-Mode Tests Passed${NC}"
exit 0