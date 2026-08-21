#!/usr/bin/env bash
# watch.sh - cfn-workbench re-render loop (F1: live transparency).
#
# Watches a set of data-source globs for a run slug and re-renders the
# workbench HTML page (via render.sh) whenever any of them change. Meant to
# run alongside a CFN Loop run so the browser meta-refresh (render.sh --live)
# shows fresh content without a manual re-render.
#
# Bash + coreutils only. No node.

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RENDER="$SCRIPT_DIR/render.sh"

SLUG=""
INTERVAL=10
ROOT=""
STOP=0
STATUS=0
FOREGROUND=0
PASSTHROUGH=()

usage() {
  cat <<EOF
Usage: watch.sh --slug <slug> [options]

Re-renders the cfn-workbench HTML page whenever its data sources change,
so a browser with --live meta-refresh shows live progress.

Required:
  --slug <slug>            Run slug (matches VERIFY_<slug>.md, manifests, etc.).

Optional:
  --interval <secs>        Tick interval in seconds. Positive integer. Default: 10.
  --root <dir>              Project root to resolve inputs from.
                            Default: $CLAUDE_PROJECT_DIR, else $PWD (same as render.sh).
  --stop                   Stop the running watcher for this slug, remove its
                            pidfile, exit 0. Exit 0 (with a message) when none
                            is running.
  --status                 Print "running (pid N)" and exit 0, or "not running"
                            and exit 1.
  --foreground             Run the watch loop in the current process instead of
                            daemonizing (used by tests).
  --out <path>              Passed through to render.sh.
  --no-screenshots          Passed through to render.sh.
  --max-screenshots <N>     Passed through to render.sh.
  -h, --help                Show this help and exit 0.

Behavior:
  Default (no --stop/--status) starts a daemonized loop (background + disown),
  writing its pid to /tmp/cfn-workbench-watch-<slug>.pid and its log to
  /tmp/cfn-workbench-watch-<slug>.log. Idempotent: if a live watcher is already
  running for the slug, prints "Watcher already running (pid N)" and exits 0.
  A stale pidfile (dead pid) is replaced with a fresh watcher.

  Each tick fingerprints the data-source globs (path, mtime, size) and hashes
  the listing. On the first tick, or when the hash changes, it invokes
  render.sh --slug <slug> --root <root> --live <interval> plus any passthrough
  args. Render failures are logged as WARN and never stop the loop.

  Env WORKBENCH_WATCH_MAX_TICKS=<N> makes the foreground loop exit 0 after N
  ticks (used by tests instead of running forever).
EOF
}

# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)
      [[ $# -lt 2 ]] && { echo "Error: --slug requires a value" >&2; usage >&2; exit 2; }
      SLUG="$2"; shift 2 ;;
    --interval)
      [[ $# -lt 2 ]] && { echo "Error: --interval requires a value" >&2; usage >&2; exit 2; }
      if ! [[ "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Error: --interval must be a positive integer (seconds)" >&2; usage >&2; exit 2
      fi
      INTERVAL="$2"; shift 2 ;;
    --root)
      [[ $# -lt 2 ]] && { echo "Error: --root requires a value" >&2; usage >&2; exit 2; }
      ROOT="$2"; shift 2 ;;
    --stop)
      STOP=1; shift ;;
    --status)
      STATUS=1; shift ;;
    --foreground)
      FOREGROUND=1; shift ;;
    --out)
      [[ $# -lt 2 ]] && { echo "Error: --out requires a value" >&2; usage >&2; exit 2; }
      PASSTHROUGH+=(--out "$2"); shift 2 ;;
    --no-screenshots)
      PASSTHROUGH+=(--no-screenshots); shift ;;
    --max-screenshots)
      [[ $# -lt 2 ]] && { echo "Error: --max-screenshots requires a value" >&2; usage >&2; exit 2; }
      PASSTHROUGH+=(--max-screenshots "$2"); shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    --*)
      echo "Error: unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      echo "Error: unexpected positional argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$SLUG" ]]; then
  echo "Error: --slug is required" >&2
  usage >&2
  exit 2
fi

if [[ -z "$ROOT" ]]; then
  # planning/, .cfn-cache/, tmp/ and tests/screenshots/ are PER-PROJECT data owned
  # by the project being watched, not CFN source. A BASH_SOURCE-derived root lands in
  # the shared CFN tree, so the old chain watched the CFN checkout no matter which
  # project invoked it. --root still overrides this default.
  ROOT="${CLAUDE_PROJECT_DIR:-$PWD}"
fi

PIDFILE="/tmp/cfn-workbench-watch-${SLUG}.pid"
LOGFILE="/tmp/cfn-workbench-watch-${SLUG}.log"

# is_running PID - true if pid is set and alive.
is_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

# current_pid - read pidfile, echo pid if alive, else empty (removes stale file).
current_pid() {
  local pid=""
  if [[ -f "$PIDFILE" ]]; then
    pid="$(cat "$PIDFILE" 2>/dev/null || true)"
    if ! is_running "$pid"; then
      rm -f "$PIDFILE"
      pid=""
    fi
  fi
  printf '%s' "$pid"
}

# ---------------------------------------------------------------------------
# --status
# ---------------------------------------------------------------------------
if [[ "$STATUS" -eq 1 ]]; then
  PID="$(current_pid)"
  if [[ -n "$PID" ]]; then
    echo "running (pid $PID)"
    exit 0
  else
    echo "not running"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# --stop
# ---------------------------------------------------------------------------
if [[ "$STOP" -eq 1 ]]; then
  PID="$(current_pid)"
  if [[ -n "$PID" ]]; then
    kill "$PID" 2>/dev/null || true
    # Give it a moment to exit, then confirm.
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      is_running "$PID" || break
      sleep 0.2
    done
    kill -9 "$PID" 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "Watcher stopped (pid $PID)"
  else
    echo "No watcher running for slug: $SLUG"
  fi
  exit 0
fi

# ---------------------------------------------------------------------------
# Fingerprint: stable listing (path mtime size) of contract globs, hashed.
# Glob expansion with no matches must not error under set -e; nullglob is
# enabled locally for the duration of the fingerprint.
# ---------------------------------------------------------------------------
fingerprint() {
  local files=()
  local g
  shopt -s nullglob
  for g in \
    "$ROOT/.cfn-cache/manifests/cfn-"*.json \
    "$ROOT/planning/${SLUG}/VERIFY_${SLUG}.md" \
    "$ROOT/planning/${SLUG}/VERIFY_RESULTS_${SLUG}.json" \
    "$ROOT/planning/${SLUG}/.VERIFY_${SLUG}.bless.json" \
    "$ROOT/planning/${SLUG}/run-plan-${SLUG}.json" \
    `# legacy flat layout: plans written before per-plan dirs existed` \
    "$ROOT/planning/VERIFY_${SLUG}.md" \
    "$ROOT/planning/VERIFY_RESULTS_${SLUG}.json" \
    "$ROOT/planning/.VERIFY_${SLUG}.bless.json" \
    "$ROOT/planning/run-plan-${SLUG}.json" \
    "$ROOT/tmp/lane-report-${SLUG}-"*.json \
    "/tmp/lane-report-${SLUG}-"*.json \
    "$ROOT/tmp/test-output-${SLUG}-"*.txt \
    "/tmp/test-output-${SLUG}-"*.txt \
    "/tmp/cfn-events-${SLUG}.jsonl" \
    "$ROOT/tmp/cfn-events-${SLUG}.jsonl" \
    "$ROOT/tests/screenshots/${SLUG}-iteration-"*.png \
    ; do
    files+=("$g")
  done
  shopt -u nullglob

  if [[ "${#files[@]}" -eq 0 ]]; then
    printf 'empty'
    return 0
  fi

  local f
  local listing
  listing="$(
    for f in "${files[@]}"; do
      if [[ -e "$f" ]]; then
        local mtime size
        mtime=$(stat -c '%Y' "$f" 2>/dev/null || echo 0)
        size=$(stat -c '%s' "$f" 2>/dev/null || echo 0)
        printf '%s %s %s\n' "$f" "$mtime" "$size"
      fi
    done | sort
  )"

  if command -v sha1sum >/dev/null 2>&1; then
    printf '%s' "$listing" | sha1sum | awk '{print $1}'
  else
    printf '%s' "$listing" | cksum | awk '{print $1}'
  fi
}

# ---------------------------------------------------------------------------
# Main watch loop. Called in foreground or in the backgrounded daemon subshell.
# ---------------------------------------------------------------------------
watch_loop() {
  local last_hash="" cur_hash tick=0 max_ticks="${WORKBENCH_WATCH_MAX_TICKS:-0}"

  while true; do
    tick=$((tick + 1))
    cur_hash="$(fingerprint)"

    if [[ "$cur_hash" != "$last_hash" ]]; then
      last_hash="$cur_hash"
      if ! "$RENDER" --slug "$SLUG" --root "$ROOT" --live "$INTERVAL" "${PASSTHROUGH[@]}" >>"$LOGFILE" 2>&1; then
        echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] WARN: render.sh failed (slug=$SLUG)" >>"$LOGFILE"
      fi
    fi

    if [[ "$max_ticks" -gt 0 && "$tick" -ge "$max_ticks" ]]; then
      break
    fi

    sleep "$INTERVAL"
  done
}

# ---------------------------------------------------------------------------
# --foreground
# ---------------------------------------------------------------------------
if [[ "$FOREGROUND" -eq 1 ]]; then
  watch_loop
  exit 0
fi

# ---------------------------------------------------------------------------
# Default: daemonize (idempotent).
# ---------------------------------------------------------------------------
EXISTING_PID="$(current_pid)"
if [[ -n "$EXISTING_PID" ]]; then
  echo "Watcher already running (pid $EXISTING_PID)"
  exit 0
fi

: > "$LOGFILE"
(
  watch_loop
) >>"$LOGFILE" 2>&1 &
NEWPID=$!
disown "$NEWPID" 2>/dev/null || true
echo "$NEWPID" > "$PIDFILE"

echo "Watcher started: pid $NEWPID interval ${INTERVAL}s"
exit 0
