#!/usr/bin/env bash
# Tests for cfn-monitor execute.sh
# No external network. Fakes targets using:
#   - a local python3 -m http.server for reachable-endpoint cases
#   - an unreachable port for connection-refused cases
#   - CFN_MONITOR_TARGETS env for JSON config parsing
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/execute.sh"

PASS=0
FAIL=0

check() { # desc, expected-substring, actual
  if echo "$3" | grep -qF "$2"; then
    echo "PASS: $1"; PASS=$(( PASS + 1 ))
  else
    echo "FAIL: $1"
    echo "  want substring: $2"
    echo "  got: $3"
    FAIL=$(( FAIL + 1 ))
  fi
}

check_rc() { # desc, expected_rc, actual_rc
  if [[ "$2" -eq "$3" ]]; then
    echo "PASS: $1 (rc=$3)"; PASS=$(( PASS + 1 ))
  else
    echo "FAIL: $1 (expected rc=$2, got rc=$3)"; FAIL=$(( FAIL + 1 ))
  fi
}

check_jq() { # desc, jq-filter, expected-value, json
  local got
  got=$(echo "$4" | jq -r "$2" 2>/dev/null || true)
  if [[ "$got" == "$3" ]]; then
    echo "PASS: $1"; PASS=$(( PASS + 1 ))
  else
    echo "FAIL: $1 (filter=$2, expected='$3', got='$got')"
    echo "  json: $4"
    FAIL=$(( FAIL + 1 ))
  fi
}

# ---------------------------------------------------------------------------
# Find a free port for the fake HTTP server
# ---------------------------------------------------------------------------
find_free_port() {
  python3 -c "import socket; s=socket.socket(); s.bind(('',0)); p=s.getsockname()[1]; s.close(); print(p)"
}

# ---------------------------------------------------------------------------
# Start a local HTTP server in a temp dir
# ---------------------------------------------------------------------------
WORK=$(mktemp -d)
HTTP_PID=""
SLOW_PID=""
trap 'rm -rf "$WORK"; [[ -n "$HTTP_PID" ]] && kill "$HTTP_PID" 2>/dev/null; [[ -n "$SLOW_PID" ]] && kill "$SLOW_PID" 2>/dev/null; true' EXIT

# Write a minimal static file for the fast server
mkdir -p "$WORK/static"
echo "ok" > "$WORK/static/health"

FREE_PORT=$(find_free_port)
python3 -m http.server "$FREE_PORT" --directory "$WORK/static" >/dev/null 2>&1 &
HTTP_PID=$!

# Write a slow HTTP server (300ms delay) for latency breach testing
SLOW_PORT=$(find_free_port)
cat > "$WORK/slow_server.py" << 'PYEOF'
import sys, http.server, time
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        time.sleep(0.3)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')
    def log_message(self, *a): pass
http.server.HTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
PYEOF
python3 "$WORK/slow_server.py" "$SLOW_PORT" >/dev/null 2>&1 &
SLOW_PID=$!
TARGET_SLOW="http://127.0.0.1:${SLOW_PORT}/health"

# Wait for fast server to be ready (up to 3s)
READY=0
for i in 1 2 3 4 5 6; do
  if curl -fsS "http://127.0.0.1:${FREE_PORT}/health" >/dev/null 2>&1; then
    READY=1; break
  fi
  sleep 0.5
done
if [[ "$READY" -eq 0 ]]; then
  echo "FATAL: local HTTP server did not start on port $FREE_PORT" >&2
  exit 1
fi

# Wait for slow server to be ready (up to 5s, it has a 300ms per-request delay)
SLOW_READY=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 2 "$TARGET_SLOW" >/dev/null 2>&1; then
    SLOW_READY=1; break
  fi
  sleep 0.5
done
if [[ "$SLOW_READY" -eq 0 ]]; then
  echo "FATAL: slow HTTP server did not start on port $SLOW_PORT" >&2
  exit 1
fi

TARGET_OK="http://127.0.0.1:${FREE_PORT}/health"

# Pick a port that is definitely not listening
DEAD_PORT=$(find_free_port)
# Kill any process on it (shouldn't be any) and leave it unbound
TARGET_DEAD="http://127.0.0.1:${DEAD_PORT}/health"

echo "=== cfn-monitor tests ==="
echo "  healthy server: $TARGET_OK"
echo "  dead target:    $TARGET_DEAD"
echo ""

# ---------------------------------------------------------------------------
# Case 1: No targets configured -> exit 2, JSON with targets_total=0
# ---------------------------------------------------------------------------
OUT=$(bash "$SCRIPT" 2>/dev/null); RC=$?
check_rc "no targets: exit 2" 2 "$RC"
check "no targets: JSON targets_total=0" '"targets_total":0' "$OUT"
if echo "$OUT" | jq -e . >/dev/null 2>&1; then
  echo "PASS: no targets: stdout is valid JSON"; PASS=$(( PASS + 1 ))
else
  echo "FAIL: no targets: stdout is not valid JSON"; FAIL=$(( FAIL + 1 ))
fi

# ---------------------------------------------------------------------------
# Case 2: Healthy target -> exit 0, pass JSON
# ---------------------------------------------------------------------------
OUT=$(bash "$SCRIPT" --target "${TARGET_OK}:200" 2>/dev/null); RC=$?
check_rc "healthy target: exit 0" 0 "$RC"
check_jq "healthy target: targets_pass=1" '.targets_pass' "1" "$OUT"
check_jq "healthy target: targets_fail=0" '.targets_fail' "0" "$OUT"
check_jq "healthy target: result status=pass" '.results[0].status' "pass" "$OUT"
check_jq "healthy target: reason empty" '.results[0].reason' "" "$OUT"
if echo "$OUT" | jq -e . >/dev/null 2>&1; then
  echo "PASS: healthy target: stdout is valid JSON"; PASS=$(( PASS + 1 ))
else
  echo "FAIL: healthy target: stdout is not valid JSON"; FAIL=$(( FAIL + 1 ))
fi

# ---------------------------------------------------------------------------
# Case 3: Wrong expected status -> exit 1, fail JSON
# ---------------------------------------------------------------------------
OUT=$(bash "$SCRIPT" --target "${TARGET_OK}:404" 2>/dev/null); RC=$?
check_rc "wrong-status: exit 1" 1 "$RC"
check_jq "wrong-status: targets_fail=1" '.targets_fail' "1" "$OUT"
check_jq "wrong-status: result status=fail" '.results[0].status' "fail" "$OUT"
check "wrong-status: reason mentions mismatch" "status mismatch" "$OUT"

# ---------------------------------------------------------------------------
# Case 4: Unreachable target -> exit 1, fail JSON with curl error
# ---------------------------------------------------------------------------
OUT=$(bash "$SCRIPT" --target "${TARGET_DEAD}:200" 2>/dev/null); RC=$?
check_rc "unreachable: exit 1" 1 "$RC"
check_jq "unreachable: targets_fail=1" '.targets_fail' "1" "$OUT"
check_jq "unreachable: result status=fail" '.results[0].status' "fail" "$OUT"
check "unreachable: reason mentions curl error" "curl error" "$OUT"

# ---------------------------------------------------------------------------
# Case 5: Latency budget pass (generous budget)
# ---------------------------------------------------------------------------
OUT=$(bash "$SCRIPT" --target "${TARGET_OK}:200:60000" 2>/dev/null); RC=$?
check_rc "latency budget pass: exit 0" 0 "$RC"
check_jq "latency budget pass: latency_ok=true" '.results[0].latency_ok' "true" "$OUT"
check_jq "latency budget pass: status=pass" '.results[0].status' "pass" "$OUT"

# ---------------------------------------------------------------------------
# Case 6: Latency budget breach (100ms budget against a 300ms-delay server)
# ---------------------------------------------------------------------------
OUT=$(bash "$SCRIPT" --target "${TARGET_SLOW}:200:100" 2>/dev/null); RC=$?
check_rc "latency breach: exit 1" 1 "$RC"
check_jq "latency breach: targets_fail=1" '.targets_fail' "1" "$OUT"
check_jq "latency breach: latency_ok=false" '.results[0].latency_ok' "false" "$OUT"
check "latency breach: reason mentions budget" "budget" "$OUT"

# ---------------------------------------------------------------------------
# Case 7: No latency budget -> latency_ok is null, probe still passes on status
# ---------------------------------------------------------------------------
OUT=$(bash "$SCRIPT" --target "${TARGET_OK}:200" 2>/dev/null); RC=$?
check_rc "no budget: exit 0" 0 "$RC"
check_jq "no budget: latency_ok is null" '.results[0].latency_ok' "null" "$OUT"
check_jq "no budget: latency_budget_ms is null" '.results[0].latency_budget_ms' "null" "$OUT"

# ---------------------------------------------------------------------------
# Case 8: CFN_MONITOR_TARGETS env (JSON config)
# ---------------------------------------------------------------------------
if command -v jq >/dev/null 2>&1; then
  TARGETS_JSON='[{"url":"'"$TARGET_OK"'","expected_status":200,"latency_budget_ms":60000}]'
  OUT=$(CFN_MONITOR_TARGETS="$TARGETS_JSON" bash "$SCRIPT" 2>/dev/null); RC=$?
  check_rc "env JSON config: exit 0" 0 "$RC"
  check_jq "env JSON config: targets_pass=1" '.targets_pass' "1" "$OUT"
else
  echo "SKIP: jq not installed; CFN_MONITOR_TARGETS env test skipped"
fi

# ---------------------------------------------------------------------------
# Case 9: Mixed pass+fail -> exit 1, correct counts
# ---------------------------------------------------------------------------
OUT=$(bash "$SCRIPT" \
  --target "${TARGET_OK}:200" \
  --target "${TARGET_OK}:404" 2>/dev/null); RC=$?
check_rc "mixed: exit 1" 1 "$RC"
check_jq "mixed: targets_total=2" '.targets_total' "2" "$OUT"
check_jq "mixed: targets_pass=1" '.targets_pass' "1" "$OUT"
check_jq "mixed: targets_fail=1" '.targets_fail' "1" "$OUT"

# ---------------------------------------------------------------------------
# Case 10: Invalid CFN_MONITOR_TARGETS JSON -> exit 3
# ---------------------------------------------------------------------------
if command -v jq >/dev/null 2>&1; then
  OUT=$(CFN_MONITOR_TARGETS='{bad json}' bash "$SCRIPT" 2>&1); RC=$?
  check_rc "bad JSON env: exit 3" 3 "$RC"
else
  echo "SKIP: jq not installed; bad JSON env test skipped"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "---"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
