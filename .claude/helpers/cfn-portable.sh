# shellcheck shell=bash
# cfn-portable.sh -- GNU-tool compatibility shims. Sourced, never executed.
#
# CFN is written against a GNU userland. macOS ships a BSD one, so a script that
# is correct on WSL2 fails on a Mac in one of two ways: the command does not
# exist at all (timeout, nproc, free), or it exists with different flags (stat,
# date, sed, readlink). See readme/macos-setup.md.
#
# The usual advice is "brew install coreutils and put gnubin first on PATH".
# That works in a login shell and fails everywhere else that matters: hooks
# spawned by Claude Code, cron, launchd, and any non-interactive shell that
# never reads a profile. This file removes the PATH dependency by defining
# shell functions that shadow the missing or incompatible commands.
#
# DESIGN RULES
#
#   1. Every shim is defined ONLY when the GNU behavior is absent. On Linux this
#      file defines nothing and changes no behavior, which is why CI can prove
#      the injection is safe without a Mac.
#   2. Every shim delegates through `command`, never a bare call, so a shim can
#      never recurse into itself.
#   3. A shim translates the forms CFN actually uses. An untranslated form is
#      passed through unchanged so it fails loudly on the real binary rather
#      than silently doing the wrong thing. Silently-wrong is worse than a
#      visible error.
#
# TESTING HOOK: exporting CFN_PORTABLE_FORCE_SHIMS=1 defines every shim
# regardless of what the host actually supports. It exists so Linux CI can
# exercise the BSD translation paths (with `command` stubbed out) instead of
# shipping them untested until someone opens a Mac. Never set it in production.
#
# KNOWN LIMIT: shell functions are not inherited by a separate binary, so a
# GNU-ism inside `find -exec`, `xargs`, `sudo`, or a `#!/bin/sh` subscript is
# NOT covered by this file. Those call sites are fixed in place instead.
#
# Usage (one line, near the top of a script, after `set -e`):
#   . "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

[ -n "${CFN_PORTABLE_LOADED:-}" ] && return 0
CFN_PORTABLE_LOADED=1

# ---------------------------------------------------------------------------
# pure translation helpers (no I/O, unit-tested on Linux by
# tests/test-portable-shims.sh -- this is the only reason they are defined
# unconditionally)
# ---------------------------------------------------------------------------

# GNU stat format string -> BSD stat format string.
_cfn_stat_fmt() {
  local in="$1" out="" i=0 ch nx
  while [ "$i" -lt "${#in}" ]; do
    ch="${in:$i:1}"
    if [ "$ch" != '%' ]; then out="$out$ch"; i=$((i + 1)); continue; fi
    nx="${in:$((i + 1)):1}"
    case "$nx" in
      Y) out="$out%m"  ;;  # mtime, seconds since epoch
      X) out="$out%a"  ;;  # atime
      Z) out="$out%c"  ;;  # ctime
      W) out="$out%B"  ;;  # birth time
      s) out="$out%z"  ;;  # size in bytes
      a) out="$out%Lp" ;;  # permission bits, octal
      U) out="$out%Su" ;;  # owner name
      G) out="$out%Sg" ;;  # group name
      n) out="$out%N"  ;;  # file name
      h) out="$out%l"  ;;  # hard link count
      F) out="$out%HT" ;;  # file type, human readable
      i) out="$out%i"  ;;  # inode (same letter on both)
      '%') out="$out%%" ;;
      *) out="$out%$nx" ;;
    esac
    i=$((i + 2))
  done
  printf '%s' "$out"
}

# "7 days ago" -> "-v-7d". Returns 1 if the phrase is not translatable, which
# is the signal to pass the original through to the real `date` untouched.
_cfn_date_rel_to_v() {
  local n unit
  # shellcheck disable=SC2086
  set -- $1
  [ "$#" -eq 3 ] && [ "$3" = "ago" ] || return 1
  n="$1"; unit="$2"
  case "$n" in ''|*[!0-9]*) return 1 ;; esac
  case "$unit" in
    second|seconds) unit=S ;;
    minute|minutes) unit=M ;;
    hour|hours)     unit=H ;;
    day|days)       unit=d ;;
    week|weeks)     unit=w ;;
    month|months)   unit=m ;;
    year|years)     unit=y ;;
    *) return 1 ;;
  esac
  printf -- '-v-%s%s' "$n" "$unit"
}

# GNU timeout duration ("5", "30s", "2m", "1h", "1d") -> whole seconds.
_cfn_dur_to_secs() {
  local d="$1" n mult
  case "$d" in
    *s) n="${d%s}"; mult=1     ;;
    *m) n="${d%m}"; mult=60    ;;
    *h) n="${d%h}"; mult=3600  ;;
    *d) n="${d%d}"; mult=86400 ;;
    *)  n="$d";     mult=1     ;;
  esac
  # GNU accepts fractions; the perl fallback only needs whole seconds, so
  # truncate rather than reject.
  n="${n%%.*}"
  case "$n" in ''|*[!0-9]*) return 1 ;; esac
  printf '%s' "$((n * mult))"
}

# ---------------------------------------------------------------------------
# shims, each guarded by a capability probe
# ---------------------------------------------------------------------------

# --- timeout ---------------------------------------------------------------
# Absent from macOS entirely. coreutils installs it as `gtimeout`.
if [ -n "${CFN_PORTABLE_FORCE_SHIMS:-}" ] || ! command -v timeout >/dev/null 2>&1; then
  if command -v gtimeout >/dev/null 2>&1; then
    timeout() { command gtimeout "$@"; }
  elif command -v perl >/dev/null 2>&1; then
    # perl ships with macOS. `alarm` survives into the exec'd process and its
    # default disposition terminates it. The exit code is 142 (128+SIGALRM),
    # not GNU's 124, so do not compare against 124 in portable code.
    timeout() {
      local secs
      while [ "$#" -gt 0 ]; do
        case "$1" in
          -k|--kill-after) shift 2 ;;          # no equivalent; best effort
          -s|--signal) shift 2 ;;
          -k*|--kill-after=*|--signal=*|--preserve-status|--foreground) shift ;;
          *) break ;;
        esac
      done
      secs="$(_cfn_dur_to_secs "$1")" || return 125
      shift
      perl -e 'alarm shift; exec @ARGV or exit 127' "$secs" "$@"
    }
  fi
fi

# --- nproc -----------------------------------------------------------------
if [ -n "${CFN_PORTABLE_FORCE_SHIMS:-}" ] || ! command -v nproc >/dev/null 2>&1; then
  nproc() { sysctl -n hw.ncpu 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1; }
fi

# --- free ------------------------------------------------------------------
# Reproduces the procps `free -m` layout so existing `awk 'NR==2{print $7}'`
# and `grep '^Mem:'` pipelines keep working untouched. Only -m is meaningful;
# other units are accepted and ignored, matching how CFN calls it.
if [ -n "${CFN_PORTABLE_FORCE_SHIMS:-}" ] || ! command -v free >/dev/null 2>&1; then
  free() {
    local pagesize total
    pagesize="$(sysctl -n hw.pagesize 2>/dev/null || echo 4096)"
    total="$(sysctl -n hw.memsize 2>/dev/null || echo 0)"
    vm_stat 2>/dev/null | awk -v ps="$pagesize" -v total_b="$total" '
      /^Pages free/                  { free_p       = $3 + 0 }
      /^Pages active/                { active_p     = $3 + 0 }
      /^Pages inactive/              { inactive_p   = $3 + 0 }
      /^Pages speculative/           { spec_p       = $3 + 0 }
      /^Pages wired down/            { wired_p      = $4 + 0 }
      /^Pages occupied by compressor/{ compressed_p = $5 + 0 }
      END {
        mb          = 1024 * 1024
        total_mb    = int(total_b / mb)
        free_mb     = int(free_p * ps / mb)
        cache_mb    = int((inactive_p + spec_p) * ps / mb)
        used_mb     = int((active_p + wired_p + compressed_p) * ps / mb)
        avail_mb    = free_mb + cache_mb
        printf "%15s%12s%12s%12s%12s%12s\n", "total", "used", "free", "shared", "buff/cache", "available"
        printf "Mem:%12d%12d%12d%12d%12d%12d\n", total_mb, used_mb, free_mb, 0, cache_mb, avail_mb
      }'
    sysctl -n vm.swapusage 2>/dev/null | awk '
      { gsub(/M/, ""); printf "Swap:%11d%12d%12d\n", $3, $6, $9 }'
  }
fi

# --- stat ------------------------------------------------------------------
# BSD stat has no -c. Probe rather than test uname, so a Mac with GNU coreutils
# already first on PATH keeps using the real thing.
if [ -n "${CFN_PORTABLE_FORCE_SHIMS:-}" ] || ! command stat -c %s . >/dev/null 2>&1; then
  stat() {
    local args=() fmt="" have_fmt=0 a
    while [ "$#" -gt 0 ]; do
      a="$1"
      case "$a" in
        -c|--format|--printf) fmt="$2"; have_fmt=1; shift 2 ;;
        --format=*) fmt="${a#--format=}"; have_fmt=1; shift ;;
        --printf=*) fmt="${a#--printf=}"; have_fmt=1; shift ;;
        -c*) fmt="${a#-c}"; have_fmt=1; shift ;;
        *) args+=("$a"); shift ;;
      esac
    done
    if [ "$have_fmt" -eq 1 ]; then
      command stat -f "$(_cfn_stat_fmt "$fmt")" ${args[@]+"${args[@]}"}
    else
      command stat ${args[@]+"${args[@]}"}
    fi
  }
fi

# --- date ------------------------------------------------------------------
# BSD date has no -d. Translates the two forms CFN uses: an absolute epoch
# (-d @1700000000) and a relative phrase (-d '7 days ago'). Anything else is
# handed to the real date so it fails visibly instead of returning a wrong time.
if [ -n "${CFN_PORTABLE_FORCE_SHIMS:-}" ] || ! command date -d @0 >/dev/null 2>&1; then
  date() {
    local rel vflag
    case "${1:-}" in
      -d|--date)
        rel="$2"; shift 2
        case "$rel" in
          @*) command date -r "${rel#@}" "$@"; return $? ;;
          now) command date "$@"; return $? ;;
        esac
        if vflag="$(_cfn_date_rel_to_v "$rel")"; then
          command date "$vflag" "$@"; return $?
        fi
        command date -d "$rel" "$@"; return $?
        ;;
      --date=*)
        rel="${1#--date=}"; shift
        set -- -d "$rel" "$@"
        date "$@"; return $?
        ;;
    esac
    command date "$@"
  }
fi

# --- sed -------------------------------------------------------------------
# BSD sed -i REQUIRES a backup suffix argument. `sed -i 's/a/b/' f` therefore
# consumes the script as the suffix and silently mangles the invocation. Insert
# the empty suffix BSD wants.
if [ -n "${CFN_PORTABLE_FORCE_SHIMS:-}" ] || ! command sed --version >/dev/null 2>&1; then
  sed() {
    local args=() a
    while [ "$#" -gt 0 ]; do
      a="$1"
      case "$a" in
        -i) args+=(-i ''); shift ;;
        *) args+=("$a"); shift ;;
      esac
    done
    command sed ${args[@]+"${args[@]}"}
  }
fi

# --- readlink --------------------------------------------------------------
# readlink -f arrived in macOS 12.3. Older systems need a substitute.
if [ -n "${CFN_PORTABLE_FORCE_SHIMS:-}" ] || ! command readlink -f . >/dev/null 2>&1; then
  readlink() {
    if [ "${1:-}" = "-f" ] && [ -n "${2:-}" ]; then
      if command -v perl >/dev/null 2>&1; then
        perl -MCwd=abs_path -e 'print abs_path(shift), "\n"' "$2"
      else
        # Last resort: resolve the directory and re-attach the basename.
        printf '%s/%s\n' "$(cd "$(dirname "$2")" && pwd -P)" "$(basename "$2")"
      fi
      return $?
    fi
    command readlink "$@"
  }
fi
