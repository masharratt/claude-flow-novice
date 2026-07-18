# Specification: wireframe deliverable + approval gate in cfn-design (megaplan)

**Date:** 2026-07-17
**Author:** spec phase (cfn-spec)
**Status:** draft

## Context / subject

This spec covers a **pipeline change**, not an app feature. It edits CFN skill infra:
- `.claude/skills/cfn-ux/SKILL.md` — add a low-fi wireframe phase (Phase 6) + `## 6. Wireframe` output + return contract. cfn-ux owns it because it owns the structure the wireframe draws (control map, screen states, flows).
- `.claude/skills/cfn-megaplan/SKILL.md` — a BLOCKING wireframe Approve/Revise gate at the L5→L6 barrier (before design/test-plan/ops run).

The wireframe renders a frontend, but the artifact under change is prose + a machine-checkable contract. Hence build flags below are `frontend=no, db=no`. Profiles are NOT changed: the wireframe is floored intrinsic to cfn-ux Phase 6, not a tier-varied extra.

**Design decision (why cfn-ux L5, not cfn-design L6):** the wireframe is ~90% cfn-ux output (screens, controls, flows) and deliberately excludes cfn-design's visual layer (tokens, color, grid). Producing + approving it at L5, before L6, catches a wrong screen structure for the cost of a cfn-ux patch instead of re-running L6–L9. Approving it late (Step 7) would mean design/test-plan/ops/write-plan/plan-review already built on a structure the user then rejects. The L5 blocking gate mirrors the existing rule that spec §1b intent items block before L4 ("a structure decision after the schema locks is a migration, not an edit").

## 1. Functional Requirements

FR-1 [core]: `cfn-ux` SHALL emit a low-fidelity wireframe deliverable — one self-contained grayscale HTML page per screen in its Phase 2 state list, rendering the Phase 1 control map placed in Phase 3 flow order — published via the Artifact tool, WHEN the `frontend` build flag is true, GIVEN the cfn-ux control map, screen states, and flows exist.

FR-2 [core]: `cfn-ux` SHALL record the published wireframe reference (Artifact URL, or fallback file path) in a fixed `## 6. Wireframe` section of `UX_<slug>.md`, in a machine-detectable line format (`wireframe: <url|path>`). (runtime signal: the `## 6. Wireframe` section line)

FR-3: `cfn-ux` SHALL produce the wireframe for EVERY frontend build regardless of tier, including `mvp`. The wireframe is floored (not tier-scaled) for the same reason as cfn-ux's affordance map: catching a wrong path is a correctness defect at any tier. At mvp the wireframe stays low-fi (the only mode).

FR-4 [core]: `cfn-megaplan` SHALL surface wireframe approval as a BLOCKING decision (options: Approve / Revise) at the L5→L6 barrier — after `cfn-ux` (L5) returns, BEFORE spawning L6 (design ∥ ops) — WHEN a wireframe reference exists in `UX_<slug>.md`. (runtime signal: an `AskUserQuestion` for the wireframe at the L5 join; approval recorded to the decision log)

FR-5: On **Revise**, `cfn-megaplan` SHALL loop `cfn-ux` in PATCH mode with the user's revision note as the finding, then re-surface the updated wireframe; on **Approve**, SHALL proceed to L6. Revise rounds ride the existing per-level 3-BLOCKING-cycle bound. A revision that would change an FR, AC, or the schema routes to `cfn-spec`/`cfn-data` (re-run affected levels), NOT a cfn-ux patch.

FR-6: The wireframe SHALL be low-fidelity by contract — grayscale only, structure + real field labels + flow/navigation only; NO brand colors, NO imagery/photos, NO pixel-level styling, NO design-token values. Enforced by the skill instructions and named as an anti-pattern.

FR-7: WHEN the `frontend` flag is false, no wireframe is produced and no gate fires. The wireframe rides cfn-ux's existing `frontend` condition; no new orchestrator condition is added.

FR-8: The wireframe SHALL be approved BEFORE Bar A / Bar B / write-plan run (it gates at L5, they run at L8/L9). Because approval precedes the plan's existence, a wireframe never triggers a bar re-gate. A revision that would touch an FR/AC/schema is out of scope for the wireframe path (FR-5) and re-runs its owning phase's levels normally.

## 2. Non-Functional Requirements

NFR-1: Wireframe generation adds no new hard dependency — self-contained HTML via the existing Artifact tool; no chart/render library, no external asset fetch (Artifact CSP forbids it anyway).

NFR-2: The `## 6. Wireframe` presence check is a static grep-able assertion (single defined line format), decidable with zero human judgment — same class as the existing `check-verifiable-static.sh` scans.

NFR-3: A failed Artifact publish SHALL degrade, not block: write the wireframe HTML to `planning/wireframe_<slug>.html` and record that path in `## 7. Wireframe`. The pipeline never stalls on publish failure.

## 3. Acceptance Criteria

Scenario: frontend build gates on the wireframe before L6
  Given a megaplan run with build flag frontend=yes (any tier)
  When cfn-ux (L5) completes
  Then UX_<slug>.md contains a `## 6. Wireframe` section with a line matching `wireframe: <url-or-path>`
  And the referenced HTML is self-contained (no external http(s) asset references)
  And the orchestrator surfaces one AskUserQuestion (Approve / Revise) at the L5→L6 barrier
  And L6 (design ∥ ops) is not spawned until the wireframe is Approved

Scenario: mvp build also gates on a wireframe (floored across tiers)
  Given a megaplan run with tier=mvp and frontend=yes
  When cfn-ux completes
  Then UX_<slug>.md contains a `## 6. Wireframe` section with a `wireframe: <url-or-path>` line
  And the wireframe is low-fi grayscale (identical fidelity mode to beta/enterprise)
  And the L5→L6 Approve/Revise gate fires like any other tier

Scenario: Revise loops cfn-ux in patch mode, no downstream rework
  Given a produced wireframe and a user who selects Revise with note "move the filter bar above the table"
  When the orchestrator processes the decision at the L5 barrier
  Then cfn-ux is spawned in PATCH mode with that note as the sole finding
  And L6 has NOT been spawned yet (so design/test-plan/ops did no work on the old structure)
  And an updated wireframe reference replaces the prior line in UX_<slug>.md
  And no Bar A / Bar B run is involved (they are L8/L9, after this gate)

Scenario: backend-only build never produces a wireframe
  Given build flags frontend=no
  When the megaplan DAG runs
  Then cfn-ux is not spawned at all (existing frontend condition)
  And no wireframe reference exists and no L5→L6 wireframe gate fires

## 4. Edge Cases

| Category | EC | Stresses | Expected behavior |
| Empty inputs | EC-1: cfn-ux has zero screens / no interactive fields | FR-1 | no wireframe produced; `## 6. Wireframe` records `_skipped: no renderable screens_`; not a defect; no L5 gate fires |
| Boundary values | EC-2: single screen vs many screens in the UX state list | FR-1 | one grayscale page per screen; all screens in the state list covered; a screen omitted from the wireframe fails the presence check |
| Concurrency | N/A: planning phase, single orchestrator, no shared mutable runtime state | - | - |
| Failure modes | EC-3: Artifact publish call fails | FR-2, NFR-3 | degrade to `planning/wireframe_<slug>.html`, record that path in `## 6. Wireframe`, pipeline continues; no stall |
| Auth/permission | N/A: no auth surface in a planning-phase doc edit | - | - |
| Data quality | EC-4: cfn-ux emits a full-color, pixel-perfect, token-styled mockup (scope creep) | FR-6 | violates the low-fi contract; the skill's low-fi rule + Phase-6 anti-pattern instruct grayscale/structure-only; a colored/imagery wireframe is a producer defect surfaced back to the phase |
| State transitions | EC-5: user keeps selecting Revise past the bound | FR-5 | L5 per-level BLOCKING cycles capped at 3 (existing rule); after that, surface residual via AskUserQuestion (accept as-is / keep iterating / descope) — no infinite loop |
| Time | N/A: wireframe is structural, no time-dependent behavior | - | - |
| Locale/i18n | N/A: low-fi wireframe uses placeholder/label text; localization is cfn-design Phase 4 (enterprise extra), not the wireframe's job | - | - |
| Resource limits | EC-6: very large screen count (e.g. 20+ screens) | FR-1 | still one Artifact (multi-section, scrollable); if the page would be unwieldy, cap and `log()` the omitted screens rather than silently truncating |

## 5. Pre/Post Conditions

Operation: produce-wireframe (cfn-ux Phase 6, when frontend=yes, every tier)
  Preconditions: cfn-ux control map (Phase 1), screen states (Phase 2), flows (Phase 3) exist with >=1 screen
  Postconditions (success): a self-contained grayscale wireframe published (or fallback file written); `## 6. Wireframe` section in UX_<slug>.md carries `wireframe: <url|path>`
  Postconditions (failure): publish failure degrades to fallback file (NFR-3); zero-screen input records `_skipped_` — neither state blocks the pipeline
  Invariants: the wireframe draws only structure from Phases 1-3; it introduces no new screen/control not in those tables

Operation: wireframe-approval (cfn-megaplan L5→L6 barrier)
  Preconditions: `## 6. Wireframe` reference exists in UX_<slug>.md; L5 has joined; L6 not yet spawned
  Postconditions (success/Approve): approval logged; L6 (design ∥ ops) spawned
  Postconditions (Revise): cfn-ux patched with the note; updated reference replaces the prior line; L6 still not spawned; bound = 3 per-level cycles
  Invariants: no downstream level (L6+) runs on an unapproved structure; the gate precedes Bar A/Bar B entirely (FR-8)

## 6. Out of Scope

- High-fidelity / interactive / clickable prototypes. Low-fi static structure only.
- Design-token-accurate or brand-accurate rendering (that is build-time `frontend-design` craft, not planning).
- A separate new phase or new DAG level. The wireframe is a cfn-ux deliverable, not a new node.
- A new orchestrator build-flag condition. It rides the existing `frontend` gate.
- Auto-applying the wireframe to implementation. It informs the plan; it is not consumed as code.
- Wireframing for `cfn-design` / any phase other than `cfn-ux` (cfn-ux owns structure; cfn-design owns visual, which the low-fi wireframe deliberately excludes).
- Profile changes. Floored intrinsic to the skill, not a tier-varied extra.

## 7. Open Questions

- Q-1: [RESOLVED: floored at all tiers including mvp] tier gating of the wireframe. User chose all-tiers-on. Wireframe is a correctness-adjacent floor (wrong-path catch), not tier-scaled visual polish, so it does not drop at mvp.
- Q-2: [PARKED: Approve/Revise two-option gate] whether to add a third "Skip/defer" option at the L5 barrier. Default keeps it binary; Skip is already expressible by Approve-without-change.

## 8. Build Flags
- frontend: no
- db: no
- pii: no
- unknowns: no
- tier-hint: beta
