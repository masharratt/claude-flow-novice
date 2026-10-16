#!/usr/bin/env bash
# tests/test-cfn-fleet-host.sh
# cfn-fleet host transport library (lib/host.sh), plan Phase 2
# (planning/PLAN_fleet-remote-host-workers.md). Stub ssh/tmux first on PATH;
# the real ssh and the real server are never touched.
set -uo pipefail
# The mailbox path (stage 5) has its own suite (test-cfn-fleet-mailbox.sh, fake
# redis-cli). Off here, so these file-based cases never reach a real mailbox config.
export FLEET_MAILBOX=off

PROJECT_ROOT=$(git rev-parse --show-toplevel)
HOST_LIB="$PROJECT_ROOT/.claude/skills/cfn-fleet/lib/host.sh"

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
check() { # check NAME ACTUAL EXPECTED
  if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (got '$2', want '$3')"; fi
}
contains() { # contains NAME HAYSTACK NEEDLE
  case "$2" in *"$3"*) ok "$1" ;; *) no "$1 (missing '$3' in: $2)" ;; esac
}

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/fleet-host.XXXXXX") || exit 1
TMP_DIR=$(cd -P "$TMP_DIR" && pwd -P) || exit 1
trap 'cfn_safe_rm_tmp "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/bin"
export STUB_LOG="$TMP_DIR/calls.log"

# Stub ssh: log argv one arg per line between markers, then answer from env.
cat >"$TMP_DIR/bin/ssh" <<'EOF'
#!/usr/bin/env bash
{ echo "--ssh"; for a in "$@"; do echo "$a"; done; } >>"$STUB_LOG"
[ -n "${STUB_SSH_OUT:-}" ] && printf '%s\n' "$STUB_SSH_OUT"
exit "${STUB_SSH_RC:-0}"
EOF
# Stub tmux: same contract for the local (HOST empty) path.
cat >"$TMP_DIR/bin/tmux" <<'EOF'
#!/usr/bin/env bash
{ echo "--tmux"; for a in "$@"; do echo "$a"; done; } >>"$STUB_LOG"
[ -n "${STUB_TMUX_OUT:-}" ] && printf '%s\n' "$STUB_TMUX_OUT"
exit "${STUB_TMUX_RC:-0}"
EOF
chmod +x "$TMP_DIR/bin/ssh" "$TMP_DIR/bin/tmux"
export PATH="$TMP_DIR/bin:$PATH"

reset() { : >"$STUB_LOG"; unset STUB_SSH_OUT STUB_SSH_RC STUB_TMUX_OUT STUB_TMUX_RC; }

echo "== sourcing"
SRC_OUT=$(bash -c "source '$HOST_LIB'" 2>&1)
check "host.sh is silent when sourced" "$SRC_OUT" ""
# shellcheck disable=SC1090
source "$HOST_LIB"

echo "== test_host_run_local_vs_ssh_argv"
reset
STUB_TMUX_OUT=hello _fleet_host_run "" tmux -L s list-sessions >/dev/null
check "empty HOST runs locally, no ssh" "$(grep -c '^--ssh' "$STUB_LOG")" "0"
contains "empty HOST ran the local command" "$(cat "$STUB_LOG")" "--tmux"

reset
_fleet_host_run myhost echo 'a b' "c'd" >/dev/null
LOG=$(cat "$STUB_LOG")
check "HOST set runs ssh once" "$(grep -c '^--ssh' "$STUB_LOG")" "1"
contains "BatchMode" "$LOG" "BatchMode=yes"
contains "ConnectTimeout" "$LOG" "ConnectTimeout=10"
contains "ControlMaster" "$LOG" "ControlMaster=auto"
contains "ControlPersist" "$LOG" "ControlPersist=60"
contains "host alias passed" "$LOG" $'\nmyhost\n'
contains "login shell" "$LOG" "bash -lc"
contains "nvm preamble" "$LOG" "nvm.sh"
contains "cargo preamble" "$LOG" ".cargo/env"
contains "local bin on PATH" "$LOG" ".local/bin"
# The remote command must round-trip through the shell exactly: eval the last
# ssh arg locally with a stub bash and compare the words that arrive.
REMOTE_ARG=$(tail -n 1 "$STUB_LOG")
contains "args are %q-quoted into one string" "$REMOTE_ARG" "echo"
if printf '%s' "$REMOTE_ARG" | grep -q 'a b'; then
  no "space arg must be escaped, not raw"
else
  ok "space arg is escaped"
fi

echo "== _fleet_host_run returns the remote exit code"
reset
STUB_SSH_RC=7 _fleet_host_run myhost true
check "rc passthrough" "$?" "7"

echo "== _fleet_tmux"
reset
_fleet_tmux "" -L sock new-session -d -s x
check "local tmux, no ssh" "$(grep -c '^--ssh' "$STUB_LOG")" "0"
contains "local tmux argv" "$(cat "$STUB_LOG")" $'-L\nsock\nnew-session'
reset
_fleet_tmux myhost -L sock kill-server
contains "remote tmux goes over ssh" "$(cat "$STUB_LOG")" "--ssh"
contains "remote tmux carries args" "$(cat "$STUB_LOG")" "kill-server"

echo "== test_pane_state_ssh_failure_is_unreachable_not_dead"
reset
export STUB_SSH_RC=255; R=$(_fleet_pane_state myhost fleet-run WS1); check "ssh rc 255 -> unreachable" "$R" "unreachable"
reset
export STUB_SSH_RC=124; R=$(_fleet_pane_state myhost fleet-run WS1); check "timeout rc 124 -> unreachable" "$R" "unreachable"
reset
export STUB_SSH_RC=127; R=$(_fleet_pane_state myhost fleet-run WS1); check "tmux missing (rc 127) -> unreachable" "$R" "unreachable"
reset
export STUB_SSH_RC=1; R=$(_fleet_pane_state myhost fleet-run WS1); check "tmux no session (rc 1) -> dead" "$R" "dead"
reset
export STUB_SSH_OUT=0; R=$(_fleet_pane_state myhost fleet-run WS1); check "pane_dead=0 -> alive" "$R" "alive"
reset
export STUB_SSH_OUT=1; R=$(_fleet_pane_state myhost fleet-run WS1); check "pane_dead=1 -> dead" "$R" "dead"
reset
export STUB_TMUX_OUT=0; R=$(_fleet_pane_state "" fleet-run WS1); check "local alive" "$R" "alive"
reset
export STUB_TMUX_RC=1; R=$(_fleet_pane_state "" fleet-run WS1); check "local no session -> dead" "$R" "dead"
reset
_fleet_pane_state myhost fleet-run WS1 >/dev/null
contains "pane_state targets socket and session" "$(cat "$STUB_LOG")" "fleet-run"

echo "== test_host_free_gb_parses_df"
reset
export STUB_SSH_OUT=$'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 104857600 52428800 52428800 50% /'; R=$(_fleet_host_free_gb myhost)
check "50 GiB available -> 50" "$R" "50"
reset
export STUB_SSH_OUT=$'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 104857600 104000000 1572864 99% /'; R=$(_fleet_host_free_gb myhost)
check "1.5 GiB floors to 1" "$R" "1"
reset
export STUB_SSH_RC=255; R=$(_fleet_host_free_gb myhost); rc=$?
check "unreachable prints nothing" "$R" ""
check "unreachable returns nonzero" "$([ "$rc" -ne 0 ] && echo yes || echo no)" "yes"
reset
export STUB_SSH_OUT="garbage"; R=$(_fleet_host_free_gb myhost); rc=$?
check "unparseable prints nothing" "$R" ""

echo
echo "passed=$PASS failed=$FAIL total=$((PASS + FAIL))"
[ "$FAIL" -eq 0 ]
