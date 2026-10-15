#!/usr/bin/env bash
# cfn-wiki doctor: verify the CBM substrate before anything consumes it.
#
# Contract: wiki_doctor [--install]
#   default    report CBM_BIN resolution (env > .wiki/config.json >
#              ~/.local/share/cfn-wiki/ > PATH), CBM_CACHE_DIR coherence
#              (one value, exported by wiki-env.sh only, writable — a silent
#              mismatch is the CONNECTION_CLOSED failure this command exists
#              to catch), and portal deps (mmdc, sqlite3, warn-only: the
#              table fallback and degraded extraction keep working without
#              them; python3 missing is fatal).
#              Exit 0 healthy/degraded-with-notice, 1 broken.
#   --install  fetch the pinned CBM v0.10.8 release tarball for THIS
#              platform (linux/darwin x amd64/arm64, wiki_cbm_asset) into
#              ~/.local/share/cfn-wiki/ — the wiki-env resolution target —
#              then re-verify. Idempotent: skipped when the pinned binary is
#              already present and RUNS, so the CI setup step is cheap on
#              cached runners; a present binary that cannot run (wrong
#              architecture) is replaced. A linux-only installer once left
#              an ELF binary on a Mac that doctor still called ok.

WIKI_DOCTOR_LOADED=1

# shellcheck disable=SC1091
[ -n "${WIKI_ENV_LOADED:-}" ] \
    || source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/wiki-env.sh"

WIKI_CBM_VERSION="0.10.8"
WIKI_CBM_RELEASE_BASE="${WIKI_CBM_RELEASE_BASE:-https://github.com/DeusData/codebase-memory-mcp/releases/download/v${WIKI_CBM_VERSION}}"
WIKI_CBM_INSTALL_DIR="${HOME:-/nonexistent}/.local/share/cfn-wiki"

# wiki_cbm_asset: release tarball name for this OS/arch (WIKI_UNAME_S and
# WIKI_UNAME_M override uname for tests). Unsupported platform: rc 1.
wiki_cbm_asset() {
    local os arch
    case "${WIKI_UNAME_S:-$(uname -s)}" in
        Linux)  os=linux ;;
        Darwin) os=darwin ;;
        *) echo "wiki doctor: no CBM release for OS ${WIKI_UNAME_S:-$(uname -s)}" >&2; return 1 ;;
    esac
    case "${WIKI_UNAME_M:-$(uname -m)}" in
        x86_64|amd64)  arch=amd64 ;;
        arm64|aarch64) arch=arm64 ;;
        *) echo "wiki doctor: no CBM release for arch ${WIKI_UNAME_M:-$(uname -m)}" >&2; return 1 ;;
    esac
    printf 'codebase-memory-mcp-%s-%s.tar.gz\n' "$os" "$arch"
}

# wiki_cbm_runs BIN: 0 when BIN executes here. The executable bit alone is
# not proof: a wrong-architecture binary has it and fails with exec format.
wiki_cbm_runs() {
    "$1" --version >/dev/null 2>&1
}

wiki_doctor_install() {
    local bin="$WIKI_CBM_INSTALL_DIR/codebase-memory-mcp"
    if [ -x "$bin" ] && wiki_cbm_runs "$bin"; then
        echo "wiki doctor: pinned CBM v$WIKI_CBM_VERSION already installed at $bin"
        return 0
    fi
    [ -e "$bin" ] && echo "wiki doctor: replacing $bin (present but cannot run here)"
    local asset url
    asset="$(wiki_cbm_asset)" || return 1
    url="$WIKI_CBM_RELEASE_BASE/$asset"
    mkdir -p "$WIKI_CBM_INSTALL_DIR" || {
        echo "wiki doctor: cannot create $WIKI_CBM_INSTALL_DIR" >&2
        return 1
    }
    local tgz
    tgz="$(mktemp "${TMPDIR:-/tmp}/cbm-$WIKI_CBM_VERSION.XXXXXX.tar.gz")" || return 1
    echo "wiki doctor: downloading CBM v$WIKI_CBM_VERSION ($url)"
    if ! curl -fsSL --retry 2 -o "$tgz" "$url"; then
        rm -f "$tgz"
        echo "wiki doctor: download failed (offline? release moved?)" >&2
        return 1
    fi
    if ! tar xzf "$tgz" -C "$WIKI_CBM_INSTALL_DIR"; then
        rm -f "$tgz"
        echo "wiki doctor: tarball extraction failed" >&2
        return 1
    fi
    rm -f "$tgz"
    chmod +x "$bin" 2>/dev/null || true
    if [ ! -x "$bin" ] || ! wiki_cbm_runs "$bin"; then
        echo "wiki doctor: tarball did not yield a runnable $bin" >&2
        return 1
    fi
    echo "wiki doctor: installed $bin (v$WIKI_CBM_VERSION)"
    return 0
}

wiki_doctor() {
    local install=0 arg
    for arg in "$@"; do
        case "$arg" in
            --install) install=1 ;;
            -h|--help) sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; return 0 ;;
            *) echo "wiki doctor: unknown arg: $arg" >&2; return 64 ;;
        esac
    done

    if ! command -v python3 >/dev/null 2>&1; then
        echo "wiki doctor: BROKEN: python3 not on PATH (extract/generate all need it)" >&2
        return 1
    fi

    if [ "$install" -eq 1 ]; then
        wiki_doctor_install || return 1
    fi

    wiki_env_load "${WIKI_DOCTOR_REPO:-$PWD}"

    local broken=0
    if [ -z "${CBM_BIN:-}" ]; then
        echo "wiki doctor: DEGRADED: no CBM binary resolved (env > .wiki/config.json > $WIKI_CBM_INSTALL_DIR > PATH); git-only extraction"
    elif [ ! -x "$CBM_BIN" ]; then
        echo "wiki doctor: BROKEN: CBM_BIN resolved but not executable: $CBM_BIN"
        broken=1
    elif ! wiki_cbm_runs "$CBM_BIN"; then
        echo "wiki doctor: BROKEN: CBM binary cannot run on this machine (wrong OS/arch?): $CBM_BIN; fix: wiki doctor --install"
        broken=1
    elif [ "${CBM_BIN#$WIKI_CBM_INSTALL_DIR/}" != "$CBM_BIN" ]; then
        echo "wiki doctor: CBM binary ok (pinned local install v$WIKI_CBM_VERSION): $CBM_BIN"
    else
        echo "wiki doctor: CBM binary ok (env/config/PATH): $CBM_BIN"
    fi

    # coherence: one cache dir, seen identically by every consumer
    if [ -z "${CBM_CACHE_DIR:-}" ]; then
        echo "wiki doctor: BROKEN: CBM_CACHE_DIR unset (wiki_env_load did not run)" >&2
        broken=1
    elif [ ! -d "$CBM_CACHE_DIR" ]; then
        if mkdir -p "$CBM_CACHE_DIR" 2>/dev/null; then
            echo "wiki doctor: CBM_CACHE_DIR created + writable: $CBM_CACHE_DIR"
        else
            echo "wiki doctor: BROKEN: CBM_CACHE_DIR missing and not creatable: $CBM_CACHE_DIR" >&2
            broken=1
        fi
    elif [ ! -w "$CBM_CACHE_DIR" ]; then
        echo "wiki doctor: BROKEN: CBM_CACHE_DIR not writable: $CBM_CACHE_DIR" >&2
        broken=1
    else
        echo "wiki doctor: CBM_CACHE_DIR ok: $CBM_CACHE_DIR"
    fi
    echo "wiki doctor: WIKI_PORT=${WIKI_PORT:-unset}"

    local dep
    for dep in mmdc sqlite3; do
        if command -v "$dep" >/dev/null 2>&1; then
            echo "wiki doctor: portal dep ok: $dep"
        else
            echo "wiki doctor: DEGRADED: portal dep missing: $dep (non-fatal; mermaid falls back to tables)"
        fi
    done

    if [ "$broken" -eq 1 ]; then
        echo "wiki doctor: BROKEN" >&2
        return 1
    fi
    echo "wiki doctor: OK (DEGRADED notices above are non-fatal)"
    return 0
}
