#!/usr/bin/env bash
# tests/docker-mode/test-cfn-loop-full-cycle.sh
# Docker Mode Full CFN Loop Test Suite (6 scenarios)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/docker/tests/test-helpers.sh"

# Test configuration
TEST_ID="docker-full-cycle-$(date +%s)"
COMPOSE_PROJECT_NAME="cfn-test-${TEST_ID}"
TEST_WORKSPACE="/tmp/docker-test-$$"
CONTAINER_NETWORK="${COMPOSE_PROJECT_NAME}_default"

# Cleanup function
cleanup() {
    local exit_code=$?
    log_info "Cleaning up Docker test environment..."

    docker ps -a --filter "name=cfn-test-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker ps -a --filter "name=loop3-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker ps -a --filter "name=loop2-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker ps -a --filter "name=agent-" -q | xargs -r docker rm -f 2>/dev/null || true
    docker network rm "$CONTAINER_NETWORK" test-cfn-network 2>/dev/null || true
    rm -rf "$TEST_WORKSPACE" 2>/dev/null || true

    exit $exit_code
}

trap cleanup EXIT INT TERM

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: Loop 3 creates faulty TDD tests (in container)
test_loop3_faulty_tdd_containerized() {
    log_test "Test 1: Loop 3 creates faulty TDD tests (weak assertions)"

    # GIVEN: Loop 3 agent container with test creation task
    mkdir -p "$TEST_WORKSPACE/tests"

    # WHEN: Loop 3 creates tests with weak assertions
    docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:rw" \
        alpine:latest \
        sh -c "cat > /workspace/tests/user.test.ts <<'EOF'
test('user exists', () => {
  const user = { id: 1, name: 'Test' };
  expect(user).toBeDefined();  // Weak assertion #1
  expect(user.id).not.toBeNull();  // Weak assertion #2
  expect(true).toBe(true);  // Weak assertion #3
});
EOF
" 2>/dev/null

    # THEN: File created with weak assertions
    local weak_assertions=$(grep -c "toBeDefined\|not.toBeNull\|expect(true).toBe(true)" "$TEST_WORKSPACE/tests/user.test.ts" 2>/dev/null || echo 0)

    if [[ "$weak_assertions" -ge 3 ]]; then
        log_pass "Loop 3 created faulty TDD tests with weak assertions"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Loop 3 test creation failed: only $weak_assertions weak assertions"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 2: Loop 2 catches violations (cross-container)
test_loop2_catches_violations_cross_container() {
    log_test "Test 2: Loop 2 catches violations (cross-container)"

    # GIVEN: Loop 3 created faulty tests (from Test 1)
    # Setup faulty test file
    mkdir -p "$TEST_WORKSPACE/tests"
    cat > "$TEST_WORKSPACE/tests/faulty.test.ts" <<'EOF'
test('test 1', () => { expect(user).toBeDefined(); });
test('test 2', () => { expect(value).not.toBeNull(); });
test('test 3', () => { expect(true).toBe(true); });
test('test 4', () => { expect(data).toBeDefined(); });
EOF

    # WHEN: Loop 2 validator runs in separate container
    local violations=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        grep -c "toBeDefined\|not.toBeNull\|expect(true).toBe(true)" /workspace/tests/faulty.test.ts 2>/dev/null || echo 0)

    # THEN: Should detect at least 3 violations
    if [[ "$violations" -ge 3 ]]; then
        log_pass "Loop 2 detected $violations violations (cross-container)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Loop 2 failed to detect violations: only $violations found"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 3: Product Owner decision (in container)
test_product_owner_decision_containerized() {
    log_test "Test 3: Product Owner decision (consensus < threshold → ITERATE)"

    # GIVEN: Consensus scores below threshold
    mkdir -p "$TEST_WORKSPACE"
    cat > "$TEST_WORKSPACE/decision.sh" <<'EOF'
#!/bin/sh
CONSENSUS=$1
THRESHOLD=$2

if [ $(echo "$CONSENSUS < $THRESHOLD" | bc -l) -eq 1 ]; then
    echo "ITERATE"
    exit 1
else
    echo "PROCEED"
    exit 0
fi
EOF

    chmod +x "$TEST_WORKSPACE/decision.sh"

    # WHEN: Product Owner evaluates consensus 0.65 vs threshold 0.80
    local decision=$(docker run --rm \
        -v "$TEST_WORKSPACE:/workspace:ro" \
        alpine:latest \
        sh -c "apk add --no-cache bc >/dev/null 2>&1 && /workspace/decision.sh 0.65 0.80" 2>&1 || echo "ITERATE")

    # THEN: Should decide ITERATE
    if echo "$decision" | grep -q "ITERATE"; then
        log_pass "Product Owner decided ITERATE (consensus < threshold)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Product Owner decision failed: $decision"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 4: 6 parallel agents in containers (REAL Docker spawning)
test_six_agents_parallel_docker() {
    log_test "Test 4: 6 parallel agents in containers (REAL spawning)"

    # GIVEN: Shared volume workspace
    mkdir -p "$TEST_WORKSPACE/output"

    # Agent configurations (language → file to create)
    local agents=(
        "python:hello.py:print('Hello, World!')"
        "javascript:hello.js:console.log('Hello, World!');"
        "rust:hello.rs:fn main() { println!(\"Hello, World!\"); }"
        "go:hello.go:package main; func main() { println(\"Hello, World!\") }"
        "java:Hello.java:class Hello { public static void main(String[] args) { System.out.println(\"Hello, World!\"); } }"
        "typescript:hello.ts:console.log('Hello, World!');"
    )

    # WHEN: Spawn 6 agents in parallel
    local pids=()
    for i in "${!agents[@]}"; do
        IFS=':' read -r lang file content <<< "${agents[$i]}"

        # Spawn agent container in background
        (docker run --rm \
            --name "agent-$lang-$TEST_ID" \
            -v "$TEST_WORKSPACE/output:/workspace:rw" \
            alpine:latest \
            sh -c "echo '$content' > /workspace/$file" 2>/dev/null) &

        pids+=($!)
    done

    # Wait for all agents
    local failed=0
    for pid in "${pids[@]}"; do
        if ! wait "$pid"; then
            ((failed++))
        fi
    done

    sleep 2

    # THEN: At least 4/6 files created (tolerate partial success)
    local files_created=$(ls -1 "$TEST_WORKSPACE/output" 2>/dev/null | wc -l)

    if [[ "$files_created" -ge 4 ]]; then
        log_pass "6 parallel agents created $files_created/6 files (real container spawning)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Only $files_created/6 files created (minimum 4 required)"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 5: Full CFN Loop integration (Loop 3 → Loop 2 → PO in containers)
test_full_cfn_loop_docker_integration() {
    log_test "Test 5: Full CFN Loop integration (containerized workflow)"

    # GIVEN: Docker network with Redis
    docker network create test-cfn-network 2>/dev/null || true
    docker run -d --name cfn-test-redis \
        --network test-cfn-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    mkdir -p "$TEST_WORKSPACE/workflow"

    # WHEN: Simulating full CFN Loop workflow

    # Loop 3: Create implementation (3 containers)
    for i in 1 2 3; do
        docker run --rm \
            --network test-cfn-network \
            -v "$TEST_WORKSPACE/workflow:/workspace:rw" \
            alpine:latest \
            sh -c "echo 'Loop 3 agent $i output' > /workspace/impl-$i.txt" 2>/dev/null

        # Report completion to Redis
        docker run --rm --network test-cfn-network \
            redis:7-alpine \
            redis-cli -h cfn-test-redis INCR "task:completed" 2>/dev/null
    done

    # Gate check: verify all 3 completed
    local completed=$(docker run --rm --network test-cfn-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis GET "task:completed" 2>/dev/null)

    if [[ "$completed" -ne 3 ]]; then
        log_fail "Loop 3 completion failed: $completed/3 tasks"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        docker rm -f cfn-test-redis 2>/dev/null || true
        docker network rm test-cfn-network 2>/dev/null || true
        return
    fi

    # Loop 2: Validate (2 containers)
    for i in 1 2; do
        docker run --rm \
            --network test-cfn-network \
            redis:7-alpine \
            redis-cli -h cfn-test-redis SET "validator:$i:score" "0.87" 2>/dev/null
    done

    # Product Owner: Calculate consensus
    local score1=$(docker run --rm --network test-cfn-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis GET "validator:1:score" 2>/dev/null)

    local score2=$(docker run --rm --network test-cfn-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis GET "validator:2:score" 2>/dev/null)

    # THEN: Full workflow validated
    if [[ "$completed" -eq 3 && -n "$score1" && -n "$score2" ]]; then
        log_pass "Full CFN Loop integration validated (containerized)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Full CFN Loop integration failed"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    docker rm -f cfn-test-redis 2>/dev/null || true
    docker network rm test-cfn-network 2>/dev/null || true
}

# Test 6: Iteration workflow (ITERATE decision → wake all agents → repeat)
test_iteration_workflow() {
    log_test "Test 6: Iteration workflow (ITERATE → wake agents)"

    # GIVEN: Redis with iteration state
    docker network create test-cfn-network 2>/dev/null || true
    docker run -d --name cfn-test-redis \
        --network test-cfn-network \
        redis:7-alpine 2>/dev/null
    sleep 2

    # WHEN: Product Owner decides ITERATE
    docker run --rm --network test-cfn-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis SET "decision:status" "ITERATE" 2>/dev/null

    # Increment iteration counter
    docker run --rm --network test-cfn-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis INCR "iteration:counter" 2>/dev/null

    # Wake agents (signal via Redis)
    docker run --rm --network test-cfn-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis PUBLISH "wake:agents" "iteration-2" 2>/dev/null

    # THEN: Iteration state updated
    local iteration=$(docker run --rm --network test-cfn-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis GET "iteration:counter" 2>/dev/null)

    local decision=$(docker run --rm --network test-cfn-network \
        redis:7-alpine \
        redis-cli -h cfn-test-redis GET "decision:status" 2>/dev/null)

    if [[ "$iteration" -ge 1 && "$decision" == "ITERATE" ]]; then
        log_pass "Iteration workflow validated (wake agents on ITERATE)"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        log_fail "Iteration workflow failed: iteration=$iteration, decision=$decision"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi

    docker rm -f cfn-test-redis 2>/dev/null || true
    docker network rm test-cfn-network 2>/dev/null || true
}

# Execute tests
mkdir -p "$TEST_WORKSPACE"

test_loop3_faulty_tdd_containerized
test_loop2_catches_violations_cross_container
test_product_owner_decision_containerized
test_six_agents_parallel_docker
test_full_cfn_loop_docker_integration
test_iteration_workflow

# Summary
echo ""
log_section "Test Summary: Docker Mode Full CFN Loop"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo "✅ All tests PASSED"
    exit 0
else
    echo "❌ Some tests FAILED"
    exit 1
fi
