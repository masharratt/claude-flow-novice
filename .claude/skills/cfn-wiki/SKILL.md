---
name: cfn-wiki
description: "Self-updating codebase wiki + visual portal: indexes a repo with codebase-memory-mcp (CBM), extracts a deterministic feature/module store, regenerates readme/feature-status.md and readme/state-machines.md as tracked projections, preserves Claude enrichment in wiki:enrich blocks, and serves a self-contained click-to-explore HTML portal (architecture map, feature catalog, data/state views, change story) on port 4885. Use when the user asks to sync, build, browse, lint, or doctor the codebase wiki."
version: 0.1.0
tags: [wiki, portal, documentation, cbm, codebase-memory, visualization]
status: dev
category: documentation
---

# cfn-wiki

Self-updating codebase wiki: deterministic extraction (`.wiki/store.json`,
untracked) plus Claude enrichment (`<!-- wiki:enrich id=fid -->` blocks inside
generated markdown, preserved across regen while the feature fingerprint is
unchanged), rendered into a self-contained visual portal.

## Command contract

Entry point: `.claude/skills/cfn-wiki/lib/wiki.sh` — `wiki <command> [args]`.
No args prints usage to stderr and exits 2; an unknown command exits 64.

| Command | Args | Effect | Exit codes |
|---------|------|--------|------------|
| `doctor` | `[--install]` | Verify CBM binary resolution (env > `.wiki/config.json` > `~/.local/share/cfn-wiki/` > PATH), `CBM_CACHE_DIR` coherence, portal deps (mmdc, sqlite3). `--install` fetches the pinned CBM release. | 0 healthy/degraded-with-notice, 1 broken |
| `sync` | `[--enrich] [--check] [--no-hooks]` | Re-index via CBM, regenerate projections + feature pages. `--check` fails nonzero on drift between generated content and committed files. | 0 in-sync, 1 drift or failure |
| `build` | `[--static]` | Build self-contained portal HTML (payload inlined, mermaid pre-rendered to SVG with table fallback) into `.wiki/portal/index.html`. | 0 built, 1 failure |
| `serve` | `[--port N] [--stop] [--static]` | Serve the portal (default port 4885) with the annotation server. Opens VS Code Simple Browser by default; set `.wiki/config.json` `"browser": "system"` (or `WIKI_BROWSER=system`) for the system browser, `WIKI_BROWSER=vscode` to force Simple Browser. `--static` serves read-only without persistence. | 0 running, 1 failure |
| `lint` | `[dir]` | Lint generated wiki pages + projections for contract violations (missing Source grounding, bad status tokens, missing sections). | 0 clean, 1 violations |
| `stop` | | Stop a running portal server and clear `.wiki/cache/serve.pid`. | 0 stopped, 1 not running |

## Portal experience

The portal is a codebase reference with four linked views: Architecture,
Features, Data & State, and Change Story. View URLs use `#arch`, `#catalog`,
`#data`, and `#change`; arrow keys move between tabs.

- Architecture pairs the dependency graph with a module index searchable by
  module name or source file. Selecting a module highlights its connections
  and shows source files, related modules, and notes. Node size represents
  indexed symbols; edge width represents relationship weight.
- Features can be searched by name, description, or file and filtered by
  maturity. Reset clears both filters.
- Data & State gives ER and state diagrams dedicated canvases. Each offers
  Fit, 100%, zoom, and Expand controls. Drag or scroll to pan; a focused
  canvas also accepts `+`, `-`, and `0` (Fit). Escape closes the expanded
  diagram and restores focus. Diagram paper stays light in both themes so
  pre-rendered Mermaid colors remain legible.
- State machines are searchable by entity, source, state, trigger, or guard.
  Transition tables remain available below SVG diagrams and serve as the
  fallback when Mermaid rendering is unavailable.
- Notes autosave through the local annotation server. Save errors retain
  the draft and show feedback; file-based viewing disables editing.
  Theme choice is saved locally in the browser.

Keep the portal self-contained and preserve the existing payload, Mermaid
pre-rendering, and annotation API contracts when changing its UI.

Browser regression coverage: `node tests/test-wiki-portal-ui.cjs` with
Playwright installed. `PLAYWRIGHT_MODULE` may point to an existing module,
and `CHROME_PATH` may select an installed Chrome executable. Tests use
throwaway wiki data and ephemeral servers, including SVG and table fallback
cases. The build/server suite remains `bash tests/test-wiki-portal.sh`.

## Environment

`.claude/skills/cfn-wiki/lib/wiki-env.sh` is the sole exporter of
`CBM_CACHE_DIR`, `WIKI_PORT`, and `CBM_BIN`. Every consumer sources it; split
exports cause silent CBM `CONNECTION_CLOSED` failures that doctor exists to
catch. `lib/cbm-index.sh` runs the CBM index and snapshots the sqlite cache to
`<repo>/.wiki/cache/cbm.db` — the live CBM database is never read directly
(journal mode `delete`).

## Degraded and empty states

- No CBM binary: indexing degrades to git-only extraction with a visible
  `DEGRADED:` notice and exit 0.
- No features extracted: the portal renders an empty state; sync still writes
  valid projections.
- Stale store: `wiki sync --check` fails nonzero on fingerprint drift; wired to
  CI, husky post-commit regen, and a warn-only SessionStart notice.

## Files

- `lib/wiki.sh` — dispatcher (`main`)
- `lib/wiki-env.sh` — single source for `CBM_CACHE_DIR` / `WIKI_PORT` / `CBM_BIN` (`wiki_env_load`)
- `lib/cbm-index.sh` — CBM index + sqlite snapshot (`wiki_cbm_index`)
- Later phases add: fingerprint, extract-features, import-existing,
  merge-enrichment, gen-projections, gen-pages, lint-pages, sync, view-*
  modules, and `portal/` (template, build, server, serve).

## Triggers

Use when the user says "wiki", "codebase wiki", "wiki portal", "feature
catalog", "architecture map", or asks how a feature is wired across the repo
and wants a visual answer. Prove-out repo is claude-flow-novice; sibling repos
adopt by `.wiki/config.json` only.
