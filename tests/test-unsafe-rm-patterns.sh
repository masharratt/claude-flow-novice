#!/usr/bin/env bash
# tests/test-unsafe-rm-patterns.sh
# Lint: shell patterns that can turn a temp-dir cleanup into `rm -rf <repo>`.
#
# Incident 2026-10-15: `TEST_TMP=$(cd "$(mktemp -d -t X)" && pwd -P)`. mktemp
# failed in a sandbox, `cd ""` stayed in the cwd, TEST_TMP became the repo root
# and the EXIT trap rm -rf'd the repo, .git included. The runtime guard is
# cfn_safe_rm_tmp (.claude/cfn-scripts/lib/safe-rm.sh); this lint stops the
# pattern from coming back.
#
# Scope: every *.sh under tests/ and .claude/ (tracked plus untracked, not
# gitignored), except tests/fixtures/unsafe-rm/ (this lint's own fixtures) and
# any .trash/ dir. Comment-only lines are skipped.
#
# Rules
#   HARD BAN (zero allowed anywhere):
#     cd-mktemp      `cd "$(mktemp ...` or `cd $(mktemp ...` (any cd flags).
#                    A failed mktemp makes this `cd ""`, which succeeds.
#   RATCHET (per-file count may only go down; a file absent from the baseline
#   must have zero):
#     rm-var         `rm -r*` / `rm -fr` / `rm --recursive` whose target has a
#                    `$`. Exempt when every variable target starts with a
#                    literal temp prefix (/tmp/, /private/tmp/, /var/folders/,
#                    /private/var/folders/) and every `$` in it is a
#                    `${NAME:?}` guard. Fix: delete through cfn_safe_rm_tmp.
#                    Baseline: tests/fixtures/unsafe-rm-baseline.txt
#     mktemp-unchecked  `VAR=$(mktemp ...)` with no `|| exit`, `|| return` or
#                    `|| {` on the same line or the next line (an `if`/`elif`
#                    line counts as handled). `set -e` does NOT count: it is
#                    not reliable inside command substitutions, pipelines,
#                    functions called from conditions, or traps.
#                    Baseline: tests/fixtures/unhandled-mktemp-baseline.txt
#     The brief asked for mktemp-unchecked as a hard ban; 362 existing sites
#     (many in skill dirs) made that a red CI on day one, so it ratchets until
#     the existing sites are fixed. Promote it once its baseline is empty.
#
# Exit codes: 0 clean, 1 findings, 2 scanned zero files (certified nothing).
#
# Usage
#   tests/test-unsafe-rm-patterns.sh              self-test on fixtures, then scan repo
#   tests/test-unsafe-rm-patterns.sh --scan-only  [--root DIR] [--rm-baseline F] [--mktemp-baseline F]
#   tests/test-unsafe-rm-patterns.sh --write-baseline   regenerate both baselines (only
#                                                        after fixing sites; review the diff)
set -u

SELF="${BASH_SOURCE[0]}"
REPO=$(cd "$(dirname "$SELF")/.." && pwd -P) || exit 1
FIXTURES="$REPO/tests/fixtures/unsafe-rm"
RM_BASELINE_DEFAULT="$REPO/tests/fixtures/unsafe-rm-baseline.txt"
MK_BASELINE_DEFAULT="$REPO/tests/fixtures/unhandled-mktemp-baseline.txt"

# list_files ROOT -> relative *.sh paths in scope, one per line
list_files() {
    local root="$1"
    if [ "$root" = "$REPO" ] && git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        git -C "$REPO" ls-files -co --exclude-standard -- 'tests/*.sh' '.claude/*.sh' \
            | grep -v '^tests/fixtures/unsafe-rm/' | grep -v '/\.trash/' \
            | while IFS= read -r f; do [ -f "$REPO/$f" ] && printf '%s\n' "$f"; done
    else
        (cd "$root" && find . -name '*.sh' -type f | sed 's|^\./||' | sort)
    fi
}

# scan ROOT FILELIST -> lines "KIND<TAB>file<TAB>line<TAB>text"
scan() {
    local root="$1" list="$2"
    [ -s "$list" ] || return 0
    (cd "$root" && tr '\n' '\0' <"$list" | xargs -0 awk -v q="'" '
        # q holds a single quote: regexes that need one are built as strings
        # (an octal escape in a regex literal is not portable across awks).
        BEGIN {
            DELIM = "(^|[;&|({ \t`!\"" q "])"
            RM_RE = DELIM "rm[ \t]+(-[A-Za-z]*[rR][A-Za-z]*|--recursive)([ \t]|$)"
            CD_RE = DELIM "cd([ \t]+-[A-Za-z@]+)*[ \t]+\"?[$][(]mktemp"
            QUOTES = "[\"" q "]"
        }
        function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
        function emit(kind, ln, txt) { printf "%s\t%s\t%d\t%s\n", kind, FILENAME, ln, trim(txt) }
        function handled(s) { return s ~ /\|\|[ \t]*(exit|return|\{)/ }
        function flush_pending() {
            if (pend_ln) { printf "mktemp-unchecked\t%s\t%d\t%s\n", pend_file, pend_ln, trim(pend_txt) }
            pend_ln = 0
        }
        # true when every $ in tok is a ${NAME:?} guard and tok starts with a
        # literal temp prefix
        function guarded_tmp(tok,    t) {
            t = tok; gsub(QUOTES, "", t)
            if (t !~ /^\/(private\/)?(tmp|var\/folders)\//) return 0
            gsub(/\$\{[A-Za-z_][A-Za-z0-9_]*:\?[^}]*\}/, "", t)
            return t !~ /\$/
        }
        function rm_var(line,    m, rest, n, toks, i, bad) {
            if (!match(line, RM_RE)) return 0
            rest = substr(line, RSTART + RLENGTH)
            sub(/[;&|)`].*$/, "", rest)
            if (rest !~ /\$/) return 0
            n = split(rest, toks, /[ \t]+/); bad = 0
            for (i = 1; i <= n; i++) {
                if (toks[i] == "" || toks[i] ~ /^-/ ) continue
                if (toks[i] ~ /\$/ && !guarded_tmp(toks[i])) bad = 1
            }
            return bad
        }
        FNR == 1 { flush_pending() }
        {
            line = $0
            if (pend_ln) {
                if (handled(line)) pend_ln = 0; else flush_pending()
            }
            if (line ~ /^[ \t]*#/) next
            if (line ~ CD_RE) {
                emit("cd-mktemp", FNR, line); next
            }
            if (line ~ /[A-Za-z_][A-Za-z0-9_]*="?\$\(mktemp/ && !handled(line) && line !~ /^[ \t]*(if|elif)[ \t]/) {
                pend_ln = FNR; pend_txt = line; pend_file = FILENAME
            }
            if (rm_var(line)) emit("rm-var", FNR, line)
        }
        END { flush_pending() }
    ')
}

# count_by_file FINDINGS KIND -> "file count" lines, sorted
count_by_file() {
    awk -F'\t' -v k="$2" '$1 == k { c[$2]++ } END { for (f in c) print f, c[f] }' "$1" | sort
}

# run_scan ROOT RM_BASELINE MK_BASELINE -> prints report, returns 0/1/2
run_scan() {
    local root="$1" rmb="$2" mkb="$3" work list findings nfiles rc=0
    work=$(mktemp -d "${TMPDIR:-/tmp}/unsafe-rm-lint.XXXXXX") || return 1
    list="$work/files"; findings="$work/findings"
    list_files "$root" >"$list"
    nfiles=$(grep -c . "$list" 2>/dev/null || true); nfiles=${nfiles:-0}
    if [ "$nfiles" -eq 0 ]; then
        echo "unsafe-rm lint: scanned 0 files under $root: certified nothing"
        cfn_safe_rm_tmp "$work"; return 2
    fi
    scan "$root" "$list" >"$findings"

    local hard
    hard=$(awk -F'\t' '$1 == "cd-mktemp" { printf "  %s:%s: %s\n", $2, $3, $4 }' "$findings")
    if [ -n "$hard" ]; then
        echo "HARD BAN cd-mktemp: unexpected=["
        printf '%s\n' "$hard"
        echo "]  fix: VAR=\$(mktemp -d ...) || exit 1; VAR=\$(cd -P \"\$VAR\" && pwd -P) || exit 1"
        rc=1
    fi

    local kind base f cur allowed total_cur total_base over
    for kind in rm-var mktemp-unchecked; do
        if [ "$kind" = rm-var ]; then base="$rmb"; else base="$mkb"; fi
        [ -f "$base" ] || : >"$work/empty-baseline"
        [ -f "$base" ] || base="$work/empty-baseline"
        count_by_file "$findings" "$kind" >"$work/$kind.cur"
        over=""
        while read -r f cur; do
            [ -n "$f" ] || continue
            allowed=$(awk -v f="$f" '$1 == f { print $2; exit }' "$base")
            allowed=${allowed:-0}
            if [ "$cur" -gt "$allowed" ]; then
                over="$over$f has $cur, baseline $allowed
$(awk -F'\t' -v k="$kind" -v f="$f" '$1 == k && $2 == f { printf "    %s:%s: %s\n", $2, $3, $4 }' "$findings")
"
            fi
        done <"$work/$kind.cur"
        total_cur=$(awk '{ s += $2 } END { print s + 0 }' "$work/$kind.cur")
        total_base=$(awk '!/^#/ { s += $2 } END { print s + 0 }' "$base")
        if [ -n "$over" ]; then
            echo "RATCHET $kind: unexpected=[ (count over baseline; all sites in the file listed)"
            printf '%s' "$over" | sed 's/^/  /'
            echo "]  fix: delete temp dirs via cfn_safe_rm_tmp; add '|| exit 1' after mktemp"
            rc=1
        else
            echo "ratchet $kind: ok ($total_cur sites, baseline $total_base)"
        fi
        if [ "$total_cur" -lt "$total_base" ] && [ "$rc" -eq 0 ]; then
            echo "  note: $kind went down; lock it in with --write-baseline"
        fi
    done

    echo "unsafe-rm lint: scanned $nfiles files under $root: $([ "$rc" -eq 0 ] && echo clean || echo FINDINGS)"
    cfn_safe_rm_tmp "$work"
    return "$rc"
}

# shellcheck source=/dev/null
source "$REPO/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1

write_baseline() {
    local work
    work=$(mktemp -d "${TMPDIR:-/tmp}/unsafe-rm-lint.XXXXXX") || return 1
    list_files "$REPO" >"$work/files"
    scan "$REPO" "$work/files" >"$work/findings"
    { echo "# file count: recursive delete of a \$VAR target not via cfn_safe_rm_tmp. May only go down."
      echo "# Regenerate: tests/test-unsafe-rm-patterns.sh --write-baseline"
      count_by_file "$work/findings" rm-var; } >"$RM_BASELINE_DEFAULT"
    { echo "# file count: VAR=\$(mktemp ...) with no || exit/return/{ on that or the next line. May only go down."
      echo "# Regenerate: tests/test-unsafe-rm-patterns.sh --write-baseline"
      count_by_file "$work/findings" mktemp-unchecked; } >"$MK_BASELINE_DEFAULT"
    echo "wrote $RM_BASELINE_DEFAULT ($(grep -vc '^#' "$RM_BASELINE_DEFAULT") files)"
    echo "wrote $MK_BASELINE_DEFAULT ($(grep -vc '^#' "$MK_BASELINE_DEFAULT") files)"
    cfn_safe_rm_tmp "$work"
}

# Self-test: the lint must go red on every banned pattern and green on safe code.
self_test() {
    local pass=0 fail=0 out rc case_dir
    expect() { # NAME DIR WANT_RC [GREP_PATTERN]
        local name="$1" dir="$2" want="$3" pat="${4:-}"
        out=$(run_scan "$dir" "$dir/rm-baseline.txt" "$dir/mktemp-baseline.txt" 2>&1); rc=$?
        if [ "$rc" -eq "$want" ] && { [ -z "$pat" ] || printf '%s' "$out" | grep -qE "$pat"; }; then
            pass=$((pass + 1)); echo "  ok   $name"
        else
            fail=$((fail + 1)); echo "  FAIL $name (rc=$rc want=$want pattern=[$pat])"; printf '%s\n' "$out" | sed 's/^/       /'
        fi
    }
    echo "self-test on $FIXTURES"
    expect "cd \"\$(mktemp\" is a hard failure"      "$FIXTURES/cd-mktemp-quoted"   1 'HARD BAN cd-mktemp.*|bad\.sh:4:'
    expect "cd \$(mktemp (unquoted) is a hard failure" "$FIXTURES/cd-mktemp-unquoted" 1 'bad\.sh:4: .*cd \$\(mktemp'
    expect "cd -P \"\$(mktemp\" is a hard failure"   "$FIXTURES/cd-mktemp-flag"     1 'bad\.sh:4:'
    expect "hard ban ignores the baseline"           "$FIXTURES/cd-mktemp-baselined" 1 'HARD BAN'
    expect "unchecked mktemp in a new file fails"    "$FIXTURES/mktemp-unchecked"   1 'RATCHET mktemp-unchecked.*|bad\.sh has 2, baseline 0'
    expect "recursive delete of \$VAR in a new file fails" "$FIXTURES/rm-var-new"         1 'bad\.sh has 3, baseline 0'
    expect "recursive-delete count over baseline fails" "$FIXTURES/rm-var-over"        1 'grow\.sh has 2, baseline 1'
    expect "recursive-delete count at/below baseline ok" "$FIXTURES/rm-var-at-baseline" 0 'ratchet rm-var: ok'
    expect "safe patterns pass"                      "$FIXTURES/clean"              0 'scanned 1 files.*clean'
    expect "zero files scanned exits 2"              "$FIXTURES/empty"              2 'scanned 0 files'
    echo "self-test: $pass passed, $fail failed"
    [ "$fail" -eq 0 ]
}

case "${1:-}" in
    --write-baseline) write_baseline; exit $? ;;
    --scan-only)
        shift
        root="$REPO"; rmb="$RM_BASELINE_DEFAULT"; mkb="$MK_BASELINE_DEFAULT"
        while [ "$#" -gt 0 ]; do
            case "$1" in
                --root) root=$(cd "$2" && pwd -P) || exit 2; shift 2 ;;
                --rm-baseline) rmb="$2"; shift 2 ;;
                --mktemp-baseline) mkb="$2"; shift 2 ;;
                *) echo "unknown arg: $1" >&2; exit 2 ;;
            esac
        done
        run_scan "$root" "$rmb" "$mkb"; exit $? ;;
    "") ;;
    *) echo "usage: $0 [--scan-only [--root DIR] [--rm-baseline F] [--mktemp-baseline F] | --write-baseline]" >&2; exit 2 ;;
esac

self_test || { echo "unsafe-rm lint self-test FAILED: the lint cannot be trusted"; exit 1; }
echo
run_scan "$REPO" "$RM_BASELINE_DEFAULT" "$MK_BASELINE_DEFAULT"
