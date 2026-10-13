#!/usr/bin/env bash
# cfn-fleet lib/spawn-remote.sh: the `fleet spawn WSxx --host H` path.
#
# Sourced by cmd-spawn.sh (functions and constants only, prints nothing when
# sourced). Uses cmd-spawn.sh's launch helpers (_spawn_launch_one,
# _spawn_tmux, _fleet_pane_wait, _spawn_commit) and host.sh's ssh transport.
# Split out of cmd-spawn.sh when the host sandbox landed
# (planning/PLAN_fleet-host-sandbox.md).
#
# Every host worker is fenced three ways:
#   1. Claude Code's Bash sandbox (bwrap on Linux) via a generated --settings
#      JSON: writes only to the worktree, the fleet clone (commits in a linked
#      worktree write its .git) and the outbox; no unsandboxed fallback; unix
#      sockets blocked (docker.sock). Claude's own temp dir stays writable.
#   2. permissions.deny Edit(...) rules on the server deny list below. Claude
#      Code applies an Edit(path) rule to every file-writing tool (Edit, Write,
#      MultiEdit, NotebookEdit; it warns that Write(path) style rules are never
#      matched) and merges it into the sandbox denyWrite. Reads stay allowed.
#   3. A systemd --user scope capping CPU and memory.
# Preflight refuses (66) a host where bwrap, socat or systemd-run --user do not
# work, unless FLEET_REMOTE_UNSANDBOXED=1 (then each missing fence is skipped
# with a WARN and the deny rules still apply).
# Server layout (all under the server's $HOME, set up by `fleet host-setup`):
#   ~/git/<project>.git           bare repo; the Mac pushes fleet-base/<WS> here
#   ~/fleet-repos/<project>       fleet clone of the bare repo (origin = bare)
#   ~/fleet-repos/<project>-wt/<ws>   worker worktree on branch fleet/<WS>
#   ~/fleet-runs/<project>/<run>/<WS>/  outbox: brief, claims, outbox.env,
#                                 remote-worker.sh, reports/
# Server scripts run as `bash -c SCRIPT _ ARGS...`: host.sh %q-quotes each word,
# so ~ and $HOME only expand inside the script, never in an argument.

# Preflight, args: clone bare wt base_ref. Prints facts; the Mac decides.
_SPAWN_REMOTE_PREFLIGHT='
clone="$1"; bare="$2"; wt="$3"; baseref="$4"
if [ ! -d "$clone/.git" ]; then
  echo NOCLONE
else
  for r in $(git -C "$clone" remote); do
    echo "REMOTE $r $(git -C "$clone" remote get-url "$r" 2>/dev/null)"
  done
fi
[ -d "$wt" ] && echo WT_EXISTS
git --git-dir="$bare" rev-parse --verify -q "refs/heads/$baseref" >/dev/null 2>&1 && echo BASE_EXISTS
for d in "$HOME/claude-flow-novice-src" "$HOME/Projects/claude-flow-novice-src" "$HOME/fleet-repos/claude-flow-novice-src"; do
  if [ -d "$d/.git" ]; then echo "CFN_COMMIT $(git -C "$d" rev-parse HEAD 2>/dev/null)"; break; fi
done
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
if bwrap --ro-bind / / true >/dev/null 2>&1; then echo SANDBOX_BWRAP_OK; fi
if socat -V >/dev/null 2>&1; then echo SANDBOX_SOCAT_OK; fi
if systemd-run --user --scope --quiet -p MemoryMax=64M true >/dev/null 2>&1; then echo SCOPE_OK; fi
exit 0
'

# Prepare, args: clone wt branch base_ref links_csv project outbox. Fetches the
# pushed base, adds the worktree, links the user-checkout paths (git-ignored via
# the clone exclude so they never dirty the worktree), makes the 0700 outbox.
# Prints WT_NEW / BRANCH_NEW / OUTBOX_NEW so a failed spawn can undo exactly
# what it made, plus LINKED / MISSING_LINK / BAD_LINK per link.
_SPAWN_REMOTE_PREPARE='
clone="$1"; wt="$2"; branch="$3"; baseref="$4"; links="$5"; project="$6"; ob="$7"
git -C "$clone" worktree prune >/dev/null 2>&1
git -C "$clone" fetch -q origin || { echo "ERR fetch from the bare repo failed"; exit 70; }
if [ -d "$wt" ]; then
  echo WT_REUSED
else
  mkdir -p "$(dirname "$wt")" || exit 71
  if git -C "$clone" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$clone" worktree add -q "$wt" "$branch" || { echo "ERR worktree add failed"; exit 71; }
  else
    git -C "$clone" worktree add -q -b "$branch" "$wt" "origin/$baseref" \
      || { echo "ERR worktree add failed (is $baseref pushed?)"; exit 71; }
    echo BRANCH_NEW
  fi
  echo WT_NEW
fi
exclude="$clone/.git/info/exclude"
# Linux Claude Code sandbox bind-mounts empty placeholders over its protected
# dotfiles in the worktree; keep them out of git status. Anchored, no dupes.
# Names from Claude Code 2.1.296 (sandbox runtime ZHn and ee lists).
mkdir -p "$(dirname "$exclude")"
for p in /.gitconfig /.gitmodules /.bashrc /.bash_profile /.zshrc /.zprofile /.profile /.ripgreprc /.mcp.json /.vscode/ /.idea/ /.claude/commands/ /.claude/agents/; do
  grep -qxF -- "$p" "$exclude" 2>/dev/null || echo "$p" >> "$exclude"
done
IFS=, read -ra L <<< "$links"
for p in "${L[@]}"; do
  p="${p// /}"
  [ -n "$p" ] || continue
  case "$p" in /*|*..*|*[!A-Za-z0-9._/-]*) echo "BAD_LINK $p"; continue ;; esac
  src="$HOME/Projects/$project/$p"
  if [ ! -e "$src" ]; then echo "MISSING_LINK $p"; continue; fi
  if [ -e "$wt/$p" ] || [ -L "$wt/$p" ]; then continue; fi
  mkdir -p "$(dirname "$wt/$p")" && ln -s "$src" "$wt/$p" || continue
  grep -qxF "/$p" "$exclude" 2>/dev/null || echo "/$p" >> "$exclude"
  echo "LINKED $p"
done
[ -e "$ob" ] || echo OUTBOX_NEW
( umask 077; mkdir -p "$ob" ) && chmod 700 "$ob" || { echo "ERR outbox not created"; exit 71; }
exit 0
'

# Undo, args: clone wt branch wt_new branch_new outbox outbox_new. Removes only
# what this spawn created, so a respawn never loses the worker'"'"'s work.
_SPAWN_REMOTE_UNDO='
clone="$1"; wt="$2"; branch="$3"; wt_new="$4"; branch_new="$5"; ob="$6"; ob_new="$7"
if [ "$wt_new" = 1 ]; then
  git -C "$clone" worktree remove --force "$wt" >/dev/null 2>&1 || rm -rf "$wt"
  git -C "$clone" worktree prune >/dev/null 2>&1
fi
[ "$branch_new" = 1 ] && git -C "$clone" branch -D "$branch" >/dev/null 2>&1
if [ "$ob_new" = 1 ]; then
  case "$ob" in "$HOME"/fleet-runs/?*) rm -rf "$ob" ;; esac
fi
exit 0
'

# _spawn_remote_brief TEMPLATE PROJECT RUN WS CLAIMS MIGRATION MASTER_BRIEF
# -> the shipped brief on stdout: the BRIEF_REMOTE.md template with its
# placeholders filled, then the master's brief (task, allowed commands, done
# criteria) appended.
_spawn_remote_brief(){
  local tpl="$1" project="$2" run="$3" ws="$4" claims="$5" mig="$6" master="$7" t lc
  # bash 5.2 treats & in a replacement as the match; claims may contain one.
  shopt -u patsub_replacement 2>/dev/null || true
  lc=$(printf '%s' "$ws" | tr '[:upper:]' '[:lower:]')
  t=$(cat "$tpl")
  t=${t//'<project>'/$project}
  t=${t//'<run>'/$run}
  t=${t//'<ws>'/$lc}
  t=${t//'WSxx'/$ws}
  t=${t//'<reserved migration number or none>'/${mig:-none}}
  t=${t//'<path1> <path2> ...'/$claims}
  t=${t//"<one-paragraph statement of the workstream's task>"/"The task is in the master brief at the end of this file."}
  t=${t//'<the commands this workstream may run, e.g. test runner, linter>'/"Scoped tests and type checks for your claims, as the master brief lists."}
  t=${t//'<verifiable condition 1>'/"Every done criterion in the master brief below is met"}
  t=${t//'<verifiable condition 2>'/"Nothing outside your claims was changed"}
  printf '%s\n\n---\n\n# Master brief\n\n' "$t"
  cat "$master"
}

# _spawn_remote_claims ROSTER_CLAIMS -> one claim per line (commas or spaces).
_spawn_remote_claims(){
  printf '%s' "$1" | tr ', \t' '\n\n\n\n' | sed '/^$/d'
}

# _spawn_remote_ship_launch ...: everything after the remote worktree exists:
# build and ship the kit, launch on the host, then record the spawn. Returns 1
# (message on stderr) on any failure; the caller undoes the remote setup.
# Sets session_up=1 (caller's local) once a tmux session may exist.
# CLONE is the server fleet clone (recorded for land), SETTINGS the --settings
# JSON for claude, SCOPE the systemd-run prefix ("" when caps are off).
_spawn_remote_ship_launch(){
  local ws="$1" name="$2" host="$3" engine="$4" bin="$5" args_str="$6" unset_raw="$7"
  local trust_re="$8" trust_keys="$9" banner_re="${10}" run_dir="${11}" brief="${12}" kit="${13}"
  local project="${14}" run="${15}" wt="${16}" ob="${17}" sock="${18}" gitremote="${19}"
  local clone="${20}" settings="${21}" scope="${22}"
  local tpl_dir gen claims_sp mig remote_launch pane_cmd line

  tpl_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../templates" && pwd)"
  gen=$(od -An -tx1 -N8 /dev/urandom | tr -d ' \n')
  [ -n "$gen" ] || { echo "spawn: could not make a generation id" >&2; return 1; }
  claims_sp=$(_spawn_remote_claims "$(roster_get "$ws" claims)" | tr '\n' ' ')
  claims_sp="${claims_sp% }"
  mig=$(roster_get "$ws" migration_num 2>/dev/null || true)

  _spawn_remote_claims "$(roster_get "$ws" claims)" > "$kit/claims.txt" || return 1
  _spawn_remote_brief "$tpl_dir/BRIEF_REMOTE.md" "$project" "$run" "$ws" "$claims_sp" "$mig" "$brief" > "$kit/brief.md" || return 1
  {
    printf 'FLEET_WS=%q\n' "$ws"
    printf 'FLEET_GEN=%q\n' "$gen"
    printf 'FLEET_OUTBOX=%q\n' "$ob"
    printf 'FLEET_BRANCH=%q\n' "fleet/$ws"
    printf 'FLEET_WORKTREE=%q\n' "$wt"
  } > "$kit/outbox.env" || return 1

  # Launch script: same private env script the local path types, but it lives
  # in the 0700 outbox on the server and deletes itself there. The settings
  # JSON rides inline (single-quoted; it never holds a quote), so the worker
  # has no settings file it could edit for its next start.
  remote_launch="$ob/.launch-$name"
  pane_cmd=""
  [ -z "$unset_raw" ] || pane_cmd="unset ${unset_raw//,/ }; "
  # systemd-run --user needs the user manager's runtime dir; a tmux pane
  # started over ssh may not carry it.
  [ -z "$scope" ] || pane_cmd+='export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"; '
  pane_cmd+="exec $scope$bin${args_str:+ $args_str} --settings '$settings'"
  cfn_spawn_launch_write "${_SPAWN_SET_LINES:-}" "$pane_cmd" \
    || { echo "spawn: could not write the private launch script for $name" >&2; return 1; }
  (
    umask 077
    swapped=0
    while IFS= read -r line || [ -n "$line" ]; do
      if [ "$line" = "rm -rf '$CFN_SPAWN_ENV_DIR'" ]; then
        printf "rm -f '%s'\n" "$remote_launch"
        swapped=1
      else
        printf '%s\n' "$line"
      fi
    done < "$CFN_SPAWN_ENV_DIR/launch" > "$kit/.launch-$name"
    [ "$swapped" -eq 1 ]
  ) || { echo "spawn: launch script rewrite for the host failed" >&2; return 1; }

  local scp_opts=(-q -o BatchMode=yes -o ConnectTimeout=10)
  scp "${scp_opts[@]}" -- "$kit/brief.md" "$kit/claims.txt" "$kit/outbox.env" \
      "$tpl_dir/remote-worker.sh" "$host:$ob/" \
    || { echo "spawn: scp of the outbox kit to $host failed" >&2; return 1; }
  scp "${scp_opts[@]}" -- "$kit/.launch-$name" "$host:$remote_launch" \
    || { echo "spawn: scp of the launch script to $host failed" >&2; return 1; }
  _fleet_host_run "$host" bash -c 'chmod 700 "$1" && chmod 600 "$2" "$3" "$4" "$5"' _ \
      "$ob/remote-worker.sh" "$ob/brief.md" "$ob/claims.txt" "$ob/outbox.env" "$remote_launch" \
    || { echo "spawn: could not set modes on the outbox kit at $host" >&2; return 1; }

  local trust_timeout banner_timeout auth_timeout banner_line prompt_line
  trust_timeout=$(_fleet_env_seconds FLEET_TRUST_TIMEOUT 15)
  banner_timeout=$(_fleet_env_seconds FLEET_BANNER_TIMEOUT 20)
  auth_timeout=$(_fleet_env_seconds FLEET_AUTH_TIMEOUT 12)
  # Dynamic scope for _spawn_launch_one / _spawn_tmux.
  local _SPAWN_HOST="$host" _SPAWN_REMOTE_LAUNCH_LINE=". '$remote_launch'"
  session_up=1
  banner_line=$(_spawn_launch_one "$sock" "$name" "$wt" "$pane_cmd" "$trust_re" "$trust_keys" \
    "$trust_timeout" "$banner_re" "$banner_timeout") || return 1

  # remote/<WS>.env: the contract fleet sync and land read. Written only after
  # the banner, so a failed spawn leaves no env file behind.
  local envf="$run_dir/remote/$ws.env" tmpf
  tmpf="$envf.tmp.$$"
  (
    umask 077
    mkdir -p "$run_dir/remote" || exit 1
    {
      printf 'FLEET_HOST=%q\n' "$host"
      printf 'FLEET_GIT_REMOTE=%q\n' "$gitremote"
      printf 'FLEET_PROJECT=%q\n' "$project"
      printf 'FLEET_RUN=%q\n' "$run"
      printf 'FLEET_GEN=%q\n' "$gen"
      printf 'FLEET_REMOTE_WT=%q\n' "$wt"
      printf 'FLEET_REMOTE_CLONE=%q\n' "$clone"
      printf 'FLEET_OUTBOX=%q\n' "$ob"
      printf 'FLEET_BRANCH=%q\n' "fleet/$ws"
      printf 'FLEET_BASE_REF=%q\n' "fleet-base/$ws"
      printf 'FLEET_SOCK=%q\n' "$sock"
      printf 'FLEET_SESSION=%q\n' "$name"
      printf 'FLEET_SPAWNED_AT=%q\n' "$(date +%s)"
    } > "$tmpf" && chmod 600 "$tmpf" && mv -f "$tmpf" "$envf"
  ) || { rm -f "$tmpf"; echo "spawn: could not write $envf" >&2; return 1; }

  roster_set "$ws" status started
  roster_set "$ws" heartbeat "$(date +%s)"
  roster_set "$ws" host "$host"
  _spawn_commit
  ( roster_get "$ws" engine >/dev/null 2>&1 ) && roster_set "$ws" engine "$engine"
  echo "spawned $ws engine=$engine host=$host banner=\"$banner_line\""

  # Thin prompt only after the banner; the brief on the server owns the rules.
  prompt_line="read $ob/brief.md and start; report to the master only through $ob/remote-worker.sh, as the brief says"
  _spawn_tmux -L "$sock" send-keys -t "$name" -l "$prompt_line"
  _spawn_tmux -L "$sock" send-keys -t "$name" Enter
  if _fleet_pane_wait "$sock" "$name" '401 Authentication Failed|Authentication Failed|invalid_api_key|authentication_error' "$auth_timeout" >/dev/null; then
    echo "spawn: WARNING $name: engine reports an authentication failure after the first request on $host (log in to claude there and respawn)." >&2
  fi
  return 0
}

# _spawn_remote WS NAME HOST ENGINE BIN ARGS UNSET TRUST_RE TRUST_KEYS BANNER_RE
# REPO RUN_DIR BRIEF: the whole --host path: preflight, push base, remote
# worktree, ship, launch. Exits via fleet_die; never leaves a half-made remote
# worktree behind (a respawn's existing worktree is left alone).
_spawn_remote(){
  local ws="$1" name="$2" host="$3" engine="$4" bin="$5" args_str="$6" unset_raw="$7"
  local trust_re="$8" trust_keys="$9" banner_re="${10}" repo="${11}" run_dir="${12}" brief="${13}"
  local project run lc sock gitremote home clone bare wt ob rc=0 out line
  project=$(fleet_project_name "$repo")
  run=$(basename "$run_dir")
  lc=$(printf '%s' "$ws" | tr '[:upper:]' '[:lower:]')
  [[ "$project" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && "$run" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && "$name" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
    || fleet_die 64 "spawn: project '$project', run '$run' and session name '$name' must be safe for server paths (letters, digits, dot, dash, underscore)"
  sock=$(_fleet_spawn_socket)
  gitremote=$(fleet_env_get FLEET_HOST_REMOTE)
  gitremote="${gitremote:-$host}"
  [[ "$gitremote" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
    || fleet_die 64 "spawn: FLEET_HOST_REMOTE '$gitremote' is not a safe git remote name"
  _spawn_remote_limits

  # 1. Server home, once: later steps use absolute paths, never ~ expansion.
  home=$(_fleet_host_run "$host" bash -c 'printf %s "$HOME"') || rc=$?
  if [ "$rc" -ne 0 ] || [ -z "$home" ]; then
    fleet_die 66 "spawn: host $host is unreachable over ssh (rc $rc); $ws left pending"
  fi
  _spawn_remote_safe_path "$home" \
    || fleet_die 66 "spawn: host $host reported an odd home directory '$home' (absolute, letters, digits, . _ - / only); $ws left pending"
  clone="$home/fleet-repos/$project"
  bare="$home/git/$project.git"
  wt="$home/fleet-repos/$project-wt/$lc"
  ob="$home/fleet-runs/$project/$run/$ws"

  # 2. Preflight (read-only on the server).
  rc=0
  out=$(_fleet_host_run "$host" bash -c "$_SPAWN_REMOTE_PREFLIGHT" _ "$clone" "$bare" "$wt" "fleet-base/$ws") || rc=$?
  [ "$rc" -eq 0 ] || fleet_die 66 "spawn: host $host is unreachable over ssh (rc $rc); $ws left pending"
  local wt_exists=0 base_exists=0 srv_commit="" bwrap_ok=0 socat_ok=0 scope_ok=0
  while IFS= read -r line; do
    case "$line" in
      NOCLONE)
        fleet_die 66 "spawn: no fleet clone at ~/fleet-repos/$project on $host; run: fleet host-setup $host" ;;
      "REMOTE "*)
        local rname rurl
        rname=$(printf '%s' "$line" | awk '{print $2}')
        rurl=$(printf '%s' "$line" | awk '{print $3}')
        [ "$rname" = origin ] \
          || fleet_die 66 "spawn: the fleet clone on $host has a remote named '$rname' ($rurl); it may only have the bare repo as origin. Run: fleet host-setup $host (after removing that remote)"
        case "$rurl" in
          *://*|*@*) fleet_die 66 "spawn: the fleet clone on $host has origin '$rurl', which is not the bare repo ~/git/$project.git; run: fleet host-setup $host" ;;
        esac
        [ "$rurl" = "$bare" ] || [ "${rurl%/git/$project.git}" != "$rurl" ] \
          || fleet_die 66 "spawn: the fleet clone on $host has origin '$rurl', not the bare repo ~/git/$project.git; run: fleet host-setup $host" ;;
      WT_EXISTS) wt_exists=1 ;;
      BASE_EXISTS) base_exists=1 ;;
      "CFN_COMMIT "*) srv_commit="${line#CFN_COMMIT }" ;;
      SANDBOX_BWRAP_OK) bwrap_ok=1 ;;
      SANDBOX_SOCAT_OK) socat_ok=1 ;;
      SCOPE_OK) scope_ok=1 ;;
    esac
  done <<< "$out"
  local sandbox_on scope=""
  sandbox_on=$(_spawn_remote_gate "$ws" "$host" "$bwrap_ok" "$socat_ok" "$scope_ok") || exit $?
  [ "$bwrap_ok" -eq 1 ] && [ "$socat_ok" -eq 1 ] && [ "$scope_ok" -eq 1 ] \
    && echo "preflight $host: sandbox ok, limits MemoryMax=$_SPAWN_REMOTE_MEM CPUQuota=$_SPAWN_REMOTE_CPU"
  [ "$scope_ok" -eq 0 ] \
    || scope="systemd-run --user --scope --quiet -p MemoryMax=$_SPAWN_REMOTE_MEM -p CPUQuota=$_SPAWN_REMOTE_CPU -- "

  local min_gb free_gb
  min_gb=$(fleet_env_get FLEET_REMOTE_MIN_FREE_GB)
  [[ "$min_gb" =~ ^[0-9]+$ ]] || min_gb=15
  if free_gb=$(_fleet_host_free_gb "$host"); then
    [ "$free_gb" -ge "$min_gb" ] \
      || fleet_die 66 "spawn: host $host has ${free_gb} GiB free disk, below FLEET_REMOTE_MIN_FREE_GB=$min_gb; free space or lower the knob"
  else
    echo "WARN spawn: could not read free disk on $host; continuing" >&2
  fi
  if [ -n "$srv_commit" ]; then
    local mac_commit
    mac_commit=$(git -C "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)" rev-parse HEAD 2>/dev/null || true)
    if [ -n "$mac_commit" ] && [ "$srv_commit" != "$mac_commit" ]; then
      echo "WARN spawn: claude-flow-novice-src on $host (${srv_commit:0:8}) differs from this machine (${mac_commit:0:8})" >&2
    fi
  fi
  # A live session of that name must never be adopted or killed by this spawn.
  rc=0
  _fleet_tmux "$host" -L "$sock" has-session -t "$name" >/dev/null 2>&1 || rc=$?
  [ "$rc" -ne 0 ] || fleet_die 66 "spawn: tmux session '$name' already exists on $host (socket $sock); stop it first"
  [ "$rc" -ne "$_FLEET_SSH_FAIL_RC" ] || fleet_die 66 "spawn: host $host is unreachable over ssh; $ws left pending"

  # 3. Push the base the worker branches from (fleet land fetches it back).
  git -C "$repo" remote get-url "$gitremote" >/dev/null 2>&1 \
    || fleet_die 66 "spawn: this repo has no git remote '$gitremote' for $host; run: fleet host-setup $host"
  if [ "$wt_exists" -eq 0 ] || [ "$base_exists" -eq 0 ]; then
    GIT_TERMINAL_PROMPT=0 git -C "$repo" push -q "$gitremote" "+HEAD:refs/heads/fleet-base/$ws" \
      || fleet_die 66 "spawn: git push $gitremote HEAD:fleet-base/$ws failed; $ws left pending"
  fi

  # 4. Remote worktree, links, outbox.
  local links wt_new=0 branch_new=0 ob_new=0 session_up=0
  links=$(fleet_env_get FLEET_REMOTE_LINKS)
  rc=0
  out=$(_fleet_host_run "$host" bash -c "$_SPAWN_REMOTE_PREPARE" _ \
    "$clone" "$wt" "fleet/$ws" "fleet-base/$ws" "$links" "$project" "$ob") || rc=$?
  while IFS= read -r line; do
    case "$line" in
      WT_NEW) wt_new=1 ;;
      BRANCH_NEW) branch_new=1 ;;
      OUTBOX_NEW) ob_new=1 ;;
      "MISSING_LINK "*) echo "WARN spawn: link source ${line#MISSING_LINK } is not in ~/Projects/$project on $host; not linked" >&2 ;;
      "BAD_LINK "*) echo "WARN spawn: FLEET_REMOTE_LINKS entry '${line#BAD_LINK }' is not a plain relative path; skipped" >&2 ;;
      "ERR "*) echo "spawn: ${line#ERR }" >&2 ;;
    esac
  done <<< "$out"

  local kit="" settings=""
  if [ "$rc" -eq 0 ]; then
    settings=$(_spawn_remote_settings "$home" "$wt" "$clone" "$ob" "$sandbox_on") || rc=1
  fi
  if [ "$rc" -eq 0 ]; then
    kit=$(umask 077 && mktemp -d "${TMPDIR:-/tmp}/fleet-spawn-kit.XXXXXX") || rc=1
  fi
  if [ "$rc" -eq 0 ]; then
    _spawn_remote_ship_launch "$ws" "$name" "$host" "$engine" "$bin" "$args_str" "$unset_raw" \
      "$trust_re" "$trust_keys" "$banner_re" "$run_dir" "$brief" "$kit" \
      "$project" "$run" "$wt" "$ob" "$sock" "$gitremote" "$clone" "$settings" "$scope" || rc=$?
  fi
  [ -z "$kit" ] || rm -rf "$kit"
  [ -z "${CFN_SPAWN_ENV_DIR:-}" ] || rm -rf "$CFN_SPAWN_ENV_DIR"
  [ "$rc" -eq 0 ] && return 0

  # Failure after partial setup: row stays pending, remote leftovers go.
  [ "$session_up" -eq 0 ] || _fleet_tmux "$host" -L "$sock" kill-session -t "$name" >/dev/null 2>&1 || true
  _fleet_host_run "$host" bash -c "$_SPAWN_REMOTE_UNDO" _ \
      "$clone" "$wt" "fleet/$ws" "$wt_new" "$branch_new" "$ob" "$ob_new" >/dev/null 2>&1 \
    || echo "WARN spawn: could not clean up $wt on $host; remove it by hand" >&2
  fleet_die 66 "spawn: $name left pending (remote setup or launch on $host failed, or engine '$engine' never showed its banner); the half-made remote worktree was removed"
}


# --- Sandbox, deny list and limits --------------------------------------------

# Default caps per worker, sized for the 12-core / 47 GB server: two workers
# take 8 cores and 24 GB, leaving 4 cores and ~23 GB for two gate runs and the
# OS. Override per run in fleet.env (or the environment): FLEET_REMOTE_MEM
# (systemd MemoryMax, e.g. 8G) and FLEET_REMOTE_CPU (CPUQuota, 100% = 1 core).
_FLEET_REMOTE_MEM_DEFAULT=12G
_FLEET_REMOTE_CPU_DEFAULT=400%

# Server write deny list (PLAN_fleet-host-sandbox.md; MDTWII tools/vps
# gate.sh, suite.sh, promote.sh): main checkouts, bare repos and gate refs,
# gate worktrees and slot locks, build slots, the cfn-vps job runner, Claude
# config, ssh and gh credentials, ~/opt. Home-relative entries first, then
# absolute ones. A glob that names a directory gets a /** twin so the files
# under it match as well.
_SPAWN_REMOTE_DENY_HOME=(
  'Projects/**' 'git/**'
  '.cache/mdtwii-target-*' '.cache/mdtwii-target-*/**' '.cache/cfn-vps/**'
  '.claude/**' '.ssh/**' '.config/gh/**' 'opt/**'
)
_SPAWN_REMOTE_DENY_ABS=(
  '/tmp/gate-*' '/tmp/gate-*/**' '/tmp/cand-*' '/tmp/cand-*/**'
  '/tmp/mdtwii-*' '/tmp/mdtwii-*/**'
)

# Fix commands printed when a host cannot fence a worker (Ubuntu 24.04 blocks
# unprivileged user namespaces for bwrap unless an AppArmor profile allows it).
_SPAWN_FIX_BWRAP="sudo apt install bubblewrap, then allow it user namespaces: printf 'abi <abi/4.0>,\\ninclude <tunables/global>\\nprofile bwrap /usr/bin/bwrap flags=(unconfined) {\\n  userns,\\n}\\n' | sudo tee /etc/apparmor.d/bwrap && sudo apparmor_parser -r /etc/apparmor.d/bwrap (check: bwrap --ro-bind / / true)"
_SPAWN_FIX_SOCAT="sudo apt install socat (Claude Code's Linux sandbox needs it for its network proxy)"
_SPAWN_FIX_SCOPE="sudo loginctl enable-linger \$USER, then log in again (check: systemd-run --user --scope -p MemoryMax=1G true)"

# _spawn_remote_knob KEY DEFAULT -> environment value, else fleet.env, else DEFAULT.
_spawn_remote_knob(){
  local key="$1" def="$2" v
  v="${!key:-}"
  [ -n "$v" ] || v=$(fleet_env_get "$key")
  printf '%s\n' "${v:-$def}"
}

# _spawn_remote_limits: resolve and validate the cap knobs into
# _SPAWN_REMOTE_MEM / _SPAWN_REMOTE_CPU (caller scope). Both reach the server
# shell inside the launch script, so anything but the plain forms is refused
# (64) before any ssh.
_spawn_remote_limits(){
  _SPAWN_REMOTE_MEM=$(_spawn_remote_knob FLEET_REMOTE_MEM "$_FLEET_REMOTE_MEM_DEFAULT")
  _SPAWN_REMOTE_CPU=$(_spawn_remote_knob FLEET_REMOTE_CPU "$_FLEET_REMOTE_CPU_DEFAULT")
  [[ "$_SPAWN_REMOTE_MEM" =~ ^[0-9]+[KMGT]?$ ]] \
    || fleet_die 64 "spawn: FLEET_REMOTE_MEM '$_SPAWN_REMOTE_MEM' is not a size like 12G (systemd MemoryMax)"
  [[ "$_SPAWN_REMOTE_CPU" =~ ^[0-9]+%$ ]] \
    || fleet_die 64 "spawn: FLEET_REMOTE_CPU '$_SPAWN_REMOTE_CPU' is not a percentage like 400% (systemd CPUQuota)"
}

# _spawn_remote_safe_path P: 0 when P is absolute and holds only letters,
# digits, . _ - /. Paths go into JSON strings and a single-quoted shell word
# unescaped, so a quote, backslash or space must never reach them.
_spawn_remote_safe_path(){
  [[ "${1:-}" =~ ^/[A-Za-z0-9._/-]+$ ]]
}

# _spawn_remote_gate WS HOST BWRAP_OK SOCAT_OK SCOPE_OK -> prints 1 (sandbox
# on) or 0. Exits 66 with the fix commands when a fence is missing, unless
# FLEET_REMOTE_UNSANDBOXED=1, which turns each refusal into a WARN. The caller
# keeps the scope off itself when SCOPE_OK is 0.
_spawn_remote_gate(){
  local ws="$1" host="$2" bwrap_ok="$3" socat_ok="$4" scope_ok="$5" override why="" fix=""
  override=$(_spawn_remote_knob FLEET_REMOTE_UNSANDBOXED 0)
  [ "$bwrap_ok" -eq 1 ] || { why+="bwrap cannot create a sandbox; "; fix+="$_SPAWN_FIX_BWRAP; "; }
  [ "$socat_ok" -eq 1 ] || { why+="socat is missing; "; fix+="$_SPAWN_FIX_SOCAT; "; }
  [ "$scope_ok" -eq 1 ] || { why+="systemd-run --user does not work (no CPU/memory caps); "; fix+="$_SPAWN_FIX_SCOPE; "; }
  if [ -n "$why" ] && [ "$override" != 1 ]; then
    fleet_die 66 "spawn: host $host cannot fence workers: ${why%; }. Fix on the server: ${fix%; }. Or set FLEET_REMOTE_UNSANDBOXED=1 to run without the missing fences; $ws left pending"
  fi
  if [ "$bwrap_ok" -eq 1 ] && [ "$socat_ok" -eq 1 ]; then
    echo 1
  else
    echo "WARN spawn: running $ws on $host WITHOUT the Bash sandbox (FLEET_REMOTE_UNSANDBOXED=1); only the Edit/Write deny list fences it" >&2
    echo 0
  fi
  [ "$scope_ok" -eq 1 ] \
    || echo "WARN spawn: running $ws on $host without CPU/memory caps (systemd-run --user unusable, FLEET_REMOTE_UNSANDBOXED=1)" >&2
  return 0
}

# _spawn_json_list ITEM... -> ["a","b"]. Items must be pre-validated (no
# quote, backslash or control character).
_spawn_json_list(){
  local out="" x
  for x in "$@"; do out+="${out:+,}\"$x\""; done
  printf '[%s]' "$out"
}

# _spawn_remote_settings HOME WT CLONE OB SANDBOX_ON -> the --settings JSON on
# stdout, one line. Returns 1 when a path is not safe to embed.
_spawn_remote_settings(){
  local home="$1" wt="$2" clone="$3" ob="$4" sandbox_on="$5" p sandbox
  for p in "$home" "$wt" "$clone" "$ob"; do
    _spawn_remote_safe_path "$p" || { echo "spawn: unsafe server path for settings: $p" >&2; return 1; }
  done
  # The outbox kit is the master's: the worker reads it, never rewrites it.
  # The clone's git config and hooks, and the worktree's .git pointer file
  # (it names the git dir whose config applies), act outside the sandbox
  # later: land and the next spawn run git there over ssh, unfenced. So none
  # of them is ever writable.
  local kit=("$ob/brief.md" "$ob/claims.txt" "$ob/outbox.env" "$ob/remote-worker.sh")
  local rules=()
  for p in "${_SPAWN_REMOTE_DENY_HOME[@]}"; do rules+=("Edit(/$home/$p)"); done
  for p in "${_SPAWN_REMOTE_DENY_ABS[@]}"; do rules+=("Edit(/$p)"); done
  for p in "${kit[@]}"; do rules+=("Edit(/$p)"); done
  rules+=("Edit(/$clone/.git/config)" "Edit(/$clone/.git/hooks/**)" "Edit(/$wt/.git)")
  if [ "$sandbox_on" = 1 ]; then
    sandbox=$(printf '{"enabled":true,"failIfUnavailable":true,"allowUnsandboxedCommands":false,"filesystem":{"allowWrite":%s,"denyWrite":%s},"network":{"allowAllUnixSockets":false}}' \
      "$(_spawn_json_list "$wt" "$clone" "$ob")" \
      "$(_spawn_json_list "${kit[@]}" "$clone/.git/config" "$clone/.git/hooks" "$wt/.git")")
  else
    sandbox='{"enabled":false}'
  fi
  printf '{"sandbox":%s,"permissions":{"deny":%s}}\n' "$sandbox" "$(_spawn_json_list "${rules[@]}")"
}
