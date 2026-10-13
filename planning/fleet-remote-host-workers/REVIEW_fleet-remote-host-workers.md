# Plan Review (cfn-plan-review, 2026-10-13)

## 1. Assumptions verified
| # | Assumption | Verify command (executed) | Evidence | Verdict |
|---|---|---|---|---|
| A1 | Server checkouts pull from a server bare repo | `ssh vps 'git -C ~/Projects/* remote get-url origin'` | only MDTWII -> `~/git/MDTWII.git`; 8 others -> github.com; ai-video-test none | FAILED -> plan changed to dedicated `~/fleet-repos/<project>` (user decision) |
| A2 | ssh ControlMaster works Mac -> vps | `ssh -o ControlMaster=auto -o ControlPath=... vps true`, then reuse | "A2 controlmaster: ok", "reuse via control socket: ok" | VERIFIED |
| A3 | Server tmux sessions outlive the Mac's connection | `ssh vps tmux ls` | MDTWII session created 2026-10-11, still listed | VERIFIED |
| A4 | Server cfn-fleet matches the Mac | `git log -1` both sides | server bfca2ee0 (2026-10-08) vs Mac 366cab29 | FAILED -> remote-worker.sh shipped per spawn; drift warning (Phase 4.3) |
| A5 | Server has disk for 3-4 Rust lanes | `ssh vps df -h ~` | 387G, 336G used, 52G free (87%) | RISK -> LOWDISK state + spawn refuses < 15 GB |
| A6 | Server bash/git support the plan (`%q`, worktrees) | `ssh vps 'echo $BASH_VERSION; git --version'` | bash 5.2.21, git 2.43.0 | VERIFIED |
| A7 | Nothing outside cfn-fleet reads roster.tsv | `grep -rl roster.tsv .claude/skills .claude/hooks` excluding cfn-fleet | 0 hits | VERIFIED |
| A8 | Dashboard reads roster columns by name, so column 12 is safe | read cmd-dashboard.sh:356-373 | `case` on header names (`engine) engine=...`) | VERIFIED |
| A9 | Remote lanes rarely need mid-task claims | not command-verifiable | - | UNTESTED -> design tolerates it (request + approve); revisit if requests pile up |

## 2. Dependency graph (cfn-fleet)
- Roster column readers: common.sh, cmd-claim, cmd-db, cmd-land, cmd-commit, cmd-spawn, cmd-add, cmd-handoff, cmd-watch, engines.sh (grep: 10 files); all via `roster_get`/header index, no awk `$10/$11` positional reads (grep: 0).
- `_fleet_tmux_pane_alive` callers: common.sh:299/305, cmd-dashboard.sh:385, cmd-watch.sh:123/201, heartbeat-ticker.sh:67 (6 sites) -> Phase 5 swaps watch/dashboard; ticker stays local to its own host.
- Direct `tmux -L` calls: cmd-spawn.sh 24, heartbeat-ticker.sh 1, common.sh 1 -> Phase 4 routes spawn's through `_fleet_tmux`.
- Worktree path built twice: cmd-spawn.sh:366, cmd-land.sh:50 -> Phase 1.2 helper.
- Outbound: cfn-vps `vps.sh` (preamble pattern reused, not modified); MDTWII run dirs (column 12 padded on next write).

## 3. Blast radius
- Covered: roster schema, spawn, land, watch, dashboard, claim, add, CLI usage, docs.
- Safe: local-only runs (host empty), cfn-tmux-agents (no roster), cfn-vps (unchanged), user server checkouts (never touched).
- Gaps closed in this revision: A1 (dedicated clone), A5 (disk guard), claim race (Phase 1.3/1.4), DRY worktree path (Phase 1.2).

## 4. Edge cases and binding state list
- User-selected states (2026-10-13): unreachable, waiting on a prompt, no report yet, low server disk. Declined: none.
- ssh drop mid-spawn: spawn leaves the row pending and removes any half-made remote worktree.
- Mac asleep: reports queue in the outbox; sync applies them in seq order on wake.
- Respawn of a lane: new generation; old-generation reports dropped.
- Unreachable worker's claims are never released automatically (split-ownership risk); master must confirm shutdown first.
- Land with remote worktree dirty: refused, names files.

## 5. Alpha readiness
| Area | Status | Notes |
|---|---|---|
| test | PASS | every step names its failing test; Phase 5/6 cover each selected state and edge case |
| security | PASS | no inbound access to the Mac; host alias validated before ssh; no secrets copied (`.env` never shipped); worker clone has no GitHub remote |
| backend | PASS | ssh failures -> unreachable/refusal with named cause; bounded ConnectTimeout |
| frontend | PASS | dashboard badge and unreachable card: browser check in `tests/test-cfn-fleet-dashboard-ui.cjs` (Phase 5.3) |
| architect | PASS | rollback section: opt-in flag, revert commits, documented server cleanup |
| supabase | N/A | no database |
| contract | PASS | report format defined once in remote-worker.sh and validated by cmd-sync (generation, seq, allowed fields) |
| consistency | PASS | knobs named once in fleet.env (`FLEET_HOST_REMOTE`, `FLEET_REMOTE_LINKS`, `FLEET_REMOTE_MIN_FREE_GB`, `FLEET_FIRST_REPORT_SECS`); docs in Phase 8 |

## 6. Open-item register
- BLOCKING (answered): server copy source -> separate fleet copy; states -> all four.
- DEFERRED: report format JSON vs TSV (default JSON lines, `jq` already a CFN dependency; revisit if `jq` missing on a host). Remote CARGO_TARGET_DIR sharing per project (default: per worktree; revisit if LOWDISK fires). Separate Claude account per host (default: same login; a second ssh alias/user later, no code change).

## 7. Findings
1. GAP (fixed in plan) A1: only MDTWII's server checkout uses a bare repo; repointing others would break their GitHub use. Dedicated `~/fleet-repos/<project>`.
2. GAP (fixed) A5: 52 GB free; Rust lanes use several GB each. Disk guard + LOWDISK.
3. GAP (fixed) claim race: cmd-claim checks overlap outside the lock; cmd-add never checks overlap.
4. NOTE: server cfn-src is 7+ commits behind; remote workers do not depend on it (kit shipped per spawn), but server-side hooks are old. `git pull` there is a separate user action.
5. NOTE: server lanes cannot SendMessage; MDTWII's handoff rule must exempt them (brief template says so).
6. NOTE: same Claude account on both machines means server lanes draw on the same usage limit.

Alpha-ready: NO by the review rule (one UNTESTED assumption, A9, which no command can settle). No BLOCKER is open; the design tolerates A9 (claim requests wait for approval), and the live smoke in Verification 2 is where it gets observed.
