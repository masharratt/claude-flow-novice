#!/usr/bin/env bash
# cfn-wiki store fingerprint: sha256 over the canonical feature subset of a
# store.json.
#
# Contract: wiki_fingerprint <store.json> -> 64-hex sha256 on stdout, exit 0.
# Missing file or unparseable JSON -> message on stderr, exit 1.
#
# Inputs hashed (the canonical subset):
#   features[].fid, features[].files, features[].entrypoints
# Lists are order-normalized (features by fid, files/entrypoints sorted) so
# store ordering never leaks into the hash.
#
# Inputs excluded BY DESIGN:
#   coupling[] is a function of git log AT QUERY TIME (a sliding window over
#   recent commits), not of the tree: the window slides as commits land, so
#   any coupling-derived input would drift the marker on every commit
#   boundary crossing. CBM-derived data (module node counts, module-level
#   edges, meta.edge_type_counts, cbm_mode) is enrichment: CBM graph
#   resolution is toolchain-dependent, so it can never be cross-machine
#   stable. Volatile meta (generated_at, repo, meta.fingerprint itself) is
#   environment output. With this subset, the same tracked tree hashes
#   identically across machines, modes, and commits; a change to tracked
#   feature content or entrypoints flips the hash.
#
# Consumers: the sync drift gate hashes the whole store (drift = any
# regenerable byte changed); the per-feature enrich preservation in Phase 3
# keys off this same function.

WIKI_FINGERPRINT_LOADED=1

wiki_fingerprint() {
    local store="${1:?wiki_fingerprint: store.json path required}"
    if [ ! -f "$store" ]; then
        echo "wiki_fingerprint: no such file: $store" >&2
        return 1
    fi
    python3 - "$store" <<'PY'
import hashlib
import json
import sys

path = sys.argv[1]
try:
    with open(path, encoding="utf-8") as fh:
        store = json.load(fh)
except (OSError, ValueError) as exc:
    print(f"wiki_fingerprint: cannot parse {path}: {exc}", file=sys.stderr)
    sys.exit(1)
if not isinstance(store, dict):
    print(f"wiki_fingerprint: {path} is not a JSON object", file=sys.stderr)
    sys.exit(1)

features = sorted(
    ({"entrypoints": sorted(str(e) for e in f.get("entrypoints") or []),
      "fid": str(f.get("fid", "")),
      "files": sorted(str(p) for p in f.get("files") or [])}
     for f in store.get("features") or [] if isinstance(f, dict)),
    key=lambda f: f["fid"])

blob = json.dumps({"features": features}, sort_keys=True,
                  separators=(",", ":"), ensure_ascii=True)
print(hashlib.sha256(blob.encode("utf-8")).hexdigest())
PY
}
