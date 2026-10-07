#!/usr/bin/env bash
# tests/test-pre-edit-backup-hook.sh
# cfn-pre-edit-backup-hook.sh :: automatic backup before Edit/Write.
#
# The hook reads the PreToolUse JSON payload, backs up an existing file inside
# a git repo via cfn-invoke-pre-edit.sh into <repo>/.backups/claude-<session>/,
# makes sure .backups/ is ignored by that repo, and never blocks an edit.
set -uo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
HOOK="$PROJECT_ROOT/.claude/hooks/cfn-pre-edit-backup-hook.sh"

T=$(mktemp -d "${TMPDIR:-/tmp}/pre-edit-hook.XXXXXX")
T=$(cd "$T" && pwd -P)
trap 'rm -rf "$T"' EXIT
REPO="$T/repo"; OUTSIDE="$T/outside"
mkdir -p "$REPO/src" "$OUTSIDE"
( cd "$REPO" && git init -q && echo original > src/a.txt )
echo loose > "$OUTSIDE/b.txt"

pass=0; fail=0
check() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1"; fi; }
fire() { # tool file_key path
  python3 -c 'import json,sys; print(json.dumps({"session_id":"s1","tool_name":sys.argv[1],"tool_input":{sys.argv[2]:sys.argv[3]}}))' "$1" "$2" "$3" \
    | (cd "$REPO" && bash "$HOOK" >/dev/null 2>&1); echo $?
}

rc=$(fire Edit file_path "$REPO/src/a.txt")
check "edit exits 0"                      '[ "$rc" = 0 ]'
B=$(find "$REPO/.backups/claude-s1" -name original 2>/dev/null | head -1)
check "existing file backed up"           '[ -n "$B" ] && [ "$(cat "$B")" = original ]'
check ".backups ignored by the repo"      '(cd "$REPO" && git check-ignore -q .backups/x)'
check "no .gitignore change"              '[ ! -f "$REPO/.gitignore" ]'

rc=$(fire Write file_path "$REPO/src/new.txt")
check "new file exits 0"                  '[ "$rc" = 0 ]'
check "new file makes no backup"          '[ "$(find "$REPO/.backups" -name original | wc -l | tr -d " ")" = 1 ]'

rc=$(fire Edit file_path "$OUTSIDE/b.txt")
check "outside a repo exits 0"            '[ "$rc" = 0 ]'
check "outside a repo makes no backup"    '[ ! -d "$OUTSIDE/.backups" ]'

rc=$(fire NotebookEdit notebook_path "$REPO/src/a.txt")
check "notebook path backed up"           '[ "$(find "$REPO/.backups" -name original | wc -l | tr -d " ")" = 2 ]'

rc=$(printf 'not json' | (cd "$REPO" && bash "$HOOK" >/dev/null 2>&1); echo $?)
check "bad payload never blocks"          '[ "$rc" = 0 ]'

echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
