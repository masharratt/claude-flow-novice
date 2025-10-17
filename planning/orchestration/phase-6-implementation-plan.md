# Phase 6: Documentation & Testing - Implementation Plan

**Epic:** System-Wide Redis Agent Coordination
**Phase:** 6 of 7
**Status:** Ready to Start
**Estimated Duration:** 4-5 days
**Dependencies:** Phase 4, 4.5, 5 (all complete)

---

## Overview

Phase 6 consolidates the Redis coordination system with comprehensive documentation, runbooks, and automated testing. This creates the foundation for successful Phase 7 production rollout.

**Key Goal:** Make Redis coordination easy to adopt, debug, and maintain for all teams.

---

## Deliverables Breakdown

### 1. Redis Coordination Runbook (Priority: P0)
**File:** `docs/redis-coordination-runbook.md`
**Owner:** analyst + api-docs
**Duration:** 1 day

**Content:**
- **Quick Start Guide**
  - Prerequisites (Redis, Node.js, environment setup)
  - 5-minute "Hello World" with Redis coordination
  - Common CLI commands reference

- **Debugging & Troubleshooting**
  - Common errors and solutions
  - Redis connection issues
  - Agent coordination failures
  - Channel naming problems
  - BLPOP timeout handling

- **Coordination Patterns Reference**
  - Sequential (2-3 agents)
  - Mesh (4-7 agents)
  - Hierarchical (8+ agents)
  - When to use each pattern

- **Operations Guide**
  - Monitoring Redis channels
  - Viewing agent coordination in real-time
  - Dashboard usage (`npx claude-flow-novice dashboard`)
  - CLI monitoring (`./scripts/monitor-swarm-redis.sh`)

- **Best Practices**
  - Channel naming conventions
  - Avoiding coordination anti-patterns
  - Performance optimization tips
  - Memory management

---

### 2. Command Documentation Updates (Priority: P0)
**File:** `readme/additional-commands.md`
**Owner:** api-docs
**Duration:** 0.5 days

**Updates:**
- Add Redis examples to all coordination commands
- Update `/cfn-loop` examples with Redis patterns
- Update swarm commands with Redis coordination flags
- Add monitoring command examples
- Update troubleshooting section with Redis patterns

**Before/After Examples:**
```bash
# Before (old file-based)
npx claude-flow-novice swarm "Build API" --max-agents 3

# After (with Redis coordination)
npx claude-flow-novice swarm "Build API" --max-agents 3 --redis-coordination
# Redis channels auto-created: agent:coder-1:feedback, swarm:coordination
```

---

### 3. Integration Test Suite (Priority: P0)
**File:** `tests/integration/test-redis-coordination.js`
**Owner:** tester + tester
**Duration:** 2 days

**Test Coverage (Target: 95%+):**

#### A. Redis Connection Tests
- ✅ Connect to Redis successfully
- ✅ Handle Redis connection failures gracefully
- ✅ Retry logic with exponential backoff
- ✅ Connection pooling and reuse

#### B. Agent Coordination Tests
- ✅ Sequential coordination (2-3 agents)
- ✅ Mesh coordination (4-7 agents)
- ✅ Hierarchical coordination (8+ agents)
- ✅ Agent dependency resolution
- ✅ BLPOP blocking behavior
- ✅ Timeout handling

#### C. Channel Management Tests
- ✅ Agent feedback channel creation (`agent:{id}:feedback`)
- ✅ Coordinator channel creation (`coordinator:{id}:feedback`)
- ✅ Swarm coordination channel creation (`swarm:*`)
- ✅ Channel naming convention validation
- ✅ Channel cleanup after completion

#### D. Hook Integration Tests
- ✅ Post-edit hook publishes to Redis
- ✅ Feedback delivery to CLI agents (<100ms)
- ✅ Feedback delivery to Task agents (<5s via coordinator)
- ✅ All feedback types (ROOT_WARNING, LOW_COVERAGE, etc.)

#### E. Performance Tests
- ✅ BLPOP latency <10ms
- ✅ Message throughput >1000 msg/sec
- ✅ Memory usage <500MB under load
- ✅ CPU usage <30% under load

#### F. Error Handling Tests
- ✅ Redis timeout recovery
- ✅ Agent spawn failures
- ✅ Channel pattern violations
- ✅ Coordinator broadcast failures
- ✅ Graceful degradation

**Test Framework:** Vitest with Redis mock for unit tests, real Redis for integration tests

---

### 4. Manual CFN Loop Test Documentation (Priority: P1)
**File:** `tests/manual/test-cfn-loop-redis.md`
**Owner:** analyst
**Duration:** 0.5 days

**Content:**
- Step-by-step manual test procedure
- Expected Redis channels at each CFN Loop stage
- Validation checkpoints (Loop 0 → Loop 1 → Loop 2 → Loop 3 → Loop 4)
- Screenshots/examples of Redis monitoring during execution
- Troubleshooting common issues
- Success criteria checklist

**Test Scenarios:**
1. MVP Mode (sequential, 2 validators)
2. Standard Mode (mesh, 4 validators)
3. Enterprise Mode (hierarchical, 5 validators)

---

### 5. Migration Guide (Priority: P1)
**File:** `docs/redis-coordination-migration-guide.md`
**Owner:** analyst + api-docs
**Duration:** 1 day

**Content:**

#### Before & After Comparison
- File-based coordination (old way)
- Redis coordination (new way)
- Side-by-side code examples

#### Migration Steps
1. **Prerequisites Check**
   - Redis server installed and running
   - Node.js dependencies updated
   - Environment variables configured

2. **Update Agent Prompts**
   - Remove file-based coordination code
   - Add Redis LPUSH/BLPOP patterns
   - Update channel naming

3. **Update Coordinator Agents**
   - Replace polling with BLPOP
   - Add broadcast patterns for hierarchical
   - Update topology detection

4. **Test Migration**
   - Run integration tests
   - Validate Redis coordination
   - Compare performance (before/after)

5. **Rollback Plan**
   - How to revert to file-based coordination
   - Fallback detection logic
   - Emergency procedures

#### Common Migration Issues
- Redis connection failures → Solution
- Channel naming conflicts → Solution
- Performance degradation → Solution
- Agent coordination failures → Solution

#### Migration Checklist
```markdown
- [ ] Redis server running and accessible
- [ ] Dependencies updated (package.json)
- [ ] Agent prompts updated with Redis patterns
- [ ] Coordinator agents updated
- [ ] Integration tests passing
- [ ] Performance benchmarks meet targets
- [ ] Monitoring dashboard operational
- [ ] Rollback plan documented and tested
```

---

### 6. Performance Benchmarks (Priority: P1)
**File:** `docs/redis-coordination-performance-benchmarks.md`
**Owner:** coder + tester
**Duration:** 1 day

**Benchmarks to Document:**

#### A. BLPOP vs Polling Comparison
```
Scenario: 3 agents waiting for coordinator signal
- File-based polling: 500ms average, 10 operations
- Redis BLPOP: 5ms average, 1 operation
- **Improvement: 99% latency reduction, 90% operation reduction**
```

#### B. Coordinator Overhead
```
Scenario: Hierarchical coordinator broadcasting to 8 agents
- Direct coordination: 10ms total
- With coordinator broadcast: 15ms total
- **Overhead: 5ms (50% acceptable for reliability gain)**
```

#### C. Memory Usage
```
Scenario: 50 agents coordinating via Redis
- Redis memory usage: ~50MB
- Connection pool: ~10MB
- Total overhead: ~60MB
- **Acceptable for production**
```

#### D. Throughput
```
Scenario: High-volume message coordination
- Messages processed: 187,500 msg/sec (from Phase 5 load test)
- Target: 1,000 msg/sec
- **Result: 18,650% over target**
```

#### E. Scalability
```
Scenario: Agent count scaling
- 2-5 agents (mesh): <10ms coordination
- 6-10 agents (hierarchical): <20ms coordination
- 11-50 agents (hierarchical): <50ms coordination
- **Linear scalability maintained**
```

---

## Agent Assignment

### 5 Specialized Agents

1. **analyst** - Requirements analysis, migration guide, manual test documentation
2. **coder** - Integration test implementation, performance benchmarking code
3. **tester-1** - Integration test scenarios (A-C)
4. **tester-2** - Integration test scenarios (D-F)
5. **api-docs** - Runbook, command documentation updates

---

## Execution Strategy

### Day 1: Documentation Foundation
**Agents:** analyst, api-docs
**Deliverables:**
- Redis coordination runbook (Quick Start, Debugging)
- Command documentation updates (readme/additional-commands.md)
- Migration guide (initial draft)

### Day 2: Integration Testing (Part 1)
**Agents:** coder, tester-1, tester-2
**Deliverables:**
- Test suite framework (`tests/integration/test-redis-coordination.js`)
- Tests A-C complete (Redis connection, agent coordination, channel management)
- Initial test run (50%+ coverage)

### Day 3: Integration Testing (Part 2)
**Agents:** tester-1, tester-2, coder
**Deliverables:**
- Tests D-F complete (hook integration, performance, error handling)
- Full test suite passing (95%+ coverage)
- Test report and coverage analysis

### Day 4: Performance & Migration
**Agents:** coder, analyst, api-docs
**Deliverables:**
- Performance benchmarks documented
- Migration guide finalized
- Manual CFN Loop test documentation

### Day 5: Polish & Validation
**Agents:** analyst, api-docs, tester-1
**Deliverables:**
- Runbook finalized with troubleshooting section
- All documentation reviewed and updated
- Final validation test run
- Phase 6 completion report

---

## Acceptance Criteria

| Criterion | Target | Validation Method |
|-----------|--------|-------------------|
| Runbook complete | 100% | All sections written, reviewed |
| Command docs updated | 100% | All Redis examples added |
| Integration test coverage | ≥95% | Vitest coverage report |
| Integration tests passing | 100% | CI pipeline green |
| Manual test documented | 100% | Step-by-step guide complete |
| Migration guide complete | 100% | All sections written, checklist included |
| Performance benchmarks | 100% | All comparisons documented with data |

---

## Risk Mitigation

### Risk 1: Integration Tests Brittle
**Mitigation:** Use Redis mocks for unit tests, real Redis for integration tests, clear test isolation

### Risk 2: Documentation Outdated
**Mitigation:** Link documentation to code examples, validate examples with automated tests

### Risk 3: Performance Regression
**Mitigation:** Establish baseline benchmarks, automate performance testing in CI

### Risk 4: Migration Complexity
**Mitigation:** Provide detailed before/after examples, incremental migration steps, rollback plan

---

## Success Metrics

- **Documentation Quality:** 100% of troubleshooting scenarios covered
- **Test Coverage:** ≥95% code coverage for Redis coordination
- **Test Reliability:** 100% test pass rate across 10 runs
- **Performance:** All benchmarks show Redis coordination > file-based
- **Migration Readiness:** Teams can migrate in <1 day with guide

---

## Dependencies

### Prerequisites (All Complete ✅)
- Phase 4: CFN Loop Redis Integration
- Phase 4.5: Hook Feedback Integration
- Phase 5: Validation & Monitoring + Dashboard Integration

### External Dependencies
- Redis server (running and accessible)
- Vitest testing framework (installed)
- Node.js 18+ (available)

---

## Next Steps After Phase 6

Upon successful completion:
1. Update epic tracking to mark Phase 6 complete
2. Create Phase 6 completion report
3. Review readiness for Phase 7 (Production Rollout)
4. Prepare gradual rollout plan (Week 1: MVP mode)

---

## File Structure

```
docs/
├── redis-coordination-runbook.md (NEW)
├── redis-coordination-migration-guide.md (NEW)
└── redis-coordination-performance-benchmarks.md (NEW)

tests/
├── integration/
│   └── test-redis-coordination.js (NEW)
└── manual/
    └── test-cfn-loop-redis.md (NEW)

readme/
└── additional-commands.md (UPDATED)

planning/orchestration/
├── redis-coordination-epic.json (UPDATED - Phase 6 status)
└── phase-6-completion-report.md (NEW - Day 5)
```

---

## Ready to Execute

**Status:** ✅ All prerequisites met, ready to spawn agents

**Spawn Command:**
```bash
node src/cli/hybrid-routing/spawn-workers.js \
  "Phase 6: Create comprehensive Redis coordination documentation and integration tests" \
  --agents=analyst,coder,tester,tester,api-docs \
  --provider zai \
  --max-agents 5
```
