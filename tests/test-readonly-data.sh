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
  cfn_safe_rm_tmp "$WT/extracted/data" 2>/dev/null   # resolves the link; the lock must still refuse
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

# Claude sandbox mirror: lock/unlock keep <root>/.claude/settings.local.json
# .sandbox.filesystem.denyWrite in step with the chmod lock.
SETTINGS="$REPO/.claude/settings.local.json"
deny(){ jq -c '.sandbox.filesystem.denyWrite' "$SETTINGS" 2>/dev/null; }

test_lock_adds_denywrite_preserving_keys(){
  printf 'shared\n' > "$REPO/.zai-fence-readonly"
  chmod -R u+w "$REPO/shared"
  mkdir -p "$REPO/.claude"
  echo '{"permissions":{"allow":["Bash(ls)"]},"sandbox":{"enabled":true,"filesystem":{"denyWrite":["/keep/me"]}}}' > "$SETTINGS"
  run "$REPO" lock
  [ "$RC" -eq 0 ] && [ "$(deny)" = "[\"/keep/me\",\"$REPO/shared\"]" ] \
    && ok "lock_adds_denywrite" || no "lock_adds_denywrite: rc=$RC deny=$(deny) out=$OUT"
  [ "$(jq -r '.permissions.allow[0]' "$SETTINGS")" = "Bash(ls)" ] && [ "$(jq -r '.sandbox.enabled' "$SETTINGS")" = "true" ] \
    && ok "lock_preserves_other_keys" || no "lock_preserves_other_keys"
}

test_relock_no_duplicates(){
  run "$REPO" lock
  [ "$RC" -eq 0 ] && [ "$(jq '[.sandbox.filesystem.denyWrite[] | select(. == "'"$REPO/shared"'")] | length' "$SETTINGS")" = "1" ] \
    && ok "relock_no_duplicates" || no "relock_no_duplicates: rc=$RC deny=$(deny)"
}

test_unlock_removes_only_its_paths(){
  run "$REPO" unlock
  [ "$RC" -eq 0 ] && [ "$(deny)" = '["/keep/me"]' ] \
    && ok "unlock_removes_entries" || no "unlock_removes_entries: rc=$RC deny=$(deny) out=$OUT"
}

test_lock_creates_settings_when_absent(){
  rm -f "$SETTINGS"
  run "$REPO" lock
  [ "$RC" -eq 0 ] && [ "$(deny)" = "[\"$REPO/shared\"]" ] \
    && ok "lock_creates_settings_file" || no "lock_creates_settings_file: rc=$RC deny=$(deny) out=$OUT"
  run "$REPO" unlock
}

test_unwritable_settings_exits_3_chmod_applied(){
  echo '{}' > "$SETTINGS"
  chmod a-w "$SETTINGS"
  run "$REPO" lock
  local locked=no
  [ -z "$(find "$REPO/shared" -perm -u+w -print -quit)" ] && locked=yes
  [ "$RC" -eq 3 ] && [ "$locked" = yes ] && grep -qi 'sandbox' <<<"$OUT" \
    && ok "unwritable_settings_exit3_chmod_applied" || no "unwritable_settings_exit3_chmod_applied: rc=$RC locked=$locked out=$OUT"
  chmod u+w "$SETTINGS"; run "$REPO" unlock
}

test_no_list_exits_2
test_lock_blocks_delete_through_symlink
test_unlock_restores_writes
test_refuses_unsafe_entries
test_missing_entry_reported
test_lock_adds_denywrite_preserving_keys
test_relock_no_duplicates
test_unlock_removes_only_its_paths
test_lock_creates_settings_when_absent
test_unwritable_settings_exits_3_chmod_applied

echo "readonly-data: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
