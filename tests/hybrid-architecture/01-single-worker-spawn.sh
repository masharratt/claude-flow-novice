#!/usr/bin/env bash
set -uo pipefail

# Test: Single Worker Spawn with Hybrid Routing Validation
# Sprint: 1.3 - Hybrid Routing Validation Tests
# Epic: AI Organizational Architecture - Hybrid from Start
# Phase: 1 - Infrastructure Templates & Hybrid Routing Setup

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test configuration
TEST_NAME="01-single-worker-spawn"
TEST_TEAM="engineering"
TEST_COMPLEXITY="simple"
TEST_TASK="Validate hybrid routing configuration"

# Output colors
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m" # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0

echo "======================================"
echo "Test: Single Worker Spawn Validation"
echo "======================================"
echo ""

# Test 1: Validate spawn-worker.sh exists
echo "[TEST 1] Validate spawn-worker.sh script exists"
SPAWN_WORKER_SCRIPT="${PROJECT_ROOT}/.claude/skills/cfn-agent-spawning/spawn-worker.sh"

if [[ -f "$SPAWN_WORKER_SCRIPT" ]]; then
    echo -e "${GREEN}✓ PASS${NC} - spawn-worker.sh found at $SPAWN_WORKER_SCRIPT"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - spawn-worker.sh not found at $SPAWN_WORKER_SCRIPT"
    ((TESTS_FAILED++))
fi
echo ""

# Test 2: Validate team-providers.json configuration
echo "[TEST 2] Validate team-providers.json configuration"
PROVIDERS_CONFIG="${PROJECT_ROOT}/.claude/cfn-config/team-providers.json"

if [[ -f "$PROVIDERS_CONFIG" ]]; then
    echo -e "${GREEN}✓ PASS${NC} - team-providers.json found"

    # Validate JSON structure
    if jq empty "$PROVIDERS_CONFIG" 2>/dev/null; then
        echo -e "${GREEN}✓ PASS${NC} - Valid JSON structure"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC} - Invalid JSON structure"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}✗ FAIL${NC} - team-providers.json not found at $PROVIDERS_CONFIG"
    ((TESTS_FAILED++))
fi
echo ""

# Test 3: Validate engineering team configuration
echo "[TEST 3] Validate engineering team hybrid routing configuration"

COORDINATOR_PROVIDER=$(jq -r ".teams.${TEST_TEAM}.coordinator.provider" "$PROVIDERS_CONFIG")
WORKER_PROVIDER=$(jq -r ".teams.${TEST_TEAM}.workers.provider" "$PROVIDERS_CONFIG")

echo "  - Coordinator Provider: $COORDINATOR_PROVIDER"
echo "  - Worker Provider: $WORKER_PROVIDER"

if [[ "$COORDINATOR_PROVIDER" == "anthropic" && "$WORKER_PROVIDER" == "zai" ]]; then
    echo -e "${GREEN}✓ PASS${NC} - Hybrid routing configured (Anthropic coordinator, Z.ai workers)"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - Hybrid routing misconfigured"
    ((TESTS_FAILED++))
fi
echo ""

# Test 4: Validate worker model selection
echo "[TEST 4] Validate worker model selection for complexity: $TEST_COMPLEXITY"

SELECTED_MODEL=$(jq -r ".teams.${TEST_TEAM}.workers.models.${TEST_COMPLEXITY}" "$PROVIDERS_CONFIG")
echo "  - Selected Model: $SELECTED_MODEL"

if [[ "$SELECTED_MODEL" == "claude-3-5-haiku-20241022" ]]; then
    echo -e "${GREEN}✓ PASS${NC} - Correct model selected for simple complexity"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - Incorrect model selection"
    ((TESTS_FAILED++))
fi
echo ""

# Test 5: Validate API key environment variables
echo "[TEST 5] Validate API key environment variable configuration"

COORDINATOR_API_KEY_VAR=$(jq -r ".teams.${TEST_TEAM}.coordinator.apiKeyEnvVar" "$PROVIDERS_CONFIG")
WORKER_API_KEY_VAR=$(jq -r ".teams.${TEST_TEAM}.workers.apiKeyEnvVar" "$PROVIDERS_CONFIG")

echo "  - Coordinator API Key Var: $COORDINATOR_API_KEY_VAR"
echo "  - Worker API Key Var: $WORKER_API_KEY_VAR"

if [[ "$COORDINATOR_API_KEY_VAR" == "ANTHROPIC_API_KEY" && "$WORKER_API_KEY_VAR" == "ZAI_API_KEY" ]]; then
    echo -e "${GREEN}✓ PASS${NC} - API key environment variables correctly configured"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - API key environment variables misconfigured"
    ((TESTS_FAILED++))
fi
echo ""

# Test 6: Check if API keys are set in environment
echo "[TEST 6] Verify API keys are set in environment"

if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    echo -e "${GREEN}✓ PASS${NC} - ANTHROPIC_API_KEY is set"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}⚠ WARN${NC} - ANTHROPIC_API_KEY not set (may be expected in test environment)"
fi

if [[ -n "${ZAI_API_KEY:-}" ]]; then
    echo -e "${GREEN}✓ PASS${NC} - ZAI_API_KEY is set"
    ((TESTS_PASSED++))
else
    echo -e "${YELLOW}⚠ WARN${NC} - ZAI_API_KEY not set (may be expected in test environment)"
fi
echo ""

# Test 7: Validate spawn-worker.sh script functionality (dry-run)
echo "[TEST 7] Validate spawn-worker.sh script has required functions"

if grep -q "validate_provider_config" "$SPAWN_WORKER_SCRIPT"; then
    echo -e "${GREEN}✓ PASS${NC} - validate_provider_config function exists"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - validate_provider_config function not found"
    ((TESTS_FAILED++))
fi

if grep -q "select_model" "$SPAWN_WORKER_SCRIPT"; then
    echo -e "${GREEN}✓ PASS${NC} - select_model function exists"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - select_model function not found"
    ((TESTS_FAILED++))
fi

if grep -q "get_api_key" "$SPAWN_WORKER_SCRIPT"; then
    echo -e "${GREEN}✓ PASS${NC} - get_api_key function exists"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - get_api_key function not found"
    ((TESTS_FAILED++))
fi
echo ""

# Test 8: Validate routing strategy configuration
echo "[TEST 8] Validate routing strategy configuration"

ROUTING_STRATEGY=$(jq -r ".teams.${TEST_TEAM}.routing_strategy" "$PROVIDERS_CONFIG")
echo "  - Routing Strategy: $ROUTING_STRATEGY"

if [[ "$ROUTING_STRATEGY" == "performance" ]]; then
    echo -e "${GREEN}✓ PASS${NC} - Routing strategy configured for engineering team"
    ((TESTS_PASSED++))
else
    echo -e "${RED}✗ FAIL${NC} - Routing strategy misconfigured"
    ((TESTS_FAILED++))
fi
echo ""

# Test Summary
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

# Calculate confidence score
TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
if [[ $TOTAL_TESTS -gt 0 ]]; then
    CONFIDENCE=$(echo "scale=2; $TESTS_PASSED / $TOTAL_TESTS" | bc)
    echo "Confidence Score: $CONFIDENCE"
else
    CONFIDENCE="0.00"
    echo "Confidence Score: $CONFIDENCE (no tests executed)"
fi
echo ""

# Exit with appropriate code
if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}✓ All tests passed${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
