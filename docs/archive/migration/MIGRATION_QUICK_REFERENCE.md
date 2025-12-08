# Shell-to-TypeScript Migration: Quick Reference

## At-A-Glance Priority Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│  MIGRATION PRIORITY: P0 (Critical Path for 5-Iteration E2E)     │
└─────────────────────────────────────────────────────────────────┘

P0 - MUST MIGRATE (Blocks e2e test):
  1. parse-test-results.sh    → parse-test-results.ts       (236 LOC)
  2. gate-check.sh            → gate-check.ts               (243 LOC)
  3. spawn-agents.sh          → spawn-agents.ts             (137 LOC)
  4. iteration-manager.sh     → iteration-manager.ts        (66 LOC)
  5. context-injector.sh      → context-injector.ts         (95 LOC)
  6. Create invoke-redis.sh wrapper for TS modules           (50 LOC)
  7. Refactor orchestrate.sh → orchestrator.ts              (500 LOC)
  8. Create bin/orchestrate.ts CLI entry point               (30 LOC)
  ═════════════════════════════════════════════════════════════════
  TOTAL P0: 8 scripts, 1,357 LOC (est. 18 hours)

P1 - HIGH VALUE (Complete after P0 validated):
  9. context-lookup.sh        → context-lookup.ts           (247 LOC)
 10. collect-confidence-scores.sh → confidence-aggregator.ts (224 LOC)
 11. report-completion.sh     → completion-reporter.ts      (89 LOC)
 12. consensus.sh             → consensus-aggregator.ts     (75 LOC)

P2 - MEDIUM VALUE (Can skip for e2e):
 13. deliverable-verifier.sh  → inline logic                 (38 LOC)
 14. timeout-calculator.sh    → inline logic                 (26 LOC)

P3 - DEFERRABLE (Out of scope):
    - Docker wave execution (900 LOC) → Separate Docker e2e
    - Skill propagation (648 LOC) → Optional feature
    - Agent spawning CLI (1,300 LOC) → Mock in tests
```

---

## 5-Iteration E2E Test Timeline

```
Iteration 1 (4h):  P0 foundation (parse + gate) → First shell wrapper call
Iteration 2 (6h):  P0 core logic (spawn + context) → Agent spawning works
Iteration 3 (8h):  P0 orchestrator (full loop) → 3-iter e2e passes
Iteration 4 (4h):  P1 robustness (recovery) → 5-iter stress test
Iteration 5 (4h):  Validation & baseline metrics → Final e2e with all P0

Total: 22 hours (3-4 days), Single developer or 2-developer parallel effort
```

---

## Critical Dependencies

```
✅ READY TO USE (Completed work):
   └─ cfn-redis-coordination/ (15 TS modules, 5,408 LOC)
      ├── redis-client.ts (654 LOC)
      ├── waiting-coordinator.ts (587 LOC)
      ├── agent-recovery.ts (454 LOC)
      ├── context-manager.ts (327 LOC)
      └── ... 11 more modules

⚠️  NEEDS MIGRATION (P0):
   └─ cfn-loop-orchestration/ (8 shell scripts)
      ├── parse-test-results.sh → [BLOCKED ON NOTHING]
      ├── gate-check.sh → [BLOCKED ON parse-test-results]
      ├── spawn-agents.sh → [BLOCKED ON NOTHING]
      ├── iteration-manager.sh → [BLOCKED ON NOTHING]
      ├── context-injector.sh → [BLOCKED ON NOTHING]
      ├── orchestrator.ts → [BLOCKED ON ALL ABOVE]
      └── bin/orchestrate.ts → [BLOCKED ON orchestrator.ts]

⏭️  NOT CRITICAL (Can mock in tests):
   └─ External skills
      ├── cfn-product-owner-decision/ (367 LOC) → Mock
      ├── cfn-agent-spawning/ (1,300 LOC) → Mock
      ├── cfn-error-logging/ (838 LOC) → Skip
      └── Docker wave execution (900 LOC) → Separate test
```

---

## Recommended Implementation Order

### Phase 1: Test Parsing (4 hours)
```
1. Create parse-test-results.ts (240 LOC)
   └─ Parse npm test JSON → pass rate

2. Write unit tests (test fixtures for pass/fail/timeout)
   └─ npm test --testMatch='**/parse-test-results.test.ts'

3. Validate: parse-test-results.ts compiles & tests pass
   └─ UNBLOCKS: gate-check.sh migration
```

### Phase 2: Gate & Context (6 hours)
```
4. Create gate-check.ts (245 LOC)
   ├─ Depends on: parse-test-results.ts, Redis context-manager
   └─ Unit test with fixtures (0.96 vs 0.95 → PROCEED)

5. Create spawn-agents.ts (135 LOC)
   ├─ Dry-run validation of agent list format
   └─ UNBLOCKS: orchestrator.ts integration

6. Create iteration-manager.ts (70 LOC)
   ├─ Increment counter in Redis
   └─ UNBLOCKS: orchestrator.ts integration

7. Create context-injector.ts (95 LOC)
   ├─ Build broadcast messages
   └─ UNBLOCKS: orchestrator.ts integration

8. Create invoke-redis.sh bridge wrapper (50 LOC)
   ├─ Unified entry point for all TS modules
   └─ VALIDATES: orchestrate.sh can call TS code
```

### Phase 3: Main Orchestrator (8 hours)
```
9. Create orchestrator.ts (500 LOC)
   ├─ Main loop: spawn → wait → gate → iterate
   ├─ Integration test: 1-iteration e2e
   └─ VALIDATED: gate-check logic works

10. Create bin/orchestrate.ts CLI (30 LOC)
    ├─ Parse args, invoke orchestrator
    └─ READY FOR: 5-iteration e2e test

11. Refactor orchestrate.sh (→ calls Node.js)
    ├─ Keep legacy wrapper for compatibility
    └─ VALIDATED: Shell scripts work with TS modules
```

---

## Test Execution Checklist

### After Each Phase
```bash
# Phase 1 - Parse & Gate Functions
[ ] npm test --testMatch='parse-test-results.test.ts' → PASS
[ ] npm test --testMatch='gate-check.test.ts' → PASS
[ ] invoke-redis.sh wrapper exists and is executable

# Phase 2 - Agent & Context
[ ] npm test --testMatch='spawn-agents.test.ts' → PASS
[ ] npm test --testMatch='iteration-manager.test.ts' → PASS
[ ] npm test --testMatch='context-injector.test.ts' → PASS
[ ] Integration test: spawn agents + wait for signals → PASS

# Phase 3 - Full Orchestrator
[ ] npm test --testMatch='orchestrator.integration.test.ts' → PASS
[ ] 1-iteration e2e: ./bin/orchestrate.ts --max-iterations 1 → PASS
[ ] 3-iteration e2e: ./bin/orchestrate.ts --max-iterations 3 → PASS
[ ] 5-iteration e2e: ./bin/orchestrate.ts --max-iterations 5 → PASS (< 30min)
```

---

## Success Metrics

| Metric | P0 Baseline | P0 Target | P1 Target |
|--------|-----------|-----------|-----------|
| Type Coverage | 85% | 95% | 98% |
| Unit Test Pass Rate | 90% | 98% | 100% |
| E2E 5-Iteration Duration | N/A | <30 min | <15 min |
| Memory Usage (Peak) | N/A | <500 MB | <300 MB |
| Agent Signal Reliability | N/A | 99% | 99.9% |
| Final Confidence Score | N/A | ≥0.90 | ≥0.95 |

---

## Quick Troubleshooting

### "Bridge wrapper not found"
```bash
# Verify cfn-redis-coordination is compiled
ls -la .claude/skills/cfn-redis-coordination/dist/
npm run build --prefix .claude/skills/cfn-redis-coordination
```

### "Gate check hangs"
```bash
# Check Redis connectivity
redis-cli -h localhost -p 6379 PING
# Set explicit timeout
export CFN_VALIDATION_TIMEOUT=60
```

### "Memory leak detected"
```bash
# Profile with --expose-gc
node --expose-gc ./dist/orchestrator.js --task-id test-001
# Check RSS growth: should be stable across iterations
ps aux | grep node | awk '{print $6}'
```

### "Tests timeout"
```bash
# Increase Jest timeout
jest --testTimeout=30000 --testMatch='*.test.ts'
# Or in jest.config.js: testTimeout: 30000
```

---

## File Changes Summary

### New Files (P0)
```
.claude/skills/cfn-loop-orchestration/
├── src/
│   ├── parse-test-results.ts       [NEW, 240 LOC]
│   ├── gate-check.ts               [NEW, 245 LOC]
│   ├── spawn-agents.ts             [NEW, 135 LOC]
│   ├── iteration-manager.ts        [NEW, 70 LOC]
│   ├── context-injector.ts         [NEW, 95 LOC]
│   ├── orchestrator.ts             [NEW, 500 LOC]
│   ├── types.ts                    [NEW, 200 LOC]
│   └── __tests__/
│       ├── parse-test-results.test.ts [NEW]
│       ├── gate-check.test.ts [NEW]
│       ├── spawn-agents.test.ts [NEW]
│       └── orchestrator.integration.test.ts [NEW]
├── bin/
│   └── orchestrate.ts              [NEW, 30 LOC]
├── invoke-redis.sh                 [NEW, 50 LOC]
└── package.json                    [MODIFIED - add new scripts]
```

### Modified Files
```
orchestrate.sh                        [MODIFIED - calls Node.js entry point]
helpers/                              [DEPRECATED - migrated to TS]
jest.config.js                        [MODIFIED - add test patterns]
tsconfig.json                         [VERIFIED - already set for strict mode]
```

---

## Validation Checklist (Final)

Before declaring P0 complete:
```
Core Functionality:
  [ ] 5-iteration e2e test completes in <30 minutes
  [ ] No TypeScript compilation errors
  [ ] No ESLint violations (strict: true)
  [ ] 100% test coverage for critical paths (parse, gate, spawn)

Reliability:
  [ ] No memory leaks (RSS stable across 5 iterations)
  [ ] No Redis connection timeouts
  [ ] Agent signals collected 100% of time
  [ ] Final confidence score ≥0.90

Integration:
  [ ] orchestrate.sh works without modification
  [ ] Backward compatibility maintained
  [ ] Error messages are actionable
  [ ] Debug logs available for troubleshooting

Performance:
  [ ] Iteration 1: <6 min
  [ ] Iteration 2-5: <7 min each
  [ ] Redis operations: <1s latency
  [ ] Agent spawn: <30s per agent

Documentation:
  [ ] Type definitions documented
  [ ] Public APIs have JSDoc comments
  [ ] Breaking changes documented
  [ ] Migration guide for dependent skills
```

---

**Next Steps:**
1. Review this plan with team
2. Assign developers to P0 phases (can parallelize)
3. Set up test infrastructure (Redis Docker container)
4. Start Phase 1 implementation

**Estimated Completion:** 3-4 days (22 hours effort)
