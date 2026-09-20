# Workstream Brief: WSxx

**You are a worker session. Coordinate only via roster files** under
`planning/fleet-*/` — never via ad-hoc messages to other sessions. If you are
blocked, set status `blocked` (`fleet heartbeat WSxx blocked: <reason>`) and
stop.

## Engine

<claude-sub | glm | codex> (the engine `fleet spawn` launched for this pane)

If you are a **glm** (z.ai) worker: you may write and edit code that targets
Airtable, Attio, or the database, but you must NOT access those systems live —
no API requests, no migrations, no db-query, no curl/psql/fetch against them.
Write the test or script, hand live execution to a claude-sub workstream or
the master. If the repo's CLAUDE.md/AGENTS.md has an engine data-access rule,
follow it in full.

If you are a **codex** worker: you have no inbound messaging, so this brief and
the roster files are your entire protocol. Heartbeat every ~10 minutes with
`fleet heartbeat WSxx <note>`; whenever the set of files being edited changes,
run `fleet heartbeat WSxx --files <comma-separated paths>` (feeds the
dashboard "now editing" card); commit only via `fleet commit WSxx -m <msg>`;
when the workstream is finished, write `handoffs/HANDOFF_WSxx.md` summarizing
state, then heartbeat `done:` so the master sees it. You read `AGENTS.md`, not
`CLAUDE.md`: read the repo's CLAUDE.md for its rules (style, test output
capture, git workflow) before writing code.

## Task

<one-paragraph statement of the workstream's task>

## Claims (your only writable paths)

<path1> <path2> ...

Do not edit anything outside these claims. Need more? Ask the master to
`fleet claim WSxx <path>` — do not just take the file.

## Allowed commands

<the commands this workstream may run, e.g. test runner, linter>

## Done criteria

- [ ] <verifiable condition 1>
- [ ] <verifiable condition 2>
- [ ] Tests pass; full output captured to a file, no watch mode

## Protocol reminders

- Verify scoped suites and tsc on CLAIMED paths only; the full suite is the
  master's landing gate, run after all lanes land. A full-suite failure inside
  another lane's in-flight files is not yours to fix or wait on.
- Never run raw `git commit`: everything lands via `fleet commit WSxx -m <msg>`
  (claims-only staging, refuses unclaimed dirty files). If you believe a forced
  commit is needed, stop and report to the master instead.
- Heartbeat on pickup and after each chunk: `fleet heartbeat WSxx [note]`.
  When the set of files being edited changes, add
  `--files <comma-separated paths>` so the dashboard "now editing" card
  stays current.
- Migration number (if schema work): reserve with
  `fleet migrate-next WSxx <migrations_dir>` before creating any file.
- You are a leaf: do not spawn other Claude sessions.
