---
name: cfn-ux
description: "MUST BE USED for the interaction-design phase of any frontend build. Derives every UI control from its data binding (field-to-control derivation), enumerates UI states, and maps user flows. Kills the dropdown-as-textbox bug — the class of error where a planner specs a free-text input for a field actually backed by a database list. Use after cfn-data, before cfn-design."
version: 1.0.0
tags: [planning, ux, interaction-design, affordance, controls, states, flows, frontend]
status: production
---

# CFN UX Skill (MegaPlan Phase, DAG Level 5)

**Purpose:** Turn the data model into interaction design. For every field, derive the correct control from its binding so the implementer cannot guess. For every screen, enumerate all states so nothing ships happy-state-only. For every task, map the flow including the error path. This phase exists to kill one class of bug: a free-text input wired to a field that is actually backed by a database list (should be a dropdown). The affordance map is the deterministic core — it removes the judgment call.

**Phase:** UX interaction design. MegaPlan DAG level 5 (runs parallel with `cfn-arch`). Conditional on the `frontend` build flag. Agent type: `ui-designer`.

**Scope boundary:** Interaction correctness, not visual polish. Layout, spacing, color, tokens, full WCAG audit belong to `cfn-design` downstream. This phase decides *what control* and *what states*, not *how it looks*. It floors at MVP because the dropdown bug is a correctness defect, not a polish defect.

## When to Use

- Auto-invoked by `cfn-megaplan` at level 5 when the `frontend` build flag is true.
- After `cfn-spec` and (when present) `cfn-data` artifacts exist.
- Standalone when adding any new form, screen, or user-facing surface to an existing system.

Skip only for: backend-only changes, CLI-only tools, or tasks with no user-facing surface.

## Input

Required:
- `planning/SPEC_<slug>.md` — the screens, tasks, and acceptance criteria.

Optional but authoritative when present:
- `planning/DATA_<slug>.md` — the data phase. Gives the field bindings: which fields are FK / enum / lookup / boolean / date / free-text / numeric / multi-select. This is the source of truth for control derivation. If it exists, you do not guess bindings — you read them.

If `DATA_<slug>.md` is absent (no `db` flag), infer bindings from SPEC and mark each inferred binding `[OPEN]` for user confirmation. Never silently assume a field is free-text.

From the orchestrator you also receive:
- **Tier** — `mvp` | `beta` | `enterprise`.
- **Directive** — `full` | `light`.
- **Include extras** — e.g. `analytics_events`.
- **Omit** — drops listed by the profile.

### Directive scope (`light` vs `full`)

- **`light` (mvp):** interaction correctness only. Emit the field-control table (Phase 1), the state table (Phase 2), and the core flows (Phase 3). Skip polish: no micro-interaction notes, no exhaustive empty-state copy, no secondary flows. Every field still gets a derived control; every screen still gets all six states named. Correctness never drops.
- **`full` (beta / enterprise):** all phases. Add analytics events (Phase 4, when in extras), full accessibility hooks (Phase 5), secondary and recovery flows, and partial-state detail.

`light` reduces breadth, never the affordance map. The map is the reason this phase floors at MVP.

## Protocol

### Phase 1: Field → Control Derivation (the deterministic core)

This is the payload that kills the dropdown bug. For EVERY field in the data model, read its binding from `DATA_<slug>.md` and emit a row. The control is not a choice — it falls out of the binding via this map:

| Field binding | Control | Validation |
|---|---|---|
| FK / lookup table | select / combobox (combobox with search if >20 rows) | value ∈ table |
| enum | select, or radio group if ≤4 options | value ∈ enum |
| boolean | toggle / checkbox | — |
| date / timestamp | date picker | range / min-max |
| free text | input (short) / textarea (long) | length, pattern |
| numeric range | stepper / slider | min / max, step |
| multi-select FK | tag / chip multiselect | each value ∈ table |

Rules:
- **A field bound to an FK or lookup table is NEVER a free-text input.** It is a select or searchable combobox sourced from that table. This is the single rule the bug violates.
- Every row names the **value source** (which table, enum, or constant supplies the options). Bar B rejects any control whose options have no named source.
- `>20 rows` → combobox with type-ahead search, not a raw select (usability + render cost).
- The output table is consumed directly by Bar B (`bars/haiku-executable.md`). A haiku-level implementer reads the control column and builds it. No interpretation allowed.

Emit one row per field. No field is exempt. A field with no binding listed is an `[OPEN]` item, not a free-text default.

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

### Phase 3: User Flow Mapping

For each task in the spec, map: **entry → action → result → error path.** Name the affordances explicitly:

- What is clickable (buttons, links, rows).
- What is disabled and the exact condition that disables it (e.g. "Submit disabled until course selected and date in range").
- The error path: what the user sees and can do when the action fails. A flow with no error path fails this phase.

Cover the primary flow for every task. Under `full`, also map secondary flows (edit, delete, cancel) and the recovery flow (what the user does after an error).

### Phase 4: Analytics / Telemetry Events (extra — gap G26, only when in extras)

When `analytics_events` is in the orchestrator's extras list, name the user events to track. One row per event: event name, trigger (which affordance / state transition fires it), and the properties captured. Example: `course_selected | onChange of course combobox | {course_id, source: 'booking_form'}`. Omit this phase entirely when not in extras.

### Phase 5: Accessibility Hooks (interaction-level only)

Flag the interaction-level a11y obligations and hand them to `cfn-design` (which owns the full WCAG audit). You name, you do not audit:

- **Keyboard:** every affordance reachable and operable by keyboard; named keys for non-standard controls (e.g. combobox arrow-key navigation).
- **Focus order:** the focus sequence through each flow (entry field → ... → submit). Focus must follow the visual / logical order of the flow.
- **ARIA hooks:** roles / labels the control type implies (combobox needs `role=combobox` + `aria-expanded`; error state needs `aria-invalid` + `aria-describedby` pointing at the error message).

This is a handoff list, not a compliance pass. `cfn-design` consumes it.

## Output

Write to: `planning/UX_<slug>.md`

Template:
```markdown
# UX Interaction Design: <task>

**Date:** <YYYY-MM-DD>
**Spec:** planning/SPEC_<slug>.md
**Data:** planning/DATA_<slug>.md (or "inferred — no DATA artifact")
**Tier:** <mvp|beta|enterprise>   **Directive:** <full|light>
**Status:** draft | reviewed | locked

## 1. Field → Control Map
| Field | Binding (from DATA) | Control | Value source | Validation |

## 2. Screen States
### <screen-name>
| State | Renders |

## 3. User Flows
### <task-name>
entry -> action -> result -> error path
Affordances: <clickable>, <disabled-when>

## 4. Analytics Events  (only if in extras)
| Event | Trigger | Properties |

## 5. Accessibility Hooks (handoff to cfn-design)
- Keyboard / focus order / ARIA per flow

## Open Items
- [OPEN] <decisions needing user input>
```

### Output example: course booking form

This example directly illustrates the bug this phase prevents. The `course` field is backed by a `courses` table, so it is a dropdown, never a text input.

**1. Field → Control Map**

| Field | Binding (from DATA) | Control | Value source | Validation |
|---|---|---|---|---|
| course | FK → `public.courses` (12 rows) | select | `SELECT id, name FROM courses WHERE active` | value ∈ courses |
| instructor | FK → `public.instructors` (40 rows) | combobox + search | `SELECT id, name FROM instructors` | value ∈ instructors |
| session_date | date | date picker | — | within course schedule window |
| skill_level | enum (beginner/intermediate/advanced) | radio group (3) | enum `skill_level` | value ∈ enum |
| send_reminder | boolean | toggle | — | — |
| seats | numeric range 1-8 | stepper | course.capacity | 1 ≤ n ≤ capacity |
| notes | free text | textarea | — | ≤ 500 chars |
| add_ons | multi-select FK → `public.add_ons` | chip multiselect | `SELECT id, name FROM add_ons` | each ∈ add_ons |

The `course` row is the whole point: a planner who wrote "course: text input" would have shipped the bug. The binding forces `select`.

**2. Screen States — Booking Form**

| State | Renders |
|---|---|
| loading | skeleton form; course/instructor selects show spinner while options fetch |
| empty | if no active courses: "No courses available" + disabled Submit |
| error | options fetch failed: inline error banner + Retry button; form inputs disabled |
| success | populated form, all controls interactive, Submit enabled when valid |
| partial | courses loaded but add-ons failed: form usable, add-ons section shows its own retry |
| disabled | Submit disabled until course selected, date in window, seats ≤ capacity |

**3. Flow — Book a course**

entry (open booking form) → action (select course, pick date, set seats, Submit) → result (booking created, confirmation shown) → error path (submit fails: keep form state, show error banner, re-enable Submit for retry).
Affordances: course/instructor/date/seats interactive; Submit disabled-when (no course OR date outside window OR seats > capacity).

## Handoff

`UX_<slug>.md` feeds three consumers:
- **`cfn-design`** (level 6) — consumes the control list and a11y hooks to design visual layout and run the full WCAG pass.
- **`cfn-test-plan`** (level 6) — turns the field-control map and state table into UI test rows.
- **Bar B** (`bars/haiku-executable.md`) — reads the control column to verify every field has an explicit, non-guessable control with a named value source.

## Return (to orchestrator)

Return exactly:
- Artifact path: `planning/UX_<slug>.md`
- A 3-line summary (fields mapped, screens with full state coverage, flows mapped).
- Any `[OPEN]` items needing a user decision (e.g. ambiguous binding, missing value source).

## Anti-Patterns

- **Free-text input for a DB-backed field.** The bug this phase exists to kill. An FK / lookup field is always a select or combobox sourced from the table — never a text box.
- **Defaulting an unbound field to free text.** A field with no binding is `[OPEN]`, not a text input.
- **Happy-state-only screens.** Shipping a screen with only the success state. Loading, empty, and error are mandatory for any data-fetching screen.
- **Flows with no error path.** A flow that maps only entry → action → success and ignores failure.
- **Naming a control with no value source.** A select whose options have no named table / enum / constant. Bar B rejects it.
- **Raw select for a large list.** >20 rows needs a searchable combobox, not an unfiltered select.
- **Doing visual design here.** Layout, color, spacing, tokens belong to `cfn-design`. This phase decides control and state, not appearance.
- **Dropping the affordance map under `light`.** `light` reduces breadth, never the field-control map. The map floors at MVP.

## Related

- Upstream: `cfn-data` (provides field bindings — the source of truth for control derivation), `cfn-spec` (screens + tasks).
- Downstream: `cfn-design` (visual layout, full a11y audit, consumes control list + a11y hooks), `cfn-test-plan`.
- Gate: `bars/haiku-executable.md` (consumes the field-control map; rejects guessable controls).
- Orchestrator: `cfn-megaplan` (spawns this phase at DAG level 5, conditional on `frontend`).
- Backlog + design rationale: `docs/PLANNING_PIPELINE_GAPS.md` (gaps G03, G26; affordance map).
