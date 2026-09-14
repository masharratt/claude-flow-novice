# Phase 3 pilot report: CFN context-bounded documentation

Date: 2026-09-14. Implements Phase 3 of [the plan](PLAN_context-bounded-repo-documentation.md) against the Phase 1/2 contracts. Pilot ran in an isolated snapshot (`/tmp/cfn-pilot`, clean git) because live peer sessions in the real repo move the tree revision continuously and would false-fire staleness mid-flight.

## What shipped

- Documentation map: 8 domains, 19 capabilities, 5 synthesis questions (map agent: 35 query calls of a 60 budget, ~173 KB accounted; `planning`+handoff discipline held).
- Knowledge model (all review-accepted, all promoted): 5 capabilities (`test-result-parsing`, `plan-gates`, `task-verification` verify-pass, `loop-orchestration`, `edit-safety-hooks`), 3 domain seeds (`delivery-loop`, `planning-pipeline`, `skill-infrastructure`), 1 cross-domain synthesis overview. 11 committed promotions, 2 integrity rollbacks (both correct), 24 jobs honestly queued (coverage, not backlog).
- Real repo updated (uncommitted, per handoff): knowledge v2 migration + all pilot shards copied back; loader verifies 5 capabilities + 3 domains.

## Measured usage (usage.jsonl, whole pilot)

151 evidence deliveries, 438,424 bytes (~110K estimated tokens across ALL 19 attempts), 87 unique packets, 9 cache hits. Per-author context: 35-48 KB evidence + sub-1KB briefs + sub-1KB checkpoints (caps enforced; one author hit 47.8 of 64 KiB). Reviewers: 1-12 bounded queries each. Compare: the map agent alone enumerating files naively consumed ~173 KB in 35 calls; unbounded repo reading for 5 cross-directory capabilities would be multiples of the entire pilot budget in one context.

## Acceptance evidence

- Fresh reviewer (wiki text only): 6/6 reader checks PASS, random citation spot-check VERIFIED (parse-test-summary.sh:121 + sha256 match).
- Failure paths documented in 4 of 5 capabilities (unknown-runner-output chain; bless REFUSED; GOAP-routed ABORT + undecided-reads-as-ABORT; guard block/rollback taxonomy). Unsupported boundaries live in unknowns (7 on loop-orchestration alone).
- No-op / targeted change: revision-pinned no-op rebuild covered by suite (`test_same_revision_rebuild_is_noop`); live demo showed one-file edit moves revision and fires the accepted-jobs cascade.
- Real findings the wiki now carries: orchestrate CLI exits 0 without calling execute() (no exit code reflects the PO decision; errored PO defaults to PROCEED); agent-spawner.ts is a placeholder; blessed-VERIFY-to-loop handoff unproven (named as open question, not glossed).

## Bugs found by the pilot, fixed test-first (suites 64 + 49 green)

1. Query layer: `files --path` silently ignored; no prefix search (added `--path-prefix`); irrelevant flags now error loudly; `--like` regression caught live and pinned.
2. CBM import died silently on non-UTF-8 node names in the REAL snapshot (synthetic fixtures clean); `text_factory` replace-decode fix.
3. Lease never restamped `input_revision`; jobs planned at an older revision could never submit (its own error message named the remedy).
4. Submit accepted candidates the promotion planner crashes on; submit now validates with the exact planner.
5. `.wiki/work/` churned dirty revisions (now gitignored in both trees).

## Contract amendments (see CONTRACTS_work-knowledge-v2.md)

Lease stamps revision; submit runs the planner; loader integrity is bidirectional so bootstrap is incremental (domain seeds list only existing capabilities); whole-tree stale cascade re-stales promoted jobs after every promotion (interim: post-promote refresh; real fix: per-evidence fingerprints); missing operator verbs `work release` / `work requeue` (currently operator SQL).

## Known limits (honest)

- Map scope path `.claude/edit-safety.sh` did not exist; reviewer caught it, author brief corrected. Map scope paths need a validation pass at `work plan` time (follow-up).
- `plan-gates` shard carries one dangling evidence-id typo (97b136b3 vs 97d136b3, reviewer-noted, non-blocking) — fix in the next refresh cycle.
- Strict same-revision no-op demonstrated by suite, not in the live demo (the live "no-op" was a legitimate rebuild of a stale index).
- Whole-tree revision coupling remains coarse until the per-evidence cascade lands.
- Coverage today: 5 of 19 mapped capabilities explained and reviewed; denominators visible via `wiki coverage`.

## Next

Phase 4 (paged portal, coverage UI) per the plan; `work release`/`work requeue` verbs + map-scope validation as pre-Phase-4 hardening; the 24 queued jobs are the ongoing authoring backlog, worked through the same review pipeline.
