# REVIEW: Fleet dashboard redesign

Plan: `~/.claude/plans/compiled-baking-journal.md` (approved 2026-09-12).

## Assumptions verified

| # | Assumption | Verify command (executed) | Evidence | Verdict |
|---|---|---|---|---|
| 1 | Dispatcher sources common.sh + only the invoked cmd file | `grep -n "source" .claude/skills/cfn-fleet/cli/fleet` | :72-83 `source lib/common.sh` then `source "$CMD_FILE"` only | VERIFIED (spawn cannot see cmd-dashboard helpers -> relocation step 1.0) |
| 2 | heartbeat is a thin roster_set wrapper, --files extension trivial | `cat lib/cmd-heartbeat.sh` | 24 lines, `roster_set "$ws" heartbeat` pattern | VERIFIED |
| 3 | http.server serves whole run dir (roster.tsv + files/ reachable same-origin) | cmd-dashboard.sh:608 | `http.server --directory "$rd" --bind 127.0.0.1` | VERIFIED |
| 4 | `dashboard-events-tail` filename collision-free | grep skills/ + tests/ | zero hits | VERIFIED |
| 5 | Templates already carry heartbeat instructions to extend | grep templates/ | COORDINATION.md:36, BRIEF_WS.md:5,21 | VERIFIED |
| 6 | No prior decision log fork re-opened | decision-log query 'fleet dashboard' | hits target cfn-workbench dash (D-dash-entry/cap/tmp-scope), different entity | VERIFIED |
| 7 | localStorage available in Simple Browser | not statically verifiable | - | ESCALATED -> design guard: try/catch, defaults dark |

## Dependency graph (evidence: Explore pass + reads)

- dashboard.html: sole writer cmd-dashboard.sh (:108,:115,:228), sole reader tests/test-cfn-fleet-dashboard.sh. No other consumers.
- `.watch.state` (fleet watch) and workbench `run-plan-<slug>.json` untouched by this plan.
- Port 4880: only `_fleet_dash_port` default + test strings + project-ports.md.
- spawn stdout `spawned WS01 engine=... banner=` pinned verbatim by test-cfn-fleet-spawn-watch.sh:580,637.

## Blast radius

- Covered: page contract (P1/P2), spawn URL (P3), docs (P4).
- Safe: workbench UI, watch loop, existing run dirs (old templates; missing files/<ws>.txt and goal.txt render silently absent).
- Gaps closed during review: helper relocation (1.0), ws-id traversal guard (3.2), JS/bash vocab pin + escape + fetch-error asserts (2.1).

## Edge cases / state coverage (user-bound)

- Tested: empty roster page; fetch-error (amber dot, keep last data, retry); STALE/DEAD (existing).
- Declined: loading shimmer (static-first page IS loading state); no-access (localhost-only, no auth surface).
- Hostile input: ws id charset guard; all roster/file/goal strings escaped (`esc()` server + client).

## Alpha readiness

test PASS (failing-test column per step, state list mapped) | security PASS (no new tables/endpoints, traversal guarded, localhost bind) | backend PASS (fetch retry, warn-only render loop kept) | frontend PASS (Playwright/manual Simple Browser check in verify) | architect PASS (rollback = revert commit, additive files only) | supabase N/A | contract PASS (vocab pinned both renderers) | consistency PASS (port resolution single source in common.sh; docs in P4).

**Alpha-ready: YES** (0 blockers after merges; 1 escalated assumption resolved by design guard).

## Open items

- DEFERRED: global theme localStorage key (revisit if per-fleet themes wanted).
- DEFERRED: default sort = status order (revisit if hb-age becomes daily view).
- DEFERRED: per-card files fetch (revisit past ~20 cards with a bundled summary file).
