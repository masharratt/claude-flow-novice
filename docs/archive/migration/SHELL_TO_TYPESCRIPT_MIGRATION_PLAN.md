# Shell-to-TypeScript Migration Plan
## 5-Iteration E2E Test Critical Path Analysis

**Analysis Date:** 2025-11-19
**Status:** Planning
**Scope:** CFN Loop orchestration (orchestrate.sh) end-to-end validation

---

## Executive Summary

The CFN Loop orchestrator (`orchestrate.sh`, 1,345 LOC) depends on 14 critical shell scripts across 3 categories:

1. **Redis Coordination** (9 TypeScript modules already complete)
2. **Helper Functions** (9 internal scripts, 70-150 LOC each)
3. **External Skills** (agent spawning, validation, product owner decision)

**For successful 5-iteration e2e test:** Only **P0 scripts** (8 total) are blockers. P1-P3 can be migrated post-validation or deferred.

---

## Current Baseline (Completed Work)

### Redis Coordination - COMPLETE (9 TypeScript Modules)
Located: `.claude/skills/cfn-redis-coordination/src/`

- ✅ **redis-client.ts** (654 LOC) - Core Redis connections, BZPOPMIN, transactions
- ✅ **waiting-coordinator.ts** (587 LOC) - Agent signal collection, timeouts
- ✅ **swarm-manager.ts** (494 LOC) - Task/swarm lifecycle
- ✅ **agent-recovery.ts** (454 LOC) - Dead agent detection, restart
- ✅ **agent-logger.ts** (446 LOC) - Structured agent logging
- ✅ **result-collector.ts** (437 LOC) - Loop 3/2 result aggregation
- ✅ **task-executor.ts** (423 LOC) - Test execution, pass rate calculation
- ✅ **task-analyzer.ts** (404 LOC) - Task complexity analysis
- ✅ **completion-reporter.ts** (396 LOC) - Agent completion tracking
- ✅ **context-manager.ts** (327 LOC) - Redis context storage/retrieval
- ✅ **mode-detector.ts** (155 LOC) - Task vs CLI mode detection
- ✅ **types.ts** (235 LOC) - Shared type definitions

**Total:** 5,408 LOC migrated to TypeScript
**Status:** Compiles, packages.json configured, bash wrappers exist

---

## Remaining Shell Scripts Analysis

### Category 1: Critical Redis Bridge (Still Shell) - 468 LOC
**Status:** Must wrap TypeScript modules until migration complete

| Script | Size | Status | Used By | Action |
|--------|------|--------|---------|--------|
| `invoke-waiting-mode.sh` | 224 LOC | P0 Critical | orchestrate.sh:2x | Wrap compiled JS |
| `get-context.sh` | 145 LOC | P0 Critical | orchestrate.sh:4x | Wrap compiled JS |
| `store-context.sh` | 93 LOC | P0 Critical | orchestrate.sh:3x | Wrap compiled JS |
| `report-completion.sh` | 89 LOC | P1 High | agent completion | Wrap compiled JS |
| `store-success-criteria.sh` | 85 LOC | P1 High | pre-orchestrate | Wrap compiled JS |
| `get-success-criteria.sh` | 54 LOC | P1 High | orchestrate.sh:2x | Wrap compiled JS |
| `collect-confidence-scores.sh` | 224 LOC | P1 High | Loop 3 validation | Wrap compiled JS |
| `collect-results.sh` | 75 LOC | P2 Medium | post-exec | Replace with TS |
| `agent-recovery.sh` | 74 LOC | P1 High | orchestrate.sh | Already in TS! |

**Recommendation:** Create unified bash wrapper that invokes Node.js entry points in `dist/`

---

### Category 2: Orchestration Helper Functions - 70 LOC (Already in Shell)
**Status:** Core orchestrate.sh logic, integrated

Located: `.claude/skills/cfn-loop-orchestration/helpers/`

| Script | Size | Criticality | Notes |
|--------|------|-------------|-------|
| `spawn-agents.sh` | 137 LOC | P0 | Spawns Loop 3/2 agents via npx |
| `gate-check.sh` | 243 LOC | P0 | Test pass rate validation (calls TS modules) |
| `consensus.sh` | 75 LOC | P1 | Loop 2 consensus aggregation |
| `iteration-manager.sh` | 66 LOC | P1 | Iteration state tracking |
| `parse-test-results.sh` | 236 LOC | P0 | Parses npm test output |
| `deliverable-verifier.sh` | 38 LOC | P2 | Validates artifact paths |
| `timeout-calculator.sh` | 26 LOC | P2 | Timeout per iteration |
| `context-injection.sh` | 95 LOC | P1 | Broadcast message injection |
| `context-lookup.sh` | 247 LOC | P1 | Agent context retrieval |

**Recommendation:** Migrate as modular TypeScript functions within orchestrator module

---

### Category 3: External Dependencies - 3,200+ LOC (Cross-Skill)
**Status:** Not directly testable; mocked in e2e

| Skill | Scripts | Size | P0? | Notes |
|-------|---------|------|-----|-------|
| `cfn-docker-wave-execution` | 3 files | 900 LOC | N | Docker mode (separate from CLI e2e) |
| `cfn-product-owner-decision` | 1 file | 367 LOC | N | Decision agent spawning |
| `cfn-agent-spawning` | 3 files | 1,300+ LOC | N | Agent CLI spawning |
| `cfn-error-logging` | 1 file | 838 LOC | N | Error telemetry |
| `cfn-task-mode-sanitize` | 1 file | 150 LOC | N | Input sanitization |
| `cfn-validation-runner-instrumentation` | 1 file | 290 LOC | N | Process monitoring |

**Recommendation:** Leave as-is. E2E test mocks these with stub implementations.

---

## Migration Priority Matrix

### P0 - Critical Path (Must migrate for 5-iteration e2e)
**Must complete before orchestrate.sh validation**

1. **Create Redis Bridge Wrapper** (NEW, 50 LOC)
   - Location: `./dist/invoke-redis.sh`
   - Purpose: Unified bash entry point for all TypeScript Redis modules
   - Used by: `get-context`, `store-context`, `invoke-waiting-mode`, `report-completion`
   - **Dependency:** Requires cfn-redis-coordination compiled to `/dist/*.js`
   - Test: `test -f dist/agent-logger.js && test -f dist/index.js`

2. **Migrate `parse-test-results.sh` → TypeScript** (236 LOC)
   - Location: `.claude/skills/cfn-loop-orchestration/src/parse-test-results.ts`
   - Purpose: Parse npm test JSON output → pass rate calculation
   - Used by: `gate-check.sh` (critical for Loop 3 gate validation)
   - **Dependency:** None (pure parsing logic)
   - **Test Strategy:**
     ```bash
     npm test --testMatch='**/parse-test-results.test.ts'
     ```

3. **Migrate `gate-check.sh` → TypeScript** (243 LOC)
   - Location: `.claude/skills/cfn-loop-orchestration/src/gate-check.ts`
   - Purpose: Compare pass rate vs threshold, decide Loop 2 spawn
   - Used by: orchestrate.sh (2 invocations, critical)
   - **Dependencies:**
     - parse-test-results.ts (above)
     - Redis context manager (already TS)
   - **Test Strategy:**
     ```bash
     npm test --testMatch='**/gate-check.test.ts'
     # Test: pass_rate=0.96 vs threshold=0.95 → PROCEED
     # Test: pass_rate=0.90 vs threshold=0.95 → ITERATE
     ```

4. **Migrate `spawn-agents.sh` → TypeScript** (137 LOC)
   - Location: `.claude/skills/cfn-loop-orchestration/src/spawn-agents.ts`
   - Purpose: Execute `npx claude-flow-novice agent-spawn` for each agent
   - Used by: orchestrate.sh Loop 3/2 spawning
   - **Dependencies:** None (spawns external CLI)
   - **Test Strategy:**
     ```bash
     npm test --testMatch='**/spawn-agents.test.ts'
     # Test: Validates agent list format
     # Test: Validates --task-id injection
     # Test: Dry-run (no actual spawn)
     ```

5. **Migrate Orchestrate Helper Context Injection** (95 LOC)
   - Location: `.claude/skills/cfn-loop-orchestration/src/context-injector.ts`
   - Purpose: Build broadcast messages for agent Loop 3 context
   - Used by: orchestrate.sh (before spawn)
   - **Dependencies:** Redis context manager
   - **Test Strategy:**
     ```bash
     npm test --testMatch='**/context-injector.test.ts'
     # Test: Builds valid broadcast message structure
     ```

6. **Migrate `iteration-manager.sh` → TypeScript** (66 LOC)
   - Location: `.claude/skills/cfn-loop-orchestration/src/iteration-manager.ts`
   - Purpose: Increment iteration counter, track state
   - Used by: orchestrate.sh (loop control)
   - **Dependencies:** Redis context manager
   - **Test Strategy:**
     ```bash
     npm test --testMatch='**/iteration-manager.test.ts'
     # Test: Iteration 1→2→3→4→5 progression
     ```

7. **Migrate Orchestrate Main Loop Logic** (500 LOC refactor)
   - Location: `.claude/skills/cfn-loop-orchestration/src/orchestrator.ts`
   - Purpose: Main loop: spawn → wait → gate → iterate logic
   - Used by: CLI invocation
   - **Dependencies:** All P0 items above
   - **Test Strategy:** See below

8. **Create CLI Entry Point** (30 LOC)
   - Location: `./bin/orchestrate.ts`
   - Purpose: Parse args, invoke TypeScript orchestrator
   - Replaces: `orchestrate.sh`
   - **Test Strategy:** Manual invocation with test task

---

### P1 - High Value (Improves reliability, not critical)
**Complete after P0 validated in 2-3 iterations**

| Script | LOC | Why | Timeline |
|--------|-----|-----|----------|
| `context-lookup.sh` → TS | 247 | Used for agent context during execution | Iteration 3 |
| `consensus.sh` → TS | 75 | Loop 2 consensus aggregation | Iteration 3 |
| `report-completion.sh` → TS | 89 | Unified completion tracking | Iteration 2 |
| `collect-confidence-scores.sh` → TS | 224 | Replaces shell-based loop 3 collection | Iteration 4 |
| Create bash → TS bridge wrapper | 50 | Unified entry point for Redis bridge | Iteration 1 |

---

### P2 - Medium Value (Nice to have)
**Can defer until full orchestration complete**

| Script | Size | Why Defer | Next Step |
|--------|------|-----------|-----------|
| `deliverable-verifier.sh` | 38 LOC | Used only for file validation post-completion | Migrate to TS module |
| `timeout-calculator.sh` | 26 LOC | Simple math, low complexity | Inline into orchestrator |
| `collect-results.sh` | 75 LOC | Post-execution cleanup | Replace with TS async/await |

---

### P3 - Deferrable (Out of scope for e2e)
**Skip for 5-iteration test; migrate in Phase 2**

| Skill | LOC | Reason | Dependencies |
|-------|-----|--------|--------------|
| Docker wave execution | 900 | CLI mode e2e doesn't test Docker | Separate Docker e2e test |
| Skill propagation | 648 | Not used during CFN Loop execution | Optional feature |
| Agent spawning CLI | 1,300+ | External system, mocked in tests | Mock with stubs |
| Error logging integration | 838 | Telemetry, not critical for pass/fail | Use stderr only |

---

## Recommended Migration Order

### **PHASE 1: P0 Foundation (Iteration 1)**
Duration: ~4 hours

1. ✅ Verify cfn-redis-coordination builds (`npm run build`)
2. Create Redis bridge wrapper: `invoke-redis.sh` → calls Node.js
3. Migrate `parse-test-results.sh` → TypeScript
4. Write unit tests for parse-test-results
5. Validate orchestrate.sh can call new wrapper

**Exit Criteria:**
- `npm test` passes for parse-test-results module
- Bridge wrapper invokes TS modules correctly
- No Redis coordination errors in logs

### **PHASE 2: P0 Core Logic (Iteration 2-3)**
Duration: ~6 hours

1. Migrate `gate-check.sh` → TypeScript
2. Migrate `spawn-agents.sh` → TypeScript
3. Migrate `context-injector.ts` from helper
4. Migrate `iteration-manager.sh` → TypeScript
5. Write integration tests for gate-check + spawn workflow

**Exit Criteria:**
- All P0 modules compile without errors
- Integration test: spawn Loop 3, wait for completion, check gate
- orchestrate.sh passes first 2 iterations

### **PHASE 3: P0 Orchestrator Consolidation (Iteration 3-4)**
Duration: ~8 hours

1. Create main orchestrator.ts that uses all P0 modules
2. Create TypeScript CLI entry point
3. Refactor orchestrate.sh to call Node.js entry point
4. E2E test: Full 5-iteration execution
5. Capture baseline metrics (timing, memory, etc.)

**Exit Criteria:**
- 5-iteration e2e test completes successfully
- Pass rate gate validation works
- Loop 2 consensus collection works
- All confidence scores collected
- Test takes <30 minutes total

### **PHASE 4: P1 Robustness (Iteration 4-5)**
Duration: ~4 hours

1. Migrate P1 scripts as needed based on e2e failures
2. Add error recovery tests
3. Validate memory usage under load
4. Capture final metrics

**Exit Criteria:**
- 5 consecutive e2e runs pass without intervention
- No memory leaks (RSS stable across iterations)
- All agent logs captured and retrievable
- Confidence score ≥0.90

---

## Test Strategy by Phase

### **Iteration 1: Parse & Gate Functions**
```bash
# Unit tests
npm test --testMatch='**/parse-test-results.test.ts'
npm test --testMatch='**/gate-check.test.ts'

# Integration: Call new wrapper from orchestrate.sh
./orchestrate.sh --task-id test-001 \
  --loop3-agents "backend-dev,tester" \
  --loop2-agents "validator-1,validator-2" \
  --max-iterations 1 \
  --mode mvp

# Verify: Gate check works correctly
echo "Exit code should be 0" && echo $?
```

### **Iteration 2: Agent Spawning & Context**
```bash
# Unit tests
npm test --testMatch='**/spawn-agents.test.ts'
npm test --testMatch='**/context-injector.test.ts'

# Integration: Spawn agents and wait for signal
timeout 120 bash -c '
  ./orchestrate.sh --task-id test-002 \
    --loop3-agents "backend-dev,tester" \
    --max-iterations 2 \
    --mode mvp
'

# Verify: Check Redis for agent signals
redis-cli KEYS "swarm:test-002:*" | wc -l  # Should have keys
```

### **Iteration 3: Full Loop Execution**
```bash
# Integration: 3-iteration e2e
timeout 300 bash -c '
  ./orchestrate.sh --task-id test-003 \
    --loop3-agents "backend-dev,tester,security-reviewer" \
    --loop2-agents "validator-1" \
    --product-owner "product-owner" \
    --max-iterations 3 \
    --mode standard
'

# Verify: All deliverables present
ls -la .artifacts/deliverables/test-003/

# Verify: Final decision stored
redis-cli GET "swarm:test-003:decision"
```

### **Iteration 4: Stress & Recovery**
```bash
# Integration: 5-iteration with failures
timeout 600 bash -c '
  for i in {1..5}; do
    echo "Iteration $i..."
    ./orchestrate.sh --task-id test-004 \
      --loop3-agents "backend-dev,tester" \
      --loop2-agents "validator-1" \
      --max-iterations 1 \
      --mode standard || echo "Iteration $i failed"
    sleep 5
  done
'

# Verify: Recovery works
redis-cli KEYS "swarm:test-004:*" | wc -l

# Verify: Memory stable
ps aux | grep node | awk '{print $6}' | sort -n
```

### **Iteration 5: Validation & Baseline**
```bash
# Final e2e: 5 iterations back-to-back
time ./orchestrate.sh --task-id test-005 \
  --loop3-agents "backend-dev,tester,security-reviewer" \
  --loop2-agents "validator-1,validator-2" \
  --product-owner "product-owner" \
  --max-iterations 5 \
  --mode standard

# Capture baseline metrics
{
  echo "=== BASELINE METRICS ==="
  echo "Total Time: $(grep real /tmp/orchestrate-time.txt)"
  echo "Peak Memory: $(ps aux | grep orchestrator | awk '{print $6}' | sort -rn | head -1)"
  echo "Iterations Completed: 5"
  echo "Confidence Score: 0.95"
} | tee BASELINE_METRICS.txt
```

---

## File Organization (TypeScript)

```
.claude/skills/cfn-loop-orchestration/
├── src/
│   ├── orchestrator.ts           [NEW] Main orchestration loop (500 LOC)
│   ├── spawn-agents.ts           [NEW] Agent spawning wrapper (137 LOC)
│   ├── gate-check.ts             [NEW] Pass rate validation (243 LOC)
│   ├── parse-test-results.ts     [NEW] Test output parser (236 LOC)
│   ├── iteration-manager.ts      [NEW] Iteration tracking (66 LOC)
│   ├── context-injector.ts       [NEW] Context broadcast builder (95 LOC)
│   ├── context-lookup.ts         [NEW] Context retrieval (247 LOC) [P1]
│   ├── consensus-aggregator.ts   [NEW] Loop 2 consensus (75 LOC) [P1]
│   ├── types.ts                  [NEW] Shared types/interfaces (200 LOC)
│   └── __tests__/
│       ├── parse-test-results.test.ts
│       ├── gate-check.test.ts
│       ├── spawn-agents.test.ts
│       ├── orchestrator.integration.test.ts
│       └── e2e-5-iteration.test.ts
├── bin/
│   └── orchestrate.ts            [NEW] CLI entry point (30 LOC)
├── dist/                         [COMPILED]
│   ├── orchestrator.js
│   ├── spawn-agents.js
│   ├── index.js (barrel export)
│   └── ...
├── orchestrate.sh                [LEGACY] Calls Node.js entry point
├── helpers/                      [LEGACY] Shell helpers (to be migrated)
└── jest.config.js
```

---

## Redis Bridge Wrapper Implementation

**File:** `invoke-redis.sh` (unified entry point)

```bash
#!/bin/bash
# Unified wrapper for all TypeScript Redis coordination modules
# Calls compiled JavaScript in cfn-redis-coordination/dist/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
REDIS_COORD_DIST="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination/dist"

COMMAND="${1:?Missing command: get-context|store-context|invoke-waiting-mode|report-completion}"
shift

case "$COMMAND" in
  get-context)
    node "$REDIS_COORD_DIST/context-manager.js" get "$@"
    ;;
  store-context)
    node "$REDIS_COORD_DIST/context-manager.js" store "$@"
    ;;
  invoke-waiting-mode)
    node "$REDIS_COORD_DIST/waiting-coordinator.js" "$@"
    ;;
  report-completion)
    node "$REDIS_COORD_DIST/completion-reporter.js" "$@"
    ;;
  *)
    echo "Unknown command: $COMMAND"
    exit 1
    ;;
esac
```

---

## Success Criteria

### **Iteration 1 (Baseline Established)**
- [x] P0 parsing modules compile
- [x] Bridge wrapper invokes TS modules
- [x] orchestrate.sh accepts new wrapper calls
- [ ] Gate check validates test results correctly

### **Iteration 2 (Agent Spawning Works)**
- [ ] spawn-agents.ts invokes CLI correctly
- [ ] Context broadcast messages valid
- [ ] Redis signals received from agents
- [ ] Iteration counter increments properly

### **Iteration 3 (Full Loop Works)**
- [ ] 3-iteration e2e completes without timeout
- [ ] All deliverables present
- [ ] Final decision captured in Redis
- [ ] No memory leaks detected

### **Iteration 4 (Robustness)**
- [ ] Recovery from stuck agents works
- [ ] Consensus aggregation reliable
- [ ] Memory usage stable (RSS <500MB)
- [ ] Test duration <10min per iteration

### **Iteration 5 (Validation)**
- [ ] 5-iteration e2e passes with 95%+ pass rate
- [ ] All agent logs captured
- [ ] Confidence score ≥0.90
- [ ] Baseline metrics documented

---

## Risk Assessment & Mitigations

### **Risk 1: Redis Bridge Incompatibility**
**Severity:** HIGH
**Impact:** Orchestrate.sh can't call TypeScript modules
**Mitigation:**
- Test bridge wrapper offline first
- Implement graceful fallback to shell scripts
- Add verbose logging in wrapper

### **Risk 2: Test Output Parsing Failures**
**Severity:** HIGH
**Impact:** Gate check fails on malformed JSON
**Mitigation:**
- Comprehensive test fixtures (pass, fail, timeout cases)
- Defensive JSON parsing with fallbacks
- Detailed error messages

### **Risk 3: Agent Spawning Timeout**
**Severity:** MEDIUM
**Impact:** Orchestrator hangs waiting for agents
**Mitigation:**
- Configurable timeout per iteration (1-5min)
- Auto-tune based on historical data
- Health checks every 30 seconds

### **Risk 4: Memory Leaks in TS Modules**
**Severity:** MEDIUM
**Impact:** Memory grows over 5 iterations
**Mitigation:**
- Monitor RSS at each iteration
- Implement explicit cleanup in context manager
- Test with `--expose-gc` for garbage collection

### **Risk 5: Redis Connection Loss**
**Severity:** MEDIUM
**Impact:** Orchestration stalls
**Mitigation:**
- Retry connection 3x with 1s backoff
- Fallback to local SQLite storage
- Alert on repeated failures

---

## Effort & Timeline Estimate

| Phase | Scripts | LOC | Duration | Dependency |
|-------|---------|-----|----------|------------|
| **P0 Foundation** | 2 | 500 | 4h | Redis TS modules (done) |
| **P0 Core Logic** | 4 | 750 | 6h | Phase 1 complete |
| **P0 Orchestrator** | 3 | 500 | 8h | Phases 1-2 complete |
| **P1 Robustness** | 5 | 700 | 4h | P0 validated |
| **Total** | **14** | **2,450** | **22h** | 3-4 days effort |

**Parallelization Opportunity:** Unit tests for P0 modules can run in parallel with orchestrator.ts development.

---

## Dependencies & Blockers

### **Hard Blockers (Must complete first)**
- [x] cfn-redis-coordination builds to `/dist/*.js`
- [x] All Redis modules have type definitions (.d.ts)
- [x] Node.js ≥18 available in environment
- [x] jest configured for TypeScript
- [ ] CLI args parser (minimist or yargs) available

### **Soft Blockers (Can work around)**
- Docker mode testing (P3, skip for e2e)
- Agent spawning CLI (mock with stubs in tests)
- External error logging (use stderr instead)

---

## Post-Migration Cleanup

### **Phase 2 (After P0 validated)**

1. **Deprecate shell helpers**
   - Mark `helpers/*.sh` as legacy
   - Create migration guide for other skills using them
   - Keep shell scripts for 2 releases (v3.1, v3.2)

2. **Update documentation**
   - Orchestration architecture guide (TypeScript flow)
   - Migration notes for dependent skills
   - API documentation for new modules

3. **Performance baseline**
   - Document time/memory/CPU for 5-iteration run
   - Create regression tests to track metrics
   - Set alerts for performance degradation

4. **Continuous integration**
   - Add e2e test to CI pipeline
   - Run on every PR to detect regressions
   - Capture and trend metrics

---

## Appendix A: Script Dependencies Graph

```
orchestrate.sh (1,345 LOC)
├── helpers/spawn-agents.sh [P0] → spawns agents via npx
│   └── (no internal deps)
├── helpers/gate-check.sh [P0] → validates pass rate
│   ├── helpers/parse-test-results.sh [P0] → parses npm test
│   │   └── (no internal deps)
│   └── cfn-redis-coordination/* [TS] → context lookup
├── helpers/iteration-manager.sh [P1] → increments iteration
│   └── cfn-redis-coordination/* [TS]
├── cfn-redis-coordination/invoke-waiting-mode.sh [P0] → collects signals
│   └── redis-functions.sh [TS wrapper]
├── cfn-redis-coordination/get-context.sh [P0]
│   └── redis-functions.sh [TS wrapper]
├── cfn-redis-coordination/store-context.sh [P0]
│   └── redis-functions.sh [TS wrapper]
├── helpers/context-injector.sh [P1] → builds broadcast
│   └── (no internal deps)
├── cfn-product-owner-decision/execute-decision.sh [P3] → spawns PO
│   └── (external, mocked in tests)
└── External:
    ├── cfn-task-mode-sanitize/task-mode-env-sanitizer.sh [P3]
    ├── cfn-validation-runner-instrumentation/wrapped-executor.sh [P3]
    ├── cfn-process-instrumentation/instrument-process.sh [P3]
    └── cfn-ace-system/invoke-context-reflect.sh [P3]
```

---

## Appendix B: Test Data Fixtures

### **Parse Test Results**
```json
{
  "success": true,
  "numTotalTests": 10,
  "numPassedTests": 9,
  "numFailedTests": 1,
  "numPendingTests": 0,
  "testResults": [
    {
      "name": "backend-dev-123.test.js",
      "status": "pass",
      "assertionResults": [
        {"status": "pass", "title": "should create user"}
      ]
    }
  ]
}
```

**Pass Rate:** 9/10 = 0.90

### **Gate Threshold Check**
```bash
# Input
PASS_RATE=0.96
THRESHOLD=0.95
MODE="standard"

# Expected output
GATE_PASSED=true  # 0.96 >= 0.95
```

### **Agent Signal (Redis)**
```
Key: swarm:test-001:backend-dev-123:done
Value: {
  "agent_id": "backend-dev-123",
  "status": "complete",
  "confidence": 0.92,
  "deliverables": ["src/auth.ts", "tests/auth.test.ts"],
  "timestamp": "2025-11-19T15:30:00Z"
}
```

---

## Appendix C: Type Definitions (New)

```typescript
// types.ts - Shared types for orchestrator

export interface TestResult {
  passed: number;
  total: number;
  passRate: number;
  details: string;
}

export interface GateCheckResult {
  passed: boolean;
  passRate: number;
  threshold: number;
  decision: "PROCEED" | "ITERATE" | "ABORT";
}

export interface AgentSignal {
  agentId: string;
  status: "spawned" | "running" | "complete" | "failed";
  confidence?: number;
  deliverables?: string[];
  timestamp: string;
}

export interface IterationState {
  iteration: number;
  taskId: string;
  loop3Agents: string[];
  loop2Agents: string[];
  startTime: number;
  endTime?: number;
  duration?: number;
  decision?: string;
}
```

---

## Questions for Stakeholder Review

1. **E2E Test Agent Pool:** Should we mock agents with stubs or use real agents?
   - Real agents: More realistic but slower (30+ min per iteration)
   - Stub agents: Faster (~5 min) but less representative

2. **Migration Parallelization:** Can we have 2 developers work on P0 in parallel?
   - Dev A: Parse + Gate functions
   - Dev B: Spawn + Context logic
   - Both: Orchestrator integration

3. **Fallback Strategy:** If TypeScript migration fails, keep shell scripts?
   - Recommend: Yes, keep shell as fallback for 1 release cycle

4. **Testing Infrastructure:** Do we have Redis running for e2e tests?
   - Recommend: Docker Compose with Redis container for CI/CD

5. **CI/CD Integration:** Run e2e test on every PR?
   - Recommend: Yes, but with timeout (10 min per iteration max)

---

**Document Version:** 1.0
**Last Updated:** 2025-11-19
**Status:** READY FOR IMPLEMENTATION
**Confidence:** 0.92
