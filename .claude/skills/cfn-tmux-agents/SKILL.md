---
name: cfn-tmux-agents
version: 1.0.0
tags: [tmux, subagents, parallel, fleet-lite]
status: draft
author: CFN Team
description: Launch and drive subagent CLI sessions in tmux without the fleet roster. Spawn claude/glm/codex workers, send prompts, read output, kill. Use when you want fleet-style parallel sessions without fleet's run-dir, roster, worktree, or claims machinery.
dependencies: [tmux]
created: 2026-09-10
updated: 2026-09-10
complexity: Low
keywords: [tmux, subagent, spawn, worker, parallel, claude, glm, codex]
triggers: [parallel-sessions-without-fleet, tmux-worker, background-subagent]
---

# Skill: cfn-tmux-agents

## Overview

Standalone tmux worker launcher: the spawn/send/monitor mechanics of
cfn-fleet with the coordination machinery stripped. One dedicated tmux
socket (default `tmux-agents`), one session per agent, prompts delivered
literally via `send-keys -l`.

Use when you need N parallel subagent CLI sessions (each a full `claude`,
`claude`-via-z.ai, or `codex` process) but do NOT need fleet's roster,
run-dir, worktrees, claims, or land flow. If you need commit isolation or
workstream coordination in one repo, use cfn-fleet instead.

What it keeps from fleet (all measured there):
- per-session env isolation via `tmux new-session -e` (values never touch disk)
- folder-trust gate, banner gate, post-first-request 401 auth probe
- billing guards: claude workers strip `ANTHROPIC_*` relay vars (subscription
  billing), codex refuses a set `OPENAI_API_KEY` not covered by its unset list
- glm least-privilege unset list: z.ai panes never hold Airtable/Attio/DB/Supabase creds
- send-keys `-l` literal delivery; follow-ups send text, sleep 1, then a
  separate Enter (one-shot send+Enter leaves text unsent mid-turn)

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
$A list                        # sessions on the socket
$A kill review-auth            # one session
$A kill --all                  # whole socket (agent sessions only)
```

Subcommands and flags:

| Command | Args | Notes |
|---|---|---|
| `spawn` | `NAME` | `--engine claude-sub\|glm\|codex`, `--model M`, `--cwd DIR` (default git toplevel), `--prompt TEXT` or `--prompt-file F`, `--socket S`, `--trust-timeout S`, `--banner-timeout S`, `--dry-run`, `--bin`/`--args`/`--banner-regex` (custom engine) |
| `send` | `NAME TEXT...` | follow-up: literal text, 1s, separate Enter |
| `status` | `[NAME]` | alive/DEAD + last lines; all sessions when NAME omitted |
| `capture` | `NAME` | `--lines N` (default 40) |
| `list` | | session names on the socket |
| `kill` | `NAME` or `--all` | `--all` runs `kill-server` on the dedicated socket |

Env knobs: `TMUX_AGENTS_SOCKET` (default `tmux-agents`),
`TMUX_AGENTS_TRUST_TIMEOUT` (15), `TMUX_AGENTS_BANNER_TIMEOUT` (20),
`TMUX_AGENTS_AUTH_TIMEOUT` (12). glm token source:
`TMUX_AGENTS_ZAI_TOKEN`, or existing `FLEET_ZAI_TOKEN` / `ZAI_TOKEN`
(the skill picks those up).

Exit codes: 0 ok, 64 usage, 3 tmux missing, 65 unknown engine/session,
66 env/guard refusal or launch failure, 68 banner timeout (session killed).

### Engines

| Engine | Process | Billing/env posture |
|---|---|---|
| `claude-sub` (default; `claude` alias) | `claude --model sonnet --permission-mode bypassPermissions` | unsets all `ANTHROPIC_*` relay vars: subscription billing, never API |
| `glm` | `claude --model glm-5.3-flash --permission-mode bypassPermissions` + z.ai base URL/token | needs a token var; unsets `ANTHROPIC_API_KEY` + data-system creds (Airtable/Attio/Postgres/Supabase) as least privilege |
| `codex` | `codex --sandbox workspace-write --ask-for-approval never` | unsets `OPENAI_API_KEY` (ChatGPT-plan billing); refuses a set key an engine would not unset; Codex delegation gate: refuses (exit 66) unless the target project's CLAUDE.md carries a literal `codex=true` line |

Registry: the SHARED `~/.claude/cfn-config/engines.env`, the same single
source of truth cfn-fleet reads (via its `templates/engines.env` symlink), so
the two skills can never drift apart. `lib/engines.sh` parses it. No secret
values on disk, only var names.

## Examples

Two parallel reviewers, then collect (thin prompt, fat files):

```bash
A=$HOME/.claude/skills/cfn-tmux-agents/execute.sh
printf 'Review src/auth. Write findings to /tmp/rev-auth.md and stop.\n' > /tmp/brief-auth.md
printf 'Review src/db.  Write findings to /tmp/rev-db.md and stop.\n'  > /tmp/brief-db.md
$A spawn rev-auth --prompt-file /tmp/brief-auth.md
$A spawn rev-db   --prompt-file /tmp/brief-db.md
$A status                  # poll until both panes go quiet
$A kill --all
```

Batch fan-out:

```bash
for t in api cli docs; do
  $A spawn "fix-$t" --engine glm --model glm-5.3 --prompt "fix lint errors in $t/, commit"
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
- Sessions live on a dedicated socket, never the user's default tmux
  server, so `kill --all` cannot touch unrelated sessions.

Prompt conventions (same rule as fleet): thin prompt, fat file. Keep the
in-pane prompt short; put the task body in a file the prompt names. Tell
the worker where to write output and that it should stop when done; there
is no roster heartbeat to signal completion, `status`/`capture` are the
only readback.

## Tests

```bash
$HOME/.claude/skills/cfn-tmux-agents/tests/test-agents.sh
```

21 assertions against fake engine binaries (`tests/fake-engine.sh`,
`tests/fake-engine-modal.sh`) on a per-run socket: spawn/banner gate,
literal send-keys delivery (no shell expansion), duplicate-name refusal,
banner timeout exit 68, glm missing-token exit 66, unknown-engine/bad-name
usage codes, registry banner regexes match current TUIs, codex update-modal
dismissed with 2 (never Enter), kill and kill --all teardown. No real
claude/codex process is spawned.

Live smoke 2026-09-10: claude-sub, glm, codex all spawned, replied, and
tore down. codex-cli 0.153.4 needed the update-modal gate; the engine
field parser must split on " | " with empty fields surviving (bare-pipe
split shreds banner alternation, sed /g chews the shared space in
" | | ").
