#!/usr/bin/env bash
# tests/test-readonly-data.sh
# readonly-data.sh lock|unlock|status: makes the paths listed in
# <repo>/.zai-fence-readonly read-only on disk, so a recursive delete fails for
# every process and every agent, not just fenced glm workers.
# Incident: MDTWII 2026-10-16, a test Drop impl wiped 7.5 GB of shared data
# through a worktree symlink four times; chmod a-w was the guard that held.
set -uo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
set +e
source "$PROJECT_ROOT/.claude/cfn-scripts/lib/safe-rm.sh"

TOOL="$PROJECT_ROOT/.claude/cfn-scripts/readonly-data.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/readonly-data-test-XXXXXX") || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1
REPO="$T/repo"; WT="$REPO/.claude/worktrees/w1"

PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }

cleanup(){ chmod -R u+w "$T" 2>/dev/null; cfn_safe_rm_tmp "$T"; }
trap cleanup EXIT

mkdir -p "$REPO/shared/data/sub" "$REPO/src"
git -C "$REPO" init -q
echo seed > "$REPO/README"
git -C "$REPO" add README
git -C "$REPO" -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false commit -qm seed
git -C "$REPO" worktree add -q "$WT" -b w1
echo keep > "$REPO/shared/data/sub/keep.txt"
echo src > "$REPO/src/a.txt"
ln -s "$REPO/shared" "$WT/extracted"

run(){ OUT=$(cd "$1" && shift && "$TOOL" "$@" 2>&1); RC=$?; }

test_no_list_exits_2(){
  run "$REPO" status
  [ "$RC" -eq 2 ] && grep -q '.zai-fence-readonly' <<<"$OUT" \
    && ok "no_list_exits_2" || no "no_list_exits_2: rc=$RC out=$OUT"
}

test_lock_blocks_delete_through_symlink(){
  printf '# shared data\nshared\n' > "$REPO/.zai-fence-readonly"
  run "$WT" lock
  [ "$RC" -eq 0 ] && ok "lock_from_worktree_rc0" || no "lock_from_worktree_rc0: rc=$RC out=$OUT"
  rm -rf "$WT/extracted/data" 2>/dev/null
  [ -f "$REPO/shared/data/sub/keep.txt" ] && ok "delete_via_symlink_blocked" \
    || no "delete_via_symlink_blocked: keep.txt gone"
  echo x > "$REPO/src/b.txt" 2>/dev/null
  [ -f "$REPO/src/b.txt" ] && ok "unlisted_paths_stay_writable" || no "unlisted_paths_stay_writable"
  run "$REPO" status
  [ "$RC" -eq 0 ] && grep -q 'locked.*shared' <<<"$OUT" \
    && ok "status_reports_locked" || no "status_reports_locked: rc=$RC out=$OUT"
}

test_unlock_restores_writes(){
  run "$REPO" unlock
  echo y > "$REPO/shared/data/sub/new.txt" 2>/dev/null
  [ "$RC" -eq 0 ] && [ -f "$REPO/shared/data/sub/new.txt" ] \
    && ok "unlock_restores_writes" || no "unlock_restores_writes: rc=$RC out=$OUT"
  run "$REPO" status
  grep -q 'unlocked.*shared' <<<"$OUT" && ok "status_reports_unlocked" || no "status_reports_unlocked: out=$OUT"
}

test_refuses_unsafe_entries(){
  local e
  for e in "." "/" "$HOME" "../outside"; do
    printf '%s\n' "$e" > "$REPO/.zai-fence-readonly"
    run "$REPO" lock
    [ "$RC" -eq 1 ] && ok "refuses_entry:$e" || no "refuses_entry:$e rc=$RC out=$OUT"
  done
  touch "$REPO/src/still-writable" 2>/dev/null && ok "refused_lock_changed_nothing" \
    || no "refused_lock_changed_nothing"
}

test_missing_entry_reported(){
  printf 'nope\nshared\n' > "$REPO/.zai-fence-readonly"
  run "$REPO" status
  grep -q 'missing.*nope' <<<"$OUT" && ok "missing_entry_reported" || no "missing_entry_reported: out=$OUT"
}

test_no_list_exits_2
test_lock_blocks_delete_through_symlink
test_unlock_restores_writes
test_refuses_unsafe_entries
test_missing_entry_reported

echo "readonly-data: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
