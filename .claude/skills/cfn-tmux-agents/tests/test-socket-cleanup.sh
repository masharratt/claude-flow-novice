#!/usr/bin/env bash
# cfn-tmux-agents: test-run socket hygiene (2026-11-20, reported by mdtwii).
# BUG: the suite left dead tagents-test-*, tagents-cargo-*, tagents-spawn-* socket
# files in /tmp/tmux-$UID (17+ seen). tmux 3.4 leaves the socket file behind
# after kill-server and after the last session exits, so "kill-server" in a trap
# is not enough; every file's teardown must also remove the socket files.
# This wrapper runs each test file against the REAL socket dir and fails when a
# run leaves a new tagents-* or tmux-agents-* socket behind. A PATH shim named
# claude/codex also fails the run if a test launches a real engine (a real
# claude can draw the "trust this folder" dialog).
# Read-only on the socket dir: it never deletes anything, so live lanes are safe.
# Run: $HOME/.claude/skills/cfn-tmux-agents/tests/test-socket-cleanup.sh [file...]
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$SKILL_DIR/../../cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
HERE="$SKILL_DIR/tests"
SD="${TMUX_TMPDIR:-/tmp}/tmux-$(id -u)"
FILES=("$@")
[ "${#FILES[@]}" -gt 0 ] || FILES=(test-lane-sockets.sh test-cargo-target.sh test-spawn-path.sh test-agents.sh)

TD=$(mktemp -d) || exit 1
trap 'cfn_safe_rm_tmp "$TD"' EXIT
mkdir -p "$TD/shim"
ENGLOG="$TD/engine-launches.log"; : > "$ENGLOG"
for e in claude codex; do
  printf '#!/bin/sh\necho "%s $*" >> "%s"\nexit 1\n' "$e" "$ENGLOG" > "$TD/shim/$e"
  chmod +x "$TD/shim/$e"
done

PASS=0 FAIL=0 TOTAL=0
ok()  { TOTAL=$((TOTAL+1)); PASS=$((PASS+1)); echo "  PASS: $1"; }
bad() { TOTAL=$((TOTAL+1)); FAIL=$((FAIL+1)); echo "  FAIL: $1"; }

# test sockets only: the per-run names the suite uses plus per-lane names
snap() {
  local s
  for s in "$SD"/tagents-* "$SD"/tmux-agents-*; do
    [ -S "$s" ] && basename "$s"
  done | sort
  return 0
}

echo "== cfn-tmux-agents socket-cleanup check (socket dir: $SD) =="
echo "population: ${#FILES[@]} test file(s): ${FILES[*]}"
[ -n "${FILES[*]}" ] || { echo "no test files"; exit 2; }

for f in "${FILES[@]}"; do
  [ -f "$HERE/$f" ] || { bad "$f: not found in $HERE"; continue; }
  before=$(snap)
  : > "$ENGLOG"
  PATH="$TD/shim:$PATH" bash "$HERE/$f" > "$TD/run-$f.log" 2>&1
  rc=$?
  after=$(snap)
  # sockets present after but not before = this run's leftovers
  leaked=$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after") | grep -v '^$' || true)
  if [ -z "$leaked" ]; then ok "$f: left no socket files (run rc=$rc)"
  else bad "$f: left socket files: missing=[] unexpected=[$(echo $leaked | tr ' ' ',')]"; fi
  if [ -s "$ENGLOG" ]; then bad "$f: launched a real engine binary: $(head -c 200 "$ENGLOG" | tr '\n' ';')"
  else ok "$f: launched no real claude/codex"; fi
done

echo "== results: $PASS/$TOTAL passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
