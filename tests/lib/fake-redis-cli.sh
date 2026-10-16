#!/usr/bin/env bash
# Shared fake `redis-cli` for the mailbox test suites (tests/test-cfn-mailbox*.sh).
# Source this file, then call: install_fake_redis_cli <dir>   (writes <dir>/redis-cli, executable)
#
# The fake records every call to $FAKE_LOG (ARGV, STDIN and CMD lines) and the REDISCLI_AUTH
# value to $FAKE_LOG.authenv, and answers from $FAKE_RULES (glob<TAB>reply, first match wins).
# No test using it ever touches a network.

install_fake_redis_cli() {
  local dest="$1/redis-cli"
  cat > "$dest" <<'STUB'
#!/usr/bin/env bash
# Fake redis-cli. Records, then answers from $FAKE_RULES (glob<TAB>reply, first match wins).
set -u
{ printf 'ARGV'; for a in "$@"; do printf '\t%s' "$a"; done; printf '\n'; } >> "$FAKE_LOG"
printf '%s\n' "${REDISCLI_AUTH:-}" >> "$FAKE_LOG.authenv"
json=0 xarg=0
while [ $# -gt 0 ]; do
  case "$1" in
    --tls|--no-auth-warning) shift ;;
    --json) json=1; shift ;;
    -x) xarg=1; shift ;;
    -h|-p|--user) shift 2 ;;
    *) break ;;
  esac
done
stdin="$(cat)"
joined="$*"
# -x: stdin is the command's last argument (real redis-cli semantics); recorded as XARG, never ARGV.
if [ "$xarg" = 1 ]; then
  printf 'XARG\t%s\n' "$stdin" >> "$FAKE_LOG"
  set -- "$@" "$stdin"
  joined="$joined <xarg>"
elif [ -n "$stdin" ]; then
  printf 'STDIN\t%s\n' "$stdin" >> "$FAKE_LOG"; joined="STDIN $stdin"
fi
printf 'CMD\t%s\n' "$joined" >> "$FAKE_LOG"
reply=""; matched=0
while IFS=$'\t' read -r pat rep; do
  [ -z "$pat" ] && continue
  # shellcheck disable=SC2254
  case "$joined" in $pat) reply="$rep"; matched=1; break ;; esac
done < "$FAKE_RULES"
# Optional key-value state (FAKE_KV_DIR): GET, SET [NX|XX] [EX n] and DEL keep real values in files,
# with NX made atomic by noclobber, so claim races between two processes behave like Redis.
if [ "$matched" = 0 ] && [ -n "${FAKE_KV_DIR:-}" ]; then
  kcmd="$(printf '%s' "${1:-}" | tr '[:lower:]' '[:upper:]')"
  kf="$FAKE_KV_DIR/$(printf '%s' "${2:-}" | tr -c 'A-Za-z0-9_.-' '_')"
  case "$kcmd" in
    GET) matched=1; reply="$(cat "$kf" 2>/dev/null || true)" ;;
    DEL) matched=1; if [ -f "$kf" ]; then rm -f "$kf"; reply=1; else reply=0; fi ;;
    SET)
      matched=1; mode=""
      for a in "${@:4}"; do case "$(printf '%s' "$a" | tr '[:lower:]' '[:upper:]')" in NX) mode=NX ;; XX) mode=XX ;; esac; done
      case "$mode" in
        NX) if ( set -C; printf '%s' "$3" > "$kf" ) 2>/dev/null; then reply=OK; else reply=""; fi ;;
        XX) if [ -f "$kf" ]; then printf '%s' "$3" > "$kf.$$" && mv -f "$kf.$$" "$kf"; reply=OK; else reply=""; fi ;;
        *) printf '%s' "$3" > "$kf.$$" && mv -f "$kf.$$" "$kf"; reply=OK ;;
      esac ;;
  esac
  # A value printed with %b would turn JSON escapes into bytes; print it raw.
  if [ "$matched" = 1 ]; then printf '%s\n' "$reply"; exit 0; fi
fi
if [ "$matched" = 0 ]; then
  cmd="$(printf '%s' "${1:-}" | tr '[:lower:]' '[:upper:]')"
  case "$cmd" in
    INCR) reply=1 ;;
    XADD) reply="1700000000000-0" ;;
    PING) reply=PONG ;;
    EXPIRE|DEL|XACK|HSET) reply=1 ;;
    XREAD|XREADGROUP) reply=null ;;
    XREVRANGE|HGETALL|XRANGE|XPENDING|XINFO|ZRANGEBYSCORE) reply="[]" ;;
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
  chmod +x "$dest"
}
