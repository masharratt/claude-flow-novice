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
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp

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

# Out-of-repo real paths: accepted only under a root listed in
# <repo>/.zai-fence-readonly-roots (one absolute folder per line).
OUT_ROOT="$T/outside"; FAKEHOME="$T/fakehome"
mkdir -p "$OUT_ROOT/data/sub" "$OUT_ROOT/other" "$FAKEHOME/data"
echo k > "$OUT_ROOT/data/sub/k.txt"; echo k > "$OUT_ROOT/other/k.txt"; echo k > "$FAKEHOME/data/k.txt"
ROOTS="$REPO/.zai-fence-readonly-roots"
writable(){ [ -n "$(find "$1" -perm -u+w -print -quit 2>/dev/null)" ]; }

test_outside_unlisted_refused(){
  rm -f "$ROOTS"; chmod -R u+w "$OUT_ROOT"
  printf '%s\n' "$OUT_ROOT/data" > "$REPO/.zai-fence-readonly"
  run "$REPO" lock
  [ "$RC" -eq 1 ] && writable "$OUT_ROOT/data" && ok "outside_unlisted_refused" \
    || no "outside_unlisted_refused: rc=$RC out=$OUT"
}

test_outside_listed_locked(){
  printf '# roots\n\n%s\n' "$OUT_ROOT" > "$ROOTS"
  rm -f "$SETTINGS"
  run "$REPO" lock
  [ "$RC" -eq 0 ] && ! writable "$OUT_ROOT/data" && [ "$(deny)" = "[\"$OUT_ROOT/data\"]" ] \
    && ok "outside_listed_locked_and_denywrite" || no "outside_listed_locked: rc=$RC deny=$(deny) out=$OUT"
  run "$REPO" status
  [ "$RC" -eq 0 ] && grep -q 'locked' <<<"$OUT" && ok "outside_listed_status_locked" || no "outside_listed_status: rc=$RC out=$OUT"
  run "$REPO" unlock
  [ "$RC" -eq 0 ] && writable "$OUT_ROOT/data" && ok "outside_listed_unlock" || no "outside_listed_unlock: rc=$RC out=$OUT"
}

test_outside_other_root_entry_refused(){
  printf '%s\n' "$OUT_ROOT/other" > "$REPO/.zai-fence-readonly"
  printf '%s\n' "$OUT_ROOT/data" > "$ROOTS"
  run "$REPO" lock
  [ "$RC" -eq 1 ] && writable "$OUT_ROOT/other" && ok "outside_every_root_refused" || no "outside_every_root_refused: rc=$RC out=$OUT"
}

test_home_refused_even_if_listed(){
  printf '%s\n' "$FAKEHOME" > "$ROOTS"
  local e
  for e in "$FAKEHOME" "$FAKEHOME/data"; do
    printf '%s\n' "$e" > "$REPO/.zai-fence-readonly"
    OUT=$(cd "$REPO" && HOME="$FAKEHOME" "$TOOL" lock 2>&1); RC=$?
    [ "$RC" -eq 1 ] && writable "$FAKEHOME/data" && ok "home_refused_even_if_listed:${e#"$T"/}" \
      || no "home_refused_even_if_listed:$e rc=$RC out=$OUT"
  done
}

test_repo_root_and_slash_refused_as_roots(){
  local r
  for r in "/" "$REPO"; do
    printf '%s\n' "$r" > "$ROOTS"
    printf '%s\n' "$OUT_ROOT/data" > "$REPO/.zai-fence-readonly"
    run "$REPO" lock
    [ "$RC" -eq 1 ] && writable "$OUT_ROOT/data" && ok "root_refused:$r" || no "root_refused:$r rc=$RC out=$OUT"
  done
}

test_two_entries_one_bad_changes_nothing(){
  printf '%s\n' "$OUT_ROOT" > "$ROOTS"
  printf '%s\n%s\n' "$OUT_ROOT/data" "$T" > "$REPO/.zai-fence-readonly"
  rm -f "$SETTINGS"
  run "$REPO" lock
  [ "$RC" -eq 1 ] && writable "$OUT_ROOT/data" && [ ! -e "$SETTINGS" ] \
    && ok "two_entries_one_bad_changes_nothing" || no "two_entries_one_bad: rc=$RC out=$OUT"
  rm -f "$ROOTS"
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
test_outside_unlisted_refused
test_outside_listed_locked
test_outside_other_root_entry_refused
test_home_refused_even_if_listed
test_repo_root_and_slash_refused_as_roots
test_two_entries_one_bad_changes_nothing

echo "readonly-data: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
