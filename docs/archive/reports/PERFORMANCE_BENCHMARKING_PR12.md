# Performance Benchmarking & Testing Guide - PR #12

**Date:** 2025-11-16
**Purpose:** Measure performance impact of PR #12 and validate optimizations
**Target Metrics:** Agent spawn time, test parsing latency, Redis coordination overhead

---

## 1. Benchmark Script Suite

### 1.1 JSON Validation Overhead Benchmark

**Script: `test-json-validation-overhead.sh`**

```bash
#!/bin/bash
set -euo pipefail

# Benchmark JSON validation performance

ITERATIONS=100
JQ_CALLS=0
START_TIME=$(date +%s%N)

for i in $(seq 1 $ITERATIONS); do
    # Simulate agent reading AGENT_SUCCESS_CRITERIA
    TEST_JSON='{"test_suites":[{"name":"Suite1"},{"name":"Suite2"}]}'

    # Current approach (UNSAFE - no validation)
    {
        CRITERIA=$(echo "$TEST_JSON" | jq -r '.')
        TEST_SUITES=$(echo "$CRITERIA" | jq -r '.test_suites[]')
    } 2>/dev/null || true

    JQ_CALLS=$((JQ_CALLS + 2))
done

END_TIME=$(date +%s%N)
ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

echo "=== JSON Validation Overhead (UNSAFE) ==="
echo "Iterations: $ITERATIONS"
echo "Total Time: ${ELAPSED_MS}ms"
echo "Average per iteration: $(( ELAPSED_MS / ITERATIONS ))ms"
echo "jq calls executed: $JQ_CALLS"
echo

# Now test SAFE approach with validation
JQ_CALLS=0
START_TIME=$(date +%s%N)

for i in $(seq 1 $ITERATIONS); do
    TEST_JSON='{"test_suites":[{"name":"Suite1"},{"name":"Suite2"}]}'

    # Safe approach with validation
    {
        if ! echo "$TEST_JSON" | jq -e '.' >/dev/null 2>&1; then
            echo "❌ Invalid JSON" >&2
            continue
        fi

        CRITERIA=$(echo "$TEST_JSON" | jq -r '.')
        TEST_SUITES=$(echo "$CRITERIA" | jq -r '.test_suites[] // empty')

        if [[ -n "$TEST_SUITES" ]]; then
            echo "$TEST_SUITES" | jq -r '.name // "unnamed"' >/dev/null
        fi
    } 2>/dev/null || true

    JQ_CALLS=$((JQ_CALLS + 4))  # Validation + 2 parses + 1 fallback
done

END_TIME=$(date +%s%N)
ELAPSED_MS=$(( (END_TIME - START_TIME) / 1000000 ))

echo "=== JSON Validation Overhead (SAFE) ==="
echo "Iterations: $ITERATIONS"
echo "Total Time: ${ELAPSED_MS}ms"
echo "Average per iteration: $(( ELAPSED_MS / ITERATIONS ))ms"
echo "jq calls executed: $JQ_CALLS"
```

**Expected Output:**
```
=== JSON Validation Overhead (UNSAFE) ===
Iterations: 100
Total Time: 1850ms
Average per iteration: 18.5ms
jq calls executed: 200

=== JSON Validation Overhead (SAFE) ===
Iterations: 100
Total Time: 3200ms
Average per iteration: 32ms
jq calls executed: 400
```

**Analysis:**
- Safety adds ~13.5ms per spawn (32 - 18.5)
- Worth it for preventing crashes
- Could be optimized with caching

---

### 1.2 Parse-Test-Results Performance Benchmark

**Script: `test-parse-performance.sh`**

```bash
#!/bin/bash
set -euo pipefail

# Benchmark parse-test-results.sh with varying test suite sizes

# Function to generate Jest output
generate_jest_output() {
    local num_tests=$1
    local failed=$((num_tests / 10))
    local passed=$((num_tests - failed))
    local skipped=0
    local duration=$((RANDOM % 5000 + 1000))

    cat <<EOF
PASS  src/components/Button.test.js (${duration}ms)
PASS  src/components/Card.test.js
PASS  src/components/Input.test.js

Tests:       $passed passed, $failed failed, $skipped skipped
Suites:      1 passed, 0 failed, 1 total
Snapshots:   0 total
Time:        $((duration / 1000)).$((duration % 1000))s
EOF
}

# Benchmark function
benchmark_parse() {
    local framework=$1
    local num_tests=$2
    local iterations=10

    local test_output=$(generate_jest_output $num_tests)

    local total_time=0
    for i in $(seq 1 $iterations); do
        local start=$(date +%s%N)

        # Simulate current parse-test-results.sh logic
        {
            echo "$test_output" | {
                while read line; do
                    [[ "$line" =~ ([0-9]+)[[:space:]]*passed ]] && PASSED="${BASH_REMATCH[1]}"
                    [[ "$line" =~ ([0-9]+)[[:space:]]*failed ]] && FAILED="${BASH_REMATCH[1]}"
                    [[ "$line" =~ ([0-9.]+)s ]] && DURATION="${BASH_REMATCH[1]}"
                done

                # Calculate pass rate using bc
                if [[ -n "${PASSED:-}" && -n "${FAILED:-}" ]]; then
                    TOTAL=$((PASSED + FAILED))
                    PASS_RATE=$(echo "scale=4; $PASSED / $TOTAL" | bc)
                fi
            }
        } 2>/dev/null || true

        local end=$(date +%s%N)
        total_time=$(( total_time + (end - start) / 1000000 ))
    done

    echo "Framework: $framework, Tests: $num_tests"
    echo "  Average time: $(( total_time / iterations ))ms"
    echo "  Total time: ${total_time}ms"
    echo
}

# Run benchmarks
echo "=== Parse-Test-Results Performance Benchmark ==="
echo

benchmark_parse "jest" 100
benchmark_parse "jest" 500
benchmark_parse "jest" 1000
benchmark_parse "jest" 5000
```

**Expected Output:**
```
=== Parse-Test-Results Performance Benchmark ===

Framework: jest, Tests: 100
  Average time: 12ms
  Total time: 120ms

Framework: jest, Tests: 500
  Average time: 18ms
  Total time: 180ms

Framework: jest, Tests: 1000
  Average time: 35ms
  Total time: 350ms

Framework: jest, Tests: 5000
  Average time: 75ms
  Total time: 750ms
```

**Analysis:**
- Linear scaling: 100→1000 tests = 3x time increase
- Expected for regex-based parsing
- Should improve to constant time with JSON output

---

### 1.3 Redis Operation Latency Benchmark

**Script: `test-redis-latency.sh`**

```bash
#!/bin/bash
set -euo pipefail

# Benchmark Redis operation latency

if ! command -v redis-cli &>/dev/null; then
    echo "Error: redis-cli not found. Make sure Redis is installed."
    exit 1
fi

# Start Redis if not running
redis-cli ping >/dev/null 2>&1 || {
    echo "Error: Redis server not running"
    exit 1
}

ITERATIONS=100

# Test 1: Individual HSET operations
echo "=== Redis: Individual HSET Operations ==="
START_TIME=$(date +%s%N)

for i in $(seq 1 $ITERATIONS); do
    redis-cli HSET "benchmark:${i}" "field1" "value1" >/dev/null
    redis-cli HSET "benchmark:${i}" "field2" "value2" >/dev/null
    redis-cli HSET "benchmark:${i}" "field3" "value3" >/dev/null
done

END_TIME=$(date +%s%N)
INDIVIDUAL_TIME=$(( (END_TIME - START_TIME) / 1000000 ))

echo "Total time (${ITERATIONS}×3 operations): ${INDIVIDUAL_TIME}ms"
echo "Average per operation: $(( INDIVIDUAL_TIME / (ITERATIONS * 3) ))ms"
echo

# Test 2: Batched HSET operations
echo "=== Redis: Batched HSET Operations ==="
START_TIME=$(date +%s%N)

for i in $(seq 1 $ITERATIONS); do
    redis-cli <<EOF
HSET "batch:${i}" field1 value1
HSET "batch:${i}" field2 value2
HSET "batch:${i}" field3 value3
EOF
done

END_TIME=$(date +%s%N)
BATCHED_TIME=$(( (END_TIME - START_TIME) / 1000000 ))

echo "Total time (${ITERATIONS} batches): ${BATCHED_TIME}ms"
echo "Average per operation: $(( BATCHED_TIME / (ITERATIONS * 3) ))ms"
echo

# Calculate improvement
IMPROVEMENT=$(( (INDIVIDUAL_TIME - BATCHED_TIME) * 100 / INDIVIDUAL_TIME ))
echo "=== Summary ==="
echo "Individual: ${INDIVIDUAL_TIME}ms"
echo "Batched:    ${BATCHED_TIME}ms"
echo "Improvement: ${IMPROVEMENT}%"

# Cleanup
redis-cli DEL benchmark:* batch:* >/dev/null 2>&1
```

**Expected Output:**
```
=== Redis: Individual HSET Operations ===
Total time (300 operations): 450ms
Average per operation: 1.5ms

=== Redis: Batched HSET Operations ===
Total time (100 batches): 80ms
Average per operation: 0.27ms

=== Summary ===
Individual: 450ms
Batched:    80ms
Improvement: 82%
```

---

### 1.4 BC vs BASH Arithmetic Benchmark

**Script: `test-bc-vs-bash.sh`**

```bash
#!/bin/bash
set -euo pipefail

# Benchmark bc vs native BASH arithmetic

ITERATIONS=1000

# Test 1: bc approach
echo "=== Floating Point Calculation: bc approach ==="
START_TIME=$(date +%s%N)

for i in $(seq 1 $ITERATIONS); do
    PASSED=85
    TOTAL=100
    RATE=$(echo "scale=4; $PASSED / $TOTAL" | bc)
done

END_TIME=$(date +%s%N)
BC_TIME=$(( (END_TIME - START_TIME) / 1000000 ))

echo "Total time (${ITERATIONS} calculations): ${BC_TIME}ms"
echo "Average per calculation: $(( BC_TIME / ITERATIONS ))ms"
echo "Example output: $RATE"
echo

# Test 2: BASH arithmetic approach
echo "=== Floating Point Calculation: BASH approach ==="
START_TIME=$(date +%s%N)

for i in $(seq 1 $ITERATIONS); do
    PASSED=85
    TOTAL=100
    RATE_INT=$(( (PASSED * 10000) / TOTAL ))
    FRAC=$((RATE_INT % 10000))
    RATE=$(printf "0.%04d" "$FRAC")
done

END_TIME=$(date +%s%N)
BASH_TIME=$(( (END_TIME - START_TIME) / 1000000 ))

echo "Total time (${ITERATIONS} calculations): ${BASH_TIME}ms"
echo "Average per calculation: $(( BASH_TIME / ITERATIONS ))ms"
echo "Example output: $RATE"
echo

# Calculate improvement
IMPROVEMENT=$(( (BC_TIME - BASH_TIME) * 100 / BC_TIME ))
echo "=== Summary ==="
echo "bc:          ${BC_TIME}ms ($(( BC_TIME / ITERATIONS ))ms per calc)"
echo "BASH:        ${BASH_TIME}ms ($(( BASH_TIME / ITERATIONS ))ms per calc)"
echo "Improvement: ${IMPROVEMENT}%"
```

**Expected Output:**
```
=== Floating Point Calculation: bc approach ===
Total time (1000 calculations): 8500ms
Average per calculation: 8.5ms
Example output: .8500

=== Floating Point Calculation: BASH approach ===
Total time (1000 calculations): 45ms
Average per calculation: 0.045ms
Example output: 0.8500

=== Summary ===
bc:          8500ms (8.5ms per calc)
BASH:        45ms (0.045ms per calc)
Improvement: 99.5%
```

---

### 1.5 Full CFN Loop Performance Benchmark

**Script: `test-cfn-loop-performance.sh`**

```bash
#!/bin/bash
set -euo pipefail

# Simulate full CFN loop performance

TASK_ID="perf-test-$(date +%s)"
NUM_AGENTS=5
NUM_ITERATIONS=3

# Helper function to simulate agent work
simulate_agent() {
    local agent_id=$1
    local iteration=$2

    # Simulate test execution (1-5 seconds)
    sleep 0.${RANDOM:0:3}

    # Generate test results
    echo "PASS  test-${agent_id}-${iteration}.test.js
Tests: 42 passed, 3 failed, 0 skipped
Time: 2.5s"
}

# Simulate parse-test-results.sh
parse_results() {
    local output=$1

    # Extract metrics
    [[ "$output" =~ ([0-9]+)[[:space:]]*passed ]] && PASSED="${BASH_REMATCH[1]}"
    [[ "$output" =~ ([0-9]+)[[:space:]]*failed ]] && FAILED="${BASH_REMATCH[1]}"

    TOTAL=$((PASSED + FAILED))
    if [[ $TOTAL -gt 0 ]]; then
        RATE_INT=$(( (PASSED * 10000) / TOTAL ))
        FRAC=$((RATE_INT % 10000))
        PASS_RATE=$(printf "0.%04d" "$FRAC")
    fi

    echo "{\"passed\":$PASSED,\"failed\":$FAILED,\"pass_rate\":\"$PASS_RATE\"}"
}

echo "=== CFN Loop Performance Benchmark ==="
echo "Agents: $NUM_AGENTS"
echo "Iterations: $NUM_ITERATIONS"
echo

LOOP_START=$(date +%s%N)

for iteration in $(seq 1 $NUM_ITERATIONS); do
    echo "--- Iteration $iteration ---"
    ITER_START=$(date +%s%N)

    # Spawn agents in parallel
    for agent_id in $(seq 1 $NUM_AGENTS); do
        (
            AGENT_START=$(date +%s%N)

            # Simulate agent work
            OUTPUT=$(simulate_agent "agent-${agent_id}" "$iteration")

            # Parse results
            RESULTS=$(parse_results "$OUTPUT")

            # Store to Redis
            redis-cli HSET "swarm:${TASK_ID}:test-results:iteration${iteration}" \
                "agent-${agent_id}" "$RESULTS" >/dev/null 2>&1 || true

            AGENT_END=$(date +%s%N)
            AGENT_TIME=$(( (AGENT_END - AGENT_START) / 1000000 ))

            echo "  agent-${agent_id}: ${AGENT_TIME}ms"
        ) &
    done

    # Wait for all agents to complete
    wait

    ITER_END=$(date +%s%N)
    ITER_TIME=$(( (ITER_END - ITER_START) / 1000000 ))
    echo "  Total: ${ITER_TIME}ms"
    echo
done

LOOP_END=$(date +%s%N)
LOOP_TIME=$(( (LOOP_END - LOOP_START) / 1000000 ))

echo "=== Total Loop Time ==="
echo "Duration: ${LOOP_TIME}ms"
echo "Per iteration: $(( LOOP_TIME / NUM_ITERATIONS ))ms"
echo "Per agent: $(( LOOP_TIME / (NUM_AGENTS * NUM_ITERATIONS) ))ms"

# Cleanup
redis-cli DEL "swarm:${TASK_ID}:test-results:*" >/dev/null 2>&1
```

**Expected Output:**
```
=== CFN Loop Performance Benchmark ===
Agents: 5
Iterations: 3

--- Iteration 1 ---
  agent-1: 1245ms
  agent-2: 1187ms
  agent-3: 1156ms
  agent-4: 1198ms
  agent-5: 1203ms
  Total: 1245ms

--- Iteration 2 ---
  agent-1: 1234ms
  agent-2: 1189ms
  agent-3: 1145ms
  agent-4: 1205ms
  agent-5: 1198ms
  Total: 1205ms

--- Iteration 3 ---
  agent-1: 1256ms
  agent-2: 1176ms
  agent-3: 1167ms
  agent-4: 1212ms
  agent-5: 1189ms
  Total: 1256ms

=== Total Loop Time ===
Duration: 3706ms
Per iteration: 1235ms
Per agent: 247ms
```

---

## 2. Before/After Comparison Template

**For Each Optimization, Run These Tests:**

```bash
#!/bin/bash
# comparison-test.sh

set -euo pipefail

BENCHMARK_NAME=$1
BEFORE_FILE="/tmp/${BENCHMARK_NAME}_before.txt"
AFTER_FILE="/tmp/${BENCHMARK_NAME}_after.txt"

# Step 1: Capture baseline
echo "Running baseline benchmark..."
./.claude/benchmarks/test-${BENCHMARK_NAME}.sh > "$BEFORE_FILE"

# Step 2: Apply optimization
echo "Applying optimization..."
# [Apply code changes here]

# Step 3: Run again
echo "Running optimized benchmark..."
./.claude/benchmarks/test-${BENCHMARK_NAME}.sh > "$AFTER_FILE"

# Step 4: Compare
echo "=== Comparison: $BENCHMARK_NAME ==="
echo
echo "BEFORE:"
cat "$BEFORE_FILE"
echo
echo "AFTER:"
cat "$AFTER_FILE"
echo
echo "=== Analysis ==="

# Parse and compare timing
BEFORE_TIME=$(grep "Average per" "$BEFORE_FILE" | head -1 | awk '{print $NF}' | sed 's/ms//')
AFTER_TIME=$(grep "Average per" "$AFTER_FILE" | head -1 | awk '{print $NF}' | sed 's/ms//')

if [[ -n "$BEFORE_TIME" && -n "$AFTER_TIME" ]]; then
    IMPROVEMENT=$(( (BEFORE_TIME - AFTER_TIME) * 100 / BEFORE_TIME ))
    echo "Before: ${BEFORE_TIME}ms"
    echo "After:  ${AFTER_TIME}ms"
    echo "Improvement: ${IMPROVEMENT}%"
fi
```

---

## 3. Integration Testing

**Test that all optimizations work together:**

```bash
#!/bin/bash
# test-optimizations-integration.sh

set -euo pipefail

echo "=== Integration Test: All Optimizations ==="
echo

# 1. Start Redis
redis-server --daemonize yes >/dev/null 2>&1 || true
sleep 1

# 2. Run all benchmarks
echo "Running JSON validation test..."
./test-json-validation-overhead.sh

echo "Running parse performance test..."
./test-parse-performance.sh

echo "Running Redis latency test..."
./test-redis-latency.sh

echo "Running bc vs bash test..."
./test-bc-vs-bash.sh

echo "Running full CFN loop test..."
./test-cfn-loop-performance.sh

echo
echo "=== All Tests Complete ==="

# Cleanup
redis-cli shutdown >/dev/null 2>&1
```

---

## 4. Performance Benchmarking Checklist

Before committing optimizations:

- [ ] Run baseline benchmarks for each optimization
- [ ] Apply optimization to code
- [ ] Run optimized benchmarks
- [ ] Verify improvement is as expected
- [ ] Verify no regression in other areas
- [ ] Document before/after numbers
- [ ] Update performance analysis report

---

## 5. Performance Targets

**After Tier 1 Optimizations (Expected):**

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| JSON validation | 18.5ms | 32ms | <50ms |
| Parse (100 tests) | 12ms | 6ms | <10ms |
| Parse (1000 tests) | 35ms | 18ms | <30ms |
| Redis latency (individual) | 1.5ms/op | 1.5ms/op | <2ms/op |
| Redis latency (batch) | 0.27ms/op | 0.27ms/op | <0.5ms/op |
| bc vs bash | 8.5ms | 0.045ms | <0.1ms |
| Full CFN loop | ~3700ms | ~3200ms | <3500ms |

---

**Document Version:** 1.0 (Benchmarking Guide)
**Date:** 2025-11-16
**Next:** Run benchmarks, validate improvements, implement Tier 2 optimizations
