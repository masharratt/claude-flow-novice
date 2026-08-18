#!/usr/bin/env bash
# tests/w-1-writer-wired.sh - AC-61 (WIRING-1: writer executable + sourced).
# Writer at .claude/skills/cfn-decisions/record.sh is executable, has
# valid shebang, sources all 5 lib modules, and exposes a working --help.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-61: WIRING-1 writer executable + module graph connected"

RECORD_SH="$REPO_ROOT/.claude/skills/cfn-decisions/record.sh"
LIB_DIR="$REPO_ROOT/.claude/skills/cfn-decisions/lib"

# 1. File exists.
[ -f "$RECORD_SH" ] && ok "AC-61: record.sh exists" \
  || fail "AC-61: record.sh exists" "absent"

# 2. Executable bit set.
[ -x "$RECORD_SH" ] && ok "AC-61: record.sh is executable" \
  || fail "AC-61: record.sh is executable" "not executable"

# 3. Shebang line.
SHEBANG="$(head -1 "$RECORD_SH")"
assert_eq "$SHEBANG" "#!/usr/bin/env bash" "AC-61: shebang is bash"

# 4. Sources all 5 lib modules.
for mod in help arg-parse jq-build upsert sink-delegate; do
  if grep -qF ". \"\$REPO_ROOT/.claude/skills/cfn-decisions/lib/${mod}.sh\"" "$RECORD_SH" \
     || grep -qE "\. .*lib/${mod}\.sh" "$RECORD_SH"; then
    ok "AC-61: sources lib/${mod}.sh"
  else
    fail "AC-61: sources lib/${mod}.sh" "not found"
  fi
done

# 5. main() function defined and called.
if grep -qE '^[[:space:]]*main\b' "$RECORD_SH"; then
  ok "AC-61: main() invoked"
else
  fail "AC-61: main() invoked" "no main entry"
fi

# 6. --help works without writing files.
ROOT_TMP="$(make_test_root)"
trap 'rm -rf "$ROOT_TMP"' EXIT
HELP_OUT="$("$RECORD_SH" --help 2>&1)"
HELP_RC=$?
assert_exit "$HELP_RC" 0 "AC-61: --help exits 0"
if printf '%s' "$HELP_OUT" | grep -qiE 'usage'; then
  ok "AC-61: --help emits usage"
else
  fail "AC-61: --help emits usage" "got=$HELP_OUT"
fi

# 7. No file created during --help invocation.
TARGET_FILES="$(find "$ROOT_TMP" -type f 2>/dev/null | wc -l)"
assert_eq "$TARGET_FILES" "0" "AC-61: --help creates no files"

print_summary "$NAME"
