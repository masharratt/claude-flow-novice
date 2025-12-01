#!/bin/bash
# planning/trigger/tests/phase2/test-result-independence.sh
# Phase 2 :: Validate independent result capture from concurrent agents
# Tests: Result isolation, stdout/stderr separation, exit code handling

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test configuration
TASK_ID="phase2-results-$(date +%s)"
NETWORK_NAME="cfn-results-net-${TASK_ID}"
RESULTS_DIR="/tmp/results-${TASK_ID}"

cleanup() {
    log_info "Cleaning up test artifacts"
    docker rm -f "cfn-result-${TASK_ID}-0" "cfn-result-${TASK_ID}-1" "cfn-result-${TASK_ID}-2" 2>/dev/null || true
    docker rm -f "cfn-stdout-${TASK_ID}-0" "cfn-stdout-${TASK_ID}-1" "cfn-stdout-${TASK_ID}-2" 2>/dev/null || true
    docker rm -f "cfn-exit-${TASK_ID}-0" "cfn-exit-${TASK_ID}-1" "cfn-exit-${TASK_ID}-2" 2>/dev/null || true
    docker network rm "${NETWORK_NAME}" 2>/dev/null || true
    rm -rf "${RESULTS_DIR}" 2>/dev/null || true
}
trap cleanup EXIT

# ============================================================================
# Test 1: Independent Result Capture (No Cross-Contamination)
# ============================================================================
test_independent_result_capture() {
    log_step "GIVEN 3 agents producing different results"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1
    mkdir -p "${RESULTS_DIR}"

    # WHEN agents write results to shared volume
    log_info "Spawning agents with independent outputs"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-result-${TASK_ID}-${idx}" \
            --network "${NETWORK_NAME}" \
            -v "${RESULTS_DIR}:/output:rw" \
            alpine:latest \
            sh -c "echo 'Agent ${idx} result: $(date +%s%N)' > /output/result-${idx}.json; sleep 5" >/dev/null 2>&1
    done

    # Wait for all agents to complete
    docker wait "cfn-result-${TASK_ID}-0" >/dev/null 2>&1
    docker wait "cfn-result-${TASK_ID}-1" >/dev/null 2>&1
    docker wait "cfn-result-${TASK_ID}-2" >/dev/null 2>&1

    # THEN verify each result file is independent
    log_info "Verifying result independence"

    local contaminated=0
    for idx in 0 1 2; do
        local result_content=$(cat "${RESULTS_DIR}/result-${idx}.json" 2>/dev/null || echo "missing")

        # Verify result belongs to correct agent
        if [[ "$result_content" =~ "Agent ${idx} result:" ]]; then
            log_success "✓ Agent ${idx}: Result captured independently"

            # Verify no cross-contamination from other agents
            local other_agents=$(echo "$result_content" | grep -c "Agent [^${idx}]" || echo 0)
            if [ "$other_agents" -gt 0 ]; then
                log_warn "✗ Agent ${idx}: Cross-contamination detected"
                contaminated=$((contaminated + 1))
            fi
        else
            log_warn "✗ Agent ${idx}: Result missing or incorrect"
            contaminated=$((contaminated + 1))
        fi
    done

    # Cleanup
    docker rm -f "cfn-result-${TASK_ID}-0" "cfn-result-${TASK_ID}-1" "cfn-result-${TASK_ID}-2" 2>/dev/null || true

    if [ "$contaminated" -eq 0 ]; then
        log_success "✓ All results captured independently (0 contamination)"
        return 0
    else
        log_error "✗ Result contamination detected: ${contaminated}/3"
        return 1
    fi
}

# ============================================================================
# Test 2: Stdout Separation (No Interleaving)
# ============================================================================
test_stdout_separation() {
    log_step "GIVEN 3 agents writing to stdout concurrently"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN agents produce stdout output
    log_info "Testing stdout separation"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-stdout-${TASK_ID}-${idx}" \
            --network "${NETWORK_NAME}" \
            alpine:latest \
            sh -c "for i in \$(seq 1 10); do echo 'Agent ${idx} line \$i'; done; sleep 2" >/dev/null 2>&1
    done

    # Wait for completion
    docker wait "cfn-stdout-${TASK_ID}-0" >/dev/null 2>&1
    docker wait "cfn-stdout-${TASK_ID}-1" >/dev/null 2>&1
    docker wait "cfn-stdout-${TASK_ID}-2" >/dev/null 2>&1

    # THEN verify stdout is captured separately per agent
    log_info "Verifying stdout separation"

    local interleaved=0
    for idx in 0 1 2; do
        local stdout=$(docker logs "cfn-stdout-${TASK_ID}-${idx}" 2>/dev/null || echo "")
        local expected_lines=10
        local actual_lines=$(echo "$stdout" | grep -c "Agent ${idx}" || echo 0)

        if [ "$actual_lines" -eq "$expected_lines" ]; then
            # Verify no lines from other agents
            local other_lines=$(echo "$stdout" | grep -c "Agent [^${idx}]" || echo 0)
            if [ "$other_lines" -eq 0 ]; then
                log_success "✓ Agent ${idx}: Stdout isolated (${actual_lines} lines)"
            else
                log_warn "✗ Agent ${idx}: Stdout interleaving detected (${other_lines} foreign lines)"
                interleaved=$((interleaved + 1))
            fi
        else
            log_warn "✗ Agent ${idx}: Expected ${expected_lines} lines, got ${actual_lines}"
            interleaved=$((interleaved + 1))
        fi
    done

    # Cleanup
    docker rm -f "cfn-stdout-${TASK_ID}-0" "cfn-stdout-${TASK_ID}-1" "cfn-stdout-${TASK_ID}-2" 2>/dev/null || true

    if [ "$interleaved" -eq 0 ]; then
        log_success "✓ Stdout separation verified (0 interleaving)"
        return 0
    else
        log_error "✗ Stdout interleaving detected: ${interleaved}/3"
        return 1
    fi
}

# ============================================================================
# Test 3: Stderr Separation
# ============================================================================
test_stderr_separation() {
    log_step "GIVEN 3 agents writing to stderr concurrently"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN agents produce stderr output
    log_info "Testing stderr separation"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-stdout-${TASK_ID}-${idx}" \
            --network "${NETWORK_NAME}" \
            alpine:latest \
            sh -c "for i in \$(seq 1 5); do echo 'Error ${idx}.\$i' >&2; done; sleep 2" >/dev/null 2>&1
    done

    # Wait for completion
    docker wait "cfn-stdout-${TASK_ID}-0" >/dev/null 2>&1
    docker wait "cfn-stdout-${TASK_ID}-1" >/dev/null 2>&1
    docker wait "cfn-stdout-${TASK_ID}-2" >/dev/null 2>&1

    # THEN verify stderr is captured separately per agent
    log_info "Verifying stderr separation"

    local interleaved=0
    for idx in 0 1 2; do
        local stderr=$(docker logs "cfn-stdout-${TASK_ID}-${idx}" 2>&1 | grep "Error ${idx}" || echo "")
        local expected_lines=5
        local actual_lines=$(echo "$stderr" | wc -l)

        if [ "$actual_lines" -eq "$expected_lines" ]; then
            log_success "✓ Agent ${idx}: Stderr isolated (${actual_lines} lines)"
        else
            log_warn "✗ Agent ${idx}: Expected ${expected_lines} stderr lines, got ${actual_lines}"
            interleaved=$((interleaved + 1))
        fi
    done

    # Cleanup
    docker rm -f "cfn-stdout-${TASK_ID}-0" "cfn-stdout-${TASK_ID}-1" "cfn-stdout-${TASK_ID}-2" 2>/dev/null || true

    if [ "$interleaved" -eq 0 ]; then
        log_success "✓ Stderr separation verified"
        return 0
    else
        log_error "✗ Stderr separation issues: ${interleaved}/3"
        return 1
    fi
}

# ============================================================================
# Test 4: Exit Code Independence
# ============================================================================
test_exit_code_independence() {
    log_step "GIVEN 3 agents with different exit codes"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1

    # WHEN agents exit with different codes (0, 1, 2)
    log_info "Testing exit code independence"

    docker run -d \
        --name "cfn-exit-${TASK_ID}-0" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sh -c "echo 'success'; exit 0" >/dev/null 2>&1

    docker run -d \
        --name "cfn-exit-${TASK_ID}-1" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sh -c "echo 'error'; exit 1" >/dev/null 2>&1

    docker run -d \
        --name "cfn-exit-${TASK_ID}-2" \
        --network "${NETWORK_NAME}" \
        alpine:latest \
        sh -c "echo 'custom error'; exit 2" >/dev/null 2>&1

    # Wait for completion
    docker wait "cfn-exit-${TASK_ID}-0" >/dev/null 2>&1 || true
    docker wait "cfn-exit-${TASK_ID}-1" >/dev/null 2>&1 || true
    docker wait "cfn-exit-${TASK_ID}-2" >/dev/null 2>&1 || true

    # THEN verify each exit code is captured independently
    log_info "Verifying exit code independence"

    local exit_0=$(docker inspect "cfn-exit-${TASK_ID}-0" --format '{{.State.ExitCode}}' 2>/dev/null || echo "-1")
    local exit_1=$(docker inspect "cfn-exit-${TASK_ID}-1" --format '{{.State.ExitCode}}' 2>/dev/null || echo "-1")
    local exit_2=$(docker inspect "cfn-exit-${TASK_ID}-2" --format '{{.State.ExitCode}}' 2>/dev/null || echo "-1")

    log_info "Exit codes: Agent 0=$exit_0, Agent 1=$exit_1, Agent 2=$exit_2"

    # Cleanup
    docker rm -f "cfn-exit-${TASK_ID}-0" "cfn-exit-${TASK_ID}-1" "cfn-exit-${TASK_ID}-2" 2>/dev/null || true

    if [ "$exit_0" -eq 0 ] && [ "$exit_1" -eq 1 ] && [ "$exit_2" -eq 2 ]; then
        log_success "✓ Exit codes captured independently"
        return 0
    else
        log_error "✗ Exit code mismatch (expected: 0,1,2; got: ${exit_0},${exit_1},${exit_2})"
        return 1
    fi
}

# ============================================================================
# Test 5: Concurrent JSON Result Parsing
# ============================================================================
test_concurrent_json_parsing() {
    log_step "GIVEN 3 agents producing JSON results"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1
    mkdir -p "${RESULTS_DIR}"

    # WHEN agents produce JSON output
    log_info "Testing concurrent JSON result capture"

    for idx in 0 1 2; do
        docker run -d \
            --name "cfn-result-${TASK_ID}-${idx}" \
            --network "${NETWORK_NAME}" \
            -v "${RESULTS_DIR}:/output:rw" \
            alpine:latest \
            sh -c "echo '{\"agent\": ${idx}, \"status\": \"completed\", \"timestamp\": '$(date +%s)'}' > /output/agent-${idx}.json; sleep 2" >/dev/null 2>&1
    done

    # Wait for completion
    docker wait "cfn-result-${TASK_ID}-0" >/dev/null 2>&1
    docker wait "cfn-result-${TASK_ID}-1" >/dev/null 2>&1
    docker wait "cfn-result-${TASK_ID}-2" >/dev/null 2>&1

    # THEN verify JSON is valid and independent
    log_info "Verifying JSON result independence"

    local valid_json=0
    for idx in 0 1 2; do
        local json_file="${RESULTS_DIR}/agent-${idx}.json"
        if [ -f "$json_file" ]; then
            # Validate JSON syntax
            if command -v jq >/dev/null 2>&1; then
                if jq empty "$json_file" 2>/dev/null; then
                    local agent_id=$(jq -r '.agent' "$json_file" 2>/dev/null)
                    if [ "$agent_id" -eq "$idx" ]; then
                        log_success "✓ Agent ${idx}: Valid JSON with correct agent ID"
                        valid_json=$((valid_json + 1))
                    else
                        log_warn "✗ Agent ${idx}: JSON agent ID mismatch (expected ${idx}, got ${agent_id})"
                    fi
                else
                    log_warn "✗ Agent ${idx}: Invalid JSON"
                fi
            else
                # Fallback: basic pattern matching
                if grep -q "\"agent\": ${idx}" "$json_file"; then
                    log_success "✓ Agent ${idx}: JSON contains correct agent ID"
                    valid_json=$((valid_json + 1))
                else
                    log_warn "✗ Agent ${idx}: JSON agent ID missing or incorrect"
                fi
            fi
        else
            log_warn "✗ Agent ${idx}: JSON file not found"
        fi
    done

    # Cleanup
    docker rm -f "cfn-result-${TASK_ID}-0" "cfn-result-${TASK_ID}-1" "cfn-result-${TASK_ID}-2" 2>/dev/null || true

    if [ "$valid_json" -eq 3 ]; then
        log_success "✓ All JSON results valid and independent"
        return 0
    else
        log_error "✗ JSON validation failures: $((3 - valid_json))/3"
        return 1
    fi
}

# ============================================================================
# Test 6: Result Timing Independence (No Sequential Blocking)
# ============================================================================
test_result_timing_independence() {
    log_step "GIVEN 3 agents with staggered completion times"

    docker network create "${NETWORK_NAME}" >/dev/null 2>&1
    mkdir -p "${RESULTS_DIR}"

    # WHEN agents complete at different times (2s, 5s, 8s)
    log_info "Testing result timing independence"

    local start_time=$(date +%s)

    for idx in 0 1 2; do
        local sleep_time=$((2 + idx * 3))  # 2s, 5s, 8s
        docker run -d \
            --name "cfn-result-${TASK_ID}-${idx}" \
            --network "${NETWORK_NAME}" \
            -v "${RESULTS_DIR}:/output:rw" \
            alpine:latest \
            sh -c "sleep ${sleep_time}; echo 'Agent ${idx} done' > /output/timing-${idx}.txt" >/dev/null 2>&1
    done

    # Wait for all
    docker wait "cfn-result-${TASK_ID}-0" >/dev/null 2>&1
    docker wait "cfn-result-${TASK_ID}-1" >/dev/null 2>&1
    docker wait "cfn-result-${TASK_ID}-2" >/dev/null 2>&1

    local end_time=$(date +%s)
    local total_time=$((end_time - start_time))

    # THEN results should be captured at different times (not blocked)
    log_info "Total execution time: ${total_time}s (expected ~8s for parallel, 15s for sequential)"

    # Cleanup
    docker rm -f "cfn-result-${TASK_ID}-0" "cfn-result-${TASK_ID}-1" "cfn-result-${TASK_ID}-2" 2>/dev/null || true

    # Verify all results captured
    local captured=0
    for idx in 0 1 2; do
        if [ -f "${RESULTS_DIR}/timing-${idx}.txt" ]; then
            captured=$((captured + 1))
        fi
    done

    if [ "$total_time" -le 10 ] && [ "$captured" -eq 3 ]; then
        log_success "✓ Result timing independence verified (${total_time}s, all captured)"
        return 0
    else
        log_error "✗ Timing issue or missing results (${total_time}s, ${captured}/3 captured)"
        return 1
    fi
}

# ============================================================================
# Execute Tests
# ============================================================================
annotate "Phase 2 :: Result Independence Tests"

test_independent_result_capture
test_stdout_separation
test_stderr_separation
test_exit_code_independence
test_concurrent_json_parsing
test_result_timing_independence

# ============================================================================
# Test Summary
# ============================================================================
annotate "Test Summary: Result Independence"
log_info "Total tests: $TEST_TOTAL"
log_info "Passed: $TEST_PASSED"
log_info "Failed: $TEST_FAILED"

if [ "$TEST_FAILED" -eq 0 ]; then
    log_success "All result independence tests passed"
    exit 0
else
    log_error "Some tests failed"
    exit 1
fi
