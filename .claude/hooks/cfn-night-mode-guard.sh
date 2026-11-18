#!/usr/bin/env bash
# Night mode PreToolUse guard.
# Registered under PreToolUse with matcher: AskUserQuestion|EnterPlanMode|ExitPlanMode|Bash
#
# Flag on:
#   AskUserQuestion  -> exit 2, self-contained decide-and-log instructions on stderr
#   EnterPlanMode    -> exit 2, planning bypass instructions on stderr
#   ExitPlanMode     -> exit 0 + JSON allow (rtk-rewrite.sh shape) so a session already
#                       in plan mode when the flag flips on is not trapped; plan capture
#                       (cfn-plan-capture.sh PostToolUse) still persists the plan.
#   Bash             -> git push: exit 0 for a plain push of a pair listed in
#                       <project>/.claude/night-mode-push-allow (logged as git-push),
#                       exit 2 for every other push form (logged as git-push-denied).
#                       Non-push commands pass silently.
# Fail-open: flag off or jq missing -> silent exit 0.
# Every deny/allow appends one line to $CFN_NIGHT_MODE_DIR/.night-mode-events.log:
#   <iso-utc> <tool> <title<=120 chars>
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

NIGHT_DIR="${CFN_NIGHT_MODE_DIR:-$HOME/.claude}"
FLAG="$NIGHT_DIR/.night-mode-active"
EVENTS="$NIGHT_DIR/.night-mode-events.log"

[ -f "$FLAG" ] || exit 0

INPUT=$(cat)
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

case "$TOOL" in
    AskUserQuestion|EnterPlanMode|ExitPlanMode|Bash) ;;
    *) exit 0 ;;
esac

log_event(){ # log_event <tool> <title>
    local t=$1 q=$2 clean
    clean=$(printf '%s' "$q" | tr '\n\t' '   ')
    printf '%s %s %.120s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$t" "${clean:-$t}" >> "$EVENTS"
}

# ---------------------------------------------------------------------------
# Bash: git push allowlist (night mode only; flag-off already exited above).
# A push passes only when it is a plain push of a "remote branch" pair listed in
# <project>/.claude/night-mode-push-allow (project = git toplevel of the push's
# effective cwd: hook cwd, then any "cd X" and "git -C X"). Every other push form
# is blocked. Fast-forward-only needs no check here: git and the remote reject a
# non-fast-forward push unless it is forced, so blocking the force forms
# (-f, --force*, +refspec) plus delete/mirror/all/tags/other-branch refspecs is
# enough to make every allowed push a fast-forward.
# ---------------------------------------------------------------------------
PUSH_ALLOW_REL=".claude/night-mode-push-allow"
PUSH_OK_OPTS=" -u --set-upstream -q --quiet -v --verbose --progress --no-progress "
PUSH_DENY=""
PUSH_SEEN_OPT=""
PUSH_ALLOWED=()

push_resolve_dir(){ # push_resolve_dir <base> <target> -> abs physical path, or fail
    local base=$1 t=$2
    case "$t" in \"*\") t=${t#\"}; t=${t%\"} ;; \'*\') t=${t#\'}; t=${t%\'} ;; esac
    case "$t" in ''|*[\$\`\"\'\(\)\<\>\;\&\|\*\?\\]*) return 1 ;; esac
    # shellcheck disable=SC2088 # literal tilde patterns, expanded by hand below
    case "$t" in
        "~") t=$HOME ;;
        "~/"*) t="$HOME/${t#\~/}" ;;
        /*) ;;
        *) [ -n "$base" ] || return 1; t="$base/$t" ;;
    esac
    (cd "$t" 2>/dev/null && pwd -P)
}

push_listed(){ # push_listed <allow-file> <remote> <branch> -> 0 when the pair is listed
    local f=$1 line a b rest
    { [ -f "$f" ] && [ -r "$f" ]; } || return 1
    while IFS= read -r line || [ -n "$line" ]; do
        line=${line%%#*}
        a=""; b=""; rest=""
        read -r a b rest <<<"$line"
        [ -n "$a" ] && [ -z "$rest" ] && [ "$a" = "$2" ] && [ "$b" = "$3" ] && return 0
    done < "$f"
    return 1
}

push_check_segment(){ # push_check_segment <cwd> <tokens...>; sets PUSH_DENY or appends PUSH_ALLOWED
    local dir=$1; shift
    local -a t=("$@")
    local n=${#t[@]} i g=-1 j=0 tok remote="" ref="" src dst top
    for ((i=0; i<n; i++)); do
        case "${t[$i]}" in git|*/git) g=$i; break ;; esac
    done
    [ "$g" -ge 0 ] || return 0
    # git global options up to the subcommand; only -C is accepted for a push
    i=$((g+1))
    while [ "$i" -lt "$n" ]; do
        tok=${t[$i]}
        case "$tok" in
            -C) dir=$(push_resolve_dir "$dir" "${t[$((i+1))]:-}") || dir=""; i=$((i+2)) ;;
            -c) PUSH_SEEN_OPT=$tok; i=$((i+2)) ;;
            -*) PUSH_SEEN_OPT=$tok; i=$((i+1)) ;;
            *) break ;;
        esac
    done
    [ "${t[$i]:-}" = "push" ] || return 0
    if [ -n "$PUSH_SEEN_OPT" ]; then
        PUSH_DENY="git option $PUSH_SEEN_OPT before push is not allowed (it can change push config)"; return 0
    fi
    # prefix before git: env assignments, rtk, or the with-main-lock.sh wrapper
    while [ "$j" -lt "$g" ]; do
        tok=${t[$j]}
        case "$tok" in
            rtk) j=$((j+1)) ;;
            bash|sh)
                case "${t[$((j+1))]:-}" in
                    *with-main-lock.sh) j=$((j+1)) ;;
                    *) PUSH_DENY="unrecognized wrapper '$tok' around git push"; return 0 ;;
                esac ;;
            *with-main-lock.sh) # usage: with-main-lock.sh <owner> [--] <command...>
                j=$((j+2)); [ "${t[$j]:-}" = "--" ] && j=$((j+1)) ;;
            *=*)
                if [[ "$tok" =~ ^[A-Za-z_][A-Za-z0-9_]*=[A-Za-z0-9._/:@-]*$ ]]; then j=$((j+1))
                else PUSH_DENY="unsafe environment prefix '$tok'"; return 0; fi ;;
            *) PUSH_DENY="unrecognized wrapper '$tok' around git push"; return 0 ;;
        esac
    done
    [ "$j" -eq "$g" ] || { PUSH_DENY="wrapper arguments do not end at git"; return 0; }
    for ((i=i+1; i<n; i++)); do
        tok=${t[$i]}
        if ! [[ "$tok" =~ ^[A-Za-z0-9._/:+@=-]+$ ]]; then
            PUSH_DENY="push argument '$tok' has quotes or shell syntax"; return 0
        fi
        case "$tok" in
            -f|--force*|-[a-zA-Z]*f*) PUSH_DENY="force push ($tok)"; return 0 ;;
            -d|--delete|-[a-zA-Z]*d*) PUSH_DENY="delete push ($tok)"; return 0 ;;
            --mirror|--all|--branches|--tags|--prune) PUSH_DENY="multi-ref push ($tok)"; return 0 ;;
            -*) case "$PUSH_OK_OPTS" in
                    *" $tok "*) ;;
                    *) PUSH_DENY="push option $tok is not on the night-mode list"; return 0 ;;
                esac ;;
            +*) PUSH_DENY="force refspec ($tok)"; return 0 ;;
            :*) PUSH_DENY="delete refspec ($tok)"; return 0 ;;
            *) if [ -z "$remote" ]; then remote=$tok
               elif [ -z "$ref" ]; then ref=$tok
               else PUSH_DENY="more than one refspec"; return 0; fi ;;
        esac
    done
    { [ -n "$remote" ] && [ -n "$ref" ]; } || { PUSH_DENY="push must name a remote and a branch"; return 0; }
    case "$ref" in *:*:*) PUSH_DENY="malformed refspec $ref"; return 0 ;; esac
    src=${ref%%:*}; dst=${ref#*:}
    src=${src#refs/heads/}; dst=${dst#refs/heads/}
    [ "$src" = "$dst" ] || { PUSH_DENY="refspec $ref writes a different branch"; return 0; }
    [ -n "$dir" ] || { PUSH_DENY="cannot resolve the push's working directory"; return 0; }
    top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || top=""
    [ -n "$top" ] || { PUSH_DENY="push directory $dir is not in a git project"; return 0; }
    if ! push_listed "$top/$PUSH_ALLOW_REL" "$remote" "$src"; then
        PUSH_DENY="$remote $src is not listed in $top/$PUSH_ALLOW_REL (a missing or unreadable file blocks too)"; return 0
    fi
    PUSH_ALLOWED+=("$remote $src $top")
}

if [ "$TOOL" = "Bash" ]; then
    CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
    # cheap prefilter: without both words this is not a push
    printf '%s' "$CMD" | grep -qE '(^|[^[:alnum:]_-])git([^[:alnum:]_-]|$)' || exit 0
    printf '%s' "$CMD" | grep -qE '(^|[^[:alnum:]_-])push([^[:alnum:]_-]|$)' || exit 0
    CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
    [ -n "$CWD" ] || CWD=$PWD
    CWD=$(cd "$CWD" 2>/dev/null && pwd -P) || CWD=""
    # drop harmless fd redirects, then split into simple commands
    SEGS=$(printf '%s\n' "$CMD" \
        | sed -E 's/[0-9]*>&[0-9]+//g; s#[0-9]*>>?[[:space:]]*/dev/null##g' \
        | sed -E 's/&&|\|\||[;|&]/\n/g')
    while IFS= read -r SEG; do
        read -ra TOKS <<<"$SEG"
        [ "${#TOKS[@]}" -gt 0 ] || continue
        if [ "${TOKS[0]}" = "cd" ]; then
            if [ "${#TOKS[@]}" -eq 2 ]; then
                CWD=$(push_resolve_dir "$CWD" "${TOKS[1]}") || CWD=""
            else
                CWD=""
            fi
            continue
        fi
        PUSH_SEEN_OPT=""
        push_check_segment "$CWD" "${TOKS[@]}"
        [ -z "$PUSH_DENY" ] || break
    done <<<"$SEGS"

    if [ -n "$PUSH_DENY" ]; then
        log_event "git-push-denied" "$PUSH_DENY"
        cat >&2 <<EOF_NM
BLOCKED: Night mode is active. git push is allowed only as a plain fast-forward push
of a "remote branch" pair listed in the project's $PUSH_ALLOW_REL file.
Reason: $PUSH_DENY
Never force, delete or rewrite. Defer this push as a blocking proposed decision:
   bash \$HOME/.claude/skills/decision-log/record.sh --slug night-$(date +%F) \\
     --id D$(date +%H%M%S)-$$ --title "push deferred" \\
     --chosen "DEFERRED: <the push you wanted>" --blocking --status proposed
EOF_NM
        exit 2
    fi
    for P in "${PUSH_ALLOWED[@]}"; do
        log_event "git-push" "$P"
    done
    exit 0
fi

question_text(){
    printf '%s' "$INPUT" | jq -r '.tool_input.questions[0].question // .tool_input.subject // .tool_input.topic // ""' 2>/dev/null
}

case "$TOOL" in
    AskUserQuestion)
        SLUG="night-$(date +%F)"
        DEC_ID="D$(date +%H%M%S)-$$"
        log_event "AskUserQuestion" "$(question_text)"
        cat >&2 <<EOF_NM
BLOCKED: Night mode is active. No user is available to answer. Decide and continue:

1. Choose the most conservative, reversible option. Never widen scope.
2. Hard safety floor -- NEVER execute, and never "decide" to execute:
   destructive/irreversible ops (DB DELETE/DROP/TRUNCATE, deploys, git push
   outside the project's night-mode-push-allow list, git force/reset/clean,
   credential changes, new Anthropic provider calls).
   Those are deferred, not decided (step 4b).
3. Commit finished work as you go (git commit). git push only to the project's
   night-mode-push-allow list (plain fast-forward); never force, delete or rewrite.
4. Record the decision now:
   bash \$HOME/.claude/skills/decision-log/record.sh --slug ${SLUG} \\
     --id ${DEC_ID} --title "<the question, short>" \\
     --chosen "<option you picked>" --rationale "<why, one line>"
   a. Normal case: as above (status accepted by default).
   b. Safety-floor case: add --blocking --status proposed
     --chosen "DEFERRED: <what you wanted>", then continue on a different path.
5. Do not ask again. Proceed with the chosen option.

These records become the morning report (night-mode.sh report on exit).
EOF_NM
        exit 2
        ;;
    EnterPlanMode)
        SLUG="night-$(date +%F)"
        DEC_ID="D$(date +%H%M%S)-$$"
        log_event "EnterPlanMode" "$(printf '%s' "$INPUT" | jq -r '.tool_input.topic // .tool_input.subject // ""' 2>/dev/null)"
        cat >&2 <<EOF_NM
BLOCKED: Night mode is active. Entering plan mode would end in an approval stall,
and no user is available to approve a plan. Instead:

1. Continue from existing planning/ artifacts if they cover the work.
2. If genuinely new planning is required, write planning/NIGHT_<topic>.md
   directly and keep working from it. Do not stop.
3. Log the bypass decision:
   bash \$HOME/.claude/skills/decision-log/record.sh --slug ${SLUG} \\
     --id ${DEC_ID} --title "plan-mode bypass" \\
     --chosen "wrote planning/NIGHT_<topic>.md and continued"

Then proceed without waiting. These records become the morning report.
EOF_NM
        exit 2
        ;;
    ExitPlanMode)
        log_event "ExitPlanMode" "(allowed under night mode; reviewed via morning report)"
        TI=$(printf '%s' "$INPUT" | jq -c '.tool_input // {}' 2>/dev/null)
        [ -n "$TI" ] || TI='{}'
        jq -n \
            --argjson ti "$TI" \
            '{
              hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "allow",
                permissionDecisionReason: "Night mode active: approval stall deferred to the morning-report review.",
                updatedInput: $ti
              }
            }'
        exit 0
        ;;
esac

exit 0
