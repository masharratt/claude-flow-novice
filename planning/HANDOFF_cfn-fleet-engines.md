# HANDOFF: cfn-fleet per-workstream engines (claude-sub, glm via z.ai, codex)

Date: 2026-09-09. Author: gg-all-projects master session (Fable 5.1). Target: cfn team,
skill source `.claude/skills/cfn-fleet/` in claude-flow-novice (symlinked to
`~/.claude/skills/cfn-fleet`). Spec baseline: `planning/SPEC-cfn-fleet.md`.

## Goal

Let one Claude-subscription master session run a fleet whose workers are a mix of engines:
Claude Code on the Claude subscription, Claude Code pointed at z.ai (GLM models), and
OpenAI Codex on the ChatGPT subscription. Engine is a per-workstream choice made at
`fleet add` / `fleet spawn`. Endpoint and credential are set per tmux session, never
globally, never written to the run dir.

## What was measured today (all green, live, 2026-09-09 11:44 local)

Fresh tmux server started with `env -i` (zero `ANTHROPIC_*` / `OPENAI_*` in
`show-environment -g`). Three sessions, one-shot probes then interactive launches.

| Session | Launch | Proof |
|---|---|---|
| ws-glm | `tmux new-session -d -e ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic -e ANTHROPIC_AUTH_TOKEN=<zai> -e CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1`, then `claude --model glm-5.3-flash` | `claude -p ... --output-format json` returned `result: PONG`, `modelUsage: ['glm-5.3-flash']`. Interactive banner: `glm-5.3-flash with high effort · API Usage Billing`, statusline `ZAI glm-5.3-flash` |
| ws-sub | plain session, no ANTHROPIC vars, `claude --model sonnet` | json probe `modelUsage: ['claude-sonnet-5']`. Banner: `Sonnet 5 with high effort · Claude Team`, statusline `Anthropic Sonnet5[1M]` |
| ws-codex | plain session, `OPENAI_API_KEY` absent (`env \| grep OPENAI` = 0 lines), `codex exec --sandbox read-only --skip-git-repo-check 'Reply PONG'` | stdout `PONG`; header `model: gpt-5.6-sol provider: openai`. Interactive banner shows "usage limit resets available" (subscription UI). `~/.codex/auth.json` has `auth_mode: chatgpt`, `OPENAI_API_KEY: null` |

Fleet protocol from foreign engines: `fleet init enginetest`, `fleet add WS01/WS02`, then
`fleet heartbeat` run inside the glm pane and inside the codex pane. Roster rows carried
both notes with timestamps. The protocol is bash plus files, so engine is irrelevant.

Per-session env isolation: `tmux show-environment -t ws-glm` listed exactly the two
ANTHROPIC vars; `-t ws-sub` listed none. `-e` on `new-session` is the right primitive.

Scratch artifacts (session-local, will vanish): `/tmp/claude-1000/-home-masha-projects-gg-gg-all-projects/bc9a317d-c647-41e8-93b4-cc26f0185a01/scratchpad/fleettest/` (`glm.json`, `sub.json`, `codex.out`, `codex.err`, `*.env`, `planning/fleet-enginetest/roster.tsv`). Kill with `tmux -L fleettest kill-server`.

## Current state of `fleet spawn` (lib/cmd-spawn.sh) and why it is wrong

- Runs `tmux new-session -d -s <name> -c <cwd>` then `send-keys -l "$(cat brief)"` + Enter.
  Never launches any engine. The whole brief is typed into a bash prompt.
- New panes inherit the tmux SERVER's global env. On the user's machine that server is
  usually started from a shell that carried relay vars (`ANTHROPIC_AUTH_TOKEN`,
  `ANTHROPIC_BASE_URL`, `ANTHROPIC_DEFAULT_*_MODEL`), so a worker silently runs on the
  relay model. SKILL.md "Traps" section 2 documents this; the fix today is a manual
  `--no-tmux` dance.
- `-e` only ADDS vars. It cannot clear inherited ones. A claude-sub pane needs an explicit
  `unset` in the launched command, or the server must be started clean.

## Design to implement

### 1. Engine registry: `templates/engines.env` copied into run dir by `fleet init`

One block per engine. Stores VARIABLE NAMES and flags, never values. Run dir stays
committable.

```
# engine = <bin> | <args> | <env to set, comma list of NAME=$SOURCE_VAR or NAME=literal> | <env to unset, comma list>
claude-sub | claude | --model sonnet --permission-mode bypassPermissions | | ANTHROPIC_AUTH_TOKEN,ANTHROPIC_API_KEY,ANTHROPIC_BASE_URL,ANTHROPIC_DEFAULT_SONNET_MODEL,ANTHROPIC_DEFAULT_OPUS_MODEL,ANTHROPIC_DEFAULT_HAIKU_MODEL,ANTHROPIC_DEFAULT_FABLE_MODEL
glm       | claude | --model glm-5.3-flash --permission-mode bypassPermissions | ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic,ANTHROPIC_AUTH_TOKEN=$FLEET_ZAI_TOKEN,CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 | ANTHROPIC_API_KEY,ANTHROPIC_DEFAULT_SONNET_MODEL,ANTHROPIC_DEFAULT_OPUS_MODEL,ANTHROPIC_DEFAULT_HAIKU_MODEL,ANTHROPIC_DEFAULT_FABLE_MODEL
codex     | codex  | --sandbox workspace-write --ask-for-approval never | | OPENAI_API_KEY
```

Format is the implementer's call (this pipe table, or one `.env`-style file per engine
under `engines/`). Requirements: parseable in pure bash, no values on disk, `$VAR`
references resolved from the MASTER shell at spawn time, spawn refuses (exit 66) with
the variable NAME when a referenced source var is unset or empty.

Default engine: `claude-sub`. Override per run in `fleet.env` (`FLEET_DEFAULT_ENGINE=`).

### 2. Roster: add `engine` column

`FLEET_ROSTER_HEADER` in `lib/common.sh:21` gains `engine` (put it last to keep existing
column indexes stable, or migrate the header and every reader; either way one commit).
`fleet add WSxx "task" --engine glm`, `fleet status` shows it. Existing rosters without the
column read as `claude-sub`.

### 3. `fleet spawn` rewrite (lib/cmd-spawn.sh)

Order of operations for the default (tmux) path:

1. Resolve engine: `--engine X` flag > roster column > `FLEET_DEFAULT_ENGINE` > `claude-sub`.
2. Parse the engine row. Resolve every `$SOURCE_VAR`; die 66 naming the missing var.
3. `tmux new-session -d -s <name> -c <cwd> -e K=V ...` for every set-var. Values reach
   tmux via argv, not disk. (`tmux show-environment -t <name>` exposes them to anyone with
   the socket, which is the same trust boundary as the master shell. Acceptable.)
4. First command sent to the pane is one line: `export FLEET_RUN_DIR=<run dir>; unset <unset list>; exec <bin> <args>`. `exec` so the pane dies with the engine and `fleet watch` can see a dead pane.
5. Trust prompt handling. Both `claude` and `codex` stop on a "trust this folder" prompt on
   the first launch in a directory. Measured today: claude wants `Down` then `Enter`
   (default highlights "No, exit"), codex wants `Enter` (default is "Yes, continue").
   Implement as an engine field (`trust_keys`) rather than hardcoding. Poll with
   `capture-pane -p` for up to N seconds for the prompt text, send the keys only if seen.
   Worktree mode hits this every run (new directory each time).
6. Banner verification, then roster write. Poll `capture-pane -p` up to ~20s for an
   engine-specific `banner_regex` (`glm-5.3-flash` for glm, `Claude Team|Claude Max|Claude Pro` for claude-sub, `provider: openai|OpenAI Codex` for codex). On match: `roster_set status started`, heartbeat now, and print `spawned <ws> engine=<e> banner="<line>"`. On timeout: leave status `pending`, print the last 10 pane lines, exit 66. A worker on the wrong model must never reach `started`.
7. Only after the banner: send the thin prompt (`read <brief path> and start; coordinate only via roster files`), never the whole brief. This closes trap 2 fully.
8. Spares: same engine, same env, launched to the banner, NO prompt sent.

`--no-tmux` prints the exact `tmux new-session -e ...` and `send-keys` lines it would run,
with token values replaced by `$FLEET_ZAI_TOKEN`-style references so the printout is safe
to paste into a ledger. `--dry-run` prints the PLAN lines and additionally
`PLAN engine <ws> engine=<e> bin=<bin> set=<names> unset=<names>`.

### 4. Optional: `fleet tmux-server-check`

Warn (not fail) at `fleet init` and `fleet spawn` when `tmux show-environment -g` on the
target server carries any `ANTHROPIC_*` or `OPENAI_*` var: print the names and suggest
`tmux -L fleet-<slug>` (a dedicated socket started from a clean shell) or
`tmux set-environment -gu <NAME>` for each. A dedicated socket per run
(`FLEET_TMUX_SOCKET=fleet-<slug>` in fleet.env) is the cleaner design: every fleet command
that touches tmux passes `-L "$FLEET_TMUX_SOCKET"`. Recommended.

### 5. SKILL.md and templates

- Subcommand table: `add ... [--engine e]`, `spawn WSxx [--engine e] ...`.
- New section "Engines": what each does, which subscription bills it, the required master
  shell exports (`FLEET_ZAI_TOKEN`), and where the user keeps the token today
  (gg-all-projects `.claude/settings.local.json` `env._ANTHROPIC_AUTH_TOKEN`, deliberately
  disarmed with the `_` prefix; the master exports it into its own shell before spawn).
- Replace trap 2 text with the new behaviour and keep the measurement as history.
- `templates/BRIEF_WS.md`: add an "Engine" line and a codex note (no SendMessage, so the
  brief must say: heartbeat every N minutes, `fleet commit` only, write
  `handoffs/HANDOFF_WSxx.md` when done).
- `templates/RUNBOOK.md`: master step "export FLEET_ZAI_TOKEN before any glm spawn".

## Engine-specific facts the implementer needs

claude on z.ai (glm):
- Models seen in the user's config: `glm-5.3` (fable/default slot), `glm-5.3-flash`
  (sonnet/opus slots), `glm-5.2` (haiku slot). Pass `--model` explicitly; the
  `ANTHROPIC_DEFAULT_*_MODEL` vars are an alternative but leak into every pane, so unset
  them and use the flag.
- `claude -p` prints `[claude-code:unrecognized_model] {"model":"glm-5.3-flash",...}` and a
  "claude.ai connectors are disabled because ANTHROPIC_API_KEY or another auth source is
  set" warning to stderr. Both harmless. GLM panes have NO claude.ai MCP connectors.
- Reported `total_cost_usd` is Claude Code's estimate at Anthropic list prices, not z.ai
  billing. Do not surface it as spend.
- Context window: user's current setup exports `CLAUDE_CODE_MAX_CONTEXT_TOKENS=750000`
  alongside the enforcement-disable flag. Make it an engine set-var if the team wants it.

codex:
- Non-interactive: `codex exec [--json] --sandbox read-only|workspace-write --skip-git-repo-check '<prompt>'`. `--skip-git-repo-check` is `exec`-only; interactive `codex` rejects it.
- Interactive: `codex --sandbox workspace-write --ask-for-approval never`. Verify the exact
  approval flag name against `codex --help` for the installed version (0.153.4 today);
  the earlier claim used `--approval-policy`, which is the config key, not necessarily the
  flag.
- Billing: subscription iff `~/.codex/auth.json` `auth_mode == chatgpt` AND
  `OPENAI_API_KEY` is absent from the pane env. Spawn should assert both and refuse
  otherwise (a set key silently bills the API).
- No inbound messaging. The master reaches a codex worker only through
  `tmux send-keys`. Roster files are the whole protocol.
- Codex reads `AGENTS.md`, not `CLAUDE.md`. The brief must be self-contained or point at
  the repo's CLAUDE.md explicitly.

claude-sub:
- Must UNSET the relay vars in the pane command. Measured banner when clean:
  `Sonnet 5 with high effort · Claude Team`.
- If the target repo's `.claude/settings.local.json` `env` block ever carries ARMED
  `ANTHROPIC_*` keys (no `_` prefix), Claude Code applies them at startup regardless of the
  pane env. Spawn cannot fix that; add a check that greps the target repo's
  settings files for armed `ANTHROPIC_BASE_URL` and warns.

## Tests (tests/test-cfn-fleet-engines.sh, per tests/CORE_TEST_STANDARDS.md)

No real engines, no tmux server, no network. Stub binaries on PATH inside the fixture
(`claude`, `codex`, `tmux`) that log their argv and env to files. Cases:

1. `fleet add --engine glm` stores the column; `status` renders it; rosters without the
   column read `claude-sub`.
2. `spawn --dry-run` for each engine prints `PLAN engine` with correct set/unset NAME lists
   and no values.
3. `spawn` (stub tmux) passes `-e K=V` for every set-var and the pane command contains
   `unset <every unset var>` and `exec <bin> <args>`.
4. Missing source var: `FLEET_ZAI_TOKEN` unset -> exit 66, stderr names `FLEET_ZAI_TOKEN`,
   roster row stays `pending`, no tmux call recorded.
5. Banner timeout: stub `tmux capture-pane` returns bash prompt text forever -> exit 66,
   roster stays `pending`, last pane lines printed.
6. Banner match -> `started`, heartbeat set, thin prompt sent exactly once, spares get no
   prompt.
7. Trust prompt: stub capture-pane emits the claude trust text once -> `Down Enter` sent;
   codex text -> `Enter` sent; no prompt text -> no keys sent.
8. Codex billing guard: `OPENAI_API_KEY` present in master env and not in the unset list
   -> refuse; with the unset list -> proceeds and the pane command unsets it.
9. `--no-tmux` output contains `$FLEET_ZAI_TOKEN`, never the resolved value.
10. Token never lands on disk: after a spawn, `grep -r "<value>" <run dir>` is empty.

Existing `tests/test-cfn-fleet-spawn-watch.sh` must stay green; its `--no-tmux` and
`--dry-run` assertions will need the new PLAN/engine lines added, not removed.

## Open decisions (for the cfn team, not blocking)

- Roster column position (append vs reorder). Append is safer for `cut -f` consumers.
- Dedicated tmux socket per run (recommended above) vs. warn-only on the default server.
- Whether `fleet watch` should treat a dead pane (engine exited) as `DEAD` in addition to
  heartbeat staleness. With `exec`, `tmux has-session` answers this cheaply.
- Whether codex workers may run `fleet commit` themselves (needs `workspace-write`) or
  hand back to the master. Recommend they may, guarded by the same claim rules.

## Acceptance

`fleet add WS03 "x" --engine glm && FLEET_ZAI_TOKEN=... fleet spawn WS03` produces a pane
whose banner says `glm-5.3-flash`, a roster row `started` with `engine=glm`, and
`grep -r <token> planning/fleet-*` finds nothing. Same for `--engine codex` (banner
`provider: openai`) and the default (banner `Claude Team`). All ten tests above green, the
existing four fleet test files green.
