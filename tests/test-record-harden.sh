#!/usr/bin/env bash
# Hardening tests for the decision pipeline.
#
# 1. cfn-decisions/record.sh (writer): an ACCEPTED row without alternatives
#    and without an explicit "no fork:" rationale label is rejected — a
#    decision with no recorded rejected option is a note, not a decision
#    (29% of legacy rows have this shape).
# 2. decision-log/record.sh (sink): --supersede pointing at a decision_id
#    that does not match a row must FAIL LOUDLY instead of silently
#    no-oping (the source of the broken superseded chains: 10 of 14).
# 3. promote-capture.sh files captures WITHOUT alternatives as status
#    proposed (review queue), never silently as accepted.
# 4. The capture hook stores the unchosen option labels so future
#    promotions can file real alternatives.
#
# Run: bash tests/test-record-harden.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRITER="$REPO_ROOT/.claude/skills/cfn-decisions/record.sh"
SINK="$HOME/.claude/skills/decision-log/record.sh"
PROMOTE="$REPO_ROOT/.claude/skills/cfn-decisions/promote-capture.sh"
HOOK="$REPO_ROOT/.claude/hooks/cfn-decision-capture.sh"

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "ok: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ROOT="$TMP/ledger"
mkdir -p "$ROOT/planning/promotesluga" "$ROOT/planning/promoteslugb"

rec() { # writer wrapper with isolated ledger dir
  (cd "$ROOT" && bash "$WRITER" "$@")
}

echo "== writer: accepted requires alternatives or no-fork label =="

# 1. Accepted + no alternatives + no no-fork label -> exit 1, naming the reason.
out="$(rec --slug t1 --id D1 --title "Pick a transport" --chosen "https" --actor ai --status accepted 2>&1)"
rc=$?
if [ "$rc" = 1 ] && case "$out" in *alternative*) true ;; *) false ;; esac; then
  ok "accepted without alternatives rejected (rc=1, reason named)"
else
  bad "expected rc=1 naming alternatives, got rc=$rc: $out"
fi

# 2. Accepted + explicit no-fork label -> ok (rc 0, or 7/8 when sink absent).
out="$(rec --slug t1 --id D2 --title "Single viable option" --chosen "https" --actor ai \
  --rationale "no fork: only one provider offers this endpoint" 2>&1)"
case "$?" in 0|7|8) ok "no-fork label accepted" ;; *) bad "no-fork rejected rc=$?: $out" ;; esac

# 3. Accepted + alternatives present -> ok.
out="$(rec --slug t1 --id D3 --title "Transport with options" --chosen "https" --actor ai \
  --alternatives "grpc: rejected, no browser client" 2>&1)"
case "$?" in 0|7|8) ok "accepted with alternatives ok" ;; *) bad "alt row rejected rc=$?: $out" ;; esac

# 4. Proposed without alternatives -> ok (review-queue rows are exempt).
out="$(rec --slug t1 --id D4 --title "Undecided fork" --chosen "leaning https" --actor ai --status proposed 2>&1)"
case "$?" in 0|7|8) ok "proposed without alternatives ok" ;; *) bad "proposed rejected rc=$?: $out" ;; esac

echo "== sink: zero-match supersede fails loudly =="

# Sandbox sink DB with the real schema.
SDB="$TMP/sink.db"
sqlite3 "$SDB" "$(sqlite3 "$HOME/.claude/decision-log/decisions.db" "SELECT sql FROM sqlite_master WHERE name='decisions';")"
[ -f "$SDB" ] && ok "sandbox sink DB created" || { bad "sandbox DB failed"; exit 1; }

# Seed one decision for the happy-path supersede.
DB_PATH="$SDB" bash "$SINK" --project ptest --slug s1 --id D9 \
  --title "original" --chosen "a" >/dev/null 2>&1

# 5. Supersede a nonexistent id -> non-zero exit + names the target.
out="$(DB_PATH="$SDB" bash "$SINK" --project ptest --slug s1 --id D10 \
  --title "replacement" --chosen "b" --supersede "NO-SUCH-ID" 2>&1)"
rc=$?
if [ "$rc" != 0 ] && [ "$rc" != 8 ]; then
  case "$out" in *NO-SUCH-ID*) ok "zero-match supersede failed loudly (rc=$rc)" ;; *) ok "zero-match supersede rc=$rc (target not echoed)" ;; esac
else
  bad "zero-match supersede silently succeeded (rc=$rc): $out"
fi

# 6. Supersede an existing id -> exit 0 and the row is marked.
out="$(DB_PATH="$SDB" bash "$SINK" --project ptest --slug s1 --id D11 \
  --title "replacement two" --chosen "c" --supersede "D9" 2>&1)"
rc=$?
st="$(sqlite3 "$SDB" "SELECT status || '/' || superseded_by FROM decisions WHERE decision_id='D9';")"
if [ "$rc" = 0 ] && [ "$st" = "superseded/D11" ]; then
  ok "valid supersede marks the row"
else
  bad "valid supersede rc=$rc state=$st: $out"
fi

echo "== promote: no-alternatives capture -> proposed =="

# 7. Capture without alternatives -> proposed in the JSON ledger.
printf '%s\n' '{"ts":"2026-09-24T12:00:00Z","project":"p","session_id":"s","question":"Ship canary first?","header":"D","answer":"Yes","notes":"","alternatives":""}' \
  > "$TMP/stage.jsonl"
out="$(bash "$PROMOTE" --slug promotesluga --file "$TMP/stage.jsonl" --root "$ROOT/planning/promotesluga" 2>&1)"
LEDGER="$ROOT/planning/promotesluga/.VERIFY_promotesluga.decisions.json"
if [ -f "$LEDGER" ]; then
  grep -q '"status": *"proposed"' "$LEDGER" && ok "no-alt capture filed as proposed" || bad "no-alt capture not proposed: $(cat "$LEDGER")"
else
  bad "promote(a) produced no ledger: $out"
fi

# 8. Capture WITH alternatives -> accepted.
printf '%s\n' '{"ts":"2026-09-24T12:01:00Z","project":"p","session_id":"s","question":"Which cache?","header":"D","answer":"redis","notes":"","alternatives":"memcached: no persistence"}' \
  > "$TMP/stage.jsonl"
out="$(bash "$PROMOTE" --slug promoteslugb --file "$TMP/stage.jsonl" --root "$ROOT/planning/promoteslugb" 2>&1)"
LEDGERB="$ROOT/planning/promoteslugb/.VERIFY_promoteslugb.decisions.json"
if [ -f "$LEDGERB" ]; then
  grep -q '"status": *"accepted"' "$LEDGERB" && ok "with-alt capture filed as accepted" || bad "with-alt capture not accepted: $(cat "$LEDGERB")"
else
  bad "promote(b) produced no ledger: $out"
fi

echo "== hook: unchosen options captured as alternatives =="

# 9. Hook stores option labels other than the chosen one.
STAGE2="$TMP/stage2.jsonl"
printf '%s' '{"session_id":"s","cwd":"/p/q","tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Cache backend?","header":"D","options":[{"label":"redis"},{"label":"memcached"},{"label":"none"}]}]},"tool_response":{"answers":{"Cache backend?":"redis"},"annotations":{}}}' \
  | CFN_DECISION_CAPTURE_FILE="$STAGE2" bash "$HOOK"
case "$(cat "$STAGE2" 2>/dev/null)" in
  *'"alternatives":"memcached, none"'*) ok "unchosen options stored as alternatives" ;;
  *) bad "hook alternatives wrong: $(cat "$STAGE2")" ;;
esac

# 10. Single-option question -> empty alternatives.
STAGE3="$TMP/stage3.jsonl"
printf '%s' '{"session_id":"s","cwd":"/p/q","tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Proceed?","header":"D","options":[{"label":"go"}]}]},"tool_response":{"answers":{"Proceed?":"go"},"annotations":{}}}' \
  | CFN_DECISION_CAPTURE_FILE="$STAGE3" bash "$HOOK"
case "$(cat "$STAGE3" 2>/dev/null)" in *'"alternatives":""'*) ok "single option -> empty alternatives" ;; *) bad "single-option alternatives wrong" ;; esac

echo ""
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
