#!/usr/bin/env bash
# validate-content.sh - OP-W1c content gate for record.sh (writer).
#
# A decision with no recorded rejected option is a note, not a decision.
# Audit 2026-09-24: 452 of 1,548 ledger rows (29%) record no alternative,
# and 15 have neither rationale nor alternatives. This gate stops new rows
# in that shape at the writer, before the JSON ledger and the SQLite sink.
#
# Rule: STATUS=accepted requires EITHER a non-empty --alternatives OR a
# --rationale containing the literal label "no fork:" (case-insensitive),
# which marks the row as an honest single-viable-option record.
# STATUS=proposed (review queue) and superseded (historical replacements)
# are exempt.
#
# Exits 1 (E_VALIDATION) naming the missing piece on stderr. Sourced by
# record.sh; runs in the caller's shell, so it sets nothing.

validate_decision_content() {
  [ "$STATUS" = "accepted" ] || return 0

  if [ -n "${ALTS:-}" ]; then
    return 0
  fi

  case "$(printf '%s' "${RATIONALE:-}" | tr '[:upper:]' '[:lower:]')" in
    *"no fork:"*) return 0 ;;
  esac

  printf 'error: accepted decision requires --alternatives, or a rationale naming the single-viable-option case via "no fork: <why>"\n' >&2
  printf '       (a decision with no recorded rejected option is a note, not a decision)\n' >&2
  return 1
}
