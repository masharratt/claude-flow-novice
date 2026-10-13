# Lane context: fleet remote host workers

Plan: planning/PLAN_fleet-remote-host-workers.md (read your Phase only, plus Decision + Reuse).

## Environment facts (learned the hard way, 2026-10-13)
- macOS, Homebrew bash 5 at /opt/homebrew/bin/bash; BSD userland. Use the GNU-first/BSD-fallback
  helpers in .claude/skills/cfn-fleet/lib/common.sh (`_fleet_stat_mtime_size`, `_fleet_file_mode`,
  `_fleet_pid_alive`, `_fleet_sha1`, `_fleet_epoch_hms`). BSD `wc -l` pads with spaces: strip
  them. `mktemp -d` under /var is reported as /private/var by pwd -P: canonicalize test temp
  dirs with `cd "$(mktemp -d ...)" && pwd -P`.
- The Claude Code Bash sandbox blocks shell writes under .claude/skills: edit those files with
  the Edit/Write tools, not sed/python/heredocs.
- Test suites that create temp dirs under /var/folders or start tmux need the Bash tool with
  `dangerouslyDisableSandbox: true` to run.
- Never call the real `ssh`, `scp` or the real server in tests. Put stub `ssh`/`scp`/`tmux`
  scripts first on PATH that log their argv to a file and return scripted output, the same way
  tests/test-cfn-fleet-spawn-watch.sh stubs tmux (see its `$TMP_DIR/bin/tmux` stub and
  `capture_script`). ssh rc 255 = connection failure.
- Existing test style: bash, `set -euo pipefail`, source tests/test-utils.sh (assert_contains,
  assert_equals, assert_success, log_step) or the ok/no helpers used in
  tests/test-cfn-fleet-engines.sh / roster.sh. Name the bug or AC in the test name.
- Code style: match the file you edit; no em dashes in code or comments; comments explain why.
- Roster: lib/common.sh (`roster_set`, `roster_get`, `_roster_field_idx`, `_roster_migrate_locked`,
  header on line ~37). Engines: lib/engines.sh. Launch script: .claude/cfn-scripts/spawn-env.sh
  (`cfn_spawn_launch_write ENV_LINES PANE_CMD` -> CFN_SPAWN_LAUNCH_LINE, CFN_SPAWN_ENV_DIR).
- ssh preamble to reuse (from .claude/skills/cfn-vps/vps.sh:36-54): login shell
  `bash -lc`, sources nvm and ~/.cargo/env, adds ~/.local/bin to PATH, args `%q`-quoted.
  Never hardcode a server username or /home/<user>; use `~`/$HOME on the server side.

## Shared interfaces (exact names; other lanes build on them)
- lib/host.sh: `_fleet_host_run HOST CMD...` (HOST empty = run locally), `_fleet_tmux HOST ARGS...`,
  `_fleet_pane_state HOST SOCK SESSION` -> prints alive|dead|unreachable, `_fleet_host_free_gb HOST`.
- lib/common.sh: roster column 12 `host`; `fleet_valid_host NAME`; `fleet_worktree_path REPO WS`.
- templates/remote-worker.sh: reads `outbox.env` (FLEET_WS, FLEET_GEN, FLEET_OUTBOX, FLEET_BRANCH,
  FLEET_PUSH_REMOTE=origin) next to itself; writes `reports/<gen>-<seq>.json`, one JSON object per
  file: {"ws","gen","seq","kind":"heartbeat|status|handoff|claim_request|commit","ts_worker",
  "note"?, "status"?, "path"?, "sha"?, "file"?}. Handoff files copied into `handoffs/` in the outbox.
- Server layout: bare repo ~/git/<project>.git; fleet clone ~/fleet-repos/<project>; worktrees
  ~/fleet-repos/<project>-wt/<ws lowercase>; outbox ~/fleet-runs/<project>/<run>/<WS>/.
- fleet.env knobs: FLEET_HOST_REMOTE (Mac git remote name, default = host alias),
  FLEET_REMOTE_LINKS, FLEET_REMOTE_MIN_FREE_GB (15), FLEET_FIRST_REPORT_SECS (300).

## Wave-2 contract (lanes 4-7 must agree on this)
- Project name = basename of the Mac repo toplevel; run name = basename of the Mac run dir
  (e.g. `fleet-main`).
- `fleet spawn --host` writes `<run_dir>/remote/<WS>.env` (mode 600, KEY=value lines, values
  shell-quoted with printf %q): FLEET_HOST, FLEET_GIT_REMOTE (Mac git remote name, default =
  FLEET_HOST), FLEET_PROJECT, FLEET_RUN, FLEET_GEN (new random id per spawn), FLEET_REMOTE_WT
  (absolute server path), FLEET_OUTBOX (absolute server path), FLEET_BRANCH (`fleet/<WS>`),
  FLEET_BASE_REF (`fleet-base/<WS>`), FLEET_SOCK, FLEET_SESSION, FLEET_SPAWNED_AT (Mac epoch).
  Resolve server `~` once at spawn (`_fleet_host_run H bash -c 'printf %s "$HOME"'`) and store
  absolute paths, so later commands never depend on tilde expansion.
- `fleet sync` records applied progress in `<run_dir>/remote/<WS>.applied` (`<gen> <max seq>`);
  reports with another gen or seq <= max are ignored. Report files are `reports/<gen>-<seq>.json`
  with UNPADDED seq: sort numerically. Ignore dot-prefixed temp files.
- `fleet land` reads `remote/<WS>.env`; on success it removes that file and `.applied`.
- `fleet host-setup <alias>` adds the Mac git remote named `<alias>` -> `<alias>:git/<project>.git`.

## Learnings from wave 1
- host.sh %q-quotes every word, so `~` and `$HOME` inside a CMD word do NOT expand on the
  server. For server-side paths pass `bash -c '<script>' _ args...` as the command.
- remote-worker.sh exit codes: 64 usage, 65 nothing claimed changed, 66 missing
  outbox.env/claims.txt/handoff file, 70 commit made but push failed. claims.txt: paths
  separated by whitespace or newlines, `#` comments.
- roster_set takes the lock; inside an already-locked section call `_roster_set_locked`
  (flock is not re-entrant). Claim overlap helper: `_roster_claims_conflict WS CLAIM...`.
- A prefix assignment before `X=$(...)` is not exported into the subshell; export it.
