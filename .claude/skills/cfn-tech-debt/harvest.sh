#!/usr/bin/env bash
# cfn-tech-debt harvest: collect `cfn:` shortcut markers into a ledger.
# Valid marker:   cfn: <ceiling>[,|;] <upgrade trigger>
#                 (comma OR semicolon separates ceiling from trigger; both are
#                  accepted, semicolon is the dominant style in practice)
# no-trigger rot: cfn: <ceiling>            (no separator -> upgrade: NONE)
# A marker may WRAP across following comment lines; continuations are joined
# before the split, so a trigger written on line 2+ is not lost.
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$PROJECT_ROOT"

PERSIST=0
[[ "${1:-}" == "--persist" ]] && PERSIST=1

# Longest ceiling / upgrade-trigger kept in the ledger. Anything past this is a
# runaway capture (a marker quoted inside a paragraph of prose), not a real
# field; truncating keeps one bad row from swallowing the ledger. It is the
# backstop for the multi-line join below, which is otherwise unbounded prose.
# cfn: flat char cap, make it per-field if real markers ever exceed it.
MAX_FIELD=160

# Most continuation lines a wrapped marker may claim. A `cfn:` note longer than
# this is prose, not a field.
# cfn: fixed 8-line join window, raise it if a real marker ever wraps further.
MAX_CONT=8

# A marker is `cfn:` ANYWHERE inside a comment, not just adjacent to the comment
# token: `// same seam. cfn: log + ignore at MVP` and the JSDoc continuation form
# ` * cfn: ...` are both real markers. So: a comment opener (#, //, --, /*) or a
# leading-* JSDoc continuation, then anything, then `cfn:`. Written with `[*]`
# (not `\*`) so the SAME string is a valid ERE for both grep and awk.
MARKER_RE='(#|//|--|/[*]|^[[:space:]]*[*]).*cfn:'

# Exclusions:
# - .backups is CFN's own pre-edit backup dir; dist-run/dist/build/.next are
#   compiled output: markers there are stale copies of source markers, so
#   scanning them double-counts the ledger and inflates the no-trigger count.
# - .cfn-cache is this skill's OWN output plus other skills' cached review diffs
#   (.cfn-cache/diffs/*.diff). Harvesting a diff of the codebase re-harvests the
#   codebase, with the diff file as the "source" — pure garbage rows.
# - Prose file types (*.md and friends) are excluded by EXTENSION, not by
#   directory: planning docs, READMEs and this skill's own docs/TECH_DEBT.md all
#   merely QUOTE marker text; none of them is shipped code that can carry debt.
#   Excluding the file type rather than `planning/` keeps real code that happens
#   to live under a docs directory visible to the harvest.
#
# grep only picks the candidate FILES; awk re-scans them so it can look ahead at
# continuation lines (a line-oriented `grep -n` feed cannot).
FILES=$(grep -rlE "$MARKER_RE" . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  --exclude-dir=dist-run --exclude-dir=.backups --exclude-dir=.cfn-cache \
  --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage \
  --exclude-dir=worktrees --exclude-dir=.artifacts \
  --exclude='*.md' --exclude='*.mdx' --exclude='*.markdown' \
  --exclude='*.rst' --exclude='*.txt' 2>/dev/null || true)

# Single parse: source files -> TSV (file, line, ceiling, trigger). Both the human
# ledger and the JSON ledger are derived from this, so they can never disagree.
# Empty trigger = the no-trigger rot flag.
TSV=""
if [[ -n "$FILES" ]]; then
TSV=$(printf '%s\n' "$FILES" | xargs -d '\n' -r awk -v maxf="$MAX_FIELD" -v maxc="$MAX_CONT" -v re="$MARKER_RE" '
function ltrim(s) { sub(/^[ \t]+/, "", s); return s }
function rtrim(s) { sub(/[ \t]+$/, "", s); return s }
function trim(s)  { return rtrim(ltrim(s)) }
function clip(s) {
  gsub(/\t/, " ", s)
  return (length(s) > maxf) ? substr(s, 1, maxf) "..." : s
}
# Byte offset of the first DECLARING `cfn:` on a line, or 0 if there is none.
# Prose that REFERS to a marker living somewhere else is not itself a marker;
# harvesting it manufactures a phantom row (and phantom rot) for a shortcut that
# is already counted at its real declaration site. Two lexical tells, both cheap:
#
#   1. the `cfn:` is quoted or directly preceded by "see " --
#        // Intentionally per-process (see cfn: note).
#        // ... see config.ts own `cfn:` note on QcChecklist
#   2. the word right AFTER `cfn:` is "marker" or "note" -- a real marker`s body
#      opens with its CEILING, never with those words --
#        -- (documented cfn: marker in src/config.ts, not this file`s concern)
#
# Limits, stated honestly: this is lexical, so a reference phrased some other way
# ("per the cfn: above") is still harvested, and a real marker that opened with a
# quote or with the literal word "note" would be dropped. Both are rare. The bias
# stays "over-capture a real marker rather than silently drop one"; only this
# narrow reference class is carved out.
function markerPos(line,   off, p, abs, prev, pre4, rest, w) {
  off = 0
  while ((p = index(substr(line, off + 1), "cfn:")) > 0) {
    abs  = off + p
    prev = (abs > 1) ? substr(line, abs - 1, 1) : ""
    pre4 = (abs > 4) ? tolower(substr(line, abs - 4, 4)) : ""
    rest = tolower(ltrim(substr(line, abs + 4)))
    w    = rest
    sub(/[^a-z].*$/, "", w)                       # first word of the body
    if (prev != "`" && prev != "\"" && prev != "'"'"'" && pre4 != "see " &&
        w != "marker" && w != "note") return abs
    off = abs + 3
  }
  return 0
}
# Comment style of a PURE comment line (leading token), or "" for a trailing
# inline comment / non-comment. Only pure comment lines can start a wrapped
# marker; a trailing `// cfn: ...` after code is parsed from its own line only.
function styleOf(line,   t) {
  t = ltrim(line)
  if (substr(t, 1, 2) == "//") return "slash"
  if (substr(t, 1, 2) == "/*") return "star"
  if (substr(t, 1, 1) == "*")  return "star"
  if (substr(t, 1, 1) == "#")  return "hash"
  if (substr(t, 1, 2) == "--") return "dash"
  return ""
}
# Continuation payload of LINE for a marker of comment style STYLE. Sets CONT_OK=0
# when LINE ends the join: a non-comment line, a different comment style, the
# closing `*/`, or a blank comment line (paragraph break).
function contPayload(line, style,   t) {
  CONT_OK = 0
  t = ltrim(line)
  if (style == "slash") { if (substr(t, 1, 2) != "//") return ""; t = substr(t, 3) }
  else if (style == "star") {
    if (substr(t, 1, 2) == "*/") return ""
    if (substr(t, 1, 1) != "*")  return ""
    t = substr(t, 2)
  }
  else if (style == "hash") { if (substr(t, 1, 1) != "#")  return ""; t = substr(t, 2) }
  else if (style == "dash") { if (substr(t, 1, 2) != "--") return ""; t = substr(t, 3) }
  else return ""
  sub(/\*\/.*$/, "", t)
  t = trim(t)
  if (t == "") return ""
  CONT_OK = 1
  return t
}
{
  f = FILENAME
  if (!(f in nlines)) order[++nf] = f
  lines[f, FNR] = $0
  nlines[f] = FNR
}
END {
  for (i = 1; i <= nf; i++) {
    f = order[i]
    for (n = 1; n <= nlines[f]; n++) {
      L = lines[f, n]
      if (L !~ re) continue
      mp = markerPos(L)
      if (mp == 0) continue          # reference to a marker, not a marker

      body   = substr(L, mp + 4)
      closed = (index(body, "*/") > 0)   # comment block ends on the marker line
      sub(/\*\/.*$/, "", body)
      body  = trim(body)

      style = styleOf(L)
      if (style != "" && !closed) {
        for (m = n + 1; m <= nlines[f] && m <= n + maxc; m++) {
          NL = lines[f, m]
          if (NL ~ re && markerPos(NL) > 0) break   # next line declares its OWN marker
          ends = (index(NL, "*/") > 0)
          p = contPayload(NL, style)
          if (!CONT_OK) break
          body = body " " p
          if (ends) break
        }
      }
      body = trim(body)

      # Split on the FIRST comma OR semicolon, whichever comes first.
      ci = index(body, ",")
      si = index(body, ";")
      if      (ci == 0) sp = si
      else if (si == 0) sp = ci
      else              sp = (ci < si) ? ci : si

      if (sp > 0) {
        ceiling = trim(substr(body, 1, sp - 1))
        trigger = trim(substr(body, sp + 1))
      } else {
        ceiling = body
        trigger = ""
      }
      printf "%s\t%s\t%s\t%s\n", f, n, clip(ceiling), clip(trigger)
    }
  }
}' | sort)
fi

if [[ -z "$TSV" ]]; then
  echo "No cfn: debt. Clean ledger."
  exit 0
fi

LEDGER=$(echo "$TSV" | awk -F'\t' '
  { printf "%s:%s: ceiling: %s. upgrade: %s.\n", $1, $2, $3, ($4 == "" ? "NONE" : $4); }')

TOTAL=$(echo "$LEDGER" | grep -c . || true)
NOTRIG=$(echo "$LEDGER" | grep -c 'upgrade: NONE\.$' || true)

echo "$LEDGER"
echo
echo "$TOTAL markers, $NOTRIG with no trigger."

# Machine-readable ledger (always written; feeds cfn-megaplan scoping). Lives in
# the gitignored .cfn-cache/ per the project manifest convention, so a harvest run
# never dirties tracked files. cfn-megaplan READS this; it never re-harvests.
if command -v jq >/dev/null 2>&1; then
  CACHE_DIR="${PROJECT_ROOT}/.cfn-cache"
  LEDGER_JSON="${CACHE_DIR}/tech-debt-ledger.json"
  mkdir -p "$CACHE_DIR"
  GITIGNORE="${PROJECT_ROOT}/.gitignore"
  grep -qxE '\.cfn-cache/?' "$GITIGNORE" 2>/dev/null \
    || printf '\n# CFN local cache\n.cfn-cache/\n' >> "$GITIGNORE"

  # jq -R over the same TSV, for correct JSON escaping. Empty trigger -> null +
  # has_trigger:false (rot flag). Schema is stable: cfn-megaplan reads it.
  MARKERS_JSON=$(echo "$TSV" | jq -R -s '
    split("\n") | map(select(length > 0)) | map(split("\t")) |
    map({
      file: .[0],
      line: (.[1] | tonumber),
      ceiling: .[2],
      upgrade_trigger: (if .[3] == "" then null else .[3] end),
      has_trigger: (.[3] != "")
    })')

  jq -n \
    --argjson markers "$MARKERS_JSON" \
    --arg generated "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      generated: $generated,
      total: ($markers | length),
      no_trigger: ([$markers[] | select(.has_trigger == false)] | length),
      markers: $markers
    }' > "$LEDGER_JSON"

  echo
  echo "Machine ledger written to $LEDGER_JSON"
fi

if [[ "$PERSIST" == "1" ]]; then
  OUT="docs/TECH_DEBT.md"
  mkdir -p docs
  {
    echo "# Tech Debt Ledger"
    echo
    echo "Harvested \`cfn:\` shortcut markers. Regenerate: \`./.claude/skills/cfn-tech-debt/harvest.sh --persist\`"
    echo
    echo "$LEDGER" | sed 's/^/- /'
    echo
    echo "**$TOTAL markers, $NOTRIG with no trigger.**"
  } > "$OUT"
  echo
  echo "Ledger written to $OUT"
fi
