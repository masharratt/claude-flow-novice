#!/usr/bin/env bash
# deferrals.sh — promotes lane out_of_scope_needs into a blocking side-manifest
# (S006, origin: ROOTCAUSE_mpa_thread_wiring_gap.md).
#
# out_of_scope_needs was required in every lane's final-message JSON but had
# ZERO consumers: no reference in Phase 3, Phase 4's gate matrix, Phase 5's
# exit gate, verify-run.sh, gate-check.sh, or any bar. A lane could correctly
# flag a cross-lane wiring gap in out_of_scope_needs and the loop would still
# declare all_green — that is exactly how MP-A shipped a feature 81/81 green
# while completely unreachable from src/index.ts (the implementer flagged the
# unfinished S23 postCard->postInThread reroute in out_of_scope_needs; nothing
# downstream ever read it).
#
# Side-manifest, NOT the VERIFY manifest: appending promoted ACs into
# VERIFY_<slug>.md would trip the sha256 sidecar check (verify-run.sh:93-103,
# exit 4) — that hash covers only VERIFY_<slug>.md. planning/.DEFERRALS_<slug>.json
# is a separate file the sidecar never sees, so recording deferrals mid-loop
# never trips the manifest integrity gate and never re-blesses it either.
#
# Subcommands:
#   record  --slug <slug> --lane <lane-id> --json <lane-report-json-or-file>
#     Extracts that lane's `out_of_scope_needs` array (Final Message Contract
#     field, agent-prelude.md) and (re)writes that lane's block in
#     planning/.DEFERRALS_<slug>.json. Idempotent: re-recording the same lane
#     REPLACES its prior entries, never duplicates them. A lane that reports
#     an empty array clears its own prior block.
#   gate    --slug <slug>
#     Exit 0 if no OPEN blocking deferrals remain; exit 1 (offenders printed
#     to stderr) otherwise. Missing file = exit 0 (nothing was ever deferred).
#   resolve --slug <slug> --id <n> --reason <text>
#     Closes one deferral by id. Refuses an empty/whitespace-only reason.
#
# Env: CFN_DEFERRALS_DIR  overrides the storage root (default: PROJECT_ROOT/planning).
#      Mirrors the CFN_VERIFY_* override pattern in verify-run.sh; lets tests
#      point at an isolated tmp dir instead of the repo's real planning/ dir.
#
# Exit: 0 = success / gate clear
#       1 = gate found one or more open blocking deferrals
#       2 = usage / parse / file error
set -euo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
DEFERRALS_DIR="${CFN_DEFERRALS_DIR:-$PROJECT_ROOT/planning}"

die2() { echo "{\"error\":\"$1\"}" >&2; exit 2; }
need() { command -v "$1" >/dev/null 2>&1 || die2 "$1 not found on PATH"; }

now_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

deferrals_file() { echo "$DEFERRALS_DIR/.DEFERRALS_$1.json"; }

# ---------------- record ----------------
cmd_record() {
  local SLUG="" LANE="" JSONARG=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --slug) SLUG="${2:-}"; shift 2 ;;
      --lane) LANE="${2:-}"; shift 2 ;;
      --json) JSONARG="${2:-}"; shift 2 ;;
      *) die2 "unknown record arg: $1" ;;
    esac
  done
  [ -n "$SLUG" ] || die2 "record requires --slug"
  [ -n "$LANE" ] || die2 "record requires --lane"
  [ -n "$JSONARG" ] || die2 "record requires --json"
  need jq

  local report_json
  if [ -f "$JSONARG" ]; then
    report_json="$(cat "$JSONARG")"
  else
    report_json="$JSONARG"
  fi
  echo "$report_json" | jq -e . >/dev/null 2>&1 || die2 "lane report json does not parse"

  local needs
  needs="$(echo "$report_json" | jq -c '.out_of_scope_needs // []')"
  echo "$needs" | jq -e 'type == "array"' >/dev/null 2>&1 || die2 "out_of_scope_needs must be an array"

  local file; file="$(deferrals_file "$SLUG")"
  mkdir -p "$(dirname "$file")"

  local doc
  if [ -f "$file" ]; then
    doc="$(cat "$file")"
  else
    doc="$(jq -cn --arg slug "$SLUG" '{slug:$slug,next_id:1,deferrals:[]}')"
  fi

  local start_id
  start_id="$(echo "$doc" | jq '.next_id // 1')"

  local ts; ts="$(now_ts)"
  local new_entries="[]"
  local count; count="$(echo "$needs" | jq 'length')"
  local i=0 nid="$start_id"
  # BLOCKING RULE (fail closed): classifying free text as "names a step another
  # lane owed" vs. "genuinely out of scope for the whole task" is not reliably
  # mechanizable in bash, so every recorded deferral defaults to blocking:true.
  # The only way to clear one is the explicit `resolve` subcommand below.
  # cfn: every deferral blocks regardless of content, upgrade to a text
  # classifier (or a lane-supplied `blocking` hint field on the deferral text)
  # if false-positive blocking on genuinely-external deferrals gets noisy.
  while [ "$i" -lt "$count" ]; do
    local text
    text="$(echo "$needs" | jq -r ".[$i]")"
    new_entries="$(echo "$new_entries" | jq \
      --arg lane "$LANE" --arg text "$text" --argjson id "$nid" --arg ts "$ts" \
      '. + [{id:$id,lane:$lane,text:$text,blocking:true,status:"open",resolved_reason:null,recorded_at:$ts,resolved_at:null}]')"
    nid=$((nid + 1))
    i=$((i + 1))
  done

  doc="$(echo "$doc" | jq \
    --arg lane "$LANE" --argjson new "$new_entries" --argjson next_id "$nid" '
    .deferrals |= [ .[] | select(.lane != $lane) ]
    | .deferrals += $new
    | .next_id = $next_id
  ')"

  local tmp; tmp="$(mktemp)"; printf '%s\n' "$doc" > "$tmp"; mv "$tmp" "$file"

  local recorded total open_blocking
  recorded="$count"
  total="$(echo "$doc" | jq '.deferrals | length')"
  open_blocking="$(echo "$doc" | jq '[.deferrals[] | select(.blocking == true and .status == "open")] | length')"
  jq -cn --arg slug "$SLUG" --arg lane "$LANE" --argjson recorded "$recorded" \
    --argjson total "$total" --argjson open_blocking "$open_blocking" \
    '{slug:$slug,lane:$lane,recorded:$recorded,total_deferrals:$total,open_blocking:$open_blocking}'
}

# ---------------- gate ----------------
cmd_gate() {
  local SLUG=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --slug) SLUG="${2:-}"; shift 2 ;;
      *) die2 "unknown gate arg: $1" ;;
    esac
  done
  [ -n "$SLUG" ] || die2 "gate requires --slug"
  need jq

  local file; file="$(deferrals_file "$SLUG")"
  if [ ! -f "$file" ]; then
    jq -cn --arg slug "$SLUG" '{slug:$slug,open_blocking:0,offenders:[]}'
    exit 0
  fi

  local doc; doc="$(cat "$file")"
  local offenders
  offenders="$(echo "$doc" | jq -c '[.deferrals[] | select(.blocking == true and .status == "open")]')"
  local n; n="$(echo "$offenders" | jq 'length')"

  jq -cn --arg slug "$SLUG" --argjson n "$n" --argjson offenders "$offenders" \
    '{slug:$slug,open_blocking:$n,offenders:$offenders}'

  if [ "$n" -eq 0 ]; then
    exit 0
  fi

  echo "BLOCKING DEFERRALS (open_blocking=$n) for slug=$SLUG:" >&2
  echo "$offenders" | jq -r '.[] | "  [id=\(.id)] lane=\(.lane): \(.text)"' >&2
  echo "Resolve with: deferrals.sh resolve --slug $SLUG --id <n> --reason <text>" >&2
  exit 1
}

# ---------------- resolve ----------------
cmd_resolve() {
  local SLUG="" ID="" REASON=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --slug)   SLUG="${2:-}"; shift 2 ;;
      --id)     ID="${2:-}"; shift 2 ;;
      --reason) REASON="${2:-}"; shift 2 ;;
      *) die2 "unknown resolve arg: $1" ;;
    esac
  done
  [ -n "$SLUG" ] || die2 "resolve requires --slug"
  [ -n "$ID" ] || die2 "resolve requires --id"
  echo "$ID" | grep -qE '^[0-9]+$' || die2 "resolve --id must be a non-negative integer"
  local reason_trimmed
  reason_trimmed="$(printf '%s' "$REASON" | tr -d '[:space:]')"
  [ -n "$reason_trimmed" ] || die2 "resolve --reason must not be empty or whitespace-only"
  need jq

  local file; file="$(deferrals_file "$SLUG")"
  [ -f "$file" ] || die2 "no deferrals file for slug: $SLUG"

  jq -e --argjson id "$ID" 'any(.deferrals[]; .id == $id)' "$file" >/dev/null 2>&1 \
    || die2 "deferral id $ID not found for slug $SLUG"

  local ts; ts="$(now_ts)"
  local doc
  doc="$(jq --argjson id "$ID" --arg reason "$REASON" --arg ts "$ts" '
    .deferrals |= map(if .id == $id then
        .status = "resolved" | .resolved_reason = $reason | .resolved_at = $ts
      else . end)
  ' "$file")"

  local tmp; tmp="$(mktemp)"; printf '%s\n' "$doc" > "$tmp"; mv "$tmp" "$file"

  jq -cn --arg slug "$SLUG" --argjson id "$ID" '{slug:$slug,id:$id,status:"resolved"}'
  exit 0
}

SUB="${1:-}"; shift || true
case "$SUB" in
  record)  cmd_record "$@" ;;
  gate)    cmd_gate "$@" ;;
  resolve) cmd_resolve "$@" ;;
  *) echo "usage: deferrals.sh {record|gate|resolve} ..." >&2; exit 2 ;;
esac
