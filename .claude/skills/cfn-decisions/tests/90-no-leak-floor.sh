#!/usr/bin/env bash
# tests/90-no-leak-floor.sh - AC-15 + AC-39 (FR-9 INFO-LEAK GUARD).
# stdout: id status\n ONLY. stderr: field NAMES, codes, PATHS only; never
# field VALUES (no rationale, alternatives, title, chosen). Sink stderr
# suppressed (2>/dev/null).
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-15/39: FR-9 info-leak floor (stdout=id status; no values in stderr)"

ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"
SLUG="$(make_test_slug)"

# Sentinel-bearing values: must NEVER appear in stderr.
SECRET_RATIONALE="secret-marker-ZZY-12345"
SECRET_ALTERNATIVES="alt-secret-ZZY-99999"
SECRET_TITLE="Title-Secret-Foo-XYZ"
SECRET_CHOSEN="Chosen-Secret-Bar-QQQ"

# Happy path: capture stdout+stderr separately.
STDOUT_F="$ROOT_TMP/out.txt"
STDERR_F="$ROOT_TMP/err.txt"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DS1 --title "$SECRET_TITLE" \
  --chosen "$SECRET_CHOSEN" --rationale "$SECRET_RATIONALE" \
  --alternatives "$SECRET_ALTERNATIVES" --actor human --root "$ROOT_TMP" \
  >"$STDOUT_F" 2>"$STDERR_F"
RC=$?
assert_exit "$RC" 0 "AC-39: happy path exits 0"

# stdout: exactly "id status\n".
OUT_LINE="$(cat "$STDOUT_F")"
assert_eq "$OUT_LINE" "test-DS1 proposed" \
  "AC-15: stdout is '<id> <status>' only"

# stderr: must NOT contain any secret value.
for secret in "$SECRET_RATIONALE" "$SECRET_ALTERNATIVES" "$SECRET_TITLE" "$SECRET_CHOSEN"; do
  if grep -qF "$secret" "$STDERR_F"; then
    fail "AC-15: stderr leaks field value" "leaked=$secret"
  else
    ok "AC-15: stderr omits value sentinel ($secret)"
  fi
done

# stderr may be empty on happy path (sink stderr suppressed 2>/dev/null).
# That is the FR-9 contract.

# Error path: validation failure. stderr must carry field NAME, not value.
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DS2 --title "" --chosen "$SECRET_CHOSEN" \
  --rationale "$SECRET_RATIONALE" --actor human --root "$ROOT_TMP" \
  >"$ROOT_TMP/out2.txt" 2>"$ROOT_TMP/err2.txt"
RC2=$?
assert_exit "$RC2" 1 "AC-15: validation failure exits E_VALIDATION=1"

# Field NAMES ok in stderr.
ERR2="$(cat "$ROOT_TMP/err2.txt")"
if printf '%s' "$ERR2" | grep -qE '(title|missing|required)'; then
  ok "AC-15: stderr names missing field"
else
  fail "AC-15: stderr names missing field" "got=$ERR2"
fi
# Value must NOT leak.
for secret in "$SECRET_RATIONALE" "$SECRET_CHOSEN"; do
  if grep -qF "$secret" "$ROOT_TMP/err2.txt"; then
    fail "AC-15: error-path stderr leaks value" "leaked=$secret"
  else
    ok "AC-15: error-path stderr omits value ($secret)"
  fi
done

# Sink-nonzero path: stub exits 17; its stderr suppressed, no leak.
BIN_DIR2="$(make_stub_sink 17)"
PATH="$BIN_DIR2:$PATH"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-DS3 --title T --chosen C \
  --rationale "$SECRET_RATIONALE" --actor human --root "$ROOT_TMP" \
  >"$ROOT_TMP/out3.txt" 2>"$ROOT_TMP/err3.txt"
RC3=$?
assert_exit "$RC3" 8 "AC-15: sink-nonzero exits E_SINK_NONZERO=8"
if grep -qF "$SECRET_RATIONALE" "$ROOT_TMP/err3.txt"; then
  fail "AC-15: sink-nonzero path leaks rationale via stderr" "leaked=$SECRET_RATIONALE"
else
  ok "AC-15: sink-nonzero path omits value (sink stderr suppressed)"
fi

rm -rf "$BIN_DIR2"

print_summary "$NAME"
