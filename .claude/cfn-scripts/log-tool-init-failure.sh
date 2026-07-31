#!/usr/bin/env bash
# log-tool-init-failure — global CFN tool-INITIATION failure log.
#
# A tool "initiation failure" is when a CFN tool fails to even START properly:
# the script/skill is missing, not executable, takes bad args, an agent spawn
# returns nothing, a slash skill isn't found, or MAX_ITERATIONS is exhausted
# with no done verdict. This is distinct from a tool that STARTS and then fails
# its check (gate-check exit 1/2/3, verify-run red ACs) — those are normal
# control-flow exits, NOT initiation failures, and are never logged here.
#
# One append-only JSONL file, shared across every project (the dir is a global
# reverse-symlink to this repo). Programmatic: the script auto-captures
# timestamp, host, cwd, git state, provider, session id — the caller only
# supplies tool name + category (+ optional context/stderr/exit). The LLM does
# not hand-author record fields.
#
#   record  explicitly log one failure (used for LLM-mediated tools: Task spawn
#           that returned nothing, slash skill not found, MAX_ITERATIONS hit).
#   wrap    run a CFN CLI command and auto-log ONLY if it failed to initiate
#           (exit 126/127 or a missing-tool message). Always re-emits the real
#           exit code + stdout/stderr, so control-flow semantics are unchanged.
#   show    print recent records (raw JSONL, or pretty if jq is present).
#
# Usage:
#   log-tool-init-failure.sh record --tool verify-run.sh --category MISSING_TOOL \
#       --stderr "No such file" --exit-code 127 --phase 5E.1 [--task-id T --command "..."]
#   log-tool-init-failure.sh wrap   --tool gate-check.sh -- \
#       ./.claude/skills/cfn-loop-orchestration-v2/cli/gate-check.sh --out /tmp/x.txt --threshold 0.95
#   log-tool-init-failure.sh show [--tool NAME] [--last N]
#
# Log path: $HOME/.claude/cfn-data/tool-init-failures.jsonl (gitignored runtime data).
# Failure of THIS logger never breaks the wrapped command or the loop (fail-open).

set -uo pipefail

# Coordinator threads TASK_ID/RUN_ID/SLUG/ITERATION (bare); accept either form.
: "${CFN_TASK_ID:=${TASK_ID:-}}"
: "${CFN_RUN_ID:=${RUN_ID:-}}"
: "${CFN_SLUG:=${SLUG:-}}"
: "${CFN_ITERATION:=${ITERATION:-}}"

LOG_DIR="$HOME/.claude/cfn-data"
LOG_FILE="$LOG_DIR/tool-init-failures.jsonl"

# ---- string -> JSON escaping (dep-free) -------------------------------------
json_str() {
  # $1 -> a JSON string literal INCLUDING the surrounding double quotes.
  # Escapes ", \, control chars; folds newlines to \n.
  local s="${1-}"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\n'/\\n}"               # newlines -> \n (one JSONL line)
  # strip remaining control chars (except nothing left to escape)
  printf '"%s"' "$s"
}

# ---- auto-captured environment ----------------------------------------------
capture_env() {
  _ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  _host="${HOSTNAME:-$(hostname 2>/dev/null || echo unknown)}"
  _cwd="$PWD"
  _session="${CLAUDE_CODE_SESSION_ID:-}"
  _provider="${CFN_PROVIDER:-}"
  if [ -z "$_provider" ] && [ -f "$HOME/.claude/cfn-config/provider-models.json" ]; then
    _provider="$(grep -oE '"(default_provider|default)"[[:space:]]*:[[:space:]]*"[^"]+"' \
      "$HOME/.claude/cfn-config/provider-models.json" 2>/dev/null | head -1 \
      | sed -E 's/.*"([^"]+)"$/\1/' || true)"
  fi
  [ -n "$_provider" ] || _provider="unknown"

  # git state (best-effort; not every cwd is a repo)
  _project=""; _branch=""; _commit=""; _dirty=""
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    _project="$(git rev-parse --show-toplevel 2>/dev/null)"
    _branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)"
    _commit="$(git rev-parse --short HEAD 2>/dev/null || echo none)"
    [ -n "$(git status --porcelain 2>/dev/null)" ] && _dirty=true || _dirty=false
  fi
}

# ---- append one record (args = field overrides) -----------------------------
# Arg order matches the JSON field order after the auto-captured prefix:
# $1=tool $2=category $3=exit_code $4=task_id $5=run_id $6=slug $7=iteration
# $8=phase $9=agent_id $10=command $11=stderr $12=note
write_record() {
  mkdir -p "$LOG_DIR" 2>/dev/null || return 0
  capture_env
  local rec
  rec=$(printf '{"ts":%s,"host":%s,"cwd":%s,"project":%s,"git_branch":%s,"git_commit":%s,"git_dirty":%s,"session":%s,"provider":%s,"tool":%s,"category":%s,"exit_code":%s,"task_id":%s,"run_id":%s,"slug":%s,"iteration":%s,"phase":%s,"agent_id":%s,"command":%s,"stderr":%s,"note":%s}\n' \
    "$(json_str "$_ts")" \
    "$(json_str "$_host")" \
    "$(json_str "$_cwd")" \
    "$(json_str "${_project:-}")" \
    "$(json_str "${_branch:-}")" \
    "$(json_str "${_commit:-}")" \
    "${_dirty:-false}" \
    "$(json_str "${_session:-}")" \
    "$(json_str "${_provider:-}")" \
    "$(json_str "$1")" \
    "$(json_str "$2")" \
    "$(json_str "${3:-}")" \
    "$(json_str "${4:-}")" \
    "$(json_str "${5:-}")" \
    "$(json_str "${6:-}")" \
    "$(json_str "${7:-}")" \
    "$(json_str "${8:-}")" \
    "$(json_str "${9:-}")" \
    "$(json_str "${10:-}")" \
    "$(json_str "${11:-}")" \
    "$(json_str "${12:-}")")
  # flock: many parallel sessions/projects share one inode
  (
    flock 9 2>/dev/null
    printf '%s\n' "$rec" >> "$LOG_FILE"
  ) 9>>"$LOG_FILE" 2>/dev/null || printf '%s\n' "$rec" >> "$LOG_FILE" 2>/dev/null
  echo "cfn-tool-init-failure logged: $1 [$2] -> $LOG_FILE" >&2
}

# ---- is this exit/stderr an initiation failure? -----------------------------
# 126 not-executable, 127 not-found = the tool could not even start. These are
# the only codes wrap logs. CFN control-flow exits (0/1/2/3/4) are normal and
# never logged here, even if stderr happens to mention "not found" (a real
# control-flow tool can legitimately say that). Nuanced cases (bad args,
# missing dependency build) are logged explicitly via `record` by the LLM.
is_init_failure() {
  local rc="$1" err="$2"
  [ "$rc" = "126" ] && return 0
  [ "$rc" = "127" ] && return 0
  return 1
}

categorize() {
  # guess a category from exit + stderr when caller didn't give one.
  local rc="$1" err="$2"
  [ "$rc" = "126" ] && { echo NOT_EXECUTABLE; return; }
  [ "$rc" = "127" ] && { echo MISSING_TOOL; return; }
  printf '%s' "$err" | grep -qiE 'usage:|invalid option|unrecognized|bad option|missing argument|required argument' && { echo BAD_ARGS; return; }
  echo OTHER
}

usage() { sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; }

# ---- dispatch ----------------------------------------------------------------
cmd="${1:-}"
[ $# -gt 0 ] && shift
case "$cmd" in
  record)
    r_tool=""; r_cat=""; r_exit=""; r_stderr=""; r_command=""
    r_task="${CFN_TASK_ID:-}"; r_run="${CFN_RUN_ID:-}"; r_slug="${CFN_SLUG:-}"
    r_iter="${CFN_ITERATION:-}"; r_phase=""; r_agent=""; r_note=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --tool) r_tool="$2"; shift 2 ;;
        --category) r_cat="$2"; shift 2 ;;
        --exit-code) r_exit="$2"; shift 2 ;;
        --stderr) r_stderr="$2"; shift 2 ;;
        --command) r_command="$2"; shift 2 ;;
        --task-id) r_task="$2"; shift 2 ;;
        --run-id) r_run="$2"; shift 2 ;;
        --slug) r_slug="$2"; shift 2 ;;
        --iteration) r_iter="$2"; shift 2 ;;
        --phase) r_phase="$2"; shift 2 ;;
        --agent-id) r_agent="$2"; shift 2 ;;
        --note) r_note="$2"; shift 2 ;;
        --) shift; break ;;
        *) echo "record: unknown flag: $1" >&2; exit 2 ;;
      esac
    done
    [ -n "$r_tool" ] || { echo "record: --tool is required" >&2; exit 2; }
    [ -n "$r_cat" ] || r_cat="$(categorize "${r_exit:-}" "$r_stderr")"
    write_record "$r_tool" "$r_cat" "$r_exit" "$r_task" "$r_run" "$r_slug" \
                 "$r_iter" "$r_phase" "$r_agent" "$r_command" "$r_stderr" "$r_note"
    ;;

  wrap)
    w_tool=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --tool) w_tool="$2"; shift 2 ;;
        --) shift; break ;;
        *) echo "wrap: unknown flag: $1" >&2; exit 2 ;;
      esac
    done
    [ -n "$w_tool" ] || { echo "wrap: --tool is required" >&2; exit 2; }
    [ $# -gt 0 ] || { echo "wrap: no command given after --" >&2; exit 2; }
    err_file="$(mktemp)"
    "$@" 2>"$err_file"           # stdout streams live; stderr captured + re-emitted below
    rc=$?
    err="$(cat "$err_file" 2>/dev/null || true)"
    printf '%s' "$err" >&2
    rm -f "$err_file" 2>/dev/null
    if is_init_failure "$rc" "$err"; then
      write_record "$w_tool" "$(categorize "$rc" "$err")" "$rc" \
                   "${CFN_TASK_ID:-}" "${CFN_RUN_ID:-}" "${CFN_SLUG:-}" \
                   "${CFN_ITERATION:-}" "" "" "$*" "$err" ""
    fi
    exit "$rc"                   # ALWAYS the inner command's real exit code
    ;;

  show)
    f_tool=""; f_last="50"
    while [ $# -gt 0 ]; do
      case "$1" in
        --tool) f_tool="$2"; shift 2 ;;
        --last) f_last="$2"; shift 2 ;;
        *) shift ;;
      esac
    done
    [ -f "$LOG_FILE" ] || { echo "(no failure log yet: $LOG_FILE)" >&2; exit 0; }
    lines="$(tail -n "$f_last" "$LOG_FILE")"
    [ -n "$f_tool" ] && lines="$(printf '%s\n' "$lines" | grep -F "\"tool\":\"$f_tool\"" || true)"
    if [ -z "$lines" ]; then
      echo "(no matching records)" >&2; exit 0
    fi
    if command -v jq >/dev/null 2>&1; then
      printf '%s\n' "$lines" | jq -c '{ts,tool,category,exit_code,phase,stderr,cwd,git_branch,git_commit}' 2>/dev/null \
        || printf '%s\n' "$lines"
    else
      printf '%s\n' "$lines"
    fi
    ;;

  -h|--help|help|"") usage ;;
  *) echo "unknown subcommand: $cmd (use record|wrap|show)" >&2; exit 2 ;;
esac
