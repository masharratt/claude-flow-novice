# Chaos Engineering Tests - Sprint 3.4

**Epic:** production-blocking-coordination
**Sprint:** 3.4 - Chaos Engineering Tests
**Status:** Complete ✅

## Overview

Comprehensive chaos engineering test suite that validates blocking coordination resilience under extreme failure conditions. Tests cover random process kills, Redis restarts, clock skew, network partitions, and extreme concurrency stress.

## Test Suites

### 1. Random Process Kill Test

**File:** `tests/chaos/random-process-kill.test.ts`

**Scenario:**
- Duration: 10 minutes
- Kill random coordinator process every 30 seconds
- Verify dead coordinator detection within 2 minutes
- Verify automatic coordinator replacement
- Verify work transfer to new coordinators

**Success Criteria:**
- ≥90% coordinator uptime
- Dead coordinator detection within 2 minutes (120s)
- ≥80% of killed coordinators detected

**Run:**
```bash
npm run test:chaos:process-kill
```

**Variations:**
- **Aggressive kill:** Every 10 seconds for 3 minutes (≥70% uptime expected)
- **Burst kill:** Kill 3 coordinators simultaneously every minute (≥60% uptime expected)

### 2. Redis Restart Test

**File:** `tests/chaos/redis-restart.test.ts`

**Scenario:**
- Duration: 10 minutes
- Restart Redis server every 2 minutes (5 restarts total)
- Verify circuit breaker triggers reconnection
- Verify coordinators reconnect with exponential backoff
- Verify no data loss (blocking state persists)

**Success Criteria:**
- 100% state recovery after restarts
- Circuit breaker opens during Redis connection loss
- Circuit breaker closes after reconnection
- Heartbeats resume after reconnection

**Run:**
```bash
npm run test:chaos:redis-restart
```

**Variations:**
- **Rapid restarts:** Every 30 seconds for 5 cycles
- **Heartbeat continuity:** Verify heartbeat iteration increases after restart

### 3. Clock Skew Simulation Test

**File:** `tests/chaos/clock-skew.test.ts`

**Scenario:**
- Skew coordinator clocks by ±5 minutes
- Verify timeout calculations use Redis TIME command (not local clock)
- Verify heartbeat validation handles skew gracefully
- Verify no premature timeouts due to clock drift

**Success Criteria:**
- All timeouts trigger at correct Redis time
- Clock skew detected in heartbeat timestamps
- Timeout accuracy within 5 seconds tolerance

**Run:**
```bash
npm run test:chaos:clock-skew
```

**Variations:**
- **+5 minutes ahead:** Coordinator clock ahead of Redis time
- **-5 minutes behind:** Coordinator clock behind Redis time
- **Mixed skew:** Multiple coordinators with different skews

### 4. Network Partition Test

**File:** `tests/chaos/network-partition.test.ts`

**Scenario:**
- Duration: 5 minutes partition, then restore
- Simulate network partition using `iptables` (Linux only)
- Verify coordinators detect partition via Redis connection failure
- Verify circuit breaker prevents cascade failures
- Verify automatic reconnection after partition heals

**Success Criteria:**
- Full recovery within 2 minutes of partition healing
- Circuit breaker triggers during partition
- State preserved across partition

**Run:**
```bash
npm run test:chaos:network
```

**Requirements:**
- Linux with `iptables` installed
- `sudo` privileges
- Skipped in CI environments without network admin permissions

**Variations:**
- **Network flapping:** 3 partition/heal cycles (30s each)
- **Brief partition:** 30-second partition test

### 5. 100 Concurrent Coordinators Stress Test

**File:** `tests/chaos/concurrent-stress.test.ts`

**Scenario:**
- Spawn 100 coordinators simultaneously
- Each coordinator blocks for random duration (1-10 minutes)
- Send signals to random coordinators every 5 seconds
- Verify no race conditions or deadlocks
- Verify all coordinators complete or timeout correctly

**Success Criteria:**
- 100% completion rate (no hung coordinators)
- ≥80% finished rate (completed or timed out)
- No race conditions detected
- Heap usage < 1GB

**Run:**
```bash
npm run test:chaos:stress
```

**Variations:**
- **High throughput:** 1000 signals/minute (20 coordinators)
- **Spawn race:** 50 coordinators spawned simultaneously
- **Signal race:** 100 signals to same coordinator simultaneously
- **Memory pressure:** 200 coordinators for memory testing

## Running Chaos Tests

### Local Environment (All Tests)

```bash
# Run all chaos tests (includes network partition)
npm run test:chaos:local

# Or use generic script (same as local)
npm run test:chaos
```

### CI Environment (Skip Network Partition)

```bash
# Run chaos tests without network partition (no sudo required)
npm run test:chaos:ci
```

### Individual Test Suites

```bash
# Random process kill (15 min)
npm run test:chaos:process-kill

# Redis restart (15 min)
npm run test:chaos:redis-restart

# Clock skew (15 min)
npm run test:chaos:clock-skew

# Network partition (15 min, requires sudo)
npm run test:chaos:network

# Concurrent stress (25 min)
npm run test:chaos:stress
```

## Local Setup

### Prerequisites

**All Platforms:**
- Node.js ≥20.0.0
- Redis server running locally
- At least 2GB RAM available

**Linux (for network partition tests):**
```bash
# Install iptables
sudo apt-get install iptables

# Verify sudo access
sudo -v
```

**macOS:**
```bash
# Redis via Homebrew
brew install redis
brew services start redis

# Note: Network partition tests skipped (no iptables)
```

**Windows (WSL2):**
```bash
# Install Redis
sudo apt-get install redis-server
sudo service redis-server start

# Install iptables (for network partition tests)
sudo apt-get install iptables
```

### Redis Configuration

Ensure Redis is configured for testing:

```bash
# Check Redis is running
redis-cli ping
# Expected: PONG

# Set test database
export REDIS_TEST_DB=15

# Optional: Custom Redis host/port
export REDIS_HOST=localhost
export REDIS_PORT=6379
```

### Running Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start Redis:**
   ```bash
   npm run redis:start
   ```

3. **Run chaos tests:**
   ```bash
   npm run test:chaos:local
   ```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/chaos-tests.yml
name: Chaos Tests

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  chaos:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Run Chaos Tests (CI mode)
        run: npm run test:chaos:ci
        timeout-minutes: 120  # 2 hours
        env:
          REDIS_HOST: localhost
          REDIS_PORT: 6379
          REDIS_TEST_DB: 15
```

### Test Exclusions for CI

The CI script (`test:chaos:ci`) excludes network partition tests because:
- Requires `sudo` privileges
- Requires `iptables` (not available in containerized CI)
- Not supported on all platforms (macOS, Windows)

## Troubleshooting

### Redis Connection Errors

**Error:** `ECONNREFUSED` or `Redis connection failed`

**Solutions:**
```bash
# Check Redis is running
redis-cli ping

# Start Redis
npm run redis:start

# Check Redis port
netstat -an | grep 6379

# Check Redis logs
tail -f /var/log/redis/redis-server.log
```

### Network Partition Test Failures

**Error:** `iptables: command not found`

**Solution:**
```bash
# Install iptables (Linux)
sudo apt-get install iptables

# Verify installation
which iptables

# Check sudo access
sudo -v
```

**Error:** `Permission denied` when running network partition test

**Solution:**
```bash
# Run with sudo (not recommended)
sudo npm run test:chaos:network

# OR: Skip network partition tests
npm run test:chaos:ci
```

### Process Kill Test Failures

**Error:** `No alive coordinators available`

**Solution:**
- Coordinators are being killed faster than they can spawn
- Reduce kill frequency or increase coordinator count
- Check system resources (CPU, memory)

**Error:** `Dead coordinator detection timeout`

**Solution:**
- Heartbeat warning system may be slow
- Increase detection timeout in test config
- Check Redis performance (run `redis-cli --latency`)

### Clock Skew Test Failures

**Error:** `Timeout triggered at wrong time`

**Solution:**
- Coordinator may not be using Redis TIME command
- Verify `coordinator-runner.js` uses `redis.time()` for timeout calculations
- Check for local clock drift: `ntpdate -q pool.ntp.org`

### Concurrent Stress Test Failures

**Error:** `Heap out of memory` or `JavaScript heap exhausted`

**Solution:**
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Run stress test with increased memory
npm run test:chaos:stress
```

**Error:** `Race condition detected` or `Signal delivery failed`

**Solution:**
- Reduce signal throughput (increase interval from 5s to 10s)
- Reduce coordinator count (100 → 50)
- Check Redis performance under load

## Performance Baselines

### Expected Performance Metrics

| Test Suite | Duration | Success Rate | Uptime | Detection Time |
|---|---|---|---|---|
| Random Process Kill | 10 min | ≥90% | ≥90% | <2 min |
| Redis Restart | 10 min | 100% | N/A | <30s reconnect |
| Clock Skew | 15 min | 100% | N/A | ±5s accuracy |
| Network Partition | 10 min | ≥95% | N/A | <2 min recovery |
| Concurrent Stress | 15 min | ≥80% finish rate | N/A | <1GB heap |

### Performance Degradation Thresholds

**Warning Thresholds:**
- Uptime < 85% (Random Process Kill)
- State recovery < 95% (Redis Restart)
- Timeout accuracy > 10s drift (Clock Skew)
- Recovery time > 3 minutes (Network Partition)
- Finish rate < 70% (Concurrent Stress)

**Critical Thresholds (escalate to team):**
- Uptime < 70%
- State recovery < 80%
- Timeout accuracy > 30s drift
- Recovery time > 5 minutes
- Finish rate < 50%

## Test Architecture

### Chaos Utilities (`tests/chaos/utils/chaos-helpers.ts`)

**Coordinator Management:**
- `spawnCoordinator()` - Spawn single coordinator with chaos config
- `spawnCoordinators()` - Spawn multiple coordinators
- `killProcess()` - Kill coordinator process
- `randomCoordinator()` - Get random alive coordinator

**Redis Management:**
- `restartRedis()` - Restart Redis server (systemd/homebrew/docker)
- `waitForRedis()` - Wait for Redis to be ready
- `waitForReconnection()` - Wait for coordinators to reconnect

**Network Management:**
- `createNetworkPartition()` - Block Redis port with iptables
- `healNetworkPartition()` - Remove iptables rules
- `isNetworkPartitionSupported()` - Check for iptables/sudo

**State Management:**
- `captureState()` - Snapshot coordinator state from Redis
- `compareStates()` - Compare state snapshots for equality
- `calculateUptime()` - Calculate coordinator uptime percentage

**Detection Helpers:**
- `deadCoordinatorDetected()` - Check if dead coordinator was detected
- `circuitBreakerOpen()` - Check if circuit breaker is open
- `verifyNoHungCoordinators()` - Ensure no coordinators are hung

### Coordinator Runner (`tests/chaos/fixtures/coordinator-runner.js`)

**Features:**
- Configurable timeout
- Clock skew simulation (`±Xm` format)
- Heartbeat broadcasting (5s interval)
- Signal polling (500ms interval)
- Graceful cleanup on SIGTERM/SIGINT
- Circuit breaker on Redis connection failure

**Usage:**
```bash
node coordinator-runner.js \
  --coordinator-id coord-1 \
  --timeout 600000 \
  --clock-skew +5m \
  --redis-host localhost \
  --redis-port 6379 \
  --redis-db 15
```

## Integration with CFN Loop

Chaos tests validate blocking coordination resilience that is critical for CFN Loop:

- **Loop 3 (Implementation):** Coordinators must survive process kills and Redis restarts
- **Loop 2 (Validation):** Validators depend on reliable blocking coordination
- **Loop 4 (Product Owner):** Decision-making requires stable state persistence

All chaos test scenarios reflect real-world production conditions that CFN Loop must handle gracefully.

## Future Enhancements

### Planned for Phase 4 (Documentation & Training):

1. **Additional Chaos Scenarios:**
   - Disk I/O throttling (simulate slow Redis persistence)
   - CPU throttling (simulate resource contention)
   - Memory pressure (simulate swap usage)

2. **Chaos Mesh Integration:**
   - Kubernetes-native chaos engineering
   - Automated chaos experiments in staging
   - Chaos dashboard for observability

3. **Extended Stress Tests:**
   - 1000 concurrent coordinators
   - 24-hour endurance test
   - Geographic distribution simulation

4. **Chaos Recording & Replay:**
   - Record chaos events for debugging
   - Replay failures in development
   - Automated regression testing

## References

- **Epic Config:** `planning/redis-finalization/production-blocking-coordination-config.json`
- **Sprint Plan:** Phase 3, Sprint 3.4 (lines 271-282)
- **Blocking Coordination:** `src/cfn-loop/blocking-coordination-signals.ts`
- **Heartbeat System:** `src/cfn-loop/heartbeat-warning-system.ts`
- **Timeout Handler:** `src/cfn-loop/coordinator-timeout-handler.ts`

---

**Last Updated:** 2025-10-10
**Maintained By:** Tester Agent
**Confidence Score:** 0.92
