#!/usr/bin/env bash
# extract-sections.sh - part-scoped extract of a program-mode planning artifact.
# Program mode (see PLAN_cfn_megaplan_fast.md §2) writes ONE shared SPEC/ARCH/UX
# for a multi-part program instead of one per part. Per-part phases (test_plan,
# write_plan, Bar A) must read only their own slice, not the whole artifact, or
# every downstream phase re-reads the full program doc (the #1 cost driver).
# This script cuts that slice deterministically from `[part: <id>]` tags.
#
# Tag grammar:
#   [part: <id>(, <id>)*]   anywhere in a heading line (#..######) or a table row.
#   - ids match [A-Za-z0-9_-]+, case-sensitive.
#   - "shared" is a RESERVED id: it means "keep for every part" and is never
#     itself a queryable part id (it never appears in --list-parts output, and
#     a file that tags sections `shared` only, with no other id, has no known
#     part ids at all).
#   - a heading with no tag is treated as untagged == shared (kept for all).
#
# Heading scope:
#   A tagged heading's section runs until the next heading of equal or
#   HIGHER level (fewer or equal '#'). Child headings nested inside inherit
#   the ancestor decision: if any ancestor section is dropped, all of its
#   children are dropped too, regardless of the child's own tag.
#   Content before the first heading is always kept.
#
# Table rows:
#   Inside content that is being kept, a line starting with '|' that carries
#   a part tag is kept only when the tag matches; a '|' line with no tag
#   (header, separator, untagged data row) is always kept.
#
# Kept heading lines are emitted verbatim (the tag text stays in the output).
#
# Usage:
#   extract-sections.sh <artifact.md> <part-id>     write the part-id slice to stdout
#   extract-sections.sh <artifact.md> --list-parts   list distinct known part ids, sorted, one per line
#
# Exit codes:
#   0 = ok
#   1 = reserved, unused
#   2 = usage error / file not found / unknown part id (not in --list-parts set;
#       note "shared" alone never makes an id known)
#
# Deps: bash, awk, coreutils (grep, sed, tr, sort) only.
set -euo pipefail

usage() {
  echo 'usage: extract-sections.sh <artifact.md> <part-id>' >&2
  echo '       extract-sections.sh <artifact.md> --list-parts' >&2
  exit 2
}

FILE="${1:-}"
PART="${2:-}"

[ -n "$FILE" ] && [ -n "$PART" ] || usage
if [ ! -f "$FILE" ]; then
  echo "error: file not found: $FILE" >&2
  exit 2
fi

# ---- collect known part ids: every id used in a [part: ...] tag, excluding
#      the reserved "shared" id, deduped and sorted. ----
KNOWN_IDS="$(grep -oE '\[part:[^]]+\]' "$FILE" \
  | sed -E 's/^\[part:[[:space:]]*//; s/][[:space:]]*$//' \
  | tr ',' '\n' \
  | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' \
  | grep -E '^[A-Za-z0-9_-]+$' \
  | grep -v '^shared$' \
  | sort -u || true)"

if [ "$PART" = "--list-parts" ]; then
  [ -n "$KNOWN_IDS" ] && printf '%s\n' "$KNOWN_IDS"
  exit 0
fi

if ! [[ "$PART" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "error: invalid part id: $PART" >&2
  exit 2
fi

if ! printf '%s\n' "$KNOWN_IDS" | grep -qxF "$PART"; then
  echo "error: unknown part id: $PART (known: $(printf '%s' "$KNOWN_IDS" | tr '\n' ' '))" >&2
  exit 2
fi

awk -v PART="$PART" '
function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }

function extract_tag(line,    s) {
  if (match(line, /\[part:[^]]*\]/)) {
    s = substr(line, RSTART, RLENGTH)
    sub(/^\[part:[ \t]*/, "", s)
    sub(/\]$/, "", s)
    return s
  }
  return ""
}

function tag_matches(tagstr,    n, arr, i, id) {
  if (tagstr == "") return 1
  n = split(tagstr, arr, ",")
  for (i = 1; i <= n; i++) {
    id = trim(arr[i])
    if (id == "shared" || id == PART) return 1
  }
  return 0
}

BEGIN { depth = 0 }

{
  line = $0
  if (match(line, /^#+[ \t]/)) {
    level = RLENGTH - 1
    while (depth > 0 && level_stack[depth] >= level) depth--
    parent_eff = (depth == 0) ? 1 : eff_stack[depth]
    own = tag_matches(extract_tag(line))
    eff = (parent_eff && own) ? 1 : 0
    depth++
    level_stack[depth] = level
    eff_stack[depth] = eff
    if (eff) print line
    next
  }

  cur = (depth == 0) ? 1 : eff_stack[depth]
  if (!cur) next

  if (substr(line, 1, 1) == "|") {
    if (tag_matches(extract_tag(line))) print line
  } else {
    print line
  }
}
' "$FILE"
