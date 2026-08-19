---
name: cfn-spec
description: "SPARC Specification phase. Make testable acceptance criteria, edge cases, pre/post conditions, invariants BEFORE planning implementation. Use when starting any non-trivial task to lock intent, surface ambiguity early."
version: 1.1.0
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
5. If the `[core]` mechanism's input is externally produced / non-deterministic — LLM structured output, free-text, a webhook or queue payload — the FR MUST also be listed in `core_fr_requires_input_correlation`. Its assembled-path AC seeds a concrete `seed:<TOKEN>` into the upstream input and asserts that TOKEN surfaces in the output, proving the handler parsed the input rather than returning a constant. (CQR gap #1: a handler that built a literal `TierCOutput` satisfied every signature-purity AC while the LLM output was parsed only inside `#[cfg(test)]`.)

```
FR-2 [core]: System SHALL publish a scheduled story AND notify the family WHEN the scheduled time passes, GIVEN the publish worker is running.
FR-3 [core]: System SHALL archive expired stories WHEN the nightly cron runs, AND SHALL emit log line "archive.complete count=<n>". (runtime signal: archive.complete log)
```

**Flag boundary-crossing FRs `[boundary]`.** Apply when an FR reads or writes a persistence layer (DB, cache, queue) or calls an external service, AND its observable semantics depend on behavior at that boundary — row ordering, filtering, limits, pagination, status-dependent fetch (e.g. exclude `Corrected`/`Retracted` rows), or constraint enforcement. Tagging is mandatory for such FRs; `cfn-test-plan` then owes a `kind: integration` AC that drives the REAL boundary (a live DB / real HTTP call), never a builder-isolation unit test with in-memory fixtures. Spec emits `boundary_fr: [FR-ids]` into the VERIFY coverage; an empty list requires `no_boundary_fr_reason`.

Why: a builder-isolation test proves the prompt builder honors insertion order; it does NOT prove the DB `ORDER BY` feeds that insertion order correctly. The CQR grounded-opener shipped `ORDER BY created_at ASC` (oldest-first) while a builder test asserted latest-first against an in-memory `Vec` — green structural test, reversed live behavior. `[boundary]` forces the AC to cross the seam. An FR with no boundary-dependent semantics (a trivial single-row lookup whose result is order/filter-independent) need not be tagged; when in doubt, tag it.

### Step 1a: Actor Inventory (MANDATORY when `frontend: yes` OR `db: yes`)

**The gap this closes:** two downstream phases are already told to get roles from the spec, and the spec has nowhere to put them. `cfn-arch` Step 6 says its AuthZ matrix roles are "enumerated from SPEC". `cfn-data` Step 4 (an RLS **floor** item) needs a `Principal/role` per policy — and `cfn-data` runs at DAG L4, *before* `cfn-arch` at L5, so it cannot borrow arch's matrix either. Without this section both phases scrape prose or invent a role set, and two invented sets do not have to agree. Naming actors once, here, is what makes the RLS policy and the AuthZ matrix derivable instead of guessed.

This is **not** a permission model. You name **who exists**; `cfn-arch` Step 6 decides what each is allowed, `cfn-data` Step 4 writes the policy that enforces it, `cfn-ux` 3d decides what each sees. Do not put allow/deny in this table.

Emit when `frontend: yes` OR `db: yes`. Omit only for a build with no user surface and no database (pure library / CLI with a single implicit caller).

```
| Actor | Kind | Touches (FR ids) | Trust boundary | Distinct experience? |
```

- **Actor** — the canonical name. Downstream consumes these **verbatim**: `cfn-arch` Step 6 AuthZ matrix columns and `cfn-data` Step 4 `Principal/role` cells must use these exact strings, the same byte-for-byte contract `cfn-ux` 3d already has with arch. A downstream phase inventing a role not listed here is a producer defect; route it back.
- **Kind** — `human-role` | `service` | `system`. Not decoration: `cfn-data` Step 4 requires every service-role write that bypasses RLS to be named explicitly, and it can only do that if the service actors are enumerated.
- **Touches (FR ids)** — which FRs this actor exercises. Forces the linkage both ways (see rules).
- **Trust boundary** — where this actor's identity is established: `authenticated (auth.uid())` | `anonymous/public` | `service key` | `internal (no external caller)`. Feeds `cfn-data` Step 4's auth boundary and `cfn-arch` AuthN.
- **Distinct experience?** — `yes` | `no`. This is the forcing function for Step 1b's Role/context variance dimension.

Rules:

- **Anonymous is an actor.** A public read path has an actor named `anonymous`. Omitting it is how a table ends up with a permissive policy nobody decided to write.
- **Non-human actors count.** A cron job, a queue consumer, a worker, a webhook caller — each is an actor with a trust boundary. `[core]` FRs that fire out-of-band (Step 1) always have one.
- **Every FR is touched by >=1 actor.** An FR no actor touches is `[OPEN]`: either an actor is missing or the requirement is dead.
- **Every actor touches >=1 FR.** An actor touching nothing is speculation; cut it.
- **Single-actor builds are legitimate.** One row, `Distinct experience? = no`. State it; do not skip the section to avoid saying it.
- Unresolved actors are `[OPEN]` and block — they reach `cfn-data`'s RLS floor at L4.
- **Reuse the project's existing role definitions; never re-derive them.** Before writing this table, check for project-local role skills (`.claude/skills/role-*/SKILL.md`). Where one exists for an actor, its name is the canonical Actor string and its documented capabilities are ground truth — this table cites it (`see [[role-<name>]]`) and records only what THIS build changes. A spec that re-derives a role already defined in a role skill creates a second source of truth for that role, and the two will drift. If this build changes what a role can do, that is a change to the role skill, not a private redefinition here.

```
| Actor | Kind | Touches (FR ids) | Trust boundary | Distinct experience? |
| coach | human-role | FR-1, FR-2, FR-4 | authenticated (auth.uid()) | yes |
| family-member | human-role | FR-2, FR-5 | authenticated (auth.uid()) | yes |
| anonymous | human-role | FR-5 | anonymous/public | yes |
| publish-worker | system | FR-2 [core] | internal (no external caller) | no |
```

### Step 1b: Interaction Intent Walk (MANDATORY when the task has a user-facing surface)

The gate this closes: Bar A and Bar B both verify the plan *against the spec*. Neither can catch a spec that already encodes the thinnest reading of an interactive feature. A conditional-logic builder specced as "show/hide fields based on a condition" is internally consistent, passes every gate, and ships as *one operator (equals) + a free-text value box*. The defect is the scope of the spec, not a deviation from it. This step stress-tests the spec's experience completeness against the user's intent BEFORE the data model locks (`cfn-data`, DAG L4) — after that, adding an operator set or a value-type is a schema migration, not an edit.

**Intent-first, not field-first.** Do NOT interrogate every field. Ask high-leverage questions at the *pattern* level that resolve whole categories at once. Drop to a specific per-field question only for residual ambiguity the intent answer did not clear.

**Archetype bundles: ONE primary question per interactive feature.** Do not ask one question per dimension — seven questions per feature drowns the user at pattern level instead of field level (same disease, higher altitude). Instead, compose a single primary question offering 2–4 *named versions of the whole pattern*. Each version is a bundle that pre-resolves several dimensions at once (typically richness ceiling + value-type inheritance + composition depth). The user picks a version; only the dimensions that choice leaves unresolved get residual questions.

**Mandatory option shape.** Every intent question presented via `AskUserQuestion` MUST:

- Offer 2–4 concrete options. Each option states exactly what it includes ("operators: equals, contains, is-empty; value input matches field type"), never a vague label ("advanced version").
- Flag exactly one option **(Recommended)**, chosen by audience / tier-hint — recommend for long-term maintenance, not the quickest build.
- Use plain English; no schema/component jargon.
- Anchor to a known product when one fits the pattern ("filters like Airtable" / "a basic search box"). A reference anchor is the cheapest intent extraction there is.

Worked question payload (the nysdra condition-builder case):

```
Question: "Form fields can show/hide based on conditions. Which version of the
condition builder do you want?"
  (A) Basic — one operator (equals), value is always a text box, one condition
      per field.
  (B) Typed (Recommended) — operators vary by field type (text: equals /
      contains / is empty; number: = ≠ < >; dropdown: is / is not / any of),
      value input matches the field being compared (dropdown shows its options,
      date shows a date picker), multiple conditions combined with AND.
  (C) Composable — everything in B, plus OR logic and nested condition groups,
      like Airtable's filter builder.
```

One answer to that resolves Richness ceiling, Value-type inheritance, AND Composition depth for the entire feature. Residual dimensions (lifecycle, referential integrity) are asked only if still ambiguous after the archetype answer.

For EVERY interactive feature (any FR where the user composes, builds, filters, edits, or configures — form, builder, wizard, table, editor, dashboard), walk these leverage dimensions as the **coverage checklist**: every dimension must end resolved (by the archetype answer, a residual question, or an explicit `N/A: <reason>`).

| Leverage dimension | Intent question it triggers | One answer clears |
|---|---|---|
| Richness ceiling | Minimal version or full-featured version of this pattern? | operator sets, option counts, feature toggles across the whole feature |
| Value-type inheritance | Does an input's type follow the thing it references, or is it always free text? | control type for every comparison / parameter field |
| Composition depth | Single item, flat list, or nested / grouped (AND/OR, sub-groups)? | data-model shape + UI recursion for the whole feature |
| State / lifecycle | Draft / save / resume? edit-after-create? versioning? undo? | persistence + screen states across all screens |
| Referential integrity | What happens to a reference when its target changes or is deleted? | cascade behavior for every cross-field / cross-entity link |
| Scale / volume | 5 items or 5000? drives search, pagination, bulk actions | list + control patterns feature-wide |
| Role / context variance | Resolve against **Step 1a**, never in the abstract: for each actor with `Distinct experience? = yes`, what changes for them? | visibility + control variance |

Output row format (one per dimension per interactive feature):

```
| Feature | Dimension | Intent question (or N/A: reason) | Resolution |
| condition builder | Richness ceiling | archetype Q (A/B/C above) | [OPEN] |
| condition builder | Value-type inheritance | archetype Q (A/B/C above) | [OPEN] |
| condition builder | Composition depth | archetype Q (A/B/C above) | [OPEN] |
| condition builder | State/lifecycle | residual: edit conditions after form is live? | [OPEN] |
| condition builder | Scale/volume | N/A: max 10 conditions per form | flat list, no pagination |
```

Several rows sharing one archetype question is the normal, desired shape — it means the bundle is doing its job. After the user answers, rewrite each shared row's Resolution with what the chosen archetype fixed (e.g. `archetype B: typed operator set` / `archetype B: value input inherits field type` / `archetype B: flat AND list`).

**Role / context variance resolves against the Step 1a actor table, not from memory.** This dimension is the one an archetype bundle cannot pre-resolve — a bundle names versions of a *pattern*, and "who sees what" is orthogonal to how rich the pattern is. Resolve it mechanically:

- Zero actors with `Distinct experience? = yes` → `N/A: single experience across <n> actors`. Valid, and now it is a stated finding rather than an unasked question.
- One or more → the dimension is NOT resolved until each such actor has a named difference (what they see, what they cannot do, what changes). "Varies by role" is not a resolution; it is the question restated.
- A difference named here feeds back into Step 1 as an FR, same as any other intent resolution. `cfn-arch` Step 6 turns it into AuthZ cells and `cfn-ux` 3d into hidden/disabled — neither re-litigates it.

Rules:
- **Archetype bundle first, residual questions second, per-field questions last.** A dimension resolved at intent level is NOT re-asked per field downstream — `cfn-ux` reads the resolved intent and derives controls from it; it does not re-litigate.
- Every resolved intent **feeds back into Step 1**: expand or refine the FR list so the richness is captured as testable behavior (e.g. `FR-N: builder SHALL support operators {equals, not-equals, contains, >, <, in-list, is-empty}`). An intent answer that never becomes an FR is lost.
- Unresolved dimensions are `[OPEN]` — they block the pipeline (Step 7 machinery), surfaced via `AskUserQuestion` before `cfn-data` runs.
- **This step SUSPENDS Step 0's "minimum viable interpretation" pull for interactive richness.** Step 0 governs file-count scope; the intent walk governs experience depth — they are different axes. When a dimension has a plausibly-richer reading, surface it; never default thin silently. When the feature's whole point IS the interaction (a builder exists to compose conditions), flag the richer option — equals-only guts the feature. Recommend by audience / tier.

Skip this step entirely for backend-only / CLI-only / no-user-surface tasks (same signal as the `frontend` build flag in Step 8).

<!-- cfn: no question-budget cap on the intent walk; add a per-spec cap (e.g. <=2 questions per feature, overflow -> recommend + [PARKED]) if intent walks start exceeding ~6 questions per spec -->


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
| Data quality | malformed input, encoding issues; SQL injection AND HTML/script-in-content (expect escaped render, no live `<script>` element); 10k-char oversized input; zero rows; >=100-row volume |
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

**Hostile-input rule (frontend or free-text).** When `frontend=yes` (Step 8) OR any field accepts free text, the **Data quality** and **Locale/i18n** categories may NOT be marked `N/A`. Each must emit >=1 EC carrying a concrete hostile value (an actual injection string, an emoji/RTL/surrogate sequence, a 10k-char blob) and the exact expected behavior (escaped render with no live `<script>`, normalized display, 400 on oversize). A vague "handles unicode" is rejected the same as any adjective-only Then.

**Tier note (adversarial fixtures).** The full adversarial fixture class is a beta+ extra in `cfn-test-plan`, NOT floored. Injection/XSS itself is already floored here via the always-on spec EC path: mvp still tests the injection EC at unit level; beta+ adds the full fixture class (the ADV-n table). This note also appears in `cfn-test-plan`.

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

### Step 9: Part Ownership (program mode ONLY; `cfn-megaplan-fast --parts` != 1)

When the orchestrator says the task is a multi-part program, the spec is written ONCE for the whole program and every downstream part reads only its slice through `cfn-megaplan/lib/extract-sections.sh`. Two obligations:

1. Emit `## 9. Part Ownership`: a table `id | name | scope (one line) | deps (ids)`. Ids match `[A-Za-z0-9_-]+`. Choose 2..N parts by seam (shared-state surface, actor, or deploy unit), never by file count. Deps form a DAG.
2. Tag every FR/EC/entity/screen row (or heading) that belongs to one part with `[part: <id>]` (multi: `[part: B0, B2]`). Untagged rows and headings are shared and reach every part; use `[part: shared]` only when you need to say so explicitly. A row that names a table or screen one part owns MUST be tagged.

Omit this step and the section entirely in single-feature mode. The grammar is the `extract-sections.sh` contract; do not invent variants.

**Part SPEC mode** (the orchestrator says `Part SPEC mode` for part `<id>`; `cfn-megaplan-fast` Step 1b): you are writing `PARTSPEC_<prog>__<id>.md` for ONE part of a program whose program SPEC already exists. Inputs are the part's extract of that SPEC plus its §1a Actors, §8 flags, §floor and §9 row. Write only: §2 FRs, §3 ECs, §4 ACs for this part (ids `FR-<id>-n`, `EC-<id>-n`, `AC-<id>-n`), the entities/screens this part owns, and an `## Interfaces` table (`direction | other part id | what`, e.g. `consumes | B1 | session actor from identity`). Do NOT write §1a, §8, §9, the floor checklist, or §1b (inherited from the program SPEC; repeating them is how caps get blown). BLOCKING forks only as `[OPEN]`; everything else `[PARKED: <default>]`. No `[part: ...]` tags inside a PARTSPEC (the file is the part). Hard cap comes from the prompt (12288 bytes).

## Output

Build the slug with the canonical rule (identical in every planning phase; see `cfn-megaplan` Step 1):

```bash
SLUG=$(echo "$TASK" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
```

**Artifact location.** Every artifact of one plan lives in that plan's own directory, `planning/<slug>/`. Under `/cfn-megaplan`, `/cfn-megaplan-lite`, or `/cfn-spa-plan` the orchestrator hands you the exact path plus a `Plan dir:` line — write there, and read the input paths it gives you verbatim. Invoked standalone, read with `.claude/skills/cfn-megaplan/lib/plan-paths.sh resolve <slug> <basename>` (per-plan dir first, legacy flat `planning/` second) and write to `planning/<slug>/`. Never split one plan across two locations.

Write to: `planning/<slug>/SPEC_<slug>.md`

Template (8 core sections required; section 1b required only when the task has a user-facing surface; Build Flags is always last):
```markdown
# Specification: <task>

**Date:** <YYYY-MM-DD>
**Author:** spec phase (cfn-spec)
**Status:** draft | reviewed | locked

## 1. Functional Requirements
FR-1: ...
FR-2 [core]: ...   (mark every mechanism that must fire end-to-end; out-of-band [core] FRs also name their runtime signal)

## 1a. Actors   (required when frontend: yes OR db: yes; omit only for no-surface + no-db builds)
| Actor | Kind | Touches (FR ids) | Trust boundary | Distinct experience? |
(names are canonical: cfn-arch §6 AuthZ columns and cfn-data §4 Principal/role consume them verbatim.
Kind = human-role|service|system. Anonymous and non-human actors are actors. Every FR touched by >=1
actor; every actor touches >=1 FR. Cite an existing [[role-<name>]] skill rather than re-deriving it.)

## 1b. Interaction Intent   (only when the task has a user-facing surface; omit for backend/CLI-only)
| Feature | Dimension | Intent question (or N/A: reason) | Resolution |
(walk all 7 leverage dimensions per interactive feature; one archetype-bundle question per feature resolves most rows; each resolution feeds back into an FR above; unresolved = [OPEN])

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

## 9. Part Ownership   (program mode only; omit otherwise)
| id | name | scope | deps |
|---|---|---|---|
| B0 | <name> | <one line> | - |
| B1 | <name> | <one line> | B0 |
```

**Status field semantics:** the spec author always writes `draft`. A human reviewer may flip it to `reviewed`. The megaplan orchestrator flips it to `locked` after Bar A (verifiable-done) passes; only a `locked` spec feeds implementation.

## Example (compact): planning/realtime_notifications/SPEC_realtime_notifications.md

Same task as `cfn-decide`'s example register, so cross-skill examples cohere.

```markdown
# Specification: realtime notifications
**Status:** draft

## 1. Functional Requirements
FR-1: System SHALL create a notification row WHEN a family member publishes a story.
FR-2 [core]: System SHALL deliver unread notifications to the browser within 5s WHEN the user has an open session, GIVEN the delivery channel is connected.
FR-3 [core]: System SHALL mark notifications read WHEN the user opens the notification list, AND SHALL emit log line "notify.read count=<n>". (runtime signal: notify.read log)

## 1b. Interaction Intent
| Feature | Dimension | Intent question (or N/A: reason) | Resolution |
| notification list | Richness ceiling | mark-read only, or also dismiss/mute/filter-by-type? | mark-read + dismiss (→ FR-4) |
| notification list | State/lifecycle | N/A: notifications are ephemeral, no draft/edit | read + dismissed states only |
| notification list | Scale/volume | cap shown, paginate, or infinite scroll past N? | show latest 50, "load older" (→ FR-5) |
| notification list | Role/context variance | N/A: same list for every family member | uniform |

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
artifact: planning/<slug>/SPEC_<slug>.md
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
- **Speccing the thinnest reading of an interactive feature.** A builder/form/wizard specced at its minimal interpretation (one operator, free-text everywhere, no composition) is internally consistent and passes every gate, then ships gutted. Any user-facing surface MUST pass the Step 1b intent walk before the data model locks.
- **Field-by-field interrogation instead of intent.** Asking a question per field drowns the user and still misses the pattern. Ask the high-leverage intent question that clears the whole category.
- **One question per dimension instead of an archetype bundle.** Seven questions per feature is field-by-field interrogation at pattern altitude. Bundle the dimensions into 2–4 named versions of the feature and ask once; residual questions only for what the answer left open.
- **Options without a recommendation, or vague options.** "Basic vs advanced?" extracts nothing. Every option names its concrete contents; exactly one is flagged (Recommended) by audience/tier.
- **Letting Step 0's MVP pull thin out interactive richness.** Step 0 caps file count; it does not license equals-only when the feature's point is composing conditions. Different axes.

## Related

- Canonical orchestrator: `cfn-megaplan` (tiered DAG; consumes the Build Flags block to route conditional phases)
- Next phase: `cfn-pseudo` (algorithm trace), in parallel with `cfn-decide` (decision register)
- Then: `cfn-arch` (component contracts)
- Lighter orchestrator: `cfn-spa-plan` (auto-chains spec + pseudo + arch only)
- Downstream: `/write-plan` consumes SPEC artifact
