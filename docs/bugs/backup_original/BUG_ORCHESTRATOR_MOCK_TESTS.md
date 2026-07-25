# BUG: Orchestrator Uses Mock Test Data Instead of Real Agent Deliverables

**Status:** CRITICAL - Gate checks use random data, enabling "consensus on vapor"
**Component:** `.claude/skills/cfn-loop-orchestration/src/orchestrate.ts`
**Confidence Score:** 0.90
**Date Identified:** 2025-11-20

---

## Problem Statement

The orchestrator generates **random test results** instead of executing real tests on agent deliverables. This undermines the entire test-driven validation system and allows "consensus on vapor" - the anti-pattern where agents agree on theoretical work without validating actual implementation.

### Current Behavior (WRONG)

**Location:** `orchestrate.ts` lines 626-637

```typescript
// Simulate test result collection from agents
// In production, this would collect from actual agent runs
for (const context of loop3Contexts) {
  const testResult: TestResult = {
    pass: Math.floor(Math.random() * 100),    // ❌ Random numbers
    fail: Math.floor(Math.random() * 20),     // ❌ Not real tests
    skip: Math.floor(Math.random() * 5),      // ❌ Mock data
  };

  this.recordTestResult(context.agentId, testResult);
  this.markAgentComplete(context.agentId, 'loop3');
}
```

**Results:**
- Reports like "162 pass, 21 fail" with no connection to agent work
- Gate pass rates are random (sometimes 0.85, sometimes 0.92)
- Product Owner decisions based on fabricated metrics
- Test-driven validation (v3.0) completely bypassed

### Impact Analysis

**Critical Issues:**

1. **Gate Checks Invalid:**
   - Loop 3 gate uses `aggregated.passRate` from random data
   - Threshold comparisons (0.70/0.95/0.98) meaningless
   - Agents may pass gate with broken code

2. **Consensus on Vapor Enabled:**
   - Loop 2 validators review nothing (no real deliverables validated)
   - Product Owner makes decisions without actual test results
   - System claims 95%+ accuracy but provides 0% validation

3. **Anti-Pattern Facilitation:**
   - Agents can "complete" work without creating files
   - Tests never run on actual code
   - Quality gates are theatrical, not functional

**Affected Workflows:**
- `/cfn-loop-cli` (production CLI mode)
- `/cfn-loop-task` (debugging Task mode)
- All CFN Loop iterations in MVP/Standard/Enterprise modes

---

## Root Cause Analysis

### Why This Happened

The orchestrator was implemented as a **placeholder** with mock data for initial development. Comments like "In production, this would collect from actual agent runs" indicate the team knew this was temporary.

However, the integration with the **Test Execution Skill** was never completed:
- Skill exists: `.claude/skills/cfn-test-execution/`
- Scripts available: `test-coordinator-pattern.sh`
- Orchestrator never calls them

### Missing Integration

**Test Execution Skill provides:**
```bash
# Coordinator runs real tests
./.claude/skills/cfn-test-execution/test-coordinator-pattern.sh swarm-123

# Output format (JSON):
{
  "tests": {
    "passed": 45,
    "failed": 2,
    "total": 47
  },
  "coverage": {
    "lines": 87.5,
    "branches": 82.3
  }
}
```

**Orchestrator should:**
1. Call test execution skill after Loop 3 agents complete
2. Wait for test completion (max 5 min timeout)
3. Parse `test-results.json` or Redis metadata
4. Use real pass/fail counts for gate checks

---

## Solution Design

### 1. Add `executeTests()` Method

**Purpose:** Execute real tests on agent deliverables after Loop 3 completion

**Implementation:**
```typescript
/**
 * Execute tests on agent deliverables using Test Execution Skill
 * Returns aggregated test results from actual test runs
 */
private async executeTests(
  taskId: string,
  iteration: number
): Promise<AggregatedTestResults> {
  const swarmId = `${taskId}-iteration-${iteration}`;

  // Call test execution skill
  const testScript = './.claude/skills/cfn-test-execution/test-coordinator-pattern.sh';
  const { stdout, exitCode } = await this.runCommand(`${testScript} ${swarmId}`);

  // Parse test-results.json
  const resultsFile = 'test-results.json';
  if (!fs.existsSync(resultsFile)) {
    throw new Error('Test execution failed: no results file generated');
  }

  const results = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));

  return {
    totalPass: results.tests.passed || 0,
    totalFail: results.tests.failed || 0,
    totalSkip: results.tests.skip || 0,
    passRate: results.tests.total > 0
      ? results.tests.passed / results.tests.total
      : 0,
    agentCount: this.testResults.size,
  };
}
```

### 2. Replace Mock Data Collection

**Current (lines 626-637):**
```typescript
// Simulate test result collection from agents
for (const context of loop3Contexts) {
  const testResult: TestResult = {
    pass: Math.floor(Math.random() * 100),
    fail: Math.floor(Math.random() * 20),
    skip: Math.floor(Math.random() * 5),
  };
  this.recordTestResult(context.agentId, testResult);
  this.markAgentComplete(context.agentId, 'loop3');
}
```

**Replacement:**
```typescript
// Wait for Loop 3 agents to complete work
await this.waitForAgentCompletion(loop3Contexts, timeoutSeconds);

// Execute real tests on agent deliverables
console.log('Executing tests on agent deliverables...');
const aggregated = await this.executeTests(this.config.taskId, this.state.iteration);

console.log(
  `Loop 3 Results: ${aggregated.totalPass} pass, ${aggregated.totalFail} fail (${(aggregated.passRate * 100).toFixed(2)}%)`
);
```

### 3. Add Agent Completion Waiting

**Purpose:** Ensure agents finish work before running tests

```typescript
/**
 * Wait for agents to complete their work
 * Polls agent completion status with timeout
 */
private async waitForAgentCompletion(
  contexts: AgentExecutionContext[],
  timeoutSeconds: number
): Promise<void> {
  const startTime = Date.now();
  const timeoutMs = timeoutSeconds * 1000;

  while (Date.now() - startTime < timeoutMs) {
    const completed = contexts.every(ctx =>
      this.state.completedAgents.has(ctx.agentId)
    );

    if (completed) {
      console.log('All agents completed successfully');
      return;
    }

    // Wait 5 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Timeout - mark incomplete agents as failed
  for (const context of contexts) {
    if (!this.state.completedAgents.has(context.agentId)) {
      this.recordTimeout(context.agentId, timeoutSeconds);
    }
  }

  throw new Error(`Agent completion timeout after ${timeoutSeconds}s`);
}
```

### 4. Parse Test Results from Skill Output

**Test Execution Skill Output Format:**
```json
{
  "event": "tests_complete",
  "swarmId": "task-123-iteration-1",
  "timestamp": "2025-11-20T10:30:00Z",
  "duration": 12,
  "exitCode": 0,
  "tests": {
    "passed": 45,
    "failed": 2,
    "total": 47
  },
  "coverage": {
    "lines": 87.5,
    "branches": 82.3
  },
  "resultsFile": "test-results.json"
}
```

**Parser:**
```typescript
/**
 * Parse test results from JSON file
 */
private parseTestResults(resultsFile: string): AggregatedTestResults {
  const raw = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));

  const totalPass = raw.tests?.passed || 0;
  const totalFail = raw.tests?.failed || 0;
  const totalSkip = raw.tests?.skip || 0;
  const total = raw.tests?.total || (totalPass + totalFail + totalSkip);

  return {
    totalPass,
    totalFail,
    totalSkip,
    passRate: total > 0 ? totalPass / total : 0,
    agentCount: this.testResults.size,
  };
}
```

---

## Implementation Plan

### Phase 1: Add Test Execution Integration

**Tasks:**
1. Add `executeTests()` method to orchestrator
2. Add `waitForAgentCompletion()` method
3. Add `parseTestResults()` helper
4. Add `runCommand()` utility for shell execution

**Files Modified:**
- `.claude/skills/cfn-loop-orchestration/src/orchestrate.ts`

**Tests Required:**
- Unit test: `executeTests()` calls test skill correctly
- Unit test: `parseTestResults()` handles valid JSON
- Unit test: `parseTestResults()` handles missing fields
- Integration test: Full orchestration with real test execution

### Phase 2: Replace Mock Data

**Tasks:**
1. Remove random test generation (lines 626-637)
2. Replace with `waitForAgentCompletion()` + `executeTests()`
3. Verify gate checks use real pass rates
4. Update error handling for test failures

**Validation:**
- Gate checks reject broken code (pass rate < threshold)
- Gate checks pass working code (pass rate ≥ threshold)
- Product Owner receives accurate test metrics

### Phase 3: Add Timeout Handling

**Tasks:**
1. Handle test execution timeout (default 5 min)
2. Handle agent completion timeout
3. Cleanup test processes on timeout
4. Record timeout events for debugging

**Edge Cases:**
- Tests hang indefinitely → kill after 5 min
- Agents never complete → mark as failed after timeout
- Test results file missing → throw descriptive error

### Phase 4: Validation

**Test Scenarios:**

1. **Happy Path:**
   - Loop 3 agents complete work
   - Tests run successfully (pass rate ≥ 0.95)
   - Gate passes, Loop 2 starts

2. **Gate Failure:**
   - Loop 3 agents complete work
   - Tests run but fail (pass rate < 0.95)
   - Gate fails, iterate with feedback

3. **Agent Timeout:**
   - Loop 3 agents take >timeout seconds
   - Agents marked as failed
   - Tests don't run (no deliverables)

4. **Test Execution Failure:**
   - Loop 3 agents complete work
   - Test execution script crashes
   - Orchestrator logs error, marks iteration failed

---

## Testing Strategy

### Unit Tests

**Test:** `executeTests()` integration
```typescript
describe('Orchestrator.executeTests()', () => {
  it('should call test execution skill with correct swarm ID', async () => {
    const orchestrator = new Orchestrator(config);
    const spy = jest.spyOn(orchestrator, 'runCommand');

    await orchestrator.executeTests('task-123', 1);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('test-coordinator-pattern.sh task-123-iteration-1')
    );
  });

  it('should parse test results correctly', async () => {
    fs.writeFileSync('test-results.json', JSON.stringify({
      tests: { passed: 45, failed: 2, total: 47 }
    }));

    const result = await orchestrator.executeTests('task-123', 1);

    expect(result.totalPass).toBe(45);
    expect(result.totalFail).toBe(2);
    expect(result.passRate).toBeCloseTo(0.957, 3);
  });

  it('should throw error if results file missing', async () => {
    await expect(orchestrator.executeTests('task-123', 1))
      .rejects.toThrow('Test execution failed: no results file generated');
  });
});
```

### Integration Tests

**Test:** End-to-end orchestration with real tests
```typescript
describe('Orchestrator E2E', () => {
  it('should execute real tests after Loop 3 completion', async () => {
    const orchestrator = new Orchestrator({
      taskId: 'test-e2e-123',
      mode: 'standard',
      maxIterations: 1,
    });

    // Spawn agents and execute
    const decision = await orchestrator.execute();

    // Verify real tests were run
    const aggregated = orchestrator.aggregateTestResults();
    expect(aggregated.totalPass).toBeGreaterThan(0);
    expect(aggregated.passRate).toBeGreaterThanOrEqual(0.95);

    // Verify gate passed with real metrics
    expect(decision).toBe('PROCEED');
  });
});
```

### Manual Validation

**Scenario:** Run orchestrator and verify test execution
```bash
# 1. Start orchestrator in standard mode
node .claude/skills/cfn-loop-orchestration/src/orchestrate.ts \
  --task-id manual-test-123 \
  --mode standard \
  --max-iterations 1

# 2. Verify test execution
# - Check test-results.json exists
# - Verify pass/fail counts are non-random
# - Confirm gate check uses real pass rate

# 3. Verify logs show:
# [COORDINATOR] Starting test execution for swarm: manual-test-123-iteration-1
# [COORDINATOR] Test execution complete in 12s (exit code: 0)
# [COORDINATOR] Results: 45/47 passed, 2 failed
```

---

## Success Criteria

**Definition of Done:**

1. ✅ Orchestrator calls `.claude/skills/cfn-test-execution/test-coordinator-pattern.sh` after Loop 3
2. ✅ Real tests execute on agent deliverables (not random data)
3. ✅ Test results parsed from `test-results.json` or Redis
4. ✅ Gate checks use actual pass rates (verified with logs)
5. ✅ Unit tests cover test execution, parsing, and error handling
6. ✅ Integration test validates end-to-end workflow
7. ✅ Manual validation confirms non-random test results

**Quality Metrics:**
- Gate accuracy: ≥95% (gates pass good code, fail broken code)
- Test execution timeout: <5 min per iteration
- Error handling: All failure modes logged with context
- Code coverage: ≥80% for new methods

**Confidence Score:** 0.90

---

## Related Documentation

- **Test Execution Skill:** `.claude/skills/cfn-test-execution/SKILL.md`
- **Orchestrator Quick Start:** `.claude/skills/cfn-loop-orchestration/ORCHESTRATOR_QUICK_START.md`
- **Test-Driven Validation Guide:** `docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md`
- **Anti-Pattern Prevention:** `docs/CFN_LOOP_ARCHITECTURE.md` (section on "consensus on vapor")

---

## Additional Notes

### Why This Is Critical

The test-driven validation system (v3.0) was designed to replace subjective confidence scoring (55% accuracy) with objective test execution (95%+ accuracy). Without real test execution, the entire system regresses to v1.x behavior.

**Risk Timeline:**
- **Now:** Mock data enables "consensus on vapor"
- **Short term:** Agents ship broken code that passes gates
- **Long term:** Users lose trust in CFN Loop quality validation

### Migration from v1.x Confidence Scoring

The confidence aggregator (`.claude/skills/cfn-loop-orchestration/src/helpers/confidence-aggregator.ts`) should be **deprecated** in favor of test-driven validation. Confidence scores were subjective agent assessments, not objective metrics.

**v1.x (Deprecated):**
- Agents report confidence: 0.85, 0.92, 0.88
- Average: 0.883
- No validation of actual work

**v3.0 (Test-Driven):**
- Tests run on deliverables: 45 pass, 2 fail
- Pass rate: 0.957 (95.7%)
- Objective validation of working code

### Backward Compatibility

If confidence scoring must be preserved for legacy workflows:
1. Keep confidence collection separate
2. Log confidence scores for audit trail
3. **Never use confidence for gate decisions**
4. Always use test pass rates as primary metric

---

**End of Bug Report**
