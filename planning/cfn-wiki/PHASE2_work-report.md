# Phase 2 report: sharded knowledge v2 + durable work queue

Date: 2026-09-14. Implements [the frozen contracts](CONTRACTS_work-knowledge-v2.md) exactly; additions and unenforced limits listed below.

## Shipped

- `lib/work.py` (new): `.wiki/work/jobs.sqlite` with the exact contract tables (jobs/attempts/reviews/promotions plus the required monotonic `counters` table and a `meta` run-level record), WAL + `BEGIN IMMEDIATE` for every transition, lease recovery, auto-unblock, stale cascade, work CLI (plan/next/evidence/checkpoint/submit/review/promote/status/export/import), budget inheritance on split, journal-first promotion with pre-write backups, edit-hook invocation, idempotent recovery and rollback on verification failure.
- `lib/knowledge.py` (extended, v1 behavior unchanged): v2 manifest + shard loading into the same normalized model (duplicate ids, escaping refs, missing shards and shard-id mismatches are hard errors naming the id; unreferenced shards are never loaded), `migrate_to_v2` (explicit, validated-then-atomic `os.replace`, v1 backup to `.wiki/backups/knowledge-v1-<epoch>.json`, idempotent no-op on rerun), `knowledge_state_digest`, `plan_candidate_writes` (v1 merge and v2 shard+manifest-last plans, paths pinned under `readme/wiki/`).
- `lib/wiki.sh`: thin `work`, `migrate`, `coverage` wrappers. `coverage` prints the three measures (inventory / explanation / review) with denominators, exclusions and blocked areas; text by default, `--json` for the envelope. UI polish stays Phase 4.
- `lib/extract-features.sh`: one guard so a v2 manifest (capabilities are ids, not inline objects) does not crash sync's knowledge-input hashing.
- Migration was NOT run on the real repo (explicit user-facing operation, Phase 3 decides). Real `readme/wiki/knowledge.json` is still version 1; no `jobs.sqlite` exists on the real tree.

## Test evidence

- `tests/test-wiki-work.py` (new, 47 tests): every acceptance item in contracts section 5, incl. two-process lease contention (concurrent `work next` never share a job), crash-mid-lease recovery keeping checkpoints, stale/late submissions exit 2, revision and knowledge-digest promotion rechecks, interrupted promotion recovery, export/import relocation to a fresh checkout, skip-by-name import conflicts, budget exhaustion blocking without a restart loop and resuming after unblock + raised allowance. Green in-repo and in an isolated rsync copy.
- `tests/test-wiki-knowledge.py` (extended to 28 tests): v2 loader rules, migration verbatim/idempotent/backup, and a fixture reproduction of the real `task-verification` capability + runtime entity asserting claims, flow, failures, limitations, states, transitions and source citations survive migration byte-for-byte in content fields.
- Isolated rsync copy (no .git/.wiki), logs under `/tmp/test-claude-flow-novice-*-[ts].txt`: knowledge 28/28 OK; discovery 60/60 OK; work 47/47 OK; `tests/test-wiki-env.sh` 54 passed, 0 failed, 1 SKIP (`cbm-fixture-index`: no CBM binary on PATH; optional-integration skip, not a pass).

## Promotion crash-recovery proof

`CFN_WIKI_PROMOTE_CRASH_AFTER=1` kills promote after the shard write, before the manifest. Asserted: journal row `pending`; on-disk model still valid (unreferenced shard ignored); rerun completes the journal idempotently, marks `committed`, manifest references the shard, loader returns the new capability; one promotions row, `committed`. Manifest-last write order plus post-commit `input_revision` refresh (a job's own promotion writes must not make it stale) make recovery consistent.

## Measured sizes (fixture)

Brief fresh lease 664 B; brief with checkpoint summary 872 B; checkpoint.json 148 B. Caps enforced: brief 8 KiB, checkpoint 8 KiB (oversize rejected), attempt evidence 64 KiB (evidence layer, attempt identity `job:<id>#<n>` passed by every work evidence call), run allowance default 256 KiB recorded in job `budget_json` plus meta.

## Additions beyond the CLI table (state machine required them)

- `work unblock <repo> --job <id> --reason`: operator resolution for `prerequisite:*` blocks (the contract names operator resolution but lists no command).
- `work checkpoint --blocked --reason --on`: worker-reported `in_progress -> blocked` with `blocked_on` normalized to `job:<id>` or `prerequisite:<text>`; auto-unblock fires when the named job reaches accepted.
- Checkpoints arriving after lease expiry or budget block are retained on the attempt row (exit 2 for the expired case), never silently dropped.

## Limits not enforced

1. No whole-session token ceiling: a host agent can read files directly; budgets cover only evidence delivered through `work evidence` (plan-documented runner boundary).
2. Import is strict about identity/revision (git head when present, else discovery revision): archives from a dirty tree will not import into a clean checkout of the same commit. No override flag.
3. Edit hooks run only when `~/.claude/hooks/cfn-invoke-{pre,post}-edit.sh` exists (best effort off this machine); promotion additionally keeps its own journal backups.
4. Promotion freshness uses the whole-tree revision for the accept-time comparison; a source-irrelevant tree change between acceptance and promotion also refuses promotion (conservative by design).
5. Run-allowance pre-check can overshoot by one delivery (single span capped at 8 KiB); the next delivery refuses and blocks.
6. Brief/question trimming under the 8 KiB cap truncates text with a `...` marker only after checkpoint-summary trimming; no semantic compression.
7. Explanation-coverage denominator is the author-job count from the map (a reviewed map, not every behavior); rejected and blocked jobs surface as blocked areas rather than a coverage percentage.

Nothing staged, committed or pushed; `readme/` outputs untouched; no wiki sync run. New files are `chmod +x` on disk; the index exec bit needs `git update-index --chmod=+x` at commit time (staging was out of scope here).
