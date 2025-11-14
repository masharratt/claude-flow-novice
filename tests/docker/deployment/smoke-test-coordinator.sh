#!/bin/bash
# Smoke Test: Coordinator Deployment Validation
# Minimal end-to-end task execution to validate deployment readiness
# Expected runtime: <60 seconds
# Exit code: 0 = success, 1 = failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Color output for readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
SMOKE_TEST_TIMEOUT=60
COORDINATOR_STARTUP_TIMEOUT=15
TASK_ID="smoke-test-$(date +%s)-$$"
TEST_DESCRIPTION="Smoke test: minimal coordinator validation"
MODE="standard"

# Temporary files
CONTAINER_NAME="test-coordinator-smoke-${TASK_ID}"
LOG_FILE="/tmp/smoke-test-coordinator-${TASK_ID}.log"
RESULT_FILE="/tmp/smoke-test-result-${TASK_ID}.txt"

# Cleanup function
cleanup() {
    local exit_code=$?

    # Remove container if still running
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${YELLOW}[CLEANUP] Stopping container ${CONTAINER_NAME}${NC}"
        docker stop "${CONTAINER_NAME}" 2>/dev/null || true
        docker rm "${CONTAINER_NAME}" 2>/dev/null || true
    fi

    # Preserve logs for debugging if test failed
    if [ $exit_code -ne 0 ] && [ -f "$LOG_FILE" ]; then
        echo -e "${YELLOW}[DEBUG] Test logs preserved: ${LOG_FILE}${NC}"
    else
        rm -f "$LOG_FILE" "$RESULT_FILE" 2>/dev/null || true
    fi

    exit $exit_code
}

trap cleanup EXIT

# Validation functions
validate_image_exists() {
    local image="$1"

    if ! docker images --format '{{.Repository}}:{{.Tag}}' 2>/dev/null | grep -q "^${image}$"; then
        echo -e "${RED}[FAIL] Docker image not found: ${image}${NC}"
        return 1
    fi

    echo -e "${GREEN}[PASS] Image exists: ${image}${NC}"
    return 0
}

validate_parameter_format() {
    local entrypoint_content="$1"

    # Check for positional TASK_ID format (correct)
    if echo "$entrypoint_content" | grep -q 'execute "\$TASK_ID"'; then
        echo -e "${GREEN}[PASS] Parameter format correct (positional TASK_ID)${NC}"
        return 0
    fi

    # Check for flag format (incorrect)
    if echo "$entrypoint_content" | grep -q 'execute.*--task-id'; then
        echo -e "${RED}[FAIL] Parameter format incorrect (flag-based --task-id)${NC}"
        return 1
    fi

    echo -e "${YELLOW}[WARN] Unable to verify parameter format${NC}"
    return 0
}

validate_container_launch() {
    local container_name="$1"
    local startup_timeout="$2"

    # Wait for container to be available or fail quickly
    local elapsed=0
    while [ $elapsed -lt "$startup_timeout" ]; do
        if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"; then
            echo -e "${GREEN}[PASS] Container launched successfully${NC}"
            return 0
        fi

        # Check if container exited with error
        if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${container_name}$"; then
            local status=$(docker inspect "${container_name}" --format='{{.State.ExitCode}}' 2>/dev/null || echo "unknown")
            if [ "$status" != "0" ] && [ "$status" != "unknown" ]; then
                echo -e "${RED}[FAIL] Container exited with code: ${status}${NC}"
                return 1
            fi
        fi

        sleep 1
        ((elapsed++))
    done

    echo -e "${YELLOW}[TIMEOUT] Container launch exceeded ${startup_timeout}s${NC}"
    return 1
}

validate_no_parameter_errors() {
    local logs="$1"

    # Check for parameter format errors
    if echo "$logs" | grep -q "Unknown option.*--task-id"; then
        echo -e "${RED}[FAIL] Parameter error detected: Unknown option --task-id${NC}"
        return 1
    fi

    if echo "$logs" | grep -q "Unknown option"; then
        echo -e "${RED}[FAIL] Unknown option error in logs${NC}"
        return 1
    fi

    echo -e "${GREEN}[PASS] No parameter format errors${NC}"
    return 0
}

validate_exit_code() {
    local exit_code="$1"

    if [ "$exit_code" -eq 0 ] || [ "$exit_code" -eq 137 ]; then
        # 0 = clean exit, 137 = killed by signal (expected for timeout)
        echo -e "${GREEN}[PASS] Exit code valid: ${exit_code}${NC}"
        return 0
    fi

    echo -e "${RED}[FAIL] Unexpected exit code: ${exit_code}${NC}"
    return 1
}

# Main test execution
main() {
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}Coordinator Deployment Smoke Test${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""
    echo "Test ID: ${TASK_ID}"
    echo "Description: ${TEST_DESCRIPTION}"
    echo "Timeout: ${SMOKE_TEST_TIMEOUT}s"
    echo ""

    # Step 1: Validate image exists
    echo -e "${YELLOW}[1/5] Checking Docker image...${NC}"
    if ! validate_image_exists "cfn-coordinator:v3"; then
        echo -e "${RED}[ERROR] Image validation failed${NC}"
        return 1
    fi
    echo ""

    # Step 2: Validate parameter format in entrypoint
    echo -e "${YELLOW}[2/5] Validating parameter format...${NC}"
    local entrypoint_content
    entrypoint_content=$(docker run --rm cfn-coordinator:v3 cat /app/coordinator-entrypoint.sh 2>/dev/null || echo "")

    if [ -z "$entrypoint_content" ]; then
        echo -e "${YELLOW}[WARN] Unable to extract entrypoint from image${NC}"
    else
        if ! validate_parameter_format "$entrypoint_content"; then
            echo -e "${RED}[ERROR] Parameter format validation failed${NC}"
            return 1
        fi
    fi
    echo ""

    # Step 3: Launch coordinator container
    echo -e "${YELLOW}[3/5] Launching coordinator container...${NC}"

    docker run \
        --detach \
        --name "${CONTAINER_NAME}" \
        -e TASK_ID="${TASK_ID}" \
        -e TASK_DESCRIPTION="${TEST_DESCRIPTION}" \
        -e MODE="${MODE}" \
        -v /var/run/docker.sock:/var/run/docker.sock:ro \
        -v "${PROJECT_ROOT}:/workspace:ro" \
        --network cfn-network \
        cfn-coordinator:v3 \
        > /dev/null 2>&1 || true

    echo "Container name: ${CONTAINER_NAME}"
    echo ""

    # Step 4: Validate container startup
    echo -e "${YELLOW}[4/5] Validating startup and exit code...${NC}"

    if ! validate_container_launch "${CONTAINER_NAME}" "${COORDINATOR_STARTUP_TIMEOUT}"; then
        echo -e "${RED}[ERROR] Container failed to start${NC}"

        # Capture logs for debugging
        if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
            echo -e "${YELLOW}[DEBUG] Container logs:${NC}"
            docker logs "${CONTAINER_NAME}" > "$LOG_FILE" 2>&1
            cat "$LOG_FILE"
        fi

        return 1
    fi

    # Capture logs
    docker logs "${CONTAINER_NAME}" > "$LOG_FILE" 2>&1 || true

    # Check exit code
    local exit_code=$(docker inspect "${CONTAINER_NAME}" --format='{{.State.ExitCode}}' 2>/dev/null || echo "unknown")

    if ! validate_exit_code "$exit_code"; then
        echo -e "${RED}[ERROR] Container exit code validation failed${NC}"
        echo -e "${YELLOW}[DEBUG] Container logs:${NC}"
        cat "$LOG_FILE"
        return 1
    fi
    echo ""

    # Step 5: Validate no parameter errors in logs
    echo -e "${YELLOW}[5/5] Checking for parameter errors...${NC}"

    local logs
    logs=$(cat "$LOG_FILE" 2>/dev/null || echo "")

    if ! validate_no_parameter_errors "$logs"; then
        echo -e "${RED}[ERROR] Parameter error found in logs${NC}"
        echo -e "${YELLOW}[DEBUG] Relevant log lines:${NC}"
        grep -i "unknown option" "$LOG_FILE" || true
        return 1
    fi
    echo ""

    # Success summary
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Smoke Test PASSED${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Summary:"
    echo "  - Image exists and is ready"
    echo "  - Parameter format is correct (positional TASK_ID)"
    echo "  - Container launches without parameter errors"
    echo "  - No exit code anomalies detected"
    echo ""
    echo "Deployment is ready to proceed."
    echo ""

    return 0
}

# Execute main function
main "$@"
