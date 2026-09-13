#!/usr/bin/env bash
# cfn-wiki architecture view: module-level graph for the portal payload.
#
# Fixed JSON contract (API — the portal payload assembles from these keys):
#   wiki_view_arch <store>   # store = <repo>/.wiki/store.json
#     -> {
#          "nodes": [ {"id": "<module name>", "label": "<module name>",
#                      "files": ["<repo-relative paths>"],
#                      "count": <CBM node count for the module, 0 when degraded>} ],
#          "edges": [ {"source": "<module>", "target": "<module>",
#                      "type": "CALLS"|"IMPORTS"|"INHERITS",
#                      "weight": <aggregated cross-module edge count>} ]
#        }
#
#   nodes mirror store.modules (id == label == module name; one node per
#   top-level dir, or the filename itself for repo-root files); count is the
#   snapshot node count (store.modules[].nodes), not the file list length —
#   files already carries the list. edges mirror store.edges 1:1 with
#   count renamed weight; intra-module traffic was already dropped by
#   lib/extract-features.sh, so nothing is re-filtered here.
#
# Exit 0 with the JSON object on stdout; exit 1 (stderr note, no stdout) on a
# missing or unreadable store. Degraded stores (cbm_mode=none) are valid
# input: all module nodes at count 0, empty edges.

wiki_view_arch() {
    local store="${1:?wiki_view_arch: store path required}"
    if [ ! -f "$store" ]; then
        echo "wiki_view_arch: no store at $store (run wiki_extract first)" >&2
        return 1
    fi

    python3 - "$store" <<'PY'
import json
import sys

# store load + single-object emit kept per-file across the five view modules:
# the plan's Phase 5 file contract has no shared view helper. (cfn: duplicated
# ~15-line loader, extract into lib/view-common.sh if a 6th view ever lands.)
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        store = json.load(fh)
except (OSError, ValueError) as exc:
    sys.exit("wiki_view_arch: store unreadable: %s" % exc)

nodes = [{"id": m["name"],
          "label": m["name"],
          "files": m.get("files", []),
          "count": m.get("nodes", 0)}
         for m in store.get("modules", [])]
edges = [{"source": e["source"],
          "target": e["target"],
          "type": e["type"],
          "weight": e.get("count", 0)}
         for e in store.get("edges", [])]
print(json.dumps({"nodes": nodes, "edges": edges}, ensure_ascii=False))
PY
}
