#!/bin/bash
# ACE System Query Performance Test Suite
# Phase 2.3 - SQLite Index Optimization Validation

set -euo pipefail

# Logging and output configuration
RESULTS_LOG="/tmp/ace_query_performance_results.log"
ERROR_LOG="/tmp/ace_query_performance_errors.log"

# Test configuration
DB_PATH="/tmp/ace_system_performance.db"
TEST_REFLECTIONS=1000

# Performance thresholds (in milliseconds)
BASELINE_THRESHOLD=100
COMPLEX_QUERY_THRESHOLD=200

# Utility functions
log_result() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$RESULTS_LOG"
}

log_error() {
    echo "[ERROR][$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$ERROR_LOG"
}

setup_test_database() {
    # Initialize test database with performance test data
    sqlite3 "$DB_PATH" << SQL
    -- Create performance test table
    CREATE TABLE IF NOT EXISTS context_reflections (
        id TEXT PRIMARY KEY,
        metadata JSON,
        confidence REAL,
        created_at DATE,
        tags TEXT
    );

    -- Create indexes for performance optimization
    CREATE INDEX IF NOT EXISTS idx_tags ON context_reflections(tags);
    CREATE INDEX IF NOT EXISTS idx_domain ON context_reflections(json_extract(metadata, '$.domain'));
    CREATE INDEX IF NOT EXISTS idx_confidence ON context_reflections(confidence);
    CREATE INDEX IF NOT EXISTS idx_created_at ON context_reflections(created_at);

    -- Populate test data
    WITH RECURSIVE
    generate_data(i) AS (
        SELECT 1
        UNION ALL
        SELECT i+1 FROM generate_data WHERE i < $TEST_REFLECTIONS
    )
    INSERT INTO context_reflections (id, metadata, confidence, created_at, tags)
    SELECT
        'test-' || i,
        json_object(
            'tags', json_array('tag' || (i % 50)),
            'domain', 'domain' || (i % 5)
        ),
        CAST((ABS(RANDOM()) % 100) / 100.0 AS REAL),
        date('now', '-' || (i / 10) || ' days'),
        'tag' || (i % 50)
    FROM generate_data;
SQL
}

run_performance_tests() {
    local total_score=0
    local test_count=0

    # Category 1: Baseline Performance
    log_result "=== Category 1: Baseline Performance Tests ==="

    # Test 1.1: Query time with 100 reflections
    test_baseline_query 100 && ((total_score++)) || log_error "Baseline 100 reflections test failed"
    ((test_count++))

    # Test 1.2: Query time with 500 reflections
    test_baseline_query 500 && ((total_score++)) || log_error "Baseline 500 reflections test failed"
    ((test_count++))

    # Test 1.3: Query time with 1000+ reflections
    test_baseline_query 1000 && ((total_score++)) || log_error "Baseline 1000 reflections test failed"
    ((test_count++))

    # Category 2: Index Usage Validation
    log_result "=== Category 2: Index Usage Validation ==="

    # Test 2.1-2.4: Verify index usage for different query types
    test_index_usage && ((total_score++)) || log_error "Index usage validation failed"
    ((test_count++))

    # Category 3: Query Patterns
    log_result "=== Category 3: Query Patterns ==="
    test_query_patterns && ((total_score++)) || log_error "Query patterns test failed"
    ((test_count++))

    # Category 4: Full Table Scan Detection
    log_result "=== Category 4: Full Table Scan Detection ==="
    test_no_full_table_scans && ((total_score++)) || log_error "Full table scan detection failed"
    ((test_count++))

    # Calculate confidence score
    local confidence=$(echo "scale=2; $total_score / $test_count" | bc)
    log_result "Performance Test Confidence: $confidence"

    return $([[ $(echo "$confidence >= 0.90" | bc -l) -eq 1 ]])
}

test_baseline_query() {
    local sample_size=$1
    local start_time=$(date +%s%N)

    # Multi-condition query to simulate real-world complexity
    sqlite3 "$DB_PATH" << SQL
    SELECT COUNT(*)
    FROM context_reflections
    WHERE
        json_extract(metadata, '$.tags') IS NOT NULL AND
        confidence > 0.5 AND
        created_at > date('now', '-30 days')
    LIMIT $sample_size;
SQL
    local end_time=$(date +%s%N)

    local duration_ms=$(( (end_time - start_time) / 1000000 ))

    log_result "Query with $sample_size reflections took ${duration_ms}ms"

    return $([[ $duration_ms -lt $BASELINE_THRESHOLD ]])
}

test_index_usage() {
    local success=1
    declare -a queries=(
        "SELECT * FROM context_reflections WHERE tags = 'tag10' LIMIT 10"
        "SELECT * FROM context_reflections WHERE json_extract(metadata, '$.domain') = 'domain2' LIMIT 10"
        "SELECT * FROM context_reflections WHERE confidence > 0.7 LIMIT 10"
    )

    for query in "${queries[@]}"; do
        local plan=$(sqlite3 "$DB_PATH" ".eqp $query")
        if [[ $plan != *"USING INDEX"* ]]; then
            log_error "Query '$query' not using index: $plan"
            success=0
        else
            log_result "Query uses index: $query"
        fi
    done

    return $success
}

test_query_patterns() {
    local success=1
    declare -a queries=(
        "SELECT COUNT(*) FROM context_reflections WHERE json_extract(metadata, '$.tags') LIKE '%tag10%'"
        "SELECT COUNT(*) FROM context_reflections WHERE json_extract(metadata, '$.tags') LIKE '%tag10%' AND json_extract(metadata, '$.tags') LIKE '%tag20%'"
        "SELECT COUNT(*) FROM context_reflections WHERE json_extract(metadata, '$.domain') = 'domain2' AND confidence > 0.8"
        "SELECT COUNT(*) FROM context_reflections WHERE created_at > date('now', '-7 days') AND confidence > 0.9"
        "SELECT COUNT(*) FROM context_reflections WHERE json_extract(metadata, '$.tags') LIKE '%tag10%' AND json_extract(metadata, '$.domain') = 'domain2' AND confidence > 0.7"
    )

    for query in "${queries[@]}"; do
        local start_time=$(date +%s%N)
        sqlite3 "$DB_PATH" "$query" > /dev/null
        local end_time=$(date +%s%N)

        local duration_ms=$(( (end_time - start_time) / 1000000 ))

        if [[ $duration_ms -gt $COMPLEX_QUERY_THRESHOLD ]]; then
            log_error "Complex query too slow: ${duration_ms}ms (Query: $query)"
            success=0
        else
            log_result "Complex query passed: ${duration_ms}ms (Query: $query)"
        fi
    done

    return $success
}

test_no_full_table_scans() {
    local success=1
    declare -a queries=(
        "SELECT * FROM context_reflections WHERE tags = 'tag10' LIMIT 10"
        "SELECT * FROM context_reflections WHERE json_extract(metadata, '$.domain') = 'domain2' LIMIT 10"
        "SELECT * FROM context_reflections WHERE confidence > 0.7 LIMIT 10"
    )

    for query in "${queries[@]}"; do
        local plan=$(sqlite3 "$DB_PATH" ".eqp $query")
        if [[ $plan == *"SCAN TABLE"* ]]; then
            log_error "Query uses full table scan: $query"
            log_error "Execution Plan: $plan"
            success=0
        else
            log_result "Query avoids full table scan: $query"
        fi
    done

    return $success
}

main() {
    log_result "=== ACE System Query Performance Test Suite ==="
    log_result "Test Reflections: $TEST_REFLECTIONS"
    log_result "Database Path: $DB_PATH"

    # Setup
    setup_test_database

    # Run performance tests
    run_performance_tests

    local test_result=$?

    # Cleanup
    rm -f "$DB_PATH"

    log_result "Test Suite Completed with Result: $test_result"
    exit $test_result
}

# Execute main function
main