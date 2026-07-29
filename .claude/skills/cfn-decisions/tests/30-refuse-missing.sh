#!/usr/bin/env bash
# tests/30-refuse-missing.sh - AC-3 + AC-42 (FR-3 per-field refuse + OBS-2).
# Unit/integration: refuse on missing/empty/whitespace required field.
# Each required field tested individually with a clean slug; the field under
# test is blanked and the others kept valid.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-3/42: FR-3 refuse-on-missing per field (no value echoed, no FS mod)"

ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

# Helper: run one refuse sub-case.
# Args: case_name field_name blank_value argv...
# Caller passes --root separately; we add it here.
# Asserts: exit 1, stderr names field, stderr does not echo supplied value,
# no record.sh invocation.
run_refuse_case() {
  local case_name="$1" field_name="$2"; shift 2
  local slug
  slug="$(make_test_slug)"
  local out rc
  out="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
    "$@" --root "$ROOT_TMP" 2>&1)"
  rc=$?
  assert_exit "$rc" 1 "AC-42 [$case_name]: exit 1"
  assert_contains "$out" "missing required field: $field_name" \
    "AC-42 [$case_name]: stderr names $field_name"
  assert_not_contains "$out" "unknown arg" \
    "AC-42 [$case_name]: not an unknown-arg error"
  # record.sh NOT invoked (refuse happens before sink delegation).
  [ ! -f "$BIN_DIR/last-argv" ] \
    && ok "AC-42 [$case_name]: record.sh NOT invoked" \
    || fail "AC-42 [$case_name]: record.sh NOT invoked"
  rm -f "$BIN_DIR/last-argv"
}

# Each required field individually: blank only that field, others valid.
# Slug blank.
run_refuse_case "blank-slug" "slug" \
  --slug "" --id test-D02 --title "T" --chosen "C" --actor human
# Id blank.
run_refuse_case "blank-id" "id" \
  --slug test-dec-aaaaaa --id "" --title "T" --chosen "C" --actor human
# Title empty.
run_refuse_case "empty-title" "title" \
  --slug test-dec-bbbbbb --id test-D03 --title "" --chosen "C" --actor human
# Title whitespace-only.
run_refuse_case "ws-title" "title" \
  --slug test-dec-cccccc --id test-D04 --title "   " --chosen "C" --actor human
# Chosen empty.
run_refuse_case "empty-chosen" "chosen" \
  --slug test-dec-dddddd --id test-D05 --title "T" --chosen "" --actor human
# Chosen whitespace-only.
run_refuse_case "ws-chosen" "chosen" \
  --slug test-dec-eeeeee --id test-D06 --title "T" --chosen "   " --actor human
# Actor omitted entirely.
run_refuse_case "omitted-actor" "actor" \
  --slug test-dec-ffffff --id test-D07 --title "T" --chosen "C"
# Actor empty string.
run_refuse_case "empty-actor" "actor" \
  --slug test-dec-111111 --id test-D08 --title "T" --chosen "C" --actor ""

# Slug regex violation (not ^[a-z0-9][a-z0-9_-]{0,59}$).
SLUG_BAD="$(make_test_slug)"
OUT_BAD="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "UPPER-CASE-INVALID" --id test-D09 --title "T" --chosen "C" \
  --actor human --root "$ROOT_TMP" 2>&1)"
rc=$?
assert_exit "$rc" 1 "AC-3 [bad-slug-regex]: exit 1 on uppercase slug"
assert_contains "$OUT_BAD" "slug must match" \
  "AC-3 [bad-slug-regex]: stderr names slug regex"

# FR-9 leak check: a supplied --chosen "marker-XYZ" value must NOT leak when
# the SAME invocation fails on a different blank field.
SLUG_LEAK="$(make_test_slug)"
OUT_LEAK="$("$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_LEAK" --id test-D10 --title "   " \
  --chosen "marker-XYZ-LEAK" --actor human --root "$ROOT_TMP" 2>&1)"
assert_not_contains "$OUT_LEAK" "marker-XYZ-LEAK" \
  "AC-3 [FR-9]: supplied chosen value NOT echoed in stderr"

# Byte-identity: pre-existing target file must be UNCHANGED when refuse fires
# (no partial write, no tmpfile leak).
SLUG_PRE="$(make_test_slug)"
mkdir -p "$ROOT_TMP"
PRE_FILE="$ROOT_TMP/.VERIFY_${SLUG_PRE}.decisions.json"
echo "{\"slug\":\"$SLUG_PRE\",\"decisions\":[]}" > "$PRE_FILE"
PRE_HASH="$(sha256sum "$PRE_FILE" | awk '{print $1}')"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG_PRE" --id test-D11 --title "" --chosen "C" --actor human \
  --root "$ROOT_TMP" >/dev/null 2>&1
POST_HASH="$(sha256sum "$PRE_FILE" | awk '{print $1}')"
assert_eq "$POST_HASH" "$PRE_HASH" \
  "AC-42: target byte-identical after refuse fires"

print_summary "$NAME"
