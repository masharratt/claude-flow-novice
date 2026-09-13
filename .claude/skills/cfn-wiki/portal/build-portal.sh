#!/usr/bin/env bash
# cfn-wiki portal builder: assembles the payload from the five view modules,
# pre-renders mermaid state diagrams to inline SVG via mmdc (table fallback
# when mmdc is missing or a render fails), inlines everything into
# portal/template.html, and writes the self-contained page atomically.
#
# Contract: wiki_build_portal <store> <repo> [out]
#   store = <repo>/.wiki/store.json
#   out   = <repo>/.wiki/portal/index.html (default)
# -> writes out; prints the out path on stdout; exit 0.
# Exit 1 (message on stderr, no partial output) on: missing store/template,
# a view failure, or a selfcheck violation (placeholder left, payload not
# parseable, any external ref: <link>, src=/href= to http(s), @import,
# url(http) in the built page.
#
# Payload shape (API, consumed by template.html):
#   {arch, catalog, state, change, data,
#    meta: {repo, generated_at, stale, degraded, fingerprint}}
#   stale:    store meta.fingerprint differs from the wiki-fp marker in
#             <repo>/readme/feature-status.md (missing file or marker = stale,
#             same rule as wiki sync --check)
#   degraded: "" when the store is snapshot-backed, else a human reason
#   state.entities[i].svg: sanitized inline SVG when mmdc rendered the
#             entity's mermaid diagram; absent -> template renders the
#             transitions table fallback.

wiki_build_portal() {
    local store="${1:?wiki_build_portal: store path required}"
    local repo="${2:?wiki_build_portal: repo path required}"
    local out="${3:-$repo/.wiki/portal/index.html}"

    if [ ! -f "$store" ]; then
        echo "wiki_build_portal: no store at $store (run wiki sync first)" >&2
        return 1
    fi
    local portal_dir self_dir
    self_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local template="$self_dir/template.html"
    local lib_dir="$self_dir/../lib"
    if [ ! -f "$template" ]; then
        echo "wiki_build_portal: template missing: $template" >&2
        return 1
    fi

    local work
    work="$(mktemp -d "${TMPDIR:-/tmp}/wiki-build-XXXXXX")"

    # --- run the five views ------------------------------------------------
    local v src
    for v in arch catalog state change data; do
        src="$lib_dir/view-$v.sh"
        if [ ! -f "$src" ]; then
            echo "wiki_build_portal: view module missing: $src" >&2
            rm -rf "$work"
            return 1
        fi
        if ! bash -c 'source "$1" && shift && "$@"' _ "$src" \
                "wiki_view_$v" "$store" "$repo" \
                >"$work/view-$v.json" 2>"$work/view-$v.err"; then
            echo "wiki_build_portal: wiki_view_$v failed: $(tail -1 "$work/view-$v.err")" >&2
            rm -rf "$work"
            return 1
        fi
    done

    # --- mermaid pre-render (best effort, table fallback on any failure) ---
    if command -v mmdc >/dev/null 2>&1; then
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
    fi

    # --- assemble payload + inline into the template ------------------------
    if ! python3 - "$work" "$store" "$repo" "$template" <<'PY' >/dev/null
# merge the five views, attach sanitized mermaid SVGs, compute meta, inline
import glob
import json
import os
import re
import subprocess
import sys
import uuid
from datetime import datetime, timezone

work, store_path, repo, template_path = (
    sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])


def load(name):
    with open(os.path.join(work, name), encoding="utf-8") as fh:
        return json.load(fh)


arch = load("view-arch.json")
catalog = load("view-catalog.json")
state = load("view-state.json")
change = load("view-change.json")
data = load("view-data.json")

with open(store_path, encoding="utf-8") as fh:
    store = json.load(fh)
meta = store.get("meta", {})

# stale: same rule as wiki sync --check (marker vs fresh fingerprint)
stale = True
marker = ""
fs_path = os.path.join(repo, "readme", "feature-status.md")
if os.path.isfile(fs_path):
    try:
        with open(fs_path, encoding="utf-8") as fh:
            for line in fh:
                m = re.search(r"wiki-fp:\s*([0-9a-f]{64})", line)
                if m:
                    marker = m.group(1)
                    break
    except OSError:
        pass
fp = meta.get("fingerprint", "")
if marker and fp and marker == fp:
    stale = False

degraded = ""
if meta.get("cbm_mode") != "snapshot":
    degraded = ("CBM snapshot unavailable: git-only extraction"
                " (edges and node counts are approximate;"
                " run: wiki doctor --install)")

# attach sanitized mmdc SVGs (fail closed: anything suspicious -> no svg)
MERMAID_SVG_SAFE_HREF = re.compile(r"(?:xlink:)?href\s*=\s*[\"']\s*(?:https?:)?//",
                                   re.I)


def sanitize_svg(text):
    m = re.search(r"<svg[\s\S]*</svg>", text)
    if not m:
        return None
    svg = m.group(0)
    if re.search(r"<script\b", svg, re.I):
        return None
    if re.search(r"@import\b", svg, re.I):
        return None
    if MERMAID_SVG_SAFE_HREF.search(svg):
        return None
    if re.search(r"url\(\s*[\"']?\s*(?:https?:)?//", svg, re.I):
        return None
    if re.search(r"data:text/html", svg, re.I):
        return None
    return svg


plan_path = os.path.join(work, "mmd", "plan.json")
if os.path.isfile(plan_path):
    with open(plan_path, encoding="utf-8") as fh:
        plan = json.load(fh)
    for item in plan:
        svg_path = os.path.join(work, "svg", "%d.svg" % item["index"])
        if not os.path.isfile(svg_path):
            continue  # mmdc failed or missing; table fallback stands
        try:
            with open(svg_path, encoding="utf-8") as fh:
                svg = sanitize_svg(fh.read())
        except OSError:
            svg = None
        if svg:
            state["entities"][item["index"]]["svg"] = svg

payload = {
    "arch": arch,
    "catalog": catalog,
    "state": state,
    "change": change,
    "data": data,
    "meta": {
        "repo": os.path.basename(os.path.normpath(repo)),
        "generated_at": datetime.now(timezone.utc)
            .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stale": stale,
        "degraded": degraded,
        "fingerprint": fp,
    },
}

with open(template_path, encoding="utf-8") as fh:
    html = fh.read()
placeholder = "__WIKI_PAYLOAD__"
if placeholder not in html:
    sys.exit("wiki_build_portal: template has no %s slot" % placeholder)

# `</` inside JSON strings becomes the valid escape `<\/`, so a literal
# "</script>" in a description can never close the payload tag early
blob = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
html = html.replace(placeholder, blob)

out_html = os.path.join(work, "index.html")
tmp = out_html + ".tmp-" + uuid.uuid4().hex
with open(tmp, "w", encoding="utf-8") as fh:
    fh.write(html)
os.replace(tmp, out_html)
print(out_html)
PY
    then
        echo "wiki_build_portal: payload assembly failed" >&2
        rm -rf "$work"
        return 1
    fi

    # --- selfcheck on the assembled page (hard fail: generator bug) ---------
    local built
    built="$(cat "$work/index.html")"
    local rc=0
    {
        if printf '%s' "$built" | grep -q '__WIKI_PAYLOAD__'; then
            echo "wiki_build_portal: placeholder left in output" >&2
            rc=1
        fi
        if printf '%s' "$built" | grep -qE '<link|src="http|href="http'; then
            echo "wiki_build_portal: external ref in output (self-contained contract)" >&2
            rc=1
        fi
        if printf '%s' "$built" | grep -qE '@import|url\(["'"'"']?https?:'; then
            echo "wiki_build_portal: remote CSS in output" >&2
            rc=1
        fi
    }
    if [ "$rc" -ne 0 ]; then
        rm -rf "$work"
        return 1
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
        echo "wiki_build_portal: built payload does not parse" >&2
        rm -rf "$work"
        return 1
    fi

    # --- atomic install ------------------------------------------------------
    mkdir -p "$(dirname "$out")"
    local install_tmp
    install_tmp="$(dirname "$out")/.index.html.tmp-$$-$(date +%s)"
    mv "$work/index.html" "$install_tmp"
    mv "$install_tmp" "$out"
    rm -rf "$work"
    printf '%s\n' "$out"
}

# Direct execution entry: wiki_build_portal <store> <repo> [out]
# (the wiki dispatcher sources this file instead).
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    wiki_build_portal "$@"
    exit $?
fi
