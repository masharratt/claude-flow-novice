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
command -v taskset >/dev/null && taskset -cp \$\$ | sed "s/.*: //" > "$WORK/affinity"
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

# 4. Indexer is pinned to CODESEARCH_CPUS (default 0,1): the local embedding
#    model otherwise takes ~9 of 16 cores (user request 2026-10-29).
if command -v taskset >/dev/null; then
  [ "$(cat "$WORK/affinity" 2>/dev/null)" = "0,1" ] && ok "indexer pinned to cores 0,1" || bad "affinity: '$(cat "$WORK/affinity" 2>/dev/null)'"
fi

# 5. GPU auto-select (2026-10-30): when local-codesearch-gpu is installed the
#    hook uses it; machines without it (the VPS, no GPU) keep the CPU binary.
GPU_CALLS="$WORK/gpu-calls.log"
cat > "$FAKE_HOME/.local/bin/local-codesearch-gpu" <<EOF
#!/usr/bin/env bash
while [ \$# -gt 0 ]; do [ "\$1" = "--path" ] && echo "\$2" >> "$GPU_CALLS"; shift; done
exit \${FAKE_GPU_RC:-0}
EOF
chmod +x "$FAKE_HOME/.local/bin/local-codesearch-gpu"
: > "$WORK/hook.log"; : > "$GPU_CALLS"
OUT=$(run_hook)
[ "$(sort -u "$GPU_CALLS")" = "gamma" ] && [ -z "$OUT" ] && ok "gpu binary used when installed" \
  || bad "gpu not used: gpu='$(cat "$GPU_CALLS")' cpu='$OUT'"

# 6. GPU wrapper that cannot start (exit 127: missing CUDA/onnxruntime libs)
#    falls back to the CPU binary for the same directory.
: > "$WORK/hook.log"; : > "$GPU_CALLS"
OUT=$(FAKE_GPU_RC=127 run_hook)
[ "$OUT" = "gamma" ] && ok "gpu start failure falls back to cpu" || bad "no cpu fallback: cpu='$OUT'"
rm -f "$FAKE_HOME/.local/bin/local-codesearch-gpu"

# 3. The live queue dir is never used by this test.
[ -z "$(find /tmp/codesearch-queue -name "*$$*.job" 2>/dev/null)" ] && ok "live queue untouched" || bad "wrote to live queue"

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
