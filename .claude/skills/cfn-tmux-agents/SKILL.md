---
name: cfn-tmux-agents
version: 1.0.0
tags: [tmux, subagents, parallel, fleet-lite]
status: draft
author: CFN Team
description: Launch and drive subagent CLI sessions in tmux without the fleet roster. Spawn claude/glm/codex workers, send prompts, read output, kill. Use when you want fleet-style parallel sessions without fleet's run-dir, roster, worktree, or claims machinery.
dependencies: [tmux]
created: 2026-09-10
updated: 2026-11-16
complexity: Low
keywords: [tmux, subagent, spawn, worker, parallel, claude, glm, codex]
triggers: [parallel-sessions-without-fleet, tmux-worker, background-subagent]
---

# Skill: cfn-tmux-agents

## Overview

Standalone tmux worker launcher: the spawn/send/monitor mechanics of
cfn-fleet with the coordination machinery stripped. One tmux server per
lane (socket `tmux-agents-<name>`, see "Sockets" below), one session per
agent, prompts delivered literally via `send-keys -l`.

Use when you need N parallel subagent CLI sessions (each a full `claude`,
`claude`-via-z.ai, or `codex` process) but do NOT need fleet's roster,
run-dir, worktrees, claims, or land flow. If you need commit isolation or
workstream coordination in one repo, use cfn-fleet instead.

What it keeps from fleet (all measured there):
- per-session env and pane command in a 0600 launch script; only a short `. '<dir>/launch'` is typed (a fresh macOS pty drops typed input past ~1024 bytes) and the script deletes itself before `exec` (`.claude/cfn-scripts/spawn-env.sh`); never `new-session -e`, whose values stay in the tmux server's argv where `ps` shows them to every process. `--dry-run` never prints a secret value
- folder-trust gate, banner gate, post-first-request 401 auth probe
- billing guards: claude workers strip `ANTHROPIC_*` relay vars (subscription
  billing), codex refuses a set `OPENAI_API_KEY` not covered by its unset list
- glm least-privilege unset list: z.ai panes never hold Airtable/Attio/DB/Supabase creds
- send-keys `-l` literal delivery; follow-ups send text, sleep 1, then a
  separate Enter (one-shot send+Enter leaves text unsent mid-turn)

## Claude workers are sandboxed (2026-11-16)

Every unfenced claude-kind worker (`claude-sub`, `claude-haiku`, or a `--bin`
whose engine is claude) gets the same locked `--settings` that cfn-fleet host
workers get, built by the shared `.claude/cfn-scripts/sandbox-settings.sh`.
Fenced engines (`glm`, `glm-open`, anything launched through `zai-fence.sh`)
are the exception, below.
The workers run `bypassPermissions`, which would otherwise auto-approve any
command run outside the sandbox. Now:

- **Every Bash command runs inside the sandbox, or not at all.** No
  unsandboxed escape, and Claude stops instead of running unconfined if the
  sandbox breaks. A tricked worker cannot run `sudo` or leave the fence.
- Bash may write only to the repo (plus the shared git dir of a linked
  worktree), the worker outbox `/tmp/tmux-agents-<uid>/<socket>/<name>`
  (0700, in the worker's env as `TMUX_AGENTS_OUTBOX`), and any extra
  absolute paths in `TMUX_AGENTS_ALLOW_WRITE` (colon list).
- Never writable, by Bash or by the Edit/Write tools: the repo's git hooks
  and config, its `.claude/settings*.json`, `.claude/hooks/`, `.mcp.json`; in
  `$HOME` the Claude config, credentials (`.ssh`, `.aws`, `.gnupg`, gh,
  Docker), git config, shell startup files and PATH bin dirs.
- No unix sockets, so no Docker.

**What workers can no longer do, so hand these back to the coordinating
session:** push or ship (`git push`, `pnpm ship`), run Docker, start the
local DB stack (`pnpm stack:up`), or edit the repo's Claude hooks and
settings. Write the brief so the worker commits locally (or leaves the
diff), writes its report to `$TMUX_AGENTS_OUTBOX`, and stops; the
coordinating session pushes, ships and runs the stack.

Spawn probes this machine first (Linux: `bwrap` can create a sandbox and
`socat` exists; macOS: `sandbox-exec` exists) and refuses with exit 66 and
the fix command when it cannot. `TMUX_AGENTS_UNSANDBOXED=1` is the explicit
opt-out (same shape as fleet's `FLEET_REMOTE_UNSANDBOXED`): sandbox off with
a loud WARN, Edit/Write deny rules still applied. `--args` may not carry its
own `--settings` for a claude engine (exit 64). To turn the sandbox off on a machine that can build it, use the separate `TMUX_AGENTS_SANDBOX_OFF=1` or `spawn --no-sandbox` (per spawn, WARN on stderr, Edit/Write deny rules kept; risk: a tricked worker can run anything your user can, sudo included); `TMUX_AGENTS_UNSANDBOXED=1` alone never does this. Codex is unchanged: it keeps
`--sandbox workspace-write --ask-for-approval never`.

**Fenced engines (`glm`, `glm-open`) do not get Claude's Bash sandbox.**
The zai-fence already runs them in their own bubblewrap (empty root, own
user and network namespace, seccomp). Claude's sandbox cannot start inside
it: a plain nested `bwrap --ro-bind / / true` works, but Claude's sandbox
also cuts the network (`--unshare-net`), and that needs a netlink socket the
fence's seccomp filter refuses ("Failed to create NETLINK_ROUTE socket";
probed 2026-11-16), and `socat` is not inside the fence. With
`failIfUnavailable` the worker could then run no Bash at all. So a fenced
worker gets `--settings` with the sandbox explicitly off (so a user-level
`sandbox.enabled` cannot switch it back on) and the same Edit/Write deny
rules; spawn skips the host bwrap/socat probe for it; it has no outbox
(the fence gives it a private `/tmp`), so its brief should have it write
reports inside the repo.

Limit: setting arrays merge across Claude Code's settings layers, so a
`sandbox.excludedCommands` entry in the user or project settings still runs
outside the sandbox in a worker. Keep that list free of commands a worker
could abuse.

What it drops: roster, run-dir, briefs/handoff templates, worktrees and
branches, claims/commit guard, land, watch loop, spares, dashboard.

## Usage

```bash
A=$HOME/.claude/skills/cfn-tmux-agents/execute.sh

$A spawn review-auth --engine claude-sub --cwd ~/projects/myapp \
   --prompt "review src/auth, write findings to /tmp/auth-findings.md"
$A status review-auth          # alive + last 3 pane lines
$A capture review-auth         # last 40 lines (--lines N)
$A send review-auth "also check the middleware"
$A list                        # sessions on every lane socket + legacy
$A kill review-auth            # one session (its lane server goes with it)
$A kill --all                  # every lane server + legacy (agent sessions only)
```

Subcommands and flags:

| Command | Args | Notes |
|---|---|---|
| `spawn` | `NAME` | `--engine claude-sub\|glm\|glm-open\|codex\|codex-render`, `--model M`, `--cwd DIR` (default git toplevel), `--prompt TEXT` or `--prompt-file F`, `--socket S`, `--trust-timeout S`, `--banner-timeout S`, `--dry-run`, `--bin`/`--args`/`--banner-regex` (custom engine; for `glm`/`glm-open` a `--bin` other than `zai-fence.sh` replaces only the program inside the fence, so `--engine glm --bin claude` runs `zai-fence.sh claude --model ...`; glm never runs unfenced; a `--bin` named `zai-fence.sh` must be the installed wrapper (realpath match) or spawn refuses with 66) |
| `send` | `NAME TEXT...` | follow-up: literal text, 1s, separate Enter |
| `status` | `[NAME]` | alive/DEAD + last lines; all sessions when NAME omitted |
| `capture` | `NAME` | `--lines N` (default 40) |
| `list` | | session names on every live `tmux-agents-*` socket plus legacy `tmux-agents` (only the forced socket when one is forced) |
| `kill` | `NAME` or `--all` | `NAME` on its own lane server also stops that server and removes its socket file; `--all` runs `kill-server` on every lane socket plus legacy (only the forced socket when one is forced) |
| `watch` | `NAME` | `--result PATH` and `--notify ADDR` required; `--idle-min N` (default 10), `--interval S` (default 30), `--detach` (nohup/setsid, log in `$TMPDIR/tmux-agents-watch-NAME.log`; otherwise run it with `&` or `nohup`). Sends ONE `$HOME/.claude/skills/cfn-mailbox/mailbox.sh send ADDR` alert when the pane has been idle N minutes and PATH has not been written since the watch started; exits 0 when PATH's mtime is newer than the watch start (a file already there at start is ignored until rewritten, so a review round reusing one result file works) or the session ends. Idle = no working line (`esc to interrupt`, codex `Working (Ns`, spinner) and an unchanged screen; the codex placeholder `Ask Codex to do anything` is not proof of idle. `TMUX_AGENTS_WATCH_UNIT` = seconds per minute (60) |

Env knobs: `TMUX_AGENTS_SOCKET` (unset = per-lane servers; set = force that one socket),
`TMUX_AGENTS_UNSANDBOXED` (1 = run claude workers when the sandbox cannot be built),
`TMUX_AGENTS_SANDBOX_OFF` (1 = sandbox off even when buildable; same as `--no-sandbox`),
`TMUX_AGENTS_ALLOW_WRITE` (extra writable paths), `TMUX_AGENTS_OUTBOX_ROOT`
(default `/tmp/tmux-agents-<uid>`),
`TMUX_AGENTS_TRUST_TIMEOUT` (15), `TMUX_AGENTS_BANNER_TIMEOUT` (20),
`TMUX_AGENTS_AUTH_TIMEOUT` (12). glm token source:
`TMUX_AGENTS_ZAI_TOKEN`, or existing `FLEET_ZAI_TOKEN` / `ZAI_TOKEN`
(the skill picks those up), else the same keychain (service `cfn-fleet-zai`)
or `~/.config/cfn-fleet/zai.token` that cfn-fleet reads (first line, mode 600,
at least 20 chars; env values under 20 chars are refused too). Shared helper:
`.claude/cfn-scripts/lib/zai-token.sh`. The value is never printed.

Exit codes: 0 ok, 64 usage, 3 tmux missing, 65 unknown engine/session,
66 env/guard refusal or launch failure (incl. engine binary or its #!
interpreter not found on the launching shell's PATH, or no Bash sandbox on
this machine for a claude worker), 68 banner timeout or
engine died before its banner (session killed; pane text and exit status
printed), 69 prompt typed but never submitted (session left alive).
Prompt submit knobs: `TMUX_AGENTS_SUBMIT_SETTLE` (1), `TMUX_AGENTS_SUBMIT_VERIFY`
(3), `TMUX_AGENTS_SUBMIT_RETRIES` (3).

### Engines

| Engine | Process | Billing/env posture |
|---|---|---|
| `claude-sub` (default; `claude` alias) | `claude --model sonnet --permission-mode bypassPermissions --settings <locked sandbox>` | unsets all `ANTHROPIC_*` relay vars: subscription billing, never API |
| `glm` | `zai-fence.sh claude --model glm-5.3-flash --permission-mode bypassPermissions --settings <Edit deny rules, Bash sandbox off>` + z.ai base URL/token; the wrapper confines the worker to its repo root, plus (Linux) the worktree itself when `--cwd` is a registered linked worktree kept outside the main checkout (macOS Seatbelt or Linux bubblewrap, fails closed with exit 70) | needs a token var; unsets `ANTHROPIC_API_KEY` + data-system creds (Airtable/Attio/Postgres/Supabase) as least privilege |
| `glm-open` | same as `glm`; the fence also binds read+write the folders listed in the target project's committed `.claude/glm-open-dirs` (HEAD version only; regular file, not a symlink) (one absolute folder per line; `ro:/path` read-only; last-segment `*`/`?` globs expand at start; nested entry wins; per project, never global; validated by the fence; credential and `.env` masks still win) | same scrub as `glm`; spawn refuses (exit 66) when the project has no list, an empty one, or a bad entry |
| `codex` | `codex --sandbox workspace-write --ask-for-approval never` | unsets `OPENAI_API_KEY` (ChatGPT-plan billing); refuses a set key an engine would not unset; Codex delegation gate: refuses (exit 66) unless the target project's CLAUDE.md carries a literal `codex=true` line. Codex workers never ask for approval: whatever `--args` says, spawn drops any `-a`/`--ask-for-approval`, `--full-auto` and `approval_policy` override and forces one `--ask-for-approval never`; the caller's `--sandbox`/`-s` is kept (default `--sandbox workspace-write`), and `--dry-run` prints the final `# codex args:` |

Linux fence for `glm`/`glm-open` is an allow-list (only `/usr`, a small `/etc` set,
read-only `~/.claude` runtime, private per-worker home; network only to the API
host). A `glm-open` list needs a one-time approval after each committed change:
`~/.claude/cfn-scripts/glm-open-approve.sh <repo>`. `--bin` with a slash must be
absolute; bare names resolve only through absolute PATH entries; `--args` and
`--model` are passed as argv words, never as shell code. List prefixes: `ro:` and
`noscan:` (skip the secret-file scan for that folder; any order). Launch with
`--cwd` = the repo holding the list. While the pane shows "zai-fence: checking",
spawn waits up to `TMUX_AGENTS_FENCE_TIMEOUT` (900s) for the banner. A `.git`
under the root or a listed folder that is neither a git pointer (`gitdir:` line) nor
a repository (e.g. uv's `.uvcache/sdists-v9/.git`) is hidden read-only inside the
fence with one "zai-fence: masked" note; it no longer refuses the launch.

Registry: the SHARED `~/.claude/cfn-config/engines.env`, the same single
source of truth cfn-fleet reads (via its `templates/engines.env` symlink), so
the two skills can never drift apart. `lib/engines.sh` parses it. No secret
values on disk, only var names.

## Examples

Two parallel reviewers, then collect (thin prompt, fat files):

```bash
A=$HOME/.claude/skills/cfn-tmux-agents/execute.sh
printf 'Review src/auth. Write findings to $TMUX_AGENTS_OUTBOX/findings.md and stop.\n' > /tmp/brief-auth.md
printf 'Review src/db.  Write findings to $TMUX_AGENTS_OUTBOX/findings.md and stop.\n'  > /tmp/brief-db.md
$A spawn rev-auth --prompt-file /tmp/brief-auth.md
$A spawn rev-db   --prompt-file /tmp/brief-db.md
$A status                  # poll until both panes go quiet
cat /tmp/tmux-agents-$(id -u)/tmux-agents/rev-*/findings.md
$A kill --all
```

Batch fan-out:

```bash
for t in api cli docs; do
  $A spawn "fix-$t" --engine glm --model glm-5.3 --prompt "fix lint errors in $t/, commit locally, do not push"
done
$A list
```

Codex worker (remember: codex has NO inbound messaging after spawn; the
initial prompt must be self-contained):

```bash
$A spawn impl-x --engine codex --prompt-file /tmp/brief-x.md
```

## Implementation

- `execute.sh` - dispatcher: arg parse, socket pre-scan, subcommands.
- `lib/common.sh` - socket resolution, `pane_wait` poll with noise filter
  (strips CR/blank lines and echoes of the launch command so the poll can
  never match its own send-keys), trust/banner/auth gates, guards,
  literal send helpers.
- `lib/sandbox.sh` - claude-worker sandbox: host probe gate (exit 66 or
  `TMUX_AGENTS_UNSANDBOXED=1`), outbox path, allow/deny path lists; the JSON
  itself comes from the shared `.claude/cfn-scripts/sandbox-settings.sh`
  (also used by cfn-fleet `lib/spawn-remote.sh`).
- `lib/engines.sh` - inline engine registry (7 fields, ` | ` separator),
  `$SOURCE_VAR` resolution at spawn time (exit 66 names the missing var),
  z.ai token prefill from fleet-era exports.
- Spawn order: guards and env resolution run BEFORE any side effect; then
  new-session (with `-e` env), pane command `unset <list>; exec bin args`
  (exec so the pane dies with the engine), startup gates, banner gate
  (timeout kills the session, exit 68), prompt, auth probe.
- Startup gates (one poll, dispatch on match): the codex-cli update modal
  ("Update available ... Press enter to continue") is dismissed with
  `2` then Enter (plain Enter would pick "1. Update now" = surprise
  `npm install -g`); folder-trust prompts get the engine trust_keys.
- Sessions live on dedicated sockets, never the user's default tmux
  server, so `kill --all` cannot touch unrelated sessions.

## Sockets (one tmux server per lane)

Since 2026-11-19 each new lane gets its own tmux server. One shared server
holding every lane meant one `kill-server` or one server crash lost all of
them (it happened twice that day).

- `spawn NAME` runs on `tmux -L tmux-agents-NAME` (socket file
  `${TMUX_TMPDIR:-/tmp}/tmux-$UID/tmux-agents-NAME`). Attach with
  `tmux -L tmux-agents-NAME attach -t NAME`.
- `send`, `capture`, `status NAME`, `kill NAME` and `watch` look for NAME on
  its per-lane socket first, then on the legacy shared socket `tmux-agents`,
  so lanes spawned before the change keep working where they are.
- `list`, `status` (no NAME) and `kill --all` cover every live
  `tmux-agents-*` socket plus legacy. Stale socket files (tmux 3.4 leaves
  one behind when a server exits) are skipped.
- `spawn NAME` refuses (66) while a session NAME is alive on the legacy
  socket: the new lane would shadow it.
- Killing the last session on a lane server (`kill NAME`, or a spawn that
  dies before its banner) stops that server and deletes its socket file.
- `--socket S` or a set `TMUX_AGENTS_SOCKET` forces ONE socket for every
  command, exactly as before (tests use this, plus `TMUX_TMPDIR` isolation).
- Code: `lib/common.sh` (`_ta_lane_sock`, `_ta_find_sock`, `_ta_all_socks`,
  `_ta_reap_lane_sock`). Test: `tests/test-lane-sockets.sh` (38 assertions).

Prompt conventions (same rule as fleet): thin prompt, fat file. Keep the
in-pane prompt short; put the task body in a file the prompt names. Tell
the worker where to write output and that it should stop when done; there
is no roster heartbeat to signal completion, `status`/`capture` are the
only readback.

## Per-project Rust build folder (CARGO_TARGET_DIR)

A project can keep its lanes' Rust builds off the root disk. It commits
`.claude/cargo-target-root`: one absolute folder (first non-blank, non-`#`
line). Spawn then exports `CARGO_TARGET_DIR=<root>/<lane-name>` into the pane
(through the 0600 launch script, never argv). No file, no change; nothing in
CFN names a project.

For MDTWII, commit this one line:

```
/mnt/wsl/churn/mdtwii-desk-workers
```

- Explicit override: `TMUX_AGENTS_CARGO_TARGET_DIR=<dir>` at spawn wins and is used verbatim.
- An ambient `CARGO_TARGET_DIR` in the master shell does not win (it is often exported globally, which would switch the opt-in off).
- Refused with exit 66, before any side effect: a root that is relative, holds `..`, odd characters, is a symlink file, or sits under `/dev/shm` or `/run/shm` (RAM; stack rule).
- The pane's own shell rc runs first, so a global export there is overridden only because the launch script exports after it.
- `--dry-run` prints a `# pane env` line with the value.
- Code: `lib/cargo-target.sh`. Test: `tests/test-cargo-target.sh` (10 assertions).

### Worker mailbox name

Every worker (claude, codex, glm) gets `MAILBOX_SESSION=<lane name>`, so its mail is signed as itself, never as the master.

- Override: `TMUX_AGENTS_MAILBOX_SESSION=<name>` at spawn. Must be `[a-z0-9-]`; anything else is refused with exit 66.
- A lane name that is not a valid mailbox name: spawn warns and unsets `MAILBOX_SESSION` in the pane, so the master's name is never inherited.
- `--dry-run` prints a `# pane env` line with the value.
- Folder-trust prompts match in any case (Codex 0.171 prints `Trust this folder?`).
- Code: `lib/common.sh` (`_ta_mailbox_session_line`, `_ta_trust_re`). Test: `tests/test-mailbox-session.sh`.

### Codex lanes: mail wake-ups

Codex has no hooks, so on its own a codex lane never learns that mail arrived. Spawn therefore starts every codex lane through the mailbox's own launcher: `codex-mail.sh --name <mailbox name> -- <codex args>`.

- **The launcher registers the lane with the mailbox; the existing mail watcher (`mailbox-watch.sh`) then types the codex nudge into the lane when it is idle.** At most once a minute per lane.
- The launcher registers the pane, keeps a heartbeat, marks the lane as a codex client, and tracks idle or busy through Codex's after-turn hook. It cleans up when the lane ends.
- Codex also gets network access and the mailbox cache as a writable folder, so `mailbox.sh read` works inside the workspace-write sandbox. Approval stays forced to never.
- Applies only to codex lanes with a valid mailbox name (see above) that are not inside zai-fence. A missing `~/.claude/skills/cfn-mailbox/codex-mail.sh` warns and runs codex directly.
- Turn off: `TMUX_AGENTS_CODEX_MAIL=0`. `--dry-run` shows the wrapped command.
- Code: `execute.sh` (`cmd_spawn`, the `cmail` block). Test: `tests/test-codex-mail-nudge.sh`.

## Tests

```bash
$HOME/.claude/skills/cfn-tmux-agents/tests/test-agents.sh
$HOME/.claude/skills/cfn-tmux-agents/tests/test-spawn-path.sh
$HOME/.claude/skills/cfn-tmux-agents/tests/test-cargo-target.sh
$HOME/.claude/skills/cfn-tmux-agents/tests/test-lane-sockets.sh
```

97 assertions (81 + 16) against fake engine binaries (`tests/fake-engine.sh`,
`tests/fake-engine-modal.sh`) on a per-run socket: spawn/banner gate,
literal send-keys delivery (no shell expansion), duplicate-name refusal,
banner timeout exit 68, glm missing-token exit 66, unknown-engine/bad-name
usage codes, registry banner regexes match current TUIs, codex update-modal
dismissed with 2 (never Enter), kill and kill --all teardown, and the
claude-worker sandbox (test 21: every locked key in the generated
`--settings` for claude-sub/claude-haiku, glm/glm-open sandbox off with deny
rules and no host probe, codex untouched, linked
worktree paths, refusal with exit 66 when the host has no sandbox, the
opt-out, `--args --settings` refused). The host probe is stubbed with a
fake `bwrap` on PATH. No real claude/codex process is spawned.

Live smoke 2026-09-10: claude-sub, glm, codex all spawned, replied, and
tore down. codex-cli 0.153.4 needed the update-modal gate; the engine
field parser must split on " | " with empty fields surviving (bare-pipe
split shreds banner alternation, sed /g chews the shared space in
" | | ").
