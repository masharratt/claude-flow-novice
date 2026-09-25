# PLAN: garden-skin (Espalier v1) — plant-growing section for cfn-workbench

Date: 2026-08-29. Night-mode batch. Decisions: D-garden-go, D-garden-scope
(night-2026-08-31).

## Goal

New `#sec-garden` section in the per-run workbench page: the run as a growing
plant. Espalier concept (creative-ideator session 2026-08-29): bash grows a
deterministic SVG plant from the existing run-state derivation; a small inline
WebGL overlay (hand-written, LYGIA chunks pasted) adds glow, pollen, and
dithered light. Static-complete without JS; transit map stays untouched.

## Metaphor map (each visual channel has a data owner)

| Plant | Data | Owner field |
|---|---|---|
| Seed/soil line | run exists | run-plan present |
| Roots | planning artifacts (faint, below soil) | decorative, count = waves |
| Stem height | iterations survived | `iteration` |
| Stem knot/scar | each completed gate cycle | min(iteration-1, scars from gate events) |
| Branch | wave | `waves[k]` |
| Bud (closed) | lane pending | `status[lane] == "pending"` |
| Shimmer leaf | lane in-flight | `"in-flight"` |
| Open leaf | lane landed | `"landed"` |
| Thorn + curled leaf | lane blocked | `"blocked"` |
| Flower at apex | gate pass | `gate == "pass"` |
| Wilted head | gate fail | `gate == "fail"` |
| Wilt (droop + desat) | staleness 120s/600s | client JS classes, pill thresholds |
| Growth reveal | lane spawn timestamps | baked `data-grow-epoch` per node |

Rule: no effect ships without a data owner. Pure decoration allowed only for
roots/soil/vignette (background layer).

## Derivation (reuse, no rebuild)

`_wb_map_run_state` (lib/section-map.sh:81) already derives waves, per-lane
status, spawn ts, names, gate, loop, iteration as one JSON object. The garden
consumes that object verbatim. No new event types; the 9-type set stays closed.

## Geometry (one jq pass, TSV protocol, bash interpolates integers only)

Same discipline as section-map.sh: jq computes every coordinate as integers and
emits TSV records; bash does no float math.

- viewBox `0 0 640 H`; soil line y = H-40; stem base at center bottom.
- Stem: vertical path from soil to apex; height `120 + 90*min(iteration,4)`
  clamped; apex x wobbles per iteration segment (deterministic hash of slug).
- Scar knots: `iteration - 1` dark rings on the stem at even spacing.
- Branches: one per wave. Branch k leaves the stem at height
  `base + (k+1)*(stemH/(W+1))`, alternating left/right, length `70 + 18*lanes_k`
  clamped, upward angle 25deg (deterministic jitter).
- Leaves: one per lane, spaced along its branch. Leaf = simple two-arc leaf
  path; bud = small ellipse; thorn = triangle + curled (scaled 0.6, desat)
  leaf. In-flight leaves carry `class="g-shimmer"`.
- Flower: 6-petal rosette at stem apex on pass; wilted head (drooping closed
  petals) on fail; bare apex on unknown.
- Roots: 2-3 faint polylines below soil, opacity .15 (background layer).
- Every node carries `data-lane`/`data-status` and a `<title>`; lane text
  labels only on `<title>` (hover), keeping the plate clean; statuses remain
  readable via the roster + map sections.

TSV records: `hdr w h`, `stem x0 y0 x1 y1 segs scars`, `branch k x1 y1 x2 y2
side lanes`, `leaf lane status x y angle scale`, `scar x y`, `flower x y kind`,
`root d`. Fixed arities; malformed record = skip node + record_gap (never fail).

## Wilt (staleness) mechanics

Server bakes `data-generated-epoch` (same value as the staleness pill). Inline
JS (guarded try/catch) adds `garden-wilt-warn` after 120s and `garden-wilt-bad`
after 600s since epoch; CSS rotates leaf groups down 8/16deg and desaturates
via `filter`. JS off = plant stays fresh (identical degrade to the pill's
static text). Thresholds live once in a shared comment + pill code.

## Shader overlay (the "shader libraries" ask)

One `<canvas class="garden-canvas">` absolutely positioned over the SVG
(`pointer-events:none; mix-blend-mode:screen`), plus a fullscreen-quad
fragment shader in an inline
`<script type="x-shader/x-fragment">` block (no `src=`; self-containment
holds). Vanilla WebGL, ~60 lines of JS plumbing. NO three.js (D-garden-go).

Effects in v1 (LYGIA chunks pasted inline, MIT):
1. Tip glow: additive halo at each in-flight leaf position (baked as
   `data-glow="x,y"` pairs on the SVG, parsed to a uniform vec2 array);
   intensity pulses with u_time. Chunks: none needed beyond pow/smoothstep.
2. Pollen motes: ~40 hash-gridded drifting points, curl-ish drift via
   value noise. Chunks: LYGIA `random`/`hash` + `noise` (value noise 2D).
3. Dithered vignette + per-project hue tint: ordered 4x4 Bayer dither kills
   banding; cosine palette picks a hue from hash(project name). Chunks:
   LYGIA `dither` (bayer) + `palette` (cosine).

Explicitly deferred to v2: bloom on flower (needs multipass), light shafts,
SDF plant (Meristem). Guard rails: `dpr 1`, rAF capped 30fps, capability
check — WebGL unavailable → canvas hidden, SVG stands. `prefers-reduced-motion`
→ shader renders ONE static frame then stops (glow steady, no pollen drift),
CSS sway disabled.

## Sway (no JS)

CSS-only: leaves sway ±2deg via `@keyframes` with per-branch
`animation-delay` (baked). `@media (prefers-reduced-motion: reduce)` kills it.

## Files

| File | Change |
|---|---|
| `lib/section-garden.sh` | NEW: geometry jq pass + SVG emission + scoped CSS + shader block + overlay JS |
| `render.sh` | Source garden lib, emit `GARDEN_HTML` after map section |
| `lib/html.sh` | Nav anchor `Garden` after `Map` |
| `tests/test-garden.sh` | NEW suite (below) |
| `SKILL.md` | Garden section paragraph |
| `docs/WORKBENCH_DESIGN_HANDOFF.md` | §10 garden contract |
| `readme/feature-status.md` | cfn-workbench row update |

## Tests (TDD: suite red before implementation)

1. `id="sec-garden"` present with plan+events fixture.
2. One leaf node per lane; `data-lane` + `data-status` correct for
   pending/in-flight/landed/blocked lanes; blocked also carries `g-thorn`.
3. Scar count = iteration - 1 (fixture iteration 2 → 1 scar).
4. Gate pass fixture → `g-flower`; fail fixture → `g-wilted-head`.
5. Determinism: two renders byte-identical (idempotence, same as map).
6. XSS: lane id `x<img>"` escaped in `data-lane` and title.
7. Shader inline: `<script type="x-shader/x-fragment">` present, canvas
   present, ZERO `src=` on script tags (self-containment suite still green).
8. `prefers-reduced-motion` media guard present (CSS + JS).
9. `data-generated-epoch` on section root (wilt source).
10. Empty project: section renders empty-state card + data gap; exit 0.
11. Nav anchor `#sec-garden` in nav.
12. No em dash in garden slice; all interpolation escaped.
13. Overlay fallback: JS contains WebGL capability check that hides canvas
    (assert string present).

## Assumptions (testable)

- `_wb_map_run_state` output shape (waves/status/spawn/names/gate/loop/
  iteration) is stable; garden consumes it, never re-derives.
- Event set stays closed (9 types); no new emitters.
- LYGIA chunks used (hash, value noise, bayer dither, cosine palette) are
  small (<2KB pasted total) and MIT-licensed; attribution comment kept.
- WebGL on `file://` works in Chromium/Firefox on the user's machines; when
  it does not, canvas hides (graceful, tested by string assert).
- Page weight budget: garden adds < 12KB (SVG ~2KB, CSS ~1.5KB, shader+JS
  ~6KB incl. LYGIA chunks).

## Blast radius

Additive only: new section + nav anchor + one source line in render.sh. No
existing section changes; dashboard untouched (bed = follow-up). Tests for
render/live-sections unchanged except nav-anchor count if any assert on nav
items (check before wire).

## Out of scope (v2+)

Dashboard garden bed; Meristem SDF plant; bloom multipass; light shafts;
Night Garden theme; hover-scrub timelapse; per-plant growth replay animation
on load (baked `data-grow-epoch` ships now, animation later).

## TDD order

1. tests/test-garden.sh red (structure asserts 1-13 against fixture).
2. section-garden.sh: derivation plumbing + SVG (asserts 1-6, 9-12 pass).
3. CSS sway + reduced-motion guard (7-8 partially).
4. Shader block + overlay JS + capability check (7, 8, 13).
5. render.sh + html.sh wiring (+ nav assert 11).
6. Full suites + Playwright visual verify + vision pass.
7. Docs, feature-status, doc lint, explicit-path commit (no push).
