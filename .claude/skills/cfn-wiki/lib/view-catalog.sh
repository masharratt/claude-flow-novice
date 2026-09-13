#!/usr/bin/env bash
# cfn-wiki feature catalog view for the portal payload.
#
# Fixed JSON contract (API — the portal payload assembles from these keys):
#   wiki_view_catalog <store>   # store = <repo>/.wiki/store.json
#     -> {
#          "features": [ {"fid": "<slug>",
#                         "status": "prod"|"beta"|"dev"|"stub"|"deprecated",
#                         "description": "<curated text or ''>",
#                         "files": ["<repo-relative paths>"],
#                         "coupling_count": <number of store.coupling pairs
#                                           touching any of the feature's files>} ],
#          "empty": true|false
#        }
#   features[] empty -> {"features": [], "empty": true}
#
# Enrichment: status and description come from the feature's enrich block at
#   <store-dir>/enrich/blocks/<fid>.md  (the import source per
#   lib/merge-enrichment.sh). Parsed lines:
#   **Status:** <token>        first occurrence; lowercased; anything outside
#                              the closed vocabulary collapses to "dev"
#   **Description:** <text>    first occurrence, rest of line; "" when absent
# A missing block means status "dev" and description "". Status is emitted ONLY
# from the closed vocabulary prod|beta|dev|stub|deprecated (doc-lint contract).
#
# Exit 0 with the JSON object on stdout; exit 1 (stderr note, no stdout) on a
# missing or unreadable store. coupling_count counts co-change PAIRS, not
# summed pair counts.

wiki_view_catalog() {
    local store="${1:?wiki_view_catalog: store path required}"
    if [ ! -f "$store" ]; then
        echo "wiki_view_catalog: no store at $store (run wiki_extract first)" >&2
        return 1
    fi

    python3 - "$store" <<'PY'
import json
import os
import re
import sys

# store load + single-object emit kept per-file across the five view modules:
# the plan's Phase 5 file contract has no shared view helper. (cfn: duplicated
# ~15-line loader, extract into lib/view-common.sh if a 6th view ever lands.)
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        store = json.load(fh)
except (OSError, ValueError) as exc:
    sys.exit("wiki_view_catalog: store unreadable: %s" % exc)

STATUS_VOCAB = ("prod", "beta", "dev", "stub", "deprecated")
STATUS_LINE = re.compile(r"^\*\*Status:\*\*\s*(.+?)\s*$", re.I)
DESC_LINE = re.compile(r"^\*\*Description:\*\*\s*(.*?)\s*$", re.I)

blocks_dir = os.path.join(os.path.dirname(os.path.abspath(sys.argv[1])),
                          "enrich", "blocks")


def parse_block(fid):
    path = os.path.join(blocks_dir, fid + ".md")
    status, desc = None, ""
    if os.path.isfile(path):
        try:
            with open(path, encoding="utf-8") as fh:
                for line in fh:
                    if status is None:
                        m = STATUS_LINE.match(line)
                        if m:
                            token = m.group(1).strip().strip("`").lower()
                            status = token if token in STATUS_VOCAB else "dev"
                    if not desc:
                        m = DESC_LINE.match(line)
                        if m:
                            desc = m.group(1).strip()
        except OSError:
            pass  # unreadable block degrades to the defaults below
    return status or "dev", desc


pairs = store.get("coupling", [])
features = []
for f in store.get("features", []):
    file_set = set(f.get("files", []))
    coupling_count = sum(
        1 for p in pairs if file_set.intersection(p.get("files", [])))
    status, desc = parse_block(f.get("fid", ""))
    features.append({"fid": f.get("fid", ""),
                     "status": status,
                     "description": desc,
                     "files": f.get("files", []),
                     "coupling_count": coupling_count})

print(json.dumps({"features": features, "empty": not features},
                 ensure_ascii=False))
PY
}
