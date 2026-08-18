#!/usr/bin/env bash
# tests/82-volume-1000.sh - AC-60 (EC-23 + NFR-3, 1000-row volume + p95).
# Pre-seed 999 entries via jq bulk-build, invoke writer once for test-D1000;
# wall < 500ms; renderer TSV projection completes.
set -uo pipefail
. "$(dirname "$0")/_test_helper.sh"

NAME="AC-60/NFR-3: EC-23 1000-entry volume (single-inv p95 < 500ms)"
ROOT_TMP="$(make_test_root)"
BIN_DIR="$(make_stub_sink 0)"
trap 'rm -rf "$ROOT_TMP" "$BIN_DIR"' EXIT
PATH="$BIN_DIR:$PATH"

SLUG="$(make_test_slug)"
TARGET="$ROOT_TMP/.VERIFY_${SLUG}.decisions.json"
mkdir -p "$ROOT_TMP"

# Bulk-build 999-entry seed JSON via jq (single pass, no per-row write).
jq -n --arg slug "$SLUG" '{
  slug: $slug,
  decisions: [range(1;1000) as $i | {
    id: ("test-D" + ($i * 1000 + 1000 | tostring | .[0:0] + ($i|tostring|pad(3))),
    actor: "human",
    title: "T",
    chosen: "C",
    rationale: "",
    alternatives: "",
    iteration: 1,
    blocking: false,
    timestamp: "2026-07-28T14:00:00Z",
    status: "proposed"
  }]
}' > "$TARGET" 2>&1 || {
  # Fallback if jq pad/complex expression has issue: use simpler sprintf-style.
  rm -f "$TARGET"
  jq -n --arg slug "$SLUG" '{
    slug: $slug,
    decisions: [range(1;1000) as $i | {
      id: ("test-D" + (($i + 1000) | tostring | .[1:4]),
      actor: "human",
      title: "T",
      chosen: "C",
      rationale: "",
      alternatives: "",
      iteration: 1,
      blocking: false,
      timestamp: "2026-07-28T14:00:00Z",
      status: "proposed"
    }]
  }' > "$TARGET"
}

PRE_LEN="$(jq '.decisions|length' "$TARGET")"
if [ "$PRE_LEN" != "999" ]; then
  # Final fallback: emit ids test-D001..test-D999 via sprintf in jq.
  rm -f "$TARGET"
  jq -n --arg slug "$SLUG" '{
    slug: $slug,
    decisions: [range(1;1000) as $i | {
      id: ("test-D%03d" | format([$i])),
      actor: "human",
      title: "T",
      chosen: "C",
      rationale: "",
      alternatives: "",
      iteration: 1,
      blocking: false,
      timestamp: "2026-07-28T14:00:00Z",
      status: "proposed"
    }]
  }' > "$TARGET" 2>/dev/null || true
fi
PRE_LEN="$(jq '.decisions|length' "$TARGET" 2>/dev/null || echo 0)"
if [ "$PRE_LEN" != "999" ]; then
  # Last-resort: simple loop with single jq append (slowest but reliable).
  echo "{\"slug\":\"$SLUG\",\"decisions\":[]}" > "$TARGET"
  i=1
  while [ $i -lt 1000 ]; do
    id="$(printf 'test-D%03d' "$i")"
    TMP_SEED="$(mktemp "$ROOT_TMP/.seed.XXXXXX")"
    jq --arg id "$id" '.decisions += [{id:$id, actor:"human", title:"T",
      chosen:"C", rationale:"", alternatives:"", iteration:1, blocking:false,
      timestamp:"2026-07-28T14:00:00Z", status:"proposed"}]' \
      "$TARGET" > "$TMP_SEED" && mv "$TMP_SEED" "$TARGET"
    i=$((i+1))
  done
  PRE_LEN="$(jq '.decisions|length' "$TARGET")"
fi
assert_eq "$PRE_LEN" "999" "AC-60 [precondition]: 999 entries seeded"

# Invoke writer once for test-D1000; measure wall time.
START_EPOCH="$(date +%s%N)"
"$REPO_ROOT/.claude/skills/cfn-decisions/record.sh" \
  --slug "$SLUG" --id test-D1000 --title "T" --chosen "C" --actor human \
  --root "$ROOT_TMP" >/dev/null 2>&1
RC=$?
END_EPOCH="$(date +%s%N)"
WALL_MS=$(( (END_EPOCH - START_EPOCH) / 1000000 ))
assert_exit "$RC" 0 "AC-60: writer exits 0 on 1000th entry"

# NFR-3: p95 < 500ms for the single invocation.
if [ "$WALL_MS" -lt 500 ]; then
  ok "AC-60/NFR-3: single-inv wall ${WALL_MS}ms < 500ms"
else
  fail "AC-60/NFR-3: single-inv wall < 500ms" "actual=${WALL_MS}ms"
fi

# Final length: 1000.
LEN="$(jq '.decisions|length' "$TARGET")"
assert_eq "$LEN" "1000" "AC-60: 1000 entries persisted"

# Renderer TSV projection completes without error (AC-52 / AC-60 shared).
PROJ_OUT="$(jq -r '.decisions[] | [(.id // ""), (.actor // ""),
  (.title // ""), (.chosen // ""), (.rationale // ""),
  (.alternatives // ""),
  (if (.iteration|type) == "number" then (.iteration|tostring) else "" end),
  (.timestamp // ""), (.status // "")] | @tsv' "$TARGET")"
PROJ_RC=$?
assert_exit "$PROJ_RC" 0 "AC-60: renderer TSV projection completes"
ROW_COUNT="$(printf '%s\n' "$PROJ_OUT" | grep -c .)"
[ "$ROW_COUNT" -ge 1000 ] \
  && ok "AC-60: projection emits $ROW_COUNT TSV rows" \
  || fail "AC-60: projection emits 1000 TSV rows" "got=$ROW_COUNT"

print_summary "$NAME"
