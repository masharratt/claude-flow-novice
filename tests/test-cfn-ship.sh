#!/usr/bin/env bash
# tests/test-cfn-ship.sh
# cfn-ship.sh: push main, wait for CI on the pushed sha, ff-pull the servers.
#
# git is real but points at throwaway repos under a temp dir (a local bare
# repo stands in for origin, so nothing touches the network). `gh` and `ssh`
# are stubs on PATH: gh replays canned run lists, ssh runs the remote script
# locally inside a per-host clone. The stub ssh log proves "do NOT touch
# servers" cases.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
SHIP="$PROJECT_ROOT/.claude/cfn-scripts/cfn-ship.sh"

T=$(mktemp -d "${TMPDIR:-/tmp}/cfn-ship.XXXXXX") || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1
trap 'cfn_safe_rm_tmp "$T"' EXIT

BIN="$T/bin"; mkdir -p "$BIN"
cat > "$BIN/gh" <<'STUB'
#!/usr/bin/env bash
# replay $GH_DIR/out.N (N = call number, last one repeats); @SHA@ = HEAD of cwd
d=${GH_DIR:?}
n=$(( $(cat "$d/count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$d/count"
echo "gh $*" >> "$d/log"
f="$d/out.$n"; [ -f "$f" ] || f=$(ls "$d"/out.* | sort -t. -k2 -n | tail -1)
sha=$(git rev-parse HEAD)
sed "s/@SHA@/$sha/g" "$f"
STUB
cat > "$BIN/ssh" <<'STUB'
#!/usr/bin/env bash
# ssh [-o x]... HOST CMD...: log, then run CMD locally inside $SSH_ROOT/HOST
while [ "${1:-}" = "-o" ]; do shift 2; done
host=$1; shift
echo "ssh $host" >> "${SSH_LOG:?}"
cd "${SSH_ROOT:?}/$host" || exit 255
exec "$@"
STUB
chmod +x "$BIN/gh" "$BIN/ssh"

pass=0; fail=0
ok()  { pass=$((pass+1)); echo "PASS: $1"; }
bad() { fail=$((fail+1)); echo "FAIL: $1"; [ -z "${2:-}" ] || echo "      $2"; }
check() { # desc cond-exit-status
  if [ "$2" = 0 ]; then ok "$1"; else bad "$1" "${3:-}"; fi
}
has() { grep -qF -- "$2" <<<"$1"; }

GIT_ENV=(GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t)
g() { env "${GIT_ENV[@]}" git "$@"; }

N=0
# new_case [origin-dir-name]: fresh origin + work clone + 2 host clones, one new commit ahead
new_case() {
  N=$((N+1)); C="$T/c$N"; mkdir -p "$C/gh" "$C/hosts"
  ORIGIN="$C/${1:-claude-flow-novice}.git"
  git init -q --bare -b main "$ORIGIN"
  git clone -q "$ORIGIN" "$C/work" 2>/dev/null
  W="$C/work"
  ( cd "$W" && git checkout -q -b main 2>/dev/null; echo a > f; g add f; g commit -qm base; git push -q origin main )
  for h in vps vps_personal; do git clone -q "$ORIGIN" "$C/hosts/$h"; mv "$C/hosts/$h" "$C/hosts/$h.tmp"; mkdir "$C/hosts/$h"; mv "$C/hosts/$h.tmp" "$C/hosts/$h/repo"; done
  ( cd "$W" && echo b >> f; g commit -qam "second change" )
  : > "$C/ssh.log"
  green='[{"name":"ci","status":"completed","conclusion":"success","headSha":"@SHA@","url":"https://x/1"},{"name":"old","status":"completed","conclusion":"failure","headSha":"0000000","url":"https://x/old"}]'
  printf '%s\n' "$green" > "$C/gh/out.1"
  rm -f "$C/gh/count" "$C/gh/log"
}
# ship [args...]: run in $W; sets OUT, RC
ship() {
  RC=0
  OUT=$(cd "$W" && env PATH="$BIN:$PATH" GH_DIR="$C/gh" SSH_LOG="$C/ssh.log" SSH_ROOT="$C/hosts" \
        CFN_SHIP_POLL=1 CFN_SHIP_CI_TIMEOUT=4 CFN_SHIP_CI_APPEAR_TIMEOUT=2 CFN_SHIP_REMOTE_DIR=repo \
        "${EXTRA_ENV[@]}" bash "$SHIP" "$@" 2>&1) || RC=$?
}
EXTRA_ENV=(X=1)
origin_sha() { git -C "$ORIGIN" rev-parse --short HEAD; }
work_sha()   { git -C "$W" rev-parse --short HEAD; }
host_sha()   { git -C "$C/hosts/$1/repo" rev-parse --short HEAD; }

# 0. script exists
[ -f "$SHIP" ] && ok "cfn-ship.sh exists" || { bad "cfn-ship.sh exists" "$SHIP missing"; echo "Passed: $pass Failed: $fail"; exit 1; }

# 1. wrong branch
new_case; ( cd "$W" && git checkout -q -b feature ); ship
check "refuses off main: exit 2" "$([ $RC = 2 ]; echo $?)" "rc=$RC $OUT"
has "$OUT" "main" && ok "off-main message names main" || bad "off-main message names main" "$OUT"
[ "$(origin_sha)" != "$(work_sha)" ] && ok "off main: nothing pushed" || bad "off main: nothing pushed"

# 2. staged changes
new_case; ( cd "$W" && echo c >> f && git add f ); ship
check "refuses staged changes: exit 2" "$([ $RC = 2 ]; echo $?)" "rc=$RC $OUT"
has "$OUT" "staged" && ok "staged message" || bad "staged message" "$OUT"

# 3. not a git repo
new_case; RC=0
OUT=$(cd "$T" && env PATH="$BIN:$PATH" GIT_CEILING_DIRECTORIES="$T" bash "$SHIP" 2>&1) || RC=$?
check "refuses outside a git repo: exit 2" "$([ $RC = 2 ]; echo $?)" "rc=$RC $OUT"

# 4. nothing to push
new_case; ( cd "$W" && git reset -q --hard origin/main ); ship
check "nothing to push: exit 0" "$([ $RC = 0 ]; echo $?)" "rc=$RC $OUT"
has "$OUT" "nothing to push" && ok "nothing to push message" || bad "nothing to push message" "$OUT"
[ ! -s "$C/ssh.log" ] && ok "nothing to push: no ssh" || bad "nothing to push: no ssh"

# 5. happy path
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps vps_personal"); ship
want=$(work_sha)
check "happy path: exit 0" "$([ $RC = 0 ]; echo $?)" "rc=$RC $OUT"
[ "$(origin_sha)" = "$want" ] && ok "happy path: origin has the pushed sha" || bad "happy path: origin has the pushed sha"
has "$OUT" "second change" && ok "lists outgoing commit" || bad "lists outgoing commit" "$OUT"
[ "$(host_sha vps)" = "$want" ] && [ "$(host_sha vps_personal)" = "$want" ] && ok "both hosts fast-forwarded" || bad "both hosts fast-forwarded"
last=$(tail -n1 <<<"$OUT")
[ "$last" = "pushed $want, CI green (1 runs), hosts: vps=$want vps_personal=$want" ] && ok "summary line exact" || bad "summary line exact" "$last"
has "$(cat "$C/gh/log")" "--branch main" && ok "gh queried for branch main" || bad "gh queried for branch main"

# 6. CI failure: exit 4, names + urls, servers untouched
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps")
printf '%s\n' '[{"name":"lint","status":"completed","conclusion":"failure","headSha":"@SHA@","url":"https://x/lint"},{"name":"unit","status":"completed","conclusion":"success","headSha":"@SHA@","url":"https://x/unit"}]' > "$C/gh/out.1"
ship
check "CI failure: exit 4" "$([ $RC = 4 ]; echo $?)" "rc=$RC $OUT"
has "$OUT" "lint" && has "$OUT" "https://x/lint" && ok "failing run name and url listed" || bad "failing run name and url listed" "$OUT"
[ ! -s "$C/ssh.log" ] && ok "CI failure: servers untouched" || bad "CI failure: servers untouched"

# 6b. cancelled counts as failure
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps")
printf '%s\n' '[{"name":"build","status":"completed","conclusion":"cancelled","headSha":"@SHA@","url":"https://x/b"}]' > "$C/gh/out.1"
ship
check "cancelled run: exit 4" "$([ $RC = 4 ]; echo $?)" "rc=$RC $OUT"

# 7. pending then green (runs appear late)
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps")
echo '[]' > "$C/gh/out.1"
printf '%s\n' '[{"name":"ci","status":"in_progress","conclusion":"","headSha":"@SHA@","url":"https://x/1"}]' > "$C/gh/out.2"
printf '%s\n' '[{"name":"ci","status":"completed","conclusion":"success","headSha":"@SHA@","url":"https://x/1"}]' > "$C/gh/out.3"
ship
check "late-appearing run then green: exit 0" "$([ $RC = 0 ]; echo $?)" "rc=$RC $OUT"

# 8. timeout while pending
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps" CFN_SHIP_CI_TIMEOUT=2)
printf '%s\n' '[{"name":"ci","status":"in_progress","conclusion":"","headSha":"@SHA@","url":"https://x/1"}]' > "$C/gh/out.1"
ship
check "CI timeout: exit 5" "$([ $RC = 5 ]; echo $?)" "rc=$RC $OUT"
[ ! -s "$C/ssh.log" ] && ok "timeout: servers untouched" || bad "timeout: servers untouched"

# 8b. no run ever appears
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps"); echo '[]' > "$C/gh/out.1"; ship
check "no CI run appears: exit 5" "$([ $RC = 5 ]; echo $?)" "rc=$RC $OUT"

# 9. host with tracked edits refused, other host still tried, edits preserved
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps vps_personal")
echo dirty >> "$C/hosts/vps/repo/f"
ship; want=$(work_sha)
check "dirty host: exit 6" "$([ $RC = 6 ]; echo $?)" "rc=$RC $OUT"
[ "$(host_sha vps_personal)" = "$want" ] && ok "other host still updated" || bad "other host still updated"
grep -q dirty "$C/hosts/vps/repo/f" && ok "dirty edits preserved" || bad "dirty edits preserved"
[ "$(host_sha vps)" != "$want" ] && ok "dirty host not advanced" || bad "dirty host not advanced"
has "$OUT" "vps" && has "$OUT" "tracked" && ok "dirty host reported" || bad "dirty host reported" "$OUT"

# 9b. untracked files do not block
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps"); echo junk > "$C/hosts/vps/repo/untracked.txt"; ship
check "untracked file on host is fine: exit 0" "$([ $RC = 0 ]; echo $?)" "rc=$RC $OUT"

# 10. host with local commit not on origin refused
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps")
( cd "$C/hosts/vps/repo" && echo z > z && g add z && g commit -qm "host only commit" ); hostbefore=$(host_sha vps)
ship
check "host local commit: exit 6" "$([ $RC = 6 ]; echo $?)" "rc=$RC $OUT"
[ "$(host_sha vps)" = "$hostbefore" ] && ok "host local commit not reset" || bad "host local commit not reset"
has "$OUT" "host only commit" && ok "host local commit reported" || bad "host local commit reported" "$OUT"

# 11. --no-hosts
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps"); ship --no-hosts
check "--no-hosts: exit 0" "$([ $RC = 0 ]; echo $?)" "rc=$RC $OUT"
[ ! -s "$C/ssh.log" ] && ok "--no-hosts: no ssh" || bad "--no-hosts: no ssh"
[ "$(origin_sha)" = "$(work_sha)" ] && ok "--no-hosts still pushes" || bad "--no-hosts still pushes"

# 12. --dry-run
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps"); before=$(origin_sha); ship --dry-run
check "--dry-run: exit 0" "$([ $RC = 0 ]; echo $?)" "rc=$RC $OUT"
[ "$(origin_sha)" = "$before" ] && ok "--dry-run: nothing pushed" || bad "--dry-run: nothing pushed"
[ ! -s "$C/ssh.log" ] && [ ! -f "$C/gh/count" ] && ok "--dry-run: no ssh, no gh" || bad "--dry-run: no ssh, no gh"
has "$OUT" "second change" && has "$OUT" "dry" && ok "--dry-run prints plan" || bad "--dry-run prints plan" "$OUT"

# 13. other repo: servers skipped unless hosts set explicitly
new_case other-repo; EXTRA_ENV=(X=1); ship
check "non-CFN origin: exit 0" "$([ $RC = 0 ]; echo $?)" "rc=$RC $OUT"
[ ! -s "$C/ssh.log" ] && ok "non-CFN origin: servers skipped" || bad "non-CFN origin: servers skipped"
new_case other-repo; EXTRA_ENV=(CFN_SHIP_HOSTS="vps"); ship
[ "$(host_sha vps)" = "$(work_sha)" ] && ok "non-CFN origin + explicit hosts: pulled" || bad "non-CFN origin + explicit hosts: pulled" "$OUT"

# 14. push failure: exit 3, no ci/ssh
new_case; EXTRA_ENV=(CFN_SHIP_HOSTS="vps")
mkdir -p "$ORIGIN/hooks"; printf '#!/bin/sh\necho "REJECTED-BY-TEST-HOOK" >&2\nexit 1\n' > "$ORIGIN/hooks/pre-receive"; chmod +x "$ORIGIN/hooks/pre-receive"
ship
check "push failure: exit 3" "$([ $RC = 3 ]; echo $?)" "rc=$RC $OUT"
has "$OUT" "REJECTED-BY-TEST-HOOK" && ok "push failure shows git output" || bad "push failure shows git output" "$OUT"
[ ! -s "$C/ssh.log" ] && [ ! -f "$C/gh/count" ] && ok "push failure: no CI wait, no ssh" || bad "push failure: no CI wait, no ssh"

echo "Passed: $pass Failed: $fail"
[ "$fail" = 0 ]
