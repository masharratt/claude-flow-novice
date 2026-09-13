#!/usr/bin/env bash
# cfn-wiki store fingerprint: stable sha256 over a store.json's logical content.
#
# Contract: wiki_fingerprint <store.json> -> 64-hex sha256 on stdout, exit 0.
# Missing file or unparseable JSON -> message on stderr, exit 1.
#
# Stability property (the staleness gate and Phase 3 enrich preservation both
# key off this): the hash covers logical content only. Before hashing, the
# store is parsed and re-emitted with sorted keys and compact separators, so
# key order and whitespace never matter, and the volatile meta fields
# (generated_at, repo: environment output, not content) plus meta.fingerprint
# itself are stripped, so a re-extract in a different checkout or a different
# minute hashes identically. Any change to features/modules/edges/coupling or
# to non-volatile meta (e.g. cbm_mode) changes the hash.

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
        obj = json.load(fh)
except (OSError, ValueError) as exc:
    print(f"wiki_fingerprint: cannot parse {path}: {exc}", file=sys.stderr)
    sys.exit(1)

meta = obj.get("meta")
if isinstance(meta, dict):
    for key in ("generated_at", "repo", "fingerprint"):
        meta.pop(key, None)

blob = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
print(hashlib.sha256(blob.encode("utf-8")).hexdigest())
PY
}
