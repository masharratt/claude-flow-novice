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
case_fp_stable() {
    if [ ! -f "$LIB/fingerprint.sh" ]; then no "fp-stable: lib/fingerprint.sh exists"; return; fi
    ok "fp-stable: lib/fingerprint.sh exists"

    # logically identical stores: different key order, whitespace, generated_at,
    # repo path, and one carrying an existing fingerprint field
    cat >"$T/a.json" <<'EOF'
{"features":[{"fid":"parsing","files":["parsing/parser.py"]}],"meta":{"repo":"/x/repo","cbm_mode":"snapshot","generated_at":"2026-09-12T10:00:00Z"}}
EOF
    cat >"$T/b.json" <<'EOF'
{
  "meta": {"generated_at": "1999-01-01T00:00:00Z", "cbm_mode": "snapshot", "repo": "/somewhere/else", "fingerprint": "deadbeef"},
  "features": [{"files": ["parsing/parser.py"], "fid": "parsing"}]
}
EOF
    local fa fb
    fa=$(fp_of "$T/a.json") && ok "fp-stable: hashes store a" || { no "fp-stable: store a hash failed"; return; }
    if fb=$(fp_of "$T/b.json") && [ "$fa" = "$fb" ] && [ "${#fa}" -eq 64 ]; then
        ok "fp-stable: same logical content, same 64-hex hash (order/whitespace/generated_at/repo ignored)"
    else
        no "fp-stable: equal-content hashes differ ('$fa' vs '$fb')"
    fi

    # changed content must change the hash
    cat >"$T/c.json" <<'EOF'
{"features":[{"fid":"parsing","files":["parsing/parser.py","parsing/regexes.py"]}],"meta":{"repo":"/x/repo","cbm_mode":"snapshot","generated_at":"2026-09-12T10:00:00Z"}}
EOF
    local fc
    fc=$(fp_of "$T/c.json") && [ "$fc" != "$fa" ] \
        && ok "fp-stable: changed content differs" \
        || no "fp-stable: changed content hashed same as original"

    # non-volatile meta participates
    cat >"$T/d.json" <<'EOF'
{"features":[{"fid":"parsing","files":["parsing/parser.py"]}],"meta":{"repo":"/x/repo","cbm_mode":"none","generated_at":"2026-09-12T10:00:00Z"}}
EOF
    local fd
    fd=$(fp_of "$T/d.json") && [ "$fd" != "$fa" ] \
        && ok "fp-stable: non-volatile meta (cbm_mode) changes hash" \
        || no "fp-stable: cbm_mode change not reflected in hash"

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

    store_val "$store" "len(set(tuple(sorted(f.keys())) for f in s['features'])) == 1 and tuple(sorted(s['features'][0].keys())) == ('edges', 'fid', 'files', 'name')" | grep -q True \
        && ok "extract-fixture: each feature has exactly fid/name/files/edges" \
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
case_extract_fixture
case_gitignore_untracked

echo
echo "wiki-extract: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
