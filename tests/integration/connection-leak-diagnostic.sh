#!/usr/bin/env bash

# Connection Leak Diagnostic Test Suite
# Tests to isolate Task() tool connection leak issues

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Test configuration
TEST_RESULTS_DIR="/tmp/connection-leak-tests"
MONITOR_INTERVAL=2
ZAI_API_IP="47.254.4.184"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

setup_test_env() {
    mkdir -p "$TEST_RESULTS_DIR"
    log "Setting up test environment in $TEST_RESULTS_DIR"
}

capture_baseline() {
    local test_name=$1
    local baseline_file="$TEST_RESULTS_DIR/${test_name}_baseline.txt"

    log "Capturing baseline for $test_name"

    # Capture connection count to Z.ai
    local zai_connections=$(netstat -tn 2>/dev/null | grep "$ZAI_API_IP:443" | wc -l)

    # Capture memory usage
    local memory_kb=$(free -m | awk 'NR==2{print $3}')

    # Capture process count
    local claude_processes=$(pgrep -f "claude" | wc -l)

    # Capture open file descriptors
    local open_files=$(lsof 2>/dev/null | wc -l)

    cat > "$baseline_file" << EOF
BASELINE_METRICS
test_name: $test_name
timestamp: $(date +%s)
zai_connections: $zai_connections
memory_mb: $memory_kb
claude_processes: $claude_processes
open_files: $open_files
EOF

    log "Baseline captured: $zai_connections Z.ai connections, ${memory_kb}MB memory"
}

capture_post_test() {
    local test_name=$1
    local post_file="$TEST_RESULTS_DIR/${test_name}_post.txt"

    # Wait a moment for connections to settle
    sleep 3

    log "Capturing post-test metrics for $test_name"

    # Capture connection count to Z.ai
    local zai_connections=$(netstat -tn 2>/dev/null | grep "$ZAI_API_IP:443" | wc -l)

    # Capture memory usage
    local memory_kb=$(free -m | awk 'NR==2{print $3}')

    # Capture process count
    local claude_processes=$(pgrep -f "claude" | wc -l)

    # Capture open file descriptors
    local open_files=$(lsof 2>/dev/null | wc -l)

    cat > "$post_file" << EOF
POST_TEST_METRICS
test_name: $test_name
timestamp: $(date +%s)
zai_connections: $zai_connections
memory_mb: $memory_kb
claude_processes: $claude_processes
open_files: $open_files
EOF

    log "Post-test captured: $zai_connections Z.ai connections, ${memory_kb}MB memory"
}

analyze_test_result() {
    local test_name=$1
    local baseline_file="$TEST_RESULTS_DIR/${test_name}_baseline.txt"
    local post_file="$TEST_RESULTS_DIR/${test_name}_post.txt"

    if [ ! -f "$baseline_file" ] || [ ! -f "$post_file" ]; then
        log "${RED}❌ Missing test data files for $test_name${NC}"
        return 1
    fi

    # Extract metrics
    local baseline_zai=$(grep "zai_connections:" "$baseline_file" | cut -d' ' -f2)
    local post_zai=$(grep "zai_connections:" "$post_file" | cut -d' ' -f2)
    local baseline_mem=$(grep "memory_mb:" "$baseline_file" | cut -d' ' -f2)
    local post_mem=$(grep "memory_mb:" "$post_file" | cut -d' ' -f2)

    # Calculate differences
    local zai_diff=$((post_zai - baseline_zai))
    local mem_diff=$((post_mem - baseline_mem))

    log "${BLUE}📊 Test Results for $test_name:${NC}"
    echo "  Z.ai Connections: $baseline_zai → $post_zai (Δ$zai_diff)"
    echo "  Memory Usage: ${baseline_mem}MB → ${post_mem}MB (Δ${mem_diff}MB)"

    # Determine test result
    if [ "$zai_diff" -gt 5 ]; then
        log "${RED}❌ FAILED: Significant connection growth (+$zai_diff)${NC}"
        return 1
    elif [ "$mem_diff" -gt 1000 ]; then
        log "${RED}❌ FAILED: Significant memory growth (+${mem_diff}MB)${NC}"
        return 1
    elif [ "$zai_diff" -gt 0 ]; then
        log "${YELLOW}⚠️  WARNING: Minor connection growth (+$zai_diff)${NC}"
        return 0
    else
        log "${GREEN}✅ PASSED: No significant resource growth${NC}"
        return 0
    fi
}

test_1_baseline_no_api() {
    log "${BLUE}=== Test 1: Baseline - No API Calls ===${NC}"
    capture_baseline "test1_baseline"

    # Simple task with no external API calls
    timeout 60s claude --dangerously-skip-permissions -r "What is 2+2? Return only the number." > "$TEST_RESULTS_DIR/test1_output.txt" 2>&1 &
    local test_pid=$!

    # Monitor during test
    for i in {1..10}; do
        local current_zai=$(netstat -tn 2>/dev/null | grep "$ZAI_API_IP:443" | wc -l)
        echo "[$i/10] Current Z.ai connections: $current_zai"
        sleep 2
        if ! kill -0 "$test_pid" 2>/dev/null; then
            break
        fi
    done

    wait "$test_pid" 2>/dev/null || true
    capture_post_test "test1_baseline"
    analyze_test_result "test1_baseline"
}

test_2_single_api_call() {
    log "${BLUE}=== Test 2: Single API Call ===${NC}"
    capture_baseline "test2_single"

    timeout 60s claude --dangerously-skip-permissions -r "What is the capital of France? Return only the name." > "$TEST_RESULTS_DIR/test2_output.txt" 2>&1 &
    local test_pid=$!

    # Monitor connection growth
    local max_connections=0
    for i in {1..15}; do
        local current_zai=$(netstat -tn 2>/dev/null | grep "$ZAI_API_IP:443" | wc -l)
        max_connections=$((current_zai > max_connections ? current_zai : max_connections))
        echo "[$i/15] Z.ai connections: $current_zai (max: $max_connections)"
        sleep 2
        if ! kill -0 "$test_pid" 2>/dev/null; then
            break
        fi
    done

    wait "$test_pid" 2>/dev/null || true
    capture_post_test "test2_single"
    analyze_test_result "test2_single"

    log "Maximum concurrent connections observed: $max_connections"
}

test_3_sequential_calls() {
    log "${BLUE}=== Test 3: Sequential API Calls ===${NC}"
    capture_baseline "test3_sequential"

    for i in {1..3}; do
        log "Making sequential call $i/3"
        timeout 30s claude --dangerously-skip-permissions -r "Calculate $i+$i. Return only the result." > "$TEST_RESULTS_DIR/test3_${i}_output.txt" 2>&1 &
        local test_pid=$!

        # Monitor connections during this call
        for j in {1..5}; do
            local current_zai=$(netstat -tn 2>/dev/null | grep "$ZAI_API_IP:443" | wc -l)
            echo "  Call $i, check $j/5: $current_zai connections"
            sleep 1
            if ! kill -0 "$test_pid" 2>/dev/null; then
                break
            fi
        done

        wait "$test_pid" 2>/dev/null || true
        sleep 3  # Allow connections to close
    done

    capture_post_test "test3_sequential"
    analyze_test_result "test3_sequential"
}

test_4_concurrent_calls() {
    log "${BLUE}=== Test 4: Concurrent API Calls ===${NC}"
    capture_baseline "test4_concurrent"

    # Start 3 concurrent calls
    for i in {1..3}; do
        timeout 60s claude --dangerously-skip-permissions -r "Task $i: What is $i multiplied by 10? Return only the result." > "$TEST_RESULTS_DIR/test4_${i}_output.txt" 2>&1 &
        echo "Started concurrent call $i"
    done

    # Monitor for connection explosion
    local max_connections=0
    for i in {1..20}; do
        local current_zai=$(netstat -tn 2>/dev/null | grep "$ZAI_API_IP:443" | wc -l)
        max_connections=$((current_zai > max_connections ? current_zai : max_connections))
        echo "[$i/20] Concurrent Z.ai connections: $current_zai (max: $max_connections)"

        if [ "$current_zai" -gt 20 ]; then
            log "${RED}🚨 CRITICAL: Connection explosion detected! ($current_zai connections)${NC}"
        fi

        sleep 2

        # Check if all processes are done
        if ! pgrep -f "claude.*Task.*multiplied" > /dev/null; then
            break
        fi
    done

    # Wait for all processes
    wait 2>/dev/null || true
    capture_post_test "test4_concurrent"
    analyze_test_result "test4_concurrent"

    log "Maximum concurrent connections observed: $max_connections"
}

test_5_memory_stress() {
    log "${BLUE}=== Test 5: Memory Stress (Minimal API) ===${NC}"
    capture_baseline "test5_memory"

    # Task that uses memory but minimal API calls
    timeout 60s claude --dangerously-skip-permissions -r "Create a large array in memory with numbers 1 to 1000000, sum them, and return the total. Focus on computation, not API calls." > "$TEST_RESULTS_DIR/test5_output.txt" 2>&1 &
    local test_pid=$!

    # Monitor memory growth vs connections
    for i in {1..15}; do
        local current_zai=$(netstat -tn 2>/dev/null | grep "$ZAI_API_IP:443" | wc -l)
        local current_mem=$(free -m | awk 'NR==2{print $3}')
        echo "[$i/15] Memory: ${current_mem}MB, Z.ai connections: $current_zai"
        sleep 2
        if ! kill -0 "$test_pid" 2>/dev/null; then
            break
        fi
    done

    wait "$test_pid" 2>/dev/null || true
    capture_post_test "test5_memory"
    analyze_test_result "test5_memory"
}

generate_report() {
    local report_file="$TEST_RESULTS_DIR/connection_leak_report.txt"

    log "${BLUE}📋 Generating comprehensive report...${NC}"

    cat > "$report_file" << EOF
Connection Leak Diagnostic Report
Generated: $(date)
Test Directory: $TEST_RESULTS_DIR

SUMMARY:
========
EOF

    # Analyze all test results
    local total_tests=0
    local passed_tests=0
    local connection_leaks=0
    local memory_leaks=0

    for test_file in "$TEST_RESULTS_DIR"/*_baseline.txt; do
        if [ -f "$test_file" ]; then
            local test_name=$(basename "$test_file" "_baseline.txt")
            total_tests=$((total_tests + 1))

            if analyze_test_result "$test_name" > /dev/null 2>&1; then
                passed_tests=$((passed_tests + 1))
            else
                # Check what type of failure
                local baseline_file="$TEST_RESULTS_DIR/${test_name}_baseline.txt"
                local post_file="$TEST_RESULTS_DIR/${test_name}_post.txt"

                if [ -f "$baseline_file" ] && [ -f "$post_file" ]; then
                    local baseline_zai=$(grep "zai_connections:" "$baseline_file" | cut -d' ' -f2)
                    local post_zai=$(grep "zai_connections:" "$post_file" | cut -d' ' -f2)
                    local baseline_mem=$(grep "memory_mb:" "$baseline_file" | cut -d' ' -f2)
                    local post_mem=$(grep "memory_mb:" "$post_file" | cut -d' ' -f2)

                    if [ $((post_zai - baseline_zai)) -gt 5 ]; then
                        connection_leaks=$((connection_leaks + 1))
                    fi
                    if [ $((post_mem - baseline_mem)) -gt 1000 ]; then
                        memory_leaks=$((memory_leaks + 1))
                    fi
                fi
            fi
        fi
    done

    cat >> "$report_file" << EOF
Total Tests: $total_tests
Passed Tests: $passed_tests
Failed Tests: $((total_tests - passed_tests))
Connection Leak Failures: $connection_leaks
Memory Leak Failures: $memory_leaks

DETAILED RESULTS:
================
EOF

    # Add detailed results for each test
    for test_file in "$TEST_RESULTS_DIR"/*_baseline.txt; do
        if [ -f "$test_file" ]; then
            local test_name=$(basename "$test_file" "_baseline.txt")
            echo "" >> "$report_file"
            echo "Test: $test_name" >> "$report_file"
            echo "-------------------" >> "$report_file"

            if analyze_test_result "$test_name" >> "$report_file" 2>&1; then
                echo "Status: PASSED" >> "$report_file"
            else
                echo "Status: FAILED" >> "$report_file"
            fi
        fi
    done

    cat >> "$report_file" << EOF

RECOMMENDATIONS:
===============
EOF

    if [ "$connection_leaks" -gt 0 ]; then
        echo "- CRITICAL: Connection leaks detected in $connection_leaks tests" >> "$report_file"
        echo "- Issue likely in Task() tool HTTP client configuration" >> "$report_file"
        echo "- Check connection pooling and timeout settings with Z.ai API" >> "$report_file"
    fi

    if [ "$memory_leaks" -gt 0 ]; then
        echo "- Memory leaks detected in $memory_leaks tests" >> "$report_file"
        echo "- May indicate agent cleanup issues or memory fragmentation" >> "$report_file"
    fi

    if [ "$connection_leaks" -eq 0 ] && [ "$memory_leaks" -eq 0 ]; then
        echo "- No leaks detected in current test suite" >> "$report_file"
        echo "- Issue may require higher load or specific conditions to reproduce" >> "$report_file"
    fi

    echo "" >> "$report_file"
    echo "Next Steps:" >> "$report_file"
    echo "1. Review individual test outputs in $TEST_RESULTS_DIR/" >> "$report_file"
    echo "2. Check netstat captures for connection patterns" >> "$report_file"
    echo "3. Monitor memory growth during failed tests" >> "$report_file"

    log "Report generated: $report_file"
}

cleanup_test_env() {
    log "Cleaning up test environment"
    # Kill any hanging claude processes from tests
    pkill -f "claude.*--dangerously-skip-permissions" 2>/dev/null || true
    sleep 2
}

main() {
    log "${BLUE}🔍 Starting Connection Leak Diagnostic Test Suite${NC}"

    # Check prerequisites
    if ! command -v netstat >/dev/null 2>&1; then
        log "${RED}❌ netstat not available. Install net-tools.${NC}"
        exit 1
    fi

    if ! command -v lsof >/dev/null 2>&1; then
        log "${YELLOW}⚠️  lsof not available. File descriptor monitoring disabled.${NC}"
    fi

    setup_test_env

    # Run tests in sequence
    local test_start_time=$(date +%s)

    test_1_baseline_no_api
    echo ""
    sleep 5

    test_2_single_api_call
    echo ""
    sleep 5

    test_3_sequential_calls
    echo ""
    sleep 5

    test_4_concurrent_calls
    echo ""
    sleep 5

    test_5_memory_stress
    echo ""

    local test_end_time=$(date +%s)
    local test_duration=$((test_end_time - test_start_time))

    log "Test suite completed in ${test_duration} seconds"

    generate_report
    cleanup_test_env

    log "${GREEN}🎉 Diagnostic test suite complete${NC}"
    log "Review results in: $TEST_RESULTS_DIR/"
}

# Run main function
main "$@"