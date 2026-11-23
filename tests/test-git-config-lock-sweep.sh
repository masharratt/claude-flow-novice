#!/usr/bin/env bash
# tests/test-git-config-lock-sweep.sh
# cfn-git-config-lock-sweep.sh :: PreToolUse(Bash) hook that removes the stale
# 0-byte read-only <common-dir>/config.lock left by Claude Code's bwrap sandbox
# (it ro-binds /dev/null there for worktree sessions and leaves a 0444 mount-point
# file on the host, which breaks `git worktree add` / `git config` writes).
# Removes ONLY: regular file, size 0, no write bit for anyone, owned by us.
# Never blocks (exit 0 always).
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
HOOK="$PROJECT_ROOT/.claude/hooks/cfn-git-config-lock-sweep.sh"

T=$(mktemp -d "${TMPDIR:-/tmp}/lock-sweep.XXXXXX") || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1
trap 'cfn_safe_rm_tmp "$T"' EXIT

pass=0; fail=0
ok()  { pass=$((pass+1)); }
bad() { fail=$((fail+1)); echo "FAIL: $*"; }

mkrepo() { git init -q "$1" && git -C "$1" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init; }
# run <cwd> <command>  -> sets RC and ERR
run() {
  local cwd=$1 cmd=$2
  ERR=$(python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","cwd":sys.argv[1],"tool_input":{"command":sys.argv[2]}}))' "$cwd" "$cmd" \
    | bash "$HOOK" 2>&1 >/dev/null) && RC=0 || RC=$?
}
mklock() { rm -f "$1/.git/config.lock"; : > "$1/.git/config.lock"; chmod "${2:-444}" "$1/.git/config.lock"; }
gone()   { [ ! -e "$1/.git/config.lock" ]; }

A="$T/a"; B="$T/b"; mkrepo "$A"; mkrepo "$B"

# 1. 0-byte 0444 lock removed before git worktree add
mklock "$A"; run "$A" "git worktree add ../wt -b feat"
[ "$RC" = 0 ] && gone "$A" && ok || bad "worktree add: lock should be removed (rc=$RC)"
case "$ERR" in *config.lock*) ok ;; *) bad "expected one stderr line naming config.lock, got: $ERR" ;; esac
[ "$(printf '%s\n' "$ERR" | grep -c .)" = 1 ] && ok || bad "stderr should be exactly one line"

# 2. non-empty lock kept
mklock "$A" 644; echo data > "$A/.git/config.lock"; chmod 444 "$A/.git/config.lock"
run "$A" "git worktree add ../wt2"
[ "$RC" = 0 ] && [ -e "$A/.git/config.lock" ] && ok || bad "non-empty lock must be kept"
rm -f "$A/.git/config.lock"

# 3. writable 0-byte lock kept (real git lock in progress)
mklock "$A" 644; run "$A" "git config user.name x"
[ "$RC" = 0 ] && [ -e "$A/.git/config.lock" ] && ok || bad "writable lock must be kept"
chmod 600 "$A/.git/config.lock"; run "$A" "git config user.name x"
[ -e "$A/.git/config.lock" ] && ok || bad "owner-writable (0600) lock must be kept"
chmod 464 "$A/.git/config.lock"; run "$A" "git config user.name x"
[ -e "$A/.git/config.lock" ] && ok || bad "other-writable (0464) lock must be kept"
rm -f "$A/.git/config.lock"

# 4. read-only commands do nothing
mklock "$A"
for c in "git status" "git config --get user.name" "git config --list" "git config -l" "git worktree list" "git log" "git remote -v" "git branch" "echo git worktree add"; do
  run "$A" "$c"
  [ "$RC" = 0 ] && [ -e "$A/.git/config.lock" ] && ok || bad "read-only must not sweep: $c"
done

# 5. git -C other targets the other repo
mklock "$A"; mklock "$B"
run "$A" "git -C $B worktree add $T/wt3"
gone "$B" && [ -e "$A/.git/config.lock" ] && ok || bad "git -C must sweep only the target repo"
rm -f "$A/.git/config.lock"

# 6. cd X && git ... targets X
mklock "$B"; run "$T" "cd $B && git remote add o https://example.invalid/x.git"
gone "$B" && ok || bad "cd X && git remote add must sweep X"
mklock "$B"; run "$A" "cd ../b && git config user.email q@q"
gone "$B" && ok || bad "relative cd must resolve from cwd"

# 7. worktree: lock lives in common dir, hook run from linked worktree
git -C "$A" worktree add -q "$T/linked" -b linked
mklock "$A"; run "$T/linked" "git config core.x y"
gone "$A" && ok || bad "linked worktree cwd must sweep the common dir lock"

# 8. other write commands in the documented list
for c in "git worktree remove x" "git worktree prune" "git config --global foo.bar 1" "git config --unset a.b" "git remote set-url o u" \
         "git branch --set-upstream-to=o/m" "git branch -u o/m" "git submodule add u p" "git submodule update --init" "FOO=1 git config a.b c"; do
  mklock "$A"; run "$A" "$c"
  gone "$A" && ok || bad "should sweep for: $c"
done

# 8b. gg-desk 2026-11-23 (VPS): the lock also blocked 'git push -u' (writes upstream config)
# and a wrapper script (wt:done) that runs git worktree remove inside; the hook never saw a
# git subcommand there. Push with -u counts as a config write; a non-git program in a repo
# (it may run git itself) sweeps its working folder.
for c in "git push -u origin feat" "git push --set-upstream origin feat" "npm run wt:done" "bash scripts/wt-done.sh feat" "cd $A && make land"; do
  mklock "$A"; run "$A" "$c"
  gone "$A" && ok || bad "should sweep for: $c"
done
for c in "git push origin feat" "ls -la" "cat README" "grep -r x ." "printf x"; do
  mklock "$A"; run "$A" "$c"
  [ -e "$A/.git/config.lock" ] && ok || bad "must not sweep for: $c"
done
rm -f "$A/.git/config.lock"

# 9. not a repo / missing cwd: exit 0, silent
run "$T" "git config a.b c"; [ "$RC" = 0 ] && [ -z "$ERR" ] && ok || bad "non-repo cwd must be silent rc0"
run "$T/nope" "git config a.b c"; [ "$RC" = 0 ] && ok || bad "missing cwd must rc0"
printf 'not json' | bash "$HOOK" >/dev/null 2>&1 && ok || bad "garbage stdin must rc0"
# non-Bash tool ignored
mklock "$A"; python3 -c 'import json;print(json.dumps({"tool_name":"Edit","cwd":"'"$A"'","tool_input":{"command":"git config a b"}}))' | bash "$HOOK" >/dev/null 2>&1
[ -e "$A/.git/config.lock" ] && ok || bad "non-Bash tool must be ignored"
rm -f "$A/.git/config.lock"

# 10. symlink lock kept
ln -s /dev/null "$A/.git/config.lock"; run "$A" "git config a.b c"
[ -L "$A/.git/config.lock" ] && ok || bad "symlink lock must be kept"
rm -f "$A/.git/config.lock"

echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
