# Skills Folder Consolidation Plan

**Status:** Planning
**Target:** 93 → 38 skills (59% reduction)
**Estimated Effort:** 4-5 weeks
**Last Updated:** 2025-12-02

---

## Executive Summary

The `.claude/skills/` folder has grown to 93 skill folders with significant duplication, overlap, and inconsistent organization. This plan consolidates related skills into 12 "mega-skills" with internal subfolders, while keeping 26 standalone skills with distinct purposes.

### Key Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Total Skills | 93 | 38 | -59% |
| Skills with SKILL.md | 72 | 38 | 100% coverage |
| Duplicate Skills | ~15 | 0 | Eliminated |
| Files Needing Updates | ~1,200 | - | Migration required |

---

## Constraints

**Claude Code Skill Discovery Limitation:**
- Skills are discovered at `.claude/skills/{name}/SKILL.md` only
- Nested categories like `.claude/skills/docker/agent-spawning/` are NOT discovered
- Internal subfolders within skills ARE supported (e.g., `skill-name/lib/module/`)

**Strategy:** Use naming prefixes for visual grouping + internal subfolders for code organization.

---

## Phase 1: Quick Wins (Day 1)

### 1.1 Delete Orphan/Deprecated Folders

These folders have no SKILL.md or are duplicates:

| Folder | Reason | Action |
|--------|--------|--------|
| `bootstrap/` | No SKILL.md, partial docs only | DELETE or merge to cfn-utilities |
| `integration/` | No SKILL.md, partial scripts | DELETE or merge to relevant skill |
| `hook-pipeline/` | Duplicate of cfn-hook-pipeline | DELETE |
| `redis-coordination/` | Duplicate of cfn-redis-coordination | DELETE |
| `seo-validation/` | Subsumed by cfn-seo | DELETE |
| `cfn-loop-validation.sh` | File not folder (orphan) | DELETE |

**Commands:**
```bash
# Backup first
tar -czf planning/skill-consolidation/backups/orphans-backup.tar.gz \
  .claude/skills/bootstrap \
  .claude/skills/integration \
  .claude/skills/hook-pipeline \
  .claude/skills/redis-coordination \
  .claude/skills/seo-validation

# Delete
rm -rf .claude/skills/bootstrap
rm -rf .claude/skills/integration
rm -rf .claude/skills/hook-pipeline
rm -rf .claude/skills/redis-coordination
rm -rf .claude/skills/seo-validation
rm -f .claude/skills/cfn-loop-validation.sh
```

**Impact:** -6 items, zero risk

---

## Phase 2: Remove Deprecated Bash Versions (Day 1-2)

### 2.1 Loop Output Processing

TypeScript version (`cfn-loop-output-processing`) already consolidates Loop 2 and Loop 3 parsing. Remove deprecated bash versions.

| Skill | Status | Action |
|-------|--------|--------|
| `cfn-loop-output-processing/` | TypeScript, production | KEEP |
| `cfn-loop2-output-processing/` | Bash, deprecated | DELETE |
| `cfn-loop3-output-processing/` | Bash, deprecated | DELETE |

**Commands:**
```bash
# Backup
tar -czf planning/skill-consolidation/backups/loop-output-backup.tar.gz \
  .claude/skills/cfn-loop2-output-processing \
  .claude/skills/cfn-loop3-output-processing

# Delete
rm -rf .claude/skills/cfn-loop2-output-processing
rm -rf .claude/skills/cfn-loop3-output-processing
```

**Impact:** -2 items, low risk (TypeScript version already in production)

---

## Phase 3: Low-Risk Merges (Week 1)

### 3.1 Playbook Consolidation

Merge query and update into single skill.

| Old Skills | New Skill |
|------------|-----------|
| `cfn-playbook/` | `cfn-playbook/` (enhanced) |
| `cfn-playbook-auto-update/` | → merged into above |

**Structure:**
```
cfn-playbook/
├── SKILL.md              # Updated docs
├── lib/
│   ├── query.sh          # From cfn-playbook
│   └── auto-update.sh    # From cfn-playbook-auto-update
└── playbook.db
```

### 3.2 Task Classifier Deduplication

Two nearly identical skills exist.

| Old Skills | New Skill |
|------------|-----------|
| `cfn-task-classifier/` | DELETE (duplicate) |
| `task-classifier/` | KEEP (more granular) |

**Impact:** -2 items

---

## Phase 4: Medium Complexity Merges (Week 2)

### 4.1 Agent Lifecycle Mega-Skill

Consolidate 6 agent management skills into one.

| Old Skills | New Location |
|------------|--------------|
| `cfn-agent-selector/` | `agent-lifecycle/lib/selection/` |
| `cfn-agent-selection-with-fallback/` | `agent-lifecycle/lib/selection/` |
| `cfn-agent-spawning/` | `agent-lifecycle/lib/spawning/` |
| `cfn-agent-output-processing/` | `agent-lifecycle/lib/output/` |
| `cfn-specialist-injection/` | `agent-lifecycle/lib/injection/` |
| `agent-lifecycle/` | `agent-lifecycle/lib/audit/` |

**New Structure:**
```
agent-lifecycle/
├── SKILL.md
├── lib/
│   ├── selection/
│   │   ├── index.ts
│   │   ├── fallback.ts
│   │   └── mappings.json
│   ├── spawning/
│   │   ├── spawn-agent.sh
│   │   └── token-manager.ts
│   ├── output/
│   │   └── parser.ts
│   ├── injection/
│   │   └── specialist-injector.sh
│   └── audit/
│       └── lifecycle-tracker.ts
├── types/
├── cli/
│   ├── select-agent.sh
│   ├── spawn-agent.sh
│   └── audit.sh
└── docs/
    └── MIGRATION.md
```

**Impact:** 6 → 1 = -5 skills

### 4.2 Task Planning Mega-Skill

Consolidate 7 task-related skills.

| Old Skills | New Location |
|------------|--------------|
| `cfn-task-classifier/` | DELETE (duplicate) |
| `task-classifier/` | `task-planning/lib/classifier/` |
| `cfn-complexity-estimator/` | `task-planning/lib/complexity/` |
| `cfn-scope-simplifier/` | `task-planning/lib/scope/` |
| `cfn-task-config-init/` | `task-planning/lib/config/` |
| `cfn-task-decomposition/` | `task-planning/lib/decomposition/` |
| `cfn-task-audit/` | `task-planning/lib/audit/` |

**Impact:** 7 → 1 = -6 skills

### 4.3 Error Management Mega-Skill

Consolidate 4 error handling skills.

| Old Skills | New Location |
|------------|--------------|
| `cfn-error-logging/` | `error-management/lib/logging/` |
| `cfn-error-batching-strategy/` | `error-management/lib/batching/` |
| `cfn-standardized-error-handling/` | `error-management/lib/handling/` |
| `cfn-log-operations/` | `error-management/lib/operations/` |

**Impact:** 4 → 1 = -3 skills

---

## Phase 5: High Complexity Merges (Week 3-4)

### 5.1 Loop Orchestration Mega-Skill

| Old Skills | New Location |
|------------|--------------|
| `cfn-loop-orchestration/` | `loop-orchestration/lib/orchestrator/` |
| `cfn-loop-output-processing/` | `loop-orchestration/lib/output/` |
| `cfn-loop-validation/` | `loop-orchestration/lib/validation/` |
| `cfn-coordination/` | `loop-orchestration/lib/coordination/` |

**Impact:** 4 → 1 = -3 skills (after Phase 2 deletions)

### 5.2 Validation Framework Mega-Skill

| Old Skills | New Location |
|------------|--------------|
| `cfn-validation-templates/` | `validation-framework/lib/templates/` |
| `cfn-defense-in-depth/` | `validation-framework/lib/layers/` |
| `cfn-deliverable-validation/` | `validation-framework/lib/deliverables/` |
| `cfn-validation-runner-instrumentation/` | `validation-framework/lib/instrumentation/` |
| `json-validation/` | `validation-framework/lib/json/` |

**Impact:** 5 → 1 = -4 skills

### 5.3 Docker Runtime Mega-Skill

| Old Skills | New Location |
|------------|--------------|
| `cfn-docker-agent-spawning/` | `docker-runtime/lib/spawning/` |
| `cfn-docker-coordination/` | `docker-runtime/lib/coordination/` |
| `cfn-docker-logging/` | `docker-runtime/lib/logging/` |
| `cfn-docker-loop-orchestration/` | `docker-runtime/lib/orchestration/` |
| `cfn-docker-skill-mcp-selection/` | `docker-runtime/lib/mcp/` |
| `cfn-docker-wave-execution/` | `docker-runtime/lib/waves/` |
| `cfn-mcp-container-selector/` | `docker-runtime/lib/mcp/` |

**Impact:** 7 → 1 = -6 skills

### 5.4 Memory Persistence Mega-Skill

| Old Skills | New Location |
|------------|--------------|
| `cfn-sqlite-memory/` | `memory-persistence/lib/sqlite/` |
| `cfn-sqlite-cfn-loop/` | `memory-persistence/lib/sqlite/` |
| `cfn-redis-coordination/` | `memory-persistence/lib/redis/` |
| `cfn-automatic-memory-persistence/` | `memory-persistence/lib/auto/` |
| `cfn-memory-management/` | `memory-persistence/lib/management/` |

**Impact:** 5 → 1 = -4 skills

---

## Phase 6: Final Consolidations (Week 4-5)

### 6.1 Remaining Mega-Skills

| Mega-Skill | Absorbs | Reduction |
|------------|---------|-----------|
| `sprint-execution` | cfn-sprint-planner, cfn-sprint-execution, cfn-epic-decomposer, cfn-multi-coordinator-planning | -3 |
| `skill-management` | cfn-skill-builder, cfn-skill-loader, cfn-skill-propagation, cfn-deployment, cfn-promotion | -4 |
| `test-framework` | cfn-test-runner, cfn-test-execution, cfn-webapp-testing | -2 |
| `intervention-system` | cfn-hook-pipeline, cfn-intervention-detector, cfn-intervention-orchestrator | -2 |
| `routing-config` | cfn-provider-routing, cfn-hybrid-routing, cfn-config-management | -2 |

### 6.2 Reference Updates

Update all file references across the codebase.

**Priority Order:**
1. CLAUDE.md (14 references)
2. Agent profiles (44 files)
3. Slash commands (11 files)
4. Source code (30+ files)
5. Test scripts (100+ files)
6. Documentation (200+ files)

---

## Final Skill List (38 Skills)

### 12 Mega-Skills (Consolidated)

1. `agent-lifecycle/`
2. `task-planning/`
3. `error-management/`
4. `loop-orchestration/`
5. `validation-framework/`
6. `docker-runtime/`
7. `memory-persistence/`
8. `sprint-execution/`
9. `skill-management/`
10. `test-framework/`
11. `intervention-system/`
12. `routing-config/`

### 26 Standalone Skills (Keep As-Is)

1. `docker-build/` - WSL2 build optimization
2. `pre-edit-backup/` - File safety before edits
3. `cfn-utilities/` - Bash utility library
4. `cfn-file-operations/` - Atomic file writes
5. `cfn-process-lifecycle/` - Process management
6. `cfn-parameterized-queries/` - SQL injection prevention
7. `cfn-dependency-extractor/` - Dependency graphs
8. `cfn-dependency-ingestion/` - Context loading (20,000x speedup)
9. `cfn-backlog-management/` - Work tracking
10. `cfn-changelog-management/` - Release notes
11. `cfn-playbook/` - Pattern storage (merged)
12. `cfn-product-owner-decision/` - Decision parsing
13. `cfn-wave-checkpoint/` - Crash recovery
14. `cfn-transparency-middleware/` - Audit logging
15. `cfn-node-heap-sizer/` - Memory sizing
16. `cfn-environment-sanitization/` - Env cleanup
17. `cfn-vision-analysis/` - Image analysis
18. `agent-template-generator/` - Agent creation
19. `agent-validation-linter/` - Agent compliance
20. `workflow-codification/` - Skill ROI tracking
21. `firecrawl-integration/` - Web scraping
22. `ruvector-codebase-index/` - Semantic search
23. `conversation-sync/` - Session preservation
24. `mdap-context-injection/` - MDAP context
25. `cfn-seo/` - SEO toolkit
26. `cfn-expert-update/` - Expert agent updates

---

## Migration Strategy

### Backwards Compatibility via Symlinks

During transition, create symlinks for old paths:

```bash
# Example for agent-lifecycle migration
ln -s agent-lifecycle/lib/selection .claude/skills/cfn-agent-selector
ln -s agent-lifecycle/lib/selection .claude/skills/cfn-agent-selection-with-fallback
ln -s agent-lifecycle/lib/spawning .claude/skills/cfn-agent-spawning
```

### Bulk Path Updates

```bash
# Find and replace paths
rg -l 'cfn-agent-selector' | xargs sed -i 's|\.claude/skills/cfn-agent-selector|.claude/skills/agent-lifecycle/lib/selection|g'
```

### Verification

After each phase:
1. Run `npm test` - Unit tests
2. Run `./tests/cli-mode/run-all-tests.sh` - CLI integration
3. Run skill validation: `node scripts/validate-all-skills.ts`
4. Verify skill discovery: Check Skill tool available_skills list

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking changes | Medium | High | Symlinks during transition |
| Test failures | Medium | Medium | Run tests after each batch |
| Documentation drift | Low | Low | Update SKILL.md as source of truth |
| Agent failures | Low | High | Keep backups, test in staging |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Skill count | 38 | `ls -1 .claude/skills/ \| wc -l` |
| SKILL.md coverage | 100% | All skills have valid SKILL.md |
| Test pass rate | 100% | Full test suite passes |
| Discovery working | 38 skills | Skill tool shows all |
| Zero regressions | 0 | No new bugs introduced |

---

## Appendix: SKILL.md Template for Mega-Skills

```markdown
---
name: skill-name
description: "Brief description of consolidated skill"
version: 2.0.0
category: category-name
tags: [tag1, tag2, tag3]
---

# Skill Name

Brief overview of the consolidated skill.

## Modules

### 1. Module A (`lib/module-a/`)
Description of module A functionality.

**Usage:** `./cli/module-a.sh [options]`

### 2. Module B (`lib/module-b/`)
Description of module B functionality.

**Usage:** `./cli/module-b.sh [options]`

## Quick Reference

| Task | Command |
|------|---------|
| Do A | `./cli/module-a.sh` |
| Do B | `./cli/module-b.sh` |

## Migration from Legacy Skills

| Old Skill | New Location |
|-----------|--------------|
| old-skill-1 | lib/module-a/ |
| old-skill-2 | lib/module-b/ |

## Dependencies

- List dependencies here

## Testing

```bash
npm test -- --grep "skill-name"
```
```

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-02 | Initial plan created |
