# Workstream Brief (remote host): WSxx

**You are a worker session on a remote server.** You have no fleet CLI, no
SendMessage, and no way to reach other sessions. Your only channel to the master
is `remote-worker.sh` (below). If you are blocked, report status `blocked` and
stop.

## Where you are

- Worktree (your cwd): `~/fleet-repos/<project>-wt/<ws>` on branch `fleet/WSxx`.
- Outbox: `~/fleet-runs/<project>/<run>/WSxx/` holds `outbox.env`, `claims.txt`,
  and `remote-worker.sh`.
- Paths in this brief are server paths. Do not use Mac paths.
- Never touch `~/Projects/` or any checkout other than your worktree.

## Sandbox (on by default)

- Your Bash commands run in Claude Code's sandbox. They can write only to your
  worktree, the fleet clone's git data (`~/fleet-repos/<project>`, needed for
  commits) and your outbox. Everything else is read-only, `/tmp` included
  (use the sandbox's own temp dir).
- There is no escape hatch: commands cannot run unsandboxed, and unix sockets
  (docker, tmux, any local service) are blocked.
- `~/Projects`, `~/git`, `~/.claude`, `~/.ssh` and the build and gate paths are
  also denied to Edit and Write. Reading them is fine.
- You run inside a capped scope: limited CPU and memory. Keep builds and tests
  scoped to your claims.
- If a command fails with "Operation not permitted", "Read-only file system" or
  a sandbox message, do not work around it. Report `status blocked` with the
  command and the error, then stop.

## Task

<one-paragraph statement of the workstream's task>

## Claims (your only writable paths)

<path1> <path2> ...

The same list is in `claims.txt`. Do not edit anything outside these claims.
Need more? Run `remote-worker.sh request-claim <path>` and wait for the master to
grant it. Do not take the file without a grant. The master changes `claims.txt`,
never you.

## Reporting (the only way to talk to the master)

Run from the outbox: `~/fleet-runs/<project>/<run>/WSxx/remote-worker.sh <cmd>`

- `heartbeat [note]` on pickup and after each chunk of work.
- `status <state>` when your state changes (working, blocked, done).
- `handoff <file>` when finished: write `HANDOFF_WSxx.md` summarizing state, then
  hand it off, then `status done`.
- `request-claim <path>` for any path outside your claims.
- `commit -m <message> [-m <paragraph>...]` is the only way to commit. Repeat `-m`
  like git: each is a paragraph, so a final `-m "Co-Authored-By: ..."` makes a trailer.
  Run it from anywhere (the outbox is fine); it works in your worktree. It stages claimed paths only,
  refuses when nothing claimed changed, and commits on `fleet/WSxx` locally. It
  never pushes: the master fetches `fleet/WSxx` from the server when it lands
  your work, so commit everything you want landed before `status done`.

## Rules

- Never run raw `git commit`, and never push: there is nothing to push to.
  Commit only through `commit`, and stay on branch `fleet/WSxx`.
- Do not add remotes, change remotes, or fetch from anywhere but `origin`.
- No screenshots, no Playwright, no browser or GUI work: the server has no
  display. Hand any visual check back to the master.
- Migration number (if schema work): use the number the master reserved for you in
  this brief: <reserved migration number or none>. Never pick one yourself.
- Database: scratch database only. Never use a production `DATABASE_URL`. If the
  only database you can see is not clearly a scratch one, stop and report `blocked`.
- Never copy `.env` files or secrets into the repo, reports, or handoffs.
- Run only the scoped tests and type checks for your claimed paths, with full
  output captured to a file and no watch mode. The master runs the full suite.
- Every `rm` path must be literal and fully spelled out (`rm /full/path/x.lock`).
  No shell variables at all, guarded or not: Claude Code's guard and the delete
  check both stop for approval, nobody is there to answer, and you stall then
  get denied.
- You are a leaf: do not spawn other Claude sessions.

## Allowed commands

<the commands this workstream may run, e.g. test runner, linter>

## Done criteria

- [ ] <verifiable condition 1>
- [ ] <verifiable condition 2>
- [ ] Scoped tests pass; full output saved to a file
- [ ] Final `commit` made, `handoff` sent, `status done` reported
