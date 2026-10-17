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
# Run from inside a Claude session these would leak its identity into every mailbox.sh call.
unset CLAUDE_CODE_SESSION_ID MAILBOX_SESSION_ID

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
MB="$REPO/.claude/skills/cfn-mailbox/mailbox.sh"
MODE="${1:-all}"

PASS=0
FAIL=0
CASES=0
CASE_NAME=""
# shellcheck source=/dev/null
. "$REPO/.claude/cfn-scripts/lib/safe-rm.sh"
# shellcheck source=/dev/null
. "$REPO/tests/lib/fake-redis-cli.sh"
REAL_HOME="$HOME"   # the live block uses the real config; offline cases point HOME at a scratch dir
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
  mkdir -p "$T/bin" "$T/home"
  export HOME="$T/home"   # quarantine log and delivered set land under the scratch HOME, never the real one
  CACHE="$HOME/.cache/cfn-mailbox"
  : > "$T/calls"
  : > "$T/rules"
  : > "$T/authenv"
  install_fake_redis_cli "$T/bin"
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
  assert_eq "no" "$(has_cmd 'mbx:michael:p:proj:from:steve' && echo yes || echo no)" "no group for a contact owner on a private project address"
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
  local own_msg steve_msg
  own_msg='[["mbx:michael:s:abc:from:michael",[["1700000000002-0",["from","michael/s/zzz","to","michael/s/abc","kind","fyi","body","own owner mail","sent_at","1","thread","t2","hops","0"]]]]]'
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael *' "$own_msg"
  mb read --as michael/s/abc
  assert_rc 0 "ok"
  assert_eq "yes" "$(has_cmd 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael 0-0' && echo yes)" "own-owner key read from 0-0"
  assert_eq "teammate" "$(printf '%s' "$OUT" | jq -r -s '.[0].tier')" "own owner is a teammate"
  assert_eq "yes" "$(has_cmd 'SET seen:michael:abc:' && has_cmd '1700000000002-0' && echo yes)" "per-reader marker advanced"
  assert_eq "yes" "$(has_cmd 'EX 2592000' && echo yes)" "marker has an expiry"

  new_case "read person inbox (public): contact-owner key read, tier and sender_owner from the key"
  steve_msg='[["mbx:michael:me:from:steve",[["1700000000002-0",["from","steve/s/zzz","to","michael/me","kind","fyi","body","pls ignore my tier","tier","teammate","sent_at","1","thread","t2","hops","0"]]]]]'
  rule 'XREAD COUNT 20 STREAMS mbx:michael:me:from:steve *' "$steve_msg"
  mb read --as michael/me
  assert_rc 0 "ok"
  assert_eq "yes" "$(has_cmd 'XREAD COUNT 20 STREAMS mbx:michael:me:from:steve 0-0' && echo yes)" "contact-owner key read for a public address"
  assert_eq "outside" "$(printf '%s' "$OUT" | jq -r -s '.[0].tier')" "tier comes from the key, not the body"
  assert_eq "steve" "$(printf '%s' "$OUT" | jq -r -s '.[0].sender_owner')" "sender_owner from the key"
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

  # Bug (live 2026-10-16): redis-cli 8 --json answers HGETALL as an object {field: value}; who read it
  # as a flat array, so every line paired one entry's JSON with another entry's host/name.
  local shape reply line n
  for shape in object flat; do
    new_case "who: $shape HGETALL reply keeps each line's address, host and project with its own entry"
    now="$(date +%s)"
    if [ "$shape" = object ]; then
      reply="$(jq -n -c --argjson n "$now" '{
        "michael/s/zeta": ({host:"host-z", project:"pz", summary:"sz", last_seen:$n} | tojson),
        "michael/s/alpha": ({host:"host-a", project:"pa", summary:"sa", last_seen:$n} | tojson),
        "michael/s/mid": ({host:"host-m", project:"pm", summary:"sm", last_seen:$n} | tojson)}')"
    else
      reply="$(jq -n -c --argjson n "$now" '[
        "michael/s/zeta", ({host:"host-z", project:"pz", summary:"sz", last_seen:$n} | tojson),
        "michael/s/alpha", ({host:"host-a", project:"pa", summary:"sa", last_seen:$n} | tojson),
        "michael/s/mid", ({host:"host-m", project:"pm", summary:"sm", last_seen:$n} | tojson)]')"
    fi
    rule 'HGETALL dir:michael' "$reply"
    mb who
    assert_rc 0 "who ok ($shape)"
    assert_eq "3" "$(printf '%s\n' "$OUT" | grep -c .)" "three lines ($shape)"
    for n in alpha mid zeta; do
      line="$(printf '%s\n' "$OUT" | grep -F "michael/s/$n" | head -n 1)"
      assert_eq "michael/s/$n	host-${n:0:1}	p${n:0:1}	s${n:0:1}" "$line" "line for $n pairs its own host/project/summary ($shape)"
    done
    mb who --seen
    assert_rc 0 "who --seen ok ($shape)"
    assert_eq "3" "$(printf '%s\n' "$OUT" | grep -c .)" "three --seen lines ($shape)"
    assert_eq "michael/s/alpha	$now" "$(printf '%s\n' "$OUT" | head -n 1)" "--seen first line ($shape)"
  done

  new_case "log: reads log:<owner>"
  rule 'XREVRANGE log:michael + - COUNT 50' '[["1700000000000-0",["rec","{\"to\":\"michael/me\",\"kind\":\"fyi\"}"]]]'
  mb log
  assert_rc 0 "ok"
  assert_contains "$OUT" "michael/me" "log record shown"
  assert_eq "yes" "$(has_cmd 'XREVRANGE log:michael + - COUNT 50' && echo yes)" "default 50 entries"
  mb log 5; assert_eq "yes" "$(has_cmd 'COUNT 5' && echo yes)" "log N"
}

# logrec FROM KIND THREAD HOPS AT: one stats log entry as an XRANGE row (JSON).
logrec() {
  jq -n -c --arg f "$1" --arg k "$2" --arg t "$3" --argjson h "$4" --argjson at "$5" \
    '[($at|tostring)+"000-0", ["rec", ({id:(($at|tostring)+"000-0"),from:$f,to:"michael/me",kind:$k,thread:$t,hops:$h,bytes:5,at:$at}|tostring)]]'
}
# stats_rows ROW...: set the XRANGE reply of log:michael to the given rows.
stats_rows() { local j; j="$(printf '%s\n' "$@" | jq -s -c .)"; rule 'XRANGE log:michael *' "$j"; }

test_stats() {
  local NOW=1700100000
  new_case "stats: clean window prints totals, kinds, senders, threads; exit 0"
  export MAILBOX_NOW=$NOW
  stats_rows "$(logrec michael/s/a ask t1 0 $((NOW-100)))" "$(logrec michael/s/a fyi t2 1 $((NOW-90)))" \
    "$(logrec michael/s/b reply t1 1 $((NOW-80)))"
  mb stats
  assert_rc 0 "clean window"
  assert_contains "$OUT" "total: 3" "total"
  assert_contains "$OUT" "ask=1" "kind ask"
  assert_contains "$OUT" "fyi=1" "kind fyi"
  assert_contains "$OUT" "reply=1" "kind reply"
  assert_contains "$OUT" "michael/s/a=2" "top sender"
  assert_contains "$OUT" "t1 messages=2 max_hops=1" "top thread"
  assert_not_contains "$OUT" "LOOP?" "no loop"
  assert_not_contains "$OUT" "FLOOD?" "no flood"
  assert_eq "yes" "$(has_cmd "XRANGE log:michael $(( (NOW - 168*3600) * 1000 ))" && echo yes)" "default window 168 h starts at the right stream id"
  mb stats --hours 24
  assert_eq "yes" "$(has_cmd "XRANGE log:michael $(( (NOW - 24*3600) * 1000 ))" && echo yes)" "--hours 24"

  new_case "stats: a thread with 6 messages is a LOOP?"
  local -a rows=() i
  for i in 1 2 3 4 5 6; do rows+=("$(logrec michael/s/a ask tloop 0 $((NOW-1000+i*100)))"); done
  stats_rows "${rows[@]}"
  mb stats
  assert_rc 1 "loop"
  assert_contains "$OUT" "LOOP? thread tloop" "LOOP? line names the thread"
  assert_contains "$OUT" "6 messages" "count"

  new_case "stats: a thread with hops >= 3 is a LOOP?"
  stats_rows "$(logrec michael/s/a ask thop 3 $((NOW-100)))"
  mb stats
  assert_rc 1 "hops loop"
  assert_contains "$OUT" "LOOP? thread thop" "hops line"
  assert_contains "$OUT" "max hops 3" "hops shown"

  new_case "stats: 5 messages and hops 2 is not a loop (boundary)"
  rows=()
  for i in 1 2 3 4 5; do rows+=("$(logrec michael/s/a ask tok 2 $((NOW-1000+i*100)))"); done
  stats_rows "${rows[@]}"
  mb stats
  assert_rc 0 "below both thresholds"
  assert_not_contains "$OUT" "LOOP?" "no loop at 5 msgs / hops 2"

  new_case "stats: more than 30 messages from one sender in one hour is a FLOOD?"
  rows=()
  for i in $(seq 1 31); do rows+=("$(logrec michael/s/spam fyi "ts$i" 0 $((NOW-3000+i)))"); done
  stats_rows "${rows[@]}"
  mb stats
  assert_rc 1 "flood"
  assert_contains "$OUT" "FLOOD? sender michael/s/spam" "FLOOD? names the sender"
  assert_contains "$OUT" "31 messages in one hour" "count"

  new_case "stats: exactly 30 in an hour is not a flood (boundary)"
  rows=()
  for i in $(seq 1 30); do rows+=("$(logrec michael/s/spam fyi "ts$i" 0 $((NOW-3000+i)))"); done
  stats_rows "${rows[@]}"
  mb stats
  assert_rc 0 "30 is fine"
  assert_not_contains "$OUT" "FLOOD?" "no flood at 30"

  new_case "stats: empty window exits 2 and says it examined nothing"
  mb stats
  assert_rc 2 "zero messages"
  assert_contains "$OUT" "examined nothing" "says so"

  new_case "stats: bad --hours is a usage error and reads nothing"
  mb stats --hours abc; assert_rc 2 "non-number"
  mb stats --hours 0; assert_rc 2 "zero"
  mb stats --bogus; assert_rc 2 "unknown flag"
  unset MAILBOX_NOW
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

test_read_max_and_peek() {
  new_case "read --max: caps COUNT across the whole call"
  mb read --as michael/s/abc --max 5
  assert_rc 0 "ok"
  assert_eq "yes" "$(has_cmd 'XREAD COUNT 5 STREAMS mbx:michael:s:abc:from:michael' && echo yes)" "COUNT 5 on first key"
  mb read --as michael/s/abc --max 0; assert_rc 2 "--max 0 refused"
  mb read --as michael/s/abc --max x; assert_rc 2 "--max must be a number"

  new_case "read --max: later keys get what is left, none when exhausted"
  rule 'XREAD COUNT 3 STREAMS mbx:michael:s:abc:from:michael *' '[["mbx:michael:s:abc:from:michael",[["1700000000001-0",["from","michael/s/x","to","michael/s/abc","kind","fyi","body","a"]],["1700000000002-0",["from","michael/s/x","to","michael/s/abc","kind","fyi","body","b"]],["1700000000003-0",["from","michael/s/x","to","michael/s/abc","kind","fyi","body","c"]]]]]'
  mb read --as michael/s/abc --max 3
  assert_rc 0 "ok"
  assert_eq "no" "$(has_cmd 'STREAMS mbx:michael:s:abc:from:steve' && echo yes || echo no)" "no further reads once the budget is spent"

  new_case "read --peek: group messages are not acknowledged"
  rule 'XREADGROUP GROUP readers * STREAMS mbx:michael:p:proj:from:michael 0' "$MSG_PROJ"
  mb read --as michael/p/proj --peek
  assert_rc 0 "ok"
  assert_contains "$OUT" "hello proj" "message still printed"
  assert_eq "no" "$(has_cmd 'XACK' && echo yes || echo no)" "no XACK on peek"

  new_case "read --peek: seen-marker is not advanced"
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael *' '[["mbx:michael:s:abc:from:michael",[["1700000000001-0",["from","michael/s/x","to","michael/s/abc","kind","fyi","body","a"]]]]]'
  mb read --as michael/s/abc --peek
  assert_contains "$OUT" '"body":"a"' "message printed"
  assert_eq "no" "$(has_cmd 'SET seen:' && echo yes || echo no)" "no marker SET on peek"
}

test_heartbeat() {
  new_case "heartbeat: needs a session name"
  mb heartbeat --project proj; assert_rc 19 "no MAILBOX_SESSION"

  new_case "heartbeat: writes host, project, tmux target, summary, last_seen; keeps rooms"
  rule 'HGET dir:michael michael/s/abc' '{"rooms":["lounge"],"last_seen":1,"project":"old"}'
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" MAILBOX_SESSION="abc" bash "$MB" heartbeat --project proj --host box --tmux 's:1.0' --summary 'doing x' 2>"$T/stderr" </dev/null)" || RC=$?
  ERR="$(cat "$T/stderr")"
  assert_rc 0 "heartbeat ok"
  local hset
  hset="$(cmds | grep -F 'HSET dir:michael michael/s/abc' | head -1)"
  assert_contains "$hset" '"host":"box"' "host"
  assert_contains "$hset" '"project":"proj"' "project replaced"
  assert_contains "$hset" '"tmux_target":"s:1.0"' "tmux target"
  assert_contains "$hset" '"summary":"doing x"' "summary"
  assert_contains "$hset" '"rooms":["lounge"]' "rooms kept"
  assert_contains "$hset" '"last_seen":' "last_seen"

  new_case "heartbeat: bad project name refused"
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" MAILBOX_SESSION="abc" bash "$MB" heartbeat --project 'Bad_Name' 2>"$T/stderr" </dev/null)" || RC=$?
  assert_rc 10 "invalid project name"
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
             '~lock:steve:*' '~rate:steve:*' '~done:steve:*' '~claim:steve:*' '~alias:steve:*'; do
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

  # One login per machine, all acting as one owner (user, 2026-10-16): a lost machine is switched off
  # without re-keying the others.
  new_case "adduser --login: a per-machine login with the owner's permissions"
  admin_env
  mb_admin adduser michael --login michael-desk
  assert_rc 0 "ok"
  assert_eq "yes" "$([ -n "$(line_of 'ACL GENTOKEN michael-desk')" ] && echo yes || echo no)" "token generated for the login"
  rule_line="$(grep '^STDIN	' "$T/calls" | head -1 | cut -f2-)"
  assert_contains "$rule_line" "ACL SETUSER michael-desk reset on >$TOKEN" "SETUSER names the login"
  assert_contains " $rule_line " " ~mbx:*:from:michael " "sender fence is the owner's"
  assert_contains " $rule_line " " ~mbx:michael:* " "inboxes are the owner's"
  assert_not_contains "$rule_line" "from:michael-desk" "no key pattern named after the login"
  assert_contains "$OUT" "MAILBOX_USER=michael-desk" "env line user is the login"
  assert_contains "$OUT" "MAILBOX_OWNER=michael" "env line owner is the owner"

  new_case "adduser --login: invalid login name -> 10, no redis call"
  admin_env
  mb_admin adduser michael --login "Bad Login"; assert_rc 10 "invalid login"
  assert_eq "yes" "$(no_calls && echo yes)" "no redis call"
  new_case "adduser --login without a value -> 2"
  admin_env
  mb_admin adduser michael --login; assert_rc 2 "missing login value"

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

# ---------------------------------------------------------------- stage 4b hardening

fmode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1" 2>/dev/null; }   # GNU, then BSD
qlog() { cat "$CACHE/quarantine.log" 2>/dev/null; }
set_public() { # VALUE: rewrite MAILBOX_PUBLIC in the case config
  grep -v '^MAILBOX_PUBLIC=' "$T/env" > "$T/env.new"; printf 'MAILBOX_PUBLIC="%s"\n' "$1" >> "$T/env.new"
  mv "$T/env.new" "$T/env"; chmod 600 "$T/env"
}
# m1 KEY ID FROM TO BODY [MSG_ID]: one-message XREAD/XREADGROUP reply
m1() {
  jq -n -c --arg k "$1" --arg id "$2" --arg from "$3" --arg to "$4" --arg body "$5" --arg mid "${6:-}" \
    '[[$k, [[$id, (["from",$from,"to",$to,"kind","ask","body",$body,"sent_at","1","thread","t","hops","0"] + (if $mid != "" then ["msg_id",$mid] else [] end))]]]]'
}

test_receiver_policy() {
  # Stage 4b item 1 (Operations review 2026-10-16): MAILBOX_PUBLIC was loaded but never enforced on
  # read, so an outside owner writing straight into Redis could reach a private session address.
  new_case "receiver policy: injected outside-owner mail on a private session address is never read"
  rule 'XREAD COUNT * STREAMS mbx:michael:s:abc:from:steve *' "$(m1 mbx:michael:s:abc:from:steve 1700000000002-0 steve/s/x michael/s/abc 'INJECTED private mail')"
  mb read --as michael/s/abc
  assert_rc 0 "read ok"
  assert_not_contains "$OUT" "INJECTED" "injected mail not shown"
  assert_eq "no" "$(has_cmd 'mbx:michael:s:abc:from:steve' && echo yes || echo no)" "outside-owner key for a private session is never built"
  assert_eq "yes" "$(has_cmd 'STREAMS mbx:michael:s:abc:from:michael 0-0' && echo yes)" "own-owner key still read"

  new_case "receiver policy: private project and room addresses build only own-owner keys"
  mb read --as michael/p/proj
  assert_eq "no" "$(has_cmd 'from:steve' && echo yes || echo no)" "no outside key for a private project"
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" MAILBOX_SESSION="abc" bash "$MB" join lounge 2>"$T/stderr" </dev/null)" || RC=$?
  assert_rc 0 "join ok"
  assert_eq "no" "$(has_cmd 'mbx:michael:r:lounge:from:steve' && echo yes || echo no)" "no outside key for a private room"
  assert_eq "yes" "$(has_cmd 'XREVRANGE mbx:michael:r:lounge:from:michael' && echo yes)" "own room key still set up"

  new_case "receiver policy: addresses listed in MAILBOX_PUBLIC take outside mail"
  set_public "me p/liaison r/town"
  mb read --as michael/p/liaison
  assert_eq "yes" "$(has_cmd 'XGROUP CREATE mbx:michael:p:liaison:from:steve readers 0 MKSTREAM' && echo yes)" "public project address reads the contact owner"
  mb read --as michael/me
  assert_eq "yes" "$(has_cmd 'STREAMS mbx:michael:me:from:steve 0-0' && echo yes)" "person inbox public"
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" MAILBOX_SESSION="abc" bash "$MB" join town 2>"$T/stderr" </dev/null)" || RC=$?
  assert_eq "yes" "$(has_cmd 'XREVRANGE mbx:michael:r:town:from:steve' && echo yes)" "public room reads the contact owner"

  new_case "receiver policy: an owner-qualified public entry works; a malformed one stops with 78"
  set_public "michael/p/liaison"
  mb read --as michael/p/liaison
  assert_eq "yes" "$(has_cmd 'mbx:michael:p:liaison:from:steve' && echo yes)" "michael/p/liaison accepted"
  mb read --as michael/me
  assert_eq "no" "$(has_cmd 'mbx:michael:me:from:steve' && echo yes || echo no)" "person inbox private when not listed"
  set_public "p/Bad_Name"
  mb read; assert_rc 78 "bad MAILBOX_PUBLIC entry"
  set_public "steve/me"
  mb read; assert_rc 78 "another owner's address cannot be public for me"
}

test_quarantine() {
  # Stage 4b item 2: a message whose to/from disagree with the key it sits in is forged or misrouted.
  new_case "quarantine: to does not match the key's address -> not shown, consumed, logged without body"
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael *' "$(m1 mbx:michael:s:abc:from:michael 1700000000004-0 michael/s/x michael/s/other 'SECRET forged body' mid-q1)"
  mb read --as michael/s/abc
  assert_rc 0 "read ok"
  assert_not_contains "$OUT" "forged body" "not shown"
  assert_eq "yes" "$(has_cmd 'SET seen:michael:abc:' && has_cmd '1700000000004-0' && echo yes)" "marker moved past it (consumed)"
  assert_contains "$(qlog)" "mbx:michael:s:abc:from:michael" "log names the key"
  assert_contains "$(qlog)" "1700000000004-0" "log names the stream id"
  assert_contains "$(qlog)" "mid-q1" "log names the msg_id"
  assert_contains "$(qlog)" "to-mismatch" "log gives the reason"
  assert_not_contains "$(qlog)" "SECRET" "never the body"

  new_case "quarantine: from owner differs from the key's from:<owner>"
  rule 'XREAD COUNT 20 STREAMS mbx:michael:me:from:steve *' "$(m1 mbx:michael:me:from:steve 1700000000005-0 michael/s/boss michael/me 'pretending to be michael')"
  mb read --as michael/me
  assert_not_contains "$OUT" "pretending" "not shown"
  assert_contains "$(qlog)" "from-owner-mismatch" "reason"

  new_case "quarantine: missing to field is quarantined; valid mail in the same reply is shown"
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael *' '[["mbx:michael:s:abc:from:michael",[["1700000000006-0",["from","michael/s/x","kind","ask","body","no to field"]],["1700000000007-0",["from","michael/s/x","to","michael/s/abc","kind","ask","body","good one"]]]]]'
  mb read --as michael/s/abc
  assert_not_contains "$OUT" "no to field" "missing to hidden"
  assert_contains "$OUT" "good one" "valid mail shown"
  assert_eq "1" "$(printf '%s\n' "$OUT" | grep -c '^{')" "one line out"

  new_case "quarantine: group mail is acknowledged so it never comes back"
  rule 'XREADGROUP GROUP readers * STREAMS mbx:michael:p:proj:from:michael 0' "$(m1 mbx:michael:p:proj:from:michael 1700000000008-0 michael/s/x michael/p/elsewhere 'misrouted')"
  mb read --as michael/p/proj
  assert_not_contains "$OUT" "misrouted" "not shown"
  assert_eq "yes" "$(has_cmd 'XACK mbx:michael:p:proj:from:michael readers 1700000000008-0' && echo yes)" "acked"

  new_case "quarantine: a peek hides it but logs and consumes nothing"
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael *' "$(m1 mbx:michael:s:abc:from:michael 1700000000004-0 michael/s/x michael/s/other 'forged')"
  mb read --as michael/s/abc --peek
  assert_not_contains "$OUT" "forged" "hidden on peek"
  assert_eq "" "$(qlog)" "nothing logged on peek"
  assert_eq "no" "$(has_cmd 'SET seen:' && echo yes || echo no)" "no marker on peek"

  new_case "quarantine: doctor reports the count"
  mkdir -p "$CACHE"; printf 'a\nb\n' > "$CACHE/quarantine.log"
  mb doctor
  assert_contains "$OUT" "quarantine: 2" "count shown"
}

test_msg_id_dedupe() {
  # Stage 4b item 3: retries (send-later re-XADD, bounce repeat) reach the stream twice with one msg_id.
  new_case "msg_id: send stamps a random 16-hex msg_id, different per send"
  mb send michael/s/abc "one"; mb send michael/s/abc "two"
  local ids
  ids="$(cmds | grep -F 'XADD mbx:michael:s:abc' | grep -o -E 'msg_id [0-9a-f]+' | awk '{print $2}')"
  assert_eq "2" "$(printf '%s\n' "$ids" | grep -c -E '^[0-9a-f]{16}$')" "two 16-hex ids"
  assert_eq "2" "$(printf '%s\n' "$ids" | sort -u | grep -c .)" "ids differ"
  assert_contains "$(cmds | grep -F 'XADD log:michael' | head -1)" '"msg_id":"' "log record carries msg_id"

  new_case "msg_id: two stream entries with one msg_id are shown once; both consumed"
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael *' '[["mbx:michael:s:abc:from:michael",[["1700000000010-0",["from","michael/s/x","to","michael/s/abc","kind","ask","body","twice","msg_id","dup-1"]],["1700000000011-0",["from","michael/s/x","to","michael/s/abc","kind","ask","body","twice","msg_id","dup-1"]]]]]'
  mb read --as michael/s/abc
  assert_eq "1" "$(printf '%s\n' "$OUT" | grep -c '"msg_id":"dup-1"')" "shown once"
  assert_eq "yes" "$(has_cmd 'SET seen:michael:abc:' && has_cmd '1700000000011-0' && echo yes)" "marker past both"
  assert_contains "$(cat "$CACHE/delivered-abc" 2>/dev/null)" "dup-1" "delivered set recorded under the reader"

  new_case "msg_id: a copy delivered in an earlier read is dropped; mail without msg_id passes"
  mkdir -p "$CACHE"; printf 'seen-1 %s\n' "$(date +%s)" > "$CACHE/delivered-abc"
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael *' '[["mbx:michael:s:abc:from:michael",[["1700000000012-0",["from","michael/s/x","to","michael/s/abc","kind","ask","body","again","msg_id","seen-1"]],["1700000000013-0",["from","michael/s/x","to","michael/s/abc","kind","ask","body","legacy no id"]]]]]'
  mb read --as michael/s/abc
  assert_not_contains "$OUT" '"again"' "repeat dropped"
  assert_contains "$OUT" "legacy no id" "no msg_id passes through"
  assert_eq "yes" "$(has_cmd '1700000000013-0' && echo yes)" "marker still advanced"

  new_case "msg_id: entries older than 7 days are pruned from the delivered set"
  local old_ts; old_ts=$(( $(date +%s) - 8 * 86400 ))
  mkdir -p "$CACHE"; printf 'old-1 %s\nnew-1 %s\n' "$old_ts" "$(date +%s)" > "$CACHE/delivered-abc"
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael *' "$(m1 mbx:michael:s:abc:from:michael 1700000000014-0 michael/s/x michael/s/abc 'old id again' old-1)"
  mb read --as michael/s/abc
  assert_contains "$OUT" "old id again" "a pruned id is no longer suppressed"
  assert_not_contains "$(cat "$CACHE/delivered-abc")" "old-1 $old_ts" "8 d entry pruned"
  assert_contains "$(cat "$CACHE/delivered-abc")" "new-1" "fresh entry kept"

  new_case "msg_id: a duplicate in a group is still acknowledged"
  mkdir -p "$CACHE"; printf 'gdup %s\n' "$(date +%s)" > "$CACHE/delivered-proj"
  rule 'XREADGROUP GROUP readers * STREAMS mbx:michael:p:proj:from:michael 0' "$(m1 mbx:michael:p:proj:from:michael 1700000000015-0 michael/s/x michael/p/proj 'group dup' gdup)"
  mb read --as michael/p/proj
  assert_not_contains "$OUT" "group dup" "dropped"
  assert_eq "yes" "$(has_cmd 'XACK mbx:michael:p:proj:from:michael readers 1700000000015-0' && echo yes)" "acked"

  new_case "msg_id: peek drops known repeats but records nothing"
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael *' "$(m1 mbx:michael:s:abc:from:michael 1700000000016-0 michael/s/x michael/s/abc 'peeked' pk-1)"
  mb read --as michael/s/abc --peek
  assert_contains "$OUT" "peeked" "shown on peek"
  assert_eq "no" "$(grep -q pk-1 "$CACHE/delivered-abc" 2>/dev/null && echo yes || echo no)" "not recorded on peek"

  new_case "msg_id: MAILBOX_SESSION names the delivered set (one per session across its addresses)"
  rule 'XREAD COUNT 20 STREAMS mbx:michael:me:from:michael *' "$(m1 mbx:michael:me:from:michael 1700000000017-0 michael/s/x michael/me 'to the person' pm-1)"
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" MAILBOX_SESSION="sess-a" bash "$MB" read --as michael/me 2>"$T/stderr" </dev/null)" || RC=$?
  assert_contains "$(cat "$CACHE/delivered-sess-a" 2>/dev/null)" "pm-1" "recorded under the session"
}

test_private_files() {
  # Stage 4b item 8: mail bodies sit in local files; other local users must not read them.
  new_case "private files: cache dir 700, quarantine, delivered and spool 600"
  rule 'XREAD COUNT 20 STREAMS mbx:michael:s:abc:from:michael *' '[["mbx:michael:s:abc:from:michael",[["1700000000020-0",["from","michael/s/x","to","michael/s/abc","kind","ask","body","ok","msg_id","pf-1"]],["1700000000021-0",["from","michael/s/x","to","michael/s/nope","kind","ask","body","bad"]]]]]'
  mb read --as michael/s/abc --spool "$CACHE/spool-abc"
  assert_eq "700" "$(fmode "$CACHE")" "cache dir"
  assert_eq "600" "$(fmode "$CACHE/quarantine.log")" "quarantine.log"
  assert_eq "600" "$(fmode "$CACHE/delivered-abc")" "delivered set"
  assert_eq "600" "$(fmode "$CACHE/spool-abc")" "spool"

  new_case "private files: an existing world-readable cache dir is tightened to 700"
  mkdir -p "$CACHE"; chmod 755 "$CACHE"
  mb read --as michael/s/abc
  assert_eq "700" "$(fmode "$CACHE")" "tightened"
}

test_send_at_msg_id() {
  new_case "send --at: msg_id stored in the due member"
  RC=0
  OUT="$(PATH="$T/bin:$PATH" MAILBOX_CONFIG="$T/env" bash "$MB" send michael/me --at +5m "later" 2>"$T/stderr" </dev/null)" || RC=$?
  assert_rc 0 "queued"
  assert_eq "yes" "$(grep '^ARGV' "$T/calls" | grep -F 'ZADD' | head -1 | awk -F'\t' '{print $NF}' | jq -e '.fields.msg_id | test("^[0-9a-f]{16}$")' >/dev/null 2>&1 && echo yes || echo no)" "16-hex msg_id in fields"
}

# ---------------------------------------------------------------- live block

live_block() {
  export HOME="$REAL_HOME"
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

# feedrec ID FROM TO KIND [FLEET]: one log:michael row (XREVRANGE shape) for the feed tests.
feedrec() {
  jq -n -c --arg id "$1" --arg f "$2" --arg t "$3" --arg k "$4" --arg fl "${5:-}" \
    '[$id, ["rec", ({id:$id,msg_id:("m"+($id|split("-")[0])),from:$f,to:$t,kind:$k,thread:"th1",hops:2,bytes:5,at:(($id|split("-")[0]|tonumber)/1000|floor)}
       + (if $fl != "" then {fleet:$fl} else {} end) | tostring)]]'
}
# feedbody ID BODY [coord]: the XRANGE reply for one inbox entry.
feedbody() {
  jq -n -c --arg id "$1" --arg b "$2" --arg c "${3:-}" \
    '[[$id, ["from","x","to","y","body",$b] + (if $c != "" then ["coord",$c] else [] end)]]'
}

test_feed() {
  local LOGKEY='XREVRANGE log:michael + - COUNT 500' R1 R2 R3 R4 R5 line n
  R1="$(feedrec 1700000005000-0 michael/s/proj-master michael/p/proj ask)"
  R2="$(feedrec 1700000004000-0 michael/s/other-master michael/p/other fyi)"
  R3="$(feedrec 1700000003000-0 michael/p/proj michael/s/proj-ws01 reply task)"
  R4="$(feedrec 1700000002000-0 michael/me michael/s/projector-9 fyi)"
  R5="$(feedrec 1700000001000-0 michael/s/proj-ws02 michael/r/proj fyi)"

  new_case "feed: keeps only this project's messages, newest first, with body from the inbox key"
  rule "$LOGKEY" "[$R1,$R2,$R3,$R4,$R5]"
  rule 'XRANGE mbx:michael:p:proj:from:michael 1700000005000-0 1700000005000-0' "$(feedbody 1700000005000-0 'plan ready')"
  rule 'XRANGE mbx:michael:s:proj-ws01:from:michael 1700000003000-0 1700000003000-0' "$(feedbody 1700000003000-0 'done with ws01' SECRETCOORD)"
  rule 'XRANGE mbx:michael:r:proj:from:michael 1700000001000-0 1700000001000-0' "$(feedbody 1700000001000-0 'room chatter')"
  mb feed --project proj
  assert_rc 0 "feed ok"
  assert_eq "3" "$(printf '%s\n' "$OUT" | grep -c .)" "three lines: p/proj, s/proj-ws01 and r/proj (not other, not projector)"
  assert_eq "1700000005000-0 1700000003000-0 1700000001000-0" "$(printf '%s\n' "$OUT" | jq -r '.id' | tr '\n' ' ' | sed 's/ $//')" "newest first"
  line="$(printf '%s\n' "$OUT" | sed -n 1p)"
  assert_eq "michael/s/proj-master" "$(printf '%s' "$line" | jq -r .from)" "from"
  assert_eq "michael/p/proj" "$(printf '%s' "$line" | jq -r .to)" "to"
  assert_eq "ask" "$(printf '%s' "$line" | jq -r .kind)" "kind"
  assert_eq "plan ready" "$(printf '%s' "$line" | jq -r .body)" "body"
  assert_eq "th1" "$(printf '%s' "$line" | jq -r .thread)" "thread"
  assert_eq "2" "$(printf '%s' "$line" | jq -r .hops)" "hops"
  assert_eq "1700000005" "$(printf '%s' "$line" | jq -r .at)" "at"
  assert_eq "null" "$(printf '%s' "$line" | jq -c '.fleet')" "no fleet key value when absent"
  assert_eq "task" "$(printf '%s\n' "$OUT" | sed -n 2p | jq -r .fleet)" "fleet type carried"
  assert_not_contains "$OUT" "SECRETCOORD" "coord never printed"
  assert_not_contains "$OUT" "coord" "no coord field"
  assert_not_contains "$OUT" "$PASSWORD" "password never printed"

  new_case "feed: read-only (no XACK, no marker or delivered write, no group)"
  rule "$LOGKEY" "[$R1]"
  rule 'XRANGE mbx:michael:p:proj:from:michael 1700000005000-0 1700000005000-0' "$(feedbody 1700000005000-0 hi)"
  mb feed --project proj
  assert_rc 0 "ok"
  for n in XACK XADD SET HSET DEL EXPIRE XGROUP XREADGROUP XREAD; do
    if cmds | grep -q "^$n "; then bad "feed issued $n"; else ok; fi
  done
  assert_eq "no" "$([ -e "$CACHE/delivered-proj" ] && echo yes || echo no)" "no delivered set written"
  assert_eq "yes" "$(has_cmd 'XRANGE mbx:michael:p:proj:from:michael' && echo yes)" "body read by XRANGE"

  new_case "feed: body gone (trimmed or expired) gives body null, message still listed"
  rule "$LOGKEY" "[$R1]"
  mb feed --project proj
  assert_rc 0 "ok"
  assert_eq "1" "$(printf '%s\n' "$OUT" | grep -c .)" "one line"
  assert_eq "null" "$(printf '%s' "$OUT" | jq -c .body)" "body null"

  new_case "feed: an object-shaped XRANGE reply ({id: [fields]}) works too"
  rule "$LOGKEY" "[$R1]"
  rule 'XRANGE mbx:michael:p:proj:from:michael *' '{"1700000005000-0":["from","x","body","obj body","coord","SECRETCOORD"]}'
  mb feed --project proj
  assert_eq "obj body" "$(printf '%s' "$OUT" | jq -r .body)" "body"
  assert_not_contains "$OUT" "SECRETCOORD" "coord never printed (object shape)"

  new_case "feed: --count caps the output; default and bounds"
  rule "$LOGKEY" "[$R1,$R3,$R5]"
  mb feed --project proj --count 2
  assert_rc 0 "ok"
  assert_eq "2" "$(printf '%s\n' "$OUT" | grep -c .)" "two lines"
  mb feed --project proj --count 0; assert_rc 2 "count 0 refused"
  mb feed --project proj --count 201; assert_rc 2 "count 201 refused"
  mb feed --project proj --count abc; assert_rc 2 "count abc refused"
  mb feed; assert_rc 2 "project required"
  mb feed --project 'Bad Name'; assert_rc 2 "bad project refused"
  mb feed --project proj --bogus; assert_rc 2 "unknown flag refused"

  new_case "feed: empty log prints nothing, exit 0"
  mb feed --project proj
  assert_rc 0 "ok"
  assert_eq "" "$OUT" "no output"

  new_case "feed: exit codes follow the table (78 no config, 15 unreachable)"
  rm -f "$T/env"
  mb feed --project proj; assert_rc 78 "no config"
  new_case "feed: unreachable"
  rule "$LOGKEY" '!EXIT:1:Could not connect to Redis'
  mb feed --project proj; assert_rc 15 "unreachable"
}

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
  test_stats
  test_feed
  test_join_leave
  test_read_max_and_peek
  test_heartbeat
  test_doctor
  test_adduser
  test_receiver_policy
  test_quarantine
  test_msg_id_dedupe
  test_private_files
  test_send_at_msg_id
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
