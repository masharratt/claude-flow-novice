#!/usr/bin/env bash
# resolve.sh - resolve a markdown doc into publish metadata for cfn-share.
#
# Inputs:
#   $1  path to a .md file (optional). Omitted -> newest planning/PLAN_*.md.
# Outputs:
#   stdout: JSON { file, abs, slug, title, sidecar, url, stale, lines }
#   exit 0 = resolved, 1 = no usable target, 2 = usage/parse error
#
# `url` is "" when the doc has never been published; otherwise the artifact URL
# to update in place. `stale` is true when the file changed since that publish.
set -euo pipefail

die() { echo "cfn-share: $*" >&2; exit "${2:-2}"; }

TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  # newest plan first, then any planning artifact
  TARGET=$(ls -t planning/PLAN_*.md planning/MEGAPLAN*_*.md 2>/dev/null | head -1 || true)
  [[ -n "$TARGET" ]] || die "no target given and no planning/PLAN_*.md found" 1
fi

[[ -f "$TARGET" ]] || die "not a file: $TARGET" 1
[[ "$TARGET" == *.md ]] || die "not markdown: $TARGET (only .md publishes cleanly)" 1
[[ -s "$TARGET" ]] || die "empty file: $TARGET" 1

ABS=$(cd "$(dirname "$TARGET")" && pwd)/$(basename "$TARGET")
DIR=$(dirname "$ABS")
BASE=$(basename "$ABS" .md)
SLUG=$(printf '%s' "$BASE" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]_-' | cut -c1-60)
SIDECAR="$DIR/.share-$BASE.url"
LINES=$(wc -l < "$ABS" | tr -d ' ')

# Title: first level-1 heading, else the basename humanised.
TITLE=$(grep -m1 -E '^# +\S' "$ABS" 2>/dev/null | sed -E 's/^# +//; s/[[:space:]]+$//' || true)
if [[ -z "$TITLE" ]]; then
  TITLE=$(printf '%s' "$BASE" | tr '_-' '  ')
fi

URL=""
STALE="false"
if [[ -f "$SIDECAR" ]]; then
  URL=$(grep -m1 '^url=' "$SIDECAR" | cut -d= -f2- || true)
  PREV_SHA=$(grep -m1 '^sha256=' "$SIDECAR" | cut -d= -f2- || true)
  NOW_SHA=$(sha256sum "$ABS" | cut -d' ' -f1)
  [[ -n "$PREV_SHA" && "$PREV_SHA" != "$NOW_SHA" ]] && STALE="true"
fi

esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

cat <<JSON
{
  "file": "$(esc "$TARGET")",
  "abs": "$(esc "$ABS")",
  "slug": "$(esc "$SLUG")",
  "title": "$(esc "$TITLE")",
  "sidecar": "$(esc "$SIDECAR")",
  "url": "$(esc "$URL")",
  "stale": $STALE,
  "lines": $LINES
}
JSON
