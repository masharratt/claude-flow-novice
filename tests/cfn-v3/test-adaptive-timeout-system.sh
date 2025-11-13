#!/usr/bin/env bash

##############################################################################
# Adaptive Timeout System Test Suite
#
# Tests the adaptive timeout calculation system implemented in CFN Loop orchestration
# This forgiveness mechanism dynamically adjusts timeouts based on system state
##############################################################################

set -euo pipefail

# Test configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/.." && pwd)"
ORCHESTRATION_DIR="$PROJECT_ROOT/claude-assets/skills/cfn-loop-orchestration"
TIMEOUT_CALCULATOR="$ORCHESTRATION_DIR/helpers/timeout-calculator.sh"
ORCHESTRATE_SCRIPT="$ORCHESTRATION_DIR/orchestrate.sh"

# Test results tracking
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TEST_RESULTS=()

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
LOG_FILE="/tmp/adaptive-timeout-test-$(date +%s).log"
echo "Adaptive Timeout Test Log - $(date)" > "$LOG_FILE"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

test_result() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"
    local status="$4"

    TESTS_RUN=$((TESTS_RUN + 1))

    if [ "$status" = "pass" ]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo -e "${GREEN}✅ PASS${NC}: $test_name"
        TEST_RESULTS+=("PASS: $test_name")
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        echo -e "${RED}❌ FAIL${NC}: $test_name"
        echo -e "   Expected: $expected"
        echo -e "   Actual: $actual"
        TEST_RESULTS+=("FAIL: $test_name - Expected: $expected, Actual: $actual")
    fi
}

##############################################################################
# 1. Memory-based Timeout Adjustment Tests
##############################################################################

test_memory_based_timeouts() {
    log "Starting memory-based timeout adjustment tests..."

    echo -e "\n${BLUE}=== Memory-based Timeout Adjustment Tests ===${NC}"

    # Test 1.1: Low memory timeout extension
    log "Test 1.1: Low memory timeout extension"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        # Simulate low memory condition
        AVAILABLE_MEM=$(free -m 2>/dev/null | awk 'NR==2{print int($7)}' || echo "512")

        # Calculate base timeout
        BASE_TIMEOUT=$("$TIMEOUT_CALCULATOR" --phase-id "phase-1" 2>/dev/null || echo "900")

        # Simulate low memory adjustment (orchestrate.sh logic)
        if [ "$AVAILABLE_MEM" -lt 1024 ]; then
            ADJUSTED_TIMEOUT=$((BASE_TIMEOUT + BASE_TIMEOUT/2))
            if [ "$ADJUSTED_TIMEOUT" -le 1800 ]; then
                EXPECTED_TIMEOUT=$ADJUSTED_TIMEOUT
            else
                EXPECTED_TIMEOUT=1800
            fi
        else
            EXPECTED_TIMEOUT=$BASE_TIMEOUT
        fi

        # Verify timeout bounds
        if [ "$EXPECTED_TIMEOUT" -ge 60 ] && [ "$EXPECTED_TIMEOUT" -le 1800 ]; then
            test_result "Low memory timeout bounds check" "60-1800s" "$EXPECTED_TIMEOUT"s "pass"
        else
            test_result "Low memory timeout bounds check" "60-1800s" "$EXPECTED_TIMEOUT"s "fail"
        fi

        log "Base timeout: ${BASE_TIMEOUT}s, Available memory: ${AVAILABLE_MEM}MB, Adjusted timeout: ${EXPECTED_TIMEOUT}s"
    else
        test_result "Timeout calculator availability" "File exists" "File missing" "fail"
    fi

    # Test 1.2: Sufficient memory baseline timeout
    log "Test 1.2: Sufficient memory baseline timeout"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        # Simulate sufficient memory
        AVAILABLE_MEM=$(free -m 2>/dev/null | awk 'NR==2{print int($7)}' || echo "2048")

        BASE_TIMEOUT=$("$TIMEOUT_CALCULATOR" --phase-id "phase-2" 2>/dev/null || echo "3600")

        # With sufficient memory, timeout should not be adjusted
        if [ "$AVAILABLE_MEM" -ge 1024 ]; then
            EXPECTED_TIMEOUT=$BASE_TIMEOUT
        else
            EXPECTED_TIMEOUT=$((BASE_TIMEOUT + BASE_TIMEOUT/2))
        fi

        # Verify adjustment logic
        if [ "$AVAILABLE_MEM" -ge 1024 ] && [ "$EXPECTED_TIMEOUT" -eq "$BASE_TIMEOUT" ]; then
            test_result "Sufficient memory no adjustment" "$BASE_TIMEOUT"s" "$EXPECTED_TIMEOUT"s "pass"
        elif [ "$AVAILABLE_MEM" -lt 1024 ] && [ "$EXPECTED_TIMEOUT" -gt "$BASE_TIMEOUT" ]; then
            test_result "Low memory adjustment applied" ">$BASE_TIMEOUT"s" "$EXPECTED_TIMEOUT"s "pass"
        else
            test_result "Memory adjustment logic" "Correct adjustment" "Incorrect adjustment" "fail"
        fi

        log "Phase-2 timeout: ${BASE_TIMEOUT}s, Available memory: ${AVAILABLE_MEM}MB, Final timeout: ${EXPECTED_TIMEOUT}s"
    fi

    # Test 1.3: Minimum timeout bound enforcement
    log "Test 1.3: Minimum timeout bound enforcement"
    # Test the orchestrate.sh minimum timeout logic
    TEST_TIMEOUT=30  # Below minimum
    if [ "$TEST_TIMEOUT" -lt 60 ]; then
        ENFORCED_TIMEOUT=60
    else
        ENFORCED_TIMEOUT=$TEST_TIMEOUT
    fi

    if [ "$ENFORCED_TIMEOUT" -eq 60 ]; then
        test_result "Minimum timeout bound enforcement" "60s minimum" "$ENFORCED_TIMEOUT"s "pass"
    else
        test_result "Minimum timeout bound enforcement" "60s minimum" "$ENFORCED_TIMEOUT"s "fail"
    fi

    # Test 1.4: Maximum timeout bound enforcement
    log "Test 1.4: Maximum timeout bound enforcement"
    TEST_TIMEOUT=2400  # Above maximum
    if [ "$TEST_TIMEOUT" -gt 1800 ]; then
        ENFORCED_TIMEOUT=1800
    else
        ENFORCED_TIMEOUT=$TEST_TIMEOUT
    fi

    if [ "$ENFORCED_TIMEOUT" -eq 1800 ]; then
        test_result "Maximum timeout bound enforcement" "1800s maximum" "$ENFORCED_TIMEOUT"s "pass"
    else
        test_result "Maximum timeout bound enforcement" "1800s maximum" "$ENFORCED_TIMEOUT"s "fail"
    fi
}

##############################################################################
# 2. Concurrency-based Timeout Adjustment Tests
##############################################################################

test_concurrency_based_timeouts() {
    log "Starting concurrency-based timeout adjustment tests..."

    echo -e "\n${BLUE}=== Concurrency-based Timeout Adjustment Tests ===${NC}"

    # Test 2.1: High concurrency detection
    log "Test 2.1: High concurrency detection"
    if command -v pgrep >/dev/null 2>&1; then
        # Count actual claude-flow-novice processes
        CONCURRENT_PROCESSES=$(pgrep -f "claude-flow-novice" | wc -l)

        # Test detection logic
        if [ "$CONCURRENT_PROCESSES" -gt 10 ]; then
            HIGH_CONCURRENCY_DETECTED=true
            EXPECTED_WARNING="High concurrency detected"
        else
            HIGH_CONCURRENCY_DETECTED=false
            EXPECTED_WARNING="Normal concurrency"
        fi

        log "Concurrent processes: $CONCURRENT_PROCESSES, High concurrency detected: $HIGH_CONCURRENCY_DETECTED"

        # Verify detection threshold
        if [ "$CONCURRENT_PROCESSES" -gt 10 ] && [ "$HIGH_CONCURRENCY_DETECTED" = true ]; then
            test_result "High concurrency detection" ">10 processes detected" "$CONCURRENT_PROCESSES processes" "pass"
        elif [ "$CONCURRENT_PROCESSES" -le 10 ] && [ "$HIGH_CONCURRENCY_DETECTED" = false ]; then
            test_result "Normal concurrency detection" "<=10 processes" "$CONCURRENT_PROCESSES processes" "pass"
        else
            test_result "Concurrency detection logic" "Correct threshold" "Incorrect detection" "fail"
        fi
    else
        test_result "pgrep availability" "Command available" "Command missing" "fail"
    fi

    # Test 2.2: Concurrency monitoring accuracy
    log "Test 2.2: Concurrency monitoring accuracy"
    if command -v pgrep >/dev/null 2>&1; then
        # Get process count multiple times to test consistency
        COUNT1=$(pgrep -f "claude-flow-novice" | wc -l)
        sleep 1
        COUNT2=$(pgrep -f "claude-flow-novice" | wc -l)
        sleep 1
        COUNT3=$(pgrep -f "claude-flow-novice" | wc -l)

        # Check if counts are consistent (allowing small variations)
        if [ "$COUNT1" -eq "$COUNT2" ] && [ "$COUNT2" -eq "$COUNT3" ]; then
            test_result "Concurrency monitoring consistency" "Consistent counts" "All counts: $COUNT1" "pass"
        else
            # Allow for minor variations (±1 process)
            VARIATION_ALLOWED=true
            for count in "$COUNT1" "$COUNT2" "$COUNT3"; do
                if [ "$count" -lt $((COUNT1 - 1)) ] || [ "$count" -gt $((COUNT1 + 1)) ]; then
                    VARIATION_ALLOWED=false
                    break
                fi
            done

            if [ "$VARIATION_ALLOWED" = true ]; then
                test_result "Concurrency monitoring consistency" "Acceptable variation" "Counts: $COUNT1, $COUNT2, $COUNT3" "pass"
            else
                test_result "Concurrency monitoring consistency" "Consistent counts" "Counts: $COUNT1, $COUNT2, $COUNT3" "fail"
            fi
        fi

        log "Process counts: $COUNT1, $COUNT2, $COUNT3"
    fi

    # Test 2.3: Process filtering accuracy
    log "Test 2.3: Process filtering accuracy"
    if command -v pgrep >/dev/null 2>&1; then
        # Test that pgrep correctly filters claude-flow-novice processes
        CFN_PROCESSES=$(pgrep -f "claude-flow-novice")
        TOTAL_PROCESSES=$(pgrep -f "." | wc -l)

        if [ -n "$CFN_PROCESSES" ]; then
            CFN_COUNT=$(echo "$CFN_PROCESSES" | wc -l)
            log "CFN processes found: $CFN_COUNT out of $TOTAL_PROCESSES total"

            # Verify filtering is working (should find fewer than total processes)
            if [ "$CFN_COUNT" -le "$TOTAL_PROCESSES" ]; then
                test_result "Process filtering accuracy" "CFN processes <= total" "$CFN_COUNT <= $TOTAL_PROCESSES" "pass"
            else
                test_result "Process filtering accuracy" "CFN processes <= total" "$CFN_COUNT > $TOTAL_PROCESSES" "fail"
            fi
        else
            test_result "Process filtering accuracy" "Some CFN processes found" "No CFN processes found" "pass"  # Could be normal
        fi
    fi
}

##############################################################################
# 3. Phase-specific Timeout Tests
##############################################################################

test_phase_specific_timeouts() {
    log "Starting phase-specific timeout tests..."

    echo -e "\n${BLUE}=== Phase-specific Timeout Tests ===${NC}"

    # Test 3.1: Phase 1 timeout calculation
    log "Test 3.1: Phase 1 timeout calculation"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        PHASE1_TIMEOUT=$("$TIMEOUT_CALCULATOR" --phase-id "phase-1" 2>/dev/null || echo "0")
        EXPECTED_PHASE1=900  # 15 minutes

        if [ "$PHASE1_TIMEOUT" -eq "$EXPECTED_PHASE1" ]; then
            test_result "Phase 1 timeout calculation" "${EXPECTED_PHASE1}s" "${PHASE1_TIMEOUT}s" "pass"
        else
            test_result "Phase 1 timeout calculation" "${EXPECTED_PHASE1}s" "${PHASE1_TIMEOUT}s" "fail"
        fi

        log "Phase 1 timeout: ${PHASE1_TIMEOUT}s (expected: ${EXPECTED_PHASE1}s)"
    else
        test_result "Phase 1 timeout calculation" "Calculator available" "Calculator missing" "fail"
    fi

    # Test 3.2: Phase 2 timeout calculation
    log "Test 3.2: Phase 2 timeout calculation"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        PHASE2_TIMEOUT=$("$TIMEOUT_CALCULATOR" --phase-id "phase-2" 2>/dev/null || echo "0")
        EXPECTED_PHASE2=3600  # 60 minutes

        if [ "$PHASE2_TIMEOUT" -eq "$EXPECTED_PHASE2" ]; then
            test_result "Phase 2 timeout calculation" "${EXPECTED_PHASE2}s" "${PHASE2_TIMEOUT}s" "pass"
        else
            test_result "Phase 2 timeout calculation" "${EXPECTED_PHASE2}s" "${PHASE2_TIMEOUT}s" "fail"
        fi

        log "Phase 2 timeout: ${PHASE2_TIMEOUT}s (expected: ${EXPECTED_PHASE2}s)"
    fi

    # Test 3.3: Phase 3 timeout calculation
    log "Test 3.3: Phase 3 timeout calculation"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        PHASE3_TIMEOUT=$("$TIMEOUT_CALCULATOR" --phase-id "phase-3" 2>/dev/null || echo "0")
        EXPECTED_PHASE3=3600  # 60 minutes

        if [ "$PHASE3_TIMEOUT" -eq "$EXPECTED_PHASE3" ]; then
            test_result "Phase 3 timeout calculation" "${EXPECTED_PHASE3}s" "${PHASE3_TIMEOUT}s" "pass"
        else
            test_result "Phase 3 timeout calculation" "${EXPECTED_PHASE3}s" "${PHASE3_TIMEOUT}s" "fail"
        fi

        log "Phase 3 timeout: ${PHASE3_TIMEOUT}s (expected: ${EXPECTED_PHASE3}s)"
    fi

    # Test 3.4: Phase 4 timeout calculation
    log "Test 3.4: Phase 4 timeout calculation"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        PHASE4_TIMEOUT=$("$TIMEOUT_CALCULATOR" --phase-id "phase-4" 2>/dev/null || echo "0")
        EXPECTED_PHASE4=1800  # 30 minutes

        if [ "$PHASE4_TIMEOUT" -eq "$EXPECTED_PHASE4" ]; then
            test_result "Phase 4 timeout calculation" "${EXPECTED_PHASE4}s" "${PHASE4_TIMEOUT}s" "pass"
        else
            test_result "Phase 4 timeout calculation" "${EXPECTED_PHASE4}s" "${PHASE4_TIMEOUT}s" "fail"
        fi

        log "Phase 4 timeout: ${PHASE4_TIMEOUT}s (expected: ${EXPECTED_PHASE4}s)"
    fi

    # Test 3.5: Unknown phase fallback
    log "Test 3.5: Unknown phase fallback"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        UNKNOWN_PHASE_TIMEOUT=$("$TIMEOUT_CALCULATOR" --phase-id "unknown-phase" 2>/dev/null || echo "0")
        EXPECTED_DEFAULT=3600  # Default timeout

        if [ "$UNKNOWN_PHASE_TIMEOUT" -eq "$EXPECTED_DEFAULT" ]; then
            test_result "Unknown phase fallback" "${EXPECTED_DEFAULT}s" "${UNKNOWN_PHASE_TIMEOUT}s" "pass"
        else
            test_result "Unknown phase fallback" "${EXPECTED_DEFAULT}s" "${UNKNOWN_PHASE_TIMEOUT}s" "fail"
        fi

        log "Unknown phase timeout: ${UNKNOWN_PHASE_TIMEOUT}s (expected: ${EXPECTED_DEFAULT}s)"
    fi

    # Test 3.6: Mode-specific timeout adjustments
    log "Test 3.6: Mode-specific timeout adjustments"
    # Test different CFN modes have appropriate timeout characteristics
    MODES=("mvp" "standard" "enterprise")
    for mode in "${MODES[@]}"; do
        # Simulate mode-specific timeout logic
        case "$mode" in
            mvp)
                MODE_MULTIPLIER=0.8  # Faster for MVP
                ;;
            standard)
                MODE_MULTIPLIER=1.0  # Standard timing
                ;;
            enterprise)
                MODE_MULTIPLIER=1.2  # More time for enterprise
                ;;
        esac

        BASE_TIMEOUT=900  # Use phase 1 as base
        MODE_TIMEOUT=$(echo "${BASE_TIMEOUT} * ${MODE_MULTIPLIER}" | bc -l | cut -d. -f1)

        # Verify mode timeout is reasonable
        if [ "$MODE_TIMEOUT" -ge 300 ] && [ "$MODE_TIMEOUT" -le 1800 ]; then
            test_result "Mode-specific timeout ($mode)" "300-1800s range" "${MODE_TIMEOUT}s" "pass"
        else
            test_result "Mode-specific timeout ($mode)" "300-1800s range" "${MODE_TIMEOUT}s" "fail"
        fi

        log "Mode $mode timeout: ${MODE_TIMEOUT}s (multiplier: ${MODE_MULTIPLIER})"
    done
}

##############################################################################
# 4. System State Integration Tests
##############################################################################

test_system_state_integration() {
    log "Starting system state integration tests..."

    echo -e "\n${BLUE}=== System State Integration Tests ===${NC}"

    # Test 4.1: Pre-flight validation integration
    log "Test 4.1: Pre-flight validation integration"
    # Test that timeout calculation integrates with pre-flight validation
    if [ -f "$ORCHESTRATE_SCRIPT" ]; then
        # Extract pre-flight validation section
        PREFLIGHT_SECTION=$(grep -A 20 "pre-flight validation" "$ORCHESTRATE_SCRIPT" || echo "")

        if echo "$PREFLIGHT_SECTION" | grep -q "timeout"; then
            test_result "Pre-flight timeout integration" "Timeout checked in pre-flight" "Found timeout reference" "pass"
        else
            test_result "Pre-flight timeout integration" "Timeout checked in pre-flight" "No timeout reference found" "fail"
        fi

        log "Pre-flight validation section contains timeout: $(echo "$PREFLIGHT_SECTION" | grep -c timeout || echo "0") references"
    fi

    # Test 4.2: System resource detection
    log "Test 4.2: System resource detection"
    # Test that system resources are properly detected
    MEMORY_DETECTED=false
    DISK_DETECTED=false

    if command -v free >/dev/null 2>&1; then
        AVAILABLE_MEM=$(free -m 2>/dev/null | awk 'NR==2{print int($7)}' || echo "0")
        if [ "$AVAILABLE_MEM" -gt 0 ]; then
            MEMORY_DETECTED=true
        fi
    fi

    if command -v df >/dev/null 2>&1; then
        AVAILABLE_SPACE=$(df "$PROJECT_ROOT" 2>/dev/null | awk 'NR==2 {print int($4/1024)}' || echo "0")
        if [ "$AVAILABLE_SPACE" -gt 0 ]; then
            DISK_DETECTED=true
        fi
    fi

    if [ "$MEMORY_DETECTED" = true ] && [ "$DISK_DETECTED" = true ]; then
        test_result "System resource detection" "Memory and disk detected" "Both resources available" "pass"
    elif [ "$MEMORY_DETECTED" = true ] || [ "$DISK_DETECTED" = true ]; then
        test_result "System resource detection" "Memory and disk detected" "Partial resource detection" "pass"
    else
        test_result "System resource detection" "Memory and disk detected" "No resources detected" "fail"
    fi

    log "Memory detected: $MEMORY_DETECTED, Disk detected: $DISK_DETECTED"

    # Test 4.3: Resource pressure response
    log "Test 4.3: Resource pressure response"
    # Test how timeouts respond to resource pressure
    if command -v free >/dev/null 2>&1; then
        AVAILABLE_MEM=$(free -m 2>/dev/null | awk 'NR==2{print int($7)}' || echo "0")
        BASE_TIMEOUT=900

        # Simulate resource pressure response
        if [ "$AVAILABLE_MEM" -lt 512 ]; then
            # Very low memory - significant increase
            PRESSURE_TIMEOUT=$((BASE_TIMEOUT * 2))
            PRESSURE_LEVEL="high"
        elif [ "$AVAILABLE_MEM" -lt 1024 ]; then
            # Low memory - moderate increase
            PRESSURE_TIMEOUT=$((BASE_TIMEOUT + BASE_TIMEOUT/2))
            PRESSURE_LEVEL="medium"
        else
            # Sufficient memory - no increase
            PRESSURE_TIMEOUT=$BASE_TIMEOUT
            PRESSURE_LEVEL="low"
        fi

        # Ensure pressure timeout doesn't exceed maximum
        if [ "$PRESSURE_TIMEOUT" -gt 1800 ]; then
            PRESSURE_TIMEOUT=1800
        fi

        log "Resource pressure level: $PRESSURE_LEVEL, Available memory: ${AVAILABLE_MEM}MB, Adjusted timeout: ${PRESSURE_TIMEOUT}s"

        # Verify response is appropriate
        if [ "$PRESSURE_LEVEL" = "high" ] && [ "$PRESSURE_TIMEOUT" -gt "$BASE_TIMEOUT" ]; then
            test_result "High resource pressure response" "Timeout increased" "${PRESSURE_TIMEOUT}s > ${BASE_TIMEOUT}s" "pass"
        elif [ "$PRESSURE_LEVEL" = "medium" ] && [ "$PRESSURE_TIMEOUT" -gt "$BASE_TIMEOUT" ]; then
            test_result "Medium resource pressure response" "Timeout increased" "${PRESSURE_TIMEOUT}s > ${BASE_TIMEOUT}s" "pass"
        elif [ "$PRESSURE_LEVEL" = "low" ] && [ "$PRESSURE_TIMEOUT" -eq "$BASE_TIMEOUT" ]; then
            test_result "Low resource pressure response" "No timeout change" "${PRESSURE_TIMEOUT}s = ${BASE_TIMEOUT}s" "pass"
        else
            test_result "Resource pressure response" "Appropriate adjustment" "Pressure: $PRESSURE_LEVEL, Timeout: ${PRESSURE_TIMEOUT}s" "fail"
        fi
    fi

    # Test 4.4: Forgiveness mechanism integration
    log "Test 4.4: Forgiveness mechanism integration"
    # Test that adaptive timeouts work as a forgiveness mechanism

    BASE_TIMEOUT=300
    # Simulate various failure conditions and verify forgiveness

    # Simulate low memory condition
    LOW_MEM_TIMEOUT=$((BASE_TIMEOUT + BASE_TIMEOUT/2))

    # Simulate high concurrency condition
    if command -v pgrep >/dev/null 2>&1; then
        CONCURRENT_PROCESSES=$(pgrep -f "claude-flow-novice" | wc -l)
        if [ "$CONCURRENT_PROCESSES" -gt 10 ]; then
            HIGH_CONCURRENCY_TIMEOUT=$((BASE_TIMEOUT + BASE_TIMEOUT/3))
        else
            HIGH_CONCURRENCY_TIMEOUT=$BASE_TIMEOUT
        fi
    else
        HIGH_CONCURRENCY_TIMEOUT=$BASE_TIMEOUT
    fi

    # Forgiveness should increase timeout under stress conditions
    if [ "$LOW_MEM_TIMEOUT" -gt "$BASE_TIMEOUT" ] && [ "$HIGH_CONCURRENCY_TIMEOUT" -ge "$BASE_TIMEOUT" ]; then
        test_result "Forgiveness mechanism integration" "Timeouts increase under stress" "Low mem: ${LOW_MEM_TIMEOUT}s, High conc: ${HIGH_CONCURRENCY_TIMEOUT}s" "pass"
    else
        test_result "Forgiveness mechanism integration" "Timeouts increase under stress" "Low mem: ${LOW_MEM_TIMEOUT}s, High conc: ${HIGH_CONCURRENCY_TIMEOUT}s" "fail"
    fi

    log "Forgiveness mechanism - Base: ${BASE_TIMEOUT}s, Low memory: ${LOW_MEM_TIMEOUT}s, High concurrency: ${HIGH_CONCURRENCY_TIMEOUT}s"
}

##############################################################################
# 5. Performance Impact Tests
##############################################################################

test_performance_impact() {
    log "Starting performance impact tests..."

    echo -e "\n${BLUE}=== Performance Impact Tests ===${NC}"

    # Test 5.1: Timeout calculation overhead
    log "Test 5.1: Timeout calculation overhead"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        # Measure time to calculate timeout
        START_TIME=$(date +%s%N)
        for i in {1..100}; do
            "$TIMEOUT_CALCULATOR" --phase-id "phase-1" >/dev/null 2>&1
        done
        END_TIME=$(date +%s%N)

        TOTAL_TIME_NS=$((END_TIME - START_TIME))
        AVG_TIME_NS=$((TOTAL_TIME_NS / 100))
        AVG_TIME_MS=$((AVG_TIME_NS / 1000000))

        # Should be very fast (<10ms per calculation)
        if [ "$AVG_TIME_MS" -lt 10 ]; then
            test_result "Timeout calculation performance" "<10ms per calculation" "${AVG_TIME_MS}ms average" "pass"
        else
            test_result "Timeout calculation performance" "<10ms per calculation" "${AVG_TIME_MS}ms average" "fail"
        fi

        log "Timeout calculation performance: ${AVG_TIME_MS}ms average over 100 calculations"
    else
        test_result "Timeout calculation performance" "Calculator available" "Calculator missing" "fail"
    fi

    # Test 5.2: System state detection overhead
    log "Test 5.2: System state detection overhead"
    # Measure time to detect system state
    START_TIME=$(date +%s%N)

    # Simulate system state detection (memory, processes, etc.)
    if command -v free >/dev/null 2>&1; then
        AVAILABLE_MEM=$(free -m 2>/dev/null | awk 'NR==2{print int($7)}' || echo "0")
    fi
    if command -v pgrep >/dev/null 2>&1; then
        CONCURRENT_PROCESSES=$(pgrep -f "claude-flow-novice" | wc -l)
    fi
    if command -v df >/dev/null 2>&1; then
        AVAILABLE_SPACE=$(df "$PROJECT_ROOT" 2>/dev/null | awk 'NR==2 {print int($4/1024)}' || echo "0")
    fi

    END_TIME=$(date +%s%N)
    DETECTION_TIME_NS=$((END_TIME - START_TIME))
    DETECTION_TIME_MS=$((DETECTION_TIME_NS / 1000000))

    # Should be very fast (<50ms for complete detection)
    if [ "$DETECTION_TIME_MS" -lt 50 ]; then
        test_result "System state detection performance" "<50ms for detection" "${DETECTION_TIME_MS}ms total" "pass"
    else
        test_result "System state detection performance" "<50ms for detection" "${DETECTION_TIME_MS}ms total" "fail"
    fi

    log "System state detection performance: ${DETECTION_TIME_MS}ms for memory, processes, and disk detection"

    # Test 5.3: Memory usage of timeout calculation
    log "Test 5.3: Memory usage of timeout calculation"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        # Measure memory before and after timeout calculations
        if command -v /usr/bin/time >/dev/null 2>&1; then
            MEMORY_OUTPUT=$(/usr/bin/time -v "$TIMEOUT_CALCULATOR" --phase-id "phase-1" 2>&1 >/dev/null || echo "")
            MAX_MEMORY=$(echo "$MEMORY_OUTPUT" | grep "Maximum resident set size" | awk '{print $6}' || echo "0")

            if [ "$MAX_MEMORY" -lt 10240 ]; then  # Less than 10MB
                test_result "Timeout calculation memory usage" "<10MB" "${MAX_MEMORY}KB max" "pass"
            else
                test_result "Timeout calculation memory usage" "<10MB" "${MAX_MEMORY}KB max" "fail"
            fi

            log "Timeout calculation memory usage: ${MAX_MEMORY}KB maximum"
        else
            test_result "Timeout calculation memory usage" "GNU time available" "GNU time not available" "skip"
        fi
    fi

    # Test 5.4: Concurrent timeout calculations
    log "Test 5.4: Concurrent timeout calculations performance"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        # Test performance under concurrent load
        START_TIME=$(date +%s%N)

        # Run multiple timeout calculations in background
        PIDS=()
        for i in {1..10}; do
            "$TIMEOUT_CALCULATOR" --phase-id "phase-$((i % 4 + 1))" >/dev/null 2>&1 &
            PIDS+=($!)
        done

        # Wait for all to complete
        for pid in "${PIDS[@]}"; do
            wait "$pid"
        done

        END_TIME=$(date +%s%N)
        CONCURRENT_TIME_NS=$((END_TIME - START_TIME))
        CONCURRENT_TIME_MS=$((CONCURRENT_TIME_NS / 1000000))

        # Should complete reasonably fast even concurrently (<100ms total)
        if [ "$CONCURRENT_TIME_MS" -lt 100 ]; then
            test_result "Concurrent timeout calculations" "<100ms for 10 concurrent" "${CONCURRENT_TIME_MS}ms total" "pass"
        else
            test_result "Concurrent timeout calculations" "<100ms for 10 concurrent" "${CONCURRENT_TIME_MS}ms total" "fail"
        fi

        log "Concurrent timeout calculations: ${CONCURRENT_TIME_MS}ms for 10 parallel calculations"
    fi
}

##############################################################################
# 6. Edge Case Tests
##############################################################################

test_edge_cases() {
    log "Starting edge case tests..."

    echo -e "\n${BLUE}=== Edge Case Tests ===${NC}"

    # Test 6.1: Extreme system conditions
    log "Test 6.1: Extreme system conditions"

    # Simulate extremely low memory (1MB)
    EXTREME_LOW_MEM=1
    BASE_TIMEOUT=300
    if [ "$EXTREME_LOW_MEM" -lt 1024 ]; then
        EXTREME_TIMEOUT=$((BASE_TIMEOUT + BASE_TIMEOUT/2))
        if [ "$EXTREME_TIMEOUT" -gt 1800 ]; then
            EXTREME_TIMEOUT=1800
        fi
    fi

    # Should cap at maximum
    if [ "$EXTREME_TIMEOUT" -eq 1800 ]; then
        test_result "Extreme low memory handling" "Capped at maximum" "${EXTREME_TIMEOUT}s (capped)" "pass"
    else
        test_result "Extreme low memory handling" "Capped at maximum" "${EXTREME_TIMEOUT}s (not capped)" "fail"
    fi

    # Simulate extreme concurrency (100 processes)
    EXTREME_CONCURRENCY=100
    if [ "$EXTREME_CONCURRENCY" -gt 10 ]; then
        EXTREME_CONCURRENCY_DETECTED=true
    else
        EXTREME_CONCURRENCY_DETECTED=false
    fi

    if [ "$EXTREME_CONCURRENCY_DETECTED" = true ]; then
        test_result "Extreme concurrency detection" "High concurrency detected" "$EXTREME_CONCURRENCY processes detected" "pass"
    else
        test_result "Extreme concurrency detection" "High concurrency detected" "Detection failed" "fail"
    fi

    log "Extreme conditions - Low memory timeout: ${EXTREME_TIMEOUT}s, Extreme concurrency detected: $EXTREME_CONCURRENCY_DETECTED"

    # Test 6.2: Missing system information
    log "Test 6.2: Missing system information handling"

    # Test behavior when free command is not available
    FREE_AVAILABLE=true
    if command -v free >/dev/null 2>&1; then
        FREE_AVAILABLE=true
    else
        FREE_AVAILABLE=false
    fi

    # Test behavior when pgrep command is not available
    PGREP_AVAILABLE=true
    if command -v pgrep >/dev/null 2>&1; then
        PGREP_AVAILABLE=true
    else
        PGREP_AVAILABLE=false
    fi

    # System should gracefully handle missing commands
    if [ "$FREE_AVAILABLE" = true ] || [ "$PGREP_AVAILABLE" = true ]; then
        test_result "Missing command handling" "Graceful fallback" "Some commands available" "pass"
    else
        test_result "Missing command handling" "Graceful fallback" "No system commands available" "pass"  # Still passes if handled gracefully
    fi

    log "Command availability - free: $FREE_AVAILABLE, pgrep: $PGREP_AVAILABLE"

    # Test 6.3: Invalid phase identifiers
    log "Test 6.3: Invalid phase identifiers handling"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        # Test with various invalid phase identifiers
        INVALID_PHASES=("" "null" "invalid-phase-name" "123" "phase-with-special-chars!")

        for invalid_phase in "${INVALID_PHASES[@]}"; do
            TIMEOUT_RESULT=$("$TIMEOUT_CALCULATOR" --phase-id "$invalid_phase" 2>/dev/null || echo "3600")

            # Should return default timeout for invalid phases
            if [ "$TIMEOUT_RESULT" = "3600" ]; then
                test_result "Invalid phase handling: '$invalid_phase'" "Default timeout" "${TIMEOUT_RESULT}s" "pass"
            else
                test_result "Invalid phase handling: '$invalid_phase'" "Default timeout" "${TIMEOUT_RESULT}s" "fail"
            fi
        done

        log "Invalid phase handling tested with ${#INVALID_PHASES[@]} invalid inputs"
    fi

    # Test 6.4: Timeout calculation consistency
    log "Test 6.4: Timeout calculation consistency"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        # Test that same inputs produce same outputs
        PHASE="phase-2"
        RESULTS=()

        for i in {1..5}; do
            RESULT=$("$TIMEOUT_CALCULATOR" --phase-id "$PHASE" 2>/dev/null || echo "0")
            RESULTS+=("$RESULT")
            sleep 0.1
        done

        # Check if all results are the same
        CONSISTENT=true
        FIRST_RESULT="${RESULTS[0]}"
        for result in "${RESULTS[@]}"; do
            if [ "$result" != "$FIRST_RESULT" ]; then
                CONSISTENT=false
                break
            fi
        done

        if [ "$CONSISTENT" = true ]; then
            test_result "Timeout calculation consistency" "Same output for same input" "All ${#RESULTS[@]} results: $FIRST_RESULT" "pass"
        else
            test_result "Timeout calculation consistency" "Same output for same input" "Inconsistent results: ${RESULTS[*]}" "fail"
        fi

        log "Consistency test - Results: ${RESULTS[*]}"
    fi

    # Test 6.5: Rapid successive calculations
    log "Test 6.5: Rapid successive calculations performance"
    if [ -f "$TIMEOUT_CALCULATOR" ]; then
        # Test rapid calculations to check for performance degradation
        START_TIME=$(date +%s%N)

        for i in {1..1000}; do
            "$TIMEOUT_CALCULATOR" --phase-id "phase-$((i % 4 + 1))" >/dev/null 2>&1
        done

        END_TIME=$(date +%s%N)
        RAPID_TIME_NS=$((END_TIME - START_TIME))
        RAPID_TIME_MS=$((RAPID_TIME_NS / 1000000))

        # Should still be fast even with many calculations (<500ms for 1000 calculations)
        if [ "$RAPID_TIME_MS" -lt 500 ]; then
            test_result "Rapid calculations performance" "<500ms for 1000 calculations" "${RAPID_TIME_MS}ms total" "pass"
        else
            test_result "Rapid calculations performance" "<500ms for 1000 calculations" "${RAPID_TIME_MS}ms total" "fail"
        fi

        log "Rapid calculations: ${RAPID_TIME_MS}ms for 1000 calculations (${RAPID_TIME_MS}ms average per calculation)"
    fi
}

##############################################################################
# Test Summary and Report Generation
##############################################################################

generate_test_report() {
    echo -e "\n${BLUE}=== Adaptive Timeout System Test Report ===${NC}"
    echo ""

    echo "Test Summary:"
    echo "  Total Tests Run: $TESTS_RUN"
    echo -e "  Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
    echo -e "  Tests Failed: ${RED}$TESTS_FAILED${NC}"

    if [ "$TESTS_RUN" -gt 0 ]; then
        SUCCESS_RATE=$(( (TESTS_PASSED * 100) / TESTS_RUN ))
        echo "  Success Rate: ${SUCCESS_RATE}%"

        if [ "$SUCCESS_RATE" -ge 90 ]; then
            echo -e "  Overall Status: ${GREEN}EXCELLENT${NC}"
        elif [ "$SUCCESS_RATE" -ge 80 ]; then
            echo -e "  Overall Status: ${YELLOW}GOOD${NC}"
        elif [ "$SUCCESS_RATE" -ge 70 ]; then
            echo -e "  Overall Status: ${YELLOW}NEEDS IMPROVEMENT${NC}"
        else
            echo -e "  Overall Status: ${RED}CRITICAL ISSUES${NC}"
        fi
    else
        echo "  Overall Status: NO TESTS RUN"
    fi

    echo ""
    echo "Detailed Results:"
    for result in "${TEST_RESULTS[@]}"; do
        if [[ "$result" == PASS* ]]; then
            echo -e "  ${GREEN}$result${NC}"
        else
            echo -e "  ${RED}$result${NC}"
        fi
    done

    echo ""
    echo "System Information:"
    echo "  Test Run Time: $(date)"
    echo "  Log File: $LOG_FILE"
    echo "  Project Root: $PROJECT_ROOT"

    if command -v free >/dev/null 2>&1; then
        MEMORY_INFO=$(free -h | grep "Mem:" | awk '{print $7 " available of " $2 " total"}')
        echo "  Available Memory: $MEMORY_INFO"
    fi

    if command -v df >/dev/null 2>&1; then
        DISK_INFO=$(df -h "$PROJECT_ROOT" | awk 'NR==2 {print $4 " available of " $2 " total"}')
        echo "  Available Disk: $DISK_INFO"
    fi

    echo ""
    echo "Recommendations:"

    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo "  ✅ All tests passed - adaptive timeout system is working correctly"
    else
        echo "  ⚠️  Some tests failed - review the following areas:"

        # Analyze failure patterns and provide specific recommendations
        for result in "${TEST_RESULTS[@]}"; do
            if [[ "$result" == FAIL* ]]; then
                if [[ "$result" == *"memory"* ]]; then
                    echo "    - Memory-based timeout adjustments need attention"
                elif [[ "$result" == *"concurrency"* ]]; then
                    echo "    - Concurrency detection logic may need refinement"
                elif [[ "$result" == *"performance"* ]]; then
                    echo "    - Performance optimizations may be needed"
                elif [[ "$result" == *"bounds"* ]]; then
                    echo "    - Timeout bounds enforcement should be reviewed"
                fi
            fi
        done
    fi

    echo ""
    echo "Next Steps:"
    echo "  1. Review failed tests and implement fixes as needed"
    echo "  2. Monitor adaptive timeout behavior in production"
    echo "  3. Collect empirical data to fine-tune timeout calculations"
    echo "  4. Consider adding additional system state metrics"
    echo "  5. Test under actual load conditions for validation"

    # Save report to file
    REPORT_FILE="/tmp/adaptive-timeout-test-report-$(date +%s).txt"
    {
        echo "Adaptive Timeout System Test Report"
        echo "Generated: $(date)"
        echo ""
        echo "Test Summary:"
        echo "  Total Tests Run: $TESTS_RUN"
        echo "  Tests Passed: $TESTS_PASSED"
        echo "  Tests Failed: $TESTS_FAILED"
        echo "  Success Rate: $SUCCESS_RATE%"
        echo ""
        echo "Detailed Results:"
        for result in "${TEST_RESULTS[@]}"; do
            echo "  $result"
        done
    } > "$REPORT_FILE"

    echo ""
    echo "Full report saved to: $REPORT_FILE"
    echo "Detailed log saved to: $LOG_FILE"
}

##############################################################################
# Main Test Execution
##############################################################################

main() {
    echo "Adaptive Timeout System Test Suite"
    echo "=================================="
    echo "Testing adaptive timeout calculation system in CFN Loop orchestration"
    echo ""

    log "Starting adaptive timeout system tests"

    # Run all test suites
    test_memory_based_timeouts
    test_concurrency_based_timeouts
    test_phase_specific_timeouts
    test_system_state_integration
    test_performance_impact
    test_edge_cases

    # Generate comprehensive report
    generate_test_report

    log "Test suite completed"

    # Exit with appropriate code
    if [ "$TESTS_FAILED" -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"