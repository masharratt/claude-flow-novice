#!/bin/bash
# emit-event.sh - append one CFN Loop lifecycle event for cfn-workbench's live
# events feed (lib/section-events.sh).
#
# Appends a single compact JSON line to /tmp/cfn-events-<slug>.jsonl (or
# --file, tests use it). Never fails the caller's flow on a good invocation;
# bad usage (unknown event type, missing required arg) exits 2 so callers
# catch typos, but every orchestrator call site wraps this with `|| true`.
#
# Bash + jq only.

set -euo pipefail

SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

# Closed event-type set. Keep in sync with workbench-live-contracts.md F4 and
# the orchestrator wiring in .claude/commands/cfn-loop-task.md.
VALID_EVENTS="loop_started phase_started lane_spawned lane_landed gate_started gate_verdict patch_applied verify_started loop_finished"

usage() {
  cat <<EOF
Usage: emit-event.sh --slug <slug> --event <type> [options]

Appends one compact JSON event line to the run's live events feed, read by
cfn-workbench's Events section (lib/section-events.sh).

Required:
  --slug <slug>      Run slug (matches the events file name).
  --event <type>      One of: ${VALID_EVENTS}

Optional:
  --lane <id>         Lane id this event concerns.
  --phase <p>         Phase label (e.g. "Phase 2").
  --detail <text>     Free-text detail (e.g. "pass_rate=100%").
  --file <path>       Override output path. Default: /tmp/cfn-events-<slug>.jsonl

Exit codes:
  0  success
  2  usage error (missing --slug/--event, or --event not in the closed set)
EOF
}

SLUG=""
EVENT=""
LANE=""
PHASE=""
DETAIL=""
FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)
      [[ $# -lt 2 ]] && { echo "Error: --slug requires a value" >&2; usage >&2; exit 2; }
      SLUG="$2"; shift 2 ;;
    --event)
      [[ $# -lt 2 ]] && { echo "Error: --event requires a value" >&2; usage >&2; exit 2; }
      EVENT="$2"; shift 2 ;;
    --lane)
      [[ $# -lt 2 ]] && { echo "Error: --lane requires a value" >&2; usage >&2; exit 2; }
      LANE="$2"; shift 2 ;;
    --phase)
      [[ $# -lt 2 ]] && { echo "Error: --phase requires a value" >&2; usage >&2; exit 2; }
      PHASE="$2"; shift 2 ;;
    --detail)
      [[ $# -lt 2 ]] && { echo "Error: --detail requires a value" >&2; usage >&2; exit 2; }
      DETAIL="$2"; shift 2 ;;
    --file)
      [[ $# -lt 2 ]] && { echo "Error: --file requires a value" >&2; usage >&2; exit 2; }
      FILE="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    --*)
      echo "Error: unknown option: $1" >&2; usage >&2; exit 2 ;;
    *)
      echo "Error: unexpected positional argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$SLUG" ]]; then
  echo "Error: --slug is required" >&2
  usage >&2
  exit 2
fi

if [[ -z "$EVENT" ]]; then
  echo "Error: --event is required" >&2
  usage >&2
  exit 2
fi

valid=0
for e in $VALID_EVENTS; do
  [[ "$e" == "$EVENT" ]] && { valid=1; break; }
done
if [[ "$valid" -ne 1 ]]; then
  echo "Error: unknown event type: $EVENT (expected one of: ${VALID_EVENTS})" >&2
  usage >&2
  exit 2
fi

[[ -z "$FILE" ]] && FILE="/tmp/cfn-events-${SLUG}.jsonl"

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

LINE="$(jq -nc \
  --arg ts "$TS" \
  --arg event "$EVENT" \
  --arg lane "$LANE" \
  --arg phase "$PHASE" \
  --arg detail "$DETAIL" \
  '{ts: $ts, event: $event}
   + (if $lane   != "" then {lane: $lane}     else {} end)
   + (if $phase  != "" then {phase: $phase}   else {} end)
   + (if $detail != "" then {detail: $detail} else {} end)')"

printf '%s\n' "$LINE" >> "$FILE"
exit 0
