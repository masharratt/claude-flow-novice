---
name: cfn-research
description: "Pre-spec feasibility plus prior-art plus knowledge-base query. Resolves unknowns before planning so the spec is grounded in evidence, not assumption. Runs first (DAG level 1), only when the build has unknowns. Stops the pipeline from re-solving a solved problem or planning on a guess."
version: 1.0.0
tags: [planning, research, feasibility, prior-art, knowledge-base, megaplan]
status: production
---

# CFN Research Skill (MegaPlan Phase L1)

**Purpose:** When a task carries unknowns, find out "is this even possible / has it already been solved" BEFORE the spec is written. Output feeds `cfn-spec` as known facts and documented risks, so the spec stops assuming.

**Phase:** Research / Feasibility (MegaPlan DAG level 1, runs before spec). Covers gaps G06 (prior-art / KB query) and G09 (feasibility spike).

**Why this exists:** The pipeline assumes the problem is understood. Two systemic failures it prevents:
- **Re-solving a solved problem** because nobody queried the knowledge base or decision log first.
- **Planning on assumption** instead of evidence, so the spec bakes in a guess that breaks at implementation.

This is a research phase, not a design phase. It produces evidence, not decisions and not the spec.

## When to Use

- Only when the `unknowns` build flag is set: the task involves a stack/API/permission you have not confirmed works, a "can we even" question, or an approach with no in-repo precedent.
- Invoked by `cfn-megaplan` at L1 when the spec-entry scan or a prior `[OPEN]` item flags unknowns.

Skip entirely for well-understood tasks. If the capability is obvious, the stack is known, and prior art is irrelevant, the orchestrator drops this node and starts at spec. Do not manufacture unknowns to justify the phase.

## Input

- The raw task description.
- The codebase (for in-repo capability search).
- Orchestrator passes: `Tier` and `Directive` (`full` for enterprise, `light` for beta).

## Directive scaling

| Directive | Tier | Scope |
|---|---|---|
| `light` | beta | Phase 1 (prior-art / KB query) + Phase 2 (feasibility spike) on the specific named unknown(s) only. No comparative analysis. |
| `full` | enterprise | All four phases: prior-art, feasibility spike, comparative analysis, resolved/open output. |

mvp tier does not run this phase (research is `skip` at mvp; the inclusion matrix gates it to beta+).

## Protocol

### Phase 1: Prior-art / KB query (gap G06) — always

Before any feasibility work, check whether this is already solved.

1. **Knowledge base.** Query for a prior playbook or workflow for this task type:
   ```bash
   ~/.claude/skills/cfn-knowledge-base/execute.sh query "<task type / entities>"
   ```
2. **Decision log.** Query for prior decisions, tradeoffs, and recorded failed assumptions on these entities:
   ```bash
   ~/.claude/skills/decision-log/query.sh "<entities>" 5 <project>
   ```
3. **In-repo capability.** Search the codebase for an existing implementation:
   ```bash
   /codebase-search "<capability keywords>" --top 5
   ```

If any of these surfaces an existing solution or playbook, surface it loudly. The verdict may be "already solved, reuse X" — that is the highest-value outcome of this phase. Do not let the pipeline rebuild what exists.

Record each query and its result (hit / no hit) so the spec author can see what was checked.

### Phase 2: Feasibility spike (gap G09) — always

For each named unknown, answer "can this be done with the stack, APIs, and permissions available?" with evidence, not opinion.

Acceptable evidence (in priority order):
- A probe: a small command, query, or API call that actually exercises the capability.
- Authoritative docs: the API reference / SDK doc that confirms the operation exists and its limits.
- An in-repo precedent: existing code that already does the thing.

Probe rules: read-only operations only (GET/SELECT/list/dry-run); never write to a shared DB; never call a paid endpoint beyond a single minimal request; timebox 5 minutes per unknown, then fall back to authoritative docs; docs must be fetched and quoted with URL, never recalled from memory.

Evidence bar:

```
BAD:  "the SDK likely supports this"
GOOD: probe `curl -s .../models | jq` returned `video_url` field
GOOD: doc URL X section Y, quoted line
```

For each unknown assign one verdict:

| Verdict | Meaning |
|---|---|
| FEASIBLE | Confirmed by evidence. Spec can assume it as known. |
| FEASIBLE-WITH-RISK | Possible, but with a limit, cost, or caveat the spec must carry as a documented risk. |
| BLOCKED | No path found with the available stack/permissions. Names what would unblock it. |

No verdict without cited evidence. "Probably works" is not a verdict.

### Phase 3: Comparative analysis (enterprise `full` only)

If a feasible unknown has more than one viable technical approach, compare them briefly: each approach, the evidence it is feasible, and its main tradeoff in one line.

This is a lightweight FEED into `cfn-decide`'s alternatives panel, not the decision. Do not score, do not pick a winner, do not duplicate the decision register. Hand the comparison off and let `cfn-decide` own the choice. Keep it to a table.

### Phase 4: Output — resolved unknowns plus open risks — always

Split the result into two lists the spec can act on:
- **Resolved (spec may assume):** every unknown now FEASIBLE, with the evidence.
- **Open risk (spec must document):** every FEASIBLE-WITH-RISK caveat and every BLOCKED item, marked `[OPEN]` so the orchestrator surfaces it before spec locks.

## Output

Write to: `planning/RESEARCH_<slug>.md` (slug supplied by the orchestrator, built with the canonical rule in `cfn-megaplan` Step 1). Downstream phases reuse the same slug (`SPEC_<slug>.md`, `DECISIONS_<slug>.md`, `PSEUDO_<slug>.md`); never regenerate it differently.

Template:
```markdown
# Research / Feasibility: <task>

**Date:** <YYYY-MM-DD>
**Phase:** research (cfn-research, MegaPlan L1)
**Tier:** <beta|enterprise>   **Directive:** <light|full>
**Verdict:** FEASIBLE | FEASIBLE-WITH-RISK | BLOCKED

## 1. Prior-art / KB query
| Source | Query | Result |
|---|---|---|
| knowledge-base | "<q>" | hit: <playbook> / no hit |
| decision-log | "<q>" | hit: <prior decision> / no hit |
| codebase-search | "<q>" | hit: <path:line> / no hit |

Reuse opportunity: <existing solution to reuse, or "none found">

## 2. Feasibility spike
| Unknown | Verdict | Evidence | Note |
|---|---|---|---|
| <unknown-1> | FEASIBLE | <probe / doc / path:line> | — |
| <unknown-2> | FEASIBLE-WITH-RISK | <evidence> | <limit/cost/caveat> |
| <unknown-3> | BLOCKED | <what was tried> | unblock by: <what is needed> |

## 3. Comparative analysis  (enterprise only; omit otherwise)
| Approach | Feasible? | Main tradeoff |
|---|---|---|
| A | yes | <one line> |
| B | yes | <one line> |
Handoff: cfn-decide alternatives panel.

## 4. Resolved vs open
### Resolved (spec may assume)
- <fact the spec can treat as known>

### Open risk (spec must document)
- [OPEN] <risk / caveat / blocker, with what would resolve it>
```

## Example: feasibility verdict table

Task: "Ingest a Loom recording and extract a UI spec via a video-understanding model."

| Unknown | Verdict | Evidence | Note |
|---|---|---|---|
| Model accepts a video URL | FEASIBLE | z.ai GLM-5V doc: `video_url` field | public URL only, <=200MB |
| Audio transcribed by same call | BLOCKED | doc lists no audio param | unblock by: separate transcript source (Loom captions) |
| Per-frame timestamps available | FEASIBLE-WITH-RISK | probe returned frames | timestamps approximate, +/- 1s |

Verdict: FEASIBLE-WITH-RISK. Spec assumes URL ingest; carries `[OPEN]` for separate transcript source and approximate timestamps.

## Return (to orchestrator)

```
artifact: planning/RESEARCH_<slug>.md
summary: <3 lines max>
verdict: FEASIBLE | FEASIBLE-WITH-RISK | BLOCKED
[OPEN]: <list of open risks / blockers for the orchestrator to surface before spec locks>
```

If verdict is BLOCKED, the orchestrator surfaces it via `AskUserQuestion` before spawning spec. Do not let a blocked unknown pass silently into the spec.

## Handoff

This artifact is the input to `cfn-spec`. The spec author reads the Resolved list as known facts and the Open-risk list as constraints to encode. Research output is NOT the spec. It does not contain requirements, acceptance criteria, or edge cases. It contains evidence the spec is built on.

## Anti-Patterns

- **Planning on assumption instead of evidence.** A verdict with no cited probe / doc / path is a guess wearing a verdict's clothes. Cite or do not assert.
- **Re-solving a solved problem** because nobody queried the KB or decision log. Phase 1 is mandatory and runs first for exactly this reason.
- **Treating research output as the spec.** This file feeds the spec; it is not requirements. Writing FRs / ACs / edge cases here is scope leak into `cfn-spec`.
- **Picking the winner in comparative analysis.** That is `cfn-decide`'s job. Compare and hand off; do not score or choose.
- **Manufacturing unknowns** to justify running the phase on a well-understood task. If there is no real unknown, the orchestrator skips this node.
- **Passing a BLOCKED unknown silently into the spec** instead of surfacing it to the user.

## Related

- Prior-art sources: `cfn-knowledge-base`, `decision-log`
- Downstream: `cfn-spec` (consumes Resolved facts + Open risks)
- Comparative-analysis handoff: `cfn-decide` (owns the alternatives panel and decision register)
- Orchestrator: `cfn-megaplan` (gates this phase on the `unknowns` build flag, L1)
- Backlog rationale: `docs/PLANNING_PIPELINE_GAPS.md` (gaps G06, G09)
