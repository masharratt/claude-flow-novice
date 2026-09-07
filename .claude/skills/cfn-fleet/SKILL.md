---
name: cfn-fleet
description: "Multi-session fleet coordination: one master Claude Code session coordinates N worker sessions (each a full session with its own context and subagents) through a file-based roster in the target project. Thin messages (control plane), fat files (data plane): roster, briefs, and handoffs carry state; messages only assign/wake/block. Use when running parallel workstreams in one repo without cross-contaminating commits, claims, or migrations."
version: 1.0.0
tags: [fleet, multi-session, coordination, roster, workstreams, claims, tmux]
status: beta
---

# CFN Fleet

**Purpose:** let one master session coordinate N worker Claude Code sessions on
one repo. Each worker is its own full session (own context, own subagent fleet,
usually its own tmux pane). The roster tracks who owns which files, who is
alive, and what landed — so sessions never sweep each other's hunks into
commits or collide on migration numbers.

Distilled from a real 12-workstream run (session e59a7826, 2026-09-05): the
core lesson is **thin messages (control plane), fat files (data plane)**.
Roster + planning files carry all state; SendMessage/tmux prompts only assign,
wake, or block. A message carrying state is a bug — write the file, send the
path.

## Invocation

```bash
$HOME/.claude/skills/cfn-fleet/cli/fleet <subcommand> [args]
```

All commands run against a **run dir**: `planning/fleet-<slug>/` in the target
project. Resolution order: `--run-dir PATH` flag (anywhere in the args) >
`$FLEET_RUN_DIR` env > nearest `planning/fleet-*` walking up from cwd (newest
per level). No run dir: exit 64, "fleet init first".

### Run dir layout

```
planning/fleet-<slug>/
  fleet.env          FLEET_WORKTREE=off|on, FLEET_DB=none|docker (init sets)
  roster.tsv         one row per workstream, flock-guarded, tab-separated:
                     ws_id name task status claims landed_sha
                     migration_num scratch_db heartbeat notes
  briefs/WSxx.md     worker briefs (copy from briefs/BRIEF_WS.md, fill in)
  handoffs/          HANDOFF_WSxx.md, written by `fleet handoff`
  COORDINATION.md    the protocol doc workers are held to
  RUNBOOK.md         master session step sequence
  .roster.lock       flock target for roster writes
```

Status vocabulary (closed): `pending | started | working | blocked | landed |
done | dead`.

## Subcommands

| Command | Purpose |
|---|---|
| `init <slug> [--worktree] [--db none\|docker]` | Scaffold run dir; refuses duplicates (exit 65) |
| `add WSxx "task" [--name s] [--claims p1,p2]` | Register a workstream (status=pending, heartbeat=0) |
| `status [--tsv]` | Aligned table: ws_id, status, task(40), #claims, heartbeat age |
| `claim WSxx <path...>` | Register file ownership; refuses overlapping claims (65), prefix dirs and glob scopes count as overlap |
| `heartbeat WSxx [note...]` | Liveness ts; latest note replaces the previous |
| `commit WSxx -m <msg>` | Guarded commit: stages ONLY claimed paths, refuses (66) on unclaimed dirty files |
| `migrate-next WSxx <dir>` | Reserve next migration number (max+1, flocked); no silent collisions |
| `spawn WSxx [--spares N] [--no-tmux] [--dry-run]` | Launch worker session(s); brief file becomes the first prompt |
| `land WSxx [--no-ff]` | Worktree: merge `fleet/<WSxx>` + remove worktree; main: mark landed |
| `handoff WSxx` | Write `handoffs/HANDOFF_WSxx.md` for compaction restart into a spare |
| `db WSxx` / `db-clean [--all]` | Scratch postgres containers (only when `FLEET_DB=docker`) |
| `watch [--stale-min N] [--poll S] [--once] [--emit-events]` | Event lines: `CHANGE`/`STALE`/`DEAD`/`ALL-DONE`; Monitor-tool ready. `--emit-events` also feeds cfn-workbench (below) |

Exit codes: `0` ok, `64` usage, `65` data error (bad WS id, overlap, duplicate),
`66` guard refusal, `71` internal.

## Worker sessions

A worker's brief is `briefs/WSxx.md` (copy `briefs/BRIEF_WS.md` and fill in:
task, claims, allowed commands, done criteria). The spawn prompt is one thin
line: "read briefs/WSxx.md and start; coordinate only via roster files". Workers
commit through `fleet commit`, heartbeat as they work, and never touch another
row's claims. Spare sessions (`<name>-spare<k>`) stay empty until a handoff.

## Modes

Main-in-place is the default: everyone works in the repo checkout, which is why
claims and the commit guard are not optional. Worktree mode (`init --worktree`)
gives each WS its own checkout under `.claude/worktrees/` and branch
`fleet/<WSxx>`; claims are still tracked in the shared roster, `fleet land`
merges back. Per-run settings live only in that run's `fleet.env` — nothing
global.

## Workbench dashboard (opt-in)

`fleet watch --emit-events` bridges the roster into cfn-workbench's HTML
progress page. No workbench changes required. Each scan regenerates
`<run-dir>/run-plan-<slug>.json` (one lane per workstream, id = roster name
lowercased) and maps transitions onto workbench's event feed:

| Fleet | Workbench event |
|-------|-----------------|
| first `--emit-events` scan | `loop_started` (once, marker in run dir) |
| status → `started` | `lane_spawned --lane <name>` |
| status → `landed` | `lane_landed --lane <name>` |
| `ALL-DONE` | `loop_finished` |

STALE/DEAD and non-status changes have no workbench event type — they stay on
watch stdout. Emitter path overridable via `FLEET_WB_EMIT_EVENT`; a missing
emitter never fails the watch loop.

Master session recipe:

```bash
# terminal 1: fleet events (also feeds workbench)
$HOME/.claude/skills/cfn-fleet/cli/fleet watch --emit-events
# terminal 2: live HTML dashboard (roster cards, timeline, events)
$HOME/.claude/skills/cfn-workbench/render.sh --slug fleet-<slug> --root <project>
```
