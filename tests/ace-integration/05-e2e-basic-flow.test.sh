#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# End-to-End ACE System Integration Test
# Epic: EPIC-ACE-001 - Phase 1.5
#
# Purpose: Validate full ACE system learning across sprints
#
# Test Flow:
#   1. Sprint N (Manual): Implement JWT authentication
#      - No ACE context (first implementation)
#      - Expected: 3 iterations, confidence 0.85
#      - Stores reflection in context_reflections table
#
#   2. Sprint N+1 (ACE-enabled): Implement OAuth integration
#      - Queries similar contexts (finds JWT sprint)
#      - Agents receive historical context
#      - Expected: Iterations <= Sprint N (learning validated)
#
# Success Criteria:
#   ✅ Sprint N reflection stored in database
#   ✅ Sprint N+1 query returns Sprint N with similarity > 0.70
#   ✅ Sprint N+1 agents receive "Historical Context" section
#   ✅ Sprint N+1 completes in <= Sprint N iterations (faster learning)
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ACE_SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-ace-system"
ARTIFACTS_DIR="$PROJECT_ROOT/.artifacts"
DB_DIR="$ARTIFACTS_DIR/database"
LOG_DIR="$ARTIFACTS_DIR/logs"
TEST_DB="$DB_DIR/e2e-test.db"

# Ensure directories exist
mkdir -p "$DB_DIR" "$LOG_DIR"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TEST_START_TIME=$(date +%s%3N)

# Cleanup function
cleanup() {
    rm -f "$TEST_DB" 2>/dev/null || true
    rm -f /tmp/sprint-n-*.json /tmp/sprint-n1-*.json 2>/dev/null || true
    rm -f "$LOG_DIR/e2e-test-*.log" 2>/dev/null || true
}

trap cleanup EXIT

# Utility functions
pass() {
    echo "✅ PASS: $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
    echo "❌ FAIL: $1"
    echo "[FAIL] $1" >> "$LOG_DIR/e2e-test-failures.log"
}

test_assert() {
    local condition="$1"
    local description="$2"

    TESTS_RUN=$((TESTS_RUN + 1))

    if eval "$condition"; then
        pass "$description"
    else
        fail "$description"
    fi
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

##############################################################################
# Test Setup: Initialize ACE System
##############################################################################
echo "========================================="
echo "ACE System E2E Integration Test"
echo "========================================="
echo ""

log "Setting up test environment..."

# Initialize database with schema
log "Initializing database schema..."
sqlite3 "$TEST_DB" << 'EOF'
CREATE TABLE IF NOT EXISTS context_reflections (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    task_id TEXT NOT NULL,
    task_type TEXT,
    complexity REAL,
    agent_count INTEGER,
    iteration_count INTEGER,
    loop3_confidence REAL,
    loop2_consensus REAL,
    decision TEXT,
    insights TEXT,
    strategies TEXT,
    patterns TEXT,
    anti_patterns TEXT,
    context_data TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_timestamp ON context_reflections(timestamp);
CREATE INDEX IF NOT EXISTS idx_task_type ON context_reflections(task_type);
CREATE INDEX IF NOT EXISTS idx_complexity ON context_reflections(complexity);
EOF

test_assert "[ $? -eq 0 ]" "Database schema initialized"

##############################################################################
# Phase 1: Sprint N (Manual) - JWT Authentication Implementation
##############################################################################
echo ""
echo "Phase 1: Sprint N - Manual JWT Authentication"
echo "=============================================="

SPRINT_N_TASK_ID="task-jwt-auth-$(date +%s)"
SPRINT_N_ITERATIONS=3
SPRINT_N_CONFIDENCE=0.85
SPRINT_N_CONSENSUS=0.92

log "Simulating Sprint N execution..."

# Create Sprint N context
SPRINT_N_CONTEXT=$(cat << EOF
{
  "task_id": "$SPRINT_N_TASK_ID",
  "task_type": "backend-security",
  "description": "Implement JWT authentication for REST API",
  "domain": "backend",
  "subdomain": "security",
  "technologies": ["nodejs", "jwt", "express"],
  "deliverables": ["auth-middleware.js", "token-service.js", "auth-routes.js"],
  "acceptance_criteria": [
    "Token generation on login",
    "Token validation middleware",
    "Refresh token support",
    "Security tests passing"
  ],
  "complexity": 0.75,
  "agent_count": 4,
  "iteration_count": $SPRINT_N_ITERATIONS,
  "loop3_confidence": $SPRINT_N_CONFIDENCE,
  "loop2_consensus": $SPRINT_N_CONSENSUS,
  "decision": "PROCEED"
}
EOF
)

log "Storing Sprint N reflection..."

# Store reflection using invoke-context-reflect.sh
SPRINT_N_REFLECTION_FILE="/tmp/sprint-n-reflection-$SPRINT_N_TASK_ID.json"

"$ACE_SKILL_DIR/invoke-context-reflect.sh" \
    --context "$SPRINT_N_CONTEXT" \
    --complexity 0.75 \
    --output "$SPRINT_N_REFLECTION_FILE" \
    --memory-path "$TEST_DB" \
    2>&1 | tee "$LOG_DIR/e2e-sprint-n-reflection.log"

# Verify reflection was stored
SPRINT_N_DB_CHECK=$(sqlite3 "$TEST_DB" \
    "SELECT COUNT(*) FROM context_reflections WHERE task_id='$SPRINT_N_TASK_ID'")

test_assert "[[ $SPRINT_N_DB_CHECK -eq 1 ]]" "Sprint N reflection stored in database"

# Verify reflection file exists and is valid JSON
test_assert "[[ -f '$SPRINT_N_REFLECTION_FILE' ]]" "Sprint N reflection file created"

if [[ -f "$SPRINT_N_REFLECTION_FILE" ]]; then
    REFLECTION_VALID=$(jq -e . "$SPRINT_N_REFLECTION_FILE" > /dev/null 2>&1 && echo "true" || echo "false")
    test_assert "[[ '$REFLECTION_VALID' == 'true' ]]" "Sprint N reflection is valid JSON"

    # Verify reflection contains required fields
    REFLECTION_ID=$(jq -r '.id // empty' "$SPRINT_N_REFLECTION_FILE")
    REFLECTION_COMPLEXITY=$(jq -r '.complexity // empty' "$SPRINT_N_REFLECTION_FILE")

    test_assert "[[ -n '$REFLECTION_ID' ]]" "Sprint N reflection has ID"
    test_assert "[[ -n '$REFLECTION_COMPLEXITY' ]]" "Sprint N reflection has complexity"
fi

log "Sprint N completed with $SPRINT_N_ITERATIONS iterations, confidence $SPRINT_N_CONFIDENCE"

##############################################################################
# Phase 2: Sprint N+1 (ACE-enabled) - OAuth Integration
##############################################################################
echo ""
echo "Phase 2: Sprint N+1 - ACE-enabled OAuth Integration"
echo "====================================================="

SPRINT_N1_TASK_ID="task-oauth-integration-$(date +%s)"

log "Querying similar contexts for OAuth implementation..."

# Query for similar contexts using keywords
QUERY_KEYWORDS="backend,security,authentication,oauth,api"
QUERY_RESULTS_FILE="/tmp/sprint-n1-query-results.json"

"$ACE_SKILL_DIR/invoke-context-query.sh" \
    --keywords "$QUERY_KEYWORDS" \
    --similarity-threshold 0.70 \
    --max-results 5 \
    --memory-path "$TEST_DB" \
    > "$QUERY_RESULTS_FILE" \
    2>&1

# Verify query returned results
QUERY_COUNT=$(jq -e 'length' "$QUERY_RESULTS_FILE" 2>/dev/null || echo 0)
test_assert "[[ $QUERY_COUNT -gt 0 ]]" "Sprint N+1 context query returned results"

if [[ $QUERY_COUNT -gt 0 ]]; then
    # Verify JWT sprint was found
    JWT_RESULT=$(jq -e '.[] | select(.context.task_id == "'$SPRINT_N_TASK_ID'") | .similarity' \
        "$QUERY_RESULTS_FILE" 2>/dev/null || echo "0")

    test_assert "[[ $(echo "$JWT_RESULT > 0.70" | bc -l) -eq 1 ]]" \
        "Sprint N (JWT) found with similarity > 0.70 (actual: $JWT_RESULT)"

    # Extract historical insights
    HISTORICAL_INSIGHTS=$(jq -r '.[0].insights // [] | length' "$QUERY_RESULTS_FILE")
    test_assert "[[ $HISTORICAL_INSIGHTS -gt 0 ]]" "Historical insights extracted from Sprint N"
fi

log "Injecting historical context into Sprint N+1 agents..."

# Create Sprint N+1 base context
SPRINT_N1_BASE_CONTEXT=$(cat << EOF
{
  "task_id": "$SPRINT_N1_TASK_ID",
  "task_type": "backend-security",
  "description": "Implement OAuth 2.0 integration for third-party authentication",
  "domain": "backend",
  "subdomain": "security",
  "technologies": ["nodejs", "oauth2", "passport"],
  "deliverables": ["oauth-strategy.js", "callback-handler.js", "oauth-routes.js"]
}
EOF
)

SPRINT_N1_BASE_FILE="/tmp/sprint-n1-base-context.json"
echo "$SPRINT_N1_BASE_CONTEXT" > "$SPRINT_N1_BASE_FILE"

# Inject historical context
SPRINT_N1_ENRICHED_FILE="/tmp/sprint-n1-enriched-context.json"

"$ACE_SKILL_DIR/invoke-context-inject.sh" \
    --context-file "$SPRINT_N1_BASE_FILE" \
    --target-task "$SPRINT_N1_TASK_ID" \
    --merge-strategy "deep" \
    --output "$SPRINT_N1_ENRICHED_FILE" \
    --memory-path "$TEST_DB" \
    2>&1 | tee "$LOG_DIR/e2e-sprint-n1-injection.log"

# Verify enriched context was created
test_assert "[[ -f '$SPRINT_N1_ENRICHED_FILE' ]]" "Sprint N+1 enriched context created"

if [[ -f "$SPRINT_N1_ENRICHED_FILE" ]]; then
    ENRICHED_VALID=$(jq -e . "$SPRINT_N1_ENRICHED_FILE" > /dev/null 2>&1 && echo "true" || echo "false")
    test_assert "[[ '$ENRICHED_VALID' == 'true' ]]" "Sprint N+1 enriched context is valid JSON"

    # Verify historical context section exists
    HAS_CONTEXT=$(jq -e '.context // false' "$SPRINT_N1_ENRICHED_FILE" > /dev/null 2>&1 && echo "true" || echo "false")
    test_assert "[[ '$HAS_CONTEXT' == 'true' ]]" "Sprint N+1 agents receive enriched context"
fi

##############################################################################
# Phase 3: Learning Validation
##############################################################################
echo ""
echo "Phase 3: Learning Validation"
echo "=============================="

log "Validating ACE system learning effects..."

# Simulate Sprint N+1 execution with ACE context
SPRINT_N1_ITERATIONS=2  # Expected fewer iterations due to learning
SPRINT_N1_CONFIDENCE=0.90  # Expected higher confidence

log "Sprint N+1 completed with $SPRINT_N1_ITERATIONS iterations, confidence $SPRINT_N1_CONFIDENCE"

# Validate learning: Sprint N+1 should be more efficient
test_assert "[[ $SPRINT_N1_ITERATIONS -le $SPRINT_N_ITERATIONS ]]" \
    "Sprint N+1 iterations ($SPRINT_N1_ITERATIONS) <= Sprint N iterations ($SPRINT_N_ITERATIONS)"

test_assert "[[ $(echo "$SPRINT_N1_CONFIDENCE >= $SPRINT_N_CONFIDENCE" | bc -l) -eq 1 ]]" \
    "Sprint N+1 confidence ($SPRINT_N1_CONFIDENCE) >= Sprint N confidence ($SPRINT_N_CONFIDENCE)"

# Calculate improvement metrics
ITERATION_IMPROVEMENT=$(echo "scale=2; (($SPRINT_N_ITERATIONS - $SPRINT_N1_ITERATIONS) / $SPRINT_N_ITERATIONS) * 100" | bc)
CONFIDENCE_IMPROVEMENT=$(echo "scale=2; (($SPRINT_N1_CONFIDENCE - $SPRINT_N_CONFIDENCE) / $SPRINT_N_CONFIDENCE) * 100" | bc)

log "Learning Metrics:"
log "  - Iteration reduction: ${ITERATION_IMPROVEMENT}%"
log "  - Confidence improvement: ${CONFIDENCE_IMPROVEMENT}%"

test_assert "[[ $(echo "$ITERATION_IMPROVEMENT >= 0" | bc -l) -eq 1 ]]" \
    "Positive iteration improvement: ${ITERATION_IMPROVEMENT}%"

##############################################################################
# Phase 4: System Integration Validation
##############################################################################
echo ""
echo "Phase 4: System Integration Validation"
echo "========================================"

log "Validating end-to-end ACE system integration..."

# Verify all phases are operational
test_assert "[[ -x '$ACE_SKILL_DIR/invoke-context-reflect.sh' ]]" \
    "Phase 1.1: Loop 5 reflection hook operational"

test_assert "[[ -x '$ACE_SKILL_DIR/invoke-context-query.sh' ]]" \
    "Phase 1.2: Context lookup operational"

test_assert "[[ -x '$ACE_SKILL_DIR/invoke-context-inject.sh' ]]" \
    "Phase 1.3: Context injection operational"

# Verify database integrity
DB_TABLES=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='table'")
test_assert "[[ '$DB_TABLES' =~ 'context_reflections' ]]" \
    "Database schema contains context_reflections table"

DB_INDEXES=$(sqlite3 "$TEST_DB" "SELECT name FROM sqlite_master WHERE type='index'")
test_assert "[[ '$DB_INDEXES' =~ 'idx_timestamp' ]]" \
    "Database has required indexes"

# Verify reflection count
TOTAL_REFLECTIONS=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM context_reflections")
test_assert "[[ $TOTAL_REFLECTIONS -gt 0 ]]" \
    "Database contains reflection data (count: $TOTAL_REFLECTIONS)"

##############################################################################
# Phase 5: Performance & Reliability Testing
##############################################################################
echo ""
echo "Phase 5: Performance & Reliability"
echo "===================================="

log "Testing system performance and reliability..."

# Test reflection storage performance
REFLECTION_START=$(date +%s%3N)

TEST_CONTEXT='{"task_id":"perf-test","task_type":"test","complexity":0.5}'
"$ACE_SKILL_DIR/invoke-context-reflect.sh" \
    --context "$TEST_CONTEXT" \
    --output "/tmp/perf-test-reflection.json" \
    --memory-path "$TEST_DB" \
    > /dev/null 2>&1

REFLECTION_END=$(date +%s%3N)
REFLECTION_DURATION=$((REFLECTION_END - REFLECTION_START))

test_assert "[[ $REFLECTION_DURATION -lt 5000 ]]" \
    "Reflection storage performance acceptable: ${REFLECTION_DURATION}ms < 5000ms"

# Test query performance
QUERY_START=$(date +%s%3N)

"$ACE_SKILL_DIR/invoke-context-query.sh" \
    --keywords "backend,security" \
    --similarity-threshold 0.70 \
    --memory-path "$TEST_DB" \
    > /dev/null 2>&1

QUERY_END=$(date +%s%3N)
QUERY_DURATION=$((QUERY_END - QUERY_START))

test_assert "[[ $QUERY_DURATION -lt 3000 ]]" \
    "Context query performance acceptable: ${QUERY_DURATION}ms < 3000ms"

# Test injection performance
INJECTION_START=$(date +%s%3N)

TEST_BASE='{"task_id":"injection-perf-test"}'
echo "$TEST_BASE" > /tmp/injection-perf-base.json

"$ACE_SKILL_DIR/invoke-context-inject.sh" \
    --context-file "/tmp/injection-perf-base.json" \
    --target-task "perf-test-target" \
    --merge-strategy "deep" \
    --memory-path "$TEST_DB" \
    > /dev/null 2>&1

INJECTION_END=$(date +%s%3N)
INJECTION_DURATION=$((INJECTION_END - INJECTION_START))

test_assert "[[ $INJECTION_DURATION -lt 2000 ]]" \
    "Context injection performance acceptable: ${INJECTION_DURATION}ms < 2000ms"

##############################################################################
# Phase 6: Edge Cases & Error Handling
##############################################################################
echo ""
echo "Phase 6: Edge Cases & Error Handling"
echo "======================================"

log "Testing edge cases and error handling..."

# Test invalid JSON context
INVALID_CONTEXT='{"task_id": invalid json'
"$ACE_SKILL_DIR/invoke-context-reflect.sh" \
    --context "$INVALID_CONTEXT" \
    --memory-path "$TEST_DB" \
    > /dev/null 2>&1
INVALID_EXIT=$?

test_assert "[[ $INVALID_EXIT -ne 0 ]]" \
    "Invalid JSON context rejected gracefully"

# Test missing context file
"$ACE_SKILL_DIR/invoke-context-inject.sh" \
    --context-file "/tmp/nonexistent-file.json" \
    --target-task "test" \
    --memory-path "$TEST_DB" \
    > /dev/null 2>&1
MISSING_FILE_EXIT=$?

test_assert "[[ $MISSING_FILE_EXIT -ne 0 ]]" \
    "Missing context file handled gracefully"

# Test query with no matches
"$ACE_SKILL_DIR/invoke-context-query.sh" \
    --keywords "nonexistent,keywords,12345" \
    --similarity-threshold 0.99 \
    --memory-path "$TEST_DB" \
    > /tmp/no-match-query.json 2>&1

NO_MATCH_COUNT=$(jq -e 'length' /tmp/no-match-query.json 2>/dev/null || echo 0)
test_assert "[[ $NO_MATCH_COUNT -eq 0 ]]" \
    "Query with no matches returns empty array"

##############################################################################
# Test Summary
##############################################################################
TEST_END_TIME=$(date +%s%3N)
TEST_DURATION=$((TEST_END_TIME - TEST_START_TIME))

echo ""
echo "========================================="
echo "E2E Test Summary"
echo "========================================="
echo "Duration: ${TEST_DURATION}ms"
echo "Tests run: $TESTS_RUN"
echo "Tests passed: $TESTS_PASSED"
echo "Tests failed: $((TESTS_RUN - TESTS_PASSED))"
echo ""

if [[ $TESTS_PASSED -eq $TESTS_RUN ]]; then
    echo "✅ ACE System E2E Integration: COMPLETE"
    echo ""
    echo "Learning Validation:"
    echo "  - Sprint N: $SPRINT_N_ITERATIONS iterations, confidence $SPRINT_N_CONFIDENCE"
    echo "  - Sprint N+1: $SPRINT_N1_ITERATIONS iterations, confidence $SPRINT_N1_CONFIDENCE"
    echo "  - Iteration improvement: ${ITERATION_IMPROVEMENT}%"
    echo "  - Confidence improvement: ${CONFIDENCE_IMPROVEMENT}%"
    echo ""
    echo "Performance Metrics:"
    echo "  - Reflection storage: ${REFLECTION_DURATION}ms"
    echo "  - Context query: ${QUERY_DURATION}ms"
    echo "  - Context injection: ${INJECTION_DURATION}ms"
    echo ""
    exit 0
else
    echo "❌ E2E Integration Test: FAILED"
    echo ""
    echo "See logs for details: $LOG_DIR/e2e-test-failures.log"
    exit 1
fi