#!/usr/bin/env bash
# lib/arg-parse.sh - OP-W1 parse_and_validate_args + OP-W1b refuse_on_missing.
#
# Sourced by record.sh. Exposes two functions:
#   parse_and_validate_args argv    - long-flag CLI parse + enum/value checks.
#                                    Exits 2 (E_CLI_PARSE) on bad input.
#   refuse_on_missing_or_invalid    - first-missing-field gate (FR-3).
#                                    Exits 1 (E_VALIDATION) on missing/empty
#                                    required field.
#
# Pattern reused verbatim from .claude/skills/cfn-megaplan/bars/bless-verify.sh
# (first-missing-field rule). Re-implemented because cross-skill bash helpers
# are not imported (skills CLAUDE.md "Minimal Dependencies").
#
# On success: sets the caller-scoped globals used by jq-build / upsert /
# sink-delegate:
#   SLUG DEC_ID TITLE CHOSEN ACTOR
#   RATIONALE ALTS STATUS ITERATION BLOCKING_BOOL TIMESTAMP ROOT

# parse_and_validate_args - consumes argv, applies FR-10 defaults, validates.
# Sets globals on success; exits 2 on bad flag/enum/value.
parse_and_validate_args() {
  # Apply FR-10 defaults FIRST so explicit caller values override below.
  SLUG=""
  DEC_ID=""
  TITLE=""
  CHOSEN=""
  ACTOR=""
  RATIONALE=""
  ALTS=""
  STATUS="proposed"
  ITERATION="1"
  BLOCKING_BOOL="false"
  TIMESTAMP=""  # empty sentinel; default computed AFTER parse
  ROOT=""       # empty sentinel; default computed AFTER parse

  while [ $# -gt 0 ]; do
    case "$1" in
      --slug)         SLUG="${2:-}"; shift 2 ;;
      --id)           DEC_ID="${2:-}"; shift 2 ;;
      --title)        TITLE="${2:-}"; shift 2 ;;
      --chosen)       CHOSEN="${2:-}"; shift 2 ;;
      --actor)        ACTOR="${2:-}"; shift 2 ;;
      --rationale)    RATIONALE="${2:-}"; shift 2 ;;
      --alternatives) ALTS="${2:-}"; shift 2 ;;
      --status)       STATUS="${2:-}"; shift 2 ;;
      --iteration)    ITERATION="${2:-}"; shift 2 ;;
      --blocking)     BLOCKING_BOOL="${2:-}"; shift 2 ;;
      --timestamp)    TIMESTAMP="${2:-}"; shift 2 ;;
      --root)         ROOT="${2:-}"; shift 2 ;;
      --help|-h)      print_help; exit "$E_OK" ;;
      # Reject flags (FR-8): --delete/--remove/--purge/--supersede are NOT
      # exposed. They fall through to the unknown-arg branch below with the
      # canonical "unknown arg:" message.
      *) printf 'unknown arg: %s\n' "$1" >&2; exit "$E_CLI_PARSE" ;;
    esac
  done

  # Apply post-parse defaults for empty sentinels.
  [ -z "$TIMESTAMP" ] && TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  [ -z "$ROOT" ] && ROOT="$(pwd)/planning"

  # EC-19: caller-supplied --timestamp must match the ISO 8601 UTC pattern.
  # Plain string match via grep -E (no regex partial-match surprises).
  if ! printf '%s' "$TIMESTAMP" | grep -qE \
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$'; then
    printf 'timestamp must be ISO 8601 UTC like 2026-07-28T14:00:00Z\n' >&2
    exit "$E_CLI_PARSE"
  fi

  # FR-10 actor enum: human|ai.
  case "$ACTOR" in
    human|ai) : ;;
    "") : ;;  # missing-actor handled by refuse_on_missing_or_invalid below
    *) printf 'actor must be human|ai\n' >&2; exit "$E_CLI_PARSE" ;;
  esac

  # FR-10 status enum: proposed|accepted|superseded.
  case "$STATUS" in
    proposed|accepted|superseded) : ;;
    *) printf 'status must be proposed|accepted|superseded\n' >&2; \
       exit "$E_CLI_PARSE" ;;
  esac

  # FR-10 iteration: ^[0-9]+$ (EC-5: 0 and 2147483647 both accepted).
  if ! printf '%s' "$ITERATION" | grep -qE '^[0-9]+$'; then
    printf 'iteration must be a non-negative integer\n' >&2
    exit "$E_CLI_PARSE"
  fi

  # FR-10 blocking: literal true|false.
  case "$BLOCKING_BOOL" in
    true|false) : ;;
    *) printf 'blocking must be true|false\n' >&2; exit "$E_CLI_PARSE" ;;
  esac

  # EC-19 already validated timestamp shape above. Slug regex check (SPEC §5
  # precondition) is part of refuse_on_missing_or_invalid since an empty slug
  # is also a missing-field failure (FR-3 takes precedence over the regex).
  return 0
}

# refuse_on_missing_or_invalid - first-missing-field rule (FR-3).
# Iterates the fixed order [SLUG, DEC_ID, TITLE, CHOSEN, ACTOR]. Exits 1
# (E_VALIDATION) on the FIRST empty/whitespace-only field, naming the field
# in stderr WITHOUT echoing the supplied value (FR-9 leak floor).
refuse_on_missing_or_invalid() {
  # _is_blank <value> - 0 if non-empty after trim, 1 if blank.
  # xargs with no args strips leading/trailing whitespace safely.
  _is_blank() {
    local trimmed
    trimmed="$(printf '%s' "$1" | xargs echo 2>/dev/null || true)"
    [ -z "$trimmed" ]
  }

  # Fixed field order per ARCH §2.1.
  if _is_blank "$SLUG"; then
    printf 'missing required field: slug\n' >&2; exit "$E_VALIDATION"
  fi
  if _is_blank "$DEC_ID"; then
    printf 'missing required field: id\n' >&2; exit "$E_VALIDATION"
  fi
  if _is_blank "$TITLE"; then
    printf 'missing required field: title\n' >&2; exit "$E_VALIDATION"
  fi
  if _is_blank "$CHOSEN"; then
    printf 'missing required field: chosen\n' >&2; exit "$E_VALIDATION"
  fi
  if _is_blank "$ACTOR"; then
    printf 'missing required field: actor\n' >&2; exit "$E_VALIDATION"
  fi

  # Slug regex (SPEC §5 precondition) - checked AFTER the missing-field rule
  # so FR-3 (missing) takes precedence over the regex (parse error).
  if ! printf '%s' "$SLUG" | grep -qE '^[a-z0-9][a-z0-9_-]{0,59}$'; then
    printf 'slug must match ^[a-z0-9][a-z0-9_-]{0,59}$\n' >&2
    exit "$E_VALIDATION"
  fi

  return 0
}
