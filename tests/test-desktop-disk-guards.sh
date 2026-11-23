#!/usr/bin/env bash
# tests/test-desktop-disk-guards.sh
# Tests for the four desktop disk growth guards (.claude/cfn-scripts/desktop-disk/):
#   1. tmp-age.conf            /tmp tmpfiles rule 30d -> 7d
#   2. codex-session-reaper.sh WSL ~/.codex/sessions retention, refuses any other path
#   3. disk-growth-guard.sh    root_used log + high/growth warnings
#   4. disk-growth-guard.sh    cargo-target finder (report only, never deletes, no /mnt crawl)
# Guards print missing=[...] unexpected=[...]. Never touches the real $HOME or /mnt/c.
set -u
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P) || exit 1
D="${DISK_GUARD_DIR:-$ROOT/.claude/cfn-scripts/desktop-disk}"
# shellcheck source=/dev/null
source "$ROOT/.claude/cfn-scripts/lib/safe-rm.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/saferm.XXXXXX") || exit 1
T=$(cd -P "$T" && pwd -P)
trap 'cfn_safe_rm_tmp "$T"' EXIT
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ok   $1"; }
no() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }
# check NAME EXPECTED_MISSING_LIST: pass when list empty; print missing=[..] unexpected=[..]
report() { local name=$1 missing=$2 unexpected=$3
  if [ -z "$missing" ] && [ -z "$unexpected" ]; then ok "$name"; else no "$name missing=[$missing] unexpected=[$unexpected]"; fi; }

echo "== 1. tmpfiles rule"
CONF="$D/tmp-age.conf"
if [ -f "$CONF" ]; then
  miss=""; unex=""
  grep -Eq '^D[[:space:]]+/tmp[[:space:]]+1777[[:space:]]+root[[:space:]]+root[[:space:]]+7d([[:space:]]|$)' "$CONF" || miss="D /tmp 7d"
  grep -Eq '^D[[:space:]]+/tmp[[:space:]].*30d' "$CONF" && unex="D /tmp 30d"
  grep -Eq '^d[[:space:]]+/tmp/\*-target[[:space:]]+0755[[:space:]]+root[[:space:]]+root[[:space:]]+([1-9]|10)d' "$CONF" || miss="$miss target<=10d"
  report "tmp-age.conf rules" "$miss" "$unex"
else no "tmp-age.conf missing=[$CONF] unexpected=[]"; fi

echo "== 2. codex session reaper"
R="$D/codex-session-reaper.sh"
if [ ! -x "$R" ]; then no "reaper missing=[$R] unexpected=[]"; else
  H="$T/home"; S="$H/.codex/sessions"
  mkdir -p "$S/2026/01/01" "$S/2026/11/07" "$S/2026/02/02" "$T/win/.codex/sessions/2026"
  echo old > "$S/2026/01/01/old.jsonl"; touch -d '5 days ago' "$S/2026/01/01/old.jsonl" "$S/2026/01/01"
  echo new > "$S/2026/11/07/new.jsonl"
  echo keep > "$S/2026/02/02/notes.txt"; touch -d '9 days ago' "$S/2026/02/02/notes.txt"
  echo winold > "$T/win/.codex/sessions/2026/w.jsonl"; touch -d '9 days ago' "$T/win/.codex/sessions/2026/w.jsonl"
  out=$(HOME="$H" "$R" 2>&1); rc=$?
  miss=""; unex=""
  [ $rc -eq 0 ] || miss="rc0(rc=$rc)"
  [ ! -e "$S/2026/01/01/old.jsonl" ] || miss="$miss old-deleted"
  [ ! -d "$S/2026/01/01" ] || miss="$miss empty-dir-removed"
  [ -e "$S/2026/11/07/new.jsonl" ] || unex="$unex new-deleted"
  [ -e "$S/2026/02/02/notes.txt" ] || unex="$unex non-jsonl-deleted"
  [ -d "$S" ] || unex="$unex root-removed"
  report "reaper deletes old jsonl and empty dirs only" "$miss" "$unex"
  # refusals: every one must exit 2 and leave files in place
  mkdir -p "$H/other" "$H/.codex/x"; echo o > "$H/other/a.jsonl"; touch -d '9 days ago' "$H/other/a.jsonl"
  echo o > "$H/.codex/x/a.jsonl"; touch -d '9 days ago' "$H/.codex/x/a.jsonl"
  refused() { # NAME DIRARG
    local o rc; o=$(HOME="$H" CODEX_SESSIONS_DIR="$2" "$R" 2>&1); rc=$?
    local m="" u=""; [ $rc -eq 2 ] || m="exit2(rc=$rc)"
    case "$o" in *REFUSED*) ;; *) m="$m REFUSED-msg" ;; esac
    report "refuses $1" "$m" "$u"; }
  refused "windows codex dir" "$T/win/.codex/sessions"
  refused "/mnt/c windows path" "/mnt/c/Users/someone/.codex/sessions"  # portability-ok: deliberately invalid path the guard must refuse
  refused "parent ~/.codex" "$H/.codex"
  refused "sibling ~/.codex/x" "$H/.codex/x"
  refused "elsewhere in home" "$H/other"
  refused "dotdot escape" "$S/../x"
  refused "empty dir arg" ""
  [ -e "$H/other/a.jsonl" ] && [ -e "$H/.codex/x/a.jsonl" ] && [ -e "$T/win/.codex/sessions/2026/w.jsonl" ] && ok "refused paths left untouched" || no "refused paths left untouched missing=[] unexpected=[file deleted]"
  # symlinked sessions dir pointing outside (e.g. into Windows profile) is refused
  H2="$T/home2"; mkdir -p "$H2/.codex"; ln -s "$T/win/.codex/sessions" "$H2/.codex/sessions"
  o=$(HOME="$H2" "$R" 2>&1); rc=$?
  if [ $rc -eq 2 ] && [ -e "$T/win/.codex/sessions/2026/w.jsonl" ]; then ok "refuses symlinked sessions dir"; else no "refuses symlinked sessions dir missing=[exit2(rc=$rc)] unexpected=[]"; fi
  # a symlinked file inside sessions must not be followed
  H3="$T/home3"; mkdir -p "$H3/.codex/sessions/a"; ln -s "$T/win/.codex/sessions/2026/w.jsonl" "$H3/.codex/sessions/a/link.jsonl"
  HOME="$H3" "$R" >/dev/null 2>&1
  [ -e "$T/win/.codex/sessions/2026/w.jsonl" ] && ok "does not follow file symlinks" || no "does not follow file symlinks missing=[] unexpected=[target deleted]"
  # DRY_RUN deletes nothing
  mkdir -p "$S/2026/03/03"; echo d > "$S/2026/03/03/d.jsonl"; touch -d '8 days ago' "$S/2026/03/03/d.jsonl"
  HOME="$H" DRY_RUN=1 "$R" >/dev/null 2>&1
  [ -e "$S/2026/03/03/d.jsonl" ] && ok "DRY_RUN keeps files" || no "DRY_RUN keeps files missing=[] unexpected=[deleted]"
fi

echo "== 3+4. disk-growth-guard"
G="$D/disk-growth-guard.sh"
if [ ! -x "$G" ]; then no "guard missing=[$G] unexpected=[]"; else
  ST="$T/state"; mkdir -p "$ST"
  GB=1073741824  # GiB, the unit df -h shows
  # ROOT_TOTAL_BYTES default 150 GiB so injected "used" values sit above the 60% growth floor; tests override it
  run() { env STATE="$ST" SCAN_ROOTS="$T/empty" NOW=1000000000 SCAN_SYNC=1 ROOT_TOTAL_BYTES=$((150*GB)) "$@" "$G" 2>&1; }
  mkdir -p "$T/empty"
  # root_used logged + no warnings under thresholds
  out=$(run ROOT_USED_BYTES=$((100*GB)))
  miss=""; unex=""
  case "$out" in *root_used=100*) ;; *) miss="root_used=100" ;; esac
  case "$out" in *WARN*) unex="WARN" ;; esac
  report "root_used printed, quiet below thresholds" "$miss" "$unex"
  # absolute threshold
  # Defaults raised 2026-11-18 (user: root_high was noise at 202 of 1007 GB): 350 GiB, growth 40 GiB / 7 days.
  out=$(run ROOT_USED_BYTES=$((351*GB)) STATE="$T/s2")
  case "$out" in *"WARN root_high"*) ok "warns when / used > 350 GB" ;; *) no "warns when / used > 350 GB missing=[WARN root_high] unexpected=[]";; esac
  out=$(run ROOT_USED_BYTES=$((350*GB)) STATE="$T/s2b")
  case "$out" in *"WARN root_high"*) no "no warn at exactly 350 GB missing=[] unexpected=[WARN root_high]";; *) ok "no warn at exactly 350 GB";; esac
  out=$(run ROOT_USED_BYTES=$((202*GB)) STATE="$T/s2d")
  case "$out" in *"WARN root_high"*) no "202 GB quiet under new default missing=[] unexpected=[WARN root_high]";; *) ok "202 GB (the noisy case) is quiet";; esac
  # Regression (mdtwii-master 2026-11-07): the guard used decimal GB, so 188 GiB on df -h read as
  # 202 "GB" and root_high fired every scan. Thresholds are in GiB, matching what the user sees.
  out=$(run ROOT_USED_BYTES=202000000000 STATE="$T/s2c")
  miss=""; unex=""
  case "$out" in *root_used=188*) ;; *) miss="root_used=188" ;; esac
  case "$out" in *"WARN root_high"*) unex="WARN root_high" ;; esac
  report "202 decimal GB (188 GiB) is under the 200 GiB line" "$miss" "$unex"
  # growth: seed history 6 days ago at 100 GB, now 120 GB
  mkdir -p "$T/s3"; echo "$((1000000000 - 6*86400)) $((100*GB))" > "$T/s3/root-used.tsv"
  out=$(run ROOT_USED_BYTES=$((145*GB)) STATE="$T/s3")
  case "$out" in *"WARN root_growth"*) ok "warns when growth > 40 GB in 7 days" ;; *) no "warns on growth missing=[WARN root_growth] unexpected=[]";; esac
  mkdir -p "$T/s3b"; echo "$((1000000000 - 6*86400)) $((100*GB))" > "$T/s3b/root-used.tsv"
  out=$(run ROOT_USED_BYTES=$((120*GB)) STATE="$T/s3b")
  case "$out" in *"WARN root_growth"*) no "20 GB growth quiet under 40 GB default missing=[] unexpected=[WARN root_growth]";; *) ok "20 GB growth is quiet under the 40 GB default";; esac
  # growth under threshold, and baseline older than 7 days ignored
  mkdir -p "$T/s4"; printf '%s\n%s\n' "$((1000000000 - 9*86400)) $((50*GB))" "$((1000000000 - 6*86400)) $((110*GB))" > "$T/s4/root-used.tsv"
  out=$(run ROOT_USED_BYTES=$((120*GB)) STATE="$T/s4")
  case "$out" in *"WARN root_growth"*) no "ignores >7d baseline missing=[] unexpected=[WARN root_growth]";; *) ok "ignores >7d baseline, 10 GB growth quiet";; esac
  # history file appended with this run
  grep -q "^1000000000 " "$T/s4/root-used.tsv" && ok "history appended" || no "history appended missing=[row 1000000000] unexpected=[]"
  # growth warning repeat rule: send when new, worse by GROWTH_STEP_GB (10), or once a day; else silent
  mkdir -p "$T/g1"; echo "$((1000000000 - 3*86400)) $((100*GB))" > "$T/g1/root-used.tsv"
  grew() { run STATE="$T/g1" GROWTH_WARN_GB=15 "$@" | grep -c "WARN root_growth"; }
  n=$(grew ROOT_USED_BYTES=$((120*GB)))
  [ "$n" = 1 ] && ok "growth warning sent when new" || no "growth warning sent when new missing=[1 line] unexpected=[$n lines]"
  n=$(grew ROOT_USED_BYTES=$((120*GB)) NOW=1000000060)
  [ "$n" = 0 ] && ok "same growth next tick is silent (repeat suppression)" || no "repeat suppression missing=[0 lines] unexpected=[$n lines]"
  n=$(grew ROOT_USED_BYTES=$((125*GB)) NOW=1000000120)
  [ "$n" = 0 ] && ok "worse by 5 GB (under the 10 GB step) is silent" || no "worse by 5 GB silent missing=[0 lines] unexpected=[$n lines]"
  n=$(grew ROOT_USED_BYTES=$((131*GB)) NOW=1000000180)
  [ "$n" = 1 ] && ok "worse by a 10 GB step sends again" || no "worse by a step missing=[1 line] unexpected=[$n lines]"
  n=$(grew ROOT_USED_BYTES=$((131*GB)) NOW=1000000240)
  [ "$n" = 0 ] && ok "after a step send, same value is silent" || no "silent after step missing=[0 lines] unexpected=[$n lines]"
  n=$(grew ROOT_USED_BYTES=$((131*GB)) NOW=$((1000000180 + 86400 - 1)))
  [ "$n" = 0 ] && ok "just under a day later is silent" || no "under a day silent missing=[0 lines] unexpected=[$n lines]"
  n=$(grew ROOT_USED_BYTES=$((131*GB)) NOW=$((1000000180 + 86400)))
  [ "$n" = 1 ] && ok "same value repeats once a day" || no "daily repeat missing=[1 line] unexpected=[$n lines]"
  n=$(grew GROWTH_STEP_GB=3 ROOT_USED_BYTES=$((135*GB)) NOW=$((1000000180 + 86400 + 60)))
  [ "$n" = 1 ] && ok "GROWTH_STEP_GB env tunes the step" || no "step env missing=[1 line] unexpected=[$n lines]"
  # growth ends, then returns: counts as new again
  grew ROOT_USED_BYTES=$((101*GB)) NOW=$((1000000180 + 86400 + 120)) >/dev/null
  n=$(grew ROOT_USED_BYTES=$((120*GB)) NOW=$((1000000180 + 86400 + 180)))
  [ "$n" = 1 ] && ok "growth that cleared and returned is new again" || no "returned growth missing=[1 line] unexpected=[$n lines]"
  # under 60% full: growth warning skipped; root_high unaffected
  mkdir -p "$T/g2"; echo "$((1000000000 - 6*86400)) $((100*GB))" > "$T/g2/root-used.tsv"
  out=$(run STATE="$T/g2" GROWTH_WARN_GB=15 ROOT_USED_BYTES=$((120*GB)) ROOT_TOTAL_BYTES=$((1007*GB)))
  case "$out" in *"WARN root_growth"*) no "growth skipped under 60% full missing=[] unexpected=[WARN root_growth]";; *) ok "growth warning skipped while / is under 60% full";; esac
  out=$(run STATE="$T/g2" GROWTH_WARN_GB=15 ROOT_USED_BYTES=$((120*GB)) ROOT_TOTAL_BYTES=$((1007*GB)) GROWTH_MIN_PCT=10)
  case "$out" in *"WARN root_growth"*) ok "GROWTH_MIN_PCT env lowers the floor" ;; *) no "GROWTH_MIN_PCT missing=[WARN root_growth] unexpected=[]";; esac
  out=$(run STATE="$T/g2b" ROOT_USED_BYTES=$((351*GB)) ROOT_TOTAL_BYTES=$((1007*GB)))
  case "$out" in *"WARN root_high"*) ok "root_high still fires under 60% full" ;; *) no "root_high under 60% missing=[WARN root_high] unexpected=[]";; esac
  # Regression (mdtwii-master 2026-11-23, noise round 3): "/ is 412 GB used" mailed 4x identical, plus
  # one mail per earlier step. root_high now prints once per new ROOT_STEP_GB (10) level above
  # ROOT_WARN_GB; the same level never repeats; falling under a level re-arms it.
  hi() { run STATE="$T/h1" "$@" | grep -c "WARN root_high"; }
  n=$(hi ROOT_USED_BYTES=$((412*GB)));                [ "$n" = 1 ] && ok "root_high: first crossing sends" || no "root_high first missing=[1 line] unexpected=[$n lines]"
  n=$(hi ROOT_USED_BYTES=$((412*GB)) NOW=1000003600); [ "$n" = 0 ] && ok "root_high: same 412 GB an hour later is silent" || no "root_high same level missing=[0 lines] unexpected=[$n lines]"
  n=$(hi ROOT_USED_BYTES=$((419*GB)) NOW=1000007200); [ "$n" = 0 ] && ok "root_high: 419 GB (same 410 level) is silent" || no "root_high same step missing=[0 lines] unexpected=[$n lines]"
  n=$(hi ROOT_USED_BYTES=$((420*GB)) NOW=1000010800); [ "$n" = 1 ] && ok "root_high: next 10 GB level sends" || no "root_high next level missing=[1 line] unexpected=[$n lines]"
  n=$(hi ROOT_USED_BYTES=$((420*GB)) NOW=$((1000010800 + 3*86400))); [ "$n" = 0 ] && ok "root_high: same level days later is silent" || no "root_high never repeats missing=[0 lines] unexpected=[$n lines]"
  n=$(hi ROOT_USED_BYTES=$((405*GB)) NOW=1000300000); [ "$n" = 0 ] && ok "root_high: dropping a level is silent" || no "root_high drop missing=[0 lines] unexpected=[$n lines]"
  n=$(hi ROOT_USED_BYTES=$((411*GB)) NOW=1000303600); [ "$n" = 1 ] && ok "root_high: re-crossing a level after a drop sends" || no "root_high re-arm missing=[1 line] unexpected=[$n lines]"
  hi ROOT_USED_BYTES=$((300*GB)) NOW=1000400000 >/dev/null
  n=$(hi ROOT_USED_BYTES=$((351*GB)) NOW=1000403600); [ "$n" = 1 ] && ok "root_high: cleared then over the line again sends" || no "root_high cleared missing=[1 line] unexpected=[$n lines]"
  n=$(run STATE="$T/h2" ROOT_STEP_GB=50 ROOT_USED_BYTES=$((412*GB)) >/dev/null; run STATE="$T/h2" ROOT_STEP_GB=50 ROOT_USED_BYTES=$((440*GB)) NOW=1000003600 | grep -c "WARN root_high")
  [ "$n" = 0 ] && ok "root_high: ROOT_STEP_GB env tunes the step" || no "root_high step env missing=[0 lines] unexpected=[$n lines]"
  # cargo finder
  CT="$T/scan"; mkdir -p "$CT/big1/debug/.fingerprint" "$CT/big2" "$CT/small" "$CT/plain" "$CT/churn/tgt"
  head -c 5000 /dev/zero > "$CT/big1/debug/.fingerprint/x"
  head -c 5000 /dev/zero > "$CT/big2/f"; echo "Signature: 8a477f597d28d172789f06886806bc55" > "$CT/big2/CACHEDIR.TAG"
  echo "Signature: 8a477f597d28d172789f06886806bc55" > "$CT/small/CACHEDIR.TAG"; echo x > "$CT/small/f"
  head -c 5000 /dev/zero > "$CT/plain/f"
  head -c 5000 /dev/zero > "$CT/churn/tgt/f"; echo "Signature: 8a477f597d28d172789f06886806bc55" > "$CT/churn/tgt/CACHEDIR.TAG"
  out=$(run SCAN_ROOTS="$CT" ROOT_USED_BYTES=$((1*GB)) CARGO_MIN_BYTES=3000 CHURN_EXCLUDE="$CT/churn" STATE="$T/s5")
  miss=""; unex=""
  case "$out" in *"CARGO $CT/big1 "*) ;; *) miss="big1(.fingerprint)" ;; esac
  case "$out" in *"CARGO $CT/big2 "*) ;; *) miss="$miss big2(CACHEDIR.TAG)" ;; esac
  case "$out" in *"CARGO $CT/small "*) unex="small" ;; esac
  case "$out" in *"CARGO $CT/plain "*) unex="$unex plain" ;; esac
  case "$out" in *"CARGO $CT/churn"*) unex="$unex churn-excluded" ;; esac
  report "cargo finder flags big targets only" "$miss" "$unex"
  [ -e "$CT/big1/debug/.fingerprint/x" ] && [ -e "$CT/big2/f" ] && ok "cargo finder never deletes" || no "cargo finder never deletes missing=[] unexpected=[deleted]"
  # no /mnt crawl
  out=$(run SCAN_ROOTS="/mnt/c" ROOT_USED_BYTES=$((1*GB)) STATE="$T/s6")
  case "$out" in *"REFUSED"*) ok "refuses to scan /mnt/c" ;; *) no "refuses to scan /mnt/c missing=[REFUSED] unexpected=[]";; esac
  # scan throttle: second run inside SCAN_EVERY_S reuses the cache (no CARGO re-find but still reports)
  out2=$(run SCAN_ROOTS="$CT" ROOT_USED_BYTES=$((1*GB)) CARGO_MIN_BYTES=3000 CHURN_EXCLUDE="$CT/churn" STATE="$T/s5")
  case "$out2" in *"CARGO $CT/big1 "*) ok "throttled scan still reports cached result" ;; *) no "throttled scan reports cache missing=[CARGO big1] unexpected=[]";; esac
  # Regression (mdtwii-master 2026-11-07): a cached CARGO line kept naming a dir deleted since the
  # scan. Cached paths that no longer exist must not be reported.
  cfn_safe_rm_tmp "$CT/big1"
  out3=$(run SCAN_ROOTS="$CT" ROOT_USED_BYTES=$((1*GB)) CARGO_MIN_BYTES=3000 CHURN_EXCLUDE="$CT/churn" STATE="$T/s5")
  miss=""; unex=""
  case "$out3" in *"CARGO $CT/big1 "*) unex="big1(deleted)" ;; esac
  case "$out3" in *"CARGO $CT/big2 "*) ;; *) miss="big2" ;; esac
  report "cached report drops dirs deleted since the scan" "$miss" "$unex"
fi

echo "== 5. desktop-health warn() sends each alert once"
# Root cause (2026-11-17): warn() looped over two recipients (michael/me and the fleet master), so every
# alert arrived twice in the same second, each with its own thread. It now sends one mail to WARN_TO.
HS="${HEALTH_SH:-$HOME/.local/bin/desktop-health.sh}"
if [ ! -f "$HS" ]; then echo "  skip desktop-health.sh not installed ($HS)"; else
  fn=$(awk '/^warn\(\) \{/{p=1} p{print} p&&/^}/{exit}' "$HS")
  if [ -z "$fn" ]; then no "warn() missing=[function in $HS] unexpected=[]"; else
    W="$T/warn"; mkdir -p "$W"
    printf '#!/usr/bin/env bash\necho "$1 $2" >> "%s/sent.log"\n' "$W" > "$W/fake-mailbox.sh"; chmod +x "$W/fake-mailbox.sh"
    # shellcheck disable=SC2034  # variables are read by the extracted warn()
    (
      STATE="$W"; LOG="$W/health.log"; WARN_EVERY_S=3600; DRY_RUN=0; MAILBOX="$W/fake-mailbox.sh"; warns=()
      ts() { date '+%F %T'; }
      eval "$fn"
      warn rootgrowth "/ grew 20 GB in 6 days"
    )
    n=$(wc -l < "$W/sent.log" 2>/dev/null || echo 0); n=${n// /}
    [ "$n" = 1 ] && ok "one mail per alert" || no "one mail per alert missing=[1 send] unexpected=[$n sends: $(tr '\n' ';' < "$W/sent.log" 2>/dev/null)]"
  fi
fi

echo "RESULT: pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
