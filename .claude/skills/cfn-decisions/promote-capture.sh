#!/usr/bin/env bash
# promote-capture.sh - move captured decisions from staging into the ledger.
#
# Reads $CFN_DECISION_CAPTURE_FILE (default ~/.claude/cfn-data/decision-capture.jsonl),
# promotes each line through record.sh with an auto-generated id, and rewrites
# staging without the promoted lines. Lines whose record.sh call failed
# (validation/filesystem, rc 1-5) stay in staging for retry.
#
# rc 0/7/8 count as promoted: 7/8 mean the JSON ledger was written but the
# SQLite sync failed (D-7 PERSIST). Staging only tracks the JSON ledger.
#
# Usage:
#   promote-capture.sh --slug <slug> [--dry-run] [--file <staging-file>] [--root <dir>]
#
# Exit: 0 = nothing to do or all promoted; 1 = usage error; 2 = some lines
# failed promotion (they remain in staging).

set -uo pipefail

SLUG=""
DRY_RUN=0
ROOT_ARGS=()
STAGING="${CFN_DECISION_CAPTURE_FILE:-$HOME/.claude/cfn-data/decision-capture.jsonl}"

while [ $# -gt 0 ]; do
  case "$1" in
    --slug) SLUG="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --file) STAGING="${2:-}"; shift 2 ;;
    --root) ROOT_ARGS=(--root "${2:-}"); shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 1 ;;
  esac
done

[ -n "$SLUG" ] || { echo "--slug required" >&2; exit 1; }
[ -f "$STAGING" ] || { echo "no staging file at $STAGING; nothing to promote" >&2; exit 0; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECORD="$SCRIPT_DIR/record.sh"

tmp="$(mktemp)"
promoted=0
failed=0
n=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  n=$((n + 1))
  q="$(printf '%s' "$line" | jq -r '.question // empty' 2>/dev/null)"
  a="$(printf '%s' "$line" | jq -r '.answer // empty' 2>/dev/null)"
  ts="$(printf '%s' "$line" | jq -r '.ts // empty' 2>/dev/null)"
  notes="$(printf '%s' "$line" | jq -r '.notes // empty' 2>/dev/null)"
  if [ -z "$q" ] || [ -z "$a" ]; then
    echo "WARN: line $n has no question/answer; keeping in staging" >&2
    failed=$((failed + 1))
    printf '%s\n' "$line" >> "$tmp"
    continue
  fi
  dec_id="cap-$(printf '%s' "$ts" | tr -d ':-TZ' )-$(printf '%03d' "$n")"
  title="$q"
  [ ${#title} -gt 120 ] && title="${title:0:117}..."
  rationale="$notes"
  [ -n "$rationale" ] && rationale="[captured] $rationale" || rationale="[captured via decision-capture hook]"

  if [ "$DRY_RUN" = 1 ]; then
    echo "would promote: $dec_id | $title | chosen: $a"
    promoted=$((promoted + 1))
    continue
  fi

  if bash "$RECORD" \
      --slug "$SLUG" \
      --id "$dec_id" \
      --title "$title" \
      --chosen "$a" \
      --actor human \
      --rationale "$rationale" \
      --status accepted \
      --timestamp "$ts" \
      "${ROOT_ARGS[@]:+${ROOT_ARGS[@]}}" >/dev/null 2>&1; then
    rc=0
  else
    rc=$?
  fi
  case "$rc" in
    0|7|8)
      promoted=$((promoted + 1))
      ;;
    *)
      echo "WARN: line $n promotion failed (rc=$rc); keeping in staging" >&2
      failed=$((failed + 1))
      printf '%s\n' "$line" >> "$tmp"
      ;;
  esac
done < "$STAGING"

if [ "$DRY_RUN" = 0 ]; then
  mv "$tmp" "$STAGING"
else
  rm -f "$tmp"
fi

echo "promoted=$promoted failed=$failed staging=$(wc -l < "$STAGING" 2>/dev/null || echo 0)"
[ "$failed" -eq 0 ] && exit 0 || exit 2
