# REVIEW_cfn-wiki

Plan reviewed: `/home/masha/.claude/plans/fuzzy-whistling-eich.md` (cfn-wiki — Self-Updating Codebase Wiki + Visual Portal). Review date: 2026-09-12.

## 1. Assumptions verified

| # | Assumption | Verify command (executed) | Evidence | Verdict |
|---|---|---|---|---|
| 1 | Port 4885 is unclaimed and undocumented | `ss -tln \| grep 4885`; `grep 4885 ~/.claude/references/project-ports.md` | "not listening"; "not in ports doc" | VERIFIED |
| 2 | doc-lint hook does not fire on generator Bash writes | Read `~/.claude/settings.json:42-49` (explorer) | PostToolUse matcher `Edit\|Write` only; hook script exits 0, non-blocking | VERIFIED |
| 3 | `cfn-doc-lint/execute.sh <dir>` lints `<dir>/readme/*` | `sed -n 1,33p execute.sh` | usage lines 5-7 confirm `<dir>` form | VERIFIED |
| 4 | sqlite3 CLI available for snapshot reads | `command -v sqlite3` | `/usr/bin/sqlite3` | VERIFIED |
| 5 | `.wiki` namespace collision-free | `ls -d .wiki`; `grep wiki .gitignore` | no dir, no ignore refs | VERIFIED |
| 6 | `.claude/hooks.json` is consumed by the Claude Code harness | `grep -rln hooks.json .claude/ ~/.claude/settings.json ~/.claude/hooks/` | **zero consumers**; its SessionStart entry references `session-start-context.sh` which is MISSING | **FAILED** — hooks.json is inert (dead-file class, cf. settings.local.json 2026-09-03) |
| 7 | feature-status.md consumers are schema-shaped readers (regenerated file stays consumable) | `grep -rln feature-status .claude/skills/` | cfn-alpha-launch-v2/execute.sh, commit, cfn-fleet, plan-review, doc-lint ×3 | VERIFIED |
| 8 | Active post-commit hook is `.husky/post-commit`, not `.git/hooks/` | `git config core.hooksPath` | `.husky`; existing chain calls codesearch indexer | VERIFIED |
| 9 | First wiki sync of the real 634-line feature-status passes lint | deferred to Phase 7 `real-repo-lint` test | test named in plan | VERIFIED-BY-TEST (executable check) |
| 10 | mmdc available for SVG pre-render | `command -v mmdc` | `~/.nvm/.../bin/mmdc`; table fallback regardless | VERIFIED |

## 2. Dependency Graph

### Entity: `readme/feature-status.md` (+ state-machines.md)

**Inbound (what defines/consumes its shape):** CLAUDE.md Commit-Time Documentation mandate (`~/.claude/CLAUDE.md:272-289`); SCHEMA.md contract (`:3-5`, `:26-34`, `:44-60`); doc-lint hook (basename-matched PostToolUse).

**Outbound (evidence = grep hit list):** cfn-alpha-launch-v2/execute.sh (reads rows programmatically), commit/SKILL.md, cfn-fleet/SKILL.md, cfn-plan-review/SKILL.md, cfn-doc-lint/execute.sh (+ `--check-all` walker over all repos). All read the schema, not prose — wiki-generated output in schema shape keeps every consumer working.

### Entity: `.wiki/store.json`

Produced by `extract-features.sh` (plan Phase 2). Consumed by: 5 view modules (Phase 5), gen-projections/gen-pages (Phase 3), portal payload (Phase 6). No external consumer. Gitignored.

### Entity: CBM sqlite snapshot (`.wiki/cache/cbm.db`)

Produced by `cbm-index.sh` from `$CBM_CACHE_DIR/<project>.db` (copy — journal mode `delete`). Consumed by portal/views read-only. Daemon + MCP unaffected (they read the original).

### Entity: port 4885

Portal only. Verified free (row 1). Documented into project-ports.md (Phase 7 step 5).

### Entity: `.husky/post-commit`

Inbound: codesearch indexer call. Outbound: + one guarded wiki-sync line (append-only, flock, never blocks commit). Chain order preserved.

### Signal-flow trace (external inputs, per plan-review protocol)

- CBM CLI JSON → **parse**: `extract-features.sh` (Phase 2.2) → **thread**: store.json → views → `__WIKI_PAYLOAD__` → **observable**: portal render + generated md. Covered.
- git log text → **parse**: `view-change.sh` (Phase 5.4) → **thread**: store/view payload → **observable**: change-story view + md timeline. Covered.
- information_schema/pg_policies rows → **parse**: `view-data.sh` (Phase 5.5) → **thread**: payload → **observable**: ERD view (+ md per config flag). Covered.

No declared external input lacks a named parse/thread step — no `integration_lane_gap`.

## 3. Blast Radius

**Covered by plan:** doc-lint schema stability (generated output lint-gated); all feature-status readers (same schema); port documentation; husky chain preservation; generated files git-tracked with fingerprint + drift gate.

**Safe (no action):** CodeSearch index (not joined in v1); sibling repos (untouched until rollout-by-config); CBM daemon/MCP (snapshot isolation).

**GAPS found (all fixed in plan revision):**
1. `.claude/hooks.json` inert → SessionStart staleness notice must register in `.claude/settings.json` (adding its first hooks key).
2. CI runner has no CBM binary → `wiki-check.yml` needs an install step (`wiki doctor --install`) before check.
3. First sync would replace 634 lines of hand-curated feature-status content → needs explicit carry-over: `wiki_import_existing()` converts current hand-written rows into `wiki:enrich` blocks before first regen.
4. Global CLAUDE.md is shared by ALL projects (reverse symlinks) → amendment wording must scope wiki ownership to repos where wiki is installed, leaving hand-maintenance as fallback elsewhere.

## 4. Edge Cases

- **First-run carry-over:** gap 3 above; Phase 3 gains `import-existing.sh`, Phase 7 proves on this repo.
- **Concurrent re-index vs portal read:** snapshot-copy only (never read live db). In plan.
- **Malformed annotations.json:** server refuses startup without replacing (nitpicky pattern). In plan.
- **State coverage (user-decided, binding):** selected = **empty** (fresh repo, zero features), **degraded** (no CBM / no DB → git-only + visible notice; none-section for data), **stale** (fingerprint behind HEAD → portal banner + CI fail). **Declined:** partial-index (surfaced as drift by the stale gate) — recorded as consciously cut, not missed.
- **Rollback:** generated md = `git revert`; state = `rm -rf .wiki`; skill = remove dir; CBM = delete cache dir. Documented in ROLLOUT.md.
- **Large-repo index time:** proven on this repo in Phase 7 (real-repo-lint + sync); fixture tests stay small.

## 5. Alpha Readiness

| Area | Status | Notes |
|------|--------|-------|
| test | PASS | Every step names its failing test; 7 suites; drift/carry-over/enrichment-preserve covered |
| security | PASS | No new DB tables; portal binds 127.0.0.1 with localhost-Origin checks; no secrets in code; DATABASE_URL read → derived schema only; config flag keeps ERD/RLS out of committed md if a repo goes public (default include, private repos) |
| backend | PASS | Degraded modes for missing CBM/DB with visible notices; malformed store refuses startup; explicit error paths |
| frontend | GAP → fixed | Playwright smoke added (Phase 6 step 6): served portal, 4 views render, annotation POST round-trip |
| architect | PASS | Rollback path above; deterministic sync is idempotent |
| supabase | N/A | No migrations |
| contract | PASS | Fixed JSON view contract; closed status vocab `prod\|beta\|dev\|stub\|deprecated` traced to views + lint |
| consistency | PASS | Port single-sourced in wiki-env.sh; vocab from SCHEMA; doc updates are the feature itself |

**Alpha-ready: YES** (after the five fixes were merged into the plan).

## 6. Open-Item Register

- **BLOCKING:** none remaining (hook target resolved by verification; state cut answered by user).
- **DEFERRED:** (1) Enrichment authoring = manual `wiki sync --enrich` only; revisit if staleness notices get noisy. (2) CBM pinned v0.10.8; upgrade trigger: CVE in its parsing stack or a needed graph feature; re-run doctor after. (3) CodeSearch join skipped in v1; trigger: entity-level page detail needs richer symbols than CBM nodes provide. (4) ERD/RLS content included in committed md by default; config key `include_data_in_md`; trigger: any wiki'd repo becomes public.

Checked for open items: enrichment merge semantics, annotation-vs-regen conflicts (fid-keyed, fp-guarded — resolved by design), CI secrets (none needed), multi-repo config (ROLLOUT.md).

## 7. Findings

1. **BLOCKER — SessionStart hook target `.claude/hooks.json` is inert** [Phase 2: dependency]. No consumer of hooks.json exists anywhere (grep: zero hits); its one entry references a missing script. Registering the staleness notice there silently wires nothing — the exact dead-file failure class from the 2026-09-03 settings.local.json incident. **Fixed:** plan Phase 4 step 4 now targets `.claude/settings.json` (project settings gains its first `hooks.SessionStart` key).
2. **GAP — CI workflow missing CBM install** [Phase 3: blast radius]. Clean GitHub runner has no CBM binary; `wiki doctor` alone fails. **Fixed:** workflow runs `wiki doctor --install` (pinned release) before `wiki sync --check`.
3. **GAP — first-sync carry-over of hand-written content** [Phase 4: edge case]. Regen without import destroys 634 lines of curated feature-status. **Fixed:** Phase 3 step adds `import-existing.sh` (`wiki_import_existing`) with failing test `enrich-import`.
4. **GAP — global CLAUDE.md amendment under-scoped** [Phase 3: blast radius]. The file is shared across all projects via reverse symlinks; unconditional wiki-ownership text would misdescribe sibling repos still hand-maintaining docs. **Fixed:** Phase 7 step 2 wording scopes ownership to wiki-installed repos.
5. **GAP — portal lacks automated browser verification** [Phase 5: alpha readiness: frontend]. Global rule: frontend changes verified with Playwright. **Fixed:** Phase 6 step 6 adds `tests/wiki-portal-smoke.sh` (headless Playwright: views render, annotation POST persists).
6. **NOTE — ERD/RLS details in committed md** [Phase 5: security]. Fine for private repos; config key `include_data_in_md` (default true) added for the public-repo case.
7. **NOTE — partial-index state declined by user** [Phase 4]. Recorded as consciously cut; stale gate surfaces it as drift.
8. **NOTE — fixture projections path shape** [Phase 2]. `execute.sh <dir>` reads `<dir>/readme/`; generator must write fixture output under `tests/fixtures/wiki-fixture-repo/readme/`.
