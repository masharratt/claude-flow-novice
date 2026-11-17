#!/usr/bin/env bash
# tests/test-tooling-idea.sh
# Tooling-idea recorder (.claude/cfn-scripts/cfn-tooling-idea.sh): add/list a
# markdown table of tooling ideas at <main checkout>/.claude/tooling-ideas.md.
# Worktree lanes write to the main checkout's file. Dedupes open ideas.
# Exit codes: 0 ok (incl. already recorded), 2 usage error.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOL="$ROOT/.claude/cfn-scripts/cfn-tooling-idea.sh"
# shellcheck disable=SC1091
source "$ROOT/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1

TMP=$(mktemp -d "${TMPDIR:-/tmp}/tooling-idea-test-XXXXXX") || exit 1
PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }
trap 'cfn_safe_rm_tmp "$TMP"' EXIT
unset CLAUDE_CODE_SESSION_ID MAILBOX_SESSION 2>/dev/null || true

command -v git >/dev/null 2>&1 || { echo "FATAL: git not on PATH"; exit 1; }
[ -x "$TOOL" ] || { echo "FATAL: $TOOL missing or not executable"; exit 1; }

REPO="$TMP/repo"; WT="$TMP/wt"
mkdir -p "$REPO/sub/dir" && git -C "$REPO" init -q
git -C "$REPO" -c user.email=t@t -c user.name=t commit --allow-empty -qm init
git -C "$REPO" worktree add -q "$WT" -b lane >/dev/null 2>&1
F="$REPO/.claude/tooling-ideas.md"
rows(){ grep -c '^| [0-9]\{4\}-' "$1" 2>/dev/null || true; }
run(){ ( cd "$1" && shift && "$TOOL" "$@" ) >"$TMP/out.txt" 2>"$TMP/err.txt"; }

# 1. add creates the file under the main checkout .claude/ ----------------------------
run "$REPO" add "Script the capture reload" --saves "10 min per run" --evidence "reloaded wrong data 3 times"; RC=$?
[ "$RC" -eq 0 ] && ok "add exits 0" || no "add rc=$RC err=$(cat "$TMP/err.txt")"
[ -f "$F" ] && ok "file created at <main>/.claude/tooling-ideas.md" || no "file missing at $F"
head -1 "$F" | grep -q '^#' && grep -q '^| Date | Session | Idea | Saves | Evidence | Status |' "$F" \
    && ok "file has a title and table header" || no "header missing: $(head -5 "$F")"
[ "$(rows "$F")" -eq 1 ] && ok "one row after one add" || no "row count $(rows "$F")"
grep -q 'Script the capture reload' "$F" && grep -q '10 min per run' "$F" && grep -q 'reloaded wrong data 3 times' "$F" \
    && ok "idea, saves and evidence recorded" || no "fields missing: $(cat "$F")"
grep -qE '^\| [0-9]{4}-[0-9]{2}-[0-9]{2} \|' "$F" && ok "row starts with an ISO date" || no "no ISO date"
grep -q '| open |$' "$F" && ok "new row status is open" || no "status not open"

# 2. dedupe -------------------------------------------------------------------------------
run "$REPO" add "Script the capture reload"
grep -q "already recorded" "$TMP/out.txt" && [ "$(rows "$F")" -eq 1 ] && ok "exact duplicate: 'already recorded', no new row" || no "dup not skipped: $(cat "$TMP/out.txt")"
run "$REPO" add "  SCRIPT THE capture RELOAD "
grep -q "already recorded" "$TMP/out.txt" && [ "$(rows "$F")" -eq 1 ] && ok "case-insensitive duplicate skipped" || no "case dup not skipped"
run "$REPO" add "Script the capture reload"; [ $? -eq 0 ] && ok "duplicate exits 0" || no "duplicate rc nonzero"
run "$REPO" add "A different idea"
[ "$(rows "$F")" -eq 2 ] && ok "distinct idea adds a row" || no "distinct idea rows=$(rows "$F")"
sed -i 's/^\(| [0-9-]* | [^|]* | A different idea .*\)| open |$/\1| done |/' "$F"
run "$REPO" add "A different idea"
[ "$(rows "$F")" -eq 3 ] && ok "closed (done) row does not block a new add" || no "closed dedupe rows=$(rows "$F")"

# 3. worktree and subdirectory write to the main file -------------------------------------
BEFORE=$(rows "$F")
run "$WT" add "Idea from a worktree lane"
[ "$(rows "$F")" -eq $((BEFORE+1)) ] && [ ! -e "$WT/.claude/tooling-ideas.md" ] && ok "worktree writes to the main checkout file" || no "worktree wrote elsewhere: $(ls "$WT/.claude" 2>&1)"
run "$REPO/sub/dir" add "Idea from a subdirectory"
[ ! -e "$REPO/sub/dir/.claude" ] && grep -q 'Idea from a subdirectory' "$F" && ok "subdirectory writes to the main file" || no "subdir wrote elsewhere"
run "$WT" add "Script the capture reload"
grep -q "already recorded" "$TMP/out.txt" && ok "dedupe works across worktree and main" || no "cross-worktree dedupe failed"

# 4. pipes, newlines, session id ------------------------------------------------------------
run "$REPO" add 'Pick a|b in one step' --saves 'x|y' --evidence $'line1\nline2'
COLS=$(grep 'Pick a' "$F" | awk '{ s=$0; gsub(/\\\|/, "", s); n=gsub(/\|/, "|", s); print n }')
[ "$COLS" -eq 7 ] && ok "pipes escaped: row still has 6 columns" || no "column pipes=$COLS row=$(grep 'Pick a' "$F")"
[ "$(grep -c 'Pick a' "$F")" -eq 1 ] && ok "newline in a field does not split the row" || no "row split by newline"
run "$REPO" add 'Pick a|b in one step'
grep -q "already recorded" "$TMP/out.txt" && ok "idea with pipe dedupes" || no "pipe idea not deduped"
( cd "$REPO" && CLAUDE_CODE_SESSION_ID=abcdef12-3456-7890 "$TOOL" add "Session tagged idea" ) >/dev/null 2>&1
grep 'Session tagged idea' "$F" | grep -q '| abcdef12 |' && ok "session column = first 8 chars of CLAUDE_CODE_SESSION_ID" || no "session id wrong: $(grep 'Session tagged' "$F")"
( cd "$REPO" && MAILBOX_SESSION=mdtwii-master "$TOOL" add "Mailbox tagged idea" ) >/dev/null 2>&1
grep 'Mailbox tagged idea' "$F" | grep -q '| mdtwii-master |' && ok "session falls back to MAILBOX_SESSION" || no "mailbox session wrong"
run "$REPO" add "No session idea"
grep 'No session idea' "$F" | grep -q '| - |' && ok "no session: '-' placeholder" || no "placeholder missing"
run "$REPO" add "No extras idea"
grep 'No extras idea' "$F" | grep -q '| - | - | open |$' && ok "missing saves/evidence rendered as '-'" || no "defaults wrong: $(grep 'No extras' "$F")"

# 5. list ---------------------------------------------------------------------------------------
run "$REPO" list
grep -q 'Script the capture reload' "$TMP/out.txt" && ! grep -q '| done |' "$TMP/out.txt" \
    && ok "list shows open rows only" || no "list wrong: $(cat "$TMP/out.txt")"
run "$REPO" list --all
grep -q '| done |' "$TMP/out.txt" && grep -q 'Script the capture reload' "$TMP/out.txt" && ok "list --all shows closed rows too" || no "list --all wrong"
run "$WT" list
grep -q 'Script the capture reload' "$TMP/out.txt" && ok "list from a worktree reads the main file" || no "worktree list empty"
EMPTY="$TMP/empty-repo"; mkdir -p "$EMPTY" && git -C "$EMPTY" init -q
run "$EMPTY" list; RC=$?
[ "$RC" -eq 0 ] && grep -qi "no tooling ideas" "$TMP/out.txt" && ok "list with no file: friendly message, exit 0" || no "empty list rc=$RC out=$(cat "$TMP/out.txt")"

# 6. outside git ----------------------------------------------------------------------------------
NOGIT="$TMP/nogit"; mkdir -p "$NOGIT"
run "$NOGIT" add "Idea outside git"
[ -f "$NOGIT/.claude/tooling-ideas.md" ] && ok "outside git: file under \$PWD/.claude" || no "no-git file missing"

# 7. usage errors ------------------------------------------------------------------------------------
run "$REPO" add; RC=$?
[ "$RC" -eq 2 ] && ok "add without idea: exit 2" || no "empty add rc=$RC"
run "$REPO" add "   "; RC=$?
[ "$RC" -eq 2 ] && ok "blank idea: exit 2" || no "blank add rc=$RC"
run "$REPO" bogus; RC=$?
[ "$RC" -eq 2 ] && ok "unknown subcommand: exit 2" || no "bogus rc=$RC"
run "$REPO"; RC=$?
[ "$RC" -eq 2 ] && grep -qi usage "$TMP/err.txt" && ok "no subcommand: usage on stderr, exit 2" || no "no-arg rc=$RC"
run "$REPO" add "Flag value missing" --saves; RC=$?
[ "$RC" -eq 2 ] && ok "flag without value: exit 2" || no "dangling flag rc=$RC"

echo
echo "tooling-idea: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
