# SPEC: cfn-fleet skill

Multi-session fleet coordination for Claude Code. Master session coordinates N worker
sessions; each worker is its own full Claude Code session (own context, own subagent
fleet). Distilled from real run: session e59a7826 (gg-all-projects, 2026-09-05, 12
workstreams, 9 landed, main-in-place).

Core principle from that run: **thin messages (control plane), fat files (data plane)**.
Roster + planning files carry state; SendMessage only assigns/wakes/blocks.

## Layout

```
.claude/skills/cfn-fleet/
  SKILL.md          # usage + protocol for the master session
  cli/fleet         # thin router, bash, executable
  lib/
    common.sh       # run-dir resolution, roster read/write (flock), env
    cmd-init.sh     cmd-add.sh     cmd-status.sh  cmd-claim.sh
    cmd-heartbeat.sh
    cmd-commit.sh   cmd-migrate-next.sh
    cmd-spawn.sh    cmd-land.sh    cmd-handoff.sh
    cmd-db.sh       cmd-watch.sh
  templates/
    COORDINATION.md RUNBOOK.md BRIEF_WS.md HANDOFF_WS.md
tests/
  test-cfn-fleet-roster.sh        # agent A
  test-cfn-fleet-commit.sh        # agent B
  test-cfn-fleet-spawn-watch.sh   # agent C
```

## Run dir (created by `fleet init` in the TARGET project cwd)

`planning/fleet-<slug>/`
- `fleet.env` — `FLEET_WORKTREE=off|on` (default off; `init --worktree` sets on),
  `FLEET_DB=none|docker` (default none)
- `roster.tsv` — one row per workstream, tab-separated, header line 1:
  `ws_id  name  task  status  claims  landed_sha  migration_num  scratch_db  heartbeat  notes`
  - ws_id: `WS01`.. name: session/tmux name. status vocab: `pending|started|working|blocked|landed|done|dead`
  - claims: space-separated repo-relative paths/globs (file-ownership registry)
  - heartbeat: unix ts. notes: free text
- `briefs/WSxx.md`, `handoffs/HANDOFF_WSxx.md` (from templates)
- `COORDINATION.md`, `RUNBOOK.md` (from templates)
- `.roster.lock` — flock target for all roster writes

## Router contract (cli/fleet)

- bash, `set -euo pipefail`. Resolve skill dir via `BASH_SOURCE[0]` realpath; docs in
  SKILL.md must show invocation as `$HOME/.claude/skills/cfn-fleet/cli/fleet` (portability rule).
- Usage: `fleet <subcommand> [args]`. Finds run dir: `$FLEET_RUN_DIR` env override, else
  nearest `planning/fleet-*` upward from cwd, else newest by mtime under `./planning/`.
  `--run-dir PATH` global flag overrides. Error if none found: "no fleet run dir (fleet init first)".
- Dispatch: source `lib/common.sh`, then `lib/cmd-<subcommand>.sh` must exist and define
  `main "$@"`. Unknown subcommand → usage to stderr, exit 64. Missing lib file → "unknown
  subcommand" (same path).
- Exit codes: 0 ok, 64 usage, 65 data error (bad WS id, overlap claim), 66 guard refusal
  (commit refuses unclaimed dirty files, db guard), 71 internal.

## lib/common.sh (agent A owns; B and C depend on these signatures)

```bash
fleet_run_dir            # echoes resolved run dir path, exit 64 if none
fleet_env_get KEY        # echoes value from fleet.env or default; empty if unset
fleet_roster_file        # echoes roster.tsv path
roster_exists WS         # 0 if row present
roster_get WS FIELD      # echoes field value by header name; exit 65 unknown WS/FIELD
roster_set WS FIELD VAL  # flock .roster.lock, rewrite row atomically (tmp+mv)
roster_rows              # TSV lines minus header
fleet_die CODE MSG       # msg to stderr, exit CODE
```

## Subcommands

**A — roster core:**
- `init <slug> [--worktree] [--db none|docker]`: refuse if `planning/fleet-<slug>` exists
  (exit 65). Scaffold run dir + templates + empty roster (header only) + fleet.env +
  `.roster.lock`. Echo run dir path.
- `add WSxx "task text" [--name s] [--claims p1,p2]`: validate WSxx pattern `^WS[0-9]{2,}$`,
  unique, claims comma-split stored space-joined. Row: status=pending, empty fields, heartbeat=0.
- `status`: aligned table (ws_id, status, task truncated 40, #claims, heartbeat age).
  Exit 0. `--tsv` raw output.
- `claim WSxx <path...>`: append paths to claims, **refuse exit 65 if path (glob-expanded)
  overlaps any other row's claims**. Overlap = same path or one is prefix dir of other.
- `heartbeat WSxx [note...]`: set heartbeat=$(date +%s), append note to notes (keep last note only).

**B — commit + migration alloc:**
- `commit WSxx -m <msg>`: guard-enforced git commit.
  1. Run `git status --porcelain` in $PWD (must be repo root or exit 64 with hint).
  2. Dirty files (incl. untracked) NOT matching WSxx claims → list them, exit 66:
     "unclaimed dirty files present; claim them, clean, or --force-with-note".
  3. Stage ONLY claimed paths: `git add -- <claimed paths>`.
  4. Commit `-m "fleet WSxx: <msg>"` unless `--no-commit` (stage only, dry run).
  5. On success: `roster_set landed_sha <sha>` (short), status=landed.
  - `--force-with-note`: proceeds despite unclaimed dirty (stages only claimed anyway),
    appends note "forced-commit-unclaimed-left".
  - Guard class this kills: staged hunk swept into another session's commit (FormField
    incident, e59a7826 L~1654).
- `migrate-next WSxx <migrations_dir>`: flock. Scan dir for `^([0-9]+)_` names, next =
  max+1 zero-padded to width of existing. Reserve in `migration_num`, echo number.
  Refuse exit 65 if WSxx already has one. Collision class: 0082/0084 (e59a7826 L1851).

**C — spawn/land/handoff/db/watch:**
- `spawn WSxx [--spares N] [--no-tmux] [--dry-run]`: read brief `briefs/WSxx.md` (exit 65
  missing). Main-in-place (default): cwd = repo root. Worktree mode (`FLEET_WORKTREE=on`):
  `git worktree add .claude/worktrees/<ws-lower> -b fleet/<WSxx>`, session cwd = worktree,
  claims still tracked in shared roster. tmux session `<name>` running `claude`, brief
  text sent as first prompt. Spares: N extra empty sessions named `<name>-spare<k>`, no brief.
  `--dry-run`: echo the plan (tmux names, cwds, worktree paths) without executing; `--no-tmux`:
  echo copy-paste launch commands instead of running tmux. status=started, heartbeat=now.
- `land WSxx`: worktree mode: merge `fleet/<WSxx>` into current branch (ff-only default,
  `--no-ff` flag), `git worktree remove`, status=landed, record landed_sha. Main mode:
  verify no unclaimed dirty files for WSxx (same logic as commit guard), just mark
  landed_sha=HEAD + status=landed (commit itself already done via `fleet commit`).
- `handoff WSxx`: write `handoffs/HANDOFF_WSxx.md` from template filled with roster row
  (task, claims, landed_sha, migration_num, notes, dirty files list). For compaction
  restart: spare session reads this file as its brief.
- `db WSxx`: only if `FLEET_DB=docker` (else exit 66 with hint). `docker run -d
  postgres:16-alpine` with label `cfn-fleet=<run-dir-basename>`, name `<slug>-<ws-lower>`,
  random host port, db/user/pass `fleet`. Probe until ready (pg_isready or psql SELECT 1,
  30s cap). Echo `DATABASE_URL=postgres://fleet:fleet@127.0.0.1:<port>/fleet`, store in
  roster scratch_db. If WSxx already has scratch_db → echo existing, no new container.
  `db-clean [--all]`: stop+rm containers labeled for this run dir (--all: every
  cfn-fleet-labeled container). Junk-DB-reaper class from e59a7826.
- `watch [--stale-min 15] [--poll 60] [--once]`: single scan or loop. Emit one line per
  event: `CHANGE <ws> <field>` (roster mtime/content diff vs last poll), `STALE <ws>
  <minutes>` (heartbeat older than stale-min AND status in started|working), `DEAD <ws>`
  (status=dead), `ALL-DONE` (every row landed|done → exit 0). Designed as Monitor-tool
  command: stdout lines only, `--once` for tests. No flock held between polls.

## Templates

- COORDINATION.md: fleet protocol doc — thin messages / fat files, claims rule, commit
  via `fleet commit` only, spare-session compaction-restart procedure, migration
  reservation, worktree-mode note if enabled.
- RUNBOOK.md: step sequence for master session (init → add → spawn → watch → land → db-clean).
- BRIEF_WS.md: workstream brief stub — task, claims, allowed commands, done criteria,
  "you are a worker session; coordinate only via roster files" reminder.
- HANDOFF_WS.md: filled by `handoff` cmd.

## Tests (bash, source tests/test-utils.sh, per tests/CORE_TEST_STANDARDS.md)

All tests: `set -euo pipefail`, cleanup trap, temp fixture git repo (init + config
user), no tmux/docker required (spawn uses --dry-run/--no-tmux; db test skipped unless
`docker info` works; watch tested with --once). One file per agent, TDD: write tests
first, confirm fail, implement, confirm pass. No commits — coordinator handles git.

## Settings summary

Default main-in-place (user preference). Worktree opt-in: `fleet init --worktree` or
`FLEET_WORKTREE=on` in fleet.env. Per-run settings live in fleet.env, nothing global.
