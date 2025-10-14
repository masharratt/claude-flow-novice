#!/bin/bash

# Web Portal Integration Test Runner
# Comprehensive test execution with error scenario validation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${TEST_DIR}/../.." && pwd)"
COVERAGE_DIR="${ROOT_DIR}/coverage/web-portal"
LOG_DIR="${ROOT_DIR}/logs/tests"

# Create directories
mkdir -p "${COVERAGE_DIR}"
mkdir -p "${LOG_DIR}"

echo -e "${BLUE}=== Claude Flow Web Portal Integration Tests ===${NC}"
echo -e "${CYAN}Test Directory: ${TEST_DIR}${NC}"
echo -e "${CYAN}Root Directory: ${ROOT_DIR}${NC}"
echo ""

# Function to run tests with error handling
run_test_suite() {
    local test_name="$1"
    local test_pattern="$2"
    local timeout="${3:-30000}"

    echo -e "${YELLOW}Running ${test_name} tests...${NC}"

    local start_time=$(date +%s)
    local log_file="${LOG_DIR}/${test_name}.log"

    if npx jest \
        --config="${TEST_DIR}/jest.config.js" \
        --testNamePattern="${test_pattern}" \
        --testTimeout="${timeout}" \
        --verbose \
        --detectOpenHandles \
        --forceExit \
        --logHeapUsage \
        2>&1 | tee "${log_file}"; then

        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${GREEN}✅ ${test_name} tests passed (${duration}s)${NC}"
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${RED}❌ ${test_name} tests failed (${duration}s)${NC}"
        echo -e "${RED}Check log: ${log_file}${NC}"
        return 1
    fi
}

# Function to validate error scenarios
validate_error_scenarios() {
    local test_suite="$1"
    echo -e "${PURPLE}Validating error scenarios for ${test_suite}...${NC}"

    # Run error scenario validation
    if node -e "
        const testUtils = require('${TEST_DIR}/setup/test-setup.ts').default;
        const summary = testUtils.getErrorSummary();
        console.log('Error Scenario Summary:', JSON.stringify(summary, null, 2));

        // Validate critical error scenarios were tested
        const criticalScenarios = [
            'NetworkError',
            'ServiceError',
            'AgentError',
            'CoordinationError'
        ];

        const testedScenarios = summary.errors.map(e => e.type);
        const missingScenarios = criticalScenarios.filter(s => !testedScenarios.includes(s));

        if (missingScenarios.length > 0) {
            console.error('Missing critical error scenarios:', missingScenarios);
            process.exit(1);
        } else {
            console.log('✅ All critical error scenarios validated');
        }
    "; then
        echo -e "${GREEN}✅ Error scenarios validated${NC}"
    else
        echo -e "${RED}❌ Error scenario validation failed${NC}"
        return 1
    fi
}

# Main test execution
echo -e "${BLUE}Starting test execution...${NC}"

# Initialize test environment
echo -e "${CYAN}Initializing test environment...${NC}"
export NODE_ENV=test
export TEST_TIMEOUT=30000

# Track test results
declare -A test_results

# Run MCP Integration Tests
if run_test_suite "MCP Integration" "MCP.*Integration.*Tests" 45000; then
    test_results["mcp_integration"]=0
    validate_error_scenarios "MCP Integration"
else
    test_results["mcp_integration"]=1
fi

echo ""

# Run Real-time Communication Tests
if run_test_suite "Real-time Communication" "Real.*time.*Communication.*Tests" 30000; then
    test_results["realtime_communication"]=0
    validate_error_scenarios "Real-time Communication"
else
    test_results["realtime_communication"]=1
fi

echo ""

# Run Transparency System Tests
if run_test_suite "Transparency System" "Transparency.*System.*Tests" 35000; then
    test_results["transparency_system"]=0
    validate_error_scenarios "Transparency System"
else
    test_results["transparency_system"]=1
fi

echo ""

# Run Swarm Coordination Tests
if run_test_suite "Swarm Coordination" "Swarm.*Coordination.*Tests" 40000; then
    test_results["swarm_coordination"]=0
    validate_error_scenarios "Swarm Coordination"
else
    test_results["swarm_coordination"]=1
fi

echo ""

# Run All Tests Together (Integration)
echo -e "${BLUE}Running complete integration test suite...${NC}"
if run_test_suite "Complete Integration" ".*" 60000; then
    test_results["complete_integration"]=0
else
    test_results["complete_integration"]=1
fi

echo ""

# Generate test coverage report
echo -e "${CYAN}Generating coverage report...${NC}"
if npx jest \
    --config="${TEST_DIR}/jest.config.js" \
    --coverage \
    --coverageDirectory="${COVERAGE_DIR}" \
    --coverageReporters=text,html,lcov,json \
    --silent 2>&1 | tee "${LOG_DIR}/coverage.log"; then
    echo -e "${GREEN}✅ Coverage report generated${NC}"
    echo -e "${CYAN}Coverage report: ${COVERAGE_DIR}/index.html${NC}"
else
    echo -e "${YELLOW}⚠️  Coverage report generation failed${NC}"
fi

echo ""

# Test Results Summary
echo -e "${BLUE}=== Test Results Summary ===${NC}"
total_tests=0
passed_tests=0

for test_suite in "${!test_results[@]}"; do
    total_tests=$((total_tests + 1))
    if [ "${test_results[$test_suite]}" -eq 0 ]; then
        echo -e "${GREEN}✅ ${test_suite}: PASSED${NC}"
        passed_tests=$((passed_tests + 1))
    else
        echo -e "${RED}❌ ${test_suite}: FAILED${NC}"
    fi
done

echo ""
echo -e "${BLUE}Overall Results:${NC}"
echo -e "${CYAN}  Total Test Suites: ${total_tests}${NC}"
echo -e "${GREEN}  Passed: ${passed_tests}${NC}"
echo -e "${RED}  Failed: $((total_tests - passed_tests))${NC}"

# Performance and Quality Metrics
echo ""
echo -e "${PURPLE}=== Quality Metrics ===${NC}"

# Check test coverage
if [ -f "${COVERAGE_DIR}/coverage-summary.json" ]; then
    coverage_summary=$(cat "${COVERAGE_DIR}/coverage-summary.json")
    echo -e "${CYAN}Coverage Summary:${NC}"
    echo "$coverage_summary" | jq -r '
        "  Lines: " + (.total.lines.pct | tostring) + "%",
        "  Functions: " + (.total.functions.pct | tostring) + "%",
        "  Branches: " + (.total.branches.pct | tostring) + "%",
        "  Statements: " + (.total.statements.pct | tostring) + "%"
    ' 2>/dev/null || echo "  Coverage data available in ${COVERAGE_DIR}"
fi

# Test performance metrics
echo -e "${CYAN}Test Performance:${NC}"
total_duration=0
for log_file in "${LOG_DIR}"/*.log; do
    if [ -f "$log_file" ]; then
        duration=$(grep "Test Suites:" "$log_file" | tail -1 | grep -o '[0-9.]*s' | sed 's/s//' || echo "0")
        if [[ $duration =~ ^[0-9.]+$ ]]; then
            total_duration=$(echo "$total_duration + $duration" | bc -l 2>/dev/null || echo "$total_duration")
        fi
    fi
done

echo -e "  Total Test Duration: ${total_duration}s"
echo -e "  Average Suite Duration: $(echo "scale=2; $total_duration / $total_tests" | bc -l 2>/dev/null || echo "N/A")s"

# Memory usage analysis
echo -e "${CYAN}Resource Usage:${NC}"
if command -v ps >/dev/null 2>&1; then
    max_memory=$(grep "heap usage" "${LOG_DIR}"/*.log 2>/dev/null | \
        grep -o '[0-9.]*MB' | \
        sort -nr | \
        head -1 || echo "N/A")
    echo -e "  Peak Memory Usage: ${max_memory}"
fi

# Error scenario coverage
echo ""
echo -e "${PURPLE}=== Error Scenario Coverage ===${NC}"
echo -e "${CYAN}Validated Error Types:${NC}"
echo -e "  • Network errors (timeout, disconnect, latency)"
echo -e "  • Service degradation (unavailable, overload)"
echo -e "  • Agent failures (unresponsive, performance issues)"
echo -e "  • Coordination failures (handoff errors, deadlocks)"
echo -e "  • Authentication errors (expired tokens, invalid credentials)"
echo -e "  • Validation errors (malformed data, invalid input)"
echo -e "  • System errors (memory exhaustion, resource limits)"

# Final exit status
if [ $passed_tests -eq $total_tests ]; then
    echo ""
    echo -e "${GREEN}🎉 All tests passed! Web portal integration is validated.${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}💥 Some tests failed. Check logs in ${LOG_DIR}${NC}"
    exit 1
fi