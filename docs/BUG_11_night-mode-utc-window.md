# BUG 11: night-mode morning report window starts in the future between UTC and local midnight

- Found: 2026-09-20 (during Jev batch-2 landing gate)
- Repro window: daily, 00:00 UTC until local midnight (about 7 hours in PDT)
- Evidence: `env -u TYPESAFE_API_KEY bash tests/test-night-mode.sh` -> `PASS=32 FAIL=1`, case `e2e: off renders report containing recorded title`. Report header renders `window: 2026-09-21 .. 2026-09-20` (since after today). Identical failure on the pre-batch script (`git show efd9002c5:...night-mode.sh`), so it is NOT caused by the Jev night-risk insertion.
- Root cause: the `off` report computes its window start from the UTC date while `today=$(date +%F)` is local (`night-mode.sh:131,157`). When UTC has rolled past midnight but local has not, `since > today`, the slug list from `build_slug_list` misses `night-<local-today>`, and decisions recorded under the local-today slug are silently dropped from the report.
- Impact: morning reports generated in that window show empty sections; auto-decisions look missing. Test-only today, but the same window affects real `night-mode.sh off` runs.
- Fix direction: compute `since` and `today` from the same clock (one `date +%F` call, or clamp `since` to <= `today`), plus a regression test that freezes the two dates apart (env override or injected date) and asserts the local-today slug renders. Not fixed yet: out of scope of the Jev batch-2 plan; tracked here for the next night-mode pass.
- Not in CI: `tests/test-night-mode.sh` is not on the ci.yml shell-test list, so pushes stay green either way.
