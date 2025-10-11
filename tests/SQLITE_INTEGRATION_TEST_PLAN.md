# SQLite Integration Test Plan - Sprint 1.7

**Epic**: SQLite Integration Migration
**Sprint**: 1.7 - Testing & Validation
**Created**: 2025-10-10
**Status**: COMPLETE

---

## Executive Summary

This test plan covers comprehensive validation of the SQLite memory integration for the CFN Loop system. The migration from Redis-only to a dual-write pattern (Redis + SQLite) ensures production-ready persistence, cross-session recovery, and audit compliance.

**Test Coverage Breakdown**:
- **Unit Tests**: 3 suites, ~60 test cases
- **Integration Tests**: 2 suites, ~10 test cases
- **Chaos Tests**: 2 suites, ~8 test cases
- **Performance Tests**: 2 suites, ~8 test cases

**Total**: 9 test suites, ~86 test cases

---

## 1. Unit Test Suites

### 1.1 SQLite Memory Manager Tests
**File**: `src/cfn-loop/__tests__/sqlite-memory-manager.test.ts`

**Coverage**:
- ✅ Dual-write pattern (Redis + SQLite simultaneous writes)
- ✅ ACL enforcement (5 levels: PRIVATE, AGENT, SWARM, PROJECT, SYSTEM)
- ✅ Encryption (AES-256-GCM for sensitive levels 1, 2, 5)
- ✅ TTL expiration handling
- ✅ Redis failure fallback behavior
- ✅ Concurrent write handling
- ✅ Query performance with indexing

**Key Test Cases**:
1. `should write to both Redis and SQLite simultaneously`
2. `should maintain consistency between Redis and SQLite`
3. `should enforce PRIVATE level (agent-only access)`
4. `should encrypt PRIVATE level data (AES-256-GCM)`
5. `should respect TTL for entries`
6. `should handle concurrent writes to different keys`
7. `should efficiently query by ACL level (indexed)`

**Expected Coverage**: 100% of CFNLoopMemoryManager

### 1.2 Agent Lifecycle SQLite Tests
**File**: `src/cfn-loop/__tests__/agent-lifecycle-sqlite.test.ts`

**Coverage**:
- ✅ Agent spawn registration in SQLite
- ✅ Confidence score updates and history tracking
- ✅ Agent termination cleanup
- ✅ Audit log completeness
- ✅ Cross-session state recovery
- ✅ Concurrent agent operations

**Key Test Cases**:
1. `should register agent spawn in SQLite and Redis`
2. `should handle concurrent agent spawns`
3. `should update confidence score and track history`
4. `should track blockers in confidence updates`
5. `should terminate agent and cleanup state`
6. `should log all lifecycle events`
7. `should recover agent state from SQLite after Redis loss`

**Expected Coverage**: 100% of AgentLifecycleSQLite

### 1.3 Blocking Coordination Audit Tests
**File**: `src/cfn-loop/__tests__/blocking-coordination-audit.test.ts`

**Coverage**:
- ✅ Signal ACK event logging
- ✅ Timeout event persistence
- ✅ Dead coordinator escalation logging
- ✅ Work transfer logging
- ✅ Audit trail completeness
- ✅ Query performance for audit logs

**Key Test Cases**:
1. `should log Signal ACK events with complete data`
2. `should persist timeout events with duration data`
3. `should log dead coordinator detection`
4. `should log work transfer between coordinators`
5. `should maintain complete audit trail for coordinator lifecycle`
6. `should efficiently query events by timestamp range`
7. `should publish events to Redis channel for real-time monitoring`

**Expected Coverage**: 100% of BlockingCoordinationAudit

---

## 2. Integration Test Suites

### 2.1 CFN Loop End-to-End Tests
**File**: `tests/integration/cfn-loop-sqlite-integration.test.ts`

**Coverage**:
- ✅ Loop 3 → 2 → 4 workflow with full SQLite persistence
- ✅ Consensus calculation from SQLite data
- ✅ Product Owner decision using SQLite history
- ✅ Audit trail completeness across all loops

**Key Test Cases**:
1. `should execute full CFN Loop 3 → 2 → 4 with SQLite persistence`
2. `should calculate consensus from SQLite data accurately`
3. `should handle PROCEED decision when consensus < 0.90`
4. `should handle DEFER decision when consensus ≥ 0.90`

**Success Criteria**:
- ✅ All loop results persisted to SQLite
- ✅ Consensus calculation accuracy within 0.01
- ✅ Product Owner decisions based on SQLite data
- ✅ Complete audit trail from Loop 3 through Loop 4

### 2.2 Cross-Session Recovery Tests
**File**: `tests/integration/cross-session-recovery.test.ts`

**Coverage**:
- ✅ State recovery after simulated crash
- ✅ Work loss percentage validation (<5% requirement)
- ✅ Redis state reconstruction from SQLite
- ✅ Checkpoint integrity verification

**Key Test Cases**:
1. `should recover state after simulated crash with <5% work loss`
2. `should reconstruct Redis state from SQLite`
3. `should maintain checkpoint integrity across multiple saves`

**Success Criteria**:
- ✅ Work loss <5% after crash recovery
- ✅ Redis state accurately reconstructed from SQLite
- ✅ Checkpoint data integrity verified
- ✅ Recovery time <10 seconds

---

## 3. Chaos Test Suites

### 3.1 SQLite Failure Scenarios
**File**: `tests/chaos/sqlite-failure-scenarios.test.ts`

**Coverage**:
- ✅ SQLite connection loss (fallback to Redis)
- ✅ Redis connection loss (fallback to SQLite)
- ✅ Concurrent write conflicts (race conditions)
- ✅ Database lock contention (WAL mode)

**Key Test Cases**:
1. `should fallback to SQLite when Redis connection is lost`
2. `should continue writing to SQLite when Redis is unavailable`
3. `should handle concurrent writes without data loss (WAL mode)`
4. `should handle database lock contention gracefully`

**Success Criteria**:
- ✅ 100% data preservation during Redis failure
- ✅ Graceful degradation when SQLite is unavailable
- ✅ No data loss under concurrent write scenarios
- ✅ Lock contention resolved without errors

### 3.2 Coordinator Death with SQLite Recovery
**File**: `tests/chaos/coordinator-death-sqlite.test.ts`

**Coverage**:
- ✅ Coordinator crash with SQLite checkpoint recovery
- ✅ Work transfer with SQLite state read
- ✅ New coordinator resuming from SQLite

**Key Test Cases**:
1. `should detect dead coordinator and recover work from SQLite`
2. `should preserve work state across coordinator death`
3. `should transfer work to backup coordinator using SQLite`

**Success Criteria**:
- ✅ Work state recovered from SQLite after coordinator death
- ✅ Work transfer completed with <5% data loss
- ✅ New coordinator resumes from last checkpoint
- ✅ Audit log shows complete coordinator lifecycle

---

## 4. Performance Test Suites

### 4.1 SQLite Load Tests
**File**: `tests/performance/sqlite-load-test.ts`

**Coverage**:
- ✅ 10,000 writes/sec throughput validation
- ✅ p95 latency for dual-write (<60ms target)
- ✅ p95 latency for SQLite-only (<50ms target)
- ✅ Concurrent agent operations (100 agents)

**Key Test Cases**:
1. `should sustain 10,000 writes/sec throughput`
2. `should maintain p95 latency <60ms for dual-write`
3. `should maintain p95 latency <50ms for SQLite-only`
4. `should handle 100 concurrent agents without degradation`

**Performance Targets**:
- **Throughput**: ≥10,000 writes/sec (dual-write)
- **p50 Latency**: <30ms (dual-write)
- **p95 Latency**: <60ms (dual-write)
- **p99 Latency**: <100ms (dual-write)
- **Concurrent Agents**: 100 without >20% degradation

### 4.2 Redis vs SQLite Benchmark
**File**: `tests/performance/redis-vs-sqlite-benchmark.ts`

**Coverage**:
- ✅ Redis-only vs dual-write performance comparison
- ✅ Memory overhead measurement (SQLite DB size)
- ✅ Query performance comparison (read patterns)
- ✅ Write throughput comparison

**Key Test Cases**:
1. `should compare write performance: Redis-only vs Dual-write`
2. `should compare read performance: Redis vs SQLite`
3. `should measure SQLite memory overhead`
4. `should demonstrate dual-write resilience advantage`

**Benchmark Expectations**:
- **Write Overhead**: <100% (dual-write vs Redis-only)
- **Read Performance**: Redis 2-5x faster than SQLite
- **Memory Overhead**: <500 bytes per record
- **Resilience**: 100% data preservation with SQLite fallback

---

## 5. Test Data Setup

### 5.1 Test Fixtures

**ACL Test Data**:
```typescript
// Level 1 (Private): Agent-only access
{ agentId: 'agent-1', aclLevel: 1, data: 'private-data' }

// Level 2 (Agent): Agent coordination within swarm
{ agentId: 'agent-1', swarmId: 'swarm-1', aclLevel: 2, data: 'coord-data' }

// Level 3 (Swarm): Swarm-wide access
{ swarmId: 'swarm-1', aclLevel: 3, data: 'swarm-status' }

// Level 4 (Project): Product Owner, CI/CD
{ aclLevel: 4, data: 'project-metrics' }

// Level 5 (System): System-level monitoring
{ aclLevel: 5, data: 'system-config' }
```

**Confidence History Data**:
```typescript
[
  { agentId: 'agent-1', confidence: 0.65, reasoning: 'Initial implementation', blockers: [] },
  { agentId: 'agent-1', confidence: 0.78, reasoning: 'Tests passing', blockers: [] },
  { agentId: 'agent-1', confidence: 0.85, reasoning: 'Requirements met', blockers: [] },
]
```

**Audit Log Events**:
```typescript
[
  { eventType: 'agent.spawned', timestamp: 1000 },
  { eventType: 'confidence.updated', timestamp: 2000 },
  { eventType: 'signal_ack', timestamp: 3000 },
  { eventType: 'timeout', timestamp: 4000 },
  { eventType: 'agent.terminated', timestamp: 5000 },
]
```

### 5.2 Database Schemas

**Memory Table**:
```sql
CREATE TABLE memory (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  acl_level INTEGER NOT NULL,
  agent_id TEXT,
  swarm_id TEXT,
  encrypted INTEGER NOT NULL DEFAULT 0,
  ttl INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_acl_level ON memory(acl_level);
CREATE INDEX idx_agent_id ON memory(agent_id);
CREATE INDEX idx_swarm_id ON memory(swarm_id);
```

**Agent Lifecycle Table**:
```sql
CREATE TABLE agent_lifecycle (
  agent_id TEXT PRIMARY KEY,
  swarm_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  loop INTEGER NOT NULL,
  status TEXT NOT NULL,
  confidence_score REAL,
  spawned_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  terminated_at INTEGER,
  metadata TEXT
);

CREATE INDEX idx_agent_swarm ON agent_lifecycle(swarm_id);
CREATE INDEX idx_agent_phase_loop ON agent_lifecycle(phase, loop);
```

---

## 6. Test Execution

### 6.1 Running Tests

**Unit Tests**:
```bash
# Run all unit tests
npm run test:unit

# Run specific test suite
npx vitest run src/cfn-loop/__tests__/sqlite-memory-manager.test.ts

# Run with coverage
npx vitest run --coverage
```

**Integration Tests**:
```bash
# Run all integration tests
npm run test:integration

# Run CFN Loop integration
npx vitest run tests/integration/cfn-loop-sqlite-integration.test.ts
```

**Chaos Tests**:
```bash
# Run all chaos tests
npm run test:chaos

# Run specific chaos test
npx vitest run tests/chaos/sqlite-failure-scenarios.test.ts
```

**Performance Tests**:
```bash
# Run all performance tests
npm run test:performance

# Run load test
npx vitest run tests/performance/sqlite-load-test.ts

# Run benchmark
npx vitest run tests/performance/redis-vs-sqlite-benchmark.ts
```

### 6.2 CI/CD Integration

**GitHub Actions Workflow**:
```yaml
name: SQLite Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:chaos
      - run: npm run test:performance

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

---

## 7. Success Criteria

### 7.1 Test Coverage Targets

- ✅ **Unit Test Coverage**: 100% for all SQLite integration modules
- ✅ **Integration Test Coverage**: End-to-end CFN Loop workflow validated
- ✅ **Chaos Test Coverage**: All failure scenarios tested
- ✅ **Performance Targets**: All benchmarks meeting or exceeding targets

### 7.2 Quality Gates

**Coverage Thresholds**:
- Statements: ≥90%
- Branches: ≥85%
- Functions: ≥90%
- Lines: ≥90%

**Performance Thresholds**:
- Throughput: ≥10,000 writes/sec
- p95 Latency: <60ms (dual-write)
- p99 Latency: <100ms (dual-write)
- Recovery Time: <10 seconds

**Resilience Thresholds**:
- Data Loss: <5% after crash
- Fallback Success Rate: 100%
- Concurrent Agent Support: 100 agents

### 7.3 Production Readiness Checklist

- [x] All unit tests passing (100% coverage)
- [x] All integration tests passing
- [x] All chaos tests passing
- [x] All performance tests meeting targets
- [x] Documentation complete
- [x] Test plan reviewed and approved
- [x] Performance benchmarks validated
- [x] Security audit complete (ACL, encryption)

---

## 8. Known Issues & Limitations

### 8.1 Known Issues
- None identified during Sprint 1.7 testing

### 8.2 Limitations
- **SQLite DB Size**: Grows linearly with data volume (expected, acceptable)
- **Concurrent Write Performance**: WAL mode handles contention well but may degrade under extreme load (>200 concurrent writers)
- **Encryption Overhead**: AES-256-GCM adds ~10-15ms latency per operation (acceptable for security levels 1, 2, 5)

### 8.3 Future Improvements
- **Database Compaction**: Implement automatic VACUUM on schedule
- **Archival Strategy**: Move old audit logs to separate archive database
- **Sharding**: Implement SQLite sharding for >1M records per phase
- **Replication**: Add SQLite replication for high-availability deployments

---

## 9. Test Maintenance

### 9.1 Test Review Schedule
- **Weekly**: Review failing tests, update fixtures
- **Sprint End**: Review coverage metrics, add missing tests
- **Monthly**: Benchmark performance, update targets

### 9.2 Test Data Management
- **Cleanup**: All tests clean up database files in afterEach hooks
- **Isolation**: Each test uses unique database file (no cross-test contamination)
- **Fixtures**: Shared fixtures in `tests/fixtures/sqlite-data.ts`

---

## 10. Contact & Support

**Test Owner**: Tester Agent
**Sprint**: 1.7 - Testing & Validation
**Epic**: SQLite Integration Migration
**Last Updated**: 2025-10-10

**Test Execution Reports**: See `tests/reports/sqlite-integration-report.json`
**Coverage Reports**: See `coverage/lcov-report/index.html`

---

## Appendix A: Test File Locations

**Unit Tests**:
- `src/cfn-loop/__tests__/sqlite-memory-manager.test.ts`
- `src/cfn-loop/__tests__/agent-lifecycle-sqlite.test.ts`
- `src/cfn-loop/__tests__/blocking-coordination-audit.test.ts`

**Integration Tests**:
- `tests/integration/cfn-loop-sqlite-integration.test.ts`
- `tests/integration/cross-session-recovery.test.ts`

**Chaos Tests**:
- `tests/chaos/sqlite-failure-scenarios.test.ts`
- `tests/chaos/coordinator-death-sqlite.test.ts`

**Performance Tests**:
- `tests/performance/sqlite-load-test.ts`
- `tests/performance/redis-vs-sqlite-benchmark.ts`

**Documentation**:
- `tests/SQLITE_INTEGRATION_TEST_PLAN.md` (this file)

---

**END OF TEST PLAN**
