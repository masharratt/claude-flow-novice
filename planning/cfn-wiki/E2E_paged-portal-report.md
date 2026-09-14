# cfn-wiki Paged Portal — Browser E2E Verification

Date: 2026-09-14. Build under test: `/home/masha/projects/claude-flow-novice/.wiki/portal/` (shell `index.html` 85,806 bytes, `pages/` 26 files, `data/` 6 JSON files; meta fingerprint `a62a0cec…`, generated `2026-09-14T16:05:36Z`).

Environment: fresh instance of `.claude/skills/cfn-wiki/portal/server.py` on `http://127.0.0.1:4890` (skill server layout: static portal + `/api/annotations`), plus `file://` loads. Driver: Node + playwright 1.59.1 (borrowed from `~/projects/daily-agents`) driving chrome-headless-shell-1234 over CDP. Scripts and raw logs: `/tmp/wiki-paged-e2e/verify*.js`, `verify*-run.log`, `results*.json`. Read-only verification; no portal code changed.

## Verdict table

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Served navigation | PASS | Shell at `/` reaches `data-ready=1`, home visible, 5 tabs (arch, catalog, data, change, coverage). All 5 view pages render (textContent 1,575-13,180 chars). Capability pages: `edit-safety-hooks` (h2=5, 13 evidence blocks), `plan-gates` (h2=5, 17 evidence blocks); directory page `api-gateway` renders its 14-file inventory (by design). Zero console errors, zero page errors; every request same-origin (page + `/api/annotations` only). Shots: `01-shell.png`, `01-arch.png`, `01-coverage.png`, `01-capability.png`, `01-directory-page.png` |
| 2 | File navigation (file://) | PASS | `file://…/index.html` makes exactly one request on load (the HTML itself): no `data/*.json`, no `/api/` fetch. Shell home shows the fallback note "Search filters within the page you have open". Tab click navigates to `file://…/pages/catalog.html` and renders. Zero console errors. Shots: `02-file-shell.png`, `02-file-catalog.png` |
| 3 | Deep-link reload | FAIL (DEF-1; user outcome preserved by fallback) | Capability page: `/pages/capability-edit-safety-hooks.html` reload keeps URL, h1 "Enforcing rules with hooks", 13 evidence blocks - PASS. `#catalog` hash: loading `/#catalog` makes the shell fetch `/pages/data/catalog.json` -> 404 -> console error -> client redirect to `pages/catalog.html` (DEF-1). User lands on rendered catalog content after reload (13,180 chars), but the URL changes from `/#catalog` to `/pages/catalog.html`; hydration never happens. Shot: `03-deeplink-final.png` |
| 4 | Keyboard | PASS (defect DEF-2 on shell home) | On view pages: Tab reaches the nav in 5 presses (skip-link > theme-toggle > 2 banner dismiss > `tab-arch`); ArrowRight switches to `pages/catalog.html` (roving tabindex; Enter on the current tab re-navigates to itself - in paged mode only the active tab is tabbable, arrows do the switching). On the shell home the tab bar is keyboard-unreachable (DEF-2). Shot: `04-keyboard-arrow.png` |
| 5 | Mobile 400px | PASS | Document: `scrollWidth=400 = clientWidth` (no horizontal page scroll) on shell and data page. Nav strip scrolls internally (nav `scrollWidth 530 / clientWidth 400`, `overflow-x: auto`, 2 tabs beyond fold); tab click at 400px navigates and the target page also has no document overflow. Shots: `05-mobile-shell.png`, `05-mobile-data.png` |
| 6 | Evidence citations | PASS | `edit-safety-hooks`: 13 citations, every summary is `path:line` (e.g. `.claude/hooks/cfn-invoke-pre-edit.sh:4`, `…:84`); `plan-gates`: 17. Clicking a summary opens the details block with claim + 1,100-char source excerpt. No "Inspect source evidence" flow-step buttons exist in this build (no authored `flow` steps) - expansion verified via summary click. Shot: `06-evidence.png` |
| 7 | Notes/annotations | PASS (not skipped - skill server used) | Full round-trip against `server.py` on port 4890: dialog opens on "Leave a reader note" (target `feature:edit-safety-hooks`), POST saves (status "Saved 9:20:04 AM"); after reload the dialog is prefilled and the button gets `has-note`; `GET /api/annotations` holds the record; delete via UI removes it (remaining keys `[]`, no test residue). Shot: `07-annotations.png` |
| 8 | Coverage | PASS | Coverage page shows all three measures with denominators: Inventory `5672 / 5858` classified in-scope files; Explanation `5 / 5` explained capabilities; Review `5 / 5` reviewed. "Excluded by policy" names 4 paths: `.claude/skills/nitpicky`, `.env.database-example`, `.env.example`, `.env.hybrid-example`. "Blocked areas" card present but empty in this build. Shot: `08-coverage.png` |
| 9 | Shell payload bound | PASS | Shell inline payload contains only `coverage` + `meta` keys; no `"features":`, `"arch":`, or `"catalog":` anywhere in `index.html`. Spot-check: 120-char raw-JSON probe of the longest source excerpt in `data/catalog.json` (2,029 chars, from `bless-verify.sh`) is absent from the shell. |

Overall: 8/9 checks pass; check 3 fails on DEF-1 (mitigated by a working fallback).

## Defects

DEF-1 (moderate) - served-mode hash hydration fetches a URL no server layout serves.
`/home/masha/projects/claude-flow-novice/.wiki/portal/index.html:1544` - `fetch(PAGES_DIR + "data/" + h + ".json")`. In the shell `PAGES_DIR === "pages/"`, so `/#catalog` requests `/pages/data/catalog.json`, which 404s under both:
- the skill server (`server.py:159-176`: `/pages/` only serves `*.html` via `PAGE_NAME_RE`; view payloads live under `/data/` -> `portal/data/`), and
- a plain static server rooted at `.wiki/portal` (data lives at `data/`, not `pages/data/`).
Consequences per run (`verify2-run.log`): console error `Failed to load resource: 404 (Not Found)`, an aborted `/api/annotations` fetch (REQFAIL - the fallback redirect at `index.html:1548` cancels it in flight), and a client-side redirect to `pages/catalog.html` instead of in-shell hydration (the hydration branch at `index.html:1528-1537` is effectively dead code in served mode). User outcome is still correct content. Correct fetch target would be `data/<view>.json` relative to the shell root.

DEF-2 (minor, a11y) - tab bar is keyboard-unreachable on the shell home.
`/home/masha/projects/claude-flow-novice/.wiki/portal/index.html:1498-1503` - `renderShellHome()` sets `tabIndex = -1` and `aria-selected="false"` on every tab, so the roving-tabindex tablist has no tabbable entry on the start screen; Tab focus cycles skip-link > theme toggle > banner dismiss > Views links and never reaches the nav. Keyboard users must use the "Views" links instead. On view pages the roving tabindex behaves correctly (active tab `tabIndex=0`).

## Observations (not defects)

- Directory-kind pages (`capability-api-gateway.html`, `capability-src.html`, ...) render a file inventory, not a walkthrough ("This entry groups source files by directory") - matches build data (5 authored capabilities of 21 catalog entries).
- The shell shows stale + degraded banners (`META.stale=true`, "Dependency index freshness is unverified...") - build data state, not a portal defect.
- A stale portal server instance from 2026-09-13 (PID 2782799, port 36761, recorded in `.wiki/portal/server.json`) is still running pre-paged code and 404s `/pages/*`; verification used a fresh current-`server.py` instance on port 4890 (stopped after the run; `server.json` restored to prior content).
- No favicon request/404 was observed in any run.

## Skips

None. Check 7 ran live (skill server trivially startable and started).

## Artifacts

Screenshots (all under `/tmp/wiki-paged-e2e/`): `01-shell.png`, `01-arch.png`, `01-coverage.png`, `01-capability.png`, `01-directory-page.png`, `02-file-shell.png`, `02-file-catalog.png`, `03-deeplink-final.png`, `03-deeplink-reload.png`, `04-keyboard-arrow.png`, `04-keyboard-enter.png`, `05-mobile-shell.png`, `05-mobile-data.png`, `06-evidence.png`, `07-annotations.png`, `08-coverage.png`.
Raw data: `results.json`, `results3.json`, `verify-run.log`, `verify2-run.log`, `verify3-run.log`, drivers `verify.js` / `verify2.js` / `verify3.js`.
