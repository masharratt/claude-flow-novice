#!/usr/bin/env bash
# wiki_fingerprint <store> hashes sorted feature identity, source-content
# hashes and authored knowledge inputs. CBM graph weights, git coupling and
# timestamps stay outside the canonical hash. Missing/unreadable stores fail.
# Per-feature fingerprints use the same fields in knowledge.py and
# merge-enrichment.sh; old prose retains its reviewed fingerprint.
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
      "files": sorted(str(p) for p in f.get("files") or []),
      **({"content_hashes": f["content_hashes"]} if "content_hashes" in f else {})}
     for f in store.get("features") or [] if isinstance(f, dict)),
    key=lambda f: f["fid"])

blob = json.dumps({"features": features, "knowledge_inputs": store.get("knowledge_inputs", {})}, sort_keys=True,
                  separators=(",", ":"), ensure_ascii=True)
print(hashlib.sha256(blob.encode("utf-8")).hexdigest())
PY
}
