# shellcheck shell=bash
# cfn-tmux-agents: the locked sandbox for claude-kind workers (claude-sub,
# claude-haiku, or any --bin whose engine is claude). Fenced engines (glm,
# glm-open) get only the Edit/Write deny rules with the sandbox off: see
# execute.sh cmd_spawn. Owner-approved
# 2026-11-16.
#
# Why: claude engines run --permission-mode bypassPermissions on the user's
# normal settings, where allowUnsandboxedCommands defaults to true and bypass
# mode auto-approves a dangerouslyDisableSandbox run. A worker tricked by
# what it reads could leave the sandbox and run anything, sudo included.
# Workers now get the same locked --settings cfn-fleet host workers get, built
# by the shared cfn-scripts/sandbox-settings.sh (sourced by execute.sh):
#   - Bash runs sandboxed or not at all (failIfUnavailable, no unsandboxed
#     escape), no unix sockets (no Docker, no local DB stack).
#   - Bash writes only to the repo (plus its shared git dir for a linked
#     worktree), the worker outbox, and any TMUX_AGENTS_ALLOW_WRITE path.
#   - Never writable, by Bash or by Edit/Write: the repo's git hooks and
#     config, its Claude settings, hooks and .mcp.json, and in $HOME the
#     Claude config, credentials, shell startup files and PATH bin dirs.
# Spawn refuses (66) when this machine cannot build the sandbox, unless
# TMUX_AGENTS_UNSANDBOXED=1 (then the sandbox is off with a WARN and only the
# Edit/Write deny rules fence the worker), mirroring FLEET_REMOTE_UNSANDBOXED.

# Under $HOME: directories (whole subtree) and single files.
_TA_SBX_DENY_HOME_DIRS=(
  .claude .ssh .aws .gnupg .docker .config/gh .config/git .config/cfn-mailbox
  .config/systemd .local/bin .cargo/bin .nvm
)
_TA_SBX_DENY_HOME_FILES=(
  .bashrc .bash_profile .bash_login .bash_logout .profile
  .zshrc .zshenv .zprofile .zlogin .gitconfig .npmrc
)
# Under the repo toplevel.
_TA_SBX_DENY_REPO_DIRS=(.claude/hooks)
_TA_SBX_DENY_REPO_FILES=(.claude/settings.json .claude/settings.local.json .mcp.json)

# _ta_sandbox_gate NAME DRY_RUN -> sets _TA_SBX_ON (1 sandbox on, 0 off).
# Dies 66 when the sandbox cannot be built and TMUX_AGENTS_UNSANDBOXED is not
# 1. Dry-run only warns that a live spawn would refuse.
_ta_sandbox_gate() {
  local name="$1" dry_run="$2"
  _TA_SBX_ON=1
  cfn_sandbox_local_probe && return 0
  if [ "${TMUX_AGENTS_UNSANDBOXED:-0}" = 1 ]; then
    echo "WARN spawn: running $name WITHOUT the Bash sandbox (TMUX_AGENTS_UNSANDBOXED=1; $CFN_SANDBOX_WHY); only the Edit/Write deny list fences it" >&2
    _TA_SBX_ON=0
    return 0
  fi
  if [ "$dry_run" = 1 ]; then
    echo "WARN spawn: a live spawn of $name would refuse: this machine cannot build Claude Code's Bash sandbox ($CFN_SANDBOX_WHY)" >&2
    return 0
  fi
  _ta_die 66 "spawn: this machine cannot build Claude Code's Bash sandbox for claude worker $name: $CFN_SANDBOX_WHY. Fix: $CFN_SANDBOX_FIX. Or set TMUX_AGENTS_UNSANDBOXED=1 to run without it (Edit/Write deny rules still apply)"
}

# _ta_sandbox_outbox SOCK NAME -> the worker outbox path (not created).
# TMUX_AGENTS_OUTBOX_ROOT (default /tmp/tmux-agents-<uid>)/<sock>/<name>.
_ta_sandbox_outbox() {
  printf '%s/%s/%s\n' "${TMUX_AGENTS_OUTBOX_ROOT:-/tmp/tmux-agents-$(id -u)}" "$1" "$2"
}

# _ta_sandbox_extra_allow -> sets _TA_SBX_EXTRA (caller scope) to the
# validated TMUX_AGENTS_ALLOW_WRITE entries (colon list). Call it outside a
# subshell: it dies 64 naming a bad entry. Each must be an absolute safe path
# with no . or .. segment, and never / or $HOME itself.
_ta_sandbox_extra_allow() {
  local raw="${TMUX_AGENTS_ALLOW_WRITE:-}" e
  local -a entries=()
  _TA_SBX_EXTRA=()
  [ -n "$raw" ] || return 0
  IFS=: read -r -a entries <<< "$raw"
  for e in "${entries[@]}"; do
    [ -n "$e" ] || continue
    e="${e%/}"
    if [ -z "$e" ] || ! cfn_sandbox_safe_path "$e" || [[ "$e/" == *"/./"* || "$e/" == *"/../"* ]] \
        || [ "$e" = "$HOME" ]; then
      _ta_die 64 "spawn: TMUX_AGENTS_ALLOW_WRITE entry '$e' refused (absolute path of letters, digits, . _ - /, no . or .. segment, not / or \$HOME)"
    fi
    _TA_SBX_EXTRA+=("$e")
  done
}

# _ta_sandbox_settings CWD OUTBOX SANDBOX_ON -> the --settings JSON, one
# line; _TA_SBX_EXTRA (from _ta_sandbox_extra_allow) joins allowWrite.
# rc 1 (message on stderr) when a path is not safe to embed.
_ta_sandbox_settings() {
  local cwd="$1" ob="$2" on="$3" top common p
  local -a allow=() dw=() rules=()
  top=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || top=$(cd -P "$cwd" && pwd -P)
  common=$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || common="$top/.git"
  [ -n "$common" ] || common="$top/.git"
  # OUTBOX may be empty: a fenced worker (glm, glm-open) has none.
  for p in "$top" "$common" ${ob:+"$ob"} "$HOME"; do
    cfn_sandbox_safe_path "$p" || { echo "spawn: path not safe to put in the sandbox settings: $p" >&2; return 1; }
  done
  allow=("$top")
  # A linked worktree commits into the main repo's git dir: writable, but
  # never its config, its hooks, or the worktree's .git pointer file.
  if [ "$common" != "$top/.git" ]; then
    allow+=("$common")
    dw+=("$top/.git")
    rules+=("Edit(/$top/.git)")
  fi
  allow+=(${ob:+"$ob"} ${_TA_SBX_EXTRA[@]+"${_TA_SBX_EXTRA[@]}"})
  dw+=("$common/config" "$common/hooks")
  rules+=("Edit(/$common/config)" "Edit(/$common/hooks/**)")
  for p in "${_TA_SBX_DENY_REPO_FILES[@]}"; do dw+=("$top/$p"); rules+=("Edit(/$top/$p)"); done
  for p in "${_TA_SBX_DENY_REPO_DIRS[@]}"; do dw+=("$top/$p"); rules+=("Edit(/$top/$p/**)"); done
  for p in "${_TA_SBX_DENY_HOME_FILES[@]}"; do dw+=("$HOME/$p"); rules+=("Edit(/$HOME/$p)"); done
  for p in "${_TA_SBX_DENY_HOME_DIRS[@]}"; do dw+=("$HOME/$p"); rules+=("Edit(/$HOME/$p/**)"); done
  cfn_sandbox_settings_json "$on" --allow "${allow[@]}" --deny-write "${dw[@]}" --rules "${rules[@]}"
}
