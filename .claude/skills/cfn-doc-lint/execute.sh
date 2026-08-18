#!/usr/bin/env bash
# cfn-doc-lint: enforce the feature-status / state-machines doc contract.
# Contract: see SCHEMA.md (same dir). Single source of truth.
#
# Usage:
#   execute.sh <file.md>            lint one doc, auto-detect type by basename
#   execute.sh <dir>                lint <dir>/readme/feature-status.md + state-machines.md
#   execute.sh --check-all <root>   walk <root>, lint every conforming file
#
# Exit 0 = clean (warnings allowed). Exit 1 = one or more ERRORs.
set -u

CELL_HARD=800     # cells over this are walls -> ERROR (blocks)
CELL_SOFT=280     # cells over this are verbose -> WARN (report)
TOC_THRESHOLD=300
OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

err()  { printf 'ERROR  %s\n' "$*" >> "$OUT"; }
warn() { printf 'WARN   %s\n' "$*" >> "$OUT"; }

# --- common -----------------------------------------------------------------
check_filename() {
  local base; base="$(basename "$1")"
  case "$base" in
    feature-status.md|state-machines.md) return 0 ;;
    state-machine.md)        err "$1:1 singular filename: rename to state-machines.md (plural)" ;;
    *-state-machine.md|*-state-machines.md)
                              err "$1:1 domain-prefixed filename: fold into readme/state-machines.md" ;;
    *)                        err "$1:1 not a recognized contract doc name (feature-status.md | state-machines.md)" ;;
  esac
}

check_last_updated() {
  # Accept any freshness stamp with a date in the first 20 lines:
  # Last Updated / Last Verified / Last Reviewed / verified against prod
  grep -qiE '(last[[:space:]]+(updated|verified|reviewed)|verified[[:space:]]+against).*[0-9]{4}-[0-9]{2}-[0-9]{2}' <(head -20 "$1") \
    || err "$1:1 missing Last Updated/Verified/Reviewed date stamp within first 20 lines"
}

# Two-tier cell length: >CELL_HARD is a wall (ERROR), >CELL_SOFT is verbose (WARN).
check_cell_cap() {
  awk -v hard="$CELL_HARD" -v soft="$CELL_SOFT" -v F="$1" '
    /^\|/ && $0 !~ /^\|[[:space:]:|-]+\|?[[:space:]]*$/ {
      n=split($0,a,"|");
      for (i=2;i<n;i++) {
        c=a[i]; sub(/^[[:space:]]+/,"",c); sub(/[[:space:]]+$/,"",c); L=length(c);
        if      (L > hard) printf "ERROR  %s:%d table cell %d chars (>hard cap %d): %.50s...\n", F, NR, L, hard, c;
        else if (L > soft) printf "WARN   %s:%d table cell %d chars (>aim %d): %.40s...\n",      F, NR, L, soft, c;
      }
    }
  ' "$1" >> "$OUT"
}

# --- feature-status ---------------------------------------------------------
lint_feature_status() {
  local f="$1"
  check_last_updated "$f"

  # Legend: an explicit legend header, OR a table row defining >=3 of the 5 tokens with meanings.
  if grep -niqE '^#{1,3}[[:space:]].*(status[[:space:]]*(legend|definition|key|vocab)|legend)' <(head -80 "$f"); then
    :
  elif [ "$(grep -ciE '\|[[:space:]]*(prod|beta|dev|stub|deprecated)[[:space:]]*\|' <(head -120 "$f"))" -ge 3 ]; then
    :
  else
    err "$f:1 missing Status Legend (header or a table defining prod/beta/dev/stub/deprecated) in first 120 lines (see SCHEMA.md)"
  fi

  # All 5 tokens should appear somewhere.
  local tok missing=""
  for tok in prod beta dev stub deprecated; do
    grep -qw "$tok" "$f" || missing="$missing $tok"
  done
  [ -n "$missing" ] && warn "$f:1 vocabulary tokens absent from file:$missing"

  # Vocab drift: values under a Status column that are not in the enum.
  # Re-detect the Status column for each table block (tables have different layouts).
  awk '
    function firstalpha(s,   i,n,w,t){ n=split(s,w,"[[:space:]]"); for(i=1;i<=n;i++){t=w[i]; gsub(/[^A-Za-z]/,"",t); if(t!="") return tolower(t)} return "" }
    BEGIN { sc=-1 }
    /^[[:space:]]*\|/ {
      if (sc==-1) {                                       # not yet in a status table this block
        if (tolower($0) ~ /status/) {
          n=split($0,h,"|"); for (i=1;i<=n;i++){gsub(/^[[:space:]]+|[[:space:]]+$/,"",h[i]); if (tolower(h[i])=="status") sc=i}
        }
        next
      }
      n=split($0,c,"|"); v=(sc<=n)?c[sc]:"";
      gsub(/^[[:space:]]+|[[:space:]]+$/,"",v); gsub(/[*_`]/,"",v);
      tok=firstalpha(v);
      if (tok=="" || tok ~ /^(na|n\/a|none|tbd)$/) next;
      seen[tok]++
      next
    }
    { sc=-1 }                                             # non-table line: leave block, reset
    END { for (t in seen) if (t !~ /^(prod|beta|dev|stub|deprecated)$/)
            printf "WARN   %s:1 status-token not in enum: \"%s\" (x%d)\n", F, t, seen[t] }
  ' F="$f" "$f" | sort >> "$OUT"

  check_cell_cap "$f"

  # Changelog smell: many dated H2/H3 headers.
  local dated; dated=$(grep -cE '^#{2,3}[[:space:]].*20[0-9]{2}-[0-9]{2}-[0-9]{2}' "$f" || true)
  [ "$dated" -gt 5 ] && warn "$f:1 $dated dated H2/H3 headers: likely changelog -> readme/CHANGELOG.md"
}

# --- state-machines ---------------------------------------------------------
lint_state_machines() {
  local f="$1"
  check_last_updated "$f"

  local lines; lines=$(wc -l < "$f")
  if [ "$lines" -gt "$TOC_THRESHOLD" ]; then
    grep -nqE '\]\(#' <(head -60 "$f") \
      || err "$f:1 $lines lines and no anchor-link TOC in first 60 lines (threshold $TOC_THRESHOLD)"
  fi

  # Per-entity shape + duplicate detection + source grounding.
  # NOTE: cell-length cap is NOT applied to state-machines. Transition cells are
  # load-bearing spec (complete business rules), not feature-status Description
  # walls. The SCHEMA's "no implementation prose" rule still guides humans here.
  awk -v F="$f" '
    function norm(s,  r){ r=s; sub(/^[0-9]+\.?[[:space:]]*/,"",r); sub(/[[:space:]]*\([^)]*20[0-9]{2}[^)]*\)[[:space:]]*$/,"",r); sub(/^[[:space:]]+/,"",r); sub(/[[:space:]]+$/,"",r); return tolower(r) }
    /^##[[:space:]]/ {
      if (name!="") {
        if (has_states==0) warn(F":"startln" entity \""name"\" has no States section");
        if (has_trans==0)  warn(F":"startln" entity \""name"\" has no Transitions (From/To/Trigger)");
        if (has_src==0)    warn(F":"startln" entity \""name"\" has no Source/Table/Location grounding");
        key=norm(name);
        if (key in seen) err(F":"NR" duplicate entity \""name"\" (first at "seen[key]") - edit in place, do not prepend dated copies");
        else seen[key]=startln;
      }
      name=$0; sub(/^##[[:space:]]*/,"",name); startln=NR; has_states=0; has_trans=0; has_src=0;
      if (name ~ /^(Table of Contents|Contents|TOC|Overview|Legend|Status|Appendix|Cross-cutting|Future)/) name="";
      next
    }
    name=="" { next }
    /### .*State|\*\*State/                  { has_states=1 }
    /### .*Transition|\*\*Transition|->|→/   { has_trans=1 }
    /\*\*(Source|Table|Location|File)/       { has_src=1 }
    END {
      if (name!="") {
        if (has_states==0) warn(F":"startln" entity \""name"\" has no States section");
        if (has_trans==0)  warn(F":"startln" entity \""name"\" has no Transitions");
        if (has_src==0)    warn(F":"startln" entity \""name"\" has no Source grounding");
        key=norm(name);
        if (key in seen) err(F":"NR" duplicate entity \""name"\" (first at "seen[key]")");
      }
    }
    function err(m){ print "ERROR  "m >> OUT }
    function warn(m){ print "WARN   "m >> OUT }
  ' F="$f" OUT="$OUT" "$f"
}

lint_one() {
  local f="$1" base
  [ -f "$f" ] || { err "$f:1 file not found"; return; }
  base="$(basename "$f")"
  case "$base" in
    feature-status.md)                     lint_feature_status "$f" ;;
    state-machines.md)                     lint_state_machines "$f" ;;
    state-machine.md|*-state-machine*.md)  check_filename "$f"; lint_state_machines "$f" ;;
    *feature-status*.md)                   check_filename "$f"; lint_feature_status "$f" ;;
    *)                                     check_filename "$f" ;;
  esac
}

lint_dir() {
  [ -f "$1/readme/feature-status.md" ] && lint_one "$1/readme/feature-status.md"
  [ -f "$1/readme/state-machines.md" ] && lint_one "$1/readme/state-machines.md"
}

check_all() {
  local f d iswt root="${1:-${CFN_PROJECTS_ROOT:-$HOME/projects}}"
  while IFS= read -r f; do
    # skip files inside a git worktree (working tree whose .git is a file, not a dir)
    iswt=0; d="$f"
    while [ "$d" != "/" ] && [ "$d" != "$root" ]; do
      if [ -f "$d/.git" ]; then iswt=1; break; fi
      if [ -d "$d/.git" ]; then break; fi
      d="$(dirname "$d")"
    done
    [ "$iswt" = "1" ] && continue
    lint_one "$f"
  done < <(find "$root" -type f \( -name 'feature-status.md' -o -name 'state-machines.md' \) 2>/dev/null | grep -vE 'node_modules|worktrees')
}

main() {
  [ $# -eq 0 ] && { echo "usage: $0 <file.md|dir|--check-all root>" >&2; exit 2; }
  if [ "$1" = "--check-all" ]; then shift; check_all "${1:-${CFN_PROJECTS_ROOT:-$HOME/projects}}"; else
    for arg in "$@"; do
      if [ -d "$arg" ]; then lint_dir "$arg"; else lint_one "$arg"; fi
    done
  fi
  cat "$OUT"
  local e; e=$(grep -c '^ERROR' "$OUT" || true)
  if [ "$e" -gt 0 ]; then echo "---"; echo "FAIL: $e error(s)"; exit 1; fi
  exit 0
}
main "$@"
