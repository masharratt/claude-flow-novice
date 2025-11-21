# trigger.dev Migration: Execution Checklist

**Project:** CFN Loop → trigger.dev Migration
**Version:** v4.0.0
**Status:** [  ] Not Started | [  ] In Progress | [✅] Ready

---

## Phase 0: Infrastructure Setup (Days 1-2)

### 0.1 trigger.dev Deployment

**Files to Create:**
- [ ] `/docker/trigger.dev/docker-compose.yml`
  - [ ] Postgres service (5432)
  - [ ] Redis service (6379)
  - [ ] MinIO service (9000/9001)
  - [ ] ClickHouse service (8123/9000)
  - [ ] trigger.dev API (3030)
  - [ ] trigger.dev Web UI (3000)
- [ ] `/docker/trigger.dev/.env.template`
- [ ] `/docker/trigger.dev/init-postgres.sql`
- [ ] `/scripts/trigger-dev-setup.sh`
- [ ] `/docs/TRIGGER_DEV_SETUP.md`

**Verification:**
- [ ] `docker ps` shows 6+ services
- [ ] `curl http://localhost:3000` returns HTML
- [ ] Database migrations completed
- [ ] MinIO bucket created
- [ ] ClickHouse tables initialized

**Rollback:** `docker-compose down -v` (removes all volumes)

---

### 0.2 Network Configuration

**Files to Create:**
- [ ] `/scripts/trigger-dev-network.sh`
- [ ] `/docs/TRIGGER_DEV_NETWORKING.md`

**Verification:**
- [ ] Docker network created: `docker network ls`
- [ ] Services can reach each other via DNS
- [ ] Webhook endpoints externally accessible
- [ ] Environment variables injected correctly

**Checklist:**
- [ ] `docker exec trigger-api curl redis:6379` (succeeds)
- [ ] `docker exec trigger-api curl postgres:5432` (succeeds)
- [ ] `curl http://localhost:3030/webhooks` (returns JSON)

---

### 0.3 Integration Ports

**Files to Create:**
- [ ] `/src/integration/trigger-dev-adapter.ts`
- [ ] `/src/integration/trigger-dev-client.ts`
- [ ] `/src/types/trigger-dev-events.d.ts`

**Verification:**
- [ ] TypeScript compilation: `npx tsc --noEmit` (succeeds)
- [ ] Type definitions complete
- [ ] Mapping patterns documented
- [ ] No ESLint errors

---

## Phase 1: Core Workflow Implementation (Days 3-6)

### 1.1 Project Structure

**Files to Create:**
- [ ] `/trigger-dev/tsconfig.json`
- [ ] `/trigger-dev/package.json`
  - [ ] `@trigger.dev/sdk` dependency
  - [ ] TypeScript dev dependency
- [ ] `/trigger-dev/.env.template`
- [ ] `/trigger-dev/workflows/cfn-loop.workflow.ts`

**Directory Structure:**
- [ ] `/trigger-dev/workflows/` (4 files)
- [ ] `/trigger-dev/jobs/` (6-8 files)
- [ ] `/trigger-dev/webhooks/` (3-4 files)
- [ ] `/trigger-dev/types/` (3 files)
- [ ] `/trigger-dev/utils/` (6-8 files)

**Verification:**
- [ ] `npm install` completes
- [ ] `npx tsc --noEmit` (no errors)
- [ ] All .ts files compile

---

### 1.2 CFN Loop Workflow

**Files to Create:**
- [ ] `/trigger-dev/workflows/cfn-loop.workflow.ts` (1,200 LOC)

**Code Sections:**
- [ ] Trigger definition (webhook event)
- [ ] Context initialization
- [ ] Event emission for Loop 3
- [ ] Event emission for Loop 2
- [ ] Iteration control logic
- [ ] Completion handling

**Verification:**
- [ ] Workflow compiles: `npx tsc --noEmit`
- [ ] Exports correctly: `import { cfnLoopWorkflow }`
- [ ] Type checking passes
- [ ] No lint errors

**Tests:**
- [ ] Context initialization test
- [ ] Event emission test
- [ ] Iteration logic test

---

### 1.3 Loop Workflows

**Files to Create:**
- [ ] `/trigger-dev/workflows/loop3-executor.workflow.ts` (400 LOC)
- [ ] `/trigger-dev/workflows/loop2-validator.workflow.ts` (350 LOC)
- [ ] `/trigger-dev/workflows/po-decision.workflow.ts` (200 LOC)

**Loop 3 Workflow Verification:**
- [ ] Agent selection implemented
- [ ] Parallel spawning logic correct
- [ ] Webhook wait mechanisms working
- [ ] Result aggregation correct
- [ ] Event emission working

**Loop 2 Workflow Verification:**
- [ ] Validator selection implemented
- [ ] Score collection working
- [ ] Event emission correct

**PO Workflow Verification:**
- [ ] Agent spawning correct
- [ ] Decision parsing implemented
- [ ] Event routing correct

**Tests:**
- [ ] 3 tests per workflow (9 total)
- [ ] Coverage ≥85%

---

### 1.4 Gate Checking

**Files to Create:**
- [ ] `/trigger-dev/jobs/gate-check.job.ts`
- [ ] `/trigger-dev/utils/test-aggregator.ts`

**Verification:**
- [ ] Test result aggregation correct
- [ ] Pass rate calculation accurate
- [ ] Threshold comparison working
- [ ] Event routing correct
- [ ] Conditional branching working

**Tests:**
- [ ] Aggregation accuracy test
- [ ] Threshold enforcement test
- [ ] Event emission test
- [ ] Iteration trigger test

---

## Phase 2: Agent Spawning Migration (Days 7-10)

### 2.1 Job-Based Spawning

**Files to Create:**
- [ ] `/trigger-dev/jobs/spawn-agent.job.ts` (250 LOC)
- [ ] `/trigger-dev/jobs/agent-executor.job.ts` (300 LOC)
- [ ] `/src/integration/trigger-agent-bridge.ts` (200 LOC)

**Verification:**
- [ ] Job definitions compile
- [ ] Agent CLI invoked correctly
- [ ] Context passed to agents
- [ ] Timeout handling working
- [ ] Error handling correct

**Tests:**
- [ ] Job creation test
- [ ] Context serialization test
- [ ] Agent execution test
- [ ] Timeout test
- [ ] Error handling test

---

### 2.2 Webhook Completion Handlers

**Files to Create:**
- [ ] `/trigger-dev/webhooks/agent-completion.webhook.ts`

**Verification:**
- [ ] Webhook signature verified
- [ ] Payload validated
- [ ] Events emitted correctly
- [ ] Error handling robust
- [ ] Timeouts enforced

**Tests:**
- [ ] Valid payload test
- [ ] Invalid signature test
- [ ] Missing fields test
- [ ] Event emission test
- [ ] Timeout test

---

### 2.3 Context Injection

**Modifications to Make:**
- [ ] `/src/cli/agent-prompt-builder.ts` - Add webhook URL injection
- [ ] `/src/cli/agent-executor.ts` - Add webhook submission on completion

**Verification:**
- [ ] Webhook URL injected to context
- [ ] Context serializes correctly
- [ ] Agent receives context
- [ ] Agent sends webhook on completion
- [ ] All fields transmitted

**Tests:**
- [ ] Context serialization test
- [ ] Agent context parsing test
- [ ] Webhook submission test

---

### 2.4 Parallel Execution

**Files to Create:**
- [ ] `/trigger-dev/utils/parallel-executor.ts`

**Verification:**
- [ ] All agents spawn immediately (not sequentially)
- [ ] No delays between spawns
- [ ] Results collected efficiently
- [ ] Partial failures handled
- [ ] Performance improved

**Benchmarks:**
- [ ] Sequential vs parallel: > 50% faster
- [ ] 10 agents: < 5 minutes total
- [ ] No memory leaks

---

## Phase 3: Coordination Replacement (Days 11-14)

### 3.1 BLPOP Replacement

**Files to Delete:**
- [ ] `.claude/skills/cfn-coordination/` (complete directory)
- [ ] `.claude/skills/cfn-redis-coordination/` (complete directory)
- [ ] `.claude/skills/cfn-docker-redis-coordination/` (complete directory)
- [ ] `src/cli/coordination-wait.ts`
- [ ] `src/cli/coordination-signal.ts`
- [ ] `src/coordination/coordination-wrapper.ts`
- [ ] `src/types/coordination.d.ts`

**Files to Create:**
- [ ] `/trigger-dev/utils/event-aggregator.ts`
- [ ] `/src/integration/trigger-event-bus.ts`
- [ ] `/docs/TRIGGER_DEV_WEBHOOK_PROTOCOL.md`

**Verification:**
- [ ] `grep -r "BLPOP\|LPUSH\|LPOP" .` → 0 matches
- [ ] `grep -r "coordination-wait" .` → 0 matches
- [ ] `grep -r "coordination-signal" .` → 0 matches
- [ ] Webhook events propagate correctly
- [ ] No hanging processes

**Tests:**
- [ ] Event aggregation test
- [ ] Event ordering test
- [ ] Timeout test

---

### 3.2 Consensus Collection

**Files to Create:**
- [ ] `/trigger-dev/jobs/consensus-aggregator.job.ts`
- [ ] `/trigger-dev/utils/consensus-calculator.ts`

**Verification:**
- [ ] All validator scores collected
- [ ] Consensus calculated correctly (mean/median)
- [ ] Threshold comparison working
- [ ] Distribution calculated
- [ ] Results persisted

**Tests:**
- [ ] Consensus calculation accuracy test
- [ ] Threshold enforcement test
- [ ] Distribution calculation test
- [ ] Edge case test (single validator)

---

### 3.3 Iteration Management

**Files to Create:**
- [ ] `/trigger-dev/utils/iteration-state-manager.ts`
- [ ] `/trigger-dev/workflows/iteration-control.workflow.ts`

**Verification:**
- [ ] Iteration counter increments
- [ ] Max iterations enforced
- [ ] Backoff strategy prevents infinite loops
- [ ] Failure reasons recorded
- [ ] History persisted
- [ ] No Redis state calls

**Tests:**
- [ ] Iteration increment test
- [ ] Max iterations test
- [ ] Backoff strategy test
- [ ] History persistence test
- [ ] Re-iteration test

---

### 3.4 Product Owner Decision

**Files to Create:**
- [ ] `/trigger-dev/jobs/po-decision.job.ts`
- [ ] `/trigger-dev/utils/po-decision-parser.ts`
- [ ] `/trigger-dev/webhooks/po-completion.webhook.ts`

**Verification:**
- [ ] PO agent spawned correctly
- [ ] Decision parsed from output
- [ ] PROCEED/ITERATE/ABORT logic correct
- [ ] Feedback extracted
- [ ] No parsing errors

**Tests:**
- [ ] Decision parsing test
- [ ] Action routing test
- [ ] Feedback extraction test
- [ ] Invalid format test

---

## Phase 4: Deprecation & Removal (Days 15-18)

### 4.1 File Deletion

**Directories to Delete:**
- [ ] `.claude/skills/cfn-coordination/` (58 files, 150+ LOC)
- [ ] `.claude/skills/cfn-redis-coordination/` (40+ files, 800+ LOC)
- [ ] `.claude/skills/cfn-docker-redis-coordination/` (25+ files, 600+ LOC)

**Key Files to Delete:**
- [ ] `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh` (1,721 LOC)
- [ ] `src/cli/coordination-wait.ts` (235 LOC)
- [ ] `src/cli/coordination-signal.ts` (179 LOC)
- [ ] `src/coordination/coordination-wrapper.ts` (300+ LOC)
- [ ] `src/types/coordination.d.ts` (50+ LOC)
- [ ] `.claude/commands/cfn-loop-task.md`

**Verification:**
- [ ] All files deleted from git
- [ ] `git status` shows deletions only
- [ ] `git diff` shows only deletions
- [ ] No files remain in git

---

### 4.2 Partial Deletions

**Files to Modify (remove specific code sections):**

- [ ] `CLAUDE.md`
  - [ ] Remove Redis configuration sections (identify line ranges)
  - [ ] Remove coordination-wait documentation
  - [ ] Remove Task Mode references
  - [ ] Remove Redis troubleshooting

- [ ] `.claude/commands/cfn-loop-cli.md`
  - [ ] Remove Redis verification section
  - [ ] Remove Redis env vars documentation
  - [ ] Update examples (no Redis references)

- [ ] `src/cli/agent-prompt-builder.ts`
  - [ ] Remove BLPOP injection code
  - [ ] Remove Redis coordination context
  - [ ] Keep webhook URL injection

- [ ] `src/cli/orchestrator-cli.ts`
  - [ ] Remove all redis imports
  - [ ] Remove RedisCoordinator instantiation
  - [ ] Remove BLPOP/LPUSH patterns

- [ ] `package.json`
  - [ ] Remove redis dependency
  - [ ] Remove ioredis dependency
  - [ ] Remove @redis/client dependency
  - [ ] Add @trigger.dev/sdk
  - [ ] Add node-fetch

- [ ] `docker-compose.yml`
  - [ ] Remove redis service
  - [ ] Update environment variables

- [ ] `.github/workflows/test.yml`
  - [ ] Remove Redis startup step
  - [ ] Add trigger.dev startup

**Verification (after all changes):**
- [ ] `grep -r "redis-cli" . --exclude-dir=.git --exclude-dir=node_modules` → 0 matches
- [ ] `grep -r "BLPOP\|LPUSH" . --exclude-dir=.git --exclude-dir=node_modules` → 0 matches
- [ ] `grep -r "CFN_REDIS_" . --exclude-dir=.git --exclude-dir=node_modules` → 0 matches
- [ ] `npm list | grep redis` → empty
- [ ] `npm install` succeeds
- [ ] `npm run build` succeeds
- [ ] `npm run lint` succeeds
- [ ] No broken links in code

---

### 4.3 Task Mode Removal

- [ ] Delete `.claude/commands/cfn-loop-task.md`
- [ ] Delete `.claude/commands/cfn-docker/CFN_DOCKER_TASK.md` (if exists)
- [ ] Update `CLAUDE.md` - remove Task Mode section entirely
- [ ] Update `.claude/commands/cfn-loop-cli.md` - add deprecation notice
- [ ] Verify `grep -r "Task Mode" CLAUDE.md` → 0 matches

---

## Phase 5: Testing & Validation (Days 19-22)

### 5.1 Unit Tests

**Files to Create:**
- [ ] `/tests/trigger-dev/workflows.test.ts`
- [ ] `/tests/trigger-dev/jobs.test.ts`
- [ ] `/tests/trigger-dev/webhooks.test.ts`
- [ ] `/tests/trigger-dev/utils.test.ts`

**Coverage Targets:**
- [ ] Workflows: ≥85%
- [ ] Jobs: ≥85%
- [ ] Webhooks: ≥90%
- [ ] Utils: ≥85%

**Verification:**
- [ ] All tests pass: `npm test`
- [ ] Coverage report generated: `npm run test:coverage`
- [ ] No failing tests
- [ ] No skipped tests

---

### 5.2 E2E Tests

**Files to Create:**
- [ ] `/tests/trigger-dev/e2e-cfn-loop.test.ts`

**Test Scenarios:**
- [ ] Simple task (MVP mode, single iteration)
- [ ] Complex task (standard mode, multiple iterations)
- [ ] Gate failure + retry
- [ ] Consensus failure handling
- [ ] PO abort scenario
- [ ] Max iterations exceeded

**Verification:**
- [ ] All scenarios pass: `npm run test:e2e`
- [ ] No timeouts
- [ ] Results match expectations
- [ ] No flaky tests

---

### 5.3 Integration Tests

**Files to Create:**
- [ ] `/tests/trigger-dev/integration.test.ts`

**Scenarios:**
- [ ] Full workflow execution
- [ ] Webhook delivery and processing
- [ ] Event propagation
- [ ] Result persistence
- [ ] Error recovery

**Verification:**
- [ ] All tests pass
- [ ] No race conditions
- [ ] No deadlocks

---

### 5.4 Performance Benchmarks

**Files to Create:**
- [ ] `/tests/trigger-dev/performance.bench.ts`

**Benchmarks:**
- [ ] Agent spawn time: < 5s
- [ ] Webhook processing: < 2s
- [ ] Test aggregation: < 10s
- [ ] Consensus calculation: < 5s
- [ ] Full loop execution: < 600s (MVP mode)

**Verification:**
- [ ] All benchmarks pass
- [ ] Performance acceptable (< 5% regression from Redis)
- [ ] No memory leaks
- [ ] Baseline documented

---

## Phase 6: Documentation & Cleanup (Days 23-25)

### 6.1 Update Core Documentation

**Files to Modify:**
- [ ] `CLAUDE.md`
  - [ ] Remove Redis sections
  - [ ] Remove Task Mode sections
  - [ ] Update CFN Loop Overview
  - [ ] Add trigger.dev references

**Files to Create:**
- [ ] `/docs/TRIGGER_DEV_ARCHITECTURE.md`
- [ ] `/docs/WEBHOOK_PROTOCOL.md`
- [ ] `/docs/TRIGGER_DEV_DEPLOYMENT.md`

**Verification:**
- [ ] No broken links: `./scripts/validate-docs.sh`
- [ ] All references updated
- [ ] Examples correct

---

### 6.2 New Commands

**Files to Create/Modify:**
- [ ] `.claude/commands/cfn-loop-cli.md` (update)
- [ ] `.claude/commands/cfn-webhook.md` (new)
- [ ] `.claude/commands/cfn-dashboard.md` (new)

**Verification:**
- [ ] Commands work as documented
- [ ] Links to dashboards correct
- [ ] Examples executable

---

### 6.3 Runbooks

**Files to Create:**
- [ ] `/docs/runbooks/TRIGGER_DEV_SETUP.md`
- [ ] `/docs/runbooks/CFN_LOOP_TROUBLESHOOTING.md`
- [ ] `/docs/runbooks/WEBHOOK_DEBUGGING.md`

**Verification:**
- [ ] Steps tested by team
- [ ] All commands work
- [ ] Common issues covered

---

### 6.4 Deprecation Notices

**Files to Create:**
- [ ] `/DEPRECATION_NOTICE.md`
- [ ] `/MIGRATION_GUIDE.md`

**Verification:**
- [ ] Users see deprecation notices
- [ ] Migration path clear
- [ ] FAQ complete

---

## Final Verification Checklist

### Code Quality
- [ ] `npm run lint` → 0 errors
- [ ] `npm run build` → succeeds
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] ESLint: no warnings for production code

### Testing
- [ ] `npm test` → all pass
- [ ] `npm run test:e2e` → all pass
- [ ] Coverage ≥85%
- [ ] No flaky tests

### Redis Removal
- [ ] `grep -r "redis" . --exclude-dir=.git --exclude-dir=node_modules` → docs only
- [ ] `grep -r "BLPOP\|LPUSH\|LPOP" .` → 0 matches
- [ ] `grep -r "coordination-wait" .` → 0 matches
- [ ] `npm list redis` → empty

### Infrastructure
- [ ] trigger.dev services running
- [ ] Webhooks receiving events
- [ ] Dashboard accessible
- [ ] API responding

### Documentation
- [ ] All links valid
- [ ] Examples tested
- [ ] Runbooks complete
- [ ] No orphaned references

### Feature Validation
- [ ] `/cfn-loop-cli` works
- [ ] Results appear in dashboard
- [ ] All workflows execute
- [ ] Iterations work
- [ ] Gates enforced
- [ ] Consensus calculated
- [ ] PO decision processed

---

## Rollback Procedures

### Phase 0 Rollback
```bash
docker-compose -f docker/trigger.dev/docker-compose.yml down -v
```
**Result:** System remains on v3.9.9 (Redis-based)

### Phase 1-3 Rollback
```bash
git checkout main -- trigger-dev/
git checkout main -- src/integration/
```
**Result:** Revert to Redis-based orchestrate.sh

### Phase 4 Rollback (NOT POSSIBLE)
**Prevention:** Create backup branch before Phase 4
```bash
git checkout -b backup/pre-deprecation-v4.0.0
git push origin backup/pre-deprecation-v4.0.0
git tag -a v3.9.9-redis-final
git push origin v3.9.9-redis-final
```

### Phase 5-6 Rollback
```bash
npm install
git checkout main -- docs/
git checkout main -- CLAUDE.md
```
**Result:** Restore documentation to v4.0.0 baseline

---

## Phase 7: Production Readiness Validation (Days 26-30)

### 7.1 CFN Loop Compliance Validation

**Context:** CFN Loop iterations (2 iterations completed) identified critical gaps between test design and actual implementation quality.

**Files to Review:**
- [ ] `/mnt/c/Users/masha/Documents/trigger-test-app/jobs/cfn-loop.ts`
- [ ] `/mnt/c/Users/masha/Documents/claude-flow-novice/trigger-dev/tests/e2e/north-star-2-iteration-workflow.test.ts`
- [ ] `/mnt/c/Users/masha/Documents/claude-flow-novice/trigger-dev/tests/e2e/north-star-4-live-validation.test.ts`
- [ ] `/mnt/c/Users/masha/Documents/claude-flow-novice/trigger-dev/tests/e2e/north-star-5-deliverable-verification.test.ts`

**Critical Findings (Iteration 1 & 2):**

**Loop 3 Gate Results:**
- Iteration 1: 0.92 confidence (PASSED 0.75 threshold)
- Iteration 2: 0.915 confidence (PASSED 0.75 threshold)

**Loop 2 Consensus Results:**
- Iteration 1: 0.75 consensus (FAILED 0.90 threshold)
- Iteration 2: 0.57 consensus (FAILED - 24% WORSE)

**Root Cause - "Consensus on Vapor" Anti-Pattern:**
Agents designed comprehensive async architecture with event-driven patterns but implemented MOCK execution with `io.wait()` delays instead of real `io.waitForEvent()` coordination. Validators detected:
1. Dual execution pattern (events sent but results from local execution)
2. Test self-validation (test creates deliverables it validates)
3. Missing error handling and timeouts
4. High cyclomatic complexity without implementation

**TDD Protocol Violation:**
Agents reported 0.90+ confidence WITHOUT running tests:
- Code-analyzer: "13 TODO comments for RUNTIME_TEST" (no tests executed)
- Integration-tester: "Test will fail even when workflow is correct" (test bug acknowledged but not fixed)
- Agents wrote: Code → Documentation → Confidence (WRONG)
- Should write: Test (fail) → Code → Test (pass) → Confidence (RIGHT)

**Product Owner Decision:** ITERATE (both iterations)

---

### 7.2 Async Implementation Requirements

**Current State:** Mock delays with synchronous execution
```typescript
// ❌ WRONG - Mock delay (Iteration 1 & 2 implementation)
await io.wait("agent-cooldown", 2); // Simulated wait
const results = executeAgentsLocally(); // Synchronous

// Dual execution anti-pattern:
io.sendEvent('cfn.agent.run', payload); // Send event (unused)
const agentResults = await runAgentsSync(); // Execute locally (used)
```

**Required Implementation:** Real async event coordination
```typescript
// ✅ CORRECT - Real async coordination
await io.sendEvent('cfn.agent.run', payload);
const results = await io.waitForEvent('cfn.agent.complete', {
  timeout: { seconds: 600 },
  filter: { taskId: ctx.taskId }
});
```

**Validation Criteria:**
- [ ] ALL `io.wait()` mock delays removed from workflow
- [ ] ALL agent results obtained via `io.waitForEvent()`
- [ ] NO dual execution (events XOR local, not both)
- [ ] Agent completion events properly structured
- [ ] Timeout protection on all waitForEvent calls
- [ ] Error handling for event failures

**Tests:**
- [ ] Validate async event flow (no local execution)
- [ ] Validate timeout handling
- [ ] Validate event filtering by taskId
- [ ] Validate error propagation

---

### 7.3 Test Quality Standards

**Current Issues (Identified by Validators):**

**Issue 1: Test Self-Validation**
```typescript
// ❌ WRONG - Test creates what it validates
it('should create deliverable', async () => {
  const deliverableDir = `/tmp/trigger-dev-deliverables/${taskId}`;
  fs.mkdirSync(deliverableDir, { recursive: true }); // Test creates dir
  fs.writeFileSync(`${deliverableDir}/hello-world.txt`, 'content'); // Test creates file

  // Then validates what it just created
  expect(fs.existsSync(`${deliverableDir}/hello-world.txt`)).toBe(true);
});
```

**Required Pattern:**
```typescript
// ✅ CORRECT - Test validates workflow output
it('should create deliverable via workflow execution', async () => {
  const result = await sendEvent('cfn.loop.start', payload);
  expect(result.id).toBeDefined();

  // Poll for workflow-created file (not test-created)
  const deliverablePath = await waitForNewDeliverable(DELIVERABLES_BASE, 15000);
  expect(deliverablePath).toBeDefined();

  const content = await fs.readFile(deliverablePath, 'utf-8');
  expect(content).toContain('Hello'); // Validate actual workflow output
});
```

**Issue 2: Workflow Completion Verification**
Tests validate events are ACCEPTED but not that workflows COMPLETE successfully.

**Required Checks:**
- [ ] Event accepted (201/200 response)
- [ ] Workflow run started (query dashboard API)
- [ ] Workflow completed successfully (not FAILED or TIMEOUT)
- [ ] Deliverables created by workflow (not by test)
- [ ] Content matches expected output

**Issue 3: Force Override Logic Unimplemented**
`north-star-2-iteration-workflow.test.ts` sends `forceIteration` configs but workflow doesn't implement the logic.

**Required Implementation:**
```typescript
// In cfn-loop.ts workflow
if (payload.forceIteration) {
  const { gateResult, consensusResult, poDecision } = payload.forceIteration;

  // Override gate check
  if (gateResult === 'FAIL') {
    return { decision: 'ITERATE', reason: 'Forced gate failure' };
  }

  // Override consensus check
  if (consensusResult === 'FAIL') {
    return { decision: 'ITERATE', reason: 'Forced consensus failure' };
  }

  // Override PO decision
  return { decision: poDecision, reason: 'Forced decision' };
}
```

**Validation:**
- [ ] Force override logic implemented in workflow
- [ ] Tests validate forced gate failures trigger ITERATE
- [ ] Tests validate forced consensus failures trigger ITERATE
- [ ] Tests validate forced PO decisions are respected

---

### 7.4 TDD Protocol Enforcement

**Required Agent Workflow:**
1. **Write failing test FIRST** (before any implementation)
2. **Run test** (verify it fails for right reason)
3. **Implement minimal code** to make test pass
4. **Run test again** (verify it passes)
5. **Report confidence** based on test pass rate (not subjective)

**Validation Criteria:**
- [ ] Agent output includes test execution logs
- [ ] Test pass rate documented in agent reports
- [ ] Confidence scores derived from test results (not arbitrary)
- [ ] No "TODO" comments for tests (tests implemented and run)
- [ ] Test files exist and are executable

**Enforcement Mechanism:**
```typescript
// In agent-executor.ts
export async function executeAgent(params: AgentParams): Promise<AgentResult> {
  // 1. Agent writes test
  const testResult = await runTests(params.testCommand);

  // 2. Confidence = test pass rate (objective metric)
  const confidence = testResult.passRate;

  // 3. Report includes test logs
  return {
    confidence,
    testPassRate: testResult.passRate,
    testLogs: testResult.stdout,
    deliverablePath: testResult.deliverablePath,
  };
}
```

**Tests:**
- [ ] Validate agents execute tests before reporting confidence
- [ ] Validate confidence scores match test pass rates
- [ ] Validate test logs included in agent output
- [ ] Validate agents fail when tests don't exist

---

### 7.5 Error Handling & Timeout Protection

**Current State:** No error handling in workflow (Iteration 2 finding)

**Required Implementation:**

**Timeout Protection:**
```typescript
const results = await io.waitForEvent('cfn.agent.complete', {
  timeout: { seconds: 600 }, // 10 minute timeout
  filter: { taskId: ctx.taskId },
  timeoutMessage: 'Agent execution exceeded 10 minute limit',
});
```

**Error Handling:**
```typescript
try {
  const results = await io.waitForEvent('cfn.agent.complete', {
    timeout: { seconds: 600 },
  });
} catch (err) {
  if (err.code === 'TIMEOUT') {
    return { status: 'FAILED', reason: 'Agent timeout after 10 minutes' };
  }

  if (err.code === 'EVENT_NOT_FOUND') {
    return { status: 'FAILED', reason: 'Agent completion event not received' };
  }

  throw err; // Rethrow unexpected errors
}
```

**Validation Criteria:**
- [ ] All `io.waitForEvent()` calls have explicit timeouts
- [ ] Timeout errors logged and handled gracefully
- [ ] Partial failures don't crash entire workflow
- [ ] Error messages include actionable debugging info
- [ ] Failed agent runs trigger automatic retries (up to max iterations)

**Tests:**
- [ ] Simulate agent timeout (validate graceful failure)
- [ ] Simulate event delivery failure (validate error handling)
- [ ] Validate partial failures don't block remaining agents
- [ ] Validate error logs contain taskId and iteration context

---

### 7.6 Deliverable Creation in Workflow

**Current State:** Only tests create deliverables (Iteration 2 finding)

**Required Pattern:**
```typescript
// ✅ In cfn-loop.ts workflow (NOT in test)
run: async (payload, io, ctx) => {
  // ... execute loops ...

  // Create deliverable directory
  const deliverableDir = `/tmp/trigger-dev-deliverables/${ctx.taskId}`;
  await io.runTask('create-deliverable', async () => {
    await fs.mkdir(deliverableDir, { recursive: true });

    const filePath = path.join(deliverableDir, 'hello-world.txt');
    const content = `Hello, World!\n\nTask: ${payload.taskDescription}\nCompleted: ${new Date().toISOString()}\n`;
    await fs.writeFile(filePath, content);

    return { deliverablePath: filePath };
  });

  return {
    status: 'COMPLETED',
    deliverablePath: `${deliverableDir}/hello-world.txt`,
  };
}
```

**Validation:**
- [ ] Workflow creates deliverable files (not tests)
- [ ] Deliverable path returned in workflow result
- [ ] Tests validate deliverables exist after workflow completes
- [ ] File content matches expected format
- [ ] Directory structure correct (`/tmp/trigger-dev-deliverables/{taskId}/`)

---

### 7.7 Complexity Reduction

**Current State:** High cyclomatic complexity (Iteration 2 finding)

**Complexity Metrics:**
- cfn-loop.ts: 560 lines, complexity score TBD
- Loop 3 nested conditionals and iteration logic

**Refactoring Targets:**
- [ ] Extract gate check logic to separate function
- [ ] Extract consensus calculation to separate function
- [ ] Extract PO decision logic to separate function
- [ ] Extract iteration control to state machine pattern
- [ ] Reduce nesting depth (max 3 levels)

**Validation:**
- [ ] Cyclomatic complexity < 15 per function
- [ ] Nesting depth < 3 levels
- [ ] Each function has single responsibility
- [ ] Code coverage ≥90% after refactoring

---

### 7.8 Dashboard API Integration

**Current State:** Tests validate events accepted but not workflow completion

**Required Implementation:**
```typescript
// Query trigger.dev dashboard API for run status
async function waitForWorkflowCompletion(eventId: string, timeoutMs: number = 30000): Promise<WorkflowStatus> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(`${TRIGGER_API_URL}/api/v1/runs/${eventId}`, {
      headers: { Authorization: `Bearer ${TRIGGER_API_KEY}` },
    });

    const run = await response.json();

    if (run.status === 'COMPLETED') {
      return { status: 'COMPLETED', result: run.output };
    }

    if (run.status === 'FAILED') {
      return { status: 'FAILED', error: run.error };
    }

    await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2s
  }

  throw new Error(`Workflow ${eventId} did not complete within ${timeoutMs}ms`);
}
```

**Validation:**
- [ ] Tests query dashboard API for run status
- [ ] Tests validate COMPLETED status (not just event accepted)
- [ ] Tests validate workflow output matches expectations
- [ ] Tests handle FAILED status gracefully
- [ ] Tests include polling with timeout

---

### 7.9 Production Deployment Checklist

**Infrastructure:**
- [ ] trigger.dev self-hosted running (localhost:3040)
- [ ] Worker endpoint responding (localhost:3000/api/trigger)
- [ ] All 3 CFN Loop events registered (`cfn.loop.start`, `cfn.agent.run`, `cfn.gate.check`)
- [ ] Dashboard accessible and showing runs
- [ ] Database migrations applied
- [ ] Redis/Postgres/MinIO healthy

**Code Quality:**
- [ ] All `io.wait()` mocks replaced with `io.waitForEvent()`
- [ ] Test self-validation removed
- [ ] Force override logic implemented
- [ ] Error handling complete
- [ ] Timeout protection on all async operations
- [ ] Cyclomatic complexity reduced
- [ ] TDD protocols enforced in agents

**Testing:**
- [ ] North Star 2 (5-iteration workflow) passing
- [ ] North Star 4 (live validation) passing
- [ ] North Star 5 (deliverable verification) passing
- [ ] All tests use real async coordination (no mocks)
- [ ] Dashboard API integration validated
- [ ] 133+ tests passing with ≥85% coverage

**Documentation:**
- [ ] Async implementation patterns documented
- [ ] TDD enforcement documented for agent authors
- [ ] Error handling patterns documented
- [ ] Force override usage documented
- [ ] Dashboard API usage documented

**Performance:**
- [ ] 5-iteration workflow completes < 15 minutes
- [ ] No memory leaks during extended runs
- [ ] Event delivery < 2s
- [ ] Webhook processing < 2s

**Security:**
- [ ] API keys not hardcoded (use environment variables)
- [ ] Webhook signatures validated
- [ ] Input validation on all event payloads
- [ ] No sensitive data in logs

---

### 7.10 Go-Live Criteria

**All of the following MUST be true before production deployment:**

- [ ] **CFN Loop Validation:** Iteration 3+ achieves Loop 2 consensus ≥0.90
- [ ] **TDD Compliance:** All agents execute tests before reporting confidence
- [ ] **Async Implementation:** No mock delays, all `io.waitForEvent()` working
- [ ] **Test Quality:** No self-validation, all tests validate real workflow outputs
- [ ] **Error Handling:** All error paths tested and handled gracefully
- [ ] **Deliverable Creation:** Workflow creates files, tests validate (not create)
- [ ] **Dashboard Integration:** Tests validate workflow completion via API
- [ ] **Performance:** 5-iteration workflow < 15 minutes
- [ ] **Documentation:** All patterns documented with examples
- [ ] **Rollback Plan:** Tested and documented (git tags, backup branches)

**Sign-Off Required From:**
- [ ] Technical Lead (async implementation verified)
- [ ] QA Lead (all tests passing, TDD compliance verified)
- [ ] Product Owner (deliverables meet acceptance criteria)
- [ ] Infrastructure Lead (trigger.dev deployment stable)

---

## Approval Sign-Off

**Project Manager:** _________________ Date: _________

**Technical Lead:** _________________ Date: _________

**Infrastructure Lead:** _________________ Date: _________

**QA Lead:** _________________ Date: _________

---

## Migration Status Tracking

| Phase | Start Date | End Date | Status | Notes |
|-------|-----------|----------|--------|-------|
| Phase 0 | __________ | __________ | [ ] | Infrastructure setup |
| Phase 1 | __________ | __________ | [ ] | Core workflows |
| Phase 2 | __________ | __________ | [ ] | Agent spawning |
| Phase 3 | __________ | __________ | [ ] | Coordination |
| Phase 4 | __________ | __________ | [ ] | Deprecation |
| Phase 5 | __________ | __________ | [ ] | Testing |
| Phase 6 | __________ | __________ | [ ] | Documentation |

**Overall Status:** [  ] Not Started | [  ] In Progress | [  ] Completed

