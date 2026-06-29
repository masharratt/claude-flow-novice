---
name: cfn-spa-plan
description: "Lighter SPARC-only sub-pipeline. Auto-chains cfn-spec + cfn-pseudo + cfn-arch into one SPA artifact bundle. cfn-megaplan is the canonical planning entry point and supersedes this. Use cfn-spa-plan directly only when you want no tiering and no extra phases."
version: 1.0.0
tags: [planning, sparc, orchestrator, spec, pseudo, arch]
status: production
---

# CFN SPA Plan (lighter SPARC-only sub-pipeline)

**Purpose:** Runs Specification -> Pseudocode -> Architecture in sequence (with parallel where dependencies allow) and produces a synthesized SPA bundle ready for `/write-plan`.

**Canonical entry point is `/cfn-megaplan`, not this.** `cfn-megaplan` runs the full tiered DAG (research, spec, decide, pseudo, data, arch, ux, design, test-plan, ops) and wraps `/write-plan` + `/cfn-plan-review`, gated by verifiable-done + haiku-executable bars. `cfn-spa-plan` is the lighter sub-pipeline that megaplan supersedes: spec + pseudo + arch only, no tiering, no conditional phases.

**Why this exists:** Plans drift from intent and miss edge cases because there is no forced step between "task description" and "implementation roadmap" that demands testable acceptance criteria, branch coverage, and component contracts. SPA fills that gap when you do not need the full megaplan DAG.

## When to Use

Use `cfn-spa-plan` directly ONLY when you explicitly want the spec+pseudo+arch trio with no tiering and no extra phases (no research, decide, data, ux, design, test-plan, ops). For any non-trivial build (multi-file, shared state, new feature, security/auth, cross-project), prefer `/cfn-megaplan` so the conditional phases and the two completion bars apply.

**Skip entirely for:** Single-file edits, rename refactors, obvious bug fixes with reproducing test.

**Workflow position:**
```
/cfn-megaplan        <- CANONICAL entry point (tiered DAG; supersedes this)
   |  (megaplan composes spec+pseudo+arch among its phases and runs write-plan + plan-review internally)
   |
   |  (or, for the lighter no-tiering path only:)
   |
/cfn-spa-plan        <- lighter sub-pipeline (spec + pseudo + arch only)
   |
   v
/write-plan          <- implementation roadmap + agent dispatch
   |
   v
/cfn-plan-review     <- blast radius + dependency trace
   |
   v
/cfn-loop-task       <- execution (default; /cfn-loop-cli only for external-API)
```

## Protocol

### Step 0: Scope Check

Before launching agents, confirm scope:
1. Run `/codebase-search "<task keywords>"` to check for existing capability.
2. If existing capability covers task entirely, abort: no SPA needed, just point to existing code.
3. If task spans 8+ files per initial estimate, stop. Negotiate scope with user via `AskUserQuestion` before continuing.

### Step 1: Spawn Specification Agent

Single agent. Output is required input for Step 2.

```
Agent(
  subagent_type: "specification-agent",
  description: "SPARC Spec phase",
  prompt: "Follow .claude/skills/cfn-spec/SKILL.md protocol exactly.
           Task: <user task>
           Write artifact to: planning/SPEC_<sanitized>.md
           Use Read on the skill file first.
           Mandatory: enumerate >=5 edge cases.
           Return: artifact path + summary of any [OPEN] questions."
)
```

Wait for completion. If artifact has unresolved `[OPEN]` questions, surface to user via `AskUserQuestion` before continuing.

### Step 2: Spawn Pseudocode + Architecture in Parallel

Both consume SPEC. Arch additionally references PSEUDO for operations, but the operation list can be derived independently from SPEC, so they may run in parallel and reconcile.

**Send both spawns in a single message:**

```
Agent(
  subagent_type: "pseudocode",  // resurrect from backups if missing
  description: "SPARC Pseudo phase",
  prompt: "Follow .claude/skills/cfn-pseudo/SKILL.md protocol.
           Read input: planning/SPEC_<sanitized>.md
           Write artifact: planning/PSEUDO_<sanitized>.md
           Mandatory: branch coverage map, no [UNMAPPED] entries.
           Return: artifact path + unmapped branch count."
)

Agent(
  subagent_type: "system-architect",
  description: "SPARC Arch phase",
  prompt: "Follow .claude/skills/cfn-arch/SKILL.md protocol.
           Read inputs: planning/SPEC_<sanitized>.md and (if exists) planning/PSEUDO_<sanitized>.md
           Write artifact: planning/ARCH_<sanitized>.md
           Mandatory: DRY audit via /codebase-search BEFORE designing new components.
           Mandatory: typed contracts at every component boundary.
           Return: artifact path + DRY audit summary (reuse/extend/new counts)."
)
```

### Step 3: Reconciliation

After both complete:
1. If PSEUDO surfaced gaps that invalidate SPEC, loop back to Step 1 with the gap as input.
2. If ARCH DRY audit found existing capability covering >50% of operations, surface to user: scope may collapse to "wire up existing code" instead of building new.
3. If branch coverage map has unmapped branches, do NOT proceed. Loop back to spec.

### Step 4: Synthesis Summary

Write `planning/SPA_SUMMARY_<sanitized>.md`:

```markdown
# SPA Bundle: <task>

**Generated:** <date>

## Artifacts
- Spec:  planning/SPEC_<sanitized>.md
- Pseudo: planning/PSEUDO_<sanitized>.md
- Arch:  planning/ARCH_<sanitized>.md

## Counts
- Functional requirements: N
- Edge cases enumerated: N
- Operations defined: N
- Components: N (REUSE: x, EXTEND: y, NEW: z)
- Interface contracts: N
- External integrations: N

## Open Items
- [ ] <any unresolved question requiring user decision>

## Next Step
Run: /write-plan "<task>" --mode=<inferred-mode>
(Then: /cfn-plan-review, then /cfn-loop-task)
```

### Step 5: Hand-off to /write-plan

Tell user the bundle is ready. `/write-plan` should be invoked with the SPA artifacts as context (it reads them automatically when present in `planning/`).

## Failure Modes & Recovery

| Failure | Recovery |
|---------|----------|
| `specification-agent` not found | Resurrect from `.claude/backups/namespace-restructure-*/sparc/specification.md` to `.claude/agents/cfn-dev-team/sparc/` |
| `pseudocode` agent not found | Same: resurrect from backup |
| `system-architect` exists at `.claude/agents/cfn-dev-team/architecture/system-architect.md` | Use directly |
| Open questions in SPEC | Surface to user with `AskUserQuestion` before continuing |
| Unmapped branches in PSEUDO | Loop back to Step 1 with gap as input |
| DRY audit shows scope unnecessary | Stop. Inform user. Do not generate further artifacts. |

## Anti-Patterns

- Reaching for `/cfn-spa-plan` when the build is non-trivial: prefer `/cfn-megaplan` (it adds research, decide, data, ux, design, test-plan, ops, plus the two completion bars)
- Running `/write-plan` with no design pipeline (spa-plan or megaplan) for multi-file work
- Skipping the DRY audit in ARCH phase
- Accepting fewer than 5 edge cases in SPEC
- Treating SPA artifacts as documentation instead of design contracts
- Editing SPA artifacts during implementation without re-running review

## Configuration

| Option | Default | Effect |
|--------|---------|--------|
| Mode (inferred from spec) | beta | Affects downstream `/write-plan --mode` (mvp/beta/enterprise) |
| Parallel pseudo+arch | true | Set false to run strictly sequential |
| Edge case minimum | 5 | Lower at your own risk |

## Related

- Canonical pipeline (supersedes this): `cfn-megaplan` (tiered DAG + verifiable-done + haiku-executable bars)
- Phases: `cfn-spec`, `cfn-pseudo`, `cfn-arch`
- Downstream: `/write-plan`, `/cfn-plan-review`, `/cfn-loop-task` (`/cfn-loop-cli` only for external-API)
- Replanning: `/cfn-goap-plan` (optional bookend; replan mode, post 3-strike)
- Decision log: `~/.claude/skills/decision-log/` (referenced by cfn-plan-review)
