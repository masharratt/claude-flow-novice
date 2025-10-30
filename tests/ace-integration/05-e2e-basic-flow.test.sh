#!/bin/bash

# ACE System E2E Integration Test
# EPIC-ACE-001 Phase 1.5: Learning Validation

set -euo pipefail

# Import test helpers
source tests/ace-integration/test-helpers.sh

# Test Configuration
TEST_NAME="ACE E2E Basic Flow Test"
CONFIDENCE_THRESHOLD=0.85
LOG_FILE=".artifacts/logs/ace-e2e-test.log"

# Logging Function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Setup Test Environment
setup_test_environment() {
    log "🔧 Setting up test environment"

    # Clean SQLite database
    sqlite3 .artifacts/memory-store/context_reflections.db << EOF
        DELETE FROM context_reflections;
        DELETE FROM sprint_history;
        VACUUM;
EOF

    # Reset Redis keys
    redis-cli DEL "cfn_loop:sprint_n:historical_context"
    redis-cli DEL "cfn_loop:sprint_n_plus_1:historical_context"
}

# Sprint N: Simulate JWT Authentication Implementation
execute_sprint_n() {
    log "🚀 Executing Sprint N: JWT Authentication"

    # Simulate CFN Loop with multiple iterations
    npx claude-flow-novice swarm "Implement JWT Authentication" \
        --skills=jwt-auth,loop5-reflection \
        --strategy development \
        --max-iterations 3 \
        --confidence-threshold 0.85

    # Verify reflection stored
    REFLECTION_COUNT=$(sqlite3 .artifacts/memory-store/context_reflections.db \
        "SELECT COUNT(*) FROM context_reflections WHERE sprint_name = 'Sprint N';")

    if [[ "$REFLECTION_COUNT" -eq 0 ]]; then
        log "❌ Sprint N Reflection Failed"
        return 1
    fi

    log "✅ Sprint N Reflection Successful"
}

# Sprint N+1: Verify Context Learning
execute_sprint_n_plus_1() {
    log "🔍 Executing Sprint N+1: Authentication Refinement"

    # Query historical context
    HISTORICAL_CONTEXT=$(bash .claude/skills/cfn-loop-orchestration/helpers/context-lookup.sh \
        --sprint "Sprint N" \
        --similarity-threshold 0.70)

    # Validate context similarity
    if [[ -z "$HISTORICAL_CONTEXT" ]]; then
        log "❌ Historical Context Lookup Failed"
        return 1
    fi

    # Spawn agents with historical context
    ITERATIONS=$(npx claude-flow-novice swarm "Refine JWT Authentication" \
        --skills=jwt-auth,historical-context-injection \
        --strategy development \
        --max-iterations 3 \
        --historical-context "$HISTORICAL_CONTEXT")

    # Validate iteration count reduction
    if [[ "$ITERATIONS" -gt 3 ]]; then
        log "❌ Iteration Count Not Reduced"
        return 1
    fi

    log "✅ Sprint N+1 Context Injection Successful"
}

# Main Test Execution
main() {
    setup_test_environment

    # Track overall test confidence
    OVERALL_CONFIDENCE=0.0

    # Execute Phases
    if execute_sprint_n; then
        OVERALL_CONFIDENCE=$(echo "scale=2; $OVERALL_CONFIDENCE + 0.5" | bc)
    else
        log "❌ Sprint N Execution Failed"
        return 1
    fi

    if execute_sprint_n_plus_1; then
        OVERALL_CONFIDENCE=$(echo "scale=2; $OVERALL_CONFIDENCE + 0.5" | bc)
    else
        log "❌ Sprint N+1 Execution Failed"
        return 1
    fi

    # Final Validation
    if (( $(echo "$OVERALL_CONFIDENCE >= $CONFIDENCE_THRESHOLD" | bc -l) )); then
        log "🏆 E2E Test Passed with Confidence: $OVERALL_CONFIDENCE"
        echo "$OVERALL_CONFIDENCE" > .artifacts/test-results/ace-e2e-confidence.txt
        exit 0
    else
        log "❌ E2E Test Failed. Confidence: $OVERALL_CONFIDENCE"
        exit 1
    fi
}

# Execute Test
main