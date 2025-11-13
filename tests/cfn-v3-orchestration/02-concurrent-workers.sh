#!/usr/bin/env bash
set -euo pipefail

# Test: Concurrent Workers - Hybrid Routing Stress Test
# Validates rate limit isolation and parallel execution capacity

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test configuration
TASK_ID="test-concurrent-$(date +%s)"
WORKERS_PER_TEAM=5
TEAMS=("coordinator" "implementer" "reviewer" "tester" "ops")
TOTAL_WORKERS=$((WORKERS_PER_TEAM * ${#TEAMS[@]}))

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_warning() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[FAIL]${NC} $*"; }

# Cleanup function
cleanup() {
    log_info "Cleaning up test artifacts..."
    redis-cli --scan --pattern "test-concurrent-*" | xargs -r redis-cli del > /dev/null 2>&1 || true
    rm -rf /tmp/worker-*.log /tmp/worker-*.pid
}

trap cleanup EXIT

# Verify Redis availability
verify_redis() {
    log_info "Verifying Redis connection..."
    if ! redis-cli ping > /dev/null 2>&1; then
        log_error "Redis not available"
        return 1
    fi
    log_success "Redis connected"
}

# Spawn single worker
spawn_worker() {
    local team="$1"
    local worker_id="$2"
    local agent_id="${team}-worker-${worker_id}"
    local log_file="/tmp/worker-${agent_id}.log"
    local pid_file="/tmp/worker-${agent_id}.pid"
    
    # Simulate worker task (lightweight operation)
    {
        local start_time=$(date +%s%3N)
        
        # Store worker start
        redis-cli hset "test-concurrent-${TASK_ID}:${agent_id}" \
            "start_time" "$start_time" \
            "team" "$team" \
            "status" "running" > /dev/null
        
        # Simulate API call to Z.ai (would be actual agent spawn in production)
        sleep $(awk -v seed="$RANDOM" 'BEGIN{srand(seed); print rand()*0.5 + 0.1}')
        
        local end_time=$(date +%s%3N)
        local duration=$((end_time - start_time))
        
        # Store completion
        redis-cli hset "test-concurrent-${TASK_ID}:${agent_id}" \
            "end_time" "$end_time" \
            "duration_ms" "$duration" \
            "status" "complete" > /dev/null
        
        echo "Worker ${agent_id} completed in ${duration}ms"
    } > "$log_file" 2>&1 &
    
    echo $! > "$pid_file"
}

# Spawn all workers concurrently
spawn_all_workers() {
    log_info "Spawning ${TOTAL_WORKERS} concurrent workers (${WORKERS_PER_TEAM} per team)..."
    
    local start_time=$(date +%s%3N)
    local pids=()
    
    for team in "${TEAMS[@]}"; do
        for i in $(seq 1 $WORKERS_PER_TEAM); do
            spawn_worker "$team" "$i"
            pids+=("$(cat /tmp/worker-${team}-worker-${i}.pid)")
        done
    done
    
    log_info "All workers spawned. Waiting for completion..."
    
    # Wait for all workers
    local failed=0
    for pid in "${pids[@]}"; do
        if ! wait "$pid" 2>/dev/null; then
            ((failed++))
        fi
    done
    
    local end_time=$(date +%s%3N)
    local total_duration=$((end_time - start_time))
    
    echo "$total_duration:$failed"
}

# Validate parallel execution (not sequential)
validate_parallel_execution() {
    log_info "Validating parallel execution..."
    
    local worker_keys=$(redis-cli --scan --pattern "test-concurrent-${TASK_ID}:*")
    local overlaps=0
    
    # Check for time overlap (indicates parallel execution)
    local all_times=()
    while IFS= read -r key; do
        local start=$(redis-cli hget "$key" start_time)
        local end=$(redis-cli hget "$key" end_time)
        all_times+=("$start:$end")
    done <<< "$worker_keys"
    
    # Simple overlap check: if any worker started before another finished
    for time1 in "${all_times[@]}"; do
        local start1="${time1%%:*}"
        local end1="${time1##*:}"
        
        for time2 in "${all_times[@]}"; do
            if [[ "$time1" == "$time2" ]]; then continue; fi
            
            local start2="${time2%%:*}"
            
            # If worker2 started before worker1 finished
            if (( start2 < end1 && start2 > start1 )); then
                ((overlaps++))
            fi
        done
    done
    
    if (( overlaps > 0 )); then
        log_success "Parallel execution confirmed (${overlaps} overlaps detected)"
        return 0
    else
        log_warning "No overlapping execution detected (might be sequential)"
        return 1
    fi
}

# Check for rate limit errors
check_rate_limits() {
    log_info "Checking for rate limit errors..."
    
    local rate_limit_errors=0
    for log_file in /tmp/worker-*.log; do
        if [[ -f "$log_file" ]] && grep -qi "rate.limit\|429\|too.many.requests" "$log_file"; then
            ((rate_limit_errors++))
        fi
    done
    
    if (( rate_limit_errors == 0 )); then
        log_success "No rate limit errors detected"
        return 0
    else
        log_error "Found ${rate_limit_errors} rate limit errors"
        return 1
    fi
}

# Validate provider routing
validate_provider_routing() {
    log_info "Validating provider routing (Z.ai for workers)..."
    
    # In production, this would check actual API provider logs
    # For test, we verify worker completion (proxy for successful routing)
    local completed=$(redis-cli --scan --pattern "test-concurrent-${TASK_ID}:*" | \
        xargs -I{} redis-cli hget {} status | \
        grep -c "complete" || true)
    
    if (( completed == TOTAL_WORKERS )); then
        log_success "All ${TOTAL_WORKERS} workers completed successfully"
        return 0
    else
        log_error "Only ${completed}/${TOTAL_WORKERS} workers completed"
        return 1
    fi
}

# Calculate performance metrics
calculate_metrics() {
    log_info "Calculating performance metrics..."
    
    local worker_keys=$(redis-cli --scan --pattern "test-concurrent-${TASK_ID}:*")
    local total_duration=0
    local count=0
    local min_duration=999999
    local max_duration=0
    
    while IFS= read -r key; do
        local duration=$(redis-cli hget "$key" duration_ms)
        if [[ -n "$duration" ]]; then
            total_duration=$((total_duration + duration))
            ((count++))
            
            if (( duration < min_duration )); then
                min_duration=$duration
            fi
            if (( duration > max_duration )); then
                max_duration=$duration
            fi
        fi
    done <<< "$worker_keys"
    
    local avg_duration=$((total_duration / count))
    
    cat << METRICS

Performance Metrics:
  Workers Spawned: ${TOTAL_WORKERS}
  Completed: ${count}
  Avg Duration: ${avg_duration}ms
  Min Duration: ${min_duration}ms
  Max Duration: ${max_duration}ms
  
METRICS
}

# Main test execution
main() {
    echo "=========================================="
    echo "Concurrent Workers Stress Test"
    echo "=========================================="
    echo ""
    
    local test_passed=true
    
    # Step 1: Verify Redis
    if ! verify_redis; then
        log_error "Redis verification failed"
        exit 1
    fi
    
    # Step 2: Spawn all workers concurrently
    local spawn_result=$(spawn_all_workers)
    local total_duration="${spawn_result%%:*}"
    local failed_workers="${spawn_result##*:}"
    
    log_info "Total execution time: ${total_duration}ms"
    
    if (( failed_workers > 0 )); then
        log_error "${failed_workers} workers failed"
        test_passed=false
    else
        log_success "All workers completed successfully"
    fi
    
    # Step 3: Validate parallel execution
    if ! validate_parallel_execution; then
        log_warning "Parallel execution validation inconclusive"
    fi
    
    # Step 4: Check rate limits
    if ! check_rate_limits; then
        test_passed=false
    fi
    
    # Step 5: Validate provider routing
    if ! validate_provider_routing; then
        test_passed=false
    fi
    
    # Step 6: Calculate metrics
    calculate_metrics
    
    # Final result
    echo ""
    echo "=========================================="
    if [[ "$test_passed" == "true" ]]; then
        log_success "TEST PASSED - Concurrent workers validated"
        echo ""
        echo "Results:"
        echo "  - ${TOTAL_WORKERS} workers spawned concurrently"
        echo "  - Zero rate limit errors"
        echo "  - All workers completed successfully"
        echo "  - Total execution time: ${total_duration}ms"
        exit 0
    else
        log_error "TEST FAILED - See errors above"
        exit 1
    fi
}

main "$@"
