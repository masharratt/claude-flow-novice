# Test Utilities Guide

Comprehensive guide for using CFN Loop test utilities and helpers.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Core Test Utilities](#core-test-utilities)
- [Docker Test Helpers](#docker-test-helpers)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)

## Overview

The CFN Loop test suite provides two levels of test utilities:

1. **Core Test Utilities** (`tests/test-utils.sh`) - Base functionality for all tests
2. **Docker Test Helpers** (`tests/docker/test-helpers.sh`) - Docker-specific extensions

### Features

- Structured logging with color-coded output
- Comprehensive assertion helpers
- Redis operations and health checks
- Docker container lifecycle management
- Network connectivity testing
- Log analysis and resource monitoring
- Test scaffolding and cleanup

## Quick Start

### Basic Test Structure

```bash
#!/bin/bash
# tests/docker/my-test.sh
# Phase X :: Brief description of test

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
    # Cleanup code
}
trap cleanup EXIT

test_case_name() {
    log_step "GIVEN initial conditions"
    # WHEN action is performed
    # THEN verify results
}

setup_test "my-test"
test_case_name
teardown_test
```

### Docker-Specific Test

```bash
#!/bin/bash
# tests/docker/my-docker-test.sh
# Phase X :: Docker-specific test

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/docker/test-helpers.sh"

cleanup() {
    cleanup_container "test-agent"
    stop_redis
}
trap cleanup EXIT

test_docker_scenario() {
    log_step "Testing Docker scenario"

    # Start Redis
    start_redis

    # Run assertions
    assert_success "Redis health" verify_redis_health
}

setup_docker_test "my-docker-test"
test_docker_scenario
cleanup_docker_test
```

## Core Test Utilities

### Logging Functions

**Structured Logging:**
```bash
log_step "Phase 1: Infrastructure validation"
log_info "Starting container"
log_success "Test passed"
log_warn "Slow response detected"
log_error "Test failed"
annotate "Running Phase 2 Tests"  # CI visibility
```

**Output:**
```
▶ Phase 1: Infrastructure validation
ℹ Starting container
✅ Test passed
⚠ Slow response detected
❌ Test failed
```

### Assertion Helpers

**Command Success/Failure:**
```bash
assert_success "Container starts" docker ps
assert_failure "Invalid command" docker exec nonexistent echo hi
```

**String Comparisons:**
```bash
output=$(docker inspect mycontainer)
assert_equals "running" "$status" "Container status"
assert_contains "$output" "healthy" "Health check"
assert_not_contains "$output" "error" "No errors"
assert_not_empty "$value" "Value populated"
```

**File/Directory Checks:**
```bash
assert_file_exists "/tmp/output.log" "Log file created"
assert_dir_exists "/app/data" "Data directory exists"
```

### Redis Helpers

**Basic Operations:**
```bash
# Set and get values
redis_set "swarm:task:1:status" "running"
status=$(redis_get "swarm:task:1:status")

# Check existence
if redis_exists "swarm:task:1:status"; then
    echo "Task status exists"
fi

# Delete key
redis_del "swarm:task:1:status"

# Pattern matching
keys=$(redis_keys "swarm:task:*")

# Flush all data (use with caution)
redis_flush_all
```

**Advanced Operations:**
```bash
# Wait for key to appear
if redis_wait_for_key "swarm:task:1:complete" 30; then
    echo "Task completed within timeout"
fi

# Health check
if verify_redis_health; then
    echo "Redis is healthy"
fi
```

### Docker Helpers

**Container Management:**
```bash
# Wait for container
wait_for_container "cfn-redis" 30

# Cleanup
cleanup_container "test-agent"

# Check if running
if is_container_running "cfn-redis"; then
    echo "Redis is running"
fi

# Execute command
result=$(container_exec "cfn-redis" redis-cli PING)

# Get logs
logs=$(get_container_logs "test-agent" 50)
```

**Network Management:**
```bash
# Ensure network exists
ensure_network "mcp-network"

# Cleanup network
cleanup_network "test-network"
```

### Test Scaffolding

**Setup/Teardown:**
```bash
# Initialize test environment
setup_test "test-name"

# Your test code here

# Print summary and cleanup
teardown_test  # or print_test_summary
```

**Utilities:**
```bash
# Generate unique ID
test_id=$(generate_test_id)  # test-1763037156-12345

# Temporary directory
tmpdir=$(create_temp_dir)
# Use tmpdir
cleanup_temp_dir "$tmpdir"

# Wait for condition
wait_for_condition "test -f /tmp/ready" 30 "File creation"

# Retry with backoff
retry 5 docker pull myimage
```

## Docker Test Helpers

### Image Management

```bash
# Verify image exists
if verify_image "claude-flow-novice-agent:latest"; then
    echo "Image available"
fi

# Build if needed
ensure_image "myimage:latest" "Dockerfile.custom"

# Get image size
size=$(get_image_size "myimage:latest")
echo "Image size: $size"

# Pull image
pull_image "myimage:latest"
```

### Container Lifecycle

**Redis Service:**
```bash
# Start Redis
start_redis

# Stop Redis
stop_redis
```

**Agent Management:**
```bash
# Start agent with environment
start_agent "test-agent-1" \
    "CFN_REDIS_HOST=cfn-redis" \
    "CFN_REDIS_PORT=6379" \
    "TASK_ID=test-123"

# Execute in agent
result=$(agent_exec "test-agent-1" "ls -la")

# Check exit code
if agent_succeeded "test-agent-1"; then
    echo "Agent completed successfully"
fi

# Stop agent
stop_agent "test-agent-1"
```

### Network Helpers

```bash
# Verify connectivity
verify_network_connectivity "agent-1" "cfn-redis"

# Get container IP
ip=$(get_container_ip "cfn-redis")

# List network containers
containers=$(list_network_containers "mcp-network")
```

### Log Analysis

```bash
# Search logs
if log_contains "test-agent" "ERROR"; then
    echo "Errors detected in logs"
fi

# Extract matching lines
errors=$(extract_log_lines "test-agent" "ERROR" 1000)

# Count occurrences
error_count=$(count_log_occurrences "test-agent" "ERROR")

# Save logs
save_logs "test-agent" "/tmp/agent-logs.txt" 5000

# Get recent logs
recent=$(get_recent_logs "test-agent" 20)
```

### Resource Monitoring

```bash
# Get memory usage
mem=$(get_container_memory "test-agent")
echo "Memory: $mem"

# Get CPU usage
cpu=$(get_container_cpu "test-agent")
echo "CPU: $cpu"

# Monitor resources
monitor_resources "test-agent" 5
```

### Volume Management

```bash
# Create test volume
vol=$(create_test_volume "test-data")

# Use volume...

# Cleanup
cleanup_volume "test-data"
```

### Docker Compose

```bash
# Start services
compose_up "redis" "coordinator"

# Check service status
status=$(get_service_status "redis")

# Stop all services
compose_down
```

### Test Scenarios

```bash
# Complete test scenario
run_agent_scenario "basic-task" "echo 'test'"
```

## Usage Examples

### Example 1: Basic Assertion Test

```bash
#!/bin/bash
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

setup_test "assertion-test"

# Test string equality
assert_equals "expected" "expected" "Values match"

# Test substring
output="Hello World"
assert_contains "$output" "World" "Contains substring"

teardown_test
```

### Example 2: Redis Integration Test

```bash
#!/bin/bash
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/docker/test-helpers.sh"

cleanup() {
    redis_del "test:*"
    stop_redis
}
trap cleanup EXIT

setup_docker_test "redis-test"

# Test Redis operations
log_step "Testing Redis operations"
redis_set "test:key1" "value1"
value=$(redis_get "test:key1")
assert_equals "value1" "$value" "Redis read/write"

# Test key existence
assert_success "Key exists" redis_exists "test:key1"

# Test pattern matching
redis_set "test:key2" "value2"
keys=$(redis_keys "test:*")
assert_contains "$keys" "test:key1" "Pattern match finds keys"

cleanup_docker_test
```

### Example 3: Docker Agent Test

```bash
#!/bin/bash
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/docker/test-helpers.sh"

AGENT_NAME="test-agent-$(date +%s)"

cleanup() {
    stop_agent "$AGENT_NAME"
    stop_redis
}
trap cleanup EXIT

setup_docker_test "agent-test"

# Start Redis
start_redis

# Start agent
start_agent "$AGENT_NAME" \
    "CFN_REDIS_HOST=cfn-redis" \
    "CFN_REDIS_PORT=6379"

# Wait for agent to complete
wait_for_condition "! is_container_running $AGENT_NAME" 30 "Agent completion"

# Verify success
assert_success "Agent succeeded" agent_succeeded "$AGENT_NAME"

# Check logs
if log_contains "$AGENT_NAME" "ERROR"; then
    log_error "Agent logs contain errors"
    get_recent_logs "$AGENT_NAME" 50
fi

cleanup_docker_test
```

### Example 4: Network Connectivity Test

```bash
#!/bin/bash
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/docker/test-helpers.sh"

cleanup() {
    cleanup_container "test-client"
    stop_redis
}
trap cleanup EXIT

setup_docker_test "network-test"

# Start Redis
start_redis

# Start test client
docker run -d --name test-client --network mcp-network \
    alpine:latest sleep 3600

# Verify connectivity
assert_success "Network connectivity" \
    verify_network_connectivity "test-client" "cfn-redis"

# Get IPs
redis_ip=$(get_container_ip "cfn-redis")
log_info "Redis IP: $redis_ip"

cleanup_docker_test
```

## Best Practices

### 1. Always Use Cleanup Traps

```bash
cleanup() {
    cleanup_container "test-agent"
    cleanup_temp_dir "$tmpdir"
    redis_del "test:*"
}
trap cleanup EXIT
```

### 2. Use Descriptive Test Names

```bash
# Good
assert_equals "running" "$status" "Container should be running"

# Bad
assert_equals "running" "$status" "Test 1"
```

### 3. Structure with GIVEN/WHEN/THEN

```bash
test_redis_persistence() {
    log_step "GIVEN Redis is running"
    start_redis

    # WHEN we set a value
    redis_set "test:key" "test-value"

    # THEN we can retrieve it
    value=$(redis_get "test:key")
    assert_equals "test-value" "$value" "Value persisted"
}
```

### 4. Use Timeouts

```bash
# Good - with timeout
wait_for_container "cfn-redis" 30

# Bad - infinite wait
while ! is_container_running "cfn-redis"; do sleep 1; done
```

### 5. Clean Up Redis Keys

```bash
# At start of test
redis_del "test:*"

# In cleanup
cleanup() {
    redis_del "test:*"
}
```

### 6. Check Exit Codes

```bash
# Good
if agent_succeeded "$AGENT_NAME"; then
    log_success "Agent completed successfully"
else
    exit_code=$(get_agent_exit_code "$AGENT_NAME")
    log_error "Agent failed with exit code: $exit_code"
    get_recent_logs "$AGENT_NAME" 100
fi
```

### 7. Use setup_docker_test for Docker Tests

```bash
# Automatically ensures:
# - Network exists
# - Redis is running
# - Test environment configured

setup_docker_test "my-test"
# Your test code
cleanup_docker_test
```

### 8. Leverage Retry for Flaky Operations

```bash
# Retry image pull up to 3 times
retry 3 docker pull myimage:latest
```

## Environment Variables

### Core Test Utils

- `REDIS_HOST` - Redis hostname (default: cfn-redis)
- `REDIS_PORT` - Redis port (default: 6379)
- `DOCKER_NETWORK` - Docker network name (default: mcp-network)
- `TEST_TIMEOUT` - Default timeout in seconds (default: 30)
- `TEST_LOG` - Test log file path (auto-generated)

### Docker Test Helpers

- `AGENT_IMAGE` - Agent Docker image (default: claude-flow-novice-agent:latest)
- `COORDINATOR_IMAGE` - Coordinator image
- `ORCHESTRATOR_IMAGE` - Orchestrator image
- `DOCKER_COMPOSE_FILE` - Docker Compose file path
- `DOCKER_COMPOSE_TEST_FILE` - Test-specific Compose file

## Troubleshooting

### Functions Not Available

**Problem:** Functions like `log_step` are not found.

**Solution:** Ensure you source the utilities:
```bash
source "$PROJECT_ROOT/tests/test-utils.sh"
```

### Line Ending Issues

**Problem:** Script fails with `$'\r': command not found`.

**Solution:** Fix line endings:
```bash
sed -i 's/\r$//' tests/test-utils.sh
```

### Redis Not Available

**Problem:** Tests fail with Redis connection errors.

**Solution:** Use `setup_docker_test` which starts Redis automatically:
```bash
setup_docker_test "my-test"
```

Or manually start Redis:
```bash
start_redis
```

### Container Cleanup

**Problem:** Test containers persist after test failure.

**Solution:** Always use cleanup trap:
```bash
cleanup() {
    cleanup_container "test-agent"
}
trap cleanup EXIT
```

## Reference

### Complete Function List

See inline help:
```bash
source tests/test-utils.sh
print_test_usage
```

### Example Test

See `tests/docker/example-test.sh` for a complete working example.

### Test Standards

Follow the standards in `tests/claude.md` for:
- Naming conventions
- Directory structure
- Comment style
- Cleanup requirements
