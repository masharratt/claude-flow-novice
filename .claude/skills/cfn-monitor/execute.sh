#!/usr/bin/env bash
# cfn-monitor - post-deploy health gate.
# Probes HTTP endpoints for expected status + optional latency budget.
# JSON summary -> stdout (machine-readable). Status lines -> stderr.
# Exit 0 = all healthy. Exit 1 = any failure. Exit 2 = no targets. Exit 3 = config error.
#
# cfn: single-shot probe, not continuous.
# Upgrade trigger: need for scheduled polling with consecutive-failure counting
#   -> wrap in a cron/systemd timer, add a state file tracking N consecutive failures.
set -euo pipefail

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
die() { echo "cfn-monitor: error: $*" >&2; exit "${2:-1}"; }
log() { echo "cfn-monitor: $*" >&2; }
has() { command -v "$1" >/dev/null 2>&1; }

has curl || die "curl is required but not found in PATH" 1

TIMEOUT_S="${CFN_MONITOR_TIMEOUT_S:-10}"

# ---------------------------------------------------------------------------
# Internal target format: "url|expected_status|latency_budget_ms"
# latency_budget_ms is empty string when no budget is configured.
# ---------------------------------------------------------------------------
TARGETS=()

# parse_flag_target: split "url[:status[:budget]]" where url may contain host:port.
# Strategy: strip scheme, isolate host:port using %%/*, then peel numeric suffixes
# from the right of the path part. Avoids false-splitting on the port colon.
parse_flag_target() {
  local raw="$1"
  local scheme="" hostport="" path_and_rest=""

  case "$raw" in
    https://*)
      scheme="https://"
      local _t="${raw#https://}"
      hostport="${_t%%/*}"
      path_and_rest="${_t#"$hostport"}"
      ;;
    http://*)
      scheme="http://"
      local _t="${raw#http://}"
      hostport="${_t%%/*}"
      path_and_rest="${_t#"$hostport"}"
      ;;
    *)
      # No scheme: treat the whole string as path (unusual but handled)
      path_and_rest="$raw"
      ;;
  esac

  # Peel numeric suffixes from the right for params.
  # "path:status:budget" or "path:status" or "path" (no params).
  local path="$path_and_rest" status="" budget=""

  if [[ "$path" =~ ^(.*):([0-9]+)$ ]]; then
    local val1="${BASH_REMATCH[2]}"
    local rest1="${BASH_REMATCH[1]}"
    if [[ "$rest1" =~ ^(.*):([0-9]+)$ ]]; then
      # Two numeric suffixes: second-from-right = status, rightmost = budget
      status="${BASH_REMATCH[2]}"
      path="${BASH_REMATCH[1]}"
      budget="$val1"
    else
      # One numeric suffix: it is the status, no budget
      status="$val1"
      path="$rest1"
    fi
  fi

  local url="${scheme}${hostport}${path}"
  TARGETS+=("${url}|${status:-200}|${budget}")
}

# ---------------------------------------------------------------------------
# argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      [[ $# -lt 2 ]] && die "--target requires an argument" 1
      parse_flag_target "$2"
      shift 2
      ;;
    --target=*)
      parse_flag_target "${1#--target=}"
      shift
      ;;
    *)
      die "unknown argument: $1" 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# CFN_MONITOR_TARGETS env (JSON array)
# ---------------------------------------------------------------------------
if [[ -n "${CFN_MONITOR_TARGETS:-}" ]]; then
  if ! has jq; then
    log "warning: jq not found; CFN_MONITOR_TARGETS env ignored (use --target flags)"
  else
    if ! printf '%s' "$CFN_MONITOR_TARGETS" | jq -e . >/dev/null 2>&1; then
      die "CFN_MONITOR_TARGETS is not valid JSON" 3
    fi
    while IFS=$'\t' read -r env_url env_status env_budget; do
      [[ -z "$env_url" ]] && continue
      # Normalise jq "null" string (emitted when optional field absent) to empty
      [[ "$env_budget" == "null" ]] && env_budget=""
      TARGETS+=("${env_url}|${env_status}|${env_budget}")
    done < <(printf '%s' "$CFN_MONITOR_TARGETS" | jq -r '.[] | [
      .url,
      (.expected_status // 200 | tostring),
      (.latency_budget_ms | if . == null then "" else tostring end)
    ] | @tsv' 2>/dev/null)
  fi
fi

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  log "no targets configured. Use --target or set CFN_MONITOR_TARGETS."
  printf '{"timestamp":"%s","targets_total":0,"targets_pass":0,"targets_fail":0,"results":[]}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  exit 2
fi

# ---------------------------------------------------------------------------
# probe loop
# ---------------------------------------------------------------------------
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PASS_COUNT=0
FAIL_COUNT=0
RESULTS_JSON=""

_emit_result() {
  local url="$1" expected_status="$2" actual_status="$3"
  local latency_ms="$4" latency_budget_ms="$5" probe_status="$6" reason="$7"
  local latency_ok="${8:-null}"

  local budget_json
  if [[ -z "$latency_budget_ms" ]]; then
    budget_json="null"
  else
    budget_json="$latency_budget_ms"
  fi

  # Escape JSON string (backslash first, then double-quote, then strip control chars)
  local reason_json
  reason_json=$(printf '%s' "$reason" \
    | sed 's/\\/\\\\/g; s/"/\\"/g' \
    | tr -d '\n\r\t')

  local entry
  entry=$(printf \
    '{"url":"%s","expected_status":%s,"actual_status":%s,"latency_ms":%s,"latency_budget_ms":%s,"latency_ok":%s,"status":"%s","reason":"%s"}' \
    "$url" "$expected_status" "$actual_status" \
    "$latency_ms" "$budget_json" "$latency_ok" \
    "$probe_status" "$reason_json")

  RESULTS_JSON="${RESULTS_JSON:+${RESULTS_JSON},}${entry}"

  if [[ "$probe_status" == "pass" ]]; then
    PASS_COUNT=$(( PASS_COUNT + 1 ))
    log "  PASS  ${url}  ${actual_status}  ${latency_ms}ms"
  else
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
    log "  FAIL  ${url}  actual=${actual_status}  ${latency_ms}ms  reason: ${reason}"
  fi
}

probe_target() {
  local raw="$1"

  # Unpack pipe-delimited internal format
  local url="" expected_status="200" latency_budget_ms=""
  url="${raw%%|*}"
  if [[ "$raw" == *'|'* ]]; then
    local _rest="${raw#*|}"
    if [[ "$_rest" == *'|'* ]]; then
      expected_status="${_rest%%|*}"
      latency_budget_ms="${_rest#*|}"
    else
      expected_status="${_rest}"
      latency_budget_ms=""
    fi
  fi
  [[ -z "$expected_status" ]] && expected_status="200"

  [[ -z "$url" ]] && { log "skipping empty url"; return; }

  log "probing ${url} (expect ${expected_status}${latency_budget_ms:+, budget ${latency_budget_ms}ms})"

  # Probe: write-out goes to stdout, errors suppressed to keep reason string clean
  local write_out curl_rc=0
  write_out=$(curl -o /dev/null -sS --max-time "$TIMEOUT_S" \
    -w '%{http_code} %{time_total}' "$url" 2>/dev/null) || curl_rc=$?

  if [[ "$curl_rc" -ne 0 ]]; then
    _emit_result "$url" "$expected_status" "0" "0" "$latency_budget_ms" "fail" \
      "curl error (exit ${curl_rc})"
    return
  fi

  if [[ -z "$write_out" ]]; then
    _emit_result "$url" "$expected_status" "0" "0" "$latency_budget_ms" "fail" \
      "empty response from curl"
    return
  fi

  local actual_status latency_s
  read -r actual_status latency_s <<< "$write_out"

  # Convert fractional seconds to integer ms
  local latency_ms
  latency_ms=$(awk "BEGIN { printf \"%d\", $latency_s * 1000 }")

  # Evaluate thresholds
  local probe_status="pass" reason="" latency_ok="null"

  if [[ "$actual_status" != "$expected_status" ]]; then
    probe_status="fail"
    reason="status mismatch (expected ${expected_status}, got ${actual_status})"
  fi

  if [[ -n "$latency_budget_ms" ]]; then
    if (( latency_ms > latency_budget_ms )); then
      probe_status="fail"
      local lat_reason="latency ${latency_ms}ms > budget ${latency_budget_ms}ms"
      reason="${reason:+${reason}; }${lat_reason}"
      latency_ok="false"
    else
      latency_ok="true"
    fi
  fi

  _emit_result "$url" "$expected_status" "$actual_status" \
    "$latency_ms" "$latency_budget_ms" "$probe_status" "$reason" "$latency_ok"
}

for target in "${TARGETS[@]}"; do
  probe_target "$target"
done

TOTAL=$(( PASS_COUNT + FAIL_COUNT ))

printf '{"timestamp":"%s","targets_total":%d,"targets_pass":%d,"targets_fail":%d,"results":[%s]}\n' \
  "$TIMESTAMP" "$TOTAL" "$PASS_COUNT" "$FAIL_COUNT" "$RESULTS_JSON"

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  log "${FAIL_COUNT}/${TOTAL} targets failed. See RUNBOOK.md for triage steps."
  exit 1
fi

log "all ${TOTAL} targets healthy."
exit 0
