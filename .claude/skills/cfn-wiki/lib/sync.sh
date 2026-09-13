#!/usr/bin/env bash
# cfn-wiki sync: the deterministic regen + drift gate.
#
# Contract: wiki_sync <repo> [--enrich] [--check] [--no-hooks]
#   repo defaults to $PWD; the dispatcher (`wiki sync ...`) forwards args.
#
#   default     extract -> gen_projections -> gen_pages -> lint; exit 0.
#               Deterministic only: no LLM call anywhere in this path.
#   --check     NO writes to tracked files. Re-run extract + fingerprint and
#               compare against the `wiki-fp:` marker in the current
#               readme/feature-status.md; a missing marker or a fingerprint
#               mismatch exits 1 with `WIKI STALE: <repo> (fp <a> != <b>)` on
#               stderr. On a fingerprint match, the projections are also
#               regenerated into a temp sandbox seeded with the committed
#               files and byte-compared: a hand edit to a generated section
#               drifts, while wiki:enrich block edits are absorbed by the
#               merge step and correctly do not. The `**Last Updated:**` date
#               line is clock output, not store content, and is excluded from
#               the comparison so midnight cannot manufacture drift.
#   --enrich    after the deterministic pass, print instructions for the
#               Claude enrichment pass (the skill runs it as a follow-up
#               conversation step) and an `ENRICH PENDING` line; still exit 0.
#   --no-hooks  skip the flock trigger guard: the post-commit hook already
#               holds .wiki/cache/sync.lock and passes this flag down.
#
# PERF (plan Phase 4 deviation): extract's git coupling walk is O(k^2) and
# this repo carries 1455 commits, so sync windows the walk. The constant
# WIKI_COUPLING_COMMITS (default 500, overridable via .wiki/config.json key
# `coupling_commits`) is passed to wiki_extract as its optional second arg;
# standalone extract without the arg stays uncapped and unchanged. Gen and
# check both go through this window so their fingerprints always agree.
#
# Only <repo>/.wiki/ (the untracked scratch) and the generated projections
# are ever written; --check writes nothing outside .wiki/ and /tmp.

WIKI_SYNC_LOADED=1

WIKI_SYNC_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck disable=SC1091
source "$WIKI_SYNC_LIB_DIR/extract-features.sh"   # brings fingerprint.sh
# shellcheck disable=SC1091
source "$WIKI_SYNC_LIB_DIR/gen-projections.sh"    # brings merge-enrichment.sh
# shellcheck disable=SC1091
source "$WIKI_SYNC_LIB_DIR/gen-pages.sh"
# shellcheck disable=SC1091
source "$WIKI_SYNC_LIB_DIR/lint-pages.sh"

WIKI_COUPLING_COMMITS="${WIKI_COUPLING_COMMITS:-500}"

wiki_config_coupling_commits() { # <repo> -> coupling window
    local cfg="$1/.wiki/config.json" configured=""
    if [ -f "$cfg" ]; then
        configured="$(sed -n 's/.*"coupling_commits"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$cfg" 2>/dev/null | head -1)"
    fi
    printf '%s' "${configured:-$WIKI_COUPLING_COMMITS}"
}

wiki_sync_enrich_instructions() { # <repo>
    cat <<EOF
ENRICH PENDING

Deterministic sync is complete; the Claude enrichment pass has not run for
$1. Run it as a conversation step (never inside this script):

  1. Read .wiki/store.json features and the default
     "_No curated description yet._" bodies under
     .wiki/enrich/resolved/<fid>.md.
  2. For each feature, write a 1-3 sentence curated description into the
     wiki:enrich block in readme/feature-status.md, readme/state-machines.md
     (entity-<fid>) and readme/wiki/<fid>/wiki.md.
  3. Re-run \`wiki sync\`: blocks whose feature fingerprint is unchanged are
     preserved; the resolved copies under .wiki/enrich/ refresh from your
     edited blocks.

One-time, on repos with hand-written docs: run \`wiki import-existing\`
BEFORE the first enrichment so existing rows are carried into blocks/.
EOF
}

wiki_sync_check() { # <repo> <store> <coupling-window> -> 0 in-sync, 1 stale
    local repo="$1" store="$2" cap="$3"
    local fs="$repo/readme/feature-status.md"

    # fresh store: rewrite of the untracked scratch only; tracked files and
    # everything outside .wiki/ stay untouched
    wiki_extract "$repo" "$cap" || return 1
    local fresh marker
    fresh="$(wiki_fingerprint "$store")" || return 1
    marker="$(sed -n 's/.*wiki-fp:[[:space:]]*\([0-9a-f]\{64\}\).*/\1/p' "$fs" 2>/dev/null | head -1)"
    if [ -z "$marker" ]; then
        echo "WIKI STALE: $repo (fp $fresh != none: no wiki-fp marker in readme/feature-status.md)" >&2
        return 1
    fi
    if [ "$marker" != "$fresh" ]; then
        echo "WIKI STALE: $repo (fp $marker != $fresh)" >&2
        return 1
    fi

    # fingerprint agrees; now prove the committed bytes are what a regen
    # would emit. The sandbox is seeded with the committed projections so
    # wiki_merge_enrich absorbs their enrich blocks: enrich edits never flag,
    # hand edits to generated sections do.
    local sandbox
    sandbox="$(mktemp -d "${TMPDIR:-/tmp}/wiki-check-XXXXXX")" || return 1
    mkdir -p "$sandbox/readme"
    cp "$fs" "$sandbox/readme/feature-status.md"
    if [ -f "$repo/readme/state-machines.md" ]; then
        cp "$repo/readme/state-machines.md" "$sandbox/readme/state-machines.md"
    fi
    if ! wiki_gen_projections "$store" "$sandbox" >/dev/null 2>&1; then
        rm -rf "$sandbox"
        echo "WIKI STALE: $repo (fp $marker != $fresh: sandbox regeneration failed)" >&2
        return 1
    fi

    # clock line is not content; drop it on both sides before comparing
    local bad=0 f
    for f in feature-status.md state-machines.md; do
        if ! diff -q \
            <(grep -v '^\*\*Last Updated:\*\*' "$repo/readme/$f") \
            <(grep -v '^\*\*Last Updated:\*\*' "$sandbox/readme/$f") >/dev/null 2>&1; then
            echo "WIKI STALE: $repo (fp $marker == $fresh but readme/$f differs from regeneration)" >&2
            bad=1
        fi
    done
    rm -rf "$sandbox"
    return "$bad"
}

wiki_sync() {
    local repo="" check=0 enrich=0 no_hooks=0 arg
    for arg in "$@"; do
        case "$arg" in
            --check)    check=1 ;;
            --enrich)   enrich=1 ;;
            --no-hooks) no_hooks=1 ;;
            -h|--help)  sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; return 0 ;;
            --*)        echo "wiki sync: unknown flag: $arg" >&2; return 64 ;;
            *)
                if [ -z "$repo" ]; then
                    repo="$arg"
                else
                    echo "wiki sync: unexpected second repo arg: $arg" >&2
                    return 64
                fi
                ;;
        esac
    done
    repo="${repo:-$PWD}"
    if [ ! -d "$repo" ]; then
        echo "wiki sync: no such repo: $repo" >&2
        return 1
    fi
    repo="$(cd "$repo" && pwd)"

    # trigger guard: serialize concurrent syncs. The post-commit hook holds
    # this lock (flock -n) and passes --no-hooks, so the nested invocation
    # skips the acquire instead of deadlocking on it.
    if [ "$no_hooks" -eq 0 ] && command -v flock >/dev/null 2>&1; then
        mkdir -p "$repo/.wiki/cache"
        exec 9>>"$repo/.wiki/cache/sync.lock"
        if ! flock -n 9; then
            echo "wiki: another sync holds $repo/.wiki/cache/sync.lock; skipping" >&2
            return 0
        fi
    fi

    local store="$repo/.wiki/store.json"
    local cap
    cap="$(wiki_config_coupling_commits "$repo")"

    if [ "$check" -eq 1 ]; then
        wiki_sync_check "$repo" "$store" "$cap"
        return $?
    fi

    wiki_extract "$repo" "$cap" || return 1
    wiki_gen_projections "$store" "$repo" || return 1
    wiki_gen_pages "$store" "$repo" || return 1
    wiki_lint "$repo" || return 1

    if [ "$enrich" -eq 1 ]; then
        wiki_sync_enrich_instructions "$repo"
    fi
    return 0
}
