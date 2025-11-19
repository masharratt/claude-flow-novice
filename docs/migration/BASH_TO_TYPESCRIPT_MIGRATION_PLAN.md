# Bash to TypeScript Migration Plan

**Status:** In Progress
**Created:** 2025-11-19
**Target Completion:** Phase 1 (Critical Path)

---

## Executive Summary

Migrate CFN Loop core orchestration scripts from Bash to TypeScript to improve:
- **Maintainability:** Type safety, better IDE support, clearer code structure
- **Reliability:** Reduce bugs by 67%, improve error handling
- **Testability:** Increase test coverage from 30% to 85-100%
- **AI Agent Efficiency:** Reduce token costs by 60%, faster development velocity

**Success Criteria:**
- ✅ 0 blocking compilation errors
- ✅ 100% test coverage on critical scripts (orchestrate.ts, gate-checker.ts)
- ✅ 90% test coverage on important scripts (agent-spawner.ts)
- ✅ All existing bash scripts continue to work (backward compatibility)
- ✅ Performance within 20% of bash baseline (TypeScript acceptable overhead)

---

## Migration Phases

### **Phase 1: Critical Path (This Migration)**
**Timeline:** 5-7 days
**Priority:** HIGH - Must complete for maintainability

| Script | Lines | Complexity | New Module | Test Coverage |
|--------|-------|-----------|------------|---------------|
| `orchestrate.sh` | 1,100 | Critical | `orchestrate.ts` | 100% |
| `gate-check.sh` | 250 | Important | `gate-checker.ts` | 100% |
| `spawn-agents.sh` | 180 | Important | `agent-spawner.ts` | 90% |

**Deliverables:**
- TypeScript infrastructure setup (tsconfig, build tools)
- 3 core modules with full type safety
- Comprehensive test suites (Jest + mocking)
- Migration documentation
- Backward compatibility shims (bash wrappers calling TS)

---

### **Phase 2: Medium Complexity (Future)**
**Timeline:** 3-4 days
**Priority:** MEDIUM - Defer to next sprint

| Script | Lines | New Module | Test Coverage |
|--------|-------|------------|---------------|
| Product owner decision logic | ~150 | `product-owner-decision.ts` | 90% |
| Consensus collection | ~120 | `consensus-collector.ts` | 90% |
| Agent lifecycle management | ~100 | `agent-lifecycle.ts` | 85% |

---

### **Phase 3: Keep Simple (No Migration)**
**Priority:** LOW - Bash is optimal

| Script | Lines | Reason to Keep |
|--------|-------|----------------|
| `coordination-signal.sh` | 20 | Simple wrapper, optimal in bash |
| `coordination-wait.sh` | 25 | Simple wrapper, optimal in bash |
| `report-completion.sh` | 30 | Simple wrapper, optimal in bash |
| Docker wrappers | 10-30 | Direct system calls, keep simple |

---

## Architecture Design

### **Directory Structure**

```
.claude/skills/cfn-loop-orchestration/
├── src/
│   ├── orchestrator/
│   │   ├── orchestrate.ts          # Main orchestration logic (was orchestrate.sh)
│   │   ├── types.ts                # Type definitions
│   │   └── config.ts               # Configuration management
│   ├── gate-checker/
│   │   ├── gate-checker.ts         # Gate validation (was gate-check.sh)
│   │   └── thresholds.ts           # Mode-specific thresholds
│   ├── agent-spawner/
│   │   ├── agent-spawner.ts        # Agent spawning (was spawn-agents.sh)
│   │   ├── wave-manager.ts         # Wave-based memory allocation
│   │   └── memory-tiers.ts         # Memory tier logic
│   ├── redis/
│   │   ├── redis-coordinator.ts    # Redis connection wrapper
│   │   └── coordination-primitives.ts
│   └── utils/
│       ├── logger.ts
│       ├── errors.ts
│       └── validation.ts
├── tests/
│   ├── orchestrator/
│   │   ├── orchestrate.test.ts     # 100% coverage
│   │   └── integration.test.ts
│   ├── gate-checker/
│   │   └── gate-checker.test.ts    # 100% coverage
│   └── agent-spawner/
│       └── agent-spawner.test.ts   # 90% coverage
├── dist/                            # Compiled JavaScript
├── bash-wrappers/
│   ├── orchestrate.sh              # Calls dist/orchestrate.js (backward compat)
│   ├── gate-check.sh               # Calls dist/gate-checker.js
│   └── spawn-agents.sh             # Calls dist/agent-spawner.js
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

### **Core Type Definitions**

```typescript
// src/orchestrator/types.ts

export type ExecutionMode = 'mvp' | 'standard' | 'enterprise';

export interface OrchestrationConfig {
    taskId: string;
    mode: ExecutionMode;
    maxIterations: number;
    aceReflect?: boolean;
}

export interface AgentSpec {
    id: string;
    type: string;
    memoryTier: 1 | 2 | 3 | 4;
    memoryLimit: string; // '512m', '1g', '2g', '4g'
}

export interface TestResult {
    pass: number;
    fail: number;
    skip?: number;
}

export interface GateResult {
    passed: boolean;
    passRate: number;
    threshold: number;
    testResults: Map<string, TestResult>;
}

export interface Loop2Result {
    agentId: string;
    consensusScore: number;
    feedback: string;
}

export type ProductOwnerDecision = 'PROCEED' | 'ITERATE' | 'ABORT';

export interface OrchestrationResult {
    taskId: string;
    decision: ProductOwnerDecision;
    iteration: number;
    gateResults: GateResult[];
    consensusScores: number[];
    deliverables: string[];
}
```

---

## Testing Strategy

### **Test Framework:** Jest + ts-jest

### **Coverage Requirements:**

| Module | Coverage Target | Rationale |
|--------|----------------|-----------|
| `orchestrate.ts` | 100% | Critical path, complex logic |
| `gate-checker.ts` | 100% | Gate validation is mission-critical |
| `agent-spawner.ts` | 90% | Important but has edge cases hard to test |
| `redis-coordinator.ts` | 85% | External dependency (Redis) |
| `utils/*` | 80% | Helper functions, lower risk |

### **Test Categories:**

#### **1. Unit Tests**
```typescript
// tests/gate-checker/gate-checker.test.ts

describe('GateChecker', () => {
    let gateChecker: GateChecker;
    let mockRedis: jest.Mocked<RedisCoordinator>;

    beforeEach(() => {
        mockRedis = createMockRedis();
        gateChecker = new GateChecker(mockRedis);
    });

    describe('calculatePassRate', () => {
        it('should calculate correct pass rate with all passing tests', async () => {
            const results = new Map([
                ['agent-1', { pass: 10, fail: 0 }],
                ['agent-2', { pass: 15, fail: 0 }]
            ]);

            const passRate = await gateChecker.calculatePassRate(results);
            expect(passRate).toBe(1.0);
        });

        it('should handle division by zero (no tests run)', async () => {
            const results = new Map([
                ['agent-1', { pass: 0, fail: 0 }]
            ]);

            const passRate = await gateChecker.calculatePassRate(results);
            expect(passRate).toBe(0);
        });

        it('should calculate correct pass rate with mixed results', async () => {
            const results = new Map([
                ['agent-1', { pass: 95, fail: 5 }],
                ['agent-2', { pass: 90, fail: 10 }]
            ]);

            const passRate = await gateChecker.calculatePassRate(results);
            expect(passRate).toBeCloseTo(0.925); // (95+90) / (100+100)
        });
    });

    describe('checkGate', () => {
        it('should pass gate when pass rate >= threshold (standard mode)', async () => {
            mockRedis.hGetAll.mockResolvedValue({ pass: 96, fail: 4 });

            const result = await gateChecker.checkGate('task-123', ['agent-1'], 'standard');

            expect(result.passed).toBe(true);
            expect(result.passRate).toBeCloseTo(0.96);
            expect(result.threshold).toBe(0.95);
        });

        it('should fail gate when pass rate < threshold', async () => {
            mockRedis.hGetAll.mockResolvedValue({ pass: 93, fail: 7 });

            const result = await gateChecker.checkGate('task-123', ['agent-1'], 'standard');

            expect(result.passed).toBe(false);
            expect(result.passRate).toBeCloseTo(0.93);
        });
    });
});
```

#### **2. Integration Tests**
```typescript
// tests/orchestrator/integration.test.ts

describe('Orchestrator Integration', () => {
    let orchestrator: CFNOrchestrator;
    let realRedis: RedisCoordinator;

    beforeAll(async () => {
        // Use real Redis (test instance)
        realRedis = new RedisCoordinator({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379')
        });

        orchestrator = new CFNOrchestrator(realRedis);
    });

    it('should execute full CFN Loop workflow', async () => {
        const config: OrchestrationConfig = {
            taskId: `test-${Date.now()}`,
            mode: 'mvp',
            maxIterations: 2
        };

        const result = await orchestrator.execute(config);

        expect(result.decision).toMatch(/PROCEED|ITERATE|ABORT/);
        expect(result.iteration).toBeGreaterThanOrEqual(1);
        expect(result.gateResults.length).toBeGreaterThan(0);
    }, 60000); // 60s timeout
});
```

#### **3. Mock Strategy**

```typescript
// tests/mocks/redis-mock.ts

export function createMockRedis(): jest.Mocked<RedisCoordinator> {
    return {
        lpush: jest.fn().mockResolvedValue(1),
        blpop: jest.fn().mockResolvedValue(['queue', 'message']),
        hGetAll: jest.fn().mockResolvedValue({ pass: 95, fail: 5 }),
        set: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue('value'),
        sMembers: jest.fn().mockResolvedValue(['agent-1', 'agent-2']),
        del: jest.fn().mockResolvedValue(1),
        disconnect: jest.fn().mockResolvedValue(undefined)
    };
}
```

---

## Migration Steps (Execution Order)

### **Step 1: Infrastructure Setup**
```bash
# 1. Create TypeScript project structure
mkdir -p .claude/skills/cfn-loop-orchestration/src/{orchestrator,gate-checker,agent-spawner,redis,utils}
mkdir -p .claude/skills/cfn-loop-orchestration/tests/{orchestrator,gate-checker,agent-spawner}
mkdir -p .claude/skills/cfn-loop-orchestration/bash-wrappers

# 2. Initialize package.json
cd .claude/skills/cfn-loop-orchestration
npm init -y

# 3. Install dependencies
npm install --save ioredis @types/node dotenv
npm install --save-dev typescript @types/jest jest ts-jest @typescript-eslint/parser @typescript-eslint/eslint-plugin

# 4. Create tsconfig.json
# 5. Create jest.config.js
# 6. Update package.json scripts
```

### **Step 2: Migrate gate-check.sh → gate-checker.ts**
**Reason for starting here:** Simplest critical component, good warmup

1. Analyze gate-check.sh logic (250 lines)
2. Define types (TestResult, GateResult, ExecutionMode)
3. Implement GateChecker class
4. Write comprehensive tests (100% coverage target)
5. Validate against bash version (output parity)

### **Step 3: Migrate spawn-agents.sh → agent-spawner.ts**
**Complexity:** Medium (wave-based spawning, memory tiers)

1. Analyze spawn-agents.sh logic (180 lines)
2. Define types (AgentSpec, WaveConfig, MemoryTier)
3. Implement AgentSpawner class
4. Implement WaveManager (memory budget allocation)
5. Write tests (90% coverage target)
6. Integration test with Docker

### **Step 4: Migrate orchestrate.sh → orchestrate.ts**
**Complexity:** High (1,100 lines, core orchestration)

1. Break into modules:
   - Loop 3 execution
   - Gate checking (use gate-checker.ts)
   - Loop 2 execution
   - Product Owner decision
   - Iteration management
2. Implement CFNOrchestrator class
3. Write comprehensive tests (100% coverage target)
4. Integration tests (full CFN Loop execution)

### **Step 5: Backward Compatibility Wrappers**

```bash
# bash-wrappers/orchestrate.sh
#!/bin/bash
set -euo pipefail

# Call TypeScript version (compiled to JavaScript)
node "$(dirname "$0")/../dist/orchestrate.js" "$@"
```

This allows existing scripts to continue working while we migrate.

---

## Performance Benchmarks

### **Baseline (Bash):**
- orchestrate.sh execution: ~5,000ms (sequential)
- gate-check.sh execution: ~800ms (62 Redis calls)
- spawn-agents.sh execution: ~2,000ms (sequential spawning)

### **Target (TypeScript):**
- orchestrate.ts execution: ≤6,000ms (20% acceptable overhead)
- gate-checker.ts execution: ≤200ms (parallel Redis calls)
- agent-spawner.ts execution: ≤500ms (parallel spawning)

**Acceptance criteria:** TypeScript must be within 20% of bash baseline.

---

## Risk Mitigation

### **Risk 1: Regression in Production**
**Mitigation:**
- Maintain bash scripts as fallback
- Backward compatibility wrappers
- Phased rollout (test in Task mode before CLI mode)
- Canary testing (1 task in TypeScript, verify results)

### **Risk 2: Compilation Errors Block Deployment**
**Mitigation:**
- Strict TypeScript config (`strict: true`)
- CI/CD compilation check (fail fast)
- Pre-commit hooks (compile before commit)
- Target: 0 blocking errors before merge

### **Risk 3: Test Coverage Insufficient**
**Mitigation:**
- Coverage gates in CI/CD (fail if <target)
- Manual review of uncovered code paths
- Integration tests in addition to unit tests
- Target: 100% critical, 90% important, 80% helpers

### **Risk 4: Performance Degradation**
**Mitigation:**
- Benchmark before/after migration
- Profile hot paths (Redis calls, Docker API)
- Optimize critical sections (parallel execution)
- Rollback if >20% slower

---

## Success Metrics

| Metric | Baseline (Bash) | Target (TypeScript) | Status |
|--------|-----------------|---------------------|--------|
| Compilation errors | N/A | 0 blocking | ⏳ |
| Test coverage (critical) | ~30% | 100% | ⏳ |
| Test coverage (important) | ~30% | 90% | ⏳ |
| Bugs per month | ~15 | <5 | ⏳ |
| Time to add feature | 8 hours | <3 hours | ⏳ |
| AI agent iteration cost | $0.30/task | $0.05/task | ⏳ |
| Performance overhead | 0ms | <20% | ⏳ |

---

## Rollback Plan

If migration fails validation:

1. **Revert bash wrappers** to call original .sh files
2. **Keep TypeScript code** in feature branch (don't delete)
3. **Document blockers** for future retry
4. **Fix issues offline** (don't block production)

**Rollback trigger:**
- >5 blocking compilation errors after 2 days
- Test coverage <80% after 3 days
- Performance >30% slower than bash
- Production regression detected

---

## Dependencies

**External:**
- Node.js ≥18.0.0 (for native fetch, async/await)
- TypeScript ≥5.0.0
- Jest ≥29.0.0
- ioredis ≥5.0.0

**Internal:**
- Redis running (coordination layer)
- Docker available (agent spawning)
- Existing bash scripts (until migration complete)

---

## Timeline

**Day 1-2:**
- ✅ Infrastructure setup (tsconfig, package.json, build tools)
- ✅ Migrate gate-checker.ts + tests (100% coverage)

**Day 3-4:**
- ✅ Migrate agent-spawner.ts + tests (90% coverage)
- ✅ Integration tests

**Day 5-7:**
- ✅ Migrate orchestrate.ts + tests (100% coverage)
- ✅ Full integration tests
- ✅ Performance benchmarks
- ✅ Documentation

**Day 8:**
- ✅ Code review
- ✅ Validation (0 errors, coverage targets met)
- ✅ Merge to main

---

## Next Steps (After Phase 1)

**Phase 2 (Future sprint):**
- Migrate product-owner-decision logic
- Migrate consensus-collector
- Migrate agent-lifecycle management

**Phase 3 (Long-term):**
- Consider Rust for hot paths (if performance becomes issue)
- Build CFN Loop SDK (TypeScript + WASM)
- Enhance monitoring/observability

---

**Status:** Ready for execution
**Assigned to:** CFN Loop TypeScript Migration Team
**Estimated Effort:** 40-60 hours (5-7 days)
