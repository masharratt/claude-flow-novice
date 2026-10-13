#!/usr/bin/env bash
# tests/test-cfn-fleet-land-remote.sh
# `fleet land` for host rows (plan Phase 6, planning/PLAN_fleet-remote-host-workers.md).
# A local bare repo stands in for the server's bare repo (git fetch works on a
# path); a stub ssh runs the remote command locally with HOME pointed at a temp
# "server home". The real ssh and the real server are never touched.
# PLAN_fleet-host-sandbox step 3: workers no longer push, so land fetches the
# lane branch from the server fleet clone over ssh (git runs the stub ssh with
# git-upload-pack) and the base from the bare repo through the Mac git remote.
set -uo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
LAND_LIB="$PROJECT_ROOT/.claude/skills/cfn-fleet/lib/cmd-land.sh"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (got '$2', want '$3')"; fi; }
contains() { case "$2" in *"$3"*) ok "$1" ;; *) no "$1 (missing '$3' in: $2)" ;; esac; }

TMP_DIR=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/fleet-land-remote.XXXXXX")" && pwd -P)
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/bin"
export STUB_LOG="$TMP_DIR/ssh.log"
export STUB_HOME="$TMP_DIR/srv"

# Stub ssh: log the call, honour STUB_SSH_FAIL (rc 255), else run the remote
# command string locally under the fake server HOME.
cat >"$TMP_DIR/bin/ssh" <<'EOF'
#!/usr/bin/env bash
echo "ssh $*" >>"$STUB_LOG"
[ -n "${STUB_SSH_FAIL:-}" ] && exit 255
while [ $# -gt 0 ]; do
  case "$1" in -o) shift 2 ;; *) break ;; esac
done
shift # host alias
cd "$STUB_HOME" || exit 98 # real ssh starts in the login home
HOME="$STUB_HOME" exec bash -c "$1"
EOF
chmod +x "$TMP_DIR/bin/ssh"
export PATH="$TMP_DIR/bin:$PATH"

export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.com
export GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.com
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null

# build_fixture NAME CLAIMS EXTRA_FILE(yes|no)
# Sets REPO, RUN_DIR, SRV_WT, BARE. Mac repo is named "proj"; the "vps" git
# remote points at the bare repo; worker branch fleet/WS01 is pushed to it.
build_fixture() {
  local name="$1" claims="$2" extra="$3" base="$TMP_DIR/$1"
  mkdir -p "$base/srv/git" "$base/srv/fleet-repos" "$base/srv/fleet-runs"
  BARE="$base/srv/git/proj.git"
  git init -q --bare -b main "$BARE"
  REPO="$base/proj"
  git init -q -b main "$REPO"
  printf 'planning/fleet-*/\n' >"$REPO/.gitignore"
  printf 'base\n' >"$REPO/tracked.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm init
  git -C "$REPO" remote add vps "$BARE"
  git -C "$REPO" push -q vps main
  git -C "$REPO" push -q vps main:refs/heads/fleet-base/WS01
  git clone -q "$BARE" "$base/srv/fleet-repos/proj"
  SRV_WT="$base/srv/fleet-repos/proj-wt/ws01"
  git -C "$base/srv/fleet-repos/proj" worktree add -q -b fleet/WS01 "$SRV_WT" main
  printf 'new\n' >"$SRV_WT/a.md"
  [ "$extra" = yes ] && printf 'oops\n' >"$SRV_WT/other.txt"
  git -C "$SRV_WT" add -A && git -C "$SRV_WT" commit -qm "worker change"
  WORKER_SHA=$(git -C "$SRV_WT" rev-parse HEAD)
  CLONE="$base/srv/fleet-repos/proj"
  RUN_DIR="$REPO/planning/fleet-main"
  mkdir -p "$RUN_DIR/remote"
  printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\thost\n' >"$RUN_DIR/roster.tsv"
  printf 'WS01\tws01\ttask\tworking\t%s\t\t\t\t0\t\tclaude-haiku\tvps\n' "$claims" >>"$RUN_DIR/roster.tsv"
  : >"$RUN_DIR/.roster.lock"
  {
    printf 'FLEET_HOST=vps\nFLEET_GIT_REMOTE=vps\nFLEET_PROJECT=proj\nFLEET_RUN=fleet-main\n'
    printf 'FLEET_GEN=g1\nFLEET_REMOTE_WT=%q\nFLEET_OUTBOX=%q\n' "$SRV_WT" "$base/srv/fleet-runs/proj/fleet-main/WS01"
    printf 'FLEET_BRANCH=fleet/WS01\nFLEET_BASE_REF=fleet-base/WS01\nFLEET_SOCK=s\nFLEET_SESSION=w\nFLEET_SPAWNED_AT=1\n'
    printf 'FLEET_REMOTE_CLONE=%q\n' "$base/srv/fleet-repos/proj"
  } >"$RUN_DIR/remote/WS01.env"
  chmod 600 "$RUN_DIR/remote/WS01.env"
  printf 'g1 3\n' >"$RUN_DIR/remote/WS01.applied"
  export STUB_HOME="$base/srv"
  : >"$STUB_LOG"
}

# run_land ARGS... -> sets RC, OUT, ERR
run_land() {
  local o="$TMP_DIR/out.txt" e="$TMP_DIR/err.txt"
  RC=0
  (
    cd "$REPO" || exit 99
    export FLEET_RUN_DIR="$RUN_DIR"
    # shellcheck disable=SC1090
    source "$LAND_LIB"
    main "$@"
  ) >"$o" 2>"$e" || RC=$?
  OUT=$(cat "$o"); ERR=$(cat "$e")
}

branch_exists() { git -C "$BARE" rev-parse --verify -q "refs/heads/$1" >/dev/null; }
clone_branch_exists() { git -C "$CLONE" rev-parse --verify -q "refs/heads/$1" >/dev/null; }
# rfield FIELD -> WS01's cell by header name (the header may migrate).
rfield() { awk -F'\t' -v f="$1" 'NR==1{for(i=1;i<=NF;i++) if($i==f) c=i; next} $1=="WS01"{if(c) print $c; exit}' "$RUN_DIR/roster.tsv"; }

echo "== test_land_remote_refuses_unclaimed_diff"
build_fixture unclaimed "a.md" yes
BEFORE=$(git -C "$REPO" rev-parse HEAD)
run_land WS01
check "unclaimed file in the worker diff exits 65" "$RC" "65"
contains "message names the unclaimed file" "$ERR" "other.txt"
case "$ERR" in *"a.md"*) no "claimed file must not be named as unclaimed: $ERR" ;; *) ok "claimed file not named" ;; esac
check "Mac HEAD unchanged on refusal" "$(git -C "$REPO" rev-parse HEAD)" "$BEFORE"
check "roster status unchanged on refusal" "$(awk -F'\t' '$1=="WS01"{print $4}' "$RUN_DIR/roster.tsv")" "working"
[ -f "$RUN_DIR/remote/WS01.env" ] && ok "env file kept on refusal" || no "env file removed on refusal"
[ -d "$SRV_WT" ] && ok "remote worktree kept on refusal" || no "remote worktree removed on refusal"
clone_branch_exists fleet/WS01 && ok "lane branch kept in the fleet clone on refusal" || no "lane branch deleted on refusal"

echo "== test_land_remote_fetch_merge_cleanup"
build_fixture happy "a.md" no
run_land WS01
check "claimed diff lands with exit 0" "$RC" "0"
contains "prints landed line" "$OUT" "landed WS01"
[ "$(git -C "$REPO" show HEAD:a.md 2>/dev/null)" = "new" ] && ok "worker commit merged into Mac main" || no "a.md not on Mac main (err: $ERR)"
check "roster status landed" "$(awk -F'\t' '$1=="WS01"{print $4}' "$RUN_DIR/roster.tsv")" "landed"
check "roster landed_sha is Mac HEAD" "$(awk -F'\t' '$1=="WS01"{print $6}' "$RUN_DIR/roster.tsv")" "$(git -C "$REPO" rev-parse --short HEAD)"
check "roster lane_sha is the worker's lane tip (full sha)" "$(rfield lane_sha)" "$WORKER_SHA"
contains "lane fetched from the fleet clone over ssh" "$(cat "$STUB_LOG")" "git-upload-pack '$CLONE'"
case "$ERR" in *warning*) no "cleanup warned: $ERR" ;; *) ok "cleanup ran without a warning" ;; esac
[ -d "$SRV_WT" ] && no "remote worktree still present" || ok "remote worktree removed"
branch_exists fleet/WS01 && no "bare fleet/WS01 exists (workers must not push)" || ok "bare never had fleet/WS01"
clone_branch_exists fleet/WS01 && no "clone fleet/WS01 still present" || ok "clone fleet/WS01 deleted"
branch_exists fleet-base/WS01 && no "bare fleet-base/WS01 still present" || ok "bare fleet-base/WS01 deleted"
[ -e "$RUN_DIR/remote/WS01.env" ] && no "env file still present" || ok "env file removed"
[ -e "$RUN_DIR/remote/WS01.applied" ] && no "applied file still present" || ok "applied file removed"
check "no scratch refs left on Mac" "$(git -C "$REPO" for-each-ref refs/fleet-remote | wc -l | tr -d ' ')" "0"

echo "== test_land_remote_old_env_derives_clone_path"
# remote/<WS>.env written before FLEET_REMOTE_CLONE existed: land falls back to
# ~/fleet-repos/<project> on the host (relative to the ssh login home).
build_fixture oldenv "a.md" no
grep -v '^FLEET_REMOTE_CLONE=' "$RUN_DIR/remote/WS01.env" >"$RUN_DIR/remote/env.tmp" && mv "$RUN_DIR/remote/env.tmp" "$RUN_DIR/remote/WS01.env"
run_land WS01
check "old env file still lands" "$RC" "0"
[ "$(git -C "$REPO" show HEAD:a.md 2>/dev/null)" = "new" ] && ok "lane merged via the derived clone path" || no "a.md not merged via derived path (err: $ERR)"
contains "derived path is home-relative" "$(cat "$STUB_LOG")" "git-upload-pack 'fleet-repos/proj'"

echo "== test_land_remote_missing_lane_branch_fails_70"
build_fixture nolane "a.md" no
git -C "$CLONE" worktree remove --force "$SRV_WT"
git -C "$CLONE" branch -q -D fleet/WS01
mkdir -p "$SRV_WT" && git -C "$SRV_WT" init -q
BEFORE=$(git -C "$REPO" rev-parse HEAD)
run_land WS01
check "missing lane branch exits 70" "$RC" "70"
check "Mac HEAD unchanged when the lane is missing" "$(git -C "$REPO" rev-parse HEAD)" "$BEFORE"
check "no lane_sha recorded on failure" "$(rfield lane_sha)" ""
check "no scratch refs left after a failed fetch" "$(git -C "$REPO" for-each-ref refs/fleet-remote | wc -l | tr -d ' ')" "0"

echo "== test_land_remote_refuses_dirty_remote_worktree"
build_fixture dirty "a.md" no
printf 'wip\n' >"$SRV_WT/a.md"
BEFORE=$(git -C "$REPO" rev-parse HEAD)
run_land WS01
check "dirty remote worktree exits 66" "$RC" "66"
check "Mac HEAD unchanged when remote dirty" "$(git -C "$REPO" rev-parse HEAD)" "$BEFORE"
[ -f "$RUN_DIR/remote/WS01.env" ] && ok "env file kept when remote dirty" || no "env file removed when remote dirty"

echo "== test_land_remote_unreachable_is_not_a_merge"
build_fixture down "a.md" no
BEFORE=$(git -C "$REPO" rev-parse HEAD)
STUB_SSH_FAIL=1 run_land WS01
[ "$RC" -ne 0 ] && ok "ssh failure fails the land (rc $RC)" || no "ssh failure landed anyway"
check "Mac HEAD unchanged when unreachable" "$(git -C "$REPO" rev-parse HEAD)" "$BEFORE"
check "roster status unchanged when unreachable" "$(awk -F'\t' '$1=="WS01"{print $4}' "$RUN_DIR/roster.tsv")" "working"

echo "== test_land_remote_missing_env_file"
build_fixture noenv "a.md" no
rm -f "$RUN_DIR/remote/WS01.env"
run_land WS01
check "host row without remote env exits 65" "$RC" "65"

# set_task TASK: rewrite the WS01 task cell in the fixture roster.
set_task() {
  awk -F'\t' -v OFS='\t' -v t="$1" 'NR>1 && $1=="WS01" { $3=t } { print }' "$RUN_DIR/roster.tsv" >"$RUN_DIR/r.tmp" \
    && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
}

LONG_TASK="Rebuild the intake form validation so every field reports errors inline and the summary banner stays in sync"

echo "== test_land_remote_no_ff_message_names_task_and_worker"
build_fixture msg "a.md" no
set_task "$LONG_TASK"
run_land WS01 --no-ff
check "no-ff host land exits 0" "$RC" "0"
check "merge commit is a merge (two parents)" "$(git -C "$REPO" rev-list --parents -n1 HEAD | wc -w | tr -d ' ')" "3"
SUBJ=$(git -C "$REPO" log -1 --format=%s)
BODY=$(git -C "$REPO" log -1 --format=%b)
contains "subject names the ws" "$SUBJ" "fleet: land WS01: Rebuild the intake form"
[ "${#SUBJ}" -le 85 ] && ok "subject is short (${#SUBJ} chars)" || no "subject too long (${#SUBJ}): $SUBJ"
case "$SUBJ" in *"banner stays in sync") no "subject carries the whole task: $SUBJ" ;; *) ok "subject truncates a long task" ;; esac
contains "body carries the full task" "$BODY" "$LONG_TASK"
contains "body names the worker" "$BODY" "ws01"

echo "== test_land_refuses_spawning_row"
build_fixture spawning "a.md" no
awk -F'\t' -v OFS='\t' 'NR>1 && $1=="WS01" { $4="spawning" } { print }' "$RUN_DIR/roster.tsv" >"$RUN_DIR/r.tmp" && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
BEFORE=$(git -C "$REPO" rev-parse HEAD)
run_land WS01
check "spawning row refuses land with 66" "$RC" "66"
contains "message says still spawning" "$ERR" "spawning"
check "Mac HEAD unchanged for a spawning row" "$(git -C "$REPO" rev-parse HEAD)" "$BEFORE"
check "status still spawning" "$(awk -F'\t' '$1=="WS01"{print $4}' "$RUN_DIR/roster.tsv")" "spawning"

echo "== test_land_local_uses_fleet_worktree_path"
# Local row (empty host) in worktree mode: same behaviour as before.
LBASE="$TMP_DIR/local"
mkdir -p "$LBASE"
REPO="$LBASE/proj"
git init -q -b main "$REPO"
printf 'planning/fleet-*/\n.claude/worktrees/\n' >"$REPO/.gitignore"
printf 'base\n' >"$REPO/tracked.txt"
git -C "$REPO" add -A && git -C "$REPO" commit -qm init
git -C "$REPO" worktree add -q -b fleet/WS01 "$REPO/.claude/worktrees/ws01" main
printf 'x\n' >"$REPO/.claude/worktrees/ws01/l.md"
git -C "$REPO/.claude/worktrees/ws01" add -A && git -C "$REPO/.claude/worktrees/ws01" commit -qm l
RUN_DIR="$REPO/planning/fleet-main"
mkdir -p "$RUN_DIR"
printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\thost\n' >"$RUN_DIR/roster.tsv"
printf 'WS01\tws01\ttask\tworking\tl.md\t\t\t\t0\t\tclaude-haiku\t\n' >>"$RUN_DIR/roster.tsv"
: >"$RUN_DIR/.roster.lock"
printf 'FLEET_WORKTREE=on\n' >"$RUN_DIR/fleet.env"
: >"$STUB_LOG"
run_land WS01
check "local worktree land exits 0" "$RC" "0"
[ -f "$REPO/l.md" ] && ok "local worktree branch merged" || no "l.md not merged (err: $ERR)"
[ -d "$REPO/.claude/worktrees/ws01" ] && no "local worktree not removed" || ok "local worktree removed"
check "local land never calls ssh" "$(wc -c <"$STUB_LOG" | tr -d ' ')" "0"

echo "== test_land_local_no_ff_message_names_task_and_worker"
git -C "$REPO" worktree add -q "$REPO/.claude/worktrees/ws01" fleet/WS01
printf 'y\n' >"$REPO/.claude/worktrees/ws01/m.md"
git -C "$REPO/.claude/worktrees/ws01" add -A && git -C "$REPO/.claude/worktrees/ws01" commit -qm m
printf 'z\n' >"$REPO/other-main.md"
git -C "$REPO" add -A && git -C "$REPO" commit -qm "main moves"
awk -F'\t' -v OFS='\t' -v t="$LONG_TASK" 'NR>1 && $1=="WS01" { $3=t; $4="working"; $5="m.md" } { print }' "$RUN_DIR/roster.tsv" >"$RUN_DIR/r.tmp" && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
run_land WS01 --no-ff
check "local no-ff land exits 0" "$RC" "0"
SUBJ=$(git -C "$REPO" log -1 --format=%s)
BODY=$(git -C "$REPO" log -1 --format=%b)
contains "local subject names ws and task" "$SUBJ" "fleet: land WS01: Rebuild the intake form"
contains "local body carries the full task" "$BODY" "$LONG_TASK"
contains "local body names the worker" "$BODY" "ws01"

echo
echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
