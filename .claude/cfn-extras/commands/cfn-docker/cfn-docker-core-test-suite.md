---
name: cfn-docker-core-test-suite
description: Run comprehensive Docker CFN Loop core test suite validating coordinator v3, infrastructure, and Redis coordination
category: testing
---

# Docker CFN Loop Core Test Suite

Run comprehensive regression tests for Docker-based CFN Loop v3 architecture, validating coordinator workflows, Docker infrastructure, and Redis coordination patterns.

**Purpose:** Ensure code changes don't break the Docker CFN Loop process or underlying infrastructure.

## Usage

```bash
# Run all core tests (full regression suite)
/cfn-docker-core-test-suite

# Run specific test category
/cfn-docker-core-test-suite --category coordinator
/cfn-docker-core-test-suite --category infrastructure
/cfn-docker-core-test-suite --category redis
/cfn-docker-core-test-suite --category cfn-loop
/cfn-docker-core-test-suite --category integration

# Run specific test file
/cfn-docker-core-test-suite --test coordinator-planning-tests.sh
/cfn-docker-core-test-suite --test redis-coordination-tests.sh

# With verbose output
/cfn-docker-core-test-suite --verbose

# Quick validation (skip long-running tests)
/cfn-docker-core-test-suite --quick
```

## Test Categories

### Coordinator V3 Features (6 tests, ~45 min)
1. **coordinator-planning-tests.sh** - Dynamic task planning via Anthropic API
2. **coordinator-docker-in-docker-tests.sh** - Worker container spawning
3. **coordinator-atomic-task-tests.sh** - One task per agent assignment
4. **coordinator-validation-tests.sh** - Plan validation and error handling
5. **coordinator-iteration-tests.sh** - Multi-iteration management
6. **coordinator-fault-tolerance-tests.sh** - Coordinator resilience

### Docker Infrastructure (2 tests, ~15 min)
7. **docker-hello-world-parity-tests.sh** - Basic Docker agent execution
8. **agent-lifecycle-tests.sh** - Agent spawn-to-exit cycle

### Redis Coordination (1 test, ~10 min)
9. **redis-coordination-tests.sh** - Node.js client connectivity, heartbeat, pub/sub

### Resource Management (1 test, ~10 min)
10. **memory-budget-tests.sh** - Wave spawning, memory limits, tier allocation

### CFN Loop Patterns (1 test, ~10 min)
11. **cfn-loop-compliance-tests.sh** - Gate/consensus/decision patterns

### Environment Management (1 test, ~10 min)
12. **env-propagation-tests.sh** - Environment variable handling

### Integration (1 test, ~30 min)
13. **intelligent-coordinator-test.sh** - End-to-end coordinator workflow

## Prerequisites

The slash command will validate and setup prerequisites automatically:

**Docker Environment:**
- Docker daemon running
- mcp-network exists or will be created
- Redis container running or will be started

**Images:**
- cfn-coordinator:v3 (will build if missing)
- cfn-agent:latest (will build if missing)

**Environment Variables:**
- ANTHROPIC_API_KEY (required for planning tests)
- Z_AI_API_KEY (optional for custom routing tests)

## Execution

Main Chat will execute the following steps:

### Step 1: Prerequisites Validation
```bash
# Check Docker daemon
docker info >/dev/null 2>&1 || { echo "❌ Docker daemon not running"; exit 1; }

# Create network if needed
docker network inspect mcp-network >/dev/null 2>&1 || \
  docker network create mcp-network

# Start Redis if not running
docker ps --filter "name=cfn-redis" --format "{{.Names}}" | grep -q cfn-redis || \
  docker run -d --name cfn-redis --network mcp-network redis:alpine

# Build coordinator image if missing
docker images cfn-coordinator:v3 --format "{{.Repository}}" | grep -q cfn-coordinator || \
  docker build -f Dockerfile.cfn-coordinator -t cfn-coordinator:v3 .

# Build agent image if missing
docker images cfn-agent:latest --format "{{.Repository}}" | grep -q cfn-agent || \
  docker build -f Dockerfile.agent -t cfn-agent:latest .
```

### Step 2: Run Test Suite
```bash
#!/bin/bash
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"

# Test execution based on parameters
CATEGORY="${1:-all}"
TEST_FILE="${2:-}"
VERBOSE="${3:-false}"
QUICK="${4:-false}"

# Test tracking
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0
FAILED_TESTS=()

echo "=========================================="
echo "Docker CFN Loop Core Test Suite"
echo "=========================================="
echo "Category: $CATEGORY"
echo "Git: $(git branch --show-current) @ $(git rev-parse --short HEAD)"
echo ""

# Function to run test
run_test() {
    local test_file="$1"
    local test_name=$(basename "$test_file" .sh)

    echo "Running: $test_name"
    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    if [[ "$VERBOSE" == "true" ]]; then
        bash "$test_file"
    else
        bash "$test_file" >/dev/null 2>&1
    fi

    if [[ $? -eq 0 ]]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        echo "  ✅ PASS: $test_name"
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        FAILED_TESTS+=("$test_name")
        echo "  ❌ FAIL: $test_name"
    fi
    echo ""
}

# Determine which tests to run
case "$CATEGORY" in
    coordinator)
        for test in tests/docker/core/coordinator-*.sh; do
            run_test "$test"
        done
        ;;
    infrastructure)
        run_test "tests/docker/core/docker-hello-world-parity-tests.sh"
        run_test "tests/docker/core/agent-lifecycle-tests.sh"
        ;;
    redis)
        run_test "tests/docker/core/redis-coordination-tests.sh"
        ;;
    cfn-loop)
        run_test "tests/docker/core/cfn-loop-compliance-tests.sh"
        run_test "tests/docker/core/memory-budget-tests.sh"
        ;;
    integration)
        run_test "tests/docker/core/intelligent-coordinator-test.sh"
        ;;
    all)
        if [[ "$QUICK" == "true" ]]; then
            # Skip long-running tests
            echo "⚡ Quick mode: Skipping intelligent-coordinator-test.sh"
            for test in tests/docker/core/*.sh; do
                if [[ $(basename "$test") != "intelligent-coordinator-test.sh" ]]; then
                    run_test "$test"
                fi
            done
        else
            # Run all tests
            for test in tests/docker/core/*.sh; do
                run_test "$test"
            done
        fi
        ;;
    *)
        if [[ -n "$TEST_FILE" ]] && [[ -f "tests/docker/core/$TEST_FILE" ]]; then
            run_test "tests/docker/core/$TEST_FILE"
        else
            echo "❌ Unknown category or test file: $CATEGORY"
            exit 1
        fi
        ;;
esac

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "Total: $TESTS_TOTAL"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"

if [[ $TESTS_FAILED -gt 0 ]]; then
    echo ""
    echo "Failed tests:"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  - $test"
    done
    exit 1
else
    echo ""
    echo "✅ All tests passed!"
    exit 0
fi
```

## Test Coverage

| Category | Test Files | Test Cases | Coverage | Duration |
|----------|-----------|------------|----------|----------|
| Coordinator v3 | 6 | 20+ | 100% | ~45 min |
| Docker Infrastructure | 2 | 8+ | 100% | ~15 min |
| Redis Coordination | 1 | 4 | 100% | ~10 min |
| Resource Management | 1 | 4 | 100% | ~10 min |
| CFN Loop Patterns | 1 | 4 | 100% | ~10 min |
| Environment Management | 1 | 4 | 100% | ~10 min |
| Integration | 1 | E2E | 100% | ~30 min |
| **Total** | **13** | **44+** | **100%** | **~130 min** |

## Bug Fix Validation

These tests validate documented bug fixes:
- **Bug #4:** Agent task assignment pattern (agent-lifecycle-tests.sh)
- **Bug #6:** Redis environment variable propagation (redis-coordination-tests.sh, env-propagation-tests.sh)

## Examples

**Full regression suite:**
```
/cfn-docker-core-test-suite
```

**Quick validation:**
```
/cfn-docker-core-test-suite --quick
```

**Coordinator tests only:**
```
/cfn-docker-core-test-suite --category coordinator
```

**Single test with verbose output:**
```
/cfn-docker-core-test-suite --test redis-coordination-tests.sh --verbose
```

## Output

```
==========================================
Docker CFN Loop Core Test Suite
==========================================
Category: all
Git: main @ abc123

Running: coordinator-planning-tests
  ✅ PASS: coordinator-planning-tests

Running: coordinator-docker-in-docker-tests
  ✅ PASS: coordinator-docker-in-docker-tests

Running: coordinator-atomic-task-tests
  ✅ PASS: coordinator-atomic-task-tests

... (10 more tests)

==========================================
Test Summary
==========================================
Total: 13
Passed: 13
Failed: 0

✅ All tests passed!
```

## Related Documentation

- **Suite Overview:** `tests/docker/README.md`
- **Test Standards:** `tests/CLAUDE.md`
- **Planning Docs:** `tests/docker/docs/planning/`
- **Execution Guide:** `tests/docker/docs/guides/EXECUTION_GUIDE.md`

## CI/CD Integration

This command can be used in CI/CD pipelines:

```yaml
# .github/workflows/docker-core-tests.yml
name: Docker Core Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Docker Core Tests
        run: |
          # Use the slash command logic
          bash tests/docker/core/*.sh
```
