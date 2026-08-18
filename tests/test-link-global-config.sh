#!/usr/bin/env bash
# Tests for .claude/cfn-scripts/link-global-config.sh.
#
# The script replaces entries in a real ~/.claude/. The thing that matters most
# is that it never destroys a file it did not create: on a machine that already
# has a hand-edited CLAUDE.md, that file is the only copy in existence. Every
# test runs against a sandbox HOME so the live setup is never touched.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$REPO/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

LINKER="$REPO/.claude/cfn-scripts/link-global-config.sh"
PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); printf 'PASS: %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n     %s\n' "$1" "${2:-}" >&2; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "want [$2] got [$3]"; fi; }

sandbox() {
  local d
  d="$(mktemp -d "${TMPDIR:-/tmp}/link-global-XXXXXX")"
  mkdir -p "$d/.claude"
  printf '%s' "$d"
}

# --- 1. a fresh machine reports itself unlinked -------------------------------
SB="$(sandbox)"
HOME="$SB" "$LINKER" --check >/dev/null 2>&1
check "--check exits non-zero when nothing is linked" "1" "$?"

# --- 2. linking creates every entry as a symlink ------------------------------
HOME="$SB" "$LINKER" >/dev/null 2>&1
MISSING=""
for name in CLAUDE.md RTK.md model-pricing.md rules references; do
  [ -L "$SB/.claude/$name" ] || MISSING="$MISSING $name"
done
check "all 5 entries become symlinks" "" "$MISSING"

# --- 3. links point into the repo, not somewhere else -------------------------
check "CLAUDE.md resolves into .claude/global" \
  "$(readlink -f "$REPO/.claude/global/CLAUDE.md")" \
  "$(readlink -f "$SB/.claude/CLAUDE.md")"

# --- 4. --check passes once linked --------------------------------------------
HOME="$SB" "$LINKER" --check >/dev/null 2>&1
check "--check exits zero once linked" "0" "$?"

# --- 5. the guide is readable through the link --------------------------------
check "guide readable through the symlink" \
  "# CFN Operating Guide" \
  "$(head -1 "$SB/.claude/CLAUDE.md" | cut -d' ' -f1-4)"

# --- 6. re-running changes nothing --------------------------------------------
OUT="$(HOME="$SB" "$LINKER" 2>&1)"
case "$OUT" in
  *"0 linked, 5 already correct"*) ok "re-run is a no-op" ;;
  *) bad "re-run is a no-op" "$OUT" ;;
esac

# --- 7. a no-op run must not claim it backed something up ---------------------
# Regression: BACKUP is timestamped to the second, so a same-second re-run found
# the previous run's directory already present and printed a backup line for a
# backup it never made.
case "$OUT" in
  *"Replaced files kept at"*) bad "no-op run does not claim a backup" "$OUT" ;;
  *) ok "no-op run does not claim a backup" ;;
esac
rm -rf "$SB"

# --- 8. a pre-existing real file is preserved, never deleted ------------------
SB2="$(sandbox)"
mkdir -p "$SB2/.claude/rules"
printf 'IRREPLACEABLE LOCAL EDIT\n' > "$SB2/.claude/CLAUDE.md"
printf 'local rule\n'              > "$SB2/.claude/rules/local-only.md"
HOME="$SB2" "$LINKER" >/dev/null 2>&1
BK="$(ls -d "$SB2"/.claude-global-config-backup-* 2>/dev/null | tail -1)"
RECOVERED="$(cat "$BK/CLAUDE.md" 2>/dev/null)|$(cat "$BK/rules/local-only.md" 2>/dev/null)"
check "pre-existing files are backed up, not deleted" \
  "IRREPLACEABLE LOCAL EDIT|local rule" "$RECOVERED"
rm -rf "$SB2"

echo "---"
echo "link-global-config: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
