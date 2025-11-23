# Skills Deprecation Summary - CLI Mode Migration

**Quick Reference for ZAI Agent Implementation**

---

## What Changed
- **OLD:** Main Chat → cfn-v3-coordinator → orchestrate.sh → workers
- **NEW:** Main Chat → CLI agents directly (via `/cfn-loop-cli`)
- **Impact:** 12 skills fully deprecated, 8 need investigation, 14 stay active

---

## Skills to DELETE Immediately

### Complete Removal (No Replacement Needed)
```
.claude/skills/cfn-docker-loop-orchestration/
.claude/skills/cfn-docker-wave-execution/
.claude/skills/cfn-wave-checkpoint/
```

### Keep But Remove Bash Implementations

| Skill | Remove | Keep |
|-------|--------|------|
| cfn-agent-spawning | `*.sh` scripts | `/src/spawn-agent.ts` |
| cfn-loop-validation | `*.sh` scripts | TypeScript validators |
| cfn-agent-selection-with-fallback | `*.sh` scripts | `/src/agent-selector.ts` |
| cfn-loop-output-processing | `*.sh` scripts (90-day) | TypeScript module |
| cfn-product-owner-decision | `parse-decision.sh` | TypeScript parser |
| pre-edit-backup | `backup.sh` | TypeScript impl |

---

## Skills to Keep (Core Functionality)

```
cfn-loop-orchestration       (TypeScript orchestrator)
cfn-provider-routing         (Z.ai default + fallback)
cfn-context-injection        (Broadcast context)
cfn-context-lookup           (Multi-iteration context)
cfn-validation-templates     (Test criteria)
cfn-task-classifier          (Task type detection)
cfn-complexity-estimator     (Iteration planning)
cfn-agent-selector           (Agent specialization)
cfn-playbook                 (Pattern library)
cfn-coordination             (Redis BLPOP signaling)
cfn-error-logging            (Error tracking)
cfn-loop-validation          (Test validation - TS)
cfn-loop-output-processing   (Output parsing - TS)
```

---

## Critical Don'ts for New Agents

**NEVER DO:**
- ❌ Spawn `cfn-v3-coordinator` manually
- ❌ Call `orchestrate.sh` directly
- ❌ Use bash wrappers (marked DEPRECATED as of 2025-11-20)
- ❌ Reference orchestrate.sh examples
- ❌ Use wave-based execution patterns

**ALWAYS DO:**
- ✅ Use `/cfn-loop-cli` slash command
- ✅ Use TypeScript implementations
- ✅ Trust context-injection for broadcast messages
- ✅ Use cfn-provider-routing for agent selection
- ✅ Rely on Redis BLPOP coordination

---

## Confidence Score: 0.92

- Source diversity: 95% (20+ skills, SKILL.md files)
- Consistency: 90% (unified deprecation pattern)
- Evidence strength: 90% (file:line references throughout)
- Novelty: 88% (12 clear deprecations identified)

---

## Files

- **Full Analysis:** `planning/trigger/deprecation/agent-2-zai-analysis.md` (34KB)
- **This Summary:** Quick reference guide
- **Evidence:** Direct grep results from `.claude/skills/` directory

---

## Timeline

- **Week 1:** Remove scripts, update docs
- **Week 2-3:** Investigate mixed-status skills
- **Feb 18, 2026:** Remove cfn-loop-output-processing bash (90-day timeline)

---

## Next Steps for ZAI Agent

1. Read full analysis for detailed evidence
2. Audit cfn-utilities, cfn-coordination, cfn-hybrid-routing
3. Remove deprecated bash scripts in Phase 2
4. Update all skill documentation to remove orchestrate.sh examples
5. Verify no agents reference cfn-v3-coordinator in NEW CLI mode

---

*Analysis Date: 2025-11-23*
*Scope: Skills in `.claude/skills/` directory tied to OLD coordinator architecture*
