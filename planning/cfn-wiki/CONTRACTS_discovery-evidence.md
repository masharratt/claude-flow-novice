# Frozen contracts: Phase 1 discovery and bounded evidence

Date: 2026-09-13
Status: frozen for implementation (Integrator decision)
Scope: Phase 1 of [the plan](PLAN_context-bounded-repo-documentation.md). Changing anything here requires Integrator sign-off before implementation continues.

Python 3 standard library only. SQLite and JSON are the only stores. CBM is optional behind an adapter.

## 1. Repository revision (cache key root)

A revision is a short string identifying the enumerated tree state. It must change when any in-scope file is added, edited, deleted or renamed, including on dirty worktrees.

| Repo state | Revision |
|---|---|
| git, clean | `git rev-parse HEAD` |
| git, dirty | `<HEAD>-dirty-<r16>` where `r16` = first 16 hex of sha256 over the sorted NUL-safe `git status --porcelain -z -untracked-files=all` output |
| non-git | `nogit-<r16>` where `r16` = first 16 hex of sha256 over sorted `path\0size_bytes\0` pairs of the bounded walk |

A cursor or evidence packet captured at revision R must fail loudly (nonzero exit, clear message naming both revisions) when used against revision R'. Non-git revisions use path+size only; document that same-size edits are not detected (known limit, listed in the report).

## 2. Scope policy: `readme/wiki/scope.json`

Tracked, reviewed file. Created by `discover` when absent (with defaults), never silently rewritten afterwards.

```json
{
  "version": 1,
  "include_untracked": false,
  "include": [{"pattern": ".claude/skills/**", "reason": "hidden implementation is in scope"}],
  "exclude": [
    {"pattern": ".git/**", "reason": "repository metadata"},
    {"pattern": "node_modules/**", "reason": "dependencies"},
    {"pattern": ".wiki/**", "reason": "wiki working state"},
    {"pattern": "**/__pycache__/**", "reason": "build cache"},
    {"pattern": "**/.venv/**", "reason": "environment"},
    {"pattern": "**/dist/**", "reason": "build output"},
    {"pattern": "**/build/**", "reason": "build output"},
    {"pattern": ".env", "reason": "credentials"},
    {"pattern": ".env.*", "reason": "credentials"},
    {"pattern": "**/*.pem", "reason": "credentials"}
  ],
  "policy_notes": "Excluded-by-policy files are listed in the index with class 'excluded' and their reason; their content is never read."
}
```

Rules:

- fnmatch patterns, repo-relative, `/`-separated; `**` crosses directories. Longest matching pattern wins; on equal length, exclude beats include.
- Hidden directories are NOT excluded wholesale. `.claude/skills/**` is in the default include list; `.git` is excluded by pattern, not by hiddenness.
- Symlinks: resolve once; a target outside the repo root is recorded as class `excluded`, reason `symlink-out-of-root`, content never read. In-root cycles are broken by a visited set on the resolved path.
- Enumeration is NUL-safe (`git ls-files -z` / `os.walk` with scandir paths kept as bytes until decode with `surrogateescape`).

## 3. Discovery index: `.wiki/discovery.sqlite` (rebuildable cache)

| Table | Columns |
|---|---|
| `meta` | `key TEXT PRIMARY KEY, value TEXT` (keys: `schema_version`, `repo_root`, `revision`, `generated_by`) |
| `files` | `path TEXT PRIMARY KEY, class TEXT NOT NULL, reason TEXT, size_bytes INTEGER, lang TEXT, adapter TEXT` |
| `symbols` | `id INTEGER PRIMARY KEY, path TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, line INTEGER, adapter TEXT NOT NULL` |
| `relations` | `id INTEGER PRIMARY KEY, src_path TEXT, src_symbol TEXT, dst TEXT, kind TEXT, adapter TEXT NOT NULL` |
| `candidates` | `id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, line INTEGER, status TEXT NOT NULL DEFAULT 'candidate'` |

- `files.class` in `source | test | config | docs | generated | vendored | archived | excluded | unknown`. Every row carries a human-readable `reason` (e.g. `extension .py`, `minified line > 500 chars`, `scope policy credentials`).
- `symbols.kind` in `function | class | command | route | job | schema | manifest | api`. `adapter` names the producer: `cbm`, `python-ast`, `bash-grep`, `js-grep`, `manifest-json`, `none`. Files whose language has no adapter get zero rows and the file row records `adapter='none'` (parser gaps stay visible).
- Indexes: `files(class)`, `symbols(path)`, `symbols(name)`, `relations(src_path)`, `candidates(kind,status)`.
- Rebuild is atomic: build into `.wiki/discovery.sqlite.tmp`, then `os.replace`. A rebuild at the same revision is a byte-stable no-op check (same counts, not same file bytes; sqlite files need not be byte-identical).

## 4. Evidence packets: `.wiki/work/evidence/`

Content-addressed, reusable, never auto-deleted by sync.

- One JSON object per file, name `<evidence_id>.json`, `evidence_id` = first 32 hex of sha256 over the canonical key (section 5).
- Fields: `id`, `kind` (`span` | `graph`), `repo_root`, `revision`, `key` (the canonical key object), `content` (UTF-8 text; graph = a JSON-serialized adjacency list), `content_bytes`, `source_sha256` (whole source file hash for `span`), `created_at_epoch` (informational only, never part of any key or comparison).

## 5. Cache keys and accounting

Canonical key for a span: `{"repo": <repo_root>, "path", "start_line", "end_line", "source_sha256", "adapter_version"}`. For a graph expansion: `{"repo", "root_symbol" | "root_path", "direction", "depth", "revision", "adapter_version"}`.

- Deduplication is by key. Delivery accounting is NOT: every retrieval, including a repeat that resolves to an existing packet, appends one line to `.wiki/work/usage.jsonl`: `{"ts", "op", "revision", "evidence_id" | null, "bytes", "estimated_tokens", "cached"}`. `estimated_tokens` = `bytes // 4`, always labeled an estimate.
- Budgets (configurable via `.wiki/config.json` keys `evidence_*`, these are the defaults): single span retrieval max 8192 bytes AND max 120 lines, whichever first; list/graph query max 40 results AND 8192 bytes; cumulative per attempt 65536 bytes enforced by the caller-facing accounting helper `evidence_budget_state()`.
- Giant/minified lines: a line longer than 2000 chars is truncated in evidence content to 2000 chars plus a `... [truncated N bytes]` marker, and the truncation is recorded in the packet and counted in delivered bytes at the truncated size.

## 6. CLI envelope

Every `query` subcommand prints one JSON object to stdout and exits 0, or prints `{"error": "...", "revision": "..."}` and exits nonzero:

```json
{"items": [], "next_cursor": null, "total": 123, "truncated": false,
 "truncation_reason": null, "revision": "...", "accounted_bytes": 456}
```

- `truncation_reason` in `max_results | max_bytes | null`. `total` is the full count when cheap (COUNT query), else null.
- Ordering is explicit SQL ORDER BY; `next_cursor` = base64 of `{"revision", "last_sort_key"}`. Presenting a cursor whose revision differs from the current index revision exits 2 with a message naming both.
- Dispatcher: `lib/wiki.sh` gains `discover <repo>` and `query <repo> <kind> ...` with kinds `files | symbols | relations | candidates | span | graph`. `discover` prints the bounded summary envelope (counts per class, revision) and never dumps the file list.
- New implementation lives in `lib/discovery.py` (index + scope + revision) and `lib/evidence.py` (packets, keys, accounting). Shell wrappers stay thin.

## 7. Phase 1 acceptance (from the plan, restated as tests)

Paths with spaces and non-ASCII survive; hidden implementation (`.claude/skills`) is included; credentials and out-of-root symlinks are excluded with reasons; parser gaps are visible (`adapter='none'` rows); every output cap holds including against a fixture with giant and minified lines; cursors are stable and revision-pinned; a source edit invalidates prior evidence (revision moves, old cursor fails); repeated queries reuse the disk packet while still accounting the delivery.

## 8. Budget retune decision (2026-09-14, from the completed 32-job map run)

Defaults held across all 52 attempts (243 deliveries, 580 KB total): peak single-attempt usage 62.5 of 64 KiB (one author, completed), next-highest 47.8 KiB, most under 20 KiB; list and graph caps never hit except by design. DECISION: defaults unchanged. Retune trigger: if more than two jobs in any future run exhaust the 64 KiB attempt budget, raise `evidence_attempt_max_bytes` to 98304 in `.wiki/config.json` for that repo and record the change here.

## 9. Amendments accepted at the Phase 1 gate (2026-09-13)

Implementation report: [PHASE1_discovery-report.md](PHASE1_discovery-report.md). Accepted deviations, now part of the contract:

- The 120-line span cap reports `truncation_reason='max_results'` (lines are the result unit; no separate line token exists).
- Packet caps are not part of the cache key. Changing cap semantics requires bumping `ADAPTER_VERSION` so stale-capped packets are not reused.
- Per-attempt budget enforcement activates only when the caller passes an attempt identity; Phase 2 runners MUST pass it or the cumulative 64 KiB refusal never fires.
- Whole subtrees pruned by an exclude pattern during the walk are NOT enumerated as per-file `excluded` rows (bounded enumeration at scale); excluded files that surface individually (tracked-but-excluded, credentials, out-of-root symlinks) are listed with reasons. Follow-up: surface pruned-subtree counts in the `discover` summary envelope.
- Non-git revision hashing (path+size) does not detect same-size edits; pinned by test, listed as a known limit.
