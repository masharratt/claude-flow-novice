#!/usr/bin/env bash
# cfn-tmux-agents: launch and drive subagent sessions in tmux without the
# fleet roster. One tmux server per lane (tmux-agents-NAME; legacy shared
# socket tmux-agents still read), one session per agent, prompts
# delivered literally via send-keys. Ported from cfn-fleet spawn mechanics.
#
# Exit codes: 0 ok | 64 usage | 3 tmux missing | 65 unknown engine/session
#             66 env/guard refusal or launch failure | 68 banner timeout
#             69 prompt typed but not submitted (session left alive)

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$SKILL_DIR/lib/common.sh"
# shellcheck source=lib/engines.sh
. "$SKILL_DIR/lib/engines.sh"
# spawn-env.sh: engine env reaches the pane through a 0600 file, never argv
# (shared with cfn-fleet; the file explains the leak it closes).
# shellcheck source=../../cfn-scripts/spawn-env.sh
. "$(cd "$SKILL_DIR/../../cfn-scripts" && pwd)/spawn-env.sh"
# open-dirs.sh: glm-open's per-project folder list (shared with zai-fence.sh
# and cfn-fleet), so a project that has not opted in is refused up front.
# shellcheck source=../../cfn-scripts/lib/open-dirs.sh
. "$(cd "$SKILL_DIR/../../cfn-scripts/lib" && pwd)/open-dirs.sh"
# First-prompt ready check + send + landing check, shared with cfn-fleet.
# shellcheck source=../../cfn-scripts/lib/tui-prompt.sh
. "$(cd "$SKILL_DIR/../../cfn-scripts/lib" && pwd)/tui-prompt.sh"
# stat shim for BSD/macOS (defines nothing on Linux); watch reads file mtimes.
# shellcheck source=../../helpers/cfn-portable.sh
. "$(cd "$SKILL_DIR/../../helpers" && pwd)/cfn-portable.sh" 2>/dev/null || true
# Security review round 2: inherited GIT_DIR / GIT_WORK_TREE etc. would pick
# the launch folder (default --cwd = git toplevel) and the glm-open policy
# repo. Scrub them before any git call. Word splitting is intended.
# shellcheck disable=SC2086
unset $CFN_GIT_REDIRECT_VARS
# sandbox-settings.sh: the locked --settings builder shared with cfn-fleet
# host workers; lib/sandbox.sh picks the paths for a local claude worker.
# shellcheck source=../../cfn-scripts/sandbox-settings.sh
. "$(cd "$SKILL_DIR/../../cfn-scripts" && pwd)/sandbox-settings.sh"
# shellcheck source=lib/sandbox.sh
. "$SKILL_DIR/lib/sandbox.sh"
# shellcheck source=lib/cargo-target.sh
. "$SKILL_DIR/lib/cargo-target.sh"

TA_SOCK=""
TA_WHERE=""

_ta_usage() {
  cat <<'EOF'
Usage: execute.sh <command> [options]

Commands:
  spawn NAME [--engine claude|claude-sub|glm|glm-open|codex] [--model M] [--cwd DIR]
        [--prompt TEXT | --prompt-file PATH] [--dry-run] [--no-sandbox]
        [--bin PATH] [--args STR] [--banner-regex RE]
        [--trust-timeout S] [--banner-timeout S]
        [--socket SOCK]
  send NAME TEXT... [--socket SOCK]
  status [NAME] [--socket SOCK]
  capture NAME [--lines N] [--socket SOCK]
  list [--socket SOCK]
  kill NAME | --all [--socket SOCK]
  watch NAME --result PATH --notify ADDR [--idle-min N] [--interval S]
        [--detach] [--socket SOCK]

Engines (default claude-sub):
  claude-sub  claude --model sonnet --permission-mode bypassPermissions
              (unsets ANTHROPIC_* relay vars: subscription billing)
  glm         claude via z.ai (needs TMUX_AGENTS_ZAI_TOKEN, or
              FLEET_ZAI_TOKEN / ZAI_TOKEN which the skill picks up);
              runs inside zai-fence.sh, confined to its project
  glm-open    glm plus extra read+write folders listed in the project's
              committed .claude/glm-open-dirs; refused (66) without it
  codex       codex --sandbox workspace-write --ask-for-approval never
              (unsets OPENAI_API_KEY: ChatGPT-plan billing; requires a
              literal codex=true line in the target project's CLAUDE.md)
  codex-render  codex --sandbox danger-full-access --ask-for-approval never
              (same gate and billing; for lanes that run a local server plus
              Chrome; the sandbox is off, pick it on purpose)

Env knobs: TMUX_AGENTS_SOCKET, TMUX_AGENTS_TRUST_TIMEOUT (15),
  TMUX_AGENTS_BANNER_TIMEOUT (20), TMUX_AGENTS_AUTH_TIMEOUT (12)
EOF
}

# _ta_strip_socket ARGV... — pull --socket/--socket= out of the args into
# TA_SOCK, echo the rest one per line-safe NUL? Args with newlines are not a
# target; use argv echoing via printf and caller re-reads with mapfile.
_ta_next_arg() { # _ta_next_arg FLAG NAME — die 2 when a flag lacks its value
  [ $# -ge 2 ] || _ta_die 64 "$1 needs a value"
}

cmd_spawn() {
  local name="" engine="" model="" cwd="" prompt="" prompt_file="" dry_run=0 sandbox_off=0
  local bin_ov="" args_ov="" banner_ov="" trust_timeout="" banner_timeout=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --engine)      _ta_next_arg "$1" "${2:-}"; engine="$2"; shift 2 ;;
      --engine=*)    engine="${1#--engine=}"; shift ;;
      --model)       _ta_next_arg "$1" "${2:-}"; model="$2"; shift 2 ;;
      --model=*)     model="${1#--model=}"; shift ;;
      --cwd)         _ta_next_arg "$1" "${2:-}"; cwd="$2"; shift 2 ;;
      --cwd=*)       cwd="${1#--cwd=}"; shift ;;
      --prompt)      _ta_next_arg "$1" "${2:-}"; prompt="$2"; shift 2 ;;
      --prompt=*)    prompt="${1#--prompt=}"; shift ;;
      --prompt-file) _ta_next_arg "$1" "${2:-}"; prompt_file="$2"; shift 2 ;;
      --prompt-file=*) prompt_file="${1#--prompt-file=}"; shift ;;
      --bin)         _ta_next_arg "$1" "${2:-}"; bin_ov="$2"; shift 2 ;;
      --bin=*)       bin_ov="${1#--bin=}"; shift ;;
      --args)        _ta_next_arg "$1" "${2:-}"; args_ov="$2"; shift 2 ;;
      --args=*)      args_ov="${1#--args=}"; shift ;;
      --banner-regex) _ta_next_arg "$1" "${2:-}"; banner_ov="$2"; shift 2 ;;
      --banner-regex=*) banner_ov="${1#--banner-regex=}"; shift ;;
      --trust-timeout) _ta_next_arg "$1" "${2:-}"; trust_timeout="$2"; shift 2 ;;
      --banner-timeout) _ta_next_arg "$1" "${2:-}"; banner_timeout="$2"; shift 2 ;;
      --dry-run)     dry_run=1; shift ;;
      --no-sandbox)  sandbox_off=1; shift ;;
      -*)            _ta_die 64 "spawn: unknown option $1" ;;
      *)             [ -z "$name" ] || _ta_die 64 "spawn: unexpected argument $1"
                     name="$1"; shift ;;
    esac
  done

  [ -n "$name" ] || _ta_die 64 "usage: execute.sh spawn NAME [options]"
  [[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] \
    || _ta_die 64 "spawn: bad session name '$name' (allowed: letters, digits, dot, dash, underscore)"
  # Per-lane server unless a socket was forced (lib/common.sh explains why).
  [ "$TA_FORCED" = 1 ] || TA_SOCK=$(_ta_lane_sock "$name")

  [ "$engine" = "claude" ] && engine="claude-sub"
  [ -n "$engine" ] || engine="claude-sub"
  _ta_engine_row "$engine" >/dev/null \
    || _ta_die 65 "spawn: unknown engine '$engine' (have: $(_ta_engine_list | tr '\n' ' '))"

  local bin args_str unset_raw trust_keys banner_re trust_re
  bin=$(_ta_engine_field "$engine" 2)
  args_str=$(_ta_engine_field "$engine" 3)
  unset_raw=$(_ta_engine_field "$engine" 5)
  trust_keys=$(_ta_engine_field "$engine" 6)
  banner_re=$(_ta_engine_field "$engine" 7)
  # BUG bin-doubled (2026-11-15): glm's args start with the program the
  # zai-fence.sh wrapper runs, so `--engine glm --bin claude` exec'd
  # `claude claude --model ...`. For a fenced engine, a --bin that is not
  # itself the wrapper replaces only that program word INSIDE the fence
  # (zai-fence.sh <bin> <args>): glm never launches unfenced. --args then
  # replaces the rest of the args. A --bin named zai-fence.sh replaces the
  # wrapper, and its args (registry or --args) keep the program word.
  # test_sec_1 (security review 2026-11-16): a --bin named zai-fence.sh would
  # replace the fence itself. Accept it only when it is the real wrapper from
  # this repo (realpath compare); a look-alike `exec "$@"` script is refused.
  # A --bin holding a slash must be absolute: a relative path was checked in
  # this shell's cwd but launched in --cwd, where a look-alike could sit.
  case "$bin_ov" in
    ""|/*) ;;
    */*) _ta_die 66 "spawn: --bin must be an absolute path or a bare command name (got relative '$bin_ov')" ;;
  esac
  if [ -n "$bin_ov" ] && [ "$(basename "$bin_ov")" = "zai-fence.sh" ]; then
    local real_fence ov_real
    real_fence=$(realpath "$SKILL_DIR/../../cfn-scripts/zai-fence.sh" 2>/dev/null) \
      || _ta_die 66 "spawn: cannot resolve the installed zai-fence.sh"
    # resolved through absolute PATH entries only; no cwd-relative fallback
    ov_real=$(_ta_resolve_bin "$bin_ov" 2>/dev/null) && ov_real=$(realpath "$ov_real" 2>/dev/null) || ov_real=""
    [ -n "$ov_real" ] && [ "$ov_real" = "$real_fence" ] \
      || _ta_die 66 "spawn: --bin $bin_ov is not the installed fence $real_fence (a look-alike zai-fence.sh would run the engine unfenced; refused)"
  fi
  # Args are argv WORDS from here on (test_allow_15b): registry args, --args
  # and --model are split on whitespace and later written with printf %q, so
  # `$(...)` or quotes in them can never run as shell in the pane.
  local -a words=()
  if [ -n "$args_ov" ]; then read -r -a words <<< "$args_ov"; else read -r -a words <<< "$args_str"; fi
  if [ -n "$bin_ov" ] && [ "$(basename "$bin")" = "zai-fence.sh" ] \
     && [ "$(basename "$bin_ov")" != "zai-fence.sh" ]; then
    # --bin names the program INSIDE the fence; resolved to an absolute path
    # here (the fence would otherwise look it up on its own PATH).
    local prog
    prog=$(_ta_resolve_bin "$bin_ov") || { [ "$dry_run" = 1 ] && prog="$bin_ov"; } \
      || _ta_die 66 "spawn: --bin '$bin_ov' not found or not executable (absolute PATH entries only)"
    if [ -n "$args_ov" ]; then words=("$prog" ${words[@]+"${words[@]}"})
    else words=("$prog" ${words[@]+"${words[@]:1}"}); fi
    bin_ov=""
  fi
  [ -n "$bin_ov" ] && bin="$bin_ov"
  [ -n "$banner_ov" ] && banner_re="$banner_ov"
  # The prompt text follows the engine, not the launcher: a zai-fence.sh
  # wrapper bin runs the program named by the first word of args.
  local bin_kind
  bin_kind=$(basename "$bin")
  [ "$bin_kind" = "zai-fence.sh" ] && bin_kind=$(basename "${words[0]:-x}")
  case "$bin_kind" in
    claude) trust_re="Do you trust the files in this folder|Yes, I trust this folder" ;;
    codex)  trust_re="trust this folder|work in this folder" ;;
    *)      trust_re="" ;;
  esac

  if [ -n "$model" ]; then
    local -a keep=()
    local p skip=0
    for p in ${words[@]+"${words[@]}"}; do
      if [ "$skip" = 1 ]; then skip=0; continue; fi
      if [ "$p" = "--model" ]; then skip=1; continue; fi
      keep+=("$p")
    done
    words=(${keep[@]+"${keep[@]}"} --model "$model")
  fi

  if [ -z "$cwd" ]; then
    cwd=$(git rev-parse --show-toplevel 2>/dev/null || printf '%s' "$PWD")
  fi
  [ -d "$cwd" ] || _ta_die 64 "spawn: --cwd directory not found: $cwd"

  # Guard rails run before ANY side effect (exit 66 paths). basename match
  # so --bin /path/to/codex gets the same codex guards.
  local bin_name
  bin_name=$(basename "$bin")
  if [ "$bin_name" = "codex" ]; then
    if [ -n "${OPENAI_API_KEY:-}" ]; then
      case ",$unset_raw," in
        *,OPENAI_API_KEY,*) : ;;
        *) _ta_die 66 "spawn: OPENAI_API_KEY is set in the master env but engine '$engine' does not unset it (a set key silently bills the API instead of the ChatGPT plan)" ;;
      esac
    fi
    _ta_codex_flag_check "$cwd"
    _ta_codex_auth_warn
  fi
  # Codex workers never ask for approval, whatever --args said.
  if [ "$bin_kind" = "codex" ]; then
    mapfile -t words < <(_ta_codex_force_args ${words[@]+"${words[@]}"})
    [ "$dry_run" != 1 ] || echo "# codex args: ${words[*]}"
  fi
  [ "$engine" = "claude-sub" ] && _ta_claude_repo_settings_warn "$cwd"
  # glm-open: extra writable folders only for a project that opted in with a
  # committed .claude/glm-open-dirs; refuse here, before any side effect (the
  # fence refuses too, but only inside a pane that then just dies).
  if cfn_open_dirs_wanted "$(_ta_engine_field "$engine" 4)"; then
    local od_root
    od_root=$(cfn_open_dirs_root "$cwd") || _ta_die 66 "spawn: cannot resolve the repo root of $cwd for glm-open"
    cfn_open_dirs_list "$od_root" >/dev/null \
      || _ta_die 66 "spawn: engine '$engine' needs a valid $od_root/$CFN_OPEN_DIRS_FILE (reason above); use engine glm to stay fenced to the project"
  fi

  # Claude-kind workers (claude-sub, claude-haiku, a --bin named claude) run
  # bypassPermissions, so they get the locked sandbox settings
  # (lib/sandbox.sh): no unsandboxed escape, writes fenced to the repo and the
  # worker outbox. Refuses (66) when this machine cannot build the sandbox,
  # unless TMUX_AGENTS_UNSANDBOXED=1.
  # Fenced engines (glm, glm-open: bin is zai-fence.sh) are already inside the
  # fence's own bwrap, where Claude's sandbox cannot start (its --unshare-net
  # needs a netlink socket the fence's seccomp refuses; no socat inside;
  # probed 2026-11-16). They get the sandbox explicitly OFF plus the same
  # Edit/Write deny rules, no host probe, and no outbox (the fence gives them
  # a private /tmp).
  local sbx_settings="" outbox="" sbx_q="" fenced=0 w
  [ "$(basename "$bin")" = "zai-fence.sh" ] && fenced=1
  if [ "$bin_kind" = claude ]; then
    for w in ${words[@]+"${words[@]}"}; do
      case "$w" in
        --settings|--settings=*)
          _ta_die 64 "spawn: --args may not carry --settings for a claude engine (spawn adds the locked sandbox settings itself)" ;;
      esac
    done
    _ta_sandbox_extra_allow
    if [ "$fenced" = 1 ]; then
      _TA_SBX_ON=0
    else
      _ta_sandbox_gate "$name" "$dry_run" "$sandbox_off"
      outbox=$(_ta_sandbox_outbox "$TA_SOCK" "$name")
    fi
    sbx_settings=$(_ta_sandbox_settings "$cwd" "$outbox" "$_TA_SBX_ON") \
      || _ta_die 66 "spawn: could not build the sandbox settings for $name"
    # Single-quoted on purpose: every path in it passed cfn_sandbox_safe_path
    # (no quote, backslash or space), so the JSON stays readable in dry-run.
    sbx_q=" --settings '$sbx_settings'"
  fi

  _ta_zai_token_prefill
  # Resolve now so a missing token still exits 66 before any side effect.
  local resolved set_raw
  resolved=$(_ta_engine_resolve_set "$engine") || exit "$?"
  set_raw=$(_ta_engine_field "$engine" 4)
  [ -z "$outbox" ] || resolved="${resolved:+$resolved$'\n'}TMUX_AGENTS_OUTBOX=$outbox"
  # Per-project opt-in (.claude/cargo-target-root): lane gets its own target
  # dir off the root disk. Refuses (66) an unsafe root before any side effect.
  local cargo_line
  cargo_line=$(_ta_cargo_target_line "$cwd" "$name") \
    || _ta_die 66 "spawn: cargo target root refused (reason above); fix .claude/cargo-target-root or TMUX_AGENTS_CARGO_TARGET_DIR"
  [ -z "$cargo_line" ] || resolved="${resolved:+$resolved$'\n'}$cargo_line"
  [ -z "$cargo_line" ] || [ "$dry_run" != 1 ] || echo "# pane env (launch script): $cargo_line"

  # BUG codex-no-banner (11-04): the pane resolved the engine itself; with
  # codex gone from every PATH, `exec codex` killed the pane and spawn showed
  # only an empty "no banner match". Resolve bin and its #! interpreter here,
  # before any side effect, and exec the absolute path. Dry-run only warns.
  local bin_abs interp
  if bin_abs=$(_ta_resolve_bin "$bin"); then
    interp=$(_ta_shebang_interp "$bin_abs")
    if [ -n "$interp" ] && ! _ta_resolve_bin "$interp" >/dev/null; then
      [ "$dry_run" = 1 ] || _ta_die 66 "spawn: engine '$engine' binary $bin_abs needs interpreter '$interp' (from its #! line), which is not on this shell's PATH"
      echo "WARN spawn: interpreter '$interp' for $bin_abs not on this shell's PATH" >&2
    fi
    bin="$bin_abs"
  else
    [ "$dry_run" = 1 ] || _ta_die 66 "spawn: engine '$engine' binary '$bin' not found or not executable (looked up in this shell's PATH; pass --bin /abs/path)"
    echo "WARN spawn: engine binary '$bin' not found on this shell's PATH" >&2
  fi

  # The pane command: one literal line, exec so the pane dies with the engine.
  local pane_cmd bin_q uv="" u
  bin_q=$(printf '%q' "$bin")
  for w in ${words[@]+"${words[@]}"}; do bin_q+=" $(printf '%q' "$w")"; done
  bin_q+="$sbx_q"
  for u in ${unset_raw//,/ }; do
    [[ "$u" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || _ta_die 65 "spawn: engine '$engine' unset list holds a bad name '$u'"
    uv+=" $u"
  done
  pane_cmd="${uv:+unset$uv; }exec $bin_q"

  [ -n "$trust_timeout" ] || trust_timeout=$(_ta_env_seconds TMUX_AGENTS_TRUST_TIMEOUT 15)
  [ -n "$banner_timeout" ] || banner_timeout=$(_ta_env_seconds TMUX_AGENTS_BANNER_TIMEOUT 20)

  if [ "$dry_run" = 1 ]; then
    # Literal values may ride -e; secret ($SOURCE_VAR) values never print:
    # the pane reads them with a silent prompt.
    cfn_spawn_env_secret_notes "$set_raw"
    [ -z "$outbox" ] || echo "# claude worker sandbox $([ "$_TA_SBX_ON" = 1 ] && echo on || echo OFF); outbox $outbox (mkdir -m 700 it; the pane needs TMUX_AGENTS_OUTBOX=$outbox)"
    [ -z "$sbx_q" ] || [ "$fenced" = 0 ] || echo "# claude worker inside zai-fence: Claude's Bash sandbox off (the fence confines it), Edit/Write deny rules on, no outbox"
    echo "tmux -L $TA_SOCK new-session -d -s $name -c $cwd$(cfn_spawn_env_literal_flags "$set_raw")"
    # \" so the double-quoted line stays copy-pasteable with the settings JSON in it
    echo "tmux -L $TA_SOCK send-keys -t $name -l \"$(cfn_spawn_env_secret_prompt "$set_raw")${pane_cmd//\"/\\\"}\""
    echo "tmux -L $TA_SOCK send-keys -t $name Enter"
    [ -n "$trust_re" ] && echo "# if the trust prompt appears: tmux -L $TA_SOCK send-keys -t $name ${trust_keys//,/ }"
    echo "# after the banner shows (/$banner_re/):"
    echo "tmux -L $TA_SOCK send-keys -t $name -l \"<prompt>\""
    echo "tmux -L $TA_SOCK send-keys -t $name Enter"
    return 0
  fi

  command -v tmux >/dev/null 2>&1 || _ta_die 3 "spawn: tmux not available (use --dry-run for copy-paste commands)"
  # A lane of this name still alive on the legacy shared socket would be
  # shadowed by the new per-lane one (lookups try per-lane first): refuse.
  if [ "$TA_FORCED" != 1 ] && _ta_has "$TA_LEGACY_SOCK" "$name"; then
    _ta_die 66 "spawn: a session '$name' is still alive on the legacy socket $TA_LEGACY_SOCK; kill it or pick another name"
  fi
  _ta_tmux_server_warn "$TA_SOCK"

  if [ -n "$outbox" ]; then
    (umask 077 && mkdir -p "$outbox") && chmod 700 "$outbox" \
      || _ta_die 66 "spawn: could not create the worker outbox $outbox"
  fi
  cfn_spawn_launch_write "$resolved" "$pane_cmd" || _ta_die 66 "spawn: could not write the private launch script for $name"
  if ! tmux -L "$TA_SOCK" new-session -d -s "$name" -c "$cwd"; then
    [ -z "$CFN_SPAWN_ENV_DIR" ] || rm -rf "$CFN_SPAWN_ENV_DIR"
    _ta_die 66 "spawn: tmux new-session failed for $name (duplicate session name? socket: $TA_SOCK)"
  fi
  # Keep a pane that dies before its banner, so its error text and exit
  # status can be printed; switched off again once the banner shows.
  tmux -L "$TA_SOCK" set-option -w -t "$name" remain-on-exit on 2>/dev/null || true
  if ! tmux -L "$TA_SOCK" send-keys -t "$name" -l "$CFN_SPAWN_LAUNCH_LINE"; then
    [ -z "$CFN_SPAWN_ENV_DIR" ] || rm -rf "$CFN_SPAWN_ENV_DIR"
    _ta_die 66 "spawn: could not reach pane $name (session died at launch?)"
  fi
  tmux -L "$TA_SOCK" send-keys -t "$name" Enter

  # Startup gates before the banner poll. Modals can chain (Code Mode, then
  # bypass-permissions accept, then folder trust), so poll in a loop: one
  # poll over every known gate AND the banner; dispatch on the matched line,
  # send the safe key, wait for that screen to clear, poll again. Keys are
  # sent only when a prompt actually shows. Stops at the banner.
  # - codex-cli update modal ("Update available ... Press enter to
  #   continue"): Enter would pick "1. Update now" (surprise npm -g
  #   install), so send "2" (Skip) then Enter. Measured live on 0.153.4.
  # - Claude Code "Code Mode (experimental)" opt-in (2.1.325, 2026-11-16):
  #   "No, start without it / Yes, turn on Code Mode ... Esc to start without
  #   it". Escape always means "start without", whichever row is selected.
  # - bypass-permissions accept ("Yes, I accept") and folder-trust prompts:
  #   engine trust_keys (claude Down,Enter; codex Enter).
  # - Claude Code "Settings Error" (a settings file it cannot read, e.g. one
  #   masked with a device): never answered, spawn fails fast naming the file.
  local gate_re="Update available|Press enter to continue|No, start without it|Settings Error"
  local gate_timeout="$trust_timeout" gate_line gate_i poll_re
  if [ -n "$trust_re" ]; then gate_re+="|$trust_re"; else gate_timeout=5; fi
  [ "$bin_kind" = claude ] && gate_re+="|Yes, I accept"
  poll_re="$gate_re"
  [ -z "$banner_re" ] || poll_re="($gate_re)|($banner_re)"
  for ((gate_i = 0; gate_i < 6; gate_i++)); do
    gate_line=$(_ta_pane_wait "$TA_SOCK" "$name" "$poll_re" "$gate_timeout" || true)
    [ -n "$gate_line" ] || break
    if [ -n "$banner_re" ] && printf '%s\n' "$gate_line" | grep -Eq -- "$banner_re" \
        && ! printf '%s\n' "$gate_line" | grep -Eq -- "$gate_re"; then
      break
    fi
    case "$gate_line" in
      *Settings\ Error*)
        _ta_settings_error_exit "$TA_SOCK" "$name"
        ;;
      *Update\ available*|*Press\ enter*)
        tmux -L "$TA_SOCK" send-keys -t "$name" -l "2"
        sleep 0.3
        tmux -L "$TA_SOCK" send-keys -t "$name" Enter
        ;;
      *No,\ start\ without\ it*)
        sleep "${TMUX_AGENTS_TRUST_SETTLE:-1.5}"  # TUI draws the modal before it reads keys
        tmux -L "$TA_SOCK" send-keys -t "$name" Escape
        ;;
      *)
        if [ -n "$trust_keys" ]; then
          # shellcheck disable=SC2086  # word-split key list is the point
          # The TUI draws the prompt before it reads input; keys sent on first
          # sight were lost live (2026-10-12) and the prompt sat until the
          # banner timeout. TMUX_AGENTS_TRUST_SETTLE (seconds) tunes the wait.
          sleep "${TMUX_AGENTS_TRUST_SETTLE:-1.5}"
          tmux -L "$TA_SOCK" send-keys -t "$name" ${trust_keys//,/ }
        fi
        ;;
    esac
    _ta_gate_cleared "$TA_SOCK" "$name" "$gate_line"
  done

  local banner_line=""
  if [ -n "$banner_re" ]; then
    banner_line=$(_ta_pane_wait "$TA_SOCK" "$name" "$banner_re" "$banner_timeout" || true)
    # zai-fence's secret scan of big opened folders can outlast the banner
    # timeout (MDTWII 2026-11-16: 190s). While the pane is alive and shows a
    # "zai-fence: checking" line, keep waiting, up to TMUX_AGENTS_FENCE_TIMEOUT.
    # BUG glm-settings-error-stall (2026-11-18): that line stays in the
    # scrollback after the engine starts, so a blocking menu drawn below it
    # held this wait for the full 900s. Each round checks the visible screen:
    # a Settings Error fails fast, any other menu ends the wait (dump below).
    local fence_deadline fence_scr
    fence_deadline=$((SECONDS + $(_ta_env_seconds TMUX_AGENTS_FENCE_TIMEOUT 900)))
    while [ -z "$banner_line" ] && [ "$SECONDS" -lt "$fence_deadline" ] \
          && [ "$(tmux -L "$TA_SOCK" display-message -p -t "$name" '#{pane_dead}' 2>/dev/null || echo 1)" != 1 ] \
          && tmux -L "$TA_SOCK" capture-pane -p -S -200 -t "$name" 2>/dev/null | grep -q 'zai-fence: checking'; do
      fence_scr=$(tmux -L "$TA_SOCK" capture-pane -p -t "$name" 2>/dev/null | sed -e 's/\r$//' || true)
      tui_settings_error "$fence_scr" >/dev/null && _ta_settings_error_exit "$TA_SOCK" "$name"
      if tui_blocking_menu "$fence_scr"; then
        echo "spawn: $name: the engine shows a menu waiting for a choice (not a known startup gate); not answering it." >&2
        break
      fi
      banner_line=$(_ta_pane_wait "$TA_SOCK" "$name" "$banner_re" 10 || true)
    done
  fi
  if [ -z "$banner_line" ]; then
    # Blank lines stripped: a dead pane's text sits at the top of a mostly
    # empty screen, and a plain `tail` printed only blanks. `|| true`: under
    # pipefail a vanished session used to abort here with rc 1 and no dump.
    # tmux 3.4 leaves #{pane_dead_status} empty here, so the status comes
    # from its "Pane is dead (status N, ...)" marker line.
    local pane_raw pane_tail dead_status=""
    pane_raw=$(tmux -L "$TA_SOCK" capture-pane -p -S -200 -t "$name" 2>/dev/null \
      | sed -e 's/\r$//' -e 's/[[:space:]]*$//' -e '/^$/d' || true)
    pane_tail=$(printf '%s\n' "$pane_raw" | grep -v '^Pane is dead' | tail -n 10 || true)
    if [ "$(tmux -L "$TA_SOCK" display-message -p -t "$name" '#{pane_dead}' 2>/dev/null || true)" = 1 ]; then
      dead_status=$(printf '%s\n' "$pane_raw" | sed -n 's/^Pane is dead (status \([0-9]*\).*/\1/p' | tail -n 1)
      # tmux can lose the status (child never reaped, no marker line): read it
      # from the zombie pane process instead. See _ta_zombie_exit_status.
      [ -n "$dead_status" ] || dead_status=$(_ta_zombie_exit_status "$(tmux -L "$TA_SOCK" display-message -p -t "$name" '#{pane_pid}' 2>/dev/null || true)" || true)
      echo "spawn: $name: engine exited with status ${dead_status:-unknown} before its banner; last pane lines:" >&2
    else
      echo "spawn: $name: no banner match within ${banner_timeout}s (regex: $banner_re); last pane lines:" >&2
    fi
    printf '%s\n' "${pane_tail:-(pane empty or gone)}" >&2
    # SHADOW: jev classifies the miss tail (logs only); never blocks the dump + exit 68 below.
    tail_file=$(mktemp) || tail_file=""
    if [ -n "$tail_file" ]; then
      printf '%s\n' "$pane_tail" > "$tail_file" 2>/dev/null || true
      timeout 5 "$HOME/.claude/skills/cfn-tmux-agents/lib/jev-outcome.sh" \
        --name "$name" --engine "$engine" --tail-file "$tail_file" >/dev/null 2>&1 || true
      rm -f "$tail_file"
    fi
    tmux -L "$TA_SOCK" kill-session -t "$name" 2>/dev/null || true
    _ta_reap_lane_sock "$TA_SOCK" "$name"
    exit 68
  fi
  tmux -L "$TA_SOCK" set-option -w -t "$name" remain-on-exit off 2>/dev/null || true
  local sbx_note=""
  [ -z "$outbox" ] || sbx_note=" sandbox=$([ "$_TA_SBX_ON" = 1 ] && echo on || echo OFF) outbox=$outbox"
  [ -z "$sbx_q" ] || [ "$fenced" = 0 ] || sbx_note=" sandbox=fence"
  echo "spawned $name engine=$engine cwd=$cwd$sbx_note banner=\"$banner_line\""

  if [ -n "$prompt_file" ]; then
    [ -f "$prompt_file" ] || _ta_die 64 "spawn: --prompt-file not found: $prompt_file"
    [ -n "$prompt" ] && _ta_die 64 "spawn: --prompt and --prompt-file are mutually exclusive"
    prompt=$(cat "$prompt_file")
  fi
  if [ -n "$prompt" ]; then
    # Shared helper (cfn-scripts/lib/tui-prompt.sh): claude kinds wait for the
    # real input box (dismissing the flicker-free opt-in modal), then type,
    # Enter, and require the prompt to LAND (echoed above the input line, or a
    # working indicator). tmux-agents knobs map onto the helper's.
    local send_rc=0 ready_wait=0
    [ "$bin_kind" != claude ] || ready_wait=1
    TUI_READY_WAIT=$ready_wait \
    TUI_READY_TIMEOUT=$(_ta_env_seconds TMUX_AGENTS_READY_TIMEOUT 12) \
    TUI_MODAL_SETTLE="${TMUX_AGENTS_TRUST_SETTLE:-1.5}" \
    TUI_SUBMIT_SETTLE="${TMUX_AGENTS_SUBMIT_SETTLE:-1}" \
    TUI_SUBMIT_VERIFY=$(_ta_env_seconds TMUX_AGENTS_SUBMIT_VERIFY 3) \
    TUI_SUBMIT_RETRIES=$(_ta_env_seconds TMUX_AGENTS_SUBMIT_RETRIES 3) \
      tui_send_first_prompt "$TA_SOCK" "$name" "$prompt" || send_rc=$?
    case "$send_rc" in
      0) ;;
      4)
        _ta_settings_error_exit "$TA_SOCK" "$name" ;;
      2)
        echo "spawn: $name: prompt typed but not submitted (input line never cleared after Enter retries). Session left alive; inspect with: execute.sh capture $name --socket $TA_SOCK, or submit with: tmux -L $TA_SOCK send-keys -t $name Enter" >&2
        exit 69 ;;
      3)
        echo "spawn: $name: first prompt did not land (no echo above the input line and no working indicator after Enter retries; a modal or a not-ready TUI swallowed it). Session left alive; inspect with: execute.sh capture $name --socket $TA_SOCK, then resend with: execute.sh send $name \"<prompt>\" --socket $TA_SOCK" >&2
        exit 69 ;;
      *)
        echo "spawn: $name: first prompt could not be sent (tmux send-keys failed; session gone?). Inspect with: execute.sh capture $name --socket $TA_SOCK" >&2
        exit 69 ;;
    esac
  fi

  # Auth probe after the first request: a relay token the banner cannot see
  # surfaces here as a 401 retry loop (cfn-fleet measured 2026-09-09).
  local auth_timeout
  auth_timeout=$(_ta_env_seconds TMUX_AGENTS_AUTH_TIMEOUT 12)
  if [ -n "$prompt" ]; then
    if _ta_pane_wait "$TA_SOCK" "$name" \
        '401 Authentication Failed|Authentication Failed|invalid_api_key|authentication_error' \
        "$auth_timeout" >/dev/null; then
      echo "spawn: WARNING $name: engine reports an authentication failure after the first request (token for engine '$engine' rejected). Fix the source var and respawn." >&2
    fi
  fi
  return 0
}

cmd_send() {
  local name="" text=""
  while [ $# -gt 0 ]; do
    case "$1" in
      -*) _ta_die 64 "send: unknown option $1" ;;
      *)  if [ -z "$name" ]; then name="$1"; else text="${text:+$text }$1"; fi; shift ;;
    esac
  done
  [ -n "$name" ] && [ -n "$text" ] || _ta_die 64 "usage: execute.sh send NAME TEXT..."
  _ta_use_lane "$name" && tmux -L "$TA_SOCK" has-session -t "$name" 2>/dev/null \
    || _ta_die 65 "send: no session '$name' on ${TA_WHERE:-socket $TA_SOCK}"
  local src=0
  _ta_send_followup "$TA_SOCK" "$name" "$text" || src=$?
  case "$src" in
    0) ;;
    1) _ta_die 1 "send: tmux send-keys to '$name' failed; session gone?" ;;
    *) _ta_die 69 "send: message to '$name' typed but not submitted; the text still sits in its input line after retries" ;;
  esac
  local tail=""; [ "${#text}" -gt 60 ] && tail="..."
  echo "sent $name: ${text:0:60}${tail}"
}

cmd_status() {
  local name="${1:-}"
  if [ -n "$name" ]; then
    local err rc=0 saved="$TA_SOCK"
    # Not found anywhere: classify against the legacy server when it runs
    # (an old lane's dead pane), else report the per-lane socket.
    if ! _ta_use_lane "$name" && tmux -L "$TA_LEGACY_SOCK" ls >/dev/null 2>&1; then
      TA_SOCK="$TA_LEGACY_SOCK"
    fi
    err=$(tmux -L "$TA_SOCK" has-session -t "$name" 2>&1) || rc=$?
    local here="$TA_SOCK"; TA_SOCK="$saved"
    if [ "$rc" -eq 0 ]; then
      echo "$name: alive (socket $here)"
      _ta_pane_raw "$here" "$name" 3 | sed 's/^/  last: /'
      return 0
    fi
    case "$err" in
      *"no server running"*|*"error connecting"*) echo "$name: no server on socket $here" >&2 ;;
      *) echo "$name: DEAD (pane exited)" >&2 ;;
    esac
    return 1
  fi
  local sessions
  sessions=$(_ta_list_sessions) \
    || _ta_die 65 "status: no server on ${TA_WHERE} (nothing spawned)"
  local s any_dead=0
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    cmd_status "$s" || any_dead=1
  done <<< "$sessions"
  return "$any_dead"
}

cmd_capture() {
  local name="" lines=40
  while [ $# -gt 0 ]; do
    case "$1" in
      --lines)  _ta_next_arg "$1" "${2:-}"; lines="$2"; shift 2 ;;
      --lines=*) lines="${1#--lines=}"; shift ;;
      -*)       _ta_die 64 "capture: unknown option $1" ;;
      *)        [ -z "$name" ] || _ta_die 64 "capture: unexpected argument $1"
                name="$1"; shift ;;
    esac
  done
  [ -n "$name" ] || _ta_die 64 "usage: execute.sh capture NAME [--lines N]"
  [[ "$lines" =~ ^[0-9]+$ ]] || _ta_die 64 "capture: --lines expects a number"
  _ta_use_lane "$name" && tmux -L "$TA_SOCK" has-session -t "$name" 2>/dev/null \
    || _ta_die 65 "capture: no session '$name' on ${TA_WHERE:-socket $TA_SOCK}"
  _ta_pane_raw "$TA_SOCK" "$name" "$lines"
}

# _ta_list_sessions — session names on every lane socket (_ta_all_socks),
# one per line, deduplicated; rc 1 when no server answers. Sets TA_WHERE for
# the caller's error message.
_ta_list_sessions() {
  local socks s out="" any=1 got
  if [ "$TA_FORCED" = 1 ]; then
    TA_WHERE="socket $TA_SOCK"
  else
    TA_WHERE="any tmux-agents-* socket or legacy socket $TA_LEGACY_SOCK"
  fi
  socks=$(_ta_all_socks)
  while IFS= read -r s; do
    [ -n "$s" ] || continue
    got=$(tmux -L "$s" ls -F '#S' 2>/dev/null) || continue
    any=0
    out+="$got"$'\n'
  done <<< "$socks"
  [ "$any" = 0 ] || return 1
  printf '%s' "$out" | awk 'NF && !seen[$0]++'
}

cmd_list() {
  _ta_list_sessions || _ta_die 65 "list: no server on ${TA_WHERE} (nothing spawned)"
}

cmd_kill() {
  if [ "${1:-}" = "--all" ]; then
    local socks s n=0
    socks=$(_ta_all_socks)
    while IFS= read -r s; do
      [ -n "$s" ] || continue
      tmux -L "$s" kill-server 2>/dev/null || continue
      n=$((n + 1))
      echo "killed all sessions on socket $s"
      if [ "$TA_FORCED" != 1 ] && [ "$s" != "$TA_LEGACY_SOCK" ]; then
        rm -f -- "$(_ta_sock_dir)/$s"
      fi
    done <<< "$socks"
    [ "$n" -gt 0 ] || _ta_die 65 "kill: no server on ${TA_WHERE:-socket $TA_SOCK}"
    return 0
  fi
  local name="${1:-}"
  [ -n "$name" ] || _ta_die 64 "usage: execute.sh kill NAME | kill --all"
  _ta_use_lane "$name" && tmux -L "$TA_SOCK" kill-session -t "$name" 2>/dev/null \
    || _ta_die 65 "kill: no session '$name' on ${TA_WHERE:-socket $TA_SOCK}"
  _ta_reap_lane_sock "$TA_SOCK" "$name"
  echo "killed $name"
}

# cmd_watch NAME --result PATH --notify ADDR [--idle-min N] [--interval S]
# Rosterless completion watch: ONE mailbox alert when the pane has been idle
# for N minutes and PATH has not been (re)written since the watch started. Exits 0 when PATH is written after start or the
# session ends. Idle = no working line (tui_busy) AND an unchanged screen since
# the last poll; the codex input placeholder proves nothing. Foreground by
# default; --detach re-runs it under nohup/setsid and prints the pid and log.
# TMUX_AGENTS_WATCH_UNIT is seconds per "minute" (60; tests use 1).
cmd_watch() {
  local name="" result="" notify="" idle_min=10 interval=30 detach=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --result)      _ta_next_arg "$1" "${2:-}"; result="$2"; shift 2 ;;
      --result=*)    result="${1#--result=}"; shift ;;
      --notify)      _ta_next_arg "$1" "${2:-}"; notify="$2"; shift 2 ;;
      --notify=*)    notify="${1#--notify=}"; shift ;;
      --idle-min)    _ta_next_arg "$1" "${2:-}"; idle_min="$2"; shift 2 ;;
      --idle-min=*)  idle_min="${1#--idle-min=}"; shift ;;
      --interval)    _ta_next_arg "$1" "${2:-}"; interval="$2"; shift 2 ;;
      --interval=*)  interval="${1#--interval=}"; shift ;;
      --detach)      detach=1; shift ;;
      -*)            _ta_die 64 "watch: unknown option $1" ;;
      *)             [ -z "$name" ] || _ta_die 64 "watch: unexpected argument $1"
                     name="$1"; shift ;;
    esac
  done
  [ -n "$name" ] && [ -n "$result" ] && [ -n "$notify" ] \
    || _ta_die 64 "usage: execute.sh watch NAME --result PATH --notify ADDR [--idle-min N] [--interval S] [--detach]"
  { [[ "$idle_min" =~ ^[0-9]+$ ]] && [ "$idle_min" -ge 1 ]; } || _ta_die 64 "watch: --idle-min expects a whole number of minutes (>= 1)"
  [[ "$interval" =~ ^[0-9]+(\.[0-9]+)?$ ]] || _ta_die 64 "watch: --interval expects seconds"
  local mb="${HOME:-}/.claude/skills/cfn-mailbox/mailbox.sh"
  [ -x "$mb" ] || _ta_die 66 "watch: mailbox not found or not executable: $mb"
  _ta_use_lane "$name" && tmux -L "$TA_SOCK" has-session -t "$name" 2>/dev/null \
    || _ta_die 65 "watch: no session '$name' on ${TA_WHERE:-socket $TA_SOCK}"

  if [ "$detach" = 1 ]; then
    local log
    log="${TMPDIR:-/tmp}/tmux-agents-watch-${name}.log"
    nohup setsid "${BASH_SOURCE[0]}" watch "$name" --socket "$TA_SOCK" --result "$result" \
      --notify "$notify" --idle-min "$idle_min" --interval "$interval" >"$log" 2>&1 </dev/null &
    echo "watch $name detached (pid $!, log $log)"
    return 0
  fi

  local unit limit idle_since scr sum last="" alerted=0
  unit=$(_ta_env_seconds TMUX_AGENTS_WATCH_UNIT 60)
  limit=$((idle_min * unit))
  idle_since=$SECONDS
  # A result counts only if rewritten after this moment: a review round reuses
  # the same file, so one already there at start is ignored. Recorded before the
  # first poll. Whole seconds; a file from the same second as the start counts.
  local start_ts res_ts
  start_ts=$(date +%s)
  while :; do
    if [ -e "$result" ]; then
      res_ts=$(stat -c %Y "$result" 2>/dev/null || echo 0)
      if [[ "$res_ts" =~ ^[0-9]+$ ]] && [ "$res_ts" -ge "$start_ts" ]; then
        echo "watch $name: result written ($result), done"; return 0
      fi
    fi
    if ! tmux -L "$TA_SOCK" has-session -t "$name" 2>/dev/null || _tui_pane_dead "$TA_SOCK" "$name"; then
      echo "watch $name: session ended"; return 0
    fi
    scr=$(_tui_screen "$TA_SOCK" "$name")
    sum=$(printf '%s' "$scr" | cksum)
    if tui_busy "$scr" || [ "$sum" != "$last" ]; then
      idle_since=$SECONDS; last="$sum"
    elif [ "$alerted" = 0 ] && [ $((SECONDS - idle_since)) -ge "$limit" ]; then
      if "$mb" send "$notify" --kind fyi \
          "tmux-agents watch: session '$name' idle for ${idle_min} min and result file missing: $result"; then
        alerted=1
        echo "watch $name: alert sent to $notify"
      else
        echo "watch $name: alert to $notify failed; will retry" >&2
      fi
    fi
    sleep "$interval"
  done
}

main() {
  local -a argv=()
  local sock=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --socket)   _ta_next_arg "$1" "${2:-}"; sock="$2"; shift 2 ;;
      --socket=*) sock="${1#--socket=}"; shift ;;
      *)          argv+=("$1"); shift ;;
    esac
  done
  [ "${#argv[@]}" -gt 0 ] || { _ta_usage >&2; exit 2; }

  if [ -n "$sock" ]; then
    TA_SOCK="${sock//[^A-Za-z0-9_.-]/-}"
    TA_FORCED=1
  else
    TA_SOCK=$(_ta_socket)
    # An explicit TMUX_AGENTS_SOCKET forces one socket, as --socket does.
    [ -z "${TMUX_AGENTS_SOCKET:-}" ] || TA_FORCED=1
  fi
  TA_WHERE="socket $TA_SOCK"
  [ "$TA_FORCED" = 1 ] || TA_WHERE="any tmux-agents-* socket or legacy socket $TA_LEGACY_SOCK"

  local cmd="${argv[0]}"
  shift_argv=("${argv[@]:1}")
  case "$cmd" in
    spawn)   cmd_spawn ${shift_argv[@]+"${shift_argv[@]}"} ;;
    send)    cmd_send ${shift_argv[@]+"${shift_argv[@]}"} ;;
    status)  cmd_status ${shift_argv[@]+"${shift_argv[@]}"} ;;
    capture) cmd_capture ${shift_argv[@]+"${shift_argv[@]}"} ;;
    list)    cmd_list ${shift_argv[@]+"${shift_argv[@]}"} ;;
    kill)    cmd_kill ${shift_argv[@]+"${shift_argv[@]}"} ;;
    watch)   cmd_watch ${shift_argv[@]+"${shift_argv[@]}"} ;;
    help|-h|--help) _ta_usage ;;
    *) _ta_usage >&2; _ta_die 64 "unknown command: $cmd" ;;
  esac
}

main "$@"
