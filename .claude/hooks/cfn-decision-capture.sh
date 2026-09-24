#!/usr/bin/env bash
# cfn-decision-capture.sh - PostToolUse hook for AskUserQuestion.
#
# Every answered AskUserQuestion lands as one JSONL line in the decision
# capture staging file. Curation happens later: cfn-decisions/promote-capture.sh
# promotes lines into the formal decisions ledger. Capturing everything keeps
# the hook dumb; the ledger stays curated.
#
# Claude Code feeds PostToolUse hooks the tool call as JSON on stdin:
#   { "session_id": ..., "cwd": ..., "tool_name": "AskUserQuestion",
#     "tool_input":  { "questions": [ { "question": ..., "header": ... }, ... ] },
#     "tool_response": { "answers": { "<question text>": "<chosen label>" },
#                        "annotations": { "<question text>": { "notes": ... } } } }
#
# Isolation contract (mirrors cfn-decisions D-8): this hook NEVER fails the
# tool call. Any error -> exit 0. A lost capture is a coverage gap, not a
# broken prompt.
#
# Staging file override for tests: CFN_DECISION_CAPTURE_FILE (default
# $HOME/.claude/cfn-data/decision-capture.jsonl).

set -uo pipefail

STAGING="${CFN_DECISION_CAPTURE_FILE:-$HOME/.claude/cfn-data/decision-capture.jsonl}"

main() {
  command -v jq >/dev/null 2>&1 || return 0

  local input
  input="$(cat)" || return 0
  [ -n "$input" ] || return 0

  # Only capture AskUserQuestion calls.
  [ "$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)" = "AskUserQuestion" ] || return 0

  local ts project sid
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  project="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null | xargs -r basename 2>/dev/null)"
  sid="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)"

  local dir
  dir="$(dirname "$STAGING")"
  mkdir -p "$dir" 2>/dev/null || return 0

  # One line per question; answers keyed by question text. Unchosen option
  # labels are stored as the alternatives candidate list so promotions can
  # file real rejected options (the writer's content gate requires them for
  # accepted rows).
  printf '%s' "$input" | jq -c --arg ts "$ts" --arg project "$project" --arg sid "$sid" '
    .tool_response.answers as $ans
    | .tool_response.annotations as $ann
    | .tool_input.questions[]?
    | ($ans[.question] // "") as $chosen
    | {
        ts: $ts,
        project: $project,
        session_id: $sid,
        question: .question,
        header: (.header // ""),
        answer: $chosen,
        alternatives: ([(.options // [])[] | (.label // empty) | select(. != $chosen and . != "")] | join(", ")),
        notes: ($ann[.question].notes // "")
      }' 2>/dev/null >> "$STAGING" || return 0

  return 0
}

main
exit 0
