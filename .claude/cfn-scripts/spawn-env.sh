# spawn-env.sh: hand an engine's env vars to a tmux pane without putting any
# value on a command line. Sourced by cfn-fleet (lib/cmd-spawn.sh) and
# cfn-tmux-agents (execute.sh).
#
# Why: `tmux new-session -e K=V` stores K=V in argv, and when that client
# starts the server, the server keeps that argv for its whole life. argv is
# readable by every process on the Mac (`ps -axww`), so a z.ai key passed
# that way leaked to every user and process (reported 2026-10-11).
#
# Live launch: cfn_spawn_env_write puts the resolved NAME=VALUE lines in a
# 0600 file inside a fresh 0700 dir; the pane shell sources it and deletes
# the dir before exec. Print-only modes (--no-tmux, --dry-run): literal values
# may ride -e, but $SOURCE_VAR (secret) values never print; the pane prompts
# for them silently instead.

# cfn_spawn_env_write LINES -> sets CFN_SPAWN_ENV_DIR and CFN_SPAWN_ENV_PREFIX
# (the pane-shell prefix, empty when LINES is empty). rc 1 on any failure,
# with nothing left on disk. Not a subshell, so the caller can remove
# CFN_SPAWN_ENV_DIR if the pane never gets to source it.
cfn_spawn_env_write() {
  local lines="$1" dir line name val
  CFN_SPAWN_ENV_DIR="" CFN_SPAWN_ENV_PREFIX=""
  [ -n "$lines" ] || return 0
  dir=$(umask 077 && mktemp -d "${TMPDIR:-/tmp}/cfn-spawn-env.XXXXXX") || return 1
  case "$dir" in *"'"*) rm -rf "$dir"; echo "spawn-env: temp path has a quote: $dir" >&2; return 1 ;; esac
  if ! (
    umask 077
    while IFS= read -r line || [ -n "$line" ]; do
      [ -n "$line" ] || continue
      name="${line%%=*}"
      val="${line#*=}"
      [[ $name =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "spawn-env: bad var name '$name'" >&2; exit 1; }
      printf 'export %s=%q\n' "$name" "$val"
    done <<< "$lines" > "$dir/env"
  ); then
    rm -rf "$dir"
    return 1
  fi
  CFN_SPAWN_ENV_DIR="$dir"
  # Fail closed: a pane that cannot load its env exits instead of starting
  # the engine against the wrong account.
  CFN_SPAWN_ENV_PREFIX="{ . '$dir/env' && rm -rf '$dir'; } || exit 1; "
}

# cfn_spawn_env_literal_flags RAW_COMMA_LIST -> ` -e "K=V"` for items whose
# value is a literal (safe to print and to pass on argv).
cfn_spawn_env_literal_flags() {
  local item out=""
  while IFS= read -r item || [ -n "$item" ]; do
    [ -n "$item" ] || continue
    case "${item#*=}" in \$*) continue ;; esac
    out+=" -e \"$item\""
  done < <(printf '%s' "$1" | tr ',' '\n')
  printf '%s' "$out"
}

# cfn_spawn_env_secret_prompt RAW_COMMA_LIST -> pane-shell prefix that reads
# each $SOURCE_VAR item silently (`read -rs`, no echo, no history).
cfn_spawn_env_secret_prompt() {
  local item name out=""
  while IFS= read -r item || [ -n "$item" ]; do
    [ -n "$item" ] || continue
    case "${item#*=}" in \$*) ;; *) continue ;; esac
    name="${item%%=*}"
    out+="IFS= read -rs $name && export $name; "
  done < <(printf '%s' "$1" | tr ',' '\n')
  printf '%s' "$out"
}

# cfn_spawn_env_secret_notes RAW_COMMA_LIST -> one `#` line per secret item,
# naming the source var whose value to paste at the silent prompt.
cfn_spawn_env_secret_notes() {
  local item
  while IFS= read -r item || [ -n "$item" ]; do
    [ -n "$item" ] || continue
    case "${item#*=}" in
      \$*) echo "# the pane waits silently for ${item%%=*}: paste the value of ${item#*=} there (never on a command line)" ;;
    esac
  done < <(printf '%s' "$1" | tr ',' '\n')
}
