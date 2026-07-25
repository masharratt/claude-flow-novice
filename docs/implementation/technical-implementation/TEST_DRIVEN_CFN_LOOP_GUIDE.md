# Test-Driven CFN Loop Guide

**Version:** 3.0
**Date:** 2025-11-16
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Key Concepts](#key-concepts)
3. [Quick Start](#quick-start)
4. [Success Criteria Format](#success-criteria-format)
5. [Writing Effective Tests](#writing-effective-tests)
6. [Execution Modes](#execution-modes)
7. [Loop Architecture](#loop-architecture)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)
10. [Advanced Topics](#advanced-topics)

---

## Overview

### What is Test-Driven CFN Loop?

The CFN (Claude Flow Novice) Loop is a three-phase, self-correcting AI development workflow that uses **objective test execution** to validate deliverables instead of subjective confidence scoring.

**Problem Solved:**
Traditional confidence-based validation had 55% accuracy due to:
- Subjective self-assessment
- No executable validation
- "Consensus on vapor" (high confidence, broken code)

**Solution:**
Test-driven gates provide 95%+ accuracy through:
- Executable test validation
- Objective pass/fail metrics
- Automated quality gates

### Architecture Overview

```
Loop 3 (Implementation)
├─ Implementer agents write code
├─ Agent-authored tests (15-20 min TDD phase)
├─ Test execution → pass rate
└─ Gate check: ≥threshold? → Pass to Loop 2

Loop 2 (Validation)
├─ Validator agents review code
├─ Test quality analysis
├─ Security/performance audits
└─ Consensus calculation → Pass to Product Owner

Product Owner (Decision)
├─ Evaluates consensus + deliverables
├─ Validates no "consensus on vapor"
└─ Decision: PROCEED / ITERATE / ABORT
```

### Measured Improvements

| Metric | Confidence-Based | Test-Driven | Improvement |
|--------|-----------------|-------------|-------------|
| Accuracy | 55% | 95%+ | +73% |
| Defect Escape Rate | 40% | <5% | -88% |
| Iteration Efficiency | 3.2 avg | 1.8 avg | -44% |
| False Positives | 22% | <2% | -91% |

---

## Key Concepts

### 1. Success Criteria

**Definition:** JSON specification defining deliverables and test requirements for a task.

**Structure:**
```json
{
  "task_description": "Implement JWT authentication middleware",
  "deliverables": [
    "src/middleware/auth.ts",
    "tests/middleware/auth.test.ts"
  ],
  "tests": [
    {
      "name": "JWT Authentication Tests",
      "command": "npm test -- tests/middleware/auth.test.ts",
      "pass_threshold": 1.0
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "security_scan": "zero_high_vulnerabilities"
  }
}
```

**Purpose:**
- Define objective completion criteria
- Enable automated validation
- Prevent "consensus on vapor"
- Guide agent implementation

### 2. Test Pass Rate

**Definition:** Percentage of tests that pass (0.0 - 1.0 scale).

**Calculation:**
```
pass_rate = passing_tests / total_tests
```

**Example:**
```bash
# Test Results
✅ 18 tests passed
❌ 2 tests failed
Total: 20 tests

Pass Rate = 18/20 = 0.90 (90%)
```

**Usage:**
- Loop 3 gate threshold (Standard: ≥0.95)
- Loop 2 consensus calculation
- Product Owner decision criteria

### 3. Gate Checks

**Definition:** Automated quality thresholds that determine if work progresses to next phase.

**Loop 3 Gate (Self-Validation):**
```bash
if [ "$LOOP3_PASS_RATE" -ge "$GATE_THRESHOLD" ]; then
  echo "✅ Gate PASSED: Proceed to Loop 2"
else
  echo "❌ Gate FAILED: Iterate Loop 3"
fi
```

**Thresholds by Mode:**

| Mode | Loop 3 Gate | Loop 2 Consensus | Max Iterations |
|------|-------------|------------------|----------------|
| MVP | ≥0.70 | ≥0.80 | 5 |
| Standard | ≥0.95 | ≥0.90 | 10 |
| Enterprise | ≥0.98 | ≥0.95 | 15 |

### 4. Consensus

**Definition:** Aggregate validation score from Loop 2 validators.

**Calculation:**
```
consensus = average(validator_scores)
```

**Example:**
```json
{
  "reviewer": 0.93,
  "security-specialist": 0.93,
  "contract-tester": 0.95,
  "integration-tester": 0.92,
  "mutation-tester": 0.88
}

Consensus = (0.93 + 0.93 + 0.95 + 0.92 + 0.88) / 5 = 0.922
```

**Standard Mode:** ≥0.90 required for PROCEED

---

## Quick Start

### 1. Task Mode (Debugging, Full Visibility)

**Use When:** Learning, debugging, short tasks (<5 min)

**Command:**
```bash
/cfn-loop-task "Implement JWT authentication with tests" --mode=standard
```

**Workflow:**
1. Main Chat spawns all agents via Task() tool
2. Loop 3 agents implement + test (visible in chat)
3. Test execution in Main Chat (full output)
4. Loop 2 validators review (visible feedback)
5. Product Owner decides (rationale shown)

**Cost:** $0.150/iteration (100% visibility)

### 2. CLI Mode (Production, Cost-Optimized)

**Use When:** Production tasks, long workflows, cost-sensitive

**Command:**
```bash
/cfn-loop-cli "Implement JWT authentication with tests" --mode=standard
```

**Workflow:**
1. Main Chat spawns cfn-v3-coordinator
2. Coordinator spawns workers via CLI (background)
3. Progress reports shown periodically
4. Final results displayed

**Cost:** $0.054/iteration (64% savings vs Task Mode)

### 3. Docker Mode (Containerized Execution)

**Use When:** Isolated environments, reproducible builds

**Command:**
```bash
/cfn-docker:CFN_DOCKER_TASK "Implement JWT auth" --mode=standard
```

**Workflow:**
1. Docker coordinator spawns containerized agents
2. Test execution in isolated containers
3. Results aggregated via Redis
4. Clean container teardown

**Cost:** Similar to CLI mode + Docker overhead

---

## Success Criteria Format

### Inline JSON (Environment Variable)

**Simple tasks (<5 deliverables):**

```bash
export CFN_SUCCESS_CRITERIA='{
  "task_description": "Add input validation to user API",
  "deliverables": [
    "src/api/user.ts",
    "tests/api/user.test.ts"
  ],
  "tests": [
    {
      "name": "User API Validation Tests",
      "command": "npm test -- tests/api/user.test.ts",
      "pass_threshold": 1.0
    }
  ]
}'
```

### File-Based (Complex Tasks)

**For tasks with 5+ deliverables or multi-suite testing:**

**File:** `success-criteria/jwt-auth.json`
```json
{
  "task_description": "Implement JWT authentication system",
  "deliverables": [
    "src/middleware/auth.ts",
    "src/services/jwt.ts",
    "src/config/auth-config.ts",
    "tests/middleware/auth.test.ts",
    "tests/services/jwt.test.ts",
    "tests/integration/auth-flow.test.ts",
    "docs/AUTH_IMPLEMENTATION.md"
  ],
  "tests": [
    {
      "name": "Unit Tests - Auth Middleware",
      "command": "npm test -- tests/middleware/auth.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.3
    },
    {
      "name": "Unit Tests - JWT Service",
      "command": "npm test -- tests/services/jwt.test.ts",
      "pass_threshold": 1.0,
      "weight": 0.3
    },
    {
      "name": "Integration Tests - Auth Flow",
      "command": "npm test -- tests/integration/auth-flow.test.ts",
      "pass_threshold": 0.95,
      "weight": 0.4
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "security_scan": "zero_high_vulnerabilities",
    "eslint": "zero_errors"
  }
}
```

**Usage:**
```bash
export CFN_SUCCESS_CRITERIA="/workspace/success-criteria/jwt-auth.json"
```

### Weighted Test Suites

**Use When:** Different test suites have different importance.

**Example:**
```json
{
  "tests": [
    {
      "name": "Unit Tests",
      "command": "npm test -- tests/unit/",
      "pass_threshold": 1.0,
      "weight": 0.4
    },
    {
      "name": "Integration Tests",
      "command": "npm test -- tests/integration/",
      "pass_threshold": 0.95,
      "weight": 0.4
    },
    {
      "name": "E2E Tests",
      "command": "npm run test:e2e",
      "pass_threshold": 0.90,
      "weight": 0.2
    }
  ]
}
```

**Aggregate Calculation:**
```
total_pass_rate = (0.4 × unit_pass_rate) +
                  (0.4 × integration_pass_rate) +
                  (0.2 × e2e_pass_rate)
```

---

## Writing Effective Tests

### Phase 1: Test-Driven Development (15-20 min)

**Loop 3 agents MUST write tests BEFORE implementation.**

**TDD Workflow:**
```bash
# 1. Write failing tests first
describe('JWT Authentication', () => {
  it('should validate JWT token format', () => {
    const token = 'invalid.token.format';
    expect(() => validateToken(token)).toThrow('Invalid JWT format');
  });

  it('should reject expired tokens', () => {
    const expiredToken = generateExpiredToken();
    expect(() => validateToken(expiredToken)).toThrow('Token expired');
  });

  it('should accept valid tokens', () => {
    const validToken = generateValidToken();
    expect(validateToken(validToken)).toBe(true);
  });
});

# 2. Run tests (all should FAIL)
npm test -- tests/middleware/auth.test.ts
# ❌ 0/3 tests passed (expected - no implementation yet)

# 3. Implement code to make tests pass
function validateToken(token: string): boolean {
  // Implementation...
}

# 4. Run tests again (all should PASS)
npm test -- tests/middleware/auth.test.ts
# ✅ 3/3 tests passed (100%)
```

### Test Quality Checklist

**Good Tests:**
- ✅ Test behavior, not implementation
- ✅ Cover happy path + edge cases
- ✅ Independent (no shared state)
- ✅ Fast execution (<100ms per test)
- ✅ Descriptive names (what + why)
- ✅ Arrange-Act-Assert pattern

**Bad Tests:**
- ❌ Test implementation details
- ❌ Only happy path coverage
- ❌ Tests depend on execution order
- ❌ Slow tests (network calls, file I/O)
- ❌ Unclear test names
- ❌ Multiple assertions unrelated

### Example: Strong Test Suite

```typescript
// ✅ GOOD: Comprehensive test coverage
describe('User Authentication', () => {
  // Happy path
  it('should authenticate valid credentials', async () => {
    const user = { username: 'alice', password: 'secret123' };
    const result = await authenticate(user);
    expect(result.authenticated).toBe(true);
    expect(result.token).toBeDefined();
  });

  // Edge cases
  it('should reject empty username', async () => {
    const user = { username: '', password: 'secret123' };
    await expect(authenticate(user)).rejects.toThrow('Username required');
  });

  it('should reject empty password', async () => {
    const user = { username: 'alice', password: '' };
    await expect(authenticate(user)).rejects.toThrow('Password required');
  });

  it('should reject invalid credentials', async () => {
    const user = { username: 'alice', password: 'wrong' };
    const result = await authenticate(user);
    expect(result.authenticated).toBe(false);
  });

  it('should handle database connection errors', async () => {
    mockDatabase.disconnect();
    const user = { username: 'alice', password: 'secret123' };
    await expect(authenticate(user)).rejects.toThrow('Database error');
  });

  // Security
  it('should not reveal whether username or password is wrong', async () => {
    const user1 = { username: 'nonexistent', password: 'secret123' };
    const user2 = { username: 'alice', password: 'wrong' };

    const error1 = await authenticate(user1).catch(e => e.message);
    const error2 = await authenticate(user2).catch(e => e.message);

    expect(error1).toBe(error2); // Same error message
  });
});
```

### Test Organization

**Directory Structure:**
```
tests/
├── unit/
│   ├── middleware/
│   │   └── auth.test.ts
│   ├── services/
│   │   └── jwt.test.ts
│   └── utils/
│       └── validation.test.ts
├── integration/
│   ├── auth-flow.test.ts
│   └── user-api.test.ts
├── e2e/
│   └── authentication.e2e.test.ts
└── fixtures/
    ├── users.json
    └── tokens.json
```

**Naming Convention:**
- Unit tests: `<module>.test.ts`
- Integration tests: `<feature>-flow.test.ts`
- E2E tests: `<feature>.e2e.test.ts`

---

## Execution Modes

### Task Mode Deep Dive

**Architecture:**
```
Main Chat
├─ Task(backend-developer) → Loop 3 Agent 1
├─ Task(qa-tester) → Loop 3 Agent 2
├─ Bash(npm test) → Test Execution
├─ Task(reviewer) → Loop 2 Validator 1
├─ Task(security-specialist) → Loop 2 Validator 2
└─ Task(product-owner) → Decision
```

**Advantages:**
- Full visibility (every agent output visible)
- Debugging-friendly (see exact errors)
- Learning tool (understand agent reasoning)
- Fast iteration feedback

**Disadvantages:**
- Higher cost ($0.150/iteration)
- Context window usage (all output in Main Chat)
- Not suitable for production workflows

**When to Use:**
- Learning test-driven CFN Loop
- Debugging failed iterations
- Short tasks (<10 min)
- Development/prototyping

### CLI Mode Deep Dive

**Architecture:**
```
Main Chat
└─ Task(cfn-v3-coordinator)
    └─ Enhanced Orchestrator (orchestrate.sh)
        ├─ npx claude-flow-novice agent-spawn backend-developer
        ├─ npx claude-flow-novice agent-spawn qa-tester
        ├─ Monitor progress (enhanced v3.0)
        ├─ Test execution (background)
        ├─ npx claude-flow-novice agent-spawn reviewer
        ├─ npx claude-flow-novice agent-spawn security-specialist
        └─ npx claude-flow-novice agent-spawn product-owner
```

**Advantages:**
- 64% cost reduction ($0.054/iteration)
- Scalable (no context window limits)
- Production-ready (background execution)
- Enhanced monitoring v3.0 (automatic recovery)

**Disadvantages:**
- Limited visibility (progress reports only)
- Harder to debug (agent logs in files)
- Requires coordinator setup

**When to Use:**
- Production workflows
- Long tasks (>10 min)
- Cost-sensitive projects
- Scalable multi-iteration tasks

**Enhanced Features (v3.0):**
- Real-time progress tracking
- Stuck agent detection
- Automatic recovery
- Process health monitoring

### Docker Mode Deep Dive

**Architecture:**
```
Main Chat
└─ Task(cfn-docker-coordinator)
    └─ Docker Orchestrator
        ├─ Docker Container (backend-developer)
        ├─ Docker Container (qa-tester)
        ├─ Redis (coordination)
        ├─ Test execution (isolated)
        └─ Container cleanup
```

**Advantages:**
- Complete isolation (no host pollution)
- Reproducible builds
- Security (containerized execution)
- MCP server integration

**Disadvantages:**
- Higher resource usage (Docker overhead)
- Slower startup (container init)
- Requires Docker daemon

**When to Use:**
- Security-sensitive tasks
- Reproducible builds required
- MCP server dependencies
- CI/CD integration

---

## Loop Architecture

### Loop 3: Implementation Phase

**Agents:** Implementers (backend-developer, frontend-developer, qa-tester)

**Protocol:**
1. **Phase 1: Test-Driven Development (15-20 min)**
   - Agents write tests BEFORE implementation
   - Tests define expected behavior
   - All tests should initially FAIL

2. **Phase 2: Implementation (30-40 min)**
   - Write code to make tests pass
   - Follow TDD red-green-refactor cycle
   - Create deliverables from success criteria

3. **Phase 3: Validation (5 min)**
   - Execute test suite
   - Calculate pass rate
   - Report results + metadata

**Success Criteria:**
```bash
# Standard Mode Gate
if [ "$LOOP3_PASS_RATE" -ge "0.95" ]; then
  echo "✅ Loop 3 PASSED: $LOOP3_PASS_RATE ≥ 0.95"
  signal_loop2_start
else
  echo "❌ Loop 3 FAILED: $LOOP3_PASS_RATE < 0.95"
  iterate_loop3
fi
```

**Output Format:**
```json
{
  "agent_id": "backend-developer-1732001234",
  "pass_rate": 0.97,
  "tests_passed": 29,
  "tests_failed": 1,
  "tests_total": 30,
  "deliverables_created": [
    "src/middleware/auth.ts",
    "tests/middleware/auth.test.ts"
  ],
  "test_output": "..."
}
```

### Loop 2: Validation Phase

**Agents:** Validators (reviewer, security-specialist, contract-tester, integration-tester, mutation-tester)

**Protocol:**
1. **Wait for Gate Pass Signal**
   ```bash
   coordination-wait "swarm:${TASK_ID}:gate-passed"
   ```

2. **Review Implementation**
   - Code quality analysis
   - Security audit
   - Test quality validation
   - Contract compliance

3. **Calculate Consensus Score**
   ```bash
   # Individual validator scores
   reviewer: 0.93
   security: 0.93
   contract: 0.95
   integration: 0.92
   mutation: 0.88

   # Average
   consensus = 0.922
   ```

4. **Report Validation Results**
   ```json
   {
     "validator": "reviewer",
     "score": 0.93,
     "findings": [
       "✅ Code follows TypeScript best practices",
       "✅ Error handling comprehensive",
       "⚠️ Consider adding JSDoc comments"
     ],
     "recommendation": "APPROVE"
   }
   ```

**Consensus Threshold:**
- Standard Mode: ≥0.90
- Enterprise Mode: ≥0.95

### Product Owner: Decision Phase

**Agent:** product-owner (GOAP-based autonomous decision maker)

**Protocol:**
1. **Evaluate Deliverables**
   ```bash
   # Check all files exist
   for file in "${DELIVERABLES[@]}"; do
     if [[ ! -f "$file" ]]; then
       echo "❌ Missing deliverable: $file"
       ABORT_REASON="Consensus on vapor"
     fi
   done
   ```

2. **Analyze Consensus**
   ```bash
   if [ "$CONSENSUS" -ge "$THRESHOLD" ]; then
     if [ "$DELIVERABLES_COMPLETE" = true ]; then
       DECISION="PROCEED"
     else
       DECISION="ITERATE"  # High consensus but missing files
     fi
   else
     DECISION="ITERATE"  # Low consensus
   fi
   ```

3. **Output Decision**
   ```markdown
   # DECISION: PROCEED

   ## RATIONALE:
   Consensus score of 0.93 exceeds the 0.90 threshold, with all 5 validators
   recommending approval. All deliverables are complete and tested. Loop 3
   pass rate of 0.97 (29/30 tests) meets Standard mode requirements.

   ## NEXT STEPS:
   1. Mark task complete
   2. Update changelog
   3. Commit changes
   ```

**Decision Matrix:**

| Consensus | Deliverables | Gate Pass | Decision |
|-----------|--------------|-----------|----------|
| ≥0.90 | ✅ Complete | ✅ Yes | PROCEED |
| ≥0.90 | ❌ Missing | ✅ Yes | ITERATE |
| <0.90 | ✅ Complete | ✅ Yes | ITERATE |
| <0.90 | ❌ Missing | ✅ Yes | ITERATE |
| Any | Any | ❌ No | ABORT |

---

## Best Practices

### 1. Writing Success Criteria

**DO:**
- ✅ Define specific, measurable deliverables
- ✅ Include test requirements with thresholds
- ✅ Specify quality gates (coverage, security)
- ✅ Use file paths relative to project root
- ✅ Set realistic pass thresholds (0.95 for unit, 0.90 for E2E)

**DON'T:**
- ❌ Use vague deliverables ("improve auth")
- ❌ Omit test requirements
- ❌ Set 100% pass rate for integration tests
- ❌ Use absolute paths (/home/user/...)
- ❌ Mix unrelated tasks in one criteria

### 2. Test-Driven Development

**DO:**
- ✅ Write tests BEFORE implementation
- ✅ Start with simplest test cases
- ✅ Test edge cases and error handling
- ✅ Use descriptive test names
- ✅ Keep tests independent

**DON'T:**
- ❌ Write tests after implementation
- ❌ Skip edge case testing
- ❌ Test implementation details
- ❌ Create inter-dependent tests
- ❌ Mix unit and integration tests

### 3. Mode Selection

**Task Mode When:**
- Learning the system
- Debugging failed iterations
- Tasks <5 minutes
- Need full visibility

**CLI Mode When:**
- Production workflows
- Tasks >10 minutes
- Cost optimization required
- Scalable execution needed

**Docker Mode When:**
- Security isolation required
- Reproducible builds
- MCP server dependencies
- CI/CD integration

### 4. Iteration Management

**DO:**
- ✅ Trust Product Owner decisions
- ✅ Iterate on specific issues (not full rewrite)
- ✅ Analyze failure patterns
- ✅ Adjust thresholds if consistently failing
- ✅ Use backlog for deferred improvements

**DON'T:**
- ❌ Override Product Owner without analysis
- ❌ Rewrite everything on ITERATE
- ❌ Ignore repeated failures
- ❌ Lower thresholds to "pass" bad code
- ❌ Mix iteration fixes with new features

### 5. Security and Quality

**DO:**
- ✅ Include security-specialist in Loop 2
- ✅ Set "zero_high_vulnerabilities" gate
- ✅ Run static analysis (ESLint, SonarQube)
- ✅ Test security edge cases
- ✅ Document security decisions

**DON'T:**
- ❌ Skip security validation
- ❌ Allow HIGH vulnerabilities to pass
- ❌ Defer security fixes to backlog
- ❌ Test only happy paths
- ❌ Ignore security warnings

---

## Troubleshooting

### Issue: Gate Consistently Fails (Pass Rate <0.95)

**Symptoms:**
```
Iteration 1: 0.73 (22/30 tests) ❌
Iteration 2: 0.80 (24/30 tests) ❌
Iteration 3: 0.87 (26/30 tests) ❌
```

**Diagnosis:**
1. Analyze failing tests:
   ```bash
   grep "FAIL" test-output.log
   ```

2. Check test quality:
   - Are tests flaky (random failures)?
   - Are tests too strict (unrealistic expectations)?
   - Are tests testing implementation (not behavior)?

**Solutions:**

**A) Tests are correct, implementation incomplete:**
```bash
# Product Owner should ITERATE with specific feedback
DECISION: ITERATE

Issues:
1. 4 tests fail due to missing error handling
2. Edge case validation incomplete
3. Database transaction rollback not implemented

Next iteration: Focus on these 3 areas only
```

**B) Tests are too strict:**
```bash
# Adjust test expectations (via success criteria update)
# Example: Relax integration test threshold
{
  "tests": [
    {
      "name": "Integration Tests",
      "pass_threshold": 0.90  // Was 0.95 (too strict)
    }
  ]
}
```

**C) Tests are flaky:**
```bash
# Fix test isolation issues
# Example: Reset database between tests
beforeEach(async () => {
  await database.reset();
  await seedTestData();
});
```

### Issue: "Consensus on Vapor" (High Consensus, Missing Deliverables)

**Symptoms:**
```
Consensus: 0.93 ✅
Deliverables: 3/5 ❌

Missing:
- tests/middleware/auth.test.ts
- docs/AUTH_IMPLEMENTATION.md
```

**Diagnosis:**
Product Owner detected high consensus but incomplete work.

**Root Cause:**
Validators reviewed what exists, didn't notice missing files.

**Solution:**
Product Owner automatically returns ITERATE:
```markdown
# DECISION: ITERATE

## RATIONALE:
High consensus (0.93) but 2 deliverables missing. This indicates "consensus
on vapor" - validators approved partial work. All success criteria deliverables
must be present before PROCEED.

## NEXT STEPS:
1. Create missing test file: tests/middleware/auth.test.ts
2. Write documentation: docs/AUTH_IMPLEMENTATION.md
3. Re-run Loop 2 validation
```

### Issue: Security Specialist Blocks PROCEED

**Symptoms:**
```
reviewer: 0.95 ✅
security-specialist: 0.62 ❌ (4 HIGH vulnerabilities)
contract-tester: 0.93 ✅
integration-tester: 0.90 ✅

Consensus: 0.85 (below 0.90 threshold)
```

**Diagnosis:**
Security audit found critical issues.

**Solution:**
Product Owner returns ITERATE with specific security fixes:
```markdown
# DECISION: ITERATE

## RATIONALE:
Security audit found 4 HIGH vulnerabilities:
1. SQL injection in user query
2. Unvalidated JWT tokens
3. Missing rate limiting
4. Plaintext password logging

Consensus 0.85 < 0.90 threshold due to security concerns.

## NEXT STEPS:
Iteration 2: Apply security fixes ONLY
1. Parameterize SQL queries
2. Validate JWT signature + expiration
3. Add rate limiting middleware
4. Remove password from logs

Re-validation expected: security score 0.85 → 0.95
```

### Issue: Iteration Limit Reached (10 iterations, no PROCEED)

**Symptoms:**
```
Iteration 10: Consensus 0.88 (still < 0.90)
Max iterations reached
```

**Diagnosis:**
Task is too complex for single sprint OR success criteria unrealistic.

**Solutions:**

**A) Break into smaller tasks:**
```bash
# Original (too broad)
"Implement complete authentication system"

# Split into 3 sprints
Sprint 1: "JWT token generation and validation"
Sprint 2: "Authentication middleware integration"
Sprint 3: "Session management and logout"
```

**B) Adjust mode to Enterprise (15 iterations):**
```bash
/cfn-loop-cli "Complex auth system" --mode=enterprise
```

**C) Review success criteria (may be too strict):**
```json
{
  "tests": [
    {
      "pass_threshold": 1.0  // Too strict? Consider 0.95
    }
  ],
  "quality_gates": {
    "test_coverage": 0.99  // Too strict? Consider 0.95
  }
}
```

### Issue: Docker Mode Fails (Security Audit)

**Symptoms:**
```
❌ Path traversal vulnerability detected
❌ Docker socket over-exposure
❌ JSON DoS risk
```

**Diagnosis:**
Docker orchestration has security issues.

**Solution:**
Apply security hardening (Phase 4 fixes):
1. Add path validation (whitelist /workspace, /etc/cfn)
2. Remove docker.sock from non-coordinator containers
3. Add JSON size validation (10MB limit)
4. Enhance shell sanitization

**See:** `tests/security/phase4-docker-integration/SECURITY_AUDIT_REPORT.md`

---

## Advanced Topics

### Custom Validators

**Adding New Loop 2 Validators:**

1. Create agent profile:
   ```markdown
   ---
   name: accessibility-testing-specialist
   description: MUST BE USED for WCAG compliance validation
   tools: [Read, Write, Edit, Bash, Grep, Glob, TodoWrite]
   model: sonnet
   ---

   # Accessibility Testing Specialist

   ## Role: Loop 2 Validator

   Validates WCAG 2.1 Level AA compliance...
   ```

2. Update coordinator configuration:
   ```markdown
   # cfn-v3-coordinator.md

   **Software Development Tasks:**
   - loop2_agents: [
       "reviewer",
       "security-specialist",
       "contract-tester",
       "integration-tester",
       "mutation-tester",
       "accessibility-testing-specialist"  # NEW
     ]
   ```

3. Add test suite:
   ```bash
   # tests/accessibility/wcag-compliance.test.ts
   import { AxePuppeteer } from '@axe-core/puppeteer';

   describe('WCAG 2.1 Compliance', () => {
     it('should have zero accessibility violations', async () => {
       const results = await new AxePuppeteer(page).analyze();
       expect(results.violations).toHaveLength(0);
     });
   });
   ```

### Multi-Suite Weighted Testing

**Complex projects with multiple test types:**

```json
{
  "tests": [
    {
      "name": "Unit Tests",
      "command": "npm test -- tests/unit/",
      "pass_threshold": 1.0,
      "weight": 0.3,
      "required": true
    },
    {
      "name": "Integration Tests",
      "command": "npm test -- tests/integration/",
      "pass_threshold": 0.95,
      "weight": 0.3,
      "required": true
    },
    {
      "name": "E2E Tests",
      "command": "npm run test:e2e",
      "pass_threshold": 0.90,
      "weight": 0.2,
      "required": false
    },
    {
      "name": "Performance Tests",
      "command": "npm run test:perf",
      "pass_threshold": 0.85,
      "weight": 0.2,
      "required": false
    }
  ]
}
```

**Aggregate Calculation:**
```bash
# If all tests run
total = (0.3 × 1.0) + (0.3 × 0.95) + (0.2 × 0.90) + (0.2 × 0.85)
      = 0.30 + 0.285 + 0.18 + 0.17
      = 0.935 ✅ (above 0.90)

# If optional E2E/Perf fail
total = (0.3 × 1.0) + (0.3 × 0.95) + 0 + 0
      = 0.585 ❌ (below 0.90, requires all required tests)
```

### Quality Gate Customization

**Enterprise Mode with Strict Gates:**

```json
{
  "quality_gates": {
    "test_coverage": 0.98,
    "branch_coverage": 0.95,
    "mutation_score": 0.85,
    "security_scan": "zero_high_vulnerabilities",
    "eslint": "zero_errors",
    "complexity": 10,
    "duplicate_code": 0.03
  }
}
```

**Gate Validation:**
```bash
# Each gate must pass
if [ "$TEST_COVERAGE" -lt "0.98" ]; then
  echo "❌ Test coverage $TEST_COVERAGE < 0.98"
  GATE_PASS=false
fi

if [ "$MUTATION_SCORE" -lt "0.85" ]; then
  echo "❌ Mutation score $MUTATION_SCORE < 0.85"
  GATE_PASS=false
fi

# etc.
```

### Continuous Integration

**GitHub Actions Integration:**

```yaml
# .github/workflows/cfn-loop.yml
name: CFN Loop CI

on:
  pull_request:
    branches: [main]

jobs:
  cfn-loop:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Run CFN Loop (Docker Mode)
        run: |
          # Load success criteria from PR description
          export CFN_SUCCESS_CRITERIA=$(cat .github/success-criteria/pr-${{ github.event.pull_request.number }}.json)

          # Execute CFN Loop
          /cfn-docker:CFN_DOCKER_CLI "${{ github.event.pull_request.title }}" \
            --mode=standard \
            --max-iterations=10

      - name: Upload Test Results
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-output/

      - name: Comment PR with Results
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const results = fs.readFileSync('test-output/summary.json', 'utf8');
            const data = JSON.parse(results);

            const comment = `
            ## CFN Loop Results

            **Decision:** ${data.decision}
            **Consensus:** ${data.consensus}
            **Pass Rate:** ${data.pass_rate}

            ${data.decision === 'PROCEED' ? '✅ Ready to merge' : '❌ Requires iteration'}
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

---

## Appendix A: Success Criteria Template

```json
{
  "task_description": "<Clear description of what needs to be implemented>",
  "deliverables": [
    "<file1.ts>",
    "<file2.test.ts>",
    "<docs/FEATURE.md>"
  ],
  "tests": [
    {
      "name": "<Test Suite Name>",
      "command": "<npm test command>",
      "pass_threshold": 0.95,
      "weight": 1.0,
      "required": true
    }
  ],
  "quality_gates": {
    "test_coverage": 0.95,
    "security_scan": "zero_high_vulnerabilities"
  }
}
```

## Appendix B: Mode Comparison Matrix

| Feature | Task Mode | CLI Mode | Docker Mode |
|---------|-----------|----------|-------------|
| **Visibility** | Full | Progress reports | Container logs |
| **Cost/Iteration** | $0.150 | $0.054 | $0.060 |
| **Debugging** | Excellent | Moderate | Moderate |
| **Scalability** | Limited | High | High |
| **Isolation** | None | Process-level | Container-level |
| **Recovery** | Manual | Automatic (v3.0) | Automatic |
| **CI/CD Ready** | No | Yes | Yes |
| **Best For** | Learning, debugging | Production | Reproducible builds |

## Appendix C: Validator Roster

| Validator | Focus Area | Key Checks |
|-----------|------------|------------|
| reviewer | Code quality | Best practices, readability, maintainability |
| security-specialist | Security | OWASP Top 10, vulnerabilities, injection |
| contract-tester | API contracts | Pact verification, schema validation |
| integration-tester | E2E workflows | Transaction flows, data consistency |
| mutation-tester | Test quality | Mutation score, weak tests, survivors |
| accessibility-tester | WCAG compliance | Screen readers, keyboard nav, contrast |
| performance-tester | Performance | Load times, memory usage, bottlenecks |

## Appendix D: Glossary

- **CFN Loop:** Three-phase self-correcting AI development workflow
- **Loop 3:** Implementation phase (agents write code + tests)
- **Loop 2:** Validation phase (validators review + score)
- **Product Owner:** Autonomous decision agent (PROCEED/ITERATE/ABORT)
- **Gate Check:** Automated threshold validation before phase transition
- **Pass Rate:** Percentage of tests passing (0.0 - 1.0 scale)
- **Consensus:** Average validation score from Loop 2 validators
- **Success Criteria:** JSON specification defining deliverables + test requirements
- **TDD:** Test-Driven Development (write tests before code)
- **Consensus on Vapor:** High consensus but missing/broken deliverables

---

**Document Version:** 3.0
**Last Updated:** 2025-11-16
**Next Review:** After Phase 7 completion

**See Also:**
- `docs/guides/SUCCESS_CRITERIA_EXAMPLES.md` - 20+ example success criteria
- `docs/migration/CONFIDENCE_TO_TEST_DRIVEN_MIGRATION.md` - Migration guide
- `planning/cli-improvements/COMPREHENSIVE_TDD_GATE_IMPLEMENTATION_PLAN.md` - Full implementation plan
