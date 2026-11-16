#!/usr/bin/env bash
# Regression test: cfn-restore-from-backup.sh restored a WEEKS-OLD backup.
#
# Bug (2026-11-15): a helper edited .claude/hooks/cfn-careful-guard.sh through
# Bash (a python heredoc), so the pre-edit backup hook, which only fires on
# Edit/Write/MultiEdit/NotebookEdit, took no backup. The file had backups in
# several agent dirs (gnu-port, WS04, hook, ...), the newest from 2026-09-22.
# The restore tool took "newest backup, any age" and wrote that 2026-09-22
# copy over the file, rolling back weeks of committed work. Its own
# restore-safety copy of the bad state then became the newest backup, so a
# second run would have "restored" the helper's edit. It also took 2+ minutes
# because it scanned every backup twice (list, then restore), which looked
# like a hang on a prompt.
#
# Contract under test:
#   T1 multiple backups of one file across agent dirs: restore picks the most
#      recent PRE-EDIT original, never a restore-safety copy.
#   T2 newest pre-edit backup predates the file's last commit: refuse, exit 3,
#      file untouched (that backup cannot be the pre-edit state of the
#      current uncommitted edit).
#   T3 --force restores it anyway.
#   T4 never prompts: no tty, stdin closed, finishes well inside a timeout.
#   T5 --help prints usage instead of searching for a file named "--help".
#
# Run: bash tests/test-restore-picks-latest-preedit.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESTORE="$REPO_ROOT/.claude/hooks/cfn-restore-from-backup.sh"

source "$REPO_ROOT/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
SCRATCH=$(mktemp -d /tmp/restore-latest-test-XXXXXX) || exit 1
trap 'cfn_safe_rm_tmp "$SCRATCH"' EXIT

PASS=0
FAIL=0
ok()  { printf '  PASS %s\n' "$1"; PASS=$((PASS + 1)); }
bad() { printf '  FAIL %s\n' "$1"; FAIL=$((FAIL + 1)); }

# make_backup <backups_root> <agent> <ts> <content> <original_file>
# Writes the exact layout backup.sh produces, with a chosen timestamp.
make_backup() {
    local root="$1" agent="$2" ts="$3" content="$4" orig="$5"
    local hash dir
    hash=$(printf '%s\n' "$content" | md5sum | cut -d' ' -f1)
    dir="$root/$agent/${ts}_${hash}"
    mkdir -p "$dir"
    printf '%s\n' "$content" > "$dir/original"
    cat > "$dir/metadata.json" <<EOF
{
  "timestamp": "$ts",
  "agent_id": "$agent",
  "original_file": "$orig",
  "file_hash": "$hash",
  "backup_path": "$dir",
  "created_at": "$(date -u -d "@$ts" +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# new_repo <name> <commit_epoch>: git repo with f.sh committed at that time.
new_repo() {
    local r="$SCRATCH/$1" when="$2"
    mkdir -p "$r"
    git -C "$r" init -q
    printf 'committed\n' > "$r/f.sh"
    git -C "$r" add f.sh
    GIT_AUTHOR_DATE="@$when +0000" GIT_COMMITTER_DATE="@$when +0000" \
        git -C "$r" -c user.name=t -c user.email=t@t.invalid commit -q -m init
    printf '%s\n' "$r"
}

run_restore() {  # run_restore <repo> args... ; sets OUT and RC, no tty
    local r="$1"; shift
    OUT=$(cd "$r" && CFN_BACKUP_ROOT="$r/.backups" timeout 20 bash "$RESTORE" "$@" </dev/null 2>&1)
    RC=$?
}

echo "T1: multiple backups across agent dirs -> most recent pre-edit original"
R=$(new_repo t1 1000)
make_backup "$R/.backups" gnu-port      2000 "pre-edit-old"    "f.sh"
make_backup "$R/.backups" claude-abc    3000 "pre-edit-latest" "$R/f.sh"
make_backup "$R/.backups" hook          2500 "pre-edit-mid"    "$R/f.sh"
make_backup "$R/.backups" restore-safety 4000 "helper-edit"    "$R/f.sh"
printf 'helper-edit\n' > "$R/f.sh"
run_restore "$R" f.sh
GOT=$(cat "$R/f.sh")
if [ "$RC" -eq 0 ] && [ "$GOT" = "pre-edit-latest" ]; then
    ok "restored claude-abc ts=3000 copy"
else
    bad "expected 'pre-edit-latest' rc=0, got '$GOT' rc=$RC :: $OUT"
fi

echo "T2: newest pre-edit backup older than last commit -> refuse"
R=$(new_repo t2 5000)
make_backup "$R/.backups" hook 2000 "weeks-old" "$R/f.sh"
make_backup "$R/.backups" gnu-port 1500 "older" "f.sh"
printf 'committed\nplus-uncommitted\n' > "$R/f.sh"
run_restore "$R" f.sh
GOT=$(cat "$R/f.sh")
if [ "$RC" -eq 3 ] && [ "$GOT" = "$(printf 'committed\nplus-uncommitted')" ]; then
    ok "refused stale backup, file untouched"
else
    bad "expected rc=3 and file untouched, got rc=$RC content='$GOT' :: $OUT"
fi
case "$OUT" in
    *"predates"*) ok "refusal names the reason" ;;
    *) bad "refusal message missing 'predates' :: $OUT" ;;
esac

echo "T3: --force restores the stale backup anyway"
run_restore "$R" f.sh --force
GOT=$(cat "$R/f.sh")
if [ "$RC" -eq 0 ] && [ "$GOT" = "weeks-old" ]; then
    ok "--force restored ts=2000 copy"
else
    bad "expected 'weeks-old' rc=0, got '$GOT' rc=$RC :: $OUT"
fi

echo "T4: no tty, closed stdin -> completes without prompting"
R=$(new_repo t4 1000)
make_backup "$R/.backups" hook 2000 "v1" "$R/f.sh"
printf 'edited\n' > "$R/f.sh"
run_restore "$R" f.sh
if [ "$RC" -ne 124 ] && [ "$(cat "$R/f.sh")" = "v1" ]; then
    ok "finished non-interactively (rc=$RC)"
else
    bad "timed out or wrong content rc=$RC :: $OUT"
fi
case "$OUT" in
    *"Restoring f.sh from"*"Restored 1 lines"*) ok "wrapper output contract kept" ;;
    *) bad "missing Restoring/Restored lines :: $OUT" ;;
esac

echo "T5: --help prints usage"
run_restore "$R" --help
case "$OUT" in
    *Usage:*) ok "--help shows usage" ;;
    *) bad "--help did not show usage :: $OUT" ;;
esac

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
