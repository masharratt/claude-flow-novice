# Fleet Runbook (master session)

Invoke the CLI as `$HOME/.claude/skills/cfn-fleet/cli/fleet`. Run all commands
from the target project root unless resolving a different run dir on purpose.

1. **Init** the run dir (once, per target project):
   `fleet init <slug> [--worktree] [--db none|docker]`
2. **Register** each workstream:
   `fleet add WS01 "task text" --name <session-name> --claims path/1,path/2`
   Non-overlapping claims only; `fleet claim WSxx <path...>` adds more later.
3. **Write briefs**: fill `briefs/WSxx.md` from `briefs/BRIEF_WS.md` (task,
   claims, allowed commands, done criteria).
4. **Spawn** workers: `fleet spawn WSxx` (tmux session per name; `--dry-run`
   first to review the plan). Spares: `--spares N`.
5. **Scratch DB** (if `FLEET_DB=docker`): `fleet db WSxx` per workstream that
   needs one; echo `DATABASE_URL`. Reclaim junk with `fleet db-clean [--all]`.
6. **Watch**: `fleet watch` (Monitor tool). React to `CHANGE`/`STALE`/`DEAD`
   lines; stop when it prints `ALL-DONE`.
7. **Land**: workers commit via `fleet commit WSxx -m <msg>` (guarded, claimed
   paths only). Master runs `fleet land WSxx` (worktree mode merges the branch)
   and marks the row landed.
8. **Reserve migrations** before schema work: `fleet migrate-next WSxx
   <migrations_dir>`.
9. **Compaction/death recovery**: `fleet handoff WSxx`, then have a spare
   session read `handoffs/HANDOFF_WSxx.md` as its brief.
10. **Teardown**: `fleet db-clean` for this run's containers; archive the run
    dir or mark every row done/dead.
