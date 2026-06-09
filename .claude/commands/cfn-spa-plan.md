---
description: "SPARC orchestrator. Auto-chains cfn-spec + cfn-pseudo + cfn-arch into one SPA artifact bundle BEFORE /write-plan or plan mode. Use as entry point for non-trivial work to lock intent, catch edge cases early."
argument-hint: "<task description>"
allowed-tools: ["Task", "Read", "Write", "Bash", "Skill", "AskUserQuestion"]
---

# CFN SPA Plan

Run SPARC Specification + Pseudocode + Architecture phases as a chained orchestration. Produces artifact bundle in `planning/` that `/write-plan` consumes.

Required before `/write-plan` for any non-trivial work (see global CLAUDE.md Plan Mode Protocol).

**Task:** $ARGUMENTS

## What this does

1. Reads `.claude/skills/cfn-spa-plan/SKILL.md` and follows its protocol
2. Spawns `specification-agent` (SPEC artifact)
3. Spawns `pseudocode` + `system-architect` in parallel (PSEUDO + ARCH artifacts)
4. Writes `planning/SPA_SUMMARY_<task>.md`
5. Surfaces open questions via `AskUserQuestion`
6. Hands off to `/write-plan`

## Execute

Invoke the orchestrator skill now:

```
Skill: cfn-spa-plan
Args:  $ARGUMENTS
```

Then follow Steps 0–5 of `.claude/skills/cfn-spa-plan/SKILL.md` exactly.

## Workflow position

```
/cfn-spa-plan       <- you are here
   ↓
/write-plan         <- consumes SPEC + PSEUDO + ARCH
   ↓
/cfn-plan-review    <- blast radius + dependency trace
   ↓
/cfn-loop-task      <- execution (default; /cfn-loop-cli only for external-API)
```

## Skip rules

Do not run for: single-line fixes, pure renames, bug fixes with existing reproducing test.

## Related

- Phases: `/cfn-spec`, `/cfn-pseudo`, `/cfn-arch`
- Skill source: `.claude/skills/cfn-spa-plan/SKILL.md`
- Next: `/write-plan`, `/cfn-plan-review`, `/cfn-loop-task` (`/cfn-loop-cli` only for external-API)
