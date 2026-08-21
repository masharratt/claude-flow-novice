#!/usr/bin/env bash
# Path-containment gate for validate_file_path (security-utils.sh).
#
# validate_file_path is the traversal guard in front of skill deployment: it
# resolves a caller-supplied content path and refuses anything outside an
# allowed base directory. It had a prefix-match bug.
#
#   BUG (fixed 2026-08-20): the check was
#       [[ ! "$abs_path" =~ ^"$abs_base" ]]
#   a bare prefix comparison with no path-separator boundary. A sibling
#   directory whose NAME merely starts with the base therefore passed
#   containment: base /srv/app admitted /srv/app-evil/payload. Proven before
#   the fix by constructing exactly that pair.
#
#   The same audit repointed the base itself. The content path defaults to a
#   cwd-relative ./.claude/skills-database/skills.db, so it belongs to the
#   project that invoked the skill, not to the shared CFN checkout that every
#   project reaches through the reverse symlinks. A CFN-rooted base REJECTED
#   the normal cross-project case; the base is now
#   CONTENT_BASE_DIR="${CLAUDE_PROJECT_DIR:-$PWD}".
#
# These checks call the real function. They do not grep for the fixed text, so
# a re-break in any other form still fails.
#
# Usage:
#   tests/security/test-path-containment.sh
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
ROOT="$PWD"

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; FAIL=1; }

UTILS="$ROOT/.claude/skills/cfn-knowledge-base/lib/workflow/lib/security-utils.sh"

if [ ! -f "$UTILS" ]; then
  echo "FAIL: security-utils.sh not found at $UTILS" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$UTILS" >/dev/null 2>&1 || true

if ! declare -F validate_file_path >/dev/null; then
  echo "FAIL: validate_file_path is not defined after sourcing security-utils.sh" >&2
  exit 1
fi

WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

# Base, a sibling sharing the base's name as a prefix, and a nested dir.
BASE="$WORK/app"
SIBLING="$WORK/app-evil"
mkdir -p "$BASE/nested" "$SIBLING"
: > "$BASE/ok.txt"
: > "$BASE/nested/deep.txt"
: > "$SIBLING/payload.txt"

check() {
  local desc="$1" path="$2" base="$3" want="$4" got
  if validate_file_path "$path" "$base" >/dev/null 2>&1; then got=accept; else got=reject; fi
  if [ "$got" = "$want" ]; then
    pass "$desc ($want)"
  else
    fail "$desc: expected $want, got $got  [path=$path base=$base]"
  fi
}

# The bug: a sibling whose name starts with the base must NOT pass.
check "prefix-sibling outside base is refused" "$SIBLING/payload.txt" "$BASE" reject

# Legitimate cases must still pass, or the fix is just a denial of service.
check "file directly in base is allowed"       "$BASE/ok.txt"          "$BASE" accept
check "file in a subdirectory is allowed"      "$BASE/nested/deep.txt" "$BASE" accept
check "base itself is allowed"                 "$BASE"                 "$BASE" accept

# Ordinary traversal must stay refused.
check "dot-dot traversal out of base is refused" "$BASE/../app-evil/payload.txt" "$BASE" reject
check "absolute path outside base is refused"    "/etc/passwd"                   "$BASE" reject

# A symlink pointing out of the base must be refused: the function resolves
# with readlink -f, so the link target is what gets judged.
ln -s "$SIBLING/payload.txt" "$BASE/escape-link" 2>/dev/null || true
if [ -L "$BASE/escape-link" ]; then
  check "symlink escaping the base is refused" "$BASE/escape-link" "$BASE" reject
else
  echo "SKIP: could not create a symlink in $BASE"
fi

# The deployment callers must anchor containment on the invoking project, not on
# a BASH_SOURCE-derived CFN root. A CFN-rooted base rejects the default
# cwd-relative content path whenever the skill runs from another project.
for f in \
  ".claude/skills/cfn-knowledge-base/lib/workflow/deploy-approved-skill.sh" \
  ".claude/skills/cfn-knowledge-base/lib/workflow/propagate-skill-update.sh"
do
  if [ ! -f "$ROOT/$f" ]; then
    fail "$f is missing"
    continue
  fi
  base_var="$(grep -oE 'validate_file_path "\$[a-z_]+" "\$\{?[A-Z_]+\}?"' "$ROOT/$f" \
              | grep -oE '\$\{?[A-Z_]+\}?"$' | tr -d '${}"' | head -1)"
  if [ -z "$base_var" ]; then
    fail "$f: could not find a validate_file_path containment base"
    continue
  fi
  assign="$(grep -m1 "^${base_var}=" "$ROOT/$f" || true)"
  if [ -z "$assign" ]; then
    fail "$f: containment base \$$base_var has no assignment"
  elif printf '%s' "$assign" | grep -q 'CLAUDE_PROJECT_DIR'; then
    pass "$f anchors containment on the invoking project (\$$base_var)"
  else
    fail "$f: containment base \$$base_var is not CLAUDE_PROJECT_DIR-based: $assign"
  fi
done

echo "---"
if [ "$FAIL" -eq 0 ]; then
  echo "path containment: OK"
else
  echo "path containment: FAILED" >&2
fi
exit "$FAIL"
