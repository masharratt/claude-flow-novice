# Cross-Platform Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for Claude Flow Novice cross-platform support, ensuring reliable operation on Windows, macOS, Linux, WSL2, and CI/CD environments.

## Testing Objectives

1. **Functional Parity**: All features work identically across platforms
2. **Performance Validation**: No significant regressions on any platform
3. **Memory Safety**: Zero memory leaks under normal operation
4. **Graceful Degradation**: Failures handled appropriately
5. **CI/CD Coverage**: Automated testing on all target platforms

## Test Pyramid

```
                    ┌─────────────────┐
                    │   E2E Tests     │  (10%)
                    │  Full Workflows │
                    └─────────────────┘
                  ┌─────────────────────┐
                  │  Integration Tests  │  (30%)
                  │  Module Interactions│
                  └─────────────────────┘
              ┌─────────────────────────────┐
              │      Unit Tests            │  (60%)
              │  Individual Components     │
              └─────────────────────────────┘
```

## Test Categories

### 1. Unit Tests (60% of test suite)

#### Platform Detection Tests
**File**: `src/utils/platform-detector.test.ts`

**Coverage**:
```typescript
describe('PlatformDetector', () => {
  describe('detect()', () => {
    test('detects Windows 10', () => { /* ... */ });
    test('detects Windows 11', () => { /* ... */ });
    test('detects macOS Monterey', () => { /* ... */ });
    test('detects macOS Ventura', () => { /* ... */ });
    test('detects Ubuntu 20.04', () => { /* ... */ });
    test('detects Ubuntu 22.04', () => { /* ... */ });
    test('detects WSL2', () => { /* ... */ });
  });

  describe('detectWSL()', () => {
    test('detects WSL via environment variable', () => { /* ... */ });
    test('detects WSL via /proc/version', () => { /* ... */ });
    test('returns false on native Linux', () => { /* ... */ });
  });

  describe('detectCI()', () => {
    test('detects GitHub Actions', () => { /* ... */ });
    test('detects GitLab CI', () => { /* ... */ });
    test('detects CircleCI', () => { /* ... */ });
    test('returns false in local environment', () => { /* ... */ });
  });

  describe('detectCapabilities()', () => {
    test('detects bash on Unix', () => { /* ... */ });
    test('detects PowerShell on Windows', () => { /* ... */ });
    test('detects WSL availability on Windows', () => { /* ... */ });
    test('detects Redis availability', () => { /* ... */ });
    test('detects SQLite availability', () => { /* ... */ });
  });
});
```

**Mocking Strategy**:
- Mock `process.platform` for different OS tests
- Mock `process.env` for CI detection
- Mock `fs.readFileSync` for /proc/version tests
- Mock `spawnSync` for command availability checks

#### Process Manager Tests
**File**: `src/utils/process-manager.test.ts`

**Coverage**:
```typescript
describe('ProcessManager', () => {
  describe('getInstance()', () => {
    test('returns UnixProcessManager on Linux', () => { /* ... */ });
    test('returns UnixProcessManager on macOS', () => { /* ... */ });
    test('returns WindowsProcessManager on Windows', () => { /* ... */ });
  });

  describe('UnixProcessManager', () => {
    test('spawns process successfully', () => { /* ... */ });
    test('kills process with SIGTERM', () => { /* ... */ });
    test('kills process with SIGKILL', () => { /* ... */ });
    test('detects running process', () => { /* ... */ });
    test('detects terminated process', () => { /* ... */ });
    test('cleans up all processes', () => { /* ... */ });
  });

  describe('WindowsProcessManager', () => {
    test('spawns process successfully', () => { /* ... */ });
    test('kills process with taskkill', () => { /* ... */ });
    test('detects running process', () => { /* ... */ });
    test('detects terminated process', () => { /* ... */ });
    test('cleans up all processes', () => { /* ... */ });
  });
});
```

**Test Environment**:
- Real process spawning (not mocked)
- Short-lived test processes (1-5 seconds)
- Cleanup in `afterEach` hooks

#### Coordination Adapter Tests
**File**: `src/coordination/coordination-adapter.test.ts`

**Coverage**:
- Signal/wait pattern correctness
- Timeout handling
- Connection failure recovery
- Data serialization/deserialization
- Concurrent operations

### 2. Integration Tests (30% of test suite)

#### CFN Loop Orchestration Tests
**File**: `tests/integration/cfn-loop-orchestration.test.ts`

**Scenarios**:
1. **Single Iteration Success**
   - Spawn Loop 3 agents
   - Collect confidence scores
   - Gate passes (≥0.75)
   - Spawn Loop 2 validators
   - Consensus reaches threshold
   - Product Owner decides PROCEED

2. **Multi-Iteration with Gate Failure**
   - Loop 3 confidence <0.75
   - Skip Loop 2
   - Iteration N+1
   - Eventually reach threshold

3. **Abort Scenario**
   - Product Owner decides ABORT
   - Graceful cleanup
   - No zombie processes

#### Agent Spawning Tests
**File**: `tests/integration/agent-spawning.test.ts`

**Scenarios**:
1. **CLI Mode Spawning**
   - Spawn worker via CLI
   - Verify process starts
   - Verify completion signaling
   - Verify cleanup

2. **Task Mode Spawning**
   - Spawn worker via Task() tool
   - Verify Main Chat coordination
   - Verify output collection

3. **Parallel Agent Spawning**
   - Spawn 10 agents simultaneously
   - Verify all start successfully
   - Verify no resource exhaustion
   - Verify cleanup

#### Redis Coordination Tests
**File**: `tests/integration/redis-coordination.test.ts`

**Scenarios**:
1. **Signal/Wait Pattern**
   - Agent A signals completion
   - Agent B waits for signal
   - Signal delivered successfully
   - No timeout

2. **Timeout Handling**
   - Agent waits for signal
   - Signal never arrives
   - Wait times out appropriately
   - Error handled gracefully

3. **Connection Failure Recovery**
   - Redis connection lost
   - Automatic reconnection
   - Operations resume

### 3. End-to-End Tests (10% of test suite)

#### Full CFN Loop Workflow
**File**: `tests/e2e/cfn-loop-full-workflow.test.ts`

**Test**: Complete CFN Loop execution on real task

```typescript
test('E2E: Implement simple feature via CFN Loop', async () => {
  // 1. Initialize task
  const taskId = 'test-feature-' + Date.now();
  const taskDescription = 'Add hello world function to utils';

  // 2. Execute CFN Loop in CLI mode
  const result = await executeCFNLoop({
    mode: 'standard',
    taskId,
    description: taskDescription,
    maxIterations: 3
  });

  // 3. Verify deliverables
  expect(result.status).toBe('PROCEED');
  expect(result.iterations).toBeLessThanOrEqual(3);
  expect(fs.existsSync('src/utils/hello.ts')).toBe(true);

  // 4. Verify no leaks
  const memoryAfter = process.memoryUsage();
  expect(memoryAfter.heapUsed).toBeLessThan(memoryBefore.heapUsed * 1.1);

  // 5. Verify cleanup
  const runningProcesses = await getRunningCFNProcesses();
  expect(runningProcesses).toHaveLength(0);
}, 300000); // 5 minute timeout
```

**Platforms**: Run on Linux, macOS, Windows, WSL2 in CI/CD

#### Platform-Specific Workflows
**Files**: `tests/e2e/platform-specific/*.test.ts`

**Windows-Specific**:
- PowerShell script execution
- Job Object cleanup verification
- Long path handling

**Unix-Specific**:
- POSIX signal handling
- Process group management
- bash script execution

**WSL-Specific**:
- Path conversion (Windows ↔ WSL)
- Cross-boundary file operations
- bash execution from Windows

## Performance Testing

### Benchmarking Suite
**File**: `tests/performance/benchmark-suite.ts`

**Metrics**:
1. **Process Spawning**
   - Time to spawn single agent
   - Time to spawn 10 agents in parallel
   - Overhead of platform abstraction layer

2. **File I/O**
   - Read/write speed on native filesystem
   - Read/write speed across WSL boundary (Windows)

3. **Coordination Operations**
   - Signal latency (Redis pub/sub)
   - Query latency (SQLite)
   - Throughput under load

**Baseline**:
- Establish baseline on Linux (current production)
- Compare all other platforms to Linux baseline
- Flag regressions >10%

**Example**:
```typescript
describe('Performance Benchmarks', () => {
  test('Process spawning under 100ms', async () => {
    const start = Date.now();
    const manager = ProcessManager.getInstance();
    const proc = manager.spawn('echo', ['test']);
    await proc.wait();
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(100);
  });

  test('10 parallel agents under 1 second', async () => {
    const start = Date.now();
    const manager = ProcessManager.getInstance();

    const agents = Array(10).fill(0).map((_, i) =>
      manager.spawn('echo', [`agent-${i}`])
    );

    await Promise.all(agents.map(a => a.wait()));
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000);
  });
});
```

### Memory Leak Detection
**File**: `tests/performance/memory-leak-test.ts`

**Approach**:
1. Record baseline memory usage
2. Execute 1000 agent spawn/cleanup cycles
3. Force garbage collection
4. Measure final memory usage
5. Calculate growth rate

**Pass Criteria**: <0.1% memory growth rate

**Example**:
```typescript
test('No memory leaks over 1000 iterations', async () => {
  // Force GC to get clean baseline
  if (global.gc) global.gc();

  const baseline = process.memoryUsage().heapUsed;

  // Execute 1000 spawn/cleanup cycles
  for (let i = 0; i < 1000; i++) {
    const manager = ProcessManager.getInstance();
    const proc = manager.spawn('echo', ['test']);
    await proc.wait();
    await manager.cleanup();

    // Periodic GC to avoid false positives
    if (i % 100 === 0 && global.gc) {
      global.gc();
    }
  }

  // Final GC
  if (global.gc) global.gc();

  const final = process.memoryUsage().heapUsed;
  const growth = ((final - baseline) / baseline) * 100;

  console.log(`Memory growth: ${growth.toFixed(2)}%`);
  expect(growth).toBeLessThan(0.1); // <0.1% growth
}, 600000); // 10 minute timeout
```

## CI/CD Integration

### GitHub Actions Matrix
**File**: `.github/workflows/cross-platform-test.yml`

```yaml
name: Cross-Platform Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: ['18', '20', '22']
      fail-fast: false

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'

      - name: Setup Redis (Linux)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y redis-server
          sudo systemctl start redis-server

      - name: Setup Redis (macOS)
        if: runner.os == 'macOS'
        run: |
          brew install redis
          brew services start redis

      - name: Setup Redis (Windows)
        if: runner.os == 'Windows'
        run: |
          choco install redis-64 -y
          redis-server --service-install
          redis-server --service-start

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Run E2E tests
        run: npm run test:e2e
        timeout-minutes: 30

      - name: Run performance tests
        if: matrix.node == '20' # Only on Node 20
        run: npm run test:performance

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results-${{ matrix.os }}-node${{ matrix.node }}
          path: |
            test-results/
            coverage/

  memory-leak-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:memory-leak
        timeout-minutes: 15
```

### Test Execution Schedule

| Phase | Trigger | Duration | Platforms |
|-------|---------|----------|-----------|
| **Pre-commit** | Local hook | 30s | Current platform only |
| **PR Creation** | GitHub Action | 5min | Linux only (fast feedback) |
| **PR Update** | GitHub Action | 20min | All platforms (full matrix) |
| **Merge to Main** | GitHub Action | 30min | All platforms + memory tests |
| **Nightly** | Scheduled | 60min | All platforms + performance |

## Test Data Management

### Test Fixtures
**Location**: `tests/fixtures/`

**Structure**:
```
tests/fixtures/
  ├── agents/           # Sample agent configurations
  ├── tasks/            # Sample task definitions
  ├── coordination/     # Redis/SQLite test data
  └── platform/         # Platform-specific test data
```

### Isolation Strategy
- Each test gets unique task ID
- Separate Redis keyspace per test
- Separate SQLite database per test
- Cleanup in `afterEach` hooks

## Regression Testing

### Regression Suite
**File**: `tests/regression/regression-suite.ts`

**Purpose**: Catch breaking changes in platform abstraction

**Approach**:
1. Capture baseline behavior on current Linux implementation
2. Execute same tests on new platform abstraction
3. Assert identical results

**Example**:
```typescript
describe('Regression: Process Spawning', () => {
  test('Same exit code on all platforms', async () => {
    const manager = ProcessManager.getInstance();
    const proc = manager.spawn('node', ['-e', 'process.exit(42)']);
    const exitCode = await proc.wait();

    expect(exitCode).toBe(42); // Same on all platforms
  });
});
```

## Test Reporting

### Metrics Tracked
1. **Pass Rate**: Tests passing / total tests
2. **Coverage**: Line/branch coverage percentage
3. **Duration**: Test execution time
4. **Flakiness**: Tests with inconsistent results
5. **Performance**: Benchmark results over time

### Dashboard
- GitHub Actions summary page
- Coverage reports via Codecov
- Performance trends via custom dashboard

## Rollout Testing Strategy

### Phase 1: Development (Week 1-2)
- Local testing on developer machines
- Unit tests only
- Fast feedback loop

### Phase 2: Integration (Week 3)
- Integration tests enabled
- CI/CD matrix activated
- Platform-specific issues identified

### Phase 3: Pre-Production (Week 4)
- E2E tests enabled
- Performance validation
- Memory leak testing
- User acceptance testing (if applicable)

### Phase 4: Production (Week 5+)
- Gradual rollout via feature flag
- Monitor production metrics
- A/B testing (if applicable)

## Success Criteria

### Functional
- [ ] 100% test pass rate on all platforms
- [ ] Zero flaky tests
- [ ] Coverage >80% on platform abstraction layer

### Performance
- [ ] No regression >10% on any metric
- [ ] Windows native 10-30% faster than WSL2
- [ ] Memory growth <0.1% over 1000 iterations

### Quality
- [ ] Zero critical bugs
- [ ] All known limitations documented
- [ ] Rollback plan validated

---

**Version**: 1.0
**Last Updated**: 2025-01-10
**Next Review**: After Week 2 (Integration Tests)
