# CFN Loop Full E2E Integration Tests

## Overview

These tests exercise the **complete holistic flow** of the CFN Loop system - from initial task submission through decomposition, implementation, validation, and final consensus decision.

**Unlike other tests in this project**, these are NOT simulations. They trigger REAL Trigger.dev tasks and validate actual outputs, handoffs, and decisions.

## Prerequisites

1. **Trigger.dev v4 Infrastructure Running**
   ```bash
   cd docker/trigger-dev-v4/hosting/docker
   docker compose -f webapp/docker-compose.yml -f worker/docker-compose.yml up -d
   ```

2. **Trigger.dev Dev Server Running**
   ```bash
   cd docker/trigger-dev
   npx trigger.dev@latest dev --profile self-hosted-v4
   ```

3. **Environment Variables**
   ```bash
   export TRIGGER_SECRET_KEY="tr_dev_ffR3mLELFuaaA0txq0lO"
   export TRIGGER_API_URL="http://localhost:8030"
   ```

## Running Tests

### Run All E2E Tests
```bash
cd docker/trigger-dev
TRIGGER_SECRET_KEY=tr_dev_ffR3mLELFuaaA0txq0lO npm test -- tests/e2e/ --runInBand
```

### Run Single Test Suite
```bash
# Full flow test only
npm test -- tests/e2e/full-cfn-loop-e2e.test.ts -t "Simple Task" --runInBand

# ITERATE flow test only
npm test -- tests/e2e/full-cfn-loop-e2e.test.ts -t "ITERATE Flow" --runInBand

# Context handoff test only
npm test -- tests/e2e/full-cfn-loop-e2e.test.ts -t "Context Handoff" --runInBand
```

## Test Suites

### Suite 1: Simple Task - Full Flow to PROCEED
Tests the happy path: simple task → decomposition → implementation → validation → PROCEED

**Validates:**
- 4-stage decomposition produces micro-tasks
- All perspectives (architecture, security, performance, testing) present
- Implementers execute and create files
- Validators reach consensus
- Gate check returns PROCEED
- Files are created with correct content

### Suite 2: ITERATE Flow - Troubleshooting Loop
Tests the error recovery path by using enterprise mode (98% threshold)

**Validates:**
- Strict threshold triggers ITERATE decision
- Troubleshooting decomposer generates fix tasks
- Root cause analysis produces actionable items
- Fix impact estimates are calculated

### Suite 3: Context Handoff Validation
Tests that context flows correctly through the 4 sequential decomposers

**Validates:**
- Architecture decomposer produces baseline
- Security decomposer receives and uses architecture context
- Performance decomposer receives combined context
- Testing decomposer has full visibility
- Phase timing metrics prove sequential execution

### Suite 4: Validator Consensus Mechanism
Tests the 5-validator parallel execution and consensus calculation

**Validates:**
- All 5 validators execute (security, performance, testing, architecture, code-quality)
- Timeouts are handled gracefully
- Consensus requires 3/5 validators
- Overall score calculated correctly
- Escalations flagged for critical validators

### Suite 5: Gate Check Decision Logic
Tests that gate check thresholds are applied correctly per mode

**Validates:**
- MVP: 70% threshold
- Standard: 95% threshold
- Enterprise: 98% threshold
- Decision matches score vs threshold
- Reasoning is populated

### Suite 6: MDAP Integration Verification
Tests that MDAP metrics are captured during implementation

**Validates:**
- Model tier selection based on complexity
- Execution results include confidence scores
- Duration metrics captured
- Success/failure tracking

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  E2E TEST FLOW                                                  │
│                                                                 │
│  Task Description                                               │
│        ↓                                                        │
│  tasks.trigger("cfn-coordinator")                               │
│        ↓                                                        │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ PHASE 1: Sequential Decomposition                    │       │
│  │   1. Architecture Decomposer (baseline)              │       │
│  │   2. Security Decomposer (+arch context)             │       │
│  │   3. Performance Decomposer (+arch+sec context)      │       │
│  │   4. Testing Decomposer (+all context)               │       │
│  │   5. Merge into DecompositionPlan                    │       │
│  └─────────────────────────────────────────────────────┘       │
│        ↓                                                        │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ PHASE 2: Implementation                              │       │
│  │   - cfn-implementer-v2 for each micro-task          │       │
│  │   - MDAP tier selection                              │       │
│  │   - Actual file creation                             │       │
│  │   - Test execution                                   │       │
│  └─────────────────────────────────────────────────────┘       │
│        ↓                                                        │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ PHASE 3: Async Validation                            │       │
│  │   - 5 validators in parallel                         │       │
│  │   - Security, Performance, Testing, Arch, Quality    │       │
│  │   - 30s timeout per validator                        │       │
│  │   - Quorum check (3/5 minimum)                       │       │
│  └─────────────────────────────────────────────────────┘       │
│        ↓                                                        │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ PHASE 4: Gate Check                                  │       │
│  │   - Composite score calculation                      │       │
│  │   - Mode threshold comparison                        │       │
│  │   - Decision: PROCEED / ITERATE / ABORT              │       │
│  └─────────────────────────────────────────────────────┘       │
│        ↓                                                        │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ PHASE 5A (if PROCEED): Final Validation              │       │
│  │   - Approval confirmation                            │       │
│  │   - Final status: COMPLETED                          │       │
│  └─────────────────────────────────────────────────────┘       │
│        ↓                                                        │
│  ┌─────────────────────────────────────────────────────┐       │
│  │ PHASE 5B (if ITERATE): Troubleshooting               │       │
│  │   - cfn-troubleshooting-decomposer                   │       │
│  │   - Root cause analysis                              │       │
│  │   - Fix task generation                              │       │
│  │   - Loop back to implementation                      │       │
│  └─────────────────────────────────────────────────────┘       │
│        ↓                                                        │
│  runs.poll() returns CFNCoordinatorResult                       │
│        ↓                                                        │
│  ASSERTIONS                                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Timing Expectations

| Test Suite | Expected Duration | Notes |
|------------|------------------|-------|
| Suite 1: Simple Task | 60-120s | Full flow, simple complexity |
| Suite 2: ITERATE Flow | 90-180s | May trigger troubleshooting |
| Suite 3: Context Handoff | 60-120s | Standard mode |
| Suite 4: Validator Consensus | 60-90s | MVP mode, simple task |
| Suite 5: Gate Check | 60-90s | MVP mode, simple task |
| Suite 6: MDAP Integration | 60-90s | MVP mode, simple task |

**Total E2E Suite: 6-12 minutes**

## Troubleshooting

### "Task timed out after 300000ms"
- Check that the Trigger.dev dev server is running
- Verify the coordinator task is registered
- Check logs: `docker logs trigger-webapp-1`

### "Invalid API Key (401)"
- Use Secret Key (`tr_dev_*`), NOT PAT (`tr_pat_*`)
- Verify key is exported: `echo $TRIGGER_SECRET_KEY`

### "Task failed with status: FAILED"
- Check coordinator logs in Trigger.dev dashboard
- Look for decomposer or implementer errors
- Verify work directory is writable

### Tests pass but files not created
- Check work directory permissions
- Verify implementer has write access to /tmp
- Check execution results for actual file paths

## Coverage Matrix

| Component | Covered | Test Suite |
|-----------|---------|------------|
| cfn-coordinator | ✓ | All suites |
| cfn-architecture-decomposer | ✓ | Suite 1, 3 |
| cfn-security-decomposer | ✓ | Suite 1, 3 |
| cfn-performance-decomposer | ✓ | Suite 1, 3 |
| cfn-testing-decomposer | ✓ | Suite 1, 3 |
| cfn-implementer-v2 | ✓ | Suite 1, 6 |
| cfn-async-validator-orchestrator | ✓ | Suite 4 |
| cfn-troubleshooting-decomposer | ✓ | Suite 2 |
| Gate check logic | ✓ | Suite 5 |
| MDAP metrics | ✓ | Suite 6 |
| Context passing | ✓ | Suite 3 |
| Consensus calculation | ✓ | Suite 4 |
