#!/usr/bin/env bash
# cfn-wiki deterministic extraction: build <repo>/.wiki/store.json.
#
# Contract: wiki_extract <repo> -> writes <repo>/.wiki/store.json, exit 0.
# Never writes outside <repo>/.wiki/ (store + tmp sibling live there).
#
#   store.json = {
#     features: [{fid, name, files, entrypoints, edges}],  candidate features
#     modules:  [{name, files, nodes}],           files grouped by top-level dir
#     edges:    [{source, target, type, count}],  module-level CALLS/IMPORTS/INHERITS
#     coupling: [{files: [a, b], count}],         git co-change pairs, top N
#     meta:     {repo, cbm_mode, generated_at, fingerprint, edge_type_counts}
#   }
#   cbm_mode: "snapshot" when .wiki/cache/cbm.db was readable, else "none".
#   edge_type_counts: {TYPE: n} over ALL snapshot edges, including the types
#   excluded from edges[] (DEFINES, USAGE, ...) so the change view keeps them.
#
# Real-shape snapshot notes (learned on this repo's 66k-node CBM db):
#   - Usable file_path appears on many labels (File, Module, Function,
#     Variable, even doc Sections), not just File/Module. Node counting is
#     label-AGNOSTIC on purpose: every node with a usable path counts toward
#     its top-level dir, which is the cross-check the views suite runs
#     against the raw snapshot. Symbol rows without a path attach to their
#     file via DEFINES edges (File -DEFINES-> symbol; direction verified on
#     the live snapshot). Both routes are used.
#   - Paths that resolve to no top-level dir (absolute paths outside the
#     repo) are excluded outright: a node never maps to module "".
#   - Schemas without label/properties columns (the minimal synthetic shape
#     tests/test-wiki-views.sh builds) must extract in snapshot mode, so no
#     query above the entrypoint probe references them; the entrypoint probe
#     tolerates their absence.
#   - Edge types outside CALLS/IMPORTS/INHERITS are intra-structure hairball
#     noise: kept out of edges[], summed into meta.edge_type_counts.
#   - Heavy lifting (grouping, aggregation) runs in SQL; python only sees
#     aggregated rows. 66k nodes / 111k edges extract in seconds.
#
# Feature heuristic (CANONICAL: a deterministic function of the file tree
# and git only; Claude enrichment adds descriptions in a later phase, never
# here. Feature identity feeds the fingerprint and the enrich-preservation
# gate, and CBM graph resolution is toolchain-dependent, so the same tree
# must produce the same features[] with or without a CBM snapshot):
#   1. Feature = any top-level directory holding at least one source file
#      (threshold: a single code file qualifies a dir). Infra/docs dirs
#      never qualify (FEATURE_EXCLUDE below), and neither do hidden dirs
#      (legacy junk like .archive is not a feature).
#   2. fid = slug of the owning path (lowercase, non-alphanumeric to '-').
#   3. Entrypoints per feature: files whose basename stem is
#      main/index/app/__main__/server (name heuristic only; CBM entry-point
#      flags are toolchain-dependent and would break mode invariance).
#      Root-level entrypoint files stay modules.
#   4. The CBM snapshot only ENRICHES the store: per-feature edge weight,
#      module node counts, module-level edges, meta.edge_type_counts and
#      meta.cbm_mode. Presence or absence of a snapshot never changes
#      features[] fids/files/entrypoints, so a snapshot store and a
#      degraded store of the same tree are fingerprint-identical.
#
# Modules group usable-path snapshot nodes (or, degraded, the file tree) by
# top-level directory; repo-root files each form their own module named by
# filename. Module edges aggregate node-level CALLS/IMPORTS/INHERITS across
# modules; intra-module traffic is dropped as architecture noise.
#
# Coupling: file pairs touched by the same commit (git log --name-only),
# counted across history, ranked by count then name, top 20. Commits larger
# than COUPLING_MAX_FILES are skipped as bulk noise (lockfiles, vendor
# drops); paths under .wiki/ never couple; a global pair cap keeps
# pathological histories bounded (break in log order: deterministic).
#
# Determinism: files sorted, edges sorted, coupling ranked with a stable
# tiebreak. Repeated runs differ only in meta.generated_at and CBM
# enrichment, which lib/fingerprint.sh's canonical subset excludes.

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
COUPLING_TOP = 20        # cfn: flat cap, per-repo .wiki/config.json key if a monorepo needs more
COUPLING_MAX_FILES = 400  # cfn: bulk/lockfile commits are coupling noise, not signal
COUPLING_MAX_PAIRS = 1_000_000  # cfn: deterministic early stop (log order) if history is pathological
ENTRY_STEMS = {"main", "index", "app", "__main__", "server"}


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


def norm_fp(path):
    path = path.replace(os.sep, "/").replace("\\", "/")
    if path.startswith(repo + "/"):
        path = path[len(repo) + 1:]
    return path


def entry_name(rel):
    stem = os.path.splitext(os.path.basename(rel))[0].lower()
    return stem in ENTRY_STEMS


# --- file tree: always available, the degraded-mode backbone -----------------
files = []
for root, dirs, names in os.walk(repo, onerror=lambda exc: None):
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
# Aggregation runs in SQL (see header): python only sees per-path node counts,
# module-pair edge counts, type totals, and flagged entrypoints.
cbm_mode = "none"
snap_code_paths = {}   # code path -> node count (drives the module-set union)
mod_nodes = {}         # module -> usable-path node count (label/ext-agnostic)
agg = {}               # (src_module, dst_module, TYPE) -> edge count
edge_type_counts = {}  # TYPE -> total edges in snapshot, excluded types included

if os.path.isfile(SNAPSHOT):
    try:
        conn = sqlite3.connect(f"file:{SNAPSHOT}?mode=ro", uri=True)
        try:
            # Label-agnostic (see header): every node with a usable path
            # counts toward its top-level dir, extension or not (real
            # snapshots carry ext-less dir-path rows the views cross-check
            # counts too); code files additionally join the module-set
            # union. Schemas without a label column work identically.
            for fp, n in conn.execute(
                    "SELECT file_path, COUNT(*) FROM nodes "
                    "WHERE file_path != '' AND file_path NOT LIKE '<%' "
                    "GROUP BY file_path"):
                fp = norm_fp(fp)
                m = module_of(fp)
                if not m:
                    continue  # outside the repo: no top-level dir exists
                mod_nodes[m] = mod_nodes.get(m, 0) + n
                if code_file(fp):
                    snap_code_paths[fp] = n
            # Symbol-to-file resolution: file-bearing nodes map directly;
            # pathless symbols map through DEFINES (File -DEFINES-> symbol).
            for sp, dp, ty, c in conn.execute(
                    "WITH node_file AS ("
                    " SELECT id, file_path FROM nodes"
                    "  WHERE file_path != '' AND file_path NOT LIKE '<%'"
                    " UNION"
                    " SELECT e.target_id, ns.file_path FROM edges e"
                    "  JOIN nodes ns ON ns.id = e.source_id"
                    "   AND ns.file_path != '' AND ns.file_path NOT LIKE '<%'"
                    "  WHERE e.type = 'DEFINES') "
                    "SELECT nf.file_path, ntf.file_path, e.type, COUNT(*) "
                    "FROM edges e "
                    "JOIN node_file nf ON nf.id = e.source_id "
                    "JOIN node_file ntf ON ntf.id = e.target_id "
                    "WHERE e.type IN ('CALLS','IMPORTS','INHERITS') "
                    "GROUP BY 1, 2, 3"):
                sm, dm = module_of(norm_fp(sp)), module_of(norm_fp(dp))
                if not sm or not dm or sm == dm:
                    # intra-module traffic is architecture noise; a path
                    # outside the repo resolves to no module and is dropped
                    continue
                key = (sm, dm, ty.upper())
                agg[key] = agg.get(key, 0) + c
            for ty, c in conn.execute(
                    "SELECT type, COUNT(*) FROM edges GROUP BY type"):
                edge_type_counts[ty] = c
            cbm_mode = "snapshot"
        finally:
            conn.close()
    except sqlite3.Error as exc:
        print(f"wiki: snapshot unreadable ({exc}); git-only extraction",
              file=sys.stderr)
        cbm_mode, snap_code_paths, agg = "none", {}, {}
        edge_type_counts, mod_nodes = {}, {}
else:
    print("wiki: DEGRADED: no CBM snapshot at .wiki/cache/cbm.db; "
          "git-only extraction", file=sys.stderr)

# --- modules ------------------------------------------------------------------
# files lists are tree/code-driven; nodes counts come straight from the
# snapshot (empty in degraded mode), already label/ext-agnostic.
mod_files = {}
for f in sorted(set(f for f in files if code_file(f)) | set(snap_code_paths)):
    mod_files.setdefault(module_of(f), []).append(f)

modules = [{"name": name,
            "files": mod_files[name],
            "nodes": mod_nodes.get(name, 0)}
           for name in sorted(mod_files)]

edges_out = [{"source": s, "target": t, "type": ty, "count": c}
             for (s, t, ty), c in sorted(agg.items())]

edge_touch = {}
for (s, t, _), c in agg.items():
    edge_touch[s] = edge_touch.get(s, 0) + c
    edge_touch[t] = edge_touch.get(t, 0) + c

# --- features (canonical rule documented in the header) ------------------------
# Every non-excluded top-level dir with >=1 code file is a feature, snapshot
# or not; edge_touch only enriches the per-feature edges field.
top_dirs = sorted({module_of(f) for flist in mod_files.values() for f in flist
                   if "/" in f})
candidates = [d for d in top_dirs
              if d not in FEATURE_EXCLUDE and not d.startswith(".")]

features = []
for d in candidates:
    dfiles = mod_files.get(d, [])
    eps = sorted({f for f in dfiles if entry_name(f)})
    features.append({"fid": slug(d),
                     "name": d,
                     "files": dfiles,
                     "entrypoints": eps,
                     "edges": edge_touch.get(d, 0)})

# --- coupling: file pairs changing together in git history ---------------------
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
        if len(file_set) < 2 or len(file_set) > COUPLING_MAX_FILES:
            continue  # single-file and bulk commits carry no co-change signal
        ordered = sorted(f for f in file_set
                         if f and not f.startswith(".wiki/"))
        for i in range(len(ordered)):
            for j in range(i + 1, len(ordered)):
                key = (ordered[i], ordered[j])
                pair_counts[key] = pair_counts.get(key, 0) + 1
        if len(pair_counts) > COUPLING_MAX_PAIRS:
            break  # bounded, deterministic: commits processed in log order
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
        "edge_type_counts": edge_type_counts,
    },
}
try:
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(store, fh, ensure_ascii=True, indent=2)
        fh.write("\n")
except OSError as exc:
    print(f"wiki: cannot write {out_path}: {exc}", file=sys.stderr)
    sys.exit(1)
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
    json.dump(store, fh, ensure_ascii=True, indent=2)
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
