#!/usr/bin/env bash
# Host drift tripwire (SessionStart hook).
#
# Why (2026-10-29): a trojanized editor extension planted an attacker SSH key,
# autostart entries (crontab @reboot, Startup folder, scheduled task, launch
# agents) and a reverse SSH tunnel to a C2 host. This hook notices that CLASS
# of change, not just those exact indicators:
#
#   * Once per 24h it takes a text snapshot of login keys, autostart, tunnels,
#     firewall guard and RustDesk security settings, and diffs it against a
#     saved baseline. No change: silent. First run: one line.
#   * Known indicators of compromise (IOC) alert on EVERY session, behind no gate.
#     Linux-side IOCs are re-checked live each session (cheap). Windows-side IOCs
#     come from the last full run and persist until a later full run clears them.
#
# SessionStart stdout reaches the model, so alerts are plain English on stdout.
# The baseline is never auto-updated on drift: the alert repeats daily until
# `cfn-host-drift-check.sh --accept`.
#
# Flags: --accept (save current snapshot as baseline), --force (ignore the
#        daily gate), --show (print the snapshot, change nothing).
# Always exits 0 and never blocks the session; hard time cap CFN_HOST_DRIFT_CAP
# (default 15s). Secrets are never printed: RustDesk secret-bearing values are
# reported as a short hash only.
#
# Test overrides: CFN_HOST_DRIFT_WIN_TIMEOUT (powershell cap, default 11s),
# CFN_HOST_DRIFT_CROND (default /etc/cron.d), CFN_HOST_DRIFT_LIBROOT (default /Library).
set -uo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

MODE=daily
for a in "$@"; do
  case "$a" in
    --accept) MODE=accept ;;
    --force)  MODE=force ;;
    --show)   MODE=show ;;
  esac
done

CAP="${CFN_HOST_DRIFT_CAP:-15}"
WIN_TO="${CFN_HOST_DRIFT_WIN_TIMEOUT:-11}"
CROND="${CFN_HOST_DRIFT_CROND:-/etc/cron.d}"
LIBROOT="${CFN_HOST_DRIFT_LIBROOT:-/Library}"
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cfn-host-drift-check.sh"

# Hard cap: re-run ourselves under timeout; never fail the session.
if [ -z "${CFN_HDC_INNER:-}" ] && command -v timeout >/dev/null 2>&1; then
  CFN_HDC_INNER=1 timeout "$CAP" bash "${BASH_SOURCE[0]}" "$@" </dev/null
  exit 0
fi
exec </dev/null

to() { # to <secs> cmd...   (timeout when available)
  if command -v timeout >/dev/null 2>&1; then timeout "$@"; else shift; "$@"; fi
}

IOC_FP='SHA256:0Z6R+DF64Do2nwQic8a7kkfDLNNk4IiK+2U2Rci4htk'
C2_IP='134.209.82.225'

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/cfn-host-drift"
BASELINE="$STATE_DIR/baseline.txt"
STAMP="$STATE_DIR/last-run"
LOG="$STATE_DIR/drift.log"
WIN_IOC="$STATE_DIR/ioc-win.txt"
GATE_SECS=86400

# RustDesk keys watched. Plain = non-secret toggles shown as-is.
# Hashed = values that are secrets or identify infrastructure (hash only).
RD_PLAIN='allow-remote-config-modification verification-method approve-mode direct-server direct-access-port access-mode enable-remote-restart'
RD_HASHED='password unlock_pin trusted_devices whitelist key custom-rendezvous-server relay-server api-server rendezvous_server'

emit() { awk -v s="$1" 'NF {print s "|" $0}'; }       # emit <section>  (stdin lines)
sorted() { LC_ALL=C sort -u; }
hash12() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256
  else cksum; fi | cut -c1-12
}

# ---------------------------------------------------------------- sections

fingerprints() { # fingerprints <file> -> "FP comment (type)" lines, sorted; rc 1 if unusable
  local out
  command -v ssh-keygen >/dev/null 2>&1 || return 1
  out=$(ssh-keygen -lf "$1" 2>/dev/null) || return 1
  printf '%s\n' "$out" | awk 'NF {$1=""; sub(/^ /,""); print}' | sorted
}

sec_authkeys() {
  local f="$HOME/.ssh/authorized_keys" fp
  if [ ! -f "$f" ]; then echo "absent" | emit "ssh/authorized_keys"; return; fi
  if [ ! -s "$f" ]; then return; fi
  if fp=$(fingerprints "$f"); then
    printf '%s\n' "$fp" | emit "ssh/authorized_keys"
  else
    echo "unavailable" | emit "ssh/authorized_keys"
  fi
}

sec_crontab() {
  if ! command -v crontab >/dev/null 2>&1; then echo "unavailable" | emit crontab; return; fi
  crontab -l 2>/dev/null | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | grep -vE '^(#|$)' | emit crontab
}

sec_listing() { # sec_listing <section> <dir>
  if [ -d "$2" ]; then ls -1 "$2" 2>/dev/null | sorted | emit "$1"
  else echo "absent" | emit "$1"; fi
}

sec_user_units() {
  local out
  if ! command -v systemctl >/dev/null 2>&1; then echo "unavailable" | emit user-units; return; fi
  if ! out=$(to 5 systemctl --user list-unit-files --state=enabled --no-legend --no-pager 2>/dev/null); then
    echo "unavailable" | emit user-units; return
  fi
  printf '%s\n' "$out" | awk '$1 ~ /\.(service|timer|socket|path)$/ {print $1}' | sorted | emit user-units
}

sec_sshd() {
  local u e a
  if ! command -v systemctl >/dev/null 2>&1; then echo "unavailable" | emit sshd; return; fi
  for u in ssh sshd; do
    e=$(to 5 systemctl is-enabled "$u" 2>/dev/null | head -n1); a=$(to 5 systemctl is-active "$u" 2>/dev/null | head -n1)
    echo "$u enabled=${e:-n/a} active=${a:-n/a}"
  done | emit sshd
}

sec_tunnels() {
  local psout
  if ! command -v ps >/dev/null 2>&1; then echo "unavailable" | emit tunnel-processes; return; fi
  psout=$(ps -eo pid=,args= 2>/dev/null) || { echo "unavailable" | emit tunnel-processes; return; }
  printf '%s\n' "$psout" \
    | awk -v a="$$" -v b="$PPID" '$1 != a && $1 != b' \
    | grep -v 'cfn-host-drift' \
    | sed -E 's/^ *[0-9]+ +//' \
    | grep -E '(^|[ /])autossh( |$)|(^|[ /])ssh( .*)? -R' \
    | sorted | emit tunnel-processes
}

sec_firewall() {
  local out
  if ! command -v iptables >/dev/null 2>&1; then echo "unavailable" | emit firewall-guard; return; fi
  if ! out=$(to 5 iptables -S OUTPUT 2>/dev/null); then echo "unavailable" | emit firewall-guard; return; fi
  if printf '%s\n' "$out" | grep -q 'cfn-ssh-egress'; then echo "present" | emit firewall-guard
  else echo "absent" | emit firewall-guard; fi
}

sec_ioc_paths() {
  local p
  for p in "$HOME/.config/.smt" "$HOME/.config/.smtk" "$HOME/Library/LaunchAgents/com.apple.sysmond.plist"; do
    [ -e "$p" ] && echo "~${p#"$HOME"}"
  done | emit ioc-paths
}

sec_c2() {
  local out=""
  if command -v ss >/dev/null 2>&1; then out=$(to 5 ss -tnH 2>/dev/null)
  elif command -v netstat >/dev/null 2>&1; then out=$(to 5 netstat -an 2>/dev/null)
  else echo "unavailable" | emit c2-connections; return; fi
  if printf '%s\n' "$out" | grep -qF "$C2_IP"; then echo "connected $C2_IP" | emit c2-connections; fi
}

linux_snapshot() {
  local os; os=$(uname -s 2>/dev/null || echo Linux)
  sec_authkeys
  sec_crontab
  sec_tunnels
  sec_ioc_paths
  sec_c2
  if [ "$os" = Darwin ]; then
    sec_listing launchagents-user "$HOME/Library/LaunchAgents"
    sec_listing launchagents-system "$LIBROOT/LaunchAgents"
    sec_listing launchdaemons "$LIBROOT/LaunchDaemons"
  else
    sec_listing cron.d "$CROND"
    sec_user_units
    sec_listing autostart "$HOME/.config/autostart"
    sec_sshd
    sec_firewall
  fi
}

# ---------------------------------------------------------------- windows

read -r -d '' PS_SCRIPT <<'PSEOF'
$ErrorActionPreference='SilentlyContinue'
function E($t,$v){ [Console]::Out.WriteLine($t+'|'+$v) }
$u=$env:USERPROFILE
foreach($x in @(@('AKU',($u+'\.ssh\authorized_keys')),@('AKA','C:\ProgramData\ssh\administrators_authorized_keys'))){
  $t=$x[0]; $p=$x[1]
  if(-not (Test-Path -LiteralPath $p)){ E ($t+'_ABSENT') ''; continue }
  try{
    $n=0
    foreach($l in (Get-Content -LiteralPath $p -ErrorAction Stop)){ if($l -match '\S' -and $l -notmatch '^\s*#'){ E $t $l.Trim(); $n++ } }
    if($n -eq 0){ E ($t+'_EMPTY') '' }
  } catch { E ($t+'_UNREADABLE') '' }
}
foreach($d in @(($env:APPDATA+'\Microsoft\Windows\Start Menu\Programs\Startup'),'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp')){
  Get-ChildItem -LiteralPath $d -Force | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object { E 'STARTUP' ($d+'\'+$_.Name) }
}
Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } | ForEach-Object { E 'TASK' ($_.TaskPath+$_.TaskName) }
foreach($k in @(@('HKCU','HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'),@('HKLM','HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'))){
  $it=Get-Item -LiteralPath $k[1]
  if($it){ foreach($n in $it.GetValueNames()){ E 'RUN' ($k[0]+'|'+$n) } }
}
$r=Get-NetFirewallRule -Name 'cfn-ssh-egress-block'
if(-not $r){ $r=Get-NetFirewallRule -DisplayName 'cfn-ssh-egress-block' }
if($r){ E 'FW' ('cfn-ssh-egress-block|'+$r.Enabled) }
foreach($f in @('smt.cmd','smtk')){ if(Test-Path -LiteralPath ($u+'\.config\'+$f)){ E 'WINPATH' ('.config\'+$f) } }
$c=@(Get-NetTCPConnection -RemoteAddress '134.209.82.225').Count
E 'C2' $c
foreach($f in @('RustDesk2.toml','RustDesk.toml')){
  $p=$env:APPDATA+'\RustDesk\config\'+$f
  if(Test-Path -LiteralPath $p){
    Get-Content -LiteralPath $p | Where-Object { $_ -match '^\s*(__RDKEYS__)\s*=' } | ForEach-Object { E 'RD' ($f+'|'+$_.Trim()) }
  }
}
PSEOF

win_field() { # win_field <TAG> -> value after "TAG|" for each line
  printf '%s\n' "$WIN_RAW" | sed -n "s/^$1|//p"
}

win_keys() { # win_keys <TAG> <label>
  local tag="$1" label="$2" tmp fp
  if printf '%s\n' "$WIN_RAW" | grep -q "^${tag}_ABSENT|"; then echo "$label absent"; return; fi
  if printf '%s\n' "$WIN_RAW" | grep -q "^${tag}_UNREADABLE|"; then echo "$label unreadable"; return; fi
  if printf '%s\n' "$WIN_RAW" | grep -q "^${tag}_EMPTY|"; then echo "$label empty"; return; fi
  tmp=$(mktemp "${TMPDIR:-/tmp}/cfn-hdc.XXXXXX") || { echo "$label unavailable"; return; }
  win_field "$tag" > "$tmp"
  if [ -s "$tmp" ] && fp=$(fingerprints "$tmp"); then printf '%s\n' "$fp" | sed "s/^/$label /"
  elif [ -s "$tmp" ]; then echo "$label unavailable"
  else echo "$label absent"; fi
  rm -f -- "$tmp"
}

win_rustdesk() {
  local tag file rest key val kind
  printf '%s\n' "$WIN_RAW" | sed -n 's/^RD|//p' | while IFS='|' read -r file rest; do
    key="${rest%%=*}"; val="${rest#*=}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    val="$(printf '%s' "$val" | sed -E "s/^[[:space:]]+//; s/[[:space:]]+\$//; s/^['\"]//; s/['\"]\$//")"
    kind=""
    case " $RD_PLAIN " in *" $key "*) kind=plain ;; esac
    case " $RD_HASHED " in *" $key "*) kind=hashed ;; esac
    case "$kind" in
      plain)  echo "$file:$key=$val" ;;
      hashed) echo "$file:$key=sha:$(printf '%s' "$val" | hash12)" ;;
    esac
  done | sorted
}

windows_snapshot() {
  command -v powershell.exe >/dev/null 2>&1 || return 0
  local enc script rc
  if ! command -v iconv >/dev/null 2>&1 || ! command -v base64 >/dev/null 2>&1; then
    echo "unavailable" | emit windows; return
  fi
  script="${PS_SCRIPT//__RDKEYS__/$(echo "$RD_PLAIN $RD_HASHED" | tr ' ' '|')}"
  enc=$(printf '%s' "$script" | iconv -f UTF-8 -t UTF-16LE | base64 | tr -d '\n')
  WIN_RAW=$( { to "$WIN_TO" powershell.exe -NoProfile -NonInteractive -EncodedCommand "$enc" 2>/dev/null; echo "__RC=$?"; } | tr -d '\r')
  rc=$(printf '%s\n' "$WIN_RAW" | sed -n 's/^__RC=//p' | tail -n1)
  WIN_RAW=$(printf '%s\n' "$WIN_RAW" | grep -v '^__RC=')
  if [ "${rc:-1}" != 0 ] || [ -z "$WIN_RAW" ]; then echo "unavailable" | emit windows; return; fi

  { win_keys AKU user; win_keys AKA admin; } | emit win-authorized-keys
  win_field STARTUP | sorted | emit win-startup
  win_field TASK | sorted | emit win-tasks
  win_field RUN | sorted | emit win-run
  if win_field FW | grep -q .; then win_field FW | sed -E 's/\|/ enabled=/' | emit win-firewall
  else echo "cfn-ssh-egress-block absent" | emit win-firewall; fi
  win_field WINPATH | sorted | emit win-ioc-paths
  if [ "$(win_field C2 | head -n1 | tr -d '[:space:]')" -gt 0 ] 2>/dev/null; then echo "connected $C2_IP" | emit win-c2; fi
  win_rustdesk | emit win-rustdesk
}

# ---------------------------------------------------------------- IOC + diff

detect_iocs() { # detect_iocs linux|win  (flat snapshot on stdin) -> one line per hit
  local snap which="$1"
  snap=$(cat)
  if [ "$which" = win ]; then snap=$(printf '%s\n' "$snap" | grep '^win-')
  else snap=$(printf '%s\n' "$snap" | grep -v '^win-'); fi
  {
    printf '%s\n' "$snap" | grep -F "$IOC_FP" | sed 's/^/attacker SSH key fingerprint present: /'
    printf '%s\n' "$snap" | sed -n 's/^tunnel-processes|//p' | grep -v '^unavailable$' | sed 's/^/reverse tunnel process running: /'
    printf '%s\n' "$snap" | sed -n 's/^ioc-paths|//p' | sed 's/^/known persistence file present: /'
    printf '%s\n' "$snap" | sed -n 's/^crontab|//p' | grep -E '\.smtk?([^[:alnum:]_]|$)' | sed 's/^/crontab entry runs the known implant: /'
    printf '%s\n' "$snap" | sed -n 's/^c2-connections|//p' | grep -F "$C2_IP" | sed 's/^/live connection to the known attacker host: /'
    printf '%s\n' "$snap" | grep -E '^launchagents-[a-z]+\|com\.apple\.sysmond\.plist$' | sed 's/^/known persistence file present: macOS sysmond launch agent /'
    printf '%s\n' "$snap" | sed -n 's/^win-startup|//p' | grep -iE 'sysmon\.cmd$' | sed 's/^/known persistence file present: /'
    printf '%s\n' "$snap" | sed -n 's/^win-tasks|//p' | grep -E '\\SysMon$' | sed 's/^/known scheduled task present: /'
    printf '%s\n' "$snap" | sed -n 's/^win-ioc-paths|//p' | sed 's/^/known persistence file present (Windows): /'
    printf '%s\n' "$snap" | sed -n 's/^win-c2|//p' | sed 's/^/live connection to the known attacker host (Windows): /'
  } | sorted
}

# merge_unavailable <current> <baseline>: where a section is only "unavailable"
# now, keep the baseline's lines for it so a tool outage is not reported as drift.
merge_unavailable() {
  awk -v CUR="$1" '
    function gone(s) { return (s in un) || (("windows" in un) && s ~ /^win-/) }
    FILENAME == CUR { cur[++n] = $0; s = $0; sub(/\|.*/, "", s); if ($0 == s "|unavailable") un[s] = 1; next }
    { s = $0; sub(/\|.*/, "", s); if (gone(s)) print }
    END { for (i = 1; i <= n; i++) { s = cur[i]; sub(/\|.*/, "", s); if (!gone(s)) print cur[i] } }
  ' "$1" "$2" | sorted
}

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >> "$LOG" 2>/dev/null; }

# ---------------------------------------------------------------- main

if [ "$MODE" = show ]; then
  { linux_snapshot; windows_snapshot; } | LC_ALL=C sort
  exit 0
fi

mkdir -p "$STATE_DIR" 2>/dev/null || exit 0

save_win_ioc() { # save_win_ioc <flat snapshot file>
  # Keep the old Windows IOC list when powershell was unavailable this run.
  grep -q '^windows|unavailable$' "$1" && return
  detect_iocs win < "$1" > "$WIN_IOC.tmp" 2>/dev/null && mv -f "$WIN_IOC.tmp" "$WIN_IOC"
}

CUR=$(mktemp "${TMPDIR:-/tmp}/cfn-hdc-cur.XXXXXX") || exit 0
trap 'rm -f -- "$CUR" "$CUR.m" "$WIN_IOC.tmp"' EXIT

NOW=$(date +%s)

if [ "$MODE" = accept ]; then
  { linux_snapshot; windows_snapshot; } | LC_ALL=C sort > "$CUR"
  if grep -q '^windows|unavailable$' "$CUR" && [ -f "$BASELINE" ]; then
    merge_unavailable "$CUR" "$BASELINE" > "$CUR.m" && mv -f "$CUR.m" "$CUR"
  fi
  cp -f "$CUR" "$BASELINE" && echo "$NOW" > "$STAMP"
  save_win_ioc "$CUR"
  log "baseline accepted"
  echo "host drift baseline updated"
  exit 0
fi

LAST=0
[ -f "$STAMP" ] && LAST=$(cat "$STAMP" 2>/dev/null)
[[ "$LAST" =~ ^[0-9]+$ ]] || LAST=0
FULL=0
if [ "$MODE" = force ] || [ ! -f "$BASELINE" ] || [ $((NOW - LAST)) -ge "$GATE_SECS" ]; then FULL=1; fi

LINUX_SNAP=$(linux_snapshot)
IOC_LINUX=$(printf '%s\n' "$LINUX_SNAP" | detect_iocs linux)

DRIFT=""
CREATED=0
if [ "$FULL" = 1 ]; then
  echo "$NOW" > "$STAMP"   # stamp first so a hang or crash is not retried every session
  { printf '%s\n' "$LINUX_SNAP"; windows_snapshot; } | LC_ALL=C sort > "$CUR"
  save_win_ioc "$CUR"
  if [ ! -f "$BASELINE" ]; then
    cp -f "$CUR" "$BASELINE" && CREATED=1
  else
    merge_unavailable "$CUR" "$BASELINE" > "$CUR.m" && mv -f "$CUR.m" "$CUR"
    DRIFT=$(diff <(LC_ALL=C sort "$BASELINE") "$CUR" | grep -E '^[<>] ' \
      | sed -E 's/^< /- /; s/^> /+ /; s/\|/: /' )
  fi
fi

IOC_WIN=""
[ -s "$WIN_IOC" ] && IOC_WIN=$(cat "$WIN_IOC" 2>/dev/null)
IOC_ALL=$(printf '%s\n%s\n' "$IOC_LINUX" "$IOC_WIN" | grep . | sorted)

if [ -n "$IOC_ALL" ]; then
  echo "POSSIBLE COMPROMISE: the host drift check found known signs of the October 2026 trojanized editor extension attack."
  printf '%s\n' "$IOC_ALL" | head -n 20 | sed 's/^/  * /'
  echo "Treat this as real until proven otherwise. Check ~/.ssh/authorized_keys, crontab -l and running ssh processes, and tell the user now."
  log "IOC: $(printf '%s' "$IOC_ALL" | tr '\n' ';')"
fi

if [ "$CREATED" = 1 ]; then
  echo "host drift baseline created"
  log "baseline created"
fi

if [ -n "$DRIFT" ]; then
  N=$(printf '%s\n' "$DRIFT" | wc -l | tr -d ' ')
  echo "HOST DRIFT: this machine's login keys, autostart entries, tunnels or remote-access settings changed since the saved baseline ($N lines)."
  echo "Changes (- removed, + added):"
  printf '%s\n' "$DRIFT" | head -n 40
  [ "$N" -gt 40 ] && echo "... $((N - 40)) more lines (see $LOG)"
  echo "If you made these changes, accept them with: $SELF --accept"
  echo "If you did not, treat it as a possible compromise. This alert repeats daily until accepted."
  log "drift ($N lines): $(printf '%s' "$DRIFT" | tr '\n' ';' | cut -c1-2000)"
fi

exit 0
