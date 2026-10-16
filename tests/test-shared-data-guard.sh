#!/usr/bin/env bash
# tests/test-shared-data-guard.sh
# SessionStart hook cfn-shared-data-guard.sh: warns when a symlink in a worktree
# (or the main checkout) points at shared data that is not on the read-only list
# (.zai-fence-readonly) or is listed but still writable. Silent when clean.
# Incident: MDTWII 2026-10-16, a test cleanup wiped 7.5 GB through
# worktree/extracted -> main/extracted.
set -uo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
set +e
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp

HOOK="$PROJECT_ROOT/.claude/hooks/cfn-shared-data-guard.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/shared-data-guard-test-XXXXXX") || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1
REPO="$T/repo"; WT="$REPO/.claude/worktrees/w1"

PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }

cleanup(){ chmod -R u+w "$T" 2>/dev/null; cfn_safe_rm_tmp "$T"; }
trap cleanup EXIT

mkdir -p "$REPO/shared/data" "$T/other-repo" "$T/plain"
echo big > "$REPO/shared/data/big.bin"
git -C "$REPO" init -q
echo seed > "$REPO/README"
git -C "$REPO" add README
git -C "$REPO" -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false commit -qm seed
# shared data is untracked and git-ignored, like MDTWII extracted/
echo "shared/" > "$REPO/.gitignore"
git -C "$REPO" worktree add -q "$WT" -b w1
git -C "$T/other-repo" init -q

run(){ OUT=$(cd "$1" && echo '{}' | "$HOOK" 2>/dev/null); RC=$?; }

reset(){
  chmod -R u+w "$REPO/shared" 2>/dev/null
  rm -f "$REPO/.zai-fence-readonly" "$WT/extracted" "$WT/code"
  cfn_safe_rm_tmp "$T/other-repo/src"; cfn_safe_rm_tmp "$T/other-repo/cache"; rm -f "$T/other-repo/.gitignore"
  git -C "$T/other-repo" rm -rq --cached . 2>/dev/null
}

test_unprotected_link_warns(){
  reset
  ln -s "$REPO/shared" "$WT/extracted"
  run "$WT"
  [ "$RC" -eq 0 ] && grep -q 'extracted' <<<"$OUT" && grep -q 'zai-fence-readonly' <<<"$OUT" \
    && grep -q 'readonly-data.sh lock' <<<"$OUT" \
    && ok "unprotected_link_warns" || no "unprotected_link_warns: rc=$RC out=$OUT"
}

test_output_is_valid_json(){
  reset
  ln -s "$REPO/shared" "$WT/extracted"
  run "$REPO"
  local ev ctx
  ev=$(jq -r '.hookSpecificOutput.hookEventName' <<<"$OUT" 2>/dev/null)
  ctx=$(jq -r '.hookSpecificOutput.additionalContext' <<<"$OUT" 2>/dev/null)
  [ "$ev" = "SessionStart" ] && [ -n "$ctx" ] && [ "$ctx" != "null" ] \
    && ok "output_is_valid_json" || no "output_is_valid_json: ev=$ev out=$OUT"
}

test_listed_and_locked_is_silent(){
  reset
  ln -s "$REPO/shared" "$WT/extracted"
  echo shared > "$REPO/.zai-fence-readonly"
  chmod -R a-w "$REPO/shared"
  run "$WT"
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] && ok "listed_and_locked_is_silent" \
    || no "listed_and_locked_is_silent: rc=$RC out=$OUT"
  chmod -R u+w "$REPO/shared"
}

test_listed_but_unlocked_warns(){
  reset
  ln -s "$REPO/shared" "$WT/extracted"
  echo shared > "$REPO/.zai-fence-readonly"
  run "$WT"
  [ "$RC" -eq 0 ] && grep -q 'shared' <<<"$OUT" && grep -q 'readonly-data.sh lock' <<<"$OUT" \
    && ok "listed_but_unlocked_warns" || no "listed_but_unlocked_warns: rc=$RC out=$OUT"
}

test_link_to_other_git_repo_is_silent(){
  reset
  ln -s "$T/other-repo" "$WT/code"
  run "$WT"
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] && ok "link_to_git_repo_is_silent" \
    || no "link_to_git_repo_is_silent: rc=$RC out=$OUT"
}

test_link_inside_own_checkout_is_silent(){
  reset
  mkdir -p "$WT/local-dir"
  ln -s "$WT/local-dir" "$WT/alias"
  run "$WT"
  rm -f "$WT/alias"
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] && ok "link_inside_own_checkout_is_silent" \
    || no "link_inside_own_checkout_is_silent: rc=$RC out=$OUT"
}

test_not_a_git_repo_is_silent(){
  reset
  ln -s "$REPO/shared" "$T/plain/extracted"
  run "$T/plain"
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] && ok "not_a_git_repo_is_silent" \
    || no "not_a_git_repo_is_silent: rc=$RC out=$OUT"
}

test_link_to_parent_of_listed_child_is_silent(){
  # MDTWII: extracted -> main/extracted, list holds extracted/data (owner reviewed it)
  reset
  ln -s "$REPO/shared" "$WT/extracted"
  echo shared/data > "$REPO/.zai-fence-readonly"
  chmod -R a-w "$REPO/shared/data"
  run "$WT"
  chmod -R u+w "$REPO/shared/data"
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] && ok "parent_of_listed_child_is_silent" \
    || no "parent_of_listed_child_is_silent: rc=$RC out=$OUT"
}

test_link_to_tracked_subdir_of_repo_is_silent(){
  # MDTWII: rev-ws483/game -> MDTWII/game is tracked source, restorable
  reset
  mkdir -p "$T/other-repo/src"
  echo c > "$T/other-repo/src/a.txt"
  git -C "$T/other-repo" add src/a.txt
  ln -s "$T/other-repo/src" "$WT/code"
  run "$WT"
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] && ok "tracked_subdir_of_repo_is_silent" \
    || no "tracked_subdir_of_repo_is_silent: rc=$RC out=$OUT"
}

test_link_to_ignored_dir_of_repo_warns(){
  reset
  mkdir -p "$T/other-repo/cache"
  echo c > "$T/other-repo/cache/big.bin"
  echo 'cache/' > "$T/other-repo/.gitignore"
  ln -s "$T/other-repo/cache" "$WT/code"
  run "$WT"
  [ "$RC" -eq 0 ] && grep -q 'cache' <<<"$OUT" \
    && ok "ignored_dir_of_repo_warns" || no "ignored_dir_of_repo_warns: rc=$RC out=$OUT"
}

test_long_list_is_capped(){
  reset
  local i
  for i in 1 2 3 4 5 6 7; do mkdir -p "$T/many/d$i"; ln -s "$T/many/d$i" "$WT/l$i"; done
  run "$WT"
  rm -f "$WT"/l[1-7]
  [ "$RC" -eq 0 ] && grep -q 'and 2 more' <<<"$OUT" && [ "$(grep -c -- '-> ' <<<"$OUT")" -le 5 ] \
    && ok "long_list_is_capped" || no "long_list_is_capped: rc=$RC out=$OUT"
}

test_unprotected_link_warns
test_output_is_valid_json
test_listed_and_locked_is_silent
test_listed_but_unlocked_warns
test_link_to_other_git_repo_is_silent
test_link_inside_own_checkout_is_silent
test_not_a_git_repo_is_silent
test_link_to_parent_of_listed_child_is_silent
test_link_to_tracked_subdir_of_repo_is_silent
test_link_to_ignored_dir_of_repo_warns
test_long_list_is_capped

echo "shared-data-guard: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
