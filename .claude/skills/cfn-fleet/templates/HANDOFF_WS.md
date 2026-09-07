# Handoff: WSxx

Filled by `fleet handoff WSxx`. A spare session reads this file as its brief
after the previous session compacted or died. Read it top to bottom, then
continue the work — do not redo it.

## Roster row

- **Task:** <task>
- **Claims:** <claims>
- **Status:** <status>
- **landed_sha:** <landed_sha>
- **migration_num:** <migration_num>
- **scratch_db:** <scratch_db>
- **Last note:** <notes>
- **Dirty files (uncommitted, unclaimed):** <dirty files list>

## Continuation instructions

1. Re-read your claims before touching anything (roster is the truth).
2. Resume from the last note above; check `git status` for half-done work.
3. Keep committing via `fleet commit WSxx -m <msg>` and heartbeating.
4. If the previous session's approach looks wrong, say so in your first note
   (`fleet heartbeat WSxx ...`) rather than silently restarting.
