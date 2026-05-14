# Docker Test Suite

This directory contains Docker-based integration tests for the trigger.dev infrastructure.

## Test Files

### redis-validation-test.sh

**Purpose**: Validates Redis connectivity and Docker networking for worker coordination

**Coverage**:
- Host Redis connectivity (127.0.0.1:6379)
- Docker network existence and configuration
- Service name resolution (DNS)
- Redis connectivity from Docker containers
- Data operations (SET/GET)
- Task queue operations (LPUSH/RPOP)
- Container health status
- Environment variable access
- Redis data persistence
- Multi-container shared access

**Requirements**:
- Redis running on 127.0.0.1:6379
- Docker network: `trigger-dev_trigger-cfn-network`
- Docker daemon accessible

**Usage**:
```bash
# Run with default configuration
bash tests/docker/redis-validation-test.sh

# Run with custom network
NETWORK_NAME="custom-network" bash tests/docker/redis-validation-test.sh

# Run with custom Redis
REDIS_HOST="10.0.0.1" REDIS_PORT="6380" bash tests/docker/redis-validation-test.sh
```

**Test Results**:
- Total: 10 tests
- Pass Rate: 100%
- Duration: ~5-10 seconds

**Validation Standards**:
- Follows Bug #21 production code path requirements
- Uses GIVEN/WHEN/THEN test structure
- Includes cleanup trap for resource management
- Tests actual Docker containers (not mocks)
- Validates production Redis service

## Test Utilities

### test-utils.sh

Shared helper functions for all tests:

**Logging**:
- `log_step(message)` - Test step indicator
- `log_info(message)` - Informational message
- `log_success(message)` - Test pass
- `log_failure(message)` - Test fail
- `log_warning(message)` - Warning message
- `annotate(message)` - Annotation note

**Assertions**:
- `assert_success(description, exit_code)` - Assert command succeeded
- `assert_failure(description, exit_code)` - Assert command failed
- `assert_equals(expected, actual, description)` - Assert equality
- `assert_contains(haystack, needle, description)` - Assert substring
- `assert_file_exists(path, description)` - Assert file exists
- `assert_dir_exists(path, description)` - Assert directory exists

**Docker Helpers**:
- `docker_cleanup_container(name)` - Remove container
- `docker_cleanup_network(name)` - Remove network
- `wait_for_service(check_command, max_wait)` - Wait for service ready

**Test Management**:
- `print_test_summary()` - Display pass/fail summary
- Automatic test counters (TESTS_PASSED, TESTS_FAILED)

## Running Tests

```bash
# Run all Docker tests
find tests/docker -name "*.sh" -type f -executable -exec {} \;

# Run specific test
bash tests/docker/redis-validation-test.sh

# Run with verbose output
DEBUG=true bash tests/docker/redis-validation-test.sh
```

## Test Authoring Standards

All tests must follow these standards (see `tests/CLAUDE.md` for complete guide):

1. **Shebang and strict mode**:
   ```bash
   #!/bin/bash
   set -euo pipefail
   ```

2. **Source test utilities**:
   ```bash
   PROJECT_ROOT=$(git rev-parse --show-toplevel)
   source "$PROJECT_ROOT/tests/test-utils.sh"
   ```

3. **Cleanup trap**:
   ```bash
   cleanup() {
       # Cleanup logic
   }
   trap cleanup EXIT
   ```

4. **GIVEN/WHEN/THEN structure**:
   ```bash
   test_example() {
       log_step "GIVEN some precondition"
       # WHEN some action
       # THEN assert result
   }
   ```

5. **Use assertion helpers**:
   ```bash
   assert_equals "expected" "$actual" "Test description"
   assert_success "Command succeeded"
   ```

## Bug References

- **Bug #21**: Integration tests must use production code paths, not mocks
  - Validates actual Docker containers
  - Uses production Redis service
  - Tests real networking configuration

## Performance Metrics

| Test | Duration | Containers | Network I/O |
|------|----------|------------|-------------|
| redis-validation-test.sh | 5-10s | 3 | <1MB |

## Future Tests

Planned additions:
- Worker container spawning tests
- PostgreSQL connectivity tests
- MinIO storage integration tests
- ClickHouse analytics tests
- Full trigger.dev job execution tests
