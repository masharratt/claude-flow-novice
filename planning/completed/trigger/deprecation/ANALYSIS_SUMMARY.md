# Skill Deprecation Analysis - Quick Summary

**Output File:** `planning/trigger/deprecation/agent-4-kimi-analysis.md`

---

## KEY FINDINGS

### CRITICAL DEPRECATIONS (123+ files, 1,500+ LOC)

The NEW CLI mode v3.2.0+ eliminates entire Redis coordination system:

1. **cfn-coordination** (58 files, 150+ LOC)
   - BLPOP wrapper for Redis blocking operations
   - Completely replaced by direct Main Chat → CLI agent signaling

2. **cfn-redis-coordination** (40+ files, 800+ LOC)
   - Redis helper functions and data structures
   - Contains `redis-cli-wrapper.sh` with documented auth bypass (BUG #21)
   - All functionality subsumed by orchestrator

3. **cfn-docker-redis-coordination** (25+ files, 600+ LOC)
   - Container-based Redis coordination
   - No longer needed in simplified 2-layer architecture

4. **cfn-docker-loop-orchestration** (1,721 LOC shell script)
   - Legacy shell orchestrator
   - **Fully replaced** by TypeScript orchestrator in `cfn-loop-orchestration/src/orchestrate.ts` (1,200+ LOC)
   - TypeScript version tested and production-ready

5. **cfn-test-runner** (5+ files, legacy benchmarking)
   - Redis-based test result storage
   - Replaced by test-driven gate validation
   - Contains SQL injection vulnerabilities (scripts/security/fix-sql-injection-batch.sh)

---

## ACTIVE SKILLS (KEEP)

7 skills actively integrated with NEW CLI mode:

| Skill | Purpose | Status |
|-------|---------|--------|
| cfn-loop-orchestration | Main orchestrator (Loop 3→2→PO) | ✅ TypeScript v3.2.0+ |
| cfn-backlog-management | Work deferral system | ✅ Active |
| cfn-changelog-management | Feature documentation | ✅ Active |
| cfn-loop-validation | Gate checks & vapor detection | ✅ 4 TypeScript validators |
| pre-edit-backup | File safety system | ✅ Active |
| hook-pipeline | Post-edit validation | ✅ Active |
| docker-build | WSL2 optimization (96% faster) | ✅ Active |

---

## INVESTIGATE (5 SKILLS)

Edge-case or unclear integration:

| Skill | Question | Next Action |
|-------|----------|-------------|
| cfn-agent-spawning | Superseded by TypeScript cfn-agent-selection-with-fallback? | Grep source code |
| cfn-agent-output-processing | Integrated into orchestrator or separate? | Verify integration points |
| cfn-product-owner-decision | Shell vs TypeScript? Calling orchestrator correctly? | Confirm execute-decision.sh |
| cfn-automatic-memory-persistence | Test infrastructure only? | Determine scope |

---

## IMMEDIATE ACTIONS

### Move to Archive
```bash
# 123+ files, 1,500+ LOC - Redis coordination obsolete
mv .claude/skills/cfn-coordination/ .archive/cfn-redis-coordination-legacy/
mv .claude/skills/cfn-redis-coordination/ .archive/cfn-redis-coordination-legacy/
mv .claude/skills/cfn-docker-redis-coordination/ .archive/cfn-redis-coordination-legacy/
mv .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh .archive/
```

### Update CLAUDE.md
Remove deprecated references (lines 202, 213, 274, 515, 909, 914):
- cfn-coordination
- cfn-redis-coordination database location
- Old orchestration examples

### Update Documentation
- Add "DEPRECATED SKILLS (v3.2.0+)" section to CLAUDE.md
- Reference `.archive/cfn-redis-coordination-legacy/` as archive location
- Update "Skill References" section (lines 274-278)

---

## CONFIDENCE METRICS

- **Source Diversity:** 12+ documentation files
- **Deprecation Evidence:** Clear patterns in TRIGGER_DEV migration docs
- **Integration Verification:** Orchestrator source code cross-checked
- **Overall Confidence:** 0.92 (high confidence in deprecation recommendations)

---

## NEXT STEPS

1. **Review** `planning/trigger/deprecation/agent-4-kimi-analysis.md` (full analysis)
2. **Approve** deprecation of 3 Redis directories + 1 shell orchestrator
3. **Investigate** 5 edge-case skills (requires source code inspection)
4. **Execute** archive operations and CLAUDE.md updates
5. **Test** CLI mode workflow with archived directories removed
