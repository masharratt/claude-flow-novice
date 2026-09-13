#!/usr/bin/env bash
# cfn-wiki page linter.
#
# Contract: wiki_lint <dir> -> exit 0 clean, exit 1 violations.
# Every wiki.md under <dir> (outside .wiki/) must carry:
#   - **Source:** grounding (the feature's file list)
#   - a Status line whose token is in the closed enum
#     prod|beta|dev|stub|deprecated
#   - a wiki:enrich block (the required curated-description section)
# A directory with zero pages is not an error, but the summary must say that
# nothing was examined rather than reporting a bare green.
#
# The two readme projections are validated by cfn-doc-lint itself
# (tests/test-wiki-generate.sh case projections-lint runs it against the
# fixture); this linter owns the per-feature pages and re-checks the status
# vocabulary of readme/feature-status.md when present.

wiki_lint() {
    local dir="${1:?wiki_lint: directory required}"
    if [ ! -d "$dir" ]; then
        echo "wiki lint: no such directory: $dir" >&2
        return 1
    fi

    local errors=0 pages=0 page tok
    while IFS= read -r page; do
        pages=$((pages + 1))
        if ! grep -q '\*\*Source:\*\*' "$page"; then
            echo "ERROR  $page: missing **Source:** grounding"
            errors=$((errors + 1))
        fi
        tok="$(grep -m1 -E '^\*\*Status:\*\*' "$page" | sed 's/^.*\*\*Status:\*\*[[:space:]]*//' | awk '{print $1}')"
        case "$tok" in
            prod|beta|dev|stub|deprecated) ;;
            "")
                echo "ERROR  $page: missing Status line (closed vocab: prod beta dev stub deprecated)"
                errors=$((errors + 1))
                ;;
            *)
                echo "ERROR  $page: status token not in enum: \"$tok\""
                errors=$((errors + 1))
                ;;
        esac
        if ! grep -q '<!-- /wiki:enrich -->' "$page"; then
            echo "ERROR  $page: missing wiki:enrich block (required sections: Source, Status, enrich)"
            errors=$((errors + 1))
        fi
    done < <(find "$dir" -type f -name wiki.md -not -path "*/.wiki/*" | LC_ALL=C sort)

    local fs="$dir/readme/feature-status.md"
    if [ -f "$fs" ]; then
        if ! python3 - "$fs" <<'PY'
import re
import sys

bad = 0
with open(sys.argv[1], encoding="utf-8") as fh:
    lines = fh.readlines()
sc = -1
for lineno, line in enumerate(lines, 1):
    if line.lstrip().startswith("|"):
        if sc == -1:
            cells = [c.strip().lower() for c in line.strip().strip("|").split("|")]
            if "status" in cells:
                sc = cells.index("status") + 1  # split() drops the leading empty cell
            continue
        parts = line.strip().strip("|").split("|")
        if sc <= len(parts):
            value = re.sub(r"[*_`]", "", parts[sc - 1]).strip()
            tok = re.sub(r"[^a-z]", "", value.lower())
            if tok and tok not in ("prod", "beta", "dev", "stub", "deprecated"):
                print('ERROR  %s:%d status-token not in enum: "%s"' % (sys.argv[1], lineno, value))
                bad = 1
        continue
    sc = -1
sys.exit(1 if bad else 0)
PY
        then
            errors=$((errors + 1))
        fi
    fi

    if [ "$pages" -eq 0 ]; then
        echo "wiki lint: 0 wiki.md pages under $dir (nothing examined; not an error)"
    fi
    echo "wiki lint: $pages page(s), $errors error(s)"
    [ "$errors" -eq 0 ]
}
