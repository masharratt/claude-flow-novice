# BRIEF: stop scripts from deleting the repo through a bad temp-dir variable

## Incident (2026-10-15)
`tests/test-cfn-fleet-dashboard.sh:27` did `TEST_TMP=$(cd "$(mktemp -d -t X)" && pwd -P)`. In the sandbox mktemp failed, `cd ""` succeeded and stayed in the cwd, so TEST_TMP = repo root, and the cleanup trap `rm -rf "$TEST_TMP"` wiped the repo (incl. .git). The cfn-careful PreToolUse guard never saw it: it only inspects the command Claude types (`bash tests/x.sh`), not rm calls inside scripts. Session ran in bypass mode, so no prompt either.

Measured today: 366 `rm -r* "$VAR"` lines in 173 test scripts, 139 in .claude scripts, 9 `cd "$(mktemp` sites.

## Deliverables (TDD: failing test first for each)
1. **Runtime guard function** `cfn_safe_rm_tmp <path>...` in ONE shared file sourced by tests and scripts (suggest `.claude/cfn-scripts/lib/safe-rm.sh`; `tests/test-utils.sh` sources it and its existing `cleanup_temp_dir` delegates to it, DRY). Refuses (non-zero, message to stderr, deletes nothing) when the path is: empty; `/`; `$HOME` or an ancestor of it; the cwd or any ancestor of the cwd; any git toplevel or ancestor of one (dir containing `.git`); not resolving (via `cd -P`/realpath) under an allowed temp root (`$TMPDIR`, `/tmp`, `/private/tmp`, `/var/folders`, `/private/var/folders`). Symlink tricks resolved before the check. Unit test: `tests/test-safe-rm-tmp.sh` covering every refusal and the allowed case, using a sacrificial temp tree (never the real repo).
2. **Fix all 9 `cd "$(mktemp` sites** (except `tests/test-cfn-fleet-dashboard.sh`, which another helper is fixing right now: do not edit that file) to: mktemp into a var `|| exit 1`, then resolve, then cleanup through `cfn_safe_rm_tmp`.
3. **CI lint** `tests/test-unsafe-rm-patterns.sh`, added to `.github/workflows/ci.yml` next to `test-shell-portability.sh`:
   - Hard ban (zero allowed, everywhere in tests/ and .claude/ *.sh): `cd "$(mktemp` and `cd $(mktemp`; a `$(mktemp ...)` assignment with no failure handling on the same line or the next line (`|| exit`, `|| return`, `|| {`, or `set -e` in effect is NOT enough because of command substitution in pipelines; keep the rule simple and documented).
   - Ratchet: `rm -r*`/`rm -fr` whose target is a variable and does not go through `cfn_safe_rm_tmp` (and is not `${VAR:?}`-guarded under an allowlisted literal prefix) is counted per file against a committed baseline file (`tests/fixtures/unsafe-rm-baseline.txt`, `file count` lines). A file's count may only go down; a new file must have zero. Failure output names file, line and pattern (missing=/unexpected= style per code-quality rules), and reports how many files it scanned (exit 2 if it scanned zero).
   - The lint must itself have a test proving it goes red on each banned pattern (fixtures under `tests/fixtures/unsafe-rm/`).
4. Add a short subsection to `tests/CLAUDE.md` saying: always `mktemp ... || exit 1`; delete temp dirs only via `cfn_safe_rm_tmp`.

## Safety rules for YOU (non-negotiable)
- Never run rm on a variable path in your own commands. Create scratch dirs with `T=$(mktemp -d "${TMPDIR:-/tmp}/saferm.XXXXXX") || exit 1` and check `[[ $T == */saferm.* ]]` before touching them.
- Do not run the full test suites. You may run ONLY `tests/test-safe-rm-tmp.sh` and `tests/test-unsafe-rm-patterns.sh` after reading them back and confirming every rm in them goes through the guard or targets a verified mktemp path. Syntax checks fine.
- Do not edit `tests/test-cfn-fleet-dashboard.sh` or `tests/test-cfn-fleet-dashboard-ui.cjs`. Do not commit or touch git state.

## Report
<=250 words plain English: what each layer catches, the baseline numbers, anything you could not do. You are a leaf agent. Do not spawn subagents; do the work yourself.
