#!/usr/bin/env bash
# codex-mail.sh: start the Codex CLI as a mailbox session (Codex has no hooks, so this does what the
# Claude hooks do: register the tmux pane, keep the heartbeat fresh, keep idle/busy state).
#
#   codex-mail.sh [--name NAME] [-- codex args...]
#   codex-mail.sh --notify NAME [JSON]     (called by Codex after each turn; not for humans)
#
# NAME is [a-z0-9-]; default <project>-cx-<4 hex>. Run it inside tmux: mail wakes the pane only there.
# Codex runs in the foreground with network access for its sandbox, the mailbox cache writable
# (so `mailbox.sh read` can record what it showed), and a notify hook that marks the session idle
# after each turn. OPENAI_API_KEY is unset so Codex bills the subscription.
#
# Test hooks (not config): CODEX_BIN replaces the codex binary; CODEX_MAIL_HEARTBEAT_SECS the
# heartbeat interval (default 60).
# Sourcing mailbox.sh turns on `set -e`; this script handles failures itself.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
SELF="$SELF_DIR/$(basename "${BASH_SOURCE[0]}")"
# shellcheck source=mailbox.sh
. "$SELF_DIR/mailbox.sh"
set +e

HEARTBEAT_SECS="${CODEX_MAIL_HEARTBEAT_SECS:-60}"
REGISTER_TRIES=3
SESSION_SUFFIX="cx"

# write_state NAME WORD: the file the watcher reads (idle|busy|gone <epoch>), written atomically.
write_state() {
  local f="$CACHE_DIR/state-$1"
  ensure_cache_dir || return 0
  printf '%s %s\n' "$2" "$(date +%s)" > "$f.$$" 2>/dev/null && mv -f "$f.$$" "$f" 2>/dev/null || rm -f "$f.$$" 2>/dev/null
  return 0
}

# --notify NAME [JSON]: Codex calls this after each turn. Only agent-turn-complete marks idle.
if [ "${1:-}" = --notify ]; then
  n="${2:-}"; payload="${3:-}"
  valid_name "$n" || exit 0
  case "$payload" in *'"agent-turn-complete"'*) write_state "$n" idle ;; esac
  exit 0
fi

# ----- launcher

name=""
while [ $# -gt 0 ]; do
  case "$1" in
    --name) [ $# -ge 2 ] || { echo "codex-mail: --name needs a value" >&2; exit 2; }; name="$2"; shift 2 ;;
    --) shift; break ;;
    *) echo "codex-mail: unknown argument $1 (codex args go after --)" >&2; exit 2 ;;
  esac
done
if [ -n "$name" ] && ! valid_name "$name"; then
  echo "codex-mail: invalid name '$name' (use [a-z0-9-] only)" >&2; exit 2
fi

project="$(resolve_project "$PWD")"
random_name() { printf '%s-%s-%04x' "$project" "$SESSION_SUFFIX" $((RANDOM % 65536)) | cut -c1-64; }
[ -n "$name" ] || name="$(random_name)"

tmux_target=""
if [ -n "${TMUX_PANE:-}" ]; then
  sock="$(tmux display -p '#{socket_path}' 2>/dev/null)"
  [ -n "$sock" ] && tmux_target="$sock|$TMUX_PANE"
fi
if [ -z "$tmux_target" ]; then
  echo "codex-mail: no automatic wake-ups outside tmux; mail is still readable by hand" >&2
fi

# beat: refresh this session's directory entry (same args at register time and in the keeper).
beat() {
  local -a args=(heartbeat --project "$project" --summary codex)
  [ -z "$tmux_target" ] || args+=(--tmux "$tmux_target")
  MAILBOX_SESSION="$name" bash "$SELF_DIR/mailbox.sh" "${args[@]}" >/dev/null 2>"${BEAT_ERR:-/dev/null}"
}

registered=""
i=0
while [ "$i" -lt "$REGISTER_TRIES" ]; do
  i=$((i + 1))
  beat; rc=$?
  if [ "$rc" = 0 ]; then registered=yes; break; fi
  if [ "$rc" = 23 ]; then name="$(random_name)"; continue; fi
  break
done
[ -n "$registered" ] || echo "codex-mail: could not register $name in the mailbox directory (exit ${rc:-?}); starting codex anyway" >&2

ensure_cache_dir || true
printf 'codex\n' > "$CACHE_DIR/client-$name" 2>/dev/null || true
write_state "$name" idle
# Owner from the config, in a subshell: a missing config must not stop the launch.
owner="$( (load_config >/dev/null 2>&1 && printf '%s' "$MAILBOX_OWNER") || true)"
echo "codex mail name: $name (reply address ${owner:-<owner>}/s/$name)"

KEEPER=""
cleanup() {
  trap - EXIT INT TERM
  [ -z "$KEEPER" ] || kill "$KEEPER" 2>/dev/null
  rm -f "$CACHE_DIR/client-$name" 2>/dev/null
  write_state "$name" gone
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Keeper: refreshes the heartbeat while this launcher (and so codex) lives.
LAUNCHER_PID=$$
(
  while kill -0 "$LAUNCHER_PID" 2>/dev/null; do
    sleep "$HEARTBEAT_SECS"
    kill -0 "$LAUNCHER_PID" 2>/dev/null || break
    beat
  done
) >/dev/null 2>&1 &
KEEPER=$!

# Foreground, not exec: the cleanup above must run when codex exits.
env -u OPENAI_API_KEY MAILBOX_SESSION="$name" MAILBOX_CLIENT=codex "${CODEX_BIN:-codex}" \
  -c 'sandbox_workspace_write.network_access=true' \
  -c "sandbox_workspace_write.writable_roots=[\"$CACHE_DIR\"]" \
  -c "notify=[\"bash\",\"$SELF\",\"--notify\",\"$name\"]" \
  "$@"
exit $?
