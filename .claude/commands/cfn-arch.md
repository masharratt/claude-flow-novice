---
description: "SPARC Architecture phase. Define component boundaries, interface contracts, integration points, DRY reuse BEFORE implementation. Use after cfn-spec and cfn-pseudo to lock structure, catch integration mismatches early."
argument-hint: "<task description>"
allowed-tools: ["Task", "Read", "Write", "Bash", "Skill", "AskUserQuestion"]
---

# CFN Arch (SPARC Phase 3)

Standalone Architecture phase. Produces `planning/ARCH_<task>.md` with DRY audit (REUSE/EXTEND/NEW), component decomposition, typed interface contracts at every boundary, integration/storage/cross-cutting decisions, failure-mode inventory.

**Requires:** `planning/SPEC_<task>.md`. **Recommended:** `planning/PSEUDO_<task>.md` (used for operation enumeration if present).

**Task:** $ARGUMENTS

## Pre-flight

```bash
SLUG=$(echo "$ARGUMENTS" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
SPEC="planning/SPEC_${SLUG}.md"
PSEUDO="planning/PSEUDO_${SLUG}.md"
if [ ! -f "$SPEC" ]; then
  echo "HALT: $SPEC not found. Run /cfn-spec \"$ARGUMENTS\" first."
  exit 1
fi
[ -f "$PSEUDO" ] || echo "WARN: $PSEUDO not found. Proceeding with SPEC only; consider running /cfn-pseudo first for operation traces."
```

## Execute

Invoke the arch skill and follow `.claude/skills/cfn-arch/SKILL.md` protocol exactly.

```
Skill: cfn-arch
Args:  $ARGUMENTS
```

Spawn the `system-architect` agent (`.claude/agents/cfn-dev-team/architecture/system-architect.md`) with SPEC (and PSEUDO if present) as inputs. Write to `planning/ARCH_<sanitized-task>.md`.

## Mandatory output checks

- DRY audit ran `/codebase-search` for every operation BEFORE designing new components
- Every cross-component call has a named, typed contract (no anonymous shapes)
- Every external integration has retry/timeout/circuit-breaker policy
- Every new DB table has RLS policy (global CLAUDE.md requirement)
- Failure-mode inventory covers all components

## Next steps

- `/write-plan "$ARGUMENTS"` (auto-consumes SPA bundle)
- Then: `/cfn-plan-review` → `/cfn-loop-task` (`/cfn-loop-cli` only for external-API)
