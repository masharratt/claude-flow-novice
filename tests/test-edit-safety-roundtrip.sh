#!/usr/bin/env bash
# Regression tests for the edit-safety backup/restore round trip.
#
# The documented contract (~/.claude/CLAUDE.md section 1, agent-prelude.md section 1):
#
#   BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE" --agent-id "$AGENT_ID")
#   ... edit ...
#   ./.claude/hooks/cfn-restore-from-backup.sh "$FILE"     # rollback
#
# Two interlocking defects broke that contract end to end:
#
#   D1  cfn-invoke-pre-edit.sh captured the backup helper with `2>&1`, folding the
#       helper's "Backup created" stderr banner into the stdout the caller assigns
#       to BACKUP_PATH. BACKUP_PATH came back as TWO lines and named no directory.
#   D2  cfn-invoke-pre-edit.sh passed the agent id POSITIONALLY to a helper whose
#       CLI takes `--agent-id`, so the id was silently dropped and every backup
#       landed under .backups/unknown/ regardless of which agent made it.
#   D3  cfn-restore-from-backup.sh looked only for sibling "${FILE}.backup-*"
#       files -- the convention of the DEPRECATED .claude/hooks/deprecated/
#       cfn-pre-edit-backup.sh. Nothing the current pre-edit hook writes is
#       findable that way, so rollback failed for every backup taken since.
#
# Both backup generations still exist on disk and both must stay restorable.
#
# Run: bash tests/test-edit-safety-roundtrip.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRE_EDIT="$REPO_ROOT/.claude/hooks/cfn-invoke-pre-edit.sh"
RESTORE="$REPO_ROOT/.claude/hooks/cfn-restore-from-backup.sh"

SCRATCH=$(mktemp -d /tmp/edit-safety-test-XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT

PASS=0
FAIL=0

ok()    { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
bad()   { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
head_() { printf '\n%s\n' "$1"; }

# Every hook invocation runs with cwd inside $SCRATCH, so the backup helper's
# project-root default ($(pwd)) puts .backups/ in the scratch dir. The real
# repo's .claude/backups/ and .backups/ are never read and never written.
mk_work() {
    local dir="$1"
    mkdir -p "$dir"
    printf 'ORIGINAL LINE 1\nORIGINAL LINE 2\ntrailing spaces   \n\tliteral tab\n' \
        > "$dir/target.txt"
}

# --- R1: BACKUP_PATH is a single clean path (--agent-id supplied) ----------
# D1. Command substitution keeps interior newlines, so a banner on the merged
# stream lands inside BACKUP_PATH and every later "$BACKUP_PATH" use is garbage.
head_ "R1  BACKUP_PATH is one clean path, no banner or log lines"

R1="$SCRATCH/r1"
mk_work "$R1"

BACKUP_PATH=$( cd "$R1" && bash "$PRE_EDIT" "$R1/target.txt" --agent-id "roundtrip-agent-1" )
R1_RC=$?

if [ "$R1_RC" -ne 0 ]; then
    bad "pre-edit hook exited $R1_RC with a valid file and --agent-id"
else
    ok "pre-edit hook exits 0"
fi

R1_LINES=$(printf '%s\n' "$BACKUP_PATH" | wc -l)
if [ "$R1_LINES" -eq 1 ]; then
    ok "BACKUP_PATH is exactly one line"
else
    bad "BACKUP_PATH is $R1_LINES lines (stderr banner merged into stdout)"
fi

case "$BACKUP_PATH" in
    *"Backup created"*|*"✅"*|*"["*"]"*)
        bad "BACKUP_PATH contains banner/log text: $(printf '%s' "$BACKUP_PATH" | tr '\n' '|')" ;;
    *)  ok "BACKUP_PATH contains no banner/log text" ;;
esac

if [ -d "$BACKUP_PATH" ]; then
    ok "BACKUP_PATH names a real directory"
else
    bad "BACKUP_PATH does not name a directory: $(printf '%s' "$BACKUP_PATH" | tr '\n' '|')"
fi

if [ -f "$BACKUP_PATH/original" ]; then
    ok "BACKUP_PATH/original exists"
else
    bad "BACKUP_PATH/original missing -- BACKUP_PATH is unusable for rollback"
fi

# --- R2: --agent-id actually reaches the backup helper --------------------
# D2. The helper's CLI is `backup.sh FILE --agent-id ID`; the hook passed the id
# as a bare second positional, which the helper's arg loop shifts past. The id
# stayed "unknown", so backups from every agent collided in one directory and
# metadata.json attributed them all to nobody.
head_ "R2  --agent-id is honoured, not dropped"

case "$BACKUP_PATH" in
    */.backups/roundtrip-agent-1/*)
        ok "backup stored under the agent's own directory" ;;
    */.backups/unknown/*)
        bad "backup stored under .backups/unknown/ -- --agent-id was dropped" ;;
    *)  bad "backup stored at an unexpected location: $BACKUP_PATH" ;;
esac

if [ -f "$BACKUP_PATH/metadata.json" ] \
   && grep -q '"agent_id": *"roundtrip-agent-1"' "$BACKUP_PATH/metadata.json"; then
    ok "metadata.json records the real agent id"
else
    bad "metadata.json does not record agent_id roundtrip-agent-1"
fi

# --- R3: the real round trip, byte for byte ------------------------------
# D3. This is the test the whole pair exists to pass.
head_ "R3  round trip restores the original byte for byte"

cp "$R1/target.txt" "$SCRATCH/r3-expected.txt"
printf 'CLOBBERED\n' > "$R1/target.txt"

R3_OUT=$( cd "$R1" && bash "$RESTORE" "$R1/target.txt" 2>&1 )
R3_RC=$?

if [ "$R3_RC" -eq 0 ]; then
    ok "restore exits 0"
else
    bad "restore exits $R3_RC -- rollback failed (output: $(printf '%s' "$R3_OUT" | tr '\n' '|'))"
fi

if cmp -s "$SCRATCH/r3-expected.txt" "$R1/target.txt"; then
    ok "restored content matches the original byte for byte"
else
    bad "restored content differs from the original"
fi

# --- R4: the legacy sibling convention stays restorable -------------------
# Real .backup-<ts> files written by the deprecated hook are still on disk and
# are the user's rollback safety net. Teaching restore the new convention must
# not cost it the old one.
head_ "R4  legacy \${FILE}.backup-<ts> backups still restore"

R4="$SCRATCH/r4"
mk_work "$R4"
cp "$R4/target.txt" "$SCRATCH/r4-expected.txt"
cp "$R4/target.txt" "$R4/target.txt.backup-1000000000"
printf 'CLOBBERED\n' > "$R4/target.txt"

R4_OUT=$( cd "$R4" && bash "$RESTORE" "$R4/target.txt" 2>&1 )
R4_RC=$?

if [ "$R4_RC" -eq 0 ]; then
    ok "restore exits 0 for a legacy sibling backup"
else
    bad "restore exits $R4_RC for a legacy sibling backup (output: $(printf '%s' "$R4_OUT" | tr '\n' '|'))"
fi

if cmp -s "$SCRATCH/r4-expected.txt" "$R4/target.txt"; then
    ok "legacy backup restored byte for byte"
else
    bad "legacy backup did not restore correctly"
fi

# --- R5: newest wins across both conventions ------------------------------
# A file with both generations on disk must roll back to the most recent state,
# not to whichever convention the script happens to check first.
head_ "R5  most recent backup wins across both conventions"

R5="$SCRATCH/r5"
mk_work "$R5"

# Old legacy backup (timestamp 1000000000, year 2001).
printf 'LEGACY STATE\n' > "$R5/target.txt.backup-1000000000"

# Newer modern backup, taken now.
printf 'MODERN STATE\n' > "$R5/target.txt"
MODERN_PATH=$( cd "$R5" && bash "$PRE_EDIT" "$R5/target.txt" --agent-id "roundtrip-agent-2" )

printf 'CLOBBERED\n' > "$R5/target.txt"
( cd "$R5" && bash "$RESTORE" "$R5/target.txt" ) >/dev/null 2>&1

if [ "$(cat "$R5/target.txt")" = "MODERN STATE" ]; then
    ok "restored the newer modern backup, not the 2001 legacy one"
else
    bad "restored '$(cat "$R5/target.txt")' -- expected MODERN STATE (newest not chosen)"
fi

# --- R6: no backup fails loudly, not silently -----------------------------
# `LATEST=$(ls -t $PATTERN 2>/dev/null | head -1)` under `set -euo pipefail`
# aborts the script on ls's nonzero status before the "No backup found" branch
# is ever reached: exit 2, no message, no explanation.
head_ "R6  missing backup reports a clear error"

R6="$SCRATCH/r6"
mk_work "$R6"

R6_OUT=$( cd "$R6" && bash "$RESTORE" "$R6/target.txt" 2>&1 )
R6_RC=$?

if [ "$R6_RC" -ne 0 ]; then
    ok "restore exits nonzero when no backup exists (exit $R6_RC)"
else
    bad "restore exits 0 when no backup exists"
fi

if printf '%s' "$R6_OUT" | grep -qi "no backup found"; then
    ok "restore explains why it failed"
else
    bad "restore failed silently (exit $R6_RC, output: '$(printf '%s' "$R6_OUT" | tr '\n' '|')')"
fi

# --- R7: no --agent-id yields nothing assignable, never a partial path ----
# The hook requires --agent-id. It must reject the call with an empty stdout so
# BACKUP_PATH is unambiguously empty, never a half-formed path the caller would
# go on to trust.
head_ "R7  omitted --agent-id: empty stdout, nonzero exit, message on stderr"

R7="$SCRATCH/r7"
mk_work "$R7"

R7_ERR="$SCRATCH/r7.err"
R7_OUT=$( cd "$R7" && bash "$PRE_EDIT" "$R7/target.txt" 2>"$R7_ERR" )
R7_RC=$?

if [ "$R7_RC" -ne 0 ]; then
    ok "exits nonzero without --agent-id (exit $R7_RC)"
else
    bad "exits 0 without --agent-id"
fi

if [ -z "$R7_OUT" ]; then
    ok "stdout is empty -- BACKUP_PATH cannot hold a partial path"
else
    bad "stdout is non-empty without --agent-id: '$(printf '%s' "$R7_OUT" | tr '\n' '|')'"
fi

if [ -s "$R7_ERR" ]; then
    ok "diagnostic written to stderr"
else
    bad "no diagnostic on stderr"
fi

# --- R8: failure diagnostics still reach the caller ----------------------
# Splitting the streams must not make backup failures silent: a failing backup
# still has to explain itself on stderr and exit nonzero.
head_ "R8  backup failure is still reported"

R8="$SCRATCH/r8"
mkdir -p "$R8"

R8_ERR="$SCRATCH/r8.err"
R8_OUT=$( cd "$R8" && bash "$PRE_EDIT" "$R8/does-not-exist.txt" --agent-id "roundtrip-agent-3" 2>"$R8_ERR" )
R8_RC=$?

if [ "$R8_RC" -ne 0 ] && [ -z "$R8_OUT" ] && [ -s "$R8_ERR" ]; then
    ok "missing input file: nonzero exit, empty stdout, stderr diagnostic"
else
    bad "missing input file mishandled (exit $R8_RC, stdout '$R8_OUT', stderr $([ -s "$R8_ERR" ] && echo present || echo empty))"
fi

# --- summary --------------------------------------------------------------
printf '\n----------------------------------------\n'
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
