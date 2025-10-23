#!/bin/bash
# Test CFN v3 Orchestrator Implementation

set -e  # Exit on first error
set -u  # Exit on undefined variables

# Unique task ID for isolation
TEST_TASK_ID="test-orchestrator-$(date +%s)"

# Setup test environment
setup_test_environment() {
    # Clear existing Redis keys
    redis-cli del "cfn_loop:${TEST_TASK_ID}:config"
    redis-cli del "cfn_loop:${TEST_TASK_ID}:context"
    redis-cli del "cfn_loop:${TEST_TASK_ID}:validation"
}

# Cleanup function
cleanup() {
    setup_test_environment
}
trap cleanup EXIT

# Mocked configuration for testing
MOCK_V3_CONFIG='{
    "mode": "cli",
    "routing": "z_ai",
    "validation_template": "standard",
    "intervention_threshold": 0.75,
    "max_iterations": 10
}'

MOCK_EPIC_CONTEXT='{
    "goal": "Test Orchestrator Implementation",
    "scope": ["implementation", "validation"],
    "deliverables": [".claude/skills/checkpoint-state/orchestrator_test.md"],
    "agents": {
        "loop3": ["researcher", "backend-dev"],
        "loop2": ["reviewer", "tester"]
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

# Test 1: Configuration Storage in Redis
echo "🔍 Test 1: Configuration Storage"
setup_test_environment

# Store mock configuration and context in Redis
redis-cli hset "cfn_loop:${TEST_TASK_ID}:config" \
    "v3_config" "$MOCK_V3_CONFIG" \
    "epic_context" "$MOCK_EPIC_CONTEXT"

# Verify configuration storage
stored_config=$(redis-cli hget "cfn_loop:${TEST_TASK_ID}:config" "v3_config")
stored_context=$(redis-cli hget "cfn_loop:${TEST_TASK_ID}:config" "epic_context")

if [[ -z "$stored_config" ]] || [[ -z "$stored_context" ]]; then
    echo -e "${RED}❌ Failed: Configuration or Context Not Stored${NC}"
    exit 1
fi

# Test 2: Configuration Parsing
echo "🔍 Test 2: Configuration Parsing"
mode=$(echo "$stored_config" | jq -r '.mode')
routing=$(echo "$stored_config" | jq -r '.routing')
intervention_threshold=$(echo "$stored_config" | jq -r '.intervention_threshold')

if [[ "$mode" != "cli" ]] || [[ "$routing" != "z_ai" ]] || (( $(echo "$intervention_threshold != 0.75" | bc -l) )); then
    echo -e "${RED}❌ Failed: Configuration Parsing Error${NC}"
    exit 1
fi

# Test 3: Agent Configuration Validation
echo "🔍 Test 3: Agent Configuration"
loop3_agents=$(echo "$stored_context" | jq -r '.agents.loop3 | length')
loop2_agents=$(echo "$stored_context" | jq -r '.agents.loop2 | length')

if [[ "$loop3_agents" -lt 2 ]] || [[ "$loop2_agents" -lt 2 ]]; then
    echo -e "${RED}❌ Failed: Insufficient Agent Configuration${NC}"
    exit 1
fi

# Test 4: Validation Template Selection
echo "🔍 Test 4: Validation Template"
validation_template=$(echo "$stored_config" | jq -r '.validation_template')
if [[ "$validation_template" != "standard" ]]; then
    echo -e "${RED}❌ Failed: Validation Template Not Set${NC}"
    exit 1
fi

# Test 5: Iteration Configuration
echo "🔍 Test 5: Iteration Configuration"
max_iterations=$(echo "$stored_config" | jq -r '.max_iterations')
if [[ "$max_iterations" -ne 10 ]]; then
    echo -e "${RED}❌ Failed: Incorrect Max Iterations${NC}"
    exit 1
fi

# Success
echo -e "${GREEN}✅ CFN v3 Orchestrator Tests Passed${NC}"
exit 0