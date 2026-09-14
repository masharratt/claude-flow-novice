#!/usr/bin/env bash
# Catalog and authored capabilities share one resolved model with Markdown.
wiki_view_catalog() {
    local lib
    lib="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    python3 - "$1" "$lib" <<'PYMODEL'
import json, sys
sys.path.insert(0, sys.argv[2])
from knowledge import model
print(json.dumps(model(sys.argv[1]), ensure_ascii=False))
PYMODEL
}
