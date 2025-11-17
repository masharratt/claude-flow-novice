# Docker Environment Test Suite

Comprehensive test scripts for validating Docker environment and coordinator functionality.

## Test Scripts

### Test 1: Network Connectivity (`test-1-network-connectivity.sh`)
**Purpose:** Validate Docker infrastructure and network configuration

**Tests:**
- Docker daemon accessibility
- Docker network existence (mcp-network)
- Redis container running status
- Redis health check (PING/PONG)
- Container-to-container network communication

**Usage:**
```bash
bash tests/docker/test-1-network-connectivity.sh
```

**Prerequisites:**
- Docker daemon running
- Network: mcp-network (created automatically if missing)
- Redis container: cfn-redis (started automatically if missing)

---

### Test 2: Redis Message Passing (`test-2-redis-message-passing.sh`)
**Purpose:** Validate Redis coordination mechanisms

**Tests:**
- Basic key-value operations (SET/GET)
- Counter operations (INCR)
- List operations (LPUSH/RPOP) for queue simulation
- Hash operations (HSET/HGETALL) for metadata storage
- Key expiration (TTL)
- Multi-agent coordination simulation

**Usage:**
```bash
bash tests/docker/test-2-redis-message-passing.sh
```

**Prerequisites:**
- Redis container running (cfn-redis)
- Network connectivity (validated by Test 1)

---

### Test 3: Success Criteria Validation (`test-3-success-criteria-validation.sh`)
**Purpose:** Validate success criteria loading logic independently (no coordinator required)

**Tests:**
1. Valid file path in workspace location
2. Valid file path in etc/cfn location
3. Invalid file path (path traversal attack prevention)
4. Oversized file (DoS attack prevention - 10MB limit)
5. Malformed JSON (validation failure)

**Security Features:**
- Path traversal protection (only /workspace and /etc/cfn allowed)
- File size limits (10MB max)
- JSON validation with jq

**Usage:**
```bash
bash tests/docker/test-3-success-criteria-validation.sh
```

**Prerequisites:**
- None (fully standalone test)
- jq installed for JSON validation

---

## Test Runner (`run-docker-tests.sh`)

**Purpose:** Execute all Docker tests sequentially with comprehensive reporting

**Features:**
- Sequential execution (Test 1 → Test 2 → Test 3)
- Colored output (green ✅, red ❌, yellow ⚠️)
- Summary report with pass/fail counts
- Proper exit codes (0 = all pass, 1 = any fail)
- Individual test isolation
- Failed test listing

**Usage:**
```bash
bash tests/docker/run-docker-tests.sh
```

**Output Example:**
```
========================================
Docker Test Suite Runner
========================================
Started: 2025-11-17T14:35:00Z
Tests: 3

▶ Running: test-1-network-connectivity
✅ test-1-network-connectivity: 5/5 passed

▶ Running: test-2-redis-message-passing
✅ test-2-redis-message-passing: 11/11 passed

▶ Running: test-3-success-criteria-validation
✅ test-3-success-criteria-validation: 6/6 passed

========================================
Test Suite Summary
========================================
Total Tests:  22
Passed:       22
Failed:       0
Pass Rate:    100.00%
Duration:     45s

✅ ALL TESTS PASSED
```

---

## Test Standards

All tests follow `/mnt/c/Users/masha/Documents/claude-flow-novice/tests/CLAUDE.md` standards:

### Structure
- ✅ `#!/bin/bash` + `set -euo pipefail`
- ✅ `PROJECT_ROOT=$(git rev-parse --show-toplevel)`
- ✅ `source "$PROJECT_ROOT/tests/test-utils.sh"`
- ✅ `cleanup()` + `trap cleanup EXIT`
- ✅ Colored output via test-utils.sh helpers

### Comments
- ✅ Docstring header with purpose and phase
- ✅ GIVEN/WHEN/THEN structure for clarity
- ✅ Bug citations where applicable

### Assertions
- ✅ Descriptive test names
- ✅ Proper use of assert_* helpers
- ✅ Pass/fail tracking with counters

---

## Dependencies

### Required
- Docker daemon
- Bash 4.0+
- Git (for PROJECT_ROOT resolution)
- jq (for JSON validation)

### Optional
- Redis container (started automatically by Test 1)
- Docker network (created automatically by Test 1)

---

## Integration with CI/CD

### Exit Codes
- `0` = All tests passed
- `1` = One or more tests failed

### Example GitHub Actions Workflow
```yaml
- name: Run Docker Test Suite
  run: bash tests/docker/run-docker-tests.sh
```

### Example Docker Compose Integration
```yaml
test:
  image: docker:latest
  command: bash tests/docker/run-docker-tests.sh
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
    - .:/workspace
```

---

## Troubleshooting

### Test 1 Fails: Redis not starting
**Solution:** Check Docker daemon and network:
```bash
docker ps
docker network ls
docker logs cfn-redis
```

### Test 2 Fails: Redis authentication required
**Solution:** Remove Redis password requirement or set REDIS_PASSWORD:
```bash
docker rm -f cfn-redis
docker run -d --name cfn-redis --network mcp-network redis:7-alpine
```

### Test 3 Fails: jq not found
**Solution:** Install jq:
```bash
# Ubuntu/Debian
apt-get install jq

# macOS
brew install jq

# Alpine
apk add jq
```

### All Tests Fail: Line ending issues (WSL2)
**Solution:** Fix CRLF to LF:
```bash
sed -i 's/\r$//' tests/docker/*.sh
```

---

## File Locations

```
tests/docker/
├── test-1-network-connectivity.sh       # Infrastructure validation
├── test-2-redis-message-passing.sh      # Coordination protocol tests
├── test-3-success-criteria-validation.sh # Success criteria loading
├── run-docker-tests.sh                  # Test suite runner
└── TEST_SUITE_README.md                 # This file
```

---

## Maintenance

### Adding New Tests
1. Create test script following standards (see tests/CLAUDE.md)
2. Add to TEST_SCRIPTS array in run-docker-tests.sh
3. Update this README with test documentation
4. Run test suite to verify integration

### Test Isolation
Each test:
- Uses unique test IDs (timestamps + PID)
- Cleans up resources via trap
- Sources test-utils.sh for shared helpers
- Runs independently (no cross-test dependencies)

---

## Version History

**2025-11-17:** Initial test suite created
- Test 1: Network Connectivity (5 tests)
- Test 2: Redis Message Passing (11 tests)
- Test 3: Success Criteria Validation (6 tests)
- Test Runner: Sequential execution with comprehensive reporting
