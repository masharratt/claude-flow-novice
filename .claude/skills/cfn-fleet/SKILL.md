---
name: cfn-fleet
description: "Multi-session fleet coordination: one master Claude Code session coordinates N worker sessions (each a full session with its own context and subagents) through a file-based roster in the target project. Thin messages (control plane), fat files (data plane): roster, briefs, and handoffs carry state; messages only assign/wake/block. Use when running parallel workstreams in one repo without cross-contaminating commits, claims, or migrations."
version: 1.2.1
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
Roster + planning files carry all state; mailbox messages only assign, wake,
report or block. A message carrying state is a bug — write the file, send the
path. Since mailbox stage 5 (2026-10-16) every worker, Mac and server, talks to
the master through the agent mailbox (see "Mailbox" below); tmux typing and
ssh polling are the fallbacks.

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
                     FLEET_TRUST_TIMEOUT, FLEET_BANNER_TIMEOUT, FLEET_TICK_SECS,
                     FLEET_AUTOSAVE_SECS
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
  goal.txt           one-line run goal (init <slug> <goal words>); dashboard header blurb
  files/WSxx.txt     per-worker now-editing paths (heartbeat --files); dashboard card section
  glossary.tsv       optional code key (code TAB meaning) for the dashboard:
                     Code key panel + inline tooltips on codes in task/notes
```

Status vocabulary (closed): `pending | spawning | started | working | blocked |
landed | done | dead`. `spawning` is set by `fleet spawn` while a launch is in
progress (banner wait, ssh round trips) and holds a marker file
`<run dir>/.spawning/WSxx` (pid, start time, previous status and host). Success
makes the row `started`; any failure restores the previous status and host. A
second spawn of a live spawning row exits 66 ("already spawning"); a marker whose
pid is gone is cleared with a WARN. Worker reports never move a spawning row,
`land` refuses it, `peek` says "no session yet", and watch ignores it (no
STALE/DEAD until `started`).

## Subcommands

| Command | Purpose |
|---|---|
| `init <slug> [goal words...] [--worktree] [--db none\|docker]` | Scaffold run dir; extra non-flag words join as the run goal (written to goal.txt, shown as the dashboard header blurb); refuses duplicates (exit 65); installs the engine registry |
| `add WSxx "task" [--name s] [--claims p1,p2] [--engine e] [--force]` | Register a workstream (status=pending, heartbeat=0); `--engine` defaults to `claude-sub`. An id already in the roster, any status, exits 65 and names the existing row's task ("queued placeholder" when it starts `QUEUED:`), so a queued item is never overwritten by accident; `--force` replaces the row |
| `next-id` | Print the first WS id numerically above every roster row (placeholders included), zero-padded to the widest existing id; `WS01` on an empty roster. Use it instead of guessing "the next free id" |
| `status [--tsv]` | Aligned table: ws_id, status, task(40), #claims, heartbeat age |
| `claim WSxx <path...>` | Register file ownership; refuses overlapping claims (65), prefix dirs and glob scopes count as overlap; claims of `done` rows no longer block |
| `heartbeat WSxx [--files p1,p2,...] [note...]` | Liveness ts; latest note replaces the previous; `--files` publishes the comma-separated paths as the worker's now-editing list (`files/<ws>.txt`, one per line, shown on the dashboard card) |
| `commit WSxx -m <msg>` | Guarded commit: stages ONLY claimed paths, refuses (66) on unclaimed dirty files |
| `migrate-next WSxx <dir>` | Reserve next migration number (max+1, flocked); no silent collisions |
| `spawn WSxx [--spares N] [--engine e] [--no-tmux] [--dry-run]` | Launch the worker's engine in a tmux pane on the run's socket, verify its banner, then send the thin prompt. Prints the dashboard URL: `dashboard live: http://127.0.0.1:<port>/dashboard.html` when the dashboard server is up, otherwise `dashboard: <url> (start: fleet dashboard --open)`. Engine precedence: `--engine` > roster column > `FLEET_DEFAULT_ENGINE` > `claude-sub`. Splices the activity-gated heartbeat ticker into the pane (`FLEET_TICK_SECS`, default 30s, `off` disables) |
| `land WSxx [--no-ff] [--allow-deletes]` | Delete gate first, for local worktree and host rows: ADDED lines of the lane diff are scanned for recursive deletes (`remove_dir_all`, `rmtree`, `rm -rf`, `fs.rm`/`rmSync`/`rmdir` with `recursive`, `rimraf`); a hit refuses with exit 67 and lists `file:line`, nothing merges (MDTWII 2026-10-16: a test `Drop` wiped shared data through a symlink). Confirm the path is a temp dir the test created, then `--allow-deletes` lands anyway. Worktree: merge `fleet/<WSxx>` + remove worktree (a `--no-ff` merge commit reads `fleet: land WSxx: <task, 60 chars>` with the full task and worker name in the body; refuses a spawning row); main: mark landed; then sweep `handoffs/` for files addressed to the lane (`residual:` lines) |
| `handoff WSxx` | Write `handoffs/HANDOFF_WSxx.md` for compaction restart into a spare |
| `db WSxx` / `db-clean [--all]` | Scratch postgres containers (only when `FLEET_DB=docker`) |
| `host-setup <alias> [--check]` | Prepare a server for `spawn --host` (see Remote hosts); idempotent |
| `sync [WSxx]` | Pull remote workers' report files into the roster (host rows only). Manual fallback: `watch` runs it each tick only while the mailbox is down |
| `peek WSxx [lines]` | Print a worker's pane (default 40 lines); host rows read it over ssh |
| `mail WSxx <assign\|answer\|stop> "text"` | Master to worker through the mailbox: from `<project>-master` to `<project>-<ws>`, kind ask (wakes an idle pane), carrying the run's coordinator secret. Short, names files. 66 when the mailbox is off or down |
| `report <status\|handoff\|claim-request\|done\|blocked> "text"` | Worker to master (run in the worker pane; spawn sets `FLEET_WS`): roster first (status, notes, heartbeat, `handoffs/CLAIM_REQ_<WS>.md`), then one mail to the master, queued in `MAILBOX_OUTQ` for the hook when the worker is sandboxed. A failed mail only warns |
| `nudge WSxx [--tmux] "msg"` / `nudge WSxx --key K...` | Text goes as coordinator mail (type `answer`; the mailbox watcher wakes an idle pane). Typed literally plus Enter into the pane instead when the mailbox is off or down (`WARN nudge: MAILBOX-DOWN ...`) or with `--tmux`. `--key` presses named keys (`Enter Escape C-u Up Down Tab BTab 1-9 y n`; use these to answer a permission prompt, mail cannot). One ws per call; pending/spawning rows refused (65) for typing. Host rows go over ssh. Use this, never raw `tmux send-keys` |
| `stop WSxx` | Close the worker's tmux session only; worktree, branch, claims, files and roster row stay. Already gone = exit 0. Use this, never raw `tmux kill-session`. `watch` then reports `DEAD <ws> (pane exited)` until you land or reset the row |
| `watch [--stale-min N] [--poll S] [--once] [--emit-events]` | Event lines: `MAIL <ws> <type> <text>` (worker mail, applied to host rows), `MAILBOX-DOWN <reason>` / `MAILBOX-UP`, `CHANGE`/`STALE`/`DEAD`/`DEAD <ws> (pane exited)`/`ALL-DONE`; Monitor-tool ready. STALE fires when a started/working row's heartbeat ages past `--stale-min` (default 5 minutes). Heartbeat-only roster diffs never emit `CHANGE` (the spawn ticker rewrites that column every tick). Pane-exit DEAD fires when a started/working row's tmux session is gone (spawn `exec`s the engine, so the pane dies with it). `--emit-events` also feeds cfn-workbench (below) |
| `dashboard [--port N] [--poll S] [--stale-min N] [--once] [--no-serve] [--open] [--stop]` | Self-contained live-poll HTML tracking page from the roster (status tiles and meter, filter chips, sort, heartbeat age, engine, claims, now-editing lists, goal blurb, STALE/DEAD badges, transition timeline, per-card attach command with Copy and Open in terminal, per-card Live view of the worker's pane), served on 127.0.0.1 for VS Code Simple Browser (below) |
| `archive <run> [--undo]` | Hide a stale run from discovery and the dashboard by writing `<run>/.archived` (undo removes it); never deletes |

Exit codes: `0` ok, `64` usage, `65` data error (bad WS id, overlap, duplicate),
`66` guard refusal, `67` land refused by the recursive-delete gate, `71` internal.

## Remote hosts

`fleet spawn WSxx --host <alias> --engine claude-*` runs the worker on a server
over ssh. glm and codex engines are refused (exit 64). Local rows are unchanged.

Server layout (under the server's `$HOME`): bare repo `~/git/<project>.git`, fleet
clone `~/fleet-repos/<project>`, worktrees `~/fleet-repos/<project>-wt/<ws>`,
outboxes `~/fleet-runs/<project>/<run>/<WS>/`. `fleet host-setup` never touches
`~/Projects/<project>` on the server.

| Step | Command | Notes |
|---|---|---|
| Set up | `fleet host-setup <alias> [--check]` | Creates the bare repo, pushes main, adds the Mac git remote `<alias>`, clones to `~/fleet-repos`. `--check` prints tmux/claude versions, logged-in account, free disk, cfn-fleet drift |
| Spawn | `fleet spawn WSxx --host <alias>` | Refuses (66) below `FLEET_REMOTE_MIN_FREE_GB` or when the host cannot fence workers (see Sandbox); pushes `fleet-base/<WS>`, creates the worktree, ships brief and `remote-worker.sh` |
| Pull reports | `fleet sync [WS]` | Applies heartbeat, notes, status, handoffs; claim requests land in `handoffs/CLAIM_REQ_<WS>.md` for the master. Never changes claims |
| Look | `fleet peek WSxx [lines]` | Read a remote prompt before answering it |
| Land | `fleet land WSxx` | Fetches `fleet/<WS>` from the server fleet clone over ssh (workers never push), refuses (65) files outside the claims, merges, records the lane tip in `lane_sha`, closes the server tmux session and cleans the server |

### Sandbox and limits (host workers)

Every host worker starts as `systemd-run --user --scope -p MemoryMax=... -p CPUQuota=... -- claude ... --settings '<json>'`
(code: `lib/spawn-remote.sh`; plan: `planning/PLAN_fleet-host-sandbox.md`).

- Bash sandbox on, no unsandboxed fallback, and claude exits if the sandbox cannot start.
  Bash writes only to the worktree, the fleet clone (commits in a linked worktree write
  its `.git`) and the outbox, plus Claude's own temp dir. Unix sockets are blocked, so
  docker is out of reach.
- `permissions.deny` holds `Edit(...)` rules for the server deny list: `~/Projects`,
  `~/git`, `/tmp/gate-*`, `/tmp/cand-*`, `/tmp/mdtwii-*`, `~/.cache/mdtwii-target-*`,
  `~/.cache/cfn-vps`, `~/.claude`, `~/.ssh`, `~/.config/gh`, `~/opt`, plus the outbox kit
  files, the clone's `.git/config` and hooks, and the worktree's `.git` file. An `Edit`
  rule covers Edit, Write, MultiEdit and NotebookEdit. Reads stay allowed.
- Workers commit locally only: `remote-worker.sh commit` never pushes, and refuses off
  `fleet/<WS>`.
- Caps per worker: `FLEET_REMOTE_MEM` (MemoryMax, default `12G`) and `FLEET_REMOTE_CPU`
  (CPUQuota, default `400%` = 4 cores). Sized for a 12-core / 47 GB server: two workers
  leave 4 cores and about 23 GB for two gate runs.
- Spawn preflight checks `bwrap --ro-bind / / true`, `socat` and
  `systemd-run --user --scope`, and refuses (66) with the fix commands when one fails.
  `FLEET_REMOTE_UNSANDBOXED=1` (env or `fleet.env`) runs anyway with a WARN: the missing
  fence is skipped, the deny rules stay.
- Limits: the Bash sandbox fences shell commands; Edit and Write are fenced only by the
  deny list. Weaker than a separate server account (a user decision).

Remote reports reach the master as mail (`fleet watch` applies them each tick);
the report files stay on the server as the record, pulled by `fleet sync` by hand
or by `fleet watch` while the mailbox is down. The dashboard never pulls them, so
a dashboard-only master sees stale remote rows.

Alert states (`fleet watch`, also badged on the dashboard):

| State | Meaning |
|---|---|
| `UNREACHABLE <ws>` | ssh failed. Never reported as DEAD: the worker may be fine |
| `PROMPT <ws>` | Pane waits on a permission prompt: `fleet peek` it |
| `NOREPORT <ws>` | Started, no report after `FLEET_FIRST_REPORT_SECS` (300); judged only while the mailbox is down (with mail up a silent launch shows as `STALE`) |
| `LOWDISK <host>` | Free disk under `FLEET_REMOTE_MIN_FREE_GB` |

Knobs (`fleet.env` unless noted): `FLEET_HOST_REMOTE` (Mac git remote name, default
the host alias), `FLEET_REMOTE_LINKS` (paths symlinked into the server worktree from
`~/Projects/<project>`, e.g. `extracted,game`), `FLEET_REMOTE_MIN_FREE_GB` (15),
`FLEET_AUTH_TIMEOUT` (seconds to wait for a login failure banner, 12),
`FLEET_HOST_PROBE_SECS` (dashboard host probe interval, 30), `FLEET_REMOTE_MEM` (12G),
`FLEET_REMOTE_CPU` (400%), `FLEET_REMOTE_UNSANDBOXED` (0; env or `fleet.env`).

By hand, once per server: ssh config alias (key login), `claude` login on the
server, `.env` and secrets, and dependencies (node_modules, toolchains). Host-setup
copies none of these.

Limits: remote workers have no fleet CLI. They report through `remote-worker.sh`
(heartbeat, status, commit, handoff, claim request): a report file in the outbox,
plus a queued mail for status, handoff and claim request that the worker's mail
hook sends (its sandboxed Bash cannot reach Redis). They receive master mail
through that hook, which needs the mailbox config and `redis-cli` on the server.
The master decides claims. All lanes share one account's rate limits. Worker briefs
require literal `rm` paths (`rm /full/path/x.lock`), as `templates/BRIEF_REMOTE.md` states.

## Mailbox (all workers, stage 5)

One path for every worker, Mac and server (user decision 2026-10-16). Roster,
brief and handoff files stay the record of truth; mail carries short messages that
name files. Spec: `planning/PLAN_agent-mailbox.md`, "Stage 5 design".

- **Names.** Worker `<project>-<ws>` (`mdtwii-ws445`; WS ids repeat across projects),
  spares `<project>-<ws>-spare<k>`, master `<project>-master`. `fleet spawn` sets the
  worker's `MAILBOX_SESSION` in its pane and claims the master name for the session
  running spawn (`mailbox.sh claim`; a role name survives a restart).
- **Pane env** (spawn): `MAILBOX_SESSION`, `MAILBOX_COORD_FILE`, `MAILBOX_COORD_FROM` (the
  master address), `MAILBOX_OUTQ` (`<run>/mail-out/<WS>`; server: `<outbox>/mail-out`; both
  self-ignored by git), `FLEET_MASTER_MAIL`, `FLEET_WS`.
- **Coordinator secret.** One per run, `<run>/.coord/secret` (dir 700 with its own
  `.gitignore`, file 600), and in a host worker's shipped brief. `fleet mail` and
  `nudge` send it (on stdin, never argv); the worker's hook labels mail
  `coordinator` only when it matches, the sender is the same owner and `from` is the
  master address, else `teammate`. It is never printed or put in mail text. It is a
  same-user fence, not a security boundary: every session of the user can read it.
- **Coordinator authority is fleet-internal.** A worker acts on coordinator mail
  within its brief only. It is not the user's approval and never authorizes a push,
  deploy, spend or approval outside the brief (both brief templates say so).
- **Types** (the mailbox `fleet` field): worker to master `status` (fyi), `handoff`,
  `claim-request`, `done`, `blocked`; master to worker `assign`, `answer`, `stop` (ask:
  the mailbox watcher wakes an idle pane).
- **Routes replaced.** Assignments and nudges go by mail (`fleet mail`, `fleet nudge`);
  status comes by mail (`fleet report`, `remote-worker.sh`), applied by `fleet watch`,
  instead of automatic ssh polling. `fleet watch` reads the master inbox as a second
  reader (its own marker), so the master's own hook still shows every message.
- **Fallbacks kept.** `fleet peek`, `fleet sync`, `fleet nudge --tmux` / `--key`, and
  reading files over ssh by hand. When Upstash does not answer, `fleet watch` prints
  `MAILBOX-DOWN <reason>` once and goes back to reading roster and outbox files
  (`fleet sync` each tick) until `MAILBOX-UP`.
- **Off switch.** `FLEET_MAILBOX=off` (env or `fleet.env`) runs the file-only paths.
  Without a mailbox config on the machine, spawn warns and the worker uses files only.

## Worker sessions

A worker's brief is `briefs/WSxx.md` (copy `briefs/BRIEF_WS.md` and fill in:
task, claims, allowed commands, done criteria). The spawn prompt is one thin
line: "read briefs/WSxx.md and start; coordinate as the brief says (roster files unless it asks for messages)". Workers
commit through `fleet commit`, heartbeat as they work, report to the master with
`fleet report`, and never touch another row's claims. Verification is scoped: workers run suites and `tsc` on CLAIMED
paths only, and the full suite is the master's landing gate, run after all
lanes land (a full-suite failure inside another lane's in-flight files is not
the lane's to fix or wait on). Raw `git commit` is never a worker command;
everything lands via `fleet commit WSxx`, and a lane that believes a forced
commit is needed stops and reports to the master. Whenever the set of files
being edited changes, the worker runs
`fleet heartbeat WSxx --files src/a.ts,src/b.ts`; the dashboard lists those
paths on the worker's card under "now editing". Spare sessions
(`<name>-spare<k>`) stay empty until a handoff.

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
| `glm` | `claude --model glm-5.3-flash` pointed at z.ai, launched through `~/.claude/cfn-scripts/zai-fence.sh` (macOS sandbox: repo root only, no keys/Keychain/push) | z.ai API billing | `glm-` (e.g. "glm-5.3-flash with high effort · API Usage Billing") | `FLEET_ZAI_TOKEN` in the env, else the keychain or token file (see z.ai token home below) |
| `codex` | `codex --sandbox workspace-write --ask-for-approval never` | ChatGPT subscription | `provider: openai\|OpenAI Codex\|Ask Codex` (codex-cli 0.153+ renders "Ask Codex"; e.g. "OpenAI Codex (v0.153.4)") | nothing (an `OPENAI_API_KEY` in the master env must be unset in the pane; spawn refuses otherwise). Codex delegation gate: spawn refuses (66) unless the target repo's CLAUDE.md carries a literal `codex=true` line |
| `claude-haiku` | `claude --model haiku --permission-mode bypassPermissions` | Claude subscription (Team/Max/Pro) | same as `claude-sub` | Mechanical lanes; identical scrub and banner to `claude-sub`, only the model differs. |

Registry: the SHARED `~/.claude/cfn-config/engines.env` (single source of
truth, also read by cfn-tmux-agents; `templates/engines.env` is a symlink to
it), copied into the run dir by `fleet init` (`engines.env`) where per-run
tuning happens. One line per engine, 7 ` | `-separated fields: name, bin, args,
set (NAME=$SOURCE_VAR or NAME=literal), unset, trust_keys, banner_regex. It
stores variable NAMES and non-secret flags only; `$SOURCE_VAR` references are
resolved from the master shell at spawn time and reach the pane through a 0600
launch script in a private temp dir; the pane sources it and the script
deletes itself before `exec` (`.claude/cfn-scripts/spawn-env.sh`). Never argv: `new-session -e` values sit
in the tmux server's argv for its lifetime, readable by any process via `ps`.
Never the run dir either, so `planning/fleet-*` stays committable
and `grep -r <token> planning/fleet-*` finds nothing. Missing or empty source
var: spawn exits 66 naming the variable (e.g. `FLEET_ZAI_TOKEN`).

z.ai token home. When `FLEET_ZAI_TOKEN` is unset or empty, spawn looks in two
places, in order: the macOS keychain (generic password, service
`cfn-fleet-zai`), then `~/.config/cfn-fleet/zai.token` (first line; the file
must be mode 600 or spawn refuses). A value under 20 characters is refused.
The value is never printed. Store it once with:

```bash
security add-generic-password -a "$USER" -s cfn-fleet-zai -w
```

(nothing after `-w`: `security` prompts for the token, so it stays out of shell
history; add `-U` to replace an existing entry).

Every launch script first clears the launching Claude session's own env
(`CLAUDECODE`, `CLAUDE_CODE_*`, `CLAUDE_PID`, `CLAUDE_TMPDIR`, `CLAUDE_EFFORT`), which
the tmux server copies into every pane. Without it each worker ran as the master's
child: transcript saving off, and the master's messaging socket, token and session id.
Engine set-vars are exported after the clear, so a `CLAUDE_CODE_*` set-var survives.

Optional engine `claude-opus` (`claude --model opus`, subscription): shipped
commented out in the shared registry; uncomment it in the run-dir
`engines.env` to use it.

Spawn order per pane, all on the run's dedicated tmux socket
(`FLEET_TMUX_SOCKET` in fleet.env, default `fleet-<slug>`; kill a whole run
with `tmux -L fleet-<slug> kill-server`):

1. `new-session` (no `-e`), then one short typed line, `. '<dir>/launch'`.
   The 0600 script exports the set-vars, deletes its dir, then runs
   `export FLEET_RUN_DIR=<run dir>; unset <unset list>; exec <bin> <args>`.
   Only the short line is typed because a fresh macOS pty silently drops
   typed input past ~1024 bytes, and a glm pane command is ~1.5KB. A missing
   script leaves the pane at its prompt (banner timeout, row stays pending).
   `--no-tmux` prints literal set-vars as `-e` and a silent `read -rs` prompt
   for each `$SOURCE_VAR` one; the key itself is never printed.
   The `exec` makes the pane die with the engine, which is what `fleet watch`'s
   `DEAD <ws> (pane exited)` detects. When the heartbeat ticker is enabled, a
   backgrounded sidecar loop sourcing `lib/heartbeat-ticker.sh` is spliced in
   front of that segment.
2. Startup gates, one poll: the codex-cli update modal ("Update available
   ... Press enter to continue", codex-cli 0.153+) is dismissed with `2`
   (Skip) then Enter — bare Enter picks "1. Update now" = a surprise
   `npm install -g`. Folder-trust prompts (both `claude` and `codex`, first
   launch in a directory; worktree mode hits it every run) get the engine's
   `trust_keys`, sent only if the prompt is actually seen within
   `FLEET_TRUST_TIMEOUT` (default 15s), and only after `FLEET_TRUST_SETTLE`
   (default 1.5s): the TUI draws the prompt before it reads keys.
3. Banner gate: spawn polls up to `FLEET_BANNER_TIMEOUT` (default 20s) for the
   engine's `banner_regex`. Roster is `spawning` from before the first tmux call until this gate. Match: roster `started`, heartbeat stamped, then
   and only then the thin prompt. Timeout: the row stays `pending`, the last
   pane lines print, exit 66. A worker on the wrong model never reaches
   `started`; confirm the banner line in spawn's output before trusting a run.

Heartbeat ticker: the spliced sidecar ticks every `FLEET_TICK_SECS` seconds
(default 30; env > fleet.env; `off` or `0` disables). Each tick it captures
the pane, filters out spinner and animation lines (braille frames,
star-family glyphs, esc-hint and elapsed tokens), and stamps the roster
heartbeat only when the filtered visible output changed since the last tick.
A wedged worker whose output freezes stops beating, so `fleet watch`'s STALE
(default 5 minutes) stays a real signal; a plain wall-clock ticker was
rejected because it makes wedged agents look healthy. The sidecar survives
the `exec` as a reparented child and dies with the pane, and it stamps only
the heartbeat field: agent heartbeats still own notes, status and `--files`.

Autosave: the same sidecar snapshots a worker's dirty worktree every
`FLEET_AUTOSAVE_SECS` seconds (default 1200; env > fleet.env; `off` or `0`
disables; needs the ticker on and `FLEET_WORKTREE=on`, since the shared main
checkout is never snapshotted per worker). Snapshots go to
`${TMPDIR}/fleet-autosave/<run-name>/<WS>/<UTC timestamp>/` (the pane's
TMPDIR, normally `/var/folders/.../T/`), newest 6 kept, an unchanged tree
writes nothing new. Each holds `head.txt` (commit, branch), `tracked.patch`
(`git diff HEAD --binary`), `untracked.tar.gz` and `untracked.txt` (untracked,
not-ignored files; files over 50 MB listed in `skipped.txt` instead). It only
reads git (`GIT_OPTIONAL_LOCKS=0`, no index or branch writes), so it is safe
mid-commit or mid-rebase. Restore:

```bash
cd <worktree>    # or: git worktree add --detach <dir> "$(head -1 <snap>/head.txt)"
git apply <snap>/tracked.patch        # --3way if HEAD has moved since the snapshot
tar -xzf <snap>/untracked.tar.gz
```

Every restored edit comes back unstaged. Panes spawned before this feature
keep their old ticker until respawned.

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

## Fleet dashboard

`fleet dashboard` is the fleet-native tracking view: one self-contained HTML
page rendered straight from `roster.tsv` (no event bridge, no workbench
dependency), served on `127.0.0.1` so it opens in VS Code's built-in Simple
Browser instead of Chrome. The page is live: inline JS fetches `roster.tsv`
and `dashboard-events-tail.jsonl` (the last 30 transitions, rewritten on
every render pass) from the same server every `data-poll` seconds (default
5, `--poll S`) and redraws tiles, meter, cards and timeline in place, so
scroll position and the selected filter and sort survive each poll. Only the
no-JS fallback does a full-page refresh, and only inside `<noscript>`. A
live dot in the header stays green while polls succeed and turns amber on
a failed fetch (the last good page stays up; retry on the next tick).

Per-worker cards show the status pill (closed vocab), task, engine, claims,
notes, heartbeat age (ticks client-side), landed sha, and STALE (heartbeat
older than `--stale-min`, default 5 minutes, while started/working) and DEAD
(status dead, or pane exited per the tmux session probe) badges. The overview separates
needs-attention (blocked, stale, or dead),
in-flight (spawning + started + working), landed, and finished (done only) counts.
Click a summary to filter the roster. An eight-status legend and grouped
status-distribution bar show the whole run. Workstreams sort by attention first;
status order and oldest-heartbeat-first are also available. Search matches worker
IDs, names, tasks, engines, claims, notes, and commit IDs. Filters and search
survive live refreshes; Reset view clears them. Activity appears alongside the
workstream cards. A failed roster fetch shows an explicit paused-updates notice
and retains the last received roster and timestamp. Local filtering never advances
that timestamp. The overview includes the run goal blurb from `<run-dir>/goal.txt`
(written by `fleet init <slug> <goal words>`). Each card also lists the
paths that worker published with `fleet heartbeat WSxx --files a,b` (stored
one per line in `<run-dir>/files/<ws>.txt`) under "now editing", and shows
nothing there until the worker publishes. Live cards also carry the worker's
tmux attach command with Copy and, on a served page, Open in terminal (see
the list below).

Project codes (M1, ART-01, ...) get translations when the run drops a
`<run-dir>/glossary.tsv`: one `code TAB meaning` row per code, optional
`code TAB meaning` header, `#` comments allowed. Codes must match
`^[A-Za-z0-9][A-Za-z0-9._+-]*$` and contain at least one digit (stops English
words from highlighting). The dashboard renders a Code key panel in the
Activity aside, merges codes that share one meaning into a single row
(`ART-01 / ART01`), and the live JS underlines every code occurrence in task
and note text with a hover tooltip carrying its meaning. Absent file renders
nothing; status pills, tiles and filter chips carry plain-English tooltips
(landed: commit exists, work may continue; done: worker reported finished
with a clean tree). Long notes clamp to 4 lines and expand on click.

The dashboard uses a graphite and cyan operations theme. It defaults to dark;
the header theme button toggles light/dark and persists the choice in
`localStorage` under `fleet-dash-theme`. Summary panels and worker cards stack on
narrow screens; the header stops sticking so it does not crowd out the roster.

```bash
$HOME/.claude/skills/cfn-fleet/cli/fleet dashboard --open    # serve + open in Simple Browser
$HOME/.claude/skills/cfn-fleet/cli/fleet dashboard --stop    # tear the server down
```

- State: the dashboard owns `.dashboard.state`, `dashboard-events.jsonl`,
  `dashboard-events-tail.jsonl` (the bounded last-30 feed the page polls),
  and `.dashboard.pid`. It never touches `.watch.state` (owned by
  `fleet watch`), so both can run concurrently.
- `fleet spawn` prints the dashboard URL when it launches workers:
  `dashboard live: http://127.0.0.1:<port>/dashboard.html` when this server
  is already serving, otherwise the same URL with
  `(start: fleet dashboard --open)`.
- Port: `--port` > `FLEET_DASHBOARD_PORT` env > `FLEET_DASHBOARD_PORT` in
  fleet.env > 4880. Server is `lib/dashboard-server.py` bound to 127.0.0.1
  and rooted at the run dir (static files, quiet 5xx-only log, pidfile
  `.dashboard.pid`, idempotent double-start, port busy exits 66);
  `--no-serve` renders once without binding (tests).
- `--open` runs `code --open-url vscode://simpleBrowser.show?url=...`; when
  the `code` CLI is absent it warns and prints the URL plus the fallback
  (Ctrl+Shift+P, "Simple Browser: Show").
- Attach and Open in terminal: every card with a session (not `pending`)
  shows its attach command, `tmux -L <sock> attach -t <name>`, or
  `ssh -t <host> tmux -L <sock> attach -t <name>` for a remote row, with a
  Copy button. A remote row's socket and session come from
  `remote/<WS>.env` (written by `spawn --host`), never the local run socket
  or the roster name; the renderer hands them to the page in columns 5 and 6
  of `host-states.tsv`, and a remote row with no env file gets no command.
  A name, host or socket outside the strict patterns gets no
  command at all. When the page is served and `GET /api/health` reports
  `"open": true`, an Open in terminal button posts `{"ws": "<id>"}` to
  `POST /api/open-terminal`; the server reads the roster (and
  `remote/<WS>.env` for a remote row) itself for name, host and socket
  (never the request) and launches with an argv list:
  macOS Terminal via `osascript`, WSL2 via `wt.exe new-tab wsl.exe -d
  <distro>`, otherwise 501 with the command to paste. Gate: Origin must be
  `http://127.0.0.1:<port>` or `http://localhost:<port>`, no
  `Sec-Fetch-Site: cross-site`, `Content-Type: application/json` (403 / 415);
  unknown ws 404, pending row 409. On failure the card says "Could not open
  a terminal, use the command shown". A `--no-serve` or `file://` page shows
  Copy only. Test seam: `FLEET_DASHBOARD_OPEN_CMD=<program>` runs that
  program with the attach argv instead of a real launcher (set but not
  executable means open is unavailable).
- Live view: when the page is served and `GET /api/health` reports
  `"pane": true`, each attachable card has a Live view toggle (collapsed by
  default, `aria-expanded`). Expanded, it shows the last 40 lines of the
  worker's pane in a scrolling monospace box, pinned to the bottom unless you
  scroll up, with "updated Ns ago" and a plain error line on failure. Only
  expanded cards poll (local rows every 3s, remote rows every 6s), never
  while the tab is hidden; the expanded set survives the card redraw. The
  page calls `GET /api/pane?ws=<id>&lines=<N>` (N clamped 5..200, default
  40), which runs `fleet peek <id> <N>` as an argv list with `FLEET_RUN_DIR`
  set and an 8s timeout, strips ANSI and control characters (keeps newline
  and tab) and answers `{"ok", "text", "ts"}`. Errors: unknown ws 404,
  pending row or peek exit 65 (no session) 409, exit 66 (host unreachable)
  503, timeout 504. Gate: Origin, when sent, must be this origin; no
  `Sec-Fetch-Site: cross-site` (403). Load guard: one peek in flight per ws,
  results cached 2s (5s for remote rows) so several tabs never fan out ssh
  calls. Hidden on `--no-serve` / `file://` pages. Test seam:
  `FLEET_DASHBOARD_PEEK_CMD=<program>` replaces the fleet CLI.
- Sessions panel: when the page is served and health reports `"sessions": true`,
  a panel above the cards lists every live Claude Code session on this machine,
  read from `~/.claude/sessions/*.json` (whitelisted fields only; `*.key` files
  are never opened; dead pids skipped). Columns: name, role (lane when cwd or
  tmux name matches a roster row, else master), lane/brief, state (roster
  review/gate win, else busy/idle/waiting/shell), last activity, attach command.
  Sessions from other projects sit in a collapsed "Other projects" group; no
  update for 24h shows "stale" and sorts last. `GET /api/sessions`, same gate
  as the other endpoints, cached 3s; refreshes every 5s while the tab is
  visible. Test seam: `FLEET_DASHBOARD_SESSIONS_DIR`.
- Archived runs: `fleet archive <run> [--undo]` only writes or removes
  `<run>/.archived`. Run discovery skips archived runs, so a stale fleet stops
  being the dashboard's default; an explicit `FLEET_RUN_DIR` still reaches it.
  Nothing is deleted.
- The dashboard deliberately never exits on ALL-DONE (unlike `fleet watch`):
  `landed` means has-a-commit, not finished (trap 3).

## Master check cadence

Standard timing: the main chat checks the fleet every **15 minutes**. Each
check is one batch: `fleet status` (roster + heartbeat ages), react to STALE/
DEAD rows, unblock or wake workers, land finished lanes. Every land ends with a
residual sweep: `handoffs/` files addressed to the landed lane print one
`residual: <file> (dispatch or record open)` line each, and the master
dispatches a follow-up or records the residual as open (no addressed files, no
extra output). `fleet watch` (Monitor
tool) and the dashboard run alongside but never replace the check — a watch
stream goes quiet when nothing changes and poll loops die under memory pressure
(trap 6); the 15-minute check is what catches a stalled run. STALE (default
5 minutes, down from 15) is trustworthy between checks because heartbeats are
stamped by spawn's activity-gated ticker, not by workers remembering to run
`fleet heartbeat`: a wedged lane freezes its visible output and shows STALE
before the next scheduled check.

Mechanics: schedule the check with the Monitor tool or a session loop at a
15-minute interval; do not hold a `sleep`-loop in a shell. A check that finds
`ALL-DONE` plus every row `done:`-heartbeated and clean is the exit condition.

### Per-lane verifiers

Between a worker's `done:` note and the next 15-minute check the lane sits
unverified, and the master reviewing lanes in its own context bloats the main
chat. Close both: on a `done:` note (seen in a check batch or a `fleet watch`
CHANGE line — notes are a roster column, so they emit CHANGE), spawn ONE fresh
read-only verifier agent for that lane. Fresh, never a fork (context cost) and
never a standing pool — workers cannot reach the master's subagents and codex
lanes have no inbound messaging at all, so the roster is the only universal
trigger.

- Brief ≤ 2KB, fat-file style: lane id, run dir path, claimed paths, commit
  range (worktree mode: `fleet/WSxx` vs integration branch; main mode: the
  lane's commits by subject prefix), done criteria from `briefs/WSxx.md`, and
  the verdict file path. End with the leaf-agent line.
- Verdict file, not a message: the agent writes `reviews/WSxx.md` (PASS/FAIL +
  findings) and tees suite output to `reviews/WSxx-suite.txt`; the master reads
  one verdict line and cites the file. A verdict with no captured suite output
  behind it is an assertion, not evidence — the agent must report pass/fail
  counts from the file, and the master spot-checks when in doubt.
- Scope = the worker's own rule: lane-scoped suites and `tsc` on claimed paths,
  plus a diff review against the brief's done criteria. No full suite — a
  failure inside another lane's in-flight files is not this lane's.
- Verdict routing: PASS → land at the next check. FAIL → wake the worker with
  the findings path (thin message), or record a residual handoff if the lane
  is gone.
- The verifier is a pre-land lane review only. It never replaces the landing
  gate: full suite, rehearsal, and blast-radius grading stay with the master
  (trap 7 — lane-scoped runs missed the backwards-fixture break; only the
  master's gate caught it).
- Never batch a verifier spawn with implementer spawns in the same message.

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
the tmux launch. Repair a stray row with `sed -i.bak $'/^WS0N\t/d' <old roster> && rm <old roster>.bak`
(the `.bak` suffix keeps it working on both GNU and macOS sed), then confirm
`git diff` on that file is empty.

### 2. The pane inherits whatever the tmux server carries, so spawn verifies the banner

Current behaviour: `fleet spawn` starts the pane on the run's dedicated socket
with the engine's set-vars in a private env file (never argv), sends one pane command that
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
- Do NOT symlink `node_modules` into the worktree. A symlinked package `node_modules` is the
  main checkout's real directory, so its workspace links (`@ggi/config -> ../../../config`)
  resolve to the MAIN checkout's source: the lane typechecks against `dev` plus peers'
  uncommitted edits, never against its own branch (measured 2026-09-09: an upstream lane's
  new export read as missing, a peer's uncommitted enum widening read as a type error). Run
  `pnpm install --offline --frozen-lockfile --ignore-scripts` inside the worktree instead
  (about 4 seconds against a warm store, hardlinked) and confirm
  `readlink packages/<pkg>/node_modules/@ggi/config` prints `../../../config`. Still copy each
  app's gitignored `next-env.d.ts` across.
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

### 5. Two fleets on one repo collide on the WS id, not the run slug

`fleet spawn` keys the worktree path (`.claude/worktrees/wsNN`) and the branch (`fleet/WSNN`)
on the workstream id alone. Two runs in the same repo that both register `WS01` share one
worktree and one branch. Measured 2026-09-09: a second master's `spawn WS01` found the first
run's worktree already present (no "Preparing worktree" line), launched a second engine inside
it, and `fleet/WS01` interleaved both lanes' commits. Each worker saw the other's files as
unclaimed dirt and committed with `--force-with-note`, so the commits stayed path-clean, but
`fleet land WS01` would have fast-forwarded the other run's work onto the integration branch.

- Before `fleet add`, run `git worktree list` and `git branch --list 'fleet/WS*'`. Pick ids no
  live run uses (the second run here renumbered to WS12 to WS15).
- If a collision has already happened, do not `fleet land`. Each master cherry-picks only its
  own lane's commits (subject prefix identifies the lane) and confirms with `git show --stat`
  that no foreign path rode along.
- A landing rehearsal is cheap and catches this class: `git worktree add --detach <tmp> dev`,
  cherry-pick every lane commit there, run typecheck and the touched suites, then land from
  the rehearsed tip. Hot-file conflicts (changelog, feature-status) show up there instead of
  in the shared checkout.

### 6. Messages to a pane and lanes that outlive a base rebase (2026-09-10)

- **`tmux send-keys "<text>" Enter` in one call leaves the text sitting unsent in the
  Claude Code prompt** when the worker is mid-turn; the roster then shows the worker idle with
  the message visible in its input box. `fleet nudge WSxx "<text>"` already sends the text,
  pauses 1s (`FLEET_NUDGE_DELAY`), then sends `Enter` separately; confirm with `fleet peek`
  that a spinner line follows the prompt.
- **After rebasing the integration base, a lane that forked from the OLD base must be rebased
  with `--onto <base> <old fork point>`.** A plain `git rebase <base>` replays the whole old
  history (every earlier lane and the base's own commits) and hits the same hot-file conflicts
  the base rebase already resolved. Tag the pre-rebase tip, compute the fork point as
  `merge-base <lane> <tag>`, and use `--onto` when that point is not an ancestor of the new base.
- **A landing script whose output is piped to `tail` cannot refuse.** The pipe swallows the
  exit status, so a rebase conflict reads as landed and the next wave is spawned from a base
  missing the lane. Run landing scripts bare and branch on their exit code.

### 7. Main-in-place on a dirty shared checkout, and a number that is only free on your branch (2026-09-14)

- **`fleet commit` refuses every lane on a checkout other sessions are working in.** The guard exits 66 when
  ANY unclaimed dirty file exists, and on a shared checkout there always is one (a peer's half-edited
  file, a Codex desktop snapshot). Every lane of the airtable-prebook run blocked on its first commit.
  When the lane's own edits all sit inside its claims, `fleet commit WSxx -m <msg> --force-with-note`
  still stages only the claimed paths. Put that line in the brief for any main-in-place run on a shared
  checkout instead of letting three workers discover it one at a time.
- **`fleet migrate-next` reserves `max + 1` over the CURRENT tree only.** Unmerged branches (a Codex lane
  landing late) can already hold that number and even have applied it to the cloud. Measured
  2026-09-14: `dev` stopped at 0119, `codex/matching-*` held 0120 to 0126, migrate-next handed out 0120
  and the lane renumbered to 0127 with the files, check ids and README row already written. Before
  reserving, list migrations on every live branch (`git ls-tree --name-only <branch> <migrations dir>`)
  and take one past the highest anywhere; put the number the brief expects in the brief as an assumption
  the worker must re-check, not a fact. Then re-check at LANDING, not only at spawn: a number that was
  free on every branch at fleet start can be taken by a peer's commit to the integration branch while
  the run is in flight (measured later the same day: 0131 was free everywhere at 14:00, `dev` carried
  a peer's 0131 by 16:30, caught only by a rebase rehearsal). The landing rehearsal's file-collision
  list (`comm -12` of both sides' touched paths) is where it shows; grep the migrations directory on the
  integration branch for the lane's number before the real rebase.
- **Fixtures that model a pair backwards break when a guard learns the real order.** A migration that
  made the booking gate honour published sessions turned three adversarial fixtures red: they inserted
  the session before the booking that "minted" it, with no `created_from_booking_id`. Lane-scoped test
  runs never touched those files, so the master's landing gate found it. Grade the landing gate over
  every consumer the plan's blast radius names, not over the lanes' claimed files.

### 8. Cleanup, deletions and fix rounds (MDTWII fleet, 2026-10-14)

- **Keep launches and cleanup in separate shell commands.** A respawn (`fleet stop WSnn`, then
  `fleet spawn WSnn --engine X`) and a round sent to the pane run without prompts. Chain cleanup
  onto them (`rm -f "${P:?}/game"`, `git worktree remove --force "${P:?}"`, `rm -rf <var path>`) and
  the WHOLE command waits for user approval, because deletes with variable-built targets are held.
  Run cleanup as its own command with literal absolute paths, or through a repo prune script.
- **Unattended workers cannot delete files.** The cfn-careful delete guard refuses `rm` in worker
  sessions (a GLM worker tried twice). Briefs for deletion work say: try plain `rm`; if the guard
  refuses, do not work around it, and list the exact remove commands in the handoff. The master runs
  them at merge, and only when a user ruling covers the deletion. Plain `rm`, not `git rm`, is still
  the rule for claimed files the master deletes (`git rm` breaks `fleet add`).
- **Fix-round respawn moves a failed lane up a tier.** `fleet stop WSnn`, then
  `fleet spawn WSnn --engine <tier>` reuses the worktree and branch. User ruling: fix rounds go to
  Sonnet (`claude-sub`) by default when the review lists concrete blockers, and to Opus only on a
  second failure or judgment-heavy blockers. The fix-round message names only the checks covering the
  lane's files; "run the full project check" cost about 20 minutes of unrelated sweeps and benches.
- **Finished lanes used to hold their claims.** Four merged lanes still held files and blocked two new
  lanes. Fixed: a row with status `done` no longer blocks `fleet add --claims` or `fleet claim`; its
  claims cell stays as history. `landed` rows still block, since a landed lane may continue.

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
