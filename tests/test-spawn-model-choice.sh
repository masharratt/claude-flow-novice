#!/usr/bin/env bash
# Model-choice branch of cfn-spawn-depth-guard.sh (rule 3).
# Origin: 2026-10-08 token report. general-purpose helpers spawned with no
# model inherit the main chat's model (Opus): 2,710 replies and 2.0M output
# tokens in one week, mostly routine fixture and e2e work. Rule: the
# orchestrator names a model on every spawn of a profile-less type, and every
# main-chat spawn announces its model so the choice is visible.
# Isolation: temp agent dirs via HOME/CLAUDE_PROJECT_DIR; never reads real $HOME.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD="$ROOT/.claude/hooks/cfn-spawn-depth-guard.sh"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/modelchoice-test-XXXXXX")
export HOME="$TMP/home" CLAUDE_PROJECT_DIR="$TMP/proj"
export CFN_BRIEF_WARN_LOG="$TMP/warn.log"
unset CFN_MODEL_CHOICE CFN_MODEL_CHOICE_TYPES CFN_BRIEF_GUARD CFN_BRIEF_MAX_BYTES 2>/dev/null || true
mkdir -p "$HOME/.claude/agents/team" "$CLAUDE_PROJECT_DIR/.claude/agents"
printf -- '---\nname: code-reviewer\nmodel: haiku\n---\nbody\n' > "$HOME/.claude/agents/team/code-reviewer.md"
printf -- '---\nname: local-helper\nmodel: opus\n---\nbody\n' > "$CLAUDE_PROJECT_DIR/.claude/agents/local-helper.md"
printf -- '---\nname: no-model-agent\n---\nbody\n' > "$HOME/.claude/agents/team/no-model-agent.md"

PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }
trap 'rm -rf "$TMP"' EXIT

payload(){ # $1 = tool_input JSON fragment
  printf '{"hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"description":"Fix fixtures","prompt":"do it"%s}}' "$1"
}
run(){ printf '%s' "$1" | bash "$GUARD" >"$TMP/out.txt" 2>"$TMP/err.txt"; echo $?; }
has(){ grep -q -- "$2" "$TMP/$1"; }

echo "## orchestrator must choose for general-purpose"
RC=$(run "$(payload ',"subagent_type":"general-purpose"')")
[ "$RC" = 2 ] && ok "general-purpose without model is refused" || no "rc=$RC wanted 2"
has err.txt "sonnet" && has err.txt "opus" && ok "refusal explains the choice" || no "refusal text: $(cat "$TMP/err.txt")"
RC=$(run "$(payload '')")
[ "$RC" = 2 ] && ok "omitted subagent_type (defaults to general-purpose) is refused" || no "rc=$RC wanted 2"
RC=$(run "$(payload ',"subagent_type":"claude"')")
[ "$RC" = 2 ] && ok "catch-all 'claude' type without model is refused" || no "rc=$RC wanted 2"

echo "## chosen model passes and is announced"
RC=$(run "$(payload ',"subagent_type":"general-purpose","model":"sonnet"')")
[ "$RC" = 0 ] && ok "general-purpose with model passes" || no "rc=$RC wanted 0"
[ "$(jq -r '.systemMessage' "$TMP/out.txt" 2>/dev/null)" = "Helper 'Fix fixtures' (general-purpose): sonnet, chosen by orchestrator" ] \
  && ok "announcement names helper, type, model, source" || no "announcement: $(cat "$TMP/out.txt")"

echo "## profile-pinned types pass and announce the profile model"
RC=$(run "$(payload ',"subagent_type":"code-reviewer"')")
[ "$RC" = 0 ] && ok "profile type without model passes" || no "rc=$RC wanted 0"
jq -r '.systemMessage' "$TMP/out.txt" | grep -q "haiku, from profile" && ok "global profile model announced" || no "$(cat "$TMP/out.txt")"
run "$(payload ',"subagent_type":"local-helper"')" >/dev/null
jq -r '.systemMessage' "$TMP/out.txt" | grep -q "opus, from profile" && ok "project profile model announced" || no "$(cat "$TMP/out.txt")"
run "$(payload ',"subagent_type":"code-reviewer","model":"opus"')" >/dev/null
jq -r '.systemMessage' "$TMP/out.txt" | grep -q "opus, chosen by orchestrator" && ok "explicit model overrides profile in announcement" || no "$(cat "$TMP/out.txt")"
RC=$(run "$(payload ',"subagent_type":"no-model-agent"')")
[ "$RC" = 0 ] && jq -r '.systemMessage' "$TMP/out.txt" | grep -q "inherits the chat model" \
  && ok "profile with no model passes, announced as inherited" || no "rc=$RC $(cat "$TMP/out.txt")"
RC=$(run "$(payload ',"subagent_type":"Explore"')")
[ "$RC" = 0 ] && jq -r '.systemMessage' "$TMP/out.txt" | grep -q "built-in default" \
  && ok "built-in Explore passes with built-in default" || no "rc=$RC $(cat "$TMP/out.txt")"

echo "## exemptions and modes"
RC=$(run "$(payload ',"subagent_type":"fork"')")
[ "$RC" = 0 ] && ok "fork exempt (always runs on the parent model)" || no "fork rc=$RC"
RC=$(CFN_MODEL_CHOICE=warn run "$(payload ',"subagent_type":"general-purpose"')")
[ "$RC" = 0 ] && has err.txt "sonnet" && ok "warn mode: passes with a reminder" || no "warn rc=$RC"
RC=$(CFN_MODEL_CHOICE=off run "$(payload ',"subagent_type":"general-purpose"')")
[ "$RC" = 0 ] && [ ! -s "$TMP/err.txt" ] && ok "off mode: silent pass" || no "off rc=$RC"
RC=$(CFN_MODEL_CHOICE_TYPES="general-purpose researcher" run "$(payload ',"subagent_type":"researcher"')")
[ "$RC" = 2 ] && ok "CFN_MODEL_CHOICE_TYPES extends the list" || no "types rc=$RC"

echo "## subagents are still governed by the depth rule only"
RC=$(printf '{"agent_id":"a1","agent_type":"researcher","tool_name":"Agent","tool_input":{"subagent_type":"general-purpose","model":"sonnet","prompt":"x"}}' | bash "$GUARD" 2>"$TMP/err.txt"; echo $?)
[ "$RC" = 2 ] && has err.txt "nested subagent" && ok "nested spawn still blocked by depth rule" || no "depth rc=$RC"

echo
echo "spawn-model-choice: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
