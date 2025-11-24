#!/bin/bash
# tests/load/test-database-saturation.sh
# Phase 6 Wave 5 :: PostgreSQL/Redis saturation testing with latency validation (<100ms p95)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
POSTGRES_RECORDS=10000
REDIS_KEYS=50000
QUERY_SAMPLES=1000
P95_LATENCY_THRESHOLD_MS=100
P99_LATENCY_THRESHOLD_MS=200

LATENCY_SAMPLES=()

cleanup() {
    log_info "Cleaning up database saturation test..."

    # Remove test containers
    docker ps -a --filter "label=load-test=database-saturation" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true

    # Clean up latency data
    rm -f /tmp/latency-samples-*.txt

    log_info "Cleanup complete"
}
trap cleanup EXIT

# Start PostgreSQL for testing
start_postgres() {
    log_step "GIVEN PostgreSQL instance for load testing"

    docker run -d \
        --name postgres-load-test \
        --label "load-test=database-saturation" \
        -e POSTGRES_PASSWORD=testpass \
        -e POSTGRES_DB=loadtest \
        -p 5433:5432 \
        postgres:15-alpine >/dev/null

    # Wait for PostgreSQL to be ready
    log_info "Waiting for PostgreSQL to be ready..."
    for i in {1..30}; do
        if docker exec postgres-load-test pg_isready -U postgres &>/dev/null; then
            log_success "PostgreSQL ready"
            return 0
        fi
        sleep 1
    done

    log_error "PostgreSQL failed to start"
    return 1
}

# Start Redis for testing
start_redis() {
    log_step "GIVEN Redis instance for load testing"

    docker run -d \
        --name redis-load-test \
        --label "load-test=database-saturation" \
        -p 6380:6379 \
        redis:7-alpine >/dev/null

    # Wait for Redis to be ready
    sleep 2

    if redis-cli -p 6380 ping &>/dev/null; then
        log_success "Redis ready"
        return 0
    else
        log_error "Redis failed to start"
        return 1
    fi
}

# Load PostgreSQL with test data
load_postgres_data() {
    log_step "WHEN loading PostgreSQL with $POSTGRES_RECORDS records"

    # Create test table
    docker exec postgres-load-test psql -U postgres -d loadtest -c "
        CREATE TABLE IF NOT EXISTS agents (
            id SERIAL PRIMARY KEY,
            agent_id VARCHAR(255) NOT NULL,
            agent_type VARCHAR(100) NOT NULL,
            status VARCHAR(50) NOT NULL,
            confidence REAL,
            spawned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            metadata JSONB
        );
        CREATE INDEX IF NOT EXISTS idx_agent_id ON agents(agent_id);
        CREATE INDEX IF NOT EXISTS idx_agent_type ON agents(agent_type);
        CREATE INDEX IF NOT EXISTS idx_status ON agents(status);
        CREATE INDEX IF NOT EXISTS idx_spawned_at ON agents(spawned_at);
    " &>/dev/null

    local start_time=$(date +%s)

    # Batch insert for performance
    local batch_size=1000
    local batches=$((POSTGRES_RECORDS / batch_size))

    for batch in $(seq 1 $batches); do
        local values=""
        for i in $(seq 1 $batch_size); do
            local agent_id="agent-$((batch * batch_size + i))"
            local agent_type="backend-developer"
            local status="completed"
            local confidence=$(echo "scale=2; 0.85 + ($i % 15) / 100" | bc)

            if [ -n "$values" ]; then
                values="${values},"
            fi
            values="${values}('${agent_id}', '${agent_type}', '${status}', ${confidence}, NOW(), NOW(), '{\"test\": true}')"
        done

        docker exec postgres-load-test psql -U postgres -d loadtest -c "
            INSERT INTO agents (agent_id, agent_type, status, confidence, spawned_at, completed_at, metadata)
            VALUES $values;
        " &>/dev/null

        if [ $((batch % 10)) -eq 0 ]; then
            log_info "Loaded $((batch * batch_size))/$POSTGRES_RECORDS records..."
        fi
    done

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Verify record count
    local actual_count=$(docker exec postgres-load-test psql -U postgres -d loadtest -t -c "SELECT COUNT(*) FROM agents;" | tr -d ' \n')

    log_info "PostgreSQL data load complete: $actual_count records in ${duration}s"

    if [ "$actual_count" -lt "$POSTGRES_RECORDS" ]; then
        log_error "Failed to load expected records (expected: $POSTGRES_RECORDS, actual: $actual_count)"
        return 1
    fi

    return 0
}

# Load Redis with test data
load_redis_data() {
    log_step "WHEN loading Redis with $REDIS_KEYS keys"

    local start_time=$(date +%s)

    # Use Redis pipelining for performance
    local batch_size=1000
    local batches=$((REDIS_KEYS / batch_size))

    for batch in $(seq 1 $batches); do
        local commands=""
        for i in $(seq 1 $batch_size); do
            local key="cfn:task:$((batch * batch_size + i))"
            local value="agent-data-$((batch * batch_size + i))"
            commands="${commands}SET ${key} ${value}\n"
        done

        echo -e "$commands" | redis-cli -p 6380 --pipe &>/dev/null

        if [ $((batch % 10)) -eq 0 ]; then
            log_info "Loaded $((batch * batch_size))/$REDIS_KEYS keys..."
        fi
    done

    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Verify key count
    local actual_count=$(redis-cli -p 6380 DBSIZE | awk '{print $2}')

    log_info "Redis data load complete: $actual_count keys in ${duration}s"

    if [ "$actual_count" -lt "$REDIS_KEYS" ]; then
        log_error "Failed to load expected keys (expected: $REDIS_KEYS, actual: $actual_count)"
        return 1
    fi

    return 0
}

# Measure PostgreSQL query latency
measure_postgres_latency() {
    log_step "THEN measuring PostgreSQL query latency ($QUERY_SAMPLES samples)"

    local latency_file="/tmp/latency-samples-postgres-$$.txt"
    > "$latency_file"

    for i in $(seq 1 $QUERY_SAMPLES); do
        local start=$(date +%s%3N)  # Milliseconds

        # Execute query
        docker exec postgres-load-test psql -U postgres -d loadtest -t -c "
            SELECT agent_id, agent_type, status, confidence
            FROM agents
            WHERE status = 'completed'
            ORDER BY spawned_at DESC
            LIMIT 10;
        " &>/dev/null

        local end=$(date +%s%3N)
        local latency=$((end - start))

        echo "$latency" >> "$latency_file"

        if [ $((i % 100)) -eq 0 ]; then
            log_info "PostgreSQL: $i/$QUERY_SAMPLES queries sampled..."
        fi
    done

    # Calculate percentiles
    local p50=$(sort -n "$latency_file" | awk 'BEGIN{c=0} {c++; val[c]=$1} END{print val[int(c*0.50)]}')
    local p95=$(sort -n "$latency_file" | awk 'BEGIN{c=0} {c++; val[c]=$1} END{print val[int(c*0.95)]}')
    local p99=$(sort -n "$latency_file" | awk 'BEGIN{c=0} {c++; val[c]=$1} END{print val[int(c*0.99)]}')
    local avg=$(awk '{sum+=$1} END{print int(sum/NR)}' "$latency_file")

    log_info "PostgreSQL Query Latency:"
    log_info "  Samples: $QUERY_SAMPLES"
    log_info "  p50: ${p50}ms"
    log_info "  p95: ${p95}ms"
    log_info "  p99: ${p99}ms"
    log_info "  avg: ${avg}ms"

    # Validate p95 latency
    if [ "$p95" -gt "$P95_LATENCY_THRESHOLD_MS" ]; then
        log_error "PostgreSQL p95 latency (${p95}ms) exceeds threshold (${P95_LATENCY_THRESHOLD_MS}ms)"
        return 1
    fi

    # Validate p99 latency
    if [ "$p99" -gt "$P99_LATENCY_THRESHOLD_MS" ]; then
        log_error "PostgreSQL p99 latency (${p99}ms) exceeds threshold (${P99_LATENCY_THRESHOLD_MS}ms)"
        return 1
    fi

    log_success "PostgreSQL latency within acceptable limits"

    return 0
}

# Measure Redis query latency
measure_redis_latency() {
    log_step "THEN measuring Redis query latency ($QUERY_SAMPLES samples)"

    local latency_file="/tmp/latency-samples-redis-$$.txt"
    > "$latency_file"

    for i in $(seq 1 $QUERY_SAMPLES); do
        local key="cfn:task:$((RANDOM % REDIS_KEYS + 1))"

        local start=$(date +%s%3N)  # Milliseconds

        # Execute GET command
        redis-cli -p 6380 GET "$key" &>/dev/null

        local end=$(date +%s%3N)
        local latency=$((end - start))

        echo "$latency" >> "$latency_file"

        if [ $((i % 100)) -eq 0 ]; then
            log_info "Redis: $i/$QUERY_SAMPLES queries sampled..."
        fi
    done

    # Calculate percentiles
    local p50=$(sort -n "$latency_file" | awk 'BEGIN{c=0} {c++; val[c]=$1} END{print val[int(c*0.50)]}')
    local p95=$(sort -n "$latency_file" | awk 'BEGIN{c=0} {c++; val[c]=$1} END{print val[int(c*0.95)]}')
    local p99=$(sort -n "$latency_file" | awk 'BEGIN{c=0} {c++; val[c]=$1} END{print val[int(c*0.99)]}')
    local avg=$(awk '{sum+=$1} END{print int(sum/NR)}' "$latency_file")

    log_info "Redis Query Latency:"
    log_info "  Samples: $QUERY_SAMPLES"
    log_info "  p50: ${p50}ms"
    log_info "  p95: ${p95}ms"
    log_info "  p99: ${p99}ms"
    log_info "  avg: ${avg}ms"

    # Validate p95 latency (Redis should be much faster than PostgreSQL)
    local redis_p95_threshold=$((P95_LATENCY_THRESHOLD_MS / 10))  # 10ms for Redis

    if [ "$p95" -gt "$redis_p95_threshold" ]; then
        log_error "Redis p95 latency (${p95}ms) exceeds threshold (${redis_p95_threshold}ms)"
        return 1
    fi

    log_success "Redis latency within acceptable limits"

    return 0
}

# Test database resource utilization
test_database_resource_utilization() {
    log_step "THEN analyzing database resource utilization"

    # PostgreSQL stats
    local pg_connections=$(docker exec postgres-load-test psql -U postgres -d loadtest -t -c "SELECT count(*) FROM pg_stat_activity;" | tr -d ' \n')
    local pg_cache_hit_ratio=$(docker exec postgres-load-test psql -U postgres -d loadtest -t -c "
        SELECT ROUND(100.0 * sum(blks_hit) / NULLIF(sum(blks_hit) + sum(blks_read), 0), 2)
        FROM pg_stat_database;
    " | tr -d ' \n')

    log_info "PostgreSQL Resource Utilization:"
    log_info "  Active connections: $pg_connections"
    log_info "  Cache hit ratio: ${pg_cache_hit_ratio}%"

    # Redis stats
    local redis_memory=$(redis-cli -p 6380 INFO memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    local redis_ops_per_sec=$(redis-cli -p 6380 INFO stats | grep instantaneous_ops_per_sec | cut -d: -f2 | tr -d '\r')

    log_info "Redis Resource Utilization:"
    log_info "  Memory usage: $redis_memory"
    log_info "  Operations/sec: $redis_ops_per_sec"

    return 0
}

# Execute tests
log_info "Starting database saturation test (Phase 6 Wave 5)"

start_postgres
start_redis

load_postgres_data
load_redis_data

measure_postgres_latency
measure_redis_latency

test_database_resource_utilization

log_success "All database saturation tests PASSED"
log_info "Summary:"
log_info "  PostgreSQL: $POSTGRES_RECORDS records, p95 < ${P95_LATENCY_THRESHOLD_MS}ms"
log_info "  Redis: $REDIS_KEYS keys, p95 < $((P95_LATENCY_THRESHOLD_MS / 10))ms"
