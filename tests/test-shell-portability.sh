#!/usr/bin/env bash
# Shell portability gate.
#
# CFN is developed on WSL2 but has to run on macOS too (readme/macos-setup.md).
# Two classes of breakage are mechanical, so they are checked mechanically here
# instead of being rediscovered one broken hook at a time:
#
#   1. `#!/bin/bash` pins the script to whatever lives at that exact path. On
#      macOS that is bash 3.2 (2007), which has no associative arrays. Homebrew
#      installs bash 5 elsewhere and cannot replace /bin/bash (SIP). Only
#      `#!/usr/bin/env bash` picks up the modern interpreter.
#   2. A hardcoded /home/<user> or /Users/<user> path is correct on exactly one
#      machine.
#
# Scope is deliberately "everything a person actually executes": CFN skills and
# hooks, the test suite, build and deployment scripts. Dead archives and
# container-only scripts are excluded. This function is the single source of
# truth for that scope; the fix-up sweep consumed `--list` from here so the two
# can never drift.
#
# Usage:
#   tests/test-shell-portability.sh          # check, non-zero on violation
#   tests/test-shell-portability.sh --list   # print in-scope files
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

# Directories excluded from the portability contract.
#   docker/, tests/docker-mode/  container-only, always Linux
#   *archive*, legacy/, planning/  dead or historical, not executed
#   packages/, api-gateway/, examples/, templates/, benchmark/, monitoring/,
#   analysis/  vendored or illustrative trees, not part of the CFN runtime
EXCLUDE_RE='^(docker/|archive/|legacy/|planning/|benchmark/|api-gateway/|packages/|examples/|templates/|monitoring/|analysis/|\.archive/)|(^|/)(\.backups|node_modules|target|archive)/'

in_scope() {
  git ls-files '*.sh' | grep -vE "$EXCLUDE_RE"
}

if [ "${1:-}" = "--list" ]; then in_scope; exit 0; fi

FAIL=0

# --- check 1: no interpreter pinned to /bin/bash ------------------------------
BAD_SHEBANG=$(in_scope | while read -r f; do
  [ -f "$f" ] || continue
  head -1 "$f" | grep -q '^#!/bin/bash' && echo "$f"
done)

if [ -n "$BAD_SHEBANG" ]; then
  COUNT=$(echo "$BAD_SHEBANG" | wc -l | tr -d ' ')
  echo "FAIL: $COUNT script(s) pin the interpreter to /bin/bash (bash 3.2 on macOS)." >&2
  echo "$BAD_SHEBANG" | head -20 | sed 's/^/  /' >&2
  [ "$COUNT" -gt 20 ] && echo "  ... and $((COUNT - 20)) more" >&2
  echo "  Fix: replace '#!/bin/bash' with '#!/usr/bin/env bash'." >&2
  FAIL=1
else
  echo "PASS: no script pins the interpreter to /bin/bash"
fi

# --- check 2: no hardcoded home directories in executable lines ---------------
# Comments are provenance, not behavior, so a path in a comment does not fail
# the gate. Anything a shell would evaluate does.
# `# portability-ok: <reason>` on the same line exempts a path that is
# legitimately absolute: a path inside a container image, or literal test data
# fed to a sanitizer. The reason is mandatory so the exemption cannot be used
# as a silent mute.
HOME_HITS=$(in_scope | while read -r f; do
  [ -f "$f" ] || continue
  grep -nE '(^|[^#])/(home|Users)/[a-z][a-z0-9_-]*/' "$f" 2>/dev/null \
    | grep -vE '^[0-9]+:[[:space:]]*#' \
    | grep -v 'portability-ok:' \
    | sed "s|^|$f:|"
done)

if [ -n "$HOME_HITS" ]; then
  COUNT=$(echo "$HOME_HITS" | wc -l | tr -d ' ')
  echo "FAIL: $COUNT hardcoded home path(s) outside comments." >&2
  echo "$HOME_HITS" | head -20 | sed 's/^/  /' >&2
  [ "$COUNT" -gt 20 ] && echo "  ... and $((COUNT - 20)) more" >&2
  echo "  Fix: derive from \$HOME, or take it as a parameter with a \$HOME default." >&2
  FAIL=1
else
  echo "PASS: no hardcoded home paths outside comments"
fi

echo "---"
if [ "$FAIL" -eq 0 ]; then
  echo "shell portability: OK ($(in_scope | wc -l | tr -d ' ') files in scope)"
else
  echo "shell portability: FAILED. See readme/macos-setup.md." >&2
fi
exit "$FAIL"
