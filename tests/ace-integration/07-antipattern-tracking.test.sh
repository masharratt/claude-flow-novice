#!/usr/bin/env bash

# ACE System Anti-Pattern Tracking Test
# Part of Epic-ACE-001 Phase 3.2 - CFN Loop Integration

set -euo pipefail

# Source test helpers
source tests/test-helpers.sh

# Test Configuration
ANTIPATTERN_STATS_KEY="ace:stats:antipatterns"
TEST_DOMAIN="backend"

# Setup: Clear existing stats
setup() {
    redis-cli DEL "${ANTIPATTERN_STATS_KEY}:${TEST_DOMAIN}"
    redis-cli DEL "${ANTIPATTERN_STATS_KEY}:global"
}

# Test Anti-Pattern Injection Tracking
test_antipattern_injection_tracking() {
    # Simulate anti-pattern injection
    .claude/skills/cfn-loop-orchestration/helpers/context-injection.sh \
        --task-id "test-antipattern-tracking-1" \
        --agent-type "backend-dev" \
        --original-context '{"task": "Test anti-pattern tracking"}' &> /dev/null

    # Check injection stats
    local domain_injected
    domain_injected=$(redis-cli HGET "${ANTIPATTERN_STATS_KEY}:backend" "injected")

    assert_gt "$domain_injected" 0 "Anti-pattern injection should increment domain stats"
}

# Test Anti-Pattern Prevention Tracking
test_antipattern_prevention_tracking() {
    # Simulate anti-pattern prevention
    .claude/skills/cfn-ace-system/invoke-context-reflect.sh \
        --confidence 0.85 \
        --task-id "test-antipattern-tracking-2" \
        --domain "backend" &> /dev/null

    # Check prevention stats
    local domain_prevented
    domain_prevented=$(redis-cli HGET "${ANTIPATTERN_STATS_KEY}:backend" "prevented")

    assert_gt "$domain_prevented" 0 "Anti-pattern prevention should increment domain stats"
}

# Effectiveness Analysis Test
test_effectiveness_analysis() {
    # Run effectiveness analysis
    local analysis_output
    analysis_output=$(.claude/skills/cfn-ace-system/analyze-anti-pattern-effectiveness.sh)

    # Validate JSON output
    echo "$analysis_output" | jq '.' &> /dev/null

    # Check for key fields
    local effectiveness
    effectiveness=$(echo "$analysis_output" | jq '.overall_effectiveness')

    assert_between 0 1 "$effectiveness" "Overall effectiveness should be between 0 and 1"
}

# Run Tests
main() {
    setup
    test_antipattern_injection_tracking
    test_antipattern_prevention_tracking
    test_effectiveness_analysis
    echo "✅ All Anti-Pattern Tracking Tests Passed"
}

# Execute
main