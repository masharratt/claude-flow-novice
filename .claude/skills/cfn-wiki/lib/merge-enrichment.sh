#!/usr/bin/env bash
# cfn-wiki enrichment merge: resolve wiki:enrich block bodies for generation.
#
# A wiki:enrich block in generated markdown looks like:
#   <!-- wiki:enrich id=<fid> fp=<feature-fp> -->
#   ...curated text...
#   <!-- /wiki:enrich -->
#
# Preservation rule (plan: fuzzy-whistling-eich): a block is preserved across
# a regeneration iff its stored fp equals the CURRENT feature fingerprint, a
# sha256 over the feature's own slice {fid, name, files, edges} canonicalized
# exactly like lib/fingerprint.sh (sorted keys, compact separators). A stale
# block (feature content changed) is dropped; the regenerated block re-attaches
# the enrichment text from .wiki/enrich/blocks/<id>.md, the import source.
#
# Public functions:
#   wiki_feature_fp <store> <fid>        print the feature slice fp (exit 1 if
#                                        the fid is not in the store)
#   wiki_enrich_extract <md> <outdir>    pull blocks out of generated md into
#                                        <outdir>/<id>.md + <id>.fp; prints count
#   wiki_enrich_body <store> <id>        print the resolved body for id
#                                        (id may be "<fid>" or "entity-<fid>")
#   wiki_enrich_resolve <store>          resolve every store fid into
#                                        .wiki/enrich/resolved/<id>.md (+ .fp)
#   wiki_merge_enrich <store> <out_md_dir> [extra.md...]
#                                        extract from the two projections (plus
#                                        any extra generated md) then resolve;
#                                        prints a preserved/stale/default tally

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
# keep the canonicalization in sync with lib/fingerprint.sh
slice_ = {k: feature.get(k) for k in ("fid", "name", "files", "edges")}
blob = json.dumps(slice_, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
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
    fid="$id"
    case "$id" in
        entity-*) fid="${id#entity-}" ;;
    esac
    fp="$(wiki_feature_fp "$store" "$fid" 2>/dev/null || true)"
    ENRICH_SRC=""
    ENRICH_STATE="default"
    if [ -n "$fp" ] && [ -s "$extract/$id.md" ] && [ -f "$extract/$id.fp" ] \
        && [ "$(cat "$extract/$id.fp" 2>/dev/null)" = "$fp" ]; then
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
            printf '%s\n' "${fp:-none}" >"$resolved/$id.fp"
        done
    done <<EOF
$(wiki_store_fids "$store")
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
