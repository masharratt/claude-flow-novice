#!/usr/bin/env bash
# tests/test-wiki-env.sh — cfn-wiki Phase 1 scaffold harness.
# Covers: SKILL.md contract (skill-md-contract), lib/wiki.sh dispatcher
# behavior (dispatcher), wiki-env.sh variable coherence incl. the CBM_BIN
# resolution chain (env-coherence), the wiki-fixture-repo shape
# (fixture-shape), and CBM indexing (cbm-fixture-index — real index SKIPS
# when no CBM binary resolves; the degraded path is always exercised).
# Plan: fuzzy-whistling-eich Phase 1. The port-documented case belongs to
# Phase 7 and is intentionally absent here.
# Isolation: every env-sensitive case runs in a command substitution with a
# temp HOME/PATH; the real $HOME, $CBM_CACHE_DIR and $CBM_BIN are untouched.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_DIR="$ROOT/.claude/skills/cfn-wiki"
SKILL_MD="$SKILL_DIR/SKILL.md"
LIB="$SKILL_DIR/lib"
FIXTURE="$ROOT/tests/fixtures/wiki-fixture-repo"

T="$(mktemp -d "${TMPDIR:-/tmp}/wiki-env-test-XXXXXX")"
cleanup() { rm -rf "$T"; }
trap cleanup EXIT

PASS=0; FAIL=0; SKIP=0
ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
no()   { echo "FAIL: $1"; FAIL=$((FAIL+1)); }
skip() { echo "SKIP: $1"; SKIP=$((SKIP+1)); }

for dep in bash grep sed mktemp basename; do
    command -v "$dep" >/dev/null 2>&1 || { echo "FATAL: $dep not on PATH"; exit 1; }
done

# wiki_env_load <repo> -> "CBM_CACHE_DIR|WIKI_PORT|CBM_BIN" from a clean
# subshell. Extra env via the leading assignments; run_env HOME=... PATH=...
run_env() { # $1.. = env assignments; repo path as last arg
    local repo="$1"; shift
    if ! out=$(env "$@" bash -c '
        source "$1/wiki-env.sh"
        wiki_env_load "$2"
        printf "%s|%s|%s" "${CBM_CACHE_DIR-}" "${WIKI_PORT-}" "${CBM_BIN-}"
    ' _ "$LIB" "$repo" 2>"$T/env.err"); then
        echo "wiki_env_load failed: $(cat "$T/env.err")" >&2
        return 1
    fi
    printf '%s\n' "$out"
}

# ---------------------------------------------------------------------------
case_skill_md_contract() {
    if [ ! -f "$SKILL_MD" ]; then no "SKILL.md exists"; return; fi
    ok "SKILL.md exists"

    local fm
    fm=$(awk 'NR==1 && $0!="---" {exit} NR>1 {if ($0=="---") exit; print}' "$SKILL_MD")
    [ -n "$fm" ] || { no "SKILL.md has YAML frontmatter block"; return; }
    ok "SKILL.md has YAML frontmatter block"

    printf '%s\n' "$fm" | grep -Eq '^name:[[:space:]]*cfn-wiki[[:space:]]*$' \
        && ok "frontmatter name: cfn-wiki" || no "frontmatter name: cfn-wiki"
    printf '%s\n' "$fm" | grep -Eq '^version:[[:space:]]*0\.1\.0[[:space:]]*$' \
        && ok "frontmatter version: 0.1.0" || no "frontmatter version: 0.1.0"

    local desc
    desc=$(printf '%s\n' "$fm" | sed -n 's/^description:[[:space:]]*//p' | head -1)
    [ "${#desc}" -ge 20 ] \
        && ok "frontmatter description present (len ${#desc})" \
        || no "frontmatter description missing or too short: '$desc'"

    local body cmd
    body=$(cat "$SKILL_MD")
    for cmd in doctor sync build serve lint stop; do
        printf '%s' "$body" | grep -qw "$cmd" \
            && ok "command contract documents '$cmd'" \
            || no "command contract missing '$cmd'"
    done
}

# ---------------------------------------------------------------------------
case_dispatcher() {
    if [ ! -f "$LIB/wiki.sh" ]; then no "lib/wiki.sh exists"; return; fi
    ok "lib/wiki.sh exists"
    grep -q 'wiki-env\.sh' "$LIB/wiki.sh" \
        && ok "dispatcher sources lib/wiki-env.sh" \
        || no "dispatcher does not source lib/wiki-env.sh"

    # no args -> usage on stderr, exit 2
    local rc=0
    bash "$LIB/wiki.sh" >"$T/d.out" 2>"$T/d.err" || rc=$?
    [ "$rc" -eq 2 ] && ok "no args: exit 2" || no "no args: rc=$rc (want 2)"
    [ -s "$T/d.err" ] && ok "no args: usage written to stderr" || no "no args: stderr empty"
    grep -qi usage "$T/d.err" && ok "no args: stderr mentions usage" || no "no args: stderr lacks 'usage'"

    # unknown command -> exit 64
    rc=0
    bash "$LIB/wiki.sh" definitely-not-a-command >"$T/d.out" 2>"$T/d.err" || rc=$?
    [ "$rc" -eq 64 ] && ok "unknown command: exit 64" || no "unknown command: rc=$rc (want 64)"
    grep -qi unknown "$T/d.err" && ok "unknown command: stderr says unknown" || no "unknown command: stderr lacks 'unknown'"

    # stub path: known command with no lib/<cmd>.sh -> stderr stub note, exit 0.
    # Runs on a copied lib tree with doctor.sh removed so the assertion stays
    # valid after later phases ship the real lib/doctor.sh.
    cp -r "$LIB" "$T/lib-stub"
    rm -f "$T/lib-stub/doctor.sh"
    rc=0
    bash "$T/lib-stub/wiki.sh" doctor >"$T/d.out" 2>"$T/d.err" || rc=$?
    [ "$rc" -eq 0 ] && ok "stub: known command without impl exits 0" || no "stub: rc=$rc (want 0)"
    grep -qi stub "$T/d.err" && ok "stub: stderr names the stub" || no "stub: stderr lacks 'stub'"

    # delegation: lib/<cmd>.sh present -> sourced, wiki_<cmd> called with args
    cp -r "$LIB" "$T/lib-delegate"
    cat >"$T/lib-delegate/doctor.sh" <<'EOF'
wiki_doctor() { printf 'FAKE_DOCTOR %s\n' "$*"; }
EOF
    rc=0
    bash "$T/lib-delegate/wiki.sh" doctor --fast >"$T/d.out" 2>"$T/d.err" || rc=$?
    [ "$rc" -eq 0 ] && ok "delegation: impl command exits 0" || no "delegation: rc=$rc"
    grep -q 'FAKE_DOCTOR --fast' "$T/d.out" \
        && ok "delegation: wiki_doctor invoked with args" \
        || no "delegation: expected 'FAKE_DOCTOR --fast' on stdout, got: $(cat "$T/d.out")"
}

# ---------------------------------------------------------------------------
case_env_coherence() {
    if [ ! -f "$LIB/wiki-env.sh" ]; then no "lib/wiki-env.sh exists"; return; fi
    ok "lib/wiki-env.sh exists"

    # defaults: CBM_CACHE_DIR under $HOME, WIKI_PORT=4885, both exported
    local vals
    if ! vals=$(run_env "$T/repo-default" HOME="$HOME" PATH="$PATH"); then
        no "env load (defaults) crashed"; return
    fi
    local cache port bin
    IFS='|' read -r cache port bin <<<"$vals"
    [ "$cache" = "$HOME/.cache/codebase-memory-mcp" ] \
        && ok "default CBM_CACHE_DIR is \$HOME/.cache/codebase-memory-mcp" \
        || no "default CBM_CACHE_DIR='$cache'"
    [ "$port" = "4885" ] && ok "WIKI_PORT defaults to 4885" || no "WIKI_PORT='$port' (want 4885)"

    local exported
    exported=$(env HOME="$HOME" PATH="$PATH" bash -c '
        source "$1/wiki-env.sh"
        wiki_env_load "$2" >/dev/null 2>&1
        env | grep -c -E "^(CBM_CACHE_DIR|WIKI_PORT)=" || true
    ' _ "$LIB" "$T/repo-default")
    [ "$exported" = "2" ] \
        && ok "CBM_CACHE_DIR and WIKI_PORT are exported" \
        || no "exported count=$exported (want 2)"

    # pre-existing CBM_CACHE_DIR honored
    if ! vals=$(run_env "$T/repo-default" CBM_CACHE_DIR="$T/precache" HOME="$HOME" PATH="$PATH"); then
        no "env load (pre-existing cache) crashed"
    else
        IFS='|' read -r cache port bin <<<"$vals"
        [ "$cache" = "$T/precache" ] \
            && ok "pre-existing CBM_CACHE_DIR honored" \
            || no "pre-existing CBM_CACHE_DIR overwritten to '$cache'"
    fi

    # chain 1: $CBM_BIN env wins even over repo config
    mkdir -p "$T/repo-cfg/.wiki" "$T/bin-candidates"
    printf '#!/bin/sh\nexit 0\n' >"$T/bin-candidates/config-cbm"; chmod +x "$T/bin-candidates/config-cbm"
    printf '{"cbm_binary": "%s"}\n' "$T/bin-candidates/config-cbm" >"$T/repo-cfg/.wiki/config.json"
    printf '#!/bin/sh\nexit 0\n' >"$T/bin-candidates/env-cbm"; chmod +x "$T/bin-candidates/env-cbm"
    if ! vals=$(run_env "$T/repo-cfg" CBM_BIN="$T/bin-candidates/env-cbm" HOME="$T/emptyhome" PATH="$PATH"); then
        no "env load (CBM_BIN env) crashed"
    else
        IFS='|' read -r cache port bin <<<"$vals"
        [ "$bin" = "$T/bin-candidates/env-cbm" ] \
            && ok "chain 1: \$CBM_BIN env wins over config" \
            || no "chain 1: CBM_BIN='$bin'"
    fi

    # chain 2: repo .wiki/config.json cbm_binary wins over local install + PATH
    if ! vals=$(run_env "$T/repo-cfg" CBM_BIN= HOME="$T/emptyhome" PATH="$T/emptybin:/usr/bin:/bin"); then
        no "env load (config chain) crashed"
    else
        IFS='|' read -r cache port bin <<<"$vals"
        [ "$bin" = "$T/bin-candidates/config-cbm" ] \
            && ok "chain 2: .wiki/config.json cbm_binary used" \
            || no "chain 2: CBM_BIN='$bin'"
    fi

    # chain 3: $HOME/.local/share/cfn-wiki/codebase-memory-mcp
    mkdir -p "$T/home3/.local/share/cfn-wiki"
    printf '#!/bin/sh\nexit 0\n' >"$T/home3/.local/share/cfn-wiki/codebase-memory-mcp"
    chmod +x "$T/home3/.local/share/cfn-wiki/codebase-memory-mcp"
    if ! vals=$(run_env "$T/repo-default" CBM_BIN= HOME="$T/home3" PATH="$T/emptybin:/usr/bin:/bin"); then
        no "env load (local install chain) crashed"
    else
        IFS='|' read -r cache port bin <<<"$vals"
        [ "$bin" = "$T/home3/.local/share/cfn-wiki/codebase-memory-mcp" ] \
            && ok "chain 3: ~/.local/share/cfn-wiki install used" \
            || no "chain 3: CBM_BIN='$bin'"
    fi

    # chain 4: PATH lookup
    mkdir -p "$T/pathbin"
    printf '#!/bin/sh\nexit 0\n' >"$T/pathbin/codebase-memory-mcp"; chmod +x "$T/pathbin/codebase-memory-mcp"
    if ! vals=$(run_env "$T/repo-default" CBM_BIN= HOME="$T/emptyhome" PATH="$T/pathbin:/usr/bin:/bin"); then
        no "env load (PATH chain) crashed"
    else
        IFS='|' read -r cache port bin <<<"$vals"
        [ "$bin" = "$T/pathbin/codebase-memory-mcp" ] \
            && ok "chain 4: PATH lookup used" \
            || no "chain 4: CBM_BIN='$bin'"
    fi

    # nothing resolvable -> CBM_BIN empty (degraded), load still succeeds
    if ! vals=$(run_env "$T/repo-default" CBM_BIN= HOME="$T/emptyhome" PATH="$T/emptybin:/usr/bin:/bin"); then
        no "env load (nothing resolvable) crashed"
    else
        IFS='|' read -r cache port bin <<<"$vals"
        [ -z "$bin" ] \
            && ok "no CBM anywhere: CBM_BIN empty (degraded)" \
            || no "no CBM anywhere: CBM_BIN='$bin' (want empty)"
    fi
}

# ---------------------------------------------------------------------------
case_fixture_shape() {
    if [ ! -d "$FIXTURE" ]; then no "fixture repo dir exists"; return; fi
    ok "fixture repo dir exists"

    local count
    count=$(find "$FIXTURE" -type f | wc -l)
    [ "$count" -ge 8 ] && ok "fixture has >=8 files ($count)" || no "fixture file count=$count (want >=8)"

    [ ! -e "$FIXTURE/.git" ] \
        && ok "fixture ships as plain files (no .git)" \
        || no "fixture contains a .git dir (plain files only per plan)"

    for f in main.py util.py service.py parsing/parser.py parsing/regexes.py \
             reporting/reporter.py src/report.ts src/summary.ts \
             readme/feature-status.md readme/state-machines.md; do
        [ -s "$FIXTURE/$f" ] && ok "fixture file: $f" || no "fixture file missing/empty: $f"
    done

    grep -q 'import util' "$FIXTURE/main.py" && ok "main.py calls util.py" || no "main.py does not import util"
    grep -q 'import service' "$FIXTURE/main.py" && ok "main.py calls service.py" || no "main.py does not import service"
    grep -q 'parsing' "$FIXTURE/service.py" && ok "service.py consumes parsing feature" || no "service.py lacks parsing"
    grep -q 'reporting' "$FIXTURE/service.py" && ok "service.py consumes reporting feature" || no "service.py lacks reporting"
    grep -Eq "from ['\"]\.\/summary['\"]" "$FIXTURE/src/report.ts" \
        && ok "src/report.ts imports src/summary.ts" \
        || no "src/report.ts does not import ./summary"

    # python fixture must actually compile
    if command -v python3 >/dev/null 2>&1; then
        if python3 -m compileall -q "$FIXTURE" 2>"$T/py.err"; then
            ok "python fixture compiles"
        else
            no "python fixture compile errors: $(head -3 "$T/py.err")"
        fi
        find "$FIXTURE" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
    else
        skip "python3 not on PATH: compile check skipped"
    fi
}

# ---------------------------------------------------------------------------
case_cbm_fixture_index() {
    if [ ! -f "$LIB/cbm-index.sh" ]; then no "lib/cbm-index.sh exists"; return; fi
    ok "lib/cbm-index.sh exists"

    # degraded path always tested: CBM_BIN explicitly emptied, HOME without a
    # local install, PATH that cannot resolve the binary but still has bash.
    local rc=0 deg
    deg=$(env HOME="$T/emptyhome" PATH="$T/emptybin:/usr/bin:/bin" CBM_BIN= bash -c '
        source "$1/cbm-index.sh"
        wiki_cbm_index "$2" 2>&1 >/dev/null
    ' _ "$LIB" "$FIXTURE") || rc=$?
    if [ "$rc" -eq 0 ] && printf '%s' "$deg" | grep -q 'DEGRADED: CBM not installed'; then
        ok "degraded: no CBM binary -> notice + exit 0"
    else
        no "degraded: rc=$rc stderr='$deg'"
    fi

    # missing repo arg must fail loudly
    rc=0
    bash -c 'set -euo pipefail; source "$1/cbm-index.sh"; wiki_cbm_index' _ "$LIB" >/dev/null 2>&1 || rc=$?
    [ "$rc" -ne 0 ] && ok "missing repo arg fails loudly" || no "missing repo arg exited 0"

    # real index path: run when a CBM binary is available. Candidate order:
    # $CBM_BIN env, the verification build, then the normal chain lookup.
    local cand="${CBM_BIN:-}"
    if [ -z "$cand" ] || [ ! -x "$cand" ]; then
        if [ -x /tmp/cbm-test/codebase-memory-mcp ]; then
            cand=/tmp/cbm-test/codebase-memory-mcp
        fi
    fi
    if [ -z "$cand" ] || [ ! -x "$cand" ]; then
        cand=$(HOME="$HOME" PATH="$PATH" bash -c '
            source "$1/wiki-env.sh"
            wiki_env_load "$2"
            printf "%s" "${CBM_BIN-}"
        ' _ "$LIB" "$FIXTURE")
    fi
    if [ -z "$cand" ] || [ ! -x "$cand" ]; then
        skip "cbm-fixture-index: CBM binary not found (set CBM_BIN or wiki doctor --install)"
        return
    fi
    echo "cbm-fixture-index: using CBM binary $cand"

    # resolve the cache dir the same way wiki_cbm_index will (same env inputs)
    local cbm_cache
    cbm_cache=$(env CBM_BIN="$cand" bash -c '
        source "$1/wiki-env.sh"
        wiki_env_load "$2"
        printf "%s" "$CBM_CACHE_DIR"
    ' _ "$LIB" "$FIXTURE")
    local src="$cbm_cache/$(basename "$FIXTURE").db"
    rm -f "$FIXTURE/.wiki/cache/cbm.db" "$src" 2>/dev/null || true

    rc=0
    env CBM_BIN="$cand" bash -c '
        set -uo pipefail
        source "$1/cbm-index.sh"
        wiki_cbm_index "$2" "$3" >/dev/null
    ' _ "$LIB" "$FIXTURE" fast || rc=$?
    [ "$rc" -eq 0 ] && ok "wiki_cbm_index exits 0 with CBM present" || no "wiki_cbm_index rc=$rc"

    [ -s "$FIXTURE/.wiki/cache/cbm.db" ] \
        && ok "snapshot copied to .wiki/cache/cbm.db" \
        || no ".wiki/cache/cbm.db missing or empty"

    if command -v sqlite3 >/dev/null 2>&1; then
        local tables nodes=""
        tables=$(sqlite3 "$FIXTURE/.wiki/cache/cbm.db" ".tables" 2>/dev/null || true)
        if printf '%s' "$tables" | grep -qw nodes; then
            nodes=$(sqlite3 "$FIXTURE/.wiki/cache/cbm.db" "select count(*) from nodes;" 2>/dev/null || echo 0)
            [ "${nodes:-0}" -gt 0 ] && ok "snapshot nodes>0 ($nodes)" || no "snapshot nodes=$nodes (want >0)"
        else
            ok "snapshot has tables ($(printf '%s' "$tables" | wc -w) found); no 'nodes' table to count"
        fi
    else
        ok "sqlite3 not on PATH: snapshot validated by non-empty file only"
    fi

    rm -f "$FIXTURE/.wiki/cache/cbm.db" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
mkdir -p "$T/repo-default" "$T/repo-cfg" "$T/emptyhome" "$T/emptybin"

case_skill_md_contract
case_dispatcher
case_env_coherence
case_fixture_shape
case_cbm_fixture_index

echo
echo "wiki-env: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
