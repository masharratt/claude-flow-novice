#!/usr/bin/env bash
# cfn-wiki portal builder: assembles the payload from the five view modules,
# pre-renders mermaid state diagrams to inline SVG via mmdc (table fallback
# when mmdc is missing or a render fails), then delegates to assemble.py.
#
# Two build modes share one assembly core (portal/assemble.py):
#   wiki_build_portal        single self-contained page (small-wiki default)
#   wiki_build_portal_paged  small shell + pages/<view>.html + pages/
#                            capability-<fid>.html + data/*.json (large
#                            portals; the shell payload holds only
#                            {meta, coverage}, never view payloads or
#                            source excerpts)
#
# Contract: wiki_build_portal <store> <repo> [out]
#   store = <repo>/.wiki/store.json
#   out   = <repo>/.wiki/portal/index.html (default)
# -> writes out; prints the out path on stdout; exit 0.
# A single-file build also clears any pages/ and data/ left by an earlier
# paged build so the distribution always matches the requested mode.
# Exit 1 (message on stderr, no partial output) on: missing store/template,
# a view failure, or a selfcheck violation (placeholder left, payload not
# parseable, any external ref: <link>, src=/href= to http(s), @import,
# url(http) in any built page).
#
# Contract: wiki_build_portal_paged <store> <repo> [out-dir]
#   out-dir = <repo>/.wiki/portal (default)
# -> writes <out-dir>/index.html, <out-dir>/pages/, <out-dir>/data/;
#    prints the out-dir path on stdout; exit 0. Same selfchecks per page
#    plus the shell payload contract in assemble.py.
#
# Payload shape (API, consumed by template.html):
#   {arch, catalog, state, change, data, coverage,
#    meta: {repo, generated_at, stale, degraded, fingerprint}}
#   Paged pages add meta.mode ("paged" | "shell") and meta.page
#   (view name or "capability:<fid>"); single-file pages carry neither.
#   coverage: the `wiki coverage --json` report (three measures with
#             denominators plus excluded/unknown/stale/blocked areas)
#   stale:    store meta.fingerprint differs from the wiki-fp marker in
#             <repo>/readme/feature-status.md (missing file or marker = stale,
#             same rule as wiki sync --check)
#   degraded: "" when the store is snapshot-backed, else a human reason
#   state.entities[i].svg: sanitized inline SVG when mmdc rendered the
#             entity's mermaid diagram; absent -> template renders the
#             transitions table fallback.

# Resolve template + lib dir next to this file.
_wiki_portal_paths() {
    local self_dir
    self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    WIKI_PORTAL_TEMPLATE="$self_dir/template.html"
    WIKI_PORTAL_LIB="$self_dir/../lib"
    WIKI_PORTAL_ASSEMBLE="$self_dir/assemble.py"
}

# Check the inputs both modes need: store, template, assembler, lib views.
# _wiki_portal_check_inputs <store> <template> <assemble> <lib_dir>
_wiki_portal_check_inputs() {
    local store="$1" template="$2" assemble="$3" lib_dir="$4"
    if [ ! -f "$store" ]; then
        echo "wiki_build_portal: no store at $store (run wiki sync first)" >&2
        return 1
    fi
    local f
    for f in "$template" "$assemble"; do
        if [ ! -f "$f" ]; then
            echo "wiki_build_portal: file missing: $f" >&2
            return 1
        fi
    done
    local v
    for v in arch catalog state change data; do
        if [ ! -f "$lib_dir/view-$v.sh" ]; then
            echo "wiki_build_portal: view module missing: $lib_dir/view-$v.sh" >&2
            return 1
        fi
    done
}

# Run the five view modules into <work>/view-<v>.json.
# _wiki_portal_run_views <work> <store> <repo> <lib_dir>
_wiki_portal_run_views() {
    local work="$1" store="$2" repo="$3" lib_dir="$4" v src
    for v in arch catalog state change data; do
        src="$lib_dir/view-$v.sh"
        if ! bash -c 'source "$1" && shift && "$@"' _ "$src" \
                "wiki_view_$v" "$store" "$repo" \
                >"$work/view-$v.json" 2>"$work/view-$v.err"; then
            echo "wiki_build_portal: wiki_view_$v failed: $(tail -1 "$work/view-$v.err")" >&2
            return 1
        fi
    done
}

# Mermaid pre-render (best effort, table fallback on any failure).
# _wiki_portal_render_mermaid <work>
_wiki_portal_render_mermaid() {
    local work="$1"
    command -v mmdc >/dev/null 2>&1 || return 0
    python3 - "$work" <<'PY'
# pick entities whose diagram is a mermaid fence and write one .mmd per entity
import json
import os
import re
import sys

work = sys.argv[1]
with open(os.path.join(work, "view-state.json"), encoding="utf-8") as fh:
    state = json.load(fh)
os.makedirs(os.path.join(work, "mmd"), exist_ok=True)
plan = []
for i, e in enumerate(state.get("entities", [])):
    diagram = (e.get("diagram") or "").strip()
    # mermaid fences start with a diagram keyword; ascii art does not
    if re.match(r"^(stateDiagram|graph|flowchart|sequenceDiagram|classDiagram"
                r"|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph"
                r"|zenuml|sankey|xychart)\b", diagram):
        path = os.path.join(work, "mmd", "%d.mmd" % i)
        with open(path, "w", encoding="utf-8") as out:
            out.write(diagram + "\n")
        plan.append({"index": i, "mmd": path})
with open(os.path.join(work, "mmd", "plan.json"), "w", encoding="utf-8") as out:
    json.dump(plan, out)
PY
    if [ -f "$work/mmd/plan.json" ]; then
        mkdir -p "$work/svg"
        while IFS= read -r mmd; do
            [ -n "$mmd" ] || continue
            idx="$(basename "$mmd" .mmd)"
            timeout 120 mmdc -i "$mmd" -o "$work/svg/$idx.svg" \
                -b transparent >/dev/null 2>&1 || {
                    echo "wiki_build_portal: mmdc failed for entity $idx; using table fallback" >&2
                    rm -f "$work/svg/$idx.svg"
                }
        done < <(find "$work/mmd" -name '*.mmd' | sort)
    fi
}

# Selfcheck one assembled page: no placeholder, payload parses, no external
# refs or remote CSS. _wiki_portal_selfcheck_html <html-file> <label>
_wiki_portal_selfcheck_html() {
    local file="$1" label="$2" built rc=0
    built="$(cat "$file")"
    if printf '%s' "$built" | grep -q '__WIKI_PAYLOAD__'; then
        echo "$label: placeholder left in output" >&2
        rc=1
    fi
    if printf '%s' "$built" | grep -qE '<link|src="http|href="http'; then
        echo "$label: external ref in output (self-contained contract)" >&2
        rc=1
    fi
    if printf '%s' "$built" | grep -qE '@import|url\(["'"'"']?https?:'; then
        echo "$label: remote CSS in output" >&2
        rc=1
    fi
    if [ "$rc" -ne 0 ]; then
        return "$rc"
    fi
    if ! printf '%s' "$built" | python3 -c '
import json, re, sys
html = sys.stdin.read()
m = re.search(r"<script type=\"application/json\" id=\"wiki-payload\">(.*?)</script>",
              html, re.S)
if not m:
    sys.exit("payload script tag missing from built page")
json.loads(m.group(1))   # raises on truncation or bad escaping
'; then
        echo "$label: built payload does not parse" >&2
        return 1
    fi
}

# Atomic single-file install. _wiki_portal_install <file> <out>
_wiki_portal_install() {
    local file="$1" out="$2" install_tmp
    mkdir -p "$(dirname "$out")"
    install_tmp="$(dirname "$out")/.index.html.tmp-$$-$(date +%s)"
    mv "$file" "$install_tmp"
    mv "$install_tmp" "$out"
}

wiki_build_portal() {
    local store="${1:?wiki_build_portal: store path required}"
    local repo="${2:?wiki_build_portal: repo path required}"
    local out="${3:-$repo/.wiki/portal/index.html}"

    _wiki_portal_paths
    _wiki_portal_check_inputs "$store" "$WIKI_PORTAL_TEMPLATE" \
        "$WIKI_PORTAL_ASSEMBLE" "$WIKI_PORTAL_LIB" || return 1

    local work
    work="$(mktemp -d "${TMPDIR:-/tmp}/wiki-build-XXXXXX")"

    if ! _wiki_portal_run_views "$work" "$store" "$repo" "$WIKI_PORTAL_LIB"; then
        rm -rf "$work"
        return 1
    fi
    _wiki_portal_render_mermaid "$work"

    if ! python3 "$WIKI_PORTAL_ASSEMBLE" single "$work" "$store" "$repo" \
            "$WIKI_PORTAL_TEMPLATE" "$WIKI_PORTAL_LIB" \
            "$work/index.html" >/dev/null; then
        echo "wiki_build_portal: payload assembly failed" >&2
        rm -rf "$work"
        return 1
    fi

    # --- selfcheck on the assembled page (hard fail: generator bug) ---------
    if ! _wiki_portal_selfcheck_html "$work/index.html" "wiki_build_portal"; then
        rm -rf "$work"
        return 1
    fi

    # --- atomic install; single mode owns the whole distribution -----------
    local portal_dir
    portal_dir="$(dirname "$out")"
    rm -rf "$portal_dir/pages" "$portal_dir/data"
    _wiki_portal_install "$work/index.html" "$out"
    rm -rf "$work"
    printf '%s\n' "$out"
}

wiki_build_portal_paged() {
    local store="${1:?wiki_build_portal_paged: store path required}"
    local repo="${2:?wiki_build_portal_paged: repo path required}"
    local out_dir="${3:-$repo/.wiki/portal}"

    _wiki_portal_paths
    _wiki_portal_check_inputs "$store" "$WIKI_PORTAL_TEMPLATE" \
        "$WIKI_PORTAL_ASSEMBLE" "$WIKI_PORTAL_LIB" || return 1

    local work
    work="$(mktemp -d "${TMPDIR:-/tmp}/wiki-build-XXXXXX")"

    if ! _wiki_portal_run_views "$work" "$store" "$repo" "$WIKI_PORTAL_LIB"; then
        rm -rf "$work"
        return 1
    fi
    _wiki_portal_render_mermaid "$work"

    if ! python3 "$WIKI_PORTAL_ASSEMBLE" paged "$work" "$store" "$repo" \
            "$WIKI_PORTAL_TEMPLATE" "$WIKI_PORTAL_LIB" \
            "$work/root" >/dev/null; then
        echo "wiki_build_portal_paged: payload assembly failed" >&2
        rm -rf "$work"
        return 1
    fi

    # --- selfcheck every assembled page (hard fail: generator bug) ---------
    local page rc=0
    while IFS= read -r page; do
        if ! _wiki_portal_selfcheck_html "$page" \
                "wiki_build_portal_paged: ${page#"$work/root"/}"; then
            rc=1
        fi
    done < <(find "$work/root" -name '*.html' | sort)
    if [ "$rc" -ne 0 ]; then
        rm -rf "$work"
        return 1
    fi

    # --- install: swap pages/ and data/ in, then the shell atomically ------
    mkdir -p "$out_dir"
    rm -rf "$out_dir/pages" "$out_dir/data"
    mv "$work/root/pages" "$out_dir/pages"
    mv "$work/root/data" "$out_dir/data"
    _wiki_portal_install "$work/root/index.html" "$out_dir/index.html"
    rm -rf "$work"
    printf '%s\n' "$out_dir"
}

# Direct execution entry: wiki_build_portal <store> <repo> [out]
# (the wiki dispatcher sources this file instead).
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    wiki_build_portal "$@"
    exit $?
fi
