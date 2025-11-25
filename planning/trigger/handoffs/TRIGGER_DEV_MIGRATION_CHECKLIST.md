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

