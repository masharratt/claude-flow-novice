#!/usr/bin/env bash
# Tests for reap-orphan-test-workers.sh RULE B (stuck CodeSearch indexers).
#
# Regression (2026-10-29): RULE B killed every indexer older than 20 min. Its
# premise was a hang on a missing qdrant/memgraph backend; once embeddings
# covered py/sh/md, a legitimate full reindex run with --skip-qdrant
# --skip-memgraph (which cannot hang on those backends) was killed at 34 min.
# Such runs are now exempt; backend-connected indexers are still reaped.
#
# Uses REAP_PS_OUTPUT (fake process list) and REAP_DRY_RUN=1 (log, never
# kill), so no real process is ever signalled.
#
# Run: bash tests/test-reap-orphan-indexer.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REAPER="$REPO_ROOT/.claude/hooks/reap-orphan-test-workers.sh"
source "$REPO_ROOT/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "ok: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cfn-reap-test.XXXXXX")" || exit 1
trap 'cfn_safe_rm_tmp "$WORK"' EXIT
LOGF="$WORK/reap.log"

PS_FAKE="$WORK/ps.txt"
cat > "$PS_FAKE" <<'EOF'
 900001 1 5000 local-codesearch --project-dir . --skip-qdrant --skip-memgraph index --path . --types sh --force
 900002 1 5000 local-codesearch --project-dir . --qdrant-url http://localhost:6334 index --path src --types rs
 900003 1 60 local-codesearch --project-dir . --qdrant-url http://localhost:6334 index --path src
 900004 1 5000 local-codesearch --project-dir . --skip-qdrant index --path src
EOF

REAP_PS_OUTPUT="$PS_FAKE" REAP_DRY_RUN=1 REAP_LOG="$LOGF" bash "$REAPER"
RC=$?
[ "$RC" = 0 ] && ok "exit 0" || bad "rc=$RC"

grep -q "pid=900001" "$LOGF" 2>/dev/null && bad "backend-free full reindex was reaped" || ok "backend-free indexer exempt"
grep -q "KILL stuck codesearch indexer pid=900002" "$LOGF" 2>/dev/null && ok "old backend-connected indexer reaped" || bad "old backend-connected indexer not reaped"
grep -q "pid=900003" "$LOGF" 2>/dev/null && bad "young indexer reaped" || ok "young indexer left alone"
grep -q "KILL stuck codesearch indexer pid=900004" "$LOGF" 2>/dev/null && ok "half-skipped (memgraph live) indexer reaped" || bad "half-skipped indexer not reaped"
grep -q "DRY RUN" "$LOGF" 2>/dev/null && ok "dry run logged, nothing killed" || bad "dry-run marker missing"

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
