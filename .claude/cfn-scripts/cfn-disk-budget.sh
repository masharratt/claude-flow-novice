#!/usr/bin/env bash
# cfn-disk-budget.sh - cron-ready disk budget watchdog.
#
# Watches free space on / and on /mnt/c, /mnt/d when mounted. Alerts when free space is
# below a floor (free% < CFN_DISK_FLOOR_PCT or free GB < CFN_DISK_FLOOR_GB) or fell by more
# than CFN_DISK_DROP_GB since the previous run. On alert it writes
# ${XDG_STATE_HOME:-~/.local/state}/cfn/disk-alert.json with the top growing dirs among the
# watched roots and fires one desktop notification (only for the first alert after an ack).
#
# Cheap by design: the size scan runs only when an alert fires AND the drop is at least
# CFN_DISK_SCAN_MIN_DROP_GB (or no growers are known yet), plus one baseline refresh per
# CFN_DISK_BASELINE_HOURS. Scans are depth 0 per root dir, each size call timeboxed, and the
# whole scan has a wall-clock budget.
#
# Uses /usr/bin/du, never the bare du: rtk rewrites it and hides the largest entries.
#
# Usage:
#   cfn-disk-budget.sh             run the check
#   cfn-disk-budget.sh --crontab   print the crontab line (does NOT install it)
#   cfn-disk-budget.sh --status    print the current alert JSON, if any
# Exit: 0 no alert, 1 alert written, 2 internal error (fails open: never wedges cron).
set -uo pipefail

# ---- thresholds (override with env) ----
FLOOR_PCT="${CFN_DISK_FLOOR_PCT:-10}"
FLOOR_GB="${CFN_DISK_FLOOR_GB:-50}"
DROP_GB="${CFN_DISK_DROP_GB:-20}"
SCAN_MIN_DROP_GB="${CFN_DISK_SCAN_MIN_DROP_GB:-2}"
BASELINE_HOURS="${CFN_DISK_BASELINE_HOURS:-24}"
DU_TIMEOUT="${CFN_DISK_DU_TIMEOUT:-8}"
SCAN_BUDGET="${CFN_DISK_SCAN_BUDGET:-60}"
TOP_N="${CFN_DISK_TOP_N:-10}"
MOUNTS="${CFN_DISK_MOUNTS:-/ /mnt/c /mnt/d}"
ROOTS="${CFN_DISK_ROOTS:-$HOME/projects/*:/tmp:$HOME/.claude-tmp}"
STATE_DIR="${CFN_DISK_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/cfn}"
NOTIFY_CMD="${CFN_DISK_NOTIFY_CMD:-$HOME/.claude/hooks/cfn-notify.sh}"
DU_BIN=/usr/bin/du

ALERT="$STATE_DIR/disk-alert.json"; ACK="$STATE_DIR/disk-alert.ack"
LAST="$STATE_DIR/disk-last.tsv"; SIZES="$STATE_DIR/disk-sizes.tsv"

case "${1:-}" in
  --crontab)
    echo "*/30 * * * * $(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/cfn-disk-budget.sh >/dev/null 2>&1"
    exit 0 ;;
  --status) [ -f "$ALERT" ] && cat "$ALERT"; exit 0 ;;
esac

command -v jq >/dev/null 2>&1 || { echo "cfn-disk-budget: jq missing, skipping" >&2; exit 2; }
mkdir -p "$STATE_DIR" 2>/dev/null || { echo "cfn-disk-budget: cannot create $STATE_DIR" >&2; exit 2; }
exec 9>"$STATE_DIR/disk-budget.lock"; flock -n 9 || exit 0

# df lines: "mount total_mb free_mb"
get_df() {
  if [ -n "${CFN_DISK_FAKE_DF:-}" ]; then cat "$CFN_DISK_FAKE_DF" 2>/dev/null; return; fi
  local m
  for m in $MOUNTS; do
    [ "$m" = / ] || mountpoint -q "$m" 2>/dev/null || continue
    timeout 5 df -P -B1M "$m" 2>/dev/null | awk -v m="$m" 'NR==2{print m, $2, $4}'
  done
}

# scan: prints "path size_mb" for each watched dir, honouring the time budget.
scan() {
  local start=$SECONDS r d sz
  local -a dirs=()
  shopt -s nullglob
  local IFS=:
  for r in $ROOTS; do
    IFS=' '
    for d in $r; do [ -d "$d" ] && dirs+=("$d"); done
    IFS=:
  done
  IFS=' '; shopt -u nullglob
  for d in "${dirs[@]}"; do
    (( SECONDS - start >= SCAN_BUDGET )) && { echo "cfn-disk-budget: scan budget ${SCAN_BUDGET}s hit, partial" >&2; break; }
    sz=$(timeout -k 1 "$DU_TIMEOUT" "$DU_BIN" -s -x -B1M "$d" 2>/dev/null | awk 'NR==1{print $1}')
    [ -n "$sz" ] && echo "$d $sz"
  done
}

# growers JSON from a fresh scan vs the stored baseline; refreshes the baseline.
growers_json() {
  local cur="$STATE_DIR/.sizes.new"
  scan > "$cur"
  awk -v old="$SIZES" 'BEGIN{while((getline l<old)>0){n=split(l,a," ");p=l;sub(/ [0-9]+$/,"",p);o[p]=a[n]}}
       {n=split($0,a," ");p=$0;sub(/ [0-9]+$/,"",p);s=a[n];g=(p in o)?s-o[p]:s;print g"\t"s"\t"p}' "$cur" \
    | sort -rn | head -n "$TOP_N" \
    | jq -R -s -c 'split("\n")|map(select(length>0)|split("\t")|{path:.[2],size_mb:(.[1]|tonumber),growth_mb:(.[0]|tonumber)})'
  mv -f "$cur" "$SIZES" 2>/dev/null
}

now=$(date +%s)
touch "$LAST"
had_unacked=0
[ -f "$ALERT" ] && { [ ! -f "$ACK" ] || [ "$ALERT" -nt "$ACK" ]; } && had_unacked=1

alerts='[]'; max_drop_mb=0; newlast=""
while read -r m total free; do
  [ -n "${free:-}" ] || continue
  prev=$(awk -F'\t' -v m="$m" '$1==m{print $2}' "$LAST")
  drop_mb=0; [ -n "$prev" ] && drop_mb=$(( prev - free ))
  pct=$(( total > 0 ? free * 100 / total : 100 ))
  reasons=()
  (( pct < FLOOR_PCT )) && reasons+=("floor:${pct}%<${FLOOR_PCT}%")
  (( free < FLOOR_GB * 1024 )) && reasons+=("floor:$((free/1024))GB<${FLOOR_GB}GB")
  (( drop_mb > DROP_GB * 1024 )) && reasons+=("drop:$((drop_mb/1024))GB>${DROP_GB}GB")
  newlast+="$m"$'\t'"$free"$'\t'"$now"$'\n'
  if (( ${#reasons[@]} > 0 )); then
    (( drop_mb > max_drop_mb )) && max_drop_mb=$drop_mb
    alerts=$(jq -c --arg m "$m" --argjson t "$total" --argjson f "$free" --argjson d "$drop_mb" --argjson p "$pct" \
      --arg r "$(IFS=,; echo "${reasons[*]}")" \
      '. + [{mount:$m,total_gb:($t/1024|floor),free_gb:($f/1024*10|floor/10),free_pct:$p,drop_gb:((if $d>0 then $d else 0 end)/1024*10|floor/10),reasons:($r|split(","))}]' <<<"$alerts")
  fi
done < <(get_df)
printf '%s' "$newlast" > "$LAST"

nalerts=$(jq 'length' <<<"$alerts")
if (( nalerts == 0 )); then
  # healthy: one baseline refresh per BASELINE_HOURS, otherwise nothing to do
  if [ ! -f "$SIZES" ] || [ -n "$(find "$SIZES" -mmin +$((BASELINE_HOURS * 60)) 2>/dev/null)" ]; then
    growers_json >/dev/null
  fi
  exit 0
fi

# alert: rescan only on a real drop, or when we have no growers yet
prev_growers='[]'; [ -f "$ALERT" ] && prev_growers=$(jq -c '.growers // []' "$ALERT" 2>/dev/null || echo '[]')
scanned=false
if (( max_drop_mb >= SCAN_MIN_DROP_GB * 1024 )) || [ "$prev_growers" = '[]' ]; then
  growers=$(growers_json); scanned=true
else
  growers=$prev_growers
fi
jq -n -c --argjson ts "$now" --argjson a "$alerts" --argjson g "$growers" --argjson s "$scanned" \
  '{ts:$ts,scanned:$s,alerts:$a,growers:$g}' > "$ALERT.tmp" && mv -f "$ALERT.tmp" "$ALERT"
jq . "$ALERT" > "$ALERT.tmp" && mv -f "$ALERT.tmp" "$ALERT"   # pretty-print

if (( had_unacked == 0 )) && [ -x "$NOTIFY_CMD" ]; then
  "$NOTIFY_CMD" error >/dev/null 2>&1 || true
fi
exit 1
