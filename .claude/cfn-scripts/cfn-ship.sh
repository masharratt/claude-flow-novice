#!/usr/bin/env bash
# cfn-ship.sh: push main, wait for CI on the pushed sha, ff-pull the servers.
#
# Usage: cfn-ship.sh [--no-hosts] [--dry-run]
#
# Exit codes: 0 done / nothing to push, 2 refused (not on main, staged changes,
# not a repo), 3 push failed, 4 a CI run failed or was cancelled (servers
# untouched), 5 CI timeout or no run appeared (servers untouched), 6 a server
# was refused or failed (all hosts are still tried).
#
# Env: CFN_SHIP_HOSTS (default "vps vps_personal"), CFN_SHIP_REMOTE_DIR
# (default ~/Projects/claude-flow-novice-src), CFN_SHIP_CI_TIMEOUT (900 s),
# CFN_SHIP_CI_APPEAR_TIMEOUT (120 s wait for the first run), CFN_SHIP_POLL (20 s).
# Servers are only touched when origin is the claude-flow-novice repo or
# CFN_SHIP_HOSTS is set explicitly. Servers are never reset, stashed or cleaned.
set -euo pipefail

POLL="${CFN_SHIP_POLL:-20}"
CI_TIMEOUT="${CFN_SHIP_CI_TIMEOUT:-900}"
APPEAR_TIMEOUT="${CFN_SHIP_CI_APPEAR_TIMEOUT:-120}"
REMOTE_DIR="${CFN_SHIP_REMOTE_DIR:-~/Projects/claude-flow-novice-src}"

no_hosts=0; dry=0
for a in "$@"; do
  case "$a" in
    --no-hosts) no_hosts=1 ;;
    --dry-run) dry=1 ;;
    *) echo "cfn-ship: unknown argument: $a" >&2; exit 2 ;;
  esac
done

die() { local rc=$1; shift; echo "cfn-ship: $*" >&2; exit "$rc"; }

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die 2 "not inside a git repo"
branch=$(git symbolic-ref --short -q HEAD || true)
[ "$branch" = "main" ] || die 2 "must be on branch main (on '${branch:-detached HEAD}')"
git diff --cached --quiet || die 2 "staged changes present; commit or unstage them first"

git fetch -q origin main 2>/dev/null || echo "cfn-ship: warning: could not fetch origin/main" >&2
commits=$(git log --oneline origin/main..HEAD)
if [ -z "$commits" ]; then echo "cfn-ship: nothing to push"; exit 0; fi
echo "Commits going out (origin/main..HEAD):"
printf '%s\n' "$commits"

# Decide whether servers are in play.
if [ -n "${CFN_SHIP_HOSTS:-}" ]; then
  hosts="$CFN_SHIP_HOSTS"
elif git remote get-url origin 2>/dev/null | grep -q 'claude-flow-novice'; then
  hosts="vps vps_personal"
else
  hosts=""
fi
[ "$no_hosts" = 1 ] && hosts=""

if [ "$dry" = 1 ]; then
  echo "dry run: would run: git push origin main"
  echo "dry run: would wait for CI runs on $(git rev-parse --short HEAD) (timeout ${CI_TIMEOUT}s)"
  echo "dry run: servers: ${hosts:-none} (dir $REMOTE_DIR)"
  exit 0
fi

# --- 2. push ---
sha=$(git rev-parse HEAD); short=$(git rev-parse --short HEAD)
push_out=$(git push origin main 2>&1) && push_rc=0 || push_rc=$?
if [ "$push_rc" != 0 ]; then
  printf '%s\n' "$push_out" | tail -n 15 >&2
  die 3 "git push failed"
fi

# --- 3. wait for CI ---
# check_runs: reads gh JSON on stdin; prints "<state>\t<count>" then one
# "name\turl" line per failing run. state: none | pending | failed | green
check_runs() {
  python3 -c '
import json, sys
sha = sys.argv[1]
try:
    runs = [r for r in json.load(sys.stdin) if r.get("headSha") == sha]
except Exception:
    runs = []
bad = [r for r in runs if r.get("status") == "completed" and r.get("conclusion") not in ("success", "skipped", "neutral")]
if not runs: state = "none"
elif bad: state = "failed"
elif any(r.get("status") != "completed" for r in runs): state = "pending"
else: state = "green"
print("%s\t%d" % (state, len(runs)))
for r in bad: print("%s\t%s" % (r.get("name"), r.get("url")))
' "$1"
}

start=$SECONDS; count=0; state=none
while :; do
  json=$(gh run list --branch main --json name,status,conclusion,headSha,url 2>/dev/null || echo '[]')
  res=$(printf '%s' "$json" | check_runs "$sha")
  IFS=$'\t' read -r state count <<<"$(head -n1 <<<"$res")"
  [ "$state" = "failed" ] && {
    echo "CI failed for $short:" >&2
    tail -n +2 <<<"$res" | while IFS=$'\t' read -r n u; do echo "  $n  $u" >&2; done
    die 4 "CI run failed or cancelled; servers not touched"
  }
  [ "$state" = "green" ] && break
  elapsed=$((SECONDS - start))
  if [ "$state" = "none" ] && [ "$elapsed" -ge "$APPEAR_TIMEOUT" ]; then
    die 5 "no CI run appeared for $short within ${APPEAR_TIMEOUT}s; servers not touched"
  fi
  [ "$elapsed" -ge "$CI_TIMEOUT" ] && die 5 "CI still $state for $short after ${CI_TIMEOUT}s; servers not touched"
  sleep "$POLL"
done

# --- 4. servers ---
# Remote script: refuse on tracked edits or commits not on origin/main, else ff-only.
read -r -d '' REMOTE_SCRIPT <<'RS' || true
d=$1
case "$d" in "~/"*) d="$HOME/${d#"~/"}" ;; esac
cd "$d" || { echo "REFUSED: no such directory $d"; exit 1; }
git fetch -q origin main || { echo "REFUSED: git fetch failed"; exit 1; }
dirty=$(git status --porcelain --untracked-files=no)
if [ -n "$dirty" ]; then echo "REFUSED: tracked uncommitted changes:"; echo "$dirty"; exit 1; fi
ahead=$(git log --oneline origin/main..HEAD)
if [ -n "$ahead" ]; then echo "REFUSED: local commits not on origin/main:"; echo "$ahead"; exit 1; fi
git pull -q --ff-only origin main || { echo "REFUSED: ff-only pull failed"; exit 1; }
echo "SHA $(git rev-parse --short HEAD)"
RS

host_summary=""; host_fail=0
for h in $hosts; do
  rc=0
  out=$(printf '%s\n' "$REMOTE_SCRIPT" | ssh -o BatchMode=yes -o ConnectTimeout=15 "$h" bash -s -- "$REMOTE_DIR" 2>&1) || rc=$?
  hsha=$(grep '^SHA ' <<<"$out" | tail -n1 | cut -d' ' -f2 || true)
  if [ "$rc" = 0 ] && [ -n "$hsha" ]; then
    host_summary="$host_summary $h=$hsha"
  else
    host_fail=1; host_summary="$host_summary $h=FAILED"
    echo "cfn-ship: host $h refused or failed (rc=$rc):" >&2
    printf '%s\n' "$out" | sed 's/^/  /' >&2
  fi
done

summary="pushed $short, CI green ($count runs)"
[ -n "$hosts" ] && summary="$summary, hosts:$host_summary"
echo "$summary"
[ "$host_fail" = 0 ] || exit 6
