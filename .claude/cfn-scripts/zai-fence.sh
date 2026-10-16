#!/usr/bin/env bash
# zai-fence.sh: run a command (normally a z.ai `claude` worker) inside a macOS
# Seatbelt fence so it can read and write only its own project folder plus what
# Claude Code needs to run. Plan: planning/PLAN_zai-folder-fence.md.
#
# Usage: zai-fence.sh <cmd> [args...]
#
# Policy (later rules win in Seatbelt, so the profile is built in this order):
#   1. allow default, then deny file-read-data + file-write* on $HOME, /private/tmp
#      and /private/var/folders.
#   2. read-only back: ~/.claude (and the real targets of its symlinks),
#      ~/.local/share/claude, ~/.gitconfig, ~/.config/git, the command's own binary.
#   3. read+write back: ~/.claude.json*, the Claude state dirs and files listed in
#      the plan's advisor revisions, this repo's ~/.claude/projects slug only,
#      ~/.claude-tmp, enumerated tool caches, the per-user cache dirs, and a fresh
#      per-worker TMPDIR.
#   4. denied: ~/.claude/history.jsonl, ~/.claude/file-history, other projects'
#      transcripts, ~/.cache/huggingface, and any .env* / settings.local.json
#      outside the fence root.
#   5. read+write: the fence root = main repo toplevel of cwd (worktrees, fleet run
#      dirs and .git live under it); cwd when not in a git repo.
#   6. inside the fence, writes denied to .git/config, .git/hooks,
#      .claude/settings*.json, .claude/hooks (they run unfenced later), unless
#      ZAI_FENCE_ALLOW_CONFIG=1.
#   6b. read-only: paths listed in <root>/.zai-fence-readonly (one per line, relative
#      to the root or absolute, # comments) and ZAI_FENCE_READONLY (colon-separated)
#      refuse writes and deletes, also when reached through a worktree symlink.
#   7. always denied: ~/.ssh ~/.aws ~/.gnupg ~/Library/Keychains ~/.npmrc
#      ~/.config/gh; connects to tmux / docker / orbstack sockets; Keychain mach
#      services; Apple Events; LaunchServices.
# Env: SSH_AUTH_SOCK, GH_TOKEN, GITHUB_TOKEN, TMUX, TMUX_PANE unset;
#      DISABLE_AUTOUPDATER=1; TMPDIR + CLAUDE_CODE_TMPDIR = per-worker temp dir;
#      ~/.claude/skills/cfn-fleet/cli prepended to PATH when present.
# When the command's basename is `claude`, appends
#   --settings '{"sandbox":{"enabled":false}}'  (nested sandbox-exec is refused).
#
# Fails closed with exit 70: no sandbox-exec on PATH, root refused ($HOME, /, or a
# parent of $HOME), unsafe characters in a path, or the profile cannot be written.
# Never execs the command unfenced.
#
# ZAI_FENCE_PRINT_PROFILE=1 prints the generated profile to stdout and exits 0.
#
# cfn: network egress fully open (z.ai API needed), per-host allow-list if a worker exfiltrates
# cfn: loopback not denied, deny 127.0.0.1 except an allow-list if local services hold secrets
# cfn: per-worker temp dirs are left for the OS to reap (exec replaces us), add a reaper if T/ fills
# cfn: projects slug is a prefix match, so /x/foo also opens /x/foo-bar's transcripts; exact match if that matters
set -uo pipefail
shopt -s execfail   # a failed exec must reach die, not exit 126/127

die(){ echo "zai-fence: $*" >&2; exit 70; }

[ $# -ge 1 ] || die "usage: zai-fence.sh <cmd> [args...]"
SBX=$(command -v sandbox-exec 2>/dev/null) || die "sandbox-exec not found on PATH; refusing to run unfenced"
command -v realpath >/dev/null 2>&1 || die "realpath not found; refusing to run unfenced"

HOME_R=$(realpath "$HOME" 2>/dev/null) || die "cannot resolve \$HOME"

# Real path of an existing path, or $HOME_R + suffix for a not-yet-created one.
hp(){ local p="$HOME/$1"; if [ -e "$p" ]; then realpath "$p"; else printf '%s/%s\n' "$HOME_R" "$1"; fi; }

# --- fence root -------------------------------------------------------------
CWD_R=$(pwd -P) || die "cannot resolve cwd"
if common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
  ROOT=$(realpath "$(dirname "$common")" 2>/dev/null) || die "cannot resolve repo root"
else
  ROOT="$CWD_R"
fi
case "$ROOT" in
  /|"$HOME_R") die "refusing fence root $ROOT" ;;
esac
case "$HOME_R/" in
  "$ROOT"/*) die "refusing fence root $ROOT (parent of \$HOME)" ;;
esac

# --- per-worker temp dir ----------------------------------------------------
TBASE=$(getconf DARWIN_USER_TEMP_DIR 2>/dev/null) || die "cannot read DARWIN_USER_TEMP_DIR"
TBASE=$(realpath "$TBASE") || die "cannot resolve $TBASE"
CBASE=$(realpath "$(getconf DARWIN_USER_CACHE_DIR 2>/dev/null)" 2>/dev/null) || die "cannot resolve DARWIN_USER_CACHE_DIR"
UBASE=$(realpath "$(getconf DARWIN_USER_DIR 2>/dev/null)" 2>/dev/null) || die "cannot resolve DARWIN_USER_DIR"
if [ "${ZAI_FENCE_PRINT_PROFILE:-0}" = 1 ]; then
  WTMP="$TBASE/zai-fence-worker.PREVIEW"   # print mode creates nothing
else
  WTMP=$(mktemp -d "$TBASE/zai-fence-worker.XXXXXX") || die "cannot create worker temp dir"
  WTMP=$(realpath "$WTMP")
fi

# --- profile helpers --------------------------------------------------------
# Paths go into SBPL string literals and regexes: refuse anything that could
# break out of a literal.
safe(){ case "$1" in *'"'*|*'\'*|*$'\n'*) die "unsafe character in path: $1" ;; esac; }
rx(){ safe "$1"; printf '%s' "$1" | sed -e 's/[]*+?(){}|^$.[]/\\&/g'; }
sub(){ safe "$1"; printf '(subpath "%s")' "$1"; }
lit(){ safe "$1"; printf '(literal "%s")' "$1"; }
# Allows name file-read-data explicitly: Seatbelt lets a deny on the specific
# file-read-data operation beat a later allow on the file-read* wildcard, so
# without it the fence could write its own files but never read them back.
RW='file-read* file-read-data file-write*'
RD='file-read* file-read-data'
DN='file-read-data file-write*'

# Claude names a project dir after its cwd with every non-alphanumeric char -> '-'.
slug(){ printf '%s' "$1" | sed -e 's/[^A-Za-z0-9]/-/g'; }

# Resolve the command to an absolute file now, so the fence opens exactly that
# file (plus a script's interpreter) and sandbox-exec never searches PATH.
CMD_BASE=$(basename "$1")
case "$1" in
  */*) CMD_PATH="$1" ;;
  *)   CMD_PATH=$(type -P "$1" 2>/dev/null) || die "command not found: $1" ;;
esac
[ -f "$CMD_PATH" ] || die "command not found: $1"
case "$CMD_PATH" in /*) ;; *) CMD_PATH="$(pwd -P)/$CMD_PATH" ;; esac
CMD_REAL=$(realpath "$CMD_PATH") || die "cannot resolve $CMD_PATH"
CMD_INTERP=""
if [ "$(head -c2 "$CMD_REAL" 2>/dev/null)" = '#!' ]; then
  read -r CMD_INTERP interp_arg < <(head -1 "$CMD_REAL" | sed -e 's/^#![[:space:]]*//')
  if [ "$(basename "${CMD_INTERP:-x}")" = env ] && [ -n "${interp_arg:-}" ]; then
    CMD_INTERP=$(type -P "${interp_arg%% *}" 2>/dev/null || true)
  fi
  [ -n "$CMD_INTERP" ] && CMD_INTERP=$(realpath "$CMD_INTERP" 2>/dev/null || true)
fi

profile(){
  local p t
  echo '(version 1)'
  echo '(allow default)'
  echo ";; 1. deny home and temp roots"
  echo "(deny $DN $(sub "$HOME_R") $(sub /private/tmp) $(sub /private/var/folders))"

  echo ";; 2. read-only"
  echo "(allow $RD $(sub "$(hp .claude)") $(sub "$(hp .local/share/claude)") $(lit "$(hp .gitconfig)") $(sub "$(hp .config/git)") $(sub /private/var/folders/zz))"
  for p in "$HOME"/.claude/* "$HOME"/.claude/*/*; do
    [ -L "$p" ] || continue
    t=$(realpath "$p" 2>/dev/null) || continue
    echo "(allow $RD $(sub "$t"))"
  done
  # the wrapped command's own file (and interpreter), not its directory
  echo "(allow $RD process-exec $(lit "$CMD_PATH") $(lit "$CMD_REAL")${CMD_INTERP:+ $(lit "$CMD_INTERP")})"
  case "$CMD_REAL" in   # a versioned bundle (Claude Code's native build) needs its tree
    "$(hp .local/share/claude)"/*) echo "(allow $RD $(sub "$(dirname "$CMD_REAL")"))" ;;
  esac

  echo ";; 3. read+write state, caches, temp"
  echo "(allow $RW (regex #\"^$(rx "$HOME_R")/\\.claude\\.json\"))"
  for p in todos shell-snapshots session-env statsig debug logs state paste-cache sessions \
           cache telemetry decision-log; do
    echo "(allow $RW $(sub "$(hp ".claude/$p")"))"
  done
  for p in .last-update-result.json mcp-needs-auth-cache.json hook-selfcheck.log \
           brief-size-warn.log current-task.txt; do
    echo "(allow $RW $(lit "$(hp ".claude/$p")"))"
  done
  echo "(allow $RW (regex #\"^$(rx "$(hp .claude)")/policy-limits\\.json\" #\"^$(rx "$(hp .claude)")/plugins/[^/]+\\.json\$\"))"
  echo "(deny $DN $(sub "$(hp .claude/projects)"))"
  echo "(allow $RW (regex #\"^$(rx "$(hp .claude/projects)")/$(rx "$(slug "$ROOT")")\"))"
  if [ "$ROOT" != "$CWD_R" ] || [ "$(pwd)" != "$CWD_R" ]; then
    echo "(allow $RW (regex #\"^$(rx "$(hp .claude/projects)")/$(rx "$(slug "$(pwd)")")\"))"
  fi
  for p in .claude-tmp .local/state/claude .npm Library/pnpm Library/Caches/claude-cli-nodejs Library/Caches/Homebrew \
           Library/Caches/pnpm Library/Caches/ms-playwright .cache/uv .cache/puppeteer \
           .cache/ms-playwright; do
    echo "(allow $RW $(sub "$(hp "$p")"))"
  done
  echo "(allow $RW $(sub "$CBASE") $(sub "$UBASE") $(sub "$WTMP"))"
  # /usr/bin/git and other xcrun shims cache SDK lookups here; only that file pattern
  echo "(allow $RW (regex #\"^$(rx "$TBASE")/xcrun_db-[^/]*\$\"))"

  echo ";; 4. denied even under the allows above"
  echo "(deny $DN $(lit "$(hp .claude/history.jsonl)") $(sub "$(hp .claude/file-history)") $(lit "$(hp .claude/.credentials.json)") $(sub "$(hp .cache/huggingface)"))"
  echo "(deny $DN (regex #\"/\\.env(\\.[^/]*)?\$\" #\"/settings\\.local\\.json\$\"))"

  echo ";; 5. fence root"
  echo "(allow $RW $(sub "$ROOT"))"

  if [ "${ZAI_FENCE_ALLOW_CONFIG:-0}" != 1 ]; then
    local r; r=$(rx "$ROOT")
    echo ";; 6. persistence paths inside the fence (ZAI_FENCE_ALLOW_CONFIG=1 lifts)"
    echo "(deny file-write* (regex #\"^$r/\\.git/(config|config\\.worktree|worktrees/[^/]+/config(\\.worktree)?)\$\" #\"^$r/\\.git/hooks(/|\$)\" #\"^$r(/\\.claude/worktrees/[^/]+)?/\\.claude/settings[^/]*\\.json\$\" #\"^$r(/\\.claude/worktrees/[^/]+)?/\\.claude/hooks(/|\$)\"))"
  fi

  # Shared data a worktree reaches through a symlink resolves inside the fence, so
  # step 5 would let a test cleanup delete it (MDTWII, 2026-10-16). Listed paths
  # stay readable; writes and deletes are refused whichever path reaches them.
  local ro rel
  ro=$( { [ -f "$ROOT/.zai-fence-readonly" ] && cat "$ROOT/.zai-fence-readonly"; \
          printf '%s\n' "${ZAI_FENCE_READONLY:-}" | tr ':' '\n'; } | sed -e 's/#.*//' -e 's/[[:space:]]*$//' )
  if [ -n "$ro" ]; then
    echo ";; 6b. read-only shared data (.zai-fence-readonly, ZAI_FENCE_READONLY)"
    while IFS= read -r rel; do
      [ -n "$rel" ] || continue
      case "$rel" in /*) p="$rel" ;; *) p="$ROOT/$rel" ;; esac
      [ -e "$p" ] && p=$(realpath "$p")
      echo "(deny file-write* $(sub "$p"))"
    done <<<"$ro"
  fi

  echo ";; 7. always denied"
  echo "(deny $DN $(sub "$(hp .ssh)") $(sub "$(hp .aws)") $(sub "$(hp .gnupg)") $(sub "$(hp Library/Keychains)") $(lit "$(hp .npmrc)") $(sub "$(hp .config/gh)"))"
  echo "(deny network-outbound (regex #\"^/private/tmp/tmux-\" #\"^$(rx "$TBASE")/tmux-\" #\"^/private/var/run/docker\\.sock\$\" #\"^$(rx "$(hp .orbstack)")/run/\" #\"^$(rx "$(hp .docker)")/run/\"))"
  if [ -n "${TMUX:-}" ]; then echo "(deny network-outbound $(lit "${TMUX%%,*}"))"; fi
  echo "(deny file-write* (regex #\"^/private/tmp/tmux-\"))"
  echo '(deny mach-lookup (global-name "com.apple.SecurityServer") (global-name "com.apple.securityd") (global-name "com.apple.securityd.xpc") (global-name "com.apple.coreservices.launchservicesd"))'
  echo '(deny appleevent-send)'
}

PROFILE=$(profile) || die "profile generation failed"
[ -n "$PROFILE" ] || die "empty profile"

if [ "${ZAI_FENCE_PRINT_PROFILE:-0}" = 1 ]; then
  printf '%s\n' "$PROFILE"
  exit 0
fi

PFILE="$WTMP/profile.sb"
printf '%s\n' "$PROFILE" > "$PFILE" || die "cannot write profile $PFILE"
[ -s "$PFILE" ] || die "profile file is empty"

unset SSH_AUTH_SOCK GH_TOKEN GITHUB_TOKEN TMUX TMUX_PANE
export DISABLE_AUTOUPDATER=1 TMPDIR="$WTMP/" CLAUDE_CODE_TMPDIR="$WTMP"
# fleet workers heartbeat/claim/commit by bare name; the cli dir is already readable via step 2
FLEET_CLI="$HOME/.claude/skills/cfn-fleet/cli"
[ -x "$FLEET_CLI/fleet" ] && export PATH="$FLEET_CLI:$PATH"

shift
set -- "$CMD_PATH" "$@"
if [ "$CMD_BASE" = claude ]; then
  set -- "$@" --settings '{"sandbox":{"enabled":false}}'
fi

exec "$SBX" -f "$PFILE" "$@"
die "exec of sandbox-exec failed"
