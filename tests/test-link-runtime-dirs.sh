#!/usr/bin/env bash
# Tests for .claude/cfn-scripts/link-runtime-dirs.sh.
#
# These links are load-bearing: every "$HOME/.claude/skills/cfn-*" invocation
# resolves through them, and on the machine they were first made by hand there
# is no record of how. The risk the script has to carry is that ~/.claude/skills
# may already be somebody's own real directory, so the tests care most about the
# three not-a-correct-link cases: wrong link, real file, populated real dir.
# Every test runs against a sandbox HOME so the live setup is never touched.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$REPO/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

LINKER="$REPO/.claude/cfn-scripts/link-runtime-dirs.sh"
ENTRIES="skills hooks commands agents/cfn-dev-team core helpers cfn-config cfn-data
cfn-extras cfn-scripts adaptive-context agent-principles prompts tooling"
PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); printf 'PASS: %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n     %s\n' "$1" "${2:-}" >&2; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "want [$2] got [$3]"; fi; }

sandbox() {
  local d
  d="$(mktemp -d "${TMPDIR:-/tmp}/link-runtime-XXXXXX")"
  mkdir -p "$d/.claude"
  printf '%s' "$d"
}

# --- 1. a fresh machine reports itself unlinked -------------------------------
SB="$(sandbox)"
HOME="$SB" "$LINKER" --check >/dev/null 2>&1
check "--check exits non-zero when nothing is linked" "1" "$?"

# --- 2. --check does not mutate ----------------------------------------------
check "--check created nothing" "" "$(ls -A "$SB/.claude")"

# --- 3. linking creates every entry as a symlink ------------------------------
HOME="$SB" "$LINKER" >/dev/null 2>&1
MISSING=""
for name in $ENTRIES; do
  [ -L "$SB/.claude/$name" ] || MISSING="$MISSING $name"
done
check "all 14 entries become symlinks" "" "$MISSING"

# --- 4. links point into the repo, not somewhere else -------------------------
check "skills resolves into the repo" \
  "$(readlink -f "$REPO/.claude/skills")" \
  "$(readlink -f "$SB/.claude/skills")"

# --- 5. the nested entry keeps ~/.claude/agents a real directory --------------
# Linking all of agents/ would hide the project-local agents that live there.
if [ -d "$SB/.claude/agents" ] && [ ! -L "$SB/.claude/agents" ]; then
  ok "~/.claude/agents stays a real dir with only cfn-dev-team linked"
else
  bad "~/.claude/agents stays a real dir with only cfn-dev-team linked" \
      "$(ls -ld "$SB/.claude/agents")"
fi

# --- 6. a skill is reachable through the link --------------------------------
check "skill file readable through the symlink" "yes" \
  "$([ -f "$SB/.claude/skills/cfn-spec/SKILL.md" ] && echo yes || echo no)"

# --- 7. --check passes once linked -------------------------------------------
HOME="$SB" "$LINKER" --check >/dev/null 2>&1
check "--check exits zero once linked" "0" "$?"

# --- 8. re-running changes nothing -------------------------------------------
OUT="$(HOME="$SB" "$LINKER" 2>&1)"
case "$OUT" in
  *"0 linked, 14 already correct"*) ok "re-run is a no-op" ;;
  *) bad "re-run is a no-op" "$OUT" ;;
esac
case "$OUT" in
  *"Replaced paths kept at"*) bad "no-op run does not claim a backup" "$OUT" ;;
  *) ok "no-op run does not claim a backup" ;;
esac
rm -rf "$SB"

# --- 9. a symlink to somewhere else is a conflict, backed up not clobbered ----
SB2="$(sandbox)"
mkdir -p "$SB2/elsewhere/skills"
printf 'someone elses tree\n' > "$SB2/elsewhere/skills/marker.txt"
ln -s "$SB2/elsewhere/skills" "$SB2/.claude/skills"
OUT="$(HOME="$SB2" "$LINKER" 2>&1)"
case "$OUT" in
  *"pointed at"*) ok "a wrong symlink is reported loudly" ;;
  *) bad "a wrong symlink is reported loudly" "$OUT" ;;
esac
BK="$(ls -d "$SB2"/.claude-runtime-links-backup-* 2>/dev/null | tail -1)"
check "the wrong symlink itself is preserved in the backup" \
  "$(readlink -f "$SB2/elsewhere/skills")" "$(readlink -f "$BK/skills" 2>/dev/null)"
check "skills now points into the repo" \
  "$(readlink -f "$REPO/.claude/skills")" "$(readlink -f "$SB2/.claude/skills")"
check "the other tree still has its file" "someone elses tree" \
  "$(cat "$SB2/elsewhere/skills/marker.txt" 2>/dev/null)"
rm -rf "$SB2"

# --- 10. a populated real dir is refused without --force ---------------------
SB3="$(sandbox)"
mkdir -p "$SB3/.claude/skills/my-own-skill"
printf 'IRREPLACEABLE\n' > "$SB3/.claude/skills/my-own-skill/SKILL.md"
OUT="$(HOME="$SB3" "$LINKER" 2>&1)"; RC=$?
check "a populated real dir makes the run fail" "1" "$RC"
case "$OUT" in
  *REFUSING*) ok "a populated real dir is refused loudly" ;;
  *) bad "a populated real dir is refused loudly" "$OUT" ;;
esac
check "the refused dir is left exactly as it was" "IRREPLACEABLE" \
  "$(cat "$SB3/.claude/skills/my-own-skill/SKILL.md" 2>/dev/null)"

# --- 11. --force moves it aside instead of deleting it ----------------------
HOME="$SB3" "$LINKER" --force >/dev/null 2>&1
BK="$(ls -d "$SB3"/.claude-runtime-links-backup-* 2>/dev/null | tail -1)"
check "--force backs the dir up, never deletes it" "IRREPLACEABLE" \
  "$(cat "$BK/skills/my-own-skill/SKILL.md" 2>/dev/null)"
check "--force then links skills into the repo" \
  "$(readlink -f "$REPO/.claude/skills")" "$(readlink -f "$SB3/.claude/skills")"
rm -rf "$SB3"

# --- 12. an unknown flag is rejected, not ignored ----------------------------
SB4="$(sandbox)"
HOME="$SB4" "$LINKER" --bogus >/dev/null 2>&1
check "an unknown flag exits 2" "2" "$?"
check "an unknown flag mutates nothing" "" "$(ls -A "$SB4/.claude")"
rm -rf "$SB4"

echo "---"
echo "link-runtime-dirs: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
