---
name: cfn-design
description: "Visual / layout / design-system / accessibility / i18n + external API-contract design phase. Layers on cfn-ux: cfn-ux decides which control a field gets and its states/flows; cfn-design decides how it LOOKS, the layout, design-system reuse (DRY for components + tokens), full accessibility, localization, and the shared API contract the UI calls. Use after cfn-ux when the build has a frontend."
version: 1.0.0
tags: [planning, design, visual, layout, design-system, accessibility, a11y, i18n, api-contract, frontend, megaplan]
status: production
---

# CFN Design Skill (MegaPlan Phase, DAG Level 6)

**Purpose:** Take the interaction design from `cfn-ux` (which control, which states, which flows) and design how it LOOKS and how it talks to its backend. Five jobs: reuse the design system instead of inventing components (DRY), specify layout + visual hierarchy per screen, make it accessible, make it localizable, and lock the external API contract as a single source of truth so the UI and the service cannot drift apart.

**Phase:** Visual + system design. MegaPlan DAG level 6 (runs parallel with `cfn-test-plan` and `cfn-ops`). Conditional on the `frontend` build flag. Agent type: `ui-designer`.

**Scope boundary (vs cfn-ux):** `cfn-ux` owns interaction correctness: the field-to-control map, the six screen states, the user flows. It floors at MVP because the dropdown bug is a correctness defect. `cfn-design` owns appearance, layout, design-system reuse, full a11y, i18n, and the API contract shape. It scales DOWN by tier because visual polish, full WCAG, and localization are enrichment, not correctness. This phase never re-decides a control type. It reads the control list from `UX_<slug>.md` and dresses it.

**Relationship to `frontend-design` (DRY):** The `frontend-design` plugin skill owns the craft of generating distinctive, production-grade frontend code that avoids generic AI aesthetics. `cfn-design` is the PLANNING artifact, not the generator. It produces the layout + token + a11y + contract spec; the implementer (and `frontend-design` at build time) consumes that spec. Do not duplicate `frontend-design`'s visual-quality guidance here. Reference it: "implement per `frontend-design` craft against the tokens in this artifact."

## When to Use

- Auto-invoked by `cfn-megaplan` at level 6 when the `frontend` build flag is true.
- After `cfn-ux` (required), `cfn-spec`, and `cfn-arch` artifacts exist.
- Standalone when restyling a screen, adding a design-system component, or locking an external API contract a UI consumes.

Skip only for: backend-only changes, CLI tools, or any surface with no visual output.

## Input

Required:
- `planning/UX_<slug>.md` — the interaction design. You build on its field-to-control map, screen state table, flows, and a11y hooks. Refuse to run without it: there is nothing to dress.

Authoritative when present:
- `planning/SPEC_<slug>.md` — screens, acceptance criteria, brand / audience constraints.
- `planning/ARCH_<slug>.md` — internal component boundaries and any external integration declared there. The API contract you design here extends ARCH's external-integration section outward to the wire shape the UI calls.

From the orchestrator you also receive:
- **Tier** — `mvp` | `beta` | `enterprise`.
- **Directive** — `full` | `light`.
- **Include extras** — e.g. `i18n`.
- **Omit** — drops listed by the profile (e.g. `i18n`, `a11y_full`).

### Directive scope (`light` vs `full`)

- **`light` (mvp):** functional layout only. Emit the reuse audit (Phase 1), a functional layout + token reference per screen (Phase 2), and basic accessibility only: keyboard reachability + visible labels (the operable subset of Phase 3). Drop full WCAG (contrast ratios, ARIA depth, screen-reader matrix) and drop i18n entirely. Still design the API contract (Phase 5) at full depth: a drifting contract is a correctness defect, not polish, so it does not scale down.
- **`full` (beta):** all phases except i18n. Full visual spec, full WCAG AA accessibility, full API contract. `i18n` dropped unless in extras.
- **`full` + `i18n` extra (enterprise):** adds Phase 4 (i18n / localization / timezones) and wires `accessibility-advocate-persona` for the full WCAG audit.

The API contract (Phase 5) never drops by tier. Like `cfn-ux`'s affordance map, it is a correctness floor inside a phase that otherwise scales.

## Protocol

### Phase 1: Design-System Reuse Audit (gap G15, DRY)

Before specifying ANY new component or token, query the codebase for what already exists. Same build ladder as `cfn-arch`: reuse > extend > new. The most common waste is rebuilding a button, modal, or color token that already lives in the system.

For every control in the `UX_<slug>.md` field-to-control map, and every layout primitive a screen needs, run `/codebase-search "<component / token name>"` (design system, component library, theme / token file). Categorize:

- **REUSE:** the component or token already exists. Document the path. Use it as-is.
- **EXTEND:** an existing component covers ~80%; a small variant or prop is needed. Document the extension point.
- **NEW:** nothing exists. Justify why no existing component fits before adding one.

Output table:
```
| Element            | Disposition | Existing Path                       | Notes                    |
|--------------------|-------------|-------------------------------------|--------------------------|
| <Select>           | REUSE       | src/ui/components/Select.tsx        | Use for course/instructor|
| <Stepper>          | EXTEND      | src/ui/components/NumberInput.tsx   | Add min/max + step props |
| <SeatGridPreview>  | NEW         | -                                   | No grid-preview exists   |
| color.brand.500    | REUSE       | src/ui/tokens/color.ts              | Primary action color     |
```

Report reuse / extend / new counts (same as the `cfn-arch` DRY audit). If `NEW` exceeds 30% of elements, pause: either the design system is thin or the reuse search was insufficient. A new component when one exists is the top anti-pattern of this phase.

### Phase 2: Layout + Visual Spec

For each screen in the `UX_<slug>.md` state list, specify how it is laid out and styled. Pull every value from the design system named in Phase 1. Never hardcode a color, spacing, or font size: reference the token.

Per screen, name:
- **Layout structure:** the region map (header / form / sidebar / footer), the grid or stack, and how controls from the UX control map are placed within it.
- **Spacing:** section gaps and control padding, referenced as spacing tokens (`space.4`, not `16px`).
- **Visual hierarchy:** what is primary (the main action), secondary, and tertiary. Size, weight, and color tokens that express the hierarchy.
- **Design tokens:** the color, type, and spacing tokens used, each by name from the token source in Phase 1. Hardcoded hex / px is a Phase 1 violation surfaced here.
- **Responsive breakpoints:** how the layout reflows at each breakpoint (mobile / tablet / desktop). Name what stacks, hides, or reflows. Reference breakpoint tokens.

The six UX states (loading / empty / error / success / partial / disabled) each need a visual treatment, not just a control treatment: the skeleton shape for loading, the empty illustration / copy slot, the error banner styling, the disabled token. `cfn-ux` named what renders in each state; you name how it looks.

### Phase 3: Accessibility (gap, scales by tier)

`cfn-ux` handed you interaction-level a11y hooks (keyboard, focus order, ARIA roles per control). Here you turn them into concrete WCAG obligations. Depth scales by tier:

- **`light` (mvp):** the operable floor only. Every affordance reachable and operable by keyboard. Every input has a visible, associated label. Focus is never trapped. That is the whole MVP a11y bar. No contrast math, no full ARIA matrix.
- **`full` (beta / enterprise):** full WCAG AA:
  - **Contrast:** every text / background pair meets AA (4.5:1 body, 3:1 large text / UI components). State the ratio against the chosen tokens.
  - **Focus order:** the tab sequence through each flow follows the visual / logical order from `cfn-ux`. Visible focus indicator on every interactive element.
  - **ARIA roles + labels:** the roles the control type implies, made concrete (combobox: `role=combobox` + `aria-expanded` + `aria-controls`; error state: `aria-invalid` + `aria-describedby` pointing at the message id).
  - **Keyboard nav:** named keys for non-standard controls (combobox arrow / enter / escape; stepper arrow up/down).
  - **Screen-reader labels:** the accessible name for every control and every state announcement (loading announced via `aria-live`, error via `role=alert`).
- **enterprise:** wire `accessibility-advocate-persona` to run the full audit against this spec. Name it as the consumer.

### Phase 4: i18n / Localization / Timezones (enterprise extra, gap G32)

Only when `i18n` is in the extras list. Omit entirely otherwise.

- **String externalization:** no user-facing string is hardcoded in a component. Every label, error, empty-state copy goes through the message catalog. Name the catalog / key convention.
- **Date / number / currency formatting:** formatted via the locale's formatter (`Intl.DateTimeFormat` / `Intl.NumberFormat`), never string-concatenated. Name which fields are locale-formatted.
- **Timezone handling:** any timestamp displayed states its timezone basis (store UTC, render in the user's tz). Name the source of the user's tz. Date-only fields (a booking date) state whether they are tz-naive or tz-aware to avoid off-by-one-day bugs.
- **Layout impact:** note RTL and string-expansion (German / Finnish run ~30% longer) effects on the Phase 2 layout.

### Phase 5: API Contract Design (gap G16, never drops by tier)

For any external / HTTP API the UI calls (and any cross-service call ARCH declared), design the wire contract as a single source of truth. `cfn-arch` covers internal component boundaries; this is the external request / response shape the frontend depends on.

- **Shape:** request and response as a shared Zod schema or TypeScript interface, in ONE file both the client and the service import. State the path. No loose objects across the boundary. The client must NOT define its own fallback / drift-prone copy of the shape.
- **Endpoint:** method + full path (`POST /api/v1/bookings`).
- **Versioning:** the version segment / header. New fields are additive; breaking changes get a new version.
- **Error shape:** typed error envelope (code + message), shared, not ad-hoc strings. Cross-reference any `cfn-arch` error taxonomy.
- **Deprecation + backward-compat:** how an old client keeps working when the contract changes (additive-only, deprecation header, sunset date). State the compat guarantee.
- **States to contract:** the `cfn-ux` loading / error / partial states map to contract realities (pending / 4xx-5xx / 207-partial). The contract must make every UX state representable.

Format (single source of truth — both sides import this):
```typescript
// src/contracts/booking.ts  (imported by web client AND booking-service)
export const CreateBookingRequest = z.object({
  courseId:    z.string().uuid(),        // ∈ public.courses
  sessionDate: z.string().date(),        // ISO 8601 date, tz-naive
  seats:       z.number().int().min(1).max(8),
  addOnIds:    z.array(z.string().uuid()).default([]),
});
export const CreateBookingResponse = z.object({
  bookingId: z.string().uuid(),
  status:    z.enum(['confirmed', 'waitlisted']),
  createdAt: z.string().datetime(),      // ISO 8601 UTC
});
export const BookingError = z.object({
  code:    z.enum(['COURSE_FULL', 'INVALID_DATE', 'UNAUTHENTICATED', 'INTERNAL']),
  message: z.string(),
});
```

## Output

Write to: `planning/DESIGN_<slug>.md`

Template:
```markdown
# Visual + System Design: <task>

**Date:** <YYYY-MM-DD>
**UX:** planning/UX_<slug>.md
**Spec:** planning/SPEC_<slug>.md   **Arch:** planning/ARCH_<slug>.md
**Tier:** <mvp|beta|enterprise>   **Directive:** <full|light>
**Status:** draft | reviewed | locked

## 1. Design-System Reuse Audit
| Element | Disposition | Existing Path | Notes |
(reuse N / extend M / new K)

## 2. Layout + Visual Spec
### <screen-name>
- Layout structure / grid
- Spacing tokens / hierarchy
- Tokens used (color / type / spacing, by name)
- Responsive breakpoints
- Per-state visual treatment (loading/empty/error/success/partial/disabled)

## 3. Accessibility
- (light) keyboard + labels   OR   (full) WCAG AA: contrast / focus / ARIA / keyboard / SR labels

## 4. i18n / Localization / Timezones  (only if in extras)
- String externalization / date-number-tz formatting / RTL + expansion

## 5. API Contract
- Endpoint + version + shared schema path
```typescript
// shared contract
```
- Error shape / deprecation / backward-compat

## Open Items
- [OPEN] <decisions needing user input>
```

### Output example: course booking screen (continues the cfn-ux / cfn-data example)

Dresses the booking form whose control map `cfn-ux` produced. The `course` field is already decided to be a `select` upstream. Here it gets a token-driven layout, not a new control decision.

**1. Design-System Reuse Audit**

| Element | Disposition | Existing Path | Notes |
|---|---|---|---|
| Select (course, instructor) | REUSE | `src/ui/components/Select.tsx` | combobox variant for instructor (>20 rows) |
| RadioGroup (skill_level) | REUSE | `src/ui/components/RadioGroup.tsx` | 3 options |
| Toggle (send_reminder) | REUSE | `src/ui/components/Toggle.tsx` | — |
| DatePicker (session_date) | REUSE | `src/ui/components/DatePicker.tsx` | constrain to schedule window |
| Stepper (seats) | EXTEND | `src/ui/components/NumberInput.tsx` | add min/max/step props |
| ChipMultiselect (add_ons) | REUSE | `src/ui/components/ChipMultiselect.tsx` | — |
| FormCard layout | REUSE | `src/ui/layout/FormCard.tsx` | single-column form shell |
| color / spacing / type | REUSE | `src/ui/tokens/*` | no new tokens |

Reuse 7 / extend 1 / new 0. Zero new components: the design system already covers this screen. A planner who specced a custom seat-stepper would have violated Phase 1.

**2. Layout + Visual Spec — Booking Form**

- **Layout:** single-column `FormCard`, max-width `size.form` (640px), centered. Fields stack top-to-bottom in flow order: course → instructor → session_date → skill_level → seats → add_ons → send_reminder → notes → Submit.
- **Spacing:** `space.6` between field groups, `space.2` label-to-control, `space.8` above the Submit row.
- **Hierarchy:** Submit is primary (`color.brand.500`, `type.button.lg`); field labels `type.label.md` `color.text.secondary`; the course select is visually emphasized (it gates the rest) with a subtle `color.surface.raised` background.
- **Tokens:** color `brand.500` / `text.secondary` / `surface.raised` / `border.default`; type `button.lg` / `label.md` / `body.md`; spacing `2/6/8`. No hex, no px literals.
- **Responsive:** desktop/tablet single column 640px; mobile (`<bp.sm`) full-bleed, `space.4` gaps, Submit becomes sticky-bottom.
- **State visuals:** loading = skeleton rows in `color.surface.muted`; empty (no active courses) = empty-state card + disabled Submit; error = `color.danger.bg` banner above the form + Retry; disabled Submit = `color.action.disabled` + `cursor:not-allowed`.

**3. Accessibility (full / beta)**

- Contrast: `brand.500` on white = 4.6:1 (AA pass); `text.secondary` on `surface.raised` = 4.8:1.
- Focus order: course → instructor → date → skill_level → seats → add_ons → reminder → notes → Submit (matches visual order from `cfn-ux`). Visible focus ring `color.focus` on every control.
- ARIA: course/instructor `role=combobox` + `aria-expanded`; invalid field `aria-invalid` + `aria-describedby="<field>-err"`; submit error banner `role=alert`; loading skeleton `aria-busy=true`.
- Keyboard: combobox arrow/enter/escape; stepper arrow-up/down; Submit reachable via Tab, fires on Enter.

**5. API Contract**

`POST /api/v1/bookings`, contract in `src/contracts/booking.ts` (imported by web client and booking-service). Request/response/error as the Zod schemas shown in Phase 5 above. Additive-only versioning; `BookingError.code` is the shared taxonomy; old clients keep working because new fields are optional with defaults. The web client imports these schemas, it does not define its own.

## Handoff

`DESIGN_<slug>.md` feeds:
- **`/write-plan`** (level 7) — consumes the layout spec, reuse audit, and contract for the implementation roadmap.
- **`cfn-test-plan`** (level 6, parallel) — turns contrast ratios, focus order, and the API contract into a11y test rows and contract tests.
- **Bar B** (`bars/haiku-executable.md`) — every component named with a path (reuse or new), every token named, every contract field typed. No "style it nicely."
- **`frontend-design`** craft skill — implements the screens against these tokens at build time.

## Return (to orchestrator)

Return exactly:
- Artifact path: `planning/DESIGN_<slug>.md`
- A 3-line summary (reuse/extend/new counts, screens specced, a11y tier + whether i18n + the API contract path).
- Any `[OPEN]` items needing a user decision (e.g. missing token, undecided breakpoint behavior, contract version strategy).

## Anti-Patterns

- **New component when one exists.** Speccing a custom button / modal / picker the design system already ships. Top DRY violation of this phase. Reuse > extend > new.
- **Hardcoded colors / spacing instead of tokens.** A hex or px literal in the layout spec. Every value references a named token from the system.
- **No accessibility.** Shipping a screen with no keyboard path or no labels, even at MVP. The operable floor (keyboard + labels) never drops.
- **Loose objects across the API boundary.** Passing an untyped object between the UI and the service. The contract is a shared Zod schema / interface in one file both sides import.
- **Client-side fallback schema that drifts.** The frontend defining its own copy of the response shape "just in case." Single source of truth, one file, no duplicate.
- **Re-deciding a control type.** Changing a `cfn-ux` select back to a text input. This phase dresses controls, it does not re-pick them.
- **Duplicating `frontend-design`.** Re-writing visual-craft guidance that the `frontend-design` skill owns. Reference it; produce the spec it consumes.
- **i18n by string-concatenating dates.** Building locale output by hand instead of `Intl` formatters; ignoring timezone basis on timestamps.

## Related

- Upstream: `cfn-ux` (control map + states + flows + a11y hooks — the thing this phase dresses), `cfn-arch` (internal boundaries + external integrations the API contract extends), `cfn-spec`.
- Reuse: `frontend-design` (craft skill that implements screens against this artifact's tokens — referenced, not duplicated).
- Downstream: `/write-plan`, `cfn-test-plan` (a11y + contract tests).
- Gate: `bars/haiku-executable.md` (every component pathed, every token named, every contract field typed).
- Orchestrator: `cfn-megaplan` (spawns this phase at DAG level 6, conditional on `frontend`, parallel with `cfn-test-plan` + `cfn-ops`; agent `ui-designer`).
- Backlog + design rationale: `docs/PLANNING_PIPELINE_GAPS.md` (gaps G15, G16, G32).
