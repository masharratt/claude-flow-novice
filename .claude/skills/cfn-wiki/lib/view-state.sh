#!/usr/bin/env bash
# cfn-wiki state-machine view: parses the GENERATED readme/state-machines.md
# skeleton (lib/gen-projections.sh output) for the portal payload.
#
# Fixed JSON contract (API — the portal payload assembles from these keys):
#   wiki_view_state <store>   # store = <repo>/.wiki/store.json; the generated
#                             # file is resolved as
#                             # dirname(dirname(store))/readme/state-machines.md
#     -> {
#          "entities": [ {"name": "<entity heading>",
#                         "source": "<Source grounding path:line>",
#                         "states": ["<state token>", ...],
#                         "transitions": [ {"from": "...", "to": "...",
#                                           "trigger": "...", "guard": "..."} ],
#                         "diagram": "<fenced mermaid/ascii body>"} ],
#          "empty": true|false
#        }
#   entities[] empty (or file missing) -> {"entities": [], "empty": true}
#
# Parse rules (match the generator's shape exactly):
#   - entities are NUMBERED H2s only: "## 12. Name" — skips "## Table of
#     Contents", the Status Legend, and any prose heading
#   - "**Source:** <x> (auto-grounded ...)" keeps <x>; a hand-written Source
#     line without the parenthetical is kept whole
#   - "### States" table: first cell of each data row (header + |---| skipped)
#   - "### Transitions" table: 4 cells -> from|to|trigger|guard (header +
#     separator skipped; cells containing an escaped \| split on the first
#     four unescaped pipes only)
#   - "### Diagram": body of the fenced block (mermaid or ascii) without the
#     fence markers; "" when absent
#   - the >300-line rollup's TOC links are not H2s and are ignored
#
# Exit 0 with the JSON object on stdout; exit 1 (stderr note, no stdout) on a
# missing or unreadable store.

wiki_view_state() {
    local store="${1:?wiki_view_state: store path required}"
    if [ ! -f "$store" ]; then
        echo "wiki_view_state: no store at $store (run wiki_extract first)" >&2
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
        pass
except (OSError, ValueError) as exc:
    sys.exit("wiki_view_state: store unreadable: %s" % exc)

store_dir = os.path.dirname(os.path.abspath(sys.argv[1]))
md = os.path.join(os.path.dirname(store_dir), "readme", "state-machines.md")

entities = []
current = None
section = None      # None | "states" | "transitions" | "diagram"
in_fence = False
H2 = re.compile(r"^##\s+(\d+)\.\s+(.+?)\s*$")
SOURCE = re.compile(r"^\*\*Source:\*\*\s*(.+?)\s*$")
SOURCE_ANNO = re.compile(r"\s+\(auto-grounded from \.wiki/store\.json\)\s*$")


def flush():
    global current
    if current is not None:
        entities.append(current)
        current = None


def cells(line):
    # markdown table row -> list of cell strings; escaped \| kept intact by
    # splitting on unescaped pipes only
    body = line.strip()
    if body.startswith("|"):
        body = body[1:]
    if body.endswith("|"):
        body = body[:-1]
    return [c.strip().replace("\\|", "|") for c in re.split(r"(?<!\\)\|", body)]


def is_data_row(row, section):
    if not row or set("".join(row)) <= set("-: "):
        return False  # blank or |---| separator
    head = [c.lower() for c in row]
    if section == "states" and head[0] == "state":
        return False  # generator header "| State | Meaning |"
    if section == "transitions" and head[:4] == ["from", "to", "trigger", "guard"]:
        return False  # generator header row
    return True


if os.path.isfile(md):
    try:
        with open(md, encoding="utf-8") as fh:
            for raw in fh:
                line = raw.rstrip("\n")
                m = H2.match(line)
                if m:
                    flush()
                    current = {"name": m.group(2).strip(), "source": "",
                               "states": [], "transitions": [], "diagram": ""}
                    section = None
                    in_fence = False
                    continue
                if line.startswith("## "):
                    flush()
                    section = None
                    in_fence = False
                    continue
                if current is None:
                    continue
                if line.startswith("Source changed; review"):
                    current["needs_review"] = True
                sm = SOURCE.match(line)
                if sm:
                    current["source"] = SOURCE_ANNO.sub("", sm.group(1)).strip()
                    continue
                if line.startswith("### "):
                    head = line[4:].strip().lower()
                    section = head if head in ("states", "transitions",
                                               "diagram") else None
                    in_fence = False
                    continue
                if section == "diagram":
                    if line.strip().startswith("```"):
                        if in_fence:
                            section = None
                        in_fence = not in_fence
                        continue
                    if in_fence:
                        current["diagram"] += (("\n" if current["diagram"]
                                                else "") + line)
                    continue
                if section in ("states", "transitions") and "|" in line:
                    row = cells(line)
                    if not is_data_row(row, section):
                        continue
                    if section == "states" and row:
                        current["states"].append(row[0])
                    elif section == "transitions" and len(row) >= 4:
                        current["transitions"].append(
                            {"from": row[0], "to": row[1],
                             "trigger": row[2], "guard": row[3]})
    except OSError as exc:
        sys.exit("wiki_view_state: %s unreadable: %s" % (md, exc))
    flush()

print(json.dumps({"entities": entities, "empty": not entities},
                 ensure_ascii=False))
PY
}
