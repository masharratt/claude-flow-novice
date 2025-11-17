# Test Coverage Quick Reference (Updated)
## Claude Flow Novice - One-Page Guide

**Last Updated:** November 17, 2025  
**Status:** Post-Main-Merge Analysis

---

## QUICK STATS

| Metric | Now | Target | Gap |
|--------|-----|--------|-----|
| **Source LOC** | 29,409 | - | - |
| **Test LOC** | 93,608 | - | - |
| **Test:Code Ratio** | 3.2:1 | 2.5:1+ | ✅ Good |
| **File Coverage** | 1.6% | 30%+ | Need 1,200 tests |
| **CFN Loop Tests** | 60% | 90%+ | Need 200+ tests |
| **Agent Lifecycle** | 50% | 85%+ | Need 150+ tests |
| **Overall Confidence** | MEDIUM | HIGH | 6-8 weeks work |

---

## WHAT'S BEEN ADDED (This Merge)

### New Testing Specialists ✅

```
Contract Tester        → API contract + schema testing
Integration Tester     → E2E workflow + cross-component testing
Mutation Tester        → Test quality validation
```

### New Validation Skills ✅

```
JSON Validator         → Success criteria validation
Agent Template Gen     → Standardized agent creation
Agent Linter           → Template compliance checking
```

### New Testing Infrastructure ✅

```
Test Result Parser     → Jest/Pytest output parsing
Success Criteria Store → Redis persistence
Gate Security Tests    → Symlink attack prevention
Docker Tests           → Container orchestration
```

---

## CRITICAL GAPS (Still Exist)

### Top 3 Priorities

| Gap | Location | LOC | Tests | Impact |
|-----|----------|-----|-------|--------|
| **CFN Orchestration E2E** | `src/cfn-loop/cfn-loop-orchestrator.ts` | 2,020 | ~40% | CRITICAL |
| **Agent Lifecycle** | `src/agents/lifecycle-manager.ts` | 1,278 | ~50% | CRITICAL |
| **CLI Commands** | `src/cli/cfn-*.ts` | 2,100 | ~20% | HIGH |

### Quick Gap Map

```
✅ = Well tested    ⚠️ = Partial      ❌ = Not tested

CFN Loop Infrastructure:
  ✅ Gate security (test-driven gates + security validation)
  ⚠️ Loop 2 consensus voting (helper functions, not full validation)
  ⚠️ Product Owner decision (basic execution, not error cases)
  ❌ Full cycle (Loop 3 → Loop 2 → Product Owner → iterate)

Agent System:
  ✅ Template validation (agent-template-generator + linter)
  ⚠️ Spawning (parameter validation, not full lifecycle)
  ❌ Lifecycle state machine (all 9 states × transitions)
  ❌ Concurrent limits (spawning + resource constraints)

CLI Commands:
  ✅ Parameter validation (some commands)
  ❌ cfn loop (loop mode, iteration logic)
  ❌ cfn swarm (swarm management)
  ❌ cfn memory (memory operations)

Docker/Containers:
  ✅ Access control (DOCKER_ACCESS_CONTROL.md)
  ✅ Success criteria loading (test-docker-orchestrator.sh)
  ⚠️ Security scanning (no Trivy/Snyk integration)
  ❌ Image building in WSL2 (validation only)

Database:
  ⚠️ Transactions (34 tests, but not error cases)
  ⚠️ Connection pooling (partial coverage)
  ❌ Rollback scenarios (transaction failure)
  ❌ Concurrent access (race conditions)

Shell Scripts:
  ✅ Gate checking (test-gate-check-*.sh)
  ✅ Test parsing (parse-test-results.sh)
  ⚠️ Redis operations (centralized but partial)
  ❌ Agent spawning (spawn-agent.sh - critical gap)
  ❌ Orchestration (orchestrate.sh - critical gap)
```

---

## WHAT TO TEST THIS WEEK

### Option A: Quick Wins (15-20 hrs)
1. **Agent spawning failure scenarios** - 5 hrs
2. **CLI command parsing** - 5 hrs
3. **Database transaction rollback** - 5 hrs
4. **Shell script error handling** - 5 hrs

### Option B: High Impact (40-60 hrs)
1. **CFN Loop end-to-end** - 40-60 hrs
   - Loop 3 spawn → collect confidence
   - Loop 2 consensus voting
   - Product Owner decision
   - Gate threshold enforcement

### Option C: Balanced (30-40 hrs)
1. **Agent lifecycle state machine** - 20-30 hrs
2. **CLI command validation** - 10 hrs

---

## WHICH SPECIALIST TO USE

### For Different Scenarios

| Scenario | Specialist | Time | Result |
|----------|-----------|------|--------|
| "Write API tests" | contract-tester | 2-3d | Pact contracts ✅ |
| "Test CFN workflow" | integration-tester | 3-5d | E2E tests ✅ |
| "Validate test quality" | mutation-testing-specialist | 2-3d | Mutation score 💯 |
| "Review code" | reviewer | 1-2d | PR feedback |
| "Implement feature" | coder | 3-5d | Working code |

---

## TESTING INFRASTRUCTURE STATUS

### ✅ What's Working

- Jest/TS test framework
- Success criteria validation
- JSON schema validation
- Test result parsing
- Security regression tests
- Docker integration basics

### ⚠️ Partial/Needs Work

- Shell script testing (25% coverage)
- Database transaction testing (74% coverage)
- Error scenario coverage (15% coverage)
- Docker security scanning (0% coverage)

### ❌ Not Yet Implemented

- BATS shell test framework
- Mutation testing integration
- Contract testing framework setup
- Performance profiling suite

---

## FILE PRIORITIES FOR TESTING

### Must Test (This Month)

1. **`src/cfn-loop/cfn-loop-orchestrator.ts`**
   - Why: Core orchestration logic
   - Impact: CRITICAL
   - Effort: 40-60 hrs
   - Status: Needs comprehensive E2E tests

2. **`src/agents/lifecycle-manager.ts`**
   - Why: Agent state machine
   - Impact: CRITICAL
   - Effort: 30-45 hrs
   - Status: Needs full state machine tests

3. **`src/cli/cfn-loop.ts`**
   - Why: CLI mode execution
   - Impact: HIGH
   - Effort: 15-20 hrs
   - Status: Needs command parsing tests

### Should Test (Next Month)

4. **Database adapters** (postgres, sqlite, redis)
5. **Middleware** (transparency, auth)
6. **Shell scripts** (spawning, coordination)

---

## QUICK WINS (Start Here)

### These Can Be Done This Week (8-12 hrs)

```bash
# 1. Add shell script test harness
echo "Testing shell scripts..."
tests/cfn-v3/helpers/test-shell-framework.sh

# 2. Extend config validator
npm test -- tests/config-validator.test.ts --updateSnapshot

# 3. Add agent output validation edge cases
npm test -- tests/agent-output-validator.test.ts

# 4. Test CLI parameter validation
npm test -- tests/cli/parameter-validation.test.ts
```

---

## METRICS TO TRACK

### Weekly

```
Tests written:          [__________] goal: 50
Files with coverage:    [__________] goal: 10
Test pass rate:         [__________] goal: 100%
Test execution time:    [__________] goal: <5 min
```

### Monthly

```
Overall file coverage:  [__________] goal: 20%
CFN Loop coverage:      [__________] goal: 80%
Agent coverage:         [__________] goal: 75%
CLI coverage:           [__________] goal: 50%
```

---

## DEPENDENCIES

### Test Frameworks (Already Installed)
- Jest 30.2.0
- TypeScript 5.x
- Redis client
- SQLite3

### Optional (Recommended to Add)
- BATS (Bash testing)
- Stryker (Mutation testing)
- Pact (Contract testing)
- Supertest (HTTP testing)

### Install New Frameworks
```bash
npm install --save-dev @bats-core/bats
npm install --save-dev stryker stryker-cli
npm install --save-dev @pact-foundation/pact
npm install --save-dev supertest
```

---

## SUCCESS CRITERIA

### Phase 1 (2-3 weeks)
- [ ] CFN Loop: 80%+ coverage
- [ ] Agent Lifecycle: 75%+ coverage
- [ ] CLI Commands: 50%+ coverage
- [ ] Shell Tests: 40%+ coverage

### Phase 2 (3-4 weeks)
- [ ] Database: 90%+ coverage
- [ ] Docker: 75%+ coverage
- [ ] Error Scenarios: 60%+ coverage
- [ ] Overall File Coverage: 15%+

### Phase 3 (4-6 weeks)
- [ ] Overall Coverage: 30%+
- [ ] Mutation Score: 80%+
- [ ] Contract Tests: Passing
- [ ] Production Ready: YES ✅

---

## KEY COMMANDS

### Run Tests
```bash
npm test                    # All tests
npm test:watch             # Watch mode
npm test:coverage          # Coverage report
npm test -- --testNamePattern="CFN"  # Specific tests
```

### Create New Test File
```bash
# Copy template
cp tests/template.test.ts tests/my-feature.test.ts

# Run just this file
npm test -- tests/my-feature.test.ts
```

### Test Shell Scripts
```bash
# Run shell test
bash tests/cfn-v3/helpers/test-gate-check.sh

# Run with verbose output
bash -x tests/cfn-v3/helpers/test-gate-check.sh
```

---

## RED FLAGS (Fix Immediately)

If you see these in tests:

| Flag | Meaning | Action |
|------|---------|--------|
| ❌ Test timeout | Infinite loop or slow code | Review test + code |
| ❌ Flaky test | Passes sometimes | Add proper waits |
| ❌ Skipped tests | `test.skip()` or `xit()` | Implement or remove |
| ❌ 0% coverage | File not tested | Write tests |
| ❌ All tests fail | Framework issue | Check Jest config |

---

## CHECKLIST FOR NEW FEATURES

Before merging, ensure:

- [ ] Unit tests written (happy path + errors)
- [ ] Integration tests created
- [ ] Error scenarios covered (3+ error cases)
- [ ] No console.log() in code (use logging)
- [ ] No hardcoded values (use constants)
- [ ] Async properly handled (awaits, promises)
- [ ] Test coverage ≥ 80% for new code
- [ ] Tests pass locally
- [ ] Tests pass in CI/CD

---

**For detailed analysis, see:** `/home/user/claude-flow-novice/docs/TEST_COVERAGE_ANALYSIS_UPDATED.md`

