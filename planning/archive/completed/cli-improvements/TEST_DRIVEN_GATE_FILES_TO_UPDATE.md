# Test-Driven Gate: Files Requiring Updates
## Complete Checklist for Implementation

**Date:** 2025-11-15
**Related:** TEST_DRIVEN_GATE_IMPLEMENTATION_PLAN.md

---

## Summary

**Total Files:** 42 files across 6 categories
**Estimated Effort:** 7 weeks
**Priority Distribution:**
- HIGH priority: 23 files (must update)
- MEDIUM priority: 14 files (should update)
- LOW priority: 5 files (optional)

---

## Category 1: Core Orchestration (8 files - HIGH)

### 1.1 Main Orchestrator
- [ ] `.claude/skills/cfn-loop-orchestration/orchestrate.sh`
  - **Lines to update:** 250-350 (gate check section)
  - **Changes:** Replace confidence collection with test execution
  - **New code:** Call `gate-check.sh --success-criteria "$CRITERIA"`

### 1.2 Gate Check Logic
- [ ] `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh`
  - **Current:** Collects confidence scores from Redis
  - **New:** Execute test suites, parse results, compare to threshold
  - **Major refactor:** 90+ lines

- [ ] `.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh` *(NEW FILE)*
  - **Create new:** Test result parser for Jest, Mocha, pytest, TAP, JUnit
  - **Lines:** ~200 lines
  - **Purpose:** Extract pass/fail counts from test output

- [ ] `.claude/skills/cfn-loop-orchestration/helpers/generate-iteration-context.sh` *(NEW FILE)*
  - **Create new:** Generate context for fresh agents based on test failures
  - **Lines:** ~100 lines
  - **Purpose:** Show failing tests to next iteration agents

### 1.3 Skill Documentation
- [ ] `.claude/skills/cfn-loop-orchestration/SKILL.md`
  - **Section:** "Gate Check" (update description)
  - **Add:** Test-driven approach explanation
  - **Remove:** Confidence score references

- [ ] `.claude/skills/cfn-loop-validation/SKILL.md`
  - **Section:** "Consensus Calculation"
  - **Update:** Replace with "Test Pass Rate Calculation"

- [ ] `.claude/skills/cfn-test-runner/SKILL.md`
  - **Add:** Section on integration with CFN Loop gate check
  - **Document:** How to use with success criteria

### 1.4 Docker Orchestration
- [ ] `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh`
  - **Same changes as CLI orchestrator**
  - **Additional:** Handle success criteria from Docker env/config

---

## Category 2: Configuration & Parameters (7 files - HIGH)

### 2.1 Root Documentation
- [ ] `CLAUDE.md`
  - **Lines:** ~800-850 (CFN Loop section)
  - **Update:** Replace confidence gating with test-driven approach
  - **Add:** Success criteria examples
  - **Remove:** All "confidence: 0.85" examples

### 2.2 Command Documentation
- [ ] `.claude/commands/CFN_COORDINATOR_PARAMETERS.md`
  - **Add parameter:** `--success-criteria <json>`
  - **Document:** Format and examples
  - **Update:** Mode-specific thresholds (test pass rates)

- [ ] `.claude/commands/cfn-loop-cli.md`
  - **Add:** `--success-criteria` parameter
  - **Examples:** Show test-driven usage
  - **Update:** All example outputs

- [ ] `.claude/commands/cfn-loop-task.md`
  - **Add:** Success criteria definition prompt
  - **Examples:** Task Mode with tests
  - **Update:** Workflow description

### 2.3 Docker Configuration
- [ ] `docker/runtime/cfn-runtime.contract.yml`
  - **Add variable:** `CFN_SUCCESS_CRITERIA`
  - **Add variable:** `CFN_GATE_STRATEGY` (test-driven|confidence|auto)
  - **Document:** Format and defaults

- [ ] `docker/coordinator-entrypoint.sh`
  - **Add:** Load success criteria from env or file
  - **Pass:** Criteria to orchestrator

- [ ] `docker/runtime/cfn-runtime.sh`
  - **Update:** Environment validation
  - **Add:** Success criteria handling

---

## Category 3: Agent Profiles (6 files - MEDIUM)

### 3.1 Coordinators
- [ ] `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`
  - **Add capability:** Generate success criteria from task description
  - **Prompt section:** "Success Criteria Generation"
  - **Example:** "Task: 'Build auth' → Generate test requirements"

- [ ] `.claude/agents/docker-coordinators/cfn-docker-v3-coordinator.md`
  - **Same as above for Docker mode**

### 3.2 Implementers
- [ ] `.claude/agents/cfn-dev-team/backend-developer.md`
  - **Update prompt:** Read success criteria from task context
  - **Add:** "Write code that passes defined tests"

- [ ] `.claude/agents/cfn-dev-team/tester.md`
  - **Update:** Align tests with success criteria
  - **Add:** "Validate test coverage meets threshold"

### 3.3 Validators
- [ ] `.claude/agents/cfn-dev-team/reviewers/code-reviewer.md`
  - **Add:** Review test coverage and quality
  - **Check:** Test results from Loop 3 (stored in Redis)

- [ ] `.claude/agents/cfn-dev-team/product-owner.md`
  - **Update:** Reference test results in decision
  - **Add:** "Check test pass rate and coverage"

---

## Category 4: Slash Commands (5 files - HIGH)

### 4.1 Command Scripts
- [ ] `.claude/commands/cfn/cfn-loop-cli.sh`
  - **Add parameter:** `--success-criteria <json|file>`
  - **Parse:** JSON or load from file
  - **Pass:** To coordinator spawn command

- [ ] `.claude/commands/cfn/cfn-loop-task.sh`
  - **Add prompt:** Ask Main Chat to define success criteria
  - **Generate:** Default criteria if user doesn't provide
  - **Store:** In task context

- [ ] `.claude/commands/cfn/write-plan.sh`
  - **Update template:** Include success criteria section
  - **Example:** Show test requirements in plan

### 4.2 Docker Commands
- [ ] `.claude/commands/cfn-docker/CFN_DOCKER_NATIVE.md`
  - **Update:** Document success criteria in Docker mode
  - **Add:** Environment variable examples

- [ ] `.claude/commands/deprecated/cfn-loop.md` *(documentation only)*
  - **Add deprecation note:** Link to new test-driven approach

---

## Category 5: Skills Integration (7 files - MEDIUM)

### 5.1 Agent Spawning
- [ ] `.claude/skills/cfn-agent-spawning/spawn-agent.sh`
  - **Add:** Pass success criteria to agents via env var
  - **Export:** `AGENT_SUCCESS_CRITERIA="$CRITERIA_JSON"`

- [ ] `.claude/skills/cfn-agent-spawning/SKILL.md`
  - **Document:** Success criteria passing mechanism

### 5.2 Redis Coordination
- [ ] `.claude/skills/cfn-redis-coordination/cfn-loop-exec.sh`
  - **Add:** Store test results in Redis
  - **Keys:** `swarm:${TASK_ID}:test-results`

- [ ] `.claude/skills/cfn-redis-coordination/AGENT_LOGGING.md`
  - **Document:** Test result storage schema

### 5.3 Output Processing
- [ ] `.claude/skills/cfn-loop3-output-processing/process-loop3-output.sh`
  - **Add:** Parse test results from agent output
  - **Store:** Results for gate check

- [ ] `.claude/skills/cfn-loop2-output-processing/process-loop2-output.sh`
  - **Update:** Validators review test results + code

### 5.4 Product Owner Decision
- [ ] `.claude/skills/cfn-product-owner-decision/execute-decision.sh`
  - **Add:** Check test pass rate in decision logic
  - **Validate:** Test results exist before PROCEED

---

## Category 6: Tests & Validation (9 files - HIGH)

### 6.1 E2E Tests
- [ ] `tests/cfn-v3/test-e2e-cfn-loop.sh`
  - **Update:** Expect test execution in gate check
  - **Add:** Validate test results in Redis
  - **Mock:** Test output for gate check

- [ ] `tests/cfn-v3/test-cfn-validation.sh`
  - **Update:** Test both confidence and test-driven modes
  - **Add:** Test parser validation

### 6.2 Gate Check Tests
- [ ] `tests/cfn-v3/helpers/test-gate-check.sh`
  - **Major update:** Test new gate-check.sh logic
  - **Add:** Test all pass rate scenarios (0.80, 0.95, 0.99)
  - **Mock:** Different test frameworks (Jest, Mocha, pytest)

- [ ] `tests/cfn-v3/test-loop3-handoffs.sh`
  - **Update:** Validate test result passing to Loop 2

### 6.3 Docker Tests
- [ ] `tests/docker/core/cfn-loop-compliance-tests.sh`
  - **Add:** Test-driven gate validation in Docker
  - **Validate:** Success criteria loading from env/file

- [ ] `tests/docker/hello-world/example-p1-test.sh`
  - **Update:** Use success criteria
  - **Add:** Test execution in hello-world flow

### 6.4 Integration Tests
- [ ] `tests/integration/test-parameter-standardization.sh`
  - **Add:** Test success criteria parameter passing

- [ ] `tests/cfn-v3-orchestration/test-cfn-fallback-mode-comprehensive.sh`
  - **Update:** Test fallback to confidence if no criteria

- [ ] `tests/cfn-v3-orchestration/run-full-suite.sh`
  - **Add:** Test-driven gate tests to suite

---

## New Files to Create (5 files)

- [ ] `.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh`
  - **Purpose:** Parse test output from various frameworks
  - **Lines:** ~200

- [ ] `.claude/skills/cfn-loop-orchestration/helpers/generate-iteration-context.sh`
  - **Purpose:** Create context for next iteration based on test failures
  - **Lines:** ~100

- [ ] `.claude/skills/cfn-success-criteria/SKILL.md` *(optional)*
  - **Purpose:** Centralized success criteria management
  - **Lines:** ~150

- [ ] `.claude/skills/cfn-success-criteria/generate-criteria.sh` *(optional)*
  - **Purpose:** Auto-generate criteria from task description
  - **Lines:** ~250

- [ ] `docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md` *(user guide)*
  - **Purpose:** User-facing documentation
  - **Lines:** ~500

---

## Priority Breakdown

### Phase 1 (Week 1): Foundation
**HIGH Priority - Must Complete First**
- [ ] `parse-test-results.sh` (NEW)
- [ ] `gate-check.sh` (update)
- [ ] `orchestrate.sh` (update)
- [ ] `cfn-runtime.contract.yml` (add vars)
- [ ] `test-gate-check.sh` (update tests)

### Phase 2 (Week 2): Task Mode
**HIGH Priority**
- [ ] `cfn-loop-task.sh` (add success criteria prompt)
- [ ] `cfn-loop-task.md` (document)
- [ ] `CLAUDE.md` (update CFN Loop section)

### Phase 3 (Week 3): CLI Mode
**HIGH Priority**
- [ ] `cfn-v3-coordinator.md` (add criteria generation)
- [ ] `cfn-loop-cli.sh` (add parameter)
- [ ] `cfn-loop-cli.md` (document)

### Phase 4 (Week 4): Docker Mode
**HIGH Priority**
- [ ] `coordinator-entrypoint.sh` (load criteria)
- [ ] `cfn-docker-v3-coordinator.md` (update)
- [ ] `cfn-loop-compliance-tests.sh` (validate)

### Phase 5-7: Remaining Files
**MEDIUM/LOW Priority**
- All agent profiles
- All skill documentation
- Remaining test files
- Optional new files

---

## Quick Reference: Search & Replace Patterns

### Pattern 1: Confidence Collection
**Find:**
```bash
CONSENSUS=$("$REDIS_COORD_SKILL/invoke-waiting-mode.sh" collect \
  --task-id "$TASK_ID" \
  --agent-ids "$AGENTS")
```

**Replace:**
```bash
# NEW: Test-driven gate check
GATE_RESULT=$("$HELPERS_DIR/gate-check.sh" \
  --task-id "$TASK_ID" \
  --mode "$MODE" \
  --success-criteria "$SUCCESS_CRITERIA")
```

### Pattern 2: Confidence Threshold
**Find:**
```bash
GATE_THRESHOLD=0.75
CONSENSUS_THRESHOLD=0.90
```

**Replace:**
```bash
# Test pass rate thresholds (replaces confidence)
TEST_PASS_RATE_GATE=0.95      # Gate check (Loop 3)
TEST_PASS_RATE_CONSENSUS=0.95  # Consensus (Loop 2)
```

### Pattern 3: Documentation Examples
**Find:**
```
Agent self-assessment: "confidence: 0.85"
```

**Replace:**
```
Test-driven validation: "19/20 tests passed (0.95)"
```

---

## Validation Checklist

After updating all files, verify:

- [ ] All modes work (Task, CLI, Docker)
- [ ] Hybrid mode functions (confidence fallback)
- [ ] Test parsers support 5+ frameworks
- [ ] Gate check execution time <60s
- [ ] All tests pass (95%+ pass rate)
- [ ] Documentation contains no "confidence score" references
- [ ] Backward compatibility maintained
- [ ] Environment variables documented

---

## Estimated Effort by Category

| Category | Files | Lines Changed | Days |
|----------|-------|---------------|------|
| Core Orchestration | 8 | ~800 | 7 |
| Configuration | 7 | ~400 | 4 |
| Agents | 6 | ~300 | 3 |
| Slash Commands | 5 | ~250 | 2 |
| Skills | 7 | ~350 | 3 |
| Tests | 9 | ~600 | 5 |
| **TOTAL** | **42** | **~2,700** | **24 days** |

*Estimated: 7 weeks at 1 FTE (with testing and documentation)*

---

## Success Metrics

**After completion, verify:**

1. **Reliability:** Test-driven gate accuracy ≥95%
2. **Coverage:** All 42 files updated successfully
3. **Performance:** Gate check executes in <60s
4. **Adoption:** 80% of CFN Loops use test-driven by Week 6
5. **Documentation:** 0 references to confidence scores in user docs

---

**End of Checklist**
