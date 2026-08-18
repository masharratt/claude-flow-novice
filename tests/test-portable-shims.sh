#!/usr/bin/env bash
# Unit tests for .claude/helpers/cfn-portable.sh.
#
# The point of these tests is that they run on Linux. The shims exist to make
# CFN work on macOS, so without CFN_PORTABLE_FORCE_SHIMS every assertion below
# would be skipped on the only machine that runs CI, and the translation logic
# would ship unverified. Forcing the shims on and stubbing out `command`,
# `sysctl` and `vm_stat` lets Linux check what the shim WOULD invoke on a Mac.
#
# What is verified here:
#   * on a GNU host the library defines nothing (the safety property that lets
#     169 scripts source it without a Mac to test on)
#   * GNU-to-BSD format and flag translation, exhaustively
#   * the argument rewriting each shim performs, by capturing the delegated call
#
# What is NOT verified here: that BSD stat/date/sed accept the translated
# output. That needs a Mac. The macos-latest CI job runs this same file there.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
LIB=".claude/helpers/cfn-portable.sh"

PASS=0; FAIL=0
ok()   { PASS=$((PASS + 1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "FAIL: $1"; echo "        want: $2"; echo "        got:  $3"; }
eq()   { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2" "$3"; }

# --- safety property: no-op on a GNU host ----------------------------------
if command stat -c %s . >/dev/null 2>&1; then
  DEFINED=$(bash -c ". $LIB; type -t stat date sed timeout nproc free readlink" 2>/dev/null | grep -c function)
  eq "library defines no shims on a GNU host" "0" "$DEFINED"
else
  echo "SKIP: not a GNU host, no-op property is not applicable"
fi

# --- pure translation helpers ----------------------------------------------
# Run in a subshell with the shims FORCED on. This must not be sourced into the
# test's own shell: the live section further down has to see whatever the host
# really provides, and a forced shim leaking into it would make Linux test the
# BSD path against GNU binaries and fail for the wrong reason.
pure() {
  bash -c 'CFN_PORTABLE_FORCE_SHIMS=1 . '"$LIB"'; "$@"' _ "$@" 2>/dev/null
}

eq "stat %Y (mtime) -> %m"        "%m"      "$(pure _cfn_stat_fmt '%Y')"
eq "stat %s (size) -> %z"         "%z"      "$(pure _cfn_stat_fmt '%s')"
eq "stat %a (mode) -> %Lp"        "%Lp"     "$(pure _cfn_stat_fmt '%a')"
eq "stat %U (owner) -> %Su"       "%Su"     "$(pure _cfn_stat_fmt '%U')"
eq "stat multiple specifiers"     "%m %z"   "$(pure _cfn_stat_fmt '%Y %s')"
eq "stat literal text preserved"  "size=%z" "$(pure _cfn_stat_fmt 'size=%s')"
eq "stat %% stays literal"        "%%"      "$(pure _cfn_stat_fmt '%%')"
eq "stat unknown specifier passes through" "%Q" "$(pure _cfn_stat_fmt '%Q')"

eq "date '7 days ago'"     "-v-7d"  "$(pure _cfn_date_rel_to_v '7 days ago')"
eq "date '5 minutes ago'"  "-v-5M"  "$(pure _cfn_date_rel_to_v '5 minutes ago')"
eq "date '30 days ago'"    "-v-30d" "$(pure _cfn_date_rel_to_v '30 days ago')"
eq "date '1 hour ago'"     "-v-1H"  "$(pure _cfn_date_rel_to_v '1 hour ago')"
eq "date '2 weeks ago'"    "-v-2w"  "$(pure _cfn_date_rel_to_v '2 weeks ago')"
pure _cfn_date_rel_to_v 'next tuesday' >/dev/null 2>&1 \
  && bad "date rejects untranslatable phrase" "nonzero exit" "zero exit" \
  || ok  "date rejects untranslatable phrase"
pure _cfn_date_rel_to_v 'many days ago' >/dev/null 2>&1 \
  && bad "date rejects non-numeric count" "nonzero exit" "zero exit" \
  || ok  "date rejects non-numeric count"

eq "duration bare seconds" "5"     "$(pure _cfn_dur_to_secs '5')"
eq "duration 30s"          "30"    "$(pure _cfn_dur_to_secs '30s')"
eq "duration 2m"           "120"   "$(pure _cfn_dur_to_secs '2m')"
eq "duration 1h"           "3600"  "$(pure _cfn_dur_to_secs '1h')"
eq "duration 1d"           "86400" "$(pure _cfn_dur_to_secs '1d')"
eq "duration truncates fraction" "1" "$(pure _cfn_dur_to_secs '1.5s')"
pure _cfn_dur_to_secs 'abc' >/dev/null 2>&1 \
  && bad "duration rejects garbage" "nonzero exit" "zero exit" \
  || ok  "duration rejects garbage"

# --- delegated invocations --------------------------------------------------
# Each runs in a subshell so the `command` stub cannot leak into later tests.
delegated() {
  local shim="$1"; shift
  bash -c '
    CFN_PORTABLE_FORCE_SHIMS=1 . '"$LIB"'
    command() { printf "%s\n" "$*"; }
    '"$shim"' "$@"
  ' _ "$@" 2>/dev/null
}

eq "stat -c%s joined form"     "stat -f %z afile"      "$(delegated stat -c%s afile)"
eq "stat -c %Y split form"     "stat -f %m afile"      "$(delegated stat -c %Y afile)"
eq "stat --format= form"       "stat -f %Lp afile"     "$(delegated stat --format=%a afile)"
eq "stat with no format"       "stat afile"            "$(delegated stat afile)"
eq "sed -i gains BSD suffix"   "sed -i  s/a/b/ afile"  "$(delegated sed -i s/a/b/ afile)"
eq "sed without -i untouched"  "sed s/a/b/ afile"      "$(delegated sed s/a/b/ afile)"
eq "date -d @epoch -> -r"      "date -r 123 +%s"       "$(delegated date -d @123 +%s)"
eq "date -d relative -> -v"    "date -v-7d +%F"        "$(delegated date -d '7 days ago' +%F)"
eq "date --date= form"         "date -r 123 +%s"       "$(delegated date --date=@123 +%s)"
eq "date without -d untouched" "date +%s"              "$(delegated date +%s)"

# --- free emits the procps -m layout ---------------------------------------
# Consumers parse this with `awk 'NR==2{print $7}'` and `grep '^Mem:'`, so the
# column positions are the contract, not an implementation detail.
FREE_OUT=$(bash -c '
  CFN_PORTABLE_FORCE_SHIMS=1 . '"$LIB"'
  sysctl() { case "$*" in *hw.pagesize*) echo 4096 ;; *hw.memsize*) echo 8589934592 ;;
                          *vm.swapusage*) echo "total = 2048.00M  used = 512.00M  free = 1536.00M" ;; esac; }
  vm_stat() { printf "Pages free: 100000.\nPages active: 200000.\nPages inactive: 50000.\nPages speculative: 10000.\nPages wired down: 150000.\nPages occupied by compressor: 20000.\n"; }
  free -m
' 2>/dev/null)

eq "free header names available column" "available" "$(echo "$FREE_OUT" | awk 'NR==1{print $6}')"
eq "free Mem: line is row 2"            "Mem:"      "$(echo "$FREE_OUT" | awk 'NR==2{print $1}')"
eq "free total MB (8 GiB)"              "8192"      "$(echo "$FREE_OUT" | awk 'NR==2{print $2}')"
eq "free used MB (active+wired+comp)"   "1445"      "$(echo "$FREE_OUT" | awk 'NR==2{print $3}')"
eq "free free MB"                       "390"       "$(echo "$FREE_OUT" | awk 'NR==2{print $4}')"
eq "free available MB (free+cache)"     "624"       "$(echo "$FREE_OUT" | awk 'NR==2{print $7}')"
eq "free Swap: line present"            "Swap:"     "$(echo "$FREE_OUT" | awk '/^Swap:/{print $1}')"
eq "free swap used MB"                  "512"       "$(echo "$FREE_OUT" | awk '/^Swap:/{print $3}')"

# --- nproc -----------------------------------------------------------------
NPROC_OUT=$(bash -c '
  CFN_PORTABLE_FORCE_SHIMS=1 . '"$LIB"'
  sysctl() { echo 12; }
  nproc
' 2>/dev/null)
eq "nproc reads hw.ncpu" "12" "$NPROC_OUT"

# --- timeout actually enforces a limit --------------------------------------
# The perl fallback is the branch a Mac without coreutils takes, and it is the
# one that can silently do nothing. Run it for real rather than inspecting it.
if command -v perl >/dev/null 2>&1; then
  START=$(date +%s)
  bash -c 'CFN_PORTABLE_FORCE_SHIMS=1 . '"$LIB"'; timeout 1 sleep 20' >/dev/null 2>&1
  RC=$?
  ELAPSED=$(( $(date +%s) - START ))
  [ "$RC" -ne 0 ] && ok "timeout fallback reports failure on expiry (rc=$RC)" \
                  || bad "timeout fallback reports failure on expiry" "nonzero" "$RC"
  [ "$ELAPSED" -lt 10 ] && ok "timeout fallback kills the child (${ELAPSED}s < 20s)" \
                        || bad "timeout fallback kills the child" "<10s" "${ELAPSED}s"
  eq "timeout fallback passes a completing command through" "done" \
     "$(bash -c 'CFN_PORTABLE_FORCE_SHIMS=1 . '"$LIB"'; timeout 10 echo done' 2>/dev/null)"
else
  echo "SKIP: perl absent, timeout fallback not exercised"
fi

# --- live behavior against the real tools -----------------------------------
# The assertions above prove the shim builds the right command line. These prove
# the resulting command line is actually accepted. On Linux they exercise the
# GNU binaries (so a broken shim guard that fires on Linux is caught); on macOS
# the shims are live and this is the only section that touches real BSD tools.
# Same file, both platforms, which is the point.
# shellcheck source=/dev/null
. "$LIB"   # unforced: shims appear only if the host needs them

TMPD=$(mktemp -d)
trap 'rm -rf "$TMPD"' EXIT

printf '0123456789' > "$TMPD/ten"
eq "live: stat -c %s returns byte count" "10" "$(stat -c %s "$TMPD/ten")"

chmod 644 "$TMPD/ten"
eq "live: stat -c %a returns octal mode" "644" "$(stat -c %a "$TMPD/ten")"

MTIME=$(stat -c %Y "$TMPD/ten")
case "$MTIME" in ''|*[!0-9]*) bad "live: stat -c %Y returns an epoch" "digits" "$MTIME" ;;
                 *) ok "live: stat -c %Y returns an epoch" ;; esac

eq "live: date -d @0 is the epoch year" "1970" "$(TZ=UTC date -d @0 +%Y)"
eq "live: date -d @86400 is Jan 2"      "01-02" "$(TZ=UTC date -d @86400 +%m-%d)"

TODAY=$(date +%s)
WEEK_AGO=$(date -d '7 days ago' +%s)
DELTA=$((TODAY - WEEK_AGO))
# allow a wide band: -v-7d lands on the same clock time 7 days back, and a DST
# boundary shifts that by an hour in either direction.
if [ "$DELTA" -gt 601200 ] && [ "$DELTA" -lt 608400 ]; then
  ok "live: date -d '7 days ago' is ~7 days back (${DELTA}s)"
else
  bad "live: date -d '7 days ago' is ~7 days back" "601200..608400 s" "${DELTA}s"
fi

printf 'alpha\n' > "$TMPD/edit"
sed -i 's/alpha/beta/' "$TMPD/edit"
eq "live: sed -i edits in place" "beta" "$(cat "$TMPD/edit")"
STRAY=$(find "$TMPD" -name 'edit*' ! -name edit | wc -l | tr -d ' ')
eq "live: sed -i leaves no backup file" "0" "$STRAY"

CPUS=$(nproc)
{ [ -n "$CPUS" ] && [ "$CPUS" -ge 1 ] 2>/dev/null; } \
  && ok "live: nproc returns a positive count ($CPUS)" \
  || bad "live: nproc returns a positive count" ">=1" "$CPUS"

MEM_TOTAL=$(free -m | awk 'NR==2{print $2}')
{ [ -n "$MEM_TOTAL" ] && [ "$MEM_TOTAL" -gt 0 ] 2>/dev/null; } \
  && ok "live: free -m reports total memory (${MEM_TOTAL}MB)" \
  || bad "live: free -m reports total memory" ">0" "$MEM_TOTAL"

MEM_AVAIL=$(free -m | awk 'NR==2{print $7}')
{ [ -n "$MEM_AVAIL" ] && [ "$MEM_AVAIL" -ge 0 ] 2>/dev/null; } \
  && ok "live: free -m column 7 is available memory (${MEM_AVAIL}MB)" \
  || bad "live: free -m column 7 is available memory" ">=0" "$MEM_AVAIL"

eq "live: readlink -f resolves a real path" "$(cd "$TMPD" && pwd -P)/ten" "$(readlink -f "$TMPD/ten")"

eq "live: timeout runs a fast command" "ok" "$(timeout 10 echo ok)"

echo "---"
echo "portable shims: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
