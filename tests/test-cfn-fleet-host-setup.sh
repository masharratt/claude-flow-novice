#!/usr/bin/env bash
# tests/test-cfn-fleet-host-setup.sh
# fleet host-setup (lib/cmd-host-setup.sh), plan Phase 7
# (planning/PLAN_fleet-remote-host-workers.md). A stub ssh runs the remote
# command locally with HOME pointed at a temp dir standing in for the server,
# so the bare repo, push and clone are real git operations. The real ssh and
# the real server are never touched.
set -uo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
FLEET="$PROJECT_ROOT/.claude/skills/cfn-fleet/cli/fleet"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (got '$2', want '$3')"; fi; }
contains() { case "$2" in *"$3"*) ok "$1" ;; *) no "$1 (missing '$3' in: $2)" ;; esac; }
lacks() { case "$2" in *"$3"*) no "$1 (unexpected '$3' in: $2)" ;; *) ok "$1" ;; esac; }

TMP_DIR=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/fleet-hostsetup.XXXXXX")" && pwd -P)
trap 'rm -rf "$TMP_DIR"' EXIT
export FAKE_HOME="$TMP_DIR/server-home"
mkdir -p "$TMP_DIR/bin" "$FAKE_HOME/.local/bin"
export STUB_LOG="$TMP_DIR/ssh.log"
export GIT_CONFIG_GLOBAL="$TMP_DIR/gitconfig"
git config --global user.email t@example.com
git config --global user.name tester
git config --global init.defaultBranch main

# ssh stub: last arg is the remote command line; run it with the fake HOME.
cat >"$TMP_DIR/bin/ssh" <<'EOF'
#!/usr/bin/env bash
echo "ssh $*" >>"$STUB_LOG"
[ "${STUB_SSH_FAIL:-0}" = 1 ] && exit 255
cd "$FAKE_HOME" || exit 255
HOME="$FAKE_HOME" exec bash -c "${@: -1}"
EOF
chmod +x "$TMP_DIR/bin/ssh"
# Server-side tool stubs (found through the ~/.local/bin preamble).
printf '#!/bin/sh\necho "tmux 3.4"\n' >"$FAKE_HOME/.local/bin/tmux"
printf '#!/bin/sh\necho "2.1.9 (Claude Code)"\n' >"$FAKE_HOME/.local/bin/claude"
chmod +x "$FAKE_HOME/.local/bin/"*
printf '{"oauthAccount": {"emailAddress": "worker@example.com"}}\n' >"$FAKE_HOME/.claude.json"
export PATH="$TMP_DIR/bin:$PATH"

# Mac side: a throwaway repo named proj with a real .env that must not travel.
MAC="$TMP_DIR/proj"
mkdir -p "$MAC" && git -C "$MAC" init -q
echo hello >"$MAC/a.md"; echo "SECRET=1" >"$MAC/.env"
printf '.env\n' >"$MAC/.gitignore"
git -C "$MAC" add a.md .gitignore && git -C "$MAC" commit -q -m init

run() { (cd "$MAC" && "$FLEET" host-setup "$@" 2>&1); }

echo "test_host_setup_idempotent"
out=$(run vps); rc=$?
check "first run exits 0" "$rc" 0
[ -d "$FAKE_HOME/git/proj.git" ] && ok "bare repo created" || no "bare repo created"
[ -d "$FAKE_HOME/fleet-runs" ] && ok "fleet-runs created" || no "fleet-runs created"
check "remote url" "$(git -C "$MAC" remote get-url vps)" "vps:git/proj.git"
check "bare main == Mac main" \
  "$(git --git-dir="$FAKE_HOME/git/proj.git" rev-parse main)" "$(git -C "$MAC" rev-parse main)"
check "clone HEAD == Mac main" \
  "$(git -C "$FAKE_HOME/fleet-repos/proj" rev-parse HEAD)" "$(git -C "$MAC" rev-parse main)"
touch "$FAKE_HOME/fleet-repos/proj/untracked-sentinel"
echo more >>"$MAC/a.md"; git -C "$MAC" commit -q -am second
out=$(run vps); rc=$?
check "second run exits 0" "$rc" 0
check "second run fast-forwards clone" \
  "$(git -C "$FAKE_HOME/fleet-repos/proj" rev-parse HEAD)" "$(git -C "$MAC" rev-parse main)"
[ -f "$FAKE_HOME/fleet-repos/proj/untracked-sentinel" ] && ok "existing clone kept, not re-cloned" || no "existing clone kept"
check "single remote entry" "$(git -C "$MAC" remote | grep -c '^vps$')" 1

echo "test_host_setup_never_touches_user_checkout"
mkdir -p "$FAKE_HOME/Projects/proj"
echo keep >"$FAKE_HOME/Projects/proj/mine.txt"
before=$(cd "$FAKE_HOME/Projects" && find . -type f | sort | xargs cat | cksum)
run vps >/dev/null
after=$(cd "$FAKE_HOME/Projects" && find . -type f | sort | xargs cat | cksum)
check "~/Projects/proj unchanged" "$after" "$before"
check "no .env on server" "$(find "$FAKE_HOME" -name .env | wc -l | tr -d ' ')" 0
check "no .claude login files created" "$(find "$FAKE_HOME" -maxdepth 2 -name '.credentials*' | wc -l | tr -d ' ')" 0

echo "test_host_setup_refuses_remote_pointing_elsewhere"
git -C "$MAC" remote add other "somewhere:else.git"
rm -rf "$FAKE_HOME/git/proj.git"
out=$(run other); rc=$?
check "exit 65" "$rc" 65
contains "names the existing url" "$out" "somewhere:else.git"
[ ! -d "$FAKE_HOME/git/proj.git" ] && ok "no server change on refusal" || no "no server change on refusal"
check "remote left as it was" "$(git -C "$MAC" remote get-url other)" "somewhere:else.git"

echo "test_host_setup_usage"
out=$(run); check "no alias exits 64" "$?" 64
out=$(run --bogus vps); check "unknown flag exits 64" "$?" 64
out=$(run 'bad alias;x'); check "bad alias exits 64" "$?" 64

echo "test_host_setup_check"
out=$(run vps --check 2>&1); rc=$?
check "check exits 0" "$rc" 0
contains "tmux version" "$out" "tmux=tmux 3.4"
contains "claude version" "$out" "claude=2.1.9"
contains "account" "$out" "account=worker@example.com"
contains "free disk" "$out" "free_disk_gb="
contains "no cfn checkout is reported" "$out" "cfn_commit=unknown"
rm -f "$FAKE_HOME/.claude.json"
out=$(run vps --check 2>&1)
contains "account unknown without config" "$out" "account=unknown"

echo "test_host_setup_check_drift"
git clone -q "$PROJECT_ROOT" "$FAKE_HOME/claude-flow-novice-src" 2>/dev/null
git -C "$FAKE_HOME/claude-flow-novice-src" commit -q --allow-empty -m drift
out=$(run vps --check 2>&1)
contains "drift warned" "$out" "WARN"
contains "drift names both commits" "$out" "local "
git -C "$FAKE_HOME/claude-flow-novice-src" reset -q --hard "$(git -C "$PROJECT_ROOT" rev-parse HEAD)" 2>/dev/null
out=$(run vps --check 2>&1)
lacks "no warning when commits match" "$out" "WARN"
check "check never created server dirs it lacked" "$([ -d "$FAKE_HOME/fleet-repos/other" ] && echo y || echo n)" n

echo "test_host_setup_check_unreachable"
out=$(STUB_SSH_FAIL=1 run vps --check); rc=$?
check "unreachable exits 71" "$rc" 71
contains "says cannot reach" "$out" "cannot reach"

echo "test_host_setup_from_linked_worktree_uses_main_repo_name"
# Live-test bug (2026-10-13, MDTWII): run from a linked worktree, host-setup
# named the project after the worktree folder (expected git/hosttest.git).
git -C "$MAC" worktree add -q -b wtbranch "$TMP_DIR/wtname" >/dev/null 2>&1
out=$(cd "$TMP_DIR/wtname" && "$FLEET" host-setup vps 2>&1); rc=$?
check "linked worktree setup exits 0" "$rc" 0
lacks "no worktree-named remote" "$out" "wtname.git"
[ -d "$FAKE_HOME/git/proj.git" ] && ok "bare repo named after main repo" || no "bare repo named after main repo"
[ ! -e "$FAKE_HOME/git/wtname.git" ] && ok "no worktree-named bare repo" || no "no worktree-named bare repo"
check "fleet_project_name from worktree" \
  "$(cd "$TMP_DIR/wtname" && bash -c 'source "$1"; fleet_project_name "$PWD"' _ "$PROJECT_ROOT/.claude/skills/cfn-fleet/lib/common.sh")" proj

echo
echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
