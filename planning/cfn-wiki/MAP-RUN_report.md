# Map-completion run: all 32 documentation jobs

Date: 2026-09-14. Continuation of [the pilot](PILOT_context-bounded-repo-documentation.md) to the full documentation map, per user decision. Sandbox: /tmp/cfn-map (fresh snapshot of main at the time; 5863 tracked files).

## Result

32/32 jobs accepted and promoted: 19 capabilities across 8 domains, 5 cross-domain syntheses into one overview (9,733-char summary, 11 open reader questions). Committed as 49b13892d after sync, drift-gate green, doc-lint clean, 39 pages linted.

## How it ran

- 9 verify-pass jobs (content already promoted during the pilot) re-verified in-queue: every source hash re-checked against git blobs, 2 spot-check claims each, resubmitted byte-identical plus stamp. Standing independent reviews re-affirmed after machine byte-identity checks.
- 5 domain seeds promoted mechanically from the reviewed map (bootstrap rule: empty capability lists).
- 14 new capability author jobs in 2-concurrent waves, each with an independent reviewer verifying 5-15 claims against cited lines and directly verifying every headline finding. Reviewers accepted all first-submission candidates (no revision cycles this run); several named minor non-blocking findings recorded in review files.
- 5 syntheses composed strictly from accepted shards (reviewers verified append-only overview edits, byte-exact prefixes, and that every named gap is a genuine shard absence).

## Measured usage (whole run)

243 evidence deliveries, 579,636 bytes (~145k estimated tokens) across all 52 attempts; budgets enforced throughout (one author at 62.5 of 64 KiB; one at 47.8; several under 20). Coordinator context: briefs and bounded queries only, never worker transcripts.

## Genuine findings the wiki now documents

- MDAP's local gate treats a zero-test run as passRate 1.0 (orchestrator.ts "assume success" branch).
- Container team teardown does not exist (agent-manager.js is a 34-line stub); escalations handling is TODO log-only.
- Skill review (Postgres) and propagation (SQLite registration) are decoupled; neither copies files; the bridge is absent within scope.
- Fleet land does not (verifiably) consume VERIFY_RESULTS or all_green: the worker-done-to-landed bridge is unproven.
- Decision query searches only the raw messages mirror, never the curated decisions table.
- ttl-cleanup's Redis reconcile re-selects rows the DELETE already removed (no-op).
- The four decomposition stages are not wired to each other in their files; complexity scores are computed but never consumed.
- Monitoring dashboard silently falls back to hardcoded mock demo data when backends are down; cost-anomaly get_teams queries the wrong Prometheus endpoint.
- Portal DB access split is app-level only (substring write-verb denylist); migrate.sh is a placeholder.
- The map's portal container path did not exist (composition gap documented as unknown).

## Process observations for the record

- Promotions invalidate sibling awaiting-review submissions (whole-tree revision recheck): the workable cadence is submit -> review -> promote strictly per job. Re-cycles are mechanical (resubmit identical candidate, re-affirm review, promote).
- Submit is lease-lenient, promote is not; `work release` proved itself repeatedly on stray leases.
- Concurrent `work next` (2 workers) never double-leased.
