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
# Second blind spot, found 2026-07-25: this script only ever read ~/.claude and
# this repo's settings, so every OTHER project's .claude/settings*.json was
# invisible. cfn-test-memory-guard.sh was registered as a PreToolUse "Bash"
# hook in 16 projects -- firing on every single Bash call -- and section 4
# reported it "registered nowhere". The check meant to catch dead hooks was
# instead mislabelling a very-much-alive one. It now scans $HOME/projects/*/
# .claude/settings*.json too (see SETTINGS_FILES below for the tiering).
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

# Settings live in two tiers and BOTH must be scanned.
#
# Tier 1 (OWN): the user-level settings and this repo's own settings. Hook
# paths in these resolve against THIS repo, so section 2 can check them.
#
# Tier 2 (FOREIGN): every other project's settings under $PROJECTS_ROOT. These
# were invisible until 2026-07-25, and the blind spot produced exactly the
# false negative this self-test exists to prevent: cfn-test-memory-guard.sh was
# registered as a PreToolUse "Bash" hook in 16 separate projects -- firing on
# every Bash call, blocking `npm test` in all 16 -- and this script reported it
# "on disk but registered nowhere". A hook that fires constantly was described
# as dead. Scanning only ~/.claude and only this repo means the self-test is
# blind to the majority of live registrations on the machine.
#
# Glob, never a hardcoded project list -- a list would rot the same way, and a
# newly-cloned project would reintroduce the blind spot silently. Paths are
# collected into an array (readarray -d '' from find -print0), because project
# directories contain spaces ("4Spot Automations") and unquoted word splitting
# would shred them into nonexistent half-paths that then silently `continue`.
PROJECTS_ROOT="${CFN_PROJECTS_ROOT:-$HOME/projects}"

OWN_SETTINGS_FILES=(
    "$HOME/.claude/settings.json"
    "$HOME/.claude/settings.local.json"
    "$REPO_ROOT/.claude/settings.json"
    "$REPO_ROOT/.claude/settings.local.json"
)

FOREIGN_SETTINGS_FILES=()
if [ -d "$PROJECTS_ROOT" ]; then
    while IFS= read -r -d '' f; do
        # Skip this repo -- it is already covered as an OWN settings file, and
        # double-listing it would double every pass/fail line for it.
        case "$f" in "$REPO_ROOT"/*) continue ;; esac
        FOREIGN_SETTINGS_FILES+=("$f")
    # The \( ... \) grouping is load-bearing: `-path A -o -path B -print0`
    # binds -print0 to the second branch only, so settings.json would be
    # printed newline-separated and every space-containing path would break.
    done < <(find "$PROJECTS_ROOT" -mindepth 3 -maxdepth 3 \
                  \( -path '*/.claude/settings.json' \
                     -o -path '*/.claude/settings.local.json' \) \
                  -print0 2>/dev/null)
fi

# Section 1 (parse) and section 4 (orphans) cover both tiers: an unparseable
# per-project settings file silently unloads that project's hooks, and a
# registration in another project still means the script is not an orphan.
SETTINGS_FILES=("${OWN_SETTINGS_FILES[@]}" "${FOREIGN_SETTINGS_FILES[@]}")

# --- 1. every settings file must parse -----------------------------------
# An unparseable settings file unloads silently: no error, no hooks, no clue.
say ""
say "settings files parse"
# Label by <project>/<file>, not bare basename: scanning ~70 settings files
# would otherwise print "settings.local.json" 35 times and a failure line would
# not say WHICH project just lost all its hooks.
settings_label() {
    local d
    d=$(dirname "$(dirname "$1")")
    [ "$d" = "$HOME" ] && d="~"
    printf '%s/%s' "$(basename "$d")" "$(basename "$1")"
}

for f in "${SETTINGS_FILES[@]}"; do
    [ -f "$f" ] || continue
    if jq empty "$f" 2>/dev/null; then
        pass "$(settings_label "$f")"
    else
        fail "$(settings_label "$f") is not valid JSON -- entire file is ignored at runtime"
    fi
done

extract_cmds() {
    for f in "$@"; do
        [ -f "$f" ] || continue
        jq -r '.hooks // {} | to_entries[] | .value[]? | .hooks[]?.command // empty' "$f" 2>/dev/null
    done
}

# Two command sets, deliberately different scopes.
#
# REGISTERED_CMDS -- OWN settings only. Used by sections 2 and 3, the two
# checks that resolve a path or judge an idiom. A foreign project's command
# string cannot be resolved from here: $CLAUDE_PROJECT_DIR in
# ~/projects/daily-seo/.claude/settings.local.json expands to daily-seo's root
# at runtime, not to this repo's, so resolving it against $REPO_ROOT would
# manufacture a path that was never referenced and fail on a file that is
# perfectly fine in situ. Rather than resolve each foreign file against its own
# project root (possible, but it would make this repo's self-test go red for
# breakage in a repo the operator may not even be working in), section 2 stays
# scoped to what this repo is responsible for. Section 3 is scoped the same way
# for the same reason: a bad [ -f ] idiom in another project is a finding for
# that project's run of this script, not for ours.
#
# ALL_REGISTERED_CMDS -- own + foreign. Used only by section 4, where the
# question is "does ANYTHING on this machine register this script", and the
# answer must count other projects or the check reports live hooks as dead.
REGISTERED_CMDS=$(extract_cmds "${OWN_SETTINGS_FILES[@]}")
ALL_REGISTERED_CMDS=$(printf '%s\n%s\n' \
    "$REGISTERED_CMDS" "$(extract_cmds "${FOREIGN_SETTINGS_FILES[@]}")")

# --- 2. every path a registered hook references must resolve --------------
say ""
say "registered hook targets resolve"

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

    # Explicitly exempted (library, manual CLI, installer, superseded tool).
    # Scan the whole leading comment block, not a fixed `head -20`: a marker
    # worth trusting usually comes with a paragraph explaining WHY, and that
    # explanation can easily push the marker past line 20 -- at which point the
    # exemption silently stops working and the script warns forever. awk stops
    # at the first line that is neither the shebang, a comment, nor blank.
    if awk 'NR>1 && !/^[[:space:]]*(#|$)/ {exit} {print}' "$script" \
         | grep -q "cfn-selftest: not-a-hook"; then
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

    # ALL_REGISTERED_CMDS, not REGISTERED_CMDS: registration in ANY project
    # counts. Using the own-settings-only set here is what let a hook wired
    # into 16 projects be reported as "registered nowhere".
    if echo "$ALL_REGISTERED_CMDS" | grep -q "$base"; then
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
