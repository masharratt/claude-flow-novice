#!/usr/bin/env bash
# Bar K static scan: is every load-bearing claim in a knowledge deliverable grounded?
#
# This is the non-code analogue of Bar A (verifiable-done). Bar A asks "can this
# acceptance criterion be run?"; Bar K asks "can this claim be traced?". Both refuse
# to bless prose that cannot be checked.
#
# Usage:   check-grounding.sh <deliverable.md> [sources.md]
# Output:  JSON findings array on stdout:
#            [{"file":"...","line":N,"rule":"G1","detail":"...","severity":"error"}]
#          Empty array [] when clean.
# Exit:    0 = no error-severity findings (warn alone does not fail),
#          1 = one or more error-severity findings,
#          2 = usage or file error.
#
# Rules:
#   G1  prose cites [C-n] that has no row in the Claims Ledger
#   G2  EVIDENCE row with empty Source or Locator
#   G3  ledger row never cited anywhere in the prose (dead claim)
#   G4  row cites SRC-n that does not exist in the sources file (only when file given)
#   G5  duplicate claim id
#   G6  Type outside the closed vocabulary EVIDENCE|INFERENCE|ASSUMPTION
#   G7  no "## Claims Ledger" section at all
#   G8  Confidence outside the closed vocabulary high|medium|low
#   G9  INFERENCE row whose Source names no upstream C-id
#
# cfn: markdown-table parsing only, no prose NLP. It cannot tell whether an
# uncited sentence is load-bearing or filler, so it checks the ledger contract
# rather than the sentence. Upgrade trigger: reviewers start finding ungrounded
# claims that carry no [C-n] cite at all -- that needs claim extraction, not grep.
set -euo pipefail

DOC="${1:-}"
SOURCES="${2:-}"

if [ -z "$DOC" ]; then
  echo 'usage: check-grounding.sh <deliverable.md> [sources.md]' >&2
  exit 2
fi
if [ ! -f "$DOC" ]; then
  echo "error: file not found: $DOC" >&2
  exit 2
fi
if [ -n "$SOURCES" ] && [ ! -f "$SOURCES" ]; then
  echo "error: file not found: $SOURCES" >&2
  exit 2
fi

TMP=$(mktemp -d "${TMPDIR:-/tmp}/cfn-grounding-XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM

FINDINGS="$TMP/findings.jsonl"
: > "$FINDINGS"

emit() { # rule line detail severity
  python3 - "$1" "$2" "$3" "$4" "$DOC" >> "$FINDINGS" <<'PY'
import json, sys
rule, line, detail, sev, f = sys.argv[1:6]
print(json.dumps({"file": f, "line": int(line), "rule": rule,
                  "detail": detail, "severity": sev}))
PY
}

# ---------------------------------------------------------------- ledger parse
# Rows look like: | C-1 | claim text | EVIDENCE | SRC-2 | p.14 | high |
LEDGER_START=$(grep -n -m1 -iE '^##+[[:space:]]+Claims Ledger[[:space:]]*$' "$DOC" | cut -d: -f1 || true)
if [ -z "$LEDGER_START" ]; then
  emit G7 1 "no '## Claims Ledger' section; deliverable cannot be grounded" error
  python3 - "$FINDINGS" <<'PY'
import json, sys
print(json.dumps([json.loads(l) for l in open(sys.argv[1]) if l.strip()], indent=2))
PY
  exit 1
fi

awk -v start="$LEDGER_START" 'NR > start {
  if ($0 ~ /^##+[[:space:]]/) exit
  if ($0 !~ /^[[:space:]]*\|/) next
  print NR "\t" $0
}' "$DOC" > "$TMP/ledger_raw.txt"

: > "$TMP/rows.tsv"
while IFS=$'\t' read -r lineno row; do
  [ -n "${row:-}" ] || continue
  # skip header + separator rows
  case "$row" in
    *---*) continue ;;
  esac
  body=${row#*|}; body=${body%|*}
  IFS='|' read -r -a cells <<< "$body"
  trim() { printf '%s' "$1" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'; }
  cid=$(trim "${cells[0]:-}")
  claim=$(trim "${cells[1]:-}")
  ctype=$(trim "${cells[2]:-}")
  src=$(trim "${cells[3]:-}")
  loc=$(trim "${cells[4]:-}")
  conf=$(trim "${cells[5]:-}")
  # header row (ID | Claim | ...) has no C-n id
  case "$cid" in
    C-[0-9]*) ;;
    *) continue ;;
  esac
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$lineno" "$cid" "$claim" "$ctype" "$src" "$loc" "$conf" >> "$TMP/rows.tsv"
done < "$TMP/ledger_raw.txt"

if [ ! -s "$TMP/rows.tsv" ]; then
  emit G7 "$LEDGER_START" "Claims Ledger section present but holds no C-n rows" error
fi

# ------------------------------------------------------------------ row checks
cut -f2 "$TMP/rows.tsv" | sort | uniq -d > "$TMP/dupes.txt" || true
while IFS= read -r dup; do
  [ -n "$dup" ] || continue
  dline=$(awk -F'\t' -v d="$dup" '$2==d {print $1; exit}' "$TMP/rows.tsv")
  emit G5 "$dline" "duplicate claim id $dup" error
done < "$TMP/dupes.txt"

while IFS=$'\t' read -r lineno cid claim ctype src loc conf; do
  case "$ctype" in
    EVIDENCE|INFERENCE|ASSUMPTION) ;;
    *) emit G6 "$lineno" "$cid type '$ctype' outside EVIDENCE|INFERENCE|ASSUMPTION" error ;;
  esac

  case "$conf" in
    high|medium|low) ;;
    *) emit G8 "$lineno" "$cid confidence '$conf' outside high|medium|low" error ;;
  esac

  if [ "$ctype" = "EVIDENCE" ]; then
    if [ -z "$src" ] || [ "$src" = "-" ]; then
      emit G2 "$lineno" "$cid is EVIDENCE with no Source" error
    fi
    if [ -z "$loc" ] || [ "$loc" = "-" ]; then
      emit G2 "$lineno" "$cid is EVIDENCE with no Locator (page, timestamp, section, or URL anchor)" error
    fi
  fi

  if [ "$ctype" = "INFERENCE" ]; then
    if ! printf '%s' "$src" | grep -qE 'C-[0-9]+'; then
      emit G9 "$lineno" "$cid is INFERENCE but Source names no upstream C-id" error
    fi
  fi

  if [ -n "$SOURCES" ]; then
    for sid in $(printf '%s' "$src" | grep -oE 'SRC-[0-9]+' | sort -u); do
      if ! grep -qE "(^|[^A-Za-z0-9-])${sid}([^0-9]|$)" "$SOURCES"; then
        emit G4 "$lineno" "$cid cites $sid which is absent from $(basename "$SOURCES")" error
      fi
    done
  fi
done < "$TMP/rows.tsv"

# -------------------------------------------------------- prose <-> ledger link
# Prose = everything outside the ledger rows.
awk -v start="$LEDGER_START" 'NR <= start || $0 !~ /^[[:space:]]*\|/' "$DOC" > "$TMP/prose.txt"

grep -oE '\[C-[0-9]+\]' "$TMP/prose.txt" 2>/dev/null | tr -d '[]' | sort -u > "$TMP/cited.txt" || true
cut -f2 "$TMP/rows.tsv" | sort -u > "$TMP/declared.txt"

while IFS= read -r cid; do
  [ -n "$cid" ] || continue
  if ! grep -qxF "$cid" "$TMP/declared.txt"; then
    cline=$(grep -nF "[$cid]" "$DOC" | head -1 | cut -d: -f1)
    emit G1 "${cline:-1}" "prose cites [$cid] with no row in the Claims Ledger" error
  fi
done < "$TMP/cited.txt"

while IFS= read -r cid; do
  [ -n "$cid" ] || continue
  if ! grep -qxF "$cid" "$TMP/cited.txt"; then
    dline=$(awk -F'\t' -v d="$cid" '$2==d {print $1; exit}' "$TMP/rows.tsv")
    emit G3 "$dline" "$cid is declared in the ledger but never cited in the prose" error
  fi
done < "$TMP/declared.txt"

# ---------------------------------------------------------------------- output
python3 - "$FINDINGS" <<'PY'
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
rows.sort(key=lambda r: (r["line"], r["rule"]))
print(json.dumps(rows, indent=2))
sys.exit(1 if any(r["severity"] == "error" for r in rows) else 0)
PY
