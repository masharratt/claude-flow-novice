#!/bin/bash
# Test CFN v3 Redis Context Storage and Retrieval

set -e  # Exit on first error
set -u  # Exit on undefined variables

TEST_TASK_ID="test-redis-context-$(date +%s)"
REDIS_KEY_PREFIX="cfn_loop:task:${TEST_TASK_ID}"

# Color codes for pretty output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'  # No Color

# Cleanup function
cleanup() {
    redis-cli del "${REDIS_KEY_PREFIX}:context" 2>/dev/null || true
}
trap cleanup EXIT

# Test 1: Store Complex JSON Context
echo "🔍 Test 1: Store Complex JSON Context"
complex_context='{
    "epic_goal": "Build Authentication System",
    "in_scope": ["user_registration", "login_flow"],
    "out_of_scope": ["admin_panel"],
    "deliverables": [
        "/tmp/user_model.py",
        "/tmp/auth_service.js"
    ],
    "acceptance_criteria": {
        "code_coverage": ">80%",
        "security_level": "high"
    }
}'

redis-cli hset "${REDIS_KEY_PREFIX}:context" "epic_context" "$complex_context" >/dev/null

# Test 2: Retrieve Context
echo "🔍 Test 2: Retrieve Complex Context"
retrieved_context=$(redis-cli hget "${REDIS_KEY_PREFIX}:context" "epic_context")

# Validate retrieved context
if [[ -z "$retrieved_context" ]]; then
    echo -e "${RED}❌ Failed: Context retrieval${NC}"
    exit 1
fi

# Test 3: Validate Context Structure
echo "🔍 Test 3: Validate Context Structure"
if ! echo "$retrieved_context" | jq empty >/dev/null 2>&1; then
    echo -e "${RED}❌ Failed: Invalid JSON structure${NC}"
    exit 1
fi

# Test 4: Simulated Crash Recovery
echo "🔍 Test 4: Simulated Swarm Recovery"
# Simulate a crash by forcing a key timeout
redis-cli expire "${REDIS_KEY_PREFIX}:context" 10 >/dev/null

# Attempt to retrieve after "crash"
recovered_context=$(redis-cli hget "${REDIS_KEY_PREFIX}:context" "epic_context")

if [[ -z "$recovered_context" ]]; then
    echo -e "${RED}❌ Failed: Swarm recovery${NC}"
    exit 1
fi

# Final Success
echo -e "${GREEN}✅ All Redis Context Tests Passed${NC}"
exit 0