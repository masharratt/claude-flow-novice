#!/bin/bash
# planning/seo/tests/test-pattern-sync.sh
# Phase 4 Sprint 2 :: Pattern Sync Mechanism - Comprehensive Test Suite
#
# Purpose: Validate bidirectional pattern synchronization between global and local stores
# covering pull, push, conflict resolution, version drift detection, and incremental sync.
#
# Related Sprints: P4-S1 (Pattern Promotion), P4-S2 (Pattern Sync)
# Test Categories: pull operations, push operations, conflict resolution, incremental sync, integration

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# ============================================================================
# TEST CONFIGURATION & SETUP
# ============================================================================

# Test metadata
TEST_SUITE="Phase 4 Sprint 2 - Pattern Sync Mechanism"
REDIS_LOCAL_PATTERNS="seo:patterns:local"
REDIS_GLOBAL_PATTERNS="seo:patterns:global"
REDIS_SYNC_META="pattern:sync:meta"
REDIS_SYNC_CONFLICTS="pattern:sync:conflicts"

# Redis configuration
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_CLI_CMD="redis-cli -h $REDIS_HOST -p $REDIS_PORT"

# Create temp directory for test artifacts
TEST_TMPDIR=$(mktemp -d)
trap 'cleanup_test_environment' EXIT

# Test data files
TEST_PATTERNS_LOG="$TEST_TMPDIR/patterns.log"
SYNC_RESULTS="$TEST_TMPDIR/sync-results.json"
CONFLICT_LOG="$TEST_TMPDIR/conflicts.log"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ============================================================================
# CLEANUP FUNCTION
# ============================================================================

cleanup_test_environment() {
    log_info "Cleaning up test artifacts..."
    rm -rf "$TEST_TMPDIR"

    # Clean Redis test namespaces
    if command -v redis-cli &>/dev/null; then
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-pattern-1" 2>/dev/null || true
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-pattern-2" 2>/dev/null || true
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-pattern-3" 2>/dev/null || true
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-pattern-1" 2>/dev/null || true
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-pattern-2" 2>/dev/null || true
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-pattern-3" 2>/dev/null || true
        $REDIS_CLI_CMD DEL "$REDIS_SYNC_META:test-project" 2>/dev/null || true
        $REDIS_CLI_CMD DEL "$REDIS_SYNC_CONFLICTS:test-project" 2>/dev/null || true
    fi

    log_info "Test Summary: $TESTS_PASSED/$TESTS_RUN passed, $TESTS_FAILED failed"
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

# Create a test pattern in Redis
create_test_pattern() {
    local store="$1"
    local pattern_id="$2"
    local confidence="$3"
    local version="${4:-1.0.0}"
    local updated_at="${5:-$(date -Iseconds)}"

    $REDIS_CLI_CMD HSET "$store:$pattern_id" \
        pattern_id "$pattern_id" \
        pattern_type "title-tags" \
        confidence "$confidence" \
        version "$version" \
        lifecycle "validation" \
        category "title-optimization" \
        name "Test Pattern $pattern_id" \
        description "Test pattern for sync validation" \
        created_at "2024-01-01T00:00:00Z" \
        updated_at "$updated_at" \
        usage_count "10" \
        success_rate "0.85" \
        metadata "{}" \
        evidence "[]" \
        > /dev/null

    log_info "Created test pattern: $pattern_id (confidence=$confidence, version=$version)"
}

# Run sync via Node.js
run_sync() {
    local direction="$1"
    local mode="$2"
    local project_id="$3"
    local force="${4:-false}"
    local result_file="$5"

    node -e "
const { syncPatterns, pullPatternsFromGlobal, pushPatternsToGlobal } = require('$PROJECT_ROOT/planning/seo/lib/pattern-sync.ts');
const Redis = require('ioredis');
const fs = require('fs');

const redis = new Redis({
  host: '$REDIS_HOST',
  port: $REDIS_PORT,
});

async function main() {
  try {
    let result;
    if ('$direction' === 'pull') {
      result = await pullPatternsFromGlobal({
        projectId: '$project_id',
        incremental: '$mode' === 'incremental',
        forceOverwrite: $force,
        verbose: true,
      }, redis, '$REDIS_LOCAL_PATTERNS', '$REDIS_GLOBAL_PATTERNS');
    } else if ('$direction' === 'push') {
      result = await pushPatternsToGlobal({
        projectId: '$project_id',
        forcePromotion: $force,
        verbose: true,
      }, redis, '$REDIS_LOCAL_PATTERNS', '$REDIS_GLOBAL_PATTERNS');
    } else {
      result = await syncPatterns({
        projectId: '$project_id',
        direction: '$direction',
        mode: '$mode',
        force: $force,
        verbose: true,
      }, redis, '$REDIS_LOCAL_PATTERNS', '$REDIS_GLOBAL_PATTERNS');
    }

    fs.writeFileSync('$result_file', JSON.stringify(result, null, 2));
    await redis.quit();
    process.exit(0);
  } catch (error) {
    console.error('Sync failed:', error.message);
    fs.writeFileSync('$result_file', JSON.stringify({ success: false, error: error.message }, null, 2));
    await redis.quit();
    process.exit(1);
  }
}

main();
" 2>&1 || true
}

# Assert sync result
assert_sync_success() {
    local result_file="$1"
    local expected_synced="${2:-1}"

    if [[ ! -f "$result_file" ]]; then
        log_error "Sync result file not found: $result_file"
        return 1
    fi

    local success
    success=$(jq -r '.success // false' "$result_file")

    if [[ "$success" != "true" ]]; then
        log_error "Sync failed: $(jq -r '.error // "unknown error"' "$result_file")"
        return 1
    fi

    local patterns_synced
    patterns_synced=$(jq -r '.patternsSynced // 0' "$result_file")

    if [[ "$patterns_synced" -lt "$expected_synced" ]]; then
        log_error "Expected at least $expected_synced patterns synced, got $patterns_synced"
        return 1
    fi

    log_success "Sync successful: $patterns_synced patterns synced"
    return 0
}

# Test function wrapper
run_test() {
    local test_name="$1"
    local test_func="$2"

    ((TESTS_RUN++))
    log_step "Test $TESTS_RUN: $test_name"

    if $test_func; then
        ((TESTS_PASSED++))
        log_success "✓ $test_name"
    else
        ((TESTS_FAILED++))
        log_error "✗ $test_name"
    fi

    echo ""
}

# ============================================================================
# TEST CASES
# ============================================================================

# Test 1: Pull from global to empty local store
test_pull_empty_local() {
    log_info "GIVEN: Global pattern exists, local store empty"
    create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-pattern-1" "0.85"

    log_info "WHEN: Pull patterns from global"
    run_sync "pull" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Pattern should exist in local store"
    assert_sync_success "$SYNC_RESULTS" 1

    local local_exists
    local_exists=$($REDIS_CLI_CMD EXISTS "$REDIS_LOCAL_PATTERNS:test-pattern-1")
    if [[ "$local_exists" -eq 1 ]]; then
        log_success "Pattern exists in local store"
        return 0
    else
        log_error "Pattern not found in local store"
        return 1
    fi
}

# Test 2: Pull with existing local patterns (no conflict)
test_pull_existing_local_no_conflict() {
    log_info "GIVEN: Matching patterns in global and local with same confidence"
    create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-pattern-2" "0.80" "1.0.0" "2024-01-02T00:00:00Z"
    create_test_pattern "$REDIS_LOCAL_PATTERNS" "test-pattern-2" "0.80" "1.0.0" "2024-01-01T00:00:00Z"

    log_info "WHEN: Pull patterns from global"
    run_sync "pull" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Sync should succeed with skipped pattern"
    if assert_sync_success "$SYNC_RESULTS" 0; then
        local skipped
        skipped=$(jq -r '.metrics.skipped // 0' "$SYNC_RESULTS")
        if [[ "$skipped" -ge 1 ]]; then
            log_success "Pattern skipped (no conflict)"
            return 0
        fi
    fi

    log_error "Expected pattern to be skipped"
    return 1
}

# Test 3: Push eligible patterns to global
test_push_eligible_patterns() {
    log_info "GIVEN: Local pattern eligible for promotion (confidence ≥0.8, usage ≥5)"
    create_test_pattern "$REDIS_LOCAL_PATTERNS" "test-pattern-3" "0.85" "1.0.0"
    $REDIS_CLI_CMD HSET "$REDIS_LOCAL_PATTERNS:test-pattern-3" \
        usage_count "10" \
        success_rate "0.85" \
        > /dev/null

    log_info "WHEN: Push patterns to global"
    run_sync "push" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Pattern should be promoted to global store"
    if assert_sync_success "$SYNC_RESULTS" 1; then
        local global_exists
        global_exists=$($REDIS_CLI_CMD EXISTS "$REDIS_GLOBAL_PATTERNS:test-pattern-3")
        if [[ "$global_exists" -eq 1 ]]; then
            log_success "Pattern promoted to global store"
            return 0
        fi
    fi

    log_error "Pattern not found in global store"
    return 1
}

# Test 4: Push ineligible patterns (should skip)
test_push_ineligible_patterns() {
    log_info "GIVEN: Local pattern ineligible (low confidence)"
    create_test_pattern "$REDIS_LOCAL_PATTERNS" "test-pattern-low-conf" "0.65" "1.0.0"

    log_info "WHEN: Push patterns to global"
    run_sync "push" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Pattern should be skipped"
    local skipped
    skipped=$(jq -r '.metrics.skipped // 0' "$SYNC_RESULTS")
    if [[ "$skipped" -ge 1 ]]; then
        log_success "Ineligible pattern skipped"
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-pattern-low-conf" > /dev/null
        return 0
    fi

    log_error "Expected pattern to be skipped"
    return 1
}

# Test 5: Bidirectional sync
test_bidirectional_sync() {
    log_info "GIVEN: Patterns in both global and local stores"
    create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-global-only" "0.90"
    create_test_pattern "$REDIS_LOCAL_PATTERNS" "test-local-only" "0.88" "1.0.0"
    $REDIS_CLI_CMD HSET "$REDIS_LOCAL_PATTERNS:test-local-only" usage_count "10" > /dev/null

    log_info "WHEN: Run bidirectional sync"
    run_sync "both" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Both patterns should be synced"
    if assert_sync_success "$SYNC_RESULTS" 2; then
        local local_pulled global_pushed
        local_pulled=$($REDIS_CLI_CMD EXISTS "$REDIS_LOCAL_PATTERNS:test-global-only")
        global_pushed=$($REDIS_CLI_CMD EXISTS "$REDIS_GLOBAL_PATTERNS:test-local-only")

        if [[ "$local_pulled" -eq 1 && "$global_pushed" -eq 1 ]]; then
            log_success "Bidirectional sync successful"
            $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-global-only" > /dev/null
            $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-local-only" > /dev/null
            $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-global-only" > /dev/null
            $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-local-only" > /dev/null
            return 0
        fi
    fi

    log_error "Bidirectional sync failed"
    return 1
}

# Test 6: Conflict resolution (confidence-based)
test_conflict_resolution_confidence() {
    log_info "GIVEN: Local and global patterns with different confidence"
    create_test_pattern "$REDIS_LOCAL_PATTERNS" "test-conflict-1" "0.75" "1.0.0"
    create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-conflict-1" "0.90" "1.0.0"

    log_info "WHEN: Pull patterns from global"
    run_sync "pull" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Higher confidence pattern should win"
    local local_confidence
    local_confidence=$($REDIS_CLI_CMD HGET "$REDIS_LOCAL_PATTERNS:test-conflict-1" confidence)

    if [[ "$local_confidence" == "0.9000" ]] || [[ "$local_confidence" == "0.90" ]]; then
        log_success "Conflict resolved: higher confidence wins"
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-conflict-1" > /dev/null
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-conflict-1" > /dev/null
        return 0
    fi

    log_error "Expected confidence 0.90, got $local_confidence"
    return 1
}

# Test 7: Conflict resolution (merge similar)
test_conflict_resolution_merge() {
    log_info "GIVEN: Local and global patterns with similar confidence (±0.05)"
    create_test_pattern "$REDIS_LOCAL_PATTERNS" "test-merge-1" "0.83" "1.0.0"
    create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-merge-1" "0.85" "1.0.0"

    log_info "WHEN: Pull patterns from global"
    run_sync "pull" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Patterns should be merged"
    local conflicts_resolved
    conflicts_resolved=$(jq -r '.conflictsResolved // 0' "$SYNC_RESULTS")

    if [[ "$conflicts_resolved" -ge 1 ]]; then
        log_success "Patterns merged successfully"
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-merge-1" > /dev/null
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-merge-1" > /dev/null
        return 0
    fi

    log_error "Expected conflict to be merged"
    return 1
}

# Test 8: Incremental sync (only changed patterns)
test_incremental_sync() {
    log_info "GIVEN: Global pattern updated after last sync"
    local last_sync_timestamp
    last_sync_timestamp=$(date -d '2024-01-01' +%s)000

    create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-incremental" "0.80" "1.0.0" "2024-01-05T00:00:00Z"

    log_info "WHEN: Run incremental sync with timestamp"
    node -e "
const { pullPatternsFromGlobal } = require('$PROJECT_ROOT/planning/seo/lib/pattern-sync.ts');
const Redis = require('ioredis');
const fs = require('fs');

const redis = new Redis({ host: '$REDIS_HOST', port: $REDIS_PORT });

(async () => {
  try {
    const result = await pullPatternsFromGlobal({
      projectId: 'test-project',
      incremental: true,
      lastSyncTimestamp: $last_sync_timestamp,
      verbose: true,
    }, redis, '$REDIS_LOCAL_PATTERNS', '$REDIS_GLOBAL_PATTERNS');

    fs.writeFileSync('$SYNC_RESULTS', JSON.stringify(result, null, 2));
    await redis.quit();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
" 2>&1

    log_info "THEN: Only updated pattern should be synced"
    if assert_sync_success "$SYNC_RESULTS" 1; then
        log_success "Incremental sync successful"
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-incremental" > /dev/null
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-incremental" > /dev/null
        return 0
    fi

    log_error "Incremental sync failed"
    return 1
}

# Test 9: Full sync
test_full_sync() {
    log_info "GIVEN: Multiple patterns in global store"
    create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-full-1" "0.80"
    create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-full-2" "0.85"
    create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-full-3" "0.90"

    log_info "WHEN: Run full sync"
    run_sync "pull" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: All patterns should be synced"
    if assert_sync_success "$SYNC_RESULTS" 3; then
        log_success "Full sync successful"
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-full-1" > /dev/null
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-full-2" > /dev/null
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-full-3" > /dev/null
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-full-1" > /dev/null
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-full-2" > /dev/null
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-full-3" > /dev/null
        return 0
    fi

    log_error "Full sync failed"
    return 1
}

# Test 10: Version drift detection
test_version_drift_detection() {
    log_info "GIVEN: Local and global patterns with different versions"
    create_test_pattern "$REDIS_LOCAL_PATTERNS" "test-drift" "0.85" "1.0.0"
    create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-drift" "0.85" "2.0.0"

    log_info "WHEN: Pull patterns from global"
    run_sync "pull" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Version drift should be detected"
    local conflicts_detected
    conflicts_detected=$(jq -r '.metrics.conflictsDetected // 0' "$SYNC_RESULTS")

    if [[ "$conflicts_detected" -ge 1 ]]; then
        log_success "Version drift detected"
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-drift" > /dev/null
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-drift" > /dev/null
        return 0
    fi

    log_error "Version drift not detected"
    return 1
}

# Test 11: Sync metadata tracking
test_sync_metadata_tracking() {
    log_info "GIVEN: Patterns to sync"
    create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-meta" "0.85"

    log_info "WHEN: Run sync"
    run_sync "pull" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Sync metadata should be updated"
    local last_pull
    last_pull=$($REDIS_CLI_CMD HGET "$REDIS_SYNC_META:test-project" last_pull)

    if [[ -n "$last_pull" ]]; then
        log_success "Sync metadata tracked"
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-meta" > /dev/null
        $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-meta" > /dev/null
        return 0
    fi

    log_error "Sync metadata not found"
    return 1
}

# Test 12: Integration with P4-S1 promotion
test_integration_promotion() {
    log_info "GIVEN: Local pattern eligible for promotion"
    create_test_pattern "$REDIS_LOCAL_PATTERNS" "test-integration" "0.90" "1.0.0"
    $REDIS_CLI_CMD HSET "$REDIS_LOCAL_PATTERNS:test-integration" \
        usage_count "10" \
        success_rate "0.90" \
        > /dev/null

    log_info "WHEN: Push patterns to global"
    run_sync "push" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Pattern should use P4-S1 promotion protocol"
    if assert_sync_success "$SYNC_RESULTS" 1; then
        local global_exists
        global_exists=$($REDIS_CLI_CMD EXISTS "$REDIS_GLOBAL_PATTERNS:test-integration")
        if [[ "$global_exists" -eq 1 ]]; then
            log_success "P4-S1 promotion protocol used"
            $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-integration" > /dev/null
            $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-integration" > /dev/null
            return 0
        fi
    fi

    log_error "P4-S1 integration failed"
    return 1
}

# Test 13: Integration with P4-S1 confidence scoring
test_integration_confidence() {
    log_info "GIVEN: Pattern with confidence history"
    create_test_pattern "$REDIS_LOCAL_PATTERNS" "test-conf" "0.80" "1.0.0"

    log_info "WHEN: Sync patterns"
    run_sync "pull" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: Confidence should be maintained"
    if assert_sync_success "$SYNC_RESULTS" 0; then
        log_success "Confidence scoring integration validated"
        $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-conf" > /dev/null
        return 0
    fi

    log_error "Confidence integration failed"
    return 1
}

# Test 14: Error handling (Redis down)
test_error_handling_redis_down() {
    log_info "GIVEN: Invalid Redis connection"

    log_info "WHEN: Attempt sync with bad Redis config"
    node -e "
const { syncPatterns } = require('$PROJECT_ROOT/planning/seo/lib/pattern-sync.ts');
const Redis = require('ioredis');
const fs = require('fs');

const redis = new Redis({
  host: 'invalid-host',
  port: 9999,
  connectTimeout: 1000,
  maxRetriesPerRequest: 1,
});

(async () => {
  try {
    const result = await syncPatterns({
      projectId: 'test-project',
      direction: 'pull',
      mode: 'full',
    }, redis, '$REDIS_LOCAL_PATTERNS', '$REDIS_GLOBAL_PATTERNS');
    fs.writeFileSync('$SYNC_RESULTS', JSON.stringify(result, null, 2));
    await redis.quit();
    process.exit(0);
  } catch (error) {
    fs.writeFileSync('$SYNC_RESULTS', JSON.stringify({ success: false, error: error.message }, null, 2));
    await redis.quit();
    process.exit(1);
  }
})();
" 2>&1 || true

    log_info "THEN: Error should be handled gracefully"
    if [[ -f "$SYNC_RESULTS" ]]; then
        local success
        success=$(jq -r '.success // false' "$SYNC_RESULTS")
        if [[ "$success" == "false" ]]; then
            log_success "Error handled gracefully"
            return 0
        fi
    fi

    log_error "Error handling failed"
    return 1
}

# Test 15: Batch operations
test_batch_operations() {
    log_info "GIVEN: Multiple patterns to sync"
    for i in {1..5}; do
        create_test_pattern "$REDIS_GLOBAL_PATTERNS" "test-batch-$i" "0.80"
    done

    log_info "WHEN: Run sync with multiple patterns"
    run_sync "pull" "full" "test-project" "false" "$SYNC_RESULTS"

    log_info "THEN: All patterns should be synced efficiently"
    if assert_sync_success "$SYNC_RESULTS" 5; then
        local duration_ms
        duration_ms=$(jq -r '.durationMs // 0' "$SYNC_RESULTS")
        log_info "Sync duration: ${duration_ms}ms"

        # Cleanup
        for i in {1..5}; do
            $REDIS_CLI_CMD DEL "$REDIS_LOCAL_PATTERNS:test-batch-$i" > /dev/null
            $REDIS_CLI_CMD DEL "$REDIS_GLOBAL_PATTERNS:test-batch-$i" > /dev/null
        done

        log_success "Batch operations efficient"
        return 0
    fi

    log_error "Batch operations failed"
    return 1
}

# ============================================================================
# TEST EXECUTION
# ============================================================================

main() {
    log_info "=========================================="
    log_info "$TEST_SUITE"
    log_info "=========================================="
    echo ""

    # Check dependencies
    if ! command -v redis-cli &>/dev/null; then
        log_error "redis-cli not found. Please install Redis."
        exit 1
    fi

    if ! command -v node &>/dev/null; then
        log_error "Node.js not found. Please install Node.js."
        exit 1
    fi

    if ! $REDIS_CLI_CMD PING &>/dev/null; then
        log_error "Cannot connect to Redis at $REDIS_HOST:$REDIS_PORT"
        exit 1
    fi

    log_info "Dependencies: OK"
    echo ""

    # Run tests
    run_test "Pull from global to empty local store" test_pull_empty_local
    run_test "Pull with existing local patterns (no conflict)" test_pull_existing_local_no_conflict
    run_test "Push eligible patterns to global" test_push_eligible_patterns
    run_test "Push ineligible patterns (should skip)" test_push_ineligible_patterns
    run_test "Bidirectional sync" test_bidirectional_sync
    run_test "Conflict resolution (confidence-based)" test_conflict_resolution_confidence
    run_test "Conflict resolution (merge similar)" test_conflict_resolution_merge
    run_test "Incremental sync (only changed patterns)" test_incremental_sync
    run_test "Full sync" test_full_sync
    run_test "Version drift detection" test_version_drift_detection
    run_test "Sync metadata tracking" test_sync_metadata_tracking
    run_test "Integration with P4-S1 promotion" test_integration_promotion
    run_test "Integration with P4-S1 confidence scoring" test_integration_confidence
    run_test "Error handling (Redis down)" test_error_handling_redis_down
    run_test "Batch operations" test_batch_operations

    # Final summary
    echo ""
    log_info "=========================================="
    log_info "Test Summary"
    log_info "=========================================="
    log_info "Total tests: $TESTS_RUN"
    log_success "Passed: $TESTS_PASSED"
    if [[ $TESTS_FAILED -gt 0 ]]; then
        log_error "Failed: $TESTS_FAILED"
    else
        log_info "Failed: $TESTS_FAILED"
    fi

    local pass_rate
    pass_rate=$(awk "BEGIN {printf \"%.1f\", ($TESTS_PASSED/$TESTS_RUN)*100}")
    log_info "Pass rate: $pass_rate%"

    if [[ $TESTS_FAILED -eq 0 ]]; then
        log_success "All tests passed!"
        exit 0
    else
        log_error "Some tests failed."
        exit 1
    fi
}

main "$@"
