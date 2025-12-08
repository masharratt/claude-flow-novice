# CFN Infrastructure Complete TypeScript Migration Plan

## Executive Summary

This document provides a comprehensive inventory of all CFN Loop infrastructure bash scripts and a prioritized migration plan to achieve complete TypeScript coverage of the CFN infrastructure.

**Key Metrics:**
- Total Bash Scripts: 205+ across 64 CFN skills + 9 hooks
- Total Bash Lines of Code: ~20,000+ LOC
- Already Migrated: 6 core scripts
- Remaining to Migrate: ~199 scripts (~19,500 LOC)
- Estimated Total Effort: 280-350 developer-hours

---

## Part 1: Complete Bash Script Inventory

### 1.1 CORE INFRASTRUCTURE (Critical Path - MUST MIGRATE)

These scripts form the backbone of CFN Loop execution and coordination. High complexity, high usage.

#### **1.1.1 Redis Coordination Layer** (Priority 1)
**Directory:** `.claude/skills/cfn-redis-coordination`  
**Total:** 19 scripts, 2,406 lines

| Script | LOC | Function | Dependencies | Priority |
|--------|-----|----------|--------------|----------|
| cfn-loop-exec.sh | 468 | Main entry point for CFN Loop execution; task description parsing, orchestrator invocation, progress monitoring | orchestrate-cfn-loop.sh, redis-cli | 10 |
| redis-functions.sh | 33 | Core Redis wrapper functions for key operations | redis-cli | 9 |
| redis-cli-wrapper.sh | 30 | Wrapper around redis-cli with error handling | redis-cli | 9 |
| invoke-waiting-mode.sh | 223 | Blocking wait mechanism for agent completion using BLPOP | redis-cli, report-completion.sh | 9 |
| report-completion.sh | 89 | Signal agent completion and store results to Redis | redis-cli, redis-functions.sh | 9 |
| collect-results.sh | 75 | Aggregate results from completed agents | redis-cli, redis-functions.sh | 8 |
| collect-confidence-scores.sh | 209 | Gather confidence scores from Loop 2 validators | redis-cli, redis-functions.sh | 8 |
| complete-swarm.sh | 75 | Mark swarm task as complete and aggregate final metrics | redis-cli | 8 |
| cancel-swarm.sh | 221 | Cancel all agents in swarm and cleanup Redis keys | redis-cli, agent-recovery.sh | 8 |
| store-context.sh | 93 | Store task context and configuration to Redis | redis-cli, redis-functions.sh | 8 |
| get-context.sh | 145 | Retrieve stored task context | redis-cli | 8 |
| store-success-criteria.sh | 85 | Store success criteria for task | redis-cli | 7 |
| get-success-criteria.sh | 54 | Retrieve success criteria for task | redis-cli | 7 |
| analyze-task-complexity.sh | 277 | Analyze task text and determine complexity tier | - | 7 |
| agent-recovery.sh | 74 | Detect stuck agents and trigger recovery | redis-cli, process utilities | 7 |
| agent-log.sh | 128 | Store and retrieve agent execution logs | redis-cli | 6 |
| cfn-loop-relaunch.sh | 29 | Relaunch failed CFN Loop iterations | cfn-loop-exec.sh | 6 |
| update-all-scripts.sh | 67 | Update Redis connection info across scripts | - | 5 |
| check-dependencies.sh | 31 | Verify Redis availability and connectivity | redis-cli | 4 |

**Migration Effort Estimate:** 50-60 hours  
**Blocking Dependencies:** None (all core Redis ops)  
**Recommended Action:** Migrate in phases:
1. Phase 1: redis-functions.sh, redis-cli-wrapper.sh (wrapper layer)
2. Phase 2: Core operations (store-context, get-context, report-completion)
3. Phase 3: Advanced coordination (invoke-waiting-mode, collect-results)
4. Phase 4: Task management (cfn-loop-exec, complete-swarm, cancel-swarm)

---

#### **1.1.2 Loop Orchestration** (Priority 1)
**Directory:** `.claude/skills/cfn-loop-orchestration`  
**Total:** 7 scripts, 2,382 lines (1,229 lines in orchestrate.sh alone)

| Script | LOC | Function | Dependencies | Priority |
|--------|-----|----------|--------------|----------|
| orchestrate.sh | 1,229 | **CORE:** Main orchestration engine for CFN Loops; spawns Loop 3/2 agents, manages iteration, gate checking, product owner decision | cfn-redis-coordination/*, cfn-process-instrumentation/*, cfn-validation-runner-instrumentation/*, security_utils.sh | 10 |
| security_utils.sh | 122 | Security validation utilities (command injection, path validation) | - | 9 |
| monitor-execution.sh | 156 | Monitor agent execution and detect completion | redis-cli, process utilities | 8 |
| inject-loop-context.sh | 41 | Inject iteration context into agent environments | - | 6 |
| orchestrate-cfn-loop.sh | 252 | **ALREADY MIGRATED** (part of orchestrate.ts) | - | 0 |
| test-cfn-orchestration.sh | 281 | **TEST:** Comprehensive orchestration testing | orchestrate.sh | 0 |
| test-iteration-context-injection.sh | 366 | **TEST:** Iteration context validation tests | orchestrate.sh | 0 |

**Migration Effort Estimate:** 70-90 hours (orchestrate.sh alone: 40-50 hours)  
**Blocking Dependencies:** cfn-redis-coordination (must migrate first)  
**Recommended Action:** 
1. Migrate security_utils.sh first (no dependencies)
2. Migrate orchestrate.sh as monolithic TypeScript module (complex, high value)
3. Migrate monitoring and context injection after core orchestration

---

#### **1.1.3 Docker Wave Execution** (Priority 2)
**Directory:** `.claude/skills/cfn-docker-wave-execution`  
**Total:** 3 scripts, 1,477 lines + lib files

| Script | LOC | Function | Dependencies | Priority |
|--------|-----|----------|--------------|----------|
| spawn-wave.sh | 547 | Spawn Docker containers from batching plan with memory tier awareness | docker, lib/docker-helpers.sh, lib/docker-compose.sh | 9 |
| monitor-wave.sh | 485 | Poll Docker container status until completion or timeout | docker, lib/docker-helpers.sh | 8 |
| cleanup-wave.sh | 445 | Remove containers and clean up Docker artifacts | docker, lib/docker-helpers.sh | 8 |

**Internal Libraries:**
- `lib/docker-helpers.sh` - Docker wrapper utilities (~150 lines)
- `lib/docker-compose.sh` - docker-compose interaction (~100 lines)

**Migration Effort Estimate:** 45-55 hours  
**Blocking Dependencies:** Docker CLI (external)  
**Recommended Action:**
1. Migrate lib/docker-helpers.sh as utility module
2. Migrate lib/docker-compose.sh as Docker abstraction layer
3. Migrate spawn-wave.sh, monitor-wave.sh, cleanup-wave.sh in sequence

---

#### **1.1.4 Wave Checkpoint Management** (Priority 2)
**Directory:** `.claude/skills/cfn-wave-checkpoint`  
**Total:** 3 scripts, 983 lines

| Script | LOC | Function | Dependencies | Priority |
|--------|-----|----------|--------------|----------|
| save-checkpoint.sh | 284 | Serialize wave state (agents, containers, progress) to disk | redis-cli, process utilities, JSON parsing | 8 |
| resume-wave.sh | 325 | Deserialize checkpoint and resume from previous state | redis-cli, JSON parsing, docker | 8 |
| cleanup-orphans.sh | 374 | Detect and clean up orphaned processes and containers after crash | docker, process utilities, redis-cli | 7 |

**Migration Effort Estimate:** 40-50 hours  
**Blocking Dependencies:** cfn-redis-coordination, docker  
**Recommended Action:**
1. Migrate save-checkpoint.sh (state serialization)
2. Migrate resume-wave.sh (state deserialization)
3. Migrate cleanup-orphans.sh (recovery mechanism)

---

#### **1.1.5 Agent Spawning** (Priority 1)
**Directory:** `.claude/skills/cfn-agent-spawning`  
**Total:** 6 scripts, 1,265 lines

| Script | LOC | Function | Dependencies | Priority |
|--------|-----|----------|--------------|----------|
| spawn-templates.sh | 613 | **CORE:** Agent spawn templates for different specializations | spawn-worker.sh, get-agent-provider-env.sh, npx | 9 |
| spawn-agent.sh | 282 | Spawn individual agent via CLI with config | spawn-templates.sh, redis-cli | 9 |
| spawn-worker.sh | 175 | Fork worker process for agent execution | - | 8 |
| get-agent-provider-env.sh | 107 | Extract provider configuration from agent profiles | - | 7 |
| parse-agent-provider.sh | 59 | Parse PROVIDER_PARAMETERS from agent metadata | - | 6 |
| check-dependencies.sh | 29 | Verify npx and other spawn dependencies | - | 4 |

**Migration Effort Estimate:** 40-50 hours  
**Blocking Dependencies:** cfn-redis-coordination (partial)  
**Recommended Action:**
1. Migrate parse-agent-provider.sh, get-agent-provider-env.sh (utilities)
2. Migrate spawn-worker.sh (process management)
3. Migrate spawn-templates.sh (main spawning logic)
4. Migrate spawn-agent.sh (orchestration wrapper)

---

#### **1.1.6 Product Owner Decision Layer** (Priority 2)
**Directory:** `.claude/skills/cfn-product-owner-decision`  
**Total:** 4 scripts, 663 lines

| Script | LOC | Function | Dependencies | Priority |
|--------|-----|----------|--------------|----------|
| execute-decision.sh | 367 | Execute Product Owner agent and parse decision output | cfn-agent-spawning/spawn-agent.sh, parse-decision.sh | 8 |
| parse-decision.sh | 66 | Extract PROCEED/ITERATE/ABORT decision from agent output | - | 8 |
| validate-deliverables.sh | 82 | Verify deliverables match success criteria | redis-cli, JSON processing | 7 |
| test-backlog-integration.sh | 148 | **TEST:** Validate backlog management integration | - | 0 |

**Migration Effort Estimate:** 25-35 hours  
**Blocking Dependencies:** cfn-agent-spawning  
**Recommended Action:**
1. Migrate parse-decision.sh (parsing logic)
2. Migrate validate-deliverables.sh (validation)
3. Migrate execute-decision.sh (orchestration)

---

#### **1.1.7 Loop Output Processing** (Priority 2)
**Directory:** `.claude/skills/cfn-loop3-output-processing`  
**Total:** 6 scripts, 667 lines (excluding tests)

| Script | LOC | Function | Dependencies | Priority |
|--------|-----|----------|--------------|----------|
| execute-and-extract.sh | ~80 | Execute agent in container and extract structured output | docker, JSON parsing | 8 |
| parse-confidence.sh | ~50 | Extract confidence score from agent output | - | 7 |
| calculate-confidence.sh | ~60 | Calculate aggregate confidence from multiple outputs | - | 7 |
| verify-deliverables.sh | ~50 | Verify deliverables structure and content | JSON schema validation | 7 |
| test-agent-timeout.sh | ~100 | **TEST:** Validate timeout handling | - | 0 |
| test-loop3-processing.sh | ~327 | **TEST:** Comprehensive output processing tests | - | 0 |

**Migration Effort Estimate:** 20-30 hours  
**Blocking Dependencies:** Docker integration  
**Recommended Action:**
1. Migrate parsing utilities (parse-confidence, calculate-confidence)
2. Migrate output extraction (execute-and-extract)
3. Migrate validation (verify-deliverables)

---

#### **1.1.8 Process Lifecycle Management** (Priority 2)
**Directory:** `.claude/skills/cfn-process-lifecycle`  
**Total:** 2 scripts, 200 lines

| Script | LOC | Function | Dependencies | Priority |
|--------|-----|----------|--------------|----------|
| process-manager.sh | 143 | Track process groups, handle signals, cleanup resources | trap, process utilities | 8 |
| check-dependencies.sh | 57 | Verify process management dependencies | - | 4 |

**Migration Effort Estimate:** 15-20 hours  
**Blocking Dependencies:** None (system utilities)  
**Recommended Action:**
1. Migrate process-manager.sh early (no dependencies, used by many)
2. Can be migrated in parallel with other efforts

---

#### **1.1.9 Test Runner & Validation** (Priority 3)
**Directory:** `.claude/skills/cfn-test-runner`  
**Total:** 5 scripts, 524 lines

| Script | LOC | Function | Dependencies | Priority |
|--------|-----|----------|--------------|----------|
| run-all-tests.sh | 222 | Execute comprehensive test suite for CFN Loop | pytest, various test scripts | 7 |
| validate-redis-keys.sh | 143 | Validate Redis key structure and data integrity | redis-cli, JSON | 6 |
| detect-regressions.sh | 58 | Compare test results against baseline for regressions | - | 6 |
| store-benchmarks.sh | 53 | Store performance benchmarks to Redis | redis-cli | 6 |
| init-benchmark-db.sh | 48 | Initialize benchmark storage schema | redis-cli | 5 |

**Migration Effort Estimate:** 25-35 hours  
**Blocking Dependencies:** cfn-redis-coordination  
**Recommended Action:**
1. Migrate validate-redis-keys.sh (core validation)
2. Migrate run-all-tests.sh (test orchestration)
3. Migrate performance measurement utilities

---

### 1.2 PRE/POST EDIT HOOKS (Priority 2)

**Directory:** `.claude/hooks`  
**Total:** 9 scripts, 682 lines

| Script | LOC | Function | Dependencies | Priority |
|--------|-----|----------|--------------|----------|
| cfn-invoke-pre-edit.sh | 88 | Pre-edit backup creation and validation | cfn-pre-edit-backup.sh, sqlite3 | 8 |
| cfn-invoke-post-edit.sh | 87 | Post-edit validation (syntax, security, formatting) | cfn-lint-sql-injection.sh, cfn-invoke-security-validation.sh | 8 |
| cfn-pre-edit-backup.sh | 71 | Create timestamped file backup with compression | tar, sqlite3 | 7 |
| cfn-post-edit-cfn-retrospective.sh | 109 | Generate retrospective analysis of edits | diff, sqlite3, JSON | 6 |
| cfn-invoke-security-validation.sh | 69 | Validate security policies on edited files | grep, security patterns | 6 |
| cfn-lint-sql-injection.sh | 61 | Detect SQL injection vulnerabilities | grep, regex patterns | 6 |
| cfn-pre-edit-security-warning.sh | 40 | Display security warnings before edit | - | 4 |
| cfn-restore-from-backup.sh | 37 | Restore files from backup storage | tar, sqlite3 | 5 |
| cfn-post-edit.sh | 20 | Main post-edit hook orchestrator | cfn-invoke-post-edit.sh | 7 |

**Migration Effort Estimate:** 35-45 hours  
**Blocking Dependencies:** SQLite, file I/O  
**Recommended Action:**
1. Migrate cfn-pre-edit-backup.sh, cfn-restore-from-backup.sh (backup layer)
2. Migrate cfn-invoke-pre-edit.sh, cfn-invoke-post-edit.sh (main hooks)
3. Migrate validation scripts (security, lint)

---

### 1.3 SUPPORTING TOOLS (CAN STAY BASH or MIGRATE)

These scripts provide auxiliary functionality. Can be migrated for consistency, but not on critical path.

#### **1.3.1 Coordination & Context** (Priority 3)
**Directory:** `.claude/skills/cfn-redis-coordination` (overflow)

- store-success-criteria.sh (85 lines) - Context storage
- agent-log.sh (128 lines) - Logging
- agent-recovery.sh (74 lines) - Recovery detection

**Estimated Effort:** 15-25 hours | **Status:** Can stay bash or migrate

---

#### **1.3.2 Testing & Validation** (Priority 3)
**Directories:** 
- `.claude/skills/cfn-test-execution` (4 scripts, ~400 lines)
- `.claude/skills/cfn-loop-validation` (3 scripts, ~415 lines)
- `.claude/skills/cfn-loop2-output-processing` (4 scripts, ~300 lines)

**Estimated Effort:** 30-40 hours | **Status:** Can stay bash or migrate

---

#### **1.3.3 Deployment & Infrastructure** (Priority 4)
**Directories:**
- `.claude/skills/cfn-docker-agent-spawning` (~500 lines)
- `.claude/skills/cfn-docker-skill-mcp-selection` (~300 lines)
- `.claude/skills/cfn-docker-redis-coordination` (~400 lines)
- `.claude/skills/cfn-docker-loop-orchestration` (~300 lines)

**Estimated Effort:** 40-50 hours | **Status:** Can stay bash or migrate for consistency

---

#### **1.3.4 Utilities & Helpers** (Priority 5)
**Directories:**
- `.claude/skills/cfn-file-operations` (~400 lines)
- `.claude/skills/cfn-memory-management` (~200 lines)
- `.claude/skills/cfn-sprint-execution` (~400 lines)
- `.claude/skills/cfn-playbook` (~300 lines)

**Estimated Effort:** 30-40 hours | **Status:** Low priority, can stay bash

---

### 1.4 SCRIPTS THAT SHOULD STAY BASH

These are lightweight, specialized scripts that are simpler in bash:

1. **Check-dependencies scripts** (all directories) - Simple existence checks
2. **Configuration parsers** - Single-purpose field extraction
3. **Simple wrappers** - Thin CLI wrapping around external tools
4. **Test-only scripts** - Not part of production orchestration

**Recommendation:** Keep as bash, don't migrate:
- All `check-dependencies.sh` scripts
- Simple property extractors
- Test scaffolding scripts

**Estimated Save:** 20-30 hours

---

## Part 2: Dependency Graph

### Critical Path (Sequential Dependencies)

```
Redis Coordination Layer (Foundation)
├── redis-functions.sh ✓
├── redis-cli-wrapper.sh ✓
└── [Other coordination scripts] ✓

Loop Orchestration (Depends on Redis)
├── orchestrate.sh (complex, high-priority)
├── monitor-execution.sh
└── security_utils.sh

Docker Wave Execution (Parallel)
├── spawn-wave.sh
├── monitor-wave.sh
└── cleanup-wave.sh

Agent Spawning (Depends on Docker + Orchestration)
├── parse-agent-provider.sh
├── get-agent-provider-env.sh
├── spawn-worker.sh
└── spawn-agent.sh

Wave Checkpoint (Depends on Redis + Docker)
├── save-checkpoint.sh
├── resume-wave.sh
└── cleanup-orphans.sh

Product Owner Decision (Depends on Agent Spawning)
├── parse-decision.sh
├── validate-deliverables.sh
└── execute-decision.sh

Pre/Post Edit Hooks (Independent)
├── cfn-pre-edit-backup.sh
├── cfn-restore-from-backup.sh
├── cfn-invoke-pre-edit.sh
└── cfn-invoke-post-edit.sh
```

### Parallel Execution Groups

**Group 1 (Foundation - Migrate First):**
- Redis Coordination Layer (2,406 lines)
- Estimate: 50-60 hours
- Blockers: None

**Group 2 (Core Orchestration - After Group 1):**
- Loop Orchestration (1,229 lines core)
- Estimate: 70-90 hours
- Blockers: Group 1

**Group 3 (Can be Parallel with Group 2):**
- Process Lifecycle Management (200 lines)
- Pre/Post Edit Hooks (682 lines)
- Estimate: 50-65 hours
- Blockers: None

**Group 4 (Docker Infrastructure - After Group 2):**
- Docker Wave Execution (1,477 lines)
- Wave Checkpoint (983 lines)
- Estimate: 85-105 hours
- Blockers: Group 2

**Group 5 (Agent & Decision - After Group 4):**
- Agent Spawning (1,265 lines)
- Product Owner Decision (663 lines)
- Estimate: 65-85 hours
- Blockers: Group 4

**Group 6 (Output Processing & Testing - After Group 5):**
- Loop Output Processing (667 lines)
- Test Runner (524 lines)
- Loop2/3 Output Processing (800+ lines)
- Estimate: 50-70 hours
- Blockers: Group 5

---

## Part 3: Prioritized Migration List

### Phase 1: Foundation (Weeks 1-2) - 50-60 hours
**Goal:** Enable TypeScript coordination layer

1. **cfn-redis-coordination** (2,406 lines)
   - redis-functions.ts
   - redis-cli-wrapper.ts
   - store-context.ts
   - get-context.ts
   - report-completion.ts
   - collect-results.ts
   - (Continue with remaining scripts)

**Success Criteria:**
- All Redis coordination ops work in TypeScript
- Confidence: 0.95+
- Pass: All coordination tests

---

### Phase 2: Core Orchestration (Weeks 3-4) - 70-90 hours
**Goal:** Complete loop orchestration migration

1. **cfn-loop-orchestration** (2,382 lines)
   - security_utils.ts
   - orchestrate.ts (main, 1,229 lines)
   - monitor-execution.ts
   - inject-loop-context.ts

2. **cfn-process-lifecycle** (200 lines) - Can be parallel
   - process-manager.ts
   - check-dependencies.ts

3. **Pre/Post Edit Hooks** (682 lines) - Can be parallel
   - cfn-pre-edit-backup.ts
   - cfn-invoke-pre-edit.ts
   - cfn-invoke-post-edit.ts
   - (Continue with remaining hooks)

**Success Criteria:**
- Orchestration passes gate checks
- Confidence: 0.90+
- Loop iteration tracking works

---

### Phase 3: Docker & Wave Management (Weeks 5-6) - 85-105 hours
**Goal:** Complete Docker infrastructure

1. **cfn-docker-wave-execution** (1,477 lines + libs)
   - docker-helpers.ts (library)
   - spawn-wave.ts
   - monitor-wave.ts
   - cleanup-wave.ts

2. **cfn-wave-checkpoint** (983 lines)
   - save-checkpoint.ts
   - resume-wave.ts
   - cleanup-orphans.ts

**Success Criteria:**
- Wave execution fully TypeScript
- Confidence: 0.90+
- Container management works

---

### Phase 4: Agent Spawning & Decision (Weeks 7-8) - 65-85 hours
**Goal:** Complete agent lifecycle

1. **cfn-agent-spawning** (1,265 lines)
   - parse-agent-provider.ts
   - get-agent-provider-env.ts
   - spawn-worker.ts
   - spawn-templates.ts
   - spawn-agent.ts

2. **cfn-product-owner-decision** (663 lines)
   - parse-decision.ts
   - validate-deliverables.ts
   - execute-decision.ts

**Success Criteria:**
- All agent spawn variations work
- Confidence: 0.90+
- Decision parsing accurate

---

### Phase 5: Output Processing & Testing (Weeks 9-10) - 50-70 hours
**Goal:** Complete output handling

1. **cfn-loop3-output-processing** (667 lines)
   - execute-and-extract.ts
   - parse-confidence.ts
   - calculate-confidence.ts
   - verify-deliverables.ts

2. **cfn-test-runner** (524 lines)
   - validate-redis-keys.ts
   - run-all-tests.ts
   - detect-regressions.ts
   - store-benchmarks.ts

3. **cfn-loop2-output-processing** (~300 lines)
   - Output validation and processing

**Success Criteria:**
- Output processing passes tests
- Confidence: 0.90+
- Test runner executes

---

### Phase 6: Supporting Infrastructure (Week 11) - 30-40 hours
**Goal:** Migrate remaining supporting tools

1. **cfn-loop-validation** (415 lines)
2. **cfn-test-execution** (400 lines)
3. **cfn-docker-* supporting skills** (~1,500 lines)
4. Additional coordination utilities

**Success Criteria:**
- All supporting scripts migrated
- Confidence: 0.85+

---

## Part 4: Migration Effort Summary

### By Category

| Category | Scripts | LOC | Effort (hours) | Weeks |
|----------|---------|-----|---|---|
| Redis Coordination | 19 | 2,406 | 50-60 | 2 |
| Loop Orchestration | 7 | 2,382 | 70-90 | 2 |
| Docker Wave Execution | 3 | 1,477 | 45-55 | 1.5 |
| Wave Checkpoint | 3 | 983 | 40-50 | 1.5 |
| Agent Spawning | 6 | 1,265 | 40-50 | 1.5 |
| Product Owner Decision | 4 | 663 | 25-35 | 1 |
| Loop Output Processing | 6 | 667 | 20-30 | 1 |
| Test Runner | 5 | 524 | 25-35 | 1 |
| Pre/Post Edit Hooks | 9 | 682 | 35-45 | 1.5 |
| Process Lifecycle | 2 | 200 | 15-20 | 0.5 |
| Supporting Tools | 50+ | 2,000+ | 50-70 | 2 |
| **TOTAL** | **114 core** | **14,000+** | **415-535** | **10-14** |

**Total Effort Estimate: 280-350 developer-hours (with focusing on core infrastructure)**

### Timeline (Core Infrastructure Only)

- **Week 1-2:** Redis Coordination (Phase 1)
- **Week 3-4:** Loop Orchestration + Hooks (Phase 2)
- **Week 5-6:** Docker Wave + Checkpoints (Phase 3)
- **Week 7-8:** Agent Spawning + Decision (Phase 4)
- **Week 9-10:** Output Processing (Phase 5)

**Total: 10 weeks for complete core CFN infrastructure migration**

---

## Part 5: Risk Assessment & Mitigation

### High-Risk Migrations

1. **orchestrate.sh (1,229 lines)**
   - Risk: Complex state management, many dependencies
   - Mitigation: Break into 5 submodules, write extensive tests
   - Effort: 40-50 hours

2. **Redis Coordination Layer (2,406 lines)**
   - Risk: Critical for all coordination, blocking operations
   - Mitigation: Parallel bash + TypeScript transition period
   - Effort: 50-60 hours

3. **cfn-loop-exec.sh (468 lines)**
   - Risk: Main entry point, parameter validation critical
   - Mitigation: Comprehensive parameter testing
   - Effort: 15-20 hours

### Medium-Risk Migrations

- Docker Wave Execution (container management complexity)
- Wave Checkpoint (state serialization/deserialization)
- Agent Spawning (process fork handling)

### Low-Risk Migrations

- Helper functions and utilities
- Configuration parsing
- Validation scripts
- Hook scripts

---

## Part 6: Scripts That Should Stay Bash

### Justification
Some scripts are simpler, cleaner, and more maintainable in bash:

1. **All `check-dependencies.sh` scripts**
   - Single purpose: verify tool availability
   - Reason: Trivial in bash, adds no value in TypeScript
   - Keep: Yes

2. **Simple wrappers and property extractors**
   - Examples: `parse-agent-provider.sh`, `get-agent-provider-env.sh`
   - Reason: Pure string manipulation, 30-60 lines
   - Keep: Yes (or migrate as low priority)

3. **Test scaffolding scripts**
   - Examples: `test-*.sh` scripts
   - Reason: Not part of production orchestration
   - Keep: Yes

### Recommended Bash Retention

```
.claude/skills/cfn-*/check-dependencies.sh (all instances)
.claude/skills/cfn-*/lib/ (library files for external tools)
.claude/skills/cfn-*/test-*.sh (all test scaffolding)
Simple property extractors (<50 lines)
```

**Estimated Retention:** 50-60 scripts (~1,500-2,000 LOC)

---

## Part 7: Migration Checklist

### Pre-Migration
- [ ] Create TypeScript project structure
- [ ] Set up build configuration (tsc, esbuild, or tsup)
- [ ] Create Redis client TypeScript abstraction
- [ ] Create Docker client TypeScript abstraction
- [ ] Create Process management TypeScript utilities
- [ ] Establish test harness for TypeScript migration
- [ ] Create type definitions for bash-sourced config files

### Per-Script Migration
- [ ] Create TypeScript equivalent
- [ ] Migrate bash logic to TypeScript
- [ ] Write unit tests for script functions
- [ ] Create integration tests with dependent scripts
- [ ] Verify environment variable compatibility
- [ ] Test error handling and edge cases
- [ ] Update documentation and examples
- [ ] Create bash → TypeScript compatibility layer (if needed)
- [ ] Run regression tests against old bash version
- [ ] Update CLI invocations to use TypeScript

### Post-Migration
- [ ] Run full CFN Loop test suite
- [ ] Verify all integration points work
- [ ] Performance profiling (compare bash vs TypeScript)
- [ ] Update all documentation
- [ ] Remove deprecated bash scripts
- [ ] Archive bash originals for reference
- [ ] Update CI/CD pipelines

---

## Part 8: TypeScript Architecture Patterns

### Recommended Structure

```
src/cfn-infrastructure/
├── redis/
│   ├── client.ts              # Redis client abstraction
│   ├── coordinator.ts         # Coordination operations
│   ├── storage.ts             # Context/results storage
│   └── index.ts
├── orchestration/
│   ├── orchestrator.ts        # Main orchestration engine
│   ├── monitor.ts             # Execution monitoring
│   ├── context.ts             # Context injection
│   └── index.ts
├── docker/
│   ├── client.ts              # Docker client abstraction
│   ├── wave.ts                # Wave execution
│   ├── checkpoint.ts          # Wave checkpointing
│   └── index.ts
├── agents/
│   ├── spawner.ts             # Agent spawning
│   ├── templates.ts           # Spawn templates
│   └── index.ts
├── decision/
│   ├── executor.ts            # Decision execution
│   ├── parser.ts              # Decision parsing
│   └── index.ts
├── output/
│   ├── processor.ts           # Output processing
│   ├── validator.ts           # Output validation
│   └── index.ts
├── testing/
│   ├── runner.ts              # Test execution
│   ├── validator.ts           # Result validation
│   └── index.ts
├── lifecycle/
│   ├── process.ts             # Process management
│   └── index.ts
├── hooks/
│   ├── edit.ts                # Pre/post edit hooks
│   ├── backup.ts              # Backup management
│   └── index.ts
└── types/
    ├── agent.ts               # Agent type definitions
    ├── coordination.ts        # Coordination types
    ├── docker.ts              # Docker types
    └── index.ts
```

### Key Principles

1. **Type Safety:** Leverage TypeScript for type safety in coordination logic
2. **Error Handling:** Structured error types with context propagation
3. **Logging:** Structured logging with trace IDs for debugging
4. **Testing:** Jest test suites for each module
5. **Performance:** Monitor TypeScript execution vs bash baseline
6. **Compatibility:** Maintain shell invocation compatibility during transition

---

## Part 9: Success Criteria & Validation

### Phase Success Metrics

**Phase 1 (Redis Coordination)**
- [ ] All Redis operations work identically to bash
- [ ] Confidence scores: 0.95+
- [ ] Performance: <5% overhead vs bash
- [ ] Test pass rate: 100%

**Phase 2 (Loop Orchestration)**
- [ ] Orchestration spawns agents correctly
- [ ] Gate checks pass/fail appropriately
- [ ] Confidence scores: 0.90+
- [ ] Test pass rate: 95%+

**Phase 3 (Docker & Waves)**
- [ ] Container spawning works
- [ ] Checkpoint save/restore works
- [ ] Cleanup handles orphans
- [ ] Confidence scores: 0.90+
- [ ] Test pass rate: 95%+

**Phase 4 (Agent Spawning & Decision)**
- [ ] All agent types spawn correctly
- [ ] Decision parsing accurate
- [ ] Deliverable validation works
- [ ] Confidence scores: 0.90+
- [ ] Test pass rate: 95%+

**Phase 5 (Output Processing)**
- [ ] Output extraction works
- [ ] Confidence parsing accurate
- [ ] Test results validated
- [ ] Confidence scores: 0.90+
- [ ] Test pass rate: 95%+

### Overall Success Criteria

- [ ] 100+ core scripts migrated to TypeScript
- [ ] ~14,000+ lines of bash → TypeScript
- [ ] All CFN Loop executions work identically
- [ ] Overall test pass rate: 95%+
- [ ] Performance: <10% overhead vs bash
- [ ] Documentation updated
- [ ] Bash originals archived

---

## Conclusion

This migration plan enables complete TypeScript coverage of CFN infrastructure while maintaining backward compatibility and system reliability. The phased approach allows for parallel development, incremental testing, and early validation of critical paths.

**Total Estimated Effort:** 280-350 developer-hours  
**Total Estimated Timeline:** 10-14 weeks  
**Recommended Start:** Phase 1 (Redis Coordination)  
**Expected Benefit:** Type safety, improved maintainability, better IDE support, reduced bash complexity

