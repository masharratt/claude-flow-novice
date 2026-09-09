# Fleet Coordination Protocol

This directory (`planning/fleet-*/`) is the data plane for a multi-session fleet:
one master Claude Code session coordinating N worker sessions. Every worker is a
full Claude Code session with its own context and its own subagents.

## Thin messages, fat files

State lives in FILES, not in chat messages. Roster, briefs, and handoffs carry
all durable information. SendMessage (or the tmux prompt) only assigns, wakes,
or blocks. A message that carries state is a bug: put the state in a file and
send the path.

## Claims rule

Before touching a file, a workstream must own it in `roster.tsv` (the `claims`
column). Claims are repo-relative paths or globs, space-separated. Overlapping
claims are refused by `fleet claim`. Never edit a file another row claims; if
you must, coordinate through the master session, never directly.

## Commits

All commits go through `fleet commit WSxx -m <msg>`. It stages ONLY the row's
claimed paths and refuses (exit 66) when unclaimed dirty files are present, so
one session's hunk can never be swept into another session's commit.

## Migration reservations

Never pick a migration number by eye. Reserve with `fleet migrate-next WSxx
<migrations_dir>`; it allocates max+1 under flock and records it in the roster.

## Sessions and compaction restarts

- Each worker session gets `briefs/WSxx.md` as its brief (the prompt is just
  "read briefs/WSxx.md and start" — thin message).
- Workers heartbeat with `fleet heartbeat WSxx [note]` when they pick up or
  finish a chunk of work; the note replaces the previous one.
- Spare sessions (`<name>-spare<k>`) sit empty. When a worker's context
  compacts or dies, the master runs `fleet handoff WSxx`, and the spare reads
  `handoffs/HANDOFF_WSxx.md` as its new brief.

## Status vocabulary

`pending | started | working | blocked | landed | done | dead` — one token, no
invented states. The master is the only session that sets `landed`/`done`/`dead`.

## Engines

Workers on this run may be a mix of engines (`claude-sub`, `glm`, `codex`); the
roster's `engine` column records which. The protocol above is bash plus files,
so it is engine-neutral: every worker, whatever it runs, claims through the
same roster, commits through `fleet commit`, and heartbeats the same way.
Spawn verifies each pane's engine banner before the row reaches `started`, so a
worker on the wrong model never enters this fleet silently. Do not assume
cross-engine messaging: `codex` workers have no inbound channel at all, and
`glm`/`codex` panes are not Claude sessions, so anything you would say to a
worker goes through the roster files or the master, never through
session-to-session messaging.

**Data-access rule for third-party engines (`glm`):** glm workers may write and
edit code that targets Airtable, Attio, or the project database, but must NOT
access those systems live — no API requests, no migrations, no db-query, no
curl/psql/fetch against them. Their panes are launched without data-system
credentials (see the `unset` list in `engines.env`). Live access and
verification belong to a `claude-sub` workstream or the master. If the target
project's CLAUDE.md/AGENTS.md carries its own engine data-access rule, that
rule applies in full.

## Monitoring

`fleet watch` emits one event line per change (CHANGE / STALE / DEAD / ALL-DONE)
and is designed to run under the Monitor tool: stdout lines only, `--once` for
tests.

## Worktree mode

When `fleet.env` sets `FLEET_WORKTREE=on`, workers get their own git worktree
under `.claude/worktrees/` and branch `fleet/<WSxx>`; claims are still tracked
in this shared roster, and `fleet land WSxx` merges the branch back. Default is
main-in-place: everyone works in the repo checkout, which is why the claims rule
is not optional.
