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
# State ownership: this command owns .dashboard.state,
# dashboard-events.jsonl and dashboard-events-tail.jsonl ONLY (the tail file
# is the bounded last-30 feed the page's live JS polls). `.watch.state`
# belongs to `fleet watch`; two writers on one diff baseline corrupt each
# other, so it is never read or written here. Read-only inputs:
# <run-dir>/goal.txt (header blurb) and <run-dir>/files/<ws>.txt (per-card
# now-editing lists, published by `fleet heartbeat --files`).
#
# Page contract (selfcheck-enforced, warn-only): self-contained HTML: zero
# <link> tags, every src/href either data: or #; all data interpolation goes
# through _fleet_html_escape (bash) or the shared esc() helper (JS); status
# pill classes come from the closed vocab via a whitelist (unknown statuses
# render st-unknown, never st-<raw>); no em dashes in page copy. The page is
# live: inline JS re-fetches roster.tsv and dashboard-events-tail.jsonl every
# data-poll seconds and redraws tiles, meter, cards and timeline in place;
# the full-page refresh exists only inside <noscript> as the no-JS fallback.
#
# Exit codes: 0 ok | 64 usage | 65 data error | 66 guard refusal.

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

# _fleet_dash_write_tail EVENTS TAIL_FILE: bounded last-30 feed for the
# page's live JS, rewritten atomically (tmp+mv) on every render pass so the
# fetch target always exists (an empty run dir serves an empty file, not a
# 404). A failed read degrades to an empty tail; transitions already warns.
_fleet_dash_write_tail() {
  local events="$1" tailf="$2"
  local tmp="$tailf.tmp.$$"
  if [ -f "$events" ]; then
    tail -n 30 "$events" > "$tmp" 2>/dev/null || : > "$tmp"
  else
    : > "$tmp"
  fi
  mv "$tmp" "$tailf"
}

# _fleet_dash_render ROSTER STALE_MIN POLL: write <run-dir>/dashboard.html
# atomically (tmp+mv), plus the events tail feed. Failure modes are
# warn-only: the previous page stays on disk when the render dies.
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

  _fleet_dash_write_tail "$events" "$run_dir/dashboard-events-tail.jsonl"

  # Goal blurb (plan 1.7): first line of goal.txt capped at 200 chars;
  # missing or empty file means no blurb.
  local goal=""
  if [ -f "$run_dir/goal.txt" ]; then
    goal=$(head -n 1 "$run_dir/goal.txt" 2>/dev/null | cut -c1-200 || true)
  fi

  # Engine fallback for the page's live JS, which has no fleet.env access.
  local eng_default="${FLEET_DEFAULT_ENGINE:-$(fleet_engine_default)}"

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

    # "Now editing" source file for this card (plan 1.6). The ws id is
    # user-typed: guard the charset before composing the path, and skip the
    # section silently when the worker has not published a list.
    local files_path=""
    if [[ "$ws" =~ ^[A-Za-z0-9._-]+$ ]] && [ -f "$run_dir/files/$ws.txt" ]; then
      files_path="$run_dir/files/$ws.txt"
    fi

    cards+=$(_fleet_dash_card "$ws" "$name" "$task" "$status" "$claims" \
      "$sha" "$notes" "$hb" "$engine" "$stale_min" "$now" "$stale" "$dead" \
      "$files_path")
    cards+=$'\n'
  done < <(awk 'NR > 1' "$roster")

  # Meter groups the 7 statuses into 5 adjacency-safe segments (plan 1.3):
  # queued / active(started+working) / blocked / landed+done / dead.
  local n_queued=${counts[pending]:-0}
  local n_active=$(( ${counts[started]:-0} + ${counts[working]:-0} ))
  local n_blocked=${counts[blocked]:-0}
  local n_landed=$(( ${counts[landed]:-0} + ${counts[done]:-0} ))
  local n_dead=${counts[dead]:-0}

  local updated
  updated=$(date -u '+%Y-%m-%d %H:%M:%SZ')

  {
    printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    printf '<title>Fleet dashboard: %s</title>\n' "$(_fleet_html_escape "$slug")"
    printf '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    printf '<noscript><meta http-equiv="refresh" content="15"></noscript>\n'
    _fleet_dash_boot_theme
    _fleet_dash_style
    printf '</head>\n<body data-poll="%s" data-stale-min="%s" data-engine-default="%s">\n' \
      "$poll" "$stale_min" "$(_fleet_html_escape "$eng_default")"
    printf '<header class="top"><div class="head-card">\n'
    printf '<div class="head-row"><h1>fleet <span class="slug">%s</span></h1>\n' \
      "$(_fleet_html_escape "$slug")"
    printf '<div class="head-actions">'
    printf '<span class="live-dot" id="live-dot" data-state="ok" title="live: fetching roster"></span>'
    printf '<button type="button" id="theme-toggle" class="chipbtn" title="switch color theme">theme</button>'
    printf '</div></div>\n'
    if [ -n "$goal" ]; then
      printf '<p class="goal" id="goal">%s</p>\n' "$(_fleet_html_escape "$goal")"
    else
      printf '<p class="goal" id="goal" hidden></p>\n'
    fi
    printf '<div class="pills"><span class="pill meta-pill">stale-min %s</span>' "$stale_min"
    printf '<span class="pill meta-pill" id="updated-pill">updated %s</span></div>\n' \
      "$(_fleet_html_escape "$updated")"
    _fleet_dash_filters
    _fleet_dash_tiles counts
    _fleet_dash_meter "$n_queued" "$n_active" "$n_blocked" "$n_landed" "$n_dead"
    printf '</div></header>\n'
    printf '<main class="grid" id="cards">\n'
    if [ -n "$cards" ]; then
      printf '%s\n' "$cards"
    else
      printf '<div class="card empty-state"><p>No workstreams yet</p>'
      printf '<p>Add one with: fleet add WSxx "task"</p></div>\n'
    fi
    printf '</main>\n'
    printf '<section class="timeline"><h2>Transitions (newest first)</h2>\n'
    printf '<div id="tl">\n'
    _fleet_dash_events_html "$events"
    printf '</div>\n</section>\n'
    printf '<footer>landed means the workstream has a commit, not that it is finished</footer>\n'
    _fleet_dash_script
    printf '</body>\n</html>\n'
  } > "$tmp"

  _fleet_dash_selfcheck "$tmp"
  mv "$tmp" "$out"
}

# _fleet_dash_filters: static filter chip row (all + the closed vocab) and
# the sort control. These are NOT rebuilt by the live JS, so the selection
# survives every poll; the JS only toggles the .on class.
_fleet_dash_filters() {
  local s
  printf '<div class="filters" id="filters">\n'
  printf '<button type="button" class="filterchip on" data-filter="all">all</button>\n'
  # shellcheck disable=SC1010  # 'done' is a roster status value, not the keyword
  for s in pending started working blocked landed done dead; do
    printf '<button type="button" class="filterchip" data-filter="%s"><span class="dot st-%s"></span>%s</button>\n' \
      "$s" "$s" "$s"
  done
  printf '<select id="sort" class="sortsel" title="sort cards">'
  printf '<option value="status">sort: status</option>'
  printf '<option value="hb">sort: heartbeat age</option></select>\n'
  printf '</div>\n'
}

# _fleet_dash_tiles COUNTS: 7 stat tiles (dot + label + count) in
# closed-vocab order; zero counts are dimmed via the .zero class. COUNTS is
# the name of an assoc array keyed by raw status.
_fleet_dash_tiles() {
  local -n cnt="$1"
  local s n out="" zero
  # shellcheck disable=SC1010  # 'done' is a roster status value, not the keyword
  for s in pending started working blocked landed done dead; do
    n="${cnt[$s]:-0}"
    [[ "$n" =~ ^[0-9]+$ ]] || n=0
    zero=""
    [ "$n" -eq 0 ] && zero=" zero"
    out+="<span class=\"tile${zero}\" data-st=\"$s\">"
    out+="<span class=\"dot st-$s\"></span><span class=\"tile-label\">$s</span>"
    out+="<span class=\"tile-n\">$n</span></span>"
  done
  printf '<div class="tiles" id="tiles">%s</div>\n' "$out"
}

# _fleet_dash_meter QUEUED ACTIVE BLOCKED LANDED DEAD: one 5-segment bar.
# Counts double as flex-grow widths; zero segments shrink to slivers and
# dim. Colors are dataviz-validator-approved per mode (see _fleet_dash_style).
_fleet_dash_meter() {
  local -a ns=("$1" "$2" "$3" "$4" "$5")
  local -a ls=(queued active blocked landed dead)
  local i n out=""
  for i in 0 1 2 3 4; do
    n="${ns[$i]}"
    [[ "$n" =~ ^[0-9]+$ ]] || n=0
    # Zero groups render nothing: a flex-grow:0 sliver cannot carry its label.
    [ "$n" -eq 0 ] && continue
    out+="<span class=\"seg seg-${ls[$i]}\" style=\"flex-grow:$n\">"
    out+="<span class=\"seg-n\">$n</span><span class=\"seg-label\">${ls[$i]}</span></span>"
  done
  printf '<div class="meter" id="meter">%s</div>\n' "$out"
}

# _fleet_dash_card WS NAME TASK STATUS CLAIMS SHA NOTES HB ENGINE STALE_MIN \
#                  NOW STALE DEAD FILES_PATH: echo one worker card.
# STALE/DEAD are 0|1 flags derived by the render pass (stale: heartbeat age
# > stale-min on a started|working row; dead: status dead, or the pane probe
# failed). FILES_PATH is the worker's guarded files/<ws>.txt (empty when
# absent); when present its non-empty lines render as the now-editing list,
# capped at 8 with a "+N more" overflow line (plan 1.6).
_fleet_dash_card() {
  local ws="$1" name="$2" task="$3" status="$4" claims="$5" sha="$6" notes="$7" \
        hb="$8" engine="$9" stale_min="${10}" now="${11}" stale="${12}" dead="${13}" \
        files_path="${14:-}"
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
  out+="<span class=\"pill $st_class\"><span class=\"dot\"></span>$(_fleet_html_escape "$status")</span>"
  [ "$stale" -eq 1 ] && out+='<span class="badge stale">&#9888; STALE</span>'
  [ "$dead" -eq 1 ] && out+='<span class="badge dead">&#10005; DEAD</span>'
  out+="<span class=\"ws-name\">$(_fleet_html_escape "$name")</span>"
  out+="</div>"$'\n'
  [ -n "$task" ] && out+="<p class=\"task\">$(_fleet_html_escape "$task")</p>"$'\n'
  out+='<div class="meta">'
  out+="<span class=\"chip engine\">$(_fleet_html_escape "$engine")</span>"
  if [[ "$hb" =~ ^[0-9]+$ ]] && [ "$hb" -gt 0 ]; then
    local age=$(( now - hb ))
    [ "$age" -lt 0 ] && age=0
    out+="<span class=\"hb-age\" data-epoch=\"$hb\">$(_fleet_html_escape "$(_fleet_dash_hb_text "$age")")</span>"
  else
    out+='<span class="hb-age">never</span>'
  fi
  [ -n "$sha" ] && out+="<code class=\"sha\">$(_fleet_html_escape "$sha")</code>"
  out+="</div>"$'\n'
  if [ -n "$files_path" ]; then
    local total shown=0 fpath
    total=$(grep -c . "$files_path" 2>/dev/null || true)
    [[ "$total" =~ ^[0-9]+$ ]] || total=0
    if [ "$total" -gt 0 ]; then
      out+='<div class="editing"><span class="editing-h">now editing</span>'$'\n<ul class="files">\n'
      while IFS= read -r fpath; do
        [ -n "$fpath" ] || continue
        shown=$(( shown + 1 ))
        [ "$shown" -gt 8 ] && break
        out+="<li>$(_fleet_html_escape "$fpath")</li>"$'\n'
      done < "$files_path"
      if [ "$total" -gt 8 ]; then
        out+="<li class=\"files-more\">+$(( total - 8 )) more</li>"$'\n'
      fi
      out+='</ul></div>'$'\n'
    fi
  fi
  if [ -n "$claims" ]; then
    out+='<ul class="claims">'
    local c
    for c in $claims; do
      out+="<li><span class=\"chip claim\">$(_fleet_html_escape "$c")</span></li>"
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
  local line ts ws from to to_class
  tail -n 30 "$events" | tac | while IFS= read -r line; do
    [ -n "$line" ] || continue
    ts=0; ws=""; from=""; to=""
    [[ "$line" =~ \"ts\":([0-9]+) ]]   && ts="${BASH_REMATCH[1]}"
    [[ "$line" =~ \"ws\":\"([^\"]*)\" ]]   && ws="${BASH_REMATCH[1]}"
    [[ "$line" =~ \"from\":\"([^\"]*)\" ]] && from="${BASH_REMATCH[1]}"
    [[ "$line" =~ \"to\":\"([^\"]*)\" ]]   && to="${BASH_REMATCH[1]}"
    to_class="st-unknown"
    case "$to" in
      pending|started|working|blocked|landed|done|dead) to_class="st-$to" ;;
    esac
    printf '<li class="tl-item"><span class="dot %s"></span><time>%s</time> <span class="tl-ws">%s</span> %s -&gt; %s</li>\n' \
      "$to_class" \
      "$(_fleet_dash_ts_text "$ts")" \
      "$(_fleet_html_escape "$ws")" \
      "$(_fleet_html_escape "$from")" \
      "$(_fleet_html_escape "$to")"
  done
  printf '</ul>\n'
}

# _fleet_dash_boot_theme: pre-paint theme application so a stored choice
# never flashes the wrong mode. Absent storage means dark (the default).
_fleet_dash_boot_theme() {
  cat <<'BOOT'
<script>
/* Pre-paint theme: stored choice wins, absent storage is dark. */
(function () {
  var t = "dark";
  try { t = localStorage.getItem("fleet-dash-theme") || "dark"; } catch (e) {}
  document.documentElement.setAttribute("data-theme", (t === "light") ? "light" : "dark");
})();
</script>
BOOT
}

# _fleet_dash_style: inline CSS. Dark is the DEFAULT: the dark token set sits
# on :root, the light set applies under a light OS when no theme is forced,
# and explicit data-theme values override both. The four color blocks repeat
# the same values on purpose (plain CSS, no build step): keep each mode's
# sets in sync when touching them. Meter segment hexes passed the dataviz
# palette validator in both modes. System font stack, no external faces, no
# em dashes in comments (this text ships inside the page).
_fleet_dash_style() {
  cat <<'STYLE'
<style>
:root {
  color-scheme: dark;
  --bg: #14161a; --surface: #1d2026; --surface-2: #262a31;
  --text: #e8eaed; --dim: #9aa3af; --line: #2c333e;
  --accent: #7d9ef7; --accent-soft: #24304d;
  --ok: #4ec06a; --warn: #d9a52a; --radius: 10px;
  --st-pending: #9aa3af;  --st-pending-soft: #262a31;
  --st-started: #7d9ef7;  --st-started-soft: #24304d;
  --st-working: #56c8d8;  --st-working-soft: #17323a;
  --st-blocked: #d9a52a;  --st-blocked-soft: #3a3016;
  --st-landed: #4ec06a;   --st-landed-soft: #1d3527;
  --st-done: #37b26c;     --st-done-soft: #16341f;
  --st-dead: #ef6b61;     --st-dead-soft: #3c211f;
  --st-unknown: #9aa3af;  --st-unknown-soft: #262a31;
  --badge-stale-bg: #3a3016; --badge-stale-ink: #d9a52a;
  --badge-dead-bg: #3c211f;  --badge-dead-ink: #ef6b61;
  --seg-queued: #ad8138;  --seg-queued-ink: #14161a;
  --seg-active: #4a86dd;  --seg-active-ink: #14161a;
  --seg-blocked: #8a5f0c; --seg-blocked-ink: #ffffff;
  --seg-landed: #27b05c;  --seg-landed-ink: #14161a;
  --seg-dead: #c72f63;    --seg-dead-ink: #ffffff;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    color-scheme: light;
    --bg: #f6f7f9; --surface: #ffffff; --surface-2: #eef0f3;
    --text: #1a1d21; --dim: #5c6470; --line: #d9dde3;
    --accent: #2456d6; --accent-soft: #e3eafc;
    --ok: #1a7f37; --warn: #9a6700;
    --st-pending: #57606a;  --st-pending-soft: #eef0f3;
    --st-started: #2456d6;  --st-started-soft: #e3eafc;
    --st-working: #0b7285;  --st-working-soft: #d6f0f5;
    --st-blocked: #9a6700;  --st-blocked-soft: #fff0c2;
    --st-landed: #1a7f37;   --st-landed-soft: #ddf3e4;
    --st-done: #14682c;     --st-done-soft: #d0eedd;
    --st-dead: #b3261e;     --st-dead-soft: #fde7e5;
    --st-unknown: #57606a;  --st-unknown-soft: #eef0f3;
    --badge-stale-bg: #fff0c2; --badge-stale-ink: #9a6700;
    --badge-dead-bg: #fde7e5;  --badge-dead-ink: #b3261e;
    --seg-queued: #8b75dd;  --seg-queued-ink: #1a1d21;
    --seg-active: #2456d6;  --seg-active-ink: #ffffff;
    --seg-blocked: #8a6208; --seg-blocked-ink: #ffffff;
    --seg-landed: #0f9a43;  --seg-landed-ink: #1a1d21;
    --seg-dead: #a02119;    --seg-dead-ink: #ffffff;
  }
}
/* Explicit light choice: also wins under an OS that prefers dark. */
:root[data-theme="light"] {
  color-scheme: light;
  --bg: #f6f7f9; --surface: #ffffff; --surface-2: #eef0f3;
  --text: #1a1d21; --dim: #5c6470; --line: #d9dde3;
  --accent: #2456d6; --accent-soft: #e3eafc;
  --ok: #1a7f37; --warn: #9a6700;
  --st-pending: #57606a;  --st-pending-soft: #eef0f3;
  --st-started: #2456d6;  --st-started-soft: #e3eafc;
  --st-working: #0b7285;  --st-working-soft: #d6f0f5;
  --st-blocked: #9a6700;  --st-blocked-soft: #fff0c2;
  --st-landed: #1a7f37;   --st-landed-soft: #ddf3e4;
  --st-done: #14682c;     --st-done-soft: #d0eedd;
  --st-dead: #b3261e;     --st-dead-soft: #fde7e5;
  --st-unknown: #57606a;  --st-unknown-soft: #eef0f3;
  --badge-stale-bg: #fff0c2; --badge-stale-ink: #9a6700;
  --badge-dead-bg: #fde7e5;  --badge-dead-ink: #b3261e;
  --seg-queued: #8b75dd;  --seg-queued-ink: #1a1d21;
  --seg-active: #2456d6;  --seg-active-ink: #ffffff;
  --seg-blocked: #8a6208; --seg-blocked-ink: #ffffff;
  --seg-landed: #0f9a43;  --seg-landed-ink: #1a1d21;
  --seg-dead: #a02119;    --seg-dead-ink: #ffffff;
}
/* Explicit dark choice: re-asserts dark under a light OS. */
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #14161a; --surface: #1d2026; --surface-2: #262a31;
  --text: #e8eaed; --dim: #9aa3af; --line: #2c333e;
  --accent: #7d9ef7; --accent-soft: #24304d;
  --ok: #4ec06a; --warn: #d9a52a;
  --st-pending: #9aa3af;  --st-pending-soft: #262a31;
  --st-started: #7d9ef7;  --st-started-soft: #24304d;
  --st-working: #56c8d8;  --st-working-soft: #17323a;
  --st-blocked: #d9a52a;  --st-blocked-soft: #3a3016;
  --st-landed: #4ec06a;   --st-landed-soft: #1d3527;
  --st-done: #37b26c;     --st-done-soft: #16341f;
  --st-dead: #ef6b61;     --st-dead-soft: #3c211f;
  --st-unknown: #9aa3af;  --st-unknown-soft: #262a31;
  --badge-stale-bg: #3a3016; --badge-stale-ink: #d9a52a;
  --badge-dead-bg: #3c211f;  --badge-dead-ink: #ef6b61;
  --seg-queued: #ad8138;  --seg-queued-ink: #14161a;
  --seg-active: #4a86dd;  --seg-active-ink: #14161a;
  --seg-blocked: #8a5f0c; --seg-blocked-ink: #ffffff;
  --seg-landed: #27b05c;  --seg-landed-ink: #14161a;
  --seg-dead: #c72f63;    --seg-dead-ink: #ffffff;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 16px; background: var(--bg); color: var(--text);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px; line-height: 1.45;
}
/* Sticky header, full-bleed over the body padding. */
header.top {
  position: sticky; top: 0; z-index: 10; background: var(--bg);
  border-bottom: 1px solid var(--line);
  margin: -16px -16px 0; padding: 12px 16px 12px;
}
.head-card { max-width: 1100px; margin: 0 auto; }
.head-row {
  display: flex; flex-wrap: wrap; gap: 8px 16px;
  align-items: baseline; justify-content: space-between;
}
h1 { margin: 0; font-size: 18px; }
h1 .slug { color: var(--dim); font-weight: 600; }
h2 { font-size: 14px; margin: 0 0 8px; color: var(--dim); }
.head-actions { display: flex; align-items: center; gap: 10px; }
.goal {
  margin: 4px 0 0; color: var(--dim); font-size: 12px;
  max-width: 90ch; overflow-wrap: anywhere;
}
.goal[hidden] { display: none; }
.pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.pill {
  display: inline-flex; align-items: center; gap: 5px; padding: 1px 9px;
  border-radius: 999px; font-size: 12px;
  background: var(--surface); border: 1px solid var(--line); color: var(--dim);
}
/* Status chips: soft background + strong foreground, dot mirrors the fg.
   Color is never the only signal, the label always sits beside the dot. */
.pill.st-pending   { background: var(--st-pending-soft);   border-color: transparent; color: var(--st-pending);   font-weight: 600; }
.pill.st-started   { background: var(--st-started-soft);   border-color: transparent; color: var(--st-started);   font-weight: 600; }
.pill.st-working   { background: var(--st-working-soft);   border-color: transparent; color: var(--st-working);   font-weight: 600; }
.pill.st-blocked   { background: var(--st-blocked-soft);   border-color: transparent; color: var(--st-blocked);   font-weight: 600; }
.pill.st-landed    { background: var(--st-landed-soft);    border-color: transparent; color: var(--st-landed);    font-weight: 600; }
.pill.st-done      { background: var(--st-done-soft);      border-color: transparent; color: var(--st-done);      font-weight: 600; }
.pill.st-dead      { background: var(--st-dead-soft);      border-color: transparent; color: var(--st-dead);      font-weight: 600; }
.pill.st-unknown   { background: var(--st-unknown-soft);   border-color: transparent; color: var(--st-unknown);   font-weight: 600; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex: none; }
.pill .dot { background: currentColor; }
.dot.st-pending { background: var(--st-pending); }
.dot.st-started { background: var(--st-started); }
.dot.st-working { background: var(--st-working); }
.dot.st-blocked { background: var(--st-blocked); }
.dot.st-landed  { background: var(--st-landed); }
.dot.st-done    { background: var(--st-done); }
.dot.st-dead    { background: var(--st-dead); }
.dot.st-unknown { background: var(--st-unknown); }
/* Live dot: green while polls succeed, amber while they fail. */
.live-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.live-dot[data-state="ok"] { background: var(--ok); animation: live-pulse 2.4s ease-out infinite; }
.live-dot[data-state="err"] { background: var(--warn); animation: none; }
@keyframes live-pulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok) 45%, transparent); }
  100% { box-shadow: 0 0 0 7px transparent; }
}
@media (prefers-reduced-motion: reduce) { .live-dot[data-state="ok"] { animation: none; } }
.chipbtn {
  font: inherit; font-size: 12px; border: 1px solid var(--line);
  background: var(--surface); color: var(--dim); border-radius: 999px;
  padding: 2px 10px; cursor: pointer;
}
.chipbtn:hover { background: var(--surface-2); color: var(--text); }
.filters { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
.filterchip {
  font: inherit; font-size: 12px; display: inline-flex; align-items: center;
  gap: 6px; border: 1px solid var(--line); background: var(--surface);
  color: var(--dim); border-radius: 999px; padding: 2px 10px; cursor: pointer;
}
.filterchip .dot { width: 7px; height: 7px; }
.filterchip.on {
  background: var(--accent-soft); color: var(--accent);
  border-color: var(--accent); font-weight: 600;
}
.sortsel {
  font: inherit; font-size: 12px; background: var(--surface); color: var(--text);
  border: 1px solid var(--line); border-radius: 8px; padding: 2px 6px;
  margin-left: auto;
}
/* Stat tiles: one per closed-vocab status, zeros dimmed. */
.tiles { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.tile {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px;
  background: var(--surface); border: 1px solid var(--line); border-radius: 8px;
  padding: 4px 10px; color: var(--text);
}
.tile .tile-n { font-weight: 700; font-variant-numeric: tabular-nums; }
.tile.zero { color: var(--dim); }
.tile.zero .tile-n { font-weight: 400; }
/* Meter: five grouped segments with 2px gaps and in-segment count labels. */
.meter {
  display: flex; gap: 2px; height: 22px; margin-top: 8px;
  background: var(--surface-2); border-radius: 6px; overflow: hidden;
}
.seg {
  min-width: 34px; display: flex; align-items: center; justify-content: center;
  gap: 4px; font-size: 11px; font-weight: 600; overflow: hidden; white-space: nowrap;
}
.seg.zero { opacity: 0.45; }
.seg-queued  { background: var(--seg-queued);  color: var(--seg-queued-ink); }
.seg-active  { background: var(--seg-active);  color: var(--seg-active-ink); }
.seg-blocked { background: var(--seg-blocked); color: var(--seg-blocked-ink); }
.seg-landed  { background: var(--seg-landed);  color: var(--seg-landed-ink); }
.seg-dead    { background: var(--seg-dead);    color: var(--seg-dead-ink); }
.grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px; max-width: 1100px; margin: 14px auto 0;
}
.card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 12px 14px;
}
.card .head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.card p { margin: 8px 0 0; }
.task { font-weight: 600; color: var(--text); }
.card .meta {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 8px; color: var(--dim); font-size: 12px;
}
.ws-name { color: var(--dim); font-weight: 600; }
.chip {
  display: inline-block; background: var(--surface-2); border: 1px solid var(--line);
  color: var(--dim); border-radius: 999px; padding: 0 8px; font-size: 11px;
}
.chip.engine {
  background: var(--accent-soft); color: var(--accent);
  border-color: transparent; font-weight: 600;
}
.chip.claim { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.hb-age { font-variant-numeric: tabular-nums; }
code.sha {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  background: var(--surface-2); border: 1px solid var(--line);
  border-radius: 5px; padding: 0 5px;
}
.badge {
  display: inline-block; padding: 0 7px; border-radius: 4px; font-size: 11px;
  font-weight: 700; letter-spacing: 0.04em;
}
.badge.stale { background: var(--badge-stale-bg); color: var(--badge-stale-ink); }
.badge.dead  { background: var(--badge-dead-bg);  color: var(--badge-dead-ink); }
/* Now-editing section: the worker's published file list. */
.editing { margin-top: 10px; }
.editing-h {
  display: block; color: var(--dim); font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
}
.editing ul.files { list-style: none; margin: 4px 0 0; padding: 0; }
.editing ul.files li {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  padding: 1px 0; overflow-wrap: anywhere;
}
.editing li.files-more { color: var(--dim); }
.claims { list-style: none; display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0 0; padding: 0; }
.notes { font-size: 12px; color: var(--dim); }
.timeline { margin: 18px auto 0; max-width: 1100px; }
.timeline ul { list-style: none; margin: 0; padding: 0; }
.tl-item {
  display: flex; align-items: baseline; gap: 7px; padding: 3px 0;
  border-bottom: 1px dotted var(--line); font-size: 13px;
}
.tl-item .dot { width: 7px; height: 7px; align-self: center; }
.tl-item time, .tl-ws { color: var(--dim); }
.timeline-empty { color: var(--dim); font-size: 13px; }
.empty-state { color: var(--dim); text-align: center; padding: 28px 12px; }
.empty-state p { margin: 4px 0; }
footer { margin: 18px auto 0; max-width: 1100px; color: var(--dim); font-size: 12px; }
@media (max-width: 480px) {
  body { padding: 10px; }
  header.top { margin: -10px -10px 0; padding: 10px; }
  .seg-label { display: none; }
}
</style>
STYLE
}

# _fleet_dash_script: inline JS. Live layer: every data-poll seconds it
# fetches roster.tsv and dashboard-events-tail.jsonl (same origin) and
# redraws tiles, meter, cards and timeline in place, preserving the selected
# filter and sort; goal.txt and per-card files/<ws>.txt refresh too. The 1s
# heartbeat ticker is kept. Every interpolated string goes through esc();
# roster cells are hostile input. A failed fetch flips the live dot amber
# and retries on the next tick; the last good page is never cleared. The
# static markup bash renders is the no-JS fallback.
_fleet_dash_script() {
  cat <<'SCRIPT'
<script>
(function () {
  "use strict";
  /* Closed status vocab, pinned to the bash whitelist in _fleet_dash_card. */
  var VOCAB = ["pending", "started", "working", "blocked", "landed", "done", "dead"];

  /* Shared escape helper. EVERY interpolated string goes through this. */
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function stClass(st) {
    return VOCAB.indexOf(st) >= 0 ? "st-" + st : "st-unknown";
  }

  function stRank(st) {
    var i = VOCAB.indexOf(st);
    return i < 0 ? VOCAB.length : i;
  }

  function fmtAge(s) {
    if (s < 60) return s + "s";
    if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) {
      var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return h + "h " + (m < 10 ? "0" + m : m) + "m";
    }
    var d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600);
    return d + "d " + (hh < 10 ? "0" + hh : hh) + "h";
  }

  /* Parse TSV by header row names (mirrors _fleet_tsv_split: split on tab,
     map by header, empty cells preserved). */
  function parseTsv(text) {
    var lines = text.split("\n").filter(function (l) { return l.length > 0; });
    if (lines.length < 1) return [];
    var head = lines[0].split("\t");
    return lines.slice(1).map(function (line) {
      var cells = line.split("\t"), row = {};
      head.forEach(function (h, i) {
        row[h] = (cells[i] === undefined) ? "" : cells[i];
      });
      return row;
    });
  }

  /* Module state: the selected filter and sort survive every re-render. */
  var filter = "all";
  var sortMode = "status";
  var lastRosterText = null;

  var els = {};
  function initEls() {
    els.cards = document.getElementById("cards");
    els.tiles = document.getElementById("tiles");
    els.meter = document.getElementById("meter");
    els.tl = document.getElementById("tl");
    els.live = document.getElementById("live-dot");
    els.goal = document.getElementById("goal");
    els.updated = document.getElementById("updated-pill");
    els.sort = document.getElementById("sort");
  }

  function setLive(state) {
    if (!els.live) return;
    els.live.className = "live-dot " + state;
    els.live.setAttribute("data-state", state);
    els.live.setAttribute("title",
      state === "ok" ? "live: fetching roster" : "fetch failed, retrying");
  }

  function cachebust() { return String(Date.now()); }

  function intOr(v) {
    return /^[0-9]+$/.test(v) ? parseInt(v, 10) : 0;
  }

  function cardHtml(row, now, staleMin) {
    var st = String(row.status || "");
    var sc = stClass(st);
    var hb = intOr(row.heartbeat || "");
    var eng = String(row.engine || "") ||
      document.body.getAttribute("data-engine-default") || "";
    var stale = 0;
    if ((st === "started" || st === "working") && hb > 0 &&
        Math.floor((now - hb) / 60) > staleMin) {
      stale = 1;
    }
    var h = '<article class="card" data-ws="' + esc(row.ws_id || "") +
      '" data-status="' + esc(st) + '">';
    h += '<div class="head"><span class="pill ' + sc +
      '"><span class="dot"></span>' + esc(st) + '</span>';
    if (stale) h += '<span class="badge stale">&#9888; STALE</span>';
    if (st === "dead") h += '<span class="badge dead">&#10005; DEAD</span>';
    h += '<span class="ws-name">' + esc(row.name || "") + '</span></div>';
    if (row.task) h += '<p class="task">' + esc(row.task) + '</p>';
    h += '<div class="meta"><span class="chip engine">' + esc(eng) + '</span>';
    if (hb > 0) {
      var age = now - hb;
      if (age < 0) age = 0;
      h += '<span class="hb-age" data-epoch="' + hb + '">' + esc(fmtAge(age)) + '</span>';
    } else {
      h += '<span class="hb-age">never</span>';
    }
    if (row.landed_sha) h += '<code class="sha">' + esc(row.landed_sha) + '</code>';
    h += '</div>';
    if (row.claims) {
      h += '<ul class="claims">';
      String(row.claims).split(/\s+/).forEach(function (c) {
        if (c) h += '<li><span class="chip claim">' + esc(c) + '</span></li>';
      });
      h += '</ul>';
    }
    if (row.notes) h += '<p class="notes">' + esc(row.notes) + '</p>';
    return h + '</article>';
  }

  function sortRows(rows) {
    var copy = rows.slice();
    if (sortMode === "hb") {
      copy.sort(function (x, y) {
        var xh = intOr(x.heartbeat || ""), yh = intOr(y.heartbeat || "");
        if ((xh > 0) !== (yh > 0)) return (xh > 0) ? -1 : 1;
        return yh - xh;  /* stalest heartbeat first */
      });
    } else {
      copy.sort(function (x, y) {
        return stRank(String(x.status || "")) - stRank(String(y.status || ""));
      });
    }
    return copy;
  }

  function tilesHtml(counts) {
    return VOCAB.map(function (st) {
      var n = counts[st] || 0;
      return '<span class="tile' + (n === 0 ? ' zero' : '') +
        '" data-st="' + st + '"><span class="dot ' + stClass(st) +
        '"></span><span class="tile-label">' + st +
        '</span><span class="tile-n">' + n + '</span></span>';
    }).join("");
  }

  function meterHtml(counts) {
    var segs = [
      ["queued", counts.pending || 0],
      ["active", (counts.started || 0) + (counts.working || 0)],
      ["blocked", counts.blocked || 0],
      ["landed", (counts.landed || 0) + (counts.done || 0)],
      ["dead", counts.dead || 0]
    ];
    return segs.map(function (seg) {
      if (seg[1] === 0) return "";
      return '<span class="seg seg-' + seg[0] +
        '" style="flex-grow:' + seg[1] + '"><span class="seg-n">' + seg[1] +
        '</span><span class="seg-label">' + seg[0] + '</span></span>';
    }).join("");
  }

  function renderRoster(text) {
    lastRosterText = text;
    var now = Math.floor(Date.now() / 1000);
    var staleMin = intOr(document.body.getAttribute("data-stale-min") || "0");
    var rows = parseTsv(text);
    var counts = {};
    rows.forEach(function (r) {
      var st = String(r.status || "");
      counts[st] = (counts[st] || 0) + 1;
    });
    var tiles = tilesHtml(counts);
    var meter = meterHtml(counts);
    var visible = sortRows(rows).filter(function (r) {
      return filter === "all" || String(r.status || "") === filter;
    });
    var cards;
    if (visible.length) {
      cards = visible.map(function (r) { return cardHtml(r, now, staleMin); }).join("\n");
    } else if (rows.length) {
      cards = '<div class="card empty-state"><p>No rows match this filter</p></div>';
    } else {
      cards = '<div class="card empty-state"><p>No workstreams yet</p>' +
        '<p>Add one with: fleet add WSxx "task"</p></div>';
    }
    /* Strings are built first, then assigned: a throw above never leaves a
       half-cleared page. */
    if (els.tiles) els.tiles.innerHTML = tiles;
    if (els.meter) els.meter.innerHTML = meter;
    if (els.cards) els.cards.innerHTML = cards;
    if (els.updated) {
      els.updated.textContent = "updated " +
        new Date().toISOString().replace("T", " ").slice(0, 19) + "Z";
    }
    if (els.cards) {
      Array.prototype.forEach.call(
        els.cards.querySelectorAll('.card[data-ws]'),
        loadEditing
      );
    }
  }

  function renderTimeline(text) {
    if (!els.tl) return;
    var items = [];
    text.split("\n").forEach(function (line) {
      if (line.trim().length === 0) return;
      try { items.push(JSON.parse(line)); } catch (e) { /* skip torn line */ }
    });
    items.reverse();  /* newest first */
    if (!items.length) {
      els.tl.innerHTML = '<p class="timeline-empty">No transitions recorded yet</p>';
      return;
    }
    els.tl.innerHTML = '<ul class="timeline">' + items.map(function (ev) {
      ev = ev || {};
      var ts = (typeof ev.ts === "number")
        ? new Date(ev.ts * 1000).toISOString().slice(11, 19) : "?";
      return '<li class="tl-item"><span class="dot ' +
        stClass(String(ev.to || "")) + '"></span><time>' + ts +
        '</time> <span class="tl-ws">' + esc(String(ev.ws || "")) +
        '</span> ' + esc(String(ev.from || "")) + ' -&gt; ' +
        esc(String(ev.to || "")) + '</li>';
    }).join("") + '</ul>';
  }

  /* Per-card "now editing" list: files/<ws>.txt, ws ids are user-typed so
     the path segment is encodeURIComponent'd. 404 clears the section. */
  function applyEditing(card, html) {
    var old = card.querySelector(".editing");
    if (old) old.remove();
    var meta = card.querySelector(".meta");
    if (meta) meta.insertAdjacentHTML("afterend", html);
    else card.insertAdjacentHTML("beforeend", html);
  }

  function clearEditing(card) {
    var old = card.querySelector(".editing");
    if (old) old.remove();
  }

  function loadEditing(card) {
    var ws = card.getAttribute("data-ws");
    if (!ws) return;
    fetch("files/" + encodeURIComponent(ws) + ".txt?ts=" + cachebust())
      .then(function (resp) {
        if (!resp.ok) { clearEditing(card); return null; }
        return resp.text();
      })
      .then(function (text) {
        if (text === null) return;
        var lines = text.split("\n").map(function (l) { return l.trim(); })
          .filter(function (l) { return l.length > 0; });
        if (!lines.length) { clearEditing(card); return; }
        var h = '<div class="editing"><span class="editing-h">now editing</span><ul class="files">';
        lines.slice(0, 8).forEach(function (p) {
          h += '<li>' + esc(p) + '</li>';
        });
        if (lines.length > 8) {
          h += '<li class="files-more">+' + (lines.length - 8) + ' more</li>';
        }
        h += '</ul></div>';
        applyEditing(card, h);
      })
      .catch(function () { clearEditing(card); });
  }

  function pollGoal(cb) {
    if (!els.goal) return;
    fetch("goal.txt?ts=" + cb)
      .then(function (resp) {
        if (!resp.ok) { els.goal.hidden = true; els.goal.textContent = ""; return null; }
        return resp.text();
      })
      .then(function (text) {
        if (text === null) return;
        var line = text.split("\n")[0].trim().slice(0, 200);
        if (!line) { els.goal.hidden = true; return; }
        els.goal.textContent = line;  /* textContent, never HTML parsing */
        els.goal.hidden = false;
      })
      .catch(function () { /* keep the last good blurb */ });
  }

  function poll() {
    var cb = cachebust();
    fetch("roster.tsv?ts=" + cb)
      .then(function (resp) {
        if (!resp.ok) throw new Error("roster http " + resp.status);
        return resp.text();
      })
      .then(function (text) {
        renderRoster(text);
        setLive("ok");
      })
      .catch(function () {
        /* Fetch failed: amber dot, retry on the next tick. The last good
           page stays on screen, it is never cleared on error. */
        setLive("err");
      });
    fetch("dashboard-events-tail.jsonl?ts=" + cb)
      .then(function (resp) {
        if (!resp.ok) throw new Error("events http " + resp.status);
        return resp.text();
      })
      .then(renderTimeline)
      .catch(function () { /* keep the last timeline */ });
    pollGoal(cb);
  }

  function rerenderLocal() {
    if (lastRosterText !== null) renderRoster(lastRosterText);
  }

  /* 1s heartbeat ticker (kept from the static page). */
  function tick() {
    var now = Math.floor(Date.now() / 1000);
    document.querySelectorAll(".hb-age[data-epoch]").forEach(function (el) {
      var d = now - parseInt(el.getAttribute("data-epoch"), 10);
      if (!isFinite(d) || d < 0) d = 0;
      el.textContent = fmtAge(d);
    });
  }

  function applyTheme(theme, btn) {
    document.documentElement.setAttribute("data-theme",
      theme === "light" ? "light" : "dark");
    if (btn) btn.textContent = "theme: " + (theme === "light" ? "light" : "dark");
  }

  function wireControls() {
    var filters = document.getElementById("filters");
    if (filters) {
      filters.addEventListener("click", function (e) {
        var btn = e.target.closest(".filterchip");
        if (!btn) return;
        filter = btn.getAttribute("data-filter") || "all";
        Array.prototype.forEach.call(
          filters.querySelectorAll(".filterchip"),
          function (b) { b.className = "filterchip" + (b === btn ? " on" : ""); }
        );
        rerenderLocal();
      });
    }
    if (els.sort) {
      els.sort.addEventListener("change", function () {
        sortMode = els.sort.value;
        rerenderLocal();
      });
    }
    var tbtn = document.getElementById("theme-toggle");
    if (tbtn) {
      var theme = "dark";
      try { theme = localStorage.getItem("fleet-dash-theme") || "dark"; } catch (err) {}
      applyTheme(theme, tbtn);
      tbtn.addEventListener("click", function () {
        theme = (theme === "light") ? "dark" : "light";
        applyTheme(theme, tbtn);
        try { localStorage.setItem("fleet-dash-theme", theme); } catch (err) {}
      });
    }
  }

  function start() {
    initEls();
    wireControls();
    tick();
    setInterval(tick, 1000);
    var pollS = intOr(document.body.getAttribute("data-poll") || "5");
    if (pollS < 1) pollS = 5;
    poll();
    setInterval(poll, pollS * 1000);
  }

  start();
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
