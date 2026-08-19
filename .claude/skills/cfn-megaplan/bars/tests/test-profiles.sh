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

# ---- cfn-megaplan-fast single profile (caps + static bars + no probe) ----
FAST="$DIR/../../../cfn-megaplan-fast/profiles/fast.json"
if [ -f "$FAST" ]; then
  [ "$(jq -r '.bars.verifiable_done' "$FAST")" = "full" ] && ok "fast: verifiable_done full" || no "fast: verifiable_done must be full"
  [ "$(jq -r '.bars.haiku_executable' "$FAST")" = "static" ] && ok "fast: haiku_executable static" || no "fast: haiku_executable must be static"
  [ "$(jq -r '.no_nested_spawns' "$FAST")" = "true" ] && ok "fast: no_nested_spawns true" || no "fast: no_nested_spawns must be true"
  [ "$(jq -r '[.caps.SPEC,.caps.DATA,.caps.ARCH,.caps.UX,.caps.REVIEW,.caps.TEST,.caps.PLAN,.caps.VERIFY] | all(type=="number" and . > 0)' "$FAST")" = "true" ] && ok "fast: caps present for SPEC/DATA/ARCH/UX/REVIEW/TEST/PLAN/VERIFY" || no "fast: caps missing"
  [ "$(jq -r '[.phases[] | select(.agent!="none") | .model] | all(. == "opus" or . == "sonnet")' "$FAST")" = "true" ] && ok "fast: every spawned phase model in {opus,sonnet}" || no "fast: phase model outside {opus,sonnet}"
  [ "$(jq -r '[.phases[] | select(.agent!="none") | .agent] | all(length>0)' "$FAST")" = "true" ] && ok "fast: every spawned phase has an agent" || no "fast: phase missing agent"
  [ "$(jq -r '[paths(..) | .[-1]] | index("probe")' "$FAST")" = "null" ] && ok "fast: no probe key anywhere" || no "fast: probe key present"
  [ "$(jq -r '.loop.bar_rounds' "$FAST")" = "1" ] && ok "fast: bar_rounds 1" || no "fast: bar_rounds must be 1"
  [ "$(jq -r '[.phases.spec,.phases.arch] | all(.model=="opus")' "$FAST")" = "true" ] && ok "fast: spec+arch on opus" || no "fast: spec/arch must be opus"
  [ "$(jq -r '[.phases[] | select(.scope=="part")] | length' "$FAST")" = "3" ] && ok "fast: exactly 3 per-part phases (test_plan, write_plan, bar_b)" || no "fast: per-part phase count != 3"
else
  no "fast: profile missing at $FAST"
fi
echo "----"; echo "profiles: $PASS/$RUN passed, $FAIL failed"; [ "$FAIL" -eq 0 ]
