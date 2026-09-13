#!/usr/bin/env bash
# wiki dispatcher glue: `wiki serve [repo] [flags]` -> portal/serve.sh.
# Sourcing portal/serve.sh defines wiki_serve (repo optional, default $PWD),
# wiki_serve_is_serving, and wiki_serve_open_browser; nothing to wrap.

SERVE_GLUE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../portal/serve.sh
source "$SERVE_GLUE_DIR/../portal/serve.sh"
