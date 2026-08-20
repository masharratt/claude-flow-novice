---
description: "SPARC Architecture phase. Define component boundaries, interface contracts, integration points, DRY reuse BEFORE implementation. Use after cfn-spec and cfn-pseudo to lock structure, catch integration mismatches early."
argument-hint: "<task description>"
allowed-tools: ["Task", "Read", "Write", "Bash", "Skill", "AskUserQuestion"]
---

# CFN Arch (SPARC Phase 3)

Standalone Architecture phase. Produces `planning/<slug>/ARCH_<slug>.md` with DRY audit (REUSE/EXTEND/NEW), component decomposition, typed interface contracts at every boundary, integration/storage/cross-cutting decisions, failure-mode inventory.

**Requires:** the plan's spec (`planning/<slug>/SPEC_<slug>.md`, or legacy flat). **Recommended:** `planning/<slug>/PSEUDO_<slug>.md` (used for operation enumeration if present).

**Task:** $ARGUMENTS

## Pre-flight

```bash
SLUG=$(echo "$ARGUMENTS" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
PP=$HOME/.claude/skills/cfn-megaplan/lib/plan-paths.sh
PDIR=$("$PP" ensure "$SLUG")                          # planning/<slug>, created if absent
# resolve = per-plan dir first, legacy flat planning/ second
SPEC=$("$PP" resolve "$SLUG" "SPEC_${SLUG}.md") || {
  echo "HALT: $SPEC not found. Run /cfn-spec \"$ARGUMENTS\" first."
  exit 1
}
PSEUDO=$("$PP" resolve "$SLUG" "PSEUDO_${SLUG}.md") \
  || echo "WARN: $PSEUDO not found. Proceeding with SPEC only; consider running /cfn-pseudo first for operation traces."
```

## Execute

Invoke the arch skill and follow `$HOME/.claude/skills/cfn-arch/SKILL.md` protocol exactly.

```
Skill: cfn-arch
Args:  $ARGUMENTS
```

Spawn the `system-architect` agent (`.claude/agents/cfn-dev-team/architecture/system-architect.md`) with `$SPEC` (and `$PSEUDO` if present) as inputs. Pass it `Plan dir: $PDIR` and write to `$PDIR/ARCH_${SLUG}.md`.

## Mandatory output checks

- DRY audit ran `/codebase-search` for every operation BEFORE designing new components
- Every cross-component call has a named, typed contract (no anonymous shapes)
- Every external integration has retry/timeout/circuit-breaker policy
- Every new DB table has RLS policy (global CLAUDE.md requirement)
- Failure-mode inventory covers all components

## Next steps

- Canonical full pipeline: `/cfn-megaplan "$ARGUMENTS"` (runs arch at DAG level 4; hands storage→`/cfn-data`, ops→`/cfn-ops`, route-map→`/cfn-ux`)
- `/write-plan "$ARGUMENTS"` (auto-consumes the design bundle)
- Then: `/cfn-plan-review` → `/cfn-loop-task` (`/cfn-loop-cli` only for external-API)
