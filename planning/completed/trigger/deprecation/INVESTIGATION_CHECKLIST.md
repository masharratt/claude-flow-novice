# Skills Investigation Checklist

**Status:** PENDING - 8 skills with unclear deprecation status

These skills require investigation to confirm whether they should be deprecated or maintained in the NEW CLI mode architecture.

---

## Investigation Tasks

### 1. cfn-coordination
**Priority:** MEDIUM
**Current Status:** Referenced but unclear implementation

**Investigation Questions:**
- [ ] Does `.claude/skills/cfn-coordination/SKILL.md` exist?
  - Search result: Not found in initial glob (may be distributed)
- [ ] Is this redundant with cfn-loop-orchestration Redis coordination?
- [ ] What is actual role in NEW architecture (Redis BLPOP signaling)?
- [ ] Any active test coverage? Check: `tests/cli-mode/test-main-chat-blpop-signaling.ts`
- [ ] Any references in cfn-loop-orchestration orchestrate.ts?

**Evidence Trail:**
- Referenced in: `.claude/skills/workflow-codification/README_PHASE4.md:271`
- Referenced in: `.claude/skills/workflow-codification/EDGE_CASE_TRACKING.md:195`

**Decision Criteria:**
- IF coordination is handled entirely by cfn-loop-orchestration → DEPRECATE
- IF coordination has independent role (e.g., skill loader) → KEEP

**Action:** Research agent should examine cfn-coordination implementation and test coverage

---

### 2. cfn-dependency-ingestion
**Priority:** MEDIUM
**Current Status:** References OLD coordinator, unclear active usage

**Investigation Questions:**
- [ ] Is dependency ingestion still needed in NEW CLI mode?
- [ ] Does context-injector handle this now?
- [ ] Any test coverage? Check: `tests/cli-mode/`
- [ ] Used in agent spawning? Check: cfn-agent-spawning/src/spawn-agent.ts
- [ ] Can context be built entirely from cfn-loop database?

**Evidence Trail:**
- File: `.claude/skills/cfn-dependency-ingestion/SKILL.md:149`
- References: "`.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`"
- Multiple references to OLD coordinator pattern in README.md

**Decision Criteria:**
- IF context injection replaces dependency ingestion → DEPRECATE with context-injector reference
- IF agents still need explicit dependency scanning → KEEP with updated examples

**Action:** Compare cfn-dependency-ingestion with cfn-context-injector implementations

---

### 3. cfn-utilities
**Priority:** HIGH
**Current Status:** General utility library, may contain OLD patterns

**Investigation Questions:**
- [ ] Does cfn-utilities/SKILL.md reference orchestrate.sh? YES (line 164)
- [ ] What percentage of utilities are for OLD patterns vs. general use?
- [ ] Break down by function:
  - [ ] Logging utilities (KEEP)
  - [ ] Coordination utilities (review)
  - [ ] Process management (may be OLD pattern)
- [ ] Any retry logic still using orchestrate.sh patterns?

**Evidence Trail:**
- File: `.claude/skills/cfn-utilities/SKILL.md:164` - "`.claude/skills/cfn-loop-orchestration/orchestrate.sh` - retry logic"
- File: `.claude/skills/cfn-utilities/SKILL.md:69` - "Deprecated function used" example

**Decision Criteria:**
- IF utilities are all general purpose → KEEP
- IF utilities are 50%+ OLD patterns → REFACTOR into core + deprecated modules
- IF utilities conflict with TypeScript implementations → DEPRECATE bash versions

**Action:** Full code audit of cfn-utilities/SKILL.md and all function implementations

---

### 4. cfn-hybrid-routing
**Priority:** MEDIUM
**Current Status:** Hybrid provider routing, unclear vs. NEW cfn-provider-routing

**Investigation Questions:**
- [ ] How does hybrid routing differ from cfn-provider-routing?
- [ ] Is this for OLD coordinator multi-worker pattern?
- [ ] Active test coverage? Check: `tests/cli-mode/`
- [ ] Any references in cfn-loop-orchestration?
- [ ] Is this replacing or replacing cfn-provider-routing?

**Evidence Trail:**
- File: `.claude/skills/cfn-hybrid-routing/spawn-worker.sh:10` - Skill name extraction
- Unclear if this is OLD pattern or parallel NEW routing system

**Decision Criteria:**
- IF hybrid routing is experimental/duplicate → DEPRECATE
- IF hybrid routing handles specific cases → KEEP with clear scope definition
- IF subsumed by cfn-provider-routing → DEPRECATE with migration guide

**Action:** Compare cfn-hybrid-routing/src/ with cfn-provider-routing/src/ implementations

---

### 5. cfn-skill-propagation
**Priority:** LOW
**Current Status:** Skill update mechanism, unclear if used

**Investigation Questions:**
- [ ] Is skill propagation still needed in NEW architecture?
- [ ] How is this different from skill-loader?
- [ ] Any active test coverage?
- [ ] Is this part of agent skill management workflow?
- [ ] Used by any agents in production? Check: grep in `.claude/agents/`

**Evidence Trail:**
- File: No direct coordinator references found
- Utility library referenced in several skills

**Decision Criteria:**
- IF skill propagation is deprecated → DEPRECATE
- IF still needed for runtime skill updates → KEEP with clear use cases

**Action:** Audit skill-loader vs. cfn-skill-propagation overlap

---

### 6. cfn-error-logging (orchestrate.sh examples)
**Priority:** MEDIUM
**Current Status:** Core error logging KEEP, but orchestrate.sh examples need removal

**Investigation Questions:**
- [ ] Should orchestrate.sh integration examples be completely removed?
  - File: `.claude/skills/cfn-error-logging/SKILL.md:104` - "Add to orchestrate.sh error handling"
  - File: `.claude/skills/cfn-error-logging/SKILL.md:216` - cfn-v3-coordinator reference
- [ ] Are there any actual implementations using orchestrate.sh patterns?
- [ ] Should these be replaced with TypeScript examples?

**Evidence Trail:**
- File: `.claude/skills/cfn-error-logging/SKILL.md` - Multiple orchestrate.sh references
- Core logging functionality is clearly needed

**Decision Criteria:**
- Remove orchestrate.sh examples and replace with TypeScript equivalents
- Keep core error logging functionality

**Action:** Update cfn-error-logging/SKILL.md to remove OLD pattern examples

---

### 7. cfn-docker-logging (orchestrate.sh integration)
**Priority:** MEDIUM
**Current Status:** Core logging KEEP, orchestrate.sh examples DEPRECATE

**Investigation Questions:**
- [ ] What percentage of cfn-docker-logging is for OLD patterns vs. core functionality?
- [ ] Should INTEGRATION.md examples be completely rewritten for TypeScript?
- [ ] Are there any implementations actually using orchestrate.sh patterns?

**Evidence Trail:**
- File: `.claude/skills/cfn-docker-logging/SKILL.md:168` - "Integration with orchestrate.sh"
- File: `.claude/skills/cfn-docker-logging/INTEGRATION.md:92-96` - "Enhanced orchestrate.sh with hybrid logging"

**Decision Criteria:**
- Keep core Docker logging
- Remove/rewrite orchestrate.sh integration examples

**Action:** Audit cfn-docker-logging for actual dependencies on orchestrate.sh

---

### 8. cfn-agent-selector (verification needed)
**Priority:** LOW
**Current Status:** Agent selection appears active, but verify scope

**Investigation Questions:**
- [ ] Is cfn-agent-selector used in NEW CLI mode agent selection?
- [ ] How does this relate to cfn-task-classifier?
- [ ] Any test coverage in CLI mode tests?
- [ ] Overlap with cfn-provider-routing?

**Evidence Trail:**
- File: `.claude/skills/cfn-agent-selector/SKILL.md:141` - "For automatic agent selection based on task"
- Used in orchestrator context

**Decision Criteria:**
- If active in NEW architecture → KEEP
- If superseded by task-classifier + provider-routing → DEPRECATE

**Action:** Verify cfn-agent-selector usage in orchestrator spawning logic

---

## Investigation Execution Plan

### Phase 1: High-Priority Audits (Week 1-2)
- [ ] **cfn-utilities** - Full code audit
- [ ] **cfn-error-logging** - Remove OLD examples
- [ ] **cfn-docker-logging** - Remove OLD examples

### Phase 2: Comparison Analysis (Week 2-3)
- [ ] **cfn-hybrid-routing** vs **cfn-provider-routing** - Implementation comparison
- [ ] **cfn-dependency-ingestion** vs **cfn-context-injector** - Functional overlap
- [ ] **cfn-skill-propagation** vs **cfn-skill-loader** - Overlap analysis

### Phase 3: Verification (Week 3)
- [ ] **cfn-coordination** - Locate and examine implementation
- [ ] **cfn-agent-selector** - Verify usage in orchestrator
- [ ] **cfn-docker-logging** - Verify core functionality needed

---

## Template for Investigation Results

For each skill investigation, record:

```markdown
## [Skill Name] - Investigation Results

**Decision:** [DEPRECATE / KEEP / KEEP+REFACTOR]

**Reasoning:**
- Evidence for decision
- Key findings

**Actions Required:**
- [ ] Update/remove/refactor
- [ ] Update documentation
- [ ] Update tests

**Confidence:** 0.XX
```

---

## Related Documents

- **Full Deprecation Analysis:** `planning/trigger/deprecation/agent-2-zai-analysis.md`
- **Deprecation Summary:** `planning/trigger/deprecation/DEPRECATION_SUMMARY.md`
- **Skill Directory:** `.claude/skills/`
- **CLI Mode Documentation:** `CLAUDE.md` (lines 242-355)
- **Architecture Comparison:** `docs/COORDINATION_ARCHITECTURE_COMPARISON.md`

---

*Created: 2025-11-23*
*For: ZAI Agent - Skills Modernization Phase*
*Priority: HIGH - Blocks clean skill management in NEW CLI mode architecture*
