# Fleet Runbook (master session)

Invoke the CLI as `$HOME/.claude/skills/cfn-fleet/cli/fleet`. Run all commands
from the target project root unless resolving a different run dir on purpose.

1. **Init** the run dir (once, per target project):
   `fleet init <slug> [--worktree] [--db none|docker]`
2. **Register** each workstream:
   `fleet add WS01 "task text" --name <session-name> --claims path/1,path/2 [--engine glm]`
   Non-overlapping claims only; `fleet claim WSxx <path...>` adds more later.
3. **Master-shell export, before any glm spawn**:
   `export FLEET_ZAI_TOKEN=<z.ai token>`. Source today: gg-all-projects
   `.claude/settings.local.json` `env._ANTHROPIC_AUTH_TOKEN` (deliberately
   disarmed with the `_` prefix). Export it into this shell only; spawn passes
   it to panes via tmux argv and never writes it to the run dir. glm spawn
   refuses (exit 66) while it is unset. `claude-sub` and `codex` need no
   export.
4. **Write briefs**: fill `briefs/WSxx.md` from `briefs/BRIEF_WS.md` (task,
   engine, claims, allowed commands, done criteria; codex workers need the
   self-protocol note).
5. **Spawn** workers: `fleet spawn WSxx` (engine pane on the run's socket;
   `--dry-run` first to review the plan). Spares: `--spares N`. Confirm each
   `banner="..."` line before trusting the worker; a banner timeout leaves the
   row `pending`.
6. **Scratch DB** (if `FLEET_DB=docker`): `fleet db WSxx` per workstream that
   needs one; echo `DATABASE_URL`. Reclaim junk with `fleet db-clean [--all]`.
7. **Watch**: `fleet watch` (Monitor tool). React to `CHANGE`/`STALE`/`DEAD`
   lines; stop when it prints `ALL-DONE`.
8. **Land**: workers commit via `fleet commit WSxx -m <msg>` (guarded, claimed
   paths only). Master runs `fleet land WSxx` (worktree mode merges the branch)
   and marks the row landed.
9. **Reserve migrations** before schema work: `fleet migrate-next WSxx
   <migrations_dir>`.
10. **Compaction/death recovery**: `fleet handoff WSxx`, then have a spare
    session read `handoffs/HANDOFF_WSxx.md` as its brief.
11. **Teardown**: `fleet db-clean` for this run's containers; archive the run
    dir or mark every row done/dead.
