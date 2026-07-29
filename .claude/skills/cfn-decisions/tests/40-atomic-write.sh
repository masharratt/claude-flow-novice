#!/usr/bin/env bash
# tests/40-atomic-write.sh - AC-4 (FR-4 atomic mktemp+mv, RED FIRST priority).
# Integration: real FS, signal simulation, mv-fail simulation.
#
# THIS IS THE LOAD-BEARING TEST that catches the half-written-file failure
# mode that bless-verify.sh:137-149 prior art was designed to avoid. A
# `kill -9` mid-write that leaves a partial file is the precise failure this
# writer must avoid via POSIX rename(2) atomicity.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-4: FR-4 atomic write (kill -9 leaves OLD file; no partial observable)"

# (a) Seed a valid file, start writer in background, kill -9 mid-run, assert
#     the target is EITHER the OLD content OR the NEW content (never partial).
ROOT_TMP="$(make_test_root)"
trap 'rm -rf "$ROOT_TMP" "$ROOT_KILL"' EXIT
SLUG="$(make_test_slug)"
TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"

# Seed: write a known-valid OLD file via the writer itself.
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D01 --title "old" --chosen "old" --actor human \
  --root "$ROOT_TMP" >/dev/null 2>&1
PRE_HASH="$(sha256sum "$TARGET" | awk '{print $1}')"

# Background a second writer call (slow, with a long rationale to give us a
# window). Then kill -9 mid-run. We can't reliably hit the exact mktemp-mv
# window, but we CAN assert that AFTER the kill, the file is EITHER the OLD
# hash OR a NEW valid JSON (never a partial / never invalid).
ROOT_KILL="$(make_test_root)"
SLUG_KILL="$(make_test_slug)"
TARGET_KILL="$ROOT_KILL/.VERIFY_${SLUG_KILL}.decisions.json"

# Seed the kill target with a valid OLD file.
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_KILL" --id test-D01 --title "old" --chosen "old" --actor human \
  --root "$ROOT_KILL" >/dev/null 2>&1
OLD_HASH_KILL="$(sha256sum "$TARGET_KILL" | awk '{print $1}')"

# Start a writer in the background.
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_KILL" --id test-D01 --title "new" --chosen "new" --actor ai \
  --root "$ROOT_KILL" >/dev/null 2>&1 &
WPID=$!
# Kill mid-run with SIGKILL (unblockable; cannot run the EXIT trap).
sleep 0.02
kill -9 "$WPID" 2>/dev/null || true
wait "$WPID" 2>/dev/null || true

# After kill: file must be EITHER the OLD content OR a valid NEW JSON.
# Never partial / never invalid.
if jq empty "$TARGET_KILL" >/dev/null 2>&1; then
  ok "AC-4 (a): target is valid JSON after kill -9"
else
  fail "AC-4 (a): target is valid JSON after kill -9" "partial file observed"
fi

POST_HASH_KILL="$(sha256sum "$TARGET_KILL" 2>/dev/null | awk '{print $1}')"
if [ "$POST_HASH_KILL" = "$OLD_HASH_KILL" ]; then
  ok "AC-4 (a): target retained OLD content (kill before rename)"
else
  # If kill landed after rename, target should be the NEW valid JSON.
  NEW_TITLE="$(jq -r '.decisions[]|select(.id=="test-D01").title' "$TARGET_KILL" 2>/dev/null)"
  if [ "$NEW_TITLE" = "new" ]; then
    ok "AC-4 (a): target = NEW content (kill after rename; still valid)"
  else
    fail "AC-4 (a): target = OLD or NEW" "got neither (hash=$POST_HASH_KILL title=$NEW_TITLE)"
  fi
fi

# No temp files linger after kill -9 (the writer's mktemp creates .dec.XXXXXX;
# SIGKILL cannot run the trap, so a temp MAY linger on the rare race. Assert
# at most ONE temp file exists, and remove any stragglers. This is a soft
# assertion: SIGKILL semantics do not guarantee trap execution.)
TMP_COUNT="$(find "$ROOT_KILL" -name '.dec.*' 2>/dev/null | wc -l)"
if [ "$TMP_COUNT" -le 1 ]; then
  ok "AC-4 (a): no temp-file explosion after kill -9 (count=$TMP_COUNT)"
else
  fail "AC-4 (a): no temp-file explosion" "count=$TMP_COUNT"
fi
find "$ROOT_KILL" -name '.dec.*' -exec rm -f {} \; 2>/dev/null

# (b) Simulate mv failure: chmod 0500 on --root AFTER writer has called
#     mktemp. Writer must exit 4; NO partial at target; NO temp lingers.
ROOT_RO="$(mktemp -d)"
SLUG_RO="$(make_test_slug)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_RO" --id test-D01 --title "T" --chosen "C" --actor human \
  --root "$ROOT_RO" >/dev/null 2>&1
# (The first call commits a valid file; the second call will try to upsert,
# which calls mktemp. We revoke write permission BEFORE the call so mktemp
# itself fails with EROFS.)
chmod 0500 "$ROOT_RO"
OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_RO" --id test-D02 --title "T2" --chosen "C2" --actor ai \
  --root "$ROOT_RO" 2>&1)"
RC=$?
assert_exit "$RC" 4 "AC-4 (b): exit 4 on RO dir after seed"
# No test-D02 file modification (the existing file should still only have D01).
NEW_COUNT="$(jq '[.decisions[]|select(.id=="test-D02")]|length' \
  "$ROOT_RO/.VERIFY_${SLUG_RO}.decisions.json" 2>/dev/null)"
chmod 0700 "$ROOT_RO"  # restore for cleanup
assert_eq "$NEW_COUNT" "0" "AC-4 (b): test-D02 NOT added to existing file"
TMP_COUNT_RO="$(find "$ROOT_RO" -name '.dec.*' 2>/dev/null | wc -l)"
assert_eq "$TMP_COUNT_RO" "0" "AC-4 (b): no temp file lingers on RO failure"

# Original D01 entry unchanged.
D01_TITLE="$(jq -r '.decisions[]|select(.id=="test-D01").title' \
  "$ROOT_RO/.VERIFY_${SLUG_RO}.decisions.json" 2>/dev/null)"
assert_eq "$D01_TITLE" "T" "AC-4 (b): original D01 entry unchanged"

print_summary "$NAME"
