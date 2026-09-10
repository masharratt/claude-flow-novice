#!/usr/bin/env bash
# cfn-fleet lib/cmd-dashboard.sh: self-contained HTML dashboard for a run.
#
# Renders <run-dir>/dashboard.html straight from roster.tsv (parsed by header
# name via _fleet_tsv_split, never positional), keeps its own transition
# history in .dashboard.state + dashboard-events.jsonl, serves the run dir on
# 127.0.0.1 via python3 http.server, and opens it in the VS Code Simple
# Browser. Deliberately never exits on ALL-DONE (the opposite of `fleet
# watch`, on purpose: the dashboard is a page you leave open, not a loop that
# ends the session).
#
#   fleet dashboard [--port N] [--poll S] [--stale-min N] [--once]
#                   [--no-serve] [--open] [--stop]
#
# State ownership: this command owns .dashboard.state and
# dashboard-events.jsonl ONLY. `.watch.state` belongs to `fleet watch`; two
# writers on one diff baseline corrupt each other, so it is never read or
# written here.
#
# Page contract (selfcheck-enforced, warn-only): self-contained HTML: zero
# <link> tags, every src/href either data: or #; all data interpolation goes
# through _fleet_html_escape; status pill classes come from the closed vocab
# via a whitelist (unknown statuses render st-unknown, never st-<raw>); no em
# dashes in page copy.
#
# Exit codes: 0 ok | 64 usage | 65 data error | 66 guard refusal.

# _fleet_dash_port [FLAG_VALUE]: resolved dashboard port. Precedence:
# --port flag > FLEET_DASHBOARD_PORT env > fleet.env FLEET_DASHBOARD_PORT >
# 4880 (unassigned per project-ports.md).
_fleet_dash_port() {
  local flag="${1:-}"
  if [ -n "$flag" ]; then
    printf '%s\n' "$flag"
    return 0
  fi
  if [ -n "${FLEET_DASHBOARD_PORT:-}" ]; then
    printf '%s\n' "$FLEET_DASHBOARD_PORT"
    return 0
  fi
  local v
  v=$(fleet_env_get FLEET_DASHBOARD_PORT)
  printf '%s\n' "${v:-4880}"
}

# _fleet_json_escape STR: minimal JSON string escaping (backslash, quote).
# Statuses come from the closed vocab and ws ids from the roster; both are
# escaped anyway so a hostile roster cell cannot break the jsonl line shape.
_fleet_json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

main() {
  local port="" poll=5 stale_min=15 once=0 no_serve=0 do_stop=0 do_open=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --port)      [ $# -ge 2 ] || fleet_die 64 "dashboard: --port needs a number"
                   port="$2"; shift 2 ;;
      --poll)      [ $# -ge 2 ] || fleet_die 64 "dashboard: --poll needs seconds"
                   poll="$2"; shift 2 ;;
      --stale-min) [ $# -ge 2 ] || fleet_die 64 "dashboard: --stale-min needs a number"
                   stale_min="$2"; shift 2 ;;
      --once)      once=1; shift ;;
      --no-serve)  no_serve=1; shift ;;
      --stop)      do_stop=1; shift ;;
      --open)      do_open=1; shift ;;
      -*)          fleet_die 64 "dashboard: unknown option $1" ;;
      *)           fleet_die 64 "dashboard: unexpected argument $1" ;;
    esac
  done
  [[ "$poll" =~ ^[0-9]+$ && "$stale_min" =~ ^[0-9]+$ ]] \
    || fleet_die 64 "dashboard: --poll/--stale-min expect non-negative numbers"
  [ -z "$port" ] || [[ "$port" =~ ^[0-9]+$ ]] \
    || fleet_die 64 "dashboard: --port expects a non-negative number"

  # --stop dispatches before anything else: teardown must work on a run dir
  # whose roster has since been removed.
  if [ "$do_stop" -eq 1 ]; then
    local stop_dir
    stop_dir=$(fleet_run_dir)
    _fleet_dash_serve_stop "$stop_dir"
    return 0
  fi

  if [ "$do_open" -eq 1 ] && [ "$no_serve" -eq 1 ]; then
    fleet_die 64 "dashboard: --open needs the local server (drop --no-serve)"
  fi

  local run_dir
  run_dir=$(fleet_run_dir)
  local roster
  roster=$(fleet_roster_file)
  [ -f "$roster" ] || fleet_die 65 "dashboard: roster missing at $roster"

  local serving=0
  if [ "$no_serve" -eq 0 ]; then
    port=$(_fleet_dash_port "$port")
    _fleet_dash_serve_start "$run_dir" "$port"
    serving=1
  fi

  _fleet_dash_pass "$roster" "$stale_min" "$poll"

  if [ "$serving" -eq 1 ]; then
    local url="http://127.0.0.1:$port/dashboard.html"
    if [ "$do_open" -eq 1 ]; then
      _fleet_dash_open "$url"   # always prints the URL + fallback line itself
    else
      echo "dashboard: $url"
    fi
  else
    echo "dashboard: wrote $run_dir/dashboard.html (--no-serve)"
  fi

  [ "$once" -eq 1 ] && return 0
  trap 'exit 0' INT TERM
  local fp nfp
  fp=$(_fleet_dash_fingerprint "$run_dir")
  while true; do
    sleep "$poll"
    nfp=$(_fleet_dash_fingerprint "$run_dir") || continue
    if [ "$nfp" != "$fp" ]; then
      fp="$nfp"
      # A render failure warns and keeps the last good page; it never kills
      # the loop (this dashboard is meant to outlive transient roster reads).
      _fleet_dash_pass "$roster" "$stale_min" "$poll" \
        || echo "fleet dashboard: render failed; keeping last page" >&2
    fi
  done
}

# _fleet_dash_pass ROSTER STALE_MIN POLL: one pass: diff transitions, then
# render. No ALL-DONE handling on purpose (see file header).
_fleet_dash_pass() {
  _fleet_dash_transitions "$1"
  _fleet_dash_render "$1" "$2" "$3"
}

# _fleet_dash_transitions ROSTER: diff roster statuses against
# .dashboard.state; append each change as one
# {"ts","ws","from","to"} line to <run-dir>/dashboard-events.jsonl (atomic
# tmp+mv, so a tailing reader never sees a torn line); rewrite the state.
# First pass is the baseline and records nothing.
_fleet_dash_transitions() {
  local roster="$1"
  local run_dir
  run_dir=$(dirname "$roster")
  local state="$run_dir/.dashboard.state"
  local events="$run_dir/dashboard-events.jsonl"
  local now
  now=$(date +%s)

  local -A prev=()
  local ws st
  if [ -f "$state" ]; then
    while IFS=$'\t' read -r ws st; do
      [ -n "$ws" ] || continue
      prev["$ws"]="$st"
    done < "$state"
  fi

  _fleet_tsv_split "$(head -n1 "$roster")"
  local -a fields=("${_FIELDS[@]}")

  local -A cur=()
  local -a new_lines=()
  local row i status
  while IFS= read -r row || [ -n "$row" ]; do
    [ -n "$row" ] || continue
    _fleet_tsv_split "$row"
    local -a cells=("${_FIELDS[@]}")
    ws="${cells[0]:-}"
    status=""
    for i in "${!fields[@]}"; do
      [ "${fields[$i]}" = "status" ] && status="${cells[$i]:-}"
    done
    cur["$ws"]="$status"
    if [ -n "${prev[$ws]+set}" ] && [ "${prev[$ws]}" != "$status" ]; then
      new_lines+=("$(printf '{"ts":%s,"ws":"%s","from":"%s","to":"%s"}' \
        "$now" \
        "$(_fleet_json_escape "$ws")" \
        "$(_fleet_json_escape "${prev[$ws]}")" \
        "$(_fleet_json_escape "$status")")")
    fi
  done < <(awk 'NR > 1' "$roster")

  if [ "${#new_lines[@]}" -gt 0 ]; then
    local tmp="$events.tmp.$$" l
    if [ -f "$events" ]; then
      if ! cat "$events" > "$tmp"; then
        rm -f "$tmp"
        echo "fleet dashboard: WARN: cannot read $events; transitions not recorded" >&2
        return 0
      fi
    else
      : > "$tmp"
    fi
    for l in "${new_lines[@]}"; do
      printf '%s\n' "$l" >> "$tmp"
    done
    mv "$tmp" "$events"
  fi

  local stmp="$state.tmp.$$"
  {
    for ws in "${!cur[@]}"; do
      printf '%s\t%s\n' "$ws" "${cur[$ws]}"
    done | LC_ALL=C sort
  } > "$stmp" && mv "$stmp" "$state"
  return 0
}

# _fleet_dash_render ROSTER STALE_MIN POLL: write <run-dir>/dashboard.html
# atomically (tmp+mv). Failure modes are warn-only: the previous page stays
# on disk when the render dies.
_fleet_dash_render() {
  local roster="$1" stale_min="$2" poll="${3:-5}"
  local run_dir
  run_dir=$(dirname "$roster")
  local slug
  slug=$(basename "$run_dir")
  local events="$run_dir/dashboard-events.jsonl"
  local now
  now=$(date +%s)
  local out="$run_dir/dashboard.html"
  local tmp="$out.tmp.$$"

  # Dead-pane probe needs tmux and the run's socket; skip the whole check
  # silently when the binary is missing (tooling absence is never a DEAD).
  local tmux_ok=0 sock=""
  if command -v tmux >/dev/null 2>&1; then
    tmux_ok=1
    sock=$(_fleet_tmux_socket)
  fi

  _fleet_tsv_split "$(head -n1 "$roster")"
  local -a fields=("${_FIELDS[@]}")

  local -A counts=()
  local cards="" row i
  local ws name task status claims sha notes hb engine
  while IFS= read -r row || [ -n "$row" ]; do
    [ -n "$row" ] || continue
    _fleet_tsv_split "$row"
    local -a cells=("${_FIELDS[@]}")
    ws="${cells[0]:-}"; name=""; task=""; status=""
    claims=""; sha=""; notes=""; hb="0"; engine=""
    for i in "${!fields[@]}"; do
      case "${fields[$i]}" in
        ws_id)      ws="${cells[$i]:-}" ;;
        name)       name="${cells[$i]:-}" ;;
        task)       task="${cells[$i]:-}" ;;
        status)     status="${cells[$i]:-}" ;;
        claims)     claims="${cells[$i]:-}" ;;
        landed_sha) sha="${cells[$i]:-}" ;;
        notes)      notes="${cells[$i]:-}" ;;
        heartbeat)  hb="${cells[$i]:-}" ;;
        engine)     engine="${cells[$i]:-}" ;;
      esac
    done
    counts["$status"]=$(( ${counts["$status"]:-0} + 1 ))

    local stale=0 dead=0
    case "$status" in
      started|working)
        if [[ "$hb" =~ ^[0-9]+$ ]] && [ "$hb" -gt 0 ]; then
          [ $(( (now - hb) / 60 )) -gt "$stale_min" ] && stale=1
        fi
        if [ "$tmux_ok" -eq 1 ] && [ -n "$name" ]; then
          _fleet_tmux_pane_alive "$sock" "$name" || dead=1
        fi ;;
      dead)
        dead=1 ;;
    esac

    cards+=$(_fleet_dash_card "$ws" "$name" "$task" "$status" "$claims" \
      "$sha" "$notes" "$hb" "$engine" "$stale_min" "$now" "$stale" "$dead")
    cards+=$'\n'
  done < <(awk 'NR > 1' "$roster")

  # Count pills in closed-vocab order so the header layout is stable.
  local pills="" s
  for s in pending started working blocked landed done dead; do
    [ "${counts[$s]:-0}" -gt 0 ] || continue
    pills+=$(printf '<span class="pill count-pill" data-count="%s">%s %s</span>' \
      "$s" "$s" "${counts[$s]}")
  done

  local updated
  updated=$(date -u '+%Y-%m-%d %H:%M:%SZ')

  {
    printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    printf '<title>Fleet dashboard: %s</title>\n' "$(_fleet_html_escape "$slug")"
    printf '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    printf '<meta http-equiv="refresh" content="%s">\n' "$poll"
    _fleet_dash_style
    printf '</head>\n<body>\n'
    printf '<header class="top"><div class="head-card"><h1>fleet <span class="slug">%s</span></h1>\n' \
      "$(_fleet_html_escape "$slug")"
    printf '<div class="pills"><span class="pill meta-pill">stale-min %s</span>' "$stale_min"
    printf '%s' "$pills"
    printf '<span class="pill meta-pill">updated %s</span></div></div></header>\n' \
      "$(_fleet_html_escape "$updated")"
    printf '<main class="grid">\n'
    if [ -n "$cards" ]; then
      printf '%s\n' "$cards"
    else
      printf '<div class="card empty-state"><p>No workstreams yet</p>'
      printf '<p>Add one with: fleet add WSxx "task"</p></div>\n'
    fi
    printf '</main>\n'
    printf '<section class="timeline"><h2>Transitions (newest first)</h2>\n'
    _fleet_dash_events_html "$events"
    printf '</section>\n'
    printf '<footer>landed means the workstream has a commit, not that it is finished</footer>\n'
    _fleet_dash_script
    printf '</body>\n</html>\n'
  } > "$tmp"

  _fleet_dash_selfcheck "$tmp"
  mv "$tmp" "$out"
}

# _fleet_dash_card WS NAME TASK STATUS CLAIMS SHA NOTES HB ENGINE STALE_MIN \
#                  NOW STALE DEAD: echo one worker card. STALE/DEAD are 0|1
# flags derived by the render pass (stale: heartbeat age > stale-min on a
# started|working row; dead: status dead, or the pane probe failed).
_fleet_dash_card() {
  local ws="$1" name="$2" task="$3" status="$4" claims="$5" sha="$6" notes="$7" \
        hb="$8" engine="$9" stale_min="${10}" now="${11}" stale="${12}" dead="${13}"
  # Pill classes are whitelist-mapped: an unknown status must never become a
  # styleable class (roster cells are user-typed).
  local st_class="st-unknown"
  case "$status" in
    pending|started|working|blocked|landed|done|dead) st_class="st-$status" ;;
  esac
  # Engine: roster cell > FLEET_DEFAULT_ENGINE env > fleet.env > claude-sub.
  [ -n "$engine" ] || engine="${FLEET_DEFAULT_ENGINE:-$(fleet_engine_default)}"

  local out=""
  out+="<article class=\"card\" data-ws=\"$(_fleet_html_escape "$ws")\" data-status=\"$(_fleet_html_escape "$status")\">"$'\n'
  out+='<div class="head">'
  out+="<span class=\"pill $st_class\">$(_fleet_html_escape "$status")</span>"
  [ "$stale" -eq 1 ] && out+='<span class="badge stale">STALE</span>'
  [ "$dead" -eq 1 ] && out+='<span class="badge dead">DEAD</span>'
  out+="<span class=\"ws-name\">$(_fleet_html_escape "$name")</span>"
  out+="</div>"$'\n'
  [ -n "$task" ] && out+="<p class=\"task\">$(_fleet_html_escape "$task")</p>"$'\n'
  out+='<div class="meta">'
  out+="<span class=\"engine\">$(_fleet_html_escape "$engine")</span>"
  if [[ "$hb" =~ ^[0-9]+$ ]] && [ "$hb" -gt 0 ]; then
    local age=$(( now - hb ))
    [ "$age" -lt 0 ] && age=0
    out+="<span class=\"hb-age\" data-epoch=\"$hb\">$(_fleet_html_escape "$(_fleet_dash_hb_text "$age")")</span>"
  else
    out+='<span class="hb-age">never</span>'
  fi
  [ -n "$sha" ] && out+="<code class=\"sha\">$(_fleet_html_escape "$sha")</code>"
  out+="</div>"$'\n'
  if [ -n "$claims" ]; then
    out+='<ul class="claims">'
    local c
    for c in $claims; do
      out+="<li>$(_fleet_html_escape "$c")</li>"
    done
    out+='</ul>'$'\n'
  fi
  [ -n "$notes" ] && out+="<p class=\"notes\">$(_fleet_html_escape "$notes")</p>"$'\n'
  printf '%s\n' "$out"
}

# _fleet_dash_hb_text SECONDS: compact human age for the static (no-JS)
# heartbeat fallback. The JS ticker mirrors this shape.
_fleet_dash_hb_text() {
  local s="$1"
  if [ "$s" -lt 60 ]; then
    printf '%ss\n' "$s"
  elif [ "$s" -lt 3600 ]; then
    printf '%sm\n' $(( s / 60 ))
  elif [ "$s" -lt 86400 ]; then
    printf '%sh %02dm\n' $(( s / 3600 )) $(( (s % 3600) / 60 ))
  else
    printf '%sd %02dh\n' $(( s / 86400 )) $(( (s % 86400) / 3600 ))
  fi
}

# _fleet_dash_ts_text EPOCH: HH:MM:SS UTC label for a timeline entry.
_fleet_dash_ts_text() {
  date -u -d "@$1" '+%H:%M:%S' 2>/dev/null || printf '?'
}

# _fleet_dash_events_html EVENTS_FILE: newest-30 timeline (newest first) or
# an empty-state line when the file is missing or empty.
_fleet_dash_events_html() {
  local events="$1"
  if [ ! -s "$events" ]; then
    printf '<p class="timeline-empty">No transitions recorded yet</p>\n'
    return 0
  fi
  printf '<ul class="timeline">\n'
  local line ts ws from to
  tail -n 30 "$events" | tac | while IFS= read -r line; do
    [ -n "$line" ] || continue
    ts=0; ws=""; from=""; to=""
    [[ "$line" =~ \"ts\":([0-9]+) ]]   && ts="${BASH_REMATCH[1]}"
    [[ "$line" =~ \"ws\":\"([^\"]*)\" ]]   && ws="${BASH_REMATCH[1]}"
    [[ "$line" =~ \"from\":\"([^\"]*)\" ]] && from="${BASH_REMATCH[1]}"
    [[ "$line" =~ \"to\":\"([^\"]*)\" ]]   && to="${BASH_REMATCH[1]}"
    printf '<li class="tl-item"><time>%s</time> <span class="tl-ws">%s</span> %s -&gt; %s</li>\n' \
      "$(_fleet_dash_ts_text "$ts")" \
      "$(_fleet_html_escape "$ws")" \
      "$(_fleet_html_escape "$from")" \
      "$(_fleet_html_escape "$to")"
  done
  printf '</ul>\n'
}

# _fleet_dash_style: inline CSS: explicit light tokens on :root, dark
# overrides under prefers-color-scheme, system font stack. No external faces,
# no em dashes in comments (this text ships inside the page).
_fleet_dash_style() {
  cat <<'STYLE'
<style>
:root {
  --bg: #f6f7f9; --card: #ffffff; --ink: #1c2330; --muted: #5b6472;
  --line: #dfe3ea;
  --st-pending: #8a93a3; --st-started: #2f6fd0; --st-working: #2563a8;
  --st-blocked: #b7791f; --st-landed: #2f855a; --st-done: #276749;
  --st-dead: #c53030; --st-unknown: #8a93a3;
  --badge-stale-bg: #fdf3e3; --badge-stale-ink: #9c6410;
  --badge-dead-bg: #fdeaea; --badge-dead-ink: #c53030;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14171c; --card: #1d222a; --ink: #e6e9ef; --muted: #9aa3b2;
    --line: #2c333e;
    --st-pending: #6b7480; --st-started: #5b93e8; --st-working: #4a86dd;
    --st-blocked: #d69e2e; --st-landed: #48bb78; --st-done: #38a169;
    --st-dead: #f56565; --st-unknown: #6b7480;
    --badge-stale-bg: #3a2f17; --badge-stale-ink: #ecc94b;
    --badge-dead-bg: #3d1a1a; --badge-dead-ink: #fc8181;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 16px; background: var(--bg); color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px; line-height: 1.45;
}
.top { margin-bottom: 14px; }
.head-card {
  background: var(--card); border: 1px solid var(--line); border-radius: 8px;
  padding: 10px 14px;
}
h1 { margin: 0 0 8px; font-size: 18px; }
h1 .slug { color: var(--muted); font-weight: 600; }
h2 { font-size: 14px; margin: 0 0 8px; color: var(--muted); }
.pills { display: flex; flex-wrap: wrap; gap: 6px; }
.pill {
  display: inline-block; padding: 1px 9px; border-radius: 999px;
  font-size: 12px; background: var(--card); border: 1px solid var(--line);
}
.pill.meta-pill, .pill.count-pill { color: var(--muted); }
.grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 12px;
}
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 8px;
  padding: 10px 12px;
}
.card .head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.card p { margin: 6px 0 0; }
.task { font-weight: 600; }
.card .meta {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-top: 8px; color: var(--muted); font-size: 12px;
}
.card .ws-name { color: var(--muted); }
.pill.st-pending   { background: var(--st-pending); border-color: var(--st-pending); color: #fff; }
.pill.st-started   { background: var(--st-started); border-color: var(--st-started); color: #fff; }
.pill.st-working   { background: var(--st-working); border-color: var(--st-working); color: #fff; }
.pill.st-blocked   { background: var(--st-blocked); border-color: var(--st-blocked); color: #fff; }
.pill.st-landed    { background: var(--st-landed);  border-color: var(--st-landed);  color: #fff; }
.pill.st-done      { background: var(--st-done);    border-color: var(--st-done);    color: #fff; }
.pill.st-dead      { background: var(--st-dead);    border-color: var(--st-dead);    color: #fff; }
.pill.st-unknown   { background: var(--st-unknown); border-color: var(--st-unknown); color: #fff; }
.badge {
  display: inline-block; padding: 0 7px; border-radius: 4px; font-size: 11px;
  font-weight: 700; letter-spacing: 0.04em;
}
.badge.stale { background: var(--badge-stale-bg); color: var(--badge-stale-ink); }
.badge.dead  { background: var(--badge-dead-bg);  color: var(--badge-dead-ink); }
.claims { margin: 8px 0 0; padding-left: 18px; font-size: 12px; color: var(--muted); }
.notes { font-size: 12px; color: var(--muted); }
code.sha { font-size: 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; }
.timeline { margin: 18px 0 0; }
.timeline ul { list-style: none; margin: 0; padding: 0; }
.tl-item { padding: 3px 0; border-bottom: 1px dotted var(--line); font-size: 13px; }
.tl-item time, .tl-ws { color: var(--muted); }
.timeline-empty { color: var(--muted); font-size: 13px; }
.empty-state { color: var(--muted); text-align: center; padding: 28px 12px; }
.empty-state p { margin: 4px 0; }
footer { margin-top: 18px; color: var(--muted); font-size: 12px; }
</style>
STYLE
}

# _fleet_dash_script: inline JS: 1s ticker rewriting every .hb-age[data-epoch]
# from its stamp. The static text rendered by bash is the no-JS fallback.
_fleet_dash_script() {
  cat <<'SCRIPT'
<script>
(function () {
  "use strict";
  function fmt(s) {
    if (s < 60) return s + "s";
    if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) {
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return h + "h " + (m < 10 ? "0" + m : m) + "m";
    }
    var d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600);
    return d + "d " + (hh < 10 ? "0" + hh : hh) + "h";
  }
  function tick() {
    var now = Math.floor(Date.now() / 1000);
    document.querySelectorAll(".hb-age[data-epoch]").forEach(function (el) {
      var d = now - parseInt(el.getAttribute("data-epoch"), 10);
      if (!isFinite(d) || d < 0) d = 0;
      el.textContent = fmt(d);
    });
  }
  tick();
  setInterval(tick, 1000);
})();
</script>
SCRIPT
}

# _fleet_dash_selfcheck FILE: ship-blocking-signal scan of the generated
# page: any <link>, or any src/href that is neither data: nor #, gets a WARN
# on stderr. Warn-only by contract; never fails the render.
_fleet_dash_selfcheck() {
  local f="$1" bad
  if grep -q '<link' "$f" 2>/dev/null; then
    echo "fleet dashboard: WARN selfcheck: <link> tag found in $f" >&2
  fi
  bad=$(grep -oE '(src|href)="[^"]*"' "$f" 2>/dev/null | grep -vE '"(data:|#)' || true)
  if [ -n "$bad" ]; then
    while IFS= read -r bad; do
      echo "fleet dashboard: WARN selfcheck: external attribute $bad" >&2
    done <<< "$bad"
  fi
  return 0
}

# _fleet_dash_fingerprint RUN_DIR: cheap change signal for the poll loop:
# mtime+size of the three files the page is built from, hashed. A file that
# does not exist yet contributes a stable "missing" marker, so its first
# appearance flips the fingerprint.
_fleet_dash_fingerprint() {
  local rd="$1" f
  {
    for f in roster.tsv dashboard-events.jsonl fleet.env; do
      if [ -f "$rd/$f" ]; then
        stat -c '%Y %s' "$rd/$f"
      else
        printf 'missing %s\n' "$f"
      fi
    done
  } | sort | sha1sum
}

# _fleet_dash_serve_is_serving RUN_DIR: 0 when the pidfile names a live
# python3 http.server. The /proc/<pid>/cmdline check is load-bearing: a
# recycled pid whose cmdline is not http.server is "not serving", so --stop
# never kills an innocent process.
_fleet_dash_serve_is_serving() {
  local rd="$1" pid
  [ -f "$rd/.dashboard.pid" ] || return 1
  pid=$(cat "$rd/.dashboard.pid" 2>/dev/null) || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  [ -r "/proc/$pid/cmdline" ] || return 1
  tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q 'http.server'
}

# _fleet_dash_serve_start RUN_DIR PORT: idempotent start of
# python3 -m http.server on 127.0.0.1. A double start is a printed no-op
# (exit 0); a busy port refuses with 66 naming the remedies; a missing
# python3 refuses with 66 naming python3 and --no-serve.
_fleet_dash_serve_start() {
  local rd="$1" port="$2"
  if _fleet_dash_serve_is_serving "$rd"; then
    echo "already serving (pid $(cat "$rd/.dashboard.pid"))"
    return 0
  fi
  command -v python3 >/dev/null 2>&1 \
    || fleet_die 66 "dashboard: python3 not found; serving needs it (use --no-serve for a static page only)"
  if ! python3 -c "import socket; s = socket.socket(); s.bind(('127.0.0.1', $port)); s.close()" 2>/dev/null; then
    fleet_die 66 "dashboard: port $port is busy; free it, pass --port N, set FLEET_DASHBOARD_PORT, or stop the old server with: fleet dashboard --stop"
  fi
  rm -f "$rd/.dashboard.pid"
  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$rd" >> "$rd/.dashboard.log" 2>&1 &
  local pid=$!
  printf '%s\n' "$pid" > "$rd/.dashboard.pid"
  # Wait briefly for the server process to be live; a failed bind dies
  # instantly and the log names the reason.
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if _fleet_dash_serve_is_serving "$rd"; then
      return 0
    fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done
  rm -f "$rd/.dashboard.pid"
  fleet_die 66 "dashboard: http.server on port $port failed to start (see $rd/.dashboard.log)"
}

# _fleet_dash_serve_stop RUN_DIR: TERM, poll up to 2s, then KILL; always
# clears the pidfile. Stopping a non-serving run says so and exits 0.
_fleet_dash_serve_stop() {
  local rd="$1" pid
  if ! _fleet_dash_serve_is_serving "$rd"; then
    rm -f "$rd/.dashboard.pid"
    echo "dashboard: not serving"
    return 0
  fi
  pid=$(cat "$rd/.dashboard.pid")
  kill -TERM "$pid" 2>/dev/null || true
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    [ -d "/proc/$pid" ] || break
    sleep 0.2
  done
  if [ -d "/proc/$pid" ]; then
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$rd/.dashboard.pid"
  echo "dashboard: stopped (pid $pid)"
}

# _fleet_urlencode STR: pure-bash percent encoding; A-Za-z0-9 . _ - stay
# literal, everything else becomes %XX.
_fleet_urlencode() {
  local s="$1" out="" c i ch
  for (( i = 0; i < ${#s}; i++ )); do
    c="${s:i:1}"
    case "$c" in
      [A-Za-z0-9._-]) out+="$c" ;;
      *) printf -v ch '%%%02X' "'$c"; out+="$ch" ;;
    esac
  done
  printf '%s' "$out"
}

# _fleet_dash_open URL: raise the URL in the VS Code Simple Browser via the
# code CLI. Absent or failing code is warn-only. ALWAYS prints the http URL
# plus the manual fallback line, so the flow works with no code CLI at all.
_fleet_dash_open() {
  local url="$1" enc
  enc=$(_fleet_urlencode "$url")
  if command -v code >/dev/null 2>&1; then
    code --open-url "vscode://simpleBrowser.show?url=$enc" \
      || echo "fleet dashboard: WARN: code --open-url failed; open the URL manually" >&2
  else
    echo "fleet dashboard: WARN: 'code' CLI not found; open the URL manually" >&2
  fi
  echo "$url"
  echo 'Simple Browser fallback: Ctrl+Shift+P -> "Simple Browser: Show" -> paste URL'
  return 0
}
