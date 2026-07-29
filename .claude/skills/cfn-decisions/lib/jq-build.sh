#!/usr/bin/env bash
# lib/jq-build.sh - OP-W2 build_decision_object.
#
# Sourced by record.sh. Exposes:
#   build_decision_object - builds ENTRY via jq -n --arg/--argjson.
#
# Pattern reused from .claude/skills/cfn-megaplan/bars/bless-verify.sh:137-141.
# NEVER string-concatenate JSON (FR-6): --arg escapes every untrusted string,
# so hostile-input payloads (EC-13 comma-injection, EC-14 XSS+SQL, EC-21
# unicode, EC-22 em dash, EC-4 10k chars) persist as flat string values.
#
# On jq exit non-zero OR ENTRY fails `jq empty`: exit 3 (E_JQ_BUILD). This
# codepath is defensive / near-unreachable because --arg escapes everything.
# The static source-grep (AC-21) is the contract; runtime triggers are
# limited to a corrupted jq binary.

# build_decision_object - echoes ENTRY JSON to stdout; exits 3 on jq failure.
# Reads caller-scoped globals set by parse_and_validate_args.
build_decision_object() {
  local entry
  if ! entry="$(jq -n \
      --arg id           "$DEC_ID" \
      --arg actor        "$ACTOR" \
      --arg title        "$TITLE" \
      --arg chosen       "$CHOSEN" \
      --arg rationale    "$RATIONALE" \
      --arg alternatives "$ALTS" \
      --arg status       "$STATUS" \
      --arg timestamp    "$TIMESTAMP" \
      --argjson iteration "$ITERATION" \
      --argjson blocking  "$BLOCKING_BOOL" \
      '{
        id: $id,
        actor: $actor,
        title: $title,
        chosen: $chosen,
        rationale: $rationale,
        alternatives: $alternatives,
        iteration: $iteration,
        blocking: $blocking,
        timestamp: $timestamp,
        status: $status
      }')"; then
    printf 'internal: jq failed to build decision object\n' >&2
    exit "$E_JQ_BUILD"
  fi

  # Defensive: if jq produced something that is not valid JSON (would only
  # happen with a broken jq binary or a near-unreachable jq bug), exit 3.
  if ! printf '%s' "$entry" | jq empty 2>/dev/null; then
    printf 'internal: jq failed to build decision object\n' >&2
    exit "$E_JQ_BUILD"
  fi

  printf '%s' "$entry"
}
