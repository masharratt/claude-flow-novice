# Implementation Plan: Fleet Remote Host Workers

## Context
MDTWII's Mac runs at load 45-58 with 8 coding lanes; the server (`ssh vps`: 12 cores, 47 GB,
load ~5, Claude 2.1.296 logged in, tmux 3.4) has room for 3-4 more. The user wants
`fleet spawn WSxx --engine claude-opus --host vps`, usable by ANY project. Claude engines only
(z.ai/glm stays on the Mac, screenshot lanes stay local). The server's Claude account is the
Mac's today and may become a separate one later, with no code change. Workers may push lane
branches to a server-side bare repo.

## Decision (advisor + Codex agree; Option B rejected)
The Mac roster stays the only source of truth. A server worker never runs the fleet CLI and
never writes the roster. Each lane gets an outbox on the server
(`~/fleet-runs/<project>/<run>/<WS>/`); a small version-pinned `remote-worker.sh` (copied from
the Mac at spawn) writes numbered, atomic reports there. The Mac pulls over its normal outbound
ssh (`fleet sync`, also run by the watch/dashboard tick) and applies only that row's worker
fields under the Mac lock. Claims and migration numbers are fixed on the Mac before launch; a
mid-task claim is a request the master approves. `fleet land` fetches the branch and refuses if
the diff touches unclaimed files. B (reverse tunnel) rejected: it needs the Mac's Remote Login
on and gives the server a key into the Mac (Keychain, z.ai token, every project).

Server work copies come from a dedicated fleet clone per project (`~/fleet-repos/<project>`,
whose only remote is the server bare repo `~/git/<project>.git`). The user's own server
checkouts (`~/Projects/<project>`, mostly linked to GitHub) are never touched (user decision,
2026-10-13).

Server workers cannot SendMessage Mac sessions (same-machine only). Their brief says: report
through `remote-worker.sh`; the master polls. MDTWII's "SendMessage on handoff" rule does not
apply to server lanes.

## Reuse
- ssh transport + login-shell preamble: `.claude/skills/cfn-vps/vps.sh:36-54` (host alias, never
  a hardcoded `/home/<user>`).
- Launch script + inherited-env clear: `.claude/cfn-scripts/spawn-env.sh` (`cfn_spawn_launch_write`).
- Roster column append precedent: `engine` column + `_roster_migrate_locked` (`lib/common.sh`).
- Lock-held transaction pattern: `lib/cmd-migrate-next.sh:36-40`.
- Liveness tolerance rule: `lib/common.sh:305-315`.

## Phase 1: Roster host column, claim locking, worktree path helper
| # | File (full path) | Change (exact: function name, typed signature, or config key) | Produces | Consumes | Failing test | Verify command (exits 0/1) | Done predicate |
|---|---|---|---|---|---|---|---|
| 1.1 | .claude/skills/cfn-fleet/lib/common.sh | append roster column 12 `host` to the header; `_roster_migrate_locked` pads it; `fleet_valid_host` (`^[A-Za-z0-9._-]+$`) | lib/common.sh:host_column, lib/common.sh:fleet_valid_host | - | test_roster_host_column_appended_and_old_rows_padded | `bash tests/test-cfn-fleet-roster.sh` | exits 0, new test PASS |
| 1.2 | .claude/skills/cfn-fleet/lib/common.sh | `fleet_worktree_path REPO WS` replaces the two copies of `$repo/.claude/worktrees/${ws,,}` (cmd-spawn.sh:366, cmd-land.sh:50); callers switch in Phases 4 and 6 | lib/common.sh:fleet_worktree_path | - | test_worktree_path_helper | `bash tests/test-cfn-fleet-roster.sh` | exits 0 |
| 1.3 | .claude/skills/cfn-fleet/lib/cmd-claim.sh | read, overlap check and `roster_set claims` inside one roster lock (two concurrent claims could both pass) | lib/cmd-claim.sh:locked_claim | - | test_concurrent_claims_on_same_path_one_wins | `bash tests/test-cfn-fleet-roster.sh` | exits 0 |
| 1.4 | .claude/skills/cfn-fleet/lib/cmd-add.sh | `--claims` overlap-checked against other rows under the same lock | lib/cmd-add.sh:claims_overlap_check | - | test_add_refuses_claims_held_by_another_row | `bash tests/test-cfn-fleet-roster.sh` | exits 0 |

## Phase 2: Host transport library
| # | File (full path) | Change (exact: function name, typed signature, or config key) | Produces | Consumes | Failing test | Verify command (exits 0/1) | Done predicate |
|---|---|---|---|---|---|---|---|
| 2.1 | .claude/skills/cfn-fleet/lib/host.sh (new) | `_fleet_host_run HOST CMD...` (local when HOST empty; else `ssh -o BatchMode=yes -o ConnectTimeout=10 -o ControlMaster=auto -o ControlPersist=60 HOST "bash -lc <preamble + %q args>"`); `_fleet_tmux HOST ARGS...` | lib/host.sh:_fleet_host_run, lib/host.sh:_fleet_tmux | - | test_host_run_local_vs_ssh_argv (stub ssh logs argv) | `bash tests/test-cfn-fleet-host.sh` | exits 0 |
| 2.2 | .claude/skills/cfn-fleet/lib/host.sh | `_fleet_pane_state HOST SOCK SESSION` -> alive / dead / unreachable (ssh rc 255 or timeout = unreachable, never dead); `_fleet_host_free_gb HOST` | lib/host.sh:_fleet_pane_state, lib/host.sh:_fleet_host_free_gb | lib/host.sh:_fleet_host_run | test_pane_state_ssh_failure_is_unreachable_not_dead; test_host_free_gb_parses_df | `bash tests/test-cfn-fleet-host.sh` | exits 0 |

## Phase 3: Remote worker kit
| # | File (full path) | Change (exact: function name, typed signature, or config key) | Produces | Consumes | Failing test | Verify command (exits 0/1) | Done predicate |
|---|---|---|---|---|---|---|---|
| 3.1 | .claude/skills/cfn-fleet/templates/remote-worker.sh (new) | subcommands `heartbeat [note]`, `status <s>`, `handoff <file>`, `request-claim <path>`, `commit -m <msg>` (stages only paths in `claims.txt`, commits, `git push origin fleet/<WS>`); each report written atomically as `reports/<gen>-<seq>.json` (tmp + mv), seq monotonic; reads `outbox.env` (WS, generation) | templates/remote-worker.sh:reports | - | test_remote_worker_commit_stages_only_claimed_and_pushes; test_reports_atomic_and_monotonic | `bash tests/test-cfn-fleet-remote-worker.sh` | exits 0 |
| 3.2 | .claude/skills/cfn-fleet/templates/BRIEF_REMOTE.md (new) | remote brief: no fleet CLI, no SendMessage, server paths, no new claims without a request, push only to origin, no screenshot/Playwright, reserved migration number, scratch DB only | templates/BRIEF_REMOTE.md:brief | - | test_brief_remote_template_has_required_rules | `bash tests/test-cfn-fleet-remote-worker.sh` | exits 0 |

## Phase 4: spawn --host
| # | File (full path) | Change (exact: function name, typed signature, or config key) | Produces | Consumes | Failing test | Verify command (exits 0/1) | Done predicate |
|---|---|---|---|---|---|---|---|
| 4.1 | .claude/skills/cfn-fleet/lib/cmd-spawn.sh | `--host H`: refuse non-`claude-*` engines (exit 64); force worktree mode; write roster `host`; new generation id per spawn; use `fleet_worktree_path` for local rows | lib/cmd-spawn.sh:host_flag | lib/common.sh:host_column, lib/common.sh:fleet_valid_host, lib/common.sh:fleet_worktree_path | test_spawn_host_refuses_glm_and_codex | `bash tests/test-cfn-fleet-spawn-host.sh` | exits 0 |
| 4.2 | .claude/skills/cfn-fleet/lib/cmd-spawn.sh | remote path: `git push <FLEET_HOST_REMOTE:-vps> HEAD:refs/heads/fleet-base/<WS>`; over ssh fetch in `~/fleet-repos/<project>` + `git worktree add -b fleet/<WS> ~/fleet-repos/<project>-wt/<ws>`; symlink each path in `FLEET_REMOTE_LINKS` (fleet.env, e.g. MDTWII `extracted,game`) from `~/Projects/<project>`; create outbox; scp brief, `claims.txt`, `outbox.env`, `remote-worker.sh`; launch with `cfn_spawn_launch_write` + `_fleet_tmux HOST` on socket `fleet-<run>` | lib/cmd-spawn.sh:remote_launch | lib/host.sh:_fleet_tmux, templates/remote-worker.sh:reports, templates/BRIEF_REMOTE.md:brief | test_spawn_host_ssh_sequence (stub ssh/scp/git log) | `bash tests/test-cfn-fleet-spawn-host.sh` | exits 0 |
| 4.3 | .claude/skills/cfn-fleet/lib/cmd-spawn.sh | preflight: refuse when `~/fleet-repos/<project>` is missing or has any remote other than the bare repo ("run fleet host-setup"); refuse when free disk < `FLEET_REMOTE_MIN_FREE_GB` (default 15); warn when the server's cfn-fleet commit differs from the Mac's | lib/cmd-spawn.sh:host_preflight | lib/host.sh:_fleet_host_run, lib/host.sh:_fleet_host_free_gb | test_spawn_host_preflight_refuses_github_remote_and_low_disk | `bash tests/test-cfn-fleet-spawn-host.sh` | exits 0 |

## Phase 5: fleet sync, liveness states, peek
| # | File (full path) | Change (exact: function name, typed signature, or config key) | Produces | Consumes | Failing test | Verify command (exits 0/1) | Done predicate |
|---|---|---|---|---|---|---|---|
| 5.1 | .claude/skills/cfn-fleet/lib/cmd-sync.sh (new) | `fleet sync [WS]`: for host rows pull `reports/` over ssh; drop reports from an old generation or an applied seq; apply only heartbeat (Mac receive time), notes, status (allowed transitions only), handoff file, claim requests (to `handoffs/CLAIM_REQ_<WS>.md`) under one roster lock; never claims or migration_num | lib/cmd-sync.sh:fleet_sync | lib/host.sh:_fleet_host_run, templates/remote-worker.sh:reports | test_sync_ignores_old_generation_and_replayed_seq; test_sync_never_writes_claims | `bash tests/test-cfn-fleet-sync.sh` | exits 0 |
| 5.2 | .claude/skills/cfn-fleet/lib/cmd-watch.sh | watch tick runs `fleet sync`; host-row events (user-selected states): `UNREACHABLE <ws>` (never DEAD on ssh failure), `PROMPT <ws>` (pane shows a permission prompt; regex in one constant), `NOREPORT <ws>` (started, no report after `FLEET_FIRST_REPORT_SECS`, default 300), `LOWDISK <host>` (free < `FLEET_REMOTE_MIN_FREE_GB`) | lib/cmd-watch.sh:host_liveness | lib/cmd-sync.sh:fleet_sync, lib/host.sh:_fleet_pane_state, lib/host.sh:_fleet_host_free_gb | test_watch_unreachable_host_not_dead; test_watch_prompt_noreport_lowdisk_events | `bash tests/test-cfn-fleet-sync.sh` | exits 0 |
| 5.3 | .claude/skills/cfn-fleet/lib/cmd-dashboard.sh | host badge per card and the same four states; browser check of the badge and an unreachable card added to tests/test-cfn-fleet-dashboard-ui.cjs | lib/cmd-dashboard.sh:host_badge | lib/host.sh:_fleet_pane_state | test_dashboard_shows_host_states; dashboard-ui "host badge and unreachable card" | `bash tests/test-cfn-fleet-sync.sh` | exits 0 |
| 5.4 | .claude/skills/cfn-fleet/lib/cmd-peek.sh (new) | `fleet peek WS [lines]`: capture-pane locally or over ssh (to read a remote permission prompt) | lib/cmd-peek.sh:fleet_peek | lib/host.sh:_fleet_tmux | test_peek_remote_uses_ssh | `bash tests/test-cfn-fleet-sync.sh` | exits 0 |

## Phase 6: fleet land for host rows
| # | File (full path) | Change (exact: function name, typed signature, or config key) | Produces | Consumes | Failing test | Verify command (exits 0/1) | Done predicate |
|---|---|---|---|---|---|---|---|
| 6.1 | .claude/skills/cfn-fleet/lib/cmd-land.sh | host rows: `git fetch <remote> fleet/<WS>`; remote worktree clean check over ssh; claims-diff gate (`git diff --name-only fleet-base/<WS>..fleet/<WS>` all inside claims, else exit 65 naming files); existing merge path; remote `git worktree remove` in `~/fleet-repos/<project>` and delete `fleet/<WS>`, `fleet-base/<WS>` in the bare repo; local rows use `fleet_worktree_path` | lib/cmd-land.sh:remote_land | lib/host.sh:_fleet_host_run, lib/common.sh:host_column, lib/common.sh:fleet_worktree_path | test_land_remote_refuses_unclaimed_diff; test_land_remote_fetch_merge_cleanup | `bash tests/test-cfn-fleet-land-remote.sh` | exits 0 |

## Phase 7: fleet host-setup (any project)
| # | File (full path) | Change (exact: function name, typed signature, or config key) | Produces | Consumes | Failing test | Verify command (exits 0/1) | Done predicate |
|---|---|---|---|---|---|---|---|
| 7.1 | .claude/skills/cfn-fleet/lib/cmd-host-setup.sh (new) | `fleet host-setup <alias> [--check]`, idempotent: create `~/git/<project>.git` if missing, push main, add Mac remote `<alias>` (refuse if it exists pointing elsewhere), clone the bare repo to `~/fleet-repos/<project>` (never touches `~/Projects/<project>`), create `~/fleet-runs/`; `--check` prints tmux/claude versions, logged-in account, free disk, cfn-fleet commit drift. Never copies `.env`, never touches logins | lib/cmd-host-setup.sh:host_setup | lib/host.sh:_fleet_host_run, lib/host.sh:_fleet_host_free_gb | test_host_setup_idempotent; test_host_setup_never_touches_user_checkout | `bash tests/test-cfn-fleet-host-setup.sh` | exits 0 |

## Phase 8: Docs and CLI usage
| # | File (full path) | Change (exact: function name, typed signature, or config key) | Produces | Consumes | Failing test | Verify command (exits 0/1) | Done predicate |
|---|---|---|---|---|---|---|---|
| 8.1 | .claude/skills/cfn-fleet/cli/fleet | usage lines for `--host`, `sync`, `peek`, `host-setup` | cli/fleet:usage | lib/cmd-spawn.sh:host_flag, lib/cmd-sync.sh:fleet_sync, lib/cmd-peek.sh:fleet_peek, lib/cmd-host-setup.sh:host_setup | - | `bash tests/test-cfn-fleet-roster.sh` | exits 0 |
| 8.2 | .claude/skills/cfn-fleet/SKILL.md, readme/CHANGELOG.md, readme/feature-status.md | "Remote hosts" section (setup, spawn, sync, land, states, limits: claude engines only, no SendMessage, shared account limits, disk) | docs:remote_hosts | cli/fleet:usage | - | `bash ~/.claude/skills/cfn-doc-lint/execute.sh readme/feature-status.md` | exits 0 |

## Rollback
Additive: `--host` is opt-in; host column empty = local, so every existing run behaves as today. Undo = revert the commits; server side, `rm -rf ~/fleet-repos/<project> ~/fleet-runs/<project>` (user-approved) and delete `fleet/*`/`fleet-base/*` branches in the bare repo.

## Out of scope
- z.ai/glm or codex on remote hosts; screenshot/Playwright lanes remotely.
- Remote scratch databases (lanes needing a DB stay local unless the brief names one).
- MDTWII's own `tools/vps/gate.sh` hardcoded server path.

## Verification
1. Every phase's suite green; existing fleet suites stay green (spawn-watch, engines, roster, dashboard, autosave, portability; commit keeps its one known failure).
2. Live end-to-end on a throwaway repo (host-setup creates its server copies; approved at run time): `fleet host-setup vps` -> `fleet add WS01 --claims a.md` -> `fleet spawn WS01 --engine claude-haiku --host vps` -> worker edits a.md and `remote-worker.sh commit` -> `fleet sync` shows heartbeat/status -> `fleet land WS01` merges; a second lane editing an unclaimed file is refused at land.
3. Break ssh mid-run (bad alias via `FLEET_HOST_REMOTE`/ssh config override): watch shows UNREACHABLE, not DEAD; restore, sync catches up.

## Success Criteria
- `bash tests/test-cfn-fleet-host.sh` exits 0
- `bash tests/test-cfn-fleet-remote-worker.sh` exits 0
- `bash tests/test-cfn-fleet-spawn-host.sh` exits 0
- `bash tests/test-cfn-fleet-sync.sh` exits 0
- `bash tests/test-cfn-fleet-land-remote.sh` exits 0
- `bash tests/test-cfn-fleet-host-setup.sh` exits 0
- `bash tests/test-cfn-fleet-roster.sh` exits 0
- `bash tests/test-cfn-fleet-spawn-watch.sh` exits 0 (no regression)
- Live smoke (Verification 2) lands one claimed commit and refuses one unclaimed diff.
