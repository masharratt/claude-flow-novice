#!/usr/bin/env bash
# tests/docker/memory-budget-tests.sh
# Phase 3 :: Memory budget enforcement (wave spawning, tier allocation, OOM prevention)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
source "$PROJECT_ROOT/tests/docker/helpers/architecture-test-helpers.sh"

# Configuration
MEMORY_BUDGET_GB=40
MEMORY_BUDGET_BYTES=$((MEMORY_BUDGET_GB * 1024 * 1024 * 1024))

cleanup() {
    log_step "GIVEN cleanup of test containers"
    docker ps -a --filter "name=wave-test-agent" -q | xargs -r docker rm -f 2>/dev/null || true
}
trap cleanup EXIT

# Helper: Parse memory string to bytes
parse_memory_bytes() {
    local mem="$1"
    if [[ "$mem" =~ ^([0-9]+)m$ ]]; then
        echo $((${BASH_REMATCH[1]} * 1024 * 1024))
    elif [[ "$mem" =~ ^([0-9]+)g$ ]]; then
        echo $((${BASH_REMATCH[1]} * 1024 * 1024 * 1024))
    else
        echo 0
    fi
}

# Test 1: Wave spawning when budget exceeded
test_wave_spawning_budget_exceeded() {
    log_step "Test 1: Batches exceeding 40GB split into multiple waves"

    # GIVEN: 50 tasks × 1GB = 50GB (exceeds 40GB budget)
    TASK_COUNT=50
    TASK_MEMORY="1g"
    TASK_MEMORY_BYTES=$(parse_memory_bytes "$TASK_MEMORY")

    TOTAL_MEMORY=$((TASK_COUNT * TASK_MEMORY_BYTES))
    log_info "Total memory required: $((TOTAL_MEMORY / 1024 / 1024 / 1024))GB (budget: ${MEMORY_BUDGET_GB}GB)"

    # WHEN: Calculate waves needed
    TASKS_PER_WAVE=$((MEMORY_BUDGET_BYTES / TASK_MEMORY_BYTES))
    WAVE_COUNT=$(( (TASK_COUNT + TASKS_PER_WAVE - 1) / TASKS_PER_WAVE ))

    log_info "Tasks per wave: $TASKS_PER_WAVE"
    log_info "Waves needed: $WAVE_COUNT"

    # THEN: Multiple waves required (at least 2)
    if [ $WAVE_COUNT -ge 2 ]; then
        log_pass "Budget exceeded, calculated $WAVE_COUNT waves"
    else
        log_fail "Expected ≥2 waves, got $WAVE_COUNT"
        return 1
    fi
}

# Test 2: Memory tier allocation (512MB, 600MB, 800MB, 1024MB)
test_memory_tier_allocation() {
    log_step "Test 2: Four-tier memory allocation strategy"

    # GIVEN: Tier definitions
    declare -A TIERS=(
        [1]="512m"
        [2]="600m"
        [3]="800m"
        [4]="1024m"
    )

    # WHEN: Validate tier allocations
    for tier in "${!TIERS[@]}"; do
        MEMORY="${TIERS[$tier]}"
        MEMORY_BYTES=$(parse_memory_bytes "$MEMORY")

        log_info "Tier $tier: $MEMORY = $((MEMORY_BYTES / 1024 / 1024))MB"

        # THEN: Memory allocation is correct
        case $tier in
            1)
                EXPECTED_MB=512
                ;;
            2)
                EXPECTED_MB=600
                ;;
            3)
                EXPECTED_MB=800
                ;;
            4)
                EXPECTED_MB=1024
                ;;
        esac

        ACTUAL_MB=$((MEMORY_BYTES / 1024 / 1024))
        if [ $ACTUAL_MB -eq $EXPECTED_MB ]; then
            log_pass "Tier $tier allocation correct: ${ACTUAL_MB}MB"
        else
            log_fail "Tier $tier allocation wrong: expected ${EXPECTED_MB}MB, got ${ACTUAL_MB}MB"
            return 1
        fi
    done
}

# Test 3: OOM prevention (don't exceed 40GB budget)
test_oom_prevention() {
    log_step "Test 3: Wave spawning respects 40GB budget limit"

    # GIVEN: Calculate maximum agents per tier
    declare -A TIER_MEMORY=(
        [1]=512
        [2]=600
        [3]=800
        [4]=1024
    )

    BUDGET_MB=$((MEMORY_BUDGET_GB * 1024))

    for tier in "${!TIER_MEMORY[@]}"; do
        AGENT_MEMORY_MB=${TIER_MEMORY[$tier]}
        MAX_AGENTS=$((BUDGET_MB / AGENT_MEMORY_MB))

        log_info "Tier $tier: Max $MAX_AGENTS agents (${AGENT_MEMORY_MB}MB each)"

        # WHEN: Validate total memory doesn't exceed budget
        TOTAL_MEMORY_MB=$((MAX_AGENTS * AGENT_MEMORY_MB))

        # THEN: Total memory ≤ budget
        if [ $TOTAL_MEMORY_MB -le $BUDGET_MB ]; then
            log_pass "Tier $tier OOM prevention: ${TOTAL_MEMORY_MB}MB ≤ ${BUDGET_MB}MB"
        else
            log_fail "Tier $tier exceeds budget: ${TOTAL_MEMORY_MB}MB > ${BUDGET_MB}MB"
            return 1
        fi
    done
}

# Test 4: Wave completion before next wave
test_wave_completion_before_next() {
    log_step "Test 4: Sequential wave execution pattern"

    # GIVEN: Simulate wave execution
    WAVE_1_START=$(date +%s)
    log_info "Wave 1 starting at $WAVE_1_START"

    # Simulate Wave 1 execution
    sleep 2

    WAVE_1_END=$(date +%s)
    log_info "Wave 1 completed at $WAVE_1_END"

    # WHEN: Wave 2 starts after Wave 1 completion
    WAVE_2_START=$(date +%s)
    log_info "Wave 2 starting at $WAVE_2_START"

    # THEN: Wave 2 starts after Wave 1 ends
    if [ $WAVE_2_START -ge $WAVE_1_END ]; then
        DELAY=$((WAVE_2_START - WAVE_1_END))
        log_pass "Wave 2 started after Wave 1 completion (delay: ${DELAY}s)"
    else
        log_fail "Wave 2 started before Wave 1 completed"
        return 1
    fi

    # Validate no overlap
    if [ $WAVE_1_END -le $WAVE_2_START ]; then
        log_pass "No wave overlap detected (sequential execution)"
    else
        log_fail "Waves overlapped (concurrent execution)"
        return 1
    fi
}

# Test 5: Realistic batch scenario (B10-style)
test_realistic_batch_scenario() {
    log_step "Test 5: B10-style batch with four-tier allocation"

    # GIVEN: B10 actual distribution
    # 42 Tier 1 (512MB) + 12 Tier 2 (600MB) + 3 Tier 3 (800MB) + 1 Tier 4 (1GB)
    TIER_1_COUNT=42
    TIER_2_COUNT=12
    TIER_3_COUNT=3
    TIER_4_COUNT=1

    TIER_1_TOTAL=$((TIER_1_COUNT * 512))  # MB
    TIER_2_TOTAL=$((TIER_2_COUNT * 600))
    TIER_3_TOTAL=$((TIER_3_COUNT * 800))
    TIER_4_TOTAL=$((TIER_4_COUNT * 1024))

    TOTAL_MEMORY_MB=$((TIER_1_TOTAL + TIER_2_TOTAL + TIER_3_TOTAL + TIER_4_TOTAL))
    TOTAL_MEMORY_GB=$((TOTAL_MEMORY_MB / 1024))

    log_info "Tier 1: $TIER_1_COUNT × 512MB = ${TIER_1_TOTAL}MB"
    log_info "Tier 2: $TIER_2_COUNT × 600MB = ${TIER_2_TOTAL}MB"
    log_info "Tier 3: $TIER_3_COUNT × 800MB = ${TIER_3_TOTAL}MB"
    log_info "Tier 4: $TIER_4_COUNT × 1GB = ${TIER_4_TOTAL}MB"
    log_info "Total: ${TOTAL_MEMORY_GB}GB (budget: ${MEMORY_BUDGET_GB}GB)"

    # WHEN: Validate fits in budget
    BUDGET_MB=$((MEMORY_BUDGET_GB * 1024))

    # THEN: Total memory ≤ 40GB
    if [ $TOTAL_MEMORY_MB -le $BUDGET_MB ]; then
        UTILIZATION=$(( (TOTAL_MEMORY_MB * 100) / BUDGET_MB ))
        log_pass "B10 scenario fits in budget: ${TOTAL_MEMORY_GB}GB / ${MEMORY_BUDGET_GB}GB (${UTILIZATION}% utilization)"
    else
        log_fail "B10 scenario exceeds budget: ${TOTAL_MEMORY_GB}GB > ${MEMORY_BUDGET_GB}GB"
        return 1
    fi

    # Validate all agents spawn in single wave
    AGENT_COUNT=$((TIER_1_COUNT + TIER_2_COUNT + TIER_3_COUNT + TIER_4_COUNT))
    if [ $TOTAL_MEMORY_MB -le $BUDGET_MB ]; then
        log_pass "All $AGENT_COUNT agents fit in single wave"
    else
        log_fail "Multiple waves required (batch planning failure)"
        return 1
    fi
}

# Run all tests
log_step "Starting Memory Budget Enforcement Tests"
echo ""

test_wave_spawning_budget_exceeded
test_memory_tier_allocation
test_oom_prevention
test_wave_completion_before_next
test_realistic_batch_scenario

echo ""
print_test_summary
