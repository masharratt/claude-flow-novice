#!/usr/bin/env bash
# remote-worker.sh: the only channel a worker on a remote host has back to the
# fleet master. There is no fleet CLI and no messaging on the server, so every
# signal is a small JSON report file in the outbox that `fleet sync` pulls over
# ssh. Copied next to outbox.env + claims.txt by `fleet spawn --host`.
#
#   remote-worker.sh heartbeat [note]
#   remote-worker.sh status <state>
#   remote-worker.sh handoff <file>
#   remote-worker.sh request-claim <path>
#   remote-worker.sh commit -m <message> [-m <paragraph>...]
#
# commit is local only: it never pushes. The worker's Bash sandbox cannot
# reach the bare repo, and `fleet land` fetches fleet/<WS> from the server
# fleet clone over ssh instead (PLAN_fleet-host-sandbox step 3).
#
# Reports land as reports/<gen>-<seq>.json (one JSON object per file). The
# master drops any report whose gen is not the current generation and any seq
# it already applied, so seq must only ever go up within a generation.
#
# Portable on purpose: no jq, no GNU-only flags (the tests run on macOS, the
# script runs on a Linux server).
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)

die() { echo "remote-worker: $*" >&2; exit "${2:-1}"; }

[[ -f "$HERE/outbox.env" ]] || die "outbox.env not found next to $0" 66
# shellcheck disable=SC1091
source "$HERE/outbox.env"
: "${FLEET_WS:?outbox.env must set FLEET_WS}"
: "${FLEET_GEN:?outbox.env must set FLEET_GEN}"
: "${FLEET_BRANCH:?outbox.env must set FLEET_BRANCH}"
OUTBOX="${FLEET_OUTBOX:-$HERE}"
REPORTS="$OUTBOX/reports"

json_escape() {
  local s="$1"
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

# next_seq: highest of the stored counter and any report already on disk for
# this generation, plus one. Caller holds the lock.
next_seq() {
  local seq=0 f n
  [[ -f "$OUTBOX/.seq-$FLEET_GEN" ]] && seq=$(cat "$OUTBOX/.seq-$FLEET_GEN" 2>/dev/null)
  [[ "$seq" =~ ^[0-9]+$ ]] || seq=0
  for f in "$REPORTS/$FLEET_GEN"-*.json; do
    [[ -e "$f" ]] || continue
    n=${f##*-}; n=${n%.json}
    [[ "$n" =~ ^[0-9]+$ ]] && (( n > seq )) && seq=$n
  done
  echo $((seq + 1))
}

# write_report KIND [key value]...  extra string fields (note, status, path, sha, file).
# mkdir is the lock: atomic on every filesystem, no flock needed on macOS.
write_report() {
  local kind="$1"; shift
  mkdir -p "$REPORTS" || die "cannot create $REPORTS"
  local lock="$OUTBOX/.seq.lock" tries=0
  until mkdir "$lock" 2>/dev/null; do
    tries=$((tries + 1))
    (( tries > 400 )) && die "could not take $lock (stale lock?)"
    sleep 0.05
  done
  trap 'rmdir "$lock" 2>/dev/null' EXIT

  local seq ts body tmp
  seq=$(next_seq)
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  body=$(printf '{"ws":"%s","gen":"%s","seq":%s,"kind":"%s","ts_worker":"%s"' \
    "$(json_escape "$FLEET_WS")" "$(json_escape "$FLEET_GEN")" "$seq" "$kind" "$ts")
  while (( $# >= 2 )); do
    body+=$(printf ',"%s":"%s"' "$1" "$(json_escape "$2")")
    shift 2
  done
  body+='}'

  # tmp + mv: sync must never read a half-written report.
  tmp="$REPORTS/.$FLEET_GEN-$seq.json.tmp"
  printf '%s\n' "$body" > "$tmp" || die "cannot write $tmp"
  mv "$tmp" "$REPORTS/$FLEET_GEN-$seq.json" || die "cannot publish report"
  printf '%s\n' "$seq" > "$OUTBOX/.seq-$FLEET_GEN"

  rmdir "$lock" 2>/dev/null
  trap - EXIT
}

read_claims() {
  CLAIMS=()
  local f="$OUTBOX/claims.txt" line p
  [[ -f "$f" ]] || die "claims.txt not found at $f" 66
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=${line%%#*}
    set -f
    for p in $line; do CLAIMS+=("$p"); done
    set +f
  done < "$f"
  (( ${#CLAIMS[@]} > 0 )) || die "claims.txt lists no paths" 66
}

cmd_commit() {
  local msgs=() msg=""
  while (( $# > 0 )); do
    case "$1" in
      -m) [[ $# -ge 2 ]] || die "commit: -m needs a message" 64
          msgs+=("$2"); shift 2 ;;
      *) die "commit: unknown argument $1" 64 ;;
    esac
  done
  (( ${#msgs[@]} > 0 )) && msg="${msgs[0]}"
  [[ -n "$msg" ]] || die "commit: -m <message> required" 64
  # Run from anywhere (the outbox, say): the worktree is recorded in outbox.env.
  if [[ -n "${FLEET_WORKTREE:-}" && -d "$FLEET_WORKTREE" ]]; then
    cd "$FLEET_WORKTREE" || die "commit: cannot cd to $FLEET_WORKTREE" 66
  fi
  git rev-parse --git-dir >/dev/null 2>&1 || die "commit: run from inside the worktree" 66
  # land fetches refs/heads/$FLEET_BRANCH only, so a commit on any other
  # branch (or a detached HEAD) would never land: refuse it up front.
  local cur
  cur=$(git symbolic-ref -q --short HEAD 2>/dev/null)
  [[ "$cur" == "$FLEET_BRANCH" ]] \
    || die "commit: HEAD is on '${cur:-a detached HEAD}', not $FLEET_BRANCH; only $FLEET_BRANCH lands. Run: git checkout $FLEET_BRANCH" 66
  read_claims

  # Only claimed paths that actually changed are staged and committed. Anything
  # else the worker touched or pre-staged stays out of the commit.
  local changed=() p
  for p in "${CLAIMS[@]}"; do
    [[ -n "$(git status --porcelain -- "$p" 2>/dev/null)" ]] && changed+=("$p")
  done
  (( ${#changed[@]} > 0 )) || die "commit: nothing claimed has changed (claims: ${CLAIMS[*]})" 65

  git add -A -- "${changed[@]}" || die "commit: git add failed"
  local margs=() m
  for m in "${msgs[@]}"; do margs+=(-m "$m"); done
  git commit -q "${margs[@]}" -- "${changed[@]}" || die "commit: git commit failed"
  local sha
  sha=$(git rev-parse HEAD)
  write_report commit sha "$sha" note "$msg"
  echo "$sha"
}

sub="${1:-}"
[[ $# -gt 0 ]] && shift
case "$sub" in
  heartbeat)
    if [[ $# -gt 0 ]]; then write_report heartbeat note "$*"; else write_report heartbeat; fi ;;
  status)
    [[ -n "${1:-}" ]] || die "status: <state> required" 64
    write_report status status "$1" ;;
  handoff)
    [[ -n "${1:-}" ]] || die "handoff: <file> required" 64
    [[ -f "$1" ]] || die "handoff: $1 not found" 66
    mkdir -p "$OUTBOX/handoffs" || die "cannot create handoffs dir"
    cp "$1" "$OUTBOX/handoffs/$(basename "$1")" || die "handoff: copy failed"
    write_report handoff file "$(basename "$1")" ;;
  request-claim)
    [[ -n "${1:-}" ]] || die "request-claim: <path> required" 64
    write_report claim_request path "$1" ;;
  commit)
    cmd_commit "$@" ;;
  *)
    die "usage: remote-worker.sh heartbeat [note] | status <s> | handoff <file> | request-claim <path> | commit -m <msg> [-m <msg>...]" 64 ;;
esac
