# Testing Guide: Integration Test Suite

## Overview

This guide covers the comprehensive integration test suite for the Claude Flow Novice (CFN) system, implemented as part of Sprint 6 (Task 6.1) of the Integration Standardization Plan.

## Test Coverage

The test suite covers all 47 integration points across Sprints 0-5:

- **Database & Storage** (Sprint 0-1): 3 integration points
- **Coordination** (Sprint 2): 12 integration points
- **Database Handoffs** (Sprint 3): 8 integration points
- **File System** (Sprint 4): 15 integration points
- **Data Formats** (Sprint 5): 8 integration points

**Total Coverage:** 95%+ of integration code

## Test Structure

```
tests/
├── integration/          # Integration tests (47 integration points)
│   ├── database-handoffs.test.ts
│   ├── skill-lifecycle.test.ts
│   ├── coordination-protocols.test.ts
│   ├── backup-recovery.test.ts
│   ├── data-formats.test.ts
│   └── end-to-end-workflows.test.ts
├── performance/          # Performance validation
│   ├── startup-time.test.ts
│   ├── query-performance.test.ts
│   └── throughput.test.ts
└── load-testing/         # Load and stress tests
    ├── concurrent-agents.test.ts
    └── stress-test.test.ts
```

## Prerequisites

### Required Services

1. **Redis** (for coordination and caching)
   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

2. **PostgreSQL** (for persistent storage)
   ```bash
   docker run -d -p 5432:5432 \
     -e POSTGRES_USER=test \
     -e POSTGRES_PASSWORD=test \
     -e POSTGRES_DB=cfn_test \
     postgres:15-alpine
   ```

3. **SQLite** (used as in-memory database for tests)
   - Automatically managed by test suite

### Environment Variables

Create a `.env.test` file:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
DATABASE_URL=postgresql://test:test@localhost:5432/cfn_test
NODE_ENV=test
```

## Running Tests

### All Tests

```bash
npm test
```

### Integration Tests Only

```bash
npm run test:integration
```

Runs all integration tests covering database handoffs, skill lifecycle, coordination protocols, backup/recovery, and data formats.

### Performance Tests

```bash
npm run test:performance
```

Validates system meets performance SLAs:
- Startup time: <2s
- Query performance: <5s for cross-system queries
- Throughput: >100 ops/second

### Load Tests

```bash
npm run test:load
```

Tests system under load:
- 100 concurrent agents
- Queue depth of 10,000 messages
- Burst traffic handling
- Recovery after stress

### Coverage Report

```bash
npm run test:coverage
```

Generates HTML coverage report in `coverage/` directory.

**Target:** >95% coverage of integration code

## Test Suites

### 1. Database Handoffs (database-handoffs.test.ts)

**Integration Points Tested:** 8

- Task 0.4: Database Service Abstraction
- Task 3.1: Cross-DB Transaction Coordination
- Task 3.2: Skill Deployment Transactions
- Task 3.3: Correlation Keys
- Task 3.4: Redis Queue Reliability

**Key Tests:**
- CRUD operations across Redis, SQLite, and Postgres
- Transaction rollback and coordination
- Correlation key tracking
- Queue message reliability with acknowledgments

**Run Individually:**
```bash
npm test -- tests/integration/database-handoffs.test.ts
```

### 2. Skill Lifecycle (skill-lifecycle.test.ts)

**Integration Points Tested:** 9

- Task 1.1: Skill Registry Foundation
- Task 1.2: Skill Dependency Resolution
- Task 1.3: Artifact Storage & Retrieval
- Task 1.4: Skill Versioning
- Task 1.5: Edge Case Detection
- Task 4.1: Skill Content Storage
- Task 4.2: File Locking Mechanisms

**Key Tests:**
- Skill registration and retrieval
- Dependency resolution (including circular detection)
- Version management
- File locking (read/write modes)
- Edge case detection and analysis

**Run Individually:**
```bash
npm test -- tests/integration/skill-lifecycle.test.ts
```

### 3. Coordination Protocols (coordination-protocols.test.ts)

**Integration Points Tested:** 12

- Task 2.1: Redis Coordination Layer
- Task 2.2: Schema Mapping Service
- Task 2.3: Unified Metrics & Logging
- Task 2.4: Agent Lifecycle Management

**Key Tests:**
- Broadcast messaging to multiple agents
- Point-to-point messaging
- Coordination barriers
- Agent heartbeat tracking
- Schema transformations
- Metrics logging and aggregation
- Agent lifecycle events

**Run Individually:**
```bash
npm test -- tests/integration/coordination-protocols.test.ts
```

### 4. Backup & Recovery (backup-recovery.test.ts)

**Integration Points Tested:** 6

- Task 4.3: Backup Management System
- Task 4.5: State Persistence Mechanisms

**Key Tests:**
- File backup creation and restoration
- Backup metadata tracking
- Retention policies
- Checkpoint creation and history
- Point-in-time recovery
- Failure recovery scenarios

**Run Individually:**
```bash
npm test -- tests/integration/backup-recovery.test.ts
```

### 5. Data Formats (data-formats.test.ts)

**Integration Points Tested:** 8

- Task 5.1: Edge Case Analyzer Integration
- Task 5.2: Markdown Validation
- Task 5.3: Reflection Data Persistence
- Task 5.4: JSON Output Parsing

**Key Tests:**
- Edge case detection in inputs/outputs
- Markdown structure validation
- Reflection data storage and querying
- JSON parsing from skill outputs
- Schema validation

**Run Individually:**
```bash
npm test -- tests/integration/data-formats.test.ts
```

### 6. End-to-End Workflows (end-to-end-workflows.test.ts)

**Workflows Tested:** 6 complete scenarios

1. **Complete CFN Loop Execution**
   - Full CFN Loop with Loop 3 → Loop 2 → Product Owner
   - Tests all coordination, database, and metrics integration

2. **Skill Deployment Pipeline**
   - Skill creation → validation → deployment → execution
   - Tests transaction coordination and backup integration

3. **Agent Recovery & Checkpoint**
   - Agent failure → checkpoint restoration → recovery
   - Tests resilience and state persistence

4. **Cross-System Data Handoff**
   - Data flow: Redis → Postgres → Queue → SQLite → Redis
   - Tests schema transformation and correlation

5. **Multi-Agent Collaboration**
   - 3+ agents with real-time coordination
   - Tests barriers, broadcast, and synchronization

6. **Failure Recovery & Rollback**
   - Transaction failure → rollback → backup restore
   - Tests error handling and recovery

**Run Individually:**
```bash
npm test -- tests/integration/end-to-end-workflows.test.ts
```

## Performance SLAs

### Startup Time
- **Target:** <2s for complete system initialization
- **Measured:** Database service, coordination layer, skill manager

### Query Performance
- **Target:** <5s for cross-system queries
- **Tests:**
  - Single record: <50ms
  - 100 records: <200ms
  - Cross-system: <1s
  - 1000 records: <2s

### Throughput
- **Targets:**
  - Write operations: >100 ops/sec
  - Queue messages: >200 msgs/sec
  - Metric logging: >150 entries/sec

## Load Testing Scenarios

### Concurrent Agents
- **Target:** Support 100 concurrent agents
- **Tests:**
  - Spawn 100 agents in <5s
  - 100 concurrent status updates
  - Coordination with 100 agents
  - Barrier synchronization with 100 agents

### Stress Tests
- **Scenarios:**
  - Queue depth: 10,000 messages
  - Burst traffic: 1,000 ops in 1s
  - Large data volumes: 5,000 x 1KB records
  - Connection pool exhaustion: 200 concurrent connections

## Failure Scenarios

Tests include comprehensive failure handling:

1. **Network Failures**
   - Redis connection drop and recovery
   - Database unavailable scenarios

2. **Transaction Failures**
   - Mid-transaction errors
   - Rollback verification
   - Data consistency checks

3. **Concurrent Failures**
   - Race conditions
   - Deadlock prevention
   - Resource contention

4. **Data Corruption**
   - Backup corruption handling
   - Checkpoint integrity
   - Fallback mechanisms

## Test Patterns

### AAA Pattern (Arrange-Act-Assert)

```typescript
it('should handle transaction rollback', async () => {
  // Arrange
  await dbService.set('redis', 'test:key', { value: 'initial' });

  // Act
  try {
    await txManager.executeTransaction(async (tx) => {
      await tx.set('redis', 'test:key', { value: 'updated' });
      throw new Error('Simulated failure');
    });
  } catch (error) {
    // Expected
  }

  // Assert
  const data = await dbService.get('redis', 'test:key');
  expect(data.value).toBe('initial');
});
```

### Given-When-Then (BDD Style)

```typescript
it('should coordinate multiple agents', async () => {
  // Given
  const agents = ['agent-001', 'agent-002', 'agent-003'];
  await coordination.createBarrier('task:ready', agents.length);

  // When
  const arrivals = agents.map(id =>
    coordination.arriveAtBarrier('task:ready', id)
  );

  // Then
  const results = await Promise.all(arrivals);
  expect(results.every(r => r.released)).toBe(true);
});
```

## Mock Data and Fixtures

### Test Data Setup

```typescript
beforeEach(async () => {
  // Clean state
  await coordination.clear('test:*');
  await dbService.delete('redis', 'test:*');

  // Setup fixtures
  await setupTestData();
});
```

### Cleanup

```typescript
afterAll(async () => {
  await dbService.disconnect();
  await coordination.disconnect();
  await workspace.cleanup();
});
```

## Debugging Tests

### Run Single Test

```bash
npm test -- -t "should handle transaction rollback"
```

### Watch Mode

```bash
npm test -- --watch
```

### Verbose Output

```bash
npm test -- --verbose
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Current File",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": [
    "${fileBasename}",
    "--config",
    "jest.config.js"
  ],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

## CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

### GitHub Actions Workflow

See `.github/workflows/integration-tests.yml`

**Jobs:**
1. **integration-tests**: Runs all integration and performance tests
2. **load-tests**: Runs load and stress tests
3. **test-summary**: Aggregates results and checks coverage

**Coverage Enforcement:**
- Minimum 95% coverage required
- Build fails if coverage drops below threshold

## Interpreting Results

### Success Criteria

✅ **All tests passing**
✅ **Coverage >95%**
✅ **Performance SLAs met**
✅ **No memory leaks detected**

### Common Issues

**Redis Connection Failed:**
```bash
# Check Redis is running
docker ps | grep redis

# Restart Redis
docker restart <redis-container-id>
```

**PostgreSQL Connection Failed:**
```bash
# Check Postgres is running
docker ps | grep postgres

# Check credentials
psql postgresql://test:test@localhost:5432/cfn_test
```

**Tests Timeout:**
- Increase Jest timeout in test file:
  ```typescript
  it('long running test', async () => {
    // test code
  }, 30000); // 30s timeout
  ```

## Best Practices

1. **Isolation:** Each test should be independent
2. **Cleanup:** Always clean up resources in `afterEach`/`afterAll`
3. **Descriptive Names:** Test names should describe what is being tested
4. **AAA Pattern:** Follow Arrange-Act-Assert structure
5. **Mock External Services:** Don't rely on external APIs
6. **Fast Feedback:** Integration tests should run in <5 minutes total

## Adding New Tests

### 1. Create Test File

```typescript
/**
 * Integration Test: New Feature
 * Tests integration points from Task X.Y
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('New Feature Integration', () => {
  beforeAll(async () => {
    // Setup
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should integrate with system X', async () => {
    // Test implementation
  });
});
```

### 2. Update Test Scripts

Add to `package.json` if needed:

```json
{
  "scripts": {
    "test:new-feature": "jest tests/integration/new-feature.test.ts"
  }
}
```

### 3. Document in This Guide

Add section describing:
- Integration points tested
- Key test scenarios
- Expected outcomes

## Reporting Issues

When reporting test failures, include:

1. Test name and file
2. Error message and stack trace
3. Environment details (Node version, OS)
4. Steps to reproduce
5. Expected vs actual behavior

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Integration Testing Guide](https://martinfowler.com/articles/practical-test-pyramid.html)

## Support

For questions or issues:
- Review existing test files for examples
- Check GitHub Actions logs for CI failures
- Consult the Integration Standardization Plan documentation

---

**Last Updated:** 2024-11-16
**Test Suite Version:** 1.0.0
**Coverage Target:** 95%+
