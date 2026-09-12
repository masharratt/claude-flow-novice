---
name: nitpicky
description: "Pre-launch visual walkthrough of a full app: spawns parallel per-lens review agents (consistency, friction, verbose language, visual polish, accessibility) that screenshot every page and state, merges findings into a browser triage portal (fix / deny / defer with notes, autosaved to decisions.json on disk via a local server), and exports a hand-off checklist for the implementation team. Use when preparing an app for launch or human testing."
version: 1.1.0
tags: [review, ux, polish, launch-readiness, playwright, walkthrough, triage]
status: dev
category: review
---

# Nitpicky

## Purpose

Catch the small defects that get normalized during a build: inconsistent verbs,
dead-end states, wordy copy, off-by-pixels polish, missing labels. Parallel agents
walk the whole running app, one concern each, with screenshot proof for every finding.
You triage the merged findings in a local browser page (no server), and the export is
a checklist an implementation team can execute.

This skill spawns agents by design (like cfn-loop-task); the coordinator (you, the
main chat) spawns them. Depth limit exception applies.

## Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `APP_URL` or `PROJECT_DIR` | arg 1 | Yes | Running app URL, or project dir (find/start the dev server) |
| `--lens a,b,c` | flag | No | Restrict lenses (default: all five) |
| `--skip lens` | flag | No | Run all but this lens (repeatable) |

## Outputs

| Path | What |
|------|------|
| `<project>/planning/nitpicky/<run-id>/` | Run dir: `findings/`, `screenshots/`, `run.json`, `findings.json`, `review.html`, `decisions.json` (as you triage), `server.json`, `CHECKLIST.md` (after export) |
| `<run>/findings/<lens>.json` | Per-agent output, exactly per schema |
| `<run>/review.html` | Triage page (findings inlined; served by the portal server) |
| `<run>/decisions.json` | **Authoritative** decision record, written by the server on every click |
| `<run>/server.json` | Portal URL, port, pid, start time — recovery info |
| `<run>/CHECKLIST.md` | Final hand-off checklist (written to disk by the Export button) |

Exit behavior of the coordinator: report run dir + review page path, then stop and
let the user triage. Do not auto-export or auto-implement anything.

## Workflow

1. **Resolve the app URL.** URL given: verify it responds (`curl -s -o /dev/null -w '%{http_code}'`).
   Project dir given: detect the dev server (package.json scripts, project port
   references, running port) and start it if needed; confirm the URL responds before
   proceeding. Never walk a dead app.
2. **Scaffold the run:**
   ```bash
   RUN_DIR=$("$HOME"/.claude/skills/nitpicky/lib/new-run.sh <project-root> "$APP_URL")
   ```
3. **Spawn one agent per lens in ONE message** (parallel). Default lenses:
   `consistency`, `friction`, `verbose-language`, `visual-polish`, `accessibility`.
   Agent type: one with Playwright browser access (playwright-tester, or
   general-purpose where MCP browser tools are available). Brief template below,
   keep it under ~2KB.
   - WSL2 RAM: 5 concurrent browser agents fit a 48GB box. On 16GB spawn in two
     waves (3 + 2) and say so in each brief's wave note.
4. **Wait for every completion notification.** Never treat quiet logs or stable
   output files as done.
5. **Merge and validate:**
   ```bash
   python3 "$HOME/.claude/skills/nitpicky/lib/merge-findings.py" --run-dir "$RUN_DIR"
   ```
   Exit 1 (schema/parse errors): re-brief the offending agent for just the repair.
   Exit 0 with `missing-screenshots=[...]`: re-brief the agent to re-shoot those
   proofs, then re-merge. Exit 2: agent produced nothing — re-run that lens.
6. **Start the portal server and open the page:**
   ```bash
   nohup python3 "$HOME/.claude/skills/nitpicky/lib/server.py" \
     --run-dir "$RUN_DIR" --port 0 > "$RUN_DIR/server.log" 2>&1 &
   sleep 1
   cat "$RUN_DIR/server.json"   # url, port, pid — verify the server is alive
   curl -s -o /dev/null -w '%{http_code}\n' "$(python3 -c "import json;print(json.load(open('$RUN_DIR/server.json'))['url'])")"
   "$HOME"/.claude/skills/nitpicky/lib/open-site.sh "<url from server.json>"
   ```
   Launch it detached and VERIFY it survives the launching command (a server that
   dies between assistant turns is the #1 failure mode of this portal pattern —
   the user sees "Not saved" and their pending edits sit only in the page).
   Tell the user: every click writes `decisions.json` on disk; unsaved edits are
   kept in the browser and a Retry button appears if the server drops; filter
   chips narrow the list; "Next undecided" walks the queue; Export writes
   CHECKLIST.md straight into the run dir.
7. **Hand-off.** When the user finishes triage (or asks mid-review), Export has
   written `$RUN_DIR/CHECKLIST.md`. Read `decisions.json` (or `GET /api/decisions`)
   to act on decisions yourself. Never parse CHECKLIST.md as the decision source;
   the JSON is authoritative. Keep explanations verbatim; a deny with an
   explanation may authorize an alternative change — do not collapse it to "no work".

### Recovery runbook (user reports "Not saved")

1. Read `$RUN_DIR/server.json` for the pid/port; check the process: `ps -p <pid>`,
   `tail "$RUN_DIR/server.log"`.
2. Restart on the SAME port (`--port <from server.json>`), detached, log appended.
3. Tell the user to click **Retry save** in the still-open page — do NOT tell them
   to refresh first; pending edits live in the page and drafts survive in browser
   storage keyed by run id (restored automatically after a reload too).
4. Verify convergence: `decisions.json` gains the missing records.

### Server rules

- One server per run dir. Never two processes on the same `decisions.json`; the
  server caches state in memory and would overwrite external edits.
- Do not hand-edit `decisions.json` while the server runs. Stop it first, or POST
  a correction to `/api/decision`.
- A malformed `decisions.json` makes the server refuse to start (exit 2) rather
  than clobber it — fix the file by hand, then restart.

## Agent brief template

```text
Nitpicky walkthrough. Lens: <lens>.

Read these two files FIRST; they are your full contract:
- $HOME/.claude/skills/nitpicky/lib/lenses.md
- $HOME/.claude/skills/nitpicky/lib/findings-schema.md

App under review: <APP_URL>
Screenshots dir: <RUN_DIR>/screenshots/
Write findings to: <RUN_DIR>/findings/<lens>.json

Summary: this app is being prepared for launch and human testing. Walk the ENTIRE
app through your lens only. Extreme detail and thoroughness are the job: every page,
every state, every small defect. Expected finding volume for a real app is high; do
not stop early. Every finding needs a screenshot saved into the screenshots dir
named <lens>-<short-slug>.png and referenced as "screenshots/<file>.png". Output
JSON only, at that path, exactly per schema. No code fixes, no architecture notes.

You are a leaf agent. Do not spawn subagents; do the work yourself.
```

## Resume / re-run

- Decisions persist in the browser's storage keyed by run id. Re-opening
  `review.html` restores them. Same-browser, same-machine persistence only.
- Re-running one lens later: agent rewrites `findings/<lens>.json`, re-run merge.
  Finding ids are content hashes (lens + what), so unchanged findings keep their ids
  and saved decisions still line up. Editing a finding's `what` text changes its id.
- Multiple runs never collide: storage key includes the run id.

## Dependencies

- python3 (stdlib only), bash 4+
- Playwright browser access inside walkthrough agents (MCP tools or project playwright)
- wslview or explorer.exe for auto-open (optional; path printed as fallback)

## Known limitations

- Loopback bind (127.0.0.1) is not authentication: single local reviewer, private
  local files. Never host a run dir publicly.
- Findings are inlined into review.html at merge time; re-run merge after any
  agent output change before reviewing.
- The page still opens from file:// as a fallback (browser storage + manual
  downloads), but the server path is the primary workflow — file mode keeps no
  disk record of decisions until you export.
- Finding ids change if an agent rewrites a finding's `what` text; treat re-run
  decisions as fresh for changed findings.
- Walkthrough agents judge what a browser session can see. Server-rendered states
  behind auth need a test account; seed one before the run if the app requires login,
  and pass credentials in the brief (redact them from the exported checklist).

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | This runbook |
| `lib/new-run.sh` | Scaffold `<project>/planning/nitpicky/<run-id>/` |
| `lib/merge-findings.py` | Validate + merge lens JSONs, assign stable ids, inline payload into review.html |
| `lib/server.py` | Local portal server: serves the run dir, persists decision patches atomically to decisions.json, writes CHECKLIST.md on export |
| `lib/export-checklist.py` | Checklist builder (shared with server) + CLI regeneration from any decisions file |
| `lib/open-site.sh` | Open a URL or review.html in WSL2 (wslview / explorer.exe fallbacks) |
| `lib/lenses.md` | Agent contract: thoroughness rules + the five lens definitions |
| `lib/findings-schema.md` | Agent output schema |
| `review/template.html` | Triage page template: dual mode (server API + draft queue, or file:// + localStorage) |
| `tests/test-nitpicky.sh` | Unit + server tests: merge, id stability, validation, atomic writes, export, traversal |

## Version History

- **1.1.0** (2026-09-12): Decision portal server. Decisions write to
  `decisions.json` on disk per click (atomic tmp+rename, validated patches,
  origin-checked). Browser draft queue survives server outages (Retry button);
  export writes CHECKLIST.md directly into the run dir. Aligned with the
  `browser-decision-portal` handoff lessons (projects-gg planning doc).
- **1.0.0** (2026-09-12): Initial release. Five lenses, per-lens agents, static
  triage page with autosaved decisions, checklist export.
