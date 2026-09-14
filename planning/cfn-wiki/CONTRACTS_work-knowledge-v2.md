# Frozen contracts: Phase 2 sharded knowledge and durable jobs

Date: 2026-09-13
Status: frozen for implementation (Integrator decision)
Scope: Phase 2 of [the plan](PLAN_context-bounded-repo-documentation.md). Consumes the Phase 1 evidence API and query envelope from [the Phase 1 contracts](CONTRACTS_discovery-evidence.md). Changes here require Integrator sign-off.

## 1. Knowledge version 2 (tracked, sharded)

`readme/wiki/knowledge.json` becomes a manifest; content moves to shards.

```json
{"version": 2,
 "overview": {"title": "...", "summary": "...", "coverage": "...", "questions": ["..."]},
 "domains": ["<id>"], "capabilities": ["<id>"], "entities": ["<id>"]}
```

| Shard | Required fields |
|---|---|
| `readme/wiki/domains/<id>.json` | `id, name, purpose, capabilities[], entities[], shared_contracts[{id,name,canonical_ref}], unknowns[]` |
| `readme/wiki/capabilities/<id>.json` | `id, fid, name, status, status_reason, description, purpose, reviewed_at, dependencies, sources[{path,line,claim,sha256}], evidence[evidence_id], domains[], unknowns[]` |
| `readme/wiki/entities/<id>.json` | `id, name, source, states[], transitions[], capability_refs[]` |

Loader rules (extend `lib/knowledge.py`, keep the existing normalized model as the output):

- `version: 1` files load through the current v1 path, unchanged, no mutation.
- `version: 2` loads only explicitly referenced shards. A reference must match `[A-Za-z0-9._-]+` (no separators: path escapes are hard errors). Duplicate id anywhere, missing referenced shard, or an id listed in the manifest but absent on disk: hard error naming the offending id.
- Legacy directory pages and imported notes resolve exactly as today; migration adds honest coverage labels, never rewrites their text.
- Product maturity (`status`) stays separate from documentation coverage and review state; no field may conflate them.

Migration (`wiki migrate <repo> --to 2`):

- Explicit only; never during build/sync/lint. Writes shards plus the new manifest atomically (temp files, `os.replace` after all shards validate), backs the v1 file up to `.wiki/backups/knowledge-v1-<epoch>.json`, preserves all ids and text verbatim, and is idempotent (a second run is a no-op that says so). CFN's `task-verification` capability and its runtime entity must survive byte-for-byte in content fields.

## 2. Durable jobs: `.wiki/work/jobs.sqlite`

Never cleared by sync, index rebuild or migration.

| Table | Columns |
|---|---|
| `jobs` | `id TEXT PRIMARY KEY, type TEXT, question TEXT, scope TEXT, priority INTEGER, dependencies TEXT (json array of ids), input_revision TEXT, budget_json TEXT, evidence_ids TEXT (json), candidate_path TEXT, status TEXT, lease_owner TEXT, lease_expires_epoch INTEGER, attempt_count INTEGER DEFAULT 0, blocked_reason TEXT, blocked_on TEXT, created_epoch INTEGER, updated_epoch INTEGER` |
| `attempts` | `id INTEGER PRIMARY KEY, job_id TEXT, lease_owner TEXT, started_epoch INTEGER, ended_epoch INTEGER, outcome TEXT, evidence_ids TEXT (json), bytes_delivered INTEGER, candidate_path TEXT, checkpoint_path TEXT` |
| `reviews` | `id INTEGER PRIMARY KEY, job_id TEXT, attempt_id INTEGER, decision TEXT, findings TEXT, evidence_ids TEXT (json), reviewer_epoch INTEGER` |
| `promotions` | `id INTEGER PRIMARY KEY, job_id TEXT, attempt_id INTEGER, state TEXT (pending, committed, rolled_back), plan_json TEXT, backup_paths TEXT (json), epoch INTEGER` |

`type` in `plan | author | review | synthesize | refresh`. Job ids: `<type>-<slug>-<n>` with a monotonic counter table.

State machine (enforced by transitions in one `BEGIN IMMEDIATE` transaction each):

- `queued -> leased -> in_progress -> awaiting_review -> accepted`
- `in_progress -> checkpointed -> queued` (safe release; checkpoints retained)
- `in_progress -> blocked` with `blocked_reason` + `blocked_on` (job id or `prerequisite:<text>`); returns to queued only when the named prerequisite's status changes or an operator resolves it
- `awaiting_review -> queued` on `revision_requested` (review findings attached, bounded retry: at most 2 automatic requeues, then blocked)
- `accepted -> stale -> queued` when evidence revision or a dependent shared contract changes
- Expired lease (checked on `work next`/`work status`): recovers to `queued`, checkpoints kept, attempt counter kept. Late submissions from an old lease are rejected with exit 2.
- Review decisions: `accepted | revision_requested | rejected`. `rejected` is terminal and must surface in `coverage` as a blocked area.

Concurrency: two concurrent `work next` invocations must never lease the same job (SQLite `BEGIN IMMEDIATE` + row update in the same transaction; test with two processes).

## 3. Work CLI

Extends the dispatcher; same JSON envelope as Phase 1 queries for list-shaped output.

| Command | Contract |
|---|---|
| `work plan <repo> --map <file>` | Validates an agent-authored documentation map (domains, capabilities, questions), seeds idempotent jobs; rerun updates priorities, never duplicates |
| `work next <repo>` | Atomically leases one eligible job (dependencies accepted, not blocked) and prints `{job, brief}` where the brief is capped at 8 KiB and built from job fields plus a bounded checkpoint summary |
| `work evidence <repo> ...` | Delegates to the Phase 1 evidence layer; every delivery is accounted to the lease |
| `work checkpoint <repo> --job <id> --file <path>` | Persists `{decisions[], evidence_refs[], unknowns[], next_actions[]}` as JSON capped at 8 KiB, then releases the lease safely |
| `work submit <repo> --job <id> --candidate <path>` | Rejects (exit 2, stale) when the job's `input_revision` no longer equals the current revision; otherwise records the attempt and moves to `awaiting_review` |
| `work review <repo> --job <id> --decision <d> --findings <file>` | Records the decision; schema validity alone can never yield `accepted` |
| `work promote <repo> --job <id>` | Rechecks freshness (revision + knowledge manifest unchanged since acceptance), applies candidate writes into `readme/wiki/**` under the edit hooks, journal-first with backups; an interrupted promotion must recover on next run, never leave a partially referenced model |
| `work status <repo>` | Bounded progress envelope: counts by status/type, oldest queued, blocked reasons; never dumps jobs |
| `work export <repo> --out <file>` / `work import <repo> --file <file>` | Single JSON archive of jobs, attempts, reviews and evidence packets; import validates repository identity and revisions, skips conflicting newer rows, and reports skips by name |

## 4. Budgets and runner boundary

- Defaults from the plan: brief 8 KiB, checkpoint 8 KiB, attempt evidence 64 KiB cumulative, 2 automatic retries, run allowance tracked as `budget_json` on the job plus a run-level record in `meta`; splitting a job creates a child job that inherits the parent's remaining allowance, never a fresh pool.
- At exhaustion: partial work preserved (checkpoint + attempt row with `outcome='budget_exhausted'`), queue pauses that job with `blocked_reason='run allowance exhausted'`.
- Host agent invocation stays OUTSIDE these shell commands: `work next/submit` are deterministic; the plan's "agent" is whoever consumes the brief. No model calls, no `claude -p`.

## 5. Phase 2 acceptance (from the plan, restated as tests)

Amendments accepted during the Phase 3 pilot (2026-09-14):

- `work next` stamps `input_revision` at lease time (a job planned at an older revision becomes submittable by re-leasing; the stale error names that remedy).
- `work submit` validates the candidate with the exact `plan_candidate_writes` planner promotion uses (exit 2, job stays leased). Candidates are WRAPPER documents: `{"capabilities": [shard...], "entities": [...], "domains": [domain shard...]}`. A bare capability shard whose top-level `domains` holds id strings is the failure shape this catches.
- Promotion dependency order is enforced by the loader in BOTH directions: a capability referencing a domain id cannot promote until that domain shard exists, AND a domain listing a capability id cannot promote until that capability shard exists. Bootstrap is therefore incremental: the first domain of an area lists only already-existing capabilities (with a deferral note in unknowns), and each capability's landing is followed by a domain-shard update that adds it to the list. `work plan` (or the coordinator) sequences: domain (seed) -> capabilities -> domain update -> synthesis.
- An accepted job whose promotion was refused and rolled back stays `accepted` with an unpromotable candidate and no lease path back; the operator needs a requeue action (planned: `work release` for stray leases and `work requeue` for accepted-but-unpromotable jobs; both currently operator SQL).
- The stale cascade compares each accepted job's `input_revision` against the WHOLE-TREE revision, so every promotion (a tracked knowledge write) re-stales ALL previously promoted jobs and requeues them into the work loop. Interim mitigation: after each promotion, refresh `input_revision` on every job with a committed promotion to the new current revision. Real fix: the cascade must compare the job's own evidence fingerprints (candidate source sha256s / feature fingerprints), not the whole tree; tracked under the plan's incremental-maintenance section.

Version 1 output remains compatible; migration preserves CFN's exemplar (task-verification claims and entity byte-identical in content); duplicate or escaping references fail; two workers cannot lease the same job; crash mid-lease recovers to queued without losing checkpoints; stale or late submissions fail; changing source between acceptance and promotion fails promotion; interrupted promotion recovers to a consistent model; export/import survives relocation to a fresh checkout; budget exhaustion yields resumable partial work without a restart loop.
