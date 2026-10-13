# spawn-env.sh: hand an engine's env vars to a tmux pane without putting any
# value on a command line. Sourced by cfn-fleet (lib/cmd-spawn.sh) and
# cfn-tmux-agents (execute.sh).
#
# Why: `tmux new-session -e K=V` stores K=V in argv, and when that client
# starts the server, the server keeps that argv for its whole life. argv is
# readable by every process on the Mac (`ps -axww`), so a z.ai key passed
# that way leaked to every user and process (reported 2026-10-11).
#
# Live launch: cfn_spawn_launch_write puts the resolved NAME=VALUE lines and
# the pane command in a 0600 script inside a fresh 0700 dir; only a short
# `. <script>` is typed into the pane, and the script deletes the dir first.
# Print-only modes (--no-tmux, --dry-run): literal values may ride -e, but
# $SOURCE_VAR (secret) values never print; the pane prompts for them
# silently instead.

# cfn_spawn_launch_write ENV_LINES PANE_CMD -> sets CFN_SPAWN_ENV_DIR and
# CFN_SPAWN_LAUNCH_LINE (`. '<dir>/launch'`, the only text typed into the
# pane). The 0600 script clears the launching Claude session's env
# (CLAUDECODE, CLAUDE_CODE_*, CLAUDE_PID/TMPDIR/EFFORT), exports ENV_LINES,
# deletes its own 0700 dir, then runs PANE_CMD. rc 1 on any failure, with nothing left on disk. Not a
# subshell, so the caller can remove CFN_SPAWN_ENV_DIR if the pane never
# gets to source it.
#
# Why a script and not a typed prefix: a fresh pty on macOS silently drops
# typed input past ~1024 bytes (MAX_CANON), and a fleet glm pane command is
# ~1.5KB. The tail (`exec claude ...`) was lost and the wrapped echo matched
# the banner regex (reported 2026-10-12). The typed line stays ~80 bytes and
# carries no engine text, so its echo cannot match a banner. If the script
# is gone, `.` fails, the pane stays at its prompt and spawn times out at the
# banner: no engine ever starts without its env.
cfn_spawn_launch_write() {
  local lines="$1" pane_cmd="$2" dir line name val
  CFN_SPAWN_ENV_DIR="" CFN_SPAWN_LAUNCH_LINE=""
  dir=$(umask 077 && mktemp -d "${TMPDIR:-/tmp}/cfn-spawn-launch.XXXXXX") || return 1
  case "$dir" in *"'"*) rm -rf "$dir"; echo "spawn-env: temp path has a quote: $dir" >&2; return 1 ;; esac
  if ! (
    umask 077
    # Clear the launching Claude session's own env first: the tmux server
    # copies it into every pane, so workers ran as that session's child
    # (transcripts off, its messaging socket and token, its session id).
    # Engine set-vars below are exported after this, so they survive.
    printf '%s\n' 'for _cfn_v in $(env | sed -n "s/^\(CLAUDE_CODE_[A-Za-z0-9_]*\)=.*/\1/p"); do unset "$_cfn_v"; done' \
      'unset _cfn_v CLAUDECODE CLAUDE_PID CLAUDE_TMPDIR CLAUDE_EFFORT' > "$dir/launch"
    while IFS= read -r line || [ -n "$line" ]; do
      [ -n "$line" ] || continue
      name="${line%%=*}"
      val="${line#*=}"
      [[ $name =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "spawn-env: bad var name '$name'" >&2; exit 1; }
      printf 'export %s=%q\n' "$name" "$val"
    done <<< "$lines" >> "$dir/launch"
    # The shell already holds the script open, so deleting it here is safe.
    printf "rm -rf '%s'\n%s\n" "$dir" "$pane_cmd" >> "$dir/launch"
  ); then
    rm -rf "$dir"
    return 1
  fi
  CFN_SPAWN_ENV_DIR="$dir"
  CFN_SPAWN_LAUNCH_LINE=". '$dir/launch'"
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
