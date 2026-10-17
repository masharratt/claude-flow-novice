#!/usr/bin/env bash
# tests/test-cfn-fleet-dashboard.sh
# Phase CI :: cfn-fleet dashboard (Priority 1)
# Verifies the fleet-native HTML dashboard: card grid rendered from roster.tsv
# (parsed by header name), html-escaped interpolation, whitelist-mapped status
# pills, STALE/DEAD derivation, dashboard-owned transition history
# (.dashboard.state + dashboard-events.jsonl, never .watch.state), a
# self-contained page (zero <link>, zero non-data src/href), the python3
# http.server lifecycle with pidfile liveness checks, and port precedence.
#
# tmux is stubbed on PATH (has-session scripted via env, see
# tests/test-cfn-fleet-spawn-watch.sh for the pattern) so DEAD-by-pane-exit is
# exercised without a real tmux server; a restricted PATH dir stands in for
# hosts without tmux or the code CLI. All render cases run main --no-serve
# --once; the serve lifecycle case runs main for real against an ephemeral
# port and skips gracefully without python3.
set -euo pipefail
# The mailbox path (stage 5) has its own suite (test-cfn-fleet-mailbox.sh, fake
# redis-cli). Off here, so these file-based cases never reach a real mailbox config.
export FLEET_MAILBOX=off
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SKILL_LIB="$PROJECT_ROOT/.claude/skills/cfn-fleet/lib"
# shellcheck disable=SC1091
source "$SKILL_LIB/common.sh"
# shellcheck disable=SC1091
source "$SKILL_LIB/cmd-dashboard.sh"

# Temp dir guard: a failed mktemp must never leave TEST_TMP empty or at the cwd,
# because cleanup runs rm -rf on it (that once deleted the repo).
_tmp_dir_ok() {
    case "${1:-}" in
        */cfn-fleet-dash.*) ;;
        *) return 1 ;;
    esac
    [ "$1" != "$PROJECT_ROOT" ] && [ "$1" != "${HOME:-}" ] && [ "$1" != "/" ]
}
TEST_TMP_RAW=$(mktemp -d -t cfn-fleet-dash.XXXXXX) || exit 1
TEST_TMP=$(cd "$TEST_TMP_RAW" && pwd -P) || exit 1  # macOS: /var is /private/var
_tmp_dir_ok "$TEST_TMP" || { echo "REFUSING TO RUN: bad temp dir '$TEST_TMP'" >&2; exit 1; }
# BSD wc pads counts with leading spaces ("       1"); strip them so counts compare on macOS too.
wc() { command wc "$@" | sed 's/^ *//'; }
RUN_DIR=""
DASH_OUT=""
DASH_RC=0
DASH_BG=""
TMUX_LOG="$TEST_TMP/tmux-calls.log"
CODE_LOG="$TEST_TMP/code-calls.log"

cleanup() {
    # Never leak a python http.server: kill via any leftover pidfile first.
    if [ -n "${RUN_DIR:-}" ] && [ -f "$RUN_DIR/.dashboard.pid" ]; then
        kill "$(cat "$RUN_DIR/.dashboard.pid" 2>/dev/null)" >/dev/null 2>&1 || true
    fi
    if [ -n "$DASH_BG" ]; then
        kill "$DASH_BG" >/dev/null 2>&1 || true
    fi
    if _tmp_dir_ok "$TEST_TMP"; then
        rm -rf "$TEST_TMP"
    fi
    if [ -n "${ARCH_TMP:-}" ] && _tmp_dir_ok "$ARCH_TMP"; then
        rm -rf "$ARCH_TMP"
    fi
}
trap cleanup EXIT

unset FLEET_DASHBOARD_PORT || true
unset FLEET_DEFAULT_ENGINE || true
export FLEET_TMUX_LOG="$TMUX_LOG" FLEET_CODE_LOG="$CODE_LOG"

# Stub tmux: logs argv; has-session scripted via FLEET_TMUX_HASSESSION_RC /
# FLEET_TMUX_HASSESSION_STDERR (mirrors real tmux's "can't find session" vs
# "no server running" distinction). Default rc 0 = session alive.
mkdir -p "$TEST_TMP/bin"
cat > "$TEST_TMP/bin/tmux" <<'STUB'
#!/usr/bin/env bash
# test stub for tmux: log argv, script has-session
printf 'tmux %s\n' "$*" >> "${FLEET_TMUX_LOG:-/dev/null}"
while [ $# -gt 0 ]; do
    case "$1" in
        -L|-S|-f|-c) shift 2 ;;
        -*) shift ;;
        *) break ;;
    esac
done
if [ "${1:-}" = "has-session" ]; then
    [ -n "${FLEET_TMUX_HASSESSION_STDERR:-}" ] && printf '%s\n' "$FLEET_TMUX_HASSESSION_STDERR" >&2
    exit "${FLEET_TMUX_HASSESSION_RC:-0}"
fi
exit 0
STUB
chmod +x "$TEST_TMP/bin/tmux"
export PATH="$TEST_TMP/bin:$PATH"

# Restricted PATH dir for tooling-absence cases: every coreutil the dashboard
# touches, but NO tmux and NO code.
mkdir -p "$TEST_TMP/bin-notmux"
for b in awk basename cat date dirname grep head mkdir mv rm sed sha1sum sort stat tail tr wc; do
    ln -sf "$(command -v "$b")" "$TEST_TMP/bin-notmux/$b"
done

# build_run <name>: fresh run dir with a canonical 11-column roster header.
build_run() {
    RUN_DIR="$TEST_TMP/planning/fleet-$1"
    mkdir -p "$RUN_DIR"
    printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\n' > "$RUN_DIR/roster.tsv"
    : > "$RUN_DIR/.roster.lock"
    printf 'FLEET_WORKTREE=off\nFLEET_DB=none\n' > "$RUN_DIR/fleet.env"
    export FLEET_RUN_DIR="$RUN_DIR"
}

# add_ws WSxx name task status [claims] [sha] [notes] [hb] [engine]
add_ws() {
    printf '%s\t%s\t%s\t%s\t%s\t%s\t\t\t%s\t%s\t%s\n' \
        "$1" "$2" "$3" "$4" "${5:-}" "${6:-}" "${8:-0}" "${7:-}" "${9:-}" \
        >> "$RUN_DIR/roster.tsv"
}

# set_status WSxx status: rewrite that row's status cell (fixture-only).
set_status() {
    awk -F'\t' -v OFS='\t' -v ws="$1" -v st="$2" 'NR > 1 && $1 == ws { $4 = st } { print }' \
        "$RUN_DIR/roster.tsv" > "$RUN_DIR/roster.tsv.new" \
        && mv "$RUN_DIR/roster.tsv.new" "$RUN_DIR/roster.tsv"
}

# static_html FILE: the page's bash-rendered markup with the inline <script>
# blocks stripped. The live JS mirrors the static templates (card, tile, seg
# and badge literals of its own), so every count or grep over rendered
# markup MUST go through this or the JS copy inflates the count.
static_html() {
    sed '/^<script>$/,/^<\/script>$/d' "$1"
}

# run_dash: invoke main in a command-substitution subshell (fleet_die exits
# are captured, not fatal), stdout+stderr merged into DASH_OUT.
run_dash() {
    local rc=0
    DASH_OUT=$(
        {
            export FLEET_RUN_DIR="$RUN_DIR"
            main "$@"
        } 2>&1
    ) || rc=$?
    DASH_RC=$rc
}

# pick_port: ask the kernel for a free loopback port (serve tests only).
pick_port() {
    python3 - <<'PY'
import socket
s = socket.socket()
s.bind(('127.0.0.1', 0))
print(s.getsockname()[1])
s.close()
PY
}

# http_ok URL: 0 when the URL answers HTTP 200 (serve tests only).
http_ok() {
    python3 -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen(sys.argv[1], timeout=2).status == 200 else 1)" "$1" 2>/dev/null
}

test_render_structure_cards_title_count_pills() {
    log_step "GIVEN three roster rows, WHEN dashboard --no-serve --once"
    build_run dash1
    add_ws WS01 ws-auth "build auth" pending
    add_ws WS02 ws-api "build api" started "" "" "" "$(date +%s)"
    add_ws WS03 ws-ui "build ui" working "src/ui"
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "render exits 0"
    local html="$RUN_DIR/dashboard.html"
    assert_success "dashboard.html written into the run dir" test -f "$html"
    assert_contains "$(cat "$html")" "<title>Fleet dashboard: fleet-dash1</title>" \
        "title carries the run slug"
    assert_equals "3" "$(static_html "$html" | grep -cF 'class="card" data-ws' || true)" \
        "one worker card per roster row"
    assert_equals "1" "$(static_html "$html" | grep -oF 'data-st="pending"' | wc -l || true)" \
        "status tile: pending"
    assert_equals "1" "$(static_html "$html" | grep -oF 'data-st="started"' | wc -l || true)" \
        "status tile: started"
    assert_equals "1" "$(static_html "$html" | grep -oF 'data-st="working"' | wc -l || true)" \
        "status tile: working"
    assert_contains "$(static_html "$html")" 'class="tile zero" data-st="blocked"' \
        "zero count renders as a dimmed tile (blocked at 0)"
    assert_contains "$(cat "$html")" 'stale-min 5' "header shows the staleness knob"
    assert_contains "$(cat "$html")" 'id="filters"' "filter chip row present"
    assert_contains "$(cat "$html")" 'class="filterchip on" data-filter="all"' \
        "all chip active by default"
    assert_contains "$(cat "$html")" 'id="sort" class="sortsel"' "sort select present"
    assert_contains "$(cat "$html")" 'class="live-dot" id="live-dot" data-state="ok"' \
        "live dot span carries data-state"
    assert_contains "$(static_html "$html")" 'data-view="attention"' "attention summary is a view, not a roster state"
    assert_contains "$(static_html "$html")" 'id="sum-done"' "finished count is separate from landed"
    assert_contains "$(static_html "$html")" 'id="search"' "search is available"
    assert_contains "$(static_html "$html")" 'id="connection-warning"' "connection failure has a text notice"
    assert_equals "3" "$(static_html "$html" | grep -oF '</article>' | wc -l)" "static cards are closed siblings"
    assert_contains "$DASH_OUT" "dashboard.html" "stdout names the rendered page"
    assert_success "--no-serve never writes a pidfile" test ! -f "$RUN_DIR/.dashboard.pid"
}

test_html_escape_payload_neutralized() {
    log_step "GIVEN a task cell carrying an XSS payload, WHEN render"
    build_run dashesc
    add_ws WS01 ws01 '<script>alert("x&y")</script>' started
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "render exits 0"
    local html="$RUN_DIR/dashboard.html"
    assert_contains "$(cat "$html")" \
        '&lt;script&gt;alert(&quot;x&amp;y&quot;)&lt;/script&gt;' \
        "task payload fully html-escaped"
    assert_not_contains "$(cat "$html")" '<script>alert' "raw payload never reaches the page"

    log_step "GIVEN hostile goal.txt and now-editing payloads, WHEN render"
    printf '<script>alert("g&x")</script>' > "$RUN_DIR/goal.txt"
    mkdir -p "$RUN_DIR/files"
    printf '%s\n' '" onmouseover="alert(1)' > "$RUN_DIR/files/WS01.txt"
    run_dash --no-serve --once
    assert_equals "0" "$DASH_RC" "payload render exits 0"
    assert_contains "$(cat "$html")" \
        '&lt;script&gt;alert(&quot;g&amp;x&quot;)&lt;/script&gt;' \
        "goal blurb payload fully html-escaped"
    assert_contains "$(cat "$html")" \
        '<li>&quot; onmouseover=&quot;alert(1)</li>' \
        "now-editing path payload fully html-escaped"
    assert_not_contains "$(cat "$html")" '<script>alert("g' "raw goal payload never reaches the page"
    assert_not_contains "$(cat "$html")" 'onmouseover="alert(1)' "raw path payload never reaches the page"
}

test_spawning_row_is_in_flight_not_attention() {
    log_step "GIVEN a spawning row with no heartbeat and no session, WHEN render"
    build_run dashspawning
    add_ws WS01 ws01 "Launching" spawning "" "" "" "0"
    run_dash --no-serve --once
    local html="$RUN_DIR/dashboard.html" page card
    page=$(static_html "$html")
    card=$(printf '%s\n' "$page" | awk '/<article class="card" data-ws="WS01"/,/<\/article>/')
    assert_contains "$card" 'class="pill st-spawning"' "spawning pill on the card"
    assert_not_contains "$card" 'badge stale' "a spawning row is never STALE"
    assert_not_contains "$card" 'badge dead' "a spawning row is never DEAD"
    assert_contains "$page" 'id="sum-active">1<' "spawning counts as in flight"
    assert_contains "$page" 'id="sum-attention">0<' "spawning does not raise attention"
    assert_contains "$page" 'Launching: the worker session is starting' "status tooltip explains spawning"
    assert_contains "$page" 'class="seg seg-active"' "meter active segment includes the spawning row"
}

test_status_pills_all_seven_statuses() {
    log_step "GIVEN one row per closed-vocab status (now eight with spawning), WHEN render"
    build_run dashpills
    add_ws WS01 ws01 "pending row" pending
    add_ws WS02 ws02 "started row" started
    add_ws WS03 ws03 "working row" working
    add_ws WS04 ws04 "blocked row" blocked
    add_ws WS05 ws05 "landed row" landed "" "abc1234"
    # shellcheck disable=SC1010  # 'done' is a roster status value, not the keyword
    add_ws WS06 ws06 "done row" done
    add_ws WS07 ws07 "dead row" dead
    add_ws WS08 ws08 "odd row" wobblin   # outside the closed vocab
    add_ws WS09 ws09 "spawning row" spawning
    run_dash --no-serve --once

    local html="$RUN_DIR/dashboard.html" s
    for s in pending spawning started working blocked landed "done" dead; do
        assert_equals "1" "$(grep -cF "class=\"pill st-$s\"" "$html" || true)" \
            "exactly one whitelist pill for $s"
        assert_equals "1" "$(static_html "$html" | grep -oF "data-st=\"$s\"" | wc -l || true)" \
            "exactly one stat tile for $s"
    done
    assert_equals "0" "$(grep -cF 'st-wobblin' "$html" || true)" \
        "unknown status never becomes a pill class"
    assert_equals "1" "$(static_html "$html" | grep -cF 'id="tiles"' || true)" \
        "tiles row present"
    for s in queued active blocked landed dead; do
        assert_equals "1" "$(static_html "$html" | grep -oF "seg seg-$s" | wc -l || true)" \
            "meter carries the grouped $s segment"
    done
}

test_stale_badge_derivation() {
    log_step "GIVEN a 20-min-old working heartbeat, fresh started, pending rows, WHEN render"
    build_run dashstale
    local now
    now=$(date +%s)
    add_ws WS01 ws01 "Slow worker" working "" "" "" "$((now - 1200))"
    add_ws WS02 ws02 "Fresh worker" started "" "" "" "$now"
    add_ws WS03 ws03 "Not started" pending
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "render exits 0"
    local html="$RUN_DIR/dashboard.html"
    assert_equals "1" "$(static_html "$html" | grep -cF 'badge stale' || true)" \
        "exactly one STALE badge (20-min working row at default 5m)"
    assert_contains "$(static_html "$html")" '<span class="badge stale">&#9888; STALE</span>' \
        "STALE badge renders icon plus label"
    run_dash --no-serve --once --stale-min 30
    assert_equals "0" "$(static_html "$html" | grep -cF 'badge stale' || true)" \
        "--stale-min 30 hides the 20-min heartbeat"
}

test_dead_badge_derivation() {
    log_step "GIVEN a status-dead row, WHEN render"
    build_run dashdead1
    add_ws WS01 ws01 "Crashed" dead "" "" "" "$(date +%s)"
    run_dash --no-serve --once
    assert_equals "1" "$(static_html "$RUN_DIR/dashboard.html" | grep -cF 'badge dead' || true)" \
        "status dead shows the DEAD badge"
    assert_contains "$(static_html "$RUN_DIR/dashboard.html")" \
        '<span class="badge dead">&#10005; DEAD</span>' \
        "DEAD badge renders icon plus label"

    log_step "GIVEN a started row whose tmux session is gone, WHEN render"
    build_run dashdead2
    add_ws WS01 ws01 "Died quietly" started "" "" "" "$(date +%s)"
    : > "$TMUX_LOG"
    export FLEET_TMUX_HASSESSION_RC=1
    export FLEET_TMUX_HASSESSION_STDERR="can't find session: ws01"
    run_dash --no-serve --once
    unset FLEET_TMUX_HASSESSION_RC FLEET_TMUX_HASSESSION_STDERR
    assert_equals "1" "$(static_html "$RUN_DIR/dashboard.html" | grep -cF 'badge dead' || true)" \
        "gone session on a started row shows DEAD (pane exit)"
    assert_contains "$(cat "$TMUX_LOG")" "-L fleet-dashdead2 has-session -t ws01" \
        "pane probe runs on the run's dedicated socket"

    log_step "GIVEN tmux answering no server running, WHEN render"
    build_run dashdead3
    add_ws WS01 ws01 "Worker" started "" "" "" "$(date +%s)"
    export FLEET_TMUX_HASSESSION_RC=1
    export FLEET_TMUX_HASSESSION_STDERR="no server running on /tmp/tmux-501/default"
    run_dash --no-serve --once
    unset FLEET_TMUX_HASSESSION_RC FLEET_TMUX_HASSESSION_STDERR
    assert_equals "0" "$(static_html "$RUN_DIR/dashboard.html" | grep -cF 'badge dead' || true)" \
        "no-server-running is tooling, never a DEAD"

    log_step "GIVEN no tmux on PATH, WHEN render"
    build_run dashdead4
    add_ws WS01 ws01 "Worker" started "" "" "" "$(date +%s)"
    local saved_path="$PATH"
    export PATH="$TEST_TMP/bin-notmux"
    run_dash --no-serve --once
    export PATH="$saved_path"
    assert_equals "0" "$DASH_RC" "tmux-less host still renders"
    assert_equals "0" "$(static_html "$RUN_DIR/dashboard.html" | grep -cF 'badge dead' || true)" \
        "tmux absence never manufactures a DEAD"
}

test_transitions_own_state_jsonl_and_watch_state_untouched() {
    log_step "GIVEN two pending rows, WHEN baseline render"
    build_run dashtrans
    add_ws WS01 ws01 "Transit work" pending
    add_ws WS02 ws02 "Other lane" pending
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "baseline exits 0"
    assert_success "own .dashboard.state written" test -f "$RUN_DIR/.dashboard.state"
    assert_success "no events on the baseline render" test ! -f "$RUN_DIR/dashboard-events.jsonl"
    assert_success ".watch.state never touched" test ! -f "$RUN_DIR/.watch.state"

    log_step "WHEN WS01 flips to started and the render reruns"
    set_status WS01 started
    run_dash --no-serve --once
    local events="$RUN_DIR/dashboard-events.jsonl"
    assert_equals "1" "$(wc -l < "$events")" "exactly one transition line appended"
    assert_contains "$(cat "$events")" '"ws":"WS01","from":"pending","to":"started"' \
        "jsonl line carries ws/from/to"

    log_step "WHEN an unchanged roster renders again"
    run_dash --no-serve --once
    assert_equals "1" "$(wc -l < "$events")" "unchanged roster appends nothing"
    assert_contains "$(cat "$RUN_DIR/dashboard.html")" 'WS01</span><span class="tl-change">pending -&gt; started' \
        "timeline shows the transition newest-first"
    assert_success ".watch.state still absent" test ! -f "$RUN_DIR/.watch.state"
}

test_self_contained_refresh_and_static_fallback() {
    log_step "GIVEN a mixed roster, WHEN render, THEN the page is self-contained"
    build_run dashself
    add_ws WS01 ws01 "Ticker row" started "" "" "" "$(date +%s)"
    add_ws WS02 ws02 "Untouched row" pending
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "render exits 0"
    local html="$RUN_DIR/dashboard.html"
    local body
    body=$(cat "$html")
    assert_equals "0" "$(grep -c '<link' "$html" || true)" "zero <link> tags"
    assert_equals "0" "$(grep -cE '(src|href)="[^"]' "$html" || true)" \
        "zero external src/href attributes"
    assert_contains "$body" '<noscript><meta http-equiv="refresh" content="15"></noscript>' \
        "no-JS fallback refresh lives only inside noscript"
    assert_equals "1" "$(grep -cF 'http-equiv="refresh"' "$html" || true)" \
        "no bare head-level refresh outside the noscript block"
    assert_contains "$body" 'data-poll="5"' "poll knob carried on the body tag"
    assert_contains "$body" 'data-epoch="' "heartbeat stamp carries data-epoch for the JS ticker"
    assert_contains "$body" 'class="hb-age"' "static heartbeat age fallback present"
    assert_contains "$body" 'never' "rows without a heartbeat read as never"
    assert_contains "$body" 'setInterval' "1s ticker script present"
    assert_contains "$body" ':root {
  color-scheme: dark;
  --bg: #14161a;' "dark tokens are the :root default"
    assert_contains "$body" 'prefers-color-scheme: light' \
        "light set guarded under a light-OS scope"
    assert_contains "$body" 'data-theme="light"' "explicit light theme block present"
    assert_contains "$body" 'fleet-dash-theme' "theme toggle persists via the localStorage key"
    assert_contains "$body" \
        '<b>landed</b> means the workstream has a commit, not that it is finished' \
        "footer carries the landed caveat"
    assert_contains "$body" 'No transitions recorded yet' "empty timeline state before any transition"
    assert_equals "0" "$(grep -c $'—' "$html" || true)" "no em dashes in page copy"
    assert_not_contains "$DASH_OUT" "WARN" "clean render raises no selfcheck warnings"
}

test_serve_lifecycle_http200_double_start_port_busy_stop() {
    if ! command -v python3 >/dev/null 2>&1; then
        log_info "SKIP dashboard serve lifecycle: python3 unavailable"
        return 0
    fi
    log_step "GIVEN dashboard main serving on an ephemeral port"
    build_run dashsvc
    local svc_dir="$RUN_DIR"
    add_ws WS01 ws01 "Served work" started "" "" "" "$(date +%s)"
    # An oversized log left by an older server is trimmed to the newest
    # 10000 lines when the server starts.
    seq 1 12000 | sed 's/^/old-line-/' > "$RUN_DIR/.dashboard.log"
    local port
    port=$(pick_port)
    local url="http://127.0.0.1:$port/dashboard.html"
    ( main --port "$port" --poll 60 ) >/dev/null 2>&1 &
    DASH_BG=$!
    local i=0
    until http_ok "$url"; do
        i=$((i + 1))
        if [ "$i" -gt 50 ]; then break; fi
        sleep 0.2
    done
    assert_success "served page answers HTTP 200" http_ok "$url"
    assert_success "pidfile written inside the run dir" test -f "$RUN_DIR/.dashboard.pid"

    # Regression (MDTWII fleet-main, 2026-10-12): every page poll GETs
    # roster.tsv plus files/WSxx.txt per lane, and stock http.server logged
    # one line per request, so .dashboard.log grew 50 MB in 14 h. Successful
    # requests and expected 404s must not be logged.
    log_step "WHEN the page and a missing files/ path are fetched repeatedly"
    for i in 1 2 3; do
        http_ok "$url" || true
        http_ok "http://127.0.0.1:$port/files/WS99.txt" || true
    done
    assert_equals "0" "$(grep -c 'GET ' "$RUN_DIR/.dashboard.log" || true)" \
        "200 and 404 requests leave no access-log lines"

    assert_equals "10000" "$(grep -c '^old-line-' "$RUN_DIR/.dashboard.log" || true)" \
        "start trims an old log to its newest 10000 lines"
    assert_equals "1" "$(grep -cx 'old-line-12000' "$RUN_DIR/.dashboard.log" || true)" \
        "trim keeps the newest line"

    log_step "WHEN dashboard starts again on the same port, WHEN a second run"
    run_dash --once --port "$port"
    assert_equals "0" "$DASH_RC" "double start exits 0"
    assert_contains "$DASH_OUT" "already serving (pid " "double start is a no-op message"

    log_step "GIVEN a different run dir eyeing the same busy port"
    build_run dashbusy
    run_dash --once --port "$port"
    assert_equals "66" "$DASH_RC" "busy port exits 66"
    assert_contains "$DASH_OUT" "$port" "refusal names the port"
    assert_contains "$DASH_OUT" "--stop" "refusal names the remedy"

    log_step "WHEN --stop tears the server down"
    export FLEET_RUN_DIR="$svc_dir"
    RUN_DIR="$svc_dir"
    run_dash --stop
    assert_equals "0" "$DASH_RC" "--stop exits 0"
    assert_contains "$DASH_OUT" "stopped" "--stop reports the teardown"
    assert_success "pidfile removed" test ! -f "$RUN_DIR/.dashboard.pid"
    sleep 0.3
    assert_failure "server no longer answers after --stop" http_ok "$url"

    kill "$DASH_BG" >/dev/null 2>&1 || true
    wait "$DASH_BG" 2>/dev/null || true
    DASH_BG=""
}

# Regression (MDTWII fleet-main, 2026-10-12): right after --stop the old
# server can still hold the port for a moment, and the first restart failed
# with "port is busy". Start now waits a few seconds for the port to free.
test_serve_start_waits_for_port_release() {
    if ! command -v python3 >/dev/null 2>&1; then
        log_info "SKIP dashboard port-release wait: python3 unavailable"
        return 0
    fi
    log_step "GIVEN a port held for 1s by another process, WHEN dashboard starts"
    build_run dashwait
    add_ws WS01 ws01 "Restart work" started "" "" "" "$(date +%s)"
    local port holder
    port=$(pick_port)
    python3 -c 'import socket, sys, time
s = socket.socket(); s.bind(("127.0.0.1", int(sys.argv[1]))); s.listen(1)
time.sleep(1)' "$port" &
    holder=$!
    sleep 0.3
    run_dash --once --port "$port"
    wait "$holder" 2>/dev/null || true
    assert_equals "0" "$DASH_RC" "start succeeds once the port frees"
    assert_success "http 200 after the delayed start" \
        http_ok "http://127.0.0.1:$port/dashboard.html"
    run_dash --stop
}

# Regression (MDTWII fleet-main, 2026-10-16): background starts failed with 66
# "http.server failed to start" while the server itself was fine; the log had
# no new line. Readiness was judged by the pid's command line, and a sandboxed
# or overloaded `ps` returned nothing. The start now trusts the pid it launched
# plus a TCP connect to the port, so a blind `ps` cannot fail it.
test_serve_start_does_not_need_ps() {
    if ! command -v python3 >/dev/null 2>&1; then
        log_info "SKIP dashboard ps-free start: python3 unavailable"
        return 0
    fi
    log_step "GIVEN a pid command-line lookup that returns nothing, WHEN dashboard starts"
    build_run dashnops
    add_ws WS01 ws01 "Sandboxed start" started "" "" "" "$(date +%s)"
    local port
    port=$(pick_port)
    local rc=0
    DASH_OUT=$(
        {
            _fleet_pid_cmdline() { :; }
            export FLEET_RUN_DIR="$RUN_DIR"
            main --once --port "$port"
        } 2>&1
    ) || rc=$?
    assert_equals "0" "$rc" "start succeeds without a working ps"
    assert_success "http 200 from the started server" \
        http_ok "http://127.0.0.1:$port/dashboard.html"
    assert_success "pidfile kept for --stop" test -f "$RUN_DIR/.dashboard.pid"
    run_dash --stop
}

# Regression (MDTWII fleet-main, 2026-10-16): the refresh loop died with
# "counts: bad array subscript" when a read caught a row with an empty status
# (a roster rewritten in place mid-read). Such rows are skipped, not fatal.
test_render_skips_rows_without_id_or_status() {
    log_step "GIVEN rows with an empty status and an empty ws_id among good rows"
    build_run dashtorn
    add_ws WS01 ws01 "good one" working
    add_ws WS02 ws02 "torn row" ""
    add_ws "" ws03 "no id" working
    add_ws WS04 ws04 "good two" pending
    run_dash --no-serve --once
    assert_equals "0" "$DASH_RC" "first render exits 0"
    run_dash --no-serve --once
    assert_equals "0" "$DASH_RC" "second render (transitions diff) exits 0"
    assert_not_contains "$DASH_OUT" "bad array subscript" "no array-subscript error"
    local html
    html=$(static_html "$RUN_DIR/dashboard.html")
    assert_contains "$html" 'data-ws="WS01"' "good row before the torn row drawn"
    assert_contains "$html" 'data-ws="WS04"' "good row after the torn row drawn"
    assert_not_contains "$html" 'data-ws="WS02"' "row with no status is skipped"
}

# Regression (MDTWII fleet-main, 2026-10-13): --stop killed the http.server
# but left the background render loop running, still rewriting dashboard.html.
# The loop now records its own pid (plus its command line) and --stop stops it
# only when that record still matches, so a recycled pid is never killed.
test_stop_also_stops_render_loop_and_never_kills_recycled_pid() {
    log_step "GIVEN a render loop running with --no-serve"
    build_run dashloop
    add_ws WS01 ws01 "Loop work" started "" "" "" "$(date +%s)"
    ( main --no-serve --poll 60 ) >/dev/null 2>&1 &
    DASH_BG=$!
    local i=0
    until [ -s "$RUN_DIR/.dashboard-loop.pid" ]; do
        i=$((i + 1))
        if [ "$i" -gt 50 ]; then break; fi
        sleep 0.1
    done
    assert_success "loop wrote its own pidfile" test -s "$RUN_DIR/.dashboard-loop.pid"
    local lpid
    lpid=$(head -n1 "$RUN_DIR/.dashboard-loop.pid")
    assert_success "loop process is alive before --stop" kill -0 "$lpid"

    log_step "WHEN --stop runs"
    run_dash --stop
    assert_equals "0" "$DASH_RC" "--stop exits 0 with only a loop running"
    assert_contains "$DASH_OUT" "render loop stopped" "--stop reports the loop teardown"
    sleep 0.3
    assert_failure "render loop process is gone after --stop" kill -0 "$lpid"
    assert_success "loop pidfile removed" test ! -f "$RUN_DIR/.dashboard-loop.pid"
    wait "$DASH_BG" 2>/dev/null || true
    DASH_BG=""

    log_step "WHEN --stop runs again with nothing running"
    run_dash --stop
    assert_equals "0" "$DASH_RC" "second --stop exits 0"
    assert_contains "$DASH_OUT" "nothing running" "second --stop says nothing is running"

    log_step "GIVEN a stale loop pidfile whose pid now belongs to an unrelated process"
    sleep 30 &
    local other=$!
    printf '%s\n%s\n' "$other" "some old dashboard command line" > "$RUN_DIR/.dashboard-loop.pid"
    run_dash --stop
    assert_equals "0" "$DASH_RC" "--stop with a recycled pid exits 0"
    assert_success "unrelated process was NOT killed" kill -0 "$other"
    assert_success "stale loop pidfile cleared" test ! -f "$RUN_DIR/.dashboard-loop.pid"
    kill "$other" >/dev/null 2>&1 || true
    wait "$other" 2>/dev/null || true

    log_step "WHEN the dashboard is started again after --stop"
    ( main --no-serve --poll 60 ) >/dev/null 2>&1 &
    DASH_BG=$!
    i=0
    until [ -s "$RUN_DIR/.dashboard-loop.pid" ]; do
        i=$((i + 1))
        if [ "$i" -gt 50 ]; then break; fi
        sleep 0.1
    done
    assert_success "restart writes a fresh loop pidfile" test -s "$RUN_DIR/.dashboard-loop.pid"
    run_dash --stop
    assert_contains "$DASH_OUT" "render loop stopped" "restarted loop stops too"
    wait "$DASH_BG" 2>/dev/null || true
    DASH_BG=""
}

test_port_precedence() {
    log_step "GIVEN port config absent at every layer, WHEN resolving"
    build_run dashport
    local got
    got=$(_fleet_dash_port "")
    assert_equals "4880" "$got" "default port is 4880"

    log_step "GIVEN FLEET_DASHBOARD_PORT in fleet.env, WHEN env unset"
    printf 'FLEET_DASHBOARD_PORT=5010\n' >> "$RUN_DIR/fleet.env"
    got=$(_fleet_dash_port "")
    assert_equals "5010" "$got" "fleet.env port used when env unset"

    log_step "GIVEN FLEET_DASHBOARD_PORT in the env, WHEN no flag"
    got=$(FLEET_DASHBOARD_PORT=5011 _fleet_dash_port "")
    assert_equals "5011" "$got" "env beats fleet.env"

    log_step "GIVEN --port on top of everything"
    got=$(_fleet_dash_port 5012)
    assert_equals "5012" "$got" "--port beats env and fleet.env"
}

test_empty_roster_empty_state() {
    log_step "GIVEN a roster with a header and no rows, WHEN render"
    build_run dashempty
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "empty roster renders and exits 0"
    local html="$RUN_DIR/dashboard.html"
    assert_contains "$(cat "$html")" 'class="card empty-state"' "empty-state card present"
    assert_equals "0" "$(static_html "$html" | grep -cF 'data-ws=' || true)" "no worker cards"
}

test_usage_and_data_errors() {
    log_step "GIVEN malformed flags, WHEN main parses"
    build_run dasherr
    add_ws WS01 ws01 "t" pending

    run_dash --bogus
    assert_equals "64" "$DASH_RC" "unknown option exits 64"
    run_dash --port
    assert_equals "64" "$DASH_RC" "--port without a value exits 64"
    run_dash --port abc
    assert_equals "64" "$DASH_RC" "non-numeric --port exits 64"
    run_dash --stale-min -5
    assert_equals "64" "$DASH_RC" "negative --stale-min exits 64"
    run_dash --poll nope
    assert_equals "64" "$DASH_RC" "non-numeric --poll exits 64"
    run_dash stray
    assert_equals "64" "$DASH_RC" "positional argument exits 64"
    run_dash --no-serve --open
    assert_equals "64" "$DASH_RC" "--open with --no-serve exits 64"

    log_step "GIVEN a missing roster"
    rm -f "$RUN_DIR/roster.tsv"
    run_dash --no-serve --once
    assert_equals "65" "$DASH_RC" "missing roster exits 65"
}

test_urlencode() {
    log_step "GIVEN typical URLs and a reserved char, WHEN _fleet_urlencode"
    assert_equals "http%3A%2F%2F127.0.0.1%3A4880%2Fdashboard.html" \
        "$(_fleet_urlencode 'http://127.0.0.1:4880/dashboard.html')" \
        "reserved chars percent-encoded"
    assert_equals "a%20b%7Ec" "$(_fleet_urlencode 'a b~c')" "space encoded, unreserved kept"
}

test_inline_js_live_layer_contract() {
    log_step "GIVEN a rendered page, WHEN the inline live-poll layer ships"
    build_run dashjs
    add_ws WS01 ws01 "Live work" started "" "" "" "$(date +%s)"
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "render exits 0"
    local js
    js=$(sed -n '/^<script>$/,/^<\/script>$/p' "$RUN_DIR/dashboard.html")
    assert_contains "$js" 'fetch(' "live layer fetches over the same origin"
    assert_contains "$js" 'roster.tsv' "fetches roster.tsv by name"
    assert_contains "$js" 'dashboard-events-tail.jsonl' "fetches the events tail feed"
    assert_contains "$js" 'esc(' "every interpolated string goes through esc()"
    assert_contains "$js" 'encodeURIComponent(' "ws ids percent-encoded for the files path"
    assert_contains "$js" \
        'var VOCAB = ["pending", "spawning", "started", "working", "blocked", "landed", "done", "dead"];' \
        "JS vocab array pins the 8 closed-vocab statuses in order"
    assert_contains "$js" 'spawning: "Launching: the worker session is starting, banner not seen yet"' \
        "JS status help carries the spawning text"
    assert_contains "$js" '(counts.spawning || 0) + (counts.started || 0) + (counts.working || 0)' \
        "live meter and In flight count include spawning rows"
    assert_contains "$js" 'setLive("err")' "failed fetch flips the live dot for retry"
    assert_contains "$(cat "$RUN_DIR/dashboard.html")" '.live-dot[data-state="err"]' \
        "amber error state styled for the live dot"
}

test_events_tail_written_and_capped_at_30() {
    log_step "GIVEN 35 recorded events, WHEN a render pass runs"
    build_run dashtail
    add_ws WS01 ws01 "Tail work" pending
    run_dash --no-serve --once
    local i=1
    while [ "$i" -le 35 ]; do
        printf '{"ts":1700000000,"ws":"FAKE%02d","from":"pending","to":"started"}\n' "$i" \
            >> "$RUN_DIR/dashboard-events.jsonl"
        i=$((i + 1))
    done
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "render exits 0"
    assert_equals "35" "$(wc -l < "$RUN_DIR/dashboard-events.jsonl")" \
        "fixture sanity: 35 events recorded"
    local tailf="$RUN_DIR/dashboard-events-tail.jsonl"
    assert_success "tail feed written by the render pass" test -f "$tailf"
    assert_equals "30" "$(wc -l < "$tailf")" "tail feed capped at 30 lines"
    assert_contains "$(head -n 1 "$tailf")" 'FAKE06' \
        "oldest kept event is the 6th of 35 (newest 30 win)"
    assert_contains "$(tail -n 1 "$tailf")" 'FAKE35' "newest event kept last"
}

test_now_editing_section_from_files_fixture() {
    log_step "GIVEN files/WS01.txt with two paths, WHEN render"
    build_run dashfiles
    add_ws WS01 ws01 "Editing work" working
    mkdir -p "$RUN_DIR/files"
    printf '%s\n%s\n' 'src/auth/login.ts' 'src/auth/session.ts' > "$RUN_DIR/files/WS01.txt"
    add_ws WS02 ws02 "No files" pending
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "render exits 0"
    local static
    static=$(static_html "$RUN_DIR/dashboard.html")
    assert_contains "$static" 'now editing' "editing section header rendered"
    assert_contains "$static" '<li>src/auth/login.ts</li>' "first path listed"
    assert_contains "$static" '<li>src/auth/session.ts</li>' "second path listed"
    assert_equals "1" "$(printf '%s\n' "$static" | grep -cF 'now editing' || true)" \
        "exactly one editing section (only WS01 published a list)"

    log_step "GIVEN no files/<ws>.txt published, WHEN render"
    build_run dashnofiles
    add_ws WS01 ws01 "Quiet work" pending
    run_dash --no-serve --once
    static=$(static_html "$RUN_DIR/dashboard.html")
    assert_equals "0" "$(printf '%s\n' "$static" | grep -cF 'now editing' || true)" \
        "no editing section without a published list"
}

test_goal_blurb_rendered_and_escaped() {
    log_step "GIVEN goal.txt, WHEN render"
    build_run dashgoal
    add_ws WS01 ws01 "Goal work" pending
    printf 'Ship the wiki portal & gate\nsecond line ignored\n' > "$RUN_DIR/goal.txt"
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "render exits 0"
    local static
    static=$(static_html "$RUN_DIR/dashboard.html")
    assert_contains "$static" '<p class="goal" id="goal">Ship the wiki portal &amp; gate</p>' \
        "goal blurb rendered under the title, escaped"
    assert_not_contains "$static" 'second line ignored' "only the first line renders"

    log_step "GIVEN no goal.txt, WHEN render"
    build_run dashnogoal
    add_ws WS01 ws01 "Bare work" pending
    run_dash --no-serve --once
    assert_contains "$(static_html "$RUN_DIR/dashboard.html")" \
        '<p class="goal" id="goal" hidden></p>' \
        "goal element present but hidden when no goal is set"
}

# Planned-but-unstarted rows (status pending) render in their own Queued
# section after the live grid, in roster order, so a long backlog never reads
# as stalled lanes (MDTWII fleet-main request, 2026-10-12).
test_queued_section_separate_from_live_lanes() {
    log_step "GIVEN live lanes interleaved with queued rows, WHEN render"
    build_run dashqueue
    add_ws WS12 ws12 "QUEUED: later track" pending
    add_ws WS01 ws01 "Live work" working "" "" "" "$(date +%s)"
    add_ws WS10 ws10 "QUEUED: next track" pending
    add_ws WS02 ws02 "Blocked work" blocked
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "render exits 0"
    local static live queued
    static=$(static_html "$RUN_DIR/dashboard.html")
    live=$(printf '%s\n' "$static" | sed -n '/id="cards"/,/id="queued"/p')
    queued=$(printf '%s\n' "$static" | sed -n '/id="queued"/,/<\/section>/p')
    assert_contains "$static" 'id="queued-cards"' "queued grid present"
    assert_equals "2" "$(printf '%s\n' "$live" | grep -cF 'class="card" data-ws' || true)" \
        "live grid holds only the two started lanes"
    assert_not_contains "$live" 'data-status="pending"' "no pending card in the live grid"
    assert_equals "2" "$(printf '%s\n' "$queued" | grep -cF 'data-status="pending"' || true)" \
        "both pending rows render in the queued grid"
    assert_equals "WS12 WS10" \
        "$(printf '%s\n' "$queued" | grep -oE 'data-ws="WS[0-9]+"' | sed 's/data-ws="//; s/"//' | tr '\n' ' ' | sed 's/ $//')" \
        "queued rows keep roster order"
    assert_contains "$queued" 'Queued <span' "section heading names the queue"

    local js
    js=$(sed -n '/^<script>$/,/^<\/script>$/p' "$RUN_DIR/dashboard.html")
    assert_contains "$js" 'getElementById("queued-cards")' "live layer re-renders the queued grid"

    log_step "GIVEN no pending rows, WHEN render"
    build_run dashnoqueue
    add_ws WS01 ws01 "Live work" working "" "" "" "$(date +%s)"
    run_dash --no-serve --once
    assert_contains "$(static_html "$RUN_DIR/dashboard.html")" '<section class="queued" id="queued" hidden>' \
        "queued section hidden when nothing is queued"
}

test_open_flow() {
    log_step "GIVEN a code stub on PATH, WHEN _fleet_dash_open"
    cat > "$TEST_TMP/bin/code" <<'STUB'
#!/usr/bin/env bash
# test stub for the VS Code CLI: log argv
printf 'code %s\n' "$*" >> "${FLEET_CODE_LOG:-/dev/null}"
exit 0
STUB
    chmod +x "$TEST_TMP/bin/code"
    : > "$CODE_LOG"
    local out
    out=$(_fleet_dash_open 'http://127.0.0.1:4880/dashboard.html')
    assert_contains "$out" 'http://127.0.0.1:4880/dashboard.html' "open always prints the http URL"
    assert_contains "$out" 'Simple Browser fallback: Ctrl+Shift+P' "open prints the fallback line"
    assert_contains "$(cat "$CODE_LOG")" \
        '--open-url vscode://simpleBrowser.show?url=http%3A%2F%2F127.0.0.1%3A4880%2Fdashboard.html' \
        "code --open-url receives the vscode deep link with the encoded url"

    log_step "GIVEN no code on PATH, WHEN _fleet_dash_open"
    local saved_path="$PATH"
    export PATH="$TEST_TMP/bin-notmux"
    out=$(_fleet_dash_open 'http://127.0.0.1:4880/dashboard.html' 2>"$TEST_TMP/open-err.log")
    export PATH="$saved_path"
    assert_contains "$out" 'http://127.0.0.1:4880/dashboard.html' "URL still printed without code"
    assert_contains "$out" 'Simple Browser fallback' "fallback line still printed without code"
    assert_contains "$(cat "$TEST_TMP/open-err.log")" "WARN" "absent code warns on stderr only"
}

# build_host_run <name>: run dir whose roster carries the host column, for the
# attach-command and open-terminal cases. Rows: WS01 local working, WS02 remote
# working on vps, WS03 pending, WS04 a hostile name that must never become a
# command.
build_host_run() {
    RUN_DIR="$TEST_TMP/planning/fleet-$1"
    mkdir -p "$RUN_DIR"
    : > "$RUN_DIR/.roster.lock"
    printf 'FLEET_WORKTREE=off\nFLEET_DB=none\n' > "$RUN_DIR/fleet.env"
    {
        printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\thost\n'
        printf 'WS01\tws-loc\tlocal work\tworking\t\t\t\t\t%s\t\t\t\n' "$(date +%s)"
        printf 'WS02\tws-rem\tremote work\tworking\t\t\t\t\t%s\t\t\tvps\n' "$(date +%s)"
        printf 'WS03\tws-q\tqueued work\tpending\t\t\t\t\t0\t\t\t\n'
        printf 'WS04\tx;touch pwned\thostile name\tworking\t\t\t\t\t%s\t\t\t\n' "$(date +%s)"
    } > "$RUN_DIR/roster.tsv"
    # The remote row's session lives on the server: spawn --host records its
    # socket and session in remote/<WS>.env. They differ from the local pair
    # on purpose, so a card or launcher using the local pair fails the asserts.
    mkdir -p "$RUN_DIR/remote"
    printf 'FLEET_HOST=vps\nFLEET_SOCK=fleet-rsock\nFLEET_SESSION=rsess-ws02\n' > "$RUN_DIR/remote/WS02.env"
    export FLEET_RUN_DIR="$RUN_DIR"
    # The vps row makes the render probe the host over ssh. Stub ssh as
    # unreachable (rc 255) so no real server is ever contacted.
    printf '#!/usr/bin/env bash\n# test stub: ssh always unreachable\nexit 255\n' > "$TEST_TMP/bin/ssh"
    chmod +x "$TEST_TMP/bin/ssh"
}

test_attach_command_on_bash_cards() {
    log_step "GIVEN local, remote, pending and hostile-name rows, WHEN render --no-serve"
    build_host_run dashattach
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "render exits 0"
    local html
    html=$(static_html "$RUN_DIR/dashboard.html")
    assert_contains "$html" 'data-socket="fleet-dashattach"' "body carries the run socket"
    assert_contains "$html" '<code class="attach-cmd">tmux -L fleet-dashattach attach -t ws-loc</code>' \
        "local card shows the tmux attach command"
    assert_contains "$html" '<code class="attach-cmd">ssh -t vps tmux -L fleet-rsock attach -t rsess-ws02</code>' \
        "remote card shows the ssh attach command from remote/<WS>.env"
    assert_equals "2" "$(printf '%s\n' "$html" | grep -oF 'class="attach-cmd"' | wc -l)" \
        "pending and hostile-name rows get no attach command"
    assert_not_contains "$html" 'touch pwned</code>' "a hostile name never becomes a copyable command"
    assert_equals "2" "$(printf '%s\n' "$html" | grep -oF 'class="chipbtn copy-btn"' | wc -l)" \
        "each attach command has a Copy button"
    assert_equals "2" "$(printf '%s\n' "$html" | grep -oF 'class="chipbtn open-btn" hidden' | wc -l)" \
        "Open button ships hidden; only the live page reveals it after /api/health"
    assert_not_contains "$DASH_OUT" "WARN" "clean render raises no selfcheck warnings"
    rm -f "$TEST_TMP/bin/ssh"
}

# Bug 2026-10-16 (MDTWII): the card loop reads roster.tsv on stdin, and the
# host probe's ssh inherited it. Real ssh forwards stdin to the remote, so it
# swallowed every later row and the panel stopped at the first started host
# row (100 cards of a longer roster). The stub drains stdin like real ssh does.
test_host_probe_does_not_swallow_later_roster_rows() {
    log_step "GIVEN two started host rows then a local row, WHEN render --no-serve"
    RUN_DIR="$TEST_TMP/planning/fleet-dashstdin"
    mkdir -p "$RUN_DIR/remote"
    : > "$RUN_DIR/.roster.lock"
    printf 'FLEET_WORKTREE=off\nFLEET_DB=none\n' > "$RUN_DIR/fleet.env"
    {
        printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\thost\n'
        printf 'WS01\tws-r1\tremote one\tstarted\t\t\t\t\t%s\t\t\tvps\n' "$(date +%s)"
        printf 'WS02\tws-r2\tremote two\tstarted\t\t\t\t\t%s\t\t\tvps\n' "$(date +%s)"
        printf 'WS03\tws-loc\tlocal after\tworking\t\t\t\t\t%s\t\t\t\n' "$(date +%s)"
    } > "$RUN_DIR/roster.tsv"
    printf 'FLEET_HOST=vps\nFLEET_SOCK=fleet-rsock\nFLEET_SESSION=rsess-ws01\n' > "$RUN_DIR/remote/WS01.env"
    printf 'FLEET_HOST=vps\nFLEET_SOCK=fleet-rsock\nFLEET_SESSION=rsess-ws02\n' > "$RUN_DIR/remote/WS02.env"
    export FLEET_RUN_DIR="$RUN_DIR"
    printf '#!/usr/bin/env bash\n# test stub: reads stdin like real ssh (unless -n), then unreachable\ncase " $* " in *" -n "*) ;; *) cat >/dev/null ;; esac\nexit 255\n' > "$TEST_TMP/bin/ssh"
    chmod +x "$TEST_TMP/bin/ssh"
    run_dash --no-serve --once

    assert_equals "0" "$DASH_RC" "render exits 0"
    local html
    html=$(static_html "$RUN_DIR/dashboard.html")
    assert_equals "3" "$(printf '%s\n' "$html" | grep -cF 'class="card" data-ws' || true)" \
        "every roster row gets a card, including rows after started host rows"
    assert_contains "$html" 'data-ws="WS03"' "the local row after the host rows is drawn"
    rm -f "$TEST_TMP/bin/ssh"
}

# api_call PORT METHOD PATH [ORIGIN] [CTYPE] [BODY] [SEC_FETCH_SITE]: prints
# "<status> <json body>" for one loopback request (open-terminal cases).
api_call() {
    python3 - "$@" <<'PY'
import sys, urllib.request, urllib.error
port, method, path = sys.argv[1], sys.argv[2], sys.argv[3]
origin = sys.argv[4] if len(sys.argv) > 4 else ""
ctype = sys.argv[5] if len(sys.argv) > 5 else ""
body = sys.argv[6].encode() if len(sys.argv) > 6 else None
sfs = sys.argv[7] if len(sys.argv) > 7 else ""
req = urllib.request.Request("http://127.0.0.1:%s%s" % (port, path), data=body, method=method)
if origin:
    req.add_header("Origin", origin)
if ctype:
    req.add_header("Content-Type", ctype)
if sfs:
    req.add_header("Sec-Fetch-Site", sfs)
try:
    with urllib.request.urlopen(req, timeout=5) as r:
        print(r.status, r.read().decode())
except urllib.error.HTTPError as e:
    print(e.code, e.read().decode())
PY
}

test_open_terminal_endpoint_gate_and_launcher_argv() {
    if ! command -v python3 >/dev/null 2>&1; then
        log_info "SKIP open-terminal endpoint: python3 unavailable"
        return 0
    fi
    log_step "GIVEN the dashboard serving with a stub launcher"
    build_host_run dashopen
    local port origin open_log="$TEST_TMP/open-argv.log"
    port=$(pick_port)
    origin="http://127.0.0.1:$port"
    cat > "$TEST_TMP/bin/open-stub" <<'STUB'
#!/usr/bin/env bash
# test stub for the terminal launcher: one line per call, argv space-joined
printf '%s\n' "$*" >> "${FLEET_OPEN_LOG:?}"
STUB
    chmod +x "$TEST_TMP/bin/open-stub"
    : > "$open_log"
    FLEET_DASHBOARD_OPEN_CMD="$TEST_TMP/bin/open-stub" FLEET_OPEN_LOG="$open_log" run_dash --once --port "$port"
    assert_equals "0" "$DASH_RC" "serving start exits 0"

    local out
    out=$(api_call "$port" GET /api/health)
    assert_equals '200 {"ok": true, "open": true, "pane": true, "sessions": true}' "$out" "health says open is available with the stub"

    log_step "WHEN the request fails the origin gate"
    out=$(api_call "$port" POST /api/open-terminal "http://evil.example" application/json '{"ws":"WS01"}')
    assert_contains "$out" "403 " "foreign Origin is refused with 403"
    out=$(api_call "$port" POST /api/open-terminal "" application/json '{"ws":"WS01"}')
    assert_contains "$out" "403 " "missing Origin is refused with 403"
    out=$(api_call "$port" POST /api/open-terminal "$origin" application/json '{"ws":"WS01"}' cross-site)
    assert_contains "$out" "403 " "Sec-Fetch-Site cross-site is refused with 403"
    out=$(api_call "$port" POST /api/open-terminal "$origin" text/plain '{"ws":"WS01"}')
    assert_contains "$out" "415 " "non-JSON content type is refused"
    assert_equals "0" "$(wc -l < "$open_log")" "no gated request ever ran the launcher"

    log_step "WHEN the ws is unknown, pending, or carries a hostile name"
    out=$(api_call "$port" POST /api/open-terminal "$origin" application/json '{"ws":"WS99"}')
    assert_contains "$out" '404 {"ok": false' "unknown ws is 404 with a JSON error"
    out=$(api_call "$port" POST /api/open-terminal "$origin" application/json '{"ws":"WS03"}')
    assert_contains "$out" '409 {"ok": false' "pending row is 409 with a JSON error"
    out=$(api_call "$port" POST /api/open-terminal "$origin" application/json '{"ws":"WS04"}')
    assert_contains "$out" "409 " "hostile session name is refused"
    out=$(api_call "$port" POST /api/open-terminal "$origin" application/json '{"ws":"../roster"}')
    assert_contains "$out" "400 " "malformed ws id is a 400"
    assert_equals "0" "$(wc -l < "$open_log")" "refused rows never ran the launcher"

    log_step "WHEN a local and a remote row are opened"
    out=$(api_call "$port" POST /api/open-terminal "$origin" application/json \
        '{"ws":"WS01","session":"evil","host":"evil","command":"rm -rf ~"}')
    assert_contains "$out" '200 {"ok": true' "local row opens"
    out=$(api_call "$port" POST /api/open-terminal "http://localhost:$port" application/json '{"ws":"WS02"}')
    assert_contains "$out" '200 {"ok": true' "remote row opens; localhost origin accepted"
    assert_equals "tmux -L fleet-dashopen attach -t ws-loc" "$(sed -n 1p "$open_log")" \
        "local launcher argv comes from the roster, request extras ignored"
    assert_equals "ssh -t vps tmux -L fleet-rsock attach -t rsess-ws02" "$(sed -n 2p "$open_log")" \
        "remote launcher argv wraps the attach in ssh -t"

    log_step "WHEN the server is stopped"
    run_dash --stop
    assert_contains "$DASH_OUT" "stopped" "--stop still finds the moved server"

    log_step "GIVEN a launcher seam that is not executable, WHEN served"
    port=$(pick_port)
    FLEET_DASHBOARD_OPEN_CMD="$TEST_TMP/no-such-launcher" run_dash --once --port "$port"
    out=$(api_call "$port" GET /api/health)
    assert_equals '200 {"ok": true, "open": false, "pane": true, "sessions": true}' "$out" "health says open is unavailable"
    out=$(api_call "$port" POST /api/open-terminal "http://127.0.0.1:$port" application/json '{"ws":"WS01"}')
    assert_contains "$out" "501 " "no launcher is a 501"
    assert_contains "$out" '"command": "tmux -L fleet-dashopen attach -t ws-loc"' \
        "501 carries the attach command"
    run_dash --stop
    rm -f "$TEST_TMP/bin/ssh"
}

# api_get PORT PATH [Header:Value ...]: prints "<status> <body>" for one GET
# with exactly the given headers (gate cases: Host, Origin, Sec-Fetch-Site).
api_get() {
    python3 - "$@" <<'PY'
import sys, http.client
port, path = int(sys.argv[1]), sys.argv[2]
hdrs = {}
for h in sys.argv[3:]:
    k, _, v = h.partition(":")
    hdrs[k.strip()] = v.strip()
c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
c.request("GET", path, headers=hdrs)
r = c.getresponse()
print(r.status, r.read().decode())
PY
}

# json_q PORT PATH EXPR: GET the JSON at PATH and print eval(EXPR) with d = the
# body and S = {pid: session} when the body lists sessions.
json_q() {
    python3 - "$@" <<'PY'
import sys, json, urllib.request
port, path, expr = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(urllib.request.urlopen("http://127.0.0.1:%s%s" % (port, path), timeout=5))
S = {s["pid"]: s for s in d.get("sessions", [])}
print(eval(expr))
PY
}

# guarded_rm_file PATH: remove one fixture file, only inside TEST_TMP.
guarded_rm_file() {
    _tmp_dir_ok "$TEST_TMP" || return 1
    case "${1:-}" in
        "$TEST_TMP"/*) rm -f "$1" ;;
        *) return 1 ;;
    esac
}

test_live_view_and_sessions_static_markup_and_host_columns() {
    log_step "GIVEN local, remote, pending and hostile rows plus remote/WS02.env, WHEN render --no-serve"
    build_host_run dashmarkup
    run_dash --no-serve --once
    assert_equals "0" "$DASH_RC" "render exits 0"
    local html
    html=$(static_html "$RUN_DIR/dashboard.html")
    assert_contains "$html" \
        'class="chipbtn pane-btn" aria-expanded="false" aria-controls="pane-WS01" hidden>Live view</button>' \
        "local card ships a collapsed, hidden Live view toggle"
    assert_contains "$html" 'aria-controls="pane-WS02" hidden>Live view</button>' \
        "remote card with a recorded session ships the toggle too"
    assert_equals "2" "$(printf '%s\n' "$html" | grep -oF 'class="chipbtn pane-btn"' | wc -l)" \
        "pending and hostile-name rows get no Live view toggle"
    assert_equals "0" "$(printf '%s\n' "$html" | grep -cF 'class="pane" id=' || true)" \
        "no pane box in the static page: collapsed by default"
    assert_contains "$html" \
        '<section class="sessions" id="sessions" aria-label="Claude sessions on this machine" hidden>' \
        "Sessions panel ships hidden until /api/health reports sessions"
    assert_contains "$html" '<div id="sessions-body"></div>' "Sessions panel ships as an empty mount"
    assert_equals "fleet-rsock rsess-ws02" \
        "$(awk -F'\t' '$1 == "WS02" { print $5 " " $6 }' "$RUN_DIR/host-states.tsv")" \
        "host-states.tsv carries the remote sock and session from remote/<WS>.env"

    log_step "GIVEN a remote row with no remote/<WS>.env, WHEN render"
    build_host_run dashnoenv
    guarded_rm_file "$RUN_DIR/remote/WS02.env"
    run_dash --no-serve --once
    html=$(static_html "$RUN_DIR/dashboard.html")
    assert_equals "1" "$(printf '%s\n' "$html" | grep -oF 'class="attach-cmd"' | wc -l)" \
        "remote row without an env file gets no attach command (only the local row does)"
    assert_not_contains "$html" 'ssh -t vps' "no ssh command is invented from the local pair"
    assert_equals "1" "$(printf '%s\n' "$html" | grep -oF 'class="chipbtn pane-btn"' | wc -l)" \
        "and no Live view toggle either"
    assert_equals "" "$(awk -F'\t' '$1 == "WS02" { print $5 $6 }' "$RUN_DIR/host-states.tsv")" \
        "host-states.tsv sock and session columns are empty without the env file"

    log_step "GIVEN a remote env whose values break the attach patterns, WHEN render"
    build_host_run dashbadenv
    printf 'FLEET_HOST=vps\nFLEET_SOCK=%q\nFLEET_SESSION=%q\n' 'bad sock;x' 'a b' > "$RUN_DIR/remote/WS02.env"
    run_dash --no-serve --once
    html=$(static_html "$RUN_DIR/dashboard.html")
    assert_not_contains "$html" 'bad sock' "an unsafe recorded socket never reaches a command"
    assert_equals "" "$(awk -F'\t' '$1 == "WS02" { print $5 $6 }' "$RUN_DIR/host-states.tsv")" \
        "unsafe values are dropped from host-states.tsv"
    guarded_rm_file "$TEST_TMP/bin/ssh"
}

test_inline_js_live_view_and_sessions_contract() {
    log_step "GIVEN a rendered page, WHEN the inline layer ships the Live view and Sessions code"
    build_run dashjs2
    add_ws WS01 ws01 "Live work" started "" "" "" "$(date +%s)"
    run_dash --no-serve --once
    local js
    js=$(sed -n '/^<script>$/,/^<\/script>$/p' "$RUN_DIR/dashboard.html")
    assert_contains "$js" 'fetch("api/pane?ws="' "Live view reads api/pane"
    assert_contains "$js" 'pre.textContent = st.text;' "pane text goes in via textContent only"
    assert_contains "$js" 'var PANE_LINES = 40, PANE_LOCAL_MS = 3000, PANE_HOST_MS = 6000;' \
        "40 lines, 3s local and 6s host polling"
    assert_contains "$js" 'document.visibilityState !== "visible"' "polling pauses on a hidden tab"
    assert_contains "$js" 'paneAvailable = !!(d && d.ok === true && d.pane === true);' \
        "Live view needs health.pane"
    assert_contains "$js" 'd.sessions === true) startSessions();' "Sessions panel needs health.sessions"
    assert_contains "$js" 'fetch("api/sessions?ts="' "Sessions panel reads api/sessions"
    assert_contains "$js" 'var SESSIONS_MS = 5000;' "sessions refresh every 5s"
    assert_not_contains "$js" 'api/sessions.key' "page never names a key file"
}

# Stub for `fleet peek`: logs argv and the run dir, then behaves per ws id.
write_peek_stub() {
    cat > "$TEST_TMP/bin/peek-stub" <<'STUB'
#!/usr/bin/env bash
# test stub for fleet peek: argv is "peek WSxx N", FLEET_RUN_DIR is set
printf 'peek %s %s run=%s\n' "$2" "$3" "$FLEET_RUN_DIR" >> "${FLEET_PEEK_LOG:?}"
case "$2" in
    WS05) echo "fleet: no session for ws05" >&2; exit 65 ;;
    WS06) echo "fleet: peek: host vps is unreachable" >&2; exit 66 ;;
    WS08) echo "fleet: boom" >&2; exit 3 ;;
    WS07) sleep 1 ;;
esac
printf '\033[31mred\033[0m \033]0;title\007plain\001\177! <b>x</b>\tend\nsecond %s\n' "$2"
STUB
    chmod +x "$TEST_TMP/bin/peek-stub"
}

test_api_pane_strip_clamp_cache_errors_gate() {
    if ! command -v python3 >/dev/null 2>&1; then
        log_info "SKIP api/pane: python3 unavailable"
        return 0
    fi
    log_step "GIVEN the dashboard serving with a stub peek command"
    build_host_run dashpane
    local r
    for r in WS05:five WS06:six WS07:seven WS08:eight; do
        printf '%s\tws-%s\tt\tworking\t\t\t\t\t%s\t\t\t\n' "${r%%:*}" "${r##*:}" "$(date +%s)" >> "$RUN_DIR/roster.tsv"
    done
    write_peek_stub
    local plog="$TEST_TMP/peek.log" port origin out
    : > "$plog"
    port=$(pick_port)
    origin="http://127.0.0.1:$port"
    FLEET_DASHBOARD_PEEK_CMD="$TEST_TMP/bin/peek-stub" FLEET_PEEK_LOG="$plog" run_dash --once --port "$port"
    assert_equals "0" "$DASH_RC" "serving start exits 0"
    out=$(api_call "$port" GET /api/health)
    assert_contains "$out" '"pane": true' "health reports pane available"
    assert_contains "$out" '"sessions": true' "health reports sessions available"

    log_step "WHEN a pane with ANSI, OSC and control bytes is read"
    out=$(api_call "$port" GET "/api/pane?ws=WS01")
    assert_contains "$out" '200 {"ok": true, "text": ' "local pane read is 200"
    assert_equals "True" "$(json_q "$port" '/api/pane?ws=WS01' "d['text'] == 'red plain! <b>x</b>\tend\nsecond WS01\n'")" \
        "ANSI/OSC/control bytes stripped, newline and tab kept, markup left literal"
    assert_equals "True" "$(json_q "$port" '/api/pane?ws=WS01' "isinstance(d['ts'], int) and d['ts'] > 0")" "ts is an epoch"
    assert_equals "peek WS01 40 run=$RUN_DIR" "$(sed -n 1p "$plog")" \
        "peek runs as argv [peek ws 40] with FLEET_RUN_DIR set; default is 40 lines"

    log_step "WHEN the same pane is read three times inside the cache window"
    api_call "$port" GET "/api/pane?ws=WS01" >/dev/null
    api_call "$port" GET "/api/pane?ws=WS01" >/dev/null
    assert_equals "1" "$(grep -c '^peek WS01 40 ' "$plog" || true)" "local pane is cached: one peek, not four"

    log_step "WHEN lines is out of range or malformed"
    api_call "$port" GET "/api/pane?ws=WS01&lines=1" >/dev/null
    assert_equals "1" "$(grep -c '^peek WS01 5 ' "$plog" || true)" "lines=1 clamps up to 5"
    api_call "$port" GET "/api/pane?ws=WS01&lines=9999" >/dev/null
    assert_equals "1" "$(grep -c '^peek WS01 200 ' "$plog" || true)" "lines=9999 clamps down to 200"
    assert_contains "$(api_call "$port" GET '/api/pane?ws=WS01&lines=abc')" "400 " "lines=abc is a 400"
    assert_contains "$(api_call "$port" GET '/api/pane?ws=WS01&lines=-5')" "400 " "negative lines is a 400"
    assert_contains "$(api_call "$port" GET '/api/pane?ws=WS01&lines=1;touch+x')" "400 " "shell text in lines is a 400"
    assert_equals "3" "$(wc -l < "$plog")" "rejected lines never ran peek (only the 40, 5 and 200 reads logged)"

    log_step "WHEN the cache window passes"
    api_call "$port" GET "/api/pane?ws=WS01&lines=40" >/dev/null
    assert_equals "2" "$(grep -c '^peek WS01 40 ' "$plog" || true)" "different lines value reads again"
    api_call "$port" GET "/api/pane?ws=WS01&lines=40" >/dev/null
    assert_equals "2" "$(grep -c '^peek WS01 40 ' "$plog" || true)" "inside the 2s window: cached"
    sleep 2.4
    api_call "$port" GET "/api/pane?ws=WS01&lines=40" >/dev/null
    assert_equals "3" "$(grep -c '^peek WS01 40 ' "$plog" || true)" "local pane re-read after the 2s cache expires"

    log_step "GIVEN a host row, THEN its cache lasts longer than a local row's"
    api_call "$port" GET "/api/pane?ws=WS02" >/dev/null
    sleep 2.4
    api_call "$port" GET "/api/pane?ws=WS02" >/dev/null
    assert_equals "1" "$(grep -c '^peek WS02 40 ' "$plog" || true)" "host pane still cached after 2.4s (5s window)"

    log_step "WHEN three tabs read one slow pane at once"
    local p1 p2 p3
    api_call "$port" GET "/api/pane?ws=WS07" > "$TEST_TMP/slow1.out" &
    p1=$!
    api_call "$port" GET "/api/pane?ws=WS07" > "$TEST_TMP/slow2.out" &
    p2=$!
    api_call "$port" GET "/api/pane?ws=WS07" > "$TEST_TMP/slow3.out" &
    p3=$!
    wait "$p1" "$p2" "$p3"
    assert_equals "1" "$(grep -c '^peek WS07 40 ' "$plog" || true)" "one read per worker at a time: three requests, one peek"
    assert_equals "3" "$(cat "$TEST_TMP"/slow?.out | grep -c '^200 {"ok": true' || true)" "all three requests get the shared result"

    log_step "WHEN peek fails or the row cannot be read"
    out=$(api_call "$port" GET "/api/pane?ws=WS05")
    assert_equals '409 {"ok": false, "error": "no session for ws05"}' "$out" "peek exit 65 is 409 with the message, fleet: prefix removed"
    api_call "$port" GET "/api/pane?ws=WS05" >/dev/null
    assert_equals "1" "$(grep -c '^peek WS05 ' "$plog" || true)" "errors are cached too"
    out=$(api_call "$port" GET "/api/pane?ws=WS06")
    assert_contains "$out" '503 {"ok": false, "error": "peek: host vps is unreachable"}' "peek exit 66 is 503 unreachable"
    out=$(api_call "$port" GET "/api/pane?ws=WS08")
    assert_contains "$out" '500 {"ok": false, "error": "boom"}' "any other peek failure is 500"
    assert_contains "$(api_call "$port" GET '/api/pane?ws=WS03')" '409 {"ok": false' "pending row is 409, no peek run"
    assert_equals "0" "$(grep -c '^peek WS03 ' "$plog" || true)" "pending row never ran peek"
    assert_contains "$(api_call "$port" GET '/api/pane?ws=WS99')" '404 {"ok": false' "unknown ws is 404"
    assert_contains "$(api_call "$port" GET '/api/pane?ws=%2e%2e%2froster')" "400 " "path-shaped ws is a 400"
    assert_contains "$(api_call "$port" GET '/api/pane')" "400 " "missing ws is a 400"

    log_step "WHEN the request fails the read-only gate"
    assert_contains "$(api_get "$port" '/api/pane?ws=WS01' "Host: 127.0.0.1:$port" "Origin: http://evil.example")" "403 " "foreign Origin refused"
    assert_contains "$(api_get "$port" '/api/pane?ws=WS01' "Host: evil.example")" "403 " "foreign Host refused (DNS rebinding)"
    assert_contains "$(api_get "$port" '/api/pane?ws=WS01' "Host: 127.0.0.1:$port" "Sec-Fetch-Site: cross-site")" "403 " "cross-site refused"
    assert_contains "$(api_get "$port" '/api/pane?ws=WS01' "Host: 127.0.0.1:$port" "Origin: $origin" "Sec-Fetch-Site: same-origin")" "200 " "same-origin GET allowed"
    assert_contains "$(api_get "$port" '/api/pane?ws=WS01' "Host: localhost:$port" "Origin: http://localhost:$port")" "200 " "localhost origin allowed"
    assert_contains "$(api_get "$port" '/api/pane?ws=WS01' "Host: 127.0.0.1:$port")" "200 " "a same-origin GET may omit Origin"

    run_dash --stop
    assert_contains "$DASH_OUT" "stopped" "--stop stops the pane server"

    log_step "GIVEN a peek seam that is not executable"
    port=$(pick_port)
    FLEET_DASHBOARD_PEEK_CMD="$TEST_TMP/no-such-peek" FLEET_PEEK_LOG="$plog" run_dash --once --port "$port"
    assert_contains "$(api_call "$port" GET /api/health)" '"pane": false' "health says pane unavailable"
    assert_contains "$(api_call "$port" GET '/api/pane?ws=WS01')" "501 " "no peek command is a 501"
    run_dash --stop

    log_step "GIVEN the real fleet CLI, a host row with no remote/WS02.env"
    guarded_rm_file "$RUN_DIR/remote/WS02.env"
    port=$(pick_port)
    run_dash --once --port "$port"
    assert_contains "$(api_call "$port" GET /api/health)" '"pane": true' "real CLI makes pane available"
    out=$(api_call "$port" GET '/api/pane?ws=WS02')
    assert_contains "$out" "409 " "host row without an env file is 409 (no session), not a guess"
    assert_contains "$out" "no remote env" "the 409 says why"
    run_dash --stop
    guarded_rm_file "$TEST_TMP/bin/ssh"
}

# mk_sess PID CWD NAME STATUS UPDATED_MS TMUX: write <SESS_OUT or SDIR>/PID.json
# with secret-bearing extra fields that must never reach the page.
mk_sess() {
    python3 - "$@" <<'PY'
import json, os, sys
pid, cwd, name, status, upd, tmux = sys.argv[1:7]
d = {"pid": int(os.environ.get("JSON_PID", pid)), "cwd": cwd, "name": name, "status": status,
     "updatedAt": int(upd), "startedAt": int(upd),
     "sessionId": "SECRET-SESSION-ID", "messagingSocketPath": "/tmp/SECRET-SOCKET"}
if tmux:
    d["tmux"] = tmux
out = os.environ.get("SESS_OUT") or os.environ["SDIR"]
with open(os.path.join(out, pid + ".json"), "w") as fh:
    json.dump(d, fh)
PY
}

test_api_sessions_classification_whitelist_gate() {
    if ! command -v python3 >/dev/null 2>&1; then
        log_info "SKIP api/sessions: python3 unavailable"
        return 0
    fi
    log_step "GIVEN a project with a served run, an archived run and a pile of session files"
    local SB="$TEST_TMP/sessproj" OTHER="$TEST_TMP/otherproj" now_ms
    export SDIR="$TEST_TMP/sessions-fixture"
    now_ms=$(( $(date +%s) * 1000 ))
    mkdir -p "$SB/planning/fleet-sess" "$SB/planning/fleet-old" "$OTHER/.git" "$SDIR" "$TEST_TMP/sess-outside"
    RUN_DIR="$SB/planning/fleet-sess"
    printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\n' > "$RUN_DIR/roster.tsv"
    printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\nWS01\toldlane\told work\tworking\t\t\t\t\t0\t\t\n' > "$SB/planning/fleet-old/roster.tsv"
    : > "$RUN_DIR/.roster.lock"
    printf 'FLEET_WORKTREE=off\nFLEET_DB=none\n' > "$RUN_DIR/fleet.env"
    export FLEET_RUN_DIR="$RUN_DIR"
    local now
    now=$(date +%s)
    add_ws WS01 lane1 "Auth work" working "" "" "" "$now"
    add_ws WS02 lane2 "API work" working "" "" "in code review" "$now"
    add_ws WS03 lane3 "Gate work" working "" "" "running the gate check" "$now"
    add_ws WS04 lane4 "Done work" done "" "" "review passed" "$now"
    local cli="$SKILL_LIB/../cli/fleet"
    "$cli" archive "$SB/planning/fleet-old" >/dev/null

    mk_sess 3001 "$SB" main-chat busy "$now_ms" ""
    mk_sess 3002 "$SB/.claude/worktrees/ws01" w1 idle "$now_ms" ""
    mk_sess 3003 "$SB" w2 busy "$now_ms" "lane2:0.0"
    mk_sess 3004 "$SB/.claude/worktrees/ws03" w3 busy "$now_ms" ""
    mk_sess 3005 "$SB/.claude/worktrees/ws04" w4 busy "$now_ms" ""
    mk_sess 3006 "$SB" dead-one busy "$now_ms" ""
    mk_sess 3007 "$OTHER" elsewhere idle "$now_ms" ""
    mk_sess 3008 "$SB" old-chat idle "$(( now_ms - 2 * 86400 * 1000 ))" ""
    SESS_OUT="$TEST_TMP/sess-outside" mk_sess 3009 "$SB" linked busy "$now_ms" ""
    ln -s "$TEST_TMP/sess-outside/3009.json" "$SDIR/3009.json"
    mk_sess 3010 "$SB" scratcher shell "$now_ms" "scratch:0"
    mk_sess 3011 "$SB" ghosty zzz "$now_ms" "ghost:0"
    mk_sess 3012 "$SB" $'\033[31mevil\033[0m' busy "$now_ms" "x y;touch pwned:0"
    mk_sess 3013 "relative/path" relpath busy "$now_ms" ""
    JSON_PID=999 mk_sess 3014 "$SB" mismatch busy "$now_ms" ""
    mk_sess 3015 "$SB" oldlane-chat busy "$now_ms" "oldlane:0"
    printf 'not json{' > "$SDIR/3016.json"
    mkfifo "$SDIR/3017.json"
    printf 'SECRET-KEY-CONTENT' > "$SDIR/3001.abc123.key"
    printf 'SECRET-KEY-CONTENT' > "$SDIR/3002.key"

    mkdir -p "$TEST_TMP/bin-sess"
    cat > "$TEST_TMP/bin-sess/tmux" <<'STUB'
#!/usr/bin/env bash
# test stub: only the tmux session named "scratch" exists
while [ $# -gt 0 ]; do
    case "$1" in
        -L|-S|-f|-c) shift 2 ;;
        -*) shift ;;
        *) break ;;
    esac
done
if [ "${1:-}" = has-session ]; then
    [ "${3:-}" = "=scratch" ] && exit 0
    exit 1
fi
exit 0
STUB
    chmod +x "$TEST_TMP/bin-sess/tmux"

    local port origin out
    port=$(pick_port)
    origin="http://127.0.0.1:$port"
    FLEET_DASHBOARD_SESSIONS_DIR="$SDIR" \
        FLEET_DASHBOARD_PID_ALIVE="3001,3002,3003,3004,3005,3007,3008,3009,3010,3011,3012,3013,3014,3015,3016,3017" \
        PATH="$TEST_TMP/bin-sess:$PATH" run_dash --once --port "$port"
    assert_equals "0" "$DASH_RC" "serving start exits 0"
    assert_contains "$(api_call "$port" GET /api/health)" '"sessions": true' "health reports sessions"

    log_step "WHEN /api/sessions is read"
    out=$(api_call "$port" GET /api/sessions)
    assert_contains "$out" '200 {"ok": true, "project": "sessproj"' "200 with the project name"
    assert_not_contains "$out" "SECRET" "sessionId, socket path and key file contents never leave the server"
    assert_not_contains "$out" "sessionId" "no sessionId field"
    assert_not_contains "$out" "messagingSocketPath" "no messagingSocketPath field"
    assert_equals "[3001, 3002, 3003, 3004, 3005, 3007, 3008, 3010, 3011, 3012, 3015]" \
        "$(json_q "$port" /api/sessions 'sorted(S)')" \
        "live regular files only: dead pid, symlink, FIFO, bad json, relative cwd, pid mismatch and .key files are skipped"
    assert_equals "True" "$(json_q "$port" /api/sessions "all(sorted(s) == sorted(['pid','name','project','other','role','ws','brief','run','state','updated','stale','tmux','attach']) for s in d['sessions'])")" \
        "every session carries exactly the whitelisted fields"
    assert_equals "('master', 'working', False, False, '')" \
        "$(json_q "$port" /api/sessions "(S[3001]['role'], S[3001]['state'], S[3001]['other'], S[3001]['stale'], S[3001]['attach'])")" \
        "plain session in this project is a master, busy reads working"
    assert_equals "('lane', 'WS01', 'fleet-sess', 'idle', 'Auth work', 'tmux -L fleet-sess attach -t lane1')" \
        "$(json_q "$port" /api/sessions "(S[3002]['role'], S[3002]['ws'], S[3002]['run'], S[3002]['state'], S[3002]['brief'], S[3002]['attach'])")" \
        "lane found by worktree cwd, brief from roster task, attach from run socket and roster name"
    assert_equals "('lane', 'WS02', 'in review', 'tmux -L fleet-sess attach -t lane2')" \
        "$(json_q "$port" /api/sessions "(S[3003]['role'], S[3003]['ws'], S[3003]['state'], S[3003]['attach'])")" \
        "lane found by tmux name; a review note reads in review"
    assert_equals "('WS03', 'in gate')" "$(json_q "$port" /api/sessions "(S[3004]['ws'], S[3004]['state'])")" \
        "a gate note reads in gate"
    assert_equals "('WS04', 'done')" "$(json_q "$port" /api/sessions "(S[3005]['ws'], S[3005]['state'])")" \
        "roster done wins over a review word in the note"
    assert_equals "('elsewhere', 'otherproj', True, 'master', '')" \
        "$(json_q "$port" /api/sessions "(S[3007]['name'], S[3007]['project'], S[3007]['other'], S[3007]['role'], S[3007]['attach'])")" \
        "session in another project is flagged other and grouped by project"
    assert_equals "True" "$(json_q "$port" /api/sessions "S[3008]['stale'] and not S[3008]['other']")" \
        "no update for over 24h is stale"
    assert_equals "('master', 'running a shell command', 'scratch', 'tmux -L fleet-sess attach -t scratch')" \
        "$(json_q "$port" /api/sessions "(S[3010]['role'], S[3010]['state'], S[3010]['tmux'], S[3010]['attach'])")" \
        "non-lane tmux session gets an attach command only because has-session found it"
    assert_equals "('unknown', 'ghost', '')" \
        "$(json_q "$port" /api/sessions "(S[3011]['state'], S[3011]['tmux'], S[3011]['attach'])")" \
        "unknown status reads unknown; tmux name with no live session gets no command"
    assert_equals "('evil', '')" "$(json_q "$port" /api/sessions "(S[3012]['name'], S[3012]['tmux'])")" \
        "control codes stripped from the name; a tmux name that fails the pattern is dropped"
    assert_equals "('master', '')" "$(json_q "$port" /api/sessions "(S[3015]['role'], S[3015]['run'])")" \
        "a session matching only an archived run's row is not a lane"
    assert_equals "True" "$(json_q "$port" /api/sessions "[s['other'] for s in d['sessions']] == sorted(s['other'] for s in d['sessions'])")" \
        "this project sorts before other projects"
    assert_equals "True" "$(json_q "$port" /api/sessions "[s['stale'] for s in d['sessions'] if not s['other']] == sorted(s['stale'] for s in d['sessions'] if not s['other'])")" \
        "stale sessions sort last within a project"
    assert_equals "True" "$(json_q "$port" /api/sessions "[s['role'] != 'master' for s in d['sessions'] if not s['other'] and not s['stale']] == sorted(s['role'] != 'master' for s in d['sessions'] if not s['other'] and not s['stale'])")" \
        "masters sort before lanes"

    log_step "WHEN a session file changes and an archived run comes back"
    mk_sess 3001 "$SB" renamed-chat busy "$now_ms" ""
    "$cli" archive "$SB/planning/fleet-old" --undo >/dev/null
    assert_equals "main-chat" "$(json_q "$port" /api/sessions "S[3001]['name']")" "result cached for a few seconds"
    sleep 3.4
    assert_equals "renamed-chat" "$(json_q "$port" /api/sessions "S[3001]['name']")" "cache expires and the new name shows"
    assert_equals "('lane', 'fleet-old', 'tmux -L fleet-old attach -t oldlane')" \
        "$(json_q "$port" /api/sessions "(S[3015]['role'], S[3015]['run'], S[3015]['attach'])")" \
        "after --undo the run's rows classify sessions again, on that run's own socket"

    log_step "WHEN the request fails the read-only gate"
    assert_contains "$(api_get "$port" /api/sessions "Host: 127.0.0.1:$port" "Origin: http://evil.example")" "403 " "foreign Origin refused"
    assert_contains "$(api_get "$port" /api/sessions "Host: evil.example")" "403 " "foreign Host refused"
    assert_contains "$(api_get "$port" /api/sessions "Host: 127.0.0.1:$port" "Sec-Fetch-Site: cross-site")" "403 " "cross-site refused"
    assert_contains "$(api_get "$port" /api/sessions "Host: 127.0.0.1:$port" "Origin: $origin")" "200 " "same-origin allowed"
    assert_contains "$(api_get "$port" /api/sessions "Host: 127.0.0.1:$port")" "200 " "no Origin allowed for a same-origin GET"
    assert_contains "$(api_call "$port" POST /api/sessions "$origin" application/json '{}')" "404 " "POST to sessions is not a route"

    run_dash --stop
    unset SDIR
}

test_fleet_archive_marker_discovery_and_undo() {
    # Own temp root: run discovery walks up parent dirs, and $TEST_TMP/planning holds
    # other cases' fleet runs, so an all-archived project inside $TEST_TMP would
    # discover those instead of exiting 64.
    local arch_root
    arch_root=$(mktemp -d -t cfn-fleet-dash.XXXXXX) || exit 1
    arch_root=$(cd "$arch_root" && pwd -P) || exit 1
    _tmp_dir_ok "$arch_root" || { echo "REFUSING TO RUN: bad temp dir '$arch_root'" >&2; exit 1; }
    ARCH_TMP="$arch_root"
    local P="$arch_root/archproj" cli="$SKILL_LIB/../cli/fleet" out rc got hdr
    hdr='ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\n'
    mkdir -p "$P/planning/fleet-alpha" "$P/planning/fleet-beta" "$TEST_TMP/archempty"
    printf "$hdr" > "$P/planning/fleet-alpha/roster.tsv"
    printf "$hdr" > "$P/planning/fleet-beta/roster.tsv"
    local sum_before
    sum_before=$(cksum < "$P/planning/fleet-alpha/roster.tsv")

    log_step "GIVEN two runs, WHEN fleet archive alpha"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive alpha 2>&1) || rc=$?
    assert_equals "0" "$rc" "archive exits 0"
    assert_contains "$out" "fleet-alpha archived" "says what it did"
    assert_success "marker created" test -f "$P/planning/fleet-alpha/.archived"
    assert_contains "$(cat "$P/planning/fleet-alpha/.archived")" "archived " "marker carries a timestamp line"
    assert_equals ".archived
roster.tsv" "$(ls -A "$P/planning/fleet-alpha")" "marker is the only thing added"
    assert_equals "$sum_before" "$(cksum < "$P/planning/fleet-alpha/roster.tsv")" "roster untouched"
    assert_success "other run untouched" test ! -e "$P/planning/fleet-beta/.archived"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive alpha 2>&1) || rc=$?
    assert_equals "0" "$rc" "second archive exits 0"
    assert_contains "$out" "already archived" "idempotent"

    log_step "WHEN fleet picks the current run: archived runs are skipped even when newest"
    touch -t 202101010000 "$P/planning/fleet-beta"
    touch "$P/planning/fleet-alpha"
    got=$(cd "$P" && unset FLEET_RUN_DIR && fleet_run_dir)
    assert_equals "$P/planning/fleet-beta" "$got" "older active run beats a newer archived one"
    got=$(cd "$P" && FLEET_RUN_DIR="$P/planning/fleet-alpha" fleet_run_dir)
    assert_equals "$P/planning/fleet-alpha" "$got" "an explicit FLEET_RUN_DIR still reaches an archived run"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive "$P/planning/fleet-beta" 2>&1) || rc=$?
    assert_equals "0" "$rc" "archive by path exits 0"
    rc=0; got=$(cd "$P" && unset FLEET_RUN_DIR && fleet_run_dir 2>&1) || rc=$?
    assert_equals "64" "$rc" "with every run archived discovery exits 64"
    assert_contains "$got" "no fleet run dir" "and says so"

    log_step "WHEN --undo"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive --undo 2>&1) || rc=$?
    assert_equals "64" "$rc" "--undo with no run named and no FLEET_RUN_DIR exits 64"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive alpha --undo 2>&1) || rc=$?
    assert_equals "0" "$rc" "undo by slug exits 0"
    assert_contains "$out" "active again" "undo says so"
    assert_success "marker removed" test ! -e "$P/planning/fleet-alpha/.archived"
    assert_success "roster still there after undo" test -f "$P/planning/fleet-alpha/roster.tsv"
    got=$(cd "$P" && unset FLEET_RUN_DIR && fleet_run_dir)
    assert_equals "$P/planning/fleet-alpha" "$got" "undone run is discoverable again"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive alpha --undo 2>&1) || rc=$?
    assert_contains "$out" "was not archived" "undo of an active run is a no-op"
    rc=0; out=$(cd "$P" && FLEET_RUN_DIR="$P/planning/fleet-beta" "$cli" archive --undo 2>&1) || rc=$?
    assert_equals "0" "$rc" "--undo with FLEET_RUN_DIR set exits 0"
    assert_success "beta marker removed" test ! -e "$P/planning/fleet-beta/.archived"

    log_step "WHEN the target is wrong"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive --bogus 2>&1) || rc=$?
    assert_equals "64" "$rc" "unknown option exits 64"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive alpha beta 2>&1) || rc=$?
    assert_equals "64" "$rc" "two runs at once exits 64"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive 'a b' 2>&1) || rc=$?
    assert_equals "64" "$rc" "slug with unexpected characters exits 64"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive nope 2>&1) || rc=$?
    assert_equals "65" "$rc" "unknown slug exits 65"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive "$TEST_TMP/archempty" 2>&1) || rc=$?
    assert_equals "65" "$rc" "a dir with no roster.tsv exits 65"
    assert_success "and gets no marker" test ! -e "$TEST_TMP/archempty/.archived"
    rc=0; out=$(cd "$P" && env -u FLEET_RUN_DIR "$cli" archive "$P/nothere" 2>&1) || rc=$?
    assert_equals "65" "$rc" "missing path exits 65"
    assert_success "no run dir was deleted by any case" test -f "$P/planning/fleet-beta/roster.tsv"
}

test_render_structure_cards_title_count_pills
test_html_escape_payload_neutralized
test_spawning_row_is_in_flight_not_attention
test_status_pills_all_seven_statuses
test_stale_badge_derivation
test_dead_badge_derivation
test_transitions_own_state_jsonl_and_watch_state_untouched
test_self_contained_refresh_and_static_fallback
test_serve_lifecycle_http200_double_start_port_busy_stop
test_serve_start_waits_for_port_release
test_serve_start_does_not_need_ps
test_render_skips_rows_without_id_or_status
test_stop_also_stops_render_loop_and_never_kills_recycled_pid
test_port_precedence
test_empty_roster_empty_state
test_usage_and_data_errors
test_urlencode
test_inline_js_live_layer_contract
test_events_tail_written_and_capped_at_30
test_now_editing_section_from_files_fixture
test_goal_blurb_rendered_and_escaped
test_queued_section_separate_from_live_lanes
test_open_flow
test_attach_command_on_bash_cards
test_host_probe_does_not_swallow_later_roster_rows
test_open_terminal_endpoint_gate_and_launcher_argv
test_live_view_and_sessions_static_markup_and_host_columns
test_inline_js_live_view_and_sessions_contract
test_api_pane_strip_clamp_cache_errors_gate
test_api_sessions_classification_whitelist_gate
test_fleet_archive_marker_discovery_and_undo

print_test_summary
