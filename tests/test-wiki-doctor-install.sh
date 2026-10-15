#!/usr/bin/env bash
# tests/test-wiki-doctor-install.sh: cfn-wiki doctor --install platform choice.
# Regression (2026-10-14): on an Apple Silicon Mac, `wiki doctor --install`
# fetched the linux-amd64 tarball, installed an ELF binary that cannot run
# there (exec format error), and still reported "CBM binary ok". Every wiki
# sync on that machine then ran git-only and wiki-check drifted.
# Covers: release asset chosen per OS/arch, unsupported platform refused,
# a present-but-unrunnable binary reported BROKEN and replaced on --install.
# Isolation: temp HOME; the download is a file:// tarball, no network.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$ROOT/.claude/skills/cfn-wiki/lib"

T="$(mktemp -d "${TMPDIR:-/tmp}/wiki-doctor-test-XXXXXX")"
cleanup() { rm -rf "$T"; }
trap cleanup EXIT

PASS=0; FAIL=0
ok() { echo "PASS: $1"; PASS=$((PASS+1)); }
no() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

# asset_for OS ARCH -> asset name (or empty + rc on refusal)
asset_for() {
    WIKI_UNAME_S="$1" WIKI_UNAME_M="$2" bash -c '
        source "$1/doctor.sh"; wiki_cbm_asset' _ "$LIB" 2>/dev/null
}

case_asset_mapping() {
    [ "$(asset_for Linux x86_64)" = "codebase-memory-mcp-linux-amd64.tar.gz" ] \
        && ok "Linux x86_64 -> linux-amd64" || no "Linux x86_64: '$(asset_for Linux x86_64)'"
    [ "$(asset_for Linux aarch64)" = "codebase-memory-mcp-linux-arm64.tar.gz" ] \
        && ok "Linux aarch64 -> linux-arm64" || no "Linux aarch64: '$(asset_for Linux aarch64)'"
    [ "$(asset_for Darwin arm64)" = "codebase-memory-mcp-darwin-arm64.tar.gz" ] \
        && ok "Darwin arm64 -> darwin-arm64" || no "Darwin arm64: '$(asset_for Darwin arm64)'"
    [ "$(asset_for Darwin x86_64)" = "codebase-memory-mcp-darwin-amd64.tar.gz" ] \
        && ok "Darwin x86_64 -> darwin-amd64" || no "Darwin x86_64: '$(asset_for Darwin x86_64)'"
    if asset_for SunOS sparc >/dev/null; then
        no "unsupported platform should be refused"
    else
        ok "unsupported platform refused"
    fi
}

# A fake release: a tarball whose binary prints a version, served via file://.
make_release() {
    mkdir -p "$T/rel/stage"
    printf '#!/bin/sh\necho "codebase-memory-mcp 0.10.8"\n' > "$T/rel/stage/codebase-memory-mcp"
    chmod +x "$T/rel/stage/codebase-memory-mcp"
    local a
    for a in linux-amd64 linux-arm64 darwin-arm64 darwin-amd64; do
        tar czf "$T/rel/codebase-memory-mcp-$a.tar.gz" -C "$T/rel/stage" codebase-memory-mcp
    done
}

run_doctor() { # HOME as $1, rest = doctor args
    local home="$1"; shift
    HOME="$home" WIKI_CBM_RELEASE_BASE="file://$T/rel" WIKI_DOCTOR_REPO="$T/repo" \
        bash "$LIB/wiki.sh" doctor "$@" 2>&1
}

case_unrunnable_binary_broken_and_replaced() {
    make_release
    mkdir -p "$T/repo" "$T/home/.local/share/cfn-wiki"
    local bin="$T/home/.local/share/cfn-wiki/codebase-memory-mcp"
    # Executable bit set, but the interpreter does not exist: the same
    # "cannot execute" outcome as a wrong-architecture binary.
    printf '#!/nonexistent/interp\n' > "$bin"; chmod +x "$bin"

    local out rc=0
    out=$(run_doctor "$T/home") || rc=$?
    printf '%s' "$out" | grep -q "BROKEN.*cannot run" \
        && ok "unrunnable binary reported BROKEN" || no "doctor output: $out"
    [ "$rc" -ne 0 ] && ok "doctor exits non-zero on unrunnable binary" || no "doctor rc=$rc"
    printf '%s' "$out" | grep -q "binary ok" \
        && no "unrunnable binary must not read as ok" || ok "no false 'binary ok'"

    rc=0
    out=$(run_doctor "$T/home" --install) || rc=$?
    "$bin" --version 2>/dev/null | grep -q "0.10.8" \
        && ok "--install replaced the unrunnable binary" || no "--install output: $out"
    [ "$rc" -eq 0 ] && ok "doctor --install exits 0 after repair" || no "install rc=$rc out=$out"
}

case_asset_mapping
case_unrunnable_binary_broken_and_replaced

echo
echo "wiki-doctor-install: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
