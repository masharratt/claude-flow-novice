#!/usr/bin/env bash
# tests/test-wiki-extract.sh - cfn-wiki Phase 2 harness.
# Covers: lib/fingerprint.sh stability (fp-stable: canonical hash equal for
# logically equal stores, different for changed content, loud on bad JSON),
# lib/extract-features.sh on the fixture repo (extract-fixture: snapshot mode
# with a real CBM index when a binary resolves, degraded git-only mode always,
# coupling from git history, re-extract fingerprint stability, no writes
# outside <repo>/.wiki/), and the .gitignore untracked entries
# (gitignore-untracked). Plan: fuzzy-whistling-eich Phase 2.
# Isolation: every case runs in temp dirs with CBM_CACHE_DIR pointed at a
# temp cache; the real $HOME cache and the shipped fixture are untouched.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$ROOT/.claude/skills/cfn-wiki/lib"
FIXTURE="$ROOT/tests/fixtures/wiki-fixture-repo"
GITIGNORE="$ROOT/.gitignore"

T="$(mktemp -d "${TMPDIR:-/tmp}/wiki-extract-test-XXXXXX")"
cleanup() { rm -rf "$T"; }
trap cleanup EXIT

PASS=0; FAIL=0; SKIP=0
ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
no()   { echo "FAIL: $1"; FAIL=$((FAIL+1)); }
skip() { echo "SKIP: $1"; SKIP=$((SKIP+1)); }

for dep in bash python3 git mktemp; do
    command -v "$dep" >/dev/null 2>&1 || { echo "FATAL: $dep not on PATH"; exit 1; }
done

# wiki_fingerprint <file> from a clean subshell
fp_of() {
    bash -c '
        set -euo pipefail
        source "$1/fingerprint.sh"
        wiki_fingerprint "$2"
    ' _ "$LIB" "$1"
}

# wiki_extract <repo> from a clean subshell (stderr kept, exit code kept)
run_extract() {
    bash -c '
        set -uo pipefail
        source "$1/extract-features.sh"
        wiki_extract "$2"
    ' _ "$LIB" "$1"
}

# Evaluate a python expression over a store.json: store_val <file> <expr>
store_val() {
    python3 -c '
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    s = json.load(fh)
print(eval(sys.argv[2]))
' "$1" "$2"
}

# plain fixture tree copy (no .wiki, no git) for snapshot-only cases
make_repo_copy_tree() { # $1 = dest
    mkdir -p "$1"
    cp -r "$FIXTURE/." "$1/"
    rm -rf "$1/.wiki"
}

# fixture copy with real git history (>=2 commits) for coupling
make_git_fixture() { # $1 = dest
    local dest="$1"
    mkdir -p "$dest"
    cp -r "$FIXTURE/." "$dest/"
    rm -rf "$dest/.wiki"
    git -C "$dest" init -q
    git -C "$dest" config user.email wiki-fixture@example.com
    git -C "$dest" config user.name "Wiki Fixture"
    git -C "$dest" add parsing service.py util.py
    git -C "$dest" commit -q -m "feat: parsing feature"
    printf '\n# tightened pattern anchors\n' >>"$dest/parsing/parser.py"
    git -C "$dest" add reporting main.py src readme parsing/parser.py
    git -C "$dest" commit -q -m "feat: reporting wired to parsing"
}

# sorted repo-relative paths excluding .wiki/ (tree purity check)
list_tree() {
    (cd "$1" && find . -mindepth 1 -not -path './.wiki' -not -path './.wiki/*' \
        -print | sed 's|^\./||' | LC_ALL=C sort)
}

# ---------------------------------------------------------------------------
# Synthetic real-shape CBM snapshot: label distribution and edge types as seen
# on this repo's 66k-node snapshot (Section/Variable rows with empty
# file_path, DEFINES from File to symbols, USAGE/CONFIGURES/TESTS noise).
# Regression for the real-repo extract: symbol-to-file resolution must go
# through DEFINES, noise labels must stay out of module counts, excluded edge
# types must be counted in meta, and bulk commits must be capped in coupling.
make_real_shape_fixture() { # $1 = dest
    local dest="$1"
    mkdir -p "$dest"
    BUILD_REAL_SHAPE_DB="$dest/.wiki/cache/cbm.db" BUILD_REAL_SHAPE_TREE="$dest" \
        python3 <<'PY'
import json
import os
import sqlite3

tree = os.environ["BUILD_REAL_SHAPE_TREE"]
db = os.environ["BUILD_REAL_SHAPE_DB"]
os.makedirs(os.path.dirname(db), exist_ok=True)

code = ["app/main.py", "app/service.py", "lib/util.py", "lib/deep.py", "src/entry.ts"]
for rel in code + ["readme/guide.md", "readme/state-machines.md"]:
    path = os.path.join(tree, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        fh.write(f"# synthetic {rel}\n")

ep = json.dumps({"is_entry_point": True})
nep = json.dumps({"is_entry_point": False})
conn = sqlite3.connect(db)
conn.executescript("""
CREATE TABLE nodes (
    id INTEGER PRIMARY KEY, project TEXT NOT NULL, label TEXT NOT NULL,
    name TEXT NOT NULL, qualified_name TEXT NOT NULL, file_path TEXT DEFAULT '',
    start_line INTEGER DEFAULT 0, end_line INTEGER DEFAULT 0, properties TEXT DEFAULT '{}');
CREATE TABLE edges (
    id INTEGER PRIMARY KEY, project TEXT NOT NULL, source_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL, type TEXT NOT NULL, properties TEXT DEFAULT '{}');
""")
nid = {"next": 0}

def node(label, name, path, props=nep):
    nid["next"] += 1
    conn.execute("INSERT INTO nodes VALUES (?,?,?,?,?,?, 0, 0, ?)",
                 (nid["next"], "synth", label, name, f"synth.{name}", path, props))
    return nid["next"]


node("File", "elsewhere.py", "/opt/outside/elsewhere.py")   # absolute, outside repo
node("Module", "elsewhere", "/opt/outside/elsewhere.py")    # same path again: 2 nodes

proj = node("Project", "synth", "")
node("Branch", "main", "")
node("Folder", "app", "")
node("Folder", "lib", "")
files = {rel: node("File", os.path.basename(rel), rel) for rel in code + ["readme/guide.md"]}
mods = {rel: node("Module", os.path.basename(rel), rel)
        for rel in code}
for i in range(5):  # noise: no file_path, must never reach modules
    node("Section", f"sec{i}", "")
for i in range(3):
    node("Variable", f"var{i}", "")
node("EnvVar", "PATH", "")
node("Folder", "app", "app")   # dir-path node: usable path, no extension

fn_main = node("Function", "main", "")
fn_util = node("Function", "read_config", "")
fn_service = node("Function", "run", "")
fn_deep = node("Function", "helper", "")

def edge(src, dst, typ):
    conn.execute("INSERT INTO edges (project, source_id, target_id, type) VALUES ('synth',?,?,?)",
                 (src, dst, typ))

edge(files["app/main.py"], fn_main, "DEFINES")
edge(files["app/service.py"], fn_service, "DEFINES")
edge(files["lib/util.py"], fn_util, "DEFINES")
edge(files["lib/deep.py"], fn_deep, "DEFINES")
edge(files["app/main.py"], fn_util, "DEFINES")  # symbol DEFINEd twice: one wins
edge(fn_main, fn_util, "CALLS")        # resolved: app -> lib
edge(fn_main, fn_service, "CALLS")     # resolved: app -> app (intra, dropped)
edge(fn_service, fn_deep, "USAGE")     # excluded type, counted in meta only
edge(mods["app/main.py"], mods["lib/util.py"], "IMPORTS")
edge(files["src/entry.ts"], files["lib/util.py"], "IMPORTS")
edge(mods["app/service.py"], mods["lib/util.py"], "INHERITS")
edge(proj, files["app/main.py"], "CONTAINS_FILE")
edge(files["app/service.py"], files["lib/util.py"], "CONFIGURES")
edge(files["app/main.py"], files["lib/deep.py"], "TESTS")
conn.commit()
conn.close()
PY

    git -C "$dest" init -q
    git -C "$dest" config user.email real-shape@example.com
    git -C "$dest" config user.name "Real Shape"
    git -C "$dest" add app/main.py lib/util.py
    git -C "$dest" commit -q -m "one"
    mkdir -p "$dest/bulk"
    python3 - "$dest" <<'PY'
import os
import sys
for i in range(600):
    with open(os.path.join(sys.argv[1], "bulk", f"bulk_{i:03d}.py"), "w") as fh:
        fh.write("# bulk commit filler\n")
PY
    git -C "$dest" add -A
    git -C "$dest" commit -q -m "bulk drop"
}

# ---------------------------------------------------------------------------
case_real_shape_snapshot() {
    local REPO_S="$T/fx-$$_s"
    make_real_shape_fixture "$REPO_S"
    [ -s "$REPO_S/.wiki/cache/cbm.db" ] \
        && ok "real-shape: synthetic snapshot db built" \
        || { no "real-shape: synthetic snapshot db missing"; return; }

    local store="$REPO_S/.wiki/store.json"
    if run_extract "$REPO_S" >"$T/extract-s.log" 2>&1; then
        ok "real-shape: wiki_extract exit 0 on real-shape snapshot"
    else
        no "real-shape: wiki_extract failed: $(tail -5 "$T/extract-s.log")"
        return
    fi

    store_val "$store" "s['meta']['cbm_mode']" | grep -qx snapshot \
        && ok "real-shape: cbm_mode=snapshot" \
        || no "real-shape: cbm_mode=$(store_val "$store" "s['meta']['cbm_mode']")"

    # modules: usable-path node counts, label/ext-agnostic per the views
    # cross-check contract; pathless noise rows (Section/Variable/EnvVar with
    # no file_path) never reach modules. app = 2 Files + 2 Modules + 2
    # pathless Functions + 1 dir-path Folder row = 5; lib 4; src 2 => 11.
    local mod_counts
    mod_counts=$(store_val "$store" "[(m['name'], m['nodes']) for m in s['modules']]")
    store_val "$store" "dict((m['name'], m['nodes']) for m in s['modules']).get('app')" | grep -qx 5 \
        && ok "real-shape: module 'app' counts every usable-path node incl dir row (5)" \
        || no "real-shape: module 'app' nodes wrong: $mod_counts"
    local noise_sum
    noise_sum=$(store_val "$store" "sum(m['nodes'] for m in s['modules'])")
    [ "$noise_sum" -eq 11 ] \
        && ok "real-shape: pathless noise excluded, dir-path node counted (sum=11)" \
        || no "real-shape: module node sum=$noise_sum (want 11)"

    # features: canonical rule = every non-excluded top-level dir with >=1
    # code file; NOT pruned by CBM edges (bulk participates despite zero
    # cross-module edges)
    local fids
    fids=$(store_val "$store" "','.join(f['fid'] for f in s['features'])")
    [ "$fids" = "app,bulk,lib,src" ] \
        && ok "real-shape: fids exactly app,bulk,lib,src, edge-pruning gone ($fids)" \
        || no "real-shape: fids=$fids (want app,bulk,lib,src)"

    # entrypoint detection: name stem heuristic (main/index/app/__main__/server)
    store_val "$store" "[f['entrypoints'] for f in s['features'] if f['fid'] == 'app']" | grep -q "app/main.py" \
        && ok "real-shape: app entrypoints detect app/main.py by stem" \
        || no "real-shape: app entrypoints missing main.py: $(store_val "$store" "[f['entrypoints'] for f in s['features'] if f['fid'] == 'app']")"

    # edges: DEFINES-resolved CALLS must appear; excluded types must not
    local edge_set
    edge_set=$(store_val "$store" "sorted((e['source'], e['target'], e['type']) for e in s['edges'])")
    store_val "$store" "sorted((e['source'], e['target'], e['type']) for e in s['edges']) == [('app', 'lib', 'CALLS'), ('app', 'lib', 'IMPORTS'), ('app', 'lib', 'INHERITS'), ('src', 'lib', 'IMPORTS')]" | grep -q True \
        && ok "real-shape: edges exactly the 4 cross-module arch edges (DEFINES-resolved CALLS present)" \
        || no "real-shape: edge set wrong: $edge_set"

    # excluded types counted into meta for the change view
    local counts
    counts=$(store_val "$store" "s['meta'].get('edge_type_counts', {})")
    store_val "$store" "(s['meta'].get('edge_type_counts', {}).get('DEFINES', 0) >= 5 and s['meta']['edge_type_counts'].get('USAGE', 0) == 1 and s['meta']['edge_type_counts'].get('CONTAINS_FILE', 0) == 1 and s['meta']['edge_type_counts'].get('TESTS', 0) == 1 and s['meta']['edge_type_counts'].get('CONFIGURES', 0) == 1)" | grep -q True \
        && ok "real-shape: meta.edge_type_counts carries excluded types ($counts)" \
        || no "real-shape: edge_type_counts wrong: $counts"

    # no node may resolve to an empty module name: absolute paths outside the
    # repo have no top-level dir and must be excluded entirely (regression:
    # "" module key leaked into the store and broke the views cross-check)
    store_val "$store" "not any(m['name'] == '' for m in s['modules'])" | grep -q True \
        && ok "real-shape: no empty-string module key" \
        || no "real-shape: empty-string module leaked: $(store_val "$store" "[m['name'] for m in s['modules']]")"
    [ "$noise_sum" -eq 11 ] \
        && ok "real-shape: outside-repo paths excluded from module counts (sum still 11)" \
        || no "real-shape: outside-repo nodes counted (sum=$noise_sum, want 11)"

    # coupling: normal pair kept, 600-file bulk commit capped out
    store_val "$store" "any(p['files'] == ['app/main.py', 'lib/util.py'] and p['count'] == 1 for p in s['coupling'])" | grep -q True \
        && ok "real-shape: expected coupling pair present with count 1" \
        || no "real-shape: expected coupling pair missing: $(store_val "$store" "s['coupling']")"
    store_val "$store" "not any('bulk_' in f for p in s['coupling'] for f in p['files'])" | grep -q True \
        && ok "real-shape: bulk commit (>400 files) excluded from coupling" \
        || no "real-shape: bulk-commit pair leaked into coupling"
    [ "$(store_val "$store" "len(s['coupling'])")" -eq 1 ] \
        && ok "real-shape: coupling holds exactly the small-commit pair" \
        || no "real-shape: coupling length=$(store_val "$store" "len(s['coupling'])") (want 1)"

    # fingerprint still self-consistent
    local fp recomp
    fp=$(store_val "$store" "s['meta']['fingerprint']")
    recomp=$(fp_of "$store" 2>/dev/null || true)
    [ -n "$recomp" ] && [ "$fp" = "$recomp" ] \
        && ok "real-shape: fingerprint matches recomputation" \
        || no "real-shape: fingerprint mismatch ($fp vs $recomp)"
}

# ---------------------------------------------------------------------------
# Minimal-schema snapshot: only nodes(id, file_path) and
# edges(source_id, target_id, type), the shape tests/test-wiki-views.sh
# builds for its arch case. Regression: the extractor required the full
# real-schema columns (label, properties), hit sqlite errors on this shape,
# and silently fell back to degraded mode (cbm_mode=none, zero edges).
make_minimal_cbm() { # <repo>
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
    (7, "parsing"),             # dir-path node (real snapshots carry these)
])
conn.executemany("INSERT INTO edges (source_id, target_id, type) VALUES (?, ?, ?)", [
    (1, 3, "IMPORTS"),   # parsing -> reporting
    (3, 1, "CALLS"),     # reporting -> parsing
    (4, 1, "IMPORTS"),   # main.py -> parsing
    (1, 2, "CALLS"),     # intra-module: dropped
    (2, 1, "IMPORTS"),   # intra-module: dropped
    (4, 6, "CALLS"),     # target has no usable file: dropped
])
conn.commit()
conn.close()
PY
}

case_minimal_schema_snapshot() {
    local REPO_M="$T/fx-$$_m" fids
    make_repo_copy_tree "$REPO_M"
    make_minimal_cbm "$REPO_M"

    local store="$REPO_M/.wiki/store.json"
    if run_extract "$REPO_M" >"$T/extract-m.log" 2>&1; then
        ok "minimal-schema: wiki_extract exit 0"
    else
        no "minimal-schema: wiki_extract failed: $(tail -5 "$T/extract-m.log")"
        return
    fi

    store_val "$store" "s['meta']['cbm_mode']" | grep -qx snapshot \
        && ok "minimal-schema: cbm_mode=snapshot (no silent degraded fallback)" \
        || no "minimal-schema: cbm_mode=$(store_val "$store" "s['meta']['cbm_mode']") (want snapshot)"

    store_val "$store" "dict((m['name'], m['nodes']) for m in s['modules']).get('parsing')" | grep -qx 3 \
        && ok "minimal-schema: usable-path nodes counted label/ext-agnostic (parsing=3 incl dir node)" \
        || no "minimal-schema: parsing nodes=$(store_val "$store" "dict((m['name'], m['nodes']) for m in s['modules']).get('parsing')") (want 3)"

    [ "$(store_val "$store" "sum(e['count'] for e in s['edges'])")" -eq 3 ] \
        && ok "minimal-schema: cross-module edge weight totals 3" \
        || no "minimal-schema: edge weight total=$(store_val "$store" "sum(e['count'] for e in s['edges'])") (want 3)"

    store_val "$store" "not any(m['name'] == '' for m in s['modules'])" | grep -q True \
        && ok "minimal-schema: no empty-string module key" \
        || no "minimal-schema: empty-string module leaked"

    fids=$(store_val "$store" "','.join(f['fid'] for f in s['features'])")
    case ",$fids," in
        *,parsing,*reporting,*|*,reporting,*parsing,*)
            ok "minimal-schema: parsing and reporting features derived ($fids)" ;;
        *) no "minimal-schema: expected parsing+reporting fids, got: $fids" ;;
    esac
}

# ---------------------------------------------------------------------------
# Mode-invariance pair: the same tree extracted with and without a CBM
# snapshot. Cross-machine contract: CBM graph resolution is toolchain-
# dependent, so feature identity and the fingerprint must be CBM-independent;
# the snapshot only enriches edges/counts.
prepare_mode_pair() {
    MODE_SNAP="$T/fx-$$_is"
    make_repo_copy_tree "$MODE_SNAP"
    make_minimal_cbm "$MODE_SNAP"
    run_extract "$MODE_SNAP" >"$T/extract-is.log" 2>&1 || return 1
    MODE_DEG="$T/fx-$$_id"
    make_repo_copy_tree "$MODE_DEG"
    run_extract "$MODE_DEG" >"$T/extract-id.log" 2>&1 || return 1
    STORE_SNAP="$MODE_SNAP/.wiki/store.json"
    STORE_DEG="$MODE_DEG/.wiki/store.json"
}

case_fp_mode_invariant() {
    prepare_mode_pair || { no "fp-mode-invariant: mode-pair extracts failed"; return; }
    store_val "$STORE_SNAP" "s['meta']['cbm_mode']" | grep -qx snapshot \
        && store_val "$STORE_DEG" "s['meta']['cbm_mode']" | grep -qx none \
        && ok "fp-mode-invariant: pair built (snapshot + degraded)" \
        || { no "fp-mode-invariant: pair modes wrong ($(store_val "$STORE_SNAP" "s['meta']['cbm_mode']")/$(store_val "$STORE_DEG" "s['meta']['cbm_mode']"))"; return; }
    local fp1 fp2
    if fp1=$(fp_of "$STORE_SNAP") && fp2=$(fp_of "$STORE_DEG") \
        && [ -n "$fp1" ] && [ "$fp1" = "$fp2" ]; then
        ok "fp-mode-invariant: snapshot and degraded fingerprints identical"
    else
        no "fp-mode-invariant: fingerprints differ across modes ($fp1 vs $fp2)"
    fi
}

case_features_mode_invariant() {
    [ -f "${STORE_SNAP:-}" ] || { no "features-mode-invariant: mode pair missing"; return; }
    local f1 f2
    f1=$(store_val "$STORE_SNAP" "','.join(f['fid'] for f in s['features'])")
    f2=$(store_val "$STORE_DEG" "','.join(f['fid'] for f in s['features'])")
    [ -n "$f2" ] && [ "$f1" = "$f2" ] \
        && ok "features-mode-invariant: fids identical across modes ($f1)" \
        || no "features-mode-invariant: fids differ ('$f1' vs '$f2')"
    # entrypoints are canonical too: identical across modes
    local e1 e2
    e1=$(store_val "$STORE_SNAP" "sorted(set(e for f in s['features'] for e in f.get('entrypoints', [])))")
    e2=$(store_val "$STORE_DEG" "sorted(set(e for f in s['features'] for e in f.get('entrypoints', [])))")
    [ "$e1" = "$e2" ] \
        && ok "features-mode-invariant: entrypoints identical across modes" \
        || no "features-mode-invariant: entrypoints differ ('$e1' vs '$e2')"
}

# ---------------------------------------------------------------------------
case_fp_stable() {
    if [ ! -f "$LIB/fingerprint.sh" ]; then no "fp-stable: lib/fingerprint.sh exists"; return; fi
    ok "fp-stable: lib/fingerprint.sh exists"

    # logically identical canonical content: different key order, whitespace,
    # generated_at, repo path, one carrying an existing fingerprint field, and
    # one carrying full CBM enrichment (modules/edges/edge_type_counts) that
    # the canonical subset must ignore
    cat >"$T/a.json" <<'EOF'
{"features":[{"fid":"parsing","files":["parsing/parser.py"]}],"meta":{"repo":"/x/repo","cbm_mode":"snapshot","generated_at":"2026-09-12T10:00:00Z"}}
EOF
    cat >"$T/b.json" <<'EOF'
{
  "modules": [{"name": "parsing", "files": ["parsing/parser.py"], "nodes": 9}],
  "edges": [{"source": "service.py", "target": "parsing", "type": "IMPORTS", "count": 1}],
  "coupling": [],
  "meta": {"generated_at": "1999-01-01T00:00:00Z", "cbm_mode": "snapshot", "repo": "/somewhere/else", "fingerprint": "deadbeef", "edge_type_counts": {"DEFINES": 5}},
  "features": [{"files": ["parsing/parser.py"], "fid": "parsing", "edges": 7}]
}
EOF
    local fa fb
    fa=$(fp_of "$T/a.json") && ok "fp-stable: hashes store a" || { no "fp-stable: store a hash failed"; return; }
    if fb=$(fp_of "$T/b.json") && [ "$fa" = "$fb" ] && [ "${#fa}" -eq 64 ]; then
        ok "fp-stable: same canonical content, same 64-hex hash (order/whitespace/meta/CBM enrichment ignored)"
    else
        no "fp-stable: equal-content hashes differ ('$fa' vs '$fb')"
    fi

    # changed canonical content must change the hash
    cat >"$T/c.json" <<'EOF'
{"features":[{"fid":"parsing","files":["parsing/parser.py","parsing/regexes.py"]}],"meta":{"repo":"/x/repo","cbm_mode":"snapshot","generated_at":"2026-09-12T10:00:00Z"}}
EOF
    local fc
    fc=$(fp_of "$T/c.json") && [ "$fc" != "$fa" ] \
        && ok "fp-stable: changed feature files differ" \
        || no "fp-stable: changed feature files hashed same as original"

    # entrypoints are canonical inputs: a change must flip the hash
    cat >"$T/e.json" <<'EOF'
{"features":[{"fid":"parsing","files":["parsing/parser.py"],"entrypoints":["parsing/main.py"]}],"meta":{"repo":"/x/repo","cbm_mode":"snapshot","generated_at":"2026-09-12T10:00:00Z"}}
EOF
    local fe
    fe=$(fp_of "$T/e.json") && [ "$fe" != "$fa" ] \
        && ok "fp-stable: changed entrypoints differ" \
        || no "fp-stable: entrypoint change not reflected"

    # coupling is a canonical input: a change must flip the hash
    cat >"$T/f.json" <<'EOF'
{"features":[{"fid":"parsing","files":["parsing/parser.py"]}],"coupling":[{"files":["parsing/parser.py","util.py"],"count":1}],"meta":{"repo":"/x/repo","cbm_mode":"snapshot","generated_at":"2026-09-12T10:00:00Z"}}
EOF
    local ff
    ff=$(fp_of "$T/f.json") && [ "$ff" != "$fa" ] \
        && ok "fp-stable: changed coupling differs" \
        || no "fp-stable: coupling change not reflected"

    # CBM enrichment stays excluded: flipping cbm_mode must NOT change the hash
    cat >"$T/d.json" <<'EOF'
{"features":[{"fid":"parsing","files":["parsing/parser.py"]}],"meta":{"repo":"/x/repo","cbm_mode":"none","generated_at":"2026-09-12T10:00:00Z"}}
EOF
    local fd
    fd=$(fp_of "$T/d.json") && [ "$fd" = "$fa" ] \
        && ok "fp-stable: cbm_mode flip does not change hash (enrichment excluded)" \
        || no "fp-stable: cbm_mode changed the hash (must be excluded)"

    # unparseable JSON fails loudly, nonzero exit
    printf 'not json at all\n' >"$T/bad.json"
    local rc=0
    fp_of "$T/bad.json" >/dev/null 2>&1 || rc=$?
    [ "$rc" -ne 0 ] && ok "fp-stable: invalid JSON exits nonzero" \
        || no "fp-stable: invalid JSON exited 0"

    # missing file fails loudly
    rc=0
    fp_of "$T/never-was.json" >/dev/null 2>&1 || rc=$?
    [ "$rc" -ne 0 ] && ok "fp-stable: missing file exits nonzero" \
        || no "fp-stable: missing file exited 0"
}

# ---------------------------------------------------------------------------
case_extract_fixture() {
    if [ ! -f "$LIB/extract-features.sh" ]; then no "extract-fixture: lib/extract-features.sh exists"; return; fi
    ok "extract-fixture: lib/extract-features.sh exists"
    grep -q 'fingerprint\.sh' "$LIB/extract-features.sh" \
        && ok "extract-fixture: extractor sources lib/fingerprint.sh" \
        || no "extract-fixture: extractor does not source fingerprint.sh"

    # unique basenames per run keep CBM project names collision-free
    local REPO_A="$T/fx-$$_a" REPO_B="$T/fx-$$_b"
    make_git_fixture "$REPO_A"
    [ "$(git -C "$REPO_A" rev-list --count HEAD)" -ge 2 ] \
        && ok "extract-fixture: git fixture has >=2 commits" \
        || no "extract-fixture: git fixture commit count < 2"

    # CBM candidate chain, mirroring Phase 1: env, verification build, normal chain
    local cand="${CBM_BIN:-}"
    if [ -z "$cand" ] || [ ! -x "$cand" ]; then
        if [ -x /tmp/cbm-test/codebase-memory-mcp ]; then
            cand=/tmp/cbm-test/codebase-memory-mcp
        fi
    fi
    if [ -z "$cand" ] || [ ! -x "$cand" ]; then
        cand=$(env HOME="$HOME" PATH="$PATH" bash -c '
            source "$1/wiki-env.sh"
            wiki_env_load "$2"
            printf "%s" "${CBM_BIN-}"
        ' _ "$LIB" "$FIXTURE")
    fi
    local have_cbm=0
    if [ -n "$cand" ] && [ -x "$cand" ]; then
        have_cbm=1
        echo "extract-fixture: using CBM binary $cand"
        rm -rf "$REPO_A/.wiki"
        mkdir -p "$T/cbm-cache"
        if CBM_BIN="$cand" CBM_CACHE_DIR="$T/cbm-cache" bash -c '
            set -uo pipefail
            source "$1/cbm-index.sh"
            wiki_cbm_index "$2" fast >/dev/null
        ' _ "$LIB" "$REPO_A"; then
            ok "extract-fixture: wiki_cbm_index on git fixture copy"
        else
            no "extract-fixture: wiki_cbm_index failed on $REPO_A"
            have_cbm=0
        fi
        [ -s "$REPO_A/.wiki/cache/cbm.db" ] \
            && ok "extract-fixture: snapshot present before extract" \
            || { no "extract-fixture: snapshot missing after index"; have_cbm=0; }
    else
        skip "extract-fixture: CBM binary not found (set CBM_BIN or wiki doctor --install); snapshot-mode subcases skipped"
    fi

    # extract (snapshot mode when indexed above, else degraded git-only)
    local store="$REPO_A/.wiki/store.json"
    if run_extract "$REPO_A" >"$T/extract-a.log" 2>&1; then
        ok "extract-fixture: wiki_extract exit 0 ($([ "$have_cbm" -eq 1 ] && echo snapshot || echo degraded-git))"
    else
        no "extract-fixture: wiki_extract failed: $(tail -5 "$T/extract-a.log")"
        return
    fi
    [ -s "$store" ] && ok "extract-fixture: store.json written" || no "extract-fixture: store.json missing"

    # ---- common asserts (hold in both modes) ----
    local keys
    keys=$(store_val "$store" "sorted(s.keys())" 2>/dev/null) \
        && ok "extract-fixture: store parses as JSON" \
        || { no "extract-fixture: store.json is not valid JSON"; return; }
    [ "$keys" = "['coupling', 'edges', 'features', 'meta', 'modules']" ] \
        && ok "extract-fixture: top-level keys exactly features/modules/edges/coupling/meta" \
        || no "extract-fixture: top-level keys=$keys"

    local mode fids fp recomp
    mode=$(store_val "$store" "s['meta']['cbm_mode']")
    [ "$mode" = "snapshot" ] || [ "$mode" = "none" ] \
        && ok "extract-fixture: meta.cbm_mode is snapshot|none ($mode)" \
        || no "extract-fixture: meta.cbm_mode='$mode'"

    fids=$(store_val "$store" "','.join(f['fid'] for f in s['features'])")
    case ",$fids," in
        *,parsing,*reporting,*|*,reporting,*parsing,*)
            ok "extract-fixture: features include parsing and reporting (fids: $fids)" ;;
        *) no "extract-fixture: expected parsing+reporting fids, got: $fids" ;;
    esac

    store_val "$store" "len(set(tuple(sorted(f.keys())) for f in s['features'])) == 1 and tuple(sorted(s['features'][0].keys())) == ('edges', 'entrypoints', 'fid', 'files', 'name')" | grep -q True \
        && ok "extract-fixture: each feature has exactly fid/name/files/edges/entrypoints" \
        || no "extract-fixture: unexpected feature key set"
    store_val "$store" "all(f['files'] for f in s['features'])" | grep -q True \
        && ok "extract-fixture: no empty feature file lists" \
        || no "extract-fixture: a feature has an empty file list"

    fp=$(store_val "$store" "s['meta']['fingerprint']")
    recomp=$(fp_of "$store" 2>/dev/null || true)
    if printf '%s' "$fp" | grep -Eq '^[0-9a-f]{64}$' && [ "$fp" = "$recomp" ]; then
        ok "extract-fixture: meta.fingerprint is 64-hex and matches recomputed wiki_fingerprint"
    else
        no "extract-fixture: fingerprint mismatch (stored='$fp' recomputed='$recomp')"
    fi

    # re-extract is fingerprint-stable
    local fp1="$fp"
    if run_extract "$REPO_A" >>"$T/extract-a.log" 2>&1; then
        local fp2
        fp2=$(store_val "$store" "s['meta']['fingerprint']")
        [ "$fp1" = "$fp2" ] \
            && ok "extract-fixture: re-extract yields identical fingerprint" \
            || no "extract-fixture: re-extract fingerprint drifted ($fp1 vs $fp2)"
    else
        no "extract-fixture: second wiki_extract failed"
    fi

    # coupling: git co-change pairs, deterministic ordering, expected pair
    local coup_n
    coup_n=$(store_val "$store" "len(s['coupling'])")
    if [ "${coup_n:-0}" -gt 0 ]; then
        ok "extract-fixture: coupling non-empty ($coup_n pairs)"
        local ordered
        ordered=$(store_val "$store" "[p['count'] for p in s['coupling']]")
        [ "$ordered" = "$(store_val "$store" "sorted([p['count'] for p in s['coupling']], reverse=True)")" ] \
            && ok "extract-fixture: coupling sorted by count desc" \
            || no "extract-fixture: coupling ordering wrong: $ordered"
        store_val "$store" "any(p['files'] == ['parsing/parser.py', 'reporting/reporter.py'] for p in s['coupling'])" | grep -q True \
            && ok "extract-fixture: expected co-change pair (parser.py, reporter.py) present" \
            || no "extract-fixture: expected co-change pair missing"
    else
        no "extract-fixture: coupling empty despite >=2 commits"
    fi

    # ---- snapshot-mode-only asserts ----
    if [ "$have_cbm" -eq 1 ]; then
        [ "$mode" = "snapshot" ] \
            && ok "extract-fixture: snapshot indexed, meta.cbm_mode=snapshot" \
            || no "extract-fixture: snapshot present but cbm_mode=$mode"

        local mods modn
        mods=$(store_val "$store" "','.join(m['name'] for m in s['modules'])")
        modn=$(store_val "$store" "len(s['modules'])")
        for want in parsing reporting main.py service.py; do
            case ",$mods," in
                *",$want,"*) ok "extract-fixture: module '$want' present" ;;
                *) no "extract-fixture: module '$want' missing (modules: $mods)" ;;
            esac
        done
        [ "$modn" -ge 5 ] && ok "extract-fixture: >=5 modules ($modn)" \
            || no "extract-fixture: module count=$modn (want >=5)"

        local nedges
        nedges=$(store_val "$store" "len(s['edges'])")
        [ "${nedges:-0}" -gt 0 ] \
            && ok "extract-fixture: edges non-empty ($nedges module-level)" \
            || no "extract-fixture: edges empty despite snapshot"

        store_val "$store" "all(e['source'] != e['target'] for e in s['edges'])" | grep -q True \
            && ok "extract-fixture: no self-module edges" \
            || no "extract-fixture: self-module edge leaked into edges[]"

        local parse_edges
        parse_edges=$(store_val "$store" "sum(e['count'] for e in s['edges'] if e['target'] == 'parsing')")
        [ "${parse_edges:-0}" -gt 0 ] \
            && ok "extract-fixture: parsing feature carries inbound edge weight ($parse_edges)" \
            || no "extract-fixture: parsing has no inbound edges"
    fi

    # ---- degraded git-only mode: plain copy, no git, no snapshot ----
    mkdir -p "$REPO_B"
    cp -r "$FIXTURE/." "$REPO_B/"
    rm -rf "$REPO_B/.wiki"
    local store_b="$REPO_B/.wiki/store.json"
    if run_extract "$REPO_B" >"$T/extract-b.log" 2>&1; then
        ok "extract-fixture: degraded (no CBM, no git) exit 0"
    else
        no "extract-fixture: degraded extract failed: $(tail -5 "$T/extract-b.log")"
        return
    fi
    [ -s "$store_b" ] && ok "extract-fixture: degraded store.json written" \
        || no "extract-fixture: degraded store.json missing"
    store_val "$store_b" "s['meta']['cbm_mode']" | grep -qx none \
        && ok "extract-fixture: degraded meta.cbm_mode=none" \
        || no "extract-fixture: degraded cbm_mode=$(store_val "$store_b" "s['meta']['cbm_mode']")"
    local nb
    nb=$(store_val "$store_b" "len(s['features'])")
    [ "${nb:-0}" -ge 2 ] \
        && ok "extract-fixture: degraded mode still yields >=2 features ($nb)" \
        || no "extract-fixture: degraded features=$nb (want >=2)"
    store_val "$store_b" "','.join(f['fid'] for f in s['features'])" | grep -q parsing \
        && ok "extract-fixture: degraded features include parsing" \
        || no "extract-fixture: degraded features lack parsing"
    [ "$(store_val "$store_b" "len(s['edges'])")" -eq 0 ] \
        && ok "extract-fixture: degraded edges empty" \
        || no "extract-fixture: degraded edges non-empty without a snapshot"
    [ "$(store_val "$store_b" "len(s['coupling'])")" -eq 0 ] \
        && ok "extract-fixture: degraded (no git) coupling empty" \
        || no "extract-fixture: degraded coupling non-empty without git"

    # ---- tree purity: nothing written outside <repo>/.wiki/ ----
    if diff <(list_tree "$FIXTURE") <(list_tree "$REPO_B") >"$T/tree.diff" 2>&1; then
        ok "extract-fixture: extract wrote nothing outside <repo>/.wiki/"
    else
        no "extract-fixture: unexpected files outside .wiki/: $(head -5 "$T/tree.diff")"
    fi
}

# ---------------------------------------------------------------------------
case_gitignore_untracked() {
    if grep -Eq '^(\*\*/)?\.wiki/store\.json$' "$GITIGNORE" 2>/dev/null; then
        ok "gitignore-untracked: .gitignore has .wiki/store.json entry"
    else
        no "gitignore-untracked: .gitignore missing .wiki/store.json entry"
    fi
    if grep -Eq '^(\*\*/)?\.wiki/cache/$' "$GITIGNORE" 2>/dev/null; then
        ok "gitignore-untracked: .gitignore has .wiki/cache/ entry"
    else
        no "gitignore-untracked: .gitignore missing .wiki/cache/ entry"
    fi

    local p rc
    for p in .wiki/store.json .wiki/cache/cbm.db \
             tests/fixtures/wiki-fixture-repo/.wiki/store.json \
             tests/fixtures/wiki-fixture-repo/.wiki/cache/cbm.db; do
        rc=0
        git -C "$ROOT" check-ignore -q "$p" 2>/dev/null || rc=$?
        [ "$rc" -eq 0 ] && ok "gitignore-untracked: check-ignore $p" \
            || no "gitignore-untracked: check-ignore missed $p (rc=$rc)"
    done
}

# ---------------------------------------------------------------------------
case_fp_stable
case_fp_mode_invariant
case_features_mode_invariant
case_minimal_schema_snapshot
case_real_shape_snapshot
case_extract_fixture
case_gitignore_untracked

echo
echo "wiki-extract: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
