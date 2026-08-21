#!/usr/bin/env bash
# Sourced-path existence gate.
#
# THE BUG THIS NAMES (2026-08-19/20 consolidation)
# -------------------------------------------------
# The sqlite parameterized-query bootstrap moved from
# `.claude/skills/shared/bootstrap/sqlite-params.sh` to
# `.claude/shared-lib/bootstrap/sqlite-params.sh`. Six callers still cited the
# old location. Two of them (cfn-memory-persistence's
# test-memory-persistence.sh and ttl-cleanup.sh) `source` it unguarded under
# `set -e`, so those scripts died on their own first real line every time they
# ran. The other four guard with `[[ -f ... ]]` and degrade to an explicit
# "not found" error instead of a crash, which is why they went unnoticed
# longer: the failure mode is a clean exit 1, not a stack of confusing
# downstream errors.
#
# A grep for the specific old path would catch this one rename but not the
# next one, so this gate is generic: find every `source` / `.` command in
# every tracked shell file whose target names a `.claude/...` path, resolve it
# for real (not by eye), and require the file to exist.
#
# WHAT COUNTS AS RESOLVABLE
# --------------------------
# A target's variables are resolved by re-assembling the ASSIGNMENT lines that
# precede the source call in the same file (plain `NAME=...` / `readonly
# NAME=...` / `declare ... NAME=...`, plus comments/blank/`set` lines so line
# numbers and quoting stay intact) and asking bash to expand the argument
# against that prefix, with `${BASH_SOURCE[0]}` / `$BASH_SOURCE` substituted for
# the file's own real path first (a `-c` string has no BASH_SOURCE of its own).
# Run from `/tmp`, not the repo, so a chain that only works by accident of cwd
# cannot pass.
#
# A target is SKIPPED, not passed, when after that substitution a `$`
# expansion is still textually present (a variable this gate could not find an
# assignment for -- e.g. it comes from an exported caller, a loop, or a
# function parameter) or when the source line itself could not be parsed. This
# is a deliberate choice: an unresolved chain that is silently counted as a
# pass is exactly the failure mode BUG-2/3/4 in test-project-root-resolution.sh
# came from. Skips are reported and counted in the summary, never hidden.
#
# WHAT THIS EXECUTES (deliberate, bounded)
# ----------------------------------------
# Replaying an assignment prefix runs it, so a `VAR=$(...)` command
# substitution in those lines executes. That is accepted for the same reason
# test-root-resolution.sh accepts it: resolving a `../` chain by eye is exactly
# the mistake these gates exist to catch, so the chain has to be evaluated for
# real. It is bounded to repo-authored, already-reviewed shell, only ASSIGNMENT
# lines (never the script's actual body), and a cwd of /tmp. If a future
# assignment in some script grows a side effect, this gate is where it will
# surface -- restrict the replay to a command allowlist at that point rather
# than pre-emptively, since an allowlist that skips a chain reports a SKIP and
# quietly loses the coverage the gate exists for.
#
# COVERAGE BLIND SPOT (know this before "fixing" a failure)
# ---------------------------------------------------------
# Only targets whose text names a `.claude/...` path are graded. So a "fix"
# that re-anchors a target and drops the literal `.claude/` -- e.g.
# "$SCRIPT_DIR/../cfn-utilities/execute.sh" instead of
# "$PROJECT_ROOT/.claude/skills/cfn-utilities/execute.sh" -- resolves fine and
# silently leaves the graded set. The gate goes green because it stopped
# looking, not because the path got better. Observed for real: the graded total
# dropped 63 -> 62 that way. Watch the graded/pass totals, not just the exit
# code, and keep the `.claude/skills/...` literal in the target.
#
# Execution-position paths (`bash "$ROOT/.claude/..."`, `"$ROOT/.claude/..."`)
# are NOT graded, only `source`/`.` targets. Known stale instances of that class
# exist; extending the gate to cover it is a separate piece of work.
#
# Usage:
#   tests/test-sourced-paths-exist.sh
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
ROOT="$PWD"

FAIL=0
PASS_N=0
SKIP_N=0
SKIP_LIST=""
FAIL_LIST=""

pass() { PASS_N=$((PASS_N + 1)); }
fail() { echo "FAIL: $1" >&2; FAIL_LIST="$FAIL_LIST\n  $1"; FAIL=1; }
skip() { SKIP_N=$((SKIP_N + 1)); SKIP_LIST="$SKIP_LIST\n  $1"; }

# Same exclusion convention as test-shell-portability.sh: dead archives,
# vendored/build output, and the local backup dir are not code anyone runs.
EXCLUDE_RE='^(docker/|archive/|legacy/|planning/|benchmark/|api-gateway/|packages/|examples/|templates/|monitoring/|analysis/|\.archive/)|(^|/)(\.backups|node_modules|target|archive|\.claude/worktrees)/'

FILES="$(git ls-files '*.sh' | grep -vE "$EXCLUDE_RE")"

# abs_path FILE - the file's absolute repo path, plain (no shell quoting):
# it is spliced into a sed replacement, not a shell command line.
abs_path() {
  printf '%s' "$ROOT/$1"
}

# first_token STRING - just the first shell word: the quoted string if the
# argument starts with a quote, else the run up to the first whitespace.
# `source X extra-arg`, `source X 2>/dev/null`, and `source X || true` all set
# $1/redirect/short-circuit AROUND the real target; without this, feeding the
# whole remainder into the resolver glues a trailing word straight onto the
# path with no separator (a real false positive this gate hit on its first
# run against tests/integration/test-provider-routing.sh).
first_token() {
  local s="$1" rest
  case "$s" in
    \"*) rest="${s#\"}"; printf '"%s"' "${rest%%\"*}" ;;
    \'*) rest="${s#\'}"; printf "'%s'" "${rest%%\'*}" ;;
    *)   printf '%s' "${s%%[[:space:]]*}" ;;
  esac
}

# heredoc_ranges FILE - "START:END" per heredoc body (the lines between
# `<<[-]DELIM` and the line holding just DELIM), one per line. A `source ...`
# that appears inside one of these ranges is fixture/example TEXT being
# written into a generated script or test string, not code this file itself
# executes, and must not be graded as if it were (hit on
# tests/test-portability-skill-refs.sh and
# tests/security/test-sec-002-orchestrate-vulnerabilities.sh, both of which
# intentionally embed source lines, including deliberately-bad ones, as
# heredoc payloads for a DIFFERENT gate to inspect).
heredoc_ranges() {
  awk '
    !in_hd {
      if (match($0, /<<-?[ \t]*["\x27]?[A-Za-z_][A-Za-z0-9_]*["\x27]?/)) {
        tok = substr($0, RSTART, RLENGTH)
        sub(/<<-?[ \t]*/, "", tok)
        gsub(/["\x27]/, "", tok)
        if (tok != "") { in_hd = 1; delim = tok; start = NR + 1 }
      }
      next
    }
    in_hd {
      line = $0
      gsub(/^[ \t]+/, "", line); gsub(/[ \t]+$/, "", line)
      if (line == delim) { print start":"NR; in_hd = 0 }
    }
  ' "$1"
}

# in_range LINENO RANGES - true if LINENO falls inside any "START:END" pair.
in_range() {
  local n="$1" ranges="$2" pair a b
  for pair in $ranges; do
    a="${pair%%:*}"; b="${pair##*:}"
    if [ "$n" -ge "$a" ] && [ "$n" -le "$b" ]; then
      return 0
    fi
  done
  return 1
}

while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -f "$f" ] || continue

  hd_ranges="$(heredoc_ranges "$f")"

  # Candidate lines: a `source` or dot-command whose argument mentions a
  # .claude/ path. The dot form is matched narrowly (". " + a path-looking
  # token) so an arithmetic or regex "." elsewhere on a line is not confused
  # for the source builtin.
  while IFS=: read -r lineno line; do
    [ -n "$lineno" ] || continue

    loc="$f:$lineno"

    if [ -n "$hd_ranges" ] && in_range "$lineno" "$hd_ranges"; then
      skip "$loc: inside a heredoc body, not code this file executes"
      continue
    fi

    raw_arg="$(printf '%s' "$line" | sed -E 's/^[[:space:]]*(source|\.)[[:space:]]+//')"
    [ -n "$raw_arg" ] || continue
    arg="$(first_token "$raw_arg")"
    case "$arg" in
      *.claude*) ;;
      *) continue ;;
    esac

    abs_self="$(abs_path "$f")"

    # Re-assemble the assignment prefix: every line before this one that looks
    # like a variable assignment, plus comments/blank/set lines so nothing
    # shifts. Function bodies, conditionals and real commands are dropped on
    # purpose -- executing them would mean actually running arbitrary script
    # content from across the repo, which is exactly what this gate must not
    # do to stay safe to run on every commit.
    prefix="$(sed -n "1,$((lineno - 1))p" "$f" | grep -E '^[[:space:]]*(#|$)|^[[:space:]]*(readonly[[:space:]]+|declare[[:space:]]+(-[A-Za-z]+[[:space:]]+)?|export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*\+?=|^[[:space:]]*set[[:space:]+-]')"

    # ${BASH_SOURCE[0]} / $BASH_SOURCE have no meaning once these lines are
    # replayed from a temp file (that file's own BASH_SOURCE is the temp file,
    # not the original); substitute the file's own real path first. "|" is
    # the sed delimiter because the replacement is itself a path full of "/".
    # Neutralise the script's own `set` line. Function definitions are dropped
    # from the prefix on purpose (see above), so a prefix assignment of the form
    # VAR=$(some_helper ...) is guaranteed to fail -- and under the file's own
    # `set -e` that failure aborts the replay before the target is ever printed,
    # turning a resolvable target into a SKIP. The gate only needs the argument
    # EXPANDED, never faithfully executed, so the options are dropped while the
    # line itself is kept so nothing shifts. This cannot mask a bad path: an
    # unset variable expands to empty and the resulting path simply fails the
    # existence check, and a target with a `$` still in it is skipped textually
    # before any of this runs.
    prefix_sub="$(printf '%s\n' "$prefix" \
      | sed -E 's|^([[:space:]]*)set[[:space:]+-].*$|\1: neutralised-set-line|' \
      | sed -E "s|\\\$\\{BASH_SOURCE\\[0\\]\\}|$abs_self|g; s|\\\$BASH_SOURCE\\b|$abs_self|g")"
    arg_sub="$(printf '%s' "$arg" | sed -E "s|\\\$\\{BASH_SOURCE\\[0\\]\\}|$abs_self|g; s|\\\$BASH_SOURCE\\b|$abs_self|g")"

    # Replay the assignment prefix, then print the argument exactly as written
    # so bash expands its own $VAR / $(...) the normal way. A temp file (not
    # `bash -c`) sidesteps the escaping hazard of splicing arbitrary source
    # text into a -c string.
    eval_script="$(mktemp "${TMPDIR:-/tmp}/cfn-sourced-paths.XXXXXX")"
    {
      printf '%s\n' "$prefix_sub"
      printf 'printf %%s %s\n' "$arg_sub"
    } > "$eval_script"
    resolved="$(cd /tmp && bash "$eval_script" 2>/dev/null)"
    rc=$?
    rm -f "$eval_script"

    if [ $rc -ne 0 ] || [ -z "$resolved" ]; then
      skip "$loc: could not evaluate target ($arg)"
      continue
    fi
    if printf '%s' "$resolved" | grep -q '\$'; then
      skip "$loc: unresolved variable in target -> $resolved (source: $arg)"
      continue
    fi

    case "$resolved" in
      /*) ;;
      *) resolved="$ROOT/$resolved" ;;
    esac

    # $HOME/.claude/<x> and <repo>/.claude/<x> are the SAME file: every runtime
    # dir under ~/.claude is a reverse symlink into this checkout, and the
    # project rule requires shared skills to be invoked via $HOME/.claude/...
    # (tests/test-shell-portability.sh enforces that). So a target under
    # $HOME/.claude is graded against the repo, which is the source of truth.
    # Without this the gate only passes on a machine where link-runtime-dirs.sh
    # has already been run: CI resolved $HOME/.claude/... to
    # /home/runner/.claude/... and failed on both runners while passing locally
    # (2026-08-20, ci.yml run 32447485351).
    if [ ! -f "$resolved" ] && [ -n "${HOME:-}" ]; then
      case "$resolved" in
        "$HOME"/.claude/*) resolved="$ROOT/.claude/${resolved#"$HOME"/.claude/}" ;;
      esac
    fi

    if [ -f "$resolved" ]; then
      pass
    else
      fail "$loc: $arg -> $resolved (does not exist)"
    fi
  done < <(grep -nE '^[[:space:]]*(source|\.)[[:space:]]+\S*\.claude' "$f")
done <<EOF
$FILES
EOF

echo "--- sourced .claude/... path targets"
echo "PASS: $PASS_N target(s) resolved to an existing file"
if [ -n "$SKIP_LIST" ]; then
  echo "SKIP: $SKIP_N target(s) could not be resolved statically:"
  printf '%b\n' "$SKIP_LIST"
fi

if [ -n "$FAIL_LIST" ]; then
  echo "FAIL: target(s) resolved to a path that does not exist:" >&2
  printf '%b\n' "$FAIL_LIST" >&2
fi

echo "---"
if [ "$FAIL" -eq 0 ]; then
  echo "sourced-paths-exist: OK ($PASS_N pass, $SKIP_N skip)"
else
  echo "sourced-paths-exist: FAILED ($PASS_N pass, $SKIP_N skip, see failures above)" >&2
fi
exit "$FAIL"
