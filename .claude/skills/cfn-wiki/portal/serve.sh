#!/usr/bin/env bash
# cfn-wiki portal server lifecycle: build (unless --static), start the local
# annotation server, wait for HTTP 200, open the browser, stop on demand.
#
# Contract: wiki_serve [repo] [--port N] [--stop] [--static]
#   repo       defaults to $PWD
#   --port N   port for the server; 0 picks an ephemeral port (default
#              $WIKI_PORT, which wiki-env.sh defaults to 4885)
#   --stop     TERM the pidfile server, poll 2s, then KILL; always clears
#              the pidfile; stopping a stopped portal exits 0
#   --static   serve the existing .wiki/portal/index.html without rebuilding;
#              the server runs read-only (annotation POSTs answer 403)
# -> start: prints the URL on stdout, exits 0 once the portal answers 200;
#    exit 1 on build failure or server startup failure, 66 on a busy port or
#    missing python3.
# pidfile: <repo>/.wiki/cache/serve.pid; server log: serve.log next to it;
# recovery file: <repo>/.wiki/portal/server.json {url, port, pid, started}.
# Browser open: the WSL2 chain wslview -> explorer.exe -> cmd.exe, run only
# when stdout is a TTY (tests and CI set nothing and get no browser);
# WIKI_SERVE_OPEN=0 suppresses, =1 forces.

wiki_serve() {
    local repo=""
    local port=""
    local do_stop=0
    local do_static=0
    local arg
    while [ $# -gt 0 ]; do
        arg="$1"
        case "$arg" in
            --port) port="${2:?wiki_serve: --port needs a value}"; shift 2 ;;
            --port=*) port="${arg#*=}"; shift ;;
            --stop) do_stop=1; shift ;;
            --static) do_static=1; shift ;;
            -*) echo "wiki_serve: unknown flag: $arg" >&2; return 1 ;;
            *) if [ -z "$repo" ]; then repo="$arg"; else
                   echo "wiki_serve: unexpected argument: $arg" >&2; return 1
               fi; shift ;;
        esac
    done
    [ -n "$repo" ] || repo="$PWD"

    local self_dir
    self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local server_py="$self_dir/server.py"
    local build_sh="$self_dir/build-portal.sh"

    local wiki_dir="$repo/.wiki"
    local cache_dir="$wiki_dir/cache"
    local pidfile="$cache_dir/serve.pid"
    local logfile="$cache_dir/serve.log"

    # ---- stop path ---------------------------------------------------------
    if [ "$do_stop" -eq 1 ]; then
        if ! wiki_serve_is_serving "$pidfile" "server.py"; then
            rm -f "$pidfile"
            echo "wiki serve: not serving"
            return 0
        fi
        local pid
        pid="$(cat "$pidfile")"
        kill -TERM "$pid" 2>/dev/null || true
        local i
        for i in $(seq 1 10); do
            [ -d "/proc/$pid" ] || break
            sleep 0.2
        done
        if [ -d "/proc/$pid" ]; then
            kill -KILL "$pid" 2>/dev/null || true
        fi
        rm -f "$pidfile"
        echo "wiki serve: stopped (pid $pid)"
        return 0
    fi

    # ---- start path ----------------------------------------------------------
    command -v python3 >/dev/null 2>&1 || {
        echo "wiki serve: python3 not found; serving needs it" >&2
        return 66
    }
    if wiki_serve_is_serving "$pidfile" "server.py"; then
        local port_now
        port_now="$(python3 -c '
import json, sys
try:
    print(json.load(open(sys.argv[1] + "/portal/server.json"))["port"])
except Exception:
    print("")
' "$wiki_dir" 2>/dev/null)"
        echo "already serving: http://127.0.0.1:${port_now:-?}/"
        return 0
    fi

    if [ "$do_static" -eq 1 ]; then
        if [ ! -f "$wiki_dir/portal/index.html" ]; then
            echo "wiki serve: no portal built yet at $wiki_dir/portal/index.html (run: wiki build, or serve without --static)" >&2
            return 1
        fi
    else
        # build-portal first so the served page matches the current store
        if ! bash -c '
            set -uo pipefail
            source "$1"
            wiki_build_portal "$2/.wiki/store.json" "$2" "$2/.wiki/portal/index.html" >/dev/null
        ' _ "$build_sh" "$repo"; then
            echo "wiki serve: portal build failed (missing store? run: wiki sync)" >&2
            return 1
        fi
    fi

    # resolve the port: --port N > $WIKI_PORT (set by wiki-env.sh) > 4885
    [ -n "$port" ] || port="${WIKI_PORT:-4885}"
    case "$port" in
        ''|*[!0-9]*) echo "wiki serve: port must be a number, got: $port" >&2; return 1 ;;
    esac
    if [ "$port" -ne 0 ]; then
        if ! python3 -c "import socket; s = socket.socket(); s.bind(('127.0.0.1', $port)); s.close()" 2>/dev/null; then
            echo "wiki serve: port $port is busy; free it, pass --port N, or stop the old server with: wiki serve $repo --stop" >&2
            return 66
        fi
    fi

    mkdir -p "$cache_dir"
    rm -f "$pidfile" "$wiki_dir/portal/server.json"
    local extra=()
    [ "$do_static" -eq 1 ] && extra+=(--read-only)
    python3 "$server_py" --wiki-dir "$wiki_dir" --port "$port" "${extra[@]+"${extra[@]}"}" \
        >>"$logfile" 2>&1 &
    local pid=$!
    printf '%s\n' "$pid" >"$pidfile"

    # wait for the recovery file (proves the bind) and an HTTP 200
    local i
    for i in $(seq 1 75); do
        if ! kill -0 "$pid" 2>/dev/null; then
            rm -f "$pidfile"
            echo "wiki serve: server exited during startup (see $logfile):" >&2
            tail -3 "$logfile" >&2 || true
            return 1
        fi
        if [ -f "$wiki_dir/portal/server.json" ]; then
            local real_port
            real_port="$(python3 -c '
import json, sys
try:
    print(json.load(open(sys.argv[1]))["port"])
except Exception:
    print("")
' "$wiki_dir/portal/server.json" 2>/dev/null)"
            if [ -n "$real_port" ] \
                && [ "$(python3 - "$real_port" <<'PY'
import sys
import urllib.request

try:
    with urllib.request.urlopen(
            "http://127.0.0.1:%s/" % sys.argv[1], timeout=2) as r:
        print(r.status)
except Exception:
    print("0")
PY
)" = "200" ]; then
                local url="http://127.0.0.1:$real_port/"
                echo "wiki serve: serving $repo"
                echo "  $url"
                wiki_serve_open_browser "$repo" "$url"
                return 0
            fi
        fi
        sleep 0.2
    done
    kill -TERM "$pid" 2>/dev/null || true
    rm -f "$pidfile"
    echo "wiki serve: server did not become healthy (see $logfile)" >&2
    return 1
}

# wiki_serve_is_serving PIDFILE NEEDLE: 0 when the pidfile names a live
# process whose cmdline contains NEEDLE. The /proc check means a recycled pid
# is never killed: --stop only terminates the server it wrote down.
wiki_serve_is_serving() {
    local pidfile="$1" needle="$2" pid
    [ -f "$pidfile" ] || return 1
    pid="$(cat "$pidfile" 2>/dev/null)" || return 1
    case "$pid" in
        ''|*[!0-9]*) return 1 ;;
    esac
    [ -r "/proc/$pid/cmdline" ] || return 1
    tr '\0' ' ' <"/proc/$pid/cmdline" | grep -q "$needle"
}

# wiki_serve_browser_mode REPO: resolve the open mode. Order: WIKI_BROWSER env
# > .wiki/config.json "browser" key > default "vscode" (VS Code Simple Browser).
wiki_serve_browser_mode() {
    local repo="$1"
    case "${WIKI_BROWSER:-}" in
        vscode|system) printf '%s\n' "$WIKI_BROWSER"; return 0 ;;
    esac
    local cfg="$repo/.wiki/config.json"
    if [ -r "$cfg" ]; then
        local mode
        mode="$(python3 -c 'import json,sys
print(json.load(open(sys.argv[1])).get("browser",""))' "$cfg" 2>/dev/null || true)"
        case "$mode" in
            vscode|system) printf '%s\n' "$mode"; return 0 ;;
        esac
    fi
    printf 'vscode\n'
}

# wiki_serve_open_browser REPO URL: default VS Code Simple Browser; mode
# "system" uses the WSL2 chain wslview -> explorer.exe -> cmd.exe. Falls back
# to the chain when `code` is unavailable. explorer.exe often returns nonzero
# on success, so branches are best-effort. Runs only for an interactive
# terminal unless WIKI_SERVE_OPEN forces a choice.
wiki_serve_open_browser() {
    local repo="$1"; shift
    local url="$1"
    local want=""
    case "${WIKI_SERVE_OPEN:-}" in
        0) return 0 ;;
        1) want=1 ;;
        *) [ -t 1 ] && want=1 ;;
    esac
    [ "$want" = "1" ] || { echo "  (not opening a browser; open the URL above)"; return 0; }
    local mode
    mode="$(wiki_serve_browser_mode "$repo")"
    if [ "$mode" = "vscode" ]; then
        local encoded
        encoded="$(python3 -c 'import urllib.parse,sys
print(urllib.parse.quote(sys.argv[1], safe=""))' "$url" 2>/dev/null || printf '%s' "$url")"
        if command -v code >/dev/null 2>&1; then
            if code --open-url "vscode://simpleBrowser.show?url=$encoded" >/dev/null 2>&1; then
                echo "  opened in VS Code Simple Browser"
                return 0
            fi
            echo "  code failed; falling back to system browser"
        else
            echo "  code not found; falling back to system browser"
        fi
    fi
    if command -v wslview >/dev/null 2>&1 && wslview "$url" >/dev/null 2>&1; then
        echo "  opened via wslview"
        return 0
    fi
    if command -v explorer.exe >/dev/null 2>&1; then
        explorer.exe "$url" >/dev/null 2>&1 || true
        echo "  handed to Windows shell (if nothing opened, use the URL above)"
        return 0
    fi
    if command -v cmd.exe >/dev/null 2>&1; then
        cmd.exe /c start "" "$url" >/dev/null 2>&1 || true
        echo "  handed to cmd start"
        return 0
    fi
    echo "  no opener found; open the URL above manually"
    return 0
}

# Direct execution entry (the wiki dispatcher sources this file instead).
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    wiki_serve "$@"
    exit $?
fi
