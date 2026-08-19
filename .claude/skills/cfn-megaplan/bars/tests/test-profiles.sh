#!/usr/bin/env bash
# Profile contract: bars.haiku_executable is the Bar B executor tier
# ("full" = haiku-literal steps + live probe; "sonnet" = named-symbol steps, no probe).
# mvp/beta default to sonnet (matches the real executor: opus coordinator + sonnet lanes);
# enterprise stays full.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; P="$DIR/../../profiles"
RUN=0; PASS=0; FAIL=0
ok() { echo "PASS: $1"; PASS=$((PASS+1)); RUN=$((RUN+1)); }
no() { echo "FAIL: $1"; FAIL=$((FAIL+1)); RUN=$((RUN+1)); }
for t in mvp beta enterprise; do
  v="$(jq -r '.bars.haiku_executable' "$P/$t.json")"
  case "$v" in full|sonnet) ok "$t: haiku_executable is a known tier ($v)" ;; *) no "$t: haiku_executable unknown ($v)" ;; esac
  [ "$(jq -r '.bars.verifiable_done' "$P/$t.json")" = "full" ] && ok "$t: verifiable_done stays full" || no "$t: verifiable_done must stay full"
done
[ "$(jq -r '.bars.haiku_executable' "$P/mvp.json")" = "sonnet" ] && ok "mvp defaults to sonnet" || no "mvp defaults to sonnet"
[ "$(jq -r '.bars.haiku_executable' "$P/beta.json")" = "sonnet" ] && ok "beta defaults to sonnet" || no "beta defaults to sonnet"
[ "$(jq -r '.bars.haiku_executable' "$P/enterprise.json")" = "full" ] && ok "enterprise stays full" || no "enterprise stays full"
echo "----"; echo "profiles: $PASS/$RUN passed, $FAIL failed"; [ "$FAIL" -eq 0 ]
