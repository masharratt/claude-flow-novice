---
description: "SPARC Pseudocode phase. Trace logic, enumerate branches, find failure paths, verify branch coverage BEFORE writing real code. Use after cfn-spec to catch logic gaps before implementation."
argument-hint: "<task description>"
allowed-tools: ["Task", "Read", "Write", "Bash", "Skill", "AskUserQuestion"]
---

# CFN Pseudo (SPARC Phase 2)

Standalone Pseudocode phase. Produces `planning/<slug>/PSEUDO_<slug>.md` with operation map, language-neutral pseudocode, branch coverage map (no `[UNMAPPED]`), complexity annotations, failure path traces.

**Requires:** the plan's spec (`planning/<slug>/SPEC_<slug>.md`, or legacy flat `planning/SPEC_<slug>.md`). Refuses to run if missing.

**Task:** $ARGUMENTS

## Pre-flight

```bash
SLUG=$(echo "$ARGUMENTS" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
PP=.claude/skills/cfn-megaplan/lib/plan-paths.sh
PDIR=$("$PP" ensure "$SLUG")                       # planning/<slug>, created if absent
# resolve = per-plan dir first, legacy flat planning/ second
SPEC=$("$PP" resolve "$SLUG" "SPEC_${SLUG}.md") || {
  echo "HALT: $SPEC not found. Run /cfn-spec \"$ARGUMENTS\" first."
  exit 1
}
```

## Execute

Invoke the pseudo skill and follow `.claude/skills/cfn-pseudo/SKILL.md` protocol exactly.

```
Skill: cfn-pseudo
Args:  $ARGUMENTS
```

Spawn the `pseudocode` agent (defined in `.claude/agents/cfn-dev-team/sparc/pseudocode.md`) with `$SPEC` as input. Pass it `Plan dir: $PDIR` and write to `$PDIR/PSEUDO_${SLUG}.md`.

## Mandatory output checks

- Branch coverage map has zero `[UNMAPPED]` entries
- Every external I/O has explicit failure-path handling
- Complexity annotations include Big-O (avg + worst), I/O count, idempotency, reentrancy
- If any operation is O(n^2)+ or makes >3 I/O calls, flag for review

## Next steps

- `/cfn-arch "$ARGUMENTS"` for component design
- Canonical full pipeline: `/cfn-megaplan "$ARGUMENTS"` (runs pseudo at DAG level 3, parallel with `/cfn-decide`)
- Lighter trio: `/cfn-spa-plan` re-orchestrates spec + pseudo + arch if used standalone
- Then: `/write-plan` → `/cfn-plan-review` → `/cfn-loop-task` (`/cfn-loop-cli` only for external-API)
