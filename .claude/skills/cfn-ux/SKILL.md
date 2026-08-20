---
name: cfn-ux
description: "MUST BE USED for the interaction-design phase of any frontend build. Owns the full interaction experience: derives every UI control from its data binding (field-to-control derivation), per-field interaction (defaults, autofocus, validation timing), enumerates UI + edge states, maps single-task flows AND cross-screen journeys (wizards, onboarding, save/resume), confirmation/feedback/undo behavior, and role-based visibility. Kills the dropdown-as-textbox bug. Hands visual/responsive/copy to cfn-design and route structure to cfn-arch. Use after cfn-data, before cfn-design."
version: 1.0.0
tags: [planning, ux, interaction-design, affordance, controls, states, flows, frontend]
status: production
---

# CFN UX Skill (MegaPlan Phase, DAG Level 5)

**Purpose:** Turn the data model into interaction design. For every field, derive the correct control from its binding so the implementer cannot guess. For every screen, enumerate all states so nothing ships happy-state-only. For every task, map the flow including the error path. This phase exists to kill one class of bug: a free-text input wired to a field that is actually backed by a database list (should be a dropdown). The affordance map is the deterministic core — it removes the judgment call.

**Phase:** UX interaction design. MegaPlan DAG level 5 (runs parallel with `cfn-arch`). Conditional on the `frontend` build flag. Agent type: `ui-designer`.

**Scope boundary (cohesion split):** This phase owns *interaction behavior* — controls, states, per-field interaction, flows, journeys, feedback/undo, role-based visibility. It does NOT own:
- **Visual / responsive / touch / microcopy** → `cfn-design` (how it looks, breakpoints, copy/tone, full WCAG).
- **Route structure / deep-linking / screen-to-screen architecture** → `cfn-arch` Step 3 (the navigation *map*; cfn-ux owns navigation *affordances within a flow*).
- **AuthZ enforcement** (operation × role) → `cfn-arch` Step 6; cfn-ux consumes that matrix to decide what each role *sees* (hidden vs disabled), not whether they are *allowed*.

It floors at MVP because broken interaction (wrong control, no error path, dead-end journey) is a correctness defect, not polish.

## When to Use

- Auto-invoked by `cfn-megaplan` at level 5 when the `frontend` build flag is true.
- After `cfn-spec` and (when present) `cfn-data` artifacts exist.
- Standalone when adding any new form, screen, or user-facing surface to an existing system.

Skip only for: backend-only changes, CLI-only tools, or tasks with no user-facing surface.

## Input

Required:
- `planning/<slug>/SPEC_<slug>.md` — the screens, tasks, and acceptance criteria. Includes the **§1b Interaction Intent** table: the richness ceiling, value-type inheritance, composition depth, and lifecycle decisions already resolved with the user at spec time. Read it as settled. Derive controls from the resolved intent; do NOT re-open a dimension the intent walk already answered (e.g. if §1b fixed the operator set, the affordance map builds those operators — it does not re-ask which operators exist).

Optional but authoritative when present:
- `planning/<slug>/DATA_<slug>.md` — the data phase. Gives the field bindings: which fields are FK / enum / lookup / boolean / date / timestamp / free-text / numeric / multi-FK. This is the source of truth for control derivation. If it exists, you do not guess bindings — you read them.

If `DATA_<slug>.md` is absent (no `db` flag), infer bindings from SPEC and mark each inferred binding `[OPEN]` for user confirmation. Never silently assume a field is free-text.

From the orchestrator you also receive:
- **Tier** — `mvp` | `beta` | `enterprise`.
- **Directive** — `full` | `light`.
- **Include extras** — e.g. `analytics_events`.
- **Omit** — drops listed by the profile.

### Directive scope (`light` vs `full`)

- **`light` (mvp):** interaction correctness only. Emit the field-control table (Phase 1), the state table (Phase 2), the core flows (Phase 3), and the low-fi wireframe (Phase 6). Skip polish: no micro-interaction notes, no exhaustive empty-state copy, no secondary flows. Every field still gets a derived control; every screen still gets all six states named. Correctness never drops.
- **`full` (beta / enterprise):** all phases. Add analytics events (Phase 4, when in extras), full accessibility hooks (Phase 5), secondary and recovery flows, and partial-state detail.

`light` reduces breadth, never the affordance map or the wireframe. The map is the reason this phase floors at MVP; the wireframe is the visual confirmation of it, floored for the same reason — both catch a wrong path, and a wrong path is a correctness defect at any tier.

## Protocol

### Phase 1: Field → Control Derivation (the deterministic core)

This is the payload that kills the dropdown bug. For EVERY field in the data model, read its binding from `DATA_<slug>.md` and emit a row. The control is not a choice — it falls out of the binding via this map.

**Input contract (DATA section 2, 8 columns, pinned):**

```
| Field | Type | Binding kind | Source table/enum | Required | Options/rows (count or est.) | Range/length | UI access |
| course_id | uuid | FK | public.courses | yes | 12 rows | - | editable |
| status | text | enum | enrollment_status | yes | 4 values | - | readonly |
| notes | text | free-text | - | no | - | <=500 chars | editable |
```

Consumer matches this table byte-for-byte; unmatched values route back as producer defects.

Derivation map (one row per token of the closed nine-token vocabulary):

| Binding kind (token from DATA) | Control | Validation |
|---|---|---|
| FK | select / combobox (combobox with search if >20 rows) | value ∈ table |
| enum | select, or radio group if <=4 options | value ∈ enum |
| lookup | select | value ∈ table |
| boolean | toggle / checkbox | - |
| date | date picker | range / min-max |
| timestamp | datetime picker | range / min-max |
| free-text | input (short) / textarea (long) | length, pattern |
| numeric | stepper / slider / number input | min / max, step |
| multi-FK | tag / chip multiselect | each value ∈ table |

The Binding kind cell in DATA is matched byte-for-byte against this column. An unmatched token is a cfn-data defect; route back, do not interpret.

Tie-breakers (mechanical, no judgment call):
- free-text: length <=120 chars OR single-token (name, title) -> input; >120 chars, no limit, or multi-sentence -> textarea; no limit stated -> [OPEN].
- numeric: bounded AND <=20 discrete steps -> stepper; bounded, continuous, exact value not critical -> slider; unbounded or precision matters -> number input with min/max.
- boolean: takes effect immediately on change (setting, filter) -> toggle; submitted with the form (consent, opt-in) -> checkbox.
- date -> date picker; timestamp -> datetime picker; time-only -> time input.
- enum: <=4 options -> radio group; 5-20 -> select; >20 -> combobox+search (same thresholds as FK).

Rules:
- **A field bound to an FK or lookup table is NEVER a free-text input.** It is a select or searchable combobox sourced from that table. This is the single rule the bug violates.
- Every row names the **value source** (which table, enum, or constant supplies the options). Bar B rejects any control whose options have no named source.
- `>20 rows` → combobox with type-ahead search, not a raw select (usability + render cost).
- The output table is consumed directly by Bar B (`bars/haiku-executable.md`). A haiku-level implementer reads the control column and builds it. No interpretation allowed.

Emit one row per field. No field is exempt. A field with no binding listed is an `[OPEN]` item, not a free-text default.

**Per-field interaction (extend each row).** Control type is necessary, not sufficient. For every field also name:
- **Default value** — pre-filled, empty, or derived (and from what). No silent empties on fields that have a sensible default.
- **Autofocus** — which single field gets focus on screen entry (at most one).
- **Autocomplete / input mask** — `autocomplete` token for known fields (email, name, address); mask/format for structured input (phone, card, currency).
- **Validation timing** — when the field validates: on-blur, on-change, or on-submit. Default: on-blur for format, on-submit for cross-field. Inline error shows adjacent, not only a summary.
- **Help text** — present when the constraint is non-obvious (format, why it is required). Name it or mark `none needed`.

A field with a control but no validation timing is `[OPEN]` — the implementer would guess when the error fires.

### Phase 2: State Enumeration

For every screen / surface, enumerate these states and name what renders in each. No screen ships with only the happy (success) state.

| State | Must name |
|---|---|
| loading | what placeholder / skeleton / spinner shows while data is in flight |
| empty | what renders when the data set is legitimately empty (zero rows) |
| error | what shows on fetch / submit failure, and the retry affordance |
| success | the populated happy state |
| partial | what shows when some data loaded and some failed (lists, dashboards) |
| disabled | which controls are non-interactive and the condition that disables them |

A screen that only specifies the success state fails this phase. Loading, empty, and error are mandatory for any screen that fetches data.

**Edge states (beyond the happy six).** For any screen behind auth or editing shared data, also name what renders for:

| Edge state | Must name |
|---|---|
| session expired | what happens when the token dies mid-screen (redirect to login preserving intent, or inline re-auth) — never a silent failed save |
| concurrent edit / stale data | what shows when the row changed underneath the user (conflict prompt, reload, last-write-wins warning) |
| timeout / slow network | when the loading state escalates (e.g. "still working" after 10s, cancel affordance) |
| offline | whether the screen degrades, queues, or blocks when the network is gone |

`light` (mvp) requires the happy six; edge states required at `full` for any screen that mutates shared/persistent data.

### Phase 3: Flows, Journeys, Feedback & Visibility

**3a — Single-task flow.** For each task in the spec, map **entry → action → result → error path.** Name affordances explicitly:
- What is clickable (buttons, links, rows).
- What is disabled and the exact condition (e.g. "Submit disabled until course selected and date in range").
- The error path: what the user sees and can do when the action fails. A flow with no error path fails this phase.

Emit each flow as a row of the task-flow table (pinned shape, used in 3a and 3b):

```
| Task | Entry | Action | Result | Error path | Disabled-when |
```

Cover the primary flow for every task. Under `full`, also map secondary flows (edit, delete, cancel) and the recovery flow (what the user does after an error).

**3b — Cross-screen journey.** A task that spans more than one screen is a journey, not a flow. For each, map:
- **Steps + progress** — the ordered screens and how the user knows where they are (step indicator, breadcrumb).
- **Forward/back** — can the user go back without losing input; what each step's back does.
- **Save / resume** — is partial progress persisted (draft), and how the user resumes. A multi-step form that loses everything on reload fails this.
- **Entry + exit points** — how the journey is entered (deep-link? only from screen X?) and where completion/abandonment lands the user. Name the route map source: `cfn-arch` Step 3 owns the route structure; cfn-ux owns the in-journey navigation behavior.
- **First-run / onboarding** — when the journey is a user's first encounter, the `empty` state is an activation opportunity, not a blank. Name the empty-as-onboarding content.
- **Per-step task rows** — each journey step also gets a row in the 3a task-flow table (`| Task | Entry | Action | Result | Error path | Disabled-when |`) so no step ships without an error path.

**3c — Confirmation, feedback & undo.** For every action that mutates data:
- **Feedback** — what confirms success (toast, inline, redirect). Optimistic update or wait-for-server, and how a rollback shows if the optimistic write fails.
- **Destructive confirm** — delete / irreversible actions require an explicit confirm step (named), OR an undo window. State which.
- **Undo** — where an undo affordance exists and its window. Prefer undo over a confirm dialog for reversible actions.
A mutating action with no success feedback fails this phase.

**3d — Role-based visibility.** Consume `cfn-arch` Step 6 AuthZ matrix (operation × role, cells from {allow, deny-role, deny-state}). Consumer matches that table byte-for-byte; unmatched values route back as producer defects. For each role, name per restricted affordance: **hidden** (not in DOM) vs **disabled** (visible, inert, with reason). Derivation: deny-role (user can never do it) -> hidden (not in DOM). deny-state (could do it after upgrade/state change) -> disabled + reason text. The matrix cell decides; no other criterion. cfn-ux decides *what is seen*; cfn-arch decides *what is allowed* — never re-implement the permission check here.

`light` (mvp): 3a + 3c success feedback only. `full`: all of 3a-3d.

### Phase 4: Analytics / Telemetry Events (extra — gap G26, only when in extras)

When `analytics_events` is in the orchestrator's extras list, name the user events to track. One row per event: event name, trigger (which affordance / state transition fires it), and the properties captured. Example: `course_selected | onChange of course combobox | {course_id, source: 'booking_form'}`. Omit this phase entirely when not in extras.

### Phase 5: Accessibility Hooks (interaction-level only)

Flag the interaction-level a11y obligations and hand them to `cfn-design` (which owns the full WCAG audit). You name, you do not audit:

- **Keyboard:** every affordance reachable and operable by keyboard; named keys for non-standard controls (e.g. combobox arrow-key navigation).
- **Focus order:** the focus sequence through each flow (entry field → ... → submit). Focus must follow the visual / logical order of the flow.
- **ARIA hooks:** roles / labels the control type implies (combobox needs `role=combobox` + `aria-expanded`; error state needs `aria-invalid` + `aria-describedby` pointing at the error message).

Emit the hooks as the handoff table (pinned shape; see template section 5):

```
| Control/field | Keyboard keys (non-standard only) | Focus position (n of N in flow) | ARIA attrs required |
```

Rule: one row per control from the section-1 map; standard controls may say "native"; a section-1 control missing here is a gap, not an implied default.

This is a handoff table, not a compliance pass. `cfn-design` consumes it verbatim; unmatched values route back as producer defects.

### Phase 6: Low-Fidelity Wireframe (floored at every tier; the visual wrong-path catch)

Render this interaction design as a **low-fidelity, grayscale, self-contained HTML wireframe** and publish it with the **Artifact** tool, so the user SEES the screen structure and flow before the pipeline spends a single downstream level on it. This is the visual twin of the spec's §1b Interaction Intent walk: §1b confirms intent in words before the schema locks; the wireframe confirms structure in a picture before `cfn-design`, `cfn-test-plan`, `cfn-ops`, and `write-plan` build on it. You own it because you own the structure — the control map (Phase 1), the screen states (Phase 2), and the flows/journeys (Phase 3) ARE the wireframe. `cfn-design`'s visual layer (tokens, color, exact grid) is deliberately absent; low-fi is the point.

**Draw from what you already produced** — do not invent new structure here:
- One page per screen in the Phase 2 state list.
- Every control from the Phase 1 field→control map, placed in Phase 3 flow order, with the real field labels.
- The primary journey (Phase 3b) drawn between screens: a labeled arrow or a "→ goes to <screen>" note.
- The six screen states (Phase 2) shown compactly (tabs or stacked variants for loading / empty / error) so the user sees they were designed, not just the happy path.

**Low-fidelity is a hard contract (anti-scope-creep).** The wireframe communicates *structure and flow*, never appearance:
- Grayscale only. No brand colors, no design tokens, no gradients.
- No imagery, photos, icons-as-art, or logos. A box labeled `[image]` stands in.
- No pixel styling, shadows, or animation. Plain boxes, borders, real text, system font.
- The question it answers is "is this the right screen, the right controls, the right flow" — NOT "does it look good". Visual craft is `cfn-design` + `frontend-design` at their own stages, not here.

Emitting a colored, image-laden, or token-styled mockup is a Phase-6 defect (see Anti-Patterns): it drags the user into aesthetics when the decision on the table is structure, and it duplicates `cfn-design`.

**Publish + record.** Publish the HTML via the Artifact tool (one page, per-screen sections). Record the reference in the `## 6. Wireframe` section of the output artifact using this exact machine-detectable line:

```
wireframe: <artifact-url-or-path>
```

**Degrade, never block.** If the Artifact publish fails, write the same HTML to `planning/<slug>/wireframe_<slug>.html` and record `wireframe: planning/<slug>/wireframe_<slug>.html`. If there are zero renderable screens, record `_skipped: no renderable screens_` instead — that is not a defect. Never stall on wireframe production; the approval gate that CAN stall is the orchestrator's, not this phase's.

**Approval is the orchestrator's, at the L5→L6 barrier.** You emit the wireframe and return its reference as a BLOCKING item. `cfn-megaplan` surfaces Approve / Revise before spawning L6, so a wrong structure is caught before design/test-plan/ops run on it. On Revise, you are re-spawned in patch mode with the user's note — you adjust the structure (a control, a screen, a flow) and re-render. A revision that would change an FR, an AC, or the schema is not a wireframe tweak: it routes back to `cfn-spec`/`cfn-data`, not here.

## Output

**Artifact location.** Every artifact of one plan lives in that plan's own directory, `planning/<slug>/`. Under `/cfn-megaplan`, `/cfn-megaplan-lite`, or `/cfn-spa-plan` the orchestrator hands you the exact path plus a `Plan dir:` line — write there, and read the input paths it gives you verbatim. Invoked standalone, read with `$HOME/.claude/skills/cfn-megaplan/lib/plan-paths.sh resolve <slug> <basename>` (per-plan dir first, legacy flat `planning/` second) and write to `planning/<slug>/`. Never split one plan across two locations.

Write to: `planning/<slug>/UX_<slug>.md`

Template:
```markdown
# UX Interaction Design: <task>

**Date:** <YYYY-MM-DD>
**Spec:** planning/<slug>/SPEC_<slug>.md
**Data:** planning/<slug>/DATA_<slug>.md (or "inferred — no DATA artifact")
**Tier:** <mvp|beta|enterprise>   **Directive:** <full|light>
**Status:** draft | reviewed | locked

## 1. Field → Control Map
Input: DATA section 2 field-bindings table (8 columns). Consumer matches it byte-for-byte; unmatched binding tokens route back as cfn-data defects.
| Field | Binding (from DATA) | Control | Value source | Validation | Default | Autofocus | Validate-when | Help |

## 2. Screen States
### <screen-name>
| State | Renders |
(happy six; + edge states — session-expired / stale / timeout / offline — at full for mutating screens)

## 3a. Flows
| Task | Entry | Action | Result | Error path | Disabled-when |
Affordances: <clickable>, <disabled-when>

## 3b. Journeys  (multi-screen tasks)
### <journey-name>
steps + progress | forward/back | save+resume | entry/exit (route map: ARCH Step 3) | first-run/onboarding
Per-step rows in the 3a table: | Task | Entry | Action | Result | Error path | Disabled-when |

## 3c. Feedback & Undo
| Action | Success feedback | Destructive confirm? | Undo window |

## 3d. Role Visibility  (consumes ARCH Step 6 AuthZ)
| Affordance | Role | Hidden | Disabled (+reason) |

## 4. Analytics Events  (only if in extras)
| Event | Trigger | Properties |

## 5. Accessibility Hooks (handoff table - cfn-design consumes verbatim)
| Control/field | Keyboard keys (non-standard only) | Focus position (n of N in flow) | ARIA attrs required |
| course (combobox) | ArrowUp/Down, Enter, Esc | 1 of 9 | role=combobox, aria-expanded, aria-controls |
(one row per control from the section-1 map; standard controls may say "native"; a section-1 control missing here is a gap, not an implied default. Consumer matches this table byte-for-byte; unmatched values route back as producer defects.)

## 6. Wireframe
wireframe: <artifact-url-or-path>
(exact machine-detectable line; or `_skipped: no renderable screens_`. Low-fi grayscale, one page per screen, drawn from sections 1-3. Orchestrator surfaces Approve/Revise at the L5→L6 barrier before design/test-plan/ops run.)

## Open Items
- [OPEN] <decisions needing user input>
```

### Output example: course booking form

This example directly illustrates the bug this phase prevents. The `course` field is backed by a `courses` table, so it is a dropdown, never a text input.

**1. Field → Control Map** (all 9 template columns; one fully-populated row per binding kind where feasible)

| Field | Binding (from DATA) | Control | Value source | Validation | Default | Autofocus | Validate-when | Help |
|---|---|---|---|---|---|---|---|---|
| course | FK → `public.courses` (12 rows) | select | `SELECT id, name FROM courses WHERE active` | value ∈ courses | empty | yes (sole autofocus) | on-change (gates rest of form) | none |
| instructor | FK → `public.instructors` (40 rows) | combobox + search | `SELECT id, name FROM instructors` | value ∈ instructors | empty | no | on-blur | none |
| session_date | date | date picker | — | within course schedule window | empty | no | on-blur | "sessions run within the course schedule window" |
| skill_level | enum (beginner/intermediate/advanced) | radio group (3) | enum `skill_level` | value ∈ enum | beginner | no | on-change | none |
| send_reminder | boolean | toggle (takes effect immediately) | — | — | off | no | on-change | none |
| seats | numeric range 1-8 | stepper (bounded, <=20 steps) | course.capacity | 1 ≤ n ≤ capacity | 1 | no | on-change | "1 to course capacity" |
| notes | free-text (<=500 chars, multi-sentence) | textarea | — | ≤ 500 chars | empty | no | on-blur | "max 500 chars" |
| add_ons | multi-FK → `public.add_ons` | chip multiselect | `SELECT id, name FROM add_ons` | each ∈ add_ons | none selected | no | on-change | none |

The `course` row is the whole point: a planner who wrote "course: text input" would have shipped the bug. The binding forces `select`. (`lookup` and `timestamp` bindings do not occur on this form; when present they get the same fully-populated row.)

**2. Screen States — Booking Form**

| State | Renders |
|---|---|
| loading | skeleton form; course/instructor selects show spinner while options fetch |
| empty | if no active courses: "No courses available" + disabled Submit |
| error | options fetch failed: inline error banner + Retry button; form inputs disabled |
| success | populated form, all controls interactive, Submit enabled when valid |
| partial | courses loaded but add-ons failed: form usable, add-ons section shows its own retry |
| disabled | Submit disabled until course selected, date in window, seats ≤ capacity |

**3. Flow — Book a course** (task-flow table)

| Task | Entry | Action | Result | Error path | Disabled-when |
|---|---|---|---|---|---|
| Book a course | open booking form | select course, pick date, set seats, Submit | booking created, confirmation shown | submit fails: keep form state, show error banner, re-enable Submit for retry | Submit: no course OR date outside window OR seats > capacity |

Affordances: course/instructor/date/seats interactive; Submit disabled-when (no course OR date outside window OR seats > capacity).

## Handoff

`UX_<slug>.md` feeds three consumers plus the orchestrator gate:
- **`cfn-design`** (level 6) — consumes the control list and a11y hooks to design visual layout and run the full WCAG pass.
- **`cfn-test-plan`** (level 6) — turns the field-control map and state table into UI test rows.
- **Bar B** (`bars/haiku-executable.md`) — reads the control column to verify every field has an explicit, non-guessable control with a named value source.
- **`cfn-megaplan` L5→L6 barrier** — reads the `## 6. Wireframe` reference and surfaces one BLOCKING Approve/Revise decision before spawning L6, so a wrong structure never reaches design/test-plan/ops. Revise re-spawns this phase in patch mode.

## Return (to orchestrator)

Return exactly:
- Artifact path: `planning/<slug>/UX_<slug>.md`
- A 3-line summary (fields mapped, screens with full state coverage, flows mapped).
- The wireframe reference (`wireframe: <url|path>`, or `_skipped: no renderable screens_`), flagged as a BLOCKING approval item so the orchestrator gates on it at the L5→L6 barrier.
- Any `[OPEN]` items needing a user decision (e.g. ambiguous binding, missing value source).

## Review Mode (audit implemented code)

Invoked as `cfn-ux --review <path-to-ui-component(s)>` (optionally `--data planning/<slug>/DATA_<slug>.md` or `--schema <migration|model>`). Runs the affordance map BACKWARD: instead of deriving controls from a data model to write a spec, it reads shipped UI, recovers each field's real control + real binding, and flags every mismatch. This is the post-hoc catch for the dropdown-as-textbox bug that already shipped.

No planning artifacts required here. Code is the input.

### Steps

1. **Enumerate fields.** Parse the target form / screen. For every user-editable field emit: `file:line`, field name, **rendered control** (`<input type=text>`, `<select>`, `<textarea>`, checkbox, date-picker, etc.).
2. **Recover the real binding.** For each field, determine what it is actually backed by — read it, do not guess:
   - prefer `--data` / `--schema`: the field-bindings table or the migration/ORM model gives FK / enum / lookup / boolean / date / timestamp / free-text / numeric / multi-FK directly.
   - else infer from the column the field writes (FK name `*_id` referencing a table, a CHECK/enum constraint, a `bool`/`timestamptz` type) and from the submit handler.
   - if binding cannot be established, mark the field `binding-unknown` (a finding in itself — the code is ambiguous).
3. **Apply the affordance map** (same table as forward mode) → expected control.
4. **Diff.** rendered vs expected. Every mismatch = finding. The load-bearing one: **FK / lookup / enum field rendered as a free-text `<input>`.**
5. **State audit.** Does the component handle loading / empty / error / disabled for any async-backed control? Each missing state = finding.
6. **Flow audit.** Error path rendered on submit failure? Disable conditions wired (submit gated until a required select is chosen)? Missing = finding.

### Output

Write `planning/<slug>/AUDIT_UX_<slug>.md`. Findings table — each row verifiable against the cited line:

```
| file:line | field | rendered | expected | binding | severity | fix |
|-----------|-------|----------|----------|---------|----------|-----|
| BookingForm.tsx:42 | course | <input type=text> | <select> | FK -> public.courses | HIGH | replace with select sourced from courses |
| BookingForm.tsx:55 | status | <input> | radio/select | enum(active,closed) | HIGH | enum -> select |
| BookingForm.tsx:- | (form) | no error state | error banner on submit fail | - | MED | add error path |
```

Severity: HIGH = wrong control on a constrained field (invalid data enterable) or missing error path; MED = missing non-error state; LOW = suboptimal control (raw select where >20 rows wants type-ahead). Empty findings table = PASS, state it explicitly.

Pairs with `cfn-data --review`: run that first so bindings come from the real schema, not inference. The reverse trio for shipped work is `cfn-data --review` -> `cfn-ux --review` -> `cfn-arch --review`.

## Anti-Patterns

- **Free-text input for a DB-backed field.** The bug this phase exists to kill. An FK / lookup field is always a select or combobox sourced from the table — never a text box.
- **Defaulting an unbound field to free text.** A field with no binding is `[OPEN]`, not a text input.
- **Happy-state-only screens.** Shipping a screen with only the success state. Loading, empty, and error are mandatory for any data-fetching screen.
- **Flows with no error path.** A flow that maps only entry → action → success and ignores failure.
- **Naming a control with no value source.** A select whose options have no named table / enum / constant. Bar B rejects it.
- **Raw select for a large list.** >20 rows needs a searchable combobox, not an unfiltered select.
- **Doing visual design here.** Layout, color, spacing, tokens belong to `cfn-design`. This phase decides control and state, not appearance.
- **Dropping the affordance map under `light`.** `light` reduces breadth, never the field-control map. The map floors at MVP.
- **High-fidelity wireframe (Phase 6).** A colored, brand-styled, image-laden, or token-accurate mockup. The wireframe is low-fi grayscale structure + flow only; fidelity drags the user into aesthetics when the decision is "is this the right screen and flow", and it duplicates `cfn-design`.
- **Inventing structure in the wireframe.** The wireframe draws ONLY the screens, controls, and flows from Phases 1-3. A screen or control that appears in the wireframe but not the tables is a defect — fix the table, then re-render.

## Related

- Upstream: `cfn-data` (provides field bindings — the source of truth for control derivation), `cfn-spec` (screens + tasks).
- Downstream: `cfn-design` (visual layout, full a11y audit, consumes control list + a11y hooks), `cfn-test-plan`.
- Gate: `bars/haiku-executable.md` (consumes the field-control map; rejects guessable controls).
- Orchestrator: `cfn-megaplan` (spawns this phase at DAG level 5, conditional on `frontend`).
- Backlog + design rationale: `docs/PLANNING_PIPELINE_GAPS.md` (gaps G03, G26; affordance map).
