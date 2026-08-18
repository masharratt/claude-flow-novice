#!/usr/bin/env bash
# Test actual CFN agent image spawning via spawn-agent.sh
# This test validates that spawn-agent.sh uses correct CLI syntax

set -euo pipefail

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "/mnt/c/Users/masha/Documents/claude-flow-novice")
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TEST_SUITE="Real Agent Spawning"
NETWORK_NAME="test-real-spawn-network"
REDIS_CONTAINER="test-real-spawn-redis"

setup() {
    log_suite_start "$TEST_SUITE"

    # Create test network
    docker network create "$NETWORK_NAME" 2>/dev/null || true

    # Start Redis
    docker run -d \
        --name "$REDIS_CONTAINER" \
        --network "$NETWORK_NAME" \
        redis:7-alpine \
        redis-server --save "" --appendonly no \
        >/dev/null 2>&1

    sleep 2
}

teardown() {
    log_info "Cleaning up test resources"

    # Stop and remove all test containers
    docker ps -a --filter "name=test-real-agent" --format "{{.Names}}" | xargs -r docker rm -f >/dev/null 2>&1 || true
    docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1 || true
    docker network rm "$NETWORK_NAME" >/dev/null 2>&1 || true

    # Clean up test workspaces
    rm -rf /tmp/agent-workspace-test-real-* 2>/dev/null || true
}

test_cfn_agent_image_exists() {
    log_test "CFN Agent Image Exists"

    local image_exists=$(docker images -q claude-flow-novice-agent:latest)

    if [[ -n "$image_exists" ]]; then
        log_pass "cfn-agent:latest image found"
        return 0
    else
        log_fail "cfn-agent:latest not found - run: npm run docker:build"
        return 1
    fi
}

test_spawn_agent_cli_syntax() {
    log_test "Spawn Agent CLI Syntax - npx claude-flow-novice agent"

    # Verify spawn-agent.sh uses correct CLI syntax (not node dist/cli/spawn.js)
    local spawn_script="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

    if ! [[ -f "$spawn_script" ]]; then
        log_fail "spawn-agent.sh not found at: $spawn_script"
        return 1
    fi

    # Check for correct syntax
    if grep -q "npx claude-flow-novice agent" "$spawn_script"; then
        log_pass "Correct CLI syntax: npx claude-flow-novice agent"

        # Ensure old buggy syntax is NOT present
        if grep -q "node dist/cli/spawn.js --type" "$spawn_script"; then
            log_fail "Found deprecated syntax: node dist/cli/spawn.js --type"
            return 1
        fi

        return 0
    else
        log_fail "Wrong CLI syntax - missing 'npx claude-flow-novice agent'"
        return 1
    fi
}

test_real_agent_spawn_with_context() {
    log_test "Real Agent Spawn - with context file"

    # Skip if image doesn't exist
    if ! docker images -q claude-flow-novice-agent:latest >/dev/null; then
        log_skip "cfn-agent:latest not built"
        return 0
    fi

    local task_id="test-real-agent-$(date +%s)"
    local agent_id="test-agent-$$"

    # Create test context file
    local context_file="/tmp/${task_id}-context.json"
    cat > "$context_file" << EOF
{
  "task_id": "$task_id",
  "agent_type": "backend-developer",
  "task_description": "Health check test",
  "mode": "mvp"
}
EOF

    # Spawn agent using spawn-agent.sh
    log_info "Spawning agent via spawn-agent.sh"

    local spawn_output
    spawn_output=$("$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh" \
        "backend-developer" \
        "$task_id" \
        "$agent_id" \
        --context "$context_file" \
        --network "$NETWORK_NAME" \
        --memory-limit 512m 2>&1) || {
        log_fail "spawn-agent.sh failed"
        echo "$spawn_output"
        rm -f "$context_file"
        return 1
    }

    # Extract agent ID from output
    local spawned_agent_id=$(echo "$spawn_output" | grep -o "Agent ID: [^ ]*" | cut -d' ' -f3)

    if [[ -z "$spawned_agent_id" ]]; then
        log_fail "No agent ID in spawn output"
        echo "$spawn_output"
        rm -f "$context_file"
        return 1
    fi

    log_info "Agent spawned: $spawned_agent_id"

    # Wait for container to start
    sleep 3

    # Check container status
    local container_id=$(docker ps -a --filter "name=agent-${spawned_agent_id}" --format "{{.ID}}" | head -1)

    if [[ -z "$container_id" ]]; then
        log_fail "Container not found for agent: $spawned_agent_id"
        rm -f "$context_file"
        return 1
    fi

    local status=$(docker inspect -f '{{.State.Status}}' "$container_id")
    log_info "Container status: $status"

    # Check logs for CLI syntax errors (the bug we're testing for)
    local logs=$(docker logs "$container_id" 2>&1)

    if echo "$logs" | grep -q "Agent type is required"; then
        log_fail "CLI syntax error detected: 'Agent type is required'"
        log_info "This indicates spawn-agent.sh is using wrong command syntax"
        echo "Container logs:"
        echo "$logs"
        docker rm -f "$container_id" >/dev/null 2>&1 || true
        rm -f "$context_file"
        return 1
    fi

    if echo "$logs" | grep -q "Error:.*Usage:.*cfn-spawn"; then
        log_fail "CLI invocation error detected"
        echo "$logs"
        docker rm -f "$container_id" >/dev/null 2>&1 || true
        rm -f "$context_file"
        return 1
    fi

    # Clean up
    docker rm -f "$container_id" >/dev/null 2>&1 || true
    rm -f "$context_file"

    log_pass "Real agent spawned without CLI syntax errors"
    return 0
}

test_agent_container_uses_correct_image() {
    log_test "Agent Container Uses CFN Agent Image"

    # Skip if image doesn't exist
    if ! docker images -q claude-flow-novice-agent:latest >/dev/null; then
        log_skip "cfn-agent:latest not built"
        return 0
    fi

    local task_id="test-image-check-$(date +%s)"

    # Spawn minimal agent
    local spawn_output
    spawn_output=$("$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh" \
        "backend-developer" \
        "$task_id" \
        "test-agent-$$" \
        --network "$NETWORK_NAME" \
        --memory-limit 256m 2>&1) || {
        log_fail "spawn-agent.sh failed"
        return 1
    }

    local agent_id=$(echo "$spawn_output" | grep -o "Agent ID: [^ ]*" | cut -d' ' -f3)

    if [[ -z "$agent_id" ]]; then
        log_fail "No agent ID in output"
        return 1
    fi

    sleep 2

    # Check container image
    local container_id=$(docker ps -a --filter "name=agent-${agent_id}" --format "{{.ID}}" | head -1)
    local image=$(docker inspect -f '{{.Config.Image}}' "$container_id" 2>/dev/null)

    docker rm -f "$container_id" >/dev/null 2>&1 || true

    if [[ "$image" == "claude-flow-novice-agent:latest" ]]; then
        log_pass "Container uses CFN agent image: $image"
        return 0
    else
        log_fail "Container uses wrong image: $image (expected: claude-flow-novice-agent:latest)"
        return 1
    fi
}

# Run tests
main() {
    setup

    local failed=0

    test_cfn_agent_image_exists || ((failed++))
    test_spawn_agent_cli_syntax || ((failed++))
    test_real_agent_spawn_with_context || ((failed++))
    test_agent_container_uses_correct_image || ((failed++))

    teardown

    log_suite_end "$TEST_SUITE" $failed

    exit $failed
}

# Handle script being sourced vs executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
