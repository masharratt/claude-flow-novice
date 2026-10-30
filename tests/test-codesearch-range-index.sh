#!/usr/bin/env bash
# Tests for cfn-post-commit-codesearch-index.sh range mode.
#
# Regression (2026-10-29 index-gap RCA): the indexer only ran from
# post-commit, which reads `git diff-tree HEAD`. Commits arriving by pull or
# rebase never fired it, so ~80 commits pulled on 2026-10-16 were never
# indexed. CFN_CODESEARCH_RANGE (set by .husky/post-merge and post-rewrite to
# ORIG_HEAD..HEAD) must index every directory changed across the range.
#
# Synthetic HOME with a fake binary that logs its --path args; synthetic queue,
# lock and log paths, so the live index and queue are never touched.
#
# Run: bash tests/test-codesearch-range-index.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$REPO_ROOT/.claude/hooks/cfn-post-commit-codesearch-index.sh"
source "$REPO_ROOT/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "ok: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cfn-cs-range.XXXXXX")" || exit 1
trap 'cfn_safe_rm_tmp "$WORK"' EXIT

FAKE_HOME="$WORK/home"
mkdir -p "$FAKE_HOME/.local/bin" "$FAKE_HOME/.local/share/codesearch"
: > "$FAKE_HOME/.local/share/codesearch/index_v2.db"
CALLS="$WORK/calls.log"
cat > "$FAKE_HOME/.local/bin/local-codesearch" <<EOF
#!/usr/bin/env bash
while [ \$# -gt 0 ]; do [ "\$1" = "--path" ] && echo "\$2" >> "$CALLS"; shift; done
exit 0
EOF
chmod +x "$FAKE_HOME/.local/bin/local-codesearch"

REPO="$WORK/repo"
mkdir -p "$REPO/alpha" "$REPO/beta" "$REPO/gamma"
(
  cd "$REPO" && git init -q && git config user.email t@example.com && git config user.name t
  echo 'a() { :; }' > alpha/a.sh && git add . && git commit -qm base
  echo 'b() { :; }' > beta/b.sh && git add . && git commit -qm one
  echo 'c() { :; }' > gamma/c.sh && git add . && git commit -qm two
) || { echo "setup failed"; exit 1; }

run_hook() { # [range]
  : > "$CALLS"
  (cd "$REPO" && HOME="$FAKE_HOME" \
     CFN_CODESEARCH_QUEUE_DIR="$WORK/queue" CFN_CODESEARCH_LOCK_FILE="$WORK/lock" \
     CFN_CODESEARCH_LOG="$WORK/hook.log" CFN_CODESEARCH_RANGE="${1:-}" \
     bash "$HOOK")
  # The hook drains in a background worker; wait for it to finish.
  for _ in $(seq 1 50); do
    [ -z "$(find "$WORK/queue" -name '*.job' 2>/dev/null)" ] && grep -q "drain done" "$WORK/hook.log" 2>/dev/null && break
    sleep 0.2
  done
  sort -u "$CALLS"
}

# 1. Default (post-commit): only the last commit's directory.
OUT=$(run_hook)
[ "$OUT" = "gamma" ] && ok "post-commit indexes last commit only" || bad "post-commit indexed: '$OUT'"

# 2. Range (post-merge / post-rewrite): every directory changed in the range.
: > "$WORK/hook.log"
BASE=$(git -C "$REPO" rev-list --max-parents=0 HEAD)
OUT=$(run_hook "$BASE..HEAD" | tr '\n' ' ')
[ "$OUT" = "beta gamma " ] && ok "range indexes every changed dir" || bad "range indexed: '$OUT'"

# 3. The live queue dir is never used by this test.
[ -z "$(find /tmp/codesearch-queue -name "*$$*.job" 2>/dev/null)" ] && ok "live queue untouched" || bad "wrote to live queue"

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
