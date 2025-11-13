# P0 Critical Test Suite - Quick Reference

## Test Execution

### Run All P0 Tests
```bash
# From project root
cd tests/docker

# Run individually
./redis-coordination-tests.sh
./coordinator-iteration-tests.sh
./memory-budget-tests.sh
./clustering-accuracy-tests.sh
./agent-lifecycle-tests.sh
```

### Prerequisites
- Docker running with cfn-network
- Redis container (cfn-redis) running
- Node.js 20 image available (node:20-slim)

## Test Files

### 1. Redis Coordination (4 tests)
**File:** `redis-coordination-tests.sh`
- Node.js client connectivity (Bug #6)
- Heartbeat reporting
- Task completion protocol
- Pub/sub messaging

### 2. Coordinator Iteration (4 tests)
**File:** `coordinator-iteration-tests.sh`
- Multi-iteration convergence
- Max iteration limit
- Error delta tracking
- PROCEED/ITERATE decisions

### 3. Memory Budget (5 tests)
**File:** `memory-budget-tests.sh`
- Wave spawning logic
- Four-tier allocation
- OOM prevention
- Wave sequencing
- B10 scenario validation

### 4. Clustering Accuracy (6 tests)
**File:** `clustering-accuracy-tests.sh`
- Tier distribution (60/25/10/5%)
- Import graph accuracy
- Coordinated batching
- Independent file isolation
- Large cluster handling
- Mixed directory structure

### 5. Agent Lifecycle (6 tests)
**File:** `agent-lifecycle-tests.sh`
- Spawn-to-exit lifecycle
- Metadata capture
- Auto-removal
- Orphan detection
- Container status tracking (Bug #4)
- Wait pattern validation (Bug #4)

## Shared Utilities
**File:** `tests/test-utils.sh`
- Logging: log_step, log_info, log_success, log_warn, log_error
- Assertions: assert_success, assert_equals, assert_contains, assert_not_empty
- Redis: redis_set, redis_get, redis_exists, verify_redis_health
- Docker: wait_for_container, cleanup_container, is_container_running
- Scaffolding: setup_test, print_test_summary

## Test Standards
**Reference:** `tests/claude.md`
- Shebang + set -euo pipefail
- PROJECT_ROOT resolution
- Source test-utils.sh
- GIVEN/WHEN/THEN comments
- Cleanup traps
- Executable permissions

## Bug Validations
- **Bug #4**: Agent lifecycle tests validate container status tracking (not Redis queue)
- **Bug #6**: Redis tests validate CFN_REDIS_HOST/PORT variable names

## Success Criteria
- All 25 tests pass
- No container leaks
- Redis cleanup verified
- Metadata capture validated
- Coordinator behavior matches Bug #4 findings

## Created: 2025-11-13
## Phase: 3 Loop 3 Iteration 1
## Status: Complete - Ready for Loop 2 execution
