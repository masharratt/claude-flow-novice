# Comprehensive Test-Driven Gate Implementation Plan
## Complete File Inventory, Success Criteria, and Integration Handoffs

**Date:** 2025-11-15
**Author:** System Implementation Team
**Version:** 1.0.0
**Scope:** CFN Loop Test-Driven Gate (All Modes: Task, CLI, Docker)
**Estimated Effort:** 7-8 weeks (1 FTE)

---

## Executive Summary

This document provides a **complete, production-ready implementation plan** for replacing CFN Loop's subjective confidence scoring with objective test-driven validation. This plan includes:

- ✅ **Complete file inventory** (74 files requiring updates)
- ✅ **All handoff points** mapped with data flow diagrams
- ✅ **Success criteria schema** and validation rules
- ✅ **Test coverage requirements** (95%+ for all new code)
- ✅ **Integration scripts** for seamless rollout
- ✅ **Rollback procedures** for safe deployment

**Key Improvement:**
```
Current: Agent confidence 0.82 → Actual correctness 0.45 (37% gap)
Target:  Test pass rate 0.95 → Actual correctness 0.93 (2% gap)
```

**Impact Analysis from Recent PR Review:**
- 5 implementation errors missed by confidence scoring
- All 5 would have been caught by test-driven gate
- Time to detection: Days (human review) → Seconds (automated tests)

---

## Table of Contents

1. [Complete File Inventory](#1-complete-file-inventory)
2. [Success Criteria Schema](#2-success-criteria-schema)
3. [Data Flow and Handoff Points](#3-data-flow-and-handoff-points)
4. [Phase-by-Phase Implementation](#4-phase-by-phase-implementation)
5. [Test Coverage Requirements](#5-test-coverage-requirements)
6. [Integration and Validation Scripts](#6-integration-and-validation-scripts)
7. [Rollback Procedures](#7-rollback-procedures)
8. [Success Metrics](#8-success-metrics)

---

## 1. Complete File Inventory

### 1.1 Core Orchestration Files (14 files - CRITICAL)

#### Orchestrator Scripts
- [ ] `.claude/skills/cfn-loop-orchestration/orchestrate.sh` **(CRITICAL)**
  - **Current:** Lines 300-400 collect confidence scores
  - **New:** Replace with test execution and pass rate calculation
  - **Lines to change:** ~150 lines
  - **Functions affected:**
    - `collect_loop3_confidence()` → `execute_gate_check_tests()`
    - `check_gate_threshold()` → `validate_test_pass_rate()`
  - **Dependencies:** gate-check.sh, parse-test-results.sh

- [ ] `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh` **(CRITICAL)**
  - **Same changes as CLI orchestrator**
  - **Additional:** Load success criteria from Docker env/config
  - **Lines to change:** ~160 lines

#### Gate Check Scripts
- [ ] `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh` **(CRITICAL)**
  - **Current:** 91 lines (confidence-based)
  - **New:** 250+ lines (test-driven)
  - **Major refactor:** Complete rewrite
  - **New functions:**
    ```bash
    gate_check_test_driven()
    execute_test_suite()
    calculate_pass_rate()
    store_test_results()
    generate_iteration_context()
    ```
  - **Dependencies:** parse-test-results.sh, cfn-test-runner

- [ ] `.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh` **(NEW FILE)**
  - **Purpose:** Parse test output from various frameworks
  - **Lines:** ~300 lines
  - **Frameworks supported:**
    - Jest (JavaScript/TypeScript)
    - Mocha (JavaScript)
    - pytest (Python)
    - TAP (Generic)
    - JUnit XML (Java/others)
    - Go test (Go)
  - **Functions:**
    ```bash
    parse_test_results()
    parse_jest_output()
    parse_mocha_output()
    parse_pytest_output()
    parse_tap_output()
    parse_junit_xml()
    extract_pass_count()
    extract_fail_count()
    extract_total_count()
    ```

- [ ] `.claude/skills/cfn-loop-orchestration/helpers/generate-iteration-context.sh` **(NEW FILE)**
  - **Purpose:** Create context for fresh agents based on test failures
  - **Lines:** ~150 lines
  - **Functions:**
    ```bash
    generate_iteration_context()
    extract_failed_tests()
    format_test_failures()
    create_agent_briefing()
    store_iteration_context()
    ```

- [ ] `.claude/skills/cfn-loop-orchestration/helpers/spawn-agents.sh`
  - **Current:** Spawns agents with task context
  - **New:** Add success criteria to agent context
  - **Lines to change:** ~30 lines
  - **Changes:**
    - Add `--success-criteria` parameter
    - Pass criteria via environment or Redis

#### Helper Scripts
- [ ] `.claude/skills/cfn-loop-orchestration/helpers/collect-consensus.sh`
  - **Current:** Collects confidence scores
  - **New:** Optionally collect test results from validators
  - **Lines to change:** ~20 lines

- [ ] `.claude/skills/cfn-loop-orchestration/helpers/validate-deliverables.sh`
  - **Current:** Basic file existence check
  - **New:** Enhanced validation with success criteria
  - **Lines to change:** ~40 lines

#### Skill Documentation
- [ ] `.claude/skills/cfn-loop-orchestration/SKILL.md`
  - **Update:** Gate check section
  - **Add:** Test-driven approach explanation
  - **Remove:** Confidence score references
  - **Lines to change:** ~100 lines

- [ ] `.claude/skills/cfn-loop-validation/SKILL.md`
  - **Update:** Replace "Consensus Calculation" with "Test Pass Rate Calculation"
  - **Lines to change:** ~80 lines

- [ ] `.claude/skills/cfn-test-runner/SKILL.md`
  - **Add:** Integration with CFN Loop gate check
  - **Document:** Success criteria usage
  - **Lines to change:** ~60 lines

- [ ] `.claude/skills/cfn-docker-loop-orchestration/SKILL.md`
  - **Update:** Same as cfn-loop-orchestration
  - **Add:** Docker-specific success criteria handling
  - **Lines to change:** ~90 lines

#### Test Scripts
- [ ] `.claude/skills/cfn-loop-orchestration/test-orchestrate.sh` **(NEW FILE)**
  - **Purpose:** Unit tests for orchestrator
  - **Lines:** ~400 lines
  - **Test coverage:**
    - Test execution
    - Pass rate calculation
    - Iteration context generation
    - Redis storage

- [ ] `.claude/skills/cfn-loop-orchestration/test-gate-check.sh` **(NEW FILE)**
  - **Purpose:** Unit tests for gate-check.sh
  - **Lines:** ~500 lines
  - **Test coverage:**
    - All test frameworks
    - Pass/fail scenarios
    - Threshold validation

---

### 1.2 Agent Spawning Files (8 files - HIGH)

#### Spawning Scripts
- [ ] `.claude/skills/cfn-agent-spawning/spawn-agent.sh` **(HIGH)**
  - **Current:** Lines 100-200 prepare agent context
  - **New:** Add success criteria to agent context
  - **Lines to change:** ~50 lines
  - **Changes:**
    ```bash
    # Add to agent context export
    export AGENT_SUCCESS_CRITERIA="$SUCCESS_CRITERIA_JSON"
    export AGENT_TEST_SUITES="$TEST_SUITES_JSON"
    export AGENT_DELIVERABLES="$DELIVERABLES_JSON"
    ```

- [ ] `.claude/skills/cfn-agent-spawning/spawn-worker.sh`
  - **Same changes as spawn-agent.sh**
  - **Lines to change:** ~50 lines

- [ ] `.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh`
  - **Same changes as spawn-agent.sh**
  - **Additional:** Mount success criteria file into container
  - **Lines to change:** ~60 lines

- [ ] `.claude/skills/cfn-docker-wave-execution/spawn-wave.sh`
  - **Update:** Pass success criteria to wave agents
  - **Lines to change:** ~40 lines

- [ ] `.claude/skills/cfn-hybrid-routing/spawn-worker.sh`
  - **Update:** Include success criteria in worker context
  - **Lines to change:** ~30 lines

#### Skill Documentation
- [ ] `.claude/skills/cfn-agent-spawning/SKILL.md`
  - **Add:** Success criteria passing mechanism
  - **Document:** Environment variable format
  - **Lines to change:** ~70 lines

- [ ] `.claude/skills/cfn-docker-agent-spawning/SKILL.md`
  - **Add:** Docker volume mount for success criteria
  - **Lines to change:** ~60 lines

#### Test Scripts
- [ ] `.claude/skills/cfn-agent-spawning/test-spawn-agent.sh` **(NEW FILE)**
  - **Purpose:** Verify success criteria passing
  - **Lines:** ~200 lines

---

### 1.3 Agent Profile Files (12 files - MEDIUM/HIGH)

#### Coordinators
- [ ] `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md` **(HIGH)**
  - **Add:** Success criteria generation capability
  - **New section:** "Success Criteria Generation Protocol"
  - **Lines to add:** ~200 lines
  - **Prompt additions:**
    ```markdown
    ## Success Criteria Generation (REQUIRED)

    Before spawning Loop 3 agents, analyze task and generate success criteria:

    ### 1. Extract Test Requirements
    - Analyze task description for testing needs
    - Identify test types: unit, integration, e2e, security
    - Map to project structure (npm test, pytest, etc.)

    ### 2. Define Test Suites
    ```json
    {
      "test_suites": [
        {
          "name": "Unit Tests",
          "command": "npm run test:unit -- tests/feature.test.ts",
          "required": true,
          "pass_threshold": 0.95
        }
      ]
    }
    ```

    ### 3. Store in Redis
    ```bash
    redis-cli HSET "swarm:${TASK_ID}:config" \
      "success_criteria" "$SUCCESS_CRITERIA_JSON"
    ```
    ```

- [ ] `.claude/agents/docker-coordinators/cfn-docker-v3-coordinator.md`
  - **Same updates as cfn-v3-coordinator**
  - **Additional:** Load criteria from Docker env
  - **Lines to add:** ~220 lines

#### Implementers (Loop 3)
- [ ] `.claude/agents/cfn-dev-team/developers/backend-developer.md` **(CRITICAL)**
  - **Current:** "Report confidence when done"
  - **New:** "Write tests first, pass all tests, signal completion"
  - **Lines to change:** ~150 lines
  - **New sections:**
    ```markdown
    ## Success Criteria (READ FIRST)

    Read success criteria from environment:
    ```bash
    CRITERIA=$(echo "$AGENT_SUCCESS_CRITERIA" | jq -r '.')
    TEST_SUITES=$(echo "$CRITERIA" | jq -r '.test_suites[]')
    ```

    ## TDD Protocol (MANDATORY)

    1. **Write Tests First** (15-20 min)
       - Read test requirements from success criteria
       - Write failing tests for each requirement
       - Ensure test coverage ≥80%

    2. **Implement** (30-40 min)
       - Write minimum code to pass tests
       - Run tests continuously (npm test --watch)
       - Refactor for quality

    3. **Validate** (5 min)
       - Run full test suite
       - Verify pass rate meets threshold
       - Check coverage report

    4. **Signal Completion**
       ```bash
       # DO NOT report confidence scores
       # Gate check will run tests automatically

       ./.claude/skills/cfn-coordination/report-completion.sh \
         --task-id "$TASK_ID" \
         --agent-id "$AGENT_ID" \
         --deliverables "$DELIVERABLES_JSON"
       ```
    ```

- [ ] `.claude/agents/cfn-dev-team/testers/tester.md` **(HIGH)**
  - **Current:** "Write acceptance tests"
  - **New:** "Align tests with success criteria"
  - **Lines to change:** ~120 lines
  - **New sections:**
    ```markdown
    ## Test Alignment Protocol

    1. **Read Success Criteria**
       - Extract test_suites from criteria
       - Understand acceptance criteria
       - Identify gaps in test coverage

    2. **Write Missing Tests**
       - Fill coverage gaps
       - Add edge case tests
       - Write integration tests

    3. **Validate Test Quality**
       - Tests are deterministic (no flakes)
       - Tests are isolated (no dependencies)
       - Tests are fast (<5s per test)
    ```

- [ ] `.claude/agents/cfn-dev-team/testers/interaction-tester.md`
  - **Similar updates to tester.md**
  - **Lines to change:** ~100 lines

#### Validators (Loop 2)
- [ ] `.claude/agents/cfn-dev-team/reviewers/reviewer.md` **(HIGH)**
  - **Current:** Review code quality
  - **New:** Review code quality + test coverage
  - **Lines to change:** ~100 lines
  - **New sections:**
    ```markdown
    ## Test Coverage Review (NEW)

    1. **Read Test Results from Loop 3**
       ```bash
       TEST_RESULTS=$(redis-cli HGET "swarm:${TASK_ID}:test-results" "output")
       PASS_RATE=$(redis-cli HGET "swarm:${TASK_ID}:test-results" "pass_rate")
       ```

    2. **Validate Test Quality**
       - Are tests meaningful? (not just `expect(true).toBe(true)`)
       - Do tests cover edge cases?
       - Are tests deterministic?
       - Is coverage ≥80%?

    3. **Report Consensus**
       - Factor test quality into consensus score
       - Flag gaps in test coverage
    ```

- [ ] `.claude/agents/cfn-dev-team/testers/contract-tester.md` **(NEW FILE)**
  - **Purpose:** Validate adapter contracts in Loop 2
  - **Lines:** ~300 lines
  - **Responsibilities:**
    ```markdown
    ## Contract Testing Protocol

    Run contract tests against all implementations:

    ```typescript
    describe.each([
      ['Redis', new RedisAdapter()],
      ['SQLite', new SQLiteAdapter()],
      ['Postgres', new PostgresAdapter()]
    ])('%s Adapter Contract', (name, adapter) => {
      it('should support transactionId parameter', async () => {
        const txId = await adapter.beginTransaction();
        await adapter.insert('table', data, txId);
        await adapter.commit(txId);
      });
    });
    ```
    ```

- [ ] `.claude/agents/cfn-dev-team/testers/integration-tester.md` **(NEW FILE)**
  - **Purpose:** Run full integration tests in Loop 2
  - **Lines:** ~350 lines
  - **Responsibilities:**
    ```markdown
    ## Integration Testing Protocol

    1. **Read Success Criteria**
       - Extract integration test suites
       - Set up test environment (databases, services)

    2. **Execute Integration Tests**
       ```bash
       npm run test:integration -- tests/integration.test.ts
       ```

    3. **Validate System Behavior**
       - Cross-component interactions work
       - Database transactions are atomic
       - API endpoints return correct responses

    4. **Report Results**
       - Store integration test results in Redis
       - Report consensus with test pass rate
    ```

#### Product Owner
- [ ] `.claude/agents/cfn-dev-team/product-owners/product-owner.md` **(HIGH)**
  - **Current:** Review deliverables and consensus
  - **New:** Review unit tests + integration tests + deliverables
  - **Lines to change:** ~100 lines
  - **New sections:**
    ```markdown
    ## Test-Driven Decision Protocol (NEW)

    1. **Read Test Results**
       ```bash
       # Loop 3 unit test results
       LOOP3_PASS_RATE=$(redis-cli HGET "swarm:${TASK_ID}:test-results" "pass_rate")

       # Loop 2 integration test results
       LOOP2_TESTS=$(redis-cli HGET "swarm:${TASK_ID}:loop2-test-results" "output")
       ```

    2. **Decision Criteria**
       - PROCEED if:
         - Unit test pass rate ≥ threshold (0.95)
         - Integration tests pass ≥ threshold (0.95)
         - Validator consensus ≥ threshold (0.90)
         - All deliverables exist

       - ITERATE if:
         - Test pass rate < threshold
         - Integration tests reveal bugs
         - Deliverables incomplete

       - ABORT if:
         - Fundamental approach is wrong
         - Requirements are unclear
    ```

#### Specialized Agents
- [ ] `.claude/agents/cfn-dev-team/architecture/base-template-generator.md`
  - **Update:** Generate test templates alongside code templates
  - **Lines to change:** ~80 lines

- [ ] `.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md`
  - **Update:** Include test execution in Docker builds
  - **Lines to change:** ~60 lines

---

### 1.4 Command Files (7 files - HIGH)

#### Slash Commands
- [ ] `.claude/commands/cfn-loop-cli.md` **(CRITICAL)**
  - **Add:** `--success-criteria` parameter
  - **Lines to add:** ~100 lines
  - **New sections:**
    ```markdown
    ## Success Criteria (Optional)

    Provide explicit success criteria (or let coordinator generate):

    ```bash
    /cfn-loop-cli "Implement auth" \
      --success-criteria '{
        "test_suites": [
          {
            "name": "Auth Tests",
            "command": "npm test -- auth.test.ts",
            "required": true,
            "pass_threshold": 0.95
          }
        ]
      }'
    ```

    If not provided, coordinator will auto-generate from task description.
    ```

- [ ] `.claude/commands/cfn-loop-task.md` **(CRITICAL)**
  - **Add:** Success criteria prompt for Main Chat
  - **Lines to add:** ~150 lines
  - **New Step 2:**
    ```markdown
    ## Step 2: Define Success Criteria (Main Chat)

    YOU (Main Chat) must define success criteria before spawning agents.

    ### Option A: Ask User
    Ask user: "What tests should validate this implementation?"

    ### Option B: Generate Default
    ```javascript
    const successCriteria = {
      test_suites: [
        {
          name: "Unit Tests",
          command: "npm run test:unit",
          required: true,
          pass_threshold: 0.95
        }
      ],
      deliverables: inferDeliverables(taskDescription),
      acceptance_criteria: extractAcceptanceCriteria(taskDescription)
    };
    ```
    ```

- [ ] `.claude/commands/cfn-loop-frontend.md`
  - **Add:** Visual testing in success criteria
  - **Lines to add:** ~80 lines

- [ ] `.claude/commands/cfn/write-plan.sh`
  - **Update:** Include success criteria in plan template
  - **Lines to change:** ~50 lines

#### Docker Commands
- [ ] `.claude/commands/cfn-docker/CFN_DOCKER_NATIVE.md`
  - **Add:** Success criteria environment variable documentation
  - **Lines to add:** ~70 lines

- [ ] `.claude/commands/cfn-docker/CFN_DOCKER_CLI.md`
  - **Same as above**
  - **Lines to add:** ~70 lines

#### Documentation
- [ ] `.claude/commands/CFN_COORDINATOR_PARAMETERS.md` **(HIGH)**
  - **Add:** `--success-criteria` parameter specification
  - **Lines to add:** ~150 lines
  - **Schema definition:**
    ```markdown
    ## --success-criteria Parameter

    **Type:** JSON string or file path
    **Required:** No (coordinator can auto-generate)
    **Format:**
    ```json
    {
      "test_suites": [
        {
          "name": "string",
          "command": "string",
          "required": boolean,
          "pass_threshold": 0.0-1.0,
          "description": "string (optional)"
        }
      ],
      "deliverables": ["string"],
      "acceptance_criteria": ["string"]
    }
    ```
    ```

---

### 1.5 Skills Integration Files (10 files - MEDIUM)

#### Redis Coordination
- [ ] `.claude/skills/cfn-redis-coordination/cfn-loop-exec.sh`
  - **Add:** Store test results in Redis
  - **Lines to change:** ~40 lines
  - **New keys:**
    ```bash
    swarm:${TASK_ID}:test-results      # Gate check test results
    swarm:${TASK_ID}:loop2-test-results # Integration test results
    swarm:${TASK_ID}:config:success_criteria # Success criteria JSON
    ```

- [ ] `.claude/skills/cfn-redis-coordination/AGENT_LOGGING.md`
  - **Document:** Test result storage schema
  - **Lines to add:** ~60 lines

- [ ] `.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh`
  - **Add:** Wait for test execution (not just confidence)
  - **Lines to change:** ~30 lines

#### Output Processing
- [ ] `.claude/skills/cfn-loop3-output-processing/process-loop3-output.sh`
  - **Add:** Parse test results from agent output (fallback)
  - **Lines to change:** ~50 lines

- [ ] `.claude/skills/cfn-loop2-output-processing/process-loop2-output.sh`
  - **Update:** Process integration test results
  - **Lines to change:** ~40 lines

#### Product Owner Decision
- [ ] `.claude/skills/cfn-product-owner-decision/execute-decision.sh` **(HIGH)**
  - **Add:** Check test pass rate in decision logic
  - **Lines to change:** ~80 lines
  - **New validation:**
    ```bash
    # Validate test results exist
    TEST_PASS_RATE=$(redis-cli HGET "swarm:${TASK_ID}:test-results" "pass_rate")
    if [[ -z "$TEST_PASS_RATE" ]]; then
      echo "⚠️  WARNING: No test results found"
      echo "   Cannot PROCEED without test validation"
      return 1
    fi

    # Check pass rate meets threshold
    if (( $(echo "$TEST_PASS_RATE < $REQUIRED_PASS_RATE" | bc -l) )); then
      echo "❌ Test pass rate too low: $TEST_PASS_RATE < $REQUIRED_PASS_RATE"
      return 1
    fi
    ```

- [ ] `.claude/skills/cfn-product-owner-decision/validate-deliverables.sh`
  - **Add:** Validate deliverables match success criteria
  - **Lines to change:** ~60 lines

- [ ] `.claude/skills/cfn-product-owner-decision/SKILL.md`
  - **Update:** Document test-driven decision protocol
  - **Lines to change:** ~70 lines

#### Test Runner Integration
- [ ] `.claude/skills/cfn-test-runner/run-all-tests.sh`
  - **Add:** Support for success criteria test suites
  - **Lines to change:** ~40 lines

- [ ] `.claude/skills/cfn-test-runner/validate-redis-keys.sh`
  - **Add:** Validate test result storage
  - **Lines to change:** ~30 lines

---

### 1.6 Docker Files (6 files - MEDIUM)

#### Configuration
- [ ] `docker/runtime/cfn-runtime.contract.yml` **(HIGH)**
  - **Add:** Environment variables
  - **Lines to add:** ~30 lines
  - **New variables:**
    ```yaml
    environment:
      - CFN_GATE_STRATEGY=test-driven  # or: confidence, auto
      - CFN_SUCCESS_CRITERIA=/workspace/.cfn/success-criteria.json
      - CFN_TEST_PASS_RATE_GATE=0.95
      - CFN_TEST_PASS_RATE_CONSENSUS=0.95
    ```

- [ ] `docker/coordinator-entrypoint.sh` **(HIGH)**
  - **Add:** Load success criteria from env or file
  - **Lines to add:** ~80 lines
  - **Logic:**
    ```bash
    # Load success criteria
    if [[ -n "$CFN_SUCCESS_CRITERIA" ]]; then
      if [[ -f "$CFN_SUCCESS_CRITERIA" ]]; then
        SUCCESS_CRITERIA=$(cat "$CFN_SUCCESS_CRITERIA")
      else
        SUCCESS_CRITERIA="$CFN_SUCCESS_CRITERIA"
      fi
    else
      echo "⚠️  No success criteria provided - coordinator will auto-generate"
      SUCCESS_CRITERIA=""
    fi

    # Pass to orchestrator
    export SUCCESS_CRITERIA
    ```

- [ ] `docker/runtime/cfn-runtime.sh`
  - **Add:** Environment validation
  - **Lines to change:** ~40 lines

#### Docker Compose
- [ ] `docker-compose.yml` (if exists)
  - **Add:** Success criteria volume mount
  - **Lines to add:** ~20 lines
  - **Volume:**
    ```yaml
    volumes:
      - ./success-criteria:/workspace/.cfn
    ```

#### Documentation
- [ ] `docker/README.md`
  - **Add:** Test-driven gate documentation
  - **Lines to add:** ~100 lines

- [ ] `docs/DOCKER_CFN_LOOP.md` (if exists)
  - **Update:** Success criteria in Docker mode
  - **Lines to add:** ~80 lines

---

### 1.7 Test Files (15 files - HIGH)

#### E2E Tests
- [ ] `tests/cfn-v3/test-e2e-cfn-loop.sh` **(CRITICAL)**
  - **Update:** Expect test execution in gate check
  - **Lines to change:** ~200 lines
  - **New test cases:**
    ```bash
    test_gate_check_with_tests() {
      # Setup: Create mock test suite
      # Execute: Run orchestrator
      # Verify: Tests were executed
      # Verify: Pass rate calculated correctly
      # Verify: Gate decision based on tests
    }

    test_gate_check_failing_tests() {
      # Setup: Create failing tests
      # Execute: Run orchestrator
      # Verify: Gate FAILS
      # Verify: Iteration context generated
    }
    ```

- [ ] `tests/cfn-v3/test-cfn-v3-orchestrator.sh`
  - **Add:** Test success criteria generation
  - **Lines to add:** ~150 lines

- [ ] `tests/cfn-v3/test-cfn-loop-integration.sh`
  - **Update:** Test full loop with test-driven gate
  - **Lines to change:** ~100 lines

#### Helper Tests
- [ ] `tests/cfn-v3/helpers/test-gate-check.sh` **(CRITICAL)**
  - **Major update:** Test new gate-check.sh logic
  - **Lines to change:** ~300 lines
  - **New test cases:**
    ```bash
    test_jest_output_parsing()
    test_mocha_output_parsing()
    test_pytest_output_parsing()
    test_tap_output_parsing()
    test_pass_rate_calculation()
    test_threshold_validation()
    test_iteration_context_generation()
    test_test_result_storage()
    ```

- [ ] `tests/cfn-v3/test-loop3-handoffs.sh`
  - **Add:** Validate test result passing to Loop 2
  - **Lines to add:** ~100 lines

- [ ] `tests/cfn-v3/test-loop2-handoffs.sh`
  - **Add:** Validate integration test execution
  - **Lines to add:** ~80 lines

#### Docker Tests
- [ ] `tests/docker/core/cfn-loop-compliance-tests.sh` **(HIGH)**
  - **Add:** Test-driven gate validation in Docker
  - **Lines to add:** ~200 lines

- [ ] `tests/docker/core/test-coordinator-orchestrate-params.sh`
  - **Add:** Test success criteria parameter passing
  - **Lines to add:** ~100 lines

- [ ] `tests/docker/hello-world/example-p1-test.sh`
  - **Update:** Use success criteria
  - **Lines to change:** ~60 lines

#### Integration Tests
- [ ] `tests/integration/test-parameter-standardization.sh`
  - **Add:** Test success criteria parameter
  - **Lines to add:** ~80 lines

- [ ] `tests/cfn-v3-orchestration/test-cfn-fallback-mode-comprehensive.sh`
  - **Add:** Test fallback to confidence if no criteria
  - **Lines to add:** ~120 lines

- [ ] `tests/cfn-v3-orchestration/run-full-suite.sh`
  - **Add:** Test-driven gate tests to suite
  - **Lines to add:** ~30 lines

#### New Test Files
- [ ] `tests/cfn-v3/test-success-criteria-generation.sh` **(NEW FILE)**
  - **Purpose:** Test coordinator's criteria generation
  - **Lines:** ~250 lines

- [ ] `tests/cfn-v3/test-test-result-parser.sh` **(NEW FILE)**
  - **Purpose:** Test parse-test-results.sh
  - **Lines:** ~400 lines

- [ ] `tests/integration/test-test-driven-gate-e2e.sh` **(NEW FILE)**
  - **Purpose:** End-to-end test of full workflow
  - **Lines:** ~500 lines

---

### 1.8 Documentation Files (7 files - MEDIUM)

#### Root Documentation
- [ ] `CLAUDE.md` **(CRITICAL)**
  - **Section:** "CFN Loop Overview" (lines 800-850)
  - **Update:** Replace confidence gating with test-driven approach
  - **Lines to change:** ~200 lines
  - **Remove:** All "confidence: 0.85" examples
  - **Add:** Success criteria examples

- [ ] `docs/DATABASE_QUERY_ABSTRACTION.md`
  - **Add:** Success criteria example for database work
  - **Lines to add:** ~50 lines

#### Guides
- [ ] `docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md` **(NEW FILE)**
  - **Purpose:** User-facing guide
  - **Lines:** ~800 lines
  - **Sections:**
    - Introduction to test-driven gates
    - Success criteria schema
    - Writing test suites
    - Mode-specific examples
    - Troubleshooting

- [ ] `docs/guides/SUCCESS_CRITERIA_EXAMPLES.md` **(NEW FILE)**
  - **Purpose:** Common success criteria patterns
  - **Lines:** ~600 lines
  - **Examples:**
    - REST API implementation
    - Database adapter
    - Security module
    - Frontend component
    - Documentation task

#### Architecture
- [ ] `docs/architecture/CFN_LOOP_TEST_DRIVEN_ARCHITECTURE.md` **(NEW FILE)**
  - **Purpose:** Technical architecture document
  - **Lines:** ~700 lines
  - **Sections:**
    - Data flow diagrams
    - Handoff points
    - Redis schema
    - Test result format

#### Migration
- [ ] `docs/migration/CONFIDENCE_TO_TEST_DRIVEN_MIGRATION.md` **(NEW FILE)**
  - **Purpose:** Migration guide for existing users
  - **Lines:** ~400 lines

- [ ] `docs/OPTIMIZATION_METRICS_COMPARATIVE_ANALYSIS.md`
  - **Update:** Add test-driven metrics
  - **Lines to add:** ~100 lines

---

## Summary: File Count by Priority

| Priority | Category | Files | Est. Lines |
|----------|----------|-------|------------|
| **CRITICAL** | Core orchestration, commands, agents | 12 | ~4,500 |
| **HIGH** | Spawning, validation, tests | 28 | ~8,000 |
| **MEDIUM** | Skills, docs, Docker | 24 | ~5,500 |
| **LOW** | Optional enhancements | 10 | ~2,000 |
| **TOTAL** | **All files** | **74** | **~20,000** |

---

## 2. Success Criteria Schema

### 2.1 Complete JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["test_suites"],
  "properties": {
    "test_suites": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["name", "command", "required", "pass_threshold"],
        "properties": {
          "name": {
            "type": "string",
            "description": "Human-readable name for this test suite",
            "minLength": 1,
            "maxLength": 100
          },
          "command": {
            "type": "string",
            "description": "Shell command to execute tests",
            "minLength": 1,
            "pattern": "^[^;|&><]+$",
            "examples": [
              "npm run test:unit -- tests/auth.test.ts",
              "pytest tests/test_auth.py",
              "go test ./pkg/auth/..."
            ]
          },
          "required": {
            "type": "boolean",
            "description": "If true, gate fails immediately if suite fails"
          },
          "pass_threshold": {
            "type": "number",
            "description": "Minimum pass rate (0.0-1.0) for this suite",
            "minimum": 0.0,
            "maximum": 1.0
          },
          "description": {
            "type": "string",
            "description": "What this test suite validates (optional)",
            "maxLength": 500
          },
          "timeout": {
            "type": "integer",
            "description": "Test execution timeout in seconds (optional)",
            "minimum": 1,
            "maximum": 3600,
            "default": 300
          },
          "retry_count": {
            "type": "integer",
            "description": "Number of retries for flaky tests (optional)",
            "minimum": 0,
            "maximum": 3,
            "default": 1
          }
        }
      }
    },
    "deliverables": {
      "type": "array",
      "description": "Expected files to be created",
      "items": {
        "type": "string",
        "pattern": "^[a-zA-Z0-9_\\-./]+$"
      }
    },
    "acceptance_criteria": {
      "type": "array",
      "description": "Plain English requirements",
      "items": {
        "type": "string",
        "minLength": 1,
        "maxLength": 500
      }
    },
    "gate_mode": {
      "type": "string",
      "enum": ["test-driven", "confidence", "hybrid"],
      "default": "test-driven",
      "description": "Gate check strategy"
    },
    "metadata": {
      "type": "object",
      "description": "Optional metadata",
      "properties": {
        "created_by": {"type": "string"},
        "created_at": {"type": "string", "format": "date-time"},
        "task_id": {"type": "string"},
        "mode": {"type": "string", "enum": ["mvp", "standard", "enterprise"]}
      }
    }
  }
}
```

### 2.2 Validation Rules

**Schema Validation:**
```bash
# In gate-check.sh
validate_success_criteria() {
    local CRITERIA_JSON="$1"

    # Check JSON is valid
    if ! echo "$CRITERIA_JSON" | jq empty 2>/dev/null; then
        echo "❌ Invalid JSON in success criteria"
        return 1
    fi

    # Check required fields
    if ! echo "$CRITERIA_JSON" | jq -e '.test_suites' >/dev/null; then
        echo "❌ Missing required field: test_suites"
        return 1
    fi

    # Validate test suite structure
    local SUITE_COUNT=$(echo "$CRITERIA_JSON" | jq '.test_suites | length')
    if [[ $SUITE_COUNT -eq 0 ]]; then
        echo "❌ At least one test suite required"
        return 1
    fi

    # Validate each test suite
    for i in $(seq 0 $((SUITE_COUNT - 1))); do
        local SUITE=$(echo "$CRITERIA_JSON" | jq ".test_suites[$i]")

        # Check required fields
        for field in name command required pass_threshold; do
            if ! echo "$SUITE" | jq -e ".$field" >/dev/null; then
                echo "❌ Test suite $i missing field: $field"
                return 1
            fi
        done

        # Validate pass_threshold range
        local THRESHOLD=$(echo "$SUITE" | jq -r '.pass_threshold')
        if (( $(echo "$THRESHOLD < 0.0 || $THRESHOLD > 1.0" | bc -l) )); then
            echo "❌ Invalid pass_threshold: $THRESHOLD (must be 0.0-1.0)"
            return 1
        fi

        # Validate command safety (no shell injection)
        local COMMAND=$(echo "$SUITE" | jq -r '.command')
        if [[ "$COMMAND" =~ [';|&><'] ]]; then
            echo "❌ Unsafe characters in command: $COMMAND"
            return 1
        fi
    done

    echo "✅ Success criteria validated"
    return 0
}
```

### 2.3 Mode-Specific Defaults

```bash
# In cfn-v3-coordinator.md
generate_default_success_criteria() {
    local TASK_DESC="$1"
    local MODE="$2"

    # Mode-specific thresholds
    case "$MODE" in
        mvp)
            GATE_THRESHOLD=0.80
            CONSENSUS_THRESHOLD=0.80
            ;;
        standard)
            GATE_THRESHOLD=0.95
            CONSENSUS_THRESHOLD=0.95
            ;;
        enterprise)
            GATE_THRESHOLD=0.99
            CONSENSUS_THRESHOLD=0.99
            ;;
    esac

    # Generate based on task keywords
    if [[ "$TASK_DESC" =~ (auth|security|crypto) ]]; then
        # Security-critical: Require 100% pass rate
        GATE_THRESHOLD=1.0
        TEST_SUITES='[
            {
                "name": "Security Tests",
                "command": "npm run test:security",
                "required": true,
                "pass_threshold": 1.0
            }
        ]'
    elif [[ "$TASK_DESC" =~ (API|REST|endpoint) ]]; then
        # API work: Unit + integration tests
        TEST_SUITES='[
            {
                "name": "Unit Tests",
                "command": "npm run test:unit",
                "required": true,
                "pass_threshold": '$GATE_THRESHOLD'
            },
            {
                "name": "Integration Tests",
                "command": "npm run test:integration",
                "required": true,
                "pass_threshold": '$GATE_THRESHOLD'
            }
        ]'
    else
        # Default: Unit tests only
        TEST_SUITES='[
            {
                "name": "Unit Tests",
                "command": "npm run test:unit",
                "required": true,
                "pass_threshold": '$GATE_THRESHOLD'
            }
        ]'
    fi

    cat <<EOF
{
    "test_suites": $TEST_SUITES,
    "deliverables": [],
    "acceptance_criteria": [],
    "gate_mode": "test-driven",
    "metadata": {
        "created_by": "cfn-v3-coordinator",
        "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
        "mode": "$MODE"
    }
}
EOF
}
```

---

## 3. Data Flow and Handoff Points

### 3.1 Task Mode Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                          TASK MODE                               │
│                    (Main Chat Coordinates)                       │
└─────────────────────────────────────────────────────────────────┘

1. User executes /cfn-loop-task "Implement feature"
   │
   ├──> SlashCommand expands .claude/commands/cfn-loop-task.md
   │
   └──> Main Chat reads expanded content

2. Main Chat defines success criteria
   │
   ├──> Option A: Ask user for test requirements
   │    "What tests should validate this implementation?"
   │
   └──> Option B: Generate default criteria
        generateDefaultCriteria(taskDescription, mode)

3. Main Chat spawns Loop 3 agents via Task()
   │
   ├──> Task("backend-developer", prompt + successCriteria)
   ├──> Task("tester", prompt + successCriteria)
   │
   └──> Agents read criteria from prompt context

4. Loop 3 agents complete work
   │
   ├──> backend-developer: Writes code + unit tests
   ├──> tester: Writes integration tests
   │
   └──> Agents return output to Main Chat

5. Main Chat executes gate check (NEW)
   │
   ├──> Main Chat runs: npm test (via Bash tool)
   ├──> Parse test output
   ├──> Calculate pass rate
   │
   └──> Decision: pass_rate >= 0.95?

6. IF gate PASSES:
   │
   ├──> Main Chat spawns Loop 2 validators
   ├──> Task("code-reviewer", ...)
   ├──> Task("contract-tester", ...)  # NEW
   └──> Task("integration-tester", ...) # NEW

7. Loop 2 validators complete
   │
   ├──> Read test results from Step 5
   ├──> Review code quality
   ├──> Run integration tests
   │
   └──> Return consensus to Main Chat

8. Main Chat spawns Product Owner
   │
   └──> Task("product-owner", {
          loop3TestResults,
          loop2Consensus,
          deliverables
        })

9. Product Owner decides
   │
   ├──> Check: unit test pass rate >= 0.95?
   ├──> Check: integration tests pass?
   ├──> Check: validator consensus >= 0.90?
   │
   └──> Decision: PROCEED | ITERATE | ABORT

10. IF ITERATE:
    │
    └──> Main Chat spawns fresh Loop 3 agents with test failures
         "Previous iteration failed these tests: [list]"
```

**Handoff Points in Task Mode:**

| Step | From | To | Data | Method |
|------|------|-----|------|--------|
| 2→3 | Main Chat | Loop 3 agents | Success criteria | Task() prompt parameter |
| 4→5 | Loop 3 agents | Main Chat | Implementation + tests | Task() return value |
| 5→6 | Main Chat | Loop 2 agents | Test results + code | Task() prompt parameter |
| 7→8 | Loop 2 agents | Main Chat | Consensus | Task() return value |
| 8→9 | Main Chat | Product Owner | All results | Task() prompt parameter |
| 9→10 | Product Owner | Main Chat | Decision | Task() return value |

---

### 3.2 CLI Mode Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                           CLI MODE                               │
│                   (Coordinator Coordinates)                      │
└─────────────────────────────────────────────────────────────────┘

1. User executes /cfn-loop-cli "Implement feature" --mode=standard
   │
   ├──> SlashCommand expands .claude/commands/cfn-loop-cli.md
   │
   └──> Main Chat executes coordinator spawn (auto)

2. Main Chat spawns cfn-v3-coordinator (via Bash)
   │
   └──> npx claude-flow-novice agent cfn-v3-coordinator \
          --task-id "$TASK_ID" \
          --context "TASK_DESCRIPTION='...' MODE='standard'" \
          --background=true

3. Coordinator generates success criteria
   │
   ├──> Analyze task description
   ├──> Extract test requirements
   ├──> Generate success_criteria JSON
   │
   └──> Store in Redis:
        redis-cli HSET "swarm:${TASK_ID}:config" \
          "success_criteria" "$SUCCESS_CRITERIA_JSON"

4. Coordinator spawns Loop 3 agents (via CLI)
   │
   ├──> npx claude-flow-novice agent backend-developer \
   │      --task-id "$TASK_ID" --background=true
   │
   └──> Agents read criteria from Redis:
        redis-cli HGET "swarm:${TASK_ID}:config" success_criteria

5. Loop 3 agents complete work
   │
   ├──> Write code + tests
   ├──> Signal completion via Redis:
        redis-cli HSET "swarm:${TASK_ID}:${AGENT_ID}" \
          "status" "complete"
   │
   └──> Coordinator detects completion

6. Coordinator executes gate check (via orchestrate.sh)
   │
   ├──> orchestrate.sh calls helpers/gate-check.sh
   │
   └──> gate-check.sh:
        ├──> Read success criteria from Redis
        ├──> Execute test suites (npm test, pytest, etc.)
        ├──> Parse results (helpers/parse-test-results.sh)
        ├──> Calculate pass rate
        ├──> Store results in Redis:
             redis-cli HSET "swarm:${TASK_ID}:test-results" \
               "pass_rate" "0.95" \
               "total_tests" "20" \
               "passed_tests" "19" \
               "failed_tests" "1" \
               "output" "$TEST_OUTPUT"
        │
        └──> Return: exit 0 (pass) or exit 1 (fail)

7. IF gate PASSES:
   │
   ├──> orchestrate.sh spawns Loop 2 validators (via CLI)
   │
   ├──> npx claude-flow-novice agent code-reviewer ...
   ├──> npx claude-flow-novice agent contract-tester ...
   └──> npx claude-flow-novice agent integration-tester ...

8. Loop 2 validators complete
   │
   ├──> Read test results from Redis:
   │    redis-cli HGET "swarm:${TASK_ID}:test-results" ...
   │
   ├──> Run additional integration tests
   ├──> Store integration test results:
        redis-cli HSET "swarm:${TASK_ID}:loop2-test-results" ...
   │
   └──> Signal completion with consensus

9. Coordinator spawns Product Owner (via CLI)
   │
   └──> npx claude-flow-novice agent product-owner ...

10. Product Owner executes decision
    │
    ├──> Read all test results from Redis
    ├──> Validate deliverables
    ├──> Make decision: PROCEED | ITERATE | ABORT
    │
    └──> Store decision in Redis:
         redis-cli HSET "swarm:${TASK_ID}:decision" \
           "action" "PROCEED"

11. Coordinator reads decision and acts
    │
    ├──> IF PROCEED: Exit successfully
    ├──> IF ITERATE: Generate iteration context, spawn fresh Loop 3
    └──> IF ABORT: Exit with error

12. Coordinator reports to Main Chat (via stdout/Redis)
    │
    └──> Main Chat monitors progress via Redis keys
```

**Handoff Points in CLI Mode:**

| Step | From | To | Data | Method |
|------|------|-----|------|--------|
| 2→3 | Main Chat | Coordinator | Task description | CLI args |
| 3→4 | Coordinator | Redis | Success criteria | Redis HSET |
| 4→5 | Redis | Loop 3 agents | Success criteria | Redis HGET |
| 5→6 | Loop 3 agents | Redis | Completion signal | Redis HSET |
| 6→7 | orchestrate.sh | Redis | Test results | Redis HSET |
| 7→8 | Redis | Loop 2 agents | Test results | Redis HGET |
| 8→9 | Loop 2 agents | Redis | Consensus + integration tests | Redis HSET |
| 9→10 | Redis | Product Owner | All results | Redis HGET |
| 10→11 | Product Owner | Redis | Decision | Redis HSET |
| 11→12 | Coordinator | Main Chat | Final status | stdout/Redis |

---

### 3.3 Redis Schema (Complete)

```bash
# Task configuration
swarm:${TASK_ID}:config
  ├─ success_criteria: JSON        # Success criteria definition
  ├─ mode: string                  # mvp|standard|enterprise
  ├─ max_iterations: number
  └─ gate_strategy: string         # test-driven|confidence|auto

# Loop 3 test results (from gate check)
swarm:${TASK_ID}:test-results
  ├─ pass_rate: number             # 0.0-1.0
  ├─ total_tests: number
  ├─ passed_tests: number
  ├─ failed_tests: number
  ├─ output: string                # Full test output
  ├─ timestamp: string
  └─ executor: string              # gate-check.sh

# Loop 2 integration test results
swarm:${TASK_ID}:loop2-test-results
  ├─ contract_tests_passed: boolean
  ├─ integration_tests_passed: boolean
  ├─ contract_test_output: string
  ├─ integration_test_output: string
  └─ timestamp: string

# Agent status (per agent)
swarm:${TASK_ID}:${AGENT_ID}
  ├─ status: string                # spawned|running|complete|failed
  ├─ type: string                  # backend-developer, tester, etc.
  ├─ spawned_at: timestamp
  ├─ completed_at: timestamp
  ├─ deliverables: JSON array
  └─ metadata: JSON

# Product Owner decision
swarm:${TASK_ID}:decision
  ├─ action: string                # PROCEED|ITERATE|ABORT
  ├─ reasoning: string
  ├─ unit_test_pass_rate: number
  ├─ integration_tests_passed: boolean
  ├─ validator_consensus: number
  ├─ deliverables_verified: boolean
  └─ timestamp: string

# Iteration context (for ITERATE decision)
swarm:${TASK_ID}:iteration:${N}
  ├─ failed_tests: JSON array      # List of failed test names
  ├─ test_output: string           # Failed test output
  ├─ feedback: string              # Guidance for next iteration
  └─ previous_iteration: number
```

---

### 3.4 File System Data Flow

```
Project Root
│
├─ .cfn/
│  ├─ success-criteria.json       # [Docker Mode] Success criteria
│  └─ task-${TASK_ID}/
│     ├─ test-results.json        # Gate check results
│     ├─ loop2-results.json       # Integration test results
│     └─ iteration-${N}.json      # Iteration context
│
├─ tests/
│  ├─ unit/                       # Unit tests (Loop 3 requirement)
│  ├─ integration/                # Integration tests (Loop 2 requirement)
│  └─ contract/                   # Contract tests (Loop 2 requirement)
│
└─ src/
   └─ implementation files        # Deliverables
```

**File Handoffs:**

1. **Docker Mode**: `docker-compose.yml` mounts `.cfn/` volume
2. **Gate Check**: Writes test results to `.cfn/task-${TASK_ID}/test-results.json`
3. **Integration Tester**: Writes results to `.cfn/task-${TASK_ID}/loop2-results.json`
4. **Product Owner**: Reads all JSON files from `.cfn/task-${TASK_ID}/`

---

## 4. Phase-by-Phase Implementation

### Phase 1: Foundation (Week 1) - CRITICAL

**Goal:** Build core test-driven gate infrastructure
**Success Criteria:** Gate check executes tests, hybrid mode works

#### Files to Update (Priority Order):

1. **Create parse-test-results.sh** (NEW FILE)
   - Location: `.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh`
   - Lines: ~300
   - Test coverage: 95%+
   - Frameworks: Jest, Mocha, pytest, TAP, JUnit

2. **Update gate-check.sh** (MAJOR REFACTOR)
   - Location: `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh`
   - Current: 91 lines (confidence-based)
   - New: ~250 lines (test-driven + hybrid)
   - Backward compatible: Yes (hybrid mode)

3. **Update orchestrate.sh** (CRITICAL)
   - Location: `.claude/skills/cfn-loop-orchestration/orchestrate.sh`
   - Lines to change: ~150 (gate check section)
   - Functions:
     ```bash
     # OLD
     collect_loop3_confidence() { ... }

     # NEW
     execute_gate_check() {
       if [[ "$CFN_GATE_STRATEGY" == "test-driven" ]]; then
         "$HELPERS_DIR/gate-check.sh" \
           --task-id "$TASK_ID" \
           --mode "$MODE" \
           --success-criteria "$SUCCESS_CRITERIA"
       else
         # Fallback to confidence
         collect_loop3_confidence
       fi
     }
     ```

4. **Create test-gate-check.sh** (NEW FILE)
   - Location: `tests/cfn-v3/helpers/test-gate-check.sh`
   - Lines: ~500
   - Test all parsers, all thresholds

5. **Update cfn-runtime.contract.yml**
   - Location: `docker/runtime/cfn-runtime.contract.yml`
   - Add environment variables:
     ```yaml
     - CFN_GATE_STRATEGY=test-driven
     - CFN_TEST_PASS_RATE_GATE=0.95
     ```

#### Testing Requirements:

```bash
# Unit tests
bash tests/cfn-v3/helpers/test-gate-check.sh

# Expected output:
# ✅ test_jest_parsing: PASS
# ✅ test_mocha_parsing: PASS
# ✅ test_pytest_parsing: PASS
# ✅ test_pass_rate_calculation: PASS
# ✅ test_threshold_validation: PASS
# ✅ test_hybrid_mode_fallback: PASS
#
# 25/25 tests passed (100%)
```

#### Deliverables:

- [ ] parse-test-results.sh (supports 5+ frameworks)
- [ ] gate-check.sh (test-driven + hybrid mode)
- [ ] orchestrate.sh (calls new gate check)
- [ ] test-gate-check.sh (95%+ coverage)
- [ ] Documentation updates (SKILL.md files)

#### Success Criteria:

```json
{
  "test_suites": [
    {
      "name": "Gate Check Unit Tests",
      "command": "bash tests/cfn-v3/helpers/test-gate-check.sh",
      "required": true,
      "pass_threshold": 0.95
    },
    {
      "name": "Orchestrator Integration Tests",
      "command": "bash tests/cfn-v3/test-cfn-v3-orchestrator.sh",
      "required": true,
      "pass_threshold": 0.90
    }
  ],
  "deliverables": [
    ".claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh",
    ".claude/skills/cfn-loop-orchestration/helpers/gate-check.sh",
    "tests/cfn-v3/helpers/test-gate-check.sh"
  ],
  "acceptance_criteria": [
    "Gate check can execute npm test and parse results",
    "Pass rate calculated correctly for Jest/Mocha/pytest",
    "Hybrid mode falls back to confidence if no criteria",
    "All tests pass with 95%+ coverage"
  ]
}
```

---

### Phase 2: Task Mode Integration (Week 2) - HIGH

**Goal:** Enable test-driven gate in Task Mode
**Success Criteria:** Main Chat can run TDD-based CFN Loop

#### Files to Update:

1. **Update cfn-loop-task.md** (CRITICAL)
   - Location: `.claude/commands/cfn-loop-task.md`
   - Add Step 2: Define Success Criteria
   - Lines to add: ~150

2. **Create success criteria prompt**
   - In cfn-loop-task.md workflow:
     ```markdown
     ## Step 2: Define Success Criteria (REQUIRED)

     Ask user OR generate default:

     ### Option A: Ask User
     "What tests should validate this implementation?
     - Unit tests? (npm test)
     - Integration tests?
     - Other?"

     ### Option B: Generate Default
     ```javascript
     const criteria = {
       test_suites: [{
         name: "Unit Tests",
         command: "npm run test:unit",
         required: true,
         pass_threshold: 0.95
       }]
     };
     ```
     ```

3. **Update backend-developer.md** (CRITICAL)
   - Location: `.claude/agents/cfn-dev-team/developers/backend-developer.md`
   - Add TDD protocol section
   - Lines to add: ~150

4. **Update tester.md**
   - Location: `.claude/agents/cfn-dev-team/testers/tester.md`
   - Add test alignment section
   - Lines to add: ~120

5. **Update reviewer.md**
   - Location: `.claude/agents/cfn-dev-team/reviewers/reviewer.md`
   - Add test coverage review section
   - Lines to add: ~100

#### Testing Requirements:

```bash
# Manual test (Task Mode)
/cfn-loop-task "Implement simple calculator" \
  --mode=standard

# Expected workflow:
# 1. Main Chat asks: "What tests should validate this?"
# 2. User provides or Main Chat generates criteria
# 3. Main Chat spawns backend-developer + tester
# 4. Agents write code + tests
# 5. Main Chat runs: npm test
# 6. Pass rate: 19/20 = 0.95 >= 0.95 ✅
# 7. Main Chat spawns Loop 2
# 8. Product Owner: PROCEED
```

#### Deliverables:

- [ ] cfn-loop-task.md (with success criteria prompt)
- [ ] backend-developer.md (TDD protocol)
- [ ] tester.md (test alignment)
- [ ] reviewer.md (test coverage review)
- [ ] Example task with full workflow

#### Success Criteria:

```json
{
  "test_suites": [
    {
      "name": "Task Mode E2E Test",
      "command": "bash tests/integration/test-task-mode-tdd.sh",
      "required": true,
      "pass_threshold": 1.0
    }
  ],
  "acceptance_criteria": [
    "Main Chat can define success criteria",
    "Backend developer receives and uses criteria",
    "Gate check runs tests automatically in Task Mode",
    "Full workflow completes successfully"
  ]
}
```

---

### Phase 3: CLI Mode Integration (Week 3) - HIGH

**Goal:** Enable test-driven gate in CLI Mode
**Success Criteria:** Coordinator auto-generates criteria, full CLI workflow works

#### Files to Update:

1. **Update cfn-v3-coordinator.md** (CRITICAL)
   - Location: `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`
   - Add success criteria generation section
   - Lines to add: ~200

2. **Update cfn-loop-cli.md**
   - Location: `.claude/commands/cfn-loop-cli.md`
   - Add --success-criteria parameter
   - Lines to add: ~100

3. **Update spawn-agent.sh**
   - Location: `.claude/skills/cfn-agent-spawning/spawn-agent.sh`
   - Pass success criteria via environment
   - Lines to change: ~50

4. **Update cfn-redis-coordination scripts**
   - Store success criteria in Redis
   - Store test results in Redis
   - Lines to change: ~60

#### Testing Requirements:

```bash
# Automated CLI Mode test
/cfn-loop-cli "Implement JWT authentication" --mode=standard

# Expected workflow:
# 1. Main Chat spawns coordinator (background)
# 2. Coordinator analyzes "JWT authentication"
# 3. Coordinator generates success criteria:
#    - Unit tests for JWT generation/validation
#    - Integration tests for auth flow
# 4. Coordinator stores criteria in Redis
# 5. Coordinator spawns Loop 3 agents (CLI)
# 6. Agents read criteria from Redis
# 7. Agents write code + tests
# 8. orchestrate.sh executes gate check
# 9. gate-check.sh runs tests: npm test
# 10. Pass rate: 0.95 ✅
# 11. Coordinator spawns Loop 2
# 12. Product Owner: PROCEED
```

#### Deliverables:

- [ ] cfn-v3-coordinator.md (criteria generation)
- [ ] cfn-loop-cli.md (parameter documentation)
- [ ] spawn-agent.sh (criteria passing)
- [ ] Redis coordination updates
- [ ] E2E test for CLI mode

#### Success Criteria:

```json
{
  "test_suites": [
    {
      "name": "CLI Mode E2E Test",
      "command": "bash tests/integration/test-cli-mode-tdd.sh",
      "required": true,
      "pass_threshold": 1.0
    },
    {
      "name": "Coordinator Criteria Generation Test",
      "command": "bash tests/cfn-v3/test-success-criteria-generation.sh",
      "required": true,
      "pass_threshold": 0.95
    }
  ],
  "acceptance_criteria": [
    "Coordinator auto-generates success criteria from task",
    "Criteria stored in Redis correctly",
    "All CLI agents receive criteria",
    "Full CLI workflow completes with test-driven gate"
  ]
}
```

---

### Phase 4: Docker Mode Integration (Week 4) - MEDIUM

**Goal:** Enable test-driven gate in Docker Mode
**Success Criteria:** Success criteria passed via Docker env, tests run in containers

#### Files to Update:

1. **Update coordinator-entrypoint.sh**
   - Location: `docker/coordinator-entrypoint.sh`
   - Load criteria from env/file
   - Lines to add: ~80

2. **Update docker-compose.yml** (if exists)
   - Mount success criteria volume
   - Add environment variables

3. **Update docker orchestrate.sh**
   - Location: `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh`
   - Same changes as CLI orchestrator
   - Lines to change: ~160

4. **Update cfn-docker-v3-coordinator.md**
   - Same as cfn-v3-coordinator
   - Additional Docker-specific logic

#### Testing Requirements:

```bash
# Docker Mode test
docker-compose up cfn-coordinator

# Expected:
# 1. Container starts
# 2. Reads success-criteria.json from volume
# 3. Executes CFN Loop with test-driven gate
# 4. Tests run inside container
# 5. Results stored in Redis (accessible outside container)
```

#### Deliverables:

- [ ] coordinator-entrypoint.sh (criteria loading)
- [ ] docker-compose.yml (volume mounts)
- [ ] docker orchestrate.sh (updated)
- [ ] Docker E2E test

#### Success Criteria:

```json
{
  "test_suites": [
    {
      "name": "Docker Mode E2E Test",
      "command": "bash tests/docker/core/test-docker-mode-tdd.sh",
      "required": true,
      "pass_threshold": 1.0
    }
  ]
}
```

---

### Phase 5: Enhanced Loop 2 Validation (Week 5) - MEDIUM

**Goal:** Add contract and integration testing to Loop 2
**Success Criteria:** Loop 2 runs integration tests, catches architectural bugs

#### Files to Update:

1. **Create contract-tester.md** (NEW FILE)
   - Location: `.claude/agents/cfn-dev-team/testers/contract-tester.md`
   - Lines: ~300

2. **Create integration-tester.md** (NEW FILE)
   - Location: `.claude/agents/cfn-dev-team/testers/integration-tester.md`
   - Lines: ~350

3. **Update orchestrate.sh**
   - Spawn contract-tester and integration-tester in Loop 2
   - Lines to add: ~40

4. **Update product-owner.md**
   - Read integration test results
   - Factor into decision
   - Lines to change: ~100

#### Testing Requirements:

```bash
# Test with our database adapter example
/cfn-loop-task "Implement PostgreSQL transaction routing" --mode=standard

# Expected Loop 2 behavior:
# 1. code-reviewer: Reviews code quality
# 2. contract-tester: Runs adapter contract tests
#    ✅ All adapters support transactionId parameter
# 3. integration-tester: Runs integration tests
#    ✅ Rollback actually prevents persistence
#    ❌ WOULD HAVE CAUGHT: Transaction routing bug
# 4. Consensus: Only if all tests pass
```

#### Deliverables:

- [ ] contract-tester.md agent profile
- [ ] integration-tester.md agent profile
- [ ] orchestrate.sh (spawn new validators)
- [ ] Integration test examples

#### Success Criteria:

```json
{
  "test_suites": [
    {
      "name": "Loop 2 Integration Test",
      "command": "bash tests/cfn-v3/test-loop2-integration-tests.sh",
      "required": true,
      "pass_threshold": 1.0
    }
  ],
  "acceptance_criteria": [
    "Contract tester validates adapter contracts",
    "Integration tester runs full integration tests",
    "Product Owner factors integration results into decision",
    "Architectural bugs caught (like transaction routing)"
  ]
}
```

---

### Phase 6: Documentation & Migration (Week 6) - MEDIUM

**Goal:** Complete documentation, migration guide
**Success Criteria:** Users can migrate existing tasks to test-driven gate

#### Files to Create/Update:

1. **Create TEST_DRIVEN_CFN_LOOP_GUIDE.md** (NEW)
   - Location: `docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md`
   - Lines: ~800

2. **Create SUCCESS_CRITERIA_EXAMPLES.md** (NEW)
   - Location: `docs/guides/SUCCESS_CRITERIA_EXAMPLES.md`
   - Lines: ~600

3. **Create CONFIDENCE_TO_TEST_DRIVEN_MIGRATION.md** (NEW)
   - Location: `docs/migration/CONFIDENCE_TO_TEST_DRIVEN_MIGRATION.md`
   - Lines: ~400

4. **Update CLAUDE.md** (CRITICAL)
   - Replace confidence examples with test-driven
   - Lines to change: ~200

5. **Update all agent SKILL.md files**
   - Remove confidence references
   - Add test-driven examples

#### Deliverables:

- [ ] Complete user guide
- [ ] Migration guide
- [ ] Example library (20+ examples)
- [ ] Updated CLAUDE.md

---

### Phase 7: Production Rollout (Week 7) - HIGH

**Goal:** Default to test-driven, deprecate confidence
**Success Criteria:** 80%+ of CFN Loops use test-driven gate

#### Tasks:

1. **Change default CFN_GATE_STRATEGY**
   - Set to "test-driven"
   - Add deprecation warnings for confidence mode

2. **Add telemetry**
   - Track adoption rate
   - Track accuracy (test pass rate vs actual correctness)

3. **Migration assistance**
   - Convert existing tasks
   - Provide examples

4. **Final validation**
   - Run full test suite
   - Verify all modes work
   - Performance testing

#### Success Criteria:

```json
{
  "test_suites": [
    {
      "name": "Full Test Suite",
      "command": "bash tests/cfn-v3-orchestration/run-full-suite.sh",
      "required": true,
      "pass_threshold": 0.95
    }
  ],
  "acceptance_criteria": [
    "All 74 files updated and tested",
    "All tests pass (95%+)",
    "Documentation complete",
    "Migration guide available",
    "Default: test-driven gate",
    "Confidence mode requires opt-in"
  ]
}
```

---

## 5. Test Coverage Requirements

### 5.1 Unit Test Coverage

**Target:** 95%+ line coverage, 90%+ branch coverage

#### Critical Files (100% coverage required):

- `.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh`
- `.claude/skills/cfn-loop-orchestration/helpers/parse-test-results.sh`
- `.claude/skills/cfn-product-owner-decision/execute-decision.sh`

#### Test Files Required:

```bash
# Parser tests
tests/cfn-v3/helpers/test-parse-test-results.sh
  ├─ test_parse_jest_output
  ├─ test_parse_mocha_output
  ├─ test_parse_pytest_output
  ├─ test_parse_tap_output
  ├─ test_parse_junit_xml
  ├─ test_extract_pass_count
  ├─ test_extract_fail_count
  └─ test_extract_total_count

# Gate check tests
tests/cfn-v3/helpers/test-gate-check.sh
  ├─ test_gate_check_test_driven
  ├─ test_execute_test_suite
  ├─ test_calculate_pass_rate
  ├─ test_threshold_validation
  ├─ test_iteration_context_generation
  ├─ test_hybrid_mode_fallback
  ├─ test_required_suite_failure
  └─ test_test_result_storage

# Orchestrator tests
tests/cfn-v3/test-cfn-v3-orchestrator.sh
  ├─ test_orchestrator_with_success_criteria
  ├─ test_orchestrator_test_driven_gate
  ├─ test_orchestrator_iteration_on_test_failure
  └─ test_orchestrator_proceeds_on_test_pass
```

### 5.2 Integration Test Coverage

**Target:** 90%+ scenario coverage

#### Integration Tests Required:

```bash
# E2E workflow tests
tests/integration/test-test-driven-gate-e2e.sh
  ├─ test_full_task_mode_workflow
  ├─ test_full_cli_mode_workflow
  ├─ test_full_docker_mode_workflow
  ├─ test_iteration_with_test_failures
  ├─ test_proceed_with_test_success
  └─ test_abort_on_fundamental_failure

# Cross-component tests
tests/integration/test-redis-test-results-storage.sh
  ├─ test_store_test_results
  ├─ test_retrieve_test_results
  ├─ test_loop2_reads_loop3_results
  └─ test_product_owner_reads_all_results

# Mode switching tests
tests/integration/test-gate-strategy-switching.sh
  ├─ test_switch_test_driven_to_confidence
  ├─ test_switch_confidence_to_test_driven
  ├─ test_auto_detect_strategy
  └─ test_hybrid_mode_fallback
```

### 5.3 Coverage Validation

**Automated coverage check:**

```bash
#!/bin/bash
# tests/validate-coverage.sh

echo "Running coverage validation..."

# Run all tests with coverage
bash tests/cfn-v3-orchestration/run-full-suite.sh --coverage

# Extract coverage percentage
COVERAGE=$(grep -oP 'Coverage: \K[0-9]+' coverage-report.txt)

# Validate threshold
if [[ $COVERAGE -lt 95 ]]; then
  echo "❌ Coverage too low: $COVERAGE% < 95%"
  exit 1
fi

echo "✅ Coverage: $COVERAGE% >= 95%"
exit 0
```

---

## 6. Integration and Validation Scripts

### 6.1 Pre-Integration Validation

```bash
#!/bin/bash
# scripts/validate-before-integration.sh

set -euo pipefail

echo "Pre-Integration Validation Checklist"
echo "====================================="

# 1. JSON Schema Validation
echo "1. Validating success criteria schema..."
node scripts/validate-schema.js \
  schemas/success-criteria.schema.json \
  examples/success-criteria/*.json

# 2. Shell Script Syntax
echo "2. Validating shell script syntax..."
find .claude/skills -name "*.sh" -exec bash -n {} \;

# 3. Agent Profile Validation
echo "3. Validating agent profiles..."
node scripts/validate-agent-profiles.js

# 4. Test Execution (Dry Run)
echo "4. Running test suite..."
bash tests/cfn-v3-orchestration/run-full-suite.sh --dry-run

# 5. Documentation Links
echo "5. Validating documentation links..."
markdown-link-check docs/**/*.md

# 6. Environment Variables
echo "6. Checking required environment variables..."
required_vars=(
  "CFN_GATE_STRATEGY"
  "CFN_TEST_PASS_RATE_GATE"
)
for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "⚠️  Variable not set: $var (will use default)"
  fi
done

echo ""
echo "✅ Pre-integration validation complete"
```

### 6.2 Integration Smoke Test

```bash
#!/bin/bash
# tests/smoke/test-integration-smoke.sh

set -euo pipefail

echo "Integration Smoke Test"
echo "======================"

# Test 1: Task Mode with Test-Driven Gate
echo "Test 1: Task Mode TDD Gate"
/cfn-loop-task "Create simple hello world function" \
  --mode=mvp \
  --success-criteria '{
    "test_suites": [{
      "name": "Hello World Test",
      "command": "echo \"1 passed, 0 failed, 1 total\"",
      "required": true,
      "pass_threshold": 1.0
    }]
  }' || echo "❌ Task Mode failed"

# Test 2: CLI Mode Auto-Generation
echo "Test 2: CLI Mode Criteria Auto-Generation"
/cfn-loop-cli "Simple calculator" --mode=mvp || echo "❌ CLI Mode failed"

# Test 3: Hybrid Mode Fallback
echo "Test 3: Hybrid Mode Fallback"
CFN_GATE_STRATEGY=auto \
/cfn-loop-task "Task without criteria" --mode=mvp || echo "❌ Fallback failed"

# Test 4: Test Parser
echo "Test 4: Test Result Parser"
bash tests/cfn-v3/helpers/test-gate-check.sh || echo "❌ Parser tests failed"

echo ""
echo "✅ Smoke tests complete"
```

### 6.3 Post-Integration Validation

```bash
#!/bin/bash
# scripts/validate-after-integration.sh

set -euo pipefail

echo "Post-Integration Validation"
echo "==========================="

# 1. Full Test Suite
echo "1. Running full test suite..."
bash tests/cfn-v3-orchestration/run-full-suite.sh

# 2. Performance Benchmark
echo "2. Running performance benchmarks..."
bash tests/performance/benchmark-gate-check.sh

# Expected: Gate check execution < 60s

# 3. Regression Tests
echo "3. Running regression tests..."
bash tests/regression/test-confidence-mode-still-works.sh

# 4. Docker Mode Validation
echo "4. Validating Docker mode..."
docker-compose -f docker-compose.test.yml up --abort-on-container-exit

# 5. Documentation Completeness
echo "5. Checking documentation..."
scripts/check-doc-completeness.sh

# 6. Telemetry Check
echo "6. Validating telemetry..."
node scripts/validate-telemetry.js

echo ""
echo "✅ Post-integration validation complete"
```

---

## 7. Rollback Procedures

### 7.1 Rollback Triggers

**Rollback immediately if:**

1. Test pass rate accuracy < 85% (vs actual correctness)
2. Gate check execution time > 120s (2x budget)
3. Critical test failures > 10% of CFN Loops
4. User-reported blockers > 5 in first week

### 7.2 Rollback Steps

```bash
#!/bin/bash
# scripts/rollback-to-confidence-mode.sh

set -euo pipefail

echo "⚠️  ROLLBACK: Reverting to confidence-based gate"

# 1. Change default strategy
export CFN_GATE_STRATEGY=confidence

# 2. Update orchestrator to use confidence mode
git checkout main -- .claude/skills/cfn-loop-orchestration/orchestrate.sh
git checkout main -- .claude/skills/cfn-loop-orchestration/helpers/gate-check.sh

# 3. Restart services
docker-compose down
docker-compose up -d

# 4. Notify users
echo "Sending rollback notification..."
# Send email/Slack notification

# 5. Collect diagnostics
bash scripts/collect-diagnostics.sh > /tmp/rollback-diagnostics.txt

echo "✅ Rollback complete - confidence mode restored"
echo "   Diagnostics: /tmp/rollback-diagnostics.txt"
```

### 7.3 Hybrid Mode (Safe Rollback)

**Instead of full rollback, use hybrid mode:**

```bash
# Enable hybrid mode (both strategies available)
export CFN_GATE_STRATEGY=auto

# Auto-detect:
# - If success_criteria defined → test-driven
# - If no success_criteria → confidence (fallback)
```

---

## 8. Success Metrics

### 8.1 Implementation Success Metrics

**Track during rollout:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Files Updated** | 74/74 (100%) | Count completed file updates |
| **Test Coverage** | ≥95% | Code coverage tool |
| **Test Pass Rate** | ≥95% | Test suite results |
| **Documentation Complete** | 100% | Checklist completion |
| **Phase Completion Time** | ≤7 weeks | Timeline tracking |

### 8.2 Production Success Metrics

**Track after deployment:**

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| **Defect Escape Rate** | ~40% | <5% | Bugs found in PR review vs production |
| **Time to Feedback** | Days | <2 min | Hours from commit to test failure |
| **Confidence-Reality Gap** | 37% | <5% | |Test pass rate - actual correctness| |
| **Gate Accuracy** | 55% | ≥95% | Gate decision correctness |
| **Adoption Rate** | 0% | ≥80% | % of CFN Loops using test-driven |
| **Gate Execution Time** | N/A | <60s | Time to run tests + calculate pass rate |
| **PR Review Cycles** | 3-5 | <2 | Iterations before merge |

### 8.3 Telemetry Collection

```bash
# In gate-check.sh
log_telemetry() {
    local TASK_ID="$1"
    local PASS_RATE="$2"
    local EXECUTION_TIME="$3"

    # Store in telemetry database
    cat <<EOF >> "$CFN_TELEMETRY_DIR/gate-metrics.jsonl"
{
  "task_id": "$TASK_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "pass_rate": $PASS_RATE,
  "execution_time_ms": $EXECUTION_TIME,
  "gate_strategy": "$CFN_GATE_STRATEGY",
  "mode": "$MODE"
}
EOF
}
```

### 8.4 Weekly Metrics Dashboard

```sql
-- Query telemetry database
SELECT
    DATE(timestamp) as date,
    COUNT(*) as total_gates,
    AVG(pass_rate) as avg_pass_rate,
    AVG(execution_time_ms) as avg_execution_time,
    SUM(CASE WHEN gate_strategy = 'test-driven' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as adoption_pct
FROM gate_metrics
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY DATE(timestamp)
ORDER BY date DESC;
```

---

## 9. Risk Mitigation

### 9.1 Risk Matrix

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Test execution too slow (>120s) | HIGH | MEDIUM | Cache results, run only affected tests, parallel execution |
| No tests defined by user | HIGH | MEDIUM | Coordinator auto-generates, fallback to deliverable validation |
| Test framework not supported | MEDIUM | LOW | Support top 5 frameworks, provide generic parser |
| Flaky tests fail gate | MEDIUM | MEDIUM | Retry once, allow threshold <1.0 (0.95 = 1 flake OK) |
| User resistance to change | MEDIUM | MEDIUM | Gradual rollout, hybrid mode, show comparison metrics |
| Integration breaks existing workflows | HIGH | LOW | Extensive testing, hybrid mode fallback, rollback plan |

### 9.2 Contingency Plans

**Test Execution Timeout:**
```bash
# In gate-check.sh
TIMEOUT=${CFN_TEST_TIMEOUT:-300}  # 5 minutes default

timeout $TIMEOUT bash -c "$TEST_COMMAND" || {
  echo "⚠️  Test execution timed out after ${TIMEOUT}s"
  echo "   Consider splitting tests or increasing timeout"
  return 1
}
```

**No Success Criteria Defined:**
```bash
# In coordinator or Main Chat
if [[ -z "$SUCCESS_CRITERIA" ]]; then
  echo "⚠️  No success criteria - auto-generating basic validation"

  # Fallback 1: Deliverables check
  SUCCESS_CRITERIA='{
    "test_suites": [],
    "deliverables": ["src/implementation.ts"],
    "gate_mode": "deliverables-only"
  }'

  # Fallback 2: Confidence mode
  export CFN_GATE_STRATEGY=confidence
fi
```

---

## 10. Final Checklist

### 10.1 Before Starting Implementation

- [ ] Review complete file inventory (74 files)
- [ ] Understand all handoff points
- [ ] Set up development environment
- [ ] Create feature branch: `feature/test-driven-gate`
- [ ] Notify team of upcoming changes

### 10.2 During Implementation (Each Phase)

- [ ] Update files per phase checklist
- [ ] Write/update tests (95%+ coverage)
- [ ] Run phase validation tests
- [ ] Update documentation
- [ ] Commit with clear messages
- [ ] Create phase summary document

### 10.3 Before Production Deployment

- [ ] All 74 files updated and tested
- [ ] Full test suite passes (≥95%)
- [ ] Documentation complete
- [ ] Smoke tests pass
- [ ] Performance benchmarks acceptable (<60s gate check)
- [ ] Rollback procedure tested
- [ ] Team trained on new workflow
- [ ] User guide published

### 10.4 After Production Deployment

- [ ] Monitor telemetry (first 48 hours)
- [ ] Track adoption rate (weekly)
- [ ] Collect user feedback
- [ ] Address issues within 24 hours
- [ ] Weekly metrics review
- [ ] Publish success stories

---

## Conclusion

This comprehensive implementation plan provides:

✅ **Complete file inventory** (74 files with exact line changes)
✅ **All handoff points** mapped with data flow diagrams
✅ **Success criteria schema** with validation rules
✅ **Test coverage requirements** (95%+ unit, 90%+ integration)
✅ **Phase-by-phase roadmap** (7 weeks, clear deliverables)
✅ **Integration scripts** for validation
✅ **Rollback procedures** for safety
✅ **Success metrics** for tracking

**Next Steps:**

1. **Review and approve** this plan
2. **Create feature branch**: `git checkout -b feature/test-driven-gate`
3. **Begin Phase 1**: Foundation (Week 1)
4. **Track progress** using success metrics
5. **Iterate** based on feedback

**Estimated Timeline:**
- Phase 1-4: Weeks 1-4 (Core implementation)
- Phase 5-6: Weeks 5-6 (Enhancements + docs)
- Phase 7: Week 7 (Production rollout)
- **Total: 7-8 weeks** (1 FTE)

**Confidence Score:** 0.95
**Risk Level:** Low (hybrid mode ensures safety)
**Expected Impact:** Defect escape rate reduction from 40% to <5%

---

**End of Comprehensive Implementation Plan**
