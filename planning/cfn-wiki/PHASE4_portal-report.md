# Phase 4 report: paged portal and coverage UI

Date: 2026-09-14. Scope: paged build mode + coverage UI per the Phase 4 plan
section; SKILL/AUTHORING/ROLLOUT doc updates and browser e2e remain open.

## Modes and dispatch

- `wiki build [repo]` default: one self-contained `.wiki/portal/index.html`
  (unchanged flow, now also inlines a `coverage` payload key). A single-file
  build clears leftover `pages/` and `data/` so the tree matches the mode.
- `wiki build [repo] --paged`: small shell + `pages/<view>.html` (arch,
  catalog, data, change, coverage), `pages/capability-<fid>.html` per catalog
  feature, `data/<view>.json` raw payloads (plus coverage.json, meta.json).
- `--paged --static-out <dir>` copies the distribution for portable export.
- `wiki serve --static` serves a paged build (new `/pages/`, `/data/` routes
  in server.py, regex-validated single filenames). Plain `wiki serve` still
  rebuilds the single-file page; documented in SKILL.md build row.

## File layout (paged)

- Shell `index.html`: payload is exactly `{meta, coverage}`; static view
  links (`pages/<view>.html`), footer documents the file-mode search
  limitation. Build selfcheck hard-fails if any evidence excerpt (source or
  flow, first 60 chars) or a features array reaches the shell.
- Pages share `template.html`; each embeds only its own payload plus
  `meta.mode`/`meta.page`. arch.html carries a trimmed catalog (fid/name/
  kind only). data.html holds state SVGs; capability pages hold excerpts.
- Served shell deep links (`#catalog` etc.) fetch `data/<view>.json` and
  hydrate in place; `#capability/<fid>` and file mode navigate directly to
  the page file (file:// cannot fetch local JSON). Tabs navigate; single
  mode keeps hash switching and exactly four tabs.

## Coverage wiring

- `lib/work.py coverage_report` gained (additive, capped at 20 each):
  `inventory.excluded_paths`/`unclassified_paths` (+ truncated flags) and
  `stale_areas` (capabilities with needs_review). Human output unchanged.
- Renderers: single-file collapsible `#coverage-panel` (summary line + three
  measure cards with denominators + excluded/unknown/stale/blocked lists);
  paged `pages/coverage.html`; shell summary card. Missing discovery index
  degrades to the documented error, never a blank.

## Regressed checks run

- `bash tests/test-wiki-portal.sh`: 112 passed, 0 failed (was 56; new paged
  case: layout, shell leak greps, payload parses, deep-link anchors, served
  200s + traversal 404, static-out, single-file byte-identical rebuild with
  timestamps normalized, mmdc active).
- `python3 tests/test-wiki-work.py`: 59 OK (coverage fields).
- `python3 tests/test-wiki-knowledge.py`: 29 OK.
- `node tests/test-wiki-portal-ui.cjs` (playwright + chrome): all single-file
  browser workflows pass, zero console errors, zero external requests.
- Real repo: both modes built; paged shell 86KB vs 529KB single file;
  http.server smoke: 11 routes 200, zero external refs, coverage
  5672/5858 files, 5/5 explained, 5/5 reviewed.
- Pre-existing (not this phase): `tests/test-wiki-views.sh` catalog-vocab
  key assertion is stale against committed knowledge.py (missing `domains`);
  64/65 pass with it failing before and after these changes.

## Limits

- Shell and pages each carry the shared template chrome (about 85KB); the
  win is payload partitioning, not total bytes.
- Cross-page search does not exist in paged mode (per-page filters only);
  documented in the shell footer per the plan.
- Paged browser e2e (keyboard, mobile, hydration in a real browser) is not
  covered by automated tests yet; only static + HTTP assertions here.
- `python3 -m http.server` smoke used plain static serving; the annotation
  API still requires `wiki serve --static` (server.py).
