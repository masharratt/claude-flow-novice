---
name: cfn-spa-plan
description: "SPARC orchestrator. Auto-chains Specification, Pseudocode, and Architecture phases (cfn-spec + cfn-pseudo + cfn-arch) to produce a complete SPA artifact bundle BEFORE /write-plan or plan mode. Use as the entry point for non-trivial work to lock intent and catch edge cases early."
version: 1.0.0
tags: [planning, sparc, orchestrator, spec, pseudo, arch]
status: production
---

# CFN SPA Plan Orchestrator

**Purpose:** Single entry point that runs Specification -> Pseudocode -> Architecture in sequence (with parallel where dependencies allow) and produces a synthesized SPA bundle ready for `/write-plan`.

**Why this exists:** Plans drift from intent and miss edge cases because there is no forced step between "task description" and "implementation roadmap" that demands testable acceptance criteria, branch coverage, and component contracts. SPA fills that gap.

## When to Use

**Required for:**
- Any task touching 3+ files
- Any change to shared state (DB, API contracts, shared types)
- Any new feature (not a bug fix)
- Any security or auth change
- Any change crossing project boundaries

**Optional for:** Single-file edits, rename refactors, obvious bug fixes with reproducing test.

**Workflow position:**
```
/cfn-spa-plan        <- you are here (intent + design)
   |
   v
/write-plan          <- implementation roadmap + agent dispatch
   |
   v
/cfn-plan-review     <- blast radius + dependency trace
   |
   v
/cfn-loop-cli        <- execution
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
(Then: /cfn-plan-review, then /cfn-loop-cli)
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

- Running `/write-plan` without `/cfn-spa-plan` for multi-file work
- Skipping the DRY audit in ARCH phase
- Accepting fewer than 5 edge cases in SPEC
- Treating SPA artifacts as documentation instead of design contracts
- Editing SPA artifacts during implementation without re-running review

## Configuration

| Option | Default | Effect |
|--------|---------|--------|
| Mode (inferred from spec) | standard | Affects downstream `/write-plan --mode` |
| Parallel pseudo+arch | true | Set false to run strictly sequential |
| Edge case minimum | 5 | Lower at your own risk |

## Related

- Phases: `cfn-spec`, `cfn-pseudo`, `cfn-arch`
- Downstream: `/write-plan`, `/cfn-plan-review`, `/cfn-loop-cli`
- Replanning: `/cfn-goap-plan` (replan mode, post 3-strike)
- Decision log: `~/.claude/skills/decision-log/` (referenced by cfn-plan-review)
