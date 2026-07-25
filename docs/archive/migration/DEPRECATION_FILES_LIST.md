# Complete List of Files Updated with Deprecation Notices

**Date:** 2025-11-20
**Total Files Updated:** 48 (41 bash scripts + 5 SKILL.md + 1 spawn-agent.sh + 1 new)

---

## Bash Scripts Updated (41 files)

### Agent Spawning (6 scripts)
1. `.claude/skills/cfn-agent-spawning/spawn-worker.sh`
2. `.claude/skills/cfn-agent-spawning/spawn-templates.sh`
3. `.claude/skills/cfn-agent-spawning/spawn-agent-wrapper.sh`
4. `.claude/skills/cfn-agent-spawning/parse-agent-provider.sh`
5. `.claude/skills/cfn-agent-spawning/get-agent-provider-env.sh`
6. `.claude/skills/cfn-agent-spawning/check-dependencies.sh`

**Note:** `spawn-agent.sh` was updated separately (not shown in backup list).

### Agent Selection (3 scripts)
7. `.claude/skills/cfn-agent-selection-with-fallback/select-agents.sh`
8. `.claude/skills/cfn-agent-selection-with-fallback/task-classifier.sh`
9. `.claude/skills/cfn-agent-selection-with-fallback/select-agents-ts.sh`

### File Lifecycle Hooks (5 scripts)
10. `.claude/hooks/cfn-invoke-pre-edit.sh`
11. `.claude/hooks/cfn-invoke-post-edit.sh`
12. `.claude/hooks/cfn-invoke-pre-edit-ts.sh`
13. `.claude/hooks/cfn-invoke-post-edit-ts.sh`
14. `.claude/skills/pre-edit-backup/backup.sh`

### Coordination (3 scripts)
15. `.claude/skills/cfn-coordination/coordination-signal.sh`
16. `.claude/skills/cfn-coordination/coordination-wait.sh`
17. `.claude/skills/cfn-coordination/agent-completion.sh`

### Redis Coordination (17 scripts)
18. `.claude/skills/cfn-redis-coordination/invoke-waiting-mode.sh`
19. `.claude/skills/cfn-redis-coordination/report-completion.sh`
20. `.claude/skills/cfn-redis-coordination/collect-confidence-scores.sh`
21. `.claude/skills/cfn-redis-coordination/collect-results.sh`
22. `.claude/skills/cfn-redis-coordination/store-context.sh`
23. `.claude/skills/cfn-redis-coordination/get-context.sh`
24. `.claude/skills/cfn-redis-coordination/get-success-criteria.sh`
25. `.claude/skills/cfn-redis-coordination/agent-log.sh`
26. `.claude/skills/cfn-redis-coordination/agent-recovery.sh`
27. `.claude/skills/cfn-redis-coordination/analyze-task-complexity.sh`
28. `.claude/skills/cfn-redis-coordination/cancel-swarm.sh`
29. `.claude/skills/cfn-redis-coordination/complete-swarm.sh`
30. `.claude/skills/cfn-redis-coordination/cfn-loop-exec.sh`
31. `.claude/skills/cfn-redis-coordination/cfn-loop-relaunch.sh`
32. `.claude/skills/cfn-redis-coordination/redis-cli-wrapper.sh`
33. `.claude/skills/cfn-redis-coordination/redis-functions.sh`
34. `.claude/skills/cfn-redis-coordination/bash-wrappers/store-context.sh`

### Validation (6 scripts)
35. `.claude/skills/cfn-loop-validation/validate-gate.sh`
36. `.claude/skills/cfn-loop-validation/detect-vapor.sh`
37. `.claude/skills/cfn-loop-validation/validate-deliverables.sh`
38. `.claude/skills/cfn-loop-validation/validate-iteration.sh`
39. `.claude/skills/cfn-loop-validation/orchestrate-cfn-loop.sh`
40. `.claude/skills/cfn-loop-validation/check-dependencies.sh`

**Note:** `spawn-agent.sh` makes 41 total bash scripts updated.

---

## SKILL.md Documentation Updated (5 files)

41. `.claude/skills/cfn-agent-spawning/SKILL.md`
42. `.claude/skills/cfn-agent-selection-with-fallback/SKILL.md`
43. `.claude/skills/pre-edit-backup/SKILL.md`
44. `.claude/skills/cfn-loop-validation/SKILL.md`
45. `.claude/hooks/SKILL.md`

---

## New Documentation Created (4 files)

46. `docs/BASH_DEPRECATION_NOTICE.md` (12 KB)
    - Comprehensive migration guide
    - Complete script inventory
    - Migration commands for each category
    - Benefits comparison
    - FAQ and troubleshooting

47. `docs/DEPRECATION_FILES_UPDATED.md` (4.5 KB)
    - File-by-file inventory
    - Summary statistics
    - Verification commands

48. `docs/BASH_DEPRECATION_SUMMARY.md` (12 KB)
    - Executive summary
    - What was done
    - Verification procedures
    - Monitoring guidelines

49. `docs/DEPRECATION_IMPLEMENTATION_COMPLETE.md` (15 KB)
    - Final completion report
    - Scope clarification
    - Success criteria checklist
    - Future work planning

**Note:** `docs/BASH_DEPRECATION_TIMELINE.md` was already present.

---

## Backup Files Created (48 files)

All original files preserved with `.backup` extension:
- 40 bash scripts (`.sh.backup`)
- 5 SKILL.md files (`SKILL.md.backup`)
- 1 spawn-agent.sh (`.sh.backup`)
- 2 TypeScript transition scripts (`-ts.sh.backup`)

### Restoration Command
```bash
# Restore all original files (if needed)
for f in $(find .claude -name "*.backup"); do
  mv "$f" "${f%.backup}"
done
```

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **Bash Scripts Deprecated** | 41 |
| **SKILL.md Files Updated** | 5 |
| **New Documentation** | 4 |
| **Backup Files** | 48 |
| **Total Files Modified** | 50 |

---

## Verification Commands

### Count Deprecation Headers
```bash
# Should return 41 (all target scripts)
grep -r "⚠️  DEPRECATED" .claude/skills .claude/hooks | grep "\.sh:" | wc -l
```

### List All Deprecated Scripts
```bash
# View complete list
grep -r "⚠️  DEPRECATED" .claude/skills .claude/hooks | grep "\.sh:" | cut -d: -f1 | sort
```

### Verify SKILL.md Updates
```bash
# Should return 5 files
grep -l "Bash Deprecation Notice" .claude/skills/*/SKILL.md .claude/hooks/SKILL.md | wc -l
```

### Check Backup Files
```bash
# Should return 48 files
find .claude -name "*.backup" | wc -l
```

### View Sample Updates
```bash
# View bash script deprecation header
head -30 .claude/skills/cfn-agent-spawning/spawn-agent.sh

# View SKILL.md deprecation section
tail -60 .claude/skills/cfn-agent-spawning/SKILL.md

# View main migration guide
less docs/BASH_DEPRECATION_NOTICE.md
```

---

## TypeScript Replacements Reference

### Quick Reference Table

| Bash Script | TypeScript Replacement | Benefits |
|-------------|------------------------|----------|
| `spawn-agent.sh` | `dist/cli/spawn-agent-cli.js` | Type-safe spawning |
| `select-agents.sh` | `dist/cli.cjs` | 95.2% accuracy |
| `cfn-invoke-pre-edit.sh` | `dist/cli/pre-edit-hook.js` | 93%+ coverage |
| `coordination-signal.sh` | `dist/cli/coordination-signal.js` | <5ms performance |
| `validate-gate.sh` | `dist/cli/validate-gate.js` | Type-safe validation |

**See:** `docs/BASH_DEPRECATION_NOTICE.md` for complete reference.

---

## Migration Timeline

| Date | Action | Status |
|------|--------|--------|
| **2025-11-20** | Deprecation notices added | ✅ Complete |
| **2025-11-27** | Begin monitoring bash usage | 📅 Week 1 |
| **2025-12-20** | Review usage patterns | 📅 30 days |
| **2026-01-20** | Remove bash fallback code | 📅 60 days |
| **2026-02-20** | Delete bash scripts | 📅 90 days |

---

## Next Steps

1. ✅ Verify all deprecation headers: `grep -r DEPRECATED .claude | wc -l`
2. ✅ Test TypeScript implementations: `npm test`
3. 📅 Set `USE_TYPESCRIPT=true` in production environments
4. 📅 Monitor logs for bash script execution (Week 1-2)
5. 📅 Analyze usage patterns (Week 3-4)
6. 📅 Remove bash fallback code (Week 5-8)
7. 📅 Archive bash scripts (Week 9-12)
8. 📅 Final cleanup (Week 13)

---

## Rollback Instructions

### Emergency Rollback
```bash
# Disable TypeScript (keeps deprecation headers)
export USE_TYPESCRIPT=false

# OR restore original bash scripts (removes headers)
cd /mnt/c/Users/masha/Documents/claude-flow-novice
for f in $(find .claude -name "*.backup"); do
  mv "$f" "${f%.backup}"
done
```

### Verify Rollback
```bash
# After rollback, should return 0
grep -r "⚠️  DEPRECATED" .claude/skills .claude/hooks | grep "\.sh:" | wc -l
```

---

## Related Documentation

- **Main Guide:** `docs/BASH_DEPRECATION_NOTICE.md`
- **Summary:** `docs/BASH_DEPRECATION_SUMMARY.md`
- **Completion Report:** `docs/DEPRECATION_IMPLEMENTATION_COMPLETE.md`
- **Migration Guides:**
  - Agent Spawning: `.claude/skills/cfn-agent-spawning/TYPESCRIPT_MIGRATION.md`
  - Agent Selection: `.claude/skills/cfn-agent-selection-with-fallback/TYPESCRIPT_MIGRATION.md`
  - File Hooks: `src/hooks/README.md`
  - Coordination: `src/coordination/TYPESCRIPT_COORDINATION_WRAPPER.md`
  - Validation: `.claude/skills/cfn-loop-validation/SKILL_TYPESCRIPT.md`

---

**Last Updated:** 2025-11-20
**Deprecation Complete:** ✅
**Final Cleanup:** 2026-02-20 (90 days)
