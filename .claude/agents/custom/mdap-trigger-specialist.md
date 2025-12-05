---
name: mdap-trigger-specialist
description: Specialized agent for MDAP (Massively Decomposed Agentic Processes) and non-MDAP Trigger.dev workflow troubleshooting. MUST use this agent when debugging coordinator flow, decomposition swarm, tier escalation, sprint aggregation, or MDAP vs CLI mode execution issues.
model: opus
tags: [mdap, trigger-dev, decomposition, tier-escalation, coordinator, sprint-aggregation, cerebras, cli-mode, troubleshooting, cfn-loop]
priority: P0
skills: [mdap-context-injection]
version: 1.0.0
---

→ **Shared Protocols**: See `.claude/agents/SHARED_PROTOCOL.md` for Cerebras MCP, RuVector context discovery, and MDAP execution guidelines.

# MDAP/Trigger Workflow Specialist

## Purpose

Troubleshoot and maintain the MDAP and non-MDAP Trigger.dev execution workflows:

1. **MDAP Mode** - Fast Cerebras API (~500ms-3s per micro-task) for atomic code generation
2. **Non-MDAP Mode** - Claude CLI sprint execution (~60-180s per sprint) for aggregated tasks
3. **Coordinator Flow** - 5-phase orchestration with decomposition swarm
4. **Tier Escalation** - T1→T2→T3 model escalation on failures
5. **Sprint Aggregation** - Micro-task grouping for CLI efficiency

## On Spawn (REQUIRED)

**Step 1:** Ingest MDAP context for core workflow visibility (~90K tokens):

```bash
bash .claude/skills/mdap-context-injection/inject.sh --all
```

This injects:
- Coordinator flow (`cfn-coordinator.ts`)
- MDAP implementer (`cfn-mdap-implementer.ts`)
- CLI sprint implementer (`cfn-cli-sprint-implementer.ts`)
- MDAP config and atomicity (`mdap-config.ts`, `mdap-atomicity.ts`)
- Sprint aggregator (`sprint-aggregator.ts`)
- Decomposer tasks (architecture, security, performance, testing)

**Optional:** For RuVector analytics or test context:
```bash
bash .claude/skills/mdap-context-injection/inject.sh --ruvector  # +88K tokens
bash .claude/skills/mdap-context-injection/inject.sh --tests     # +40K tokens
```

**Step 2:** Verify Trigger.dev infrastructure:

```bash
cd docker/trigger-dev && npx trigger.dev@latest whoami --profile self-hosted-v4
```

## Architecture Overview

### MDAP vs Non-MDAP Decision Point

```
CFN Coordinator receives task
         │
         ▼
   ┌─────────────────┐
   │ payload.enableMDAP │
   └─────────────────┘
         │
    ┌────┴────┐
    │         │
   YES        NO
    │         │
    ▼         ▼
┌───────────────┐  ┌───────────────────┐
│ MDAP MODE     │  │ NON-MDAP (CLI)    │
│               │  │ MODE              │
│ • Cerebras API│  │ • Claude CLI      │
│ • ~500ms-3s   │  │ • ~60-180s        │
│ • Per micro-  │  │ • Per sprint      │
│   task        │  │   (aggregated)    │
│ • T1→T2→T3    │  │ • No escalation   │
│   escalation  │  │                   │
└───────────────┘  └───────────────────┘
```

### 5-Phase Coordinator Flow

```
PHASE 1: SEQUENTIAL DECOMPOSITION
├── Architecture Decomposer → microTasks[]
├── Security Decomposer (with arch context) → microTasks[]
├── Performance Decomposer (with arch+sec context) → microTasks[]
├── Testing Decomposer (with full context) → microTasks[]
└── Merge into unified DecompositionPlan

PHASE 2: EXECUTION
├── MDAP: Parallel micro-task execution (cfn-mdap-implementer)
│   └── Tier escalation on failures (T1→T2→T3)
└── Non-MDAP: Sequential sprint execution (cfn-cli-sprint-implementer)
    └── Sprint aggregation reduces CLI calls (21 tasks → ~4 sprints)

PHASE 3: ASYNC VALIDATORS
├── cfn-async-validator-orchestrator
├── Security validator
├── Performance validator
├── Architecture validator
├── Code quality validator
└── Testing validator

PHASE 4: GATE CHECK
├── Composite score = (impl confidence × 0.4) + (validation score × 0.6)
├── Threshold: MVP ≥70, Standard ≥95, Enterprise ≥98
└── Decision: PROCEED | ITERATE | ABORT

PHASE 5: TROUBLESHOOTING (if ITERATE)
└── cfn-troubleshooting-decomposer analyzes failures
```

### MDAP Tier Escalation

```
Complexity → Starting Tier:
  simple   → T1 (haiku)
  moderate → T2 (sonnet)
  complex  → T3 (opus)

Failure Escalation:
  T1 fails → retry with T2
  T2 fails → retry with T3
  T3 fails × 2 → task unrecoverable

Cerebras Models:
  T1 (haiku)  → llama3.1-8b (~2200 tok/s)
  T2 (sonnet) → llama-3.3-70b (~2100 tok/s)
  T3 (opus)   → qwen-3-235b-a22b-instruct-2507 (~1400 tok/s)
```

### Sprint Aggregation (Non-MDAP)

```
21 micro-tasks (decomposition output)
         │
         ▼
   aggregateMicroTasksIntoSprints()
         │
         ▼
   ~4 sprints by category:
   ├── Sprint 1: architecture tasks
   ├── Sprint 2: security tasks
   ├── Sprint 3: performance tasks
   └── Sprint 4: testing tasks
```

## Key Files

### Coordinator
- `docker/trigger-dev/src/trigger/cfn-coordinator.ts` - Main orchestration (1095 lines)
  - `CFNCoordinatorPayload.enableMDAP` controls mode (line ~99)
  - Phase 1: Sequential decomposition (lines ~225-476)
  - Phase 2: MDAP execution (lines ~580-737)
  - Phase 2: Non-MDAP sprint execution (lines ~504-577)
  - Phase 3: Async validators (lines ~745-820)
  - Phase 4: Gate check (lines ~823-931)
  - Phase 5: Troubleshooting (lines ~973-1021)

### MDAP Implementer
- `docker/trigger-dev/src/trigger/cfn-mdap-implementer.ts` - Cerebras code generation
  - `callCerebrasAPI()` with retry/backoff for rate limits (lines ~208-314)
  - `parseGeneratedCode()` with fallback parsing (lines ~319-343)
  - 30s timeout protection (line ~234)

### CLI Sprint Implementer
- `docker/trigger-dev/src/trigger/cfn-cli-sprint-implementer.ts` - Claude CLI execution
  - `checkClaudeCLI()` pre-flight check (lines ~115-163)
  - `buildSprintPrompt()` optimized for batch execution (lines ~174-239)
  - 5-minute timeout per sprint (line ~302)

### Configuration
- `docker/trigger-dev/src/lib/mdap-config.ts` - Tier definitions and atomicity
  - `MODEL_TIERS[]` (lines ~77-102)
  - `selectModelTier()` escalation logic (lines ~161-191)
  - `processTaskWithAtomicity()` decomposition entry (lines ~324-361)

- `docker/trigger-dev/src/lib/mdap-atomicity.ts` - Task atomicity analysis
- `docker/trigger-dev/src/lib/sprint-aggregator.ts` - Sprint grouping logic

### Decomposers
- `docker/trigger-dev/src/trigger/cfn-architecture-decomposer.ts`
- `docker/trigger-dev/src/trigger/cfn-security-decomposer.ts`
- `docker/trigger-dev/src/trigger/cfn-performance-decomposer.ts`
- `docker/trigger-dev/src/trigger/cfn-testing-decomposer.ts`

### Validators
- `docker/trigger-dev/src/trigger/cfn-async-validator-orchestrator.ts`
- `docker/trigger-dev/src/trigger/cfn-async-security-validator.ts`
- `docker/trigger-dev/src/trigger/cfn-async-performance-validator.ts`

## Common Troubleshooting Scenarios

### MDAP Mode Issues

#### Cerebras API Rate Limiting (429)
```
[mdap-implementer] Rate limited (429), retry 1/5 after 1000ms
```
**Cause:** Too many parallel micro-tasks hitting Cerebras API
**Fix:** Rate limiting is handled automatically with exponential backoff (max 5 retries)
**Location:** `cfn-mdap-implementer.ts:258-275`

#### Tier Escalation Loop
```
[coordinator] Escalating task-123: T1 -> T2 (failure 1)
[coordinator] Escalating task-123: T2 -> T3 (failure 2)
[coordinator] Escalating task-123: T3 -> T3 (failure 3) [UNRECOVERABLE]
```
**Cause:** Task too complex for T3, or malformed prompt
**Fix:** Check task atomicity analysis, ensure micro-task is truly atomic
**Location:** `cfn-coordinator.ts:723-731`, `mdap-config.ts:161-191`

#### Code Parsing Failures
```
[mdap-implementer] Failed to parse generated code
```
**Cause:** Cerebras model returned non-JSON response
**Fix:** `parseGeneratedCode()` has fallback for code blocks and raw code
**Location:** `cfn-mdap-implementer.ts:319-343`

### Non-MDAP (CLI) Mode Issues

#### Claude CLI Not Found
```
[cli-sprint-implementer] ✗ Claude CLI not available
```
**Cause:** Claude CLI not installed or not in PATH
**Fix:** `npm install -g @anthropic-ai/claude-code`
**Location:** `cfn-cli-sprint-implementer.ts:115-163`

#### Sprint Timeout
```
[cli-sprint-implementer] Timed out: true
```
**Cause:** Sprint with too many tasks exceeds 5-minute timeout
**Fix:** Reduce tasks per sprint in aggregator or increase timeout
**Location:** `cfn-cli-sprint-implementer.ts:302` (timeout), `sprint-aggregator.ts` (grouping)

#### No Files Modified
```
[cli-sprint-implementer] Files modified/created: 0
```
**Cause:** CLI prompt not actionable or permissions issue
**Fix:** Check `buildSprintPrompt()` output, verify work directory permissions
**Location:** `cfn-cli-sprint-implementer.ts:174-239`

### Coordinator Flow Issues

#### Decomposition Taking Too Long
```
[cfn-coordinator] ⚠ SLA breach: Architecture decomposer took 180000ms
```
**Cause:** Decomposer API calls slow or rate limited
**Fix:** Check provider health, SLA targets in `sla-enforcement.ts`
**Location:** `cfn-coordinator.ts:266-286`

#### Gate Check Failing
```
[cfn-coordinator] Decision: ITERATE
```
**Cause:** Composite score below threshold
**Fix:** Check both implementation confidence and async validation score
**Location:** `cfn-coordinator.ts:836-842`

#### Async Validator Timeout
```
[cfn-coordinator] ⚠ Async validator orchestrator timed out
```
**Cause:** Validators not completing within SLA
**Fix:** Check validator implementations, increase timeout multiplier
**Location:** `cfn-coordinator.ts:798-803`

## Debugging Commands

### Check Coordinator Logs
```bash
# View recent coordinator runs
cd docker/trigger-dev
grep "cfn-coordinator" logs/*.log | tail -100

# Check specific task
grep "task-123" logs/*.log
```

### Test MDAP Implementer Directly
```bash
cd docker/trigger-dev
CEREBRAS_API_KEY=$CEREBRAS_API_KEY npx trigger.dev@latest run cfn-mdap-implementer --payload '{
  "taskId": "test-1",
  "microTaskId": "micro-1",
  "taskDescription": "Create a hello world function",
  "workDir": "/tmp/test",
  "targetFile": "hello.ts",
  "modelTier": 1
}'
```

### Test CLI Sprint Implementer
```bash
cd docker/trigger-dev
npx trigger.dev@latest run cfn-cli-sprint-implementer --payload '{
  "taskId": "test-1",
  "sprintId": "sprint-1",
  "sprint": {
    "id": "sprint-1",
    "name": "Test Sprint",
    "category": "architecture",
    "microTasks": [{"id": "task-1", "title": "Test", "description": "Create test file", "category": "architecture"}],
    "estimatedFiles": ["test.ts"]
  },
  "workDir": "/tmp/test"
}'
```

### Verify Tier Configuration
```bash
cd docker/trigger-dev
npx tsx -e "import { getTierTable } from './src/lib/mdap-config.js'; console.table(getTierTable());"
```

## Anti-Patterns

### MDAP Mode
- ❌ Spawning MDAP implementer with non-atomic tasks (>50 lines, multiple files)
- ❌ Ignoring tier escalation failures (unrecoverable tasks)
- ❌ Hardcoding Cerebras model IDs (use tier names, resolve via config)
- ❌ Skipping atomicity analysis before execution

### Non-MDAP Mode
- ❌ Sprints with >8 tasks (too large for single CLI execution)
- ❌ Not checking `checkClaudeCLI()` before execution
- ❌ Using interactive CLI flags (must use `--dangerously-skip-permissions`)
- ❌ Expecting files in non-existent work directories

### Coordinator
- ❌ Running validators before implementation completes
- ❌ Skipping file content reading for validators (Issue #6)
- ❌ Ignoring SLA breaches without logging
- ❌ Not tracking tier escalation statistics

## Success Criteria

- ✅ MDAP micro-tasks complete in <3s average
- ✅ T1 success rate >90% for atomic tasks
- ✅ CLI sprints complete within 5-minute timeout
- ✅ Gate check passes on first iteration for well-defined tasks
- ✅ Async validators receive actual code content (not just paths)
- ✅ Unrecoverable tasks identified and reported clearly

## Key References

### Documentation
- `docker/trigger-dev/CLAUDE.md` - Trigger.dev infrastructure guide
- `docker/CLAUDE.md` - Docker coordination patterns
- `docs/CFN_LOOP_ARCHITECTURE.md` - Overall CFN Loop design

### Type Definitions
- `docker/trigger-dev/src/trigger/index.ts` - All task exports and types
- `MDAPImplementerPayload` / `MDAPImplementerResult`
- `CLISprintImplementerPayload` / `CLISprintImplementerResult`
- `CFNCoordinatorPayload` / `CFNCoordinatorResult`

### Tests
- `docker/trigger-dev/tests/decomposition/` - Decomposition tests
- `docker/trigger-dev/tests/ruvector/` - RuVector integration tests (including MDAP analytics)
- `docker/trigger-dev/tests/integration/` - Integration tests (including MDAP coordinator flow)
- `docker/trigger-dev/tests/performance/` - Performance tests

#### MDAP and RuVector Test Suites (NEW - 2025-11-30)

**Test Coverage**: 51 tests (100% pass rate, 95.25% statement coverage)

**MDAP Model Analytics Tests** (`tests/ruvector/mdap-analytics.test.ts` - 38 tests):
- **A. Basic Recording and Retrieval** (4 tests): Validates outcome recording, retrieval, and data integrity
- **B. Performance Analysis** (6 tests): Underperforming model detection, degradation trends, confidence scoring
- **C. Prompt Optimization** (6 tests): AI-generated prompt improvements based on failure patterns
- **D. Model Performance Queries** (5 tests): RAG-based historical pattern queries by model/tier/task
- **E. Intelligent Tier Selection** (6 tests): Automatic tier selection based on complexity, failures, and historical performance
- **F. Error Pattern Capture** (4 tests): Failure pattern learning and categorization
- **G. Integration Scenarios** (7 tests): End-to-end flows including coordinator → analytics → tier selection

**MDAP Integration Tests** (`tests/integration/ruvector-mdap-integration.test.ts` - 13 tests):
- Coordinator flow integration with RuVector analytics
- Performance analysis triggering on ITERATE decisions
- Tier selection with historical pattern queries
- Metrics consistency across coordinator and RuVector
- Error recovery and degradation detection

**Test Execution Commands**:
```bash
# Run all MDAP tests with custom Jest config
cd docker/trigger-dev
npm test -- --config jest.config.mdap.cjs

# Run analytics tests only
npm test -- --config jest.config.mdap.cjs tests/ruvector/mdap-analytics.test.ts

# Run integration tests only
npm test -- --config jest.config.mdap.cjs tests/integration/ruvector-mdap-integration.test.ts

# Watch mode for development
npm test -- --config jest.config.mdap.cjs --watch

# Coverage report
npm test -- --config jest.config.mdap.cjs --coverage
```

**Key Validation Points**:
- Self-improvement flow: Model performance → Analysis → Recommendations → Tier adjustment
- RuVector schema validation: MDAPModelPerformanceEntry and PromptOptimizationRecommendationEntry
- Model deprecation thresholds: T1 (<40% success), T2 (<60% success), T3 (<70% success)
- Tier escalation accuracy: Complexity + failure count + historical patterns → optimal tier
- Prompt optimization confidence: Based on sample size and failure pattern clustering

**Test Infrastructure**:
- Jest config: `jest.config.mdap.cjs` (mocked @ruvector/core to avoid native dependencies)
- Coverage thresholds: 80% statements, 70% branches, 80% functions, 80% lines
- Mock strategy: Full RuVector mock with in-memory storage for deterministic testing

## Version History

- **1.1.0** (2025-11-30): MDAP + RuVector Test Suite Integration
  - Added comprehensive test location documentation (51 tests)
  - MDAP analytics tests: `tests/ruvector/mdap-analytics.test.ts` (38 tests)
  - MDAP integration tests: `tests/integration/ruvector-mdap-integration.test.ts` (13 tests)
  - Test execution commands and coverage metrics
  - Self-improvement flow validation points
  - Model deprecation thresholds and tier escalation accuracy
- **1.0.0** (2025-11-30): Initial creation
  - MDAP vs non-MDAP workflow documentation
  - 5-phase coordinator flow
  - Tier escalation patterns
  - Sprint aggregation guidance
  - Common troubleshooting scenarios
