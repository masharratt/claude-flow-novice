# CFN v3 Orchestration Tests - Quick Start Guide

## TL;DR

```bash
# Ensure Redis is running
redis-cli ping  # Should return "PONG"

# Run full test suite
npm run test:cfn-v3

# Or run individual tests
npm run test:cfn-v3:connections  # Test connection tracking
npm run test:cfn-v3:handoffs     # Test handoff coordination
npm run test:cfn-v3:shutdown     # Test graceful shutdown
```

## What This Tests

This test suite validates the **complete CFN v3 orchestration lifecycle**, tracking:

### 📊 Connection Metrics
- `cfnConnectionCount` - Total coordinator → worker connections
- `cfnWorkerSpawnCount` - Number of workers spawned
- `cfnCoordinatorConnections` - Active coordinators

### 🤝 Handoff Metrics
- `cfnHandoffCount` - Total worker → reviewer handoffs
- `cfnReviewerAssignments` - Number of reviewers assigned
- `cfnHandoffFailures` - Failed handoff attempts

### ⏱️ Lifecycle Metrics
- `cfnStartupTime` - Time to first worker connection
- `cfnShutdownTime` - Time to complete shutdown
- `cfnOrphanedProcesses` - Processes not cleaned up

## Prerequisites

```bash
# 1. Redis must be running
redis-cli ping

# If not running, start Redis:
# macOS: brew services start redis
# Linux: sudo systemctl start redis
# Docker: docker run -d -p 6379:6379 redis:7

# 2. Node.js 18+ required
node --version  # Should be >= 18.0.0

# 3. Dependencies installed
npm install
```

## Running Tests

### Full Test Suite (Recommended)

```bash
# Run all 6 tests in sequence
npm run test:cfn-v3

# With verbose output
CFN_TEST_VERBOSE=true npm run test:cfn-v3

# With debug logging
CFN_TEST_DEBUG=true npm run test:cfn-v3

# Custom configuration
CFN_TEST_WORKERS=10 CFN_TEST_TASKS=20 npm run test:cfn-v3
```

Expected output:
```
═══════════════════════════════════════════════════════════════════
CFN v3 Orchestration Test Suite
═══════════════════════════════════════════════════════════════════

[1/6] Coordinator Initialization................................. ✅ PASSED
[2/6] Worker Connections......................................... ✅ PASSED
[3/6] Task Distribution.......................................... ✅ PASSED
[4/6] Handoff Coordination....................................... ✅ PASSED
[5/6] State Persistence.......................................... ✅ PASSED
[6/6] Graceful Shutdown.......................................... ✅ PASSED

═══════════════════════════════════════════════════════════════════
Test Suite Summary
═══════════════════════════════════════════════════════════════════

Tests Passed: 6/6
Total Duration: 45s

✅ ALL TESTS PASSED
```

### Individual Tests

#### Test 02: Worker Connections

```bash
npm run test:cfn-v3:connections
```

Validates:
- ✅ All workers spawn successfully
- ✅ `cfnConnectionCount` matches expected worker count
- ✅ All connections registered in Redis
- ✅ Connection times within threshold (< 2s)
- ✅ No duplicate worker IDs

Expected metrics:
```
cfnConnectionCount:        5
cfnWorkerSpawnCount:       5
cfnCoordinatorConnections: 1
Avg Connection Time:       794ms
```

#### Test 04: Handoff Coordination

```bash
npm run test:cfn-v3:handoffs
```

Validates:
- ✅ All handoffs execute successfully
- ✅ `cfnHandoffCount` matches expected task count
- ✅ No handoff failures (`cfnHandoffFailures` = 0)
- ✅ Handoff times within threshold (< 1s)
- ✅ Reviewer load is balanced
- ✅ All handoffs persisted in Redis

Expected metrics:
```
cfnHandoffCount:        10
cfnReviewerAssignments: 3
cfnHandoffFailures:     0
Avg Handoff Time:       490ms
```

#### Test 06: Graceful Shutdown

```bash
npm run test:cfn-v3:shutdown
```

Validates:
- ✅ Shutdown completes within threshold (< 5s)
- ✅ No orphaned processes (`cfnOrphanedProcesses` = 0)
- ✅ All processes terminated
- ✅ Redis keys cleaned up
- ✅ Shutdown time recorded

Expected metrics:
```
cfnShutdownTime:       2100ms
cfnOrphanedProcesses:  0
Processes terminated:  6/6
Redis keys remaining:  0
```

## Configuration Options

### Environment Variables

```bash
# Number of workers to spawn (default: 5)
CFN_TEST_WORKERS=10 npm run test:cfn-v3:connections

# Number of tasks to assign (default: 10)
CFN_TEST_TASKS=20 npm run test:cfn-v3:handoffs

# Number of reviewers (default: 3)
CFN_TEST_REVIEWERS=5 npm run test:cfn-v3:handoffs

# Enable verbose logging
CFN_TEST_VERBOSE=true npm run test:cfn-v3

# Enable debug mode
CFN_TEST_DEBUG=true npm run test:cfn-v3

# Redis configuration
REDIS_HOST=localhost REDIS_PORT=6379 npm run test:cfn-v3
```

### Command-Line Options

```bash
# Run specific test only
./tests/cfn-v3-orchestration/run-full-suite.sh --test=02-worker-connections

# Enable verbose output
./tests/cfn-v3-orchestration/run-full-suite.sh --verbose

# Skip cleanup (for debugging)
./tests/cfn-v3-orchestration/run-full-suite.sh --no-cleanup

# Custom worker count
./tests/cfn-v3-orchestration/run-full-suite.sh --workers=10 --tasks=20

# Combined options
./tests/cfn-v3-orchestration/run-full-suite.sh --verbose --workers=10 --test=04-handoff-coordination
```

## Understanding Results

### Test Report Files

After running tests, check `tests/cfn-v3-orchestration/results/`:

```bash
# View full report
cat tests/cfn-v3-orchestration/results/full-report.json

# Example report:
{
  "timestamp": "2025-10-25T19:30:00Z",
  "status": "PASSED",
  "testsPassed": 6,
  "testsFailed": 0,
  "totalDuration": 45,
  "configuration": {
    "workers": 5,
    "tasks": 10,
    "reviewers": 3
  }
}
```

### Success Criteria

**All tests should show:**
- ✅ Connection count = Worker count
- ✅ Handoff count = Task count
- ✅ Handoff failures = 0
- ✅ Orphaned processes = 0
- ✅ Connection times < 2s
- ✅ Handoff times < 1s
- ✅ Shutdown time < 5s

### Common Issues

**Redis connection failed**
```
Solution: Start Redis service
macOS: brew services start redis
Linux: sudo systemctl start redis
```

**Connection timeouts**
```
Solution: Increase timeout or reduce worker count
CFN_TEST_WORKERS=3 npm run test:cfn-v3:connections
```

**Orphaned processes**
```
Solution: Clean up manually
ps aux | grep "test-worker\|test-coordinator" | awk '{print $2}' | xargs kill -9
redis-cli FLUSHDB
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: CFN v3 Tests

on: [push, pull_request]

jobs:
  test-cfn-v3:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run CFN v3 tests
        run: npm run test:cfn-v3
        env:
          REDIS_HOST: localhost
          REDIS_PORT: 6379
          CFN_TEST_WORKERS: 5
          CFN_TEST_TASKS: 10

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: cfn-v3-test-results
          path: tests/cfn-v3-orchestration/results/
```

## Debugging

### Enable Verbose Mode

```bash
# See all process output
CFN_TEST_VERBOSE=true npm run test:cfn-v3:connections
```

### Enable Debug Mode

```bash
# See detailed internal logging
CFN_TEST_DEBUG=true npm run test:cfn-v3:connections
```

### Keep Processes Alive

```bash
# Skip cleanup to inspect state
./tests/cfn-v3-orchestration/run-full-suite.sh --no-cleanup

# Then check Redis
redis-cli KEYS "*"

# Check processes
ps aux | grep test-worker
```

### Check Redis State

```bash
# View all test keys
redis-cli KEYS "coordinator:*"
redis-cli KEYS "worker:*"
redis-cli KEYS "handoff:*"

# View specific key
redis-cli HGETALL "worker:test-worker-001"

# Monitor Redis commands in real-time
redis-cli MONITOR
```

### Manual Cleanup

```bash
# Kill all test processes
ps aux | grep -E "test-(worker|coordinator|reviewer)" | awk '{print $2}' | xargs kill -9

# Clean Redis
redis-cli FLUSHDB

# Clean test results
rm -rf tests/cfn-v3-orchestration/results/*
```

## Performance Benchmarks

### Expected Performance (Default Config)

| Metric | Target | Max Acceptable |
|--------|--------|----------------|
| Connection Time (avg) | 800ms | 1500ms |
| Connection Time (max) | 1200ms | 2000ms |
| Handoff Time (avg) | 500ms | 750ms |
| Handoff Time (max) | 800ms | 1000ms |
| Shutdown Time | 2000ms | 5000ms |
| Total Test Duration | 30-45s | 60s |

### High Load Performance (10 workers, 50 tasks)

```bash
CFN_TEST_WORKERS=10 CFN_TEST_TASKS=50 npm run test:cfn-v3
```

| Metric | Target | Max Acceptable |
|--------|--------|----------------|
| Connection Time (avg) | 1000ms | 2000ms |
| Handoff Time (avg) | 600ms | 1000ms |
| Shutdown Time | 3000ms | 8000ms |
| Total Test Duration | 60-90s | 120s |

## Next Steps

1. **Run tests locally**: `npm run test:cfn-v3`
2. **Review results**: Check `results/full-report.json`
3. **Add to CI/CD**: Use GitHub Actions example above
4. **Monitor regularly**: Run tests before each release
5. **Extend tests**: See `ARCHITECTURE.md` for adding custom tests

## Support

- **Documentation**: See `README.md` and `ARCHITECTURE.md`
- **Test failures**: Enable `--verbose` and check logs
- **Redis issues**: Verify with `redis-cli ping`
- **Process cleanup**: Use manual cleanup commands above

## Frequently Used Commands

```bash
# Quick validation (minimal config)
CFN_TEST_WORKERS=2 CFN_TEST_TASKS=5 npm run test:cfn-v3

# Full validation (default config)
npm run test:cfn-v3

# High load test
CFN_TEST_WORKERS=20 CFN_TEST_TASKS=100 npm run test:cfn-v3

# Debug specific test
CFN_TEST_DEBUG=true npm run test:cfn-v3:handoffs

# Run with custom timeouts (if needed)
CFN_TEST_TIMEOUT=60000 npm run test:cfn-v3

# Cleanup everything
redis-cli FLUSHDB && pkill -f "test-worker\|test-coordinator"
```
