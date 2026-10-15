#!/usr/bin/env bash
# tests/test-vps-rebuild.sh
# vps-rebuild.sh: rebuild a fresh Ubuntu server from a vps-backup bundle.
#
# No network: every check runs a local-only mode (argument checks, --dry-run,
# --list-home) against a fixture bundle. The last block guards the property
# that matters for a public repo: the script ships no host addresses, tailnet
# names, user names or secrets; those live in the bundle's rebuild.conf.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
SCRIPT="$PROJECT_ROOT/.claude/cfn-scripts/vps-rebuild.sh"

# safe-rm.sh is landing in a parallel change; until it is committed, fall back
# to a delete that only ever matches this test's own mktemp pattern.
if [ -f "$PROJECT_ROOT/.claude/cfn-scripts/lib/safe-rm.sh" ]; then
  # shellcheck source=../.claude/cfn-scripts/lib/safe-rm.sh
  source "$PROJECT_ROOT/.claude/cfn-scripts/lib/safe-rm.sh"
else
  cfn_safe_rm_tmp() { case "$1" in */vps-rebuild.??????) rm -rf -- "$1" ;; *) echo "refusing to delete $1" >&2; return 1 ;; esac; }
fi

TEST_TMP=$(mktemp -d "${TMPDIR:-/tmp}/vps-rebuild.XXXXXX") || exit 1
TEST_TMP=$(cd -P "$TEST_TMP" && pwd -P) || exit 1
trap 'cfn_safe_rm_tmp "$TEST_TMP"' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ok   $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; [ -n "${2:-}" ] && echo "       $2"; }
check_eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected [$3] got [$2]"; fi; }
check_has() { case "$2" in *"$3"*) pass "$1" ;; *) fail "$1" "missing [$3] in [$2]" ;; esac; }
check_lacks() { case "$2" in *"$3"*) fail "$1" "unexpected [$3] in [$2]" ;; *) pass "$1" ;; esac; }
run() { set +e; OUT=$("$SCRIPT" "$@" 2>&1); RC=$?; set -e; }

# --- fixture bundle ------------------------------------------------------------
B="$TEST_TMP/bundle"
mkdir -p "$B/home/.ssh" "$B/home/.claude/worktrees/x" "$B/home/.config/chrome-signed/Default/Extensions/e" \
         "$B/home/.config/chrome-signed/Default" "$B/system/etc/ssh/sshd_config.d" "$B/projects/demo/.claude/worktrees/w" \
         "$B/projects/demo/sim"
echo key > "$B/home/.ssh/authorized_keys"
echo rc > "$B/home/.bashrc"
echo junk > "$B/home/.claude/worktrees/x/f"
echo junk > "$B/home/.config/chrome-signed/Default/Extensions/e/big.json"
echo keep > "$B/home/.config/chrome-signed/Default/Cookies"
echo SECRET=1 > "$B/projects/demo/.env"
echo junk > "$B/projects/demo/.claude/worktrees/w/f"
echo bin > "$B/projects/demo/sim/drones"
cat > "$B/rebuild.conf" <<'EOF'
SERVER_USER=alice
NODE_VERSION=26.11.1
CODE_SERVER_VERSION=4.141.0
SUPABASE_VERSION=2.110.0
TAILNET_NAME=box.example.ts.net
REPOS="example/demo.git|Projects/demo|main"
EOF

echo "argument checks"
run
check_eq "no args is a usage error (64)" "$RC" "64"
run vps "$TEST_TMP/missing" plan
check_eq "missing bundle is a data error (65)" "$RC" "65"
run vps "$B" nonsense
check_eq "unknown phase is a usage error (64)" "$RC" "64"
check_has "unknown phase names the valid phases" "$OUT" "bootstrap"
mv "$B/rebuild.conf" "$B/rebuild.conf.off"
run vps "$B" plan
check_eq "bundle without rebuild.conf is a data error (65)" "$RC" "65"
mv "$B/rebuild.conf.off" "$B/rebuild.conf"

echo "plan (dry run, no ssh)"
PATH="$TEST_TMP/nossh:$PATH"; mkdir -p "$TEST_TMP/nossh"
printf '#!/bin/sh\necho SSH-CALLED >&2; exit 99\n' > "$TEST_TMP/nossh/ssh"; chmod +x "$TEST_TMP/nossh/ssh"
run vps "$B" plan
check_eq "plan exits 0" "$RC" "0"
check_lacks "plan never calls ssh" "$OUT" "SSH-CALLED"
for p in bootstrap harden packages tools home repos services check; do check_has "plan lists $p" "$OUT" "$p"; done
check_has "plan reads the user from rebuild.conf" "$OUT" "alice"

echo "home file selection skips rebuildable junk"
run vps "$B" list-home
check_eq "list-home exits 0" "$RC" "0"
check_has "keeps authorized_keys" "$OUT" ".ssh/authorized_keys"
check_has "keeps chrome cookies" "$OUT" "chrome-signed/Default/Cookies"
check_lacks "drops chrome extensions" "$OUT" "Extensions"
check_lacks "drops claude worktrees" "$OUT" "worktrees"

echo "project file selection skips rebuildable junk"
run vps "$B" list-projects
check_has "keeps project .env" "$OUT" "demo/.env"
check_lacks "drops project worktrees" "$OUT" "worktrees"
check_lacks "drops compiled drones binary" "$OUT" "sim/drones"

echo "a project with nothing to restore is not an error"
# Regression 2026-10-15: on the live rebuild, daily-drones had only junk in the
# bundle, grep matched nothing, and pipefail killed the repos phase silently.
B2="$TEST_TMP/bundle2"; mkdir -p "$B2/home" "$B2/system" "$B2/projects/empty/.claude/worktrees/w"
echo junk > "$B2/projects/empty/.claude/worktrees/w/f"
cp "$B/rebuild.conf" "$B2/rebuild.conf"
run vps "$B2" list-projects
check_eq "list-projects with only junk exits 0" "$RC" "0"
check_eq "list-projects with only junk prints nothing" "$OUT" ""
run vps "$B2" list-home
check_eq "list-home on an empty home exits 0" "$RC" "0"
check_has "repos phase filters through the shared helper" "$(grep -c 'project_files ' "$SCRIPT")" "1"

echo "docker ports are firewalled (2026-10-15: supabase on 0.0.0.0 bypassed ufw)"
check_has "harden adds the DOCKER-USER drop block" "$(cat "$SCRIPT")" "BEGIN cfn docker-user"
check_has "check verifies the DOCKER-USER drop" "$(cat "$SCRIPT")" "docker ports blocked publicly"

echo "public-repo hygiene"
body=$(cat "$SCRIPT")
check_lacks "no IPv4 address literal" "$(echo "$body" | grep -E '([0-9]{1,3}\.){3}[0-9]{1,3}' | grep -vE '127\.0\.0\.1|0\.0\.0\.0' || true)" "."
check_lacks "no tailnet name" "$body" ".ts.net"
check_lacks "no hardcoded user home" "$body" "/home/michael"

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
