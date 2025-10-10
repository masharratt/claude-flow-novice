# Validation Implementation Checklist
## Developer Quick Reference

**Project**: Automated Swarm Init & TodoWrite Batching Validation
**Timeline**: 7-8 hours total
**Target**: Upgrade SI-05 and TD-05 from PARTIAL PASS to PASS

---

## Pre-Implementation Setup

### Environment Preparation

- [ ] Read architecture document: `planning/VALIDATION_ARCHITECTURE.md`
- [ ] Review system diagram: `planning/VALIDATION_SYSTEM_DIAGRAM.txt`
- [ ] Read test requirements: `planning/AGENT_COORDINATION_TEST_STRATEGY.md` (lines 114-209)
- [ ] Review next steps: `test-results/next-steps.md` (lines 114-209)

### Create File Structure

```bash
# Create validators directory
mkdir -p src/validators/__tests__/integration

# Create types directory (if not exists)
mkdir -p src/types

# Create test result directories
mkdir -p test-results/validation-tests
```

---

## Day 1: Core Validators (4 hours)

### Task 1.1: Swarm Init Validator (2 hours)

**File**: `src/validators/swarm-init-validator.ts`

- [ ] Create `SwarmInitValidator` class
  - [ ] Constructor with config parameter
  - [ ] `validateSwarmInit(context)` method
  - [ ] `generateSwarmInitError(context)` method
  - [ ] `validateTopology(swarm, agentCount)` method
  - [ ] `recordSwarmInit(swarmId, topology, maxAgents)` method
  - [ ] `recordAgentSpawn(agentCount)` method

- [ ] Define interfaces in `src/types/validation.ts`
  - [ ] `SwarmInitValidationConfig`
  - [ ] `SwarmValidationContext`
  - [ ] `SwarmState`
  - [ ] `ValidationResult`
  - [ ] `ValidationError`

- [ ] Write unit tests: `src/validators/__tests__/swarm-init-validator.test.ts`
  - [ ] Test: Pass when swarm initialized
  - [ ] Test: Fail when swarm not initialized
  - [ ] Test: Suggest mesh topology for 2-7 agents
  - [ ] Test: Suggest hierarchical topology for 8+ agents
  - [ ] Test: Skip validation for single agent
  - [ ] Test: Warn when using mesh for 8+ agents
  - [ ] Test: Validate agent count vs maxAgents
  - [ ] **Target**: ≥90% code coverage

**Validation**: Run `npm test swarm-init-validator.test.ts` → All tests pass

---

### Task 1.2: TodoWrite Batch Validator (1.5 hours)

**File**: `src/validators/todowrite-batch-validator.ts`

- [ ] Create `TodoWriteBatchValidator` class
  - [ ] Constructor with config parameter
  - [ ] `validateBatchingPattern(itemCount, source)` method
  - [ ] `checkBatchSize(itemCount)` method
  - [ ] `checkCallFrequency()` method
  - [ ] `cleanOldCalls()` method
  - [ ] `loadCallLog()` method
  - [ ] `getBatchingStats()` method

- [ ] Define interfaces in `src/types/validation.ts`
  - [ ] `TodoWriteBatchConfig`
  - [ ] `TodoWriteCall`
  - [ ] `ValidationWarning`

- [ ] Write unit tests: `src/validators/__tests__/todowrite-batch-validator.test.ts`
  - [ ] Test: Pass for batch size >= 5
  - [ ] Test: Warn for small batch size
  - [ ] Test: Detect incremental anti-pattern
  - [ ] Test: Clean old calls outside time window
  - [ ] Test: Calculate accurate statistics
  - [ ] **Target**: ≥90% code coverage

**Validation**: Run `npm test todowrite-batch-validator.test.ts` → All tests pass

---

### Task 1.3: Validation State Manager (0.5 hours)

**File**: `src/validators/validation-state-manager.ts`

- [ ] Create `ValidationStateManager` class
  - [ ] Constructor with baseDir parameter
  - [ ] `getCurrentSwarmState()` method
  - [ ] `updateSwarmState(swarm)` method
  - [ ] `getTodoWriteLog()` method
  - [ ] `updateTodoWriteLog(log)` method
  - [ ] `recordValidation(type, result)` method
  - [ ] `getMetrics()` method
  - [ ] `loadState()` private method
  - [ ] `saveState()` private method
  - [ ] `getDefaultConfig()` private method
  - [ ] `clearState()` method

- [ ] Define interfaces in `src/types/validation.ts`
  - [ ] `ValidationState`
  - [ ] `ValidationMetrics`
  - [ ] `ValidationConfig`

- [ ] Write unit tests: `src/validators/__tests__/validation-state-manager.test.ts`
  - [ ] Test: Load state from disk
  - [ ] Test: Save state to disk
  - [ ] Test: Update swarm state
  - [ ] Test: Track validation metrics
  - [ ] Test: Clear state

**Validation**: Run `npm test validation-state-manager.test.ts` → All tests pass

---

## Day 2: Integration (2 hours)

### Task 2.1: Pre-Command Hook (1 hour)

**File**: `src/hooks/pre-command-validator.ts`

- [ ] Create pre-command validator hook
  - [ ] `preCommandValidator(command, args, options)` function
  - [ ] `registerValidationHooks()` function
  - [ ] `unregisterValidationHooks()` function
  - [ ] Command detection logic (swarm spawn, TodoWrite)
  - [ ] Parameter extraction logic
  - [ ] Validation result handling (pass/warn/block)

- [ ] Export validators from `src/validators/index.ts`
  - [ ] `SwarmInitValidator`
  - [ ] `TodoWriteBatchValidator`
  - [ ] `ValidationStateManager`
  - [ ] Helper functions: `validateSwarmInit`, `validateTodoWriteBatch`

**Validation**: Hook functions compile without errors

---

### Task 2.2: CLI Integration (1 hour)

**File**: `src/cli/commands/swarm.ts` (UPDATE)

- [ ] Import validation functions
  ```typescript
  import { validateSwarmInit, recordSwarmInit, recordAgentSpawn } from '../../validators';
  ```

- [ ] Add validation to `swarmSpawnAction()`
  - [ ] Call `validateSwarmInit(agentCount)` before spawning
  - [ ] Handle validation result (warn/block modes)
  - [ ] Display error messages with fixes
  - [ ] Call `recordAgentSpawn(agentCount)` after spawning

- [ ] Add recording to `swarmInitAction()`
  - [ ] Call `recordSwarmInit(swarmId, topology, maxAgents)` after init

- [ ] Add CLI flags
  - [ ] `--validate-swarm-init` (default: true)
  - [ ] `--no-validate-swarm-init`
  - [ ] `--block-on-swarm-fail`
  - [ ] Update help text

**File**: `src/cli/commands/agent.ts` (UPDATE)

- [ ] Import validation functions
- [ ] Add validation to agent spawn commands
- [ ] Add CLI flags

**File**: `src/cli/commands/validate.ts` (NEW)

- [ ] Create validation management commands
  - [ ] `validate config --show`
  - [ ] `validate config --set <key>=<value>`
  - [ ] `validate metrics`
  - [ ] `validate todowrite --show-stats`
  - [ ] `validate todowrite --clear-log`

**Validation**:
- Run `npx claude-flow-novice swarm --help` → New flags shown
- Run `npx claude-flow-novice validate config --show` → Config displayed

---

## Day 3: Testing & Validation (1.5 hours)

### Task 3.1: Integration Tests (0.5 hours)

**File**: `src/validators/__tests__/integration/validation-flow.test.ts`

- [ ] Test: CLI swarm spawn with validation
  - [ ] Spawn without swarm init → BLOCKED
  - [ ] Spawn after swarm init → PASS
  - [ ] Spawn with --no-validate → SKIP

- [ ] Test: Blocking vs warning modes
  - [ ] Mode: warn → Display warnings, continue
  - [ ] Mode: block → Display errors, exit 1

- [ ] Test: TodoWrite batching validation
  - [ ] Single large batch → PASS
  - [ ] Multiple small batches → WARNING
  - [ ] Small batch with --no-validate → SKIP

- [ ] Test: Configuration loading
  - [ ] Load from file
  - [ ] Override with CLI flags
  - [ ] Environment variables

**Validation**: Run `npm test integration/validation-flow.test.ts` → All tests pass

---

### Task 3.2: E2E Test Scenarios (0.5 hours)

**Re-run SI-05 Test** (Swarm Init Validation)

- [ ] Test Scenario: Spawn 3 agents without swarm init
  ```bash
  # Should BLOCK with clear error message
  npx claude-flow-novice swarm spawn --agents 3 --validate-swarm-init
  ```

  **Expected Result**:
  - Exit code: 1
  - Error message: SWARM_NOT_INITIALIZED
  - Fix commands displayed
  - Topology suggestion: mesh

  **Status**: PARTIAL PASS → **PASS** ✅

- [ ] Test Scenario: Spawn 3 agents after swarm init
  ```bash
  npx claude-flow-novice swarm init --topology mesh --max-agents 3
  npx claude-flow-novice swarm spawn --agents 3 --validate-swarm-init
  ```

  **Expected Result**:
  - Exit code: 0
  - Validation passed
  - Agents spawned successfully

**Re-run TD-05 Test** (TodoWrite Batching Validation)

- [ ] Test Scenario: Multiple small TodoWrite calls
  ```bash
  # Simulate 3 TodoWrite calls with small batches
  # Should detect anti-pattern and WARN
  ```

  **Expected Result**:
  - Warning displayed
  - Anti-pattern detected message
  - Recommendation shown
  - Execution continues

  **Status**: PARTIAL PASS → **PASS** ✅

**Validation**: Both SI-05 and TD-05 tests upgraded to PASS

---

### Task 3.3: Documentation Updates (0.5 hours)

- [ ] Update `docs/validation-guide.md` (CREATE NEW)
  - [ ] Overview of validation system
  - [ ] Configuration options
  - [ ] CLI flags reference
  - [ ] Error code catalog
  - [ ] Examples and use cases

- [ ] Update `CLAUDE.md` (if needed)
  - [ ] Reference automated validation
  - [ ] Link to validation guide

- [ ] Update test results
  - [ ] `test-results/validation-tests/SI-05-automated.md`
  - [ ] `test-results/validation-tests/TD-05-automated.md`

**Validation**: Documentation is clear and comprehensive

---

## Final Validation Checklist

### Functional Requirements

- [ ] **SI-05 Test**: Multi-agent spawn without swarm init is BLOCKED
- [ ] **TD-05 Test**: Multiple TodoWrite calls trigger WARNING
- [ ] No breaking changes to existing workflows
- [ ] Default mode is `warn` (non-blocking)
- [ ] Users can opt-in to `block` mode via config

### Quality Requirements

- [ ] Unit test coverage ≥90%
  - Run: `npm test -- --coverage`
  - Check: `coverage/lcov-report/index.html`

- [ ] All integration tests passing
  - Run: `npm test integration`

- [ ] E2E tests passing (SI-05, TD-05)
  - Manually run test scenarios
  - Document results

- [ ] Validation latency <100ms
  - Add performance logging
  - Measure validation time

### Code Quality

- [ ] TypeScript compilation: `npm run build` → No errors
- [ ] Linting: `npm run lint` → No errors
- [ ] Type checking: `npm run type-check` → No errors
- [ ] Code formatted: `npm run format` → Consistent style

### Documentation

- [ ] Architecture document complete
- [ ] API documentation in code
- [ ] User guide created
- [ ] Test results documented
- [ ] README updated (if needed)

---

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Code reviewed
- [ ] Documentation complete
- [ ] Metrics tracking verified

### Deployment

- [ ] Merge to main branch
- [ ] Tag release: `v1.x.x-validation`
- [ ] Deploy to package registry (if applicable)

### Post-Deployment

- [ ] Monitor validation metrics
- [ ] Collect user feedback
- [ ] Track SI-05 and TD-05 test results
- [ ] Measure compliance rate improvement

---

## Troubleshooting Guide

### Common Issues

**Issue**: Tests failing with "Cannot find module"
**Fix**: Run `npm install` to ensure dependencies installed

**Issue**: State file not persisting
**Fix**: Check `.claude-flow/` directory permissions

**Issue**: Validation always passes even when it should fail
**Fix**: Verify `mode` in config is not set to `disabled`

**Issue**: Performance slower than expected
**Fix**: Check file I/O bottlenecks, enable caching

---

## Success Metrics

### Immediate Metrics (Day 3)

- ✅ SI-05 test: PARTIAL PASS → **PASS**
- ✅ TD-05 test: PARTIAL PASS → **PASS**
- ✅ Unit test coverage: **≥90%**
- ✅ Validation latency: **<100ms**

### Long-Term Metrics (Week 1-2)

- 📊 Compliance rate: Target **≥95%**
- 📊 False positive rate: Target **<5%**
- 📊 User adoption: Track flag usage
- 📊 Performance impact: Monitor validation overhead

---

## Reference Commands

### Development

```bash
# Run all tests
npm test

# Run specific test file
npm test swarm-init-validator.test.ts

# Run tests with coverage
npm test -- --coverage

# Watch mode for development
npm test -- --watch

# Build project
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

### Testing Validation

```bash
# Test swarm init validation
npx claude-flow-novice swarm spawn --agents 3 --validate-swarm-init

# Test with blocking mode
npx claude-flow-novice swarm spawn --agents 3 --block-on-swarm-fail

# Skip validation
npx claude-flow-novice swarm spawn --agents 3 --no-validate

# View validation config
npx claude-flow-novice validate config --show

# View metrics
npx claude-flow-novice validate metrics

# View TodoWrite stats
npx claude-flow-novice validate todowrite --show-stats
```

---

## Team Coordination

### Code Owners

- **Architecture**: System Architect Agent
- **Implementation**: Coder Agent(s)
- **Testing**: Tester Agent
- **Review**: Reviewer Agent
- **Security**: Security Specialist Agent

### Communication

- **Daily Standup**: Share progress, blockers
- **Code Review**: All PRs reviewed before merge
- **Testing**: Tester validates each component
- **Documentation**: Update as you implement

---

## Completion Criteria

### Definition of Done

A feature/task is "done" when:

- ✅ Code implemented according to spec
- ✅ Unit tests written and passing (≥90% coverage)
- ✅ Integration tests passing
- ✅ Code reviewed and approved
- ✅ Documentation updated
- ✅ No regressions in existing tests
- ✅ Performance targets met

### Final Sign-Off

- [ ] All tasks completed
- [ ] All tests passing
- [ ] Documentation complete
- [ ] SI-05 and TD-05 tests PASS
- [ ] Code reviewed by Reviewer Agent
- [ ] Security reviewed by Security Specialist Agent
- [ ] Approved for production deployment

---

**Last Updated**: 2025-09-30
**Checklist Version**: 1.0
**Status**: Ready for Implementation

**Next Step**: Begin Day 1 - Task 1.1 (Swarm Init Validator)

