# shellcheck shell=bash
# sandbox-settings.sh: the one builder for the locked Claude Code --settings
# JSON that fences a worker session. Sourced by cfn-fleet
# (lib/spawn-remote.sh, host workers) and cfn-tmux-agents (lib/sandbox.sh,
# local claude workers). Functions and constants only; prints nothing when
# sourced.
#
# The lock (owner-approved for tmux workers 2026-11-16, fleet hosts earlier,
# planning/PLAN_fleet-host-sandbox.md):
#   sandbox.enabled true, failIfUnavailable true (a broken sandbox stops
#   claude instead of running unconfined), allowUnsandboxedCommands false (no
#   dangerouslyDisableSandbox escape, which bypassPermissions would otherwise
#   auto-approve), filesystem allowWrite/denyWrite from the caller, network
#   allowAllUnixSockets false (no docker.sock). permissions.deny carries the
#   caller's Edit(...) rules, which fence the Edit/Write tools as well and
#   still apply when the sandbox is off.

# Fix commands printed when a host cannot fence a worker (Ubuntu 24.04 blocks
# unprivileged user namespaces for bwrap unless an AppArmor profile allows it).
# shellcheck disable=SC2034  # read by the sourcing skills
CFN_SANDBOX_FIX_BWRAP="sudo apt install bubblewrap, then allow it user namespaces: printf 'abi <abi/4.0>,\\ninclude <tunables/global>\\nprofile bwrap /usr/bin/bwrap flags=(unconfined) {\\n  userns,\\n}\\n' | sudo tee /etc/apparmor.d/bwrap && sudo apparmor_parser -r /etc/apparmor.d/bwrap (check: bwrap --ro-bind / / true)"
# shellcheck disable=SC2034
CFN_SANDBOX_FIX_SOCAT="sudo apt install socat (Claude Code's Linux sandbox needs it for its network proxy)"

# cfn_sandbox_safe_path P: 0 when P is absolute and holds only letters,
# digits, . _ - /. Paths go into JSON strings and a single-quoted shell word
# unescaped, so a quote, backslash or space must never reach them.
cfn_sandbox_safe_path(){
  [[ "${1:-}" =~ ^/[A-Za-z0-9._/-]+$ ]]
}

# cfn_json_list ITEM... -> ["a","b"]. Items must be pre-validated (no
# quote, backslash or control character; the one exception is cfn-fleet's
# deliberate \u escapes in its /tmp/mdtwii-* rules, which are valid JSON).
cfn_json_list(){
  local out="" x
  for x in "$@"; do out+="${out:+,}\"$x\""; done
  printf '[%s]' "$out"
}

# cfn_sandbox_settings_json SANDBOX_ON --allow PATH... --deny-write PATH...
#   --rules RULE... -> the --settings JSON on stdout, one line.
# SANDBOX_ON 1 writes the locked sandbox block; anything else writes
# {"enabled":false} (an explicit opt-out) and keeps the deny rules. Items are
# embedded unescaped: the caller validates them (cfn_sandbox_safe_path).
cfn_sandbox_settings_json(){
  local on="$1" mode="" sandbox
  local -a allow=() dw=() rules=()
  shift
  while [ $# -gt 0 ]; do
    case "$1" in
      --allow|--deny-write|--rules) mode="$1" ;;
      *) case "$mode" in
           --allow) allow+=("$1") ;;
           --deny-write) dw+=("$1") ;;
           --rules) rules+=("$1") ;;
           *) echo "cfn_sandbox_settings_json: item '$1' before --allow/--deny-write/--rules" >&2; return 1 ;;
         esac ;;
    esac
    shift
  done
  if [ "$on" = 1 ]; then
    sandbox=$(printf '{"enabled":true,"failIfUnavailable":true,"allowUnsandboxedCommands":false,"filesystem":{"allowWrite":%s,"denyWrite":%s},"network":{"allowAllUnixSockets":false}}' \
      "$(cfn_json_list ${allow[@]+"${allow[@]}"})" \
      "$(cfn_json_list ${dw[@]+"${dw[@]}"})")
  else
    sandbox='{"enabled":false}'
  fi
  printf '{"sandbox":%s,"permissions":{"deny":%s}}\n' "$sandbox" "$(cfn_json_list ${rules[@]+"${rules[@]}"})"
}

# cfn_sandbox_local_probe -> rc 0 when THIS machine can build Claude Code's
# Bash sandbox, else rc 1 with CFN_SANDBOX_WHY / CFN_SANDBOX_FIX set (caller
# scope, "; "-joined). Linux: bwrap must create a namespace and socat must
# exist (the same checks cfn-fleet's host preflight runs over ssh). macOS:
# sandbox-exec must exist. Both tools resolve through PATH, so tests stub them.
cfn_sandbox_local_probe(){
  CFN_SANDBOX_WHY="" CFN_SANDBOX_FIX=""
  case "$(uname -s)" in
    Linux)
      bwrap --ro-bind / / true >/dev/null 2>&1 \
        || { CFN_SANDBOX_WHY+="bwrap cannot create a sandbox; "; CFN_SANDBOX_FIX+="$CFN_SANDBOX_FIX_BWRAP; "; }
      command -v socat >/dev/null 2>&1 \
        || { CFN_SANDBOX_WHY+="socat is missing; "; CFN_SANDBOX_FIX+="$CFN_SANDBOX_FIX_SOCAT; "; }
      ;;
    Darwin)
      command -v sandbox-exec >/dev/null 2>&1 \
        || { CFN_SANDBOX_WHY+="sandbox-exec is missing; "; CFN_SANDBOX_FIX+="restore /usr/bin/sandbox-exec (part of macOS); "; }
      ;;
    *)
      CFN_SANDBOX_WHY+="Claude Code has no Bash sandbox on $(uname -s); "
      CFN_SANDBOX_FIX+="run workers on Linux or macOS; "
      ;;
  esac
  CFN_SANDBOX_WHY="${CFN_SANDBOX_WHY%; }" CFN_SANDBOX_FIX="${CFN_SANDBOX_FIX%; }"
  [ -z "$CFN_SANDBOX_WHY" ]
}
