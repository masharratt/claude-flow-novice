# Reference Update Map

Maps old skill paths to new locations for migration.

---

## Path Mapping Table

### Agent Lifecycle (6 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-agent-selector/` | `.claude/skills/agent-lifecycle/lib/selection/` |
| `.claude/skills/cfn-agent-selection-with-fallback/` | `.claude/skills/agent-lifecycle/lib/selection/` |
| `.claude/skills/cfn-agent-spawning/` | `.claude/skills/agent-lifecycle/lib/spawning/` |
| `.claude/skills/cfn-agent-output-processing/` | `.claude/skills/agent-lifecycle/lib/output/` |
| `.claude/skills/cfn-specialist-injection/` | `.claude/skills/agent-lifecycle/lib/injection/` |
| `.claude/skills/agent-lifecycle/` | `.claude/skills/agent-lifecycle/lib/audit/` |

### Task Planning (7 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-task-classifier/` | DELETED (duplicate) |
| `.claude/skills/task-classifier/` | `.claude/skills/task-planning/lib/classifier/` |
| `.claude/skills/cfn-complexity-estimator/` | `.claude/skills/task-planning/lib/complexity/` |
| `.claude/skills/cfn-scope-simplifier/` | `.claude/skills/task-planning/lib/scope/` |
| `.claude/skills/cfn-task-config-init/` | `.claude/skills/task-planning/lib/config/` |
| `.claude/skills/cfn-task-decomposition/` | `.claude/skills/task-planning/lib/decomposition/` |
| `.claude/skills/cfn-task-audit/` | `.claude/skills/task-planning/lib/audit/` |

### Error Management (4 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-error-logging/` | `.claude/skills/error-management/lib/logging/` |
| `.claude/skills/cfn-error-batching-strategy/` | `.claude/skills/error-management/lib/batching/` |
| `.claude/skills/cfn-standardized-error-handling/` | `.claude/skills/error-management/lib/capture/` |
| `.claude/skills/cfn-log-operations/` | `.claude/skills/error-management/lib/operations/` |

### Loop Orchestration (6 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-loop-orchestration/` | `.claude/skills/loop-orchestration/lib/orchestrator/` |
| `.claude/skills/cfn-loop-output-processing/` | `.claude/skills/loop-orchestration/lib/output/` |
| `.claude/skills/cfn-loop2-output-processing/` | DELETED (deprecated bash) |
| `.claude/skills/cfn-loop3-output-processing/` | DELETED (deprecated bash) |
| `.claude/skills/cfn-loop-validation/` | `.claude/skills/loop-orchestration/lib/validation/` |
| `.claude/skills/cfn-coordination/` | `.claude/skills/loop-orchestration/lib/coordination/` |

### Validation Framework (5 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-validation-templates/` | `.claude/skills/validation-framework/lib/templates/` |
| `.claude/skills/cfn-defense-in-depth/` | `.claude/skills/validation-framework/lib/layers/` |
| `.claude/skills/cfn-deliverable-validation/` | `.claude/skills/validation-framework/lib/deliverables/` |
| `.claude/skills/cfn-validation-runner-instrumentation/` | `.claude/skills/validation-framework/lib/instrumentation/` |
| `.claude/skills/json-validation/` | `.claude/skills/validation-framework/lib/json/` |

### Docker Runtime (7 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-docker-agent-spawning/` | `.claude/skills/docker-runtime/lib/spawning/` |
| `.claude/skills/cfn-docker-coordination/` | `.claude/skills/docker-runtime/lib/coordination/` |
| `.claude/skills/cfn-docker-logging/` | `.claude/skills/docker-runtime/lib/logging/` |
| `.claude/skills/cfn-docker-loop-orchestration/` | `.claude/skills/docker-runtime/lib/orchestration/` |
| `.claude/skills/cfn-docker-skill-mcp-selection/` | `.claude/skills/docker-runtime/lib/mcp/` |
| `.claude/skills/cfn-docker-wave-execution/` | `.claude/skills/docker-runtime/lib/waves/` |
| `.claude/skills/cfn-mcp-container-selector/` | `.claude/skills/docker-runtime/lib/mcp/` |

### Memory Persistence (6 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-sqlite-memory/` | `.claude/skills/memory-persistence/lib/sqlite/` |
| `.claude/skills/cfn-sqlite-cfn-loop/` | `.claude/skills/memory-persistence/lib/sqlite/` |
| `.claude/skills/cfn-redis-coordination/` | `.claude/skills/memory-persistence/lib/redis/` |
| `.claude/skills/redis-coordination/` | DELETED (duplicate) |
| `.claude/skills/cfn-automatic-memory-persistence/` | `.claude/skills/memory-persistence/lib/auto/` |
| `.claude/skills/cfn-memory-management/` | `.claude/skills/memory-persistence/lib/management/` |

### Sprint Execution (4 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-sprint-planner/` | `.claude/skills/sprint-execution/lib/planner/` |
| `.claude/skills/cfn-sprint-execution/` | `.claude/skills/sprint-execution/lib/executor/` |
| `.claude/skills/cfn-epic-decomposer/` | `.claude/skills/sprint-execution/lib/epic/` |
| `.claude/skills/cfn-multi-coordinator-planning/` | `.claude/skills/sprint-execution/lib/multi-coordinator/` |

### Skill Management (5 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-skill-builder/` | `.claude/skills/skill-management/lib/builder/` |
| `.claude/skills/cfn-skill-loader/` | `.claude/skills/skill-management/lib/loader/` |
| `.claude/skills/cfn-skill-propagation/` | `.claude/skills/skill-management/lib/propagation/` |
| `.claude/skills/cfn-promotion/` | `.claude/skills/skill-management/lib/promotion/` |
| `.claude/skills/cfn-deployment/` | `.claude/skills/skill-management/lib/deployment/` |

### Test Framework (3 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-test-runner/` | `.claude/skills/test-framework/lib/runner/` |
| `.claude/skills/cfn-test-execution/` | `.claude/skills/test-framework/lib/execution/` |
| `.claude/skills/cfn-webapp-testing/` | `.claude/skills/test-framework/lib/webapp/` |

### Intervention System (4 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-hook-pipeline/` | `.claude/skills/intervention-system/lib/hooks/` |
| `.claude/skills/hook-pipeline/` | DELETED (duplicate) |
| `.claude/skills/cfn-intervention-detector/` | `.claude/skills/intervention-system/lib/detection/` |
| `.claude/skills/cfn-intervention-orchestrator/` | `.claude/skills/intervention-system/lib/orchestration/` |

### Routing Config (3 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-provider-routing/` | `.claude/skills/routing-config/lib/provider/` |
| `.claude/skills/cfn-hybrid-routing/` | `.claude/skills/routing-config/lib/hybrid/` |
| `.claude/skills/cfn-config-management/` | `.claude/skills/routing-config/lib/config/` |

### Playbook Merge (2 → 1)

| Old Path | New Path |
|----------|----------|
| `.claude/skills/cfn-playbook/` | `.claude/skills/cfn-playbook/` (enhanced) |
| `.claude/skills/cfn-playbook-auto-update/` | `.claude/skills/cfn-playbook/lib/auto-update/` |

### Deletions (No New Path)

| Old Path | Reason |
|----------|--------|
| `.claude/skills/bootstrap/` | No SKILL.md, orphan |
| `.claude/skills/integration/` | No SKILL.md, orphan |
| `.claude/skills/hook-pipeline/` | Duplicate of cfn-hook-pipeline |
| `.claude/skills/redis-coordination/` | Duplicate of cfn-redis-coordination |
| `.claude/skills/seo-validation/` | Subsumed by cfn-seo |
| `.claude/skills/cfn-loop-validation.sh` | Orphan file |
| `.claude/skills/cfn-task-classifier/` | Duplicate of task-classifier |
| `.claude/skills/cfn-loop2-output-processing/` | Deprecated bash version |
| `.claude/skills/cfn-loop3-output-processing/` | Deprecated bash version |

---

## Files Requiring Updates

### Critical (Update First)

1. **CLAUDE.md** - 14 references
   ```
   cfn-dependency-ingestion → cfn-dependency-ingestion (no change)
   cfn-coordination → loop-orchestration/lib/coordination
   cfn-loop-orchestration → loop-orchestration/lib/orchestrator
   cfn-backlog-management → cfn-backlog-management (no change)
   cfn-changelog-management → cfn-changelog-management (no change)
   cfn-agent-spawning → agent-lifecycle/lib/spawning
   cfn-loop-validation → loop-orchestration/lib/validation
   ```

2. **Agent Profiles** - 44 files in `.claude/agents/`
   - Use ripgrep to find and update

3. **Slash Commands** - 11 files in `.claude/commands/`
   - Manual review recommended

### High Priority

4. **Source Code** - `src/cli/*.ts`
   - TypeScript imports

5. **GitHub Workflows** - `.github/workflows/*.yml`
   - CI/CD paths

### Medium Priority

6. **Test Scripts** - `tests/**/*.sh`
   - Path assertions

7. **Integration Tests** - `tests/integration/*.sh`
   - Skill existence checks

### Low Priority

8. **Documentation** - `docs/**/*.md`, `readme/**/*.md`, `planning/**/*.md`
   - Can update gradually

---

## Sed Commands for Bulk Updates

### Agent Lifecycle

```bash
# cfn-agent-selector → agent-lifecycle/lib/selection
find . -type f \( -name "*.md" -o -name "*.ts" -o -name "*.sh" \) -exec \
  sed -i 's|\.claude/skills/cfn-agent-selector|.claude/skills/agent-lifecycle/lib/selection|g' {} \;

# cfn-agent-selection-with-fallback → agent-lifecycle/lib/selection
find . -type f \( -name "*.md" -o -name "*.ts" -o -name "*.sh" \) -exec \
  sed -i 's|\.claude/skills/cfn-agent-selection-with-fallback|.claude/skills/agent-lifecycle/lib/selection|g' {} \;

# cfn-agent-spawning → agent-lifecycle/lib/spawning
find . -type f \( -name "*.md" -o -name "*.ts" -o -name "*.sh" \) -exec \
  sed -i 's|\.claude/skills/cfn-agent-spawning|.claude/skills/agent-lifecycle/lib/spawning|g' {} \;

# cfn-agent-output-processing → agent-lifecycle/lib/output
find . -type f \( -name "*.md" -o -name "*.ts" -o -name "*.sh" \) -exec \
  sed -i 's|\.claude/skills/cfn-agent-output-processing|.claude/skills/agent-lifecycle/lib/output|g' {} \;
```

### Error Management

```bash
# cfn-error-logging → error-management/lib/logging
find . -type f \( -name "*.md" -o -name "*.ts" -o -name "*.sh" \) -exec \
  sed -i 's|\.claude/skills/cfn-error-logging|.claude/skills/error-management/lib/logging|g' {} \;

# cfn-error-batching-strategy → error-management/lib/batching
find . -type f \( -name "*.md" -o -name "*.ts" -o -name "*.sh" \) -exec \
  sed -i 's|\.claude/skills/cfn-error-batching-strategy|.claude/skills/error-management/lib/batching|g' {} \;

# cfn-standardized-error-handling → error-management/lib/capture
find . -type f \( -name "*.md" -o -name "*.ts" -o -name "*.sh" \) -exec \
  sed -i 's|\.claude/skills/cfn-standardized-error-handling|.claude/skills/error-management/lib/capture|g' {} \;

# cfn-log-operations → error-management/lib/operations
find . -type f \( -name "*.md" -o -name "*.ts" -o -name "*.sh" \) -exec \
  sed -i 's|\.claude/skills/cfn-log-operations|.claude/skills/error-management/lib/operations|g' {} \;
```

### Loop Orchestration

```bash
# cfn-loop-orchestration → loop-orchestration/lib/orchestrator
find . -type f \( -name "*.md" -o -name "*.ts" -o -name "*.sh" \) -exec \
  sed -i 's|\.claude/skills/cfn-loop-orchestration|.claude/skills/loop-orchestration/lib/orchestrator|g' {} \;

# cfn-loop-validation → loop-orchestration/lib/validation
find . -type f \( -name "*.md" -o -name "*.ts" -o -name "*.sh" \) -exec \
  sed -i 's|\.claude/skills/cfn-loop-validation|.claude/skills/loop-orchestration/lib/validation|g' {} \;

# cfn-coordination → loop-orchestration/lib/coordination
find . -type f \( -name "*.md" -o -name "*.ts" -o -name "*.sh" \) -exec \
  sed -i 's|\.claude/skills/cfn-coordination|.claude/skills/loop-orchestration/lib/coordination|g' {} \;
```

---

## Symlink Strategy for Backwards Compatibility

Create symlinks during transition period:

```bash
#!/bin/bash
# create-compatibility-symlinks.sh

cd .claude/skills

# Agent Lifecycle
ln -sf agent-lifecycle/lib/selection cfn-agent-selector
ln -sf agent-lifecycle/lib/selection cfn-agent-selection-with-fallback
ln -sf agent-lifecycle/lib/spawning cfn-agent-spawning
ln -sf agent-lifecycle/lib/output cfn-agent-output-processing

# Error Management
ln -sf error-management/lib/logging cfn-error-logging
ln -sf error-management/lib/batching cfn-error-batching-strategy
ln -sf error-management/lib/capture cfn-standardized-error-handling
ln -sf error-management/lib/operations cfn-log-operations

# Loop Orchestration
ln -sf loop-orchestration/lib/orchestrator cfn-loop-orchestration
ln -sf loop-orchestration/lib/validation cfn-loop-validation
ln -sf loop-orchestration/lib/coordination cfn-coordination

# ... continue for all mappings
```

Remove symlinks after all references updated:

```bash
#!/bin/bash
# remove-compatibility-symlinks.sh

cd .claude/skills

# Find and remove all symlinks
find . -maxdepth 1 -type l -delete
```

---

## Verification Commands

### Check for Broken References

```bash
# Find references to deleted skills
rg -l 'cfn-loop2-output-processing|cfn-loop3-output-processing|cfn-task-classifier' \
  --type md --type ts --type sh

# Should return 0 results after migration
```

### Verify Skill Discovery

```bash
# List all discoverable skills (those with SKILL.md)
find .claude/skills -maxdepth 2 -name "SKILL.md" | wc -l
# Should be 38 after consolidation
```

### Run Test Suite

```bash
# Full validation
npm test
./tests/cli-mode/run-all-tests.sh
node scripts/validate-all-skills.ts
```
