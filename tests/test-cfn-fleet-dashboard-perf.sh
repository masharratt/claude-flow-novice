#!/usr/bin/env bash
# tests/test-cfn-fleet-dashboard-perf.sh
# cfn-fleet dashboard: browser cost, server resource leaks, WSL --open.
#
# Regression (2026-11-16): a Chrome tab on the fleet dashboard (1064-row roster,
# MDTWII fleet-main) burned about one CPU core for days and lagged the whole
# Windows desktop, and kept lagging after "fleet dashboard --stop". Measured
# cause: every poll rebuilt all cards twice (roster + host-states) and each
# rebuild fetched files/<ws>.txt once per card (~425 requests/s, Chrome hit
# ERR_INSUFFICIENT_RESOURCES); the 1s ticker rewrote every age label (full
# layout of a ~45k-node page each second, forever, hidden or not); polling had
# no backoff when the server was gone. Also: "fleet dashboard --open" on WSL
# landed on the "/" directory listing instead of /dashboard.html.
#
# The browser cases need node + playwright-core + a chromium; they SKIP when
# none is found (FLEET_TEST_PLAYWRIGHT_CORE / FLEET_TEST_CHROMIUM override the
# lookup). The leak case needs python3 and /proc.
# No -e: a failed assert must record and move on, not end the suite.
set -uo pipefail
export FLEET_MAILBOX=off
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SKILL_LIB="$PROJECT_ROOT/.claude/skills/cfn-fleet/lib"
FLEET_CLI="$PROJECT_ROOT/.claude/skills/cfn-fleet/cli/fleet"
# shellcheck disable=SC1091
source "$SKILL_LIB/common.sh"
# shellcheck disable=SC1091
source "$SKILL_LIB/cmd-dashboard.sh"
set +e  # the sourced libs turn -e back on

_tmp_dir_ok() {
    case "${1:-}" in
        */cfn-fleet-dash.*) ;;
        *) return 1 ;;
    esac
    [ "$1" != "$PROJECT_ROOT" ] && [ "$1" != "${HOME:-}" ] && [ "$1" != "/" ]
}
TEST_TMP_RAW=$(mktemp -d -t cfn-fleet-dash.XXXXXX) || exit 1
TEST_TMP=$(cd "$TEST_TMP_RAW" && pwd -P) || exit 1
_tmp_dir_ok "$TEST_TMP" || { echo "REFUSING TO RUN: bad temp dir '$TEST_TMP'" >&2; exit 1; }
RUN_DIR=""
export DASH_OUT=""
DASH_RC=0

cleanup() {
    if [ -n "${RUN_DIR:-}" ] && [ -f "$RUN_DIR/.dashboard.pid" ]; then
        kill "$(cat "$RUN_DIR/.dashboard.pid" 2>/dev/null)" >/dev/null 2>&1 || true
    fi
    if _tmp_dir_ok "$TEST_TMP"; then
        rm -rf "$TEST_TMP"
    fi
}
trap cleanup EXIT
unset FLEET_DASHBOARD_PORT FLEET_DEFAULT_ENGINE FLEET_DASH_OPEN_WSL || true

# tmux stub: the dashboard probes sessions; never touch a real tmux server.
mkdir -p "$TEST_TMP/bin"
printf '#!/usr/bin/env bash\nexit 1\n' > "$TEST_TMP/bin/tmux"
chmod +x "$TEST_TMP/bin/tmux"
export PATH="$TEST_TMP/bin:$PATH"

build_run() {
    RUN_DIR="$TEST_TMP/planning/fleet-$1"
    mkdir -p "$RUN_DIR/files"
    printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\n' > "$RUN_DIR/roster.tsv"
    : > "$RUN_DIR/.roster.lock"
    printf 'FLEET_WORKTREE=off\nFLEET_DB=none\n' > "$RUN_DIR/fleet.env"
    export FLEET_RUN_DIR="$RUN_DIR"
}

add_ws() {  # add_ws WSxx status heartbeat
    printf '%s\tws-%s\ttask %s\t%s\t\t\t\t\t%s\t\t\n' "$1" "$1" "$1" "$2" "$3" >> "$RUN_DIR/roster.tsv"
}

run_dash() {
    local rc=0
    DASH_OUT=$( { export FLEET_RUN_DIR="$RUN_DIR"; main "$@"; } 2>&1 ) || rc=$?
    DASH_RC=$rc
}

pick_port() {
    python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

# --- browser tooling lookup -------------------------------------------------
find_playwright_core() {
    if [ -n "${FLEET_TEST_PLAYWRIGHT_CORE:-}" ] && [ -f "$FLEET_TEST_PLAYWRIGHT_CORE/package.json" ]; then
        printf '%s\n' "$FLEET_TEST_PLAYWRIGHT_CORE"; return 0
    fi
    local p
    p=$(cd "$PROJECT_ROOT" && node -e 'console.log(require("path").dirname(require.resolve("playwright-core/package.json")))' 2>/dev/null) || p=""
    if [ -n "$p" ]; then printf '%s\n' "$p"; return 0; fi
    for p in "$HOME"/.cache/npm/_npx/*/node_modules/playwright-core "$HOME"/.npm/_npx/*/node_modules/playwright-core; do
        [ -f "$p/package.json" ] && { printf '%s\n' "$p"; return 0; }
    done
    return 1
}

find_chromium() {
    if [ -n "${FLEET_TEST_CHROMIUM:-}" ] && [ -x "$FLEET_TEST_CHROMIUM" ]; then
        printf '%s\n' "$FLEET_TEST_CHROMIUM"; return 0
    fi
    local c best=""
    for c in "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome; do
        [ -x "$c" ] && best="$c"
    done
    [ -n "$best" ] && { printf '%s\n' "$best"; return 0; }
    return 1
}

# --- browser driver -----------------------------------------------------------
# Prints one JSON object of measurements. argv: pwcore chromium url stopCmd startCmd addRowCmd
write_driver() {
    cat > "$TEST_TMP/driver.js" <<'JS'
const [pwcore, exe, url, stopCmd, startCmd, addRowCmd] = process.argv.slice(2);
const { chromium } = require(pwcore);
const { execSync } = require("child_process");
(async () => {
  const b = await chromium.launch(exe ? { executablePath: exe } : {});
  const p = await b.newPage();
  let reqs = [];
  p.on("request", (r) => reqs.push(r.url().replace(/^https?:\/\/[^/]+\//, "").replace(/[?].*$/, "")));
  const out = {};
  const sleep = (ms) => p.waitForTimeout(ms);
  await p.goto(url);
  await sleep(4000);
  const watch = () => p.evaluate(() => {
    window.__muts = 0;
    if (window.__mo) window.__mo.disconnect();
    window.__mo = new MutationObserver((l) => { window.__muts += l.length; });
    ["cards", "queued-cards", "tiles", "meter", "tl"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) window.__mo.observe(el, { childList: true, subtree: true, characterData: true });
    });
    window.__mark = document.querySelector('.card[data-ws="WS150"]');
  });

  // 1. steady state, server up, nothing changes
  await watch(); reqs = [];
  await sleep(6000);
  out.steady = await p.evaluate(() => ({
    muts: window.__muts,
    sameCard: document.querySelector('.card[data-ws="WS150"]') === window.__mark,
    doneEditing: !!document.querySelector('.card[data-ws="WS100"] .editing'),
    activeEditing: !!document.querySelector('.card[data-ws="WS001"] .editing'),
    live: document.getElementById("live-dot").getAttribute("data-state"),
  }));
  out.steady.reqs = reqs.length;
  out.steady.fileReqs = reqs.filter((u) => u.startsWith("files/")).length;

  // 2. a roster change still shows up
  execSync(addRowCmd);
  await sleep(3000);
  out.change = await p.evaluate(() => ({ newCard: !!document.querySelector('.card[data-ws="WS999"]') }));

  // 3. server gone: back off
  execSync(stopCmd);
  await sleep(1500);
  reqs = [];
  await watch();
  await sleep(20000);
  out.down = await p.evaluate(() => ({ muts: window.__muts, live: document.getElementById("live-dot").getAttribute("data-state") }));
  out.down.reqs = reqs.length;

  // 4. server back + focus: recovers at once
  execSync(startCmd);
  await p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await sleep(3000);
  out.back = await p.evaluate(() => ({ live: document.getElementById("live-dot").getAttribute("data-state"),
    newCard: !!document.querySelector('.card[data-ws="WS999"]') }));

  // 5. hidden tab: no requests, no DOM writes
  await p.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await sleep(1500);
  reqs = []; await watch();
  await sleep(6000);
  out.hidden = await p.evaluate(() => ({ muts: window.__muts }));
  out.hidden.reqs = reqs.length;
  console.log(JSON.stringify(out));
  await b.close();
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
JS
}

# assert_le N MAX "desc": records a pass/fail without tripping set -e.
assert_le() {
    local verdict="over"
    [ "$1" -le "$2" ] && verdict="within"
    assert_equals "within" "$verdict" "$3"
}

jget() {  # jget JSON dotted.path
    python3 -c 'import json, sys
v = json.loads(sys.argv[1])
for k in sys.argv[2].split("."): v = v[k]
print(str(v).lower() if isinstance(v, bool) else v)' "$1" "$2"
}

test_browser_cost_backoff_and_hidden_tab() {
    local pw exe
    if ! command -v node >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
        log_info "SKIP browser cost: node or python3 unavailable"; return 0
    fi
    if ! pw=$(find_playwright_core); then
        log_info "SKIP browser cost: playwright-core not found (set FLEET_TEST_PLAYWRIGHT_CORE)"; return 0
    fi
    exe=$(find_chromium) || exe=""
    log_step "GIVEN a 203-lane roster (200 finished, 3 active) served with --poll 1"
    build_run dashperf
    local now i port
    now=$(date +%s)
    # Active heartbeats 2h old: their age labels change once a minute, so
    # the mutation caps below measure needless writes, not real ticks.
    add_ws WS001 working $((now - 7200))
    add_ws WS002 working $((now - 7200))
    add_ws WS003 started $((now - 7200))
    for i in $(seq 100 299); do add_ws "WS$i" "done" $((now - 300000)); done
    printf '%s\n' 'src/active.ts' > "$RUN_DIR/files/WS001.txt"
    printf '%s\n' 'src/finished.ts' > "$RUN_DIR/files/WS100.txt"
    port=$(pick_port)
    local env_prefix="FLEET_RUN_DIR='$RUN_DIR' FLEET_MAILBOX=off PATH='$PATH'"
    local start_cmd="$env_prefix '$FLEET_CLI' dashboard --once --poll 1 --port $port >/dev/null 2>&1"
    local stop_cmd="$env_prefix '$FLEET_CLI' dashboard --stop >/dev/null 2>&1"
    local add_cmd="printf 'WS999\tws-WS999\tnew\tworking\t\t\t\t\t$((now - 7200))\t\t\n' >> '$RUN_DIR/roster.tsv'"
    bash -c "$start_cmd"
    write_driver
    local out rc=0
    out=$(node "$TEST_TMP/driver.js" "$pw" "$exe" "http://127.0.0.1:$port/dashboard.html" \
        "$stop_cmd" "$start_cmd" "$add_cmd" 2>"$TEST_TMP/driver.err") || rc=$?
    bash -c "$stop_cmd" || true
    if [ "$rc" -ne 0 ]; then
        assert_equals "0" "$rc" "browser driver ran ($(head -c 400 "$TEST_TMP/driver.err"))"
        return 0
    fi
    log_info "measurements: $out"

    log_step "THEN a steady page polls a handful of URLs, not one per card"
    local n
    n=$(jget "$out" steady.fileReqs)
    assert_le "$n" 24 "files/<ws>.txt fetched only for active lanes, once per poll (got $n in 6s, cap 24)"
    n=$(jget "$out" steady.reqs)
    assert_le "$n" 70 "total requests in 6s at --poll 1 stay small (got $n, cap 70)"
    assert_equals "true" "$(jget "$out" steady.sameCard)" "unchanged roster keeps the same card elements (no rebuild)"
    n=$(jget "$out" steady.muts)
    assert_le "$n" 60 "1s ticker writes only labels that changed (got $n mutations in 6s, cap 60)"
    assert_equals "true" "$(jget "$out" steady.doneEditing)" "a finished lane keeps its now-editing list without polling"
    assert_equals "true" "$(jget "$out" steady.activeEditing)" "an active lane shows its now-editing list"
    assert_equals "ok" "$(jget "$out" steady.live)" "live dot ok while serving"
    assert_equals "true" "$(jget "$out" change.newCard)" "a roster change still re-renders"

    log_step "THEN with the server stopped, polling backs off"
    n=$(jget "$out" down.reqs)
    assert_le "$n" 8 "at most 8 probes in 20s with the server gone (got $n)"
    assert_equals "err" "$(jget "$out" down.live)" "live dot shows the outage"
    n=$(jget "$out" down.muts)
    assert_le "$n" 10 "no card churn while the server is gone (got $n mutations, cap 10)"

    log_step "THEN the server returning + window focus resumes at once"
    assert_equals "ok" "$(jget "$out" back.live)" "live again within 3s of focus"

    log_step "THEN a hidden tab does nothing"
    assert_equals "0" "$(jget "$out" hidden.reqs)" "hidden tab sends no requests"
    assert_equals "0" "$(jget "$out" hidden.muts)" "hidden tab writes nothing to the page"
}

# Server: 2000 requests (normal, 404, aborted mid-request, reset mid-response)
# plus idle connections must not leave fds or threads behind, and aborted
# downloads must not write tracebacks into .dashboard.log.
test_server_no_fd_thread_leak() {
    if ! command -v python3 >/dev/null 2>&1; then
        log_info "SKIP server leak: python3 unavailable"; return 0
    fi
    log_step "GIVEN a served run with a 2 MB file and a 2s request timeout"
    build_run dashleak
    add_ws WS001 working "$(date +%s)"
    head -c 2000000 /dev/zero | tr '\0' 'x' > "$RUN_DIR/files/big.txt"
    local port pid
    port=$(pick_port)
    FLEET_DASHBOARD_REQ_TIMEOUT_S=2 run_dash --once --port "$port"
    assert_equals "0" "$DASH_RC" "server starts"
    pid=$(cat "$RUN_DIR/.dashboard.pid")
    if [ ! -d "/proc/$pid/fd" ]; then
        log_info "SKIP server leak: no /proc"; run_dash --stop; return 0
    fi
    local out
    out=$(python3 - "$port" "$pid" <<'PY'
import os, socket, struct, sys, time, urllib.request
port, pid = int(sys.argv[1]), sys.argv[2]
def fds(): return len(os.listdir("/proc/%s/fd" % pid))
def threads(): return len(os.listdir("/proc/%s/task" % pid))
base = "http://127.0.0.1:%d/" % port
urllib.request.urlopen(base + "roster.tsv", timeout=5).read()
time.sleep(0.3)
f0, t0 = fds(), threads()
for i in range(2000):
    k = i % 4
    try:
        if k == 0:
            urllib.request.urlopen(base + "roster.tsv?ts=%d" % i, timeout=5).read()
        elif k == 1:
            try: urllib.request.urlopen(base + "files/WS99.txt", timeout=5).read()
            except urllib.error.HTTPError: pass
        elif k == 2:
            s = socket.create_connection(("127.0.0.1", port), timeout=5)
            s.sendall(b"GET /roster.tsv HTTP/1.1\r\nHost: x\r\n")  # never finished
            s.close()
        else:
            s = socket.create_connection(("127.0.0.1", port), timeout=5)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
            s.sendall(b"GET /files/big.txt HTTP/1.0\r\n\r\n")
            s.recv(10)
            s.close()  # RST mid-response
    except OSError:
        pass
idle = [socket.create_connection(("127.0.0.1", port), timeout=5) for _ in range(30)]
time.sleep(1)
f_idle = fds()
time.sleep(4)
f_after_timeout, t_after = fds(), threads()
for s in idle: s.close()
time.sleep(0.5)
print(f0, t0, f_idle, f_after_timeout, t_after, fds(), threads())
PY
)
    log_info "fd/thread counts (base_fd base_thr idle_fd after_timeout_fd after_thr end_fd end_thr): $out"
    local f0 t0 faft taft fend tend
    read -r f0 t0 _ faft taft fend tend <<< "$out"
    assert_le "$faft" $((f0 + 3)) "idle connections are dropped by the request timeout (fds $faft vs base $f0)"
    assert_le "$taft" $((t0 + 2)) "no handler threads left behind by idle connections (threads $taft vs base $t0)"
    assert_le "$fend" $((f0 + 3)) "no fds left after 2000 mixed requests (end $fend vs base $f0)"
    assert_le "$tend" $((t0 + 2)) "no threads left after 2000 mixed requests (end $tend vs base $t0)"
    assert_equals "0" "$(grep -c 'Traceback' "$RUN_DIR/.dashboard.log" || true)" \
        "client aborts never write tracebacks into .dashboard.log"
    run_dash --stop
}

# --open on WSL: the Windows browser gets the full /dashboard.html URL.
test_open_on_wsl_uses_windows_browser_with_full_url() {
    log_step "GIVEN WSL with wslview and code on PATH, WHEN _fleet_dash_open"
    local stub="$TEST_TMP/bin-open" log="$TEST_TMP/open.log" out saved_path="$PATH"
    mkdir -p "$stub"
    for b in wslview explorer.exe code; do
        printf '#!/bin/bash\nprintf "%%s|%%s\\n" "%s" "$*" >> "%s"\nexit %s\n' "$b" "$log" \
            "$([ "$b" = explorer.exe ] && echo 1 || echo 0)" > "$stub/$b"
        chmod +x "$stub/$b"
    done
    local url='http://127.0.0.1:4880/dashboard.html'
    : > "$log"
    export PATH="$stub"
    out=$(FLEET_DASH_OPEN_WSL=1 _fleet_dash_open "$url" 2>"$TEST_TMP/open.err")
    export PATH="$saved_path"
    assert_equals "wslview|$url" "$(cat "$log")" "wslview gets the full dashboard URL, code is not used"
    assert_contains "$out" "$url" "URL printed"

    log_step "GIVEN WSL without wslview, WHEN _fleet_dash_open"
    rm -f "$stub/wslview"
    : > "$log"
    export PATH="$stub"
    out=$(FLEET_DASH_OPEN_WSL=1 _fleet_dash_open "$url" 2>"$TEST_TMP/open.err")
    export PATH="$saved_path"
    assert_equals "explorer.exe|$url" "$(cat "$log")" "explorer.exe gets the full dashboard URL"
    assert_equals "" "$(cat "$TEST_TMP/open.err")" "explorer.exe's habitual exit 1 is not reported as a failure"

    log_step "GIVEN not WSL, WHEN _fleet_dash_open"
    : > "$log"
    export PATH="$stub"
    out=$(FLEET_DASH_OPEN_WSL=0 _fleet_dash_open "$url" 2>"$TEST_TMP/open.err")
    export PATH="$saved_path"
    assert_contains "$(cat "$log")" "code|--open-url" "outside WSL the VS Code Simple Browser path is kept"
}

test_browser_cost_backoff_and_hidden_tab
test_server_no_fd_thread_leak
test_open_on_wsl_uses_windows_browser_with_full_url

print_test_summary
