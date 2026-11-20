#!/usr/bin/env bash
# Acknowledge this session's unwatched background task shells to the shell
# watchdog (touches <session>.<pid>.watched), so the Stop hook stops blocking.
# Usage: cfn-watch-bg.sh <pattern>   (pattern = substring of the shell's command)
# Session: $CLAUDE_CODE_SESSION_ID. Exit 0 = marked >=1; 1 = none matched; 2 = usage.
# Arm your CronCreate progress check yourself; this only writes the markers.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# cfn: sibling-dir lookup assumes .claude/{cfn-scripts,hooks}; symlinked copies resolve the same
. "$DIR/../hooks/cfn-shell-watch-common.sh"

PATTERN="${1:-}"
SESSION="${CLAUDE_CODE_SESSION_ID:-}"
[ -n "$PATTERN" ] || { echo "usage: cfn-watch-bg.sh <pattern>" >&2; exit 2; }
[ -n "$SESSION" ] || { echo "CLAUDE_CODE_SESSION_ID is not set; cannot find this session's ledger" >&2; exit 2; }

if MARKED="$(sw_mark_unwatched "$SESSION" "$PATTERN")"; then
  echo "marked=[$(printf '%s' "$MARKED" | tr '\n' ' ' | sed 's/ $//; s/ /,/g')] session=$SESSION"
else
  echo "missing=[$PATTERN] no live unwatched task shell matched in session $SESSION" >&2
  exit 1
fi
