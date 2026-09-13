#!/usr/bin/env bash
# tests/test-wiki-views.sh - cfn-wiki Phase 5 harness.
# Covers the five view modules and their fixed JSON contracts (the portal
# payload assembles from these, so key names are API):
#   view-arch.sh    (arch-counts):     module nodes/edges from the store, counts
#                                      cross-checked against the sqlite snapshot
#                                      (real CBM when a binary resolves, else a
#                                      synthetic .wiki/cache/cbm.db built to the
#                                      schema lib/extract-features.sh reads)
#   view-catalog.sh (catalog-vocab):   closed status tokens only, enrich-block
#                                      status/description parse, empty store ->
#                                      empty-state payload
#   view-state.sh   (state-entities):  every generated fixture entity parsed with
#                                      Source grounding; missing file -> empty
#   view-change.sh  (change-window):   commits/hotspots/story agree with an
#                                      independent `git log --name-only` walk and
#                                      with hand-crafted dated commits; window
#                                      excludes older commits
#   view-data.sh    (data-degraded):   no .env / psql-less / unreachable /
#                                      include_data_in_md=false all exit 0 with a
#                                      degraded payload; no connection string ever
#                                      reaches output; live psql path is env-gated
#                                      (WIKI_VIEWS_TEST_DB_URL or a scratch db on a
#                                      reachable localhost) and skips otherwise.
# Plan: fuzzy-whistling-eich Phase 5.
# Isolation: every case runs in temp dirs; the shipped fixture is never written.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$ROOT/.claude/skills/cfn-wiki/lib"
FIXTURE="$ROOT/tests/fixtures/wiki-fixture-repo"

T="$(mktemp -d "${TMPDIR:-/tmp}/wiki-views-test-XXXXXX")"
cleanup() { rm -rf "$T"; }
trap cleanup EXIT

PASS=0; FAIL=0; SKIP=0
ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
no()   { echo "FAIL: $1"; FAIL=$((FAIL+1)); }
skip() { echo "SKIP: $1"; SKIP=$((SKIP+1)); }

for dep in bash python3 git mktemp; do
    command -v "$dep" >/dev/null 2>&1 || { echo "FATAL: $dep not on PATH"; exit 1; }
done

# Run a view function in a clean subshell. Captures stdout into VIEW_JSON and
# the exit code into VIEW_RC: run_view <lib.sh> <fn> [args...]
VIEW_JSON=""; VIEW_RC=0
run_view() {
    local lib="$1"; shift
    VIEW_RC=0
    VIEW_JSON="$(bash -c '
        set -uo pipefail
        source "$1"
        shift
        "$@"
    ' _ "$lib" "$@" 2>"$T/view.stderr")" || VIEW_RC=$?
}

# Evaluate a python expression over JSON saved at $1: json_get <file> <expr>
json_get() {
    python3 -c '
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    d = json.load(fh)
print(eval(sys.argv[2]))
' "$1" "$2"
}

# Save $VIEW_JSON to a temp file and print its path: save_view <name>
save_view() {
    local f="$T/$1.json"
    printf '%s' "$VIEW_JSON" >"$f"
    printf '%s' "$f"
}

# Assert stdout was exactly one valid JSON object (single parse, dict).
is_one_json_object() { # <label>
    python3 -c '
import json, sys
raw = open(sys.argv[1], encoding="utf-8").read()
d = json.loads(raw)          # raises on trailing junk / two objects
sys.exit(0 if isinstance(d, dict) else 1)
' "$1" 2>/dev/null
}

# Copy the fixture source tree (no .wiki, no readme) to <dest>.
make_repo_copy() { # <dest>
    mkdir -p "$1"
    cp -r "$FIXTURE/." "$1/"
    rm -rf "$1/.wiki" "$1/readme"
}

# Synthetic CBM snapshot built to the exact schema lib/extract-features.sh
# reads (nodes: id, file_path; edges: source_id, target_id, type). Gives the
# arch case a deterministic snapshot even where no CBM binary is installed.
make_synthetic_cbm() { # <repo>
    python3 - "$1" <<'PY'
import os
import sqlite3
import sys

db = os.path.join(sys.argv[1], ".wiki", "cache", "cbm.db")
os.makedirs(os.path.dirname(db), exist_ok=True)
conn = sqlite3.connect(db)
conn.executescript("""
CREATE TABLE nodes (id INTEGER PRIMARY KEY, file_path TEXT);
CREATE TABLE edges (source_id INTEGER, target_id INTEGER, type TEXT);
""")
conn.executemany("INSERT INTO nodes (id, file_path) VALUES (?, ?)", [
    (1, "parsing/parser.py"),
    (2, "parsing/regexes.py"),
    (3, "reporting/reporter.py"),
    (4, "main.py"),
    (5, "util.py"),
    (6, "<python-builtins>"),   # structural node: no file, must be dropped
])
conn.executemany("INSERT INTO edges (source_id, target_id, type) VALUES (?, ?, ?)", [
    (1, 3, "IMPORTS"),   # parsing -> reporting
    (3, 1, "CALLS"),     # reporting -> parsing
    (4, 1, "IMPORTS"),   # main.py -> parsing
    (1, 2, "CALLS"),     # intra-module (parsing -> parsing): dropped
    (2, 1, "IMPORTS"),   # intra-module: dropped
    (4, 6, "CALLS"),     # target has no usable file: dropped
])
conn.commit()
conn.close()
PY
}

# ---------------------------------------------------------------------------
case_arch_counts() {
    if [ ! -f "$LIB/view-arch.sh" ]; then no "arch-counts: lib/view-arch.sh exists"; return; fi
    ok "arch-counts: lib/view-arch.sh exists"

    # missing store fails loudly
    run_view "$LIB/view-arch.sh" wiki_view_arch "$T/never-was.json"
    if [ "$VIEW_RC" -ne 0 ] && [ -z "$VIEW_JSON" ]; then
        ok "arch-counts: missing store exits nonzero with no stdout"
    else
        no "arch-counts: missing store rc=$VIEW_RC (want nonzero, silent stdout)"
    fi

    # deterministic path: synthetic snapshot -> extract -> view
    local REPO="$T/arch-$$_syn"
    make_repo_copy "$REPO"
    make_synthetic_cbm "$REPO"
    if bash -c '
        set -uo pipefail
        source "$1/extract-features.sh"
        wiki_extract "$2"
    ' _ "$LIB" "$REPO" >"$T/arch-extract.log" 2>&1; then
        ok "arch-counts: extract over synthetic snapshot exit 0"
    else
        no "arch-counts: extract failed: $(tail -3 "$T/arch-extract.log")"
        return
    fi

    local store="$REPO/.wiki/store.json"
    local mode
    mode="$(json_get "$store" "d['meta']['cbm_mode']")"
    [ "$mode" = "snapshot" ] \
        && ok "arch-counts: synthetic snapshot picked up (cbm_mode=snapshot)" \
        || no "arch-counts: cbm_mode=$mode (want snapshot)"

    run_view "$LIB/view-arch.sh" wiki_view_arch "$store"
    [ "$VIEW_RC" -eq 0 ] && ok "arch-counts: wiki_view_arch exit 0" \
        || { no "arch-counts: view exit=$VIEW_RC: $(tail -2 "$T/view.stderr")"; return; }
    local out
    out="$(save_view arch-syn)"
    is_one_json_object "$out" \
        && ok "arch-counts: stdout is exactly one JSON object" \
        || no "arch-counts: stdout is not a single JSON object"
    local keys
    keys="$(json_get "$out" "sorted(d.keys())")"
    [ "$keys" = "['edges', 'nodes']" ] \
        && ok "arch-counts: top-level keys exactly nodes+edges" \
        || no "arch-counts: top-level keys=$keys"

    # node counts must match the snapshot (module = top-level dir; the
    # structural <python-builtins> node has no file and must not appear)
    local counts
    counts="$(json_get "$out" "sorted((n['id'], n['count']) for n in d['nodes'])")"
    [ "$counts" = "[('main.py', 1), ('parsing', 2), ('reporting', 1), ('service.py', 0), ('src', 0), ('util.py', 1)]" ] \
        && ok "arch-counts: node counts match snapshot per module (structural node dropped)" \
        || no "arch-counts: node counts=$counts"
    keys="$(json_get "$out" "sorted(d['nodes'][0].keys())")"
    [ "$keys" = "['count', 'files', 'id', 'label']" ] \
        && ok "arch-counts: node keys exactly id/label/files/count" \
        || no "arch-counts: node keys=$keys"

    # edges: only cross-module, both-endpoint-known, CALLS/IMPORTS/INHERITS;
    # aggregated per (source, target, type) with weight
    local edges
    edges="$(json_get "$out" "sorted((e['source'], e['target'], e['type'], e['weight']) for e in d['edges'])")"
    [ "$edges" = "[('main.py', 'parsing', 'IMPORTS', 1), ('parsing', 'reporting', 'IMPORTS', 1), ('reporting', 'parsing', 'CALLS', 1)]" ] \
        && ok "arch-counts: edge set matches snapshot (intra-module + no-file dropped)" \
        || no "arch-counts: edges=$edges"

    # independent cross-check: view weight total == usable cross-module edges
    # counted straight from the synthetic sqlite snapshot
    local view_total snap_total
    view_total="$(json_get "$out" "sum(e['weight'] for e in d['edges'])")"
    snap_total="$(python3 - "$REPO" <<'PY'
import os
import sqlite3
import sys

conn = sqlite3.connect("file:%s/.wiki/cache/cbm.db?mode=ro" % sys.argv[1], uri=True)
nodes = {nid: (fp or "") for nid, fp in conn.execute("SELECT id, file_path FROM nodes")}
total = 0
for sid, tid, etype in conn.execute("SELECT source_id, target_id, type FROM edges"):
    if (etype or "").upper() not in ("CALLS", "IMPORTS", "INHERITS"):
        continue
    a, b = nodes.get(sid, ""), nodes.get(tid, "")
    if not a or not b or a.startswith("<") or b.startswith("<"):
        continue
    if a.split("/", 1)[0] != b.split("/", 1)[0]:
        total += 1
conn.close()
print(total)
PY
)"
    [ "$view_total" = "$snap_total" ] \
        && ok "arch-counts: edge weight total == snapshot cross-module edges ($view_total)" \
        || no "arch-counts: weight total $view_total != snapshot $snap_total"

    # degraded store (no snapshot): all module nodes with count 0, zero edges
    local REPO2="$T/arch-$$_deg"
    make_repo_copy "$REPO2"
    bash -c '
        set -uo pipefail
        source "$1/extract-features.sh"
        wiki_extract "$2"
    ' _ "$LIB" "$REPO2" >/dev/null 2>&1 || { no "arch-counts: degraded extract failed"; return; }
    run_view "$LIB/view-arch.sh" wiki_view_arch "$REPO2/.wiki/store.json"
    [ "$VIEW_RC" -eq 0 ] && ok "arch-counts: degraded view exit 0" \
        || no "arch-counts: degraded view exit=$VIEW_RC"
    out="$(save_view arch-deg)"
    [ "$(json_get "$out" "len(d['nodes'])")" -ge 5 ] \
        && ok "arch-counts: degraded still emits module nodes" \
        || no "arch-counts: degraded node list too short"
    [ "$(json_get "$out" "len(d['edges'])")" -eq 0 ] \
        && ok "arch-counts: degraded edges empty" \
        || no "arch-counts: degraded edges non-empty without a snapshot"

    # real-CBM chain, exactly like the Phase 1/2 suites: env > /tmp build >
    # wiki_env_load resolution. Snapshot-only subcase; skips without a binary.
    local cand="${CBM_BIN:-}"
    if [ -z "$cand" ] || [ ! -x "$cand" ]; then
        [ -x /tmp/cbm-test/codebase-memory-mcp ] && cand=/tmp/cbm-test/codebase-memory-mcp
    fi
    if [ -z "$cand" ] || [ ! -x "$cand" ]; then
        cand="$(env HOME="$HOME" PATH="$PATH" bash -c '
            source "$1/wiki-env.sh"
            wiki_env_load "$2"
            printf "%s" "${CBM_BIN-}"
        ' _ "$LIB" "$FIXTURE")"
    fi
    if [ -n "$cand" ] && [ -x "$cand" ]; then
        local REPO3="$T/arch-$$_real"
        make_repo_copy "$REPO3"
        mkdir -p "$T/cbm-cache"
        if CBM_BIN="$cand" CBM_CACHE_DIR="$T/cbm-cache" bash -c '
            set -uo pipefail
            source "$1/cbm-index.sh"
            wiki_cbm_index "$2" fast >/dev/null
        ' _ "$LIB" "$REPO3" \
            && bash -c '
                set -uo pipefail
                source "$1/extract-features.sh"
                wiki_extract "$2" >/dev/null 2>&1
            ' _ "$LIB" "$REPO3"; then
            run_view "$LIB/view-arch.sh" wiki_view_arch "$REPO3/.wiki/store.json"
            out="$(save_view arch-real)"
            view_total="$(json_get "$out" "sum(e['weight'] for e in d['edges'])")"
            # Per-module node counts from the snapshot, anchored on the store's
            # module list (the code-tree grouping). Snapshot nodes under
            # non-code paths (.wiki/, etc.) have no store module — extract
            # drops them by design, so only store modules are graded.
            snap_json="$(python3 - "$REPO3" "$out" <<'PY'
import json
import sqlite3
import sys

repo, view_path = sys.argv[1], sys.argv[2]
conn = sqlite3.connect("file:%s/.wiki/cache/cbm.db?mode=ro" % repo, uri=True)
nodes = {}
for nid, fp in conn.execute("SELECT id, file_path FROM nodes"):
    fp = (fp or "").replace("\\", "/")
    if not fp or fp.startswith("<"):
        fp = ""
    elif fp.startswith(repo + "/"):
        fp = fp[len(repo) + 1:]
    nodes[nid] = fp
counts = {}
for fp in nodes.values():
    if fp:
        m = fp.split("/", 1)[0]
        counts[m] = counts.get(m, 0) + 1
total = 0
for sid, tid, etype in conn.execute("SELECT source_id, target_id, type FROM edges"):
    if (etype or "").upper() not in ("CALLS", "IMPORTS", "INHERITS"):
        continue
    a, b = nodes.get(sid, ""), nodes.get(tid, "")
    if a and b and a.split("/", 1)[0] != b.split("/", 1)[0]:
        total += 1
conn.close()
view = json.load(open(view_path, encoding="utf-8"))
store = json.load(open(repo + "/.wiki/store.json", encoding="utf-8"))
store_mods = [m["name"] for m in store.get("modules", [])]
view_counts = {n["id"]: n["count"] for n in view["nodes"]}
bad = [m for m in store_mods if view_counts.get(m) != counts.get(m, 0)]
print(json.dumps({"bad": bad, "store_mods": store_mods,
                  "view_counts": view_counts, "snap_counts": counts,
                  "edge_total": total}))
PY
)"
            if python3 -c '
import json, sys
s = json.loads(sys.argv[1])
if s["bad"]:
    print("MISMATCH modules=%s view=%s snap=%s" % (s["bad"], s["view_counts"], s["snap_counts"]))
    sys.exit(1)
print("per-module node counts agree over %d store modules; edge_total=%d"
      % (len(s["store_mods"]), s["edge_total"]))
' "$snap_json" >/dev/null 2>&1; then
                ok "arch-counts: real CBM snapshot agrees per module (edge weights total $view_total)"
            else
                no "arch-counts: real CBM mismatch: $snap_json"
            fi
        else
            skip "arch-counts: real CBM index failed on this run; synthetic coverage stands"
        fi
    else
        skip "arch-counts: CBM binary not found (set CBM_BIN or wiki doctor --install); synthetic snapshot used"
    fi
}

# ---------------------------------------------------------------------------
case_catalog_vocab() {
    if [ ! -f "$LIB/view-catalog.sh" ]; then no "catalog-vocab: lib/view-catalog.sh exists"; return; fi
    ok "catalog-vocab: lib/view-catalog.sh exists"

    local REPO="$T/catalog"
    mkdir -p "$REPO/.wiki/enrich/blocks"
    # Hand-written store: catalog reads the store contract, nothing else.
    cat >"$REPO/.wiki/store.json" <<'EOF'
{
  "features": [
    {"fid": "parsing", "name": "parsing",
     "files": ["parsing/parser.py", "parsing/regexes.py"], "edges": 7},
    {"fid": "reporting", "name": "reporting",
     "files": ["reporting/reporter.py"], "edges": 2},
    {"fid": "src", "name": "src",
     "files": ["src/report.ts"], "edges": 0}
  ],
  "coupling": [
    {"files": ["parsing/parser.py", "reporting/reporter.py"], "count": 3},
    {"files": ["parsing/parser.py", "util.py"], "count": 1}
  ],
  "meta": {"repo": "x", "cbm_mode": "none", "fingerprint": "0"}
}
EOF
    # parsing: explicit closed-vocab status + description
    cat >"$REPO/.wiki/enrich/blocks/parsing.md" <<'EOF'
**Status:** prod

**Description:** Tokenizes raw lines into records.
EOF
    # reporting: out-of-vocab status must collapse to dev; description present
    cat >"$REPO/.wiki/enrich/blocks/reporting.md" <<'EOF'
**Status:** halloween

**Description:** Renders records as tables.
EOF
    # src: no block at all -> dev, empty description

    run_view "$LIB/view-catalog.sh" wiki_view_catalog "$REPO/.wiki/store.json"
    [ "$VIEW_RC" -eq 0 ] && ok "catalog-vocab: exit 0" \
        || { no "catalog-vocab: exit=$VIEW_RC: $(tail -2 "$T/view.stderr")"; return; }
    local out
    out="$(save_view catalog)"
    is_one_json_object "$out" \
        && ok "catalog-vocab: stdout is exactly one JSON object" \
        || no "catalog-vocab: stdout is not a single JSON object"
    local keys
    keys="$(json_get "$out" "sorted(d.keys())")"
    [ "$keys" = "['empty', 'features']" ] \
        && ok "catalog-vocab: top-level keys exactly features+empty" \
        || no "catalog-vocab: top-level keys=$keys"
    [ "$(json_get "$out" "d['empty']")" = "False" ] \
        && ok "catalog-vocab: non-empty store -> empty=false" \
        || no "catalog-vocab: empty flag wrong"

    local by_fid
    by_fid="$(json_get "$out" "{f['fid']: f for f in d['features']}")"
    local statuses
    statuses="$(json_get "$out" "sorted(f['status'] for f in d['features'])")"
    # closed vocabulary: every emitted status is one of the five tokens
    if python3 -c '
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
vocab = {"prod", "beta", "dev", "stub", "deprecated"}
bad = [f["status"] for f in d["features"] if f["status"] not in vocab]
sys.exit(1 if bad else 0)
' "$out"; then
        ok "catalog-vocab: only closed status tokens emitted ($statuses)"
    else
        no "catalog-vocab: out-of-vocab status emitted ($statuses)"
    fi
    [ "$(json_get "$out" "({f['fid']: f['status'] for f in d['features']})['parsing']")" = "prod" ] \
        && ok "catalog-vocab: enrich-block status honored (parsing=prod)" \
        || no "catalog-vocab: parsing status not read from block"
    [ "$(json_get "$out" "({f['fid']: f['status'] for f in d['features']})['reporting']")" = "dev" ] \
        && ok "catalog-vocab: out-of-vocab block status mapped to dev (reporting)" \
        || no "catalog-vocab: halloween not mapped to dev"
    [ "$(json_get "$out" "({f['fid']: f['status'] for f in d['features']})['src']")" = "dev" ] \
        && ok "catalog-vocab: missing block defaults to dev (src)" \
        || no "catalog-vocab: src default status wrong"
    [ "$(json_get "$out" "({f['fid']: f['description'] for f in d['features']})['parsing']")" = "Tokenizes raw lines into records." ] \
        && ok "catalog-vocab: description parsed from block" \
        || no "catalog-vocab: parsing description wrong"
    [ "$(json_get "$out" "({f['fid']: f['description'] for f in d['features']})['src']")" = "" ] \
        && ok "catalog-vocab: missing block -> empty description" \
        || no "catalog-vocab: src description not empty"
    keys="$(json_get "$out" "sorted(d['features'][0].keys())")"
    [ "$keys" = "['coupling_count', 'description', 'fid', 'files', 'status']" ] \
        && ok "catalog-vocab: feature keys exactly fid/status/description/files/coupling_count" \
        || no "catalog-vocab: feature keys=$keys"

    # coupling_count = number of store.coupling pairs touching the feature's files
    [ "$(json_get "$out" "({f['fid']: f['coupling_count'] for f in d['features']})['parsing']")" -eq 2 ] \
        && ok "catalog-vocab: parsing coupling_count=2 (both pairs touch parsing files)" \
        || no "catalog-vocab: parsing coupling_count wrong"
    [ "$(json_get "$out" "({f['fid']: f['coupling_count'] for f in d['features']})['reporting']")" -eq 1 ] \
        && ok "catalog-vocab: reporting coupling_count=1" \
        || no "catalog-vocab: reporting coupling_count wrong"
    [ "$(json_get "$out" "({f['fid']: f['coupling_count'] for f in d['features']})['src']")" -eq 0 ] \
        && ok "catalog-vocab: src coupling_count=0" \
        || no "catalog-vocab: src coupling_count wrong"

    # empty store -> empty-state payload
    local REPO2="$T/catalog-empty"
    mkdir -p "$REPO2/.wiki"
    printf '{"features": [], "coupling": [], "meta": {"fingerprint": "0"}}\n' \
        >"$REPO2/.wiki/store.json"
    run_view "$LIB/view-catalog.sh" wiki_view_catalog "$REPO2/.wiki/store.json"
    [ "$VIEW_RC" -eq 0 ] && ok "catalog-vocab: empty store exit 0" \
        || { no "catalog-vocab: empty store exit=$VIEW_RC"; return; }
    out="$(save_view catalog-empty)"
    [ "$(json_get "$out" "d['empty']")" = "True" ] \
        && [ "$(json_get "$out" "d['features']")" = "[]" ] \
        && ok "catalog-vocab: empty store -> {features: [], empty: true}" \
        || no "catalog-vocab: empty-state payload wrong: $(head -c 200 "$out")"
}

# ---------------------------------------------------------------------------
case_state_entities() {
    if [ ! -f "$LIB/view-state.sh" ]; then no "state-entities: lib/view-state.sh exists"; return; fi
    ok "state-entities: lib/view-state.sh exists"

    local REPO="$T/state"
    make_repo_copy "$REPO"
    bash -c '
        set -uo pipefail
        source "$1/extract-features.sh"
        wiki_extract "$2" >/dev/null 2>&1
    ' _ "$LIB" "$REPO" || { no "state-entities: extract failed"; return; }
    if bash -c '
        set -uo pipefail
        source "$1/gen-projections.sh"
        wiki_gen_projections "$2/.wiki/store.json" "$2" >/dev/null 2>&1
    ' _ "$LIB" "$REPO"; then
        ok "state-entities: generated state-machines skeleton"
    else
        no "state-entities: wiki_gen_projections failed"
        return
    fi
    [ -f "$REPO/readme/state-machines.md" ] \
        && ok "state-entities: state-machines.md present" \
        || { no "state-entities: state-machines.md missing"; return; }

    run_view "$LIB/view-state.sh" wiki_view_state "$REPO/.wiki/store.json"
    [ "$VIEW_RC" -eq 0 ] && ok "state-entities: exit 0" \
        || { no "state-entities: exit=$VIEW_RC: $(tail -2 "$T/view.stderr")"; return; }
    local out
    out="$(save_view state)"
    is_one_json_object "$out" \
        && ok "state-entities: stdout is exactly one JSON object" \
        || no "state-entities: stdout is not a single JSON object"
    local keys names
    keys="$(json_get "$out" "sorted(d.keys())")"
    [ "$keys" = "['empty', 'entities']" ] \
        && ok "state-entities: top-level keys exactly entities+empty" \
        || no "state-entities: top-level keys=$keys"
    [ "$(json_get "$out" "d['empty']")" = "False" ] \
        && ok "state-entities: entities found -> empty=false" \
        || no "state-entities: empty flag wrong"

    # every fixture feature parsed as an entity, in file order
    names="$(json_get "$out" "','.join(e['name'] for e in d['entities'])")"
    [ "$names" = "parsing,reporting,src" ] \
        && ok "state-entities: all three fixture entities parsed in order ($names)" \
        || no "state-entities: entities=$names (want parsing,reporting,src)"

    # each entity: Source grounding, states, transitions, diagram
    if python3 - "$out" <<'PY'
import json
import sys

d = json.load(open(sys.argv[1], encoding="utf-8"))
want_states = ["prod", "beta", "dev", "stub", "deprecated"]
problems = []
for e in d["entities"]:
    first_file = {"parsing": "parsing/__init__.py",
                  "reporting": "reporting/__init__.py",
                  "src": "src/report.ts"}[e["name"]]
    if e["source"] != "%s:1" % first_file:
        problems.append("%s source=%r (want %s:1)" % (e["name"], e["source"], first_file))
    if e["states"] != want_states:
        problems.append("%s states=%r" % (e["name"], e["states"]))
    if len(e["transitions"]) != 5:
        problems.append("%s transitions=%d" % (e["name"], len(e["transitions"])))
    else:
        t0 = e["transitions"][0]
        if sorted(t0.keys()) != ["from", "guard", "to", "trigger"]:
            problems.append("%s transition keys=%r" % (e["name"], sorted(t0.keys())))
        elif (t0["from"], t0["to"]) != ("(new)", "stub"):
            problems.append("%s first transition=%r" % (e["name"], t0))
        elif not all(t["trigger"] and t["guard"] for t in e["transitions"]):
            problems.append("%s empty trigger/guard cell" % e["name"])
    if "stateDiagram-v2" not in e["diagram"]:
        problems.append("%s diagram missing mermaid body" % e["name"])
if problems:
    print("\n".join(problems))
    sys.exit(1)
sys.exit(0)
PY
    then
        ok "state-entities: every entity has source/states/5 transitions/mermaid diagram"
    else
        no "state-entities: entity parse problems (see above)"
    fi

    keys="$(json_get "$out" "sorted(d['entities'][0].keys())")"
    [ "$keys" = "['diagram', 'name', 'source', 'states', 'transitions']" ] \
        && ok "state-entities: entity keys exactly name/source/states/transitions/diagram" \
        || no "state-entities: entity keys=$keys"

    # >300-line skeleton: the TOC heading must not become a phantom entity
    [ "$(json_get "$out" "len(d['entities'])")" -eq 3 ] \
        && ok "state-entities: no phantom entities from non-numbered headings" \
        || no "state-entities: entity count drifted"

    # missing file -> empty-state payload, exit 0
    local REPO2="$T/state-none"
    make_repo_copy "$REPO2"
    bash -c '
        set -uo pipefail
        source "$1/extract-features.sh"
        wiki_extract "$2" >/dev/null 2>&1
    ' _ "$LIB" "$REPO2" || { no "state-entities: second extract failed"; return; }
    run_view "$LIB/view-state.sh" wiki_view_state "$REPO2/.wiki/store.json"
    [ "$VIEW_RC" -eq 0 ] && ok "state-entities: missing file exit 0" \
        || { no "state-entities: missing file exit=$VIEW_RC"; return; }
    out="$(save_view state-none)"
    [ "$(json_get "$out" "d['empty']")" = "True" ] \
        && [ "$(json_get "$out" "d['entities']")" = "[]" ] \
        && ok "state-entities: missing file -> {entities: [], empty: true}" \
        || no "state-entities: missing-file payload wrong: $(head -c 200 "$out")"
}

# ---------------------------------------------------------------------------
case_change_window() {
    if [ ! -f "$LIB/view-change.sh" ]; then no "change-window: lib/view-change.sh exists"; return; fi
    ok "change-window: lib/view-change.sh exists"

    local REPO="$T/change"
    make_repo_copy "$REPO"
    rm -rf "$REPO/.wiki"
    git -C "$REPO" init -q
    git -C "$REPO" config user.email wiki-views@example.com
    git -C "$REPO" config user.name "Wiki Views"

    # dated commits: old one must fall outside a 1w window but inside 4w
    local d_old d_mid d_now
    d_old="$(date -d '21 days ago' --iso-8601=seconds)"
    d_mid="$(date -d '2 days ago' --iso-8601=seconds)"
    d_now="$(date -d '1 day ago' --iso-8601=seconds)"

    git -C "$REPO" add parsing
    GIT_AUTHOR_DATE="$d_old" GIT_COMMITTER_DATE="$d_old" \
        git -C "$REPO" commit -qm "feat: parsing feature"
    printf '\n# anchors\n' >>"$REPO/parsing/parser.py"
    git -C "$REPO" add parsing/parser.py
    GIT_AUTHOR_DATE="$d_mid" GIT_COMMITTER_DATE="$d_mid" \
        git -C "$REPO" commit -qm "fix(parsing): tighten anchors"
    git -C "$REPO" add reporting
    GIT_AUTHOR_DATE="$d_now" GIT_COMMITTER_DATE="$d_now" \
        git -C "$REPO" commit -qm "feat: reporting wired to parsing"
    printf 'x = 1\n' >"$REPO/util.py"
    git -C "$REPO" add util.py
    GIT_AUTHOR_DATE="$d_now" GIT_COMMITTER_DATE="$d_now" \
        git -C "$REPO" commit -qm "scratch util tweak"

    bash -c '
        set -uo pipefail
        source "$1/extract-features.sh"
        wiki_extract "$2" >/dev/null 2>&1
    ' _ "$LIB" "$REPO" || { no "change-window: extract failed"; return; }

    # window 4w: all four commits
    run_view "$LIB/view-change.sh" wiki_view_change "$REPO/.wiki/store.json" "$REPO" 4w
    [ "$VIEW_RC" -eq 0 ] && ok "change-window: 4w view exit 0" \
        || { no "change-window: 4w exit=$VIEW_RC: $(tail -2 "$T/view.stderr")"; return; }
    local out
    out="$(save_view change-4w)"
    is_one_json_object "$out" \
        && ok "change-window: stdout is exactly one JSON object" \
        || no "change-window: stdout is not a single JSON object"
    local keys
    keys="$(json_get "$out" "sorted(d.keys())")"
    [ "$keys" = "['commits', 'hotspots', 'story']" ] \
        && ok "change-window: top-level keys exactly commits/hotspots/story" \
        || no "change-window: top-level keys=$keys"
    [ "$(json_get "$out" "len(d['commits'])")" -eq 4 ] \
        && ok "change-window: 4w window catches all 4 commits" \
        || no "change-window: 4w commits=$(json_get "$out" "len(d['commits'])")"

    # commit shape + conventional type extraction
    keys="$(json_get "$out" "sorted(d['commits'][0].keys())")"
    [ "$keys" = "['date', 'files_count', 'sha', 'type']" ] \
        && ok "change-window: commit keys exactly sha/date/type/files_count" \
        || no "change-window: commit keys=$keys"
    local types
    types="$(json_get "$out" "sorted(c['type'] for c in d['commits'])")"
    [ "$types" = "['feat', 'feat', 'fix', 'other']" ] \
        && ok "change-window: conventional prefixes parsed (feat/feat/fix/other)" \
        || no "change-window: types=$types"
    [ "$(json_get "$out" "[c['files_count'] for c in d['commits'] if c['type']=='fix'][0]")" -eq 1 ] \
        && ok "change-window: files_count matches commit file set" \
        || no "change-window: fix commit files_count wrong"
    [ "$(json_get "$out" "[c['files_count'] for c in d['commits'] if c['type']=='feat'][1]")" -eq 3 ] \
        && ok "change-window: feat+reporting commit counts 3 files" \
        || no "change-window: reporting commit files_count wrong"

    # hotspots agree with an independent git log --name-only walk
    if python3 - "$out" "$REPO" <<'PY'
import json
import subprocess
import sys

d = json.load(open(sys.argv[1], encoding="utf-8"))
log = subprocess.run(
    ["git", "-C", sys.argv[2], "log", "--since=4 weeks ago", "--name-only",
     "--format=%x01"],
    capture_output=True, text=True, check=True).stdout
counts = {}
for block in log.split("\x01"):
    for line in block.splitlines():
        line = line.strip()
        if line:
            counts[line] = counts.get(line, 0) + 1
expected = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:10]
got = [(h["file"], h["count"]) for h in d["hotspots"]]
if got != expected:
    print("hotspots got=%r expected=%r" % (got, expected))
    sys.exit(1)
sys.exit(0)
PY
    then
        ok "change-window: hotspots match independent git log --name-only walk (top-10, count desc, name tiebreak)"
    else
        no "change-window: hotspots diverge from git log"
    fi

    # story: per-fid commit counts + first_commit_date from the oldest commit
    # (parsing files are touched by commits 1 and 2 only; commit 3 is
    # reporting-only, commit 4 util.py)
    [ "$(json_get "$out" "d['story']['parsing']['commit_count']")" -eq 2 ] \
        && ok "change-window: parsing story commit_count=2 in 4w" \
        || no "change-window: parsing story count wrong"
    local first
    first="$(json_get "$out" "d['story']['parsing']['first_commit_date'][:10]")"
    [ "$first" = "$(printf '%s' "$d_old" | cut -c1-10)" ] \
        && ok "change-window: parsing first_commit_date is the oldest commit's date" \
        || no "change-window: parsing first_commit_date=$first want $(printf '%s' "$d_old" | cut -c1-10)"
    [ "$(json_get "$out" "d['story']['reporting']['commit_count']")" -eq 1 ] \
        && ok "change-window: reporting story commit_count=1" \
        || no "change-window: reporting story count wrong"
    [ "$(json_get "$out" "d['story']['src']['commit_count']")" -eq 0 ] \
        && ok "change-window: untouched feature still present in story with 0" \
        || no "change-window: src missing from story"

    # window 1w: the 21-day-old commit falls out everywhere
    run_view "$LIB/view-change.sh" wiki_view_change "$REPO/.wiki/store.json" "$REPO" 1w
    [ "$VIEW_RC" -eq 0 ] && ok "change-window: 1w view exit 0" \
        || { no "change-window: 1w exit=$VIEW_RC"; return; }
    out="$(save_view change-1w)"
    [ "$(json_get "$out" "len(d['commits'])")" -eq 3 ] \
        && ok "change-window: 1w window drops the 21-day-old commit" \
        || no "change-window: 1w commits=$(json_get "$out" "len(d['commits'])") (want 3)"
    [ "$(json_get "$out" "d['story']['parsing']['commit_count']")" -eq 1 ] \
        && ok "change-window: parsing story drops to 1 inside 1w" \
        || no "change-window: parsing 1w story count wrong"
    first="$(json_get "$out" "d['story']['parsing']['first_commit_date'][:10]")"
    [ "$first" = "$(printf '%s' "$d_mid" | cut -c1-10)" ] \
        && ok "change-window: parsing first_commit_date slides to the 2-day-old commit" \
        || no "change-window: parsing 1w first_commit_date=$first"

    # default window (no arg) behaves as 12w -> old commit included
    run_view "$LIB/view-change.sh" wiki_view_change "$REPO/.wiki/store.json" "$REPO"
    [ "$VIEW_RC" -eq 0 ] && [ "$(json_get "$(save_view change-def)" "len(d['commits'])")" -eq 4 ] \
        && ok "change-window: default window covers 12w (4 commits)" \
        || no "change-window: default window wrong (rc=$VIEW_RC)"

    # non-git repo: degraded empty payload, exit 0
    local REPO2="$T/change-nogit"
    make_repo_copy "$REPO2"
    bash -c '
        set -uo pipefail
        source "$1/extract-features.sh"
        wiki_extract "$2" >/dev/null 2>&1
    ' _ "$LIB" "$REPO2" || { no "change-window: nogit extract failed"; return; }
    run_view "$LIB/view-change.sh" wiki_view_change "$REPO2/.wiki/store.json" "$REPO2"
    if [ "$VIEW_RC" -eq 0 ] \
        && [ "$(json_get "$(save_view change-nogit)" "d['commits']")" = "[]" ] \
        && [ "$(json_get "$T/change-nogit.json" "d['hotspots']")" = "[]" ]; then
        ok "change-window: non-git repo -> empty commits/hotspots, exit 0"
    else
        no "change-window: non-git repo rc=$VIEW_RC (want 0 + empty payload)"
    fi
}

# ---------------------------------------------------------------------------
# Live-DB gate: WIKI_VIEWS_TEST_DB_URL wins; else a scratch db on a reachable
# localhost Postgres; else skip (never fail).
case_data_live() {
    if ! command -v psql >/dev/null 2>&1; then
        skip "data-live: psql not installed"
        return
    fi
    local scratch=""
    local url="${WIKI_VIEWS_TEST_DB_URL:-}"
    if [ -z "$url" ]; then
        if ! command -v pg_isready >/dev/null 2>&1 || ! pg_isready -h localhost -p 5432 -t 2 >/dev/null 2>&1; then
            skip "data-live: no local Postgres reachable and WIKI_VIEWS_TEST_DB_URL unset"
            return
        fi
        scratch="cfn_wiki_p5_$$_$RANDOM"
        if psql -h localhost -c "CREATE DATABASE $scratch" >/dev/null 2>&1; then
            url="postgresql://localhost/$scratch"
        else
            skip "data-live: could not create scratch db on localhost"
            return
        fi
    fi
    cleanup_live() {
        if [ -n "$scratch" ]; then
            psql -h localhost -c "DROP DATABASE IF EXISTS $scratch" >/dev/null 2>&1 || true
        fi
    }
    trap cleanup_live RETURN

    # scratch schema: one table pair with an FK and an RLS policy
    if [ -n "$scratch" ]; then
        psql -h localhost -d "$scratch" -q <<'SQL' || { skip "data-live: scratch schema setup failed"; return; }
CREATE TABLE p5_items (id serial PRIMARY KEY, tag text);
CREATE TABLE p5_notes (id serial PRIMARY KEY, item_id integer REFERENCES p5_items(id));
ALTER TABLE p5_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY p5_items_read ON p5_items FOR SELECT USING (true);
SQL
    fi

    local REPO="$T/data-live"
    make_repo_copy "$REPO"
    bash -c '
        set -uo pipefail
        source "$1/extract-features.sh"
        wiki_extract "$2" >/dev/null 2>&1
    ' _ "$LIB" "$REPO" || { no "data-live: extract failed"; return; }
    printf 'DATABASE_URL=%s\n' "$url" >"$REPO/.env"

    run_view "$LIB/view-data.sh" wiki_view_data "$REPO/.wiki/store.json" "$REPO"
    [ "$VIEW_RC" -eq 0 ] && ok "data-live: exit 0" \
        || { no "data-live: exit=$VIEW_RC: $(tail -2 "$T/view.stderr")"; return; }
    local out
    out="$(save_view data-live)"
    [ "$(json_get "$out" "d['empty']")" = "False" ] \
        && ok "data-live: reachable db -> empty=false" \
        || { no "data-live: empty flag not false"; return; }
    [ "$(json_get "$out" "type(d['erd'])")" = "<class 'dict'>" ] \
        && ok "data-live: erd is an object" \
        || no "data-live: erd not an object"
    keys="$(json_get "$out" "sorted(d['erd'].keys())")"
    [ "$keys" = "['tables']" ] \
        && ok "data-live: erd keys exactly tables" \
        || no "data-live: erd keys=$keys"
    if [ -n "$scratch" ]; then
        local cols
        cols="$(json_get "$out" "[c['name'] for t in d['erd']['tables'] if t['name']=='p5_items' for c in t['columns']]")"
        [ "$cols" = "['id', 'tag']" ] \
            && ok "data-live: p5_items columns read from information_schema" \
            || no "data-live: p5_items columns=$cols"
        [ "$(json_get "$out" "[f for t in d['erd']['tables'] if t['name']=='p5_notes' for f in t['fks']]")" = "[{'from': 'item_id', 'to': 'p5_items.id'}]" ] \
            && ok "data-live: FK read as from=item_id to=p5_items.id" \
            || no "data-live: p5_notes fks wrong"
        [ "$(json_get "$out" "[p['policy'] for p in d['rls'] if p['table']=='p5_items']")" = "['p5_items_read']" ] \
            && ok "data-live: RLS policy read from pg_policies" \
            || no "data-live: rls policy missing"
        keys="$(json_get "$out" "sorted(d['rls'][0].keys())")"
        [ "$keys" = "['cmd', 'policy', 'table']" ] \
            && ok "data-live: rls keys exactly table/policy/cmd" \
            || no "data-live: rls keys=$keys"
    else
        skip "data-live: caller-supplied DB; schema-specific asserts limited to shape"
    fi
    # secrets never reach the view output
    if grep -Eq 'postgres(ql)?://|DATABASE_URL|:[0-9]+/' "$out"; then
        no "data-live: connection-string material leaked into output"
    else
        ok "data-live: no connection-string material in output"
    fi
}

case_data_degraded() {
    if [ ! -f "$LIB/view-data.sh" ]; then no "data-degraded: lib/view-data.sh exists"; return; fi
    ok "data-degraded: lib/view-data.sh exists"

    local REPO="$T/data"
    make_repo_copy "$REPO"
    bash -c '
        set -uo pipefail
        source "$1/extract-features.sh"
        wiki_extract "$2" >/dev/null 2>&1
    ' _ "$LIB" "$REPO" || { no "data-degraded: extract failed"; return; }

    # 1. no .env at all
    run_view "$LIB/view-data.sh" wiki_view_data "$REPO/.wiki/store.json" "$REPO"
    if [ "$VIEW_RC" -eq 0 ]; then
        ok "data-degraded: no .env exits 0"
    else
        no "data-degraded: no .env exit=$VIEW_RC"
    fi
    local out
    out="$(save_view data-1)"
    is_one_json_object "$out" \
        && ok "data-degraded: stdout is exactly one JSON object" \
        || no "data-degraded: stdout is not a single JSON object"
    local keys
    keys="$(json_get "$out" "sorted(d.keys())")"
    [ "$keys" = "['empty', 'erd', 'reason', 'rls']" ] \
        && ok "data-degraded: degraded keys exactly erd/rls/empty/reason" \
        || no "data-degraded: keys=$keys"
    [ "$(json_get "$out" "(d['erd'], d['rls'], d['empty'], d['reason'])")" = "(None, None, True, 'no DATABASE_URL')" ] \
        && ok "data-degraded: no .env -> {erd: null, rls: null, empty: true, reason: 'no DATABASE_URL'}" \
        || no "data-degraded: payload wrong: $(head -c 200 "$out")"

    # 2. .env present but psql unavailable (PATH stripped to a minimal bin dir)
    local BIN="$T/bin"
    mkdir -p "$BIN"
    for b in python3 bash git; do
        ln -s "$(command -v "$b")" "$BIN/$b"
    done
    printf 'DATABASE_URL=postgresql://user:topsecret@127.0.0.1:5432/db\n' >"$REPO/.env"
    VIEW_JSON="$(PATH="$BIN" bash -c '
        set -uo pipefail
        source "$1"
        wiki_view_data "$2" "$3"
    ' _ "$LIB/view-data.sh" "$REPO/.wiki/store.json" "$REPO" 2>"$T/view.stderr")" || VIEW_RC=$?
    out="$(save_view data-2)"
    if [ "$VIEW_RC" -eq 0 ] \
        && [ "$(json_get "$out" "d['reason']")" = "psql not available" ] \
        && [ "$(json_get "$out" "d['empty']")" = "True" ]; then
        ok "data-degraded: psql unavailable -> reason, exit 0"
    else
        no "data-degraded: psql-less rc=$VIEW_RC payload=$(head -c 200 "$out")"
    fi

    # 3. reachable-looking .env, unreachable endpoint -> degraded, exit 0,
    #    and the URL/password never reach the output
    VIEW_RC=0
    run_view "$LIB/view-data.sh" wiki_view_data "$REPO/.wiki/store.json" "$REPO"
    out="$(save_view data-3)"
    if [ "$VIEW_RC" -eq 0 ] \
        && [ "$(json_get "$out" "d['empty']")" = "True" ] \
        && [ "$(json_get "$out" "d['reason']")" = "database unreachable" ]; then
        ok "data-degraded: unreachable db -> reason, exit 0"
    else
        no "data-degraded: unreachable rc=$VIEW_RC payload=$(head -c 200 "$out")"
    fi
    if printf '%s' "$out" | grep -q 'topsecret'; then
        no "data-degraded: .env password leaked into output"
    else
        ok "data-degraded: no credentials in output"
    fi

    # 4. include_data_in_md=false: suppressed BEFORE any connection attempt
    #    (dummy URL points at a port that would refuse if ever used)
    mkdir -p "$REPO/.wiki"
    printf '{"include_data_in_md": false}\n' >"$REPO/.wiki/config.json"
    printf 'DATABASE_URL=postgresql://user:topsecret@127.0.0.1:1/db\n' >"$REPO/.env"
    VIEW_RC=0
    run_view "$LIB/view-data.sh" wiki_view_data "$REPO/.wiki/store.json" "$REPO"
    out="$(save_view data-4)"
    if [ "$VIEW_RC" -eq 0 ] \
        && [ "$(json_get "$out" "d['empty']")" = "True" ] \
        && [ "$(json_get "$out" "d['erd']")" = "None" ]; then
        ok "data-degraded: include_data_in_md=false suppresses the view, exit 0"
    else
        no "data-degraded: flag=false rc=$VIEW_RC payload=$(head -c 200 "$out")"
    fi
    printf '%s' "$(json_get "$out" "d['reason']")" | grep -q "include_data_in_md" \
        && ok "data-degraded: reason names the config key" \
        || no "data-degraded: reason does not name the flag: $(json_get "$out" "d['reason']")"
    printf '%s' "$out" | grep -q 'topsecret' \
        && no "data-degraded: suppressed view still leaked credentials" \
        || ok "data-degraded: no credentials on the flag=false path"

    # 5. malformed config JSON falls back to the default (true) -> attempts DB
    printf 'not json\n' >"$REPO/.wiki/config.json"
    printf 'DATABASE_URL=postgresql://user:topsecret@127.0.0.1:1/db\n' >"$REPO/.env"
    VIEW_RC=0
    run_view "$LIB/view-data.sh" wiki_view_data "$REPO/.wiki/store.json" "$REPO"
    out="$(save_view data-5)"
    if [ "$VIEW_RC" -eq 0 ] && [ "$(json_get "$out" "d['reason']")" = "database unreachable" ]; then
        ok "data-degraded: malformed config falls back to default-on (tries the DB)"
    else
        no "data-degraded: malformed config rc=$VIEW_RC payload=$(head -c 200 "$out")"
    fi
}

# ---------------------------------------------------------------------------
case_arch_counts
case_catalog_vocab
case_state_entities
case_change_window
case_data_degraded
case_data_live

echo
echo "wiki-views: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
