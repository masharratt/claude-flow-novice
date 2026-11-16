#!/usr/bin/env bash
# zai-fence-linux.sh: the Linux (bubblewrap) half of zai-fence.sh. Sourced by
# zai-fence.sh after it has checked its arguments and loaded readonly-list.sh;
# it either execs bwrap or calls die (exit 70). It never returns and never runs
# the command unfenced.
#
# Same contract as the macOS Seatbelt profile, expressed as mounts (later mounts
# win, so the steps keep the macOS numbering and order):
#   1. / read-only; $HOME, /tmp, /var/tmp, /mnt (Windows drives, WSL resolv),
#      /run (WSL interop, docker, dbus, credentials) replaced by empty tmpfs.
#   2. read-only back: ~/.claude (and the real targets of its symlinks),
#      ~/.local/share/claude, ~/.gitconfig, ~/.config/git, the command file and
#      its interpreter, /etc/resolv.conf's real target.
#   3. read+write back: ~/.claude.json*, the Claude state dirs/files, this
#      repo's ~/.claude/projects slug(s) only, ~/.claude-tmp, tool caches, and a
#      fresh per-worker TMPDIR.
#   4. masked: ~/.claude/history.jsonl, ~/.claude/file-history,
#      ~/.claude/.credentials.json.
#   4b. glm-open only (ZAI_FENCE_OPEN_DIRS=1): bind the folders listed in
#      <root>/.claude/glm-open-dirs read+write, or read-only for `ro:` lines
#      (/mnt is a tmpfs here, so an ro folder is invisible unless bound).
#      Last-segment globs expand at start (lib/open-dirs.sh; any bad entry, or
#      a missing/empty/uncommitted list, exits 70). Strict mount order:
#      (a) rw folders + root, (b) .claude/.git processing, (c) ro: folders and
#      6b, (d) .env masks, (e) step 4 + step 7 credential masks LAST, so no
#      later bind re-exposes a mask or makes an ro: entry writable.
#   5. read+write: the fence root (main repo toplevel of cwd, else cwd).
#   6. inside the fence (unless ZAI_FENCE_ALLOW_CONFIG=1) read-only:
#      .git/config*, .git/worktrees/*/config*, .git/hooks, and every .claude dir
#      (root and .claude/worktrees/*) except its children other than
#      settings*.json and hooks, which are re-bound read+write.
#      <root>/.claude/glm-open-dirs is read-only even with ZAI_FENCE_ALLOW_CONFIG=1,
#      so a worker can never widen its own list.
#   6b. read-only: .zai-fence-readonly / ZAI_FENCE_READONLY entries inside the root.
#   6c. masked: every .env / .env.* file (or symlink's target) under the root
#      and each glm-open folder, no directory skipped; a scan that times out
#      (ZAI_FENCE_OPEN_SCAN_SECS, default 600, opened folders only) or reports
#      ANY error (permission denied included) exits 70.
#   7. masked if a bind above (root or glm-open folder, either direction)
#      exposed them: the shared CFN_CRED_PATHS list in lib/open-dirs.sh (~/.ssh
#      ~/.aws ~/.gnupg ~/.config/gh ~/.config/cfn-mailbox ~/.config/cfn-fleet
#      ~/.npmrc ~/.git-credentials ~/.netrc ~/.docker ...); then $HOME, /tmp, /var/tmp, /mnt, /run remounted
#      read-only so writes there fail rather than vanish.
# Namespaces: user, pid, ipc, uts, cgroup; network shared (z.ai API).
# A preflight runs the full mount set around /bin/true; any failure exits 70.
#
# cfn: abstract unix sockets stay reachable (shared net namespace), unshare-net + a proxy if a local service holds secrets
# cfn: .env masking is a scan at launch, so a .env created later in the root is readable; inotify or seccomp if that matters
# cfn: a .claude dir or worktree created after launch is not protected from settings/hooks writes; re-launch the worker after adding worktrees
# cfn: .env masking is a launch-time scan (fails closed on timeout), a whole-drive glm-open entry will refuse; a seccomp/fanotify open filter if huge folders must be opened
# cfn: ~/.cargo ~/.rustup ~/.nvm toolchains are hidden like the rest of $HOME (macOS parity), ro-bind them if GLM lanes must build

command -v realpath >/dev/null 2>&1 || die "realpath not found; refusing to run unfenced"
BWRAP=$(command -v bwrap 2>/dev/null) || die "bwrap not found on PATH; refusing to run unfenced"
[ -x "$BWRAP" ] || die "bwrap not executable; refusing to run unfenced"
TRUE_BIN=/bin/true; [ -x "$TRUE_BIN" ] || TRUE_BIN=/usr/bin/true
[ -x "$TRUE_BIN" ] || die "no true binary for the preflight"

HOME_R=$(realpath "$HOME" 2>/dev/null) || die "cannot resolve \$HOME"
hp(){ local p="$HOME/$1"; if [ -e "$p" ]; then realpath "$p"; else printf '%s/%s\n' "$HOME_R" "$1"; fi; }
slug(){ printf '%s' "$1" | sed -e 's/[^A-Za-z0-9]/-/g'; }

# --- fence root (same rules as macOS) ---------------------------------------
CWD_R=$(pwd -P) || die "cannot resolve cwd"
if common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
  ROOT=$(realpath "$(dirname "$common")" 2>/dev/null) || die "cannot resolve repo root"
else
  ROOT="$CWD_R"
fi
case "$ROOT" in /|"$HOME_R") die "refusing fence root $ROOT" ;; esac
case "$HOME_R/" in "$ROOT"/*) die "refusing fence root $ROOT (parent of \$HOME)" ;; esac
case "$ROOT" in *$'\n'*) die "unsafe character in path: $ROOT" ;; esac

# --- glm-open folders (read from the root's own list, never from env) -------
OPEN_DIRS=""
if [ "${ZAI_FENCE_OPEN_DIRS:-0}" = 1 ]; then
  OPEN_DIRS=$(cfn_open_dirs_list "$ROOT") || die "glm-open refused: fix $ROOT/$CFN_OPEN_DIRS_FILE (reason above)"
fi

# --- command -----------------------------------------------------------------
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

# --- per-worker temp dir -----------------------------------------------------
if [ "${ZAI_FENCE_PRINT_PROFILE:-0}" = 1 ]; then
  WTMP="/tmp/zai-fence-worker.PREVIEW"
else
  WTMP=$(mktemp -d /tmp/zai-fence-worker.XXXXXX) || die "cannot create worker temp dir"
  WTMP=$(realpath "$WTMP")
fi

# Paths the step-1 tmpfs hides; only these need binding back.
# $HOME last: a HOME nested under /tmp (test fixtures) must be mounted over
# the /tmp tmpfs, not hidden by it.
MASKED_ROOTS=(/tmp /var/tmp /mnt /run "$HOME_R")
hidden(){ local m; for m in "${MASKED_ROOTS[@]}"; do case "$1/" in "$m"/*) return 0 ;; esac; done; return 1; }
under_root(){ case "$1/" in "$ROOT"/*) return 0 ;; esac; return 1; }
# mask_env_under DIR [SECS]: mask every .env / .env.* under DIR. Fails CLOSED:
# no directory is skipped (node_modules, target, .git included), a symlinked
# .env masks its real target, and a scan that times out (SECS) or errors exits
# 70 naming the folder, ANY find error included: a mode-000 folder the worker
# owns could be chmod'ed back after launch, exposing an unscanned .env. Runs in
# the main shell so die stops the launch.
mask_env_under(){
  local dir="$1" secs="${2:-}" out err rc=0 bad p t
  out=$(mktemp "${TMPDIR:-/tmp}/zai-fence-envscan.XXXXXX") || die "cannot create .env scan file"
  err="$out.err"
  if [ -n "$secs" ]; then
    timeout "$secs" find "$dir" \( -name .env -o -name '.env.*' \) \( -type f -o -type l \) -print0 >"$out" 2>"$err" || rc=$?
  else
    find "$dir" \( -name .env -o -name '.env.*' \) \( -type f -o -type l \) -print0 >"$out" 2>"$err" || rc=$?
  fi
  if [ "$rc" -eq 124 ]; then
    rm -f "$out" "$err"
    die ".env scan of $dir did not finish within ${secs}s; refusing to start (list a smaller folder, or raise ZAI_FENCE_OPEN_SCAN_SECS)"
  fi
  bad=$(cat "$err" 2>/dev/null || true)
  if [ "$rc" -ne 0 ] || [ -n "$bad" ]; then
    rm -f "$out" "$err"
    die ".env scan of $dir failed (find exit $rc), refusing to start: ${bad%%$'\n'*}"
  fi
  while IFS= read -r -d '' p; do
    if [ -L "$p" ]; then
      t=$(realpath -e "$p" 2>/dev/null) || continue   # dangling: nothing to read
      mask "$t"
    else
      mask "$p"
    fi
  done <"$out"
  rm -f "$out" "$err"
}
# exposed P: a bind above makes P visible (inside the root or an opened folder,
# or an opened folder inside P).
exposed(){
  local _mo d
  under_root "$1" && return 0
  while IFS=$'\t' read -r _mo d; do
    [ -n "$d" ] || continue
    case "$1/" in "$d"/*) return 0 ;; esac
    case "$d/" in "$1"/*) return 0 ;; esac
  done <<<"$OPEN_DIRS"
  return 1
}

A=()
ro(){ [ -e "$1" ] && A+=(--ro-bind "$1" "${2:-$1}"); return 0; }
rw(){ [ -e "$1" ] && A+=(--bind "$1" "$1"); return 0; }
mask(){  # dir -> empty tmpfs, anything else -> /dev/null
  if [ -d "$1" ]; then A+=(--tmpfs "$1" --remount-ro "$1"); elif [ -e "$1" ]; then A+=(--ro-bind /dev/null "$1"); fi
  return 0
}
# A .claude dir: read-only, then every child except settings*.json and hooks
# re-bound read+write (macOS denies writes to exactly those paths).
claude_dir_ro(){
  local d="$1" c
  [ -d "$d" ] || return 0
  A+=(--ro-bind "$d" "$d")
  for c in "$d"/* "$d"/.[!.]* "$d"/..?*; do
    [ -e "$c" ] || [ -L "$c" ] || continue
    case "$(basename "$c")" in settings*.json|hooks|glm-open-dirs) continue ;; esac
    [ -L "$c" ] && continue   # symlinks resolve to their own (already decided) target
    A+=(--bind "$c" "$c")
  done
}

build(){
  local p t
  # 1. read-only system, hidden home/temp/mnt/run
  A+=(--unshare-user --unshare-pid --unshare-ipc --unshare-uts --unshare-cgroup-try --die-with-parent)
  A+=(--ro-bind / / --dev /dev --proc /proc)
  for p in "${MASKED_ROOTS[@]}"; do [ -d "$p" ] && A+=(--tmpfs "$p"); done

  # 2. read-only
  t=$(realpath /etc/resolv.conf 2>/dev/null) && hidden "$t" && ro "$t"
  ro "$(hp .claude)"; ro "$(hp .local/share/claude)"; ro "$(hp .gitconfig)"; ro "$(hp .config/git)"
  for p in "$HOME"/.claude/* "$HOME"/.claude/*/*; do
    [ -L "$p" ] || continue
    t=$(realpath "$p" 2>/dev/null) || continue
    hidden "$t" && ro "$t"
  done
  for p in "$CMD_REAL" "$CMD_INTERP"; do [ -n "$p" ] && hidden "$p" && ro "$p"; done
  [ "$CMD_PATH" != "$CMD_REAL" ] && hidden "$CMD_PATH" && ro "$CMD_REAL" "$CMD_PATH"

  # 3. read+write state, caches, temp
  for p in "$HOME_R"/.claude.json*; do [ -f "$p" ] && rw "$p"; done
  for p in todos shell-snapshots session-env statsig debug logs state paste-cache sessions \
           cache telemetry decision-log; do
    mkdir -p "$(hp ".claude/$p")" 2>/dev/null; rw "$(hp ".claude/$p")"
  done
  for p in .last-update-result.json mcp-needs-auth-cache.json hook-selfcheck.log \
           brief-size-warn.log current-task.txt; do
    rw "$(hp ".claude/$p")"
  done
  for p in "$(hp .claude)"/policy-limits.json* "$(hp .claude)"/plugins/*.json; do [ -f "$p" ] && rw "$p"; done
  local projects; projects=$(hp .claude/projects)
  A+=(--tmpfs "$projects")
  local s; for s in "$(slug "$ROOT")" "$(slug "$(pwd)")"; do
    mkdir -p "$projects/$s" 2>/dev/null
    for p in "$projects/$s"*; do [ -d "$p" ] && rw "$p"; done
  done
  mkdir -p "$(hp .claude-tmp)" 2>/dev/null
  for p in .claude-tmp .local/state/claude .npm .local/share/pnpm .cache/pnpm .cache/claude-cli-nodejs \
           .cache/uv .cache/puppeteer .cache/ms-playwright; do
    rw "$(hp "$p")"
  done
  [ "${ZAI_FENCE_PRINT_PROFILE:-0}" = 1 ] && A+=(--dir "$WTMP") || rw "$WTMP"

  # Order from here is strict (later mounts win):
  #   (a) every read+write bind: glm-open rw folders, then the root
  #   (b) .claude / .git persistence processing (re-binds .claude children rw)
  #   (c) read-only: glm-open ro: folders, .zai-fence-readonly entries
  #   (d) .env masks
  #   (e) credential masks, LAST
  # so no later bind can re-expose a mask or make an ro: entry writable. Only
  # the remount-ro of the step-1 tmpfs roots follows (not a bind).

  # (a) 4b. glm-open read+write folders (shallow first), 5. fence root
  local om
  while IFS=$'\t' read -r om p; do
    [ -n "$p" ] && [ "$om" = rw ] && A+=(--bind "$p" "$p")
  done <<<"$OPEN_DIRS"
  A+=(--bind "$ROOT" "$ROOT")

  # (b) 6. persistence paths inside the fence
  if [ "${ZAI_FENCE_ALLOW_CONFIG:-0}" != 1 ]; then
    if [ -d "$ROOT/.git" ]; then
      mkdir -p "$ROOT/.git/hooks" 2>/dev/null
      ro "$ROOT/.git/config"; ro "$ROOT/.git/config.worktree"; ro "$ROOT/.git/hooks"
      for p in "$ROOT"/.git/worktrees/*/config "$ROOT"/.git/worktrees/*/config.worktree; do ro "$p"; done
    fi
    claude_dir_ro "$ROOT/.claude"
    for p in "$ROOT"/.claude/worktrees/*/.claude; do [ -L "$p" ] || claude_dir_ro "$p"; done
  fi
  # the glm-open list (and a working-copy symlink's target): never writable from inside
  ro "$ROOT/$CFN_OPEN_DIRS_FILE"
  if [ -L "$ROOT/$CFN_OPEN_DIRS_FILE" ] && t=$(realpath -e "$ROOT/$CFN_OPEN_DIRS_FILE" 2>/dev/null); then
    exposed "$t" && ro "$t"
  fi

  # (c) 4c. glm-open ro: folders (shallow first), 6b. read-only shared data
  while IFS=$'\t' read -r om p; do
    [ -n "$p" ] && [ "$om" = ro ] && A+=(--ro-bind "$p" "$p")
  done <<<"$OPEN_DIRS"
  local ro_list rel
  ro_list=$(cfn_ro_entries "$ROOT")
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    case "$rel" in /*) p="$rel" ;; *) p="$ROOT/$rel" ;; esac
    [ -e "$p" ] || continue
    p=$(realpath "$p")
    under_root "$p" && ro "$p"
  done <<<"$ro_list"

  # (d) 6c. .env files under the root and every glm-open folder (fails closed)
  mask_env_under "$ROOT"
  local od
  while IFS=$'\t' read -r _ od; do
    [ -n "$od" ] || continue
    mask_env_under "$od" "${ZAI_FENCE_OPEN_SCAN_SECS:-600}"
  done <<<"$OPEN_DIRS"

  # (e) 4 + 7. credential masks, LAST: Claude's own history/credentials, then
  # the shared CFN_CRED_PATHS wherever a bind exposes them
  mask "$(hp .claude/history.jsonl)"; mask "$(hp .claude/file-history)"; mask "$(hp .claude/.credentials.json)"
  local c
  for c in $CFN_CRED_PATHS; do
    for p in "$HOME_R/$c" "$(hp "$c")"; do
      [ -e "$p" ] || continue
      exposed "$p" && mask "$p"
    done
  done
  for p in "${MASKED_ROOTS[@]}"; do [ -d "$p" ] && A+=(--remount-ro "$p"); done
  A+=(--chdir "$(pwd)")
}

build || die "mount plan generation failed"
[ "${#A[@]}" -gt 0 ] || die "empty mount plan"

if [ "${ZAI_FENCE_PRINT_PROFILE:-0}" = 1 ]; then
  printf '%s\n' "$BWRAP" "${A[@]}"
  exit 0
fi

unset SSH_AUTH_SOCK GH_TOKEN GITHUB_TOKEN TMUX TMUX_PANE WSL_INTEROP DBUS_SESSION_BUS_ADDRESS
export DISABLE_AUTOUPDATER=1 TMPDIR="$WTMP/" CLAUDE_CODE_TMPDIR="$WTMP"
FLEET_CLI="$HOME/.claude/skills/cfn-fleet/cli"
[ -x "$FLEET_CLI/fleet" ] && export PATH="$FLEET_CLI:$PATH"

# Preflight: the identical namespace + mount set around true. bwrap's own exit
# code (1) would not say "fence failed", so a failure here is turned into 70.
pf_err=$("$BWRAP" "${A[@]}" -- "$TRUE_BIN" 2>&1) || die "bwrap preflight failed, refusing to run unfenced: ${pf_err:-no output}"

shift
set -- "$CMD_PATH" "$@"
if [ "$CMD_BASE" = claude ]; then
  set -- "$@" --settings '{"sandbox":{"enabled":false}}'
fi

exec "$BWRAP" "${A[@]}" -- "$@"
die "exec of bwrap failed"
