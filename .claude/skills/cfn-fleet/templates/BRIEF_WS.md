# Workstream Brief: WSxx

**You are a worker session. Coordinate only via roster files** under
`planning/fleet-*/` — never via ad-hoc messages to other sessions. If you are
blocked, set status `blocked` (`fleet heartbeat WSxx blocked: <reason>`) and
stop.

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

- Commit only via `fleet commit WSxx -m <msg>` (claims-only staging, refuses
  unclaimed dirty files).
- Heartbeat on pickup and after each chunk: `fleet heartbeat WSxx [note]`.
- Migration number (if schema work): reserve with
  `fleet migrate-next WSxx <migrations_dir>` before creating any file.
- You are a leaf: do not spawn other Claude sessions.
