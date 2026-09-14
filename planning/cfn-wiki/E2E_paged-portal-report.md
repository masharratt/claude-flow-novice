# Wiki portal e2e recheck: DEF-1 and DEF-2

Date: 2026-09-14. Repo: /home/masha/projects/claude-flow-novice. Verify-only run: no repo files changed.

## Verdict

| Check | Former defect | Verdict |
|---|---|---|
| A | DEF-1 deep-link reload hydration | PASS |
| B | DEF-2 keyboard on shell home | PASS |

## Build status (context, blocks a fresh build)

`bash .claude/skills/cfn-wiki/lib/wiki.sh build . --paged` FAILED before install:

    assemble: pages/catalog.html still holds the placeholder
    wiki_build_portal_paged: payload assembly failed

Cause (traced, not fixed here): the wiki-portal capability now documents build-portal.sh's
own selfcheck, and its source excerpts contain the literal `__WIKI_PAYLOAD__`
(fresh view-catalog.json carries it). `assemble.py inline()` does
`template.replace(PLACEHOLDER, blob)`, so the blob re-introduces the placeholder and
`check_page` hard-fails. Generator self-reference bug, pre-existing, out of scope.

The failed build is atomic: `.wiki/portal/` was untouched. The verified portal is the
existing build (index.html 2026-09-14 09:25:06), which postdates the fixed template
(template.html 09:23:31, identical to HEAD 32d8c6618). Fixes confirmed present in the
built shell: `fetch("data/" + h + ".json")` and `tabIndex = i === 0 ? 0 : -1`.

## Servers used

- 8471: `python3 -m http.server 8471 --directory .wiki/portal` (prescribed static server)
- 8472: wiki's own `server.py --wiki-dir .wiki --read-only` (serves /api/annotations;
  same portal bytes) to isolate one static-server artifact, see CHECK A

## CHECK A - PASS

Method: real browser (Playwright), navigate + true page.reload(), network log, console
log, DOM assertions.

#catalog:
- Direct load and reload both fetch `GET /data/catalog.json => 200` (never
  `pages/data/...`; no fallback navigation to pages/).
- Lands on catalog content both times: shell-home hidden, view-catalog visible, 22
  cards, tab-catalog aria-selected="true", body ready=1, URL stays `/#catalog`.

#arch:
- Direct load and reload both fetch `GET /data/arch.json => 200`.
- Lands on arch content both times: shell-home hidden, view-arch visible, tab-arch
  aria-selected="true".

Network/console on 8471: the only non-200 anywhere is `GET /api/annotations => 404`,
and the only console entries are the browser's resource-404 lines for that same URL.
That endpoint is the notes API of the wiki serve stack; the static http.server does not
implement it. The shell handles it by design (catch -> "Notes unavailable: server
unreachable" status; no JS error; the template contains no console.* calls). On 8472
(same portal bytes, real annotations API) the identical #catalog + reload sequence is
zero-404 and zero-console-error, proving the portal itself is clean and the 404 is an
artifact of the prescribed static server, not DEF-1 (the defect was hydration fetching
`pages/data/...`).

## CHECK B - PASS

Shell start screen (`http://127.0.0.1:8471/`, no hash):
- Tab indices: tab-arch=0; tab-catalog/data/change/coverage all -1. Exactly one tab in
  the tab order (roving tabindex fix), so no tab is focusable-dead.
- Empirical Tab walk from body: skip-link -> theme-toggle -> 2 header buttons ->
  tab-arch. The tab bar is reached by keyboard; the first tab receives focus (visible
  focus ring in screenshot).
- Enter on tab-arch: navigates to `pages/arch.html`; arch view renders, ready=1.
- ArrowRight on tab-arch: navigates to `pages/catalog.html`; catalog view renders, ready=1.

## Screenshots

Dir: `/tmp/wiki-e2e-recheck/screenshots/` (7 PNGs, 1705x1280)
- A1-catalog-direct-load.png / A1-catalog-reload.png: #catalog hydrated (direct + reload)
- A2-arch-direct-load.png: #arch hydrated
- A3-catalog-wikiserver-zero404.png: same deep link on the wiki server, zero 404s
- B1-home-tab-focused.png: home screen, focus ring on first tab
- B2-enter-lands-arch-page.png: Enter result
- B3-arrowright-lands-catalog-page.png: ArrowRight result

## Observations (not failures)

- "Wiki stale" and "Degraded build" banners render: store.json (14:19) is newer than
  the portal build (09:25). Informational meta banners, unrelated to DEF-1/DEF-2.
- Follow-up needed (owner: main chat): teach assemble.py inline() to break the
  placeholder collision (e.g. split the literal in excerpt text or escape it in the
  blob) so `wiki build --paged` succeeds again; the current store cannot rebuild.

## CHECK C (appended 2026-09-14, after node-deselect template change) - 3 PASS, 1 FAIL

Rebuild first: `wiki.sh build . --paged` now SUCCEEDS (placeholder-collision fixed upstream);
portal rebuilt 14:44:56. Served at 127.0.0.1:8473, verified on `pages/arch.html` (28 nodes,
158 edges) with a real mouse via Playwright.

| Item | Verdict | Evidence |
|---|---|---|
| C1 click node -> dim + panel | PASS | Real click on `.archive` (degree 62): 15/28 nodes muted, computed opacity 0.12 (live nodes 1), 96 edges muted / 62 connected, `#arch-detail` opens (name + 5932-char body), placeholder hidden. Shot: C1. |
| C2 click empty canvas -> restore all | **FAIL (mouse)** | Real mouse click on verified on-svg empty point (elementFromPoint = svg): selection unchanged (15 muted, 1 selected, panel open). Shot: C2. Root cause: `enhanceDiagram` pan handler runs `viewport.setPointerCapture()` + `preventDefault()` on every empty-canvas pointerdown; the subsequent click is retargeted to `#arch-scroll`, so the new `svg.addEventListener("click", clearNodeSelection)` (template.html:839) never fires. Event log: `svg pointerdown -> vp pointerdown(target=arch-svg) -> vp pointerup(target=arch-scroll) -> vp click(target=arch-scroll)`. Handler logic itself is correct: a synthetic click dispatched on the svg clears everything. Touch/pen taps bypass the pan guard (pointerType!=="mouse") and would work; the mouse path is dead. |
| C3 drag/pan -> selection survives | PASS | With a node selected, real pan gesture after zoom-in (scrollTop 168 -> 312, canvas actually moved): selection fully intact (15 muted, 1 selected, panel open). The >6px guard in the svg click handler is unexercisable by mouse (see C2), but the acceptance - selection must not clear on drag - holds. |
| C4 Escape -> clears | PASS | Focus `#arch-scroll`, press Escape: 0 muted nodes, 0 muted/connected edges, `#arch-detail` hidden, placeholder text "Select a node or a module..." restored. Shot: C4 (restored-all state). |

Fix hint for C2 (owner: main chat): deselect on the viewport's own click (or pointerup with
drag-distance check) instead of the svg's click, or skip `setPointerCapture`/`preventDefault`
when the gesture never exceeds the 6px threshold.

Screenshots added: C1-node-selected-dimmed.png, C2-empty-click-did-not-clear.png,
C4-restored-all-after-escape.png (restored-all).

## CHECK C re-verify (appended 2026-09-14, after pointerup deselect fix) - ALL PASS

Both build modes succeed: `wiki.sh build .` (single) rc=0 and `wiki.sh build . --paged` rc=0
(portal final state paged, 15:00:00). Served at 127.0.0.1:8474, `pages/arch.html`, 28 nodes
/ 158 edges, real mouse via Playwright. New wiring verified in source: deselect now on
viewport `pointerup` with 6px movement threshold (template.html:840-853).

- C1 PASS: click `.archive` (deg 62) -> 15/28 nodes muted at computed opacity 0.12,
  detail panel opens, placeholder hidden.
- C2 PASS: real mouse click on empty svg space -> 0 muted, 0 selected, panel hidden,
  placeholder text restored. (Previous FAIL fixed; only console entry is the known
  /api/annotations 404 of the plain static server.)
- C3 PASS: reselect, zoom 2x, real pan (scrollTop 168 -> 312): selection fully intact.
- C4 PASS: Escape -> all restored, placeholder back.
- EXTRA PASS (two consecutive cycles): `.archive` select -> empty-click restore, then
  DIFFERENT node `api-gateway` (deg 42, 19/28 muted) -> empty-click restore. Both
  deselects clean; no state leakage between cycles (hidden panel retains last name in
  textContent only, cosmetic, invisible).

Screenshot: C5v2-restored-all-two-cycles.png (restored-all state after cycle 2).
