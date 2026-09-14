# SCALE report: cfn-wiki discovery and evidence at 1k / 10k / 100k files

Date: 2026-09-14
Suite: `tests/wiki-scale-bench.sh` (executable, bash + stdlib python3)
Plan section: "Scale and regression suite" in
[PLAN_context-bounded-repo-documentation.md](PLAN_context-bounded-repo-documentation.md)
Measured code: `.claude/skills/cfn-wiki/lib/discovery.py`, `.claude/skills/cfn-wiki/lib/evidence.py`
Raw output of the final run: `/tmp/wiki-scale-bench-FINAL-1789400908.txt` (one JSON line per tier)

## Machine context

| Item | Value |
|---|---|
| CPUs | 16 (WSL2, .wslconfig processors=16) |
| RAM | 48 GB visible to WSL2 (47.0 GiB total) |
| Kernel | Linux 6.6.87.2-microsoft-standard-WSL2 |
| Python | 3.12.3 |
| git | 2.43.0 |
| /tmp | ext4, 605 GB free at run time |

## Fixture

Deterministic generator (seed 20260914, sha256-derived content, fixed git
author/committer dates; no clock or randomness). Verified: two independent
1k generations are byte-identical (`--determinism`). Every tier carries the
plan's shapes:

- monorepo: `apps/{web,api,worker,admin,mobile}/src/*.ts` (js adapter,
  routes every 17th file) + `packages/{shared,ui,utils,core}/*.py`
- giant file: `giant/big.py`, 50002 lines, 25000 functions
- sparse/partial graph: 20 files, half importing nonexistent modules; every
  7th src-tree file imports a missing helper
- renamed + deleted sources: commit 2 `git mv src/legacy_old.py
  src/legacy_new.py`, commit 3 `git rm src/doomed.py` (3 dated commits)
- dirty worktree at every tier: one tracked edit post-commit plus one
  untracked file; discovery revision is `HEAD-dirty-<16hex>` at all tiers
- generated/vendor trees: `node_modules/` filler (excluded class, minified
  lines) 25% and `vendor/` ruby (vendored class, no adapter) 15%
- deep dependency chain: `c00.py` imports `c01` ... `c39.py` (40 files)

Tier budget split: 45% monorepo, 25% node_modules, 15% vendor, 15% src tree,
plus a fixed 73-file shape set. `files` below is one less than the budget:
the commit-3 deletion leaves HEAD's tracked set smaller by `src/doomed.py`.

## Measured table

All wall times in seconds. Discover wall is `/usr/bin/time -v` elapsed of the
child process; peak RSS is its maximum resident set. Query walls include one
python startup (CLI end to end). Perf numbers are reported, not asserted.

| Metric | 1k | 10k | 100k |
|---|---|---|---|
| files enumerated | 999 | 9999 | 99999 |
| classify: source | 622 | 6022 | 60022 |
| classify: vendored | 139 | 1489 | 14989 |
| classify: excluded | 232 | 2482 | 24982 |
| symbols | 25515 | 30359 | 78800 |
| relations | 72 | 265 | 2194 |
| generate wall | 0.07 | 0.47 | 3.71 |
| git history wall | 0.18 | 1.04 | 4.88 |
| discover wall | 1.03 | 1.28 | 3.85 |
| discover peak RSS MB | 243.2 | 247.3 | 290.7 |
| discovery.sqlite MB | 2.42 | 4.08 | 20.98 |
| files-query wall | 0.04 | 0.05 | 0.05 |
| files-query items / accounted bytes | 40 / 5842 | 40 / 5843 | 40 / 5842 |
| span-query wall (giant, 120-line request) | 0.05 | 0.06 | 0.05 |
| span giant delivered lines / bytes | 120 / 2639 | 120 / 2639 | 120 / 2639 |
| span wide (1..120, 100-char lines) lines / bytes | 81 / 8099 | 81 / 8099 | 81 / 8099 |
| span narrow (1..500, 64-char lines) lines / bytes | 120 / 7679 | 120 / 7679 | 120 / 7679 |
| portal single-file bytes | 187547 | 1226390 | skipped (see below) |

Run-to-run spread observed across four full runs: discover wall 0.60 to 1.19
(1k), 0.66 to 1.50 (10k), 3.85 to 4.65 (100k). Index size, RSS, symbol and
relation counts, and every ceiling metric were identical across runs.

## Ceiling results (asserted; exit 1 on violation)

| Ceiling | Limit | 1k | 10k | 100k | Result |
|---|---|---|---|---|---|
| 120-line span request, delivered lines | <= 120 | 120 | 120 | 120 | PASS |
| 120-line span request, delivered bytes | <= 8192 | 2639 | 2639 | 2639 | PASS |
| 120-line request on 100-char lines, bytes (byte-cap path) | <= 8192 | 8099 | 8099 | 8099 | PASS |
| same, must engage truncation with reason max_bytes | required | yes | yes | yes | PASS |
| 500-line request, delivered lines (line-cap path) | <= 120 | 120 | 120 | 120 | PASS |
| same, truncation reason | max_results | yes | yes | yes | PASS |
| files-query item cap | <= 40 | 40 | 40 | 40 | PASS |
| files-query accounted bytes | <= 8192 | 5842 | 5843 | 5842 | PASS |
| symbols-query item cap | <= 40 | 40 | 40 | 40 | PASS |

Zero violations at every tier. The FAIL machinery itself was proven live with
`--red-selftest` (three fabricated violations all trip and exit 1).

## Skips

- Portal at 100k: skipped by design. The current portal is a single
  self-contained HTML file with the whole payload inlined; the plan's Phase 4
  (paged mode) does not exist yet, so embedding a 100k-file wiki wholesale
  would measure a known-wrong shape. Measured below 100k only.
- 100k tier under default settings: the suite prints
  `skip: tier above WIKI_SCALE_MAX=10000` unless `WIKI_SCALE_MAX=100000` is
  set explicitly. The final run above opted in and completed.

## Observations (not asserted, per plan: no unmeasured thresholds)

- Portal single-file payload grows ~6.5x from 1k to 10k files (183 KB to
  1.2 MB). Linear extrapolation puts 100k near 12 MB in one HTML file,
  reinforcing the plan's Phase 4 paged-mode requirement. No ceiling exists
  yet; record one before release.
- Excluded rows (node_modules) enter discovery.sqlite as file rows with
  class `excluded` (24982 rows at 100k) but their content is never read;
  index size grows with repository size, which the plan allows.
- Discover wall scales sub-linearly here (1.0 / 1.3 / 3.9 s) because the
  giant-file AST parse (25k functions) dominates the 1k tier, and excluded
  files short-circuit before any read.
- Peak RSS grows only ~20% from 1k to 100k (243 to 291 MB); the 1k floor is
  dominated by the giant file's parse tree plus the interpreter.
- WSL2 clock corrections are real on this machine: one 6.5 s backward jump
  was observed between two adjacent `date` samples in an earlier run (showed
  up as a negative wall). The suite now takes discover wall from
  `/usr/bin/time`'s own child measurement, clamps any inverted shell sample
  to 0.00, and logs the inversion to stderr.
- One transient WSL2 `rm -rf` race ("Directory not empty") hit cleanup of
  the 100k `.git` tree; cleanup failure now warns instead of failing the
  bench.

## How to rerun

```bash
./tests/wiki-scale-bench.sh                          # 1k + 10k, portal built, 100k skip line
WIKI_SCALE_MAX=100000 ./tests/wiki-scale-bench.sh    # all three tiers (~2 min total)
./tests/wiki-scale-bench.sh --red-selftest           # prove the FAIL path trips
./tests/wiki-scale-bench.sh --determinism            # byte-identical double generation
./tests/wiki-scale-bench.sh --tiers 1000 --keep      # one tier, keep the synthetic repo
```

Guards: `WIKI_SCALE_MAX` (default 10000) caps the largest tier;
`WIKI_SCALE_WALL_BUDGET` (default 3600 s) skips a tier whose cost, estimated
from the previous tier's measured wall, would exceed the budget; a disk guard
skips a tier needing more than ~6 KB per file free in /tmp. All generated
repos live under `/tmp/wiki-scale-*` and are removed unless `--keep` is set
or a tier fails (kept for inspection).

No ceiling violations were found, so nothing in
`.claude/skills/cfn-wiki/lib/` or `readme/` was modified by this work.
