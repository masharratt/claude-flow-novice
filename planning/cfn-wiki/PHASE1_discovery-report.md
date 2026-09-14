# Phase 1 report: discovery and bounded evidence

Date: 2026-09-13. Implements [frozen contracts](CONTRACTS_discovery-evidence.md) exactly; deviations listed below.

## What shipped

- `lib/discovery.py`: revision (git clean/dirty, nogit path+size), `readme/wiki/scope.json` policy (anchored globs, `**` crosses `/`, longest wins, tie favors exclude, created once, never rewritten), NUL-safe enumeration (bytes walk + `git ls-files -z`), classification with reasons, adapters `python-ast` / `bash-grep` / `js-grep` / `manifest-json`, CBM snapshot import (`.wiki/cache/cbm.db`, stale paths skipped), atomic index build into `.wiki/discovery.sqlite` with same-revision no-op, list queries with revision-pinned cursors.
- `lib/evidence.py`: content-addressed packets in `.wiki/work/evidence/`, canonical keys, span/graph retrieval with caps, giant-line truncation recorded in packets, `usage.jsonl` accounting (`estimated_tokens = bytes // 4`, always an estimate), `evidence_budget_state()` and per-attempt budget refusal.
- `lib/wiki.sh`: thin `discover <repo>` and `query <repo> <kind> ...` wrappers (kinds files/symbols/relations/candidates/span/graph). No other dispatcher behavior touched.
- `tests/test-wiki-discovery.py`: 59 tests, every contracts section 7 acceptance item plus a 1000-file scale smoke.

## Measured caps behavior (1k-file fixture and unit fixtures)

- Discover: 0.20s wall, ~22MB peak, index 260KB. Files query: 0.03s.
- List caps: 40 results AND 8192 bytes (byte-cap truncation observed at ~27 items of ~300B).
- Span caps: 120 lines AND 8192 bytes (observed 120 lines/7679B and 81 lines/8180B cuts). Giant line 5000 chars -> 2000 chars + `... [truncated 3000 bytes]`, counted at truncated size, recorded in packet `truncations`.
- Attempt budget 65536B: 8 deliveries x 8180B accepted (65440), 9th refused with error envelope naming usage.
- Graph: 40-node cap and 8192B content trim.

## Test evidence

- `python3 tests/test-wiki-discovery.py`: 59/59 OK in the repo and in an isolated rsync copy (no .git/.wiki).
- Isolated copy (`/tmp/cfn-iso-$$`): `tests/test-wiki-knowledge.py` 13/13 OK; `tests/test-wiki-env.sh` 54 passed, 0 failed, 1 SKIP (`cbm-fixture-index`: no CBM binary on PATH here; optional-integration skip, not a pass).
- Logs under `/tmp/test-*-[ts].txt`.

## Parser coverage gaps

- Languages: adapters only for python, bash, js/ts (regex), json manifests. Other sources (go, ruby, rust, ...) get `adapter='none'` rows with zero symbols, per contract visibility rule.
- python files with syntax errors yield zero symbols; the file row still says `python-ast`, so a parse failure is not distinguishable from an empty file yet.
- bash/js relations are file-level (no enclosing-symbol attribution). python imports are stored as module names; graph resolves `name` and `name.py` against indexed paths (repo-root convention only; relative imports stay unresolved names).
- CBM import maps Function/Method/Class/Interface/Route nodes and the 10 mapped edge kinds; other labels/edges are skipped. Tested with a synthetic snapshot; the real 100MB cbm.db was NOT exercised (see limits).
- Route/job/manifest candidates only (no cron/schema/api discovery yet).

## Limits and deviations

1. Span line-cap reports `truncation_reason='max_results'` (contract vocab has no line token; documented mapping).
2. Non-git revisions hash path+size: same-size edits undetected (contract-documented; pinned by test).
3. Packet caps are not in the cache key: config changes after packets exist reuse old-capped content until the source hash (span) or revision (graph) moves. Bump `ADAPTER_VERSION` when changing cap semantics.
4. Budget enforcement only when the caller passes `--attempt` (contract makes the helper caller-facing; Phase 2 runners must pass attempt ids). Direct file reads by an agent bypass accounting; host-neutral limit per the plan's context contract.
5. Excluded subtrees that are pruned during the walk are not listed as individual `excluded` rows (bounded enumeration at scale); surfaced excluded files (.env, out-of-root symlinks, tracked-but-excluded) are listed with reasons.
6. Git dirty revision uses raw `git status --porcelain -z` per contract, so first `discover` creates `readme/wiki/scope.json` and flips a clean tree dirty until it is committed; untracked `.wiki/work/` files (usage.jsonl, packets) also churn the dirty hash on repos that do not ignore `.wiki/`. Recommend committing scope.json and adding `**/.wiki/work/` to `.gitignore`.
7. `discover` was not run on the real CFN repo (it would create `readme/wiki/scope.json`, outside this task's allowed file set); CBM adapter verified against a synthetic snapshot only.
8. New files are `chmod +x` on disk; the index exec bit (`git update-index --chmod=+x`) is unset because staging is forbidden here. Set it when committing.

Nothing staged, committed or pushed. `readme/` outputs untouched; no wiki sync run.
