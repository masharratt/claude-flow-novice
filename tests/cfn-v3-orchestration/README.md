# CFN v3 Orchestration Test Suite

Comprehensive test suite for validating CFN v3 orchestration lifecycle, including connection tracking, handoff validation, and graceful shutdown.

## Overview

This test suite validates the complete CFN v3 orchestration workflow:

1. **Coordinator Initialization** - Spawn coordinator, establish Redis connection
2. **Worker Connections** - Track coordinator → worker spawning and connections
3. **Task Distribution** - Validate task assignment and execution
4. **Handoff Coordination** - Test worker → reviewer handoffs
5. **State Persistence** - Verify Redis and SQLite state storage
6. **Graceful Shutdown** - Clean termination with state cleanup

## Test Metrics

### Connection Counts
- `cfnConnectionCount`: Total connections established (coordinator → workers)
- `cfnWorkerSpawnCount`: Number of worker processes spawned
- `cfnCoordinatorConnections`: Active coordinator connections

### Handoff Counts
- `cfnHandoffCount`: Total handoffs executed (worker → reviewer)
- `cfnReviewerAssignments`: Number of reviewer assignments
- `cfnHandoffFailures`: Failed handoff attempts

### Lifecycle Metrics
- `cfnStartupTime`: Time from coordinator init to first worker
- `cfnShutdownTime`: Time from shutdown signal to complete cleanup
- `cfnOrphanedProcesses`: Processes not cleaned up properly

## Test Structure

```
tests/cfn-v3-orchestration/
├── README.md                          # This file
├── ARCHITECTURE.md                    # Test architecture and design
├── run-full-suite.sh                  # Main test runner
├── lib/
│   ├── cfn-test-harness.js           # Core test harness
│   ├── cfn-connection-tracker.js     # Connection count tracking
│   ├── cfn-handoff-tracker.js        # Handoff validation
│   ├── cfn-metrics-collector.js      # Metrics aggregation
│   └── cfn-test-utils.js             # Shared utilities
├── tests/
│   ├── 01-coordinator-init.test.js   # Coordinator initialization
│   ├── 02-worker-connections.test.js # Worker connection tracking
│   ├── 03-task-distribution.test.js  # Task assignment validation
│   ├── 04-handoff-coordination.test.js # Handoff tracking
│   ├── 05-state-persistence.test.js  # Redis/SQLite validation
│   └── 06-graceful-shutdown.test.js  # Shutdown cleanup
└── results/
    ├── connection-counts.json        # Connection metrics
    ├── handoff-counts.json           # Handoff metrics
    └── full-report.json              # Complete test report
```

## Quick Start

### Prerequisites

```bash
# Ensure Redis is running
redis-cli ping  # Should return "PONG"

# Verify Node.js version
node --version  # Should be >= 18.0.0
```

### Run Full Test Suite

```bash
# Run all tests with full validation
npm run test:cfn-v3

# Or directly via script
bash tests/cfn-v3-orchestration/run-full-suite.sh

# Run specific test
npm run test:cfn-v3 -- --test=02-worker-connections

# Run with verbose output
npm run test:cfn-v3 -- --verbose

# Skip cleanup (for debugging)
npm run test:cfn-v3 -- --no-cleanup
```

### Run Individual Tests

```bash
# Test coordinator initialization
node tests/cfn-v3-orchestration/tests/01-coordinator-init.test.js

# Test worker connections with tracking
node tests/cfn-v3-orchestration/tests/02-worker-connections.test.js

# Test handoff coordination
node tests/cfn-v3-orchestration/tests/04-handoff-coordination.test.js

# Test graceful shutdown
node tests/cfn-v3-orchestration/tests/06-graceful-shutdown.test.js
```

## Expected Results

### Passing Test Output

```
═══════════════════════════════════════════════════════════════════
CFN v3 Orchestration Test Suite - Full Run
═══════════════════════════════════════════════════════════════════

[01/06] Coordinator Initialization.................................... ✅ PASSED
  ├─ Coordinator spawned: 1.2s
  ├─ Redis connection established: 0.3s
  └─ Initial state persisted: 0.1s

[02/06] Worker Connections........................................... ✅ PASSED
  ├─ Workers spawned: 5/5
  ├─ Connection count: 5 (expected 5)
  ├─ Avg connection time: 0.8s
  └─ All workers registered in Redis

[03/06] Task Distribution............................................ ✅ PASSED
  ├─ Tasks assigned: 10/10
  ├─ Load balanced: ✅
  └─ No duplicate assignments

[04/06] Handoff Coordination......................................... ✅ PASSED
  ├─ Handoffs completed: 10/10
  ├─ Handoff count: 10 (expected 10)
  ├─ Avg handoff time: 0.5s
  ├─ Reviewer assignments: 3 reviewers
  └─ No handoff failures

[05/06] State Persistence............................................ ✅ PASSED
  ├─ Redis keys persisted: 35
  ├─ SQLite records: 25
  ├─ ACL enforcement: ✅
  └─ Encryption validated: ✅

[06/06] Graceful Shutdown............................................ ✅ PASSED
  ├─ Shutdown time: 2.1s
  ├─ Orphaned processes: 0
  ├─ Redis cleanup: ✅
  └─ SQLite cleanup: ✅

═══════════════════════════════════════════════════════════════════
Test Summary
═══════════════════════════════════════════════════════════════════

Tests Passed: 6/6 (100%)
Total Duration: 8.3s

Connection Metrics:
  ├─ cfnConnectionCount: 5
  ├─ cfnWorkerSpawnCount: 5
  └─ cfnCoordinatorConnections: 1

Handoff Metrics:
  ├─ cfnHandoffCount: 10
  ├─ cfnReviewerAssignments: 3
  └─ cfnHandoffFailures: 0

Lifecycle Metrics:
  ├─ cfnStartupTime: 1.5s
  ├─ cfnShutdownTime: 2.1s
  └─ cfnOrphanedProcesses: 0

Detailed Reports:
  ├─ tests/cfn-v3-orchestration/results/connection-counts.json
  ├─ tests/cfn-v3-orchestration/results/handoff-counts.json
  └─ tests/cfn-v3-orchestration/results/full-report.json

═══════════════════════════════════════════════════════════════════
✅ ALL TESTS PASSED - CFN v3 Orchestration Validated
═══════════════════════════════════════════════════════════════════
```

## Test Configuration

### Environment Variables

```bash
# Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Test configuration
CFN_TEST_WORKERS=5           # Number of workers to spawn
CFN_TEST_TASKS=10            # Number of tasks to assign
CFN_TEST_REVIEWERS=3         # Number of reviewers
CFN_TEST_TIMEOUT=30000       # Test timeout (ms)

# Logging
CFN_TEST_VERBOSE=false       # Enable verbose logging
CFN_TEST_DEBUG=false         # Enable debug output
```

### Test Thresholds

```javascript
{
  "connectionTime": {
    "max": 2000,        // Max time to establish connection (ms)
    "avg": 1000         // Target average connection time (ms)
  },
  "handoffTime": {
    "max": 1000,        // Max handoff time (ms)
    "avg": 500          // Target average handoff time (ms)
  },
  "shutdownTime": {
    "max": 5000,        // Max shutdown time (ms)
    "target": 3000      // Target shutdown time (ms)
  },
  "successRate": {
    "connections": 1.0, // 100% connection success
    "handoffs": 1.0,    // 100% handoff success
    "cleanup": 1.0      // 100% cleanup success
  }
}
```

## Validation Criteria

### Connection Validation
- ✅ All workers successfully spawn
- ✅ All connections registered in Redis
- ✅ Connection count matches worker count
- ✅ No duplicate worker IDs
- ✅ Connection time within threshold

### Handoff Validation
- ✅ All tasks handed off successfully
- ✅ Handoff count matches task count
- ✅ Reviewers assigned fairly
- ✅ No lost handoffs
- ✅ Handoff state persisted in SQLite

### Shutdown Validation
- ✅ All workers terminated gracefully
- ✅ No orphaned processes
- ✅ Redis keys cleaned up
- ✅ SQLite connections closed
- ✅ Shutdown time within threshold

## Troubleshooting

### Test Failures

**Connection count mismatch**
```
Expected: cfnConnectionCount = 5
Actual: cfnConnectionCount = 3

Diagnosis: 2 workers failed to connect
Fix: Check Redis logs, verify worker spawn process
```

**Handoff failures**
```
Expected: cfnHandoffFailures = 0
Actual: cfnHandoffFailures = 2

Diagnosis: Reviewer not available or handoff timeout
Fix: Increase handoff timeout, check reviewer pool
```

**Orphaned processes**
```
Expected: cfnOrphanedProcesses = 0
Actual: cfnOrphanedProcesses = 1

Diagnosis: Worker did not respond to shutdown signal
Fix: Check worker shutdown handlers, verify SIGTERM handling
```

### Debug Mode

```bash
# Run with debug logging
CFN_TEST_DEBUG=true npm run test:cfn-v3

# Output process tree during tests
CFN_TEST_VERBOSE=true npm run test:cfn-v3 -- --show-processes

# Keep processes alive for manual inspection
npm run test:cfn-v3 -- --no-cleanup --pause-on-failure
```

## Integration with CI/CD

### GitHub Actions

```yaml
name: CFN v3 Orchestration Tests

on: [push, pull_request]

jobs:
  cfn-v3-tests:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run CFN v3 tests
        run: npm run test:cfn-v3
        env:
          REDIS_HOST: localhost
          REDIS_PORT: 6379

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: cfn-v3-test-results
          path: tests/cfn-v3-orchestration/results/
```

## Metrics Collection

### Connection Metrics Report

```json
{
  "timestamp": "2025-10-25T19:30:00Z",
  "testRun": "cfn-v3-full-suite",
  "connections": {
    "cfnConnectionCount": 5,
    "cfnWorkerSpawnCount": 5,
    "cfnCoordinatorConnections": 1,
    "connectionTimes": [800, 750, 820, 790, 810],
    "avgConnectionTime": 794,
    "maxConnectionTime": 820,
    "minConnectionTime": 750,
    "failedConnections": 0
  }
}
```

### Handoff Metrics Report

```json
{
  "timestamp": "2025-10-25T19:30:00Z",
  "testRun": "cfn-v3-full-suite",
  "handoffs": {
    "cfnHandoffCount": 10,
    "cfnReviewerAssignments": 3,
    "cfnHandoffFailures": 0,
    "handoffTimes": [450, 480, 520, 490, 510, 470, 500, 530, 460, 490],
    "avgHandoffTime": 490,
    "maxHandoffTime": 530,
    "minHandoffTime": 450,
    "reviewerDistribution": {
      "reviewer-1": 4,
      "reviewer-2": 3,
      "reviewer-3": 3
    }
  }
}
```

## Maintenance

### Adding New Tests

1. Create test file in `tests/` directory
2. Follow naming convention: `NN-test-name.test.js`
3. Use test harness from `lib/cfn-test-harness.js`
4. Update `run-full-suite.sh` to include new test
5. Document expected metrics

### Updating Metrics

1. Modify tracker in `lib/cfn-connection-tracker.js` or `lib/cfn-handoff-tracker.js`
2. Update metrics collector in `lib/cfn-metrics-collector.js`
3. Update this README with new metric definitions
4. Update validation criteria

## Related Documentation

- [CFN Loop Complete Guide](../../docs/cfn-loop/CFN_LOOP_COMPLETE_GUIDE.md)
- [Redis Coordination Skill](../../.claude/skills/cfn-redis-coordination/SKILL.md)
- [SQLite Memory](../../src/sqlite/MemoryStoreAdapter.cjs)
- [Test Architecture](./ARCHITECTURE.md)

## Support

For issues or questions:
- Check [Troubleshooting](#troubleshooting) section
- Review test logs in `results/` directory
- Enable debug mode for detailed output
- Check Redis and process status
