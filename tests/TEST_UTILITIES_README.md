# Test Utilities - Quick Reference

Shared test utilities for CFN Loop P0 test implementation.

## Files Created

1. **tests/test-utils.sh** - Core test utilities (663 lines)
   - Logging helpers (log_step, log_info, log_success, log_warn, log_error)
   - Assertion helpers (assert_success, assert_equals, assert_contains, etc.)
   - Redis helpers (redis_set, redis_get, redis_exists, etc.)
   - Docker helpers (wait_for_container, cleanup_container, etc.)
   - Test scaffolding (setup_test, teardown_test, generate_test_id)
   - Utility functions (wait_for_condition, retry)

2. **tests/docker/test-helpers.sh** - Docker-specific helpers (493 lines)
   - Image management (verify_image, ensure_image, pull_image)
   - Container lifecycle (start_redis, start_agent, stop_agent)
   - Network helpers (verify_network_connectivity, get_container_ip)
   - Log analysis (log_contains, extract_log_lines, count_log_occurrences)
   - Resource monitoring (get_container_memory, get_container_cpu)
   - Volume management (create_test_volume, cleanup_volume)
   - Docker Compose (compose_up, compose_down)

3. **tests/docker/example-test.sh** - Working example demonstrating usage

4. **tests/TEST_UTILITIES_GUIDE.md** - Comprehensive documentation

## Quick Start

### Basic Test

```bash
#!/bin/bash
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

setup_test "my-test"
log_step "Testing feature"
assert_equals "expected" "actual" "Feature works"
teardown_test
```

### Docker Test

```bash
#!/bin/bash
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/docker/test-helpers.sh"

cleanup() {
    cleanup_container "test-agent"
    stop_redis
}
trap cleanup EXIT

setup_docker_test "docker-test"
start_redis
assert_success "Redis health" verify_redis_health
cleanup_docker_test
```

## Key Features

### Logging (Color-Coded)
- `log_step` - Test phase markers (cyan)
- `log_info` - Informational messages (blue)
- `log_success` - Success messages (green)
- `log_warn` - Warnings (yellow)
- `log_error` - Errors (red)
- `annotate` - Section headers for CI

### Assertions
- `assert_success "name" command` - Assert command succeeds
- `assert_failure "name" command` - Assert command fails
- `assert_equals expected actual "name"` - String equality
- `assert_contains string substring "name"` - Substring check
- `assert_not_contains string substring "name"` - No substring
- `assert_not_empty value "name"` - Non-empty check
- `assert_file_exists path "name"` - File exists
- `assert_dir_exists path "name"` - Directory exists

### Redis Operations
- `redis_set key value` - Set Redis key
- `redis_get key` - Get Redis value
- `redis_exists key` - Check key existence
- `redis_del key` - Delete key
- `redis_keys pattern` - Get keys by pattern
- `redis_wait_for_key key [timeout]` - Wait for key
- `verify_redis_health` - Redis health check

### Docker Helpers
- `wait_for_container name [timeout]` - Wait for container
- `cleanup_container name` - Remove container
- `is_container_running name` - Check if running
- `get_container_logs name [lines]` - Get logs
- `container_exec name cmd` - Execute in container

### Docker-Specific (test-helpers.sh)
- `start_redis` - Start Redis service
- `stop_redis` - Stop Redis service
- `start_agent name env...` - Start agent container
- `stop_agent name` - Stop agent container
- `verify_image image` - Check image exists
- `log_contains container pattern` - Search logs
- `get_container_memory container` - Get memory usage
- `monitor_resources container [duration]` - Monitor resources

### Test Scaffolding
- `setup_test "name"` - Initialize test environment
- `setup_docker_test "name"` - Initialize Docker test (starts Redis)
- `teardown_test` - Print summary and cleanup
- `cleanup_docker_test` - Docker-specific cleanup
- `generate_test_id` - Unique test ID
- `create_temp_dir` - Temporary directory
- `cleanup_temp_dir path` - Remove temp dir

### Utilities
- `wait_for_condition condition timeout desc` - Wait with timeout
- `retry count command` - Retry with exponential backoff
- `print_test_usage` - Show usage help

## Environment Variables

### Core
- `REDIS_HOST` - Redis hostname (default: cfn-redis)
- `REDIS_PORT` - Redis port (default: 6379)
- `DOCKER_NETWORK` - Network name (default: mcp-network)
- `TEST_TIMEOUT` - Default timeout (default: 30)

### Docker Helpers
- `AGENT_IMAGE` - Agent image (default: claude-flow-novice-agent:latest)
- `COORDINATOR_IMAGE` - Coordinator image
- `ORCHESTRATOR_IMAGE` - Orchestrator image

## Usage Examples

See:
- `tests/docker/example-test.sh` - Working example
- `tests/TEST_UTILITIES_GUIDE.md` - Complete guide with examples

## Test Results

Example test execution:
```
========================================
Test Suite: example-test
========================================

▶ GIVEN test utilities are loaded
✅ PASS: String equality check
✅ PASS: Substring check
✅ PASS: Non-empty value check

▶ GIVEN Redis is running
✅ Redis connectivity verified
✅ PASS: Redis read/write

========================================
Test Summary
========================================

Total:  4
Passed: 4
Failed: 0

✅ All tests passed!
```

## Integration with P0 Tests

These utilities support all P0 test categories:

1. **Unit Tests** - Assertion helpers, logging
2. **Integration Tests** - Redis helpers, Docker lifecycle
3. **End-to-End Tests** - Complete Docker test scenarios
4. **Performance Tests** - Resource monitoring, timing utilities

## Validation

All utilities have been:
- ✅ Syntax validated (set -euo pipefail)
- ✅ Function export verified
- ✅ Line endings fixed (Unix LF)
- ✅ Post-edit hooks passed
- ✅ Functional test executed successfully

## Next Steps

1. Use these utilities in P0 test implementation
2. Extend with project-specific helpers as needed
3. Reference TEST_UTILITIES_GUIDE.md for detailed usage
4. Follow test standards in tests/claude.md

## Support

For detailed documentation and examples:
- **Complete Guide**: `tests/TEST_UTILITIES_GUIDE.md`
- **Test Standards**: `tests/claude.md`
- **Example Test**: `tests/docker/example-test.sh`
- **Inline Help**: `source tests/test-utils.sh && print_test_usage`
