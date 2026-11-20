#!/usr/bin/env bash
# zai-fence-linux.sh: the Linux (bubblewrap) half of zai-fence.sh, ALLOW-LIST
# model (planning/PLAN_zai-fence-linux-allowlist.md). Sourced by zai-fence.sh
# after it has checked its arguments, loaded readonly-list.sh + open-dirs.sh
# and scrubbed git/credential env; it either execs bwrap or calls die (exit 70).
# It never returns and never runs the command unfenced.
#
# ZAI_FENCE_LINUX_BACKEND=legacy runs the previous deny-list backend
# (lib/zai-fence-linux-legacy.sh) for one release, with a warning.
#
# Model: bwrap starts from an EMPTY root. Visible, nothing else:
#   base   /usr ro, /bin /sbin /lib /lib64 /lib32 as symlinks into /usr, an /etc
#          allow-list (no ssl/private, no gitconfig), fresh /dev, own /proc (pid
#          namespace), tmpfs /tmp, no /sys, /mnt, /srv, /opt (except
#          /opt/claude-org-plugins ro), /var, /run (except /run/zai-fence).
#   home   a PRIVATE per-worker home, ~/.claude/zai-workers/<root-id>/<run>/home
#          on the host, mounted as $HOME rw: Claude state, a generated
#          ~/.claude.json (onboarding keys only, no MCP servers, no other
#          projects) and transcripts live there, shared with no other session.
#   (a)    rw glm-open folders, then the fence root, each from a PINNED
#          directory fd (--bind-fd), so a rename/symlink swap after validation
#          cannot change what is mounted. Launched from a linked worktree kept
#          OUTSIDE the root, that worktree's own top too (rw, pinned, scanned,
#          protected like a root worktree), only once git and its pointer +
#          back-link confirm it is a registered worktree of the root.
#   (b')   a .git that is neither a pointer (gitdir: line) nor a repository
#          (HEAD) is masked read-only (/dev/null or empty tmpfs) with a note.
#   (b)    root and every opened repo: .git/config*, .git/hooks, core.hooksPath
#          and include.path targets ro (a missing target inside a writable tree
#          refuses); .git/worktrees ro at its top (no new worktree entries, even
#          with ZAI_FENCE_ALLOW_CONFIG=1); a .git pointer into <root>/.git
#          needs its target's back-link; project .claude dirs ro except non-config children; fleet
#          run-dir engines.env/fleet.env ro; the glm-open list ro.
#   (c)    ro: glm-open folders (--ro-bind-fd), .zai-fence-readonly entries.
#   (d)    TRUSTED RUNTIME ro: ~/.claude subset (rules, skills, hooks,
#          cfn-scripts...), also at the real paths its links reach when those
#          are inside the root or an opening; generated settings.json (host file
#          minus env/apiKeyHelper/aws* keys) and ~/.gitconfig (user.name,
#          user.email, init.defaultBranch only); GIT_CONFIG_NOSYSTEM=1.
#   (e)    secret masks: root .env*, settings.local.json; openings: the
#          CFN_OPEN_SECRET_NAMES list; unix sockets in root/openings; then
#          credential masks (CFN_CRED_PATHS, ~/.claude/.credentials.json and
#          history real paths) wherever exposed, LAST.
# Namespaces: --unshare-all (user, pid, ipc, uts, cgroup, net) + --new-session.
# Network (ZAI_FENCE_NET, default broker): no host loopback, no abstract or host
#   sockets; lib/zai-fence-broker.py relays only CONNECT to the API host of
#   ANTHROPIC_BASE_URL (default api.z.ai:443) via HTTPS_PROXY.
#   ZAI_FENCE_NET=host shares the host network instead (warns).
# Descriptors: every fd above 2 is closed before exec except the pinned dirs.
# Scans fail closed: any find error or a timeout (ZAI_FENCE_OPEN_SCAN_SECS,
# default 600, opened folders only) exits 70.
#
# cfn: worker homes under ~/.claude/zai-workers are never reaped, add a reaper if they pile up
# cfn: the broker allows one API host, a per-run allow-list if workers need registries

if [ "${ZAI_FENCE_LINUX_BACKEND:-allowlist}" = legacy ]; then
  echo "zai-fence: WARN legacy deny-list Linux backend (ZAI_FENCE_LINUX_BACKEND=legacy): / is visible read-only, host network shared; kept for one release" >&2
  # shellcheck disable=SC1091
  source "$(dirname "${BASH_SOURCE[0]}")/zai-fence-linux-legacy.sh"
  die "legacy linux fence returned without exec"
fi

command -v realpath >/dev/null 2>&1 || die "realpath not found; refusing to run unfenced"
BWRAP=$(command -v bwrap 2>/dev/null) || die "bwrap not found on PATH; refusing to run unfenced"
[ -x "$BWRAP" ] || die "bwrap not executable; refusing to run unfenced"
PY=$(command -v python3 2>/dev/null) || die "python3 not found (needed for the fd-closing exec and the network broker); refusing to run unfenced"
PY=$(realpath "$PY")
command -v jq >/dev/null 2>&1 || die "jq not found (needed to sanitize settings); refusing to run unfenced"
TRUE_BIN=/usr/bin/true; [ -x "$TRUE_BIN" ] || TRUE_BIN=/bin/true
LIBDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
BROKER="$LIBDIR/zai-fence-broker.py"
[ -f "$BROKER" ] || die "missing $BROKER; refusing to run unfenced"
PRINT="${ZAI_FENCE_PRINT_PROFILE:-0}"

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
case "$ROOT" in *$'\n'*|*$'\t'*) die "unsafe character in path: $ROOT" ;; esac

# --- linked worktree outside the root ------------------------------------------
# BUG zai-fence-outside-worktree (2026-11-19): a linked worktree kept outside
# the main checkout (~/mdtwii-desk-wt/x) was never bound, so bwrap could not
# chdir into it. WT_OUT is that worktree's own top, bound read+write like the
# root, ONLY when git and the files on disk agree it is a registered linked
# worktree of ROOT: common dir = ROOT/.git, git dir = ROOT/.git/worktrees/<n>,
# its .git pointer names that git dir, and the git dir's gitdir back-link names
# its .git. A copied pointer in another folder fails the back-link and refuses.
# The common dir needs no extra bind: it is ROOT/.git, already bound and
# protected with the root.
WT_OUT=""
if [ -n "${common:-}" ]; then
  wt_top=$(git rev-parse --show-toplevel 2>/dev/null) && wt_top=$(realpath "$wt_top" 2>/dev/null) || wt_top=""
  case "$wt_top/" in ""/|"$ROOT"/*) wt_top="" ;; esac
  if [ -n "$wt_top" ]; then
    wt_refuse(){ die "$wt_top is not inside the fence root $ROOT and is not a registered linked worktree of it ($1); refusing"; }
    case "$wt_top" in *$'\n'*|*$'\t'*) die "unsafe character in path: $wt_top" ;; esac
    case "$wt_top" in /|"$HOME_R") wt_refuse "top is / or \$HOME" ;; esac
    case "$HOME_R/" in "$wt_top"/*) wt_refuse "parent of \$HOME" ;; esac
    case "$ROOT/" in "$wt_top"/*) wt_refuse "parent of the root" ;; esac
    [ "$(realpath "$common" 2>/dev/null)" = "$ROOT/.git" ] || wt_refuse "git common dir is not $ROOT/.git"
    wt_gd=$(git rev-parse --path-format=absolute --git-dir 2>/dev/null) && wt_gd=$(realpath "$wt_gd" 2>/dev/null) || wt_refuse "no git dir"
    [ "$(dirname "$wt_gd")" = "$ROOT/.git/worktrees" ] || wt_refuse "git dir $wt_gd is not under $ROOT/.git/worktrees"
    [ -f "$wt_top/.git" ] && [ ! -L "$wt_top/.git" ] || wt_refuse "$wt_top/.git is not a plain pointer file"
    IFS= read -r wt_line < "$wt_top/.git" || wt_line=""
    case "$wt_line" in "gitdir: "*) wt_line="${wt_line#gitdir: }" ;; *) wt_refuse "no gitdir: line in $wt_top/.git" ;; esac
    case "$wt_line" in /*) ;; *) wt_line="$wt_top/$wt_line" ;; esac
    [ "$(realpath -m "$wt_line")" = "$wt_gd" ] || wt_refuse "$wt_top/.git does not name $wt_gd"
    IFS= read -r wt_back < "$wt_gd/gitdir" 2>/dev/null || wt_back=""
    case "$wt_back" in /*) ;; *) wt_back="$wt_gd/$wt_back" ;; esac
    [ "$(realpath -m "$wt_back")" = "$wt_top/.git" ] || wt_refuse "$wt_gd/gitdir does not point back to $wt_top/.git"
    WT_OUT="$wt_top"
    unset -f wt_refuse
  fi
fi

# --- glm-open folders (committed + approved list, never env) -----------------
OPEN_DIRS="" NOSCAN_DIRS=""
if [ "${ZAI_FENCE_OPEN_DIRS:-0}" = 1 ]; then
  OPEN_FLAGGED=$(cfn_open_dirs_list "$ROOT" --with-flags) || die "glm-open refused: fix or approve $ROOT/$CFN_OPEN_DIRS_FILE (reason above)"
  OPEN_DIRS=$(printf '%s\n' "$OPEN_FLAGGED" | cut -f1,2)
  NOSCAN_DIRS=$(printf '%s\n' "$OPEN_FLAGGED" | awk -F'\t' '$3 == "noscan" { print $2 }')
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

# --- network ------------------------------------------------------------------
NET="${ZAI_FENCE_NET:-broker}"
case "$NET" in
  broker|host) ;;
  *) die "ZAI_FENCE_NET must be broker or host (got '$NET')" ;;
esac
[ "$NET" = host ] && echo "zai-fence: WARN ZAI_FENCE_NET=host: the worker shares the host network (loopback services and abstract sockets reachable)" >&2
api_host=""
case "${ANTHROPIC_BASE_URL:-}" in
  https://*) api_host="${ANTHROPIC_BASE_URL#https://}"; api_host="${api_host%%/*}"; api_host="${api_host%%:*}" ;;
esac
NET_ALLOW="api.z.ai:443${api_host:+,$api_host:443}"
PROXY_PORT=3128

# --- private worker dirs --------------------------------------------------------
ROOT_ID=$(cfn_open_dirs_root_id "$ROOT")
# ZAI_FENCE_WORKER_BASE (set by the launching user, e.g. test suites) moves the
# worker homes; never inside the fence root or an opening.
WORKERS="${ZAI_FENCE_WORKER_BASE:-$HOME_R/.claude/zai-workers}"
case "$WORKERS" in /*) ;; *) die "ZAI_FENCE_WORKER_BASE must be absolute" ;; esac
WBASE="$WORKERS/${ROOT_ID:0:16}/$(date +%Y%m%dT%H%M%S)-$$"
if [ "$PRINT" = 1 ]; then
  WBASE="$WORKERS/${ROOT_ID:0:16}/PREVIEW"
else
  (umask 077 && mkdir -p "$WBASE/home/.claude" "$WBASE/gen") || die "cannot create worker dirs under $WBASE"
fi
# The broker socket lives in a short private dir: an AF_UNIX path is limited to
# 107 bytes and WBASE can be longer.
if [ "$PRINT" = 1 ]; then NETDIR=/tmp/zai-fence-net.PREVIEW
else NETDIR=$(umask 077 && mktemp -d /tmp/zai-fence-net.XXXXXX) || die "cannot create the broker socket dir"; fi
PHOME="$WBASE/home"
under_x(){ case "$1/" in "$2"/*) return 0 ;; esac; return 1; }
under_x "$WBASE" "$ROOT" && die "worker home $WBASE would sit inside the fence root; refusing"
[ -n "$WT_OUT" ] && under_x "$WBASE" "$WT_OUT" && die "worker home $WBASE would sit inside the worktree $WT_OUT; refusing"
while IFS=$'\t' read -r _m _d; do
  [ -n "$_d" ] && under_x "$WBASE" "$_d" && die "worker home $WBASE would sit inside the opened folder $_d; refusing"
done <<<"$OPEN_DIRS"

# --- generated config -----------------------------------------------------------
gen_config(){
  local p
  [ "$PRINT" = 1 ] && return 0
  for p in projects/"$(slug "$ROOT")" projects/"$(slug "$(pwd)")" todos shell-snapshots session-env statsig debug \
           logs paste-cache sessions cache telemetry state decision-log; do
    mkdir -p "$PHOME/.claude/$p" || return 1
  done
  mkdir -p "$PHOME/.claude-tmp" "$PHOME/.local/bin" || return 1
  if [ -f "$HOME/.claude.json" ]; then
    jq --arg root "$ROOT" '{hasCompletedOnboarding, lastOnboardingVersion, theme, numStartups, firstStartTime, userID,
          bypassPermissionsModeAccepted, hasAcknowledgedCostThreshold, autoUpdates: false,
          projects: ({($root): ((.projects[$root] // {}) | {hasTrustDialogAccepted, hasCompletedProjectOnboarding})})}
        | with_entries(select(.value != null))' "$HOME/.claude.json" > "$PHOME/.claude.json" 2>/dev/null \
      || echo '{"hasCompletedOnboarding":true,"autoUpdates":false}' > "$PHOME/.claude.json"
  else
    echo '{"hasCompletedOnboarding":true,"autoUpdates":false}' > "$PHOME/.claude.json"
  fi
  if [ -f "$HOME/.claude/settings.json" ]; then
    jq 'del(.env, .apiKeyHelper, .awsAuthRefresh, .awsCredentialExport, .otelHeadersHelper)' \
      "$HOME/.claude/settings.json" > "$WBASE/gen/settings.json" 2>/dev/null || echo '{}' > "$WBASE/gen/settings.json"
  else
    echo '{}' > "$WBASE/gen/settings.json"
  fi
  local n e b
  n=$(git config --global --get user.name 2>/dev/null || true)
  e=$(git config --global --get user.email 2>/dev/null || true)
  b=$(git config --global --get init.defaultBranch 2>/dev/null || true)
  printf '/.mcp.json\n' > "$WBASE/gen/gitignore"
  : > "$WBASE/gen/gitconfig"
  [ -n "$n$e" ] && printf '[user]\n' >> "$WBASE/gen/gitconfig"
  [ -n "$n" ] && git config -f "$WBASE/gen/gitconfig" user.name "$n"
  [ -n "$e" ] && git config -f "$WBASE/gen/gitconfig" user.email "$e"
  [ -n "$b" ] && git config -f "$WBASE/gen/gitconfig" init.defaultBranch "$b"
  # the .mcp.json placeholder (review rev 5) must not show up as untracked
  git config -f "$WBASE/gen/gitconfig" core.excludesFile /run/zai-fence/gitignore
  return 0
}
gen_config || die "cannot generate the worker config under $WBASE"

# --- pinned directory fds -------------------------------------------------------
KEEP_FDS=""
# pin DIR VAR: open DIR as an fd, check it is still DIR, store the fd number in VAR.
pin(){
  local _pd="$1" _pfd _pnow
  [ -d "$_pd" ] && [ ! -L "$_pd" ] || die "cannot pin $_pd: not a directory (swapped after validation?)"
  exec {_pfd}<"$_pd" || die "cannot open $_pd"
  _pnow=$(readlink "/proc/$$/fd/$_pfd") || die "cannot read back the pinned fd for $_pd"
  [ "$_pnow" = "$_pd" ] || die "pinned $_pd resolved to $_pnow (swapped after validation?); refusing"
  KEEP_FDS+="${KEEP_FDS:+,}$_pfd"
  printf -v "$2" '%s' "$_pfd"   # caller's variable; never named like these locals
}

A=()
PROT=()   # destinations of read-only binds; their ancestors get pinned
# no_link PATH: refuse the launch when PATH, or any directory on the way to it,
# is a symlink, or when it lies outside the fence root and approved folders
# (latest review P1-1: a link planted by an earlier run would make this launch
# bind, or write to, the host file it points at).
no_link(){
  local p="$1" rp
  [ -L "$p" ] && die "refusing: $p is a symlink (planted by an earlier run?); remove it and relaunch"
  rp=$(realpath -m "$p" 2>/dev/null) || die "refusing: cannot resolve $p"
  [ "$rp" = "$p" ] || die "refusing: $p passes through a symlink (resolves to $rp); remove it and relaunch"
  exposed "$p" || die "refusing: $p is outside the fence root and approved folders"
}
ro(){
  [ -e "$1" ] || [ -L "$1" ] || return 0
  no_link "$1"
  A+=(--ro-bind "$1" "${2:-$1}"); PROT+=("${2:-$1}")
  return 0
}
MASKS=()
# BUG glm-settings-error-stall (2026-11-18, MDTWII GLM lane): a /dev/null mask
# on settings.local.json is a device; Claude Code refused it with a "Settings
# Error ... Not a regular file" menu and the lane stalled. A mask on a JSON
# file Claude reads as config (settings*.json, .mcp.json, .claude.json) is a
# read-only regular file holding "{}" from the private worker dir instead.
MASK_JSON="$WBASE/gen/masked.json"
if [ "$PRINT" != 1 ]; then
  { echo '{}' > "$MASK_JSON" && chmod 444 "$MASK_JSON"; } || die "cannot create the JSON mask file under $WBASE"
fi
mask(){  # dir -> empty tmpfs, Claude config JSON -> read-only "{}", anything else -> /dev/null
  if [ -d "$1" ] && [ ! -L "$1" ]; then MASKS+=(--tmpfs "$1" --remount-ro "$1")
  elif [ -S "$1" ]; then MASKS+=(--ro-bind /dev/null "$1")
  elif [ -e "$1" ]; then
    # only the JSON files Claude Code parses as config; other masks stay
    # /dev/null so reading them still fails (test_sec_8, test_sec2_4)
    case "${1##*/}" in settings*.json|.mcp.json|.claude.json) MASKS+=(--ro-bind "$MASK_JSON" "$1") ;;
      *) MASKS+=(--ro-bind /dev/null "$1") ;; esac
  fi
  return 0
}
under(){ case "$1/" in "$2"/*) return 0 ;; esac; return 1; }
exposed(){
  local _m d
  under "$1" "$ROOT" && return 0
  [ -n "$WT_OUT" ] && under "$1" "$WT_OUT" && return 0
  while IFS=$'\t' read -r _m d; do [ -n "$d" ] && under "$1" "$d" && return 0; done <<<"$OPEN_DIRS"
  return 1
}

# scan_tree SRC DEST SECS NAMES...: through the pinned SRC (/proc/<pid>/fd/N),
# mask every match of NAMES and every unix socket at its DEST path, and record
# .git dirs in GIT_REPOS. Any find error or timeout exits 70.
GIT_REPOS=()
GIT_POINTERS=()   # .git FILES (worktree / submodule pointers)
scan_tree(){
  local src="$1" dest="$2" secs="$3" out err rc=0 bad p rel t n
  shift 3
  local -a expr=()
  for n in "$@"; do expr+=(${expr[@]+-o} -name "$n"); done
  out=$(mktemp "${TMPDIR:-/tmp}/zai-fence-scan.XXXXXX") || die "cannot create scan file"
  err="$out.err"
  local -a cmd=(env LC_ALL=C find "$src/" \( -name .git -type d -printf 'G\t%p\0' -prune \) -o \( -name .git -type f -printf 'P\t%p\0' \) -o \( -name .git -type l -printf 'L\t%p\0' \) -o
                \( -type s -printf 'S\t%p\0' \) -o \( \( "${expr[@]}" \) -printf 'M\t%p\0' -prune \))
  if [ -n "$secs" ]; then timeout "$secs" "${cmd[@]}" >"$out" 2>"$err" || rc=$?
  else "${cmd[@]}" >"$out" 2>"$err" || rc=$?; fi
  if [ "$rc" -eq 124 ]; then rm -f "$out" "$err"; die "secret scan of $dest did not finish within ${secs}s; refusing to start (list a smaller folder, or raise ZAI_FENCE_OPEN_SCAN_SECS)"; fi
  bad=$(cat "$err" 2>/dev/null || true)
  # BUG zai-fence-tmp-cwd (2026-11-17): /tmp holds root-owned mode-700 dirs
  # (systemd-private-*) that find cannot open, so a cwd of /tmp was refused.
  # A permission-denied entry NOT owned by this user is skipped and counted:
  # the worker is the same user and cannot read it or chmod it open. One owned
  # by this user stays fatal (the worker could chmod it back and hide an
  # unscanned .env there; test_sec2_3). Any other find error stays fatal.
  if [ -n "$bad" ] && [ "$rc" -eq 1 ]; then
    local eline ep skipped=0 fatal=""
    while IFS= read -r eline; do
      [ -n "$eline" ] || continue
      case "$eline" in
        "find: '"*"': Permission denied")
          ep="${eline#"find: '"}"; ep="${ep%"': Permission denied"}"
          if [ -e "$ep" ] && [ "$(stat -c %u -- "$ep" 2>/dev/null)" != "$(id -u)" ]; then skipped=$((skipped+1)); continue; fi ;;
      esac
      fatal="$eline"; break
    done <<<"$bad"
    if [ -z "$fatal" ]; then
      bad=""; rc=0
      echo "zai-fence: skipped $skipped unreadable entries under $dest (owned by another user, so the worker cannot read them either)" >&2
    fi
  fi
  if [ "$rc" -ne 0 ] || [ -n "$bad" ]; then rm -f "$out" "$err"; die "secret scan of $dest failed (find exit $rc), refusing to start: ${bad%%$'\n'*}"; fi
  while IFS=$'\t' read -r -d '' t p; do
    rel="${p#"$src"/}"; [ "$rel" = "$p" ] && rel="${p#"$src"}"
    p="$dest/$rel"; p="${p%/}"
    case "$t" in
      G) GIT_REPOS+=("${p%/.git}") ;;
      P) GIT_POINTERS+=("$p") ;;
      L) die "refusing: $p is a symlink (a .git link redirects the host's git); remove it and relaunch" ;;
      S) mask "$p" ;;
      M) if [ -L "$p" ]; then
           local r; r=$(realpath -e "$p" 2>/dev/null) || continue
           exposed "$r" && mask "$r"
         else mask "$p"; fi ;;
    esac
  done <"$out"
  rm -f "$out" "$err"
}

# worktree_registry_ro GITDIR: GITDIR/worktrees read-only at its top level,
# each existing entry re-bound read+write (git writes HEAD, index, logs there)
# with its gitdir/commondir back-links read-only. BUG zai-fence-forged-worktree
# (2026-11-19 review of 3a798d32b, finding 2): with only existing entries
# protected, a worker could add worktrees/<new> whose gitdir names a folder it
# writes, plant a pointer there, and a later plain-glm launch from that folder
# passed the four-way worktree check and was bound read+write. An absent
# registry is created empty on the host first (git treats an empty one as
# none), so it cannot be created inside the fence either. Cost: git worktree
# add/prune fail inside the fence. Applied even with ZAI_FENCE_ALLOW_CONFIG=1:
# that lifts config protection, never the registry the fence itself trusts.
worktree_registry_ro(){
  local g="$1" w="$1/worktrees" c
  [ -d "$g" ] && [ ! -L "$g" ] || return 0
  [ -e "$g/HEAD" ] || [ -L "$g/HEAD" ] || return 0   # not a repository (git_protect masks it)
  no_link "$w"
  if [ ! -e "$w" ] && [ "$PRINT" != 1 ]; then
    mkdir "$w" || die "cannot create the empty worktree registry $w"
  fi
  [ -d "$w" ] || [ "$PRINT" = 1 ] || die "$w is not a directory; refusing"
  A+=(--ro-bind "$w" "$w"); PROT+=("$w")
  for c in "$w"/* "$w"/.[!.]* "$w"/..?*; do
    [ -d "$c" ] && [ ! -L "$c" ] || continue
    A+=(--bind "$c" "$c")
  done
  for c in "$w"/*/gitdir "$w"/*/commondir; do ro "$c"; done
}

# git_protect REPO: config, hooks and their redirect targets read-only.
git_protect(){
  local r="$1" g="$1/.git" t k v
  [ -d "$g" ] || return 0
  no_link "$g"
  # no HEAD: not a repository (a cache or a stray dir); hide it rather than
  # write placeholders into it and leave its missing config creatable
  if [ ! -e "$g/HEAD" ] && [ ! -L "$g/HEAD" ]; then git_mask "$g"; return 0; fi
  # first: its child re-binds must sit under the file binds below
  worktree_registry_ro "$g"
  no_link "$g/hooks"
  [ -d "$g/hooks" ] || mkdir -p "$g/hooks" 2>/dev/null
  ro "$g/config"; ro "$g/hooks"
  git_placeholder "$g/commondir" "."
  git_placeholder "$g/config.worktree" ""
  for t in "$g"/worktrees/*/; do [ -d "$t" ] && git_placeholder "${t%/}/config.worktree" ""; done
  # metadata the host's next git command trusts (review rev 2): worktree
  # pointers back, commondir, per-worktree config, submodule configs and hooks
  for t in "$g"/worktrees/*/config "$g"/worktrees/*/config.worktree "$g"/worktrees/*/commondir \
           "$g"/worktrees/*/gitdir; do ro "$t"; done
  if [ -d "$g/modules" ]; then
    while IFS= read -r -d '' t; do ro "$t"; done < <(find "$g/modules" \( -name config -o -name config.worktree -o -name commondir -o -name gitdir \) -type f -print0 -o -name hooks -type d -prune -print0 2>/dev/null)
  fi
  while read -r k v; do
    [ -n "$v" ] || continue
    case "$k" in core.hookspath) case "$v" in /*) t="$v" ;; *) t="$r/$v" ;; esac ;;
                 *) case "$v" in /*) t="$v" ;; *) t="$g/$v" ;; esac ;; esac
    if [ -e "$t" ]; then
      t=$(realpath "$t"); exposed "$t" && ro "$t"
    elif exposed "$(dirname "$t")"; then
      die "$g/config points $k at $t, which does not exist inside a writable tree (a worker could create it); refusing"
    fi
  done < <(git config -f "$g/config" --get-regexp '^(core\.hookspath|include\.path|includeif\..*\.path)$' 2>/dev/null)
}

# git_mask PATH: a .git that is neither a pointer nor a repository (BUG
# zai-fence-nonpointer-git, 2026-11-19: uv writes a plain .uvcache/sdists-v9/.git
# file, which used to refuse every glm-open launch). Why .git is checked at all:
# a .git the worker could write becomes, on the host's next unfenced git run in
# that folder, a pointer to a worker-made gitdir whose config (core.fsmonitor,
# hooks) runs code outside the fence. So the path is hidden read-only: a file
# under /dev/null, a directory under an empty read-only tmpfs. Never a widening:
# the mask only hides; it binds nothing from the host. It goes in PROT so its
# writable ancestors are pinned (a renamed parent cannot carry the mask away),
# and the mount lands on whatever is at the path at bwrap time, so a host-side
# swap after this check still ends up masked (a type change fails the preflight).
git_mask(){
  local p="$1"
  no_link "$p"
  if [ -d "$p" ]; then A+=(--tmpfs "$p" --remount-ro "$p")
  else A+=(--ro-bind /dev/null "$p"); fi
  PROT+=("$p")
  echo "zai-fence: masked $p (a .git that is not a git pointer or repository; hidden read-only inside the fence)" >&2
}

# git_pointer_check FILE: a .git pointer must resolve inside the repo tree it
# sits in (the root's own .git, or the opening holding it); it is then bound
# read-only (review rev 2: a rewritten pointer redirects the host's git).
git_pointer_check(){
  local f="$1" line tgt top="" d om
  [ -L "$f" ] && die "refusing: $f is a symlink (a .git link redirects the host's git); remove it and relaunch"
  IFS= read -r line < "$f" || line=""
  case "$line" in "gitdir: "*) tgt="${line#gitdir: }" ;; *) git_mask "$f"; return 0 ;; esac
  case "$tgt" in /*) ;; *) tgt="$(dirname "$f")/$tgt" ;; esac
  tgt=$(realpath -m "$tgt") || die "cannot resolve the git pointer $f"
  # Allowed targets: the root's own .git (protected above; also covers a
  # worktree of the root kept inside an opened folder, MDTWII field report
  # 2026-11-16), or the opened folder that holds the pointer.
  if ! under "$f" "$ROOT"; then
    while IFS=$'\t' read -r om d; do [ -n "$d" ] && under "$f" "$d" && top="$d"; done <<<"$OPEN_DIRS"
  fi
  if ! under "$tgt" "$ROOT/.git" && { [ -z "$top" ] || ! under "$tgt" "$top"; }; then
    die "git pointer $f resolves to $tgt, outside its own repo (${top:-$ROOT}) and outside $ROOT/.git; refusing (the host's git would follow it)"
  fi
  under "$tgt" "$ROOT/.git" && pointer_backlinked "$f" "$tgt"
  ro "$f"
}

# pointer_backlinked FILE TARGET: a pointer into ROOT/.git must be backed by
# its target (BUG zai-fence-pointer-backlink, 2026-11-19 review of 3a798d32b,
# finding 3: any pointer leading into ROOT/.git was accepted). A worktree
# entry ROOT/.git/worktrees/<n> needs its gitdir file to name FILE; a
# submodule dir ROOT/.git/modules/... needs core.worktree to name FILE's
# folder. Anything else (ROOT/.git itself, a path deeper in it) refuses.
pointer_backlinked(){
  local f="$1" tgt="$2" back="" n
  case "$tgt" in
    "$ROOT/.git/worktrees/"*)
      n="${tgt#"$ROOT/.git/worktrees/"}"
      case "$n" in ""|*/*) die "git pointer $f resolves to $tgt, not a worktree entry of $ROOT/.git; refusing" ;; esac
      { IFS= read -r back < "$tgt/gitdir"; } 2>/dev/null || back=""
      case "$back" in "") ;; /*) ;; *) back="$tgt/$back" ;; esac
      [ -n "$back" ] && [ "$(realpath -m "$back")" = "$f" ] \
        || die "git pointer $f resolves to $tgt, whose gitdir does not point back to $f; refusing (not a registered worktree)" ;;
    "$ROOT/.git/modules/"*)
      back=$(git config -f "$tgt/config" --get core.worktree 2>/dev/null) || back=""
      case "$back" in "") ;; /*) ;; *) back="$tgt/$back" ;; esac
      [ -n "$back" ] && [ "$(realpath -m "$back")" = "$(dirname "$f")" ] \
        || die "git pointer $f resolves to $tgt, whose core.worktree does not point back to $(dirname "$f"); refusing (not a registered submodule)" ;;
    *) die "git pointer $f resolves to $tgt, which is neither a worktree nor a submodule entry of $ROOT/.git; refusing" ;;
  esac
  return 0
}

# planning_dir_ro: the root's planning/ is read-only at its top level (existing
# children re-bound read+write), so a worker cannot create planning/fleet-<new>
# that fleet discovery (newest run dir) would pick up (review rev 3).
planning_dir_ro(){
  local d="$ROOT/planning" c
  [ -d "$d" ] || [ -L "$d" ] || return 0
  no_link "$d"
  A+=(--ro-bind "$d" "$d"); PROT+=("$d")
  for c in "$d"/* "$d"/.[!.]* "$d"/..?*; do
    [ -e "$c" ] && [ ! -L "$c" ] || continue
    A+=(--bind "$c" "$c")
  done
}

# exclude_placeholder: list /.mcp.json in the root repo's local
# .git/info/exclude (shared by its worktrees, never committed) so the
# placeholder never shows as untracked. Skipped when already listed or when
# .mcp.json is tracked.
exclude_placeholder(){
  local r="${1:-$ROOT}" ex
  ex="$r/.git/info/exclude"
  [ -d "$r/.git" ] || return 0
  git -C "$r" ls-files --error-unmatch .mcp.json >/dev/null 2>&1 && return 0
  no_link "$r/.git/info"; no_link "$ex"
  [ -f "$ex" ] && grep -qxF '/.mcp.json' "$ex" && return 0
  mkdir -p "$r/.git/info" && printf '/.mcp.json\n' >> "$ex" || die "cannot update $ex"
}

# git_placeholder FILE CONTENT: git reads FILE when it EXISTS (final review fin
# 1: a worker-created .git/commondir redirects the whole repo, a
# config.worktree adds config). A whole read-only .git is not possible (git
# creates index.lock and friends directly in it), so an absent FILE is written
# on the host with neutral CONTENT and bound read-only. "." as commondir means
# "this gitdir"; an empty config.worktree adds nothing.
git_placeholder(){
  local f="$1"
  no_link "$f"
  if [ ! -e "$f" ] && [ "$PRINT" != 1 ]; then
    printf '%s' "$2" > "$f" || die "cannot write the git placeholder $f"
  fi
  ro "$f"
}

# protect_tree DIR: what a later unfenced Claude session or git on the host
# would load from DIR (the root, a worktree, an rw opening): .mcp.json
# placeholder, read-only .claude stand-in when absent, and (non-root trees
# only) a read-only empty .git stand-in when DIR is not a repo.
protect_tree(){
  local d="$1" kind="$2"
  [ -d "$d" ] && [ ! -L "$d" ] || return 0
  no_link "$d/.mcp.json"
  if [ ! -e "$d/.mcp.json" ] && [ "$PRINT" != 1 ]; then
    (umask 022; printf '{"mcpServers":{}}\n' > "$d/.mcp.json") || die "cannot write the placeholder $d/.mcp.json"
    exclude_placeholder "$([ "$kind" = opening ] && printf '%s' "$d" || printf '%s' "$ROOT")"
  fi
  ro "$d/.mcp.json"
  if [ ! -e "$d/.claude" ] && [ "${ZAI_FENCE_ALLOW_CONFIG:-0}" != 1 ]; then
    A+=(--tmpfs "$d/.claude" --remount-ro "$d/.claude"); PROT+=("$d/.claude")
  fi
  if [ "$kind" = opening ] && [ ! -e "$d/.git" ]; then
    A+=(--tmpfs "$d/.git" --remount-ro "$d/.git"); PROT+=("$d/.git")
  fi
}

# claude_dir_ro DIR: read-only, then every child re-bound read+write EXCEPT
# what a later unfenced Claude session loads or runs: settings*.json, hooks,
# skills, agents, commands, output-styles (review rev 5), and the glm-open list.
claude_dir_ro(){
  local d="$1" c
  [ -d "$d" ] || [ -L "$d" ] || return 0
  no_link "$d"
  A+=(--ro-bind "$d" "$d"); PROT+=("$d")
  for c in "$d"/* "$d"/.[!.]* "$d"/..?*; do
    [ -e "$c" ] || [ -L "$c" ] || continue
    case "$(basename "$c")" in settings*.json|hooks|skills|agents|commands|output-styles|glm-open-dirs) continue ;; esac
    [ -L "$c" ] && continue
    A+=(--bind "$c" "$c")
  done
}

TRUSTED="CLAUDE.md RTK.md model-pricing.md statusline-command.sh rules references agents skills commands hooks helpers core cfn-config cfn-scripts cfn-data cfn-extras prompts adaptive-context agent-principles tooling plugins"

# pin_ancestors: for every PROT path inside a writable tree (the root or an rw
# opening), self-bind each directory between that tree's top and the path,
# top-down, deduplicated. The tree tops are mount points already.
pin_ancestors(){
  local p t top best d om
  local -a chain
  local -A seen=()
  local -a tops=("$ROOT")
  [ -n "$WT_OUT" ] && tops+=("$WT_OUT")
  while IFS=$'\t' read -r om d; do [ -n "$d" ] && [ "$om" = rw ] && tops+=("$d"); done <<<"$OPEN_DIRS"
  for p in ${PROT[@]+"${PROT[@]}"}; do
    best=""
    for top in "${tops[@]}"; do
      under "$p" "$top" && [ "${#top}" -gt "${#best}" ] && best="$top"
    done
    [ -n "$best" ] || continue
    chain=()
    d=$(dirname "$p")
    while [ "$d" != "$best" ] && under "$d" "$best"; do chain=("$d" ${chain[@]+"${chain[@]}"}); d=$(dirname "$d"); done
    for d in ${chain[@]+"${chain[@]}"}; do
      [ -n "${seen[$d]:-}" ] && continue
      seen[$d]=1
      [ -d "$d" ] && [ ! -L "$d" ] && A+=(--bind "$d" "$d")
    done
  done
}

build(){
  local p t om fd e d
  # base
  A+=(--unshare-all --new-session --die-with-parent)
  [ "$NET" = host ] && A+=(--share-net)
  A+=(--tmpfs / --dev /dev --proc /proc --tmpfs /tmp --ro-bind /usr /usr)
  for p in bin sbin lib lib64 lib32 libx32; do
    if [ -L "/$p" ]; then A+=(--symlink "$(readlink "/$p")" "/$p")
    elif [ -d "/$p" ]; then A+=(--ro-bind "/$p" "/$p"); fi
  done
  A+=(--dir /etc)
  for p in ld.so.cache ld.so.conf ld.so.conf.d localtime timezone nsswitch.conf hosts host.conf gai.conf \
           passwd group os-release lsb-release gnutls ssl/certs ssl/openssl.cnf ca-certificates.conf \
           alternatives profile profile.d bash.bashrc inputrc terminfo mime.types; do
    [ -e "/etc/$p" ] && A+=(--ro-bind "$(realpath "/etc/$p")" "/etc/$p")
  done
  [ -e /etc/resolv.conf ] && t=$(realpath /etc/resolv.conf 2>/dev/null) && A+=(--ro-bind "$t" /etc/resolv.conf)
  [ -d /opt/claude-org-plugins ] && A+=(--ro-bind /opt/claude-org-plugins /opt/claude-org-plugins)
  A+=(--dir /run/zai-fence --ro-bind "$BROKER" /run/zai-fence/broker.py --bind "$NETDIR" /run/zai-fence/net)
  [ "$PRINT" = 1 ] || A+=(--ro-bind "$WBASE/gen/gitignore" /run/zai-fence/gitignore)

  # private home, the command and its interpreter
  A+=(--bind "$PHOME" "$HOME_R")
  for p in "$CMD_REAL" "$CMD_INTERP"; do
    [ -n "$p" ] || continue
    case "$p" in /usr/*) ;; *) A+=(--ro-bind "$p" "$p") ;; esac
  done
  if [ "$CMD_PATH" != "$CMD_REAL" ]; then
    case "$CMD_PATH" in /usr/*|/bin/*|/sbin/*) ;; *) A+=(--symlink "$CMD_REAL" "$CMD_PATH") ;; esac
  fi

  # (a) rw openings, then the root, from pinned fds
  while IFS=$'\t' read -r om p; do
    [ -n "$p" ] && [ "$om" = rw ] || continue
    pin "$p" fd; A+=(--bind-fd "$fd" "$p")
  done <<<"$OPEN_DIRS"
  pin "$ROOT" ROOT_FD
  A+=(--bind-fd "$ROOT_FD" "$ROOT")
  if [ -n "$WT_OUT" ]; then pin "$WT_OUT" WT_FD; A+=(--bind-fd "$WT_FD" "$WT_OUT"); fi

  # secret scans now (pinned objects), masks applied in (e)
  # the root gets the full secret-name list too (final review fin 3)
  local -a pats=()
  set -f; for p in $CFN_OPEN_SECRET_NAMES; do pats+=("$p"); done; set +f
  echo "zai-fence: checking $ROOT for secret files..." >&2
  scan_tree "/proc/$$/fd/$ROOT_FD" "$ROOT" "" "${pats[@]}"
  if [ -n "$WT_OUT" ]; then
    echo "zai-fence: checking the linked worktree $WT_OUT for secret files..." >&2
    scan_tree "/proc/$$/fd/$WT_FD" "$WT_OUT" "" "${pats[@]}"
  fi
  local -A ofd=()
  while IFS=$'\t' read -r om p; do
    [ -n "$p" ] || continue
    pin "$p" fd; ofd[$p]=$fd
    if printf '%s\n' "$NOSCAN_DIRS" | grep -qxF -- "$p"; then
      # noscan: entry (user-approved): no tree walk. Its top-level .git is
      # still handled below; nested repos and sockets inside are not checked.
      echo "zai-fence: not checking $p for secret files (noscan)" >&2
      if [ -L "$p/.git" ]; then die "refusing: $p/.git is a symlink; remove it and relaunch"
      elif [ -d "$p/.git" ]; then GIT_REPOS+=("$p")
      elif [ -f "$p/.git" ]; then GIT_POINTERS+=("$p/.git"); fi
      continue
    fi
    # progress on stderr: big folders on /mnt/c take minutes (MDTWII field report)
    echo "zai-fence: checking $p for secret files (big folders on /mnt/c can take minutes)..." >&2
    scan_tree "/proc/$$/fd/$fd" "$p" "${ZAI_FENCE_OPEN_SCAN_SECS:-600}" "${pats[@]}"
  done <<<"$OPEN_DIRS"

  # Escape B (final codex review): a read-only bind moves with its parent when
  # the worker renames that parent, then the worker recreates the path with its
  # own content. So (b)-(d) are built into a separate list first; every
  # writable ancestor of a protected path is then self-bound (a mount point
  # cannot be renamed or removed) BEFORE those binds are applied.
  local -a A0=("${A[@]}")
  A=()

  # (b) git / .claude / fleet-config protections
  if [ "${ZAI_FENCE_ALLOW_CONFIG:-0}" != 1 ]; then
    git_protect "$ROOT"
    claude_dir_ro "$ROOT/.claude"
    for p in "$ROOT"/.claude/worktrees/*/.claude; do [ -L "$p" ] || claude_dir_ro "$p"; done
  else
    worktree_registry_ro "$ROOT/.git"
  fi
  planning_dir_ro
  for p in "$ROOT"/planning/fleet-*/engines.env "$ROOT"/planning/fleet-*/fleet.env; do ro "$p"; done
  for p in ${GIT_POINTERS[@]+"${GIT_POINTERS[@]}"}; do git_pointer_check "$p"; done
  # .mcp.json, .claude and .git stand-ins (review rev 5, final review fin 2):
  # root, its worktrees, and every rw opening. Placeholders written on the host
  # stay after the run: deleting one would detach the read-only mount in any
  # other worker still running on the same tree.
  protect_tree "$ROOT" root
  for d in "$ROOT"/.claude/worktrees/*; do protect_tree "$d" worktree; done
  if [ -n "$WT_OUT" ]; then
    protect_tree "$WT_OUT" worktree
    [ "${ZAI_FENCE_ALLOW_CONFIG:-0}" = 1 ] || claude_dir_ro "$WT_OUT/.claude"
  fi
  while IFS=$'\t' read -r om d; do
    [ -n "$d" ] && [ "$om" = rw ] && protect_tree "$d" opening
  done <<<"$OPEN_DIRS"
  for p in ${GIT_REPOS[@]+"${GIT_REPOS[@]}"}; do [ "$p" = "$ROOT" ] || git_protect "$p"; done
  while IFS=$'\t' read -r om p; do
    [ -n "$p" ] && [ "$om" = rw ] && claude_dir_ro "$p/.claude"
  done <<<"$OPEN_DIRS"
  ro "$ROOT/$CFN_OPEN_DIRS_FILE"

  # (c) ro: openings (pinned), .zai-fence-readonly entries
  while IFS=$'\t' read -r om p; do
    [ -n "$p" ] && [ "$om" = ro ] && { A+=(--ro-bind-fd "${ofd[$p]}" "$p"); PROT+=("$p"); }
  done <<<"$OPEN_DIRS"
  local rel
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    case "$rel" in /*) p="$rel" ;; *) p="$ROOT/$rel" ;; esac
    [ -e "$p" ] || continue
    p=$(realpath "$p"); under "$p" "$ROOT" && ro "$p"
  done < <(cfn_ro_entries "$ROOT")

  # (d) trusted runtime, sanitized config
  for e in $TRUSTED; do
    [ -e "$HOME/.claude/$e" ] || continue
    t=$(realpath "$HOME/.claude/$e") || continue
    A+=(--ro-bind "$t" "$HOME_R/.claude/$e")
    exposed "$t" && { A+=(--ro-bind "$t" "$t"); PROT+=("$t"); }
  done
  for p in "$HOME"/.claude/*/*; do
    [ -L "$p" ] || continue
    t=$(realpath "$p" 2>/dev/null) || continue
    exposed "$t" && { A+=(--ro-bind "$t" "$t"); PROT+=("$t"); }
  done
  A+=(--ro-bind "$WBASE/gen/settings.json" "$HOME_R/.claude/settings.json")
  A+=(--ro-bind "$WBASE/gen/gitconfig" "$HOME_R/.gitconfig")

  # pin ancestors, then apply (b)-(d)
  local -a A2=("${A[@]}")
  A=("${A0[@]}")
  pin_ancestors
  A+=("${A2[@]}")

  # (e) secret masks, then credential masks LAST
  A+=(${MASKS[@]+"${MASKS[@]}"})
  MASKS=()
  for p in .claude/.credentials.json .claude/history.jsonl .claude/file-history .claude/settings.local.json; do
    t=$(hp "$p"); [ -e "$t" ] && exposed "$t" && mask "$t"
  done
  for e in $CFN_CRED_PATHS; do
    for p in "$HOME_R/$e" "$(hp "$e")"; do [ -e "$p" ] && exposed "$p" && mask "$p"; done
  done
  A+=(${MASKS[@]+"${MASKS[@]}"})
  A+=(--chdir "$(pwd)")
}

# Socket families (review rev 4): a seccomp filter allows socket() only for
# AF_UNIX, AF_INET, AF_INET6 (no AF_VSOCK to the Windows host, no netlink or
# packet sockets) and refuses io_uring. Generated by the broker script with
# python's struct module; fd 63 is reopened before each bwrap run (bwrap
# consumes it).
SECCOMP_FD=63
if [ "$PRINT" = 1 ]; then SECCOMP_FILE=/dev/null
else
  SECCOMP_FILE="$WBASE/gen/seccomp.bpf"
  "$PY" "$BROKER" seccomp --out "$SECCOMP_FILE" || die "cannot generate the seccomp filter for this machine; refusing to run"
fi
A+=(--seccomp "$SECCOMP_FD")
KEEP_FDS+="${KEEP_FDS:+,}$SECCOMP_FD"

build || die "mount plan generation failed"
[ "${#A[@]}" -gt 0 ] || die "empty mount plan"

if [ "$PRINT" = 1 ]; then
  printf '%s\n' "$BWRAP" "${A[@]}"
  exit 0
fi

unset SSH_AUTH_SOCK GH_TOKEN GITHUB_TOKEN TMUX TMUX_PANE WSL_INTEROP WSL_DISTRO_NAME DBUS_SESSION_BUS_ADDRESS \
      XDG_RUNTIME_DIR HTTP_PROXY http_proxy NO_PROXY no_proxy ALL_PROXY all_proxy
export HOME="$HOME_R" DISABLE_AUTOUPDATER=1 TMPDIR=/tmp/ CLAUDE_CODE_TMPDIR=/tmp GIT_CONFIG_NOSYSTEM=1 \
       CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
FLEET_CLI="$HOME/.claude/skills/cfn-fleet/cli"
[ -x "$FLEET_CLI/fleet" ] && export PATH="$FLEET_CLI:$PATH"

# CLOSER KEEP_FDS ARGS...: run ARGS with every fd above 2 closed except
# KEEP_FDS. When ZAI_FENCE_ENV_ALLOW is set (a regex), the environment is
# replaced by only the names matching it, minus ZAI_FENCE_ENV_DENY (review rev
# 1: an unset list cannot know every secret name; values never go to argv).
CLOSER='import os,re,sys
keep={int(x) for x in sys.argv[1].split(",") if x}
for n in os.listdir("/proc/self/fd"):
    fd=int(n)
    if fd>2 and fd not in keep:
        try: os.close(fd)
        except OSError: pass
for fd in keep: os.set_inheritable(fd, True)
env=dict(os.environ)
allow=env.pop("ZAI_FENCE_ENV_ALLOW",None); deny=env.pop("ZAI_FENCE_ENV_DENY","^$")
if allow is not None:
    a=re.compile(allow); d=re.compile(deny)
    env={k:v for k,v in env.items() if a.fullmatch(k) and not d.search(k)}
os.execve(sys.argv[2], sys.argv[2:], env)'

# The worker environment: these names only (values stay in the environment,
# never argv). FLEET_* config passes, but never anything secret-shaped.
ZAI_ENV_ALLOW='PATH|TERM|COLORTERM|LANG|LANGUAGE|LC_[A-Z_]+|TZ|HOME|USER|LOGNAME|SHELL|TMPDIR|NO_COLOR|FORCE_COLOR|COLUMNS|LINES'
ZAI_ENV_ALLOW+='|DISABLE_AUTOUPDATER|GIT_CONFIG_NOSYSTEM|CLAUDE_CODE_TMPDIR|CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC'
ZAI_ENV_ALLOW+='|CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT|CLAUDE_CODE_MAX_OUTPUT_TOKENS|MAX_CONTEXT_TOKENS|MAX_THINKING_TOKENS|API_TIMEOUT_MS'
ZAI_ENV_ALLOW+='|ANTHROPIC_BASE_URL|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_MODEL|ANTHROPIC_SMALL_FAST_MODEL|ANTHROPIC_DEFAULT_[A-Z]+_MODEL|FLEET_[A-Z0-9_]+'
# FLEET_* passes for fleet config, never a secret-shaped name (FLEET_ZAI_TOKEN).
# ANTHROPIC_AUTH_TOKEN is the one secret the worker needs (the z.ai key).
ZAI_ENV_DENY='^FLEET_.*(TOKEN|SECRET|PASSW|KEY|CRED|AUTH)'

reopen_seccomp(){ [ "$PRINT" = 1 ] && return 0; eval "exec $SECCOMP_FD<\"\$SECCOMP_FILE\"" || die "cannot open the seccomp filter"; }

# Preflight: the identical namespace + mount set around true.
reopen_seccomp
pf_err=$(ZAI_FENCE_ENV_ALLOW="$ZAI_ENV_ALLOW" ZAI_FENCE_ENV_DENY="$ZAI_ENV_DENY" \
  "$PY" -c "$CLOSER" "$KEEP_FDS" "$BWRAP" "${A[@]}" -- "$TRUE_BIN" 2>&1 </dev/null) \
  || die "bwrap preflight failed, refusing to run unfenced: ${pf_err:-no output}"


if [ "$NET" = broker ]; then
  # Host half of the broker: started without our fds, exits when this pid
  # (bwrap after the exec below) is gone.
  setsid "$PY" -c "$CLOSER" "" "$PY" "$BROKER" host --sock "$NETDIR/broker.sock" \
    --allow "$NET_ALLOW" --watch "$$" </dev/null >"$WBASE/broker.log" 2>&1 &
  for _ in $(seq 1 50); do [ -S "$NETDIR/broker.sock" ] && break; sleep 0.1; done
  [ -S "$NETDIR/broker.sock" ] || die "network broker did not start (see $WBASE/broker.log); refusing to run"
fi

shift
set -- "$CMD_PATH" "$@"
if [ "$CMD_BASE" = claude ]; then
  set -- "$@" --settings '{"sandbox":{"enabled":false}}'
fi
if [ "$NET" = broker ]; then
  set -- "$PY" /run/zai-fence/broker.py relay --port "$PROXY_PORT" --sock /run/zai-fence/net/broker.sock -- "$@"
fi

reopen_seccomp
export ZAI_FENCE_ENV_ALLOW="$ZAI_ENV_ALLOW" ZAI_FENCE_ENV_DENY="$ZAI_ENV_DENY"
exec "$PY" -c "$CLOSER" "$KEEP_FDS" "$BWRAP" "${A[@]}" -- "$@"
die "exec of bwrap failed"
