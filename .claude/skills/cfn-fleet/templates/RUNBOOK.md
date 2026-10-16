# Fleet Runbook (master session)

Invoke the CLI as `$HOME/.claude/skills/cfn-fleet/cli/fleet`. Run all commands
from the target project root unless resolving a different run dir on purpose.

1. **Init** the run dir (once, per target project):
   `fleet init <slug> [--worktree] [--db none|docker]`
2. **Register** each workstream:
   `fleet add WS01 "task text" --name <session-name> --claims path/1,path/2 [--engine glm]`
   Non-overlapping claims only; `fleet claim WSxx <path...>` adds more later.
3. **z.ai token, before any glm spawn**: either
   `export FLEET_ZAI_TOKEN=<z.ai token>` in this shell, or store it once in
   the macOS keychain with
   `security add-generic-password -a "$USER" -s cfn-fleet-zai -w` (prompts
   for the value), or put it in `~/.config/cfn-fleet/zai.token` with
   `chmod 600`. Spawn checks env, then keychain, then file; it passes the
   token to panes via tmux argv and never writes it to the run dir. glm spawn
   refuses (exit 66) when none has a token of 20+ characters. `claude-sub`
   and `codex` need nothing.
3b. **Shared data linked into worktrees** (caches, extracted assets): make it
   read-only before spawning: list it in `<repo>/.zai-fence-readonly` (one
   path per line), then `~/.claude/cfn-scripts/readonly-data.sh lock` (`unlock`
   before a rebuild, `status` to check). The lock stops every agent and
   process; the same list also blocks glm workers inside zai-fence. A
   writable link let a worker's test cleanup wipe 7.5 GB four times (MDTWII,
   2026-10-16). If shared data vanishes and no session log shows an `rm`,
   check lane test cleanup code (`Drop`, teardown, fixtures) first: deletes
   inside a compiled test binary never reach a shell hook.
   Reviews: fail any lane whose test cleanup can delete a path outside its own
   temp dir. `fleet land WSxx` enforces this: it scans the lane's added lines
   for recursive deletes and refuses (exit 67) until the reviewer confirms the
   path and re-runs with `--allow-deletes`.
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
   lines; stop when it prints `ALL-DONE`. Alternative: `fleet dashboard --open`
   serves a self-contained HTML tracking page on 127.0.0.1:4880 and opens it in
   VS Code Simple Browser (status, heartbeat age, claims, STALE/DEAD, timeline;
   safe beside `fleet watch`); `fleet dashboard --stop` tears it down. Drop a
   `glossary.tsv` (code TAB meaning) beside roster.tsv to get a Code key panel
   and hover tooltips on project codes in tasks and notes.
   Standard cadence: the main chat runs a fleet check every **15 minutes**
   regardless of watch/dashboard activity — `fleet status`, react to STALE/DEAD,
   unblock workers, land finished lanes (see SKILL.md "Master check cadence").
8. **Land**: workers commit via `fleet commit WSxx -m <msg>` (guarded, claimed
   paths only). Master runs `fleet land WSxx` (worktree mode merges the branch)
   and marks the row landed.
9. **Reserve migrations** before schema work: `fleet migrate-next WSxx
   <migrations_dir>`.
10. **Compaction/death recovery**: `fleet handoff WSxx`, then have a spare
    session read `handoffs/HANDOFF_WSxx.md` as its brief.
11. **Teardown**: `fleet db-clean` for this run's containers; archive the run
    dir or mark every row done/dead.
