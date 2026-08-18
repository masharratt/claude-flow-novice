#!/usr/bin/env bash
# Regression / contract tests for the not-yet-implemented backup restore and
# cleanup scripts:
#
#   .claude/skills/cfn-edit-safety/lib/backup/restore.sh
#   .claude/skills/cfn-edit-safety/lib/backup/cleanup.sh
#
# These sit on top of the real, on-disk backup format written by
# .claude/skills/cfn-edit-safety/lib/backup/backup.sh (invoked by
# .claude/hooks/cfn-invoke-pre-edit.sh:117):
#
#   <project_root>/.backups/<agent_id>/<unix_ts>_<md5_of_original>/
#       original          <- byte copy of the file before the edit
#       metadata.json     <- {"timestamp","agent_id","original_file",
#                             "file_hash","backup_path","created_at"}
#       revert.sh         <- executable, cp's original back over original_file
#
# There is no ttl field. created_at is ISO-8601 Z. timestamp is unix seconds
# as a string. original_file is whatever path string was passed to backup.sh
# (may be relative or absolute).
#
# SAFETY: every fixture below is hand-built (or built by calling the real
# backup.sh) inside a mktemp -d sandbox. Nothing here ever reads, writes, or
# deletes anything under the real <repo>/.backups (1482 real backups, 46MB).
# Every rm -rf targets a path this script has just asserted is under /tmp.
#
# Assumption (documented, not tested): like backup.sh, restore.sh resolves its
# default backups root as $(pwd)/.backups, so every restore.sh invocation
# below runs with cwd set inside the sandbox project dir it targets. This
# matches the existing convention in test-edit-safety-roundtrip.sh.
#
# Run: bash tests/test-edit-safety-restore.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESTORE="$REPO_ROOT/.claude/skills/cfn-edit-safety/lib/backup/restore.sh"
CLEANUP="$REPO_ROOT/.claude/skills/cfn-edit-safety/lib/backup/cleanup.sh"

SCRATCH=$(mktemp -d /tmp/edit-safety-restore-test-XXXXXX)

assert_under_tmp() {
    case "$1" in
        /tmp/*) return 0 ;;
        *)
            printf 'REFUSING rm -rf: "%s" is not under /tmp\n' "$1" >&2
            exit 1
            ;;
    esac
}

cleanup_scratch() {
    assert_under_tmp "$SCRATCH"
    rm -rf "$SCRATCH"
}
trap cleanup_scratch EXIT

PASS=0
FAIL=0

ok()    { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
bad()   { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
head_() { printf '\n%s\n' "$1"; }

DAY=86400
NOW=$(date +%s)

md5_str() { printf '%s' "$1" | md5sum | cut -d' ' -f1; }

iso_from_ts() {
    date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "$1" +%Y-%m-%dT%H:%M:%SZ
}

# mk_meta ts agent orig_file hash backup_path created_at
mk_meta() {
    printf '{"timestamp":"%s","agent_id":"%s","original_file":"%s","file_hash":"%s","backup_path":"%s","created_at":"%s"}' \
        "$1" "$2" "$3" "$4" "$5" "$6"
}

# mk_backup_dir root agent_id backup_id original_content metadata_or_empty
# Writes original/metadata.json/revert.sh by hand. Prints the backup dir path.
mk_backup_dir() {
    local root="$1" agent="$2" bid="$3" content="$4" meta="$5"
    local dir="$root/$agent/$bid"
    mkdir -p "$dir"
    printf '%s' "$content" > "$dir/original"
    if [ -n "$meta" ]; then
        printf '%s' "$meta" > "$dir/metadata.json"
    fi
    printf '#!/bin/bash\nset -euo pipefail\necho "revert stub for %s"\n' "$dir" > "$dir/revert.sh"
    chmod +x "$dir/revert.sh"
    printf '%s' "$dir"
}

count_dirs() { find "$1" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' '; }

for dep in md5sum jq find; do
    command -v "$dep" >/dev/null 2>&1 || { echo "missing dependency: $dep"; exit 1; }
done

##############################################################################
# restore.sh --list
##############################################################################

# --- L1: single backup, happy path -----------------------------------------
head_ "L1  --list reports backup id, created_at, agent_id, byte size"

L1="$SCRATCH/list1"
mkdir -p "$L1"
printf 'CURRENT CONTENT\n' > "$L1/note.txt"

L1_CONTENT='OLD CONTENT
'
L1_HASH=$(md5_str "$L1_CONTENT")
L1_TS=$((NOW - DAY))
L1_BID="${L1_TS}_${L1_HASH}"
L1_CREATED=$(iso_from_ts "$L1_TS")
L1_META=$(mk_meta "$L1_TS" "tester-a" "$L1/note.txt" "$L1_HASH" "$L1/.backups/tester-a/$L1_BID" "$L1_CREATED")
mk_backup_dir "$L1/.backups" "tester-a" "$L1_BID" "$L1_CONTENT" "$L1_META" >/dev/null
L1_SIZE=$(printf '%s' "$L1_CONTENT" | wc -c | tr -d ' ')

L1_OUT=$( cd "$L1" && bash "$RESTORE" --list "$L1/note.txt" --agent-id tester-a 2>&1 )
L1_RC=$?

[ "$L1_RC" -eq 0 ] && ok "exit 0 when a backup exists" \
                   || bad "exit $L1_RC when a backup exists (output: $(printf '%s' "$L1_OUT" | tr '\n' '|')"

printf '%s' "$L1_OUT" | grep -qF "$L1_BID" \
    && ok "output includes the backup id" \
    || bad "output missing backup id $L1_BID: $L1_OUT"

printf '%s' "$L1_OUT" | grep -qF "tester-a" \
    && ok "output includes the agent id" \
    || bad "output missing agent id tester-a: $L1_OUT"

printf '%s' "$L1_OUT" | grep -qF "$L1_SIZE" \
    && ok "output includes the original file's byte size ($L1_SIZE)" \
    || bad "output missing byte size $L1_SIZE: $L1_OUT"

printf '%s' "$L1_OUT" | grep -qF "$L1_CREATED" \
    && ok "output includes created_at" \
    || bad "output missing created_at $L1_CREATED: $L1_OUT"

# --- L2: multiple backups, newest first -------------------------------------
head_ "L2  --list orders results newest first"

L2="$SCRATCH/list2"
mkdir -p "$L2"
printf 'CURRENT\n' > "$L2/multi.txt"

mk_one() {
    local ts="$1" tag="$2"
    local content="VERSION $tag
"
    local hash
    hash=$(md5_str "$content")
    local bid="${ts}_${hash}"
    local meta
    meta=$(mk_meta "$ts" "tester-b" "$L2/multi.txt" "$hash" "$L2/.backups/tester-b/$bid" "$(iso_from_ts "$ts")")
    mk_backup_dir "$L2/.backups" "tester-b" "$bid" "$content" "$meta" >/dev/null
    printf '%s' "$bid"
}

L2_OLD=$(mk_one $((NOW - 3 * DAY)) OLD)
L2_MID=$(mk_one $((NOW - 2 * DAY)) MID)
L2_NEW=$(mk_one $((NOW - 1 * DAY)) NEW)

L2_OUT=$( cd "$L2" && bash "$RESTORE" --list "$L2/multi.txt" --agent-id tester-b 2>&1 )
L2_RC=$?

[ "$L2_RC" -eq 0 ] && ok "L2 exits 0" || bad "L2 exits $L2_RC"

L2_LINE_NEW=$(printf '%s\n' "$L2_OUT" | grep -nF "$L2_NEW" | head -1 | cut -d: -f1)
L2_LINE_MID=$(printf '%s\n' "$L2_OUT" | grep -nF "$L2_MID" | head -1 | cut -d: -f1)
L2_LINE_OLD=$(printf '%s\n' "$L2_OUT" | grep -nF "$L2_OLD" | head -1 | cut -d: -f1)

if [ -n "$L2_LINE_NEW" ] && [ -n "$L2_LINE_MID" ] && [ -n "$L2_LINE_OLD" ] \
   && [ "$L2_LINE_NEW" -lt "$L2_LINE_MID" ] && [ "$L2_LINE_MID" -lt "$L2_LINE_OLD" ]; then
    ok "backups listed newest first (new < mid < old line numbers)"
else
    bad "ordering wrong or a backup id missing (new=$L2_LINE_NEW mid=$L2_LINE_MID old=$L2_LINE_OLD): $L2_OUT"
fi

# --- L3: no backups for this file -> exit 2 ---------------------------------
head_ "L3  --list on a file with zero backups exits 2"

L3_OUT=$( cd "$L1" && bash "$RESTORE" --list "$L1/never-backed-up.txt" 2>&1 )
L3_RC=$?

[ "$L3_RC" -eq 2 ] && ok "exit 2 when no backups match" \
                   || bad "exit $L3_RC (want 2) when no backups match: $L3_OUT"

##############################################################################
# restore.sh --file
##############################################################################

# --- F1: happy path restore + mandatory safety backup -----------------------
head_ "F1  --file restores the newest backup and takes a safety backup first"

F1="$SCRATCH/file1"
mkdir -p "$F1"
F1_CURRENT='CURRENT VERSION
'
printf '%s' "$F1_CURRENT" > "$F1/config.txt"

F1_OLD='OLD VERSION
'
F1_HASH=$(md5_str "$F1_OLD")
F1_TS=$((NOW - DAY))
F1_BID="${F1_TS}_${F1_HASH}"
F1_META=$(mk_meta "$F1_TS" "tester-f" "$F1/config.txt" "$F1_HASH" "$F1/.backups/tester-f/$F1_BID" "$(iso_from_ts "$F1_TS")")
mk_backup_dir "$F1/.backups" "tester-f" "$F1_BID" "$F1_OLD" "$F1_META" >/dev/null

F1_SAFETY_BEFORE=$(count_dirs "$F1/.backups/restore-safety")

F1_OUT=$( cd "$F1" && bash "$RESTORE" --file "$F1/config.txt" --agent-id tester-f 2>&1 )
F1_RC=$?

[ "$F1_RC" -eq 0 ] && ok "F1 exits 0" || bad "F1 exits $F1_RC: $F1_OUT"

if [ "$(cat "$F1/config.txt" 2>/dev/null)" = "$(printf '%s' "$F1_OLD")" ]; then
    ok "target file restored to the backup's content, byte for byte"
else
    bad "target file not restored correctly: got '$(cat "$F1/config.txt" 2>/dev/null)'"
fi

F1_SAFETY_AFTER=$(count_dirs "$F1/.backups/restore-safety")
if [ "$F1_SAFETY_AFTER" -gt "$F1_SAFETY_BEFORE" ]; then
    ok "a safety backup directory was created under .backups/restore-safety"
else
    bad "no safety backup was created before overwriting (before=$F1_SAFETY_BEFORE after=$F1_SAFETY_AFTER)"
fi

F1_SAFETY_DIR=$(find "$F1/.backups/restore-safety" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)
if [ -n "$F1_SAFETY_DIR" ] && [ -f "$F1_SAFETY_DIR/original" ] \
   && [ "$(cat "$F1_SAFETY_DIR/original" 2>/dev/null)" = "$(printf '%s' "$F1_CURRENT")" ]; then
    ok "safety backup captured the pre-restore (CURRENT) content"
else
    bad "safety backup missing or does not hold the pre-restore content"
fi

if [ -f "$F1_SAFETY_DIR/metadata.json" ] && grep -q '"agent_id": *"restore-safety"' "$F1_SAFETY_DIR/metadata.json"; then
    ok "safety backup metadata.json records agent_id restore-safety"
else
    bad "safety backup metadata.json missing or wrong agent_id"
fi

# --- F2: --dry-run changes nothing on disk ----------------------------------
head_ "F2  --file --dry-run makes no changes and takes no safety backup"

F2="$SCRATCH/file2"
mkdir -p "$F2"
F2_CURRENT='CURRENT F2
'
printf '%s' "$F2_CURRENT" > "$F2/config.txt"

F2_OLD='OLD F2
'
F2_HASH=$(md5_str "$F2_OLD")
F2_TS=$((NOW - DAY))
F2_BID="${F2_TS}_${F2_HASH}"
F2_META=$(mk_meta "$F2_TS" "tester-f2" "$F2/config.txt" "$F2_HASH" "$F2/.backups/tester-f2/$F2_BID" "$(iso_from_ts "$F2_TS")")
mk_backup_dir "$F2/.backups" "tester-f2" "$F2_BID" "$F2_OLD" "$F2_META" >/dev/null

F2_SAFETY_BEFORE=$(count_dirs "$F2/.backups/restore-safety")

F2_OUT=$( cd "$F2" && bash "$RESTORE" --file "$F2/config.txt" --agent-id tester-f2 --dry-run 2>&1 )
F2_RC=$?

[ "$F2_RC" -eq 0 ] && ok "F2 --dry-run exits 0" || bad "F2 --dry-run exits $F2_RC: $F2_OUT"

if [ "$(cat "$F2/config.txt" 2>/dev/null)" = "$(printf '%s' "$F2_CURRENT")" ]; then
    ok "--dry-run left the target file untouched"
else
    bad "--dry-run modified the target file: got '$(cat "$F2/config.txt" 2>/dev/null)'"
fi

F2_SAFETY_AFTER=$(count_dirs "$F2/.backups/restore-safety")
[ "$F2_SAFETY_AFTER" -eq "$F2_SAFETY_BEFORE" ] \
    && ok "--dry-run created no safety backup" \
    || bad "--dry-run created a safety backup anyway"

printf '%s' "$F2_OUT" | grep -qi "dry" \
    && ok "--dry-run output says what it would have done" \
    || bad "--dry-run output does not mention a dry run: $F2_OUT"

# --- F3: integrity gate refuses on hash mismatch ----------------------------
head_ "F3  hash mismatch refuses to restore without --force"

F3="$SCRATCH/file3"
mkdir -p "$F3"
F3_CURRENT='CURRENT F3
'
printf '%s' "$F3_CURRENT" > "$F3/config.txt"

F3_OLD='OLD F3
'
F3_TS=$((NOW - DAY))
F3_BID="${F3_TS}_deadbeef0000000000000000deadbeef"
# file_hash deliberately does not match md5 of F3_OLD -> integrity gate must fire.
F3_META=$(mk_meta "$F3_TS" "tester-f3" "$F3/config.txt" "deadbeef0000000000000000deadbeef" "$F3/.backups/tester-f3/$F3_BID" "$(iso_from_ts "$F3_TS")")
mk_backup_dir "$F3/.backups" "tester-f3" "$F3_BID" "$F3_OLD" "$F3_META" >/dev/null

F3_OUT=$( cd "$F3" && bash "$RESTORE" --file "$F3/config.txt" --agent-id tester-f3 2>&1 )
F3_RC=$?

[ "$F3_RC" -eq 1 ] && ok "hash mismatch exits 1" || bad "hash mismatch exits $F3_RC (want 1): $F3_OUT"

if [ "$(cat "$F3/config.txt" 2>/dev/null)" = "$(printf '%s' "$F3_CURRENT")" ]; then
    ok "target file left untouched after a refused restore"
else
    bad "target file was modified despite a hash mismatch refusal"
fi

# --- F4: --force overrides the integrity gate -------------------------------
head_ "F4  --force restores despite a hash mismatch"

F4_OUT=$( cd "$F3" && bash "$RESTORE" --file "$F3/config.txt" --agent-id tester-f3 --force 2>&1 )
F4_RC=$?

[ "$F4_RC" -eq 0 ] && ok "--force exits 0 on a mismatched backup" || bad "--force exits $F4_RC: $F4_OUT"

if [ "$(cat "$F3/config.txt" 2>/dev/null)" = "$(printf '%s' "$F3_OLD")" ]; then
    ok "--force restored the mismatched backup's content anyway"
else
    bad "--force did not restore the backup's content"
fi

# --- F5: no backup at all for the file -> exit 2 ----------------------------
head_ "F5  --file with zero backups exits 2"

F5="$SCRATCH/file5"
mkdir -p "$F5"
printf 'SOMETHING\n' > "$F5/lonely.txt"

F5_OUT=$( cd "$F5" && bash "$RESTORE" --file "$F5/lonely.txt" 2>&1 )
F5_RC=$?

[ "$F5_RC" -eq 2 ] && ok "exit 2 when no backup exists for the file" \
                   || bad "exit $F5_RC (want 2) when no backup exists: $F5_OUT"

# --- F6: target file does not exist -> safety backup is skipped ------------
head_ "F6  restoring to a missing target file skips the safety backup"

F6="$SCRATCH/file6"
mkdir -p "$F6"
# Note: target file deliberately never created.

F6_CONTENT='RECREATED CONTENT
'
F6_HASH=$(md5_str "$F6_CONTENT")
F6_TS=$((NOW - DAY))
F6_BID="${F6_TS}_${F6_HASH}"
F6_META=$(mk_meta "$F6_TS" "tester-f6" "$F6/missing.txt" "$F6_HASH" "$F6/.backups/tester-f6/$F6_BID" "$(iso_from_ts "$F6_TS")")
mk_backup_dir "$F6/.backups" "tester-f6" "$F6_BID" "$F6_CONTENT" "$F6_META" >/dev/null

F6_OUT=$( cd "$F6" && bash "$RESTORE" --file "$F6/missing.txt" --agent-id tester-f6 2>&1 )
F6_RC=$?

[ "$F6_RC" -eq 0 ] && ok "restoring over a missing file exits 0" || bad "exits $F6_RC: $F6_OUT"

if [ "$(cat "$F6/missing.txt" 2>/dev/null)" = "$(printf '%s' "$F6_CONTENT")" ]; then
    ok "missing target file was created with the backup's content"
else
    bad "missing target file was not recreated correctly"
fi

F6_SAFETY_COUNT=$(count_dirs "$F6/.backups/restore-safety")
[ "$F6_SAFETY_COUNT" -eq 0 ] \
    && ok "no safety backup taken when the target file did not exist" \
    || bad "a safety backup was taken for a file that did not exist"

# --- F7: corrupt / missing metadata does not sink the whole listing ---------
head_ "F7  a sibling backup with missing or corrupt metadata does not break --list"

F7="$SCRATCH/file7"
mkdir -p "$F7"
printf 'CURRENT F7\n' > "$F7/shared.txt"

F7_GOOD='GOOD BACKUP
'
F7_HASH=$(md5_str "$F7_GOOD")
F7_TS=$((NOW - DAY))
F7_BID="${F7_TS}_${F7_HASH}"
F7_META=$(mk_meta "$F7_TS" "tester-f7" "$F7/shared.txt" "$F7_HASH" "$F7/.backups/tester-f7/$F7_BID" "$(iso_from_ts "$F7_TS")")
mk_backup_dir "$F7/.backups" "tester-f7" "$F7_BID" "$F7_GOOD" "$F7_META" >/dev/null

# Sibling with no metadata.json at all (orphan by omission).
F7_NOMETA_TS=$((NOW - 2 * DAY))
F7_NOMETA_BID="${F7_NOMETA_TS}_nometadatanometadatanometada00"
mk_backup_dir "$F7/.backups" "tester-f7" "$F7_NOMETA_BID" "NO METADATA HERE" "" >/dev/null

# Sibling with unparseable JSON (orphan by corruption).
F7_BADJSON_TS=$((NOW - 3 * DAY))
F7_BADJSON_BID="${F7_BADJSON_TS}_badjsonbadjsonbadjsonbadjson00"
mk_backup_dir "$F7/.backups" "tester-f7" "$F7_BADJSON_BID" "BAD JSON HERE" "{ this is not : valid json" >/dev/null

F7_OUT=$( cd "$F7" && bash "$RESTORE" --list "$F7/shared.txt" 2>&1 )
F7_RC=$?

[ "$F7_RC" -eq 0 ] && ok "--list still succeeds when a sibling backup has bad metadata" \
                   || bad "--list exits $F7_RC when a sibling has bad metadata: $F7_OUT"

printf '%s' "$F7_OUT" | grep -qF "$F7_BID" \
    && ok "the valid backup still appears in the listing" \
    || bad "the valid backup is missing from the listing: $F7_OUT"

# --- F8: relative vs absolute original_file resolve to the same real path --
head_ "F8  relative and absolute original_file both match the same real path"

F8="$SCRATCH/file8"
mkdir -p "$F8"
printf 'CURRENT F8\n' > "$F8/relfile.txt"

F8_CONTENT='F8 BACKUP CONTENT
'
F8_HASH=$(md5_str "$F8_CONTENT")
F8_TS=$((NOW - DAY))
F8_BID="${F8_TS}_${F8_HASH}"
# original_file recorded as a bare relative path, as backup.sh would store it
# had it been invoked with a relative argument from this same directory.
F8_META=$(mk_meta "$F8_TS" "tester-f8" "relfile.txt" "$F8_HASH" "$F8/.backups/tester-f8/$F8_BID" "$(iso_from_ts "$F8_TS")")
mk_backup_dir "$F8/.backups" "tester-f8" "$F8_BID" "$F8_CONTENT" "$F8_META" >/dev/null

F8_OUT_REL=$( cd "$F8" && bash "$RESTORE" --list "relfile.txt" 2>&1 )
F8_RC_REL=$?
F8_OUT_ABS=$( cd "$F8" && bash "$RESTORE" --list "$F8/relfile.txt" 2>&1 )
F8_RC_ABS=$?

[ "$F8_RC_REL" -eq 0 ] && ok "--list finds the backup via the relative path" \
                        || bad "--list exits $F8_RC_REL for the relative path: $F8_OUT_REL"
[ "$F8_RC_ABS" -eq 0 ] && ok "--list finds the same backup via the absolute path" \
                        || bad "--list exits $F8_RC_ABS for the absolute path: $F8_OUT_ABS"

# --- F9: a file path containing a space --------------------------------------
head_ "F9  a target file path containing a space restores correctly"

F9="$SCRATCH/file 9"
mkdir -p "$F9"
F9_CURRENT='CURRENT F9
'
printf '%s' "$F9_CURRENT" > "$F9/my file.txt"

F9_OLD='OLD F9
'
F9_HASH=$(md5_str "$F9_OLD")
F9_TS=$((NOW - DAY))
F9_BID="${F9_TS}_${F9_HASH}"
F9_META=$(mk_meta "$F9_TS" "tester-f9" "$F9/my file.txt" "$F9_HASH" "$F9/.backups/tester-f9/$F9_BID" "$(iso_from_ts "$F9_TS")")
mk_backup_dir "$F9/.backups" "tester-f9" "$F9_BID" "$F9_OLD" "$F9_META" >/dev/null

F9_LIST_OUT=$( cd "$F9" && bash "$RESTORE" --list "$F9/my file.txt" 2>&1 )
F9_LIST_RC=$?
[ "$F9_LIST_RC" -eq 0 ] && ok "--list finds a backup for a path containing a space" \
                         || bad "--list exits $F9_LIST_RC for a spaced path: $F9_LIST_OUT"

F9_OUT=$( cd "$F9" && bash "$RESTORE" --file "$F9/my file.txt" --agent-id tester-f9 2>&1 )
F9_RC=$?
[ "$F9_RC" -eq 0 ] && ok "--file restores a path containing a space (exit 0)" \
                    || bad "--file exits $F9_RC for a spaced path: $F9_OUT"

if [ "$(cat "$F9/my file.txt" 2>/dev/null)" = "$(printf '%s' "$F9_OLD")" ]; then
    ok "spaced-path file restored byte for byte"
else
    bad "spaced-path file not restored correctly"
fi

##############################################################################
# restore.sh --backup-id / positional backup dir path
##############################################################################

# --- B1/B2: a specific backup id (and the positional form) wins over newest -
head_ "B1  --backup-id restores that exact backup, not the newest one"

B1="$SCRATCH/bid1"
mkdir -p "$B1"
printf 'CURRENT B1\n' > "$B1/versioned.txt"

B1_OLDEST_CONTENT='OLDEST
'
B1_OLDEST_HASH=$(md5_str "$B1_OLDEST_CONTENT")
B1_OLDEST_TS=$((NOW - 5 * DAY))
B1_OLDEST_BID="${B1_OLDEST_TS}_${B1_OLDEST_HASH}"
B1_OLDEST_META=$(mk_meta "$B1_OLDEST_TS" "tester-b1" "$B1/versioned.txt" "$B1_OLDEST_HASH" "$B1/.backups/tester-b1/$B1_OLDEST_BID" "$(iso_from_ts "$B1_OLDEST_TS")")
mk_backup_dir "$B1/.backups" "tester-b1" "$B1_OLDEST_BID" "$B1_OLDEST_CONTENT" "$B1_OLDEST_META" >/dev/null

B1_NEWEST_CONTENT='NEWEST
'
B1_NEWEST_HASH=$(md5_str "$B1_NEWEST_CONTENT")
B1_NEWEST_TS=$((NOW - 1 * DAY))
B1_NEWEST_BID="${B1_NEWEST_TS}_${B1_NEWEST_HASH}"
B1_NEWEST_META=$(mk_meta "$B1_NEWEST_TS" "tester-b1" "$B1/versioned.txt" "$B1_NEWEST_HASH" "$B1/.backups/tester-b1/$B1_NEWEST_BID" "$(iso_from_ts "$B1_NEWEST_TS")")
mk_backup_dir "$B1/.backups" "tester-b1" "$B1_NEWEST_BID" "$B1_NEWEST_CONTENT" "$B1_NEWEST_META" >/dev/null

B1_OUT=$( cd "$B1" && bash "$RESTORE" --backup-id "$B1_OLDEST_BID" --agent-id tester-b1 2>&1 )
B1_RC=$?

[ "$B1_RC" -eq 0 ] && ok "--backup-id exits 0" || bad "--backup-id exits $B1_RC: $B1_OUT"

if [ "$(cat "$B1/versioned.txt" 2>/dev/null)" = "$(printf '%s' "$B1_OLDEST_CONTENT")" ]; then
    ok "--backup-id restored the explicitly requested (older) backup, not the newest"
else
    bad "--backup-id restored the wrong content: got '$(cat "$B1/versioned.txt" 2>/dev/null)'"
fi

head_ "B2  the positional <backup_dir_path> form is equivalent to --backup-id"

printf 'CURRENT B1 AGAIN\n' > "$B1/versioned.txt"
B2_OUT=$( cd "$B1" && bash "$RESTORE" "$B1/.backups/tester-b1/$B1_OLDEST_BID" 2>&1 )
B2_RC=$?

[ "$B2_RC" -eq 0 ] && ok "positional backup_dir_path form exits 0" || bad "exits $B2_RC: $B2_OUT"

if [ "$(cat "$B1/versioned.txt" 2>/dev/null)" = "$(printf '%s' "$B1_OLDEST_CONTENT")" ]; then
    ok "positional form restored the same (older) backup as --backup-id did"
else
    bad "positional form restored the wrong content"
fi

# --- B3: a nonexistent backup id is an error, not a silent no-op -----------
head_ "B3  a nonexistent --backup-id fails loudly"

B3_OUT=$( cd "$B1" && bash "$RESTORE" --backup-id "0_doesnotexist00000000000000000" 2>&1 )
B3_RC=$?

[ "$B3_RC" -ne 0 ] && ok "nonexistent --backup-id exits nonzero (exit $B3_RC)" \
                    || bad "nonexistent --backup-id exits 0"
[ -n "$B3_OUT" ] && ok "nonexistent --backup-id prints a diagnostic" \
                  || bad "nonexistent --backup-id produced no diagnostic"

##############################################################################
# restore.sh usage / argument errors
##############################################################################

head_ "U1  no arguments: usage on stderr, exit 1"

U1_ERR="$SCRATCH/u1.err"
U1_OUT=$( bash "$RESTORE" 2>"$U1_ERR" )
U1_RC=$?

[ "$U1_RC" -eq 1 ] && ok "no args exits 1" || bad "no args exits $U1_RC (want 1)"
[ -s "$U1_ERR" ]   && ok "no args prints usage on stderr" || bad "no args prints nothing on stderr"

head_ "U2  unknown flag: usage on stderr, exit 1"

U2_ERR="$SCRATCH/u2.err"
U2_OUT=$( bash "$RESTORE" --this-flag-does-not-exist 2>"$U2_ERR" )
U2_RC=$?

[ "$U2_RC" -eq 1 ] && ok "unknown flag exits 1" || bad "unknown flag exits $U2_RC (want 1)"
[ -s "$U2_ERR" ]   && ok "unknown flag prints usage on stderr" || bad "unknown flag prints nothing on stderr"

##############################################################################
# cleanup.sh
##############################################################################

# All cleanup.sh fixtures live under a sandbox root outside the repo, passed
# in via CFN_BACKUP_ROOT. cleanup.sh must refuse a foreign root unless
# CFN_BACKUP_ALLOW_FOREIGN_ROOT=1 is set -- that refusal itself is tested
# below (C1) before we ever rely on the escape hatch for the rest.

CROOT="$SCRATCH/cleanup-root/.backups"
mkdir -p "$CROOT"

# --- C1: refuses a foreign backups root by default --------------------------
head_ "C1  cleanup.sh refuses a foreign CFN_BACKUP_ROOT without the escape hatch"

C1_ERR="$SCRATCH/c1.err"
C1_OUT=$( CFN_BACKUP_ROOT="$CROOT" bash "$CLEANUP" 2>"$C1_ERR" )
C1_RC=$?

[ "$C1_RC" -eq 1 ] && ok "foreign root without escape hatch exits 1" \
                    || bad "foreign root without escape hatch exits $C1_RC (want 1)"
[ -s "$C1_ERR" ]   && ok "foreign root refusal prints a message on stderr" \
                    || bad "foreign root refusal printed nothing on stderr"

# --- C2: the escape hatch permits running against the sandbox root ----------
head_ "C2  CFN_BACKUP_ALLOW_FOREIGN_ROOT=1 permits the sandbox root"

C2_OUT=$( CFN_BACKUP_ROOT="$CROOT" CFN_BACKUP_ALLOW_FOREIGN_ROOT=1 bash "$CLEANUP" 2>&1 )
C2_RC=$?

[ "$C2_RC" -eq 0 ] && ok "escape hatch allows a run against an empty sandbox root" \
                    || bad "escape hatch run exits $C2_RC: $C2_OUT"

run_cleanup() {
    # run_cleanup <extra args...> -- always targets the sandbox root.
    CFN_BACKUP_ROOT="$CROOT" CFN_BACKUP_ALLOW_FOREIGN_ROOT=1 bash "$CLEANUP" "$@"
}

# --- C3: default (dry-run) never deletes anything ---------------------------
head_ "C3  no --apply: dry-run never deletes, even backups past the age threshold"

mk_cleanup_backup() {
    # args: agent orig_file ts content
    local agent="$1" orig="$2" ts="$3" content="$4"
    local hash
    hash=$(md5_str "$content")
    local bid="${ts}_${hash}"
    local meta
    meta=$(mk_meta "$ts" "$agent" "$orig" "$hash" "$CROOT/$agent/$bid" "$(iso_from_ts "$ts")")
    mk_backup_dir "$CROOT" "$agent" "$bid" "$content" "$meta"
}

C3_FILE="$SCRATCH/cleanup-root/fileA.txt"
C3_NEW_BID=$(mk_cleanup_backup "agentA" "$C3_FILE" $((NOW - 1 * DAY))  "NEWEST A
")
C3_MID_BID=$(mk_cleanup_backup "agentA" "$C3_FILE" $((NOW - 3 * DAY))  "MIDDLE A
")
C3_OLD_BID=$(mk_cleanup_backup "agentA" "$C3_FILE" $((NOW - 10 * DAY)) "OLDEST A
")

C3_OUT=$(run_cleanup 2>&1)
C3_RC=$?

[ "$C3_RC" -eq 0 ] && ok "dry-run (default) exits 0" || bad "dry-run exits $C3_RC: $C3_OUT"

[ -d "$C3_OLD_BID" ] && ok "dry-run left the 10-day-old backup on disk" \
                       || bad "dry-run deleted a backup without --apply: $C3_OLD_BID"
[ -d "$C3_NEW_BID" ] && ok "dry-run left the 1-day-old backup on disk" \
                       || bad "dry-run deleted the newest backup"

printf '%s' "$C3_OUT" | grep -qi "would" \
    && ok "dry-run report signals what it would remove" \
    || bad "dry-run report does not mention a would-remove count: $C3_OUT"

# --- C4: --apply deletes only what age + keep-latest allow ------------------
head_ "C4  --apply deletes the ineligible-by-age backup, keeps the rest"

C4_OUT=$(run_cleanup --apply --older-than 7 --keep-latest 1 2>&1)
C4_RC=$?

[ "$C4_RC" -eq 0 ] && ok "--apply exits 0" || bad "--apply exits $C4_RC: $C4_OUT"

[ ! -d "$C3_OLD_BID" ] && ok "--apply removed the 10-day-old backup (older than 7 days, not the newest)" \
                        || bad "--apply left the 10-day-old backup in place: $C3_OLD_BID"
[ -d "$C3_MID_BID" ]  && ok "--apply kept the 3-day-old backup (younger than the 7-day threshold)" \
                        || bad "--apply removed a backup that was not old enough: $C3_MID_BID"
[ -d "$C3_NEW_BID" ]  && ok "--apply kept the 1-day-old (newest) backup" \
                        || bad "--apply removed the newest backup: $C3_NEW_BID"

# --- C5: --keep-latest protects an ancient sole backup ----------------------
head_ "C5  --keep-latest 1 protects the only backup even when it is ancient"

C5_FILE="$SCRATCH/cleanup-root/fileB.txt"
C5_ANCIENT_BID=$(mk_cleanup_backup "agentB" "$C5_FILE" $((NOW - 400 * DAY)) "ANCIENT B
")

C5_OUT=$(run_cleanup --apply --older-than 7 --keep-latest 1 2>&1)
C5_RC=$?

[ "$C5_RC" -eq 0 ] && ok "C5 --apply exits 0" || bad "C5 --apply exits $C5_RC: $C5_OUT"

[ -d "$C5_ANCIENT_BID" ] \
    && ok "the sole 400-day-old backup survives because --keep-latest 1 protects the newest N per file" \
    || bad "--keep-latest failed to protect the only (ancient) backup for its file: $C5_ANCIENT_BID"

# --- C6: 13-digit millisecond timestamps are handled correctly -------------
head_ "C6  a 13-digit millisecond metadata.timestamp is divided by 1000, not treated as seconds"

C6_FILE="$SCRATCH/cleanup-root/fileC.txt"
C6_RECENT_SEC=$((NOW - 1 * DAY))
C6_RECENT_BID=$(mk_cleanup_backup "agentC" "$C6_FILE" "$C6_RECENT_SEC" "RECENT C
")

# Hand-build the ancient one with a millisecond timestamp so keep-latest (by
# recency) does not protect it: it must be older than the recent backup above.
C6_ANCIENT_SEC=$((NOW - 10 * DAY))
C6_ANCIENT_MS="${C6_ANCIENT_SEC}000"
C6_ANCIENT_CONTENT='ANCIENT C MS
'
C6_ANCIENT_HASH=$(md5_str "$C6_ANCIENT_CONTENT")
C6_ANCIENT_BID_NAME="${C6_ANCIENT_SEC}_${C6_ANCIENT_HASH}"
C6_ANCIENT_META=$(mk_meta "$C6_ANCIENT_MS" "agentC" "$C6_FILE" "$C6_ANCIENT_HASH" "$CROOT/agentC/$C6_ANCIENT_BID_NAME" "$(iso_from_ts "$C6_ANCIENT_SEC")")
C6_ANCIENT_BID=$(mk_backup_dir "$CROOT" "agentC" "$C6_ANCIENT_BID_NAME" "$C6_ANCIENT_CONTENT" "$C6_ANCIENT_META")

C6_OUT=$(run_cleanup --apply --older-than 7 --keep-latest 1 2>&1)
C6_RC=$?

[ "$C6_RC" -eq 0 ] && ok "C6 --apply exits 0" || bad "C6 --apply exits $C6_RC: $C6_OUT"

if [ ! -d "$C6_ANCIENT_BID" ]; then
    ok "millisecond timestamp correctly parsed as 10 days old and removed"
else
    bad "millisecond timestamp mishandled: backup with a 13-digit timestamp was not removed (age computed wrong): $C6_ANCIENT_BID"
fi
[ -d "$C6_RECENT_BID" ] && ok "the genuinely recent sibling backup was kept" \
                         || bad "the recent sibling backup was wrongly removed"

# --- C7: orphan with missing metadata.json is reported, never deleted ------
head_ "C7  a backup dir with no metadata.json is an orphan: counted, not deleted, without --prune-orphans"

C7_ORPHAN_TS=$((NOW - 400 * DAY))
C7_ORPHAN_BID="$CROOT/agentD/${C7_ORPHAN_TS}_orphannometa0000000000000000"
mkdir -p "$C7_ORPHAN_BID"
printf 'ORPHAN NO METADATA\n' > "$C7_ORPHAN_BID/original"
# deliberately: no metadata.json
# An orphan has no metadata to read an age from, so cleanup.sh ages it off the
# directory mtime. Backdate it, otherwise this fixture is indistinguishable
# from a backup.sh write caught mid-flight, which --prune-orphans must not
# touch. C9b below covers that mid-flight case explicitly.
touch -d '@'"$C7_ORPHAN_TS" "$C7_ORPHAN_BID"

C7_OUT=$(run_cleanup --apply --older-than 7 --keep-latest 1 2>&1)
C7_RC=$?

[ "$C7_RC" -eq 0 ] && ok "C7 --apply exits 0 with an orphan present" || bad "C7 --apply exits $C7_RC: $C7_OUT"
[ -d "$C7_ORPHAN_BID" ] && ok "orphan (missing metadata.json) survives --apply without --prune-orphans" \
                         || bad "orphan (missing metadata.json) was deleted without --prune-orphans: $C7_ORPHAN_BID"
printf '%s' "$C7_OUT" | grep -qi "orphan" \
    && ok "report mentions orphans" \
    || bad "report does not mention orphans at all: $C7_OUT"

# --- C8: orphan with corrupt/unparseable metadata.json --------------------
head_ "C8  a backup dir with unparseable metadata.json is also an orphan, never deleted by default"

C8_ORPHAN_TS=$((NOW - 400 * DAY))
C8_ORPHAN_BID="$CROOT/agentE/${C8_ORPHAN_TS}_orphanbadjson000000000000000"
mkdir -p "$C8_ORPHAN_BID"
printf 'ORPHAN BAD JSON\n' > "$C8_ORPHAN_BID/original"
printf '{ not valid json at all' > "$C8_ORPHAN_BID/metadata.json"
# Same reason as C7: backdate the mtime so this reads as settled cruft rather
# than an in-progress write.
touch -d '@'"$C8_ORPHAN_TS" "$C8_ORPHAN_BID"

C8_OUT=$(run_cleanup --apply --older-than 7 --keep-latest 1 2>&1)
C8_RC=$?

[ "$C8_RC" -eq 0 ] && ok "C8 --apply exits 0 with a corrupt-metadata orphan present" \
                    || bad "C8 --apply exits $C8_RC: $C8_OUT"
[ -d "$C8_ORPHAN_BID" ] && ok "orphan (corrupt metadata.json) survives --apply without --prune-orphans" \
                         || bad "orphan (corrupt metadata.json) was deleted without --prune-orphans: $C8_ORPHAN_BID"

# --- C9: --prune-orphans actually removes orphans ---------------------------
head_ "C9  --prune-orphans removes both orphan kinds"

C9_OUT=$(run_cleanup --apply --prune-orphans --older-than 7 --keep-latest 1 2>&1)
C9_RC=$?

[ "$C9_RC" -eq 0 ] && ok "C9 --prune-orphans run exits 0" || bad "C9 exits $C9_RC: $C9_OUT"
[ ! -d "$C7_ORPHAN_BID" ] && ok "--prune-orphans removed the missing-metadata orphan" \
                            || bad "--prune-orphans left the missing-metadata orphan: $C7_ORPHAN_BID"
[ ! -d "$C8_ORPHAN_BID" ] && ok "--prune-orphans removed the corrupt-metadata orphan" \
                            || bad "--prune-orphans left the corrupt-metadata orphan: $C8_ORPHAN_BID"

# --- C9b: --prune-orphans must NOT eat a backup that is mid-write -----------
# backup.sh creates the directory, copies `original`, and only then writes
# metadata.json. Between those steps the directory is indistinguishable from
# an orphan. A concurrent --prune-orphans that deleted it would destroy the
# backup the pre-edit hook is in the middle of taking, which is the one thing
# this whole rollback path exists to prevent. cleanup.sh holds a fixed grace
# window for exactly this.
head_ "C9b --prune-orphans spares a just-created orphan (a mid-flight backup.sh write)"

C9B_INFLIGHT="$CROOT/agentF/${NOW}_inflightwrite00000000000000"
mkdir -p "$C9B_INFLIGHT"
printf 'HALF-WRITTEN BACKUP\n' > "$C9B_INFLIGHT/original"
# no metadata.json yet, and mtime deliberately left at now

C9B_OUT=$(run_cleanup --apply --prune-orphans --older-than 7 --keep-latest 1 2>&1)
C9B_RC=$?

[ "$C9B_RC" -eq 0 ] && ok "C9b --prune-orphans run exits 0" || bad "C9b exits $C9B_RC: $C9B_OUT"
[ -d "$C9B_INFLIGHT" ] \
    && ok "a just-created orphan survives --prune-orphans (mid-write is not garbage)" \
    || bad "--prune-orphans deleted a mid-flight backup.sh write: $C9B_INFLIGHT"
[ -f "$C9B_INFLIGHT/original" ] \
    && ok "the mid-flight backup's original copy is still intact" \
    || bad "--prune-orphans destroyed the original inside a mid-flight backup: $C9B_INFLIGHT"

rm -rf -- "$C9B_INFLIGHT"

# --- C10: --json emits one valid JSON object with the required fields ------
head_ "C10  --json emits a single valid JSON object with scanned/orphans/etc"

C10_FILE="$SCRATCH/cleanup-root/fileF.txt"
mk_cleanup_backup "agentF" "$C10_FILE" $((NOW - 1 * DAY)) "JSON REPORT F
" >/dev/null

C10_OUT=$(run_cleanup --json 2>&1)
C10_RC=$?

[ "$C10_RC" -eq 0 ] && ok "--json run exits 0" || bad "--json run exits $C10_RC: $C10_OUT"

if printf '%s' "$C10_OUT" | jq -e . >/dev/null 2>&1; then
    ok "--json stdout is a single valid JSON value (jq -e parses it)"
else
    bad "--json stdout is not valid JSON: $C10_OUT"
fi

if printf '%s' "$C10_OUT" | jq -e 'has("scanned") and has("orphans") and (has("removed") or has("would_remove")) and (has("kept_by_latest") or has("kept-by-latest")) and (has("bytes_reclaimed") or has("bytes-reclaimed"))' >/dev/null 2>&1; then
    ok "--json object has scanned, orphans, a removed/would-remove field, a kept-by-latest field, and a bytes-reclaimed field"
else
    bad "--json object is missing one or more required fields: $C10_OUT"
fi

# --- C11: concurrent runs serialize via flock, second one refuses ----------
head_ "C11  a second concurrent run is rejected with an 'in progress' message"

(
    exec 200>"$CROOT/cleanup.lock"
    flock -x 200
    sleep 2
) &
LOCK_HOLDER_PID=$!
sleep 0.3

C11_OUT=$(run_cleanup 2>&1)
C11_RC=$?

wait "$LOCK_HOLDER_PID" 2>/dev/null

[ "$C11_RC" -eq 1 ] && ok "concurrent run exits 1 while the lock is held" \
                     || bad "concurrent run exits $C11_RC (want 1) while the lock is held: $C11_OUT"
printf '%s' "$C11_OUT" | grep -qi "progress" \
    && ok "concurrent run reports 'in progress' rather than silently failing" \
    || bad "concurrent run gave no 'in progress' message: $C11_OUT"

##############################################################################
# summary
##############################################################################

printf '\n----------------------------------------\n'
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
