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
  run() { env STATE="$ST" SCAN_ROOTS="$T/empty" NOW=1000000000 SCAN_SYNC=1 "$@" "$G" 2>&1; }
  mkdir -p "$T/empty"
  GB=1000000000
  # root_used logged + no warnings under thresholds
  out=$(run ROOT_USED_BYTES=$((100*GB)))
  miss=""; unex=""
  case "$out" in *root_used=100*) ;; *) miss="root_used=100" ;; esac
  case "$out" in *WARN*) unex="WARN" ;; esac
  report "root_used printed, quiet below thresholds" "$miss" "$unex"
  # absolute threshold
  out=$(run ROOT_USED_BYTES=$((201*GB)) STATE="$T/s2")
  case "$out" in *"WARN root_high"*) ok "warns when / used > 200 GB" ;; *) no "warns when / used > 200 GB missing=[WARN root_high] unexpected=[]";; esac
  out=$(run ROOT_USED_BYTES=$((200*GB)) STATE="$T/s2b")
  case "$out" in *"WARN root_high"*) no "no warn at exactly 200 GB missing=[] unexpected=[WARN root_high]";; *) ok "no warn at exactly 200 GB";; esac
  # growth: seed history 6 days ago at 100 GB, now 120 GB
  mkdir -p "$T/s3"; echo "$((1000000000 - 6*86400)) $((100*GB))" > "$T/s3/root-used.tsv"
  out=$(run ROOT_USED_BYTES=$((120*GB)) STATE="$T/s3")
  case "$out" in *"WARN root_growth"*) ok "warns when growth > 15 GB in 7 days" ;; *) no "warns on growth missing=[WARN root_growth] unexpected=[]";; esac
  # growth under threshold, and baseline older than 7 days ignored
  mkdir -p "$T/s4"; printf '%s\n%s\n' "$((1000000000 - 9*86400)) $((50*GB))" "$((1000000000 - 6*86400)) $((110*GB))" > "$T/s4/root-used.tsv"
  out=$(run ROOT_USED_BYTES=$((120*GB)) STATE="$T/s4")
  case "$out" in *"WARN root_growth"*) no "ignores >7d baseline missing=[] unexpected=[WARN root_growth]";; *) ok "ignores >7d baseline, 10 GB growth quiet";; esac
  # history file appended with this run
  grep -q "^1000000000 " "$T/s4/root-used.tsv" && ok "history appended" || no "history appended missing=[row 1000000000] unexpected=[]"
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
fi

echo "RESULT: pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
