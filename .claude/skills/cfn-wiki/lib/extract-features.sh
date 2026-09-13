#!/usr/bin/env bash
# cfn-wiki deterministic extraction: build <repo>/.wiki/store.json.
#
# Contract: wiki_extract <repo> -> writes <repo>/.wiki/store.json, exit 0.
# Never writes outside <repo>/.wiki/ (store + tmp sibling live there).
#
#   store.json = {
#     features: [{fid, name, files, edges}],     candidate features
#     modules:  [{name, files, nodes}],          files grouped by top-level dir
#     edges:    [{source, target, type, count}], module-level CALLS/IMPORTS/INHERITS
#     coupling: [{files: [a, b], count}],        git co-change pairs, top N
#     meta:     {repo, cbm_mode, generated_at, fingerprint}
#   }
#   cbm_mode: "snapshot" when .wiki/cache/cbm.db was readable, else "none".
#
# Feature heuristic (deterministic only; Claude enrichment adds descriptions
# in a later phase, never here):
#   1. Candidate = any top-level directory holding at least one source file.
#      Infra/docs dirs never qualify (FEATURE_EXCLUDE below).
#   2. With a CBM snapshot, a candidate is a feature only when it
#      participates in at least one cross-module edge: a cluster somebody
#      imports or calls. Self-contained bundles (e.g. a src/ whose files
#      import only each other) stay plain modules. Without a snapshot there
#      are no edges to filter by, so every candidate qualifies.
#   3. fid = slug of the owning path (lowercase, non-alphanumeric to '-').
#   4. Root-level entrypoint files are modules of their own, not features.
#
# Modules group snapshot nodes (or, degraded, the file tree) by top-level
# directory; repo-root files each form their own module named by filename.
# Module edges aggregate node-level CALLS/IMPORTS/INHERITS across modules;
# intra-module traffic is dropped as architecture noise.
#
# Coupling: file pairs touched by the same commit (git log --name-only),
# counted across history, ranked by count then name, top 20. Paths under
# .wiki/ are excluded so regeneration commits never self-couple.
#
# Determinism: files sorted, edges sorted, coupling ranked with a stable
# tiebreak. Repeated runs differ only in meta.generated_at, which
# lib/fingerprint.sh strips before hashing.

# shellcheck disable=SC1091
[ -n "${WIKI_FINGERPRINT_LOADED:-}" ] \
    || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fingerprint.sh"

wiki_extract() {
    local repo="${1:?wiki_extract: repo path required}"
    if [ ! -d "$repo" ]; then
        echo "wiki_extract: no such repo: $repo" >&2
        return 1
    fi
    repo="$(cd "$repo" && pwd)"
    mkdir -p "$repo/.wiki"
    local store="$repo/.wiki/store.json"
    local tmp="$store.tmp"

    local mode
    if ! mode="$(python3 - "$repo" "$tmp" <<'PY'
import datetime
import json
import os
import re
import sqlite3
import subprocess
import sys

repo, out_path = sys.argv[1], sys.argv[2]

SNAPSHOT = os.path.join(repo, ".wiki", "cache", "cbm.db")
EDGE_TYPES = ("CALLS", "IMPORTS", "INHERITS")
CODE_EXTS = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".go",
             ".rs", ".java", ".kt", ".rb", ".php", ".c", ".h", ".cpp",
             ".hpp", ".cs", ".swift", ".sh", ".sql"}
# Infra/VCS/generated dirs: never modules, never feature candidates.
EXCLUDE_DIRS = {".git", ".wiki", ".github", ".husky", ".claude",
                "node_modules", "__pycache__", ".venv", "venv",
                "dist", "build", "out", "target", "coverage"}
FEATURE_EXCLUDE = EXCLUDE_DIRS | {"readme", "docs", "doc", "tests", "test",
                                  "scripts", "examples", "fixtures", "benches"}
COUPLING_TOP = 20  # cfn: flat cap, per-repo .wiki/config.json key if a monorepo needs more


def code_file(rel):
    return os.path.splitext(rel)[1].lower() in CODE_EXTS


def module_of(rel):
    # top-level dir when nested; the filename itself when at the repo root
    return rel.split("/", 1)[0] if "/" in rel else rel


def slug(text):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "feature"
    # cfn: two sibling dirs differing only in punctuation slug to one fid;
    # revisit if a real repo ever collides


# --- file tree: always available, the degraded-mode backbone -----------------
files = []
for root, dirs, names in os.walk(repo):
    dirs[:] = sorted(d for d in dirs
                     if d not in EXCLUDE_DIRS and not d.endswith(".egg-info"))
    for name in sorted(names):
        rel = os.path.relpath(os.path.join(root, name), repo)
        rel = rel.replace(os.sep, "/")
        if rel.endswith((".pyc", ".pyo", ".db", ".sqlite",
                         ".sqlite-journal", ".db-journal", ".db-wal", ".db-shm")):
            continue
        files.append(rel)
files.sort()

# --- CBM snapshot (optional; its absence is degraded mode, never an error) ---
nodes = {}       # node id -> repo-relative file path ("" for builtins/structural)
raw_edges = []   # (source_id, target_id, TYPE)
cbm_mode = "none"
if os.path.isfile(SNAPSHOT):
    try:
        conn = sqlite3.connect(f"file:{SNAPSHOT}?mode=ro", uri=True)
        try:
            for nid, fpath in conn.execute("SELECT id, file_path FROM nodes"):
                fp = (fpath or "").replace(os.sep, "/")
                if not fp or fp.startswith("<"):
                    fp = ""  # <python-builtins> and structural nodes have no file
                elif fp.startswith(repo + "/"):
                    fp = fp[len(repo) + 1:]
                nodes[nid] = fp
            for sid, tid, etype in conn.execute(
                    "SELECT source_id, target_id, type FROM edges"):
                etype = (etype or "").upper()
                if etype in EDGE_TYPES:
                    raw_edges.append((sid, tid, etype))
            cbm_mode = "snapshot"
        finally:
            conn.close()
    except sqlite3.Error as exc:
        print(f"wiki: snapshot unreadable ({exc}); git-only extraction",
              file=sys.stderr)
        nodes, raw_edges, cbm_mode = {}, [], "none"
else:
    print("wiki: DEGRADED: no CBM snapshot at .wiki/cache/cbm.db; "
          "git-only extraction", file=sys.stderr)

# --- modules ------------------------------------------------------------------
code_files = [f for f in files if code_file(f)]
mod_files = {}
for f in code_files:
    mod_files.setdefault(module_of(f), []).append(f)

mod_nodes = {}
for fp in nodes.values():
    if fp:
        m = module_of(fp)
        mod_nodes[m] = mod_nodes.get(m, 0) + 1

modules = [{"name": name,
            "files": mod_files[name],
            "nodes": mod_nodes.get(name, 0)}
           for name in sorted(mod_files)]

# --- module-level edges --------------------------------------------------------
agg = {}
for sid, tid, etype in raw_edges:
    src_fp, dst_fp = nodes.get(sid, ""), nodes.get(tid, "")
    if not src_fp or not dst_fp:
        continue
    src_mod, dst_mod = module_of(src_fp), module_of(dst_fp)
    if src_mod == dst_mod:
        continue  # intra-module traffic is architecture noise
    key = (src_mod, dst_mod, etype)
    agg[key] = agg.get(key, 0) + 1

edges_out = [{"source": s, "target": t, "type": ty, "count": c}
             for (s, t, ty), c in sorted(agg.items())]

edge_touch = {}
for (s, t, _), c in agg.items():
    edge_touch[s] = edge_touch.get(s, 0) + c
    edge_touch[t] = edge_touch.get(t, 0) + c

# --- features (heuristic documented in the header) -----------------------------
top_dirs = sorted({module_of(f) for f in code_files if "/" in f})
candidates = [d for d in top_dirs if d not in FEATURE_EXCLUDE]

if cbm_mode == "snapshot" and edge_touch:
    chosen = [d for d in candidates if edge_touch.get(d, 0) > 0]
else:
    chosen = candidates

features = [{"fid": slug(d),
             "name": d,
             "files": mod_files.get(d, []),
             "edges": edge_touch.get(d, 0)}
            for d in chosen]

# --- coupling: file pairs changing together in git history ---------------------
# cfn: O(k^2) per commit over its file set; cap the set if monster commits appear
def git_coupling(r, top_n):
    try:
        log = subprocess.run(
            ["git", "-C", r, "log", "--name-only", "--format=%x01%H"],
            capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError):
        return []  # not a git repo (or git missing): coupling stays empty
    commits = []
    current = None
    for line in log.splitlines():
        if line.startswith("\x01"):
            current = set()
            commits.append(current)
        elif line and current is not None:
            current.add(line.strip())
    pair_counts = {}
    for file_set in commits:
        ordered = sorted(f for f in file_set
                         if f and not f.startswith(".wiki/"))
        for i in range(len(ordered)):
            for j in range(i + 1, len(ordered)):
                key = (ordered[i], ordered[j])
                pair_counts[key] = pair_counts.get(key, 0) + 1
    ranked = sorted(pair_counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [{"files": [a, b], "count": c} for (a, b), c in ranked[:top_n]]


coupling = git_coupling(repo, COUPLING_TOP)

store = {
    "features": features,
    "modules": modules,
    "edges": edges_out,
    "coupling": coupling,
    "meta": {
        "repo": repo,
        "cbm_mode": cbm_mode,
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
            .strftime("%Y-%m-%dT%H:%M:%SZ"),
    },
}
with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(store, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
print(cbm_mode)
PY
)"; then
        rm -f "$tmp"
        echo "wiki_extract: python extraction failed for $repo" >&2
        return 1
    fi

    # fingerprint over the pre-injection store, then write it into meta
    local fp
    if ! fp="$(wiki_fingerprint "$tmp")"; then
        rm -f "$tmp"
        echo "wiki_extract: fingerprint step failed for $repo" >&2
        return 1
    fi
    if ! python3 - "$tmp" "$fp" <<'PY'
import json
import sys

path, fp = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as fh:
    store = json.load(fh)
store.setdefault("meta", {})["fingerprint"] = fp
with open(path, "w", encoding="utf-8") as fh:
    json.dump(store, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY
    then
        rm -f "$tmp"
        echo "wiki_extract: fingerprint injection failed for $repo" >&2
        return 1
    fi

    mv "$tmp" "$store" || { rm -f "$tmp"; return 1; }
    echo "wiki: extracted $store (cbm_mode=$mode)"
}
