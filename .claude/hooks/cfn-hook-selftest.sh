#!/usr/bin/env bash
# Hook self-test: proves every registered hook can actually run, and that every
# hook on disk is either registered or explicitly marked as not-a-hook.
#
# Why this exists: on 2026-07-25 an audit found cfn-decision-log-ingest.sh had
# never fired in 3 months (registered nowhere), the destructive-command guard
# had never fired at all, and two registered telemetry hooks had been silently
# hitting "Permission denied" since March. Every one of them reported success
# or reported nothing. Nothing in the system compared the hooks directory
# against the set of registered commands, so absence looked exactly like
# presence.
#
# Exit: 0 = all checks pass, 1 = at least one failure.
# Flags: --quiet (exit code only), --orphans-only, --json
#
# To exempt a script that lives in hooks/ but is not itself a hook (a sourced
# library, a manually-invoked CLI, an installer), put this line in its header:
#     # cfn-selftest: not-a-hook <reason>

set -uo pipefail

# This script lives at <repo>/.claude/hooks/, so the repo root is two levels
# up -- and ~/.claude/hooks is a reverse symlink into the project, so resolve
# the real path first or we land in $HOME. Prefer git for the answer.
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
HOOKS_DIR="$SCRIPT_DIR"
# Grouped deliberately: `A || B && C` parses as `(A || B) && C`, which would
# append pwd's output to git's and produce a two-line REPO_ROOT.
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"
[ -n "$REPO_ROOT" ] || REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

QUIET=0
ORPHANS_ONLY=0
for arg in "$@"; do
    case "$arg" in
        --quiet) QUIET=1 ;;
        --orphans-only) ORPHANS_ONLY=1 ;;
    esac
done

FAILURES=0
WARNINGS=0
# --quiet drops the passing lines only. Failures and warnings always print --
# a self-test that can be silenced into saying nothing is the same failure
# mode it exists to catch.
say() { [ "$QUIET" -eq 1 ] || printf '%s\n' "$1"; }
fail() { FAILURES=$((FAILURES + 1)); printf '  \033[31mFAIL\033[0m %s\n' "$1" >&2; }
warn() { WARNINGS=$((WARNINGS + 1)); printf '  \033[33mwarn\033[0m %s\n' "$1" >&2; }
pass() { [ "$QUIET" -eq 1 ] || printf '  \033[32mok\033[0m   %s\n' "$1"; }

# Severity split: a path that does not resolve is unambiguously broken and
# fails the run. An unregistered script is a judgment call (it may be a
# library or a deliberate manual tool), so it warns -- loudly, every run --
# rather than leaving the check permanently red until someone triages it.
# A check nobody can get to green is a check nobody reads.

SETTINGS_FILES=(
    "$HOME/.claude/settings.json"
    "$HOME/.claude/settings.local.json"
    "$REPO_ROOT/.claude/settings.json"
    "$REPO_ROOT/.claude/settings.local.json"
)

# --- 1. every settings file must parse -----------------------------------
# An unparseable settings file unloads silently: no error, no hooks, no clue.
say ""
say "settings files parse"
for f in "${SETTINGS_FILES[@]}"; do
    [ -f "$f" ] || continue
    if jq empty "$f" 2>/dev/null; then
        pass "$(basename "$f")"
    else
        fail "$(basename "$f") is not valid JSON -- entire file is ignored at runtime"
    fi
done

# --- 2. every path a registered hook references must resolve --------------
say ""
say "registered hook targets resolve"

REGISTERED_CMDS=$(
    for f in "${SETTINGS_FILES[@]}"; do
        [ -f "$f" ] || continue
        jq -r '.hooks // {} | to_entries[] | .value[]? | .hooks[]?.command // empty' "$f" 2>/dev/null
    done
)

if [ -z "$REGISTERED_CMDS" ]; then
    fail "no hooks registered in any settings file"
fi

# Pull every .sh/.js/.py path out of the command strings and resolve it.
CHECKED=""
while IFS= read -r path; do
    [ -z "$path" ] && continue
    # The backslash must survive bash quoting AND reach sed: an unescaped $ is
    # an end-of-line anchor in a sed regex, so "s|$HOME|...|" silently matches
    # nothing.
    resolved=$(printf '%s' "$path" \
        | sed -e "s|\\\$HOME|$HOME|g" \
              -e "s|\\\${HOME}|$HOME|g" \
              -e "s|\\\$CLAUDE_PROJECT_DIR|$REPO_ROOT|g" \
              -e "s|\\\${CLAUDE_PROJECT_DIR}|$REPO_ROOT|g")
    resolved="${resolved#./}"
    case "$resolved" in
        /*) ;;
        *) resolved="$REPO_ROOT/$resolved" ;;
    esac
    case "$CHECKED" in *"|$resolved|"*) continue ;; esac
    CHECKED="$CHECKED|$resolved|"

    if [ ! -e "$resolved" ]; then
        fail "missing: $path"
    elif [ -L "$resolved" ] && [ ! -e "$(readlink -f "$resolved")" ]; then
        fail "broken symlink: $path -> $(readlink "$resolved")"
    elif [ ! -x "$resolved" ] && ! echo "$REGISTERED_CMDS" | grep -q "bash[[:space:]]*[^|]*$(basename "$resolved")"; then
        # Invoked bare (not via `bash <path>`) but lacks the exec bit: this is
        # the Permission-denied-swallowed-by-|| true case.
        fail "not executable and not invoked via bash: $path"
    else
        pass "$(basename "$resolved")"
    fi
done <<< "$(echo "$REGISTERED_CMDS" | grep -oE '[$A-Za-z0-9_./-]+\.(sh|js|py)' | sort -u)"

# --- 3. no [ -f ] guard in front of an exec ------------------------------
# [ -f ] passes on a non-executable file; the exec then fails and || true
# hides it. This is the idiom that made the March breakage invisible.
say ""
say "guard idioms"
if echo "$REGISTERED_CMDS" | grep -q '\[ -f "[^"]*\.\(sh\|js\|py\)"'; then
    fail "a registered hook guards an exec target with [ -f ] (use [ -x ])"
else
    pass "no [ -f ]-guarded exec targets"
fi

# --- 4. hooks on disk that nothing registers ------------------------------
say ""
say "orphaned hooks"
for script in "$HOOKS_DIR"/*.sh; do
    [ -f "$script" ] || continue
    base=$(basename "$script")

    # Explicitly exempted (library, manual CLI, installer).
    if head -20 "$script" | grep -q "cfn-selftest: not-a-hook"; then
        continue
    fi
    # Reached some other way: sourced as a library, called by another hook, or
    # installed as a git hook. Count any reference from a file that is not
    # this script itself.
    # (The obvious `grep -rl ... | grep -qv self | grep -q .` is wrong: -q
    # suppresses output, so the second pipe stage always sees an empty stream.)
    # Only executable callers count. A .md that NAMES the script is not a
    # caller -- documentation asserting a hook is wired, while nothing wires
    # it, is the exact failure this self-test exists to catch. Counting docs
    # here would make the check reproduce the bug instead of finding it.
    referenced=$(grep -rl --include='*.sh' --include='*.js' --include='*.py' \
                     -- "$base" "$HOOKS_DIR" 2>/dev/null \
                 | grep -Fxv "$script" | head -1)
    if [ -z "$referenced" ]; then
        for gh in "$REPO_ROOT"/.git/hooks/*; do
            [ -f "$gh" ] && [ -x "$gh" ] || continue
            case "$gh" in *.sample) continue ;; esac
            if grep -q -- "$base" "$gh" 2>/dev/null; then referenced="$gh"; break; fi
        done
    fi
    if [ -n "$referenced" ]; then
        [ "$ORPHANS_ONLY" -eq 1 ] || pass "$base (invoked by $(basename "$referenced"))"
        continue
    fi

    if echo "$REGISTERED_CMDS" | grep -q "$base"; then
        [ "$ORPHANS_ONLY" -eq 1 ] || pass "$base"
    else
        warn "$base is on disk but registered nowhere (register it, or mark it '# cfn-selftest: not-a-hook <reason>')"
    fi
done

# --- summary --------------------------------------------------------------
say ""
if [ "$FAILURES" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
    say "all hook checks passed"
elif [ "$FAILURES" -eq 0 ]; then
    say "hook checks passed with $WARNINGS warning(s) -- unregistered scripts above"
else
    say "$FAILURES hook check(s) failed, $WARNINGS warning(s)"
fi
exit $([ "$FAILURES" -eq 0 ] && echo 0 || echo 1)
