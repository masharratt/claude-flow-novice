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
