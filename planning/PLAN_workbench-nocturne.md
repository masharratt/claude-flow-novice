# Plan: cfn-workbench Nocturne re-skin + Decisions section

Source of truth for look: Claude Design project `a2a1e0f5-9157-4c15-83c3-43e97064b316`,
`Workbench - Nocturne.dc.html` + `_ds/.../styles.css` (read via DesignSync, treated as data).
Replaces the placeholder light theme (commit f43f16fcb). Adds a new Decisions section.

Two user decisions locked:
- Font: system font stack (Inter@GoogleFonts forbidden by self-containment contract).
- Decisions source: per-run ledger file `planning/.VERIFY_<slug>.decisions.json`.

## The Nocturne contract (lands in lib/html.sh FIRST, alone)

### Tokens (replace default_style body)
Dark palette from styles.css :root: --color-bg:#161826, --color-surface:#232532,
--color-text:#e9e9ed, --color-accent:#9184d9 (blurple), full neutral ramp (-100..-900),
accent ramp, --color-divider, spacing scale, radii, shadows (hairline
box-shadow: inset 0 0 0 1px ... elevation, Nocturne signature). No @import for Inter.
--font-heading / --font-body both = system stack
(-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif).

### Signature .hr fading rule
Divider fades to transparent at both ends (48px ramps). Section headings use it
under their kicker labels.

### State-label system (replaces .pill .pill-<value>)
state_label VALUE bash helper classifies any status into one bucket, emits
<span class="state state-<bucket>">ESCAPED_VALUE</span>:

| Bucket | Class | Values |
|---|---|---|
| settled | state-settled | pass, completed, accepted, blessed |
| waiting | state-waiting | pending, in-progress, open, proposed |
| unknown | state-unknown | unknown, rejected |
| action | state-action | fail |
| fatal | state-fatal | blocked, aborted |

Unknown values fall to state-unknown (safe default, fixes invalid pill-? selector).

### Component classes (translated from design inline styles; no style="" anywhere)
.wb-sticky-header, .verdict-headline, .verdict-rule, .meta-grid, .count-pill
(+ .count-pill-gaps), .gaps-strip, .section-kicker + .section-hint, .iter-card
(+ .iter-card-latest), .progress, .progress > div, .lane-grid, .lane-card,
.mono-block, .gate-list / .gate-row, .shot-grid / .shot-thumb, .ac-scroll,
.two-col, .legend, .decisions-list / .decision-card, .actor (.actor-human / .actor-ai).
Retain generic names: .card, .sub-card, .sub-head, .table-wrap, .section-nav, .empty,
.note, .timeline-grid, .timeline-cell, .iter-na, details/summary styles.

### section_nav update
Anchors: Detail, AC, Decisions, Votes, Debt, Bless, Gaps.
Full set: #sec-detail, #sec-ac, #sec-decisions, #sec-votes, #sec-debt, #sec-bless, #sec-gaps.

## Section rewrites (each lib, Nocturne markup via the classes above)

Section ids are the nav contract; do NOT rename (sec-timeline, sec-detail, sec-ac,
sec-votes, sec-debt, sec-bless, sec-gaps, + new sec-decisions). Every <table> stays
wrapped in .table-wrap. Exactly one <details open> across iteration detail. Keep
<time datetime=>.

- section-header.sh: sticky header band; verdict-as-headline + .verdict-rule + one-line
  summary; .meta-grid (Run/Branch/Iterations/Generated); two .count-pill s (open-count
  -> #sec-votes, gap-count -> #sec-gaps). Verdict decision tree unchanged
  (aborted -> bless -> in-progress -> unknown).
- section-timeline.sh: .iter-card per iteration: kicker + commit count, big pass-rate,
  .progress bar (width=rate), state_label for gate. iter-na retained.
- section-iteration-detail.sh: .lane-grid of .lane-card s (not a table) with state_label;
  .mono-block test output (white-space:pre); .gate-list of .gate-row s with state_label;
  .shot-grid of .shot-thumb s. Overflow card + first-only-open unchanged. Empty-lanes
  message retained.
- section-ac-table.sh: .ac-scroll wrapper, sticky first column
  (position:sticky;left:0;background:var(--color-bg)), state_label per row, evidence cell
  keeps optional collapsible <details>. Header-name parser + 6 display cols unchanged.
  AC note relativized via display_path.
- section-vote-ledger.sh, section-tech-debt.sh: jq emits rows as TSV; bash builds each
  <tr> via html_escape (every cell) + state_label (status cell). Unifies escaping +
  classification (current jq esc does not escape single-quote).
- section-bless-ledger.sh: .bless-meta verdict via state_label; sub-head lists retained.
- section-footer.sh: Nocturne footer grid; gaps block retained. Add legend: collapsible
  <details class="legend"> explaining the 5 state buckets (no em dashes).

## New: Decisions section

lib/section-decisions.sh: section_decisions() reads WORKBENCH_SLUG/WORKBENCH_ROOT.
Source: $root/planning/.VERIFY_${slug}.decisions.json.

Ledger schema (mirrors decision-log decisions table + two run-scoped fields):
{ "slug": "<slug>", "decisions": [
  { "id": "D-01", "actor": "human", "title": "...", "chosen": "...",
    "rationale": "...", "alternatives": "...", "iteration": 4,
    "blocking": false, "timestamp": "ISO", "status": "accepted" }
] }
- actor: human|ai (required) -> .actor-human / .actor-ai marker.
- status: proposed|accepted|superseded -> via state_label (proposed=waiting,
  accepted=settled, superseded=unknown).
- Rendering: .decisions-list of .decision-card s. Matches debt-ledger card treatment.
- Missing file or empty array -> neutral empty state
  (<p class="empty">No decisions logged for this run.</p>). NOT a data gap.

render.sh: source lib/section-decisions.sh; emit DECISIONS_HTML after AC, before votes.

## Files

Foundation (lands first, alone):
- lib/html.sh

Section rewrites (independent given foundation; one file each):
- lib/section-header.sh, section-timeline.sh, section-iteration-detail.sh,
  section-ac-table.sh, section-vote-ledger.sh, section-tech-debt.sh,
  section-bless-ledger.sh, section-footer.sh (+ legend).

New:
- lib/section-decisions.sh, fixture tests/fixtures/planning/.VERIFY_workbench.decisions.json

Wiring + tests:
- render.sh (source + emit decisions)
- tests/test-render.sh (Group 12 edits + Group 13)

Docs:
- readme/feature-status.md

## Coordinator ownership (shared files, NOT parallelizable)

test-render.sh is one shared file -> coordinator owns: html.sh foundation, tests
(Group 12 edits + Group 13 + decisions fixture), section-decisions.sh + render.sh
wiring, readme/feature-status.md. Section libs (8) are parallel lanes.

## Verification

1. bash .claude/skills/cfn-workbench/tests/test-render.sh (capture to
   /tmp/test-claude-flow-novice-<ts>.txt). All groups green (12 updated + new 13).
2. Self-containment check clean: no <link, all src=data:, all href=data:|#.
3. Playwright desktop 1440 + mobile 380: dark theme, sticky header, verdict headline,
   gaps strip, timeline progress bars, collapsible iterations, sticky-column AC table,
   decisions cards, legend. No console errors, no external requests, no horizontal
   page scroll at 380px.
4. Empty-state render (empty-slug): Nocturne header + empty states, decisions
   empty-state, exit 0.
