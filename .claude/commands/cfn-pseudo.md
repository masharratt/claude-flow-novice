---
description: "SPARC Pseudocode phase. Trace logic, enumerate branches, find failure paths, verify branch coverage BEFORE writing real code. Use after cfn-spec to catch logic gaps before implementation."
argument-hint: "<task description>"
allowed-tools: ["Task", "Read", "Write", "Bash", "Skill", "AskUserQuestion"]
---

# CFN Pseudo (SPARC Phase 2)

Standalone Pseudocode phase. Produces `planning/PSEUDO_<task>.md` with operation map, language-neutral pseudocode, branch coverage map (no `[UNMAPPED]`), complexity annotations, failure path traces.

**Requires:** `planning/SPEC_<task>.md` from `/cfn-spec`. Refuses to run if missing.

**Task:** $ARGUMENTS

## Pre-flight

```bash
SLUG=$(echo "$ARGUMENTS" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
SPEC="planning/SPEC_${SLUG}.md"
if [ ! -f "$SPEC" ]; then
  echo "HALT: $SPEC not found. Run /cfn-spec \"$ARGUMENTS\" first."
  exit 1
fi
```

## Execute

Invoke the pseudo skill and follow `.claude/skills/cfn-pseudo/SKILL.md` protocol exactly.

```
Skill: cfn-pseudo
Args:  $ARGUMENTS
```

Spawn the `pseudocode` agent (defined in `.claude/agents/cfn-dev-team/sparc/pseudocode.md`) with SPEC as input. Write to `planning/PSEUDO_<sanitized-task>.md`.

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
