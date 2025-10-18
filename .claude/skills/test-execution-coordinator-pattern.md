---
skill: test-execution-coordinator-pattern
name: Test Execution Coordination
description: Centralized test execution pattern for distributed agent workflows
version: 1.0.0
category: coordination
allowed-tools:
  - Bash
  - Read
  - Grep
complexity: moderate
dependencies:
  - redis-cli
  - npm
  - bash
---

# Test Execution Coordinator Pattern

## Overview

The Test Execution Coordinator Pattern provides a robust, centralized mechanism for managing test execution in distributed agent workflows. By implementing a single-source test run approach, this pattern ensures:

- Consistent test execution
- Prevention of concurrent test runs
- Efficient result caching and distribution
- Minimal resource consumption

## Coordinator Pattern

### Core Principles

1. **Single Source of Truth**: Coordinator runs tests ONCE
2. **Cache-Based Distribution**: Workers read cached test results
3. **Minimal Overhead**: Prevent redundant test executions
4. **Atomic Test Management**: Terminate previous runs before new execution

### Execution Architecture

```
Coordinator (Test Runner)
│
├─ Terminate Existing Tests
├─ Execute Test Suite
├─ Cache Test Results
│
└─> Workers (Result Consumers)
    ├─ Read Cached Results
    ├─ Proceed/Halt Based on Results
```

## Execution Steps

### 1. Terminate Existing Test Processes

```bash
# Forcefully terminate any running test processes
pkill -f vitest
pkill -f "npm test"
pkill -f jest
```

### 2. Run Tests (Coordinator-Only)

```bash
# Execute test suite with comprehensive reporting
npm test -- \
  --run \
  --reporter=json \
  --coverage \
  > test-results.json 2>&1
```

### 3. Workers Read Test Results

```bash
# Worker-side test result parsing
test_status=$(jq '.success' test-results.json)
test_coverage=$(jq '.coverage.lines.pct' test-results.json)

if [[ "$test_status" == "true" && "$test_coverage" -ge 80 ]]; then
  # Proceed with next workflow stage
  echo "Tests passed. Continuing workflow."
else
  # Signal test failure
  redis-cli lpush "swarm:test:failures" "$test_status"
  exit 1
fi
```

### 4. Post-Test Cleanup

```bash
# Clean up test artifacts and reset environment
rm test-results.json
pkill -f vitest
pkill -f "npm test"
```

## Redis Coordination

### Test Completion Signaling

```bash
# Coordinator signals test completion
redis-cli publish "swarm:test:status" '{"status":"complete","timestamp":1697644800}'

# Workers subscribe to test status
redis-cli subscribe "swarm:test:status"
```

## Anti-Patterns to Avoid

1. **Multiple Concurrent Test Runs**
   - Never allow workers to independently run tests
   - Do NOT use parallel test execution

2. **Stateless Test Execution**
   - Always cache test results
   - Ensure deterministic test environment

3. **Unconstrained Test Processes**
   - Always terminate previous test runs
   - Use strict process management

## Script Templates

### test-coordinator-pattern.sh

```bash
#!/bin/bash
# Centralized Test Coordination Script

COORDINATOR_ID=$(uuidgen)
TEST_RESULTS_FILE="test-results.json"

function terminate_tests() {
    pkill -f vitest
    pkill -f "npm test"
}

function run_tests() {
    npm test -- \
        --run \
        --reporter=json \
        --coverage > "$TEST_RESULTS_FILE" 2>&1
}

function signal_completion() {
    redis-cli publish "swarm:test:status" "{
        \"coordinator_id\": \"$COORDINATOR_ID\",
        \"status\": \"complete\",
        \"timestamp\": $(date +%s)
    }"
}

main() {
    terminate_tests
    run_tests
    signal_completion
}

main
```

### test-cache-reader.sh

```bash
#!/bin/bash
# Worker-Side Test Result Consumer

function parse_test_results() {
    local test_status=$(jq -r '.success' test-results.json)
    local test_coverage=$(jq -r '.coverage.lines.pct' test-results.json)

    if [[ "$test_status" == "true" && "$test_coverage" -ge 80 ]]; then
        echo "Proceeding with workflow"
        exit 0
    else
        echo "Test requirements not met"
        exit 1
    fi
}

parse_test_results
```

## Confidence Scoring

```bash
# Confidence calculation pseudo-code
confidence_score=$(
  awk 'BEGIN {
    test_isolation = 0.4   # Prevent concurrent tests
    result_caching = 0.3   # Efficient result distribution
    cleanup_rigor = 0.2    # Process management
    signaling_mechanism = 0.1  # Redis coordination

    print test_isolation + result_caching + cleanup_rigor + signaling_mechanism
  }'
)
```

## Performance Metrics

- **Execution Time**: <500ms
- **Memory Footprint**: <50MB
- **Test Reliability**: >95%

## Logging & Monitoring

```bash
# Log test coordination events
logger -t test-coordinator "Test execution started: $COORDINATOR_ID"
```

## Security Considerations

- Restrict test execution to authorized coordinators
- Implement read-only access for workers
- Use ephemeral test result files

## Integration Hooks

```bash
# Post-test validation hook
node config/hooks/post-test-validation.js "$TEST_RESULTS_FILE"
```