# Implementation handoff: scalable cfn-wiki with bounded context

Date: 2026-09-13
Status: ready for another team to implement
Plan: [Architecture, contracts, phases and acceptance criteria](PLAN_context-bounded-repo-documentation.md)

## Assignment

Implement the linked plan in `/home/masha/projects/claude-flow-novice`. The user wants meaningful full-repository documentation without consuming an excessive amount of agent context. Preserve the capability-first reader experience already introduced, and make discovery, investigation, review and maintenance resumable and measurable.

This task produced planning documents only. The new discovery/query/work commands, sharded schema and large-portal mode are proposals, not existing features. Read the linked plan before assigning work. Do not interpret the previous exemplar as complete repository coverage.

## Read first, in this order

1. Repository `AGENTS.md` and current worktree status.
2. This handoff and its linked plan.
3. `.claude/skills/cfn-wiki/SKILL.md` and `AUTHORING.md`.
4. `lib/wiki.sh`, `lib/knowledge.py`, `lib/render_markdown.py`, then relevant extraction/sync/portal files for the assigned workstream.
5. The existing `task-verification` capability in `readme/wiki/knowledge.json` and corresponding tests.

Paths in steps 4 and 5 are relative to the skill directory and repository root respectively. Do not begin by reading the entire repository or dumping the whole CBM graph into context. Query bounded sections needed for your work.

## Existing work to preserve

The working tree already contains the previous wiki improvements and unrelated user changes. Some wiki files had pre-existing staged changes before this planning task, including ROLLOUT.md, extract-features.sh and test-wiki-extract.sh. Inspect staged and unstaged diffs separately. Do not reset, overwrite, or casually restage them.

The current shared skill is version 0.2.0. It has a common semantic resolver, content-aware freshness, preserved enrichment, one real runtime state model and an inline capability reader. `sync --enrich` intentionally invokes no model. Existing legacy directory pages and imported notes must survive migration with honest coverage labels.

The `.claude` tree is shared across projects through reverse symlinks. Changes affect subsequent skill runs elsewhere. Initial rollout is CFN only; do not regenerate gg-all-projects or fireside-family outputs as part of this assignment.

The original portal was served at `http://127.0.0.1:36761/`; this address is session-dependent. Resolve current server state before using it. Do not kill another session's server.

## Team boundaries

The following is a proposed team decomposition for the receiving team, not a request to start agents in this planning task. Each worker must know they share a checkout, preserve others' edits, and report contract changes before implementing them.

| Owner | Responsibility and proposed files | Dependencies |
|---|---|---|
| Integrator | CLI dispatcher, shared schemas, SKILL.md, AUTHORING.md, ROLLOUT.md, final integration and CFN pilot | Own contract decisions and serialize shared-file changes |
| Discovery/evidence | New `lib/discovery.py`, `lib/evidence.py`, query wrappers, scope rules, tests for discovery/query/budgets | Freeze revision and evidence contracts first |
| Queue/runner boundary | New `lib/work.py`, work wrapper, leases, checkpoints, run usage, review/promotion journal, work tests | Consume frozen evidence API and knowledge writer contract |
| Knowledge/maintenance | `lib/knowledge.py`, `lib/render_markdown.py`, migration, sharded schema, invalidation mappings and tests | Coordinate promotion writer with queue owner |
| Portal | `portal/build-portal.sh`, `portal/template.html`, optional static assets/server changes, browser tests | Begin after normalized model and coverage API stabilize |

If there are fewer workers, execute these as sequential workstreams. Start serial, prove correctness, then exercise concurrent leasing. Two authors is the initial runtime default, not a requirement to spawn a large implementation team. Assign extraction, fingerprint and sync integration edits to one owner at a time; do not have each worker independently rewrite those shared files.

## First concrete delivery

Deliver Phase 1 before bulk authoring: deterministic discovery including `.claude/skills`, bounded paginated queries, evidence reuse and usage accounting. Demonstrate on CFN and a synthetic large repo that output stays capped. Then add durable jobs and migration. Do not start hundreds of generation jobs before these controls work.

Important design decisions already made:

- Python standard library plus SQLite/JSON; CBM is optional behind an adapter.
- Tracked authored knowledge is separate from durable local work and rebuildable caches.
- Version 1 remains readable; version 2 migration is explicit.
- Source inspection is capped by bytes and lines. Token counts are estimates unless measured by the host.
- A fixed packet limit does not enforce a whole-session token ceiling. Report direct-read bypasses and runner limitations.
- Attempt limits are nested inside a total run allowance; splitting must not create unlimited spend.
- Fresh worker contexts receive checkpoints and evidence references, never full predecessor transcripts.
- Review and promotion are separate from generation, with source-revision rechecks.
- Coverage is several explicit measures, not a single misleading completeness percentage.

## Required verification

Use the phase acceptance criteria in the plan as the implementation checklist. Add focused tests for budgets, giant lines, stale cursors, hidden directories, source changes, version migration, concurrent leases, crash recovery, budget exhaustion, stale submissions, and incremental consumer invalidation.

Relevant existing suites:

- `python3 tests/test-wiki-knowledge.py`
- `bash tests/test-wiki-env.sh`
- `bash tests/test-wiki-extract.sh`
- `bash tests/test-wiki-generate.sh`
- `bash tests/test-wiki-sync.sh`
- `bash tests/test-wiki-views.sh`
- `bash tests/test-wiki-portal.sh`
- `node tests/test-wiki-portal-ui.cjs`

Some fixtures are already user-modified. Run mutating shell suites from an isolated copy. Capture test output under `/tmp` with `tee`, read failures fully, and distinguish optional-integration skips from passes. Use installed browser/runtime paths through the suites' existing configuration, not hardcoded machine-specific defaults in committed code.

For the pilot, show the documentation map, three accepted representative investigations, one cross-domain synthesis, a resumed checkpoint, a no-op refresh and targeted invalidation. Preserve the existing exemplar rather than unnecessarily re-authoring it. Record usage, duplicate evidence, retries and packet sizes. Do not claim a specific cost reduction without a measured comparison using the same tasks and quality criteria.

## Edit and delivery rules

Before every repository file edit, run:

```bash
$HOME/.claude/hooks/cfn-invoke-pre-edit.sh "$FILE" --agent-id codex
```

After the edit, run:

```bash
$HOME/.claude/hooks/cfn-invoke-post-edit.sh "$FILE" --agent-id codex
```

Follow the hooks' backup/rollback mechanism. Never use git checkout or git restore to undo work. Keep temporary files under `/tmp`. Do not use em dashes in new copy, code or comments. Do not source `.env`. Do not commit unless the receiving user explicitly authorizes it, and never push. Stage only explicit paths if staging is requested. New executable shell scripts must follow the repository's shebang and index executable-bit rules.

When reporting completion, list what shipped, measured limits, verification, partial parser coverage, remaining authoring work and any skipped integration. Update feature/state documentation when required by repo rules, preserving the distinction between implementation maturity and wiki review status.

## Suggested kickoff prompt

Implement `planning/cfn-wiki/PLAN_context-bounded-repo-documentation.md` using this handoff. Inspect and preserve the dirty worktree. Deliver the deterministic discovery and bounded evidence layer first, then resumable work, schema migration, the measured CFN pilot and portal scaling in dependency order. Enforce retrieval and total-run budgets, preserve reviewed content, and show coverage gaps. Do not commit, push, or regenerate sibling wikis. Report real test and usage evidence and any limits you could not enforce.
