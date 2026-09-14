#!/usr/bin/env bash
# Resolve tracked wiki:enrich blocks into a rebuildable working cache.
# Text and its original reviewed fingerprint survive source changes. The
# shared model reports mismatches as review-needed; it never erases prose.
# Import sources are fallback only. Orphans remain in the Markdown appendix.
# Public functions: wiki_feature_fp, wiki_enrich_extract, wiki_enrich_body,
# wiki_enrich_resolve and wiki_merge_enrich.
WIKI_MERGE_ENRICH_LOADED=1

wiki_enrich_dir() { # <store> -> absolute .wiki/enrich dir
    printf '%s/enrich' "$(cd "$(dirname "$1")" && pwd)"
}

wiki_store_fids() { # <store> -> newline-separated fids
    python3 - "$1" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as fh:
    store = json.load(fh)
for f in store.get("features", []):
    print(f.get("fid", ""))
PY
}

wiki_feature_fp() { # <store> <fid>
    python3 - "$1" "$2" <<'PY'
import hashlib
import json
import sys

store_path, fid = sys.argv[1], sys.argv[2]
with open(store_path, encoding="utf-8") as fh:
    store = json.load(fh)
feature = next((f for f in store.get("features", []) if f.get("fid") == fid), None)
if feature is None:
    sys.exit(1)
# keep in sync with lib/fingerprint.sh: same canonical subset per feature
# (entrypoints/fid/files, order-normalized), same serialization
slice_ = {
    "entrypoints": sorted(str(e) for e in feature.get("entrypoints") or []),
    "fid": str(feature.get("fid", "")),
    "files": sorted(str(p) for p in feature.get("files") or []),
}
if "content_hashes" in feature:
    slice_["content_hashes"] = feature["content_hashes"]
blob = json.dumps(slice_, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
print(hashlib.sha256(blob.encode("utf-8")).hexdigest())
PY
}

wiki_enrich_extract() { # <md> <outdir> -> count on stdout, exit 0
    local md="$1" out="$2"
    if [ ! -f "$md" ]; then
        echo 0
        return 0
    fi
    mkdir -p "$out"
    python3 - "$md" "$out" <<'PY'
import os
import re
import sys

md, out = sys.argv[1], sys.argv[2]
with open(md, encoding="utf-8") as fh:
    text = fh.read()
pattern = re.compile(
    r"<!--\s*wiki:enrich\s+id=(\S+)\s+fp=(\S+)\s*-->\n(.*?)<!--\s*/wiki:enrich\s*-->",
    re.S)
count = 0
for m in pattern.finditer(text):
    block_id, fp, body = m.group(1), m.group(2), m.group(3).strip("\n")
    with open(os.path.join(out, block_id + ".md"), "w", encoding="utf-8") as fh:
        fh.write(body + "\n")
    with open(os.path.join(out, block_id + ".fp"), "w", encoding="utf-8") as fh:
        fh.write(fp + "\n")
    count += 1
print(count)
PY
}

# Resolution inputs for one id, shared by wiki_enrich_body and wiki_enrich_resolve.
# Sets ENRICH_SRC (file to copy) and ENRICH_STATE (preserved|reattached|default).
wiki_enrich_pick() { # <store> <id>
    local store="$1" id="$2"
    local base extract blocks fid fp
    base="$(wiki_enrich_dir "$store")"
    extract="$base/extract"
    blocks="$base/blocks"
    ENRICH_SRC=""
    ENRICH_STATE="default"
    case "$id" in
        orphan-*)
            # zero-content-loss carry-over: static hand-written content has no
            # fingerprint that can go stale, so the extracted block always
            # wins and blocks/orphan-*.md is the re-attach fallback
            if [ -s "$extract/$id.md" ]; then
                ENRICH_SRC="$extract/$id.md"
                ENRICH_STATE="preserved"
            elif [ -f "$blocks/$id.md" ]; then
                ENRICH_SRC="$blocks/$id.md"
                ENRICH_STATE="reattached"
            fi
            return 0
            ;;
    esac
    fid="$id"
    case "$id" in
        entity-*) fid="${id#entity-}" ;;
    esac
    fp="$(wiki_feature_fp "$store" "$fid" 2>/dev/null || true)"
    if [ -n "$fp" ] && [ -s "$extract/$id.md" ] && [ -f "$extract/$id.fp" ]; then
        ENRICH_SRC="$extract/$id.md"
        ENRICH_STATE="preserved"
    elif [ -z "$fp" ] && [ -s "$extract/$id.md" ]; then
        # unclaimable id (feature can never exist, e.g. entity-archive for
        # a hidden dir): the in-md extracted content is static hand-written
        # prose; preserve it verbatim rather than dropping to a placeholder
        ENRICH_SRC="$extract/$id.md"
        ENRICH_STATE="preserved"
    elif [ -f "$blocks/$id.md" ]; then
        ENRICH_SRC="$blocks/$id.md"
        ENRICH_STATE="reattached"
    fi
}

wiki_enrich_body() { # <store> <id> -> body on stdout
    local store="$1" id="$2"
    wiki_enrich_pick "$store" "$id"
    if [ -n "$ENRICH_SRC" ]; then
        cat "$ENRICH_SRC"
    else
        printf '_No curated description yet. Edit this wiki:enrich block to describe %s._\n' "$id"
    fi
}

wiki_enrich_resolve() { # <store> -> writes resolved/<id>.md and .fp
    local store="${1:?wiki_enrich_resolve: store path required}"
    local base resolved fid id fp src state
    base="$(wiki_enrich_dir "$store")"
    resolved="$base/resolved"
    mkdir -p "$resolved"
    while IFS= read -r fid; do
        [ -n "$fid" ] || continue
        fp="$(wiki_feature_fp "$store" "$fid" 2>/dev/null || true)"
        for id in "$fid" "entity-$fid"; do
            wiki_enrich_pick "$store" "$id"
            src="$ENRICH_SRC"
            if [ -n "$src" ]; then
                cat "$src" >"$resolved/$id.md"
            else
                wiki_enrich_body "$store" "$id" >"$resolved/$id.md"
            fi
            if [ "$ENRICH_STATE" = "preserved" ] && [ -f "$base/extract/$id.fp" ]; then
                cat "$base/extract/$id.fp" >"$resolved/$id.fp"
            else
                printf '%s\n' "${fp:-none}" >"$resolved/$id.fp"
            fi
        done
    done <<EOF
$(wiki_store_fids "$store")
EOF

    # orphan blocks: union of what this import wrote and what an older
    # generated md still carries, so appendix content never drops
    local oid
    while IFS= read -r oid; do
        [ -n "$oid" ] || continue
        wiki_enrich_pick "$store" "$oid"
        if [ -n "$ENRICH_SRC" ]; then
            cat "$ENRICH_SRC" >"$resolved/$oid.md"
        else
            wiki_enrich_body "$store" "$oid" >"$resolved/$oid.md"
        fi
        printf 'orphan\n' >"$resolved/$oid.fp"
    done <<EOF
$({ ls "$base/blocks"/orphan-*.md 2>/dev/null;
    ls "$base/extract"/orphan-*.md 2>/dev/null; } \
        | sed 's#.*/##; s#\.md$##' | LC_ALL=C sort -u)
EOF

    # unclaimed ids: blocks the in-md extraction found whose id names no
    # store feature (fid or entity-<fid>) and no orphan already handled.
    # On a fresh clone these carry the only surviving copy; re-home them
    # under orphan-<kind> names so the appendix renders them instead of
    # silently dropping machine-local hand-written prose.
    local claimed id rehomed
    claimed="$(wiki_store_fids "$store" | sed -e 's/.*/& entity-&/' || true)"
    while IFS= read -r id; do
        [ -n "$id" ] || continue
        case " $claimed " in
            *" $id "*) continue ;;
        esac
        case "$id" in
            orphan-*) continue ;;
        esac
        wiki_enrich_pick "$store" "$id"
        [ -n "$ENRICH_SRC" ] || continue
        case "$id" in
            entity-*) rehomed="orphan-$id" ;;
            *)        rehomed="orphan-feature-$id" ;;
        esac
        cat "$ENRICH_SRC" >"$resolved/$rehomed.md"
        printf 'orphan\n' >"$resolved/$rehomed.fp"
    done <<EOF
$(ls "$base/extract"/*.md 2>/dev/null | sed 's#.*/##; s#\.md$##' | LC_ALL=C sort -u)
EOF
}

wiki_merge_enrich() { # <store> <out_md_dir> [extra.md...]
    local store="${1:?wiki_merge_enrich: store path required}"
    local outdir="${2:?wiki_merge_enrich: out markdown dir required}"
    shift 2
    local base extract blocks resolved
    base="$(wiki_enrich_dir "$store")"
    extract="$base/extract"
    blocks="$base/blocks"
    resolved="$base/resolved"
    mkdir -p "$extract" "$blocks" "$resolved"

    local n=0 md c
    for md in "$outdir/feature-status.md" "$outdir/state-machines.md" "$@"; do
        if [ -f "$md" ]; then
            c="$(wiki_enrich_extract "$md" "$extract")"
            n=$((n + c))
        fi
    done

    local fid preserved=0 reattached=0 fresh=0
    while IFS= read -r fid; do
        [ -n "$fid" ] || continue
        for id in "$fid" "entity-$fid"; do
            wiki_enrich_pick "$store" "$id"
            case "$ENRICH_STATE" in
                preserved)  preserved=$((preserved + 1)) ;;
                reattached) reattached=$((reattached + 1)) ;;
                *)          fresh=$((fresh + 1)) ;;
            esac
        done
    done <<EOF
$(wiki_store_fids "$store")
EOF

    wiki_enrich_resolve "$store"
    echo "wiki: enrich extracted=$n preserved=$preserved reattached=$reattached fresh=$fresh"
}
