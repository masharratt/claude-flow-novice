#!/usr/bin/env bash
# cfn-tooling-nudge -- notice repeated manual work and point at a tooling idea.
#
# Why: sessions redo the same manual step (reload data, copy a fix into N files)
# and only a human notices. The written rule (code-quality.md "Tooling
# Opportunities") needs initiative; this hook supplies the trigger.
#
# Event: PostToolUse, matcher Bash|Edit|Write|MultiEdit. WARN ONLY: it adds
# additionalContext and never blocks. Fail open: any internal error -> exit 0.
#
# Shapes
#   Bash: each segment (split on && || ; |) loses env assignments, wrappers (rtk,
#         time, timeout N, env...) and redirections; quoted strings -> S, digit
#         runs -> N, the basename of every path argument -> *. Read-only and
#         noise commands (ls, cat, git status/diff/log, mailbox.sh, search.sh...),
#         test runs and segments under 6 chars never count.
#   Edit/Write/MultiEdit: "edit:<dir>:<cksum of digit-normalised new text>" so the
#         same change made across files in one directory repeats a shape. New text
#         under 8 chars is skipped.
# Counting: one line per (time, session, shape) in
#   <state>/<project key>/shapes, project key = cksum of the MAIN checkout root
# (git common dir parent) so worktree lanes and sessions pool. A shape that
# reaches THRESHOLD inside WINDOW seconds nudges once per shape per session.
#
# Env: CFN_TOOLING_NUDGE=off disables; CFN_TOOLING_NUDGE_THRESHOLD (3),
#      CFN_TOOLING_NUDGE_WINDOW (7200 s), CFN_TOOLING_NUDGE_TTL_DAYS (14),
#      CFN_TOOLING_NUDGE_STATE_ROOT, CFN_TOOLING_NOW (epoch override, tests).
# Latency: one jq, one sed -z, one git rev-parse, a few cksum/awk; no network.
set -uo pipefail

MODE="${CFN_TOOLING_NUDGE:-on}"
THRESHOLD="${CFN_TOOLING_NUDGE_THRESHOLD:-3}"
WINDOW="${CFN_TOOLING_NUDGE_WINDOW:-7200}"
TTL_DAYS="${CFN_TOOLING_NUDGE_TTL_DAYS:-14}"
STATE_ROOT="${CFN_TOOLING_NUDGE_STATE_ROOT:-${XDG_RUNTIME_DIR:-/tmp}/cfn-guards/tooling}"
MIN_SEG=6
MIN_EDIT=8
MAX_SHAPES_BYTES=262144
# shellcheck disable=SC2016 # literal $HOME is printed for the model to run
IDEA_CMD='bash $HOME/.claude/cfn-scripts/cfn-tooling-idea.sh'

# Never count: read-only and noise first words.
RE_NOISE='^(cut|tr|column|nl|ls|ll|cat|head|tail|less|more|grep|egrep|fgrep|rg|find|wc|echo|printf|cd|pwd|sleep|true|false|test|\[|\[\[|jq|which|type|file|stat|du|df|ps|date|export|source|\.|set|unset|read|tee|sort|uniq|basename|dirname|realpath|readlink|id|whoami|:)( |$)'
# sed -n or a filter sed is noise; sed -i edits files and still counts.
RE_SED_FILTER='^sed( |$)'
RE_SED_INPLACE='^sed( +[^ ]+)* +-[A-Za-z]*i'
RE_GIT_RO='^git (status|diff|log|show|branch|fetch|rev-parse|remote|ls-files|blame|stash list)( |$)'
RE_TMUX_RO='^tmux (capture-pane|list-[a-z]+|display-message|has-session)( |$)'
RE_TOOLS='(mailbox|search|cfn-tooling-idea)\.sh'
# Test runs (same families as cfn-repeat-fix-guard.sh).
RE_SHTEST='^(bash|sh)? ?(\./)?([^ ]*/)?tests?/([^ ]*/)?test[-_][^ ]*\.sh( |$)'
RE_PKG='^(npm|pnpm|yarn|bun) +(run +)?test([: ]|$)'
RE_JS='^((npx|bunx|yarn|pnpm( +exec)?) +)?(vitest|jest|mocha|ava)( |$)'
RE_PW='^((npx|yarn|pnpm( +exec)?) +)?playwright +test( |$)'
RE_PY='^(python[0-9.N]* +-m +)?pytest( |$)'
RE_RS='^cargo +(test|nextest)( |$)'
RE_GO='^go +test( |$)'
RE_NODE='^node +(.* +)?--test([ =]|$)'

# bash_shapes <command>: print the unique counting shapes, one per line.
# Stages: (1) unquote 'ssh host "cmd"' and collapse quotes to S, split on && || ;
# and on pipes (a pipe consumer line starts with \x01); (2) strip env, wrappers
# (sudo, xargs, nohup...), loop keywords (do/then/while...), redirections; an
# ssh prefix moves to a trailing "@ssh:host" tag that is re-attached as
# "ssh:host <inner shape>" after the noise checks (so local and remote differ).
bash_shapes() {
    local seg tag
    printf '%s' "$1" | sed -Ez \
        -e 's/<<.*$//' \
        -e 's#(^|[^A-Za-z0-9_./-])ssh( +-[nTtqvxAaCNfgkKMsXY46]+| +-[pioFlJLRDEbcem] +[^ ]+)* +([^ -][^ ]*) +"(([^"\\]|\\.)*)"#\1ssh\2 \3 \4#g' \
        -e 's#(^|[^A-Za-z0-9_./-])ssh( +-[nTtqvxAaCNfgkKMsXY46]+| +-[pioFlJLRDEbcem] +[^ ]+)* +([^ -][^ ]*) +'"'"'([^'"'"']*)'"'"'#\1ssh\2 \3 \4#g' \
        -e 's/"([^"\\]|\\.)*"/S/g' \
        -e "s/'[^']*'/S/g" \
        -e 's/\n/;/g' \
        -e 's/(&&|\|\||;)/\n/g' -e 's/\|&?/\n\x01/g' | sed -E \
        -e 's/^\x01[[:space:]]*(awk|sed)( |$)/echo /' -e 's/^\x01//' \
        -e 's/^[[:space:]]+//' \
        -e 's/^rtk[[:space:]]+proxy[[:space:]]+/rtk /' \
        -e ':l' \
        -e 's/^ssh( +-[nTtqvxAaCNfgkKMsXY46]+| +-[pioFlJLRDEbcem] +[^ ]+)* +([^ -][^ ]*) +(.+)$/\3 @ssh:\2/' \
        -e 's/^(do|then|else|while|until|if|elif|sudo( +-[A-Za-z]+)*( +-u +[^ ]+)?|xargs( +-[A-Za-z]+[0-9]*(\{\})?( +([0-9]+|\{\}|S))?)*|[A-Za-z_][A-Za-z0-9_]*=(S|[^[:space:]]*)|time|rtk|command|exec|env|nice|nohup|timeout( +-[^ ]+( +[0-9.]+[smh]?)?)* +[0-9.]+[smh]?)([[:space:]]+|$)//' -e 't l' \
        -e '/^(for|select|case|done|fi|esac)( |$)/d' \
        -e 's/^git +(-C +[^ ]+ +|--no-pager +)+/git /' \
        -e 's/[[:space:]]*[0-9]*>>?&?[[:space:]]*[^[:space:]]+//g' \
        -e 's/[[:space:]]*<[[:space:]]*[^[:space:]]+//g' \
        -e 's/[[:space:]]+/ /g' -e 's/ $//' \
        -e '/(mailbox|search|cfn-tooling-idea)\.sh/d' \
        -e '/(^| )(\.\/)?([^ ]*\/)?tests?\/([^ ]*\/)?test[-_][^ ]*\.sh/d' \
        -e 's/[0-9]+/N/g' \
        -e 's#( )([^ ]*/)[^ /]+#\1\2*#g' \
        | while IFS= read -r seg || [ -n "$seg" ]; do
        tag=""
        if [[ "$seg" =~ ^(.*)\ @ssh:([^\ ]+)$ ]]; then seg="${BASH_REMATCH[1]}"; tag="ssh:${BASH_REMATCH[2]} "; fi
        [ "${#seg}" -ge "$MIN_SEG" ] || continue
        [[ "$seg" =~ $RE_SED_FILTER && ! "$seg" =~ $RE_SED_INPLACE ]] && continue
        [[ "$seg" =~ $RE_NOISE || "$seg" =~ $RE_GIT_RO || "$seg" =~ $RE_TMUX_RO || "$seg" =~ $RE_TOOLS ]] && continue
        [[ "$seg" =~ $RE_SHTEST || "$seg" =~ $RE_PKG || "$seg" =~ $RE_JS || "$seg" =~ $RE_PW \
           || "$seg" =~ $RE_PY || "$seg" =~ $RE_RS || "$seg" =~ $RE_GO || "$seg" =~ $RE_NODE ]] && continue
        printf '%s\n' "$tag$seg"
    done | sort -u
}

sanitize() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_'; }
hash_of() { printf '%s' "$1" | cksum | cut -d' ' -f1; }

# main_root <cwd>: parent of the git common dir (worktrees pool), else cwd.
main_root() {
    local c="$1" common
    [ -d "$c" ] || { printf '%s' "$c"; return 0; }
    if common=$(git -C "$c" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && [ -n "$common" ]; then
        if [ "${common##*/}" = ".git" ]; then printf '%s' "${common%/*}"; else printf '%s' "$common"; fi
    else
        printf '%s' "$c"
    fi
}

ensure_dir() { # create the project dir, pruning stale siblings on first use
    local d="$1"
    [ -d "$d" ] && return 0
    mkdir -p "$d/nudged" 2>/dev/null || return 1
    if [ -n "$STATE_ROOT" ] && [ "$STATE_ROOT" != / ]; then
        find "$STATE_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$TTL_DAYS" -exec rm -rf -- {} + 2>/dev/null || true
    fi
    return 0
}

main() {
    [ "$MODE" = off ] && return 0
    command -v jq >/dev/null 2>&1 || return 0
    local raw fields event tool session cwd file cmd newtext
    raw=$(timeout 2 cat 2>/dev/null || true)
    [ -n "$raw" ] || return 0
    fields=$(printf '%s' "$raw" | jq -r '
        def flat: tostring | gsub("[\u001f\n\r\t]"; " ");
        [ (.hook_event_name // "" | flat), (.tool_name // "" | flat), (.session_id // "" | flat),
          (.cwd // "" | flat), (.tool_input.file_path // "" | flat),
          (.tool_input.command // "" | tostring | gsub("[\u001f\r\t]"; " ") | gsub("\n"; ";")),
          ((.tool_input.new_string // .tool_input.content // ([.tool_input.edits[]? | .new_string // empty] | join(" ")) // "")
             | tostring | gsub("[0-9]+"; "N") | .[0:2048] | flat)
        ] | join("\u001f")' 2>/dev/null) || return 0
    # Unit separator, not tab: tab is IFS whitespace and would collapse empty fields.
    IFS=$'\x1f' read -r event tool session cwd file cmd newtext <<< "$fields"
    [ "$event" = PostToolUse ] || return 0
    [ -n "$session" ] || return 0
    [ -n "$cwd" ] || cwd="$PWD"

    local shapes=""
    case "$tool" in
        Bash) [ -n "$cmd" ] || return 0; shapes=$(bash_shapes "$cmd") ;;
        Edit|Write|MultiEdit)
            [ -n "$file" ] && [ "${#newtext}" -ge "$MIN_EDIT" ] || return 0
            shapes="edit:${file%/*}:$(hash_of "$newtext")" ;;
        *) return 0 ;;
    esac
    [ -n "$shapes" ] || return 0

    local root d now sess line h count nsess marker shape msg=""
    root=$(main_root "$cwd")
    d="$STATE_ROOT/$(hash_of "$root")"
    ensure_dir "$d" || return 1
    now="${CFN_TOOLING_NOW:-$(printf '%(%s)T' -1)}"
    sess=$(sanitize "$session")
    while IFS= read -r shape; do
        printf '%s\t%s\t%s\t%s\n' "$now" "$sess" "$(hash_of "$shape")" "$shape" >> "$d/shapes" || return 1
    done <<< "$shapes"
    if [ "$(wc -c < "$d/shapes")" -gt "$MAX_SHAPES_BYTES" ]; then
        awk -F'\t' -v min="$((now - WINDOW))" '$1 >= min' "$d/shapes" > "$d/shapes.tmp" && mv -f "$d/shapes.tmp" "$d/shapes"
    fi

    while IFS= read -r shape; do
        h=$(hash_of "$shape")
        marker="$d/nudged/${sess}__$h"
        [ -e "$marker" ] && continue
        line=$(awk -F'\t' -v h="$h" -v min="$((now - WINDOW))" \
            '$1 >= min && $3 == h { c++; s[$2] = 1 } END { n = 0; for (k in s) n++; print c + 0, n }' "$d/shapes")
        count="${line% *}"; nsess="${line#* }"
        [ "$count" -ge "$THRESHOLD" ] || continue
        : > "$marker" 2>/dev/null || true
        [ "${#shape}" -gt 120 ] && shape="${shape:0:120}..."
        msg="TOOLING NUDGE: '$shape' done $count times (sessions: $nsess). If this is a manual step that will recur, record it: $IDEA_CMD add \"<idea>\" --saves \"<estimate>\" --evidence \"<what repeated>\" then carry on. Ignore if this is normal iteration."
        break
    done <<< "$shapes"
    [ -n "$msg" ] || return 0
    jq -nc --arg m "$msg" '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$m}}'
}

main "$@"
rc=$?
[ "$rc" -eq 0 ] || echo "cfn-tooling-nudge: internal error (rc=$rc), continuing" >&2
exit 0
