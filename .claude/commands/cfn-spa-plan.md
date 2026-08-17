---
description: "Lighter SPARC-only sub-pipeline. Auto-chains cfn-spec + cfn-pseudo + cfn-arch into one SPA artifact bundle. cfn-megaplan is the canonical entry point and supersedes this. Use directly only when you want no tiering and no extra phases."
argument-hint: "<task description>"
allowed-tools: ["Task", "Read", "Write", "Bash", "Skill", "AskUserQuestion"]
---

# CFN SPA Plan

Run SPARC Specification + Pseudocode + Architecture phases as a chained orchestration. Produces artifact bundle in `planning/` that `/write-plan` consumes.

**`/cfn-megaplan` is the canonical planning entry point and supersedes this command.** Megaplan runs the full tiered DAG (research, spec, decide, pseudo, data, arch, ux, design, test-plan, ops) and wraps `/write-plan` + `/cfn-plan-review` behind the verifiable-done + haiku-executable bars. Use `/cfn-spa-plan` directly ONLY when you explicitly want the spec+pseudo+arch trio with no tiering and no extra phases.

**Task:** $ARGUMENTS

## What this does

1. Reads `.claude/skills/cfn-spa-plan/SKILL.md` and follows its protocol
2. Spawns `specification-agent` (SPEC artifact)
3. Spawns `pseudocode` + `system-architect` in parallel (PSEUDO + ARCH artifacts)
4. Writes `planning/<slug>/SPA_SUMMARY_<slug>.md` (all four artifacts land in the plan's own directory)
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
/cfn-megaplan       <- CANONICAL entry point (tiered DAG; supersedes this)
   |  (composes spec+pseudo+arch among its phases; runs write-plan + plan-review internally)
   |
   |  (or, for the lighter no-tiering path only:)
   |
/cfn-spa-plan       <- lighter sub-pipeline (spec + pseudo + arch only)
   ↓
/write-plan         <- consumes SPEC + PSEUDO + ARCH
   ↓
/cfn-plan-review    <- blast radius + dependency trace
   ↓
/cfn-loop-task      <- execution (default; /cfn-loop-cli only for external-API)
```

## Skip rules

Do not run for: single-line fixes, pure renames, bug fixes with existing reproducing test. For non-trivial builds, prefer `/cfn-megaplan` over this command.

## Related

- Canonical pipeline (supersedes this): `/cfn-megaplan`
- Phases: `/cfn-spec`, `/cfn-pseudo`, `/cfn-arch`
- Skill source: `.claude/skills/cfn-spa-plan/SKILL.md`
- Next: `/write-plan`, `/cfn-plan-review`, `/cfn-loop-task` (`/cfn-loop-cli` only for external-API)
