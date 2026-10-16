#!/usr/bin/env bash
# tests/test-cfn-fleet-portability.sh
# cfn-fleet on a BSD userland (macOS) as well as GNU (Linux).
#
# Regressions covered (2026-10-10, measured on macOS):
#   - `fleet dashboard` reported "failed to start" although the server ran:
#     the liveness check read /proc/<pid>/cmdline, which macOS lacks.
#   - timeline timestamps used `date -d @EPOCH` (GNU only) and printed "?".
#   - the poll fingerprint used `stat -c` (GNU only), so it never changed.
#   - the heartbeat filter used `\xNN` escapes in sed (GNU only): BSD sed left
#     spinner glyphs in, so a frozen worker kept beating.
#   - `tac` is not part of macOS.
# Behavioural checks run the real helpers; a static scan pins the GNU-only
# forms out of the skill so a new one cannot slip back in.
set -uo pipefail
# The mailbox path (stage 5) has its own suite (test-cfn-fleet-mailbox.sh, fake
# redis-cli). Off here, so these file-based cases never reach a real mailbox config.
export FLEET_MAILBOX=off

PROJECT_ROOT=$(git rev-parse --show-toplevel)
SKILL="$PROJECT_ROOT/.claude/skills/cfn-fleet"
unset FLEET_RUN_DIR 2>/dev/null || true

PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }

TMP=$(mktemp -d "${TMPDIR:-/tmp}/fleet-port-test-XXXXXX")
SERVER_PID=""; SLEEP_PID=""
cleanup(){
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT

# shellcheck source=/dev/null
source "$SKILL/lib/common.sh"
# shellcheck source=/dev/null
source "$SKILL/lib/cmd-dashboard.sh"
# shellcheck source=/dev/null
source "$SKILL/lib/heartbeat-ticker.sh"

# --- 1a. dashboard server liveness --------------------------------------------
RD="$TMP/run"; mkdir -p "$RD"
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$RD" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 0.3
echo "$SERVER_PID" > "$RD/.dashboard.pid"
_fleet_dash_serve_is_serving "$RD" && ok "live http.server pid reads as serving" \
  || no "live http.server pid reads as NOT serving (liveness check is Linux-only)"

sleep 30 & SLEEP_PID=$!
echo "$SLEEP_PID" > "$RD/.dashboard.pid"
_fleet_dash_serve_is_serving "$RD" && no "a live non-http.server pid reads as serving" \
  || ok "a live pid that is not http.server reads as not serving"
kill "$SLEEP_PID" 2>/dev/null; wait "$SLEEP_PID" 2>/dev/null; SLEEP_PID=""

echo 999999 > "$RD/.dashboard.pid"
_fleet_dash_serve_is_serving "$RD" && no "a dead pid reads as serving" || ok "a dead pid reads as not serving"

echo "$SERVER_PID" > "$RD/.dashboard.pid"
STOP_OUT=$(_fleet_dash_serve_stop "$RD" 2>&1)
sleep 0.3
if kill -0 "$SERVER_PID" 2>/dev/null; then no "stop left the server running: $STOP_OUT"
else ok "stop ends the server ($STOP_OUT)"; SERVER_PID=""; fi

# --- 1b. date / stat / tac / sed ------------------------------------------------
[ "$(_fleet_dash_ts_text 3661)" = "01:01:01" ] && ok "epoch 3661 renders 01:01:01 UTC" \
  || no "epoch 3661 renders '$(_fleet_dash_ts_text 3661)'"

for f in roster.tsv; do printf 'a\n' > "$RD/$f"; done
FP1=$(_fleet_dash_fingerprint "$RD" 2>"$TMP/fp.err")
printf 'longer content\n' > "$RD/roster.tsv"
FP2=$(_fleet_dash_fingerprint "$RD" 2>>"$TMP/fp.err")
[ "$FP1" != "$FP2" ] && ok "fingerprint changes when roster.tsv changes" \
  || no "fingerprint did not change (stat form unsupported?)"
[ ! -s "$TMP/fp.err" ] && ok "fingerprint writes nothing to stderr" \
  || no "fingerprint stderr: $(head -2 "$TMP/fp.err")"

EV="$TMP/events.jsonl"
printf '{"ts":1,"ws":"WS01","from":"pending","to":"started"}\n{"ts":2,"ws":"WS02","from":"pending","to":"started"}\n' > "$EV"
HTML=$(_fleet_dash_events_html "$EV" 2>&1)
first=$(printf '%s\n' "$HTML" | grep -o 'WS0[12]' | head -1)
[ "$first" = "WS02" ] && ok "timeline lists newest event first" || no "timeline order wrong (first=$first)"

glyphs=$(printf '\xe2\x9c\xb3 Working\n\xe2\x94\x82 box\n\xe2\xa0\x8b braille\n')
filtered=$(printf '%s\n' "$glyphs" | _fleet_tick_filter)
expect=$(printf ' Working\n box\n braille')
[ "$filtered" = "$expect" ] && ok "tick filter strips spinner, box and braille glyphs" \
  || no "tick filter left glyphs: $(printf '%s' "$filtered" | od -c | head -3 | tr -s ' ')"
esc=$(printf '\033[31mred\033[0m text\n' | _fleet_tick_filter)
[ "$esc" = "red text" ] && ok "tick filter strips ANSI colour codes" || no "ANSI left: $(printf '%s' "$esc" | od -c | head -2)"

# --- static scan: GNU-only forms stay out ----------------------------------------
scan=$(grep -nE 'date[^|;]*[[:space:]](-d|--date)[[:space:]]|stat -c|\btac\b|/proc/|sed[^|]*\\x[0-9a-fA-F]|sed -i|readlink -f' \
  "$SKILL"/lib/*.sh "$SKILL"/cli/fleet | grep -vE '^[^:]+:[0-9]+:[[:space:]]*#' \
  | grep -vE '_fleet_(stat_mtime_size|epoch_hms|pid_cmdline)|GNU first')
[ -z "$scan" ] && ok "no unguarded GNU-only date/stat/sed/tac//proc forms in the skill" \
  || no "GNU-only forms remain:
$scan"

echo
echo "cfn-fleet-portability: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
