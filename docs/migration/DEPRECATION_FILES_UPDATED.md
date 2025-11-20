# Complete List of Files Updated with Deprecation Notices

**Date:** 2025-11-20
**Total Files:** 48

## 1. Agent Spawning Scripts (7 files)

- `.claude/skills/cfn-agent-spawning/spawn-worker.sh`
- `.claude/skills/cfn-agent-spawning/spawn-templates.sh`
- `.claude/skills/cfn-agent-spawning/spawn-agent-wrapper.sh`
- `.claude/skills/cfn-agent-spawning/parse-agent-provider.sh`
- `.claude/skills/cfn-agent-spawning/get-agent-provider-env.sh`
- `.claude/skills/cfn-agent-spawning/check-dependencies.sh`

## 2. Agent Selection Scripts (3 files)

- `.claude/skills/cfn-agent-selection-with-fallback/select-agents.sh`
- `.claude/skills/cfn-agent-selection-with-fallback/task-classifier.sh`
- `.claude/skills/cfn-agent-selection-with-fallback/select-agents-ts.sh`

## 3. File Lifecycle Hooks (5 files)

- `.claude/hooks/cfn-invoke-pre-edit.sh`
- `.claude/hooks/cfn-invoke-post-edit.sh`
- `.claude/hooks/cfn-invoke-pre-edit-ts.sh`
- `.claude/hooks/cfn-invoke-post-edit-ts.sh`
- `.claude/skills/pre-edit-backup/backup.sh`

## 4. Coordination Scripts (3 files)

- `.claude/skills/cfn-coordination/coordination-signal.sh`
- `.claude/skills/cfn-coordination/coordination-wait.sh`
- `.claude/skills/cfn-coordination/agent-completion.sh`

## 5. Redis Coordination Scripts (17 files)

- `.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh`
- `.claude/skills/cfn-redis-coordination/report-completion.sh`
- `.claude/skills/cfn-redis-coordination/collect-confidence-scores.sh`
- `.claude/skills/cfn-redis-coordination/collect-results.sh`
- `.claude/skills/cfn-redis-coordination/store-context.sh`
- `.claude/skills/cfn-redis-coordination/get-context.sh`
- `.claude/skills/cfn-redis-coordination/get-success-criteria.sh`
- `.claude/skills/cfn-redis-coordination/agent-log.sh`
- `.claude/skills/cfn-redis-coordination/agent-recovery.sh`
- `.claude/skills/cfn-redis-coordination/analyze-task-complexity.sh`
- `.claude/skills/cfn-redis-coordination/cancel-swarm.sh`
- `.claude/skills/cfn-redis-coordination/complete-swarm.sh`
- `.claude/skills/cfn-redis-coordination/cfn-loop-exec.sh`
- `.claude/skills/cfn-redis-coordination/cfn-loop-relaunch.sh`
- `.claude/skills/cfn-redis-coordination/redis-cli-wrapper.sh`
- `.claude/skills/cfn-redis-coordination/redis-functions.sh`
- `.claude/skills/cfn-redis-coordination/bash-wrappers/store-context.sh`

## 6. Validation Scripts (6 files)

- `.claude/skills/cfn-loop-validation/validate-gate.sh`
- `.claude/skills/cfn-loop-validation/detect-vapor.sh`
- `.claude/skills/cfn-loop-validation/validate-deliverables.sh`
- `.claude/skills/cfn-loop-validation/validate-iteration.sh`
- `.claude/skills/cfn-loop-validation/orchestrate-cfn-loop.sh`
- `.claude/skills/cfn-loop-validation/check-dependencies.sh`

## 7. SKILL.md Documentation (5 files)

- `.claude/skills/cfn-agent-spawning/SKILL.md`
- `.claude/skills/cfn-agent-selection-with-fallback/SKILL.md`
- `.claude/skills/pre-edit-backup/SKILL.md`
- `.claude/skills/cfn-loop-validation/SKILL.md`
- `.claude/hooks/SKILL.md`

## 8. New Documentation (1 file)

- `docs/BASH_DEPRECATION_NOTICE.md` (comprehensive migration guide)

## Summary Statistics

- **Bash Scripts Updated:** 40
- **Documentation Updated:** 5 SKILL.md files
- **New Documentation:** 1 comprehensive guide
- **Total Files Modified:** 48

## Verification Commands

```bash
# Count deprecation headers
grep -r "⚠️  DEPRECATED" .claude/skills/*/*.sh .claude/hooks/*.sh | wc -l

# Verify all scripts have headers
for f in $(find .claude/skills .claude/hooks -name '*.sh' -not -name '*.backup'); do
  if ! grep -q 'DEPRECATED' "$f"; then
    echo "MISSING: $f"
  fi
done

# Check SKILL.md deprecation sections
grep -l "Bash Deprecation Notice" .claude/skills/*/SKILL.md .claude/hooks/SKILL.md
```

## Migration Timeline

| Date | Milestone |
|------|-----------|
| 2025-11-20 | ✅ Deprecation notices added |
| 2025-12-20 | Monitor bash usage (30 days) |
| 2026-01-20 | Remove bash fallback code (60 days) |
| 2026-02-20 | Delete bash scripts (90 days) |

## Rollback Information

All original files backed up with `.backup` extension:
```bash
# Restore all bash scripts (if needed)
for f in $(find .claude -name '*.backup'); do
  mv "$f" "${f%.backup}"
done
```

## Next Steps

1. ✅ Verify deprecation headers: `grep -r DEPRECATED .claude/skills .claude/hooks | wc -l`
2. ✅ Test TypeScript implementations: `npm test`
3. ✅ Set USE_TYPESCRIPT=true in production environments
4. 📅 Monitor logs for bash usage over next 30 days
5. 📅 Remove bash fallback code after 60 days
6. 📅 Delete bash scripts after 90 days (2026-02-20)
