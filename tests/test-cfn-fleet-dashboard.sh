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
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SKILL_LIB="$PROJECT_ROOT/.claude/skills/cfn-fleet/lib"
# shellcheck disable=SC1091
source "$SKILL_LIB/common.sh"
# shellcheck disable=SC1091
source "$SKILL_LIB/cmd-dashboard.sh"

TEST_TMP=$(mktemp -d -t cfn-fleet-dash.XXXXXX)
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
    rm -rf "$TEST_TMP"
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
    assert_contains "$(cat "$html")" 'stale-min 15' "header shows the staleness knob"
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

test_status_pills_all_seven_statuses() {
    log_step "GIVEN one row per closed-vocab status, WHEN render"
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
    run_dash --no-serve --once

    local html="$RUN_DIR/dashboard.html" s
    for s in pending started working blocked landed "done" dead; do
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
        "exactly one STALE badge (20-min working row at default 15m)"
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
        'landed means the workstream has a commit, not that it is finished' \
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
        'var VOCAB = ["pending", "started", "working", "blocked", "landed", "done", "dead"];' \
        "JS vocab array pins the 7 closed-vocab statuses in order"
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

test_render_structure_cards_title_count_pills
test_html_escape_payload_neutralized
test_status_pills_all_seven_statuses
test_stale_badge_derivation
test_dead_badge_derivation
test_transitions_own_state_jsonl_and_watch_state_untouched
test_self_contained_refresh_and_static_fallback
test_serve_lifecycle_http200_double_start_port_busy_stop
test_port_precedence
test_empty_roster_empty_state
test_usage_and_data_errors
test_urlencode
test_inline_js_live_layer_contract
test_events_tail_written_and_capped_at_30
test_now_editing_section_from_files_fixture
test_goal_blurb_rendered_and_escaped
test_open_flow

print_test_summary
