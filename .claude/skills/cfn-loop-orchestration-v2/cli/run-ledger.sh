#!/usr/bin/env bash
# run-ledger.sh: one JSONL row per cfn-loop-task run, so two loosening seams
# have a signal instead of a file nobody reads:
#   1. Bar B executor tier (`sonnet` vs `full`): did a WHAT gap slip past the
#      cheaper bar? Symptom = a lane blocked_on a spec gap ("underspecified",
#      "which symbol", "plan drift").
#   2. Bounded step amendments (HOW only): did an amendment touch a symbol
#      another step Consumes? Symptom = amendment `what` names a Produces symbol.
#
# Usage:
#   record --slug <slug> --plan-dir <planning/<slug>> --run-plan <run-plan-<id>.json>
#          [--report <lane-report.json>]... --iterations <n> --outcome done|not_done|escalated
#          [--bar-b-tier sonnet|full] [--tier mvp|beta|enterprise]
#     Appends one row to the ledger, prints a one-line summary plus FLAG lines.
#     Never fails the loop: only usage errors exit 2. Missing report files are
#     skipped. bar_b_tier/tier resolve from $plan-dir/MEGAPLAN_<slug>.md when
#     not passed; "unknown" when the task was not megaplanned.
#   stats [--slug <slug>] [--last <n>]
#     Aggregates the ledger by bar_b_tier as a JSON array.
#
# Env: CFN_RUN_LEDGER  ledger path (default: <repo>/.claude/cfn-data/loop-task-runs.jsonl,
#      which is symlinked global, so rows from every project land in one file;
#      the `project` field keeps them apart).
#
# Exit: 0 = recorded / stats printed; 2 = usage or parse error
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LEDGER="${CFN_RUN_LEDGER:-$PROJECT_ROOT/.claude/cfn-data/loop-task-runs.jsonl}"

die2() { echo "run-ledger: $1" >&2; exit 2; }
need() { command -v "$1" >/dev/null 2>&1 || die2 "$1 not found on PATH"; }

# Spec-gap classifier: blocked_on text that means "the plan did not say WHAT".
# cfn: regex classifier; upgrade to a lane-supplied `blocked_kind` field if
# false negatives show up in `stats` (a sonnet-tier gap that reads as external).
SPEC_GAP_RE='underspecif|not specified|unspecified|which (symbol|file|table|column|component|export)|ambigu|unclear|plan drift|does not name|not named|no done predicate|missing (signature|symbol)'

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//' >&2
  exit 2
}

# ---------------- record ----------------
cmd_record() {
  local SLUG="" PDIR="" RUNPLAN="" ITER="" OUTCOME="" BARB="" TIER=""
  local -a REPORTS=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --slug)       SLUG="${2:-}"; shift 2 ;;
      --plan-dir)   PDIR="${2:-}"; shift 2 ;;
      --run-plan)   RUNPLAN="${2:-}"; shift 2 ;;
      --report)     REPORTS+=("${2:-}"); shift 2 ;;
      --iterations) ITER="${2:-}"; shift 2 ;;
      --outcome)    OUTCOME="${2:-}"; shift 2 ;;
      --bar-b-tier) BARB="${2:-}"; shift 2 ;;
      --tier)       TIER="${2:-}"; shift 2 ;;
      *) die2 "unknown record arg: $1" ;;
    esac
  done
  [ -n "$SLUG" ]    || die2 "record requires --slug"
  [ -n "$PDIR" ]    || die2 "record requires --plan-dir"
  [ -n "$RUNPLAN" ] || die2 "record requires --run-plan"
  [ -n "$ITER" ]    || die2 "record requires --iterations"
  case "$OUTCOME" in done|not_done|escalated) ;; *) die2 "record requires --outcome done|not_done|escalated" ;; esac
  need jq

  # Tier + Bar B tier from the synthesis doc unless passed.
  local MP="$PDIR/MEGAPLAN_${SLUG}.md"
  if [ -z "$TIER" ] && [ -f "$MP" ]; then
    TIER="$(grep -m1 -oE '^Tier: *[a-z]+' "$MP" | awk '{print $2}' || true)"
  fi
  if [ -z "$BARB" ] && [ -f "$MP" ]; then
    BARB="$(grep -m1 -E 'Bar B haiku-executable' "$MP" | grep -oE 'tier=[a-z]+' | cut -d= -f2 || true)"
  fi
  TIER="${TIER:-unknown}"; BARB="${BARB:-unknown}"

  # Lane reports -> blocked / deferred counts.
  local LANES=0 BLOCKED='[]' OOS=0
  local r
  for r in "${REPORTS[@]:-}"; do
    [ -n "$r" ] && [ -f "$r" ] || continue
    jq -e . "$r" >/dev/null 2>&1 || { echo "run-ledger: skip unparseable report $r" >&2; continue; }
    LANES=$((LANES + 1))
    local b; b="$(jq -r '.blocked_on // empty' "$r")"
    [ -n "$b" ] && BLOCKED="$(jq -cn --argjson a "$BLOCKED" --arg lane "$(jq -r '.lane // "?"' "$r")" --arg b "$b" '$a + [{lane:$lane,reason:$b}]')"
    OOS=$((OOS + $(jq '(.out_of_scope_needs // []) | length' "$r")))
  done
  local BLOCKED_N SPEC_GAP_N
  BLOCKED_N="$(echo "$BLOCKED" | jq 'length')"
  SPEC_GAP_N="$(echo "$BLOCKED" | jq --arg re "$SPEC_GAP_RE" '[.[] | select(.reason | test($re; "i"))] | length')"

  # Amendments from the run plan; Produces symbols from the PLAN steps table.
  local AMEND='[]'
  [ -f "$RUNPLAN" ] && AMEND="$(jq -c '.amendments // []' "$RUNPLAN" 2>/dev/null || echo '[]')"
  local AMEND_N; AMEND_N="$(echo "$AMEND" | jq 'length')"

  local PLAN="$PDIR/PLAN_${SLUG}.md" PRODUCES='[]'
  if [ -f "$PLAN" ]; then
    # Column index of "Produces" in the steps table header, then every
    # `<path>:<symbol>` in that column -> bare symbol names.
    PRODUCES="$(awk -F'|' '
      /^\|/ && tolower($0) ~ /produces/ && col==0 { for(i=1;i<=NF;i++) if($i ~ /Produces/) col=i; next }
      col>0 && /^\|/ && $2 !~ /^ *-+ *$/ { print $col }
    ' "$PLAN" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | grep -v '^-*$' | sed 's/.*://' | grep -E '^[A-Za-z_][A-Za-z0-9_]{2,}$' | sort -u | jq -R . | jq -sc .)"
  fi
  local TOUCHED
  TOUCHED="$(jq -cn --argjson a "$AMEND" --argjson p "$PRODUCES" '
    [ $p[] as $s | select( any($a[]; ((.what // "") + " " + (.why // "")) | test("\\b" + $s + "\\b")) ) | $s ] | unique')"
  local TOUCHED_N; TOUCHED_N="$(echo "$TOUCHED" | jq 'length')"

  local TS; TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local ROW
  ROW="$(jq -cn \
    --arg ts "$TS" --arg project "$(basename "$PROJECT_ROOT")" --arg slug "$SLUG" \
    --arg tier "$TIER" --arg barb "$BARB" --arg outcome "$OUTCOME" \
    --argjson lanes "$LANES" --argjson iter "$ITER" \
    --argjson blocked_n "$BLOCKED_N" --argjson blocked "$BLOCKED" --argjson gaps "$SPEC_GAP_N" \
    --argjson oos "$OOS" --argjson amend_n "$AMEND_N" --argjson touched_n "$TOUCHED_N" --argjson touched "$TOUCHED" '
    {ts:$ts, project:$project, slug:$slug, tier:$tier, bar_b_tier:$barb, outcome:$outcome,
     lanes:$lanes, iterations:$iter,
     blocked_on_count:$blocked_n, spec_gap_count:$gaps, blocked_reasons:$blocked,
     out_of_scope_count:$oos,
     amendment_count:$amend_n, amendments_touching_produces:$touched_n, produces_touched:$touched}')"

  mkdir -p "$(dirname "$LEDGER")"
  printf '%s\n' "$ROW" >> "$LEDGER"

  echo "run-ledger: slug=$SLUG tier=$TIER bar_b_tier=$BARB outcome=$OUTCOME iterations=$ITER lanes=$LANES blocked_on=$BLOCKED_N spec_gap=$SPEC_GAP_N out_of_scope=$OOS amendments=$AMEND_N amendments_touching_produces=$TOUCHED_N"
  if [ "$BARB" = "sonnet" ] && [ "$SPEC_GAP_N" -gt 0 ]; then
    echo "FLAG: bar_b_tier=sonnet and $SPEC_GAP_N spec-gap block(s) this run: the plan step did not pin WHAT. Re-gate this plan with --bar-b=full (megaplan Step 7) before the next iteration; check \`run-ledger.sh stats\` for a trend."
    echo "$BLOCKED" | jq -r --arg re "$SPEC_GAP_RE" '.[] | select(.reason | test($re; "i")) | "  - \(.lane): \(.reason)"'
  fi
  if [ "$TOUCHED_N" -gt 0 ]; then
    echo "FLAG: $TOUCHED_N amendment(s) touch a Produces symbol ($(echo "$TOUCHED" | jq -r 'join(", ")')): a HOW change to an exported symbol is a WHAT change for its consumers. Run bars/check-produce-consume.sh $PLAN and re-check the Consumes side."
  fi
  echo "ledger: $LEDGER"
}

# ---------------- stats ----------------
cmd_stats() {
  local SLUG="" LAST=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --slug) SLUG="${2:-}"; shift 2 ;;
      --last) LAST="${2:-}"; shift 2 ;;
      *) die2 "unknown stats arg: $1" ;;
    esac
  done
  need jq
  [ -f "$LEDGER" ] || { echo '[]'; return 0; }
  local src="cat"
  [ -n "$LAST" ] && src="tail -n $LAST"
  $src "$LEDGER" | jq -sc --arg slug "$SLUG" '
    [ .[] | select($slug == "" or .slug == $slug) ]
    | group_by(.bar_b_tier)
    | map({
        bar_b_tier: .[0].bar_b_tier,
        runs: length,
        done: ([.[] | select(.outcome=="done")] | length),
        mean_iterations: (([.[].iterations] | add) / length),
        spec_gap_runs: ([.[] | select(.spec_gap_count > 0)] | length),
        spec_gap_total: ([.[].spec_gap_count] | add),
        amendment_total: ([.[].amendment_count] | add),
        amendments_touching_produces: ([.[].amendments_touching_produces] | add)
      })'
}

case "${1:-}" in
  record) shift; cmd_record "$@" ;;
  stats)  shift; cmd_stats "$@" ;;
  *) usage ;;
esac
