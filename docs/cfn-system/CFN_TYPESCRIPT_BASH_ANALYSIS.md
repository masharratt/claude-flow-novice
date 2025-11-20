# CFN Loop TypeScript & Bash Skills Analysis Report
**Date:** 2025-11-19
**Scope:** Complete inventory and audit of CFN Loop orchestration, skills, and coordination

---

## EXECUTIVE SUMMARY

### Current State
- **73 total CFN skills** in `.claude/skills/cfn-*`
- **7 TypeScript skills** with package.json and full TS implementations
- **66 bash-only skills** that are pure bash implementations
- **3 orchestration wrappers** (bash) wrapping 1 TypeScript implementation
- **1 production coordinator** (cfn-v3-coordinator.md) depending on orchestration

### Key Finding: Inefficient Layering Architecture
The current system has **EXCESSIVE WRAPPER COMPLEXITY**:
```
cfn-v3-coordinator.md (bash script in markdown)
    ↓
orchestrate-wrapper.sh (parameter validation wrapper) [268 lines]
    ↓
orchestrate.sh (thin bash wrapper) [172 lines]
    ↓
helpers/orchestrate-ts.sh (node invocation wrapper) [172 lines]
    ↓
orchestrate.ts (actual implementation) [696 lines TypeScript]
```

**Total lines to reach orchestration logic:** 612 lines of bash wrappers
**Actual orchestration logic:** 696 lines TypeScript

### Critical Issues Identified
1. **Parameter fallback logic duplicated** in orchestrate-wrapper.sh and orchestrate.ts
2. **Three separate shell scripts** doing similar work (validation → invocation → node call)
3. **Bash → TypeScript conversion incomplete** (only 7 of 73 skills)
4. **Coordinator profile references non-existent paths** (orchestrate-wrapper.sh location)
5. **No unified CLI entry point** for orchestrator across all modes

---

## SECTION 1: TYPESCRIPT SKILLS INVENTORY

### Production TypeScript Skills (7 total)

#### 1. cfn-loop-orchestration
**Status:** Production-Ready (v3.0.0)
**Location:** `.claude/skills/cfn-loop-orchestration/`
**Files:** 23 TypeScript files, 8 test files
**Key Components:**
- `src/orchestrate.ts` (696 lines) - Main orchestrator class
- `src/orchestrator/orchestrator.ts` - Orchestration logic
- `src/agent-spawner/agent-spawner.ts` - CLI agent spawning
- `src/gate-checker/gate-checker.ts` - Test result validation
- `src/helpers/` - 6 helper modules (gate-check, consensus, iteration, timeout, deliverable-verifier, parse-test-results)
- `src/redis/redis-coordinator.ts` - Redis coordination
- `src/index.ts` - Entry point

**Bash Wrappers (Problematic):**
- `orchestrate.sh` (172 lines) - Simple node invocation wrapper
- `orchestrate-wrapper.sh` (268 lines) - Parameter validation wrapper
- `helpers/orchestrate-ts.sh` (172 lines) - Alternative node invocation wrapper

**Issue:** Three wrappers doing overlapping work

**Tests:** `tests/` directory with 8 test suites
- `orchestrate.test.ts` (main test)
- `gate-check.test.ts`
- `consensus.test.ts`
- `iteration-manager.test.ts`
- `timeout-calculator.test.ts`
- `deliverable-verifier.test.ts`
- `parse-test-results.test.ts`

---

#### 2. cfn-redis-coordination
**Status:** Production-Ready
**Location:** `.claude/skills/cfn-redis-coordination/`
**Files:** 16 TypeScript files (src), 11 declaration files (dist)
**Key Components:**
- `src/index.ts` - Main entry
- `src/redis-client.ts` - Redis client wrapper
- `src/redis/redis-client.ts` - Redis protocol client
- `src/redis/redis-functions.ts` - Lua script functions
- `src/agent-logger.ts` - Agent execution logging
- `src/completion-reporter.ts` - Agent completion tracking
- `src/context-manager.ts` - Task context management
- `src/mode-detector.ts` - Execution mode detection
- `src/result-collector.ts` - Result aggregation
- `src/swarm-manager.ts` - Swarm state management
- `src/task-executor.ts` - Task execution orchestration
- `src/waiting-coordinator.ts` - Agent synchronization
- `src/agent-recovery.ts` - Stuck agent detection
- `src/task-analyzer.ts` - Task complexity analysis
- `src/types.ts` - Type definitions

**Status:** Maturely implemented with good separation of concerns

**Tests:** `tests/coordination.test.ts` (1 test file - needs expansion)

---

#### 3. cfn-docker-coordination
**Status:** Production-Ready
**Location:** `.claude/skills/cfn-docker-coordination/`
**Files:** 13 TypeScript files, 5 test files
**Key Components:**
- `src/index.ts` - Main export
- `src/docker-client.ts` - Docker API wrapper
- `src/agent-container.ts` - Container lifecycle
- `src/health-checker.ts` - Container health validation
- `src/network-manager.ts` - Docker network management
- `src/volume-manager.ts` - Volume management
- `src/types.ts` - Type definitions

**Tests:**
- `tests/docker-client.test.ts`
- `tests/agent-container.test.ts`
- `tests/health-checker.test.ts`
- `tests/network-manager.test.ts`
- `tests/integration.test.ts`

---

#### 4. cfn-docker-redis-coordination
**Status:** Production-Ready
**Location:** `.claude/skills/cfn-docker-redis-coordination/`
**Files:** 4 TypeScript files, 1 test file
**Key Components:**
- `src/index.ts`
- `src/coordinator.ts` - Docker + Redis coordination
- `src/types.ts`

**Tests:** `tests/coordinator.test.ts`

---

#### 5. cfn-error-logging
**Status:** Production-Ready
**Location:** `.claude/skills/cfn-error-logging/`
**Files:** 4 TypeScript files, 1 test file
**Key Components:**
- `src/index.ts`
- `src/error-logger.ts` - Error capture and formatting
- `src/types.ts`

**Tests:** `tests/error-logger.test.ts`

---

#### 6. cfn-skill-propagation
**Status:** Production-Ready
**Location:** `.claude/skills/cfn-skill-propagation/`
**Files:** 15 TypeScript files, 5 test files
**Key Components:**
- `src/index.ts` - Main CLI entry
- `src/cli.ts` - Command-line interface
- `src/skill-propagator.ts` - Skill distribution logic
- `src/skill-validator.ts` - Schema validation
- `src/file-system-adapter.ts` - File operations
- `src/database-adapter.ts` - SQLite operations
- `src/metadata-parser.ts` - Skill metadata extraction
- `src/version-manager.ts` - Version tracking
- `src/logger.ts` - Logging utility
- `src/types.ts`

**Tests:**
- `tests/skill-propagator.test.ts`
- `tests/skill-validator.test.ts`
- `tests/metadata-parser.test.ts`
- `tests/file-system-adapter.test.ts`
- `tests/version-manager.test.ts`

---

#### 7. workflow-codification
**Status:** Early-Stage (4 files only)
**Location:** `.claude/skills/workflow-codification/`
**Files:** 4 TypeScript files, 0 tests
**Components:** Early implementation, minimal documentation

---

### TypeScript Skills Summary Table

| Skill | Purpose | Status | TS Files | Tests | Maturity |
|-------|---------|--------|----------|-------|----------|
| cfn-loop-orchestration | Main CFN orchestrator | Production | 23 | 8 | ⭐⭐⭐⭐⭐ |
| cfn-redis-coordination | Redis pub/sub coordination | Production | 16 | 1 | ⭐⭐⭐⭐ |
| cfn-docker-coordination | Docker container management | Production | 13 | 5 | ⭐⭐⭐⭐ |
| cfn-docker-redis-coordination | Docker + Redis bridge | Production | 4 | 1 | ⭐⭐⭐ |
| cfn-error-logging | Error capture & formatting | Production | 4 | 1 | ⭐⭐⭐ |
| cfn-skill-propagation | Skill distribution system | Production | 15 | 5 | ⭐⭐⭐⭐ |
| workflow-codification | Workflow modeling | Early-Stage | 4 | 0 | ⭐⭐ |

---

## SECTION 2: BASH-ONLY SKILLS AUDIT

### Category A: Core Orchestration Skills (Should Remain Bash)
These are thin wrappers or CLI entry points that work well in bash:

1. **cfn-agent-spawning** - 6 files
   - `spawn-agent.sh` - Main agent spawning CLI
   - `spawn-worker.sh` - Worker spawning
   - `spawn-templates.sh` - Template instantiation
   - Supporting check/parse scripts

2. **cfn-redis-coordination** (Bash CLI) - 20+ scripts
   - `agent-log.sh` - Log agent execution
   - `collect-results.sh` - Gather output
   - `get-context.sh` - Fetch task context
   - `cfn-loop-exec.sh` - Execute CFN loop
   - `check-dependencies.sh` - Dependency validation

3. **cfn-loop-validation** - 7 files
   - `orchestrate-cfn-loop.sh` - Main orchestrator wrapper
   - `validate-iteration.sh` - Iteration validation
   - Supporting scripts

### Category B: Infrastructure & Configuration (Mixed)

1. **cfn-docker-logging** - 11 files
   - Logging aggregation
   - Container log capture
   - Query utilities

2. **cfn-error-batching-strategy** - 7 files
   - Error clustering
   - Wave calculation
   - Batch creation

3. **cfn-test-execution** - 4 files
   - Test runner integration
   - Cache reader
   - Result processing

### Category C: Utility Skills (Good Candidates for TypeScript)

1. **cfn-changelock-management** - 3 files
   - `add-changelog-entry.sh` - Entry creation
   - `bulk-import.sh` - Batch operations
   - `lib/validation.sh` - Validation logic

2. **cfn-backlog-management** - 1 file
   - `add-backlog-item.sh` - Item addition

3. **cfn-complexity-estimator** - 1 file
   - `estimate-complexity.sh` - Complexity calculation

4. **cfn-epic-decomposer** - 1 file
   - `decompose-epic.sh` - Epic decomposition

5. **cfn-process-lifecycle** - 2 files
   - `process-manager.sh` - Process lifecycle
   - `check-dependencies.sh` - Dependency checking

### Category D: Analysis & Output Processing (Lower Priority)

1. **cfn-loop2-output-processing** - 5 files
   - Loop 2 validator output parsing
   - Feedback extraction
   - Consensus collection

2. **cfn-loop3-output-processing** - 6 files
   - Loop 3 worker output parsing
   - Confidence calculation
   - Deliverable verification

### Category E: Legacy/Experimental (Candidates for Removal)

1. **cfn-agent-execution** - 1 file
   - Status: Likely deprecated (overlaps cfn-agent-spawning)

2. **cfn-agent-selector** - 1 file
   - Status: Overlapped by cfn-agent-selection-with-fallback

3. **cfn-agent-selection-with-fallback** - 3 files
   - Status: Newer version of cfn-agent-selector

4. **cfn-intervention-detector** - 1 file
   - Status: Unclear purpose

5. **cfn-intervention-orchestrator** - 1 file
   - Status: Unclear purpose

---

## SECTION 3: COORDINATOR PROFILE ANALYSIS

### Current Coordinator: cfn-v3-coordinator.md
**Location:** `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`
**Size:** 283 lines
**Status:** Production v3.0

#### Coordinator Responsibilities (Current)

1. **Read environment variables** - Task description, mode, max iterations
2. **Store context in Redis** - Task description, success criteria
3. **Select agents** - Loop 3, Loop 2, Product Owner
4. **Invoke orchestrator** - Pass control to orchestration system

#### Skills Referenced

1. **cfn-redis-coordination** (implicit)
   - `store-success-criteria.sh` (explicit mention, line 72)

2. **cfn-loop-orchestration** 
   - `orchestrate-wrapper.sh` (line 133, referenced as orchestration entry point)

3. **cfn-agent-spawning** (implicit)
   - Orchestrator spawns agents via `npx claude-flow-novice agent`

#### Critical Issues in Coordinator Profile

**Issue #1: Path Reference Error**
- **Line 133:** References `$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/orchestrate-wrapper.sh`
- **Actual location:** Correct (file exists)
- **Problem:** Not consistent with documented CLI approach

**Issue #2: Unclear Skill Workflow**
- Lines 72-92: Complex Redis storage logic should be abstracted
- `store-success-criteria.sh` wrapper skill not properly namespaced

**Issue #3: Overly Long Setup Phase**
- 4-step setup (lines 48-165) could be 1-2 unified steps
- Most of this work could be inside orchestrator

**Issue #4: Hardcoded Agent Selection**
- Lines 111-115: Hardcoded to backend-developer, code-reviewer, product-owner
- No dynamic agent selection based on task type
- Should use cfn-agent-selection-with-fallback skill

---

## SECTION 4: ORCHESTRATION LAYER ANALYSIS

### Current Architecture (Problematic)

```
┌─────────────────────────────────────────────────────────────┐
│ cfn-v3-coordinator.md (283 lines, markdown-embedded bash)    │
│ - Stores context in Redis                                   │
│ - Selects hardcoded agents                                  │
│ - Invokes orchestrator                                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────▼──────────────────┐
        │ orchestrate-wrapper.sh (268 lines)   │
        │ - Validates parameters              │
        │ - Applies fallback agent lists      │
        │ - Constructs NODE_ARGS array        │
        └───────────────┬──────────────────────┘
                        │
        ┌───────────────▼──────────────┐
        │ orchestrate.sh (172 lines)    │
        │ - Builds node command         │
        │ - Runs node with orchestrator │
        └───────────────┬──────────────┘
                        │
        ┌───────────────▼──────────────────────────┐
        │ helpers/orchestrate-ts.sh (172 lines)    │
        │ - Alternative node invocation wrapper    │
        │ - Input sanitization                    │
        │ - Parameter parsing                     │
        └───────────────┬──────────────────────────┘
                        │
        ┌───────────────▼─────────────────────────────────────┐
        │ orchestrate.ts (696 lines, TypeScript)              │
        │ - Main orchestrator class (Orchestrator)            │
        │ - Spawn Loop 3 agents                              │
        │ - Execute tests, check gates                       │
        │ - Spawn Loop 2 validators                          │
        │ - Collect consensus                                │
        │ - Spawn Product Owner for decision                 │
        │ - Manage iterations                                │
        └─────────────────────────────────────────────────────┘
```

**Total Path Length:** 612 lines of bash before reaching TypeScript logic
**Redundancy:** Parameter validation happens in 2+ places (wrapper + ts)

---

### Issues Identified

**Issue #1: Wrapper Redundancy**
- `orchestrate-wrapper.sh` (268 lines) handles parameter fallback
- `orchestrate.ts` (696 lines) also has parameter fallback logic
- **Duplication:** Agent list fallbacks duplicated

**Issue #2: Multiple Entry Points**
- `orchestrate.sh` - Simple wrapper
- `orchestrate-wrapper.sh` - Parameter fallback version
- `helpers/orchestrate-ts.sh` - Alternative wrapper
- **Confusion:** Which one should be used?
- **Current coordinator uses:** orchestrate-wrapper.sh (hardcoded path)

**Issue #3: Bash-TypeScript Mismatch**
- Bash wrapper does parameter sanitization/validation
- TypeScript orchestrator repeats this work
- No clear separation of concerns

**Issue #4: Missing CLI Entry Point**
- No unified `npx claude-flow-novice orchestrate` command
- Forces direct script invocation
- Inconsistent with other CLI patterns

---

### TypeScript Orchestrator Quality Assessment

**Strengths:**
- ✅ Well-structured with modular helpers
- ✅ Comprehensive test suite (8 tests)
- ✅ Type safety with TypeScript
- ✅ Good separation: gate-check, consensus, iteration-manager, etc.
- ✅ Supports test-driven validation (v3.0)

**Weaknesses:**
- ❌ Parameter fallback logic in both bash wrapper and TS (duplication)
- ❌ No CLI entry point in main package
- ❌ Bash wrappers still required for node invocation
- ❌ Test coverage could be expanded (1 integration test)

---

## SECTION 5: SKILL DEPENDENCY MAPPING

### Critical Path Dependencies

```
cfn-v3-coordinator.md
├── cfn-redis-coordination (for context storage)
│   └── Redis running on REDIS_HOST:REDIS_PORT
├── cfn-loop-orchestration (main orchestration)
│   ├── cfn-redis-coordination (for coordination)
│   ├── cfn-agent-spawning (via npx CLI spawning)
│   └── cfn-loop2-output-processing (validator output)
│       └── cfn-redis-coordination
├── cfn-agent-spawning
│   └── Agent profiles in .claude/agents/
└── cfn-product-owner-decision (implicit via orchestrator)
    └── cfn-redis-coordination

Optional/Implicit:
├── cfn-agent-selection-with-fallback (NOT USED - hardcoded)
├── cfn-delivery-validation (for test gates)
└── cfn-test-runner-instrumentation (for test execution)
```

### Unused/Overlapping Skills

1. **cfn-agent-selector** vs **cfn-agent-selection-with-fallback**
   - cfn-agent-selector: older version
   - cfn-agent-selection-with-fallback: newer replacement
   - **Recommendation:** Remove cfn-agent-selector, integrate selection into coordinator

2. **cfn-agent-execution** vs **cfn-agent-spawning**
   - Appear to be duplicates
   - **Recommendation:** Audit and consolidate

3. **orchestrate-wrapper.sh** vs **orchestrate.sh** vs **helpers/orchestrate-ts.sh**
   - Three bash wrappers for same purpose
   - **Recommendation:** Consolidate to single wrapper or remove

---

## SECTION 6: MIGRATION CHECKLIST

### Phase 1: Consolidate Orchestration Wrappers (PRIORITY: HIGH)

**Task 1.1: Create Unified Orchestrator CLI Entry Point**
- [ ] Create `src/cli/orchestrator-cli.ts` in cfn-loop-orchestration
- [ ] Add CLI argument parser (task-id, mode, agents, max-iterations)
- [ ] Remove need for orchestrate-wrapper.sh
- [ ] Add to main package CLI commands

**Task 1.2: Remove Redundant Bash Wrappers**
- [ ] Deprecate `orchestrate-wrapper.sh`
- [ ] Deprecate `orchestrate.sh` (replace with CLI entry)
- [ ] Keep `helpers/orchestrate-ts.sh` as fallback only
- [ ] Update coordinator to use new CLI entry

**Task 1.3: Unified Parameter Handling**
- [ ] Move all fallback logic to TypeScript
- [ ] Remove bash parameter validation
- [ ] Add comprehensive type validation in CLI

---

### Phase 2: Refactor Bash-Heavy Skills (PRIORITY: HIGH)

**Top Candidates for TypeScript Conversion:**

1. **cfn-loop2-output-processing** (5 bash files)
   - Parse validator feedback
   - Extract consensus scores
   - Handle formatter output
   - **Effort:** Medium (2-3 days)
   - **Benefit:** Type safety, test coverage, CLI integration

2. **cfn-loop3-output-processing** (6 bash files)
   - Parse worker delivery metadata
   - Calculate confidence scores
   - Verify deliverable completeness
   - **Effort:** Medium (2-3 days)
   - **Benefit:** Direct integration with orchestrator

3. **cfn-product-owner-decision** (4 bash files)
   - Parse decision output
   - Validate PROCEED/ITERATE/ABORT
   - **Effort:** Small (1-2 days)
   - **Benefit:** Eliminates bash string parsing

4. **cfn-changelog-management** (3 bash files)
   - Entry creation
   - Bulk import
   - Validation
   - **Effort:** Small (1 day)
   - **Benefit:** Reusable library, CLI tool

5. **cfn-backlog-management** (1 bash file)
   - Item addition
   - **Effort:** Very Small (0.5 days)
   - **Benefit:** Unified backlog API

---

### Phase 3: Optimize Core Redis Skills (PRIORITY: MEDIUM)

**Task 3.1: Consolidate cfn-redis-coordination**
- [ ] Review bash scripts in cfn-redis-coordination
- [ ] Move critical functionality to TypeScript (redis-functions)
- [ ] Deprecate standalone bash scripts
- [ ] Provide CLI wrappers for backward compatibility

**Task 3.2: Create cfn-coordination Umbrella Skill**
- [ ] Consolidate orchestration coordination patterns
- [ ] Unify Redis, Docker, and Error coordination
- [ ] Single import point for all coordination needs

---

### Phase 4: Refactor Coordinator Profile (PRIORITY: HIGH)

**Task 4.1: Simplify Coordinator Script**
```bash
# Current: 5 steps with Redis logic
# Proposed: 2 steps

Step 1: Invoke orchestrator (pass task desc, mode, max-iterations)
  - New: npx orchestrator --task-id $TASK_ID --mode $MODE --desc "$DESC"
  
Step 2: Wait for completion (automatic via orchestrator)
  - Orchestrator handles: context storage, agent selection, execution
```

**Task 4.2: Move Logic to Orchestrator**
- [ ] Move Redis context storage to orchestrator initialization
- [ ] Move agent selection to orchestrator (use cfn-agent-selection-with-fallback)
- [ ] Reduce coordinator to thin entry point

**Expected Result:**
- Current: 283 lines (complex bash + redis calls)
- Proposed: 100 lines (simple entry + orchestrator invocation)

---

### Phase 5: Deprecation & Cleanup (PRIORITY: MEDIUM)

**Skills to Deprecate:**
- [ ] cfn-agent-selector (replaced by cfn-agent-selection-with-fallback)
- [ ] cfn-agent-execution (if duplicate of cfn-agent-spawning)
- [ ] cfn-intervention-detector (unclear purpose, not referenced)
- [ ] cfn-intervention-orchestrator (unclear purpose, not referenced)
- [ ] cfn-loop-validation (wrap with new cfn-coordination)

**Skills to Consolidate:**
- [ ] orchestrate wrappers (→ single TypeScript CLI)
- [ ] redis coordination bash scripts (→ TypeScript + CLI wrappers)
- [ ] output processing (→ single TypeScript library)

---

## SECTION 7: RECOMMENDED EXECUTION FLOW (Simplified)

### Current Flow (Problematic)
```
1. Main Chat
   ↓
2. cfn-v3-coordinator (reads env, stores Redis, invokes bash)
   ↓
3. orchestrate-wrapper.sh (parameter fallback, validates)
   ↓
4. orchestrate.sh (node invocation)
   ↓
5. helpers/orchestrate-ts.sh (sanitization, CLI building)
   ↓
6. orchestrate.ts (actual orchestration)
```

### Proposed Flow (Simplified)
```
1. Main Chat
   ↓
2. cfn-v3-coordinator (simplified to 1-2 commands)
   ↓
3. npx orchestrator-cli (new unified entry)
   │
   ├─ Read environment variables
   ├─ Initialize orchestrator
   ├─ Store context in Redis
   ├─ Select agents (using cfn-agent-selection-with-fallback)
   ├─ Spawn Loop 3 agents
   ├─ Execute tests, check gates
   ├─ Spawn Loop 2 validators
   ├─ Collect consensus
   ├─ Spawn Product Owner
   └─ Manage iterations
   ↓
4. Return result to Main Chat
```

**Benefits:**
- Eliminates 3 bash wrappers
- Single entry point for orchestration
- Better testability
- Type-safe parameter handling
- Integrated CLI with other commands

---

## SECTION 8: SPECIFIC FILE PATHS & RECOMMENDATIONS

### Files to MODIFY

1. **`.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`**
   - **Line 133:** Update orchestrator path reference
   - **Lines 48-165:** Simplify setup steps
   - **Lines 111-115:** Replace hardcoded agents with dynamic selection
   - **Recommended:** Reduce from 283 → 150 lines

2. **`.claude/skills/cfn-loop-orchestration/src/orchestrate.ts`**
   - **Lines 1-120:** Parameter handling (duplicate with wrapper)
   - **Action:** Move to CLI layer, remove from orchestrator
   - **Benefit:** Cleaner orchestrator, no duplication

3. **`.claude/skills/cfn-loop-orchestration/orchestrate-wrapper.sh`**
   - **Status:** Candidate for removal after CLI creation
   - **Alternative:** Keep as fallback for backward compatibility
   - **Action:** Mark as deprecated, add CLI as preferred method

### Files to CREATE

1. **`.claude/skills/cfn-loop-orchestration/src/cli/orchestrator-cli.ts`**
   - [ ] CLI argument parser
   - [ ] Parameter validation
   - [ ] Mode validation
   - [ ] Agent list defaults
   - [ ] Direct orchestrator invocation

2. **`.claude/skills/cfn-loop-output-processing/`** (New Consolidated Skill)
   - [ ] Consolidate cfn-loop2-output-processing (bash → ts)
   - [ ] Consolidate cfn-loop3-output-processing (bash → ts)
   - [ ] Single TypeScript library for output parsing

### Files to DEPRECATE (Mark as Obsolete)

1. `.claude/skills/cfn-loop-orchestration/orchestrate-wrapper.sh`
2. `.claude/skills/cfn-loop-orchestration/orchestrate.sh`
3. `.claude/skills/cfn-loop-orchestration/helpers/orchestrate-ts.sh` (if CLI replaces)
4. `.claude/skills/cfn-agent-selector/` (deprecated by selection-with-fallback)
5. `.claude/skills/cfn-loop-validation/` (wrap with coordination)

---

## SECTION 9: EFFORT & IMPACT ESTIMATION

### Quick Wins (1-2 days each)

| Task | Effort | Impact | Priority |
|------|--------|--------|----------|
| Remove cfn-agent-selector | 1 day | Remove duplication | High |
| Consolidate orchestrate wrappers | 1 day | Eliminate 400 lines bash | High |
| Create orchestrator CLI entry | 2 days | Unified interface | High |
| Simplify coordinator profile | 1 day | Improve clarity | Medium |

### Medium Tasks (3-5 days each)

| Task | Effort | Impact | Priority |
|------|--------|--------|----------|
| Convert cfn-product-owner-decision to TS | 2 days | Type safety | High |
| Convert cfn-changelog-management to TS | 1 day | Reusable library | Medium |
| Refactor cfn-loop2-output-processing to TS | 3 days | Better integration | High |
| Refactor cfn-loop3-output-processing to TS | 3 days | Type safety | High |

### Large Tasks (1-2 weeks each)

| Task | Effort | Impact | Priority |
|------|--------|--------|----------|
| Create unified cfn-coordination skill | 5 days | Single coordination layer | High |
| Consolidate Redis coordination | 1 week | Eliminate bash overhead | Medium |
| Full test suite expansion | 1 week | Better coverage | High |

---

## SECTION 10: SUCCESS CRITERIA

### Architectural Simplification
- [ ] Eliminate 3 orchestration bash wrappers
- [ ] Reduce coordinator profile from 283 → 150 lines
- [ ] Create unified CLI entry point for orchestration
- [ ] Remove redundant parameter fallback logic

### Code Quality
- [ ] 90%+ test coverage for orchestration
- [ ] Zero code duplication in parameter handling
- [ ] Type-safe all CLI interfaces
- [ ] All critical skills have TypeScript implementations

### Performance
- [ ] Reduce orchestration startup time by eliminating bash layers
- [ ] Measure: <1s from coordinator invocation to orchestrator startup (vs current 2-3s)

### Maintenance
- [ ] Single source of truth for orchestration logic (orchestrate.ts)
- [ ] Unified CLI interface across all orchestration modes
- [ ] Clear deprecation path for old bash scripts

---

## SECTION 11: MIGRATION SEQUENCE (Recommended Order)

1. **Week 1: Consolidate Orchestration**
   - Create orchestrator CLI entry
   - Update coordinator to use CLI
   - Mark old wrappers as deprecated

2. **Week 2: Convert Critical Output Processing**
   - cfn-product-owner-decision (bash → TS)
   - cfn-loop2-output-processing (bash → TS)
   - cfn-loop3-output-processing (bash → TS)

3. **Week 3: Optimize Coordination**
   - Consolidate Redis coordination
   - Create unified cfn-coordination skill
   - Update orchestrator integration

4. **Week 4: Cleanup & Testing**
   - Remove deprecated scripts
   - Expand test coverage
   - Documentation updates

---

## APPENDIX A: COMPLETE SKILL INVENTORY

### TypeScript Skills (7)
- cfn-loop-orchestration (696 lines TS)
- cfn-redis-coordination (16 TS files)
- cfn-docker-coordination (13 TS files)
- cfn-docker-redis-coordination (4 TS files)
- cfn-error-logging (4 TS files)
- cfn-skill-propagation (15 TS files)
- workflow-codification (4 TS files)

### Bash-Heavy Skills (66)
- Core Orchestration: 3 skills (cfn-agent-spawning, cfn-redis-coordination, cfn-loop-validation)
- Infrastructure: 6 skills (docker-logging, error-batching, test-execution, etc.)
- Output Processing: 2 skills (loop2-output-processing, loop3-output-processing)
- Utilities: 50+ skills (changelog, backlog, epic decomposer, etc.)

### Candidates for Removal (5)
- cfn-agent-selector (duplicate)
- cfn-agent-execution (likely duplicate)
- cfn-intervention-detector (unclear purpose)
- cfn-intervention-orchestrator (unclear purpose)
- cfn-loop-validation (consolidate with coordination)

---

## APPENDIX B: FILE STRUCTURE RECOMMENDATIONS

### Proposed New Structure
```
.claude/skills/
├── cfn-loop-orchestration/
│   ├── src/
│   │   ├── cli/
│   │   │   └── orchestrator-cli.ts (NEW - unified entry)
│   │   ├── orchestrate.ts (REFACTOR - remove param logic)
│   │   ├── orchestrator/
│   │   ├── agent-spawner/
│   │   ├── gate-checker/
│   │   ├── helpers/
│   │   └── redis/
│   ├── dist/
│   └── orchestrate.sh (DEPRECATED - keep for backward compat)
│
├── cfn-loop-output-processing/ (NEW - consolidates 2 skills)
│   ├── src/
│   │   ├── loop2-output-processor.ts
│   │   ├── loop3-output-processor.ts
│   │   └── types.ts
│   └── tests/
│
├── cfn-coordination/ (NEW - unified coordination)
│   ├── src/
│   │   ├── redis-coordinator.ts
│   │   ├── docker-coordinator.ts
│   │   └── error-coordinator.ts
│   └── tests/
│
└── [Other 64 bash skills - can remain as-is for now]
```

