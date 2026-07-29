#!/usr/bin/env bash
# tests/33-exit-4-filesystem.sh - AC-22 + AC-51 (exit 4 / EC-9 / EC-11 / EC-24).
# Integration: real FS, controlled failure modes.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-22/51: exit 4 on filesystem failure (dir RO, mktemp/mv fail)"

# EC-9 variant (a): --root points at a nonexistent dir.
OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug test-dec-aaaaaa --id test-D01 --title "T" --chosen "C" \
  --actor human --root /nonexistent-dir-xyz 2>&1)"
RC=$?
assert_exit "$RC" 4 "AC-22 [EC-9a nonexistent-dir]: exit 4"
assert_contains "$OUT" "planning dir missing or read-only: /nonexistent-dir-xyz" \
  "AC-22 [EC-9a]: stderr names the dir"

# EC-11: read-only dir. Use a mktemp -d, chmod 0500, write should fail.
ROOT_RO="$(mktemp -d)"
chmod 0500 "$ROOT_RO"
OUT="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug test-dec-bbbbbb --id test-D01 --title "T" --chosen "C" \
  --actor human --root "$ROOT_RO" 2>&1)"
RC=$?
assert_exit "$RC" 4 "AC-22 [EC-11 RO dir]: exit 4"
chmod 0700 "$ROOT_RO"  # restore so cleanup works
rm -rf "$ROOT_RO"

# EC-9 variant (b): mv fails. Stub `mv` on PATH to exit 1.
ROOT_MV="$(mktemp -d)"
BIN_DIR="$(mktemp -d)"
trap 'rm -rf "$ROOT_MV" "$BIN_DIR" "$ROOT_TMP"' EXIT
# Create a stub `mv` that exits 1 (simulates disk full at mv).
cat > "$BIN_DIR/mv" <<'STUB'
#!/usr/bin/env bash
exit 1
STUB
chmod +x "$BIN_DIR/mv"
OUT="$(PATH="$BIN_DIR:$PATH" "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug test-dec-cccccc --id test-D01 --title "T" --chosen "C" \
  --actor human --root "$ROOT_MV" 2>&1)"
RC=$?
assert_exit "$RC" 4 "AC-22 [EC-24 mv fail]: exit 4"
assert_contains "$OUT" "mv failed to commit" \
  "AC-22 [EC-24 mv fail]: stderr names mv failure"

# No .VERIFY file at target.
[ ! -f "$ROOT_MV/.VERIFY_test-dec-cccccc.decisions.json" ] \
  && ok "AC-22 [EC-24 mv fail]: no JSON at target" \
  || fail "AC-22 [EC-24 mv fail]: no JSON at target"

# No .dec.XXXXXX temp file lingers.
TMP_COUNT="$(find "$ROOT_MV" -name '.dec.*' 2>/dev/null | wc -l)"
assert_eq "$TMP_COUNT" "0" "AC-22 [EC-24 mv fail]: no temp file lingers"

# EC-9 variant (c): mktemp fails. Stub `mktemp` to exit 1.
ROOT_MK="$(mktemp -d)"
BIN_MK="$(mktemp -d)"
cat > "$BIN_MK/mktemp" <<'STUB'
#!/usr/bin/env bash
exit 1
STUB
chmod +x "$BIN_MK/mktemp"
OUT="$(PATH="$BIN_MK:$PATH" "$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug test-dec-dddddd --id test-D01 --title "T" --chosen "C" \
  --actor human --root "$ROOT_MK" 2>&1)"
RC=$?
assert_exit "$RC" 4 "AC-22 [EC-9 mktemp fail]: exit 4"
assert_contains "$OUT" "mktemp failed in" \
  "AC-22 [EC-9 mktemp fail]: stderr names mktemp failure"
rm -rf "$ROOT_MK" "$BIN_MK"

# AC-51 sub-assertion: EXIT trap removes temp file even under signal.
# We simulate by running the writer in the background and kill -TERM mid-run.
ROOT_KILL="$(mktemp -d)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug test-dec-eeeeee --id test-D01 --title "T" --chosen "C" \
  --actor human --root "$ROOT_KILL" >/dev/null 2>&1 &
WPID=$!
sleep 0.05  # let it start
kill -TERM "$WPID" 2>/dev/null || true
wait "$WPID" 2>/dev/null || true
TMP_COUNT="$(find "$ROOT_KILL" -name '.dec.*' 2>/dev/null | wc -l)"
assert_eq "$TMP_COUNT" "0" "AC-51: EXIT trap removes temp file on TERM"
rm -rf "$ROOT_KILL"

print_summary "$NAME"
