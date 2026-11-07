#!/usr/bin/env bash
# codex-session-reaper.sh: delete WSL Codex session logs older than RETAIN_DAYS (3), then empty dirs.
# Scope fence: only $HOME/.codex/sessions. Anything else (the Windows desktop app's
# /mnt/c/Users/*/.codex, a symlinked sessions dir, a parent or sibling dir) is refused with exit 2.
# DRY_RUN=1 lists without deleting. CODEX_SESSIONS_DIR overrides the target only to be checked by the fence.
set -u
RETAIN_DAYS="${RETAIN_DAYS:-3}"
DRY_RUN="${DRY_RUN:-0}"
ALLOWED="$HOME/.codex/sessions"
target="${CODEX_SESSIONS_DIR-$ALLOWED}"

refuse() { echo "REFUSED: $1 (target='$target', allowed='$ALLOWED') missing=[] unexpected=[$target]" >&2; exit 2; }

[ -n "$target" ] || refuse "empty target"
case "$target" in *..*) refuse "path contains .." ;; esac
case "$target" in /mnt/*) refuse "path under /mnt" ;; esac
[ "$target" = "$ALLOWED" ] || refuse "not exactly \$HOME/.codex/sessions"
[ -d "$target" ] || { echo "no sessions dir; nothing to do"; exit 0; }
# Real path must equal the literal allowed path: rejects a symlinked sessions dir or symlinked .codex.
real=$(cd -P "$target" 2>/dev/null && pwd -P) || refuse "cannot resolve"
home_real=$(cd -P "$HOME" 2>/dev/null && pwd -P) || refuse "cannot resolve HOME"
[ "$real" = "$home_real/.codex/sessions" ] || refuse "resolves elsewhere ($real)"

# find does not follow symlinks by default; -type f skips symlinked files; -xdev stays on one filesystem.
n=0; bytes=0
while IFS= read -r -d '' f; do
    sz=$(stat -c %s "$f" 2>/dev/null || echo 0)
    if [ "$DRY_RUN" = 1 ]; then echo "DRY delete $f"; else rm -f -- "$f" || continue; fi
    n=$((n + 1)); bytes=$((bytes + sz))
done < <(find "$real" -xdev -type f -name '*.jsonl' -mtime +"$RETAIN_DAYS" -print0)
if [ "$DRY_RUN" != 1 ]; then
    find "$real" -xdev -mindepth 1 -type d -empty -mtime +"$RETAIN_DAYS" -delete 2>/dev/null
    # a day dir can become empty only after its files go, so its own mtime is fresh: sweep once more without age
    find "$real" -xdev -mindepth 1 -type d -empty -delete 2>/dev/null
fi
echo "codex-session-reaper: files=$n bytes=$bytes retain_days=$RETAIN_DAYS dry_run=$DRY_RUN"
