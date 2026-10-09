#!/usr/bin/env bash
# tests/test-cfn-vps.sh
# cfn-vps skill: run commands, sync and long jobs on a remote server over ssh.
#
# ssh is replaced by a stub on PATH that checks the host alias and runs the
# remote command locally under a fake HOME, so the real quoting, cd and job
# bookkeeping are exercised without a network. The final block guards the
# property that matters most for a public repo: the skill ships no host
# addresses, tailnet names, keys or passwords.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-vps"
VPS="$SKILL_DIR/vps.sh"

TEST_TMP=$(mktemp -d "${TMPDIR:-/tmp}/cfn-vps.XXXXXX")
TEST_TMP=$(cd "$TEST_TMP" && pwd)  # macOS TMPDIR ends in "/", which doubles the slash
trap 'rm -rf "$TEST_TMP"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok   $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; [ -n "${2:-}" ] && echo "       $2"; }
check_eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected [$3] got [$2]"; fi; }
check_has() { case "$2" in *"$3"*) pass "$1" ;; *) fail "$1" "missing [$3] in [$2]" ;; esac; }
check_lacks() { case "$2" in *"$3"*) fail "$1" "unexpected [$3] in [$2]" ;; *) pass "$1" ;; esac; }

# --- fake server -------------------------------------------------------------
FAKE_HOME="$TEST_TMP/server-home"
mkdir -p "$FAKE_HOME/Projects/demo" "$TEST_TMP/bin"
SSH_LOG="$TEST_TMP/ssh.log"

cat > "$TEST_TMP/bin/ssh" <<EOF
#!/usr/bin/env bash
# Stub: skip ssh options, require the expected host, run the rest locally.
while [ \$# -gt 0 ]; do
  case "\$1" in
    -o) shift 2 ;;
    -*) shift ;;
    *) break ;;
  esac
done
host="\$1"; shift
echo "host=\$host" >> "$SSH_LOG"
[ "\$host" = "\${STUB_EXPECT_HOST:-vps}" ] || { echo "stub: wrong host \$host" >&2; exit 255; }
cmd="\$*"
cd "$FAKE_HOME" && HOME="$FAKE_HOME" bash -c "\$cmd"
EOF
chmod +x "$TEST_TMP/bin/ssh"
export PATH="$TEST_TMP/bin:$PATH"

# A git repo on the "server" with an upstream, for sync tests.
UPSTREAM="$TEST_TMP/upstream.git"
git init -q --bare "$UPSTREAM"
SEED="$TEST_TMP/seed"
git init -q "$SEED"
git -C "$SEED" -c user.name=t -c user.email=t@invalid commit -q --allow-empty -m one
git -C "$SEED" push -q "$UPSTREAM" HEAD:refs/heads/main
git -C "$UPSTREAM" symbolic-ref HEAD refs/heads/main
rm -rf "$FAKE_HOME/Projects/demo"
git clone -q "$UPSTREAM" "$FAKE_HOME/Projects/demo"

echo "cfn-vps"

# --- usage -------------------------------------------------------------------
rc=0; out=$("$VPS" 2>&1) || rc=$?
check_eq "no args exits 2" "$rc" "2"
check_has "no args prints usage" "$out" "usage"

# --- run ---------------------------------------------------------------------
out=$("$VPS" run demo -- pwd)
check_eq "run executes inside the project folder" "$out" "$FAKE_HOME/Projects/demo"

out=$("$VPS" run demo -- printf '%s|' "a b" 'it'"'"'s' '$HOME' '*')
check_eq "run keeps arguments intact (spaces, quotes, \$, globs)" "$out" "a b|it's|\$HOME|*|"

rc=0; "$VPS" run demo -- bash -c 'exit 7' || rc=$?
check_eq "run passes the remote exit code through" "$rc" "7"

rc=0; out=$("$VPS" run nope -- true 2>&1) || rc=$?
check_eq "run on a missing project fails" "$rc" "3"
check_has "run on a missing project says so" "$out" "no project"

rc=0; out=$("$VPS" run '../etc' -- true 2>&1) || rc=$?
check_eq "run rejects project names with slashes or dots" "$rc" "2"

out=$(STUB_EXPECT_HOST=box CFN_VPS_HOST=box "$VPS" run demo -- echo hi)
check_eq "CFN_VPS_HOST picks the ssh alias" "$out" "hi"

# --- sync --------------------------------------------------------------------
git -C "$SEED" -c user.name=t -c user.email=t@invalid commit -q --allow-empty -m two
git -C "$SEED" push -q "$UPSTREAM" HEAD:refs/heads/main
"$VPS" sync demo >/dev/null
check_eq "sync fast-forwards the server copy" \
  "$(git -C "$FAKE_HOME/Projects/demo" log -1 --format=%s)" "two"

echo dirty > "$FAKE_HOME/Projects/demo/scratch.txt"
rc=0; out=$("$VPS" sync demo 2>&1) || rc=$?
check_eq "sync refuses when the server copy has uncommitted changes" "$rc" "4"
check_has "sync names the dirty file" "$out" "scratch.txt"
rm "$FAKE_HOME/Projects/demo/scratch.txt"

# --- jobs --------------------------------------------------------------------
out=$("$VPS" job demo build -- bash -c 'echo started; sleep 1; echo finished; exit 3')
check_has "job start reports the job name" "$out" "build"

st=$("$VPS" status build)
check_has "status shows a running job" "$st" "running"

for _ in 1 2 3 4 5 6 7 8 9 10; do
  st=$("$VPS" status build)
  case "$st" in *running*) sleep 0.5 ;; *) break ;; esac
done
check_has "status shows the finished job's exit code" "$st" "exit 3"

lg=$("$VPS" log build)
check_has "log shows job output" "$lg" "finished"
check_has "log runs in the project folder" "$("$VPS" job demo where -- pwd >/dev/null; sleep 1; "$VPS" log where)" "$FAKE_HOME/Projects/demo"

rc=0; out=$("$VPS" job demo build -- true 2>&1) || rc=$?
check_eq "job name can be reused once finished" "$rc" "0"
sleep 1

"$VPS" job demo slow -- sleep 5 >/dev/null
rc=0; out=$("$VPS" job demo slow -- true 2>&1) || rc=$?
check_eq "job refuses a name that is still running" "$rc" "5"

jl=$("$VPS" jobs)
check_has "jobs lists running jobs" "$jl" "slow"
check_has "jobs lists finished jobs" "$jl" "where"

rc=0; "$VPS" status ghost >/dev/null 2>&1 || rc=$?
check_eq "status of an unknown job exits 3" "$rc" "3"

# --- no identifying details or secrets ship with the skill -------------------
leaks=$(grep -rn -I -E \
  '([0-9]{1,3}\.){3}[0-9]{1,3}|\.ts\.net|tail[0-9a-f]{6}|BEGIN [A-Z ]*PRIVATE KEY|ssh-ed25519 AAAA|ssh-rsa AAAA|_ROOT=|password *[:=]|gh[pousr]_[A-Za-z0-9]{20,}' \
  "$SKILL_DIR" || true)
check_eq "skill files contain no IPs, tailnet names, keys or passwords" "$leaks" ""
check_lacks "skill files name no personal home path" \
  "$(grep -rn -I -E '/Users/[a-z]|/home/[a-z]' "$SKILL_DIR" || true)" "/"

echo
echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
