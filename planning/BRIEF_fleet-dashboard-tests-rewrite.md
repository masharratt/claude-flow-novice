# BRIEF: rewrite lost fleet-dashboard tests (live view + sessions panel + archive)

Context: on 2026-10-15 a helper deleted the repo; it was restored from GitHub at bfa77b49. The implementation code survived as uncommitted working-tree changes in `.claude/skills/cfn-fleet/` (`git diff` shows them; `lib/cmd-archive.sh` is new/untracked). The TESTS for that code were lost. Rewrite them.

## Code under test (read it; do not change behavior unless a test exposes a real bug, and report any such fix)
1. Live pane view (was commit a66bd816, lost): `GET /api/pane` in `lib/dashboard-server.py` (runs `fleet peek`, strips ANSI/control codes, line clamp 5..200, 2s local / 5s remote cache, one read per worker at a time, 409 "no session", unreachable error; test seam `FLEET_DASHBOARD_PEEK_CMD`; health reports `pane`). Page toggle in `lib/cmd-dashboard.sh` (collapsed by default, refreshes only while open and tab visible, survives redraw, hidden on file:// and --no-serve). Host rows use values from `remote/<WS>.env` (server reads it; renderer passes them via host-states.tsv columns; remote row with no env file gets no command / 409).
2. Sessions panel: `GET /api/sessions` (reads `*.json` in `FLEET_DASHBOARD_SESSIONS_DIR`, whitelisted fields only, never opens `*.key` files, dead pids excluded, lane vs master by cwd or tmux name vs roster, roster review/gate mapped to "in review"/"in gate", other-project grouping, >24h stale label, origin checks, health reports `sessions`). Page panel.
3. `fleet archive [--undo]`: only creates/removes `<run>/.archived`; archived runs skipped when fleet picks the current run.

## Where
Add cases to `tests/test-cfn-fleet-dashboard.sh` and `tests/test-cfn-fleet-dashboard-ui.cjs`, following the existing style there. Look at existing cases for the open endpoint as the pattern for spinning the server up.

## HARD SAFETY RULES (a previous helper wiped the repo)
- Never run `rm -rf` (or any rm) on a variable that could be empty or fall back to the cwd. Every temp dir: `T=$(mktemp -d "${TMPDIR:-/tmp}/fleetdash.XXXXXX") || exit 1`, then assert `case "$T" in */fleetdash.*) ;; *) exit 1;; esac` before any cleanup. Use `set -u`.
- In your own shell commands, never delete anything outside a temp dir you just created and verified. If mktemp fails, stop.
- Do not run the full suites (coordinator runs them). Syntax checks only: `bash -n`, `node --check`.
- Do not commit, push, or touch git state.

## Report
<=250 words plain English: cases added per file, any code bug found. You are a leaf agent. Do not spawn subagents; do the work yourself.
