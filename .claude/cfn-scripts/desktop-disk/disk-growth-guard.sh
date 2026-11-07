#!/usr/bin/env bash
# disk-growth-guard.sh: root-disk growth checks, run by desktop-health.sh each tick. Prints lines, never deletes.
#   root_used=<GB>                         always (desktop-health copies it into health.log)
#   WARN root_high <text>                  / used > ROOT_WARN_GB (200)
#   WARN root_growth <text>                / grew > GROWTH_WARN_GB (15) over GROWTH_DAYS (7)
#   CARGO <path> <size_gb>G                dirs > CARGO_MIN_BYTES (2 GB) that look like cargo targets
#                                          (CACHEDIR.TAG, or debug/.fingerprint), outside CHURN_EXCLUDE
#   REFUSED ...                            a scan root under /mnt (never crawl /mnt/c or other drives)
# The find over / takes ~3 min, so it runs detached (SCAN_SYNC=1 runs inline) at most every SCAN_EVERY_S (6h);
# each run prints the last finished result (empty until the first scan completes).
set -u
STATE="${STATE:-$HOME/.local/state/desktop-health}"
NOW="${NOW:-$(date +%s)}"
ROOT_WARN_GB="${ROOT_WARN_GB:-200}"
GROWTH_WARN_GB="${GROWTH_WARN_GB:-15}"
GROWTH_DAYS="${GROWTH_DAYS:-7}"
HIST_EVERY_S="${HIST_EVERY_S:-3600}"
SCAN_ROOTS="${SCAN_ROOTS:-/}"
CARGO_MIN_BYTES="${CARGO_MIN_BYTES:-2000000000}"
CHURN_EXCLUDE="${CHURN_EXCLUDE:-/mnt/wsl/churn}"
SCAN_EVERY_S="${SCAN_EVERY_S:-21600}"
GB=1000000000
mkdir -p "$STATE"

used=${ROOT_USED_BYTES:-$(df -B1 --output=used / 2>/dev/null | awk 'NR==2{print $1}')}
used=${used:-0}
echo "root_used=$(( used / GB ))"
[ $(( used / GB )) -gt "$ROOT_WARN_GB" ] && echo "WARN root_high / is $(( used / GB )) GB used (warn above ${ROOT_WARN_GB} GB). Main disk growth also grows D: for good; see desktop-disks.md."

# growth over GROWTH_DAYS against the oldest history row inside the window
H="$STATE/root-used.tsv"; touch "$H"
base=$(awk -v cut=$(( NOW - GROWTH_DAYS * 86400 )) '$1>=cut{print; exit}' "$H")
if [ -n "$base" ]; then
    b_t=${base%% *}; b_u=${base##* }
    g=$(( (used - b_u) / GB ))
    [ "$g" -gt "$GROWTH_WARN_GB" ] && echo "WARN root_growth / grew ${g} GB in $(( (NOW - b_t) / 86400 )) days (warn above ${GROWTH_WARN_GB} GB per ${GROWTH_DAYS} days)."
fi
last=$(tail -n 1 "$H" | awk '{print $1+0}')
if [ $(( NOW - ${last:-0} )) -ge "$HIST_EVERY_S" ]; then
    echo "$NOW $used" >> "$H"
    awk -v cut=$(( NOW - 10 * 86400 )) '$1>=cut' "$H" > "$H.tmp" && mv "$H.tmp" "$H"
fi

# cargo-target finder
CACHE="$STATE/cargo-scan.cache"
refused=0
for r in $SCAN_ROOTS; do
    case "$r" in /mnt|/mnt/*) echo "REFUSED scan root $r (never crawl /mnt drives) missing=[] unexpected=[$r]"; refused=1 ;; esac
done
[ "$refused" = 1 ] && exit 0
do_scan() {
    local tmp="$CACHE.tmp"; echo "$NOW" > "$tmp"
    {
        for r in $SCAN_ROOTS; do
            find "$r" -xdev \( -path /mnt -o -path /proc -o -path /sys -o -path /dev -o -path /run -o -path /snap -o -path "$CHURN_EXCLUDE" \) -prune -o \
                \( -name CACHEDIR.TAG -type f -printf '%h\n' \) -o \
                \( -name .fingerprint -type d -path '*/debug/.fingerprint' -printf '%h/..\n' \) 2>/dev/null
        done
    } | while IFS= read -r d; do
        d=$(cd -P "$d" 2>/dev/null && pwd -P) || continue
        case "$d" in "$CHURN_EXCLUDE"|"$CHURN_EXCLUDE"/*) continue ;; esac
        echo "$d"
    done | sort -u | while IFS= read -r d; do
        sz=$(du -sxb "$d" 2>/dev/null | awk '{print $1}')
        [ "${sz:-0}" -gt "$CARGO_MIN_BYTES" ] && echo "CARGO $d $(( sz / GB ))G"
    done >> "$tmp"
    mv "$tmp" "$CACHE"
}
if [ "${SCAN_WORKER:-0}" = 1 ]; then  # detached worker: scan only, under a lock, no output
    exec 8>"$STATE/.scan-lock"; flock -n 8 || exit 0; do_scan; exit 0
fi
cache_t=$(head -n 1 "$CACHE" 2>/dev/null | awk '{print $1+0}')
if [ -z "$cache_t" ] || [ $(( NOW - cache_t )) -ge "$SCAN_EVERY_S" ]; then
    if [ "${SCAN_SYNC:-0}" = 1 ]; then do_scan   # tests
    else SCAN_WORKER=1 setsid nohup "$0" >/dev/null 2>&1 < /dev/null &  # the find over / takes minutes; never block the health tick
    fi
fi
[ -f "$CACHE" ] && tail -n +2 "$CACHE"
exit 0
