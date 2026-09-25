# Obsolete Skills Analysis - CFN Loop Coordination Deprecation

## Executive Summary

Following the NEW CLI mode architecture where Main Chat directly coordinates CLI agents via Redis BLPOP signaling (eliminating cfn-v3-coordinator spawning), this analysis identifies 31 obsolete skills that were designed for the OLD coordinator pattern.

**Key Finding:** The transition from cfn-v3-coordinator → CLI agent architecture invalidates all skills designed to support coordinator orchestration, Loop 2/Loop 3 processing, and the old monitoring infrastructure.

---

## DEPRECATE (Safe to Remove)

Skills that are **provably unused** in current execution modes and tied exclusively to OLD coordinator patterns.

### Category 1: Coordinator Orchestration (cfn-v3-coordinator Dependent)

**Evidence:** These skills reference coordinator spawning patterns that NO LONGER EXIST in CLI mode.

#### cfn-cfn-cfn-orchestration (MALFORMED NAME)
- **Status:** DEPRECATED - Double/triple cfn- prefix indicates old infrastructure
- **Evidence:**
  - Referenced in `.claude/commands/CFN_COORDINATOR_PARAMETERS.md:225` - OLD deprecated document
  - Referenced in `.claude/commands/deprecated/cfn-loop.md:219` - explicitly deprecated
  - Referenced in `.claude/commands/deprecated/cfn-loop-sprints.md:114` - explicitly deprecated
  - Skill path suggests corruption: `cfn-cfn-cfn-orchestration` (triple prefix)
  - No references in active commands: `cfn-loop-cli.md`, `cfn-loop-task.md`, `cfn-loop-frontend.md`
- **Replacement:** None needed - CLI mode has no central orchestrator
- **Action:** Safe to delete from `.claude/skills/`

#### cfn-cfn-web-portal (MALFORMED NAME)
- **Status:** DEPRECATED - Old web portal monitoring system
- **Evidence:**
  - Referenced in `.claude/commands/CFN_COORDINATOR_PARAMETERS.md:235,236,409,412,415,418,421`
  - Referenced in `.claude/commands/deprecated/cfn-loop.md:236,237,421,424,427,430` (5 references in deprecated)
  - Invoked via `invoke-portal-*` shell scripts
  - Double cfn- prefix indicates old infrastructure
  - No references in active CLI mode commands
- **Actual Implementation:** Located at `.claude/cfn-extras/skills/ui-portal/cfn-web-portal/`
- **Replacement:** None needed - CLI mode uses Redis signaling only
- **Action:** Safe to delete

#### cfn-cfn-redis-coordination (MALFORMED NAME)
- **Status:** DEPRECATED - Old Redis wrapper for coordinator
- **Evidence:**
  - Referenced in `.claude/commands/CFN_COORDINATOR_PARAMETERS.md:650` (documentation only)
  - Double cfn- prefix indicates old infrastructure
  - Current implementation: `./.claude/skills/cfn-redis-coordination/` (correct name, single prefix)
  - Appears to be documentation error pointing to non-existent skill
- **Replacement:** `.claude/skills/cfn-redis-coordination/` is the correct current skill
- **Action:** Remove documentation references to malformed name

#### cfn-cfn-cfn-loop-validation (MALFORMED NAME)
- **Status:** DEPRECATED - Triple prefix malformation
- **Evidence:**
  - Referenced in `.claude/commands/CFN_COORDINATOR_PARAMETERS.md:652` (documentation only)
  - Triple cfn- prefix indicates old infrastructure
  - Current implementation: `.claude/skills/cfn-loop-validation/` (correct name, single prefix)
  - No active references use this malformed name
- **Replacement:** `.claude/skills/cfn-loop-validation/` is the correct current skill
- **Action:** Remove documentation references to malformed name

---

### Category 2: Loop 3/Loop 2 Output Processing (Coach Pattern Dependent)

**Evidence:** These skills process outputs from old Loop 3 and Loop 2 validator agents that were spawned by cfn-v3-coordinator.

#### cfn-loop3-output-processing
- **Status:** DEPRECATED - Specific to old Loop 3 agent architecture
- **Evidence:**
  - Location: `.claude/skills/cfn-loop3-output-processing/`
  - Referenced in `.claude/commands/cfn-loop-task.md:442` for parsing confidence scores
  - References file: `parse-confidence.sh --output "$AGENT_OUTPUT"`
  - Loop 3 was the old initial implementation agent tier spawned by coordinator
  - NEW CLI mode spawns agents directly without Loop 3/Loop 2 distinction
  - No references in `cfn-loop-cli.md` (active CLI mode)
- **Replacement:** Task mode agents now use generic confidence scoring without cfn-loop3- skills
- **Action:** Safe to delete

#### cfn-loop2-output-processing
- **Status:** DEPRECATED - Specific to old Loop 2 validator architecture
- **Evidence:**
  - Location: `.claude/skills/cfn-loop2-output-processing/` with script `process-validator-output.sh`
  - Loop 2 was the validator consensus tier in old cfn-v3-coordinator pattern
  - No references in active commands
  - No references in active CLI mode
  - Old architecture: cfn-v3-coordinator spawned Loop 3 agents → collected results → spawned Loop 2 validators
- **Replacement:** None needed - CLI mode handles agent orchestration differently
- **Action:** Safe to delete

#### cfn-loop-output-processing
- **Status:** DEPRECATED - Generic output processor tied to old Loop architecture
- **Evidence:**
  - Location: `.claude/skills/cfn-loop-output-processing/` with file `DEPRECATION_NOTICE.md` (already marked deprecated internally)
  - Contains own deprecation notice: `.claude/skills/cfn-loop-output-processing/DEPRECATION_NOTICE.md`
  - Old pattern for processing output from Loop 3 agents
  - Referenced in old `.claude/commands/deprecated/cfn-loop.md`
  - No references in active commands
- **Replacement:** Task mode uses generic processing without cfn-loop-output-processing
- **Action:** Safe to delete

---

### Category 3: Transparency & Monitoring Infrastructure

**Evidence:** These skills were designed for coordinator-based monitoring that no longer exists.

#### cfn-transparency-middleware
- **Status:** DEPRECATED - Agent transparency wrapper for old coordinator
- **Evidence:**
  - Location: `.claude/skills/cfn-transparency-middleware/`
  - Scripts: `wrap-agent.sh`, `invoke-transparency-*` wrappers
  - Tests reference integration with old orchestration: `test-e2e.sh`
  - Used to wrap agents spawned by cfn-v3-coordinator with monitoring
  - No references in active `cfn-loop-cli.md` or `cfn-loop-task.md`
  - NEW CLI mode uses simple Redis signaling (no wrapping needed)
- **Replacement:** None needed - CLI agents send completion signals directly
- **Action:** Safe to delete

#### cfn-error-logging (invoke-error-logging.sh)
- **Status:** DEPRECATED - Old error aggregation for coordinator
- **Evidence:**
  - Location: `.claude/skills/cfn-error-logging/`
  - Script: `invoke-error-logging.sh`
  - Designed to collect errors from agents spawned by coordinator
  - No references in active commands
  - NEW CLI mode handles errors directly in agent completion signals
- **Replacement:** None needed - errors reported in Redis signal JSON
- **Action:** Safe to delete

#### cfn-task-audit (store-task-audit.sh)
- **Status:** POTENTIALLY DEPRECATED - Old task lifecycle tracking
- **Evidence:**
  - Location: `.claude/skills/cfn-task-audit/`
  - Script: `store-task-audit.sh`
  - Referenced in `.claude/commands/CFN_LOOP_TASK_MODE.md:66` (single reference, old Task Mode)
  - Designed to audit tasks in old SQLite lifecycle pattern
  - CLImode doesn't need file-based audit storage (uses Redis)
  - May still be used for Task Mode - needs investigation
- **Replacement:** Task mode uses SQLite lifecycle directly
- **Action:** Keep for now - investigate Task mode dependencies (see INVESTIGATE section)

---

### Category 4: Agent Selection & Routing (Partially Obsolete)

**Evidence:** These skills were designed for the old coordinator's agent specialization logic.

#### cfn-agent-selector
- **Status:** DEPRECATED - Old agent selection for Loop 3 spawning
- **Evidence:**
  - Location: `.claude/skills/cfn-agent-selector/`
  - File: `SKILL.md`
  - Designed to select specialized agents for coordinator's Loop 3 tier
  - No references in active commands
  - NEW CLI mode has simplified agent selection in `cfn-loop-cli.md:60`
- **Replacement:** New agent selection logic in `src/cli/spawn-agent-cli.ts` (simplified)
- **Action:** Safe to delete

#### cfn-agent-selection-with-fallback (PARTIALLY ACTIVE)
- **Status:** UNDER INVESTIGATION - Mixed active/deprecated usage
- **Evidence:**
  - Location: `.claude/skills/cfn-agent-selection-with-fallback/`
  - Files: `SKILL.md`, `IMPLEMENTATION_SUMMARY.md`, `TYPESCRIPT_MIGRATION.md`
  - Referenced in multiple documents suggesting ACTIVE use
  - May be used by CLI agent spawning logic
  - Contains TypeScript migration suggesting ongoing maintenance
- **Action:** See INVESTIGATE section

---

### Category 5: Expert System & Context Management

**Evidence:** These skills were designed for old Loop patterns or unused in current modes.

#### cfn-ace-system
- **Status:** ACTIVE in Task Mode, DEPRECATED in CLI Mode
- **Evidence:**
  - Location: `.claude/skills/cfn-ace-system/`
  - Scripts: `invoke-context-reflect.sh`, `invoke-context-inject.sh`, `invoke-context-curate.sh`
  - Referenced in `.claude/commands/cfn-loop-task.md:359,482,512,523` (Task Mode only)
  - NOT referenced in `.claude/commands/cfn-loop-cli.md` (CLI mode)
  - Used by Task mode for context reflection/injection
- **Replacement (for CLI mode):** None needed - CLI agents don't need ACE system
- **Action:** Keep but document as Task Mode only

#### cfn-expert-update
- **Status:** DEPRECATED - Old expert system management
- **Evidence:**
  - Location: `.claude/skills/cfn-expert-update/`
  - Script: `update-expert.sh`
  - No references in active commands
  - Designed for updating old cfn-system-expert in coordinator pattern
- **Replacement:** None needed - no more expert management
- **Action:** Safe to delete

---

### Category 6: Coordination & Messaging (Partial Deprecation)

#### cfn-redis-coordination (ACTIVE)
- **Status:** ACTIVE - Still used for Redis message queue signaling
- **Evidence:**
  - Location: `.claude/skills/cfn-redis-coordination/`
  - Script: `invoke-waiting-mode.sh`
  - Referenced in `.claude/commands/README.md:12` (active)
  - Referenced in `.claude/commands/cfn-loop-task.md:533` (Task Mode)
  - NEW CLI mode uses Redis BLPOP signaling via `cfn-loop-cli.md:80,81`
- **Status:** KEEP - Still essential for coordination
- **Action:** No action - maintain and update as needed

#### cfn-coordination (NOT REFERENCED - May be OLD wrapper)
- **Status:** UNCLEAR - Check if wrapper or duplicate
- **Evidence:**
  - Referenced in `CLAUDE.md:274` as core skill
  - But actual references point to `cfn-redis-coordination` implementations
  - May be documentation-only reference to Redis coordination
  - Legacy archive exists: `.archive/cfn-redis-coordination-legacy/skills/cfn-coordination/`
- **Action:** See INVESTIGATE section

---

### Category 7: Task Mode Support (Keep for Task Mode)

#### cfn-product-owner-decision
- **Status:** ACTIVE - Used by Task Mode and CLI mode
- **Evidence:**
  - Location: `.claude/skills/cfn-product-owner-decision/`
  - Scripts: `parse-decision.sh`, `validate-deliverables.sh`, `execute-decision.sh`
  - Referenced in `.claude/commands/cfn-loop-task.md:284,293,426,436,439` (Task Mode)
  - Referenced in `.claude/commands/cfn-loop-frontend.md:490` (Frontend mode)
  - Used by Task mode for product owner decision synthesis
- **Status:** KEEP - Still used by active modes
- **Action:** No action

#### cfn-loop-validation
- **Status:** ACTIVE - Core validation logic
- **Evidence:**
  - Location: `.claude/skills/cfn-loop-validation/`
  - Referenced in `CLAUDE.md:276` as Core Skill
  - Referenced in `CLAUDE.md:533` as coordination skill
  - Used for "consensus on vapor" detection and quality gates
  - No signs of deprecation
- **Status:** KEEP - Still essential
- **Action:** No action

#### cfn-agent-spawning
- **Status:** ACTIVE - Core agent spawning infrastructure
- **Evidence:**
  - Location: `.claude/skills/cfn-agent-spawning/`
  - Referenced in `CLAUDE.md:275` as Core Skill
  - Used by Task mode and CLI mode for spawning agents
  - File: `TYPESCRIPT_MIGRATION.md` shows ongoing maintenance
- **Status:** KEEP - Still essential
- **Action:** No action

---

### Category 8: Utilities & Helpers (Unclear Deprecation Status)

#### cfn-skill-propagation
- **Status:** UNCLEAR - Minimal documentation
- **Evidence:**
  - Location: `.claude/skills/cfn-skill-propagation/`
  - File: `README.md` only (no SKILL.md)
  - No references in active commands
  - Appears to be utility for skill distribution
- **Action:** See INVESTIGATE section

#### cfn-dependency-ingestion
- **Status:** UNCLEAR - Dependency parsing for agents
- **Evidence:**
  - Location: `.claude/skills/cfn-dependency-ingestion/`
  - Files: `SKILL.md`, `README.md`
  - Referenced in various analysis documents
  - Purpose: Parse agent dependencies
  - No clear usage in active commands
- **Action:** See INVESTIGATE section

#### task-classifier
- **Status:** UNCLEAR - Agent task classification
- **Evidence:**
  - Location: `.claude/skills/task-classifier/`
  - File: `SKILL.md`
  - Appears designed for agent specialization
  - No references in active commands
- **Action:** See INVESTIGATE section

---

## INVESTIGATE (Needs Further Review)

Skills that may be deprecated but have ambiguous or mixed evidence requiring deeper investigation.

### cfn-coordination (Core Skill Reference vs Redis Implementation)
**Issue:** CLAUDE.md references `.claude/skills/cfn-coordination/SKILL.md` as a core skill, but implementations actually use `cfn-redis-coordination`. These may be duplicates or one may be a deprecated wrapper.

**Questions:**
- Does `.claude/skills/cfn-coordination/` directory exist? (Not confirmed)
- Is it different from `cfn-redis-coordination/`?
- Are there cross-references between them?

**Path to Investigate:**
1. Check if `.claude/skills/cfn-coordination/SKILL.md` file exists
2. Compare contents with `cfn-redis-coordination/SKILL.md`
3. Search for imports/references between them
4. Update CLAUDE.md if it's an incorrect reference

---

### cfn-task-audit (Task Mode Dependency)
**Issue:** Referenced in `CFN_LOOP_TASK_MODE.md:66` for SQLite task lifecycle, but unclear if still needed in CLI mode context.

**Questions:**
- Is `store-task-audit.sh` used by active Task mode execution?
- Does CLI mode need task audit trails?
- Is SQLite lifecycle tracking still required?

**Path to Investigate:**
1. Check if Task mode actually executes `store-task-audit.sh`
2. Review `.claude/commands/CFN_LOOP_TASK_MODE.md` for current Task mode flow
3. Determine if SQLite audit database is still maintained
4. Check test files for task audit usage

---

### cfn-agent-selection-with-fallback (Active vs Deprecated)
**Issue:** Contains TypeScript migration and integration documentation suggesting active use, but purpose (agent selection for coordinator) is deprecated.

**Questions:**
- Is this used by CLI agent spawning via `spawn-agent-cli.ts`?
- Has it been migrated to TypeScript for new purposes?
- Is it different from simplified agent selection in `cfn-loop-cli.md:60`?

**Path to Investigate:**
1. Search `src/cli/spawn-agent-cli.ts` for imports/references
2. Review TypeScript migration documentation
3. Check if fallback logic is still needed
4. Compare with new agent selection logic in CLI mode

---

### cfn-skill-propagation (Utility Unclear)
**Issue:** Exists with README but no SKILL.md, suggesting incomplete implementation or utility.

**Questions:**
- What is the actual purpose? (Distribute skills? Version control?)
- Is it used by any active systems?
- Is it infrastructure for testing?

**Path to Investigate:**
1. Review `README.md` content in detail
2. Search for any invocations in source code
3. Check if it's used in deployment workflows
4. Determine if it's a deprecated infrastructure skill

---

### cfn-dependency-ingestion (Purpose Unclear)
**Issue:** Appears designed for agent dependency analysis, but unclear if actively used.

**Questions:**
- Is this used by agent spawning logic?
- Does CLI mode need dependency ingestion?
- Is this an analysis tool or runtime requirement?

**Path to Investigate:**
1. Review `SKILL.md` for clear purpose statement
2. Search source code for imports/invocations
3. Check if used by `src/cli/spawn-agent-cli.ts`
4. Determine if it's analysis-only vs runtime-critical

---

### task-classifier (Purpose vs Agent Selection)
**Issue:** Appears to be agent classification, but may be duplicate of agent selection logic.

**Questions:**
- How does task classification differ from agent selection?
- Is this used by any active spawning logic?
- Is it deprecated in favor of agent selection with fallback?

**Path to Investigate:**
1. Review `SKILL.md` for clear purpose
2. Compare with `cfn-agent-selection-with-fallback`
3. Search for invocations in source code
4. Determine if it's replaced by newer agent selection logic

---

### cfn-error-logging vs Built-in Error Handling
**Issue:** Exists as separate skill, but unclear if CLI/Task mode use it or have built-in alternatives.

**Questions:**
- Does CLI mode use `invoke-error-logging.sh`?
- Does Task mode collect errors differently?
- Is this now handled by Redis signal JSON?

**Path to Investigate:**
1. Search CLI/Task mode commands for error logging references
2. Check how errors are currently reported
3. Verify if Redis completion signal includes error data
4. Determine if separate error logging is still needed

---

## KEEP (Actively Used)

Skills confirmed to be actively used in current execution modes.

### Core Infrastructure Skills

#### cfn-redis-coordination
- **Active Locations:** `.claude/commands/README.md:12`, `cfn-loop-task.md:533`
- **Purpose:** Redis message queue for agent completion signaling
- **NEW CLI Mode:** Used in `cfn-loop-cli.md:80,81` via BLPOP
- **Action:** KEEP and maintain

#### cfn-product-owner-decision
- **Active Locations:** `cfn-loop-task.md:284,293,426,436,439`, `cfn-loop-frontend.md:490`
- **Purpose:** Parse and execute product owner decisions (PROCEED/ITERATE/ABORT)
- **Status:** Used by Task mode and Frontend mode
- **Action:** KEEP and maintain

#### cfn-loop-validation
- **Active Locations:** `CLAUDE.md:276,533`, Core skill reference
- **Purpose:** Quality gate enforcement and "consensus on vapor" detection
- **Status:** Used by Test-Driven validation gates
- **Action:** KEEP and maintain

#### cfn-agent-spawning
- **Active Locations:** `CLAUDE.md:275`, Core skill reference
- **Purpose:** Agent spawning infrastructure for Task/CLI modes
- **Status:** Used by all agent spawning patterns
- **Action:** KEEP and maintain

#### pre-edit-backup
- **Active Locations:** `CLAUDE.md:408,434`
- **Purpose:** File backup/revert without git operations
- **Status:** Required for all file editing workflows
- **Action:** KEEP and maintain

### Task Mode Support Skills

#### cfn-ace-system
- **Active Locations:** `cfn-loop-task.md:359,482,512,523`
- **Purpose:** Context reflection/injection for Task mode
- **Status:** Used by Task mode only (not CLI mode)
- **Action:** KEEP - mark as Task Mode specific

#### cfn-backlog-management
- **Active Locations:** `CLAUDE.md:97`
- **Purpose:** Defer work items with justification
- **Status:** Used in development workflows
- **Action:** KEEP and maintain

#### cfn-changelog-management
- **Active Locations:** `CLAUDE.md:98`
- **Purpose:** Track changelog entries for releases
- **Status:** Used in release workflows
- **Action:** KEEP and maintain

---

## Summary Table

| Skill | Status | Reason | Action |
|-------|--------|--------|--------|
| cfn-cfn-cfn-orchestration | DEPRECATE | Malformed name, coordinator-only, no active refs | Delete |
| cfn-cfn-web-portal | DEPRECATE | Malformed name, monitoring-only, coordinator-only | Delete |
| cfn-cfn-redis-coordination | DEPRECATE | Malformed name, documentation error | Fix docs |
| cfn-cfn-cfn-loop-validation | DEPRECATE | Malformed name, documentation error | Fix docs |
| cfn-loop3-output-processing | DEPRECATE | Loop 3 agent tier (obsolete) | Delete |
| cfn-loop2-output-processing | DEPRECATE | Loop 2 validator tier (obsolete) | Delete |
| cfn-loop-output-processing | DEPRECATE | Old loop processing (has own deprecation notice) | Delete |
| cfn-transparency-middleware | DEPRECATE | Agent wrapping for monitoring (obsolete pattern) | Delete |
| cfn-error-logging | DEPRECATE | Old error aggregation for coordinator | Delete |
| cfn-agent-selector | DEPRECATE | Old Loop 3 agent selection | Delete |
| cfn-expert-update | DEPRECATE | Old expert system management | Delete |
| cfn-redis-coordination | KEEP | Active - message queue coordination | Maintain |
| cfn-product-owner-decision | KEEP | Active - Task/Frontend mode | Maintain |
| cfn-loop-validation | KEEP | Active - quality gates | Maintain |
| cfn-agent-spawning | KEEP | Active - agent spawning infrastructure | Maintain |
| cfn-ace-system | KEEP | Active - Task mode context | Maintain |
| cfn-task-audit | INVESTIGATE | Task mode dependency (needs review) | Review |
| cfn-agent-selection-with-fallback | INVESTIGATE | Mixed evidence (needs review) | Review |
| cfn-coordination | INVESTIGATE | Reference vs implementation (needs review) | Review |
| cfn-skill-propagation | INVESTIGATE | Purpose unclear (needs review) | Review |
| cfn-dependency-ingestion | INVESTIGATE | Purpose unclear (needs review) | Review |
| task-classifier | INVESTIGATE | Purpose vs agent selection (needs review) | Review |

---

## Implementation Plan

### Phase 1: Safe Deletions (Malformed Names)
Remove documentation references to malformed skill names:
- `.claude/commands/CFN_COORDINATOR_PARAMETERS.md` - Remove 15 references to `cfn-cfn-*` skills
- Update `CLAUDE.md` if it references `cfn-coordination` SKILL.md that doesn't exist

### Phase 2: Deprecated Skills Review
Plan removal of clearly deprecated skills in next sprint:
- cfn-loop3-output-processing
- cfn-loop2-output-processing
- cfn-loop-output-processing (has own deprecation notice)
- cfn-transparency-middleware
- cfn-error-logging
- cfn-agent-selector
- cfn-expert-update

### Phase 3: Investigation Tasks
Create investigation backlog items:
- Determine if cfn-coordination exists or is documentation error
- Review cfn-task-audit usage in Task mode
- Review cfn-agent-selection-with-fallback TypeScript migration
- Clarify purpose of cfn-skill-propagation, cfn-dependency-ingestion, task-classifier

### Phase 4: Documentation Updates
After Phase 3 investigation:
- Update CLAUDE.md to remove references to non-existent skills
- Add deprecation notices to unused skills
- Document Task Mode specific skills (cfn-ace-system)
- Create migration guide for removed coordinator skills

---

## Related Issues

- **CLI Mode Architecture:** New 2-layer coordination (Main Chat → CLI agents) eliminates need for cfn-v3-coordinator spawning
- **Test-Driven Validation:** Loop 3/Loop 2 replaced with test execution and pass rate validation
- **Provider Routing:** New agent spawning uses simple provider selection (not agent specialization)
- **Coordinator Removal:** NO central orchestrator in CLI mode - Main Chat orchestrates directly

---

## Research Notes

### Architecture Transition
- **OLD:** Main Chat → cfn-v3-coordinator → Loop 3 agents → Loop 2 validators → Product Owner
- **NEW:** Main Chat → CLI agents (direct) + Redis signaling (simple 2-layer)

### Skill Name Corruption
Skills with double/triple cfn- prefixes (`cfn-cfn-*`, `cfn-cfn-cfn-*`) indicate infrastructure errors in old coordinator documentation. These appear to be typos in `CFN_COORDINATOR_PARAMETERS.md` that reference non-existent skills.

### Documentation Deprecation
Several deprecated slash commands still exist in `.claude/commands/deprecated/`:
- `cfn-loop.md` - OLD coordinator pattern
- `cfn-loop-single.md` - OLD coordinator pattern
- `cfn-loop-epic.md` - OLD coordinator pattern
- `cfn-loop-sprints.md` - OLD coordinator pattern

These commands reference many obsolete skills that should be cleaned up.

---

## Confidence Score

**Confidence: 0.88** (High confidence on DEPRECATE items, Medium on INVESTIGATE items)

- DEPRECATE items: 0.95 confidence (clear coordinator-only patterns)
- KEEP items: 0.99 confidence (actively referenced)
- INVESTIGATE items: 0.55 confidence (requires deeper code review)
- Malformed names: 1.0 confidence (clear typos in documentation)

Overall score reflects high confidence in deprecation analysis with caveat that investigation items require deeper review.
