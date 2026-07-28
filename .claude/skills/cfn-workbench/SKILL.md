---
name: cfn-workbench
version: 1.0.0
tags: [reporting, render, html, observability, loop]
status: draft
author: CFN Team
description: Render a self-contained HTML progress page from scattered CFN Loop run data (manifests, VERIFY doc, lane reports, screenshots, bless ledger).
dependencies: [bash, jq, base64, git]
created: 2026-07-28
updated: 2026-07-28
complexity: Medium
keywords: [workbench, render, html, progress, loop-report, self-contained]
triggers: [manual-checkpoint, phase-5-report, loop-summary]
performance_targets:
  execution_time_ms: 2000
  success_rate: 99.0
---

# cfn-workbench

Renders a self-contained HTML progress page for a CFN Loop run. Reads scattered
data (manifests, VERIFY doc, results JSON, bless ledger, lane reports, test
outputs, screenshots, git log) and emits one fresh HTML file per call. The
render is idempotent: same inputs produce the same output, runnable at any
checkpoint.

This is a REPORTING ARTIFACT. It is never a gate. If wired as a Phase 5 hook,
emit WARN only.

## Purpose

A standardized, visually readable HTML replacement for the markdown progress
scraps that accumulate during a Loop run. One file, opens from `file://` with
no server, no CORS, no external requests. Email it, drop it in a PR description,
or open it locally.

## Inputs

### Required
- `--slug <slug>`: Run slug. Matches `VERIFY_<slug>.md`, `<slug>-iteration-*.png`,
  `lane-report-<slug>-*.json`, `test-output-<slug>-*.txt`, and
  `.VERIFY_<slug>.bless.json`.

### Optional
- `--out <path>`: Output HTML path. Default: `<root>/planning/workbench_<slug>.html`.
- `--max-screenshots <N>`: Global cap on embedded screenshots. Default: `50`.
  When more screenshots exist than the cap, the first N are embedded (in
  iteration order) and the rest are listed in a single overflow card with file
  names.
- `--no-screenshots`: Text-only mode. Skips all screenshot embedding.
- `--root <dir>`: Project root to resolve inputs from. Default: three levels
  up from this skill (`.claude/skills/cfn-workbench/` -> repo root). Tests
  point this at a fixtures dir.

### Data sources (all optional except manifests; missing sources become "Data gaps" in the footer)

| Source | Path | Purpose |
|--------|------|---------|
| Manifests | `<root>/.cfn-cache/manifests/cfn-*.json` | Gate timeline + suggestion vote ledger |
| VERIFY doc | `<root>/planning/VERIFY_<slug>.md` | Markdown AC table (parsed by header name) + embedded manifest with `acs[]` |
| Results JSON | `<root>/planning/VERIFY_RESULTS_<slug>.json` | Per-AC status/evidence overrides |
| Bless ledger | `<root>/planning/.VERIFY_<slug>.bless.json` | structure_changed / predicate_changed / verdict |
| Lane reports | `<root>/tmp/lane-report-<slug>-*.json` AND `/tmp/lane-report-<slug>-*.json` | Per-lane pass rate |
| Test outputs | `<root>/tmp/test-output-<slug>-*.txt` AND `/tmp/test-output-<slug>-*.txt` | Test runner summary line |
| Screenshots | `<root>/tests/screenshots/<slug>-iteration-*.png` | Base64-inlined as `data:image/png;base64,...` |
| Git log | git repo at `<root>` | Branch + commit count |

## Outputs

- stdout: three-line summary (rendered path, byte size, data-gap count).
- HTML file at `--out` (default `<root>/planning/workbench_<slug>.html`).

## Usage

```bash
# Manual render at any checkpoint
./.claude/skills/cfn-workbench/render.sh --slug 1.18.x

# Custom output path
./.claude/skills/cfn-workbench/render.sh --slug 1.18.x --out /tmp/wb.html

# Text-only (no screenshots)
./.claude/skills/cfn-workbench/render.sh --slug 1.18.x --no-screenshots

# Cap screenshots
./.claude/skills/cfn-workbench/render.sh --slug 1.18.x --max-screenshots 10

# Point at a fixture root (used by tests)
./.claude/skills/cfn-workbench/render.sh --slug workbench_9col \
  --root .claude/skills/cfn-workbench/tests/fixtures \
  --out /tmp/wb.html
```

## HTML sections

1. **Header**: slug, branch, iteration count, verdict pill, generated_at.
2. **Iteration Timeline**: pass rate, gate verdict, commit count per iteration.
3. **Per-Iteration Detail**: lanes (pass rate, passed/failed), test summary,
   screenshot grid (click to enlarge via `<details>`), gate events.
4. **Acceptance Criteria**: id, check, kind, status pill, evidence, reference.
5. **Vote Ledger**: every suggestion id with the latest status (accepted,
   rejected, open).
6. **Tech-Debt Ledger**: suggestions tagged `tech-debt` or matching `cfn:`.
7. **Bless Ledger**: structure_changed and predicate_changed lists + verdict.
8. **Footer**: command, input count, byte size, data-gap warnings.

## Self-containment guarantees

The renderer asserts, on every run:
- zero `<link>` tags
- zero `src="..."` that is not `src="data:..."`
- zero `href="..."` that is not `href="data:..."`

Every interpolated value passes through `html_escape` (`&`, `<`, `>`, `"`, `'`).
The test suite additionally injects `<script>alert(1)</script>` and
`"><img src=x>` payloads into fixtures and asserts the escaped form appears.

## AC table parser (F3)

The markdown AC table is parsed by HEADER NAME, not column index. Headers vary
across the repo (3, 5, 8, 9 columns observed). The parser builds a
`name -> index` map from the header row, then reads each data row by name. A
missing `reference` column renders as `-` in the display. Tests cover both a
5-column fixture (no reference) and a 9-column fixture (with reference).

## Dependencies

- bash 4+ (associative arrays)
- jq 1.6+
- base64 (for screenshot inlining)
- git (for branch/commit count; absent git is recorded as a data gap, not an error)

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success, including empty-state (missing sources recorded as data gaps). |
| 2 | Usage error (bad args, missing `--slug`, non-existent `--root`). |

## Testing

```bash
bash .claude/skills/cfn-workbench/tests/test-render.sh
```

75 assertions cover: arg parsing, empty-state, 5/9-column AC tables, HTML
escaping, self-containment, screenshot caps, no-screenshots mode, data-gap
recording, all ledgers, no em dashes, and HTML structure.

## cfn markers

- `lib/html.sh`: none.
- `lib/section-iteration-detail.sh`: `cfn: env-string passing` on
  `WORKBENCH_SHX_SHOW`. Replace with a proper include/exclude dataclass if the
  iteration block grows more parameters.
- `render.sh`: `cfn: defensive belt-and-suspenders` on the in-render
  self-containment check. Run on every render so a regression in a section
  lib cannot silently leak an external src/href.
