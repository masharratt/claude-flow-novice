#!/usr/bin/env bash
# verify-run.sh — mechanical executor for a VERIFY manifest (Bar A, G37).
# The single done authority for cfn-loop-task: runs each AC's check, records a
# results file, and reports done ONLY when every AC is green and nothing is unresolved.
# Prose never counts — a needs_agent / predicate_unverified row is "done" only after
# `resolve` stamps captured evidence into the results file.
#
# Subcommands:
#   run     --verify <VERIFY_<slug>.md> [--out <RESULTS.json>] [--only AC-3,AC-7] [--timeout N]
#   resolve --results <RESULTS.json> --ac AC-3 --pass true|false --evidence-file <f>
#   summary --results <RESULTS.json>
#
# Env:  CFN_VERIFY_TIMEOUT_S      per-check timeout seconds (default 300)
#       CFN_VERIFY_DATABASE_URL   when set, db-query: checks run via psql; else -> needs_agent
#
# Exit: 0 = all green AND nothing unresolved
#       1 = one or more red or unresolved ACs
#       2 = usage / parse / file error / evidence refusal
#       4 = VERIFY manifest sha256 mismatch (edited after Bar A blessed it)
#
# Deps: jq, timeout(1); psql only when CFN_VERIFY_DATABASE_URL is set.
set -uo pipefail

DEFAULT_TIMEOUT="${CFN_VERIFY_TIMEOUT_S:-300}"

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/parse-test-summary.sh
source "$SCRIPT_DIR/lib/parse-test-summary.sh"

die2() { echo "{\"error\":\"$1\"}" >&2; exit 2; }
need() { command -v "$1" >/dev/null 2>&1 || die2 "$1 not found on PATH"; }

now_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Extract the LAST fenced ```json block from a markdown file.
extract_manifest() {
  awk '
    /^```json/     { inblock=1; buf=""; next }
    inblock && /^```/ { inblock=0; last=buf; next }
    inblock        { buf = buf $0 "\n" }
    END            { printf "%s", last }
  ' "$1"
}

# Classify a check string -> executable | db-query | needs_agent
classify() {
  local check="$1"
  case "$check" in
    playwright:*|playwright\ *) echo needs_agent; return ;;
    db-query*)                  echo db-query;    return ;;
  esac
  local first="${check%% *}"
  case "$first" in
    vitest|jest|mocha|ava|cargo|pytest|go|npx|npm|pnpm|node|bash|tsc|curl|grep|rg|jq) echo executable ;;
    *) echo needs_agent ;;
  esac
}

# exit-code-authoritative? runner kinds prove pass by exit code; predicate kinds
# (curl/grep/rg/jq/db-query) do so ONLY if the check self-asserts.
is_authoritative() {
  local check="$1"
  case "${check%% *}" in
    vitest|jest|mocha|ava|cargo|pytest|go|npx|npm|pnpm|node|bash|tsc) return 0 ;;
  esac
  # predicate kinds: authoritative only if the command itself fails on a false predicate
  if echo "$check" | grep -qE '(jq -e|grep -q|rg -q| -eq | -ne |\[\[|test )'; then
    return 0
  fi
  return 1
}

json_str() { jq -Rn --arg s "$1" '$s'; }

# ---------------- run ----------------
cmd_run() {
  local VERIFY="" OUT="" ONLY="" TIMEOUT="$DEFAULT_TIMEOUT"
  while [ $# -gt 0 ]; do
    case "$1" in
      --verify)  VERIFY="${2:-}"; shift 2 ;;
      --out)     OUT="${2:-}"; shift 2 ;;
      --only)    ONLY="${2:-}"; shift 2 ;;
      --timeout) TIMEOUT="${2:-}"; shift 2 ;;
      *) die2 "unknown run arg: $1" ;;
    esac
  done
  [ -n "$VERIFY" ] || die2 "run requires --verify <file>"
  [ -f "$VERIFY" ] || die2 "verify file not found: $VERIFY"
  need jq; need timeout

  # sha256 integrity (W2): sidecar planning/.VERIFY_<slug>.sha256
  local dir base sidecar
  dir="$(dirname "$VERIFY")"; base="$(basename "$VERIFY" .md)"
  sidecar="$dir/.$base.sha256"
  if [ -f "$sidecar" ]; then
    local want got
    want="$(tr -d '[:space:]' < "$sidecar")"
    got="$(sha256sum "$VERIFY" | awk '{print $1}')"
    if [ "$want" != "$got" ]; then
      echo "{\"error\":\"VERIFY manifest sha256 mismatch — edited after Bar A blessed it\",\"want\":\"$want\",\"got\":\"$got\"}" >&2
      exit 4
    fi
  else
    echo "warn: no integrity sidecar ($sidecar) — pre-hash-era manifest, proceeding" >&2
  fi

  local MANIFEST; MANIFEST="$(extract_manifest "$VERIFY")"
  [ -n "${MANIFEST//[[:space:]]/}" ] || die2 "no fenced json manifest block in $VERIFY"
  echo "$MANIFEST" | jq -e . >/dev/null 2>&1 || die2 "manifest json does not parse"

  local SLUG SHA
  SLUG="$(echo "$MANIFEST" | jq -r '.slug // "unknown"')"
  SHA="$(sha256sum "$VERIFY" | awk '{print $1}')"
  [ -n "$OUT" ] || OUT="$dir/VERIFY_RESULTS_${SLUG}.json"

  # optional --only filter
  local only_filter=""
  if [ -n "$ONLY" ]; then only_filter=",${ONLY},"; fi

  local n i results=()
  n="$(echo "$MANIFEST" | jq '.acs | length')"
  i=0
  while [ "$i" -lt "$n" ]; do
    local ac acid kind check pass
    ac="$(echo "$MANIFEST" | jq -c ".acs[$i]")"
    acid="$(echo "$ac" | jq -r '.id // "AC-?"')"
    kind="$(echo "$ac" | jq -r '.kind // ""')"
    check="$(echo "$ac" | jq -r '.check // ""')"
    pass="$(echo "$ac" | jq -r '.pass // ""')"
    i=$((i + 1))

    if [ -n "$only_filter" ] && [[ "$only_filter" != *",${acid},"* ]]; then
      continue
    fi

    local class mode exit_code excerpt pass_val pred_unv evidence
    mode=""; exit_code="null"; excerpt=""; pass_val="null"; pred_unv="false"; evidence=""
    class="$(classify "$check")"

    if [ "$class" = "db-query" ] && [ -z "${CFN_VERIFY_DATABASE_URL:-}" ]; then
      class="needs_agent"
    fi

    case "$class" in
      executable)
        local raw rc
        raw="$(cd "$PROJECT_ROOT" && timeout "$TIMEOUT" bash -c "$check" 2>&1)"; rc=$?
        exit_code="$rc"
        excerpt="$(printf '%s\n' "$raw" | tail -20)"
        mode="executed"
        if is_authoritative "$check"; then
          # S002 (origin: ROOTCAUSE_mpa_thread_wiring_gap.md, AC-77): exit code 0
          # alone must never close a runner-kind AC: a fully skipIf-ed test file
          # exits 0 and used to mark the AC green. Parse the captured stdout via
          # the shared summary parser (same logic gate-check.sh already uses).
          # Deliberate choice: RED, not unresolved, for both cases below:
          #   - zero-collected: the check named a test that did not run, so the
          #     check itself is broken.
          #   - skipped/todo present: a skipped guard is not a guard.
          # Exit code is only trusted when the runner's own summary is
          # unrecognized ("unknown": cargo/go/mocha/ava/npx/npm/pnpm/node/bash/
          # tsc, or an unparseable summary shape); those keep the pre-S002
          # exit-code-only semantics because this parser does not cover them.
          local raw_tmp
          raw_tmp="$(mktemp)"
          printf '%s\n' "$raw" > "$raw_tmp"
          if parse_test_summary "$raw_tmp"; then
            if [ "$PTS_COLLECTED" -eq 0 ]; then
              pass_val="false"
            elif [ "$PTS_SKIP" -gt 0 ] || [ "$PTS_TODO" -gt 0 ]; then
              pass_val="false"
            elif [ "$rc" -eq 0 ]; then
              pass_val="true"
            else
              pass_val="false"
            fi
          else
            if [ "$rc" -eq 0 ]; then pass_val="true"; else pass_val="false"; fi
          fi
          rm -f "$raw_tmp"
        else
          if [ "$rc" -ne 0 ]; then pass_val="false"; else pred_unv="true"; pass_val="null"; fi
        fi
        ;;
      db-query)
        local sql raw rc
        sql="${check#db-query:}"; sql="${sql#db-query}"
        raw="$(cd "$PROJECT_ROOT" && timeout "$TIMEOUT" psql "$CFN_VERIFY_DATABASE_URL" -X -A -t -c "$sql" 2>&1)"; rc=$?
        exit_code="$rc"
        excerpt="$(printf '%s\n' "$raw" | tail -20)"
        mode="executed"
        if [ "$rc" -ne 0 ]; then pass_val="false"; else pred_unv="true"; pass_val="null"; fi
        ;;
      needs_agent)
        mode="needs_agent"; pass_val="null"
        ;;
    esac

    results+=("$(jq -n \
      --arg ac "$acid" --arg kind "$kind" --arg check "$check" --arg mode "$mode" \
      --argjson ec "$exit_code" --argjson pass "$pass_val" --argjson pu "$pred_unv" \
      --arg out "$excerpt" --arg ev "$evidence" --arg ts "$(now_ts)" \
      '{ac_id:$ac,kind:$kind,check:$check,mode:$mode,exit_code:$ec,pass:$pass,predicate_unverified:$pu,output_excerpt:$out,evidence:$ev,timestamp:$ts}')")
  done

  local arr; arr="$(printf '%s\n' "${results[@]:-}" | jq -s '.')"
  local doc
  doc="$(jq -n --arg slug "$SLUG" --arg vf "$VERIFY" --arg sha "$SHA" --arg ts "$(now_ts)" \
    --argjson results "$arr" \
    '{slug:$slug,verify_file:$vf,verify_sha256:$sha,timestamp:$ts,results:$results} | . + {summary: (
        .results as $r |
        {total: ($r|length),
         executed: ([$r[]|select(.mode=="executed")]|length),
         needs_agent: ([$r[]|select(.mode=="needs_agent")]|length),
         green: ([$r[]|select(.pass==true)]|length),
         red: ([$r[]|select(.pass==false)]|length),
         unresolved: ([$r[]|select(.pass==null)]|length)}
        | . + {all_green: (.red==0 and .unresolved==0 and .total>0)}
      )}')"

  local tmp; tmp="$(mktemp)"; printf '%s\n' "$doc" > "$tmp"; mv "$tmp" "$OUT"
  echo "$doc" | jq -c '.summary + {out: "'"$OUT"'"}'

  if [ "$(echo "$doc" | jq -r '.summary.all_green')" = "true" ]; then exit 0; fi
  exit 1
}

# ---------------- resolve ----------------
cmd_resolve() {
  local RESULTS="" AC="" PASS="" EVF=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --results)       RESULTS="${2:-}"; shift 2 ;;
      --ac)            AC="${2:-}"; shift 2 ;;
      --pass)          PASS="${2:-}"; shift 2 ;;
      --evidence-file) EVF="${2:-}"; shift 2 ;;
      *) die2 "unknown resolve arg: $1" ;;
    esac
  done
  [ -f "$RESULTS" ] || die2 "results file not found: $RESULTS"
  [ -n "$AC" ] || die2 "resolve requires --ac"
  [ "$PASS" = "true" ] || [ "$PASS" = "false" ] || die2 "resolve --pass must be true|false"
  [ -f "$EVF" ] || die2 "evidence file not found: $EVF"
  need jq

  local ev nlines
  ev="$(cat "$EVF")"
  nlines="$(printf '%s\n' "$ev" | grep -cE '.')"
  [ "$nlines" -ge 3 ] || die2 "evidence too thin (<3 non-empty lines) — capture the real output excerpt"

  jq -e --arg ac "$AC" 'any(.results[]; .ac_id==$ac)' "$RESULTS" >/dev/null \
    || die2 "AC $AC not present in results"

  local doc
  doc="$(jq --arg ac "$AC" --argjson pass "$PASS" --arg ev "$ev" --arg ts "$(now_ts)" '
    .results |= map(if .ac_id==$ac then
        .pass=$pass | .predicate_unverified=false | .mode="resolved" | .evidence=$ev | .timestamp=$ts
      else . end)
    | .summary = ( .results as $r |
        {total: ($r|length),
         executed: ([$r[]|select(.mode=="executed")]|length),
         needs_agent: ([$r[]|select(.mode=="needs_agent")]|length),
         green: ([$r[]|select(.pass==true)]|length),
         red: ([$r[]|select(.pass==false)]|length),
         unresolved: ([$r[]|select(.pass==null)]|length)}
        | . + {all_green: (.red==0 and .unresolved==0 and .total>0)} )
  ' "$RESULTS")"

  local tmp; tmp="$(mktemp)"; printf '%s\n' "$doc" > "$tmp"; mv "$tmp" "$RESULTS"
  echo "$doc" | jq -c '.summary'
  exit 0
}

# ---------------- summary ----------------
cmd_summary() {
  local RESULTS=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --results) RESULTS="${2:-}"; shift 2 ;;
      *) die2 "unknown summary arg: $1" ;;
    esac
  done
  [ -f "$RESULTS" ] || die2 "results file not found: $RESULTS"
  need jq
  echo "$(jq -c '.summary' "$RESULTS")"
  [ "$(jq -r '.summary.all_green' "$RESULTS")" = "true" ] && exit 0
  exit 1
}

SUB="${1:-}"; shift || true
case "$SUB" in
  run)     cmd_run "$@" ;;
  resolve) cmd_resolve "$@" ;;
  summary) cmd_summary "$@" ;;
  *) echo "usage: verify-run.sh {run|resolve|summary} ..." >&2; exit 2 ;;
esac
