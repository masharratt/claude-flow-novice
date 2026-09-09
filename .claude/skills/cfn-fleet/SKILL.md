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
  fleet.env          FLEET_WORKTREE=off|on, FLEET_DB=none|docker (init sets);
                     optional knobs: FLEET_DEFAULT_ENGINE, FLEET_TMUX_SOCKET,
                     FLEET_TRUST_TIMEOUT, FLEET_BANNER_TIMEOUT
  roster.tsv         one row per workstream, flock-guarded, tab-separated:
                     ws_id name task status claims landed_sha
                     migration_num scratch_db heartbeat notes engine
  briefs/WSxx.md     worker briefs (copy from briefs/BRIEF_WS.md, fill in)
  handoffs/          HANDOFF_WSxx.md, written by `fleet handoff`
  engines.env        per-run copy of the engine registry (names and flags
                     only, never credential values)
  COORDINATION.md    the protocol doc workers are held to
  RUNBOOK.md         master session step sequence
  .roster.lock       flock target for roster writes
```

Status vocabulary (closed): `pending | started | working | blocked | landed |
done | dead`.

## Subcommands

| Command | Purpose |
|---|---|
| `init <slug> [--worktree] [--db none\|docker]` | Scaffold run dir; refuses duplicates (exit 65); installs the engine registry |
| `add WSxx "task" [--name s] [--claims p1,p2] [--engine e]` | Register a workstream (status=pending, heartbeat=0); `--engine` defaults to `claude-sub` |
| `status [--tsv]` | Aligned table: ws_id, status, task(40), #claims, heartbeat age |
| `claim WSxx <path...>` | Register file ownership; refuses overlapping claims (65), prefix dirs and glob scopes count as overlap |
| `heartbeat WSxx [note...]` | Liveness ts; latest note replaces the previous |
| `commit WSxx -m <msg>` | Guarded commit: stages ONLY claimed paths, refuses (66) on unclaimed dirty files |
| `migrate-next WSxx <dir>` | Reserve next migration number (max+1, flocked); no silent collisions |
| `spawn WSxx [--spares N] [--engine e] [--no-tmux] [--dry-run]` | Launch the worker's engine in a tmux pane on the run's socket, verify its banner, then send the thin prompt. Engine precedence: `--engine` > roster column > `FLEET_DEFAULT_ENGINE` > `claude-sub` |
| `land WSxx [--no-ff]` | Worktree: merge `fleet/<WSxx>` + remove worktree; main: mark landed |
| `handoff WSxx` | Write `handoffs/HANDOFF_WSxx.md` for compaction restart into a spare |
| `db WSxx` / `db-clean [--all]` | Scratch postgres containers (only when `FLEET_DB=docker`) |
| `watch [--stale-min N] [--poll S] [--once] [--emit-events]` | Event lines: `CHANGE`/`STALE`/`DEAD`/`DEAD <ws> (pane exited)`/`ALL-DONE`; Monitor-tool ready. Pane-exit DEAD fires when a started/working row's tmux session is gone (spawn `exec`s the engine, so the pane dies with it). `--emit-events` also feeds cfn-workbench (below) |

Exit codes: `0` ok, `64` usage, `65` data error (bad WS id, overlap, duplicate),
`66` guard refusal, `71` internal.

## Worker sessions

A worker's brief is `briefs/WSxx.md` (copy `briefs/BRIEF_WS.md` and fill in:
task, claims, allowed commands, done criteria). The spawn prompt is one thin
line: "read briefs/WSxx.md and start; coordinate only via roster files". Workers
commit through `fleet commit`, heartbeat as they work, and never touch another
row's claims. Spare sessions (`<name>-spare<k>`) stay empty until a handoff.

## Engines

A workstream's engine is chosen at `fleet add` / `fleet spawn` (`--engine`), so
one master session can run a mixed fleet. Each engine is a full worker: same
roster protocol, same claims rule, same commit guard.

Third-party engines (`glm`) follow a least-privilege data-access rule: they may
write code targeting Airtable, Attio, or the database, but their panes never
carry data-system credentials (the registry `unset` list strips them), and the
protocol docs tell them not to access those systems live. Projects can harden
this further in their own CLAUDE.md/AGENTS.md; the gg-projects repos carry such
a rule block.

| Engine | What runs in the pane | Who pays | Banner proof (regex in registry) | Master shell needs |
|---|---|---|---|---|
| `claude-sub` | `claude --model sonnet --permission-mode bypassPermissions` | Claude subscription (Team/Max/Pro) | `Claude Team\|Claude Pro\|Claude Max` (e.g. "Sonnet 5 with high effort · Claude Team") | nothing (spawn unsets every relay var in the pane) |
| `glm` | `claude --model glm-5.3-flash` pointed at z.ai | z.ai API billing | `glm-` (e.g. "glm-5.3-flash with high effort · API Usage Billing") | `export FLEET_ZAI_TOKEN=<z.ai token>` before spawn |
| `codex` | `codex --sandbox workspace-write --ask-for-approval never` | ChatGPT subscription | `provider: openai\|OpenAI Codex` (e.g. "model: gpt-5.6-sol provider: openai") | nothing (an `OPENAI_API_KEY` in the master env must be unset in the pane; spawn refuses otherwise) |

Registry: `templates/engines.env`, copied into the run dir by `fleet init`
(`engines.env`). One line per engine, 7 ` | `-separated fields: name, bin, args,
set (NAME=$SOURCE_VAR or NAME=literal), unset, trust_keys, banner_regex. It
stores variable NAMES and non-secret flags only; `$SOURCE_VAR` references are
resolved from the master shell at spawn time and credential values reach tmux
via argv (`-e K=V`), never the run dir, so `planning/fleet-*` stays committable
and `grep -r <token> planning/fleet-*` finds nothing. Missing or empty source
var: spawn exits 66 naming the variable (e.g. `FLEET_ZAI_TOKEN`).

Spawn order per pane, all on the run's dedicated tmux socket
(`FLEET_TMUX_SOCKET` in fleet.env, default `fleet-<slug>`; kill a whole run
with `tmux -L fleet-<slug> kill-server`):

1. `new-session -e K=V` for every set-var, then one pane command:
   `export FLEET_RUN_DIR=<run dir>; unset <unset list>; exec <bin> <args>`.
   The `exec` makes the pane die with the engine, which is what `fleet watch`'s
   `DEAD <ws> (pane exited)` detects.
2. Trust prompt: both `claude` and `codex` stop on a folder-trust prompt on
   first launch in a directory (worktree mode hits it every run). Spawn polls
   `capture-pane` up to `FLEET_TRUST_TIMEOUT` (default 15s) and sends the
   engine's `trust_keys` only if the prompt is actually seen.
3. Banner gate: spawn polls up to `FLEET_BANNER_TIMEOUT` (default 20s) for the
   engine's `banner_regex`. Match: roster `started`, heartbeat stamped, then
   and only then the thin prompt. Timeout: the row stays `pending`, the last
   pane lines print, exit 66. A worker on the wrong model never reaches
   `started`; confirm the banner line in spawn's output before trusting a run.

Codex specifics: it reads `AGENTS.md`, not `CLAUDE.md`, so keep briefs
self-contained or point at the repo's CLAUDE.md explicitly. It has no inbound
messaging: the master reaches a codex worker only through roster files, so the
brief must carry heartbeat/commit/handoff instructions (see
`templates/BRIEF_WS.md`). Codex workers may run `fleet commit` themselves under
the same claim rules (workspace-write sandbox). Billing guard: subscription
billing needs `~/.codex/auth.json` `auth_mode: chatgpt` and no `OPENAI_API_KEY`
in the pane; a set key silently bills the API, so spawn refuses (66) unless the
engine's unset list covers it. GLM specifics: `total_cost_usd` in Claude Code
output is an Anthropic list-price estimate, not z.ai spend; do not surface it
as cost.

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

## Traps measured in real runs (read before running a fleet)

Four families, all from runs on 2026-09-08 and 2026-09-09. Each one leaves the roster
looking healthy while the workstream is not.

### 1. Always export FLEET_RUN_DIR first

`fleet_run_dir()` (`lib/common.sh:33`) picks the newest `planning/fleet-*` directory by
mtime, and roster writes rename a temp file inside the dir, which bumps mtime. So `fleet add`
right after `fleet init` can write its rows into a PREVIOUS run's `roster.tsv`. Observed
2026-09-09: three new rows landed in the prior run's roster, and `fleet status` showed that
run's landed rows beside them, which is how it was caught. Rows in the wrong roster mean
claims, commits and watch all address the wrong run.

```bash
export FLEET_RUN_DIR=$PWD/planning/fleet-<slug>
```

Put that line in the master shell before any fleet command, in every worker brief, and in
the tmux launch. Repair a stray row with `sed -i $'/^WS0N\t/d' <old roster>`, then confirm
`git diff` on that file is empty.

### 2. The pane inherits whatever the tmux server carries, so spawn verifies the banner

Current behaviour: `fleet spawn` starts the pane on the run's dedicated socket
with the engine's set-vars passed via `-e K=V`, sends one pane command that
unsets every relay var the engine names and then `exec`s the engine, waits for
the engine's banner (see the Engines section), and only after a banner match
does it send the thin one-line prompt pointing at the brief path. `--no-tmux`
still exists: it prints those exact commands with token values left as
`$SOURCE_VAR` references, safe to paste into a ledger.

Why the gate is strict (measured 2026-09-08/09, the runs that produced these
traps): spawn used to only `tmux new-session` and type the whole brief at a
bash prompt, never launching any engine. Worse, the tmux server's global env
carried `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` and
`ANTHROPIC_DEFAULT_*_MODEL` from a third-party relay, which every new pane
inherited (a stale pane reported `unrecognized_model glm-5.3`). A worker
silently on a relay model, or a brief typed into bash, wastes the whole
workstream while looking alive on the roster. The banner gate exists so that
can never pass silently again: no banner match, no `started`, no prompt.

Residual case spawn cannot fix: the target repo's own `.claude/settings*.json`
`env` block carrying ARMED (no `_` prefix) `ANTHROPIC_*` keys. Claude Code
applies those at startup regardless of the pane env; spawn warns with
file:line. Disarm by renaming the key with a `_` prefix.

Worktree-mode specifics:

- `fleet spawn` reuses an existing `fleet/WSxx` branch from an earlier run, so the worktree
  checks out that stale tip rather than the integration branch. Check
  `git merge-base --is-ancestor` and then `git -C <wt> reset --hard <integration branch>`
  right after spawn. Delete merged `fleet/WSxx` branches at the end of a run.
- Symlink `node_modules` at the root AND per package into the worktree, and pass an
  **absolute** worktree path to the link script: a relative path writes relative `@ggi/*`
  symlink targets that resolve nowhere.
- A repo-wide `pnpm typecheck` inside a worktree reds every package the link script skipped,
  so ask workers for a typecheck scoped to their own files.
- Do not commit the `planning/fleet-*` run dir before spawning, or the worktree resolves its
  own stale copy of the roster.

### 3. `landed` means "has a commit", not "is finished"

`fleet commit WSxx` sets the roster row to `landed` on the worker's FIRST commit. Any watch
keyed on status prints ALL-DONE and exits while later tasks are still running. Both the
built-in `fleet watch` and a hand-rolled watcher exited early this way.

Key completion on the worker's own heartbeat note starting `done:` plus a clean worktree.
The master's `fleet land` is what actually merges, and it is fast-forward only: run
`git -C <wt> rebase <integration branch>` first whenever that branch moved. A hot-file
conflict (a peer bullet under the same date in a changelog) is resolved by keeping both
bullets and `GIT_EDITOR=true git rebase --continue`.

### 4. `fleet commit` drops the untracked half of a directory claim

2026-09-08: a workstream claimed a directory prefix (trailing slash) plus six explicit file
paths. `fleet commit --force-with-note` committed only the six. Left dirty: a new module and
its test file (both untracked) inside the claimed dir, an edited sibling in that same dir,
and the package's `package.json`, which the worker had extended but nobody had claimed. HEAD
then imported an uncommitted module, and a peer's push carried the broken commit to the
integration branch before the master noticed, failing two Preview builds.

- Prefer explicit file paths over a directory prefix in `--claims`, and list the new files
  you expect the worker to create.
- Claim the `package.json` of any package whose exports the worker must extend.
- After EVERY landing, run `git status --short` and compare against the claim list before
  anything is pushed. Any dirty claimed path means the commit is incomplete. The fix is a
  follow-up commit of the missing paths.

### Two smaller ones

- **Parsing the roster with `while IFS=$'\t' read` shifts columns.** Tab is IFS whitespace,
  so consecutive empty fields (landed_sha, migration_num, scratch_db) collapse and the
  heartbeat lands in the wrong variable. Parse with `awk -F'\t'` and hand bash a `|`-joined
  record instead.
- **Background poll loops die under memory pressure.** Two `until ... sleep` waits were
  stopped for low memory while a peer session's dev server held 1.5 GB. Use the Monitor tool
  for waits (non-persistent, one emitted line, then exit) and keep any loop at `sleep 30`.
- **A worker's `git show --stat HEAD` reporting `Bin` is diff-side, not the file.** It happens
  when the parent blob was binary. Verify the final blob with `file` and a NUL count instead
  of trusting the diffstat.
