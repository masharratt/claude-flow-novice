# Brief: fleet dashboard, open a worker's tmux session from its card

Goal: each worker card on the fleet dashboard gets (a) its attach command shown with a Copy
button and (b) an "Open in terminal" button that opens a real terminal window attached to
that worker's tmux session. User chose the full one-click version.

## Code to read first
- `.claude/skills/cfn-fleet/lib/cmd-dashboard.sh` (1829 lines). Cards are rendered twice and
  must stay in sync: bash `_fleet_dash_card` (~line 614) and JS `cardHtml` (~line 1204).
  Server: `_fleet_dash_serve_start` (~line 1663) runs an INLINE python `http.server` script;
  `_fleet_dash_serve_is_serving` matches the pid's cmdline on the text `http.server`.
- `lib/common.sh:373` `_fleet_tmux_socket` (socket = `tmux -L <sock>`); session name = roster
  `name` column. Remote workers (roster `host` column set) live on that ssh alias, same socket.
- Prior art (another repo, read only): `/Users/sharratt/Projects/gg-all-projects/scripts/dispatch-runner/`
  `dashboard.ts` (~line 220 open-terminal route + origin gate), `terminal.ts` (wt.exe argv),
  `dashboard-page.ts:109-173` (button + fallback text).
- Tests: `tests/test-cfn-fleet-dashboard.sh`, `tests/test-cfn-fleet-dashboard-ui.cjs` (Playwright).

## Requirements
1. Attach command per card. Local: `tmux -L <sock> attach -t <name>`. Remote:
   `ssh -t <host> tmux -L <sock> attach -t <name>`. Socket goes on the page (e.g. body
   `data-socket`), escaped. Shown in a `<code>` plus a Copy button (navigator.clipboard,
   fallback to selecting the text). Only for rows that have a session (not `pending`).
2. Move the inline python server into its own file (e.g. `lib/dashboard-server.py`). Same
   static serving and quiet logging as today, 127.0.0.1 only. Keep start/stop/is_serving
   working (update the cmdline matcher; pid-file flow unchanged).
3. `POST /api/open-terminal` with JSON `{"ws": "<ws_id>"}`. Server reads roster.tsv by header
   name itself and derives session name, host, socket; never trusts a session/host/command
   from the request. Validate session, socket, host against strict patterns. Gate: Origin must
   equal `http://127.0.0.1:<port>` or `http://localhost:<port>`, reject
   `Sec-Fetch-Site: cross-site`, require `Content-Type: application/json`. Unknown ws or
   pending row: 404/409 with JSON error.
4. Launchers, argv arrays only, never a shell string built from roster text without
   `shlex.quote`:
   - macOS: `osascript` telling Terminal to `do script "<quoted attach cmd>"` then activate.
   - WSL2 (`WSL_DISTRO_NAME` set, `wt.exe` found under `/mnt/c/Users/*/AppData/Local/Microsoft/WindowsApps/` or PATH):
     `wt.exe new-tab wsl.exe -d <distro> <attach argv>`.
   - Otherwise: 501 JSON carrying the attach command.
   - Test seam: env `FLEET_DASHBOARD_OPEN_CMD` = path to a program run instead of the real
     launcher, given the attach argv. Tests point it at a stub that records argv.
5. Page: show Open button only when served over http and `GET /api/health` (new, returns
   `{"ok":true,"open":true|false}`) says open is available. On failure show a short message
   "Could not open a terminal, use the command shown". `--no-serve`/file:// page: Copy only.
6. Page contract in the file header still holds: escape everything, no `<link>`, no em dashes
   in code, comments or page copy.
7. Tests first (TDD): extend both test files. Cover the origin gate (403), unknown ws, pending
   row, launcher argv for local and remote rows via the stub, health endpoint, copy command
   text on both bash-rendered and JS-rendered cards, button hidden on --no-serve.
8. Docs: update `.claude/skills/cfn-fleet/SKILL.md` dashboard section, and the
   "Fleet run dashboard" row in `readme/feature-status.md` (bump Last Updated line,
   Description cell under 280 chars).

## Constraints
- Edit safety hooks per CLAUDE.md section 1 around each edit.
- Do NOT run the test suites; the coordinator runs them. You may run `bash -n`,
  `python3 -m py_compile`, `node --check`. Do not commit.
- Report back (under 300 words): files changed, test cases added, anything left out.
