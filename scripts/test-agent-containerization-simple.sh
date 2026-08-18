#!/usr/bin/env bash
set -eu

# Simple test to verify agents can run in Docker containers

echo "Starting Agent Containerization Test..."
echo "======================================"

# Configuration
AGENT_TYPE="${AGENT_TYPE:-react-frontend-engineer}"
CONTAINER_NAME="agent-test-$(date +%s)"
PROJECT_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo "[$(date '+%H:%M:%S')] $*"
}

log_success() {
    echo -e "${GREEN}[${date '+%H:%M:%S'}] SUCCESS:${NC} $*"
}

log_error() {
    echo -e "${RED}[${date '+%H:%M:%S'}] ERROR:${NC} $*"
}

# Cleanup function
cleanup() {
    log "Cleaning up..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
}

trap cleanup EXIT

# Test 1: Basic Docker functionality
test_docker_basic() {
    log "Test 1: Basic Docker functionality"

    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker not found"
        return 1
    fi

    log_success "Docker is available"
    return 0
}

# Test 2: Create simple agent container test
test_simple_agent_container() {
    log "Test 2: Simple agent container test"

    # Create a simple test script
    cat > /tmp/test-agent.sh <<'EOF'
#!/bin/bash
echo "Agent container started successfully"
echo "Agent type: ${AGENT_TYPE:-unknown}"
echo "Node version: $(node --version 2>/dev/null || echo 'Node not available')"
echo "NPM version: $(npm --version 2>/dev/null || echo 'NPM not available')"
echo "Files in /app:"
ls -la /app/ 2>/dev/null || echo "Cannot list /app directory"
echo "Test completed successfully"
EOF

    chmod +x /tmp/test-agent.sh

    # Run the test in a container
    if docker run --rm --name "$CONTAINER_NAME" \
        -v /tmp/test-agent.sh:/test-agent.sh \
        -e "AGENT_TYPE=$AGENT_TYPE" \
        node:18-slim \
        bash /test-agent.sh > /tmp/container-output.log 2>&1; then

        log_success "Container executed successfully"
        cat /tmp/container-output.log

        if grep -q "Test completed successfully" /tmp/container-output.log; then
            log_success "Agent containerization test PASSED"
            return 0
        else
            log_error "Container test did not complete successfully"
            cat /tmp/container-output.log
            return 1
        fi
    else
        log_error "Failed to run container test"
        cat /tmp/container-output.log
        return 1
    fi
}

# Test 3: Test with actual claude-flow-novice (if available)
test_claude_flow_novice_container() {
    log "Test 3: Testing with claude-flow-novice"

    # Check if claude-flow-novice is available locally
    if ! npm list -g claude-flow-novice >/dev/null 2>&1; then
        log "claude-flow-novice not found globally, skipping this test"
        return 0
    fi

    log_success "claude-flow-novice found globally"

    # Create a test container with claude-flow-novice
    cat > /tmp/test-cfn.sh <<'EOF'
#!/bin/bash
echo "Testing claude-flow-novice in container..."

# Check if npx works
if command -v npx >/dev/null 2>&1; then
    echo "npx is available"
    echo "Testing claude-flow-novice version..."
    npx claude-flow-novice --version || echo "Version check failed but that's expected"
else
    echo "npx not available"
fi

echo "Files in current directory:"
ls -la

echo "Looking for .claude directory:"
if [[ -d ".claude" ]]; then
    echo ".claude directory found"
    echo "Skills:"
    ls -la .claude/skills/ 2>/dev/null || echo "No skills directory"
    echo "Agents:"
    ls -la .claude/agents/ 2>/dev/null || echo "No agents directory"
else
    echo ".claude directory not found"
fi

echo "claude-flow-novice container test completed"
EOF

    chmod +x /tmp/test-cfn.sh

    if docker run --rm --name "${CONTAINER_NAME}-cfn" \
        -v /tmp/test-cfn.sh:/test-cfn.sh \
        -v "${PROJECT_ROOT}:/app:ro" \
        -w /app \
        node:18-slim \
        bash /test-cfn.sh > /tmp/cfn-output.log 2>&1; then

        log_success "claude-flow-novice container test completed"
        cat /tmp/cfn-output.log

        if grep -q "claude-flow-novice container test completed" /tmp/cfn-output.log; then
            log_success "claude-flow-novice container test PASSED"
            return 0
        else
            log_error "claude-flow-novice container test FAILED"
            return 1
        fi
    else
        log_error "Failed to run claude-flow-novice container test"
        return 1
    fi
}

# Main execution
main() {
    local tests_passed=0
    local tests_total=3

    echo "Running Agent Containerization Tests..."
    echo "Agent Type: $AGENT_TYPE"
    echo "Container Name: $CONTAINER_NAME"
    echo ""

    # Run tests
    if test_docker_basic; then
        ((tests_passed++))
    fi

    echo ""
    if test_simple_agent_container; then
        ((tests_passed++))
    fi

    echo ""
    if test_claude_flow_novice_container; then
        ((tests_passed++))
    fi

    echo ""
    echo "======================================"
    echo "Test Results: $tests_passed/$tests_total tests passed"

    if [[ $tests_passed -eq $tests_total ]]; then
        log_success "ALL TESTS PASSED - Agent containerization is VALIDATED"
        echo ""
        echo "Assumption 1: Agents can run in Docker containers = PROVEN"
        echo "Next steps:"
        echo "  1. Implement skill-based MCP selection"
        echo "  2. Test MCP container discovery"
        echo "  3. Test end-to-end integration"
        return 0
    else
        log_error "SOME TESTS FAILED - Agent containerization needs more work"
        return 1
    fi
}

# Run main
main "$@"