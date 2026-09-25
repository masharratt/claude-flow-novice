# Plan Review: Fleet Dashboard Code Glossary and Readability

Reviewed: 2026-09-14. Plan: `~/.claude/plans/synchronous-baking-spring.md`. Reviewer session: plan mode, all evidence commands executed live.

## Assumptions verified table

| # | Assumption | Verify command (executed) | Evidence | Verdict |
|---|---|---|---|---|
| 1 | glossary.tsv absent today; nothing references it | `grep -rn "glossary" .claude/skills/cfn-fleet/lib/` | zero hits in fleet lib | VERIFIED |
| 2 | Baseline UI test green before changes | `PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright PLAYWRIGHT_MODULE=/home/masha/projects/NYSDRA/node_modules/playwright node tests/test-cfn-fleet-dashboard-ui.cjs` | `PASS: attention, landed/done semantics, ... no-JS fallback.` (first two attempts failed on browser path: default `PLAYWRIGHT_BROWSERS_PATH` points at incomplete `/mnt/d/wsl-cache/playwright-browsers`; NYSDRA 1.60.0 matches cached `chromium-1223`) | VERIFIED |
| 3 | A dashboard render loop is running and must be restarted | `pgrep -af "fleet" \| grep -vi grep` | only python http.server pid 3008628 for port 4880; NO bash render loop alive | VERIFIED (assumption WRONG in a helpful way: no stale loop to kill; a fresh `fleet dashboard` start re-renders immediately; serve_start no-ops on the live pidfile) |
| 4 | SKILL.md sibling uncommitted edits do not collide with plan's sections | `git diff -- .claude/skills/cfn-fleet/SKILL.md` | +21 lines, one lessons section inserted at ~line 418; plan touches file table (~51) and dashboard section (~208) | VERIFIED |
| 5 | readme docs hand-editable | `ls .wiki/config.json` (absent) + `bash .claude/skills/cfn-wiki/lib/wiki.sh sync --check .` | config.json absent BUT sync-check passes and `.github/workflows/wiki-check.yml` runs it in CI; `readme/wiki/knowledge.json` is the source (capabilities: 19 entries) | FAILED as written -> plan updated: wiki path unconditional |
| 6 | UI .cjs test is out of CI scope | `grep -n "jest\|node" .github/workflows/ci.yml` | unit job = jest `tests/unit` only; no .cjs execution in CI | VERIFIED |
| 7 | Only one fleet dashboard bound (port 4880 owner) | `ss -tlnp \| grep 4880` | single python3, cwd = fleet-recoil-feasibility run dir | VERIFIED |
| 8 | Decision log has no RESOLVED fork on this surface | `decision-log/query.sh 'cfn-fleet dashboard glossary roster' 5` + `decisions.sh search 'fleet dashboard'` | hits are night-2026-08-28 D-dash-* (a different project-wide monitoring dashboard), none about the fleet page dashboard | VERIFIED (no conflict) |

## Dependency Graph: cfn-fleet dashboard (cmd-dashboard.sh)

### Needs (inbound)
- `roster.tsv`, `goal.txt`, `files/<ws>.txt`, `dashboard-events.jsonl`, `fleet.env` (read-only inputs; grep of `_fleet_dash_render` + fingerprint fn, all present in file header contract)
- sourced by the `cli/fleet` router (evidence: `grep -rln "cmd-dashboard.sh" .claude/skills/cfn-fleet/` -> cli router + SKILL.md + cmd-spawn.sh comment)
- glossary.tsv: NEW optional input, zero existing consumers (`grep -rn glossary` zero hits)

### Needed By (outbound)
- dashboard.html consumed only by local browsers on 127.0.0.1:4880 (no code parses it; port documented in `~/.claude/references/project-ports.md`, entry already correct)
- `fleet watch` shares the run dir but owns `.watch.state` exclusively (file header lines 15-21); untouched
- other fleet runs (fleet-recoil-a2fb, gg runs): no glossary.tsv present -> identical rendering (backwards compat)
- CI: wiki-check (must stay green; handled), credential-scan (no secrets added), jest unit (does not run .cjs)

## Blast Radius

### Covered by plan
- bash render + JS + CSS in cmd-dashboard.sh (Phase 2)
- SKILL.md/RUNBOOK/knowledge.json docs (Phase 3)
- live run glossary data + loop start + browser verify (Phase 4)

### Safe (no action needed)
- roster writers, `fleet land/claim/spawn` (glossary is not a roster column)
- every other fleet run dir (optional file absent)
- `fleet watch` (separate state owner)

### GAPS (found by review, folded back into the plan)
- English-word code collision: a glossary code like `done` would termify every prose "done". Fix in plan: digit-required guard + regression row (`done` code skipped, prose `done` unwrapped).
- `\b` boundary wrong for codes ending in non-word chars. Fix in plan: lookarounds `(?<![A-Za-z0-9])CODE(?![A-Za-z0-9])`.
- JS glossary fetch after mid-run file deletion: 404 would clear the legend. Fix in plan: keep-last degrade (existing pattern).
- Claim path strings would mangle if termified. Fix in plan: termify task + notes ONLY (never claims, ws ids, names).

## Edge Cases

- Missing/empty/comment-only/header-only glossary.tsv: no panel, no wrapping (bash `[ -f ]` guard + JS empty-rows guard). Tested via baseline absence.
- Hostile meaning text: escaped through `_fleet_html_escape`/`esc()`; test injects `<img onerror>` and asserts no injection.
- Hostile/invalid code row: charset+digit guard skips with WARN; test injects `<script>` code row.
- Torn read (coordinator writes while render reads): parse guards skip malformed lines; worst case one poll shows the previous legend.
- Live glossary edit mid-run: fingerprint (bash legend) + poll fetch (JS terms) both pick it up; test asserts no-reload update.
- No-JS fallback: legend visible (bash-rendered), inline terms unwrapped, notes clamped without expand control. Accepted degradation, documented.
- State coverage (selected for this surface): absent file, empty file, hostile content, mid-run update, fetch failure. Declined: loading/error-banner states (local same-origin static file; the existing connection-warning banner already covers fetch failure globally).

## Alpha Readiness Check

| Area | Status | Notes |
|------|--------|-------|
| test | PASS | Phase 1 writes failing assertions first; baseline verified green pre-change with recorded env pair; regression rows for word-collision + XSS |
| security | PASS | Loopback-only page; every glossary cell escaped (tested); no secrets; no new endpoints |
| backend | N/A | No backend/API/DB surface |
| frontend | PASS | Playwright assertions in test + live browser verification step (Phase 4), dark + light screenshots |
| architect | PASS | Rollback: revert commit + rm glossary.tsv + restart loop; feature is per-run flag-off by file absence |
| supabase | N/A | No database |
| contract | N/A | Roster format and status vocab unchanged (titles are additive attributes) |
| consistency | PASS | STATUS_HELP duplicated bash<->JS by design (self-contained page, same as VOCAB) with pinned sync comment; docs via wiki source of truth; no new dependency (build-ladder satisfied: stdlib/CSS only) |

**Alpha-ready: YES** (0 blockers after the 4 gaps above were folded back into the plan)

## Open-Item Register

BLOCKING: none.

DEFERRED (defaults recorded):
- Legend placement: Activity aside above operator note. Default stays; revisit trigger: aside overflow complaint on narrow screens.
- Notes clamp: 4 lines, click/Enter expands. Trigger: reader asks for more context inline.
- Digit-required code rule: blocks alpha-only codes. Trigger: a run genuinely needs letter-only codes; then drop the rule and accept prose-collision risk consciously.
- Meaning cap 160 chars. Trigger: glossary authors need longer definitions; then widen + add title tooltip on the legend row itself.

## Findings

1. NOTE [Phase 1: assumption 3] No render loop running; plan's kill-stale-loop step replaced with plain start. Evidence: pgrep output.
2. GAP [Phase 4: edge case] English-word code collision -> digit guard added to plan + test row. Fixed in plan.
3. GAP [Phase 2] `\b` boundary bug for punctuation-ending codes -> lookarounds. Fixed in plan.
4. GAP [Phase 2] JS fetch-failure must keep last legend. Fixed in plan.
5. GAP [Phase 3] feature-status.md is wiki-owned (CI wiki-check) -> unconditional knowledge.json + `wiki sync` path. Fixed in plan.
6. NOTE [Phase 0] STATUS_HELP bash/JS duplication is the established self-contained-page pattern (VOCAB does the same); sync comment required, no refactor.
7. NOTE [Phase 1: assumption 2] Verify command needs the env pair `PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright PLAYWRIGHT_MODULE=/home/masha/projects/NYSDRA/node_modules/playwright`; recorded in Success Criteria.

Finding count: BLOCKER 0 / GAP 4 (all resolved into the plan before exit) / NOTE 3.
UNTESTED assumptions needing user input: none.
