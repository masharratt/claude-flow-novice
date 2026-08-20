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
  `lane-report-<slug>-*.json`, `test-output-<slug>-*.txt`,
  `.VERIFY_<slug>.bless.json`, `run-plan-<slug>.json`, and
  `cfn-events-<slug>.jsonl`.

### Optional
- `--out <path>`: Output HTML path. Default: `<root>/planning/<slug>/workbench_<slug>.html` (the plan's own directory).
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
| VERIFY doc | `<root>/planning/<slug>/VERIFY_<slug>.md` | Markdown AC table (parsed by header name) + embedded manifest with `acs[]` |
| Results JSON | `<root>/planning/<slug>/VERIFY_RESULTS_<slug>.json` | Per-AC status/evidence overrides |
| Bless ledger | `<root>/planning/<slug>/.VERIFY_<slug>.bless.json` | structure_changed / predicate_changed / verdict |
| Lane reports | `<root>/tmp/lane-report-<slug>-*.json` AND `/tmp/lane-report-<slug>-*.json` | Per-lane pass rate |
| Test outputs | `<root>/tmp/test-output-<slug>-*.txt` AND `/tmp/test-output-<slug>-*.txt` | Test runner summary line |
| Screenshots | `<root>/tests/screenshots/<slug>-iteration-*.png` | Base64-inlined as `data:image/png;base64,...` |
| Run plan | `<root>/planning/<slug>/run-plan-<slug>.json` | Lane roster (id/name/phase) for the Roster section |
| Events feed | `/tmp/cfn-events-<slug>.jsonl` AND `<root>/tmp/cfn-events-<slug>.jsonl` | Live lifecycle events (written by `emit-event.sh`) for the Events section, and lane status (`lane_spawned`/`lane_landed`) in the Roster section |
| Git log | git repo at `<root>` | Branch + commit count |

Every `planning/<slug>/` row above is resolved through `.claude/skills/cfn-megaplan/lib/plan-paths.sh` (exposed to the section libs as `plan_path <root> <slug> <basename>`): the plan's own directory first, the legacy flat `<root>/planning/<basename>` second. Plans written before per-plan directories therefore still render, and a missing-source gap names the canonical per-plan location so the message doubles as the fix.

### Run plan file (`planning/<slug>/run-plan-<slug>.json`)

Written once per run (Phase 2, before lanes are spawned). Drives the Roster
section's headline count and table rows.

```json
{
  "slug": "<slug>",
  "generated_at": "ISO8601",
  "phases": ["Phase 2", "Phase 3"],
  "lanes": [
    {"id": "frontend", "name": "Frontend UI", "phase": "Phase 2"}
  ]
}
```

`lanes[].id` is required (used to match lane-report files and events).
`name`/`phase` are optional and fall back to `id` / `-` in the table.

### Events feed (`cfn-events-<slug>.jsonl`)

Appended to by `emit-event.sh` (see below), one compact JSON line per event:
`{"ts":"<ISO8601 UTC>","event":"<type>", ...optional lane/phase/detail}`.
Both the project-root copy (`<root>/tmp/...`) and the runtime copy (`/tmp/...`)
are read and merged; malformed lines are skipped silently, never rendered raw.

## Outputs

- stdout: three-line summary (rendered path, byte size, data-gap count).
- HTML file at `--out` (default `<root>/planning/<slug>/workbench_<slug>.html`).

## Usage

```bash
# Manual render at any checkpoint
$HOME/.claude/skills/cfn-workbench/render.sh --slug 1.18.x

# Custom output path
$HOME/.claude/skills/cfn-workbench/render.sh --slug 1.18.x --out /tmp/wb.html

# Text-only (no screenshots)
$HOME/.claude/skills/cfn-workbench/render.sh --slug 1.18.x --no-screenshots

# Cap screenshots
$HOME/.claude/skills/cfn-workbench/render.sh --slug 1.18.x --max-screenshots 10

# Point at a fixture root (used by tests)
$HOME/.claude/skills/cfn-workbench/render.sh --slug workbench_9col \
  --root .claude/skills/cfn-workbench/tests/fixtures \
  --out /tmp/wb.html
```

### Live watch mode (`watch.sh`)

Re-renders automatically as run data changes, so an already-open page (opened
with `--live <secs>`) picks up new content via its meta-refresh without a
manual re-run.

```bash
# Start a background watcher for a run, polling every 10s (default)
$HOME/.claude/skills/cfn-workbench/watch.sh --slug 1.18.x --interval 10

# Check status / stop it
$HOME/.claude/skills/cfn-workbench/watch.sh --slug 1.18.x --status
$HOME/.claude/skills/cfn-workbench/watch.sh --slug 1.18.x --stop

# Run the poll loop in the foreground (used by tests)
$HOME/.claude/skills/cfn-workbench/watch.sh --slug 1.18.x --foreground
```

Each tick fingerprints the run's data sources (manifests, VERIFY doc/results,
bless ledger, run plan, lane reports, test outputs, events feed, screenshots);
on a change (or the first tick) it re-renders via `render.sh --live <interval>`.
A render failure is logged but never kills the watch loop. Idempotent: a
second `--slug` start with a live pidfile is a no-op. Pidfile:
`/tmp/cfn-workbench-watch-<slug>.pid`; log: `/tmp/cfn-workbench-watch-<slug>.log`.

### Emitting lifecycle events (`emit-event.sh`)

Appends one event to the run's live events feed, read by the Events section
and the Roster section's lane-status derivation.

```bash
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug 1.18.x --event loop_started
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug 1.18.x --event lane_spawned --lane frontend --phase "Phase 2"
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug 1.18.x --event lane_landed --lane frontend --detail "pass_rate=100%"
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug 1.18.x --event gate_verdict --detail "9/10 pass"
```

Closed event-type set: `loop_started phase_started lane_spawned lane_landed
gate_started gate_verdict patch_applied verify_started loop_finished`. Unknown
event type or missing `--slug`/`--event` exits 2. `--lane`/`--phase`/`--detail`
are optional and only appear in the emitted JSON when passed. `--file <path>`
overrides the default output path (`/tmp/cfn-events-<slug>.jsonl`); orchestrator
call sites wrap every call with `|| true` so a bad emit never blocks the loop.

## HTML sections

1. **Header**: slug, branch, iteration count, verdict pill, generated_at, and a
   live staleness pill (`#wb-staleness`) that ticks `updated Ns/Nm ago` every
   second client-side (JS off falls back to the static `generated <time> UTC`
   text). Pill class flips `stale-ok` (< 120s) -> `stale-warn` (120-599s) ->
   `stale-bad` (>= 600s) purely in inline `<script>`/`<style>`, no re-render
   needed for the color to change.
2. **Iteration Timeline**: pass rate, gate verdict, commit count per iteration.
3. **Lane Roster**: headline `N of M lanes landed`; table of every lane from
   `run-plan-<slug>.json` with derived status (`landed` / `in-flight` /
   `pending`) and, for in-flight lanes, a `Since HH:MM` from their
   `lane_spawned` event. Missing run plan is a data gap; the section still
   renders with an empty-state card.
4. **Events**: live feed table (Time, Event, Lane, Phase, Detail) from
   `cfn-events-<slug>.jsonl`, newest first, capped at 30 rows with an
   `N earlier events not shown` note past the cap. Missing events file is a
   data gap; the section still renders with an empty-state card.
5. **Per-Iteration Detail**: lanes (pass rate, passed/failed), test summary,
   screenshot grid (click to enlarge via `<details>`), gate events.
6. **Acceptance Criteria**: id, check, kind, status pill, evidence, reference.
7. **Vote Ledger**: every suggestion id with the latest status (accepted,
   rejected, open).
8. **Tech-Debt Ledger**: suggestions tagged `tech-debt` or matching `cfn:`.
9. **Bless Ledger**: structure_changed and predicate_changed lists + verdict.
10. **Footer**: command, input count, byte size, data-gap warnings.

Section nav (`section_nav` in `lib/html.sh`) jumps to every section above by
anchor id (`#sec-timeline`, `#sec-roster`, `#sec-events`, `#sec-detail`, ...).

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
bash $HOME/.claude/skills/cfn-workbench/tests/test-render.sh
bash $HOME/.claude/skills/cfn-workbench/tests/test-live-sections.sh
bash $HOME/.claude/skills/cfn-workbench/tests/test-watch.sh
```

`test-render.sh`: 75 assertions cover arg parsing, empty-state, 5/9-column AC
tables, HTML escaping, self-containment, screenshot caps, no-screenshots mode,
data-gap recording, all ledgers, no em dashes, and HTML structure.

`test-live-sections.sh`: staleness banner (element/thresholds/CSS classes),
Roster (headline count, landed/in-flight/pending derivation, `Since`, empty
state on missing run plan), Events (row rendering, malformed-line skip, 30-row
cap + overflow note, empty state on missing file), `emit-event.sh` (exit
codes, optional-key handling, `--file` override, append-not-overwrite,
default output path), and nav/self-containment/no-em-dash regressions against
the new sections.

`test-watch.sh`: arg/exit contract, `--status`/`--stop` lifecycle, foreground
loop with `WORKBENCH_WATCH_MAX_TICKS`, fingerprint-triggered re-render vs.
no-op when nothing changed, pidfile lifecycle, idempotent double start.

## cfn markers

- `lib/html.sh`: none.
- `lib/section-iteration-detail.sh`: `cfn: env-string passing` on
  `WORKBENCH_SHX_SHOW`. Replace with a proper include/exclude dataclass if the
  iteration block grows more parameters.
- `render.sh`: `cfn: defensive belt-and-suspenders` on the in-render
  self-containment check. Run on every render so a regression in a section
  lib cannot silently leak an external src/href.
- `lib/section-roster.sh`: emits its own small inline `<style>` for the
  `lane-landed`/`lane-inflight`/`lane-pending` pill classes rather than adding
  rules to `default_style()` in `lib/html.sh` (out of scope for this lane;
  `lib/html.sh` edits here are nav-only per the live-transparency contract).
  Upgrade trigger: fold these 4 rules into `default_style()` next time
  `lib/html.sh` is touched for an unrelated reason.
