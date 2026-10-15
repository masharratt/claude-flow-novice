#!/usr/bin/env bash
# Tests for .claude/skills/cfn-mailbox/mailbox.sh (agent mailbox, stage 1 "Core").
#
# Offline by default: a fake `redis-cli` is put first on PATH. It records every
# call (argv, the command after the connection flags, the REDISCLI_AUTH value,
# and any stdin) and answers from scripted rules, so no test touches a network.
#
# Usage:
#   bash tests/test-cfn-mailbox.sh           # offline tests; live block only if
#                                            #   MAILBOX_LIVE=1 and a config exists
#   bash tests/test-cfn-mailbox.sh --live    # live block only
#
# Exit codes: 0 all ran green, 1 a test failed, 3 live-only was requested but skipped.
#
# No `set -e`: assertions must all run so every failure shows in one pass.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
MB="$REPO/.claude/skills/cfn-mailbox/mailbox.sh"
MODE="${1:-all}"

PASS=0
FAIL=0
CASES=0
CASE_NAME=""
# shellcheck source=/dev/null
. "$REPO/.claude/cfn-scripts/lib/safe-rm.sh"
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/cfn-mailbox-test.XXXXXX")" || exit 1
SCRATCH="$(cd -P "$SCRATCH" && pwd -P)" || exit 1
trap 'cfn_safe_rm_tmp "$SCRATCH"' EXIT

ok()   { PASS=$((PASS + 1)); }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL [%s] %s\n' "$CASE_NAME" "$1"; }

assert_eq() { # expected actual label
  if [ "$1" = "$2" ]; then ok; else bad "$3: expected [$1] got [$2]"; fi
}
assert_contains() { # haystack needle label
  case "$1" in *"$2"*) ok ;; *) bad "$3: missing [$2] in [$1]" ;; esac
}
assert_not_contains() {
  case "$1" in *"$2"*) bad "$3: unexpected [$2] in [$1]" ;; *) ok ;; esac
}
assert_rc() { # expected label
  if [ "$RC" = "$1" ]; then ok; else bad "$2: exit expected $1 got $RC (stderr: $ERR)"; fi
}

# ---------------------------------------------------------------- fixtures

PASSWORD="pw-SECRET-do-not-leak-123"
ADMIN_PASSWORD="admin-SECRET-do-not-leak-456"
TOKEN="gentoken-ABC123xyz"

new_case() { # name
  CASE_NAME="$1"
  CASES=$((CASES + 1))
  T="$SCRATCH/case-$CASES"
  mkdir -p "$T/bin"
  : > "$T/calls"
  : > "$T/rules"
  : > "$T/authenv"
  cat > "$T/bin/redis-cli" <<'STUB'
#!/usr/bin/env bash
# Fake redis-cli. Records, then answers from $FAKE_RULES (glob<TAB>reply, first match wins).
set -u
{ printf 'ARGV'; for a in "$@"; do printf '\t%s' "$a"; done; printf '\n'; } >> "$FAKE_LOG"
printf '%s\n' "${REDISCLI_AUTH:-}" >> "$FAKE_LOG.authenv"
json=0
while [ $# -gt 0 ]; do
  case "$1" in
    --tls|--no-auth-warning) shift ;;
    --json) json=1; shift ;;
    -h|-p|--user) shift 2 ;;
    *) break ;;
  esac
done
stdin="$(cat)"
joined="$*"
[ -n "$stdin" ] && printf 'STDIN\t%s\n' "$stdin" >> "$FAKE_LOG" && joined="STDIN $stdin"
printf 'CMD\t%s\n' "$joined" >> "$FAKE_LOG"
reply=""; matched=0
while IFS=$'\t' read -r pat rep; do
  [ -z "$pat" ] && continue
  # shellcheck disable=SC2254
  case "$joined" in $pat) reply="$rep"; matched=1; break ;; esac
done < "$FAKE_RULES"
if [ "$matched" = 0 ]; then
  cmd="$(printf '%s' "${1:-}" | tr '[:lower:]' '[:upper:]')"
  case "$cmd" in
    INCR) reply=1 ;;
    XADD) reply="1700000000000-0" ;;
    PING) reply=PONG ;;
    EXPIRE|DEL|XACK|HSET) reply=1 ;;
    XREAD|XREADGROUP) reply=null ;;
    XREVRANGE|HGETALL) reply="[]" ;;
    GET|HGET) reply="" ;;
    *) reply=OK ;;
  esac
  [ "$cmd" = ACL ] || [ "${1:-}" = "" ] && reply=OK
  case "$joined" in "ACL GENTOKEN"*) reply="${FAKE_TOKEN:-tok}" ;; esac
fi
case "$reply" in
  '!EXIT:'*) rest="${reply#!EXIT:}"; code="${rest%%:*}"; printf '%s\n' "${rest#*:}" >&2; exit "$code" ;;
esac
printf '%b\n' "$reply"
STUB
  chmod +x "$T/bin/redis-cli"
  cat > "$T/env" <<EOF
MAILBOX_HOST=mbx.example.test
MAILBOX_PORT=6379
MAILBOX_USER=michael
MAILBOX_PASS=$PASSWORD
MAILBOX_OWNER=michael
MAILBOX_PUBLIC=me
MAILBOX_CONTACTS="steve/me steve/p/liaison"
EOF
  chmod 600 "$T/env"
  export FAKE_LOG="$T/calls" FAKE_RULES="$T/rules"
}

rule() { printf '%s\t%s\n' "$1" "$2" >> "$T/rules"; }

# Run mailbox.sh with the fake redis-cli first on PATH. Sets OUT, ERR, RC.
mb() {
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" FAKE_TOKEN="$TOKEN" bash "$MB" "$@" 2>"$T/stderr" </dev/null)" || RC=$?
  ERR="$(cat "$T/stderr")"
}

# CMD lines (command after the connection flags), one per call.
cmds() { grep '^CMD	' "$T/calls" | cut -f2-; }
has_cmd() { cmds | grep -F -q -- "$1"; }
line_of() { cmds | grep -n -F -m1 -- "$1" | cut -d: -f1; }
no_calls() { [ ! -s "$T/calls" ]; }
write_config_without() { # KEY
  grep -v "^$1=" "$T/env" > "$T/env.new"; mv "$T/env.new" "$T/env"; chmod 600 "$T/env"
}

# ---------------------------------------------------------------- offline cases

test_missing_script() {
  new_case "script exists (run via bash, so the exec bit is not required)"
  if [ -f "$MB" ]; then ok; else bad "mailbox.sh missing at $MB"; fi
  if [ ! -x "$MB" ]; then echo "NOTE: $MB is not executable; run chmod +x"; fi
}

test_usage() {
  new_case "usage errors"
  mb; assert_rc 2 "no subcommand"
  mb frobnicate; assert_rc 2 "unknown subcommand"
  assert_contains "$ERR" "frobnicate" "names the bad subcommand"
}

test_config() {
  new_case "config loader: no defaults, exit 78"
  rm -f "$T/env"
  mb send michael/me "hi"; assert_rc 78 "missing config file"
  assert_contains "$ERR" "$T/env" "message names the config path"
  assert_eq "yes" "$(no_calls && echo yes)" "no redis call without config"

  new_case "config partial: missing PASS"
  write_config_without MAILBOX_PASS
  mb send michael/me "hi"; assert_rc 78 "partial config"
  assert_contains "$ERR" "MAILBOX_PASS" "names the missing key"
  assert_eq "yes" "$(no_calls && echo yes)" "no redis call on partial config"

  new_case "config partial: missing HOST (no localhost default)"
  write_config_without MAILBOX_HOST
  mb read; assert_rc 78 "no host default"
  assert_contains "$ERR" "MAILBOX_HOST" "names MAILBOX_HOST"
  assert_eq "yes" "$(no_calls && echo yes)" "no redis call"

  new_case "config: owner must be a valid name"
  sed -i.bak 's/^MAILBOX_OWNER=.*/MAILBOX_OWNER=Mich_ael/' "$T/env"
  mb send michael/me "hi"; assert_rc 78 "bad owner in config"

  new_case "config: MAILBOX_CONFIG env var selects the file"
  mkdir -p "$T/alt"; mv "$T/env" "$T/alt/other-env"
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/alt/other-env" bash "$MB" doctor 2>"$T/stderr" </dev/null)" || RC=$?
  assert_rc 0 "alt config path honoured"
}

test_tls_and_no_password_in_argv() {
  new_case "TLS always; password via env, never argv/output"
  mb send michael/s/abc --kind fyi "hello"
  assert_rc 0 "send ok"
  assert_contains "$(cat "$T/calls")" "--tls" "TLS flag on every call"
  assert_not_contains "$(grep -v '^$' "$T/calls")" "$PASSWORD" "password absent from argv record"
  assert_contains "$(cat "$T/calls.authenv")" "$PASSWORD" "password delivered via REDISCLI_AUTH"
  assert_not_contains "$OUT$ERR" "$PASSWORD" "password absent from output"
  assert_contains "$(cat "$T/calls")" "mbx.example.test" "uses configured host"
}

test_address_validation() {
  local bad_addr
  for bad_addr in "michael/s/Foo" "michael/s/foo_bar" "michael/x/foo" "michael/s" "a/b/c/d" \
                  "michael/s/foo:from:x" "michael/s/foo bar" "Michael/me" "michael/me/extra" "michael/s/"; do
    new_case "bad address rejected: $bad_addr"
    mb send "$bad_addr" "hi"
    assert_rc 10 "address [$bad_addr]"
    assert_eq "yes" "$(no_calls && echo yes)" "no redis call for [$bad_addr]"
  done
  new_case "bad session name in MAILBOX_SESSION"
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" MAILBOX_SESSION="Bad_Name" bash "$MB" send michael/me hi 2>"$T/stderr" </dev/null)" || RC=$?
  ERR="$(cat "$T/stderr")"
  assert_rc 10 "bad session name"
}

test_body_limits() {
  local s4096 s4097 e2000 e2100
  s4096="$(printf 'a%.0s' $(seq 1 4096))"
  s4097="${s4096}a"
  new_case "body: 4096 bytes ok"
  mb send michael/me "$s4096"; assert_rc 0 "4096 bytes accepted"
  new_case "body: 4097 bytes refused"
  mb send michael/me "$s4097"; assert_rc 11 "4097 bytes refused"
  assert_eq "yes" "$(no_calls && echo yes)" "no redis call when body too long"
  new_case "body: empty refused"
  mb send michael/me ""; assert_rc 11 "empty body"
  new_case "body: cap counts bytes not characters"
  e2000="$(printf 'é%.0s' $(seq 1 2000))"   # 4000 bytes
  e2100="$(printf 'é%.0s' $(seq 1 2100))"   # 4200 bytes
  mb send michael/me "$e2000"; assert_rc 0 "4000 bytes of multibyte ok"
  mb send michael/me "$e2100"; assert_rc 11 "4200 bytes of multibyte refused"
}

test_kinds() {
  new_case "kinds"
  mb send michael/me --kind bounce "x"; assert_rc 2 "bounce is not user-sendable"
  mb send michael/me --kind shout "x"; assert_rc 2 "unknown kind"
  mb send michael/me --kind reply "x"; assert_rc 2 "reply needs --reply-to"
  mb send michael/me --kind reply --reply-to 1700000000000-0 "x"; assert_rc 0 "reply with --reply-to ok"
  mb send michael/me --kind ask "x"; assert_rc 0 "ask ok"
  mb send michael/me --kind reminder "x"; assert_rc 0 "reminder ok"
  mb send michael/me --reply-to notanid "x"; assert_rc 2 "malformed --reply-to"
}

test_key_building() {
  new_case "key building: session"
  mb send michael/s/mdtwii-95 "x"
  assert_rc 0 "ok"
  assert_eq "yes" "$(has_cmd 'XADD mbx:michael:s:mdtwii-95:from:michael ' && echo yes)" "session key"
  new_case "key building: project"
  mb send michael/p/fireside-family "x"
  assert_eq "yes" "$(has_cmd 'XADD mbx:michael:p:fireside-family:from:michael ' && echo yes)" "project key"
  new_case "key building: room"
  mb send michael/r/gg-all-projects "x"
  assert_eq "yes" "$(has_cmd 'XADD mbx:michael:r:gg-all-projects:from:michael ' && echo yes)" "room key"
  new_case "key building: person (owner/me and bare me)"
  mb send michael/me "x"
  assert_eq "yes" "$(has_cmd 'XADD mbx:michael:me:from:michael ' && echo yes)" "person key"
  new_case "key building: bare 'me' means own person inbox"
  mb send me "x"
  assert_eq "yes" "$(has_cmd 'XADD mbx:michael:me:from:michael ' && echo yes)" "bare me"
}

test_xadd_shape() {
  new_case "XADD: MAXLEN ~500 + EXPIRE 30d for inboxes"
  mb send michael/s/abc --kind ask --thread t-one "question?"
  assert_rc 0 "ok"
  assert_eq "yes" "$(has_cmd 'XADD mbx:michael:s:abc:from:michael MAXLEN ~ 500 * ' && echo yes)" "MAXLEN ~ 500"
  assert_eq "yes" "$(has_cmd 'EXPIRE mbx:michael:s:abc:from:michael 2592000' && echo yes)" "EXPIRE 30d"
  local x e
  x="$(line_of 'XADD mbx:michael:s:abc')"; e="$(line_of 'EXPIRE mbx:michael:s:abc')"
  if [ -n "$x" ] && [ -n "$e" ] && [ "$e" -gt "$x" ]; then ok; else bad "EXPIRE must follow XADD ($x/$e)"; fi
  assert_eq "yes" "$(has_cmd 'kind ask' && has_cmd 'thread t-one' && has_cmd 'body question?' && has_cmd 'hops 0' && echo yes)" "fields kind/thread/body/hops"
  assert_eq "yes" "$(has_cmd 'from michael/me' && has_cmd 'to michael/s/abc' && echo yes)" "from/to fields"
  assert_eq "1700000000000-0" "$OUT" "prints the message id only on stdout"

  new_case "XADD: person inbox has no MAXLEN but still EXPIRE"
  mb send michael/me "note"
  assert_eq "no" "$(has_cmd 'XADD mbx:michael:me:from:michael MAXLEN' && echo yes || echo no)" "no MAXLEN on me inbox"
  assert_eq "yes" "$(has_cmd 'EXPIRE mbx:michael:me:from:michael 2592000' && echo yes)" "EXPIRE on me inbox"

  new_case "XADD: default kind is fyi, session in from"
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" MAILBOX_SESSION="mdtwii-95" bash "$MB" send michael/p/x "hello" 2>"$T/stderr" </dev/null)" || RC=$?
  assert_rc 0 "ok"
  assert_eq "yes" "$(has_cmd 'kind fyi' && has_cmd 'from michael/s/mdtwii-95' && echo yes)" "default fyi + session sender"

  new_case "XADD: reply_to recorded and hops derived from --hops"
  mb send michael/me --kind reply --reply-to 1700000000000-0 --hops 3 "re"
  assert_eq "yes" "$(has_cmd 'reply_to 1700000000000-0' && has_cmd 'hops 4' && echo yes)" "reply_to + hops+1"
}

test_log_line() {
  new_case "log line: compact JSON to log:<owner> MAXLEN ~10000"
  mb send michael/s/abc --kind ask "secret body text"
  assert_rc 0 "ok"
  local logline json
  logline="$(cmds | grep -F -m1 'XADD log:michael MAXLEN ~ 10000 * ')"
  assert_contains "$logline" "XADD log:michael MAXLEN ~ 10000 *" "log XADD present"
  json="${logline##* }"
  if printf '%s' "$json" | jq -e -c . >/dev/null 2>&1; then ok; else bad "log record not valid JSON: $json"; fi
  assert_eq "$(printf '%s' "$json" | jq -c .)" "$json" "log record is compact (jq -c round-trips)"
  assert_eq "michael/s/abc" "$(printf '%s' "$json" | jq -r .to)" "log record has to"
  assert_not_contains "$logline" "secret body text" "log does not copy the body"
  x="$(line_of 'XADD mbx:michael:s:abc')"; l="$(line_of 'XADD log:michael')"
  if [ -n "$x" ] && [ -n "$l" ] && [ "$l" -gt "$x" ]; then ok; else bad "log must follow the message XADD"; fi
}

test_hop_limit() {
  new_case "hop limit 20"
  mb send michael/me --kind reply --reply-to 1700000000000-0 --hops 20 "x"
  assert_rc 12 "hops 20 -> would be 21 -> refused"
  assert_contains "$ERR" "20" "message mentions the limit"
  assert_eq "yes" "$(no_calls && echo yes)" "refused before any redis call"
  new_case "hop 19 -> 20 allowed"
  mb send michael/me --kind reply --reply-to 1700000000000-0 --hops 19 "x"
  assert_rc 0 "hop 20 allowed"
  assert_eq "yes" "$(has_cmd 'hops 20' && echo yes)" "hops=20 written"
  new_case "non-numeric --hops"
  mb send michael/me --kind reply --reply-to 1700000000000-0 --hops abc "x"
  assert_rc 2 "bad --hops"
}

test_rate_limit() {
  new_case "rate: first message sets the window"
  rule 'INCR rate:*' '1'
  mb send michael/s/abc "x"
  assert_rc 0 "ok"
  assert_eq "yes" "$(has_cmd 'INCR rate:michael:' && echo yes)" "INCR on rate:<owner>:..."
  assert_eq "yes" "$(has_cmd 'EXPIRE rate:michael:' && has_cmd ' 600' && echo yes)" "EXPIRE 600 on first hit"

  new_case "rate: later message does not reset the window"
  rule 'INCR rate:*' '2'
  mb send michael/s/abc "x"
  assert_rc 0 "second ok"
  assert_eq "no" "$(has_cmd 'EXPIRE rate:' && echo yes || echo no)" "no EXPIRE after the first hit"

  new_case "rate: 10th allowed"
  rule 'INCR rate:*' '10'
  mb send michael/s/abc "x"; assert_rc 0 "10th allowed"

  new_case "rate: 11th refused, nothing sent"
  rule 'INCR rate:*' '11'
  mb send michael/s/abc "x"
  assert_rc 13 "11th refused"
  assert_eq "no" "$(has_cmd 'XADD' && echo yes || echo no)" "no XADD when rate limited"

  new_case "rate: key is per pair"
  mb send michael/s/aaa "x"; mb send michael/s/bbb "x"
  local k1 k2
  k1="$(cmds | grep -F 'INCR rate:' | sed -n 1p)"; k2="$(cmds | grep -F 'INCR rate:' | sed -n 2p)"
  if [ -n "$k1" ] && [ "$k1" != "$k2" ]; then ok; else bad "rate keys equal for different receivers: [$k1] [$k2]"; fi
}

test_outside_owner() {
  new_case "outside owner: not in contacts -> refused"
  mb send steve/s/abc "hi"
  assert_rc 14 "non-contact refused"
  assert_eq "yes" "$(no_calls && echo yes)" "no redis call"
  mb send steve/p/other "hi"; assert_rc 14 "non-contact project refused"
  new_case "outside owner: contact address allowed, key tagged from:<me>"
  mb send steve/me "hi"
  assert_rc 0 "contact ok"
  assert_eq "yes" "$(has_cmd 'XADD mbx:steve:me:from:michael ' && echo yes)" "sender-owner suffix is my owner"
  mb send steve/p/liaison "hi"; assert_rc 0 "second contact ok"
  new_case "outside owner: contact list does not authorise sibling addresses"
  mb send steve/s/liaison "hi"; assert_rc 14 "same name, other kind, refused"
}

test_redis_errors() {
  new_case "redis error: auth refused -> 16"
  rule 'INCR *' '!EXIT:1:WRONGPASS invalid username-password pair'
  mb send michael/me "x"
  assert_rc 16 "WRONGPASS"
  assert_not_contains "$OUT$ERR" "$PASSWORD" "no password in error"

  new_case "redis error: NOPERM -> 17"
  rule 'XADD *' '(error) NOPERM this user has no permissions to access one of the keys used as arguments'
  mb send michael/me "x"
  assert_rc 17 "NOPERM"

  new_case "redis error: unreachable -> 15"
  rule 'INCR *' "!EXIT:1:Could not connect to Redis at mbx.example.test:6379: Connection refused"
  mb send michael/me "x"
  assert_rc 15 "unreachable"

  new_case "redis error: password echoed by the server is redacted"
  rule 'INCR *' "!EXIT:1:ERR something about $PASSWORD odd"
  mb send michael/me "x"
  assert_not_contains "$OUT$ERR" "$PASSWORD" "echoed password redacted"
  assert_eq "yes" "$([ "$RC" != 0 ] && echo yes)" "non-zero exit"

  new_case "redis error: generic error -> 18"
  rule 'XADD *' '(error) ERR unknown thing'
  mb send michael/me "x"
  assert_rc 18 "generic redis error"
}

MSG_PROJ='[["mbx:michael:p:proj:from:michael",[["1700000000001-0",["from","michael/s/x","to","michael/p/proj","kind","ask","body","hello proj","sent_at","1","thread","t1","hops","0"]]]]]'

test_read_project() {
  new_case "read project: group at id 0, pending first, XACK after"
  rule 'XREADGROUP GROUP readers * STREAMS mbx:michael:p:proj:from:michael 0' "$MSG_PROJ"
  rule 'XREADGROUP GROUP readers * STREAMS mbx:michael:p:proj:from:michael >' "null"
  mb read --as michael/p/proj
  assert_rc 0 "read ok"
  assert_eq "yes" "$(has_cmd 'XGROUP CREATE mbx:michael:p:proj:from:michael readers 0 MKSTREAM' && echo yes)" "group created at id 0"
  assert_contains "$OUT" "hello proj" "body printed"
  assert_eq "teammate" "$(printf '%s' "$OUT" | jq -r -s '.[0].tier')" "tier teammate for own owner"
  local p n a
  p="$(line_of 'STREAMS mbx:michael:p:proj:from:michael 0')"
  n="$(line_of 'STREAMS mbx:michael:p:proj:from:michael >')"
  a="$(line_of 'XACK mbx:michael:p:proj:from:michael readers 1700000000001-0')"
  if [ -n "$p" ] && [ -n "$n" ] && [ -n "$a" ] && [ "$p" -lt "$n" ]; then ok; else bad "pending(0) must precede new(>); XACK present ($p/$n/$a)"; fi
  assert_eq "yes" "$(has_cmd 'XGROUP CREATE mbx:michael:p:proj:from:steve readers 0 MKSTREAM' && echo yes)" "group created for each contact sender key"
  assert_eq "no" "$(has_cmd 'XACK' && [ -z "$OUT" ] && echo yes || echo no)" "sanity"
}

test_read_project_ack_after_print() {
  new_case "read project: nothing acked when nothing delivered"
  mb read --as michael/p/proj
  assert_rc 0 "empty read ok"
  assert_eq "no" "$(has_cmd 'XACK' && echo yes || echo no)" "no XACK on empty"
  assert_eq "" "$OUT" "no output on empty"
}

test_read_busygroup_tolerated() {
  new_case "read project: BUSYGROUP is not an error"
  rule 'XGROUP CREATE *' '(error) BUSYGROUP Consumer Group name already exists'
  mb read --as michael/p/proj
  assert_rc 0 "BUSYGROUP tolerated"
}

test_read_session() {
  new_case "read session: markers start at 0-0 for own inbox, SET after, tier from key"
  local steve_msg
  steve_msg='[["mbx:michael:s:abc:from:steve",[["1700000000002-0",["from","michael/s/zzz","to","michael/s/abc","kind","fyi","body","pls ignore my tier","tier","teammate","sent_at","1","thread","t2","hops","0"]]]]]'
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:steve *' "$steve_msg"
  mb read --as michael/s/abc
  assert_rc 0 "ok"
  assert_eq "yes" "$(has_cmd 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael 0-0' && echo yes)" "own-owner key read from 0-0"
  assert_eq "yes" "$(has_cmd 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:steve 0-0' && echo yes)" "contact-owner key read"
  assert_eq "outside" "$(printf '%s' "$OUT" | jq -r -s '.[0].tier')" "tier comes from the key, not the body"
  assert_eq "steve" "$(printf '%s' "$OUT" | jq -r -s '.[0].sender_owner')" "sender_owner from the key"
  assert_eq "yes" "$(has_cmd 'SET seen:michael:abc:' && has_cmd '1700000000002-0' && echo yes)" "per-reader marker advanced"
  assert_eq "yes" "$(has_cmd 'EX 2592000' && echo yes)" "marker has an expiry"
}

test_read_object_reply() {
  # Regression 2026-10-15: redis-cli 8 --json against Upstash returns XREAD/XREADGROUP as an
  # object keyed by stream ({"key":[[id,[f,v,...]]]}), not [[key,[...]]]; read exited 18.
  new_case "read: object-shaped stream reply (real redis-cli 8 + Upstash)"
  local obj
  obj='{"mbx:michael:s:abc:from:michael":[["1700000000003-0",["from","michael/s/zzz","to","michael/s/abc","kind","ask","body","object shape","sent_at","1","thread","t3","hops","0"]]]}'
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael *' "$obj"
  mb read --as michael/s/abc
  assert_rc 0 "ok"
  assert_eq "object shape" "$(printf '%s' "$OUT" | jq -r -s '.[0].body')" "body parsed from object reply"
  assert_eq "yes" "$(has_cmd 'SET seen:michael:abc:' && has_cmd '1700000000003-0' && echo yes)" "marker advanced from object reply"
}

test_read_uses_marker() {
  new_case "read session: resumes from stored marker"
  rule 'GET seen:michael:abc:*' '1700000000000-5'
  mb read --as michael/s/abc
  assert_eq "yes" "$(has_cmd 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael 1700000000000-5' && echo yes)" "starts after marker"
}

test_read_rooms() {
  new_case "read room: first read sets marker at newest, delivers nothing"
  rule 'HGET dir:michael michael/s/abc' '{"rooms":["lounge"],"last_seen":1}'
  rule 'XREVRANGE mbx:michael:r:lounge:from:michael + - COUNT 1' '[["1700000000009-0",["body","old"]]]'
  mb read --as michael/s/abc
  assert_rc 0 "ok"
  assert_eq "yes" "$(has_cmd 'SET seen:michael:abc:' && has_cmd '1700000000009-0' && echo yes)" "marker set to newest room id"
  assert_eq "no" "$(has_cmd 'XREAD COUNT 20 STREAMS mbx:michael:r:lounge:from:michael' && echo yes || echo no)" "room backlog not delivered"
  assert_eq "" "$OUT" "no output"
}

test_read_person_default() {
  new_case "read: default address is the person inbox"
  mb read
  assert_rc 0 "ok"
  assert_eq "yes" "$(has_cmd 'STREAMS mbx:michael:me:from:michael 0-0' && echo yes)" "person inbox read"
  assert_eq "yes" "$(has_cmd 'SET seen:michael:me:' || echo yes)" "marker key uses shared reader 'me' (or no SET when empty)"
}

test_read_other_owner() {
  new_case "read: cannot read another owner's inbox"
  mb read --as steve/me
  assert_rc 10 "refused"
  assert_eq "yes" "$(no_calls && echo yes)" "no redis call"
}

test_who_log() {
  new_case "who: only sessions seen in the last 30 minutes"
  local now recent old
  now="$(date +%s)"; recent=$((now - 60)); old=$((now - 7200))
  rule 'HGETALL dir:michael' "[\"michael/s/fresh\",\"{\\\\\"host\\\\\":\\\\\"vps\\\\\",\\\\\"project\\\\\":\\\\\"p1\\\\\",\\\\\"summary\\\\\":\\\\\"doing x\\\\\",\\\\\"last_seen\\\\\":$recent}\",\"michael/s/stale\",\"{\\\\\"host\\\\\":\\\\\"mac\\\\\",\\\\\"last_seen\\\\\":$old}\"]"
  mb who
  assert_rc 0 "ok"
  assert_contains "$OUT" "michael/s/fresh" "fresh session listed"
  assert_contains "$OUT" "doing x" "summary shown"
  assert_not_contains "$OUT" "michael/s/stale" "stale session hidden"
  assert_eq "yes" "$(has_cmd 'HGETALL dir:michael' && echo yes)" "reads own directory only"

  new_case "log: reads log:<owner>"
  rule 'XREVRANGE log:michael + - COUNT 50' '[["1700000000000-0",["rec","{\"to\":\"michael/me\",\"kind\":\"fyi\"}"]]]'
  mb log
  assert_rc 0 "ok"
  assert_contains "$OUT" "michael/me" "log record shown"
  assert_eq "yes" "$(has_cmd 'XREVRANGE log:michael + - COUNT 50' && echo yes)" "default 50 entries"
  mb log 5; assert_eq "yes" "$(has_cmd 'COUNT 5' && echo yes)" "log N"
}

test_join_leave() {
  new_case "join: needs a session name"
  mb join lounge
  assert_rc 19 "no MAILBOX_SESSION"

  new_case "join/leave: update directory entry"
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" MAILBOX_SESSION="abc" bash "$MB" join lounge 2>"$T/stderr" </dev/null)" || RC=$?
  ERR="$(cat "$T/stderr")"
  assert_rc 0 "join ok"
  assert_eq "yes" "$(has_cmd 'HSET dir:michael michael/s/abc ' && has_cmd 'lounge' && echo yes)" "HSET dir entry with room"
  assert_eq "yes" "$(has_cmd 'SET seen:michael:abc:' && echo yes)" "marker initialised at join"

  new_case "leave: removes the room"
  rule 'HGET dir:michael michael/s/abc' '{"rooms":["lounge","other"],"last_seen":1}'
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" MAILBOX_SESSION="abc" bash "$MB" leave lounge 2>"$T/stderr" </dev/null)" || RC=$?
  assert_rc 0 "leave ok"
  local hset
  hset="$(cmds | grep -F 'HSET dir:michael michael/s/abc' | head -1)"
  assert_contains "$hset" "other" "other room kept"
  assert_not_contains "$hset" "lounge" "lounge removed"

  new_case "join: invalid room name"
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" MAILBOX_SESSION="abc" bash "$MB" join 'Bad Room' 2>"$T/stderr" </dev/null)" || RC=$?
  assert_rc 10 "invalid room"
}

test_doctor() {
  new_case "doctor: host, owner, no password"
  mb doctor
  assert_rc 0 "ok"
  assert_contains "$OUT" "mbx.example.test" "host shown"
  assert_contains "$OUT" "michael" "owner shown"
  assert_not_contains "$OUT$ERR" "$PASSWORD" "password never printed"
  assert_eq "yes" "$(has_cmd 'PING' && echo yes)" "PING issued"

  new_case "doctor: auth failure -> 16"
  rule 'PING' '!EXIT:1:WRONGPASS invalid username-password pair'
  mb doctor
  assert_rc 16 "auth failure"
  assert_not_contains "$OUT$ERR" "$PASSWORD" "no password in failure text"

  new_case "doctor: missing config -> 78"
  rm -f "$T/env"; mb doctor; assert_rc 78 "doctor needs config"
}

# adduser -------------------------------------------------------------------

admin_env() { # writes $T/admin.env
  printf 'OTHER=1\nUPSTASH_MAILBOX_ADMIN_URL=rediss://default:%s@fine-owl-1234.upstash.io:6379\n' "$ADMIN_PASSWORD" > "$T/admin.env"
}
mb_admin() {
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/nonexistent" MAILBOX_ADMIN_ENV="$T/admin.env" FAKE_TOKEN="$TOKEN" bash "$MB" "$@" 2>"$T/stderr" </dev/null)" || RC=$?
  ERR="$(cat "$T/stderr")"
}

test_adduser() {
  new_case "adduser: owner name validated"
  admin_env
  mb_admin adduser "Bad Name"; assert_rc 10 "invalid owner"
  assert_eq "yes" "$(no_calls && echo yes)" "no redis call"

  new_case "adduser: missing admin env -> 20"
  rm -f "$T/admin.env"
  mb_admin adduser steve; assert_rc 20 "no admin env file"
  new_case "adduser: env without the URL -> 20"
  printf 'OTHER=1\n' > "$T/admin.env"
  mb_admin adduser steve; assert_rc 20 "no URL in env"
  new_case "adduser: malformed URL -> 20, URL not echoed"
  printf 'UPSTASH_MAILBOX_ADMIN_URL=notaurl-%s\n' "$ADMIN_PASSWORD" > "$T/admin.env"
  mb_admin adduser steve; assert_rc 20 "malformed URL"
  assert_not_contains "$OUT$ERR" "$ADMIN_PASSWORD" "admin secret not echoed"

  new_case "adduser: GENTOKEN then SETUSER with the plan's ACL"
  admin_env
  mb_admin adduser steve
  assert_rc 0 "ok"
  local g s rule_line
  g="$(line_of 'ACL GENTOKEN steve')"; # reset first: re-running adduser must replace the user's rules, not add to them
  s="$(line_of 'STDIN ACL SETUSER steve reset on >'"$TOKEN")"
  if [ -n "$g" ] && [ -n "$s" ] && [ "$g" -lt "$s" ]; then ok; else bad "GENTOKEN must precede SETUSER ($g/$s)"; fi
  rule_line="$(grep '^STDIN	' "$T/calls" | head -1 | cut -f2-)"
  local pat
  for pat in '~mbx:steve:*' '~mbx:*:from:steve' '~dir:steve' '~seen:steve:*' '~due:steve' '~log:steve' \
             '~lock:steve:*' '~rate:steve:*' '~done:steve:*'; do
    assert_contains " $rule_line " " $pat " "ACL has key pattern $pat"
  done
  for pat in +ping +xadd +xread +xreadgroup +xack +xautoclaim +xclaim +xpending +xinfo +xgroup +xrange \
             +xrevrange +xlen +xdel +xtrim +hset +hget +hgetall +hdel +zadd +zrangebyscore +zrem +get +set \
             +del +expire +incr; do
    assert_contains " $rule_line " " $pat " "ACL allows $pat"
  done
  for pat in keys scan flush config acl eval script debug '@all' '~*' ; do
    assert_not_contains "$rule_line" "+$pat" "ACL does not allow +$pat"
  done
  assert_not_contains " $rule_line " " ~* " "no catch-all key pattern"
  assert_not_contains "$rule_line" "~mbx:michael" "no other owner's pattern"

  assert_contains "$OUT" "MAILBOX_HOST=fine-owl-1234.upstash.io" "env line host"
  assert_contains "$OUT" "MAILBOX_PORT=6379" "env line port"
  assert_contains "$OUT" "MAILBOX_USER=steve" "env line user"
  assert_contains "$OUT" "MAILBOX_PASS=$TOKEN" "env line pass is the generated token"
  assert_contains "$OUT" "MAILBOX_OWNER=steve" "env line owner"
  assert_not_contains "$OUT$ERR" "$ADMIN_PASSWORD" "admin password never printed"
  assert_not_contains "$ERR" "$TOKEN" "token never logged to stderr"
  assert_not_contains "$(grep '^ARGV' "$T/calls")" "$TOKEN" "token not in any argv (sent via stdin)"
  assert_not_contains "$(grep '^ARGV' "$T/calls")" "$ADMIN_PASSWORD" "admin password not in any argv"
  assert_contains "$(cat "$T/calls.authenv")" "$ADMIN_PASSWORD" "admin password delivered via REDISCLI_AUTH"
  assert_contains "$(cat "$T/calls")" "--tls" "TLS used for admin calls"
  assert_contains "$(cat "$T/calls")" "fine-owl-1234.upstash.io" "admin host used"

  new_case "adduser: GENTOKEN refused -> error, no secrets in text"
  admin_env
  rule 'ACL GENTOKEN *' "!EXIT:1:ERR unknown command, admin $ADMIN_PASSWORD"
  mb_admin adduser steve
  assert_eq "yes" "$([ "$RC" != 0 ] && echo yes)" "non-zero exit"
  assert_not_contains "$OUT$ERR" "$ADMIN_PASSWORD" "admin password redacted"
  assert_eq "no" "$(has_cmd 'SETUSER' && echo yes || echo no)" "no SETUSER after GENTOKEN failure"

  new_case "adduser: SETUSER failure -> token redacted in error"
  admin_env
  rule 'STDIN ACL SETUSER *' "(error) ERR bad rule for $TOKEN"
  mb_admin adduser steve
  assert_eq "yes" "$([ "$RC" != 0 ] && echo yes)" "non-zero exit"
  assert_not_contains "$OUT$ERR" "$TOKEN" "token redacted"
}

# ---------------------------------------------------------------- live block

live_block() {
  local cfg="${MAILBOX_CONFIG:-$HOME/.config/cfn-mailbox/env}"
  if [ "${MAILBOX_LIVE:-}" != "1" ]; then echo "SKIP live: MAILBOX_LIVE is not 1"; return 3; fi
  if [ ! -r "$cfg" ]; then echo "SKIP live: no config at $cfg"; return 3; fi
  if ! command -v redis-cli >/dev/null 2>&1; then echo "SKIP live: redis-cli not installed"; return 3; fi
  CASE_NAME="live"
  local name="test-$(date +%s)-$$" owner host port user pass
  owner="$(grep '^MAILBOX_OWNER=' "$cfg" | cut -d= -f2- | tr -d '"')"
  host="$(grep '^MAILBOX_HOST=' "$cfg" | cut -d= -f2- | tr -d '"')"
  port="$(grep '^MAILBOX_PORT=' "$cfg" | cut -d= -f2- | tr -d '"')"
  user="$(grep '^MAILBOX_USER=' "$cfg" | cut -d= -f2- | tr -d '"')"
  pass="$(grep '^MAILBOX_PASS=' "$cfg" | cut -d= -f2- | tr -d '"')"
  local key="mbx:$owner:s:$name:from:$owner" rate_prefix="rate:$owner:$name:"
  local hash marker out rc=0
  hash="$(printf '%s' "$key" | cksum | awk '{print $1}')"
  marker="seen:$owner:$name:$hash"

  RC=0; OUT="$(MAILBOX_CONFIG="$cfg" bash "$MB" doctor 2>&1 </dev/null)" || RC=$?
  assert_rc 0 "live doctor"
  assert_not_contains "$OUT" "$pass" "live doctor hides password"

  RC=0; OUT="$(MAILBOX_CONFIG="$cfg" MAILBOX_SESSION="$name" bash "$MB" send "$owner/s/$name" --kind fyi "live round trip $name" 2>"$SCRATCH/live.err" </dev/null)" || RC=$?
  ERR="$(cat "$SCRATCH/live.err")"
  assert_rc 0 "live send"
  RC=0; OUT="$(MAILBOX_CONFIG="$cfg" MAILBOX_SESSION="$name" bash "$MB" read --as "$owner/s/$name" 2>"$SCRATCH/live.err" </dev/null)" || RC=$?
  ERR="$(cat "$SCRATCH/live.err")"
  assert_rc 0 "live read"
  assert_contains "$OUT" "live round trip $name" "live message came back"
  RC=0; OUT="$(MAILBOX_CONFIG="$cfg" MAILBOX_SESSION="$name" bash "$MB" read --as "$owner/s/$name" 2>&1 </dev/null)" || RC=$?
  assert_not_contains "$OUT" "live round trip $name" "second read does not redeliver"

  # Cleanup by exact key name only: the message key, its marker, and the rate key.
  # (The shared log:<owner> stream is capped and keeps the one record.)
  REDISCLI_AUTH="$pass" redis-cli --tls -h "$host" -p "$port" --user "$user" --no-auth-warning \
    DEL "$key" "$marker" "${rate_prefix}$owner-s-$name" >/dev/null 2>&1 || true
  return 0
}

# ---------------------------------------------------------------- run

run_offline() {
  test_missing_script
  test_usage
  test_config
  test_tls_and_no_password_in_argv
  test_address_validation
  test_body_limits
  test_kinds
  test_key_building
  test_xadd_shape
  test_log_line
  test_hop_limit
  test_rate_limit
  test_outside_owner
  test_redis_errors
  test_read_project
  test_read_project_ack_after_print
  test_read_busygroup_tolerated
  test_read_session
  test_read_object_reply
  test_read_uses_marker
  test_read_rooms
  test_read_person_default
  test_read_other_owner
  test_who_log
  test_join_leave
  test_doctor
  test_adduser
}

LIVE_RC=0
case "$MODE" in
  --live)
    live_block || LIVE_RC=$?
    ;;
  all)
    run_offline
    live_block || LIVE_RC=$?
    ;;
  *) echo "usage: $0 [--live]" >&2; exit 2 ;;
esac

echo "cases=$CASES assertions_passed=$PASS assertions_failed=$FAIL"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
if [ "$MODE" = "--live" ] && [ "$LIVE_RC" = 3 ]; then exit 3; fi
exit 0
