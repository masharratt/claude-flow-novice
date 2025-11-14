# Skills Analysis Report - CFN Extras Migration Recommendation

## Executive Summary

**Total skills analyzed:** 87  
**Skills with SKILL.md:** 76  
**Recommend keeping in core:** 14  
**Recommend moving to cfn-extras:** 73  
**Deprecated/orphaned:** 5  

---

## KEEP IN CORE (Essential for CFN Loop)

Essential skills required for basic CFN Loop v3 execution, coordination, and lifecycle management. These 14-15 skills form the minimal viable set for CFN Loop to function.

### Core Agent Lifecycle (Spawn → Execute → Validate → Decide)
1. **cfn-agent-spawning** - Dynamic agent deployment; fundamental to loop execution
2. **cfn-process-lifecycle** - Agent lifecycle management and health checking
3. **agent-lifecycle** - SQLite lifecycle hooks for agent tracking

### Core Output Processing (All Agent Types)
4. **cfn-agent-output-processing** - Universal output parsing for all agent types; critical path
5. **cfn-loop2-output-processing** - Loop 2 validator feedback parsing
6. **cfn-loop3-output-processing** - Loop 3 producer confidence score parsing

### Core Loop Control & Validation
7. **cfn-loop-orchestration** - Core orchestration engine with enhanced monitoring v3.0
8. **cfn-loop-validation** - Multi-layer validation gates for loop progression
9. **cfn-product-owner-decision** - Strategic decision-making; loop control flow
10. **cfn-defense-in-depth** - Validation anti-patterns (prevents "consensus on vapor")

### Core State & Safety
11. **cfn-sqlite-memory** - Multi-tier persistence for loop state
12. **cfn-memory-management** - Memory leak prevention and process safety
13. **cfn-standardized-error-handling** - Unified error capture and reporting
14. **cfn-hook-pipeline** - Post-edit validation and file integrity
15. **pre-edit-backup** - Safe file revert without git during parallel sessions

**Reasoning:** These skills handle the complete loop lifecycle: agent lifecycle (spawn → execute → validate → decide → complete), state persistence (SQLite memory layer), output processing for all three loop tiers (Loop 3 producers, Loop 2 validators, Product Owner), validation gates to prevent invalid progression, and file safety operations without git conflicts.

---

## MOVE TO cfn-extras (Optional/Specialized)

### Docker-Specific (10 skills)
Only needed for containerized deployments; not required for local CLI execution.

- **cfn-docker-agent-spawning** - Container-based agent execution
- **cfn-docker-loop-orchestration** - Container orchestration wrapper
- **cfn-docker-redis-coordination** - Redis coordination for Docker
- **cfn-docker-skill-mcp-selection** - MCP routing for containers
- **cfn-docker-wave-execution** - Parallel Docker container execution
- **cfn-wave-checkpoint** - Crash recovery for wave execution
- **cfn-redis-coordination** - Redis-based coordination layer (CLI mode uses file-based)
- **cfn-redis-cleanup** - Redis maintenance utility
- **cfn-redis-data-extraction** - Diagnostic tool for Redis state
- **docker-build** - Docker image building

**Migration destination:** `cfn-extras/docker-deployment/`

---

### Testing & QA (4 skills)
Test-specific utilities; not needed for production loop execution.

- **cfn-test-execution** - Coordinator-pattern test runner
- **cfn-test-runner** - Unified test execution wrapper
- **cfn-webapp-testing** - Playwright visual regression
- **cfn-validation-runner-instrumentation** - Test instrumentation

**Migration destination:** `cfn-extras/testing/`

---

### Analytics & Monitoring (6 skills)
Optional reporting and visualization; useful for insight but not required for core execution.

- **cfn-analytics** - Analytics collection and reporting
- **cfn-memory-monitoring** - Docker-specific memory tracking
- **cfn-telemetry** - Metrics and telemetry collection
- **cfn-improvement-recommender** - Sprint retrospective analysis
- **cfn-retrospective-report** - Human-readable sprint reports
- **cfn-pattern-extraction** - Learning from historical sprints

**Migration destination:** `cfn-extras/analytics/`

---

### UI/Portal (4 skills)
Web interface and visualization; standalone feature independent of core loop.

- **cfn-web-portal** - Monitoring & visualization dashboard
- **cfn-chrome-devtools** - Browser automation support
- **cfn-playwright-testing** - E2E testing framework
- **cfn-shadcn-components** - UI component library

**Migration destination:** `cfn-extras/web-portal/`

---

### Sprint/Project Management (7 skills)
Planning and decomposition utilities; optional for teams using external PM tools or those that don't need automated planning.

- **cfn-sprint-planner** - Sprint plan generation
- **cfn-sprint-execution** - Sprint execution wrapper
- **cfn-epic-decomposer** - Epic → Sprint decomposition
- **cfn-task-classifier** - Task type detection
- **cfn-complexity-estimator** - Complexity scoring
- **cfn-scope-simplifier** - Scope reduction recommendations
- **cfn-dependency-extractor** - Dependency mapping

**Migration destination:** `cfn-extras/project-management/`

---

### Documentation & Workflow (5 skills)
Meta-documentation and playbook management; nice-to-have features not essential for core execution.

- **cfn-backlog-management** - Backlog item tracking
- **cfn-changelog-management** - Release notes management
- **cfn-playbook** - Pattern library storage
- **cfn-playbook-auto-update** - Playbook auto-learning
- **cfn-skill-builder** - Skill scaffolding tool

**Migration destination:** `cfn-extras/documentation/`

---

### Specialized/Optional (29 skills)
Advanced features, recovery mechanisms, and team-specific customizations.

**Error Handling & Recovery:**
- cfn-error-batching-strategy - Error aggregation (use case-specific)
- cfn-error-logging - Error logging (optional; could use system logs)
- cfn-intervention-detector - Stuck agent detection (useful but not essential)
- cfn-intervention-orchestrator - Recovery orchestration (depends on detector)

**Advanced Coordination:**
- cfn-multi-coordinator-planning - Multi-team coordination
- cfn-mcp-container-selector - MCP routing (Docker-adjacent)
- cfn-hybrid-routing - Adaptive routing strategies
- cfn-fleet-manager - Fleet management (multi-team)
- cfn-event-bus - Event-driven architecture (optional)

**Context Management:**
- cfn-context-pruner - Context summarization (optimization)
- cfn-config-management - Configuration management
- cfn-environment-sanitization - Environment cleanup (safety)
- cfn-automatic-memory-persistence - Auto memory persistence (optional)

**Agent Customization:**
- cfn-specialist-injection - Dynamic specialist addition
- cfn-agent-swap - Agent replacement recommendations
- cfn-process-instrumentation - Detailed process logging (debugging)
- cfn-transparency-middleware - Visibility middleware

**Task Management:**
- cfn-task-config-init - Task config scaffolding
- cfn-task-decomposition - Task breakdown utility
- cfn-task-mode-safety - Safety checks (could be in core)
- cfn-task-mode-sanitize - Environment sanitization
- cfn-task-audit - Audit trail logging
- cfn-validation-templates - Validation criteria templates

**Emerging Features:**
- cfn-node-heap-sizer - Node.js heap optimization (advanced)
- cfn-vision-analysis - Vision model integration (experimental)
- cfn-deliverable-validation - Output validation (partial overlap with defense-in-depth)
- cfn-checkpoint-state - State checkpointing
- cfn-expert-update - Expert system updates (deprecated concept)

**Migration destination:** `cfn-extras/advanced-features/` or category-specific subdirectories

---

## DEPRECATED/ORPHANED (5 skills)

These have been superseded by newer implementations or represent outdated patterns.

- **cfn-agent-discovery** - Replaced by agent directory scanning in agents/*.md
- **cfn-agent-selector** - Replaced by cfn-task-classifier + agent-spawning
- **cfn-ace-system** - Old adaptive system (superseded by modern agents)
- **cfn-cli-setup** - One-time setup utility (stale)
- **cfn-simplified-agent-lifecycle** - Legacy lifecycle (replaced by current agent-lifecycle)

**Recommendation:** Move to `cfn-extras/deprecated/` for archival; consider removal in next major version.

---

## Summary by Category

| Category | Count | Fate |
|----------|-------|------|
| **Core (Keep)** | 15 | Stay in `.claude/skills/` |
| **Docker-Specific** | 10 | Move to `cfn-extras/docker-deployment/` |
| **Testing** | 4 | Move to `cfn-extras/testing/` |
| **Analytics** | 6 | Move to `cfn-extras/analytics/` |
| **UI/Portal** | 4 | Move to `cfn-extras/web-portal/` |
| **Project Management** | 7 | Move to `cfn-extras/project-management/` |
| **Documentation** | 5 | Move to `cfn-extras/documentation/` |
| **Specialized/Optional** | 29 | Move to `cfn-extras/advanced-features/` |
| **Deprecated** | 5 | Move to `cfn-extras/deprecated/` |
| **TOTAL** | **85** | |

**Note:** 2 skills (cfn-agent-execution, cfn-api-validation) lack SKILL.md files and require documentation audit before migration.

---

## Skills Lacking SKILL.md Documentation (Audit Required)

These directories exist but lack proper SKILL.md documentation (13 total). They should be documented, consolidated, or removed before migration:

- cfn-redis-coordination - Needs SKILL.md or consolidate with cfn-docker-redis-coordination
- cfn-redis-cleanup - Needs SKILL.md or consolidate
- cfn-analytics - Needs SKILL.md
- cfn-telemetry - Needs SKILL.md
- cfn-chrome-devtools - Needs SKILL.md or verify active
- cfn-playwright-testing - Needs SKILL.md (overlaps with cfn-webapp-testing)
- cfn-shadcn-components - Needs SKILL.md
- cfn-validation-runner-instrumentation - Needs SKILL.md
- cfn-checkpoint-state - Needs SKILL.md
- cfn-deliverable-validation - Needs SKILL.md
- cfn-expert-update - Needs SKILL.md or archive as deprecated
- cfn-node-heap-sizer - Needs SKILL.md
- cfn-task-audit - Needs SKILL.md
- cfn-task-mode-safety - Needs SKILL.md
- cfn-task-mode-sanitize - Needs SKILL.md
- cfn-task-decomposition - Needs SKILL.md
- cfn-vision-analysis - Needs SKILL.md
- cfn-cli-setup - Needs SKILL.md or archive as deprecated
- cfn-simplified-agent-lifecycle - Needs SKILL.md or archive as deprecated
- hook-pipeline - Duplicate of cfn-hook-pipeline, remove or consolidate
- pre-edit-backup - May be symlink or duplicate; verify

**Action before migration:** Create SKILL.md for each or remove if obsolete.

---

## Implementation Strategy

### Phase 1: Core Consolidation (Week 1)
1. Identify and document the 15 core skills with integration tests
2. Create comprehensive dependency graph
3. Verify core skills work in isolation
4. Create `/docs/CORE_SKILLS_REFERENCE.md`

### Phase 2: cfn-extras Repository Setup (Week 1-2)
1. Create directory structure:
   ```
   cfn-extras/
   ├── docker-deployment/
   │   ├── README.md
   │   └── skills/
   ├── testing/
   │   └── skills/
   ├── analytics/
   │   └── skills/
   ├── web-portal/
   │   └── skills/
   ├── project-management/
   │   └── skills/
   ├── documentation/
   │   └── skills/
   ├── advanced-features/
   │   └── skills/
   └── deprecated/
       └── skills/
   ```

2. Create migration mapping document
3. Create import shims (optional) for backward compatibility

### Phase 3: Testing & Validation (Week 2-3)
1. Verify core skills work without cfn-extras
2. Test optional skill loading when available
3. Run full CFN Loop with only core skills
4. Update documentation with migration guide

### Phase 4: Cleanup & Removal (Week 3-4)
1. Remove migrated skills from core `.claude/skills/`
2. Update agent prompt builders to reference cfn-extras when needed
3. Archive deprecated skills
4. Create MIGRATION_GUIDE.md for users

---

## Risk Assessment

**Low Risk Moves (Safe to migrate immediately):**
- Docker skills (only used with Docker coordinator, no core dependencies)
- Testing skills (only in test phases, isolated from loop)
- UI/Portal (standalone feature, zero dependencies)
- Documentation/workflow (meta features, no execution dependencies)
- Analytics (reporting only, can be optional)

**Medium Risk Moves (Verify dependencies first):**
- Project management skills (some coordinator integration)
- Specialized skills (need detailed dependency analysis)
- Error handling skills (verify cfn-intervention-* dependencies)

**High Risk Items:**
- None identified in recommended core skills

---

## Dependency Analysis

**Critical Path (No Breaks):**
- cfn-agent-spawning ← cfn-process-lifecycle ← agent-lifecycle
- cfn-loop-orchestration ← cfn-loop-validation ← cfn-loop2-output-processing, cfn-loop3-output-processing
- All tie to cfn-product-owner-decision (final decision gate)
- State persists through cfn-sqlite-memory
- File safety through cfn-hook-pipeline + pre-edit-backup

**Optional Dependencies:**
- cfn-intervention-detector/orchestrator (depends on cfn-process-instrumentation)
- cfn-playbook-auto-update (depends on cfn-retrospective-report)
- cfn-specialist-injection (depends on cfn-agent-spawning; safe to move together)

---

## Success Criteria

- [ ] Core skills documented with full dependency graph
- [ ] Migration scripts created and tested
- [ ] cfn-extras repository structure defined and deployed
- [ ] All skills moved with updated imports
- [ ] No regression in core CFN Loop execution
- [ ] Optional skills fail gracefully when not available
- [ ] Documentation updated with new paths and import statements
- [ ] MIGRATION_GUIDE.md published
- [ ] All SKILL.md files created or skills archived before cutover

---

## File Size Impact

**Current state:**
- `.claude/skills/` size: ~15MB (87 directories)
- Estimate 60% reduction to ~6MB after migration

**After migration:**
- `.claude/skills/`: ~6MB (15 core skills only)
- `cfn-extras/`: ~9MB (72 optional skills)
- Reduced complexity and faster skill discovery

---

## Backward Compatibility Considerations

1. **Shim Skills (Optional):** Create lightweight shim files in `.claude/skills/` that redirect to cfn-extras for temporary backward compatibility
2. **Documentation:** Create migration guide for users
3. **Import Paths:** Update all agent prompts and coordinator imports
4. **Version Markers:** Tag cfn-extras release corresponding to core migration

---

## Next Steps

1. Review this analysis with team
2. Verify core skill list (especially cfn-loop2 and cfn-loop3 output processing)
3. Create detailed dependency graph using code analysis
4. Begin documentation of orphaned skills
5. Plan Phase 1 implementation sprint
