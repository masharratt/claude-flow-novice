#!/usr/bin/env bash
# Night mode test suite: flag lifecycle + doctor (group 1), guard (group 2),
# inject (group 3), report (group 4), end-to-end deny-text executability (group 5).
# Isolation: every run uses a temp state dir, temp settings file, temp decisions DB.
# NEVER touches real $HOME/.claude state or the real settings file.
# Conventions per tests/test-decision-record.sh (ok/no counters, trap cleanup EXIT).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NM="$ROOT/.claude/skills/cfn-night-mode/night-mode.sh"
GUARD="$ROOT/.claude/hooks/cfn-night-mode-guard.sh"
INJECT="$ROOT/.claude/hooks/cfn-night-mode-inject.sh"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/nm-test-XXXXXX")
export CFN_NIGHT_MODE_DIR="$TMP/home"       # flag / pending / events live here
export CFN_NIGHT_SETTINGS="$TMP/settings.json"
export DB_PATH="$TMP/decisions.db"
NIGHT_DIR="$CFN_NIGHT_MODE_DIR"
FLAG="$NIGHT_DIR/.night-mode-active"
PENDING="$NIGHT_DIR/.night-mode-pending-review"
EVENTS="$NIGHT_DIR/.night-mode-events.log"
SETTINGS_FILE="$CFN_NIGHT_SETTINGS"

PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }
cleanup(){ rm -rf "$TMP"; }
trap cleanup EXIT

# missing deps: fail loudly, do not half-run against the real environment
for dep in jq sqlite3 date mktemp; do
    command -v "$dep" >/dev/null 2>&1 || { echo "FATAL: $dep not on PATH"; exit 1; }
done

SKILL_DIR="$HOME/.claude/skills/decision-log"
sqlite3 "$DB_PATH" < "$SKILL_DIR/schema.sql"

TODAY=$(date +%F)
YDAY=$(date -d "yesterday" +%F)
ASK_PAYLOAD='{"session_id":"s1","hook_event_name":"PreToolUse","tool_name":"AskUserQuestion","tool_input":{"questions":[{"question":"Which auth provider?"}]}}'
PLAN_PAYLOAD='{"session_id":"s1","hook_event_name":"PreToolUse","tool_name":"EnterPlanMode","tool_input":{}}'
EXITPLAN_PAYLOAD='{"session_id":"s1","hook_event_name":"PreToolUse","tool_name":"ExitPlanMode","tool_input":{"plan":"do things"}}'
SS_PAYLOAD='{"session_id":"s1","hook_event_name":"SessionStart","source":"startup"}'
UPS_PAYLOAD='{"session_id":"s1","hook_event_name":"UserPromptSubmit","prompt":"continue working"}'

reset_state(){
    rm -rf "$NIGHT_DIR"; mkdir -p "$NIGHT_DIR"
    rm -f "$DB_PATH"; sqlite3 "$DB_PATH" < "$SKILL_DIR/schema.sql"
}
rec(){ # rec <slug> <id> <title> <chosen> [extra record.sh args...]
    local slug=$1 id=$2 title=$3 chosen=$4; shift 4
    bash "$SKILL_DIR/record.sh" --slug "$slug" --id "$id" --title "$title" \
        --chosen "$chosen" --project nmtest "$@" >/dev/null
}

echo "=== group 1: flag lifecycle + doctor ==="
reset_state

bash "$NM" on >/dev/null 2>&1; RC_ON=$?
{ [ "$RC_ON" = "0" ] && [ -f "$FLAG" ]; } && ok "on exits 0 and writes flag" || no "on (rc=$RC_ON flag=$([ -f "$FLAG" ] && echo y || echo n))"
TS1=$(cat "$FLAG" 2>/dev/null || echo "")
echo "$TS1" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' \
  && ok "flag content is parseable ISO UTC timestamp ($TS1)" || no "flag ts malformed ($TS1)"

if [ -n "$TS1" ]; then
    sleep 1
    bash "$NM" on >/dev/null 2>&1
    TS2=$(cat "$FLAG" 2>/dev/null || echo "")
    { [ -n "$TS2" ] && [ "$TS1" = "$TS2" ]; } \
      && ok "double-on is idempotent (original ts kept)" || no "double-on changed ts ($TS1 -> $TS2)"
else
    no "double-on idempotence untestable (no valid ts)"
fi

ST_OUT=$(bash "$NM" status 2>/dev/null)
echo "$ST_OUT" | grep -qi "on (" && echo "$ST_OUT" | grep -q "${TS1:0:10}" \
  && ok "status reflects ON with since date" || no "status on-state (out=$ST_OUT)"

OFF_OUT=$(bash "$NM" off 2>/dev/null); RC_OFF=$?
{ [ ! -f "$FLAG" ] && [ "$RC_OFF" = "0" ] && [ -n "$OFF_OUT" ]; } \
  && ok "off unlinks flag, rc 0, prints output" || no "off (rc=$RC_OFF exists=$([ -f "$FLAG" ] && echo y || echo n))"

ST_OUT=$(bash "$NM" status 2>/dev/null)
echo "$ST_OUT" | grep -qi "active: off\|mode: off\|night mode: off" \
  && ok "status reflects OFF after off" || no "status off-state (out=$ST_OUT)"

# doctor verify-only against fixture without registrations: exit 1, names all three events
printf '{"permissions":{"allow":[]}}\n' > "$SETTINGS_FILE"
DOC_OUT=$(bash "$NM" doctor 2>&1); DOC_RC=$?
{ [ "$DOC_RC" = "1" ] \
  && echo "$DOC_OUT" | grep -q "PreToolUse" \
  && echo "$DOC_OUT" | grep -q "SessionStart" \
  && echo "$DOC_OUT" | grep -q "UserPromptSubmit"; } \
  && ok "doctor exits 1 naming all three missing registrations" || no "doctor missing-regs (rc=$DOC_RC out=$DOC_OUT)"

# doctor --install: one entry each, idempotent, valid JSON, backup made
INSTALL_OUT=$(bash "$NM" doctor --install 2>&1); INST_RC=$?
CNT_PT=$(jq '[.hooks.PreToolUse[]?.hooks[]?.command // empty | select(contains("cfn-night-mode-guard"))] | length' "$SETTINGS_FILE" 2>/dev/null)
CNT_SS=$(jq '[.hooks.SessionStart[]?.hooks[]?.command // empty | select(contains("cfn-night-mode-inject"))] | length' "$SETTINGS_FILE" 2>/dev/null)
CNT_UPS=$(jq '[.hooks.UserPromptSubmit[]?.hooks[]?.command // empty | select(contains("cfn-night-mode-inject"))] | length' "$SETTINGS_FILE" 2>/dev/null)
jq -e . "$SETTINGS_FILE" >/dev/null 2>&1; VALID_JQ=$?
BAK_N=$(ls "$SETTINGS_FILE".bak.* 2>/dev/null | wc -l)
{ [ "$INST_RC" = "0" ] && [ "$CNT_PT" = "1" ] && [ "$CNT_SS" = "1" ] && [ "$CNT_UPS" = "1" ] \
  && [ "$VALID_JQ" = "0" ] && [ "$BAK_N" -ge 1 ]; } \
  && ok "doctor --install adds exactly one each, valid JSON, backup made" \
  || no "install first pass (rc=$INST_RC pt=$CNT_PT ss=$CNT_SS ups=$CNT_UPS valid=$VALID_JQ bak=$BAK_N)"

bash "$NM" doctor --install >/dev/null 2>&1
CNT_PT=$(jq '[.hooks.PreToolUse[]?.hooks[]?.command // empty | select(contains("cfn-night-mode-guard"))] | length' "$SETTINGS_FILE")
CNT_SS=$(jq '[.hooks.SessionStart[]?.hooks[]?.command // empty | select(contains("cfn-night-mode-inject"))] | length' "$SETTINGS_FILE")
CNT_UPS=$(jq '[.hooks.UserPromptSubmit[]?.hooks[]?.command // empty | select(contains("cfn-night-mode-inject"))] | length' "$SETTINGS_FILE")
{ [ "$CNT_PT" = "1" ] && [ "$CNT_SS" = "1" ] && [ "$CNT_UPS" = "1" ]; } \
  && ok "second install is idempotent (still one each)" || no "install idempotence (pt=$CNT_PT ss=$CNT_SS ups=$CNT_UPS)"

DOC_OUT=$(bash "$NM" doctor 2>&1); DOC_RC=$?
[ "$DOC_RC" = "0" ] && ok "doctor green after install on fixture" || no "doctor post-install rc=$DOC_RC out=$DOC_OUT"

echo "=== group 2: guard ==="
reset_state

G_OUT=$(bash "$GUARD" <<<"$ASK_PAYLOAD" 2>&1); G_RC=$?
{ [ "$G_RC" = "0" ] && [ -z "$G_OUT" ]; } \
  && ok "guard: flag off -> exit 0 silent" || no "guard flag-off (rc=$G_RC out=$G_OUT)"

bash "$NM" on >/dev/null 2>&1
DENY_ERR="$TMP/deny.err"
bash "$GUARD" <<<"$ASK_PAYLOAD" 2>"$DENY_ERR"; G_RC=$?
D_TXT=$(cat "$DENY_ERR")
G_OK=1
[ "$G_RC" = "2" ] || G_OK=0
echo "$D_TXT" | grep -q "record.sh" || G_OK=0
echo "$D_TXT" | grep -q -- "--slug night-$TODAY" || G_OK=0
echo "$D_TXT" | grep -qE -- '--id D[0-9]+-[0-9]+' || G_OK=0
echo "$D_TXT" | grep -q "DELETE/DROP/TRUNCATE" || G_OK=0
echo "$D_TXT" | grep -q "NEVER" || G_OK=0
echo "$D_TXT" | grep -qi "push" || G_OK=0
[ "$G_OK" = "1" ] && ok "guard: AskUserQuestion denied rc2 with self-contained instructions" \
  || no "guard ask-deny (rc=$G_RC err=$D_TXT)"

P_ERR="$TMP/plan.err"
bash "$GUARD" <<<"$PLAN_PAYLOAD" 2>"$P_ERR"; P_RC=$?
grep -q "planning/" "$P_ERR" && [ "$P_RC" = "2" ] \
  && ok "guard: EnterPlanMode denied rc2 pointing at planning/" || no "guard plan-deny (rc=$P_RC err=$(cat "$P_ERR"))"

EP_OUT=$(bash "$GUARD" <<<"$EXITPLAN_PAYLOAD" 2>"$TMP/ep.err"); EP_RC=$?
PERM=$(printf '%s' "$EP_OUT" | jq -r '.hookSpecificOutput.permissionDecision // empty' 2>/dev/null)
{ [ "$EP_RC" = "0" ] && [ "$PERM" = "allow" ]; } \
  && ok "guard: ExitPlanMode allowed via JSON permissionDecision allow" || no "guard exitplan (rc=$EP_RC out=$EP_OUT)"

EV_LINES=0
[ -f "$EVENTS" ] && EV_LINES=$(wc -l < "$EVENTS")
grep -q "AskUserQuestion" "$EVENTS" 2>/dev/null \
  && ok "deny appended events-log line naming tool" || no "events log (lines=$EV_LINES)"

reset_state
bash "$NM" on >/dev/null 2>&1
NOJQ_BIN="$TMP/nojq-bin"; mkdir -p "$NOJQ_BIN"
for b in bash sh cat date dirname grep sed head tail tr printf mkdir env uname sort wc awk readlink; do
    p=$(command -v "$b" 2>/dev/null) && ln -sf "$p" "$NOJQ_BIN/$b"
done
NJQ_OUT=$(env -i HOME="$TMP/home" PATH="$NOJQ_BIN" CFN_NIGHT_MODE_DIR="$CFN_NIGHT_MODE_DIR" \
    bash "$GUARD" <<<"$ASK_PAYLOAD" 2>&1); NJQ_RC=$?
{ [ "$NJQ_RC" = "0" ] && [ -z "$NJQ_OUT" ]; } \
  && ok "guard: jq absent -> fail-open silent exit 0" || no "guard no-jq (rc=$NJQ_RC out=$NJQ_OUT)"
reset_state

echo "=== group 3: inject ==="

IN_OUT=$(bash "$INJECT" <<<"$SS_PAYLOAD" 2>&1); INJ_RC=$?
[ -z "$IN_OUT" ] && ok "inject: flag off + no marker -> silent (session start)" \
  || no "inject off-silent (rc=$INJ_RC out=$IN_OUT)"

bash "$NM" on >/dev/null 2>&1
IN_OUT=$(bash "$INJECT" <<<"$SS_PAYLOAD" 2>&1)
{ echo "$IN_OUT" | grep -q "NIGHT MODE ACTIVE (since" \
  && echo "$IN_OUT" | grep -qi "safety floor"; } \
  && ok "SessionStart + flag on: contract injected (header + SKILL body)" || no "inject SS-on (out=$IN_OUT)"
if [ -n "$IN_OUT" ]; then
    echo "$IN_OUT" | grep -qE '^(status|version|tags):' \
      && no "SessionStart body leaks frontmatter" || ok "SessionStart frontmatter stripped"
else
    no "frontmatter strip untestable (empty injection)"
fi

UP_OUT=$(bash "$INJECT" <<<"$UPS_PAYLOAD" 2>/dev/null)
UP_NAME=$(printf '%s' "$UP_OUT" | jq -r '.hookSpecificOutput.hookEventName // empty' 2>/dev/null)
UP_CTX=$(printf '%s' "$UP_OUT" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null)
UP_WORDS=$(printf '%s' "$UP_CTX" | wc -w)
{ printf '%s' "$UP_OUT" | jq -e . >/dev/null 2>&1 && [ "$UP_NAME" = "UserPromptSubmit" ] \
  && [ -n "$UP_CTX" ] && [ "$UP_WORDS" -lt 120 ] && [ "$UP_WORDS" -gt 0 ]; } \
  && ok "UserPromptSubmit + flag on: valid JSON context (${UP_WORDS} words)" \
  || no "inject UPS-on (name=$UP_NAME words=$UP_WORDS out=$UP_OUT)"

rm -f "$FLAG"
IN_SS=$(bash "$INJECT" <<<"$SS_PAYLOAD" 2>&1)
IN_UPS=$(bash "$INJECT" <<<"$UPS_PAYLOAD" 2>&1)
{ [ -z "$IN_SS" ] && [ -z "$IN_UPS" ]; } \
  && ok "inject: flag off + no marker -> both events silent" || no "inject dual-off (ss=$IN_SS ups=$IN_UPS)"

printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$PENDING"
MK_SS=$(bash "$INJECT" <<<"$SS_PAYLOAD" 2>&1)
MK_UPS=$(bash "$INJECT" <<<"$UPS_PAYLOAD" 2>/dev/null)
MK_NAME=$(printf '%s' "$MK_UPS" | jq -r '.hookSpecificOutput.hookEventName // empty' 2>/dev/null)
MK_CTX=$(printf '%s' "$MK_UPS" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null)
{ echo "$MK_SS" | grep -qi "decisions await review" && echo "$MK_SS" | grep -q "report"; } \
  && ok "pending marker: SessionStart plain-stdout review reminder" || no "marker SS reminder ($MK_SS)"
{ [ "$MK_NAME" = "UserPromptSubmit" ] && echo "$MK_CTX" | grep -qi "decisions await review"; } \
  && ok "pending marker: UserPromptSubmit JSON review reminder" || no "marker UPS (name=$MK_NAME ctx=$MK_CTX)"
rm -f "$PENDING"

echo "=== group 4: report ==="
reset_state

Z_OUT=$(bash "$NM" report 2>&1); Z_RC=$?
{ [ "$Z_RC" = "0" ] && echo "$Z_OUT" | grep -qi "Nothing to review"; } \
  && ok "report zero-state message when window empty" || no "zero-state (rc=$Z_RC out=$Z_OUT)"

rec "night-$YDAY" DA "Yesterday choice A" "picked A option"
rec "night-$YDAY" DB "Yesterday choice B" "picked B option"
rec "night-$TODAY" DC "Defer risky migration" "DEFERRED: risky migration tonight" --blocking --status proposed

# window covers both dates via explicit --since (per plan precedence: --since > marker > flag > today)
R_OUT=$(bash "$NM" report --since "$YDAY" 2>&1); R_RC=$?
NEEDS_SLICE=$(sed -n '/NEEDS ACTION/,/AUTO-DECIDED/p' <<<"$R_OUT")
FYI_SLICE=$(sed -n '/AUTO-DECIDED/,/Accountability/p' <<<"$R_OUT")
R_OK=1
[ "$R_RC" = "0" ] || R_OK=0
echo "$R_OUT" | grep -q "NEEDS ACTION" || R_OK=0
echo "$NEEDS_SLICE" | grep -q "Defer risky migration" || R_OK=0
echo "$NEEDS_SLICE" | grep -q "DEFERRED" || R_OK=0
echo "$NEEDS_SLICE" | grep -q "Yesterday choice" && R_OK=0
echo "$FYI_SLICE" | grep -q "Yesterday choice A" || R_OK=0
echo "$FYI_SLICE" | grep -q "Yesterday choice B" || R_OK=0
[ "$R_OK" = "1" ] && ok "report sections: blocking card isolated, accepted listed FYI, both dates spanned" \
  || no "report sections (rc=$R_RC)\n$R_OUT"

BARE_OUT=$(bash "$NM" report 2>&1)
{ echo "$BARE_OUT" | grep -q "Defer risky migration"; } \
  && ok "bare report defaults to today window (blocking row visible)" \
  || no "bare report window (out=$BARE_OUT)"

# discrepancy: denies logged but zero decisions recorded
reset_state
printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" AskUserQuestion "unlogged question one" >> "$EVENTS"
printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" EnterPlanMode "" >> "$EVENTS"
D_OUT=$(bash "$NM" report 2>&1)
echo "$D_OUT" | grep -qi "logging was skipped" \
  && ok "discrepancy red flag when denies exist without rows" || no "red flag (out=$D_OUT)"

# --ack clears pending marker and truncates events log
reset_state
printf '%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$PENDING"
printf '%s %s x\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" AskUserQuestion >> "$EVENTS"
A_OUT=$(bash "$NM" report --ack 2>&1); A_RC=$?
{ [ ! -f "$PENDING" ] && [ ! -s "$EVENTS" ] && [ "$A_RC" = "0" ]; } \
  && ok "report --ack removes marker + truncates events log" || no "ack (rc=$A_RC pend=$([ -f "$PENDING" ] && echo y || echo n) evsz=$(stat -c%s "$EVENTS" 2>/dev/null || echo none))"

echo "=== group 5: end-to-end (deny text literally executable) ==="
reset_state
bash "$NM" on >/dev/null 2>&1

bash "$GUARD" <<<"$ASK_PAYLOAD" 2>"$TMP/e2e.err"; E_RC=$?
[ "$E_RC" = "2" ] && { [ -f "$EVENTS" ]; } \
  && ok "e2e: guard denied with events logged" || no "e2e deny stage (rc=$E_RC)"

JOIN=$(sed ':a;/\\$/{N;s/\\\n//;ta}' "$TMP/e2e.err")
CMD_LINE=$(printf '%s\n' "$JOIN" | grep -E '^\s*bash \$HOME/\.claude/skills/decision-log/record\.sh' | head -1 | sed 's/^[[:space:]]*//')
[ -n "$CMD_LINE" ] \
  && ok "e2e: record.sh invocation extracted from deny text as single line" \
  || no "e2e extraction (join head): $(printf '%s' "$JOIN" | head -8)"

CMD_FILLED=$(printf '%s' "$CMD_LINE" \
  | sed 's|<the question, short>|Which ORM for the leads table?|' \
  | sed 's|<option you picked>|Drizzle on the existing pool|' \
  | sed 's|<why, one line>|fewest moving parts, typed client already present|')
eval "$CMD_FILLED" >"$TMP/e2e.rec.out" 2>&1

ROW=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM decisions WHERE slug='night-$TODAY' AND project='nmtest-e2e-or-default' OR (slug='night-$TODAY' AND status='accepted' AND title='Which ORM for the leads table?');")
ROW_STRICT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM decisions WHERE slug='night-$TODAY' AND status='accepted' AND title='Which ORM for the leads table?';")
[ "$ROW_STRICT" = "1" ] \
  && ok "e2e: executed deny-text command recorded accepted decision under today slug" \
  || no "e2e row (strict=$ROW_STRICT raw=$ROW out=$(cat "$TMP/e2e.rec.out"))"

OFF_REP=$(bash "$NM" off 2>&1)
grep -q "Which ORM for the leads table?" <<<"$OFF_REP" \
  && ok "e2e: off renders report containing recorded title" || no "e2e off report (out=$OFF_REP)"
[ -f "$PENDING" ] \
  && ok "e2e: pending review marker written by off" || no "e2e marker missing"

echo "----"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
