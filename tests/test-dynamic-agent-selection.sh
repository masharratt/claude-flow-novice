#!/bin/bash
# Test Dynamic Agent Selection System
# Part of Claude Flow Novice Testing Suite

set -euo pipefail

# No external dependencies needed

# Temporary directory for test artifacts
TEST_DIR="/tmp/dynamic-agent-selection-test-$(date +%s)"
mkdir -p "$TEST_DIR"

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test Logging
log_test() {
    echo -e "${GREEN}✅ TEST PASSED:${NC} $1"
}

log_failure() {
    echo -e "${RED}❌ TEST FAILED:${NC} $1" >&2
}

cleanup() {
    rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# 1. Agent Discovery Test
test_agent_discovery() {
    echo "Running Agent Discovery Test..."

    # Run discovery script
    ./.claude/skills/agent-discovery/discover-agents.sh

    local REGISTRY_PATH=".claude/skills/agent-discovery/agents-registry.json"

    # Validate JSON structure
    if ! jq empty "$REGISTRY_PATH" 2>/dev/null; then
        log_failure "Invalid JSON structure in agents-registry.json"
        return 1
    fi

    # Count total agents
    local total_agents=$(jq '.agents | length' "$REGISTRY_PATH")
    if [[ "$total_agents" -lt 5 ]]; then
        log_failure "Too few agents discovered (expected 5+, found $total_agents)"
        return 1
    fi

    # Check Loop Categorization
    local loop3_agents=$(jq '[.agents[] | select(.loop == 3)] | length' "$TEST_DIR/agents-registry.json")
    local loop2_agents=$(jq '[.agents[] | select(.loop == 2)] | length' "$TEST_DIR/agents-registry.json")

    if [[ "$loop3_agents" -lt 2 || "$loop2_agents" -lt 2 ]]; then
        log_failure "Insufficient agents in Loop 3 or Loop 2"
        return 1
    fi

    log_test "Agent Discovery Successful (Total: $total_agents, Loop 3: $loop3_agents, Loop 2: $loop2_agents)"
}

# 2. Agent Selection - Software Development
test_software_dev_selection() {
    echo "Running Software Development Agent Selection Test..."

    local task="Implement secure JWT authentication with Redis"
    local selection=$(
        ./.claude/skills/agent-selector/select-specialist-agents.sh \
        --task "$task" \
        --output-format json \
        --registry "$TEST_DIR/agents-registry.json"
    )

    # Validate JSON selection
    if ! echo "$selection" | jq empty 2>/dev/null; then
        log_failure "Invalid selection JSON"
        return 1
    fi

    local loop3_agents=$(echo "$selection" | jq '[.loop3_agents[]] | length')
    local loop2_agents=$(echo "$selection" | jq '[.loop2_agents[]] | length')

    if [[ "$loop3_agents" -lt 1 || "$loop2_agents" -lt 1 ]]; then
        log_failure "Insufficient agents selected for software development task"
        return 1
    fi

    # Check if selection contains expected types of agents
    local backend_dev=$(echo "$selection" | jq '.loop3_agents[] | select(.type | test("backend|dev|security"))' )
    local security_review=$(echo "$selection" | jq '.loop2_agents[] | select(.type | test("security|review"))' )

    if [[ -z "$backend_dev" || -z "$security_review" ]]; then
        log_failure "Missing expected agent types for software development"
        return 1
    fi

    log_test "Software Development Agent Selection Successful"
}

# 3. Agent Selection - Content Creation
test_content_creation_selection() {
    echo "Running Content Creation Agent Selection Test..."

    local task="Write comprehensive documentation for API"
    local selection=$(
        ./.claude/skills/agent-selector/select-specialist-agents.sh \
        --task "$task" \
        --output-format json \
        --registry "$TEST_DIR/agents-registry.json"
    )

    local writer_agents=$(echo "$selection" | jq '[.loop3_agents[] | select(.type | test("content|writer"))] | length')
    local editor_agents=$(echo "$selection" | jq '[.loop2_agents[] | select(.type | test("editor|review"))] | length')

    if [[ "$writer_agents" -lt 1 || "$editor_agents" -lt 1 ]]; then
        log_failure "Insufficient agents for content creation task"
        return 1
    fi

    log_test "Content Creation Agent Selection Successful"
}

# 4. Security Task Agent Selection
test_security_task_selection() {
    echo "Running Security Task Agent Selection Test..."

    local task="Security audit of authentication system"
    local selection=$(
        ./.claude/skills/agent-selector/select-specialist-agents.sh \
        --task "$task" \
        --output-format json \
        --registry "$TEST_DIR/agents-registry.json"
    )

    local security_specialists=$(echo "$selection" | jq '[.loop3_agents[] | select(.type | test("security"))] | length')
    local security_reviewers=$(echo "$selection" | jq '[.loop2_agents[] | select(.type | test("security"))] | length')

    if [[ "$security_specialists" -lt 1 || "$security_reviewers" -lt 1 ]]; then
        log_failure "Insufficient security-focused agents for security task"
        return 1
    fi

    log_test "Security Task Agent Selection Successful"
}

# 5. Registry Freshness Test
test_registry_freshness() {
    echo "Running Registry Freshness Test..."

    # Initial registry creation
    ./.claude/skills/agent-selector/discover-agents.sh --output "$TEST_DIR/agents-registry.json"
    local initial_timestamp=$(stat -c %Y "$TEST_DIR/agents-registry.json")

    # Fake an old timestamp (1.5 hours ago)
    touch -d "1.5 hours ago" "$TEST_DIR/agents-registry.json"

    # Force refresh
    ./.claude/skills/agent-selector/discover-agents.sh --output "$TEST_DIR/agents-registry.json" --force-refresh
    local new_timestamp=$(stat -c %Y "$TEST_DIR/agents-registry.json")

    if [[ "$new_timestamp" -le "$initial_timestamp" ]]; then
        log_failure "Registry not refreshed when stale"
        return 1
    fi

    log_test "Registry Freshness Check Successful"
}

# 6. Fallback Handling Test
test_fallback_selection() {
    echo "Running Fallback Selection Test..."

    local task="Completely unknown task type that should trigger fallback"
    local selection=$(
        ./.claude/skills/agent-selector/select-specialist-agents.sh \
        --task "$task" \
        --output-format json \
        --registry "$TEST_DIR/agents-registry.json"
    )

    local fallback_loop3_agents=$(echo "$selection" | jq '[.loop3_agents[]] | length')
    local fallback_loop2_agents=$(echo "$selection" | jq '[.loop2_agents[]] | length')

    if [[ "$fallback_loop3_agents" -lt 1 || "$fallback_loop2_agents" -lt 1 ]]; then
        log_failure "No fallback agents selected for unknown task"
        return 1
    fi

    log_test "Fallback Agent Selection Successful"
}

# Main Test Runner
main() {
    # Run all tests
    test_agent_discovery
    test_software_dev_selection
    test_content_creation_selection
    test_security_task_selection
    test_registry_freshness
    test_fallback_selection

    echo -e "${GREEN}✅ All Dynamic Agent Selection Tests Passed Successfully!${NC}"
}

# Run tests or get sourced without running
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main
fi