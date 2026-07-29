#!/usr/bin/env bash
# .claude/skills/cfn-decisions/hook.sh - coordinator->writer bridge (DRY + D-8).
#
# Wraps record.sh for the 3 FR-7 hook sites in cfn-loop-task.md:
#   --site phase-4.2-po          (Phase 4.2 product-owner 2/3, actor=ai)
#   --site phase-5-batch         (Phase 5 user-batch 1/3, actor=human)
#   --site phase-5E.4-quarantine (Phase 5E.4 quarantine, actor=human)
# The 3 inline call sites were byte-identical except --actor/--blocking; this
# wrapper is the single source (DRY: extract on the 2nd occurrence, code-quality.md).
#
# Contract:
#   - Forwards every record.sh flag through verbatim EXCEPT --site (consumed here;
#     record.sh has no --site flag and would exit 2 on it).
#   - --site <label> tags the log line so RUN_LOG shows which hook fired (OBS-4).
#   - D-8 isolation: writer non-zero exit -> log WARN, hook exits 0 (loop continues).
#     A missing ledger row is a coverage gap, not a wrong decision; the hook NEVER
#     propagates a writer failure.
#   - Writer stdout is discarded (>/dev/null); writer stderr -> $RUN_LOG. The hook
#     appends ONE summary line to $RUN_LOG:
#       success: "<site> decisions.ledger <id> ok (0)"
#       failure: "WARN: <site> decisions.ledger <id> failed (rc=<n>, isolated, continuing)"
#
# Usage (mirrors the inline sites it replaces):
#   RUN_LOG="$RUN_LOG" bash .claude/skills/cfn-decisions/hook.sh \
#     --site phase-4.2-po \
#     --slug "$SLUG" --id "$DEC_ID" --title "$DEC_TITLE" --chosen "$DEC_CHOSEN" \
#     --actor ai --rationale "$DEC_RATIONALE" --alternatives "$DEC_ALTS" \
#     --status "$DEC_STATUS" --blocking "$DEC_BLOCKING"
#
# Exit: always 0 (D-8 isolation). A future caller that needs to detect a silent
# ledger gap can grep $RUN_LOG for "failed (rc=".
# cfn: always-exit-0 isolation, surface ledger gaps via RUN_LOG scan if a caller ever needs to gate on them

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRITER="$SCRIPT_DIR/record.sh"

SITE="unspecified"
DEC_ID="(unset)"
FORWARD=()

while [ $# -gt 0 ]; do
  case "$1" in
    --site)
      SITE="${2:-unspecified}"
      shift 2
      ;;
    --id)
      DEC_ID="${2:-(unset)}"
      FORWARD+=(--id "$2")
      shift 2
      ;;
    *)
      FORWARD+=("$1")
      shift
      ;;
  esac
done

RUN_LOG="${RUN_LOG:-/tmp/decisions-ledger-unknown.log}"

# FR-7 SITE hook: invoke the writer, isolate its RC (D-8).
if bash "$WRITER" "${FORWARD[@]}" >/dev/null 2>>"$RUN_LOG"; then
  printf '%s decisions.ledger %s ok (0)\n' "$SITE" "$DEC_ID" >>"$RUN_LOG"
  exit 0
else
  RC=$?
  printf 'WARN: %s decisions.ledger %s failed (rc=%d, isolated, continuing)\n' \
    "$SITE" "$DEC_ID" "$RC" >>"$RUN_LOG"
  exit 0
fi
