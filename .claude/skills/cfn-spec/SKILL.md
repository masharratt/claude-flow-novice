---
name: cfn-spec
description: "SPARC Specification phase. Make testable acceptance criteria, edge cases, pre/post conditions, invariants BEFORE planning implementation. Use when starting any non-trivial task to lock intent, surface ambiguity early."
version: 1.0.0
tags: [planning, sparc, specification, requirements, edge-cases]
status: production
---

# CFN Spec Skill (SPARC Phase 1)

**Purpose:** Convert vague task descriptions into testable, unambiguous specifications. Force explicit enumeration of edge cases and acceptance criteria before any code or pseudocode exists.

**Phase:** Specification. DAG level 2 in the canonical `cfn-megaplan` pipeline (after `cfn-research`, in parallel with downstream `cfn-decide`/`cfn-pseudo`). Also SPARC step 1 of 3 in the lighter `cfn-spa-plan` sub-pipeline.

## When to Use

- Any task touching 2+ files, shared state, or external APIs
- Any task where the user's words leave room for interpretation
- Before `/write-plan`, `/cfn-loop-cli`, or plan mode for non-trivial work
- Auto-invoked by `/cfn-megaplan` (canonical entry point) and by the lighter `/cfn-spa-plan` sub-pipeline

Skip only for: single-line fixes, rename refactors with no logic change, obvious bug fixes with reproducing test.

## Protocol

### Step 0: Scope Challenge

Before writing the spec, answer:
- Minimum viable interpretation of this task?
- Does similar capability already exist in the codebase? (Run `/codebase-search` first.)
- If scope spans 8+ files, stop. Negotiate scope with user before continuing.

### Step 1: Functional Requirements

Numbered list. Each requirement = one observable behavior. No implementation hints.

Format:
```
FR-1: System SHALL <behavior> WHEN <trigger> GIVEN <preconditions>.
FR-2: ...
```

**Flag the core mechanism `[core]`.** Apply this checklist mechanically:

1. Mark at least one FR `[core]`: the mechanism that must fire end-to-end for the feature to exist at all (the worker that publishes, the save that persists, the render that shows the data, the scheduled job that runs). Zero `[core]` FRs = invalid spec.
2. Phrase every `[core]` FR so the observable outcome is a state change or output content. Never "function exists" / "endpoint defined".
3. Each `[core]` FR gets an assembled-path check in `cfn-test-plan`: one that drives the real wired path in the running system, not a direct inner-function call. You create the target; you do not write the test.
4. If the `[core]` mechanism fires out-of-band (spawned worker, cron, queue consumer, anything no caller directly awaits), the FR MUST also name the runtime signal it emits on success: a log line, a metric event, or an audit row. That signal becomes cfn-test-plan's runtime-observed check.

```
FR-2 [core]: System SHALL publish a scheduled story AND notify the family WHEN the scheduled time passes, GIVEN the publish worker is running.
FR-3 [core]: System SHALL archive expired stories WHEN the nightly cron runs, AND SHALL emit log line "archive.complete count=<n>". (runtime signal: archive.complete log)
```

### Step 2: Non-Functional Requirements

Performance, security, accessibility, observability. Each NFR must include a measurable threshold.

Format:
```
NFR-1: Response p95 latency < 200ms under 100 RPS load.
NFR-2: All endpoints require authenticated session; 401 on missing/invalid token.
```

### Step 3: Acceptance Criteria (Gherkin)

For every FR, write at least one Given/When/Then. These become test cases in `/write-plan`.

```
Scenario: <name>
  Given <precondition>
  When <action>
  Then <observable outcome>
  And <secondary outcome>
```

**Then-clause rubric (all three required for every Then):**

1. Concrete values, not adjectives: `status = 'published'`, not "updated correctly".
2. Asserts output content or a state/persistence change.
3. Executable without interpretation: a test author can turn it into an assertion with zero judgment calls.

```
BAD:  Then the story is published successfully
GOOD: Then stories.status = 'published' AND a notification row exists for each family member AND response is 200 with body {status:"published"}
```

### Step 4: Edge Case Enumeration (MANDATORY, per-category coverage)

The point of this skill. Walk ALL 10 categories below. For EACH category, emit one or more EC rows OR an explicit `N/A: <reason>` row. Blank or skipped category rows are rejected. Each EC row names the FR it stresses. Five ECs total remains the floor, but the per-category table is the gate: a spec with exactly 5 ECs and 10 filled category rows passes; a spec with 8 ECs and a skipped category does not.

| Category | Look for |
|---|---|
| Empty inputs | null, undefined, empty string, empty array, zero |
| Boundary values | min, max, off-by-one, integer overflow |
| Concurrency | race conditions, duplicate submissions, stale reads |
| Failure modes | network timeout, DB down, partial write, retry semantics |
| Auth/permission | unauthenticated, unauthorized, expired token, role mismatch |
| Data quality | malformed input, encoding issues, injection, oversized payload |
| State transitions | invalid state for operation, already-completed, deleted entity |
| Time | clock skew, timezone, DST, leap second, future/past dates |
| Locale/i18n | Unicode, RTL, surrogate pairs, normalization |
| Resource limits | rate limit hit, quota exceeded, disk full, OOM |

Output row format (one row per EC, plus one `N/A` row per category with no applicable EC):

```
| Category | EC | Stresses | Expected behavior |
| Empty inputs | EC-1: empty story body | FR-1 | 400 INVALID_BODY |
| Locale/i18n | N/A: API accepts numeric IDs only, no free text | - | - |
```

For each edge case, state the expected behavior with concrete values. "Returns 400 with error code INVALID_X" not "handles gracefully".

### Step 5: Pre/Post Conditions and Invariants

For each operation in scope:
```
Operation: <name>
  Preconditions: <what must be true to invoke>
  Postconditions (success): <what is true after success>
  Postconditions (failure): <what is true after failure, including rollback semantics>
  Invariants: <what NEVER changes regardless of outcome>
```

### Step 6: Out of Scope

Explicit list of things NOT covered by this spec. Forces the implementer to escalate scope creep instead of silently expanding.

### Step 7: Open Questions

If any spec section depends on a decision the user has not made, list it as an open question with options. Do not assume. Mark each unresolved question `[OPEN]`.

When the user accepts a question as deferred, rewrite its marker to `[PARKED: <accepted default>]`. Parked items do not block `cfn-pseudo`; the accepted default travels downstream as a stated assumption. Only `[OPEN]` markers block the pipeline.

### Step 8: Build Flags (REQUIRED, always)

The orchestrator routes conditional phases off four flags derived from the spec, plus a tier hint. Derivation rules:

- `frontend`: yes if the spec mentions UI, screens, components, or user-facing forms.
- `db`: yes if the spec touches a table, schema, or persisted state.
- `pii`: yes if the spec handles personal / identifying / financial data.
- `unknowns`: yes if any `[OPEN]` question or feasibility risk remains (`[PARKED]` does not count).
- `tier-hint`: from audience. Prototype/internal -> mvp; real users behind a flag -> beta; critical/compliance/scale/external -> enterprise.

`frontend` gates cfn-ux + cfn-design. `db` gates cfn-data. `pii` forces the privacy floor. `unknowns` gates cfn-research (and means spec ran on incomplete info). `tier-hint` seeds tier inference; the orchestrator confirms with the user when ambiguous.

The flags are emitted as the final section of the spec artifact, in the exact format shown in the template below. The megaplan orchestrator parses that block verbatim; do not rename keys, reorder lines, or add prose inside it.

## Output

Build the slug with the canonical rule (identical in every planning phase; see `cfn-megaplan` Step 1):

```bash
SLUG=$(echo "$TASK" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
```

Write to: `planning/SPEC_<slug>.md`

Template (all 8 sections required; Build Flags is always last):
```markdown
# Specification: <task>

**Date:** <YYYY-MM-DD>
**Author:** spec phase (cfn-spec)
**Status:** draft | reviewed | locked

## 1. Functional Requirements
FR-1: ...
FR-2 [core]: ...   (mark every mechanism that must fire end-to-end; out-of-band [core] FRs also name their runtime signal)

## 2. Non-Functional Requirements
NFR-1: ...

## 3. Acceptance Criteria
Scenario: ...   (every Then passes the three-part rubric)

## 4. Edge Cases
| Category | EC | Stresses | Expected behavior |
(all 10 categories present, each with EC rows or an explicit N/A: <reason> row; >=5 ECs total)

## 5. Pre/Post Conditions
Operation: ...

## 6. Out of Scope
- ...

## 7. Open Questions
- Q-1: [OPEN] ... | [PARKED: <accepted default>] ...

## 8. Build Flags
- frontend: yes|no
- db: yes|no
- pii: yes|no
- unknowns: yes|no
- tier-hint: mvp|beta|enterprise
```

**Status field semantics:** the spec author always writes `draft`. A human reviewer may flip it to `reviewed`. The megaplan orchestrator flips it to `locked` after Bar A (verifiable-done) passes; only a `locked` spec feeds implementation.

## Example (compact): planning/SPEC_realtime_notifications.md

Same task as `cfn-decide`'s example register, so cross-skill examples cohere.

```markdown
# Specification: realtime notifications
**Status:** draft

## 1. Functional Requirements
FR-1: System SHALL create a notification row WHEN a family member publishes a story.
FR-2 [core]: System SHALL deliver unread notifications to the browser within 5s WHEN the user has an open session, GIVEN the delivery channel is connected.
FR-3 [core]: System SHALL mark notifications read WHEN the user opens the notification list, AND SHALL emit log line "notify.read count=<n>". (runtime signal: notify.read log)

## 2. Non-Functional Requirements
NFR-1: Delivery p95 < 5s at 100 concurrent sessions.
NFR-2: All notification endpoints return 401 on missing/invalid session.

## 3. Acceptance Criteria
Scenario: story publish notifies family
  Given user B is in family F with an open session
  When user A publishes story S in family F
  Then notifications has a row (user=B, story=S, read=false) AND B's browser receives {type:"story.published", id:S} within 5s

## 4. Edge Cases
| Category | EC | Stresses | Expected behavior |
| Empty inputs | EC-1: family with zero other members | FR-1 | zero rows created, publish still 200 |
| Concurrency | EC-2: two tabs both mark read | FR-3 | idempotent; log count reflects rows actually flipped |
| Failure modes | EC-3: delivery channel down | FR-2 | row persists; delivered on reconnect |
| Auth/permission | EC-4: expired session on list fetch | FR-3 | 401, no rows flipped |
| State transitions | EC-5: story deleted before delivery | FR-2 | notification suppressed, row marked stale |
| Boundary values | N/A: no numeric ranges in scope | - | - |
(remaining categories walked the same way in a real spec)

## 5. Pre/Post Conditions
Operation: markRead
  Preconditions: authenticated session; notification rows exist for user
  Postconditions (success): read=true on fetched rows; "notify.read count=<n>" logged
  Postconditions (failure): no rows changed
  Invariants: rows are never deleted by markRead

## 6. Out of Scope
- Email/push delivery channels

## 7. Open Questions
- Q-1: [PARKED: keep 90 days] notification retention window

## 8. Build Flags
- frontend: yes
- db: yes
- pii: no
- unknowns: no
- tier-hint: beta
```

## Return to orchestrator

```
artifact: planning/SPEC_<slug>.md
build_flags: frontend=<yes|no> db=<yes|no> pii=<yes|no> unknowns=<yes|no> tier-hint=<mvp|beta|enterprise>
core_frs: [FR-2, FR-3]
open_questions: <n> [OPEN], <m> [PARKED]
```

## Handoff

This artifact is the input to `cfn-pseudo` and `cfn-decide`. Do not advance to pseudocode phase while any `[OPEN]` question remains; `[PARKED: <default>]` items are acceptable and travel as stated assumptions. Under `cfn-megaplan`, the `## 8. Build Flags` block is consumed directly by the orchestrator to resolve `conditional:` phases.

## Anti-Patterns

- Writing implementation hints in FRs ("uses Redis to cache...")
- "Handles errors gracefully" without specifying behavior
- Fewer than 5 edge cases, or any of the 10 categories left without an EC row or an explicit N/A reason
- A spec without a `## 8. Build Flags` section is incomplete; the orchestrator rejects it.
- Acceptance criteria that don't map to a testable observable
- **Existence / structural acceptance criteria**: "function X exists", "endpoint defined", "component renders without throwing", "type compiles". A do-nothing stub passes every one. Every AC asserts observable behavior, output content, or a state/persistence change.
- **No `[core]` flag on the mechanism that must actually fire.** If nothing is marked `[core]`, the test plan has no signal for which FR needs an assembled-path check, and the core logic ships unit-tested-only (green gate, dead feature).
- Assuming missing information instead of recording as Open Question

## Related

- Canonical orchestrator: `cfn-megaplan` (tiered DAG; consumes the Build Flags block to route conditional phases)
- Next phase: `cfn-pseudo` (algorithm trace), in parallel with `cfn-decide` (decision register)
- Then: `cfn-arch` (component contracts)
- Lighter orchestrator: `cfn-spa-plan` (auto-chains spec + pseudo + arch only)
- Downstream: `/write-plan` consumes SPEC artifact
