# Context-bounded repository documentation

Date: 2026-09-13
Status: implementation plan, not implemented
Companion: [Team handoff](HANDOFF_context-bounded-repo-documentation.md)

## Outcome and scope

Extend cfn-wiki from a manually authored exemplar into resumable, source-grounded documentation of large repositories. Repository size may increase disk work and the number of jobs; it must not increase the default context supplied to an individual agent.

The user approved planning and a handoff. This document defines the proposed implementation for the next team. It does not claim that new commands, budgets, workers, or coverage reports exist today.

Full coverage means all in-scope areas are classified, important reader journeys have verified explanations, and unknowns are explicit. Neither a file inventory nor a page count establishes semantic completeness. No fixed budget can guarantee complete understanding of an arbitrarily large repository.

First release: deterministic discovery and queries, a documentation map, durable jobs, bounded evidence packets, sharded knowledge, independent review, incremental invalidation, and a CFN pilot. Deliver large-portal support after these contracts stabilize. Do not regenerate sibling repositories or bulk-author all CFN capabilities as part of the initial pilot.

## Current foundation

- `SKILL.md` and `AUTHORING.md` establish purpose, flow, failures, change guidance, source evidence and reader acceptance.
- `lib/extract-features.sh` aggregates CBM SQL results and directory inventory. Its directory feature IDs are not capability boundaries. Hidden directories are excluded from the default feature heuristic; CFN's `.claude/skills` therefore needs explicit discovery support.
- `lib/knowledge.py` reads version 1 `readme/wiki/knowledge.json`, verifies file hashes, and resolves authored and legacy content for both projections and catalog.
- `lib/render_markdown.py` renders Markdown. `lib/sync.sh` remains deterministic; `--enrich` prints instructions and invokes no model.
- `lib/cbm-index.sh` snapshots the source index. CBM availability and explanation review freshness are distinct.
- `portal/build-portal.sh` and `portal/template.html` currently inline the entire payload and source excerpts into one HTML file.
- CFN has one authored example, `task-verification`, in `readme/wiki/knowledge.json`. Preserve its claims and real runtime entity through migration.

## Architecture and data boundaries

Use Python standard-library SQLite and JSON for the first release. Reuse CBM through an adapter; do not require a new database service, vector database, model provider, or autonomous runner.

Proposed layout:

| Location | Purpose | Ownership |
|---|---|---|
| `readme/wiki/knowledge.json` | Version 2 manifest: overview plus explicit document references | Tracked authored source |
| `readme/wiki/domains/<id>.json` | Domain purpose, child references and shared contracts | Tracked authored source |
| `readme/wiki/capabilities/<id>.json` | Capability explanation, claims and evidence references | Tracked authored source |
| `readme/wiki/entities/<id>.json` | Actual runtime models with capability references | Tracked authored source |
| `readme/wiki/scope.json` | Include/exclude rules, reasons and discovery policy | Tracked reviewed policy |
| `.wiki/discovery.sqlite` | Files, symbols, relations, candidates, coverage mappings and revisions | Rebuildable cache |
| `.wiki/work/jobs.sqlite` | Jobs, leases, attempts, dependencies, review outcomes and usage records | Durable local work, not rebuildable cache |
| `.wiki/work/evidence/` | Content-addressed excerpts and provenance | Reusable local artifacts |
| `.wiki/work/attempts/<id>/` | Brief, checkpoint, candidate output and review record | Durable local work |
| `.wiki/portal/` | Generated distribution | Rebuildable output |

Do not clear `.wiki/work` during sync, index rebuild or migration. Provide explicit work export/import for moving a queue to another checkout; validate repository identity and revisions on import. A transferred checkpoint is reusable context, not proof of current facts. Source artifacts may be sensitive; do not include secret/config credentials in evidence or exports.

Version 1 remains readable without mutation. Version 2 loads only explicitly referenced files, rejects duplicate IDs and escaping paths, and resolves to the existing normalized model. Migration is explicit, preserves IDs and text, writes atomically, and is idempotent. Do not silently migrate during build or sync. Keep product maturity separate from documentation coverage and review state.

## Discovery and planning

1. Enumerate with NUL-safe Git paths using the existing tracked-file policy. Honor an explicit include-untracked option; report the selected policy. Non-Git repositories use a bounded filesystem walker. Detect additions, edits, deletions and renames; do not rely solely on a commit ID for dirty trees.
2. Classify files as source, tests, configuration, documentation, generated, vendored, archived, excluded or unknown. Record reasons and counts, including unsupported languages and parser failures. Include hidden implementation directories such as `.claude/skills`; exclude credentials, build caches and dependencies by policy, not by assuming all hidden paths are irrelevant. Preserve path boundaries around symlinks.
3. Discover commands, routes, jobs, manifests, public APIs, schemas and tests with deterministic adapters. Import available CBM symbols and edges, retaining provenance and parser coverage. Heuristic candidates remain candidates.
4. Produce compact domain candidates and unanswered reader questions. A bounded agent planning pass reconciles these into the documentation map using repository purpose and representative evidence.
5. Page planning at domain boundaries. A repository summary reports counts and top priorities, never the entire map. If even a domain is too large, split it before authoring.
6. Keep unmatched files and entrypoints visible. Cross-cutting capabilities may map to several domains; shared contracts have canonical IDs so pages link instead of duplicating explanations.

Prioritize public entrypoints and critical journeys, then high fan-in shared infrastructure, failure/recovery paths, and maintenance tasks. Git activity is one signal, never proof of importance. Candidate merges or splits preserve aliases and job lineage.

## Proposed CLI contract

Extend the existing dispatcher with one `work` command group and `discover`, `query`, `coverage`, and `migrate` commands. Exact implementation files may vary; retain these behaviors.

| Operation | Required behavior |
|---|---|
| `discover <repo>` | Update disk index and candidate inventory; print bounded counts and revision |
| `query <repo> <kind> ...` | Page files, symbols, callers, dependencies, tests or candidates with hard output caps |
| `work plan <repo>` | Validate/import an agent-authored map and seed idempotent jobs; never pretend to perform model reasoning |
| `work next <repo>` | Atomically lease one eligible job and create a bounded brief |
| `work evidence <repo> ...` | Retrieve a bounded source span or graph expansion; account for usage |
| `work checkpoint <repo> ...` | Persist decisions, evidence IDs, unknowns and exact next actions |
| `work submit <repo> ...` | Validate candidate output against the claimed source revision; queue review |
| `work review <repo> ...` | Record reviewer decision and evidence; only accepted output becomes eligible for promotion |
| `work promote <repo> ...` | Recheck freshness, apply accepted authored changes atomically under edit hooks |
| `work status/export/import <repo> ...` | Inspect bounded progress or transfer durable work |
| `coverage <repo>` | Report separate inventory, explanation and current-review coverage with exclusions |
| `migrate <repo> --to 2` | Explicit knowledge migration with validation and backups |

All list operations return stable ordering, `next_cursor`, total count when cheap, truncation reason, revision and accounted output size. Cursor reuse against another revision must fail clearly. No hidden unbounded fallback. Errors are bounded too. Large artifacts are saved on disk and returned as references. Existing sync/build/lint retain their semantics; `sync --enrich` points agents to this workflow and still invokes no model.

## Context and cost contract

Initial defaults below are tuning hypotheses. Expose configuration and record effective values per job. Enforce deterministic byte ceilings even when the host exposes no tokenizer or usage telemetry. Token estimates must be labeled estimates and must not be presented as exact billing or full-session accounting.

| Boundary | Initial default |
|---|---|
| Job brief | At most 8 KiB UTF-8, target about 2k tokens |
| One source retrieval | At most 8 KiB and 120 lines, whichever is reached first |
| One list/graph query | At most 40 results and 8 KiB, default graph depth 1 |
| Cumulative evidence returned in one attempt | 64 KiB, including repeated deliveries |
| Checkpoint | At most 8 KiB with structured references |
| Planning batch | At most 20 domain/capability summaries, still capped at 8 KiB |
| Attempt retries | At most 2 automatic retries, then explicit blocked reason or split |
| Initial worker concurrency | 2 authoring jobs; enable after serial correctness passes |

The attempt evidence budget covers delivered source, not system instructions, reasoning or other tools. Use measured host token usage when available; otherwise report bytes, estimated tokens, retrieval count and elapsed time. A host-neutral skill cannot prevent arbitrary direct file reads. Document this limitation, route normal source access through bounded commands, and require any bypass to be reported. Do not claim a hard session-token cap without an enforcing runner.

Count repeated retrievals toward delivered-context cost even if their disk blobs are deduplicated. When an agent already has an evidence item, return a reference by default; fresh sessions can request its bounded content again. Cache keys include repository identity, content hash, span/symbol identity, adapter version and relevant query settings. Cached evidence is not cached reasoning correctness.

At budget exhaustion, preserve partial work and stop supplying evidence for that attempt. The agent checkpoints and splits the question or requests an explicitly recorded budget increase. A split does not replenish an unlimited overall run budget: track total run allowance, attempts, duplicate reads and expansion depth. Pause the queue when the run allowance is exhausted. Keep unresolved questions explicit rather than inventing an answer.

The coordinator receives counts, IDs, summaries and unresolved cross-domain contracts. It never receives complete worker transcripts. Fresh workers receive only their brief, relevant checkpoint and requested evidence. Reusing an existing conversation without clearing accumulated source does not establish bounded context.

## Job and review state machines

Persist job ID, type (plan/author/review/synthesize/refresh), question, scope, dependencies, priority, input revision, budget, evidence IDs, candidate path, lease owner/expiry, attempt counter and blocked reason. Persist attempts separately from logical jobs.

Transitions:

- `queued -> leased -> in_progress -> awaiting_review -> accepted`.
- `in_progress -> checkpointed -> queued` after safe lease release.
- `in_progress -> blocked` with a specific missing prerequisite; return to queued only when that prerequisite changes or an operator resolves it.
- `awaiting_review -> queued` on revision requested, with reviewer findings and a bounded retry policy.
- `accepted -> stale -> queued` when its evidence or dependent contract changes.
- Expired leases recover to queued without discarding checkpoints. Reject late submissions from the old lease.

Promotion is a separate recorded transaction after acceptance; accepted work is not automatically published. Recheck evidence and knowledge revisions at promotion to avoid overwriting concurrent edits. Commit candidate files and manifest updates as a recoverable operation with a journal/backups; interrupted promotion must not leave a partially referenced knowledge model.

Different workers review and author a capability where the host supports them. Otherwise use an isolated fresh review context and report that limitation. Review checks both source support and reader usability: trigger to outcome, failures, relevant tests, change guidance, uncertainties, shared contracts and stale citations. Schema validity alone cannot accept a page. A synthesis job links accepted summaries and investigates conflicting interfaces through targeted retrieval.

## Incremental maintenance

Maintain evidence-to-claim, claim-to-capability and shared-contract-to-consumer edges. File changes conservatively mark affected claims as needing review; graph changes or new entrypoints also invalidate relevant discovery/planning work. Missing dependency analysis must show unknown impact instead of reporting no impact.

Start with whole-file hashes and conservative review. Add symbol-level hashes only after demonstrating reliable language support. Distinguish harmless line movement from semantic changes when possible, but never clear review flags by mechanically replacing hashes. A build, source index freshness, and accepted explanation freshness remain separate fields.

No-op rediscovery should enqueue no new authoring work. An unrelated code change should not re-author unaffected capabilities. A shared interface change must reach its documented consumers. Documentation outputs and caches must not cause self-invalidating discovery loops.

## Portal and coverage

Show three distinct measures with their denominators: classified in-scope files; explained selected capabilities; currently reviewed explained capabilities. Show excluded, unknown, stale and blocked areas separately. The capability denominator is a reviewed discovery map, not a claim that every possible behavior has been found. Unknown maturity must not be converted into a production claim.

Retain Start here and the existing four views. Add domain navigation, unanswered questions and a coverage summary. For large distributions, add an explicit paged build mode with a small shell, domain/page payloads and paginated or partitioned local search. Bound graph views as well as prose. Preserve deep links, notes, keyboard use, themes, source inspection and runtime-state fallbacks.

Keep existing self-contained export behavior for small wikis. A large portable export is a static directory with ordinary navigable HTML pages usable without a server; do not depend on `fetch(file://...)`. Search can be limited in file mode only if its fallback is clearly documented. Do not silently build an oversized single HTML file.

## Delivery order and acceptance gates

### Phase 1: Contracts, discovery and bounded evidence

Implement index schema, scope policy, CBM adapter/fallback, pagination and retrieval accounting. Establish serial benchmark baselines before model orchestration.

Accept when: paths with spaces/non-ASCII are safe; hidden implementation is included; secrets and out-of-root symlinks are excluded; parser gaps are visible; every output cap holds including long/minified lines; cursors are stable; source edits invalidate evidence; repeated queries reuse disk evidence without bypassing accounting.

### Phase 2: Sharded knowledge and durable jobs

Implement version 2 compatibility, explicit migration, queue, leases, checkpoints, run budgets and candidate/review/promotion contracts. Keep host agent invocation outside deterministic shell commands.

Accept when: version 1 output remains compatible; migration preserves CFN's example; duplicate/escaping refs fail; two workers cannot lease the same job; crashes recover; stale or late submissions fail; changing source between acceptance and promotion fails; interrupted promotions recover; work export/import survives checkout relocation; exhaustion produces resumable partial work without a restart loop.

### Phase 3: CFN pilot and measured synthesis

Produce the CFN discovery map, then choose three representative questions from evidence: one small local behavior, one cross-directory journey, and one shared infrastructure concern. Reuse the existing task-verification explanation where relevant. Document at least one failure path and one unsupported/uncertain boundary. Use accepted summaries for a repository overview and reconcile cross-domain contracts.

Accept when a fresh reviewer can answer the authoring reader checks using the wiki and inspect evidence when needed. Record actual or explicitly estimated usage per accepted capability, retry cost, repeated evidence, peak packet size and checkpoint recovery. Simulate a no-op and a targeted source change in an isolated fixture. Select default budgets from results, not from an unmeasured savings promise.

### Phase 4: Large portal and release documentation

Implement paged mode, coverage UI, bounded graph/search, and update SKILL.md, AUTHORING.md and ROLLOUT.md with runnable operations and honest limits.

Accept when browser checks cover served and file navigation, deep-link reload, keyboard use, mobile layout, evidence, notes and stale coverage. Large fixtures must not be embedded wholesale in the initial HTML or loaded eagerly on the start screen.

### Scale and regression suite

Use deterministic synthetic repositories at approximately 1k, 10k and 100k files. Include a monorepo, giant file, sparse/partial graph, renamed/deleted source, dirty worktree, generated/vendor trees and deep dependencies. Publish wall time, peak process memory, index size, bytes returned per operation and portal initial payload. Initial packet ceilings must hold at every scale; disk/index size may grow with repository size. Set infrastructure performance thresholds from measured CI hardware and document them before release.

Run relevant existing wiki tests plus new discovery, budget, queue, migration, invalidation and browser tests. Existing shell suites can modify fixture Markdown: run them in an isolated copy if fixture files already have user changes. Preserve current source-evidence, appendix isolation, enrichment preservation, drift, and offline behavior regressions. Optional CBM or database cases must report skips explicitly.

## Non-goals and completion

No provider-specific model runtime, automatic commit/push, new hosted dependency, vector retrieval requirement, unlimited swarm, fabricated maturity, or claim that all languages and dynamic edges are understood. No automatic promotion of annotation text into facts.

Completion requires passing gates, a measured CFN pilot, a recoverable work queue, a documented context-accounting limitation, and a readable coverage map. Broader CFN authoring is subsequent queued work. Keep performance/cost evidence with the implementation handoff and report outstanding gaps rather than declaring the entire repository understood.
