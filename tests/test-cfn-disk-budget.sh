#!/usr/bin/env bash
# Tests for cfn-disk-budget.sh (timed check) and cfn-disk-budget-inject.sh (hook surface).
# Offline: CFN_DISK_FAKE_DF replaces df ("mount total_mb free_mb" lines); state is a scratch dir.
# Usage: bash tests/test-cfn-disk-budget.sh   Exit 0 all green, 1 a test failed.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
CHK="$REPO/.claude/cfn-scripts/cfn-disk-budget.sh"
INJ="$REPO/.claude/hooks/cfn-disk-budget-inject.sh"
PASS=0; FAIL=0; CASE=""
ok(){ PASS=$((PASS+1)); }
bad(){ FAIL=$((FAIL+1)); printf 'FAIL [%s] %s\n' "$CASE" "$1"; }
eq(){ [ "$1" = "$2" ] && ok || bad "$3: expected [$1] got [$2]"; }
has(){ case "$1" in *"$2"*) ok;; *) bad "$3: missing [$2] in [$1]";; esac; }
hasnt(){ case "$1" in *"$2"*) bad "$3: unexpected [$2]";; *) ok;; esac; }

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
S="$(mktemp -d "${TMPDIR:-/tmp}/cfn-disk-test.XXXXXX")" || exit 1
trap 'cfn_safe_rm_tmp "$S"' EXIT
export CFN_DISK_STATE_DIR="$S/state" CFN_DISK_FAKE_DF="$S/df" CFN_DISK_NOTIFY_CMD="$S/notify.sh"
export CFN_DISK_ROOTS="$S/proj/*:$S/tmpx" XDG_RUNTIME_DIR="$S/run"
printf '#!/usr/bin/env bash\necho "$@" >> "%s/notified"\n' "$S" > "$S/notify.sh"; chmod +x "$S/notify.sh"
mkdir -p "$S/proj/a" "$S/proj/b" "$S/tmpx"
dd if=/dev/zero of="$S/proj/a/f" bs=1M count=3 2>/dev/null
ALERT="$S/state/disk-alert.json"
run(){ bash "$CHK" "$@" 2>"$S/err"; RC=$?; }
setdf(){ printf '/ 1000000 %s\n' "$1" > "$S/df"; }

CASE="script exists"; [ -x "$CHK" ] && ok || bad "missing/non-exec $CHK"
CASE="first run, healthy: no alert"
setdf 500000; run; eq 0 "$RC" rc; [ -e "$ALERT" ] && bad "alert written" || ok
CASE="small drop, healthy: no alert"
setdf 495000; run; [ -e "$ALERT" ] && bad "alert written on 5GB drop" || ok
CASE="big drop: alert with growers"
dd if=/dev/zero of="$S/proj/b/g" bs=1M count=9 2>/dev/null
setdf 450000; run; [ -e "$ALERT" ] && ok || bad "no alert on 45GB drop"
J=$(cat "$ALERT" 2>/dev/null)
has "$J" '"mount": "/"' mount; has "$J" '"drop_gb"' drop
eq "$S/proj/b" "$(jq -r '.growers[0].path' "$ALERT" 2>/dev/null)" "top grower"
has "$(cat "$S/notified" 2>/dev/null)" error "notified"
CASE="floor breach (<10%)"
cfn_safe_rm_tmp "$S/state"; setdf 60000; run; has "$(jq -r '.alerts[0].reasons|join(",")' "$ALERT" 2>/dev/null)" floor "floor reason"
CASE="floor breach, small drop: reuses growers, no rescan"
J1=$(jq -c .growers "$ALERT"); setdf 59900; run; eq "$J1" "$(jq -c .growers "$ALERT")" "growers reused"
CASE="du is /usr/bin/du"; grep -q 'bare du' "$CHK" && ok || bad "no du note"; grep -qE '(^|[ |;(`$])du ' "$CHK" && bad "bare du call" || ok
CASE="--crontab prints line, installs nothing"
OUT=$(bash "$CHK" --crontab); has "$OUT" cfn-disk-budget.sh crontab; has "$OUT" '*/' schedule
CASE="inject: silent without alert"
cfn_safe_rm_tmp "$S/state"; OUT=$(echo '{"session_id":"s1"}' | bash "$INJ"); eq "" "$OUT" "silent"
CASE="inject: one-liner on alert, ack silences"
setdf 500000; run; setdf 100000; run
OUT=$(echo '{"session_id":"s2","hook_event_name":"UserPromptSubmit"}' | bash "$INJ")
has "$OUT" 'disk budget: / free' msg; has "$OUT" 'top growers' growers; has "$OUT" 'producers need a cap and cleanup' tail
eq UserPromptSubmit "$(printf '%s' "$OUT" | jq -r .hookSpecificOutput.hookEventName)" event
bash "$INJ" --ack >/dev/null; sleep 1
OUT=$(echo '{"session_id":"s3"}' | bash "$INJ"); eq "" "$OUT" "silent after ack"
CASE="inject: new alert after ack re-fires"
setdf 500000; run; setdf 100000; sleep 1; run
OUT=$(echo '{"session_id":"s4"}' | bash "$INJ"); has "$OUT" 'disk budget' refire
CASE="inject: once per session"
OUT=$(echo '{"session_id":"s4"}' | bash "$INJ"); eq "" "$OUT" "second prompt same session"
CASE="inject: subagent skipped"
OUT=$(echo '{"session_id":"s5","agent_id":"x"}' | bash "$INJ"); eq "" "$OUT" "subagent"
CASE="inject: fail open on junk"
OUT=$(echo 'not json' | bash "$INJ"); eq 0 "$?" rc
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [ "$FAIL" = 0 ]
