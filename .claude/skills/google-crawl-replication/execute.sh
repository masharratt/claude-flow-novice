#!/usr/bin/env bash
# google-crawl-replication: thin wrapper around crawl.mjs
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SKILL_DIR/crawl.mjs" "$@"
