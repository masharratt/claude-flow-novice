#!/usr/bin/env bash
# tests/test-jev-allow-shadow.sh
# Jev allow shadow (one-week trial from 2026-10-16) :: careful-guard asks Jev
# about every command it lets through and logs the answer; decides nothing.
#
# Verifies:
#   - allow path logs one "allow" line with Jev's verdict, guard outcome noted
#   - deny path never calls the allow shadow
#   - secrets are scrubbed from both the outgoing request and the log
#   - the trial ends by itself after JEV_ALLOW_SHADOW_UNTIL; kill switch works
#   - no key: no call, no line; API failure: a skip line; hook always exits 0
#
# The hook runs as a subprocess with JSON on stdin, foreground via
# CFN_JEV_ALLOW_SYNC=1. curl is stubbed on PATH (argv logged, so the request
# body is checked for leaks). Hook and scripts are copied into a fake root and
# HOME points there. Fully offline; no network.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

T=$(mktemp -d "${TMPDIR:-/tmp}/jev-allow.XXXXXX") || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1
trap 'cfn_safe_rm_tmp "$T"' EXIT

FAKE_ROOT="$T/root"
DATA_DIR="$T/data"
LOG_FILE="$DATA_DIR/jev-allow-shadow.jsonl"
CURL_LOG="$T/curl.log"
HOOK="$FAKE_ROOT/.claude/hooks/cfn-careful-guard.sh"

mkdir -p "$T/bin" "$FAKE_ROOT/.claude/cfn-scripts" "$FAKE_ROOT/.claude/helpers" \
         "$FAKE_ROOT/.claude/skills/cfn-careful/lib" "$FAKE_ROOT/.claude/hooks"
cat > "$T/bin/curl" <<'STUB'
#!/usr/bin/env bash
# test stub for curl: log argv, scripted rc via JEV_CURL_RC, body via JEV_CURL_BODY_FILE
printf 'curl %s\n' "$*" >> "${JEV_CURL_LOG:-/dev/null}"
if [ "${JEV_CURL_RC:-0}" = "0" ] && [ -n "${JEV_CURL_BODY_FILE:-}" ]; then cat "$JEV_CURL_BODY_FILE"; fi
exit "${JEV_CURL_RC:-0}"
STUB
chmod +x "$T/bin/curl"
cp "$PROJECT_ROOT/.claude/cfn-scripts/jev-systemone.sh" "$PROJECT_ROOT/.claude/cfn-scripts/jev-shadow-lib.sh" "$FAKE_ROOT/.claude/cfn-scripts/"
cp "$PROJECT_ROOT/.claude/helpers/cfn-portable.sh" "$FAKE_ROOT/.claude/helpers/"
cp "$PROJECT_ROOT/.claude/skills/cfn-careful/lib/jev-allow-check.sh" \
   "$PROJECT_ROOT/.claude/skills/cfn-careful/lib/jev-deny-check.sh" "$FAKE_ROOT/.claude/skills/cfn-careful/lib/"
cp "$PROJECT_ROOT/.claude/hooks/cfn-careful-guard.sh" "$HOOK"
chmod +x "$FAKE_ROOT/.claude/cfn-scripts/"*.sh "$FAKE_ROOT/.claude/skills/cfn-careful/lib/"*.sh "$HOOK"

BODY="$T/body.json"
echo '{"answers":{"gate":{"choice":"safe","confidence":0.91}},"usage":{"input_tokens":120}}' > "$BODY"

pass=0; fail=0
ok()  { pass=$((pass+1)); }
bad() { fail=$((fail+1)); echo "FAIL ($1): $2"; }

# hook CMD [extra env...]: run the hook once with a fresh log and curl log.
hook() {
  local cmd=$1; shift
  mkdir -p "$DATA_DIR"; rm -f "$LOG_FILE"; : > "$CURL_LOG"; RC=0
  python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$cmd" \
    | env PATH="$T/bin:$PATH" HOME="$FAKE_ROOT" CFN_DATA_DIR="$DATA_DIR" CFN_JEV_ALLOW_SYNC=1 \
        TYPESAFE_API_KEY=test-key JEV_CURL_LOG="$CURL_LOG" JEV_CURL_BODY_FILE="$BODY" JEV_CURL_RC=0 \
        JEV_ALLOW_SHADOW_UNTIL=2099-12-31 FLEET_RUN_DIR= CLAUDE_PROJECT_DIR= "$@" \
        bash "$HOOK" >/dev/null 2>&1 || RC=$?
}
lines() { [ -f "$LOG_FILE" ] && grep -c . "$LOG_FILE" || echo 0; }
calls() { grep -c . "$CURL_LOG" || true; }

# GIVEN a routine command the guard allows, THEN one allow line with Jev's verdict
hook 'ls -la src'
[ "$RC" = 0 ] && ok || bad "allow exit" "rc=$RC"
[ "$(lines)" = 1 ] && ok || bad "allow line count" "$(lines)"
[ "$(jq -r '[.type,.guard,.jev_verdict,.confidence,.cmd]|@tsv' "$LOG_FILE" 2>/dev/null)" = "$(printf 'allow\tallow\tsafe\t0.91\tls -la src')" ] \
  && ok || bad "allow line fields" "$(cat "$LOG_FILE" 2>/dev/null)"

# GIVEN a command the guard denies, THEN the allow shadow never runs
hook 'git push --force origin main'
[ "$RC" = 2 ] && ok || bad "deny exit" "rc=$RC"
[ "$(lines)" = 0 ] && ok || bad "deny path wrote allow line" "$(cat "$LOG_FILE")"

# GIVEN secrets in the command, THEN neither the request nor the log carries them
SECRET_CMD='curl -H "Authorization: Bearer tok_live_abc123" https://u:hunter2pw@api.x.io; OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwx ./run; echo ghp_abcdefghijklmnopqrstuvwxyz0123 AKIAABCDEFGHIJKLMNOP'
hook "$SECRET_CMD"
for s in tok_live_abc123 hunter2pw sk-abcdefghij ghp_abcdefghij AKIAABCDEFGHIJKLMNOP; do
  if grep -q "$s" "$CURL_LOG" "$LOG_FILE" 2>/dev/null; then bad "scrub $s" "leaked"; else ok; fi
done
grep -q 'REDACTED' "$LOG_FILE" && ok || bad "scrub marker" "$(cat "$LOG_FILE")"

# GIVEN the trial end date has passed, THEN no call and no line
hook 'ls' JEV_ALLOW_SHADOW_UNTIL=2000-01-01
[ "$(calls)" = 0 ] && [ "$(lines)" = 0 ] && ok || bad "expiry" "calls=$(calls) lines=$(lines)"

# GIVEN the kill switch, THEN no call
hook 'ls' CFN_JEV_ALLOW_SHADOW=off
[ "$(calls)" = 0 ] && ok || bad "kill switch" "calls=$(calls)"

# GIVEN no API key, THEN no line and the hook still allows
hook 'ls' TYPESAFE_API_KEY=
[ "$RC" = 0 ] && [ "$(lines)" = 0 ] && ok || bad "no key" "rc=$RC lines=$(lines)"

# GIVEN the API fails, THEN a skip line and the hook still allows
hook 'ls' JEV_CURL_RC=7
[ "$RC" = 0 ] && ok || bad "api fail exit" "rc=$RC"
[ "$(jq -r .type "$LOG_FILE" 2>/dev/null)" = skip ] && ok || bad "api fail skip line" "$(cat "$LOG_FILE" 2>/dev/null)"

echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
