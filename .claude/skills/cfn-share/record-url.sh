#!/usr/bin/env bash
# record-url.sh - pin the artifact URL a doc was published to, so the next
# /cfn-share updates that artifact instead of creating a second one.
#
# Inputs:
#   $1  path to the published .md file
#   $2  artifact URL returned by the Artifact tool
# Outputs:
#   stdout: sidecar path written
#   exit 0 = written, 2 = usage error
set -euo pipefail

die() { echo "cfn-share: $*" >&2; exit 2; }

FILE="${1:-}"; URL="${2:-}"
[[ -n "$FILE" && -n "$URL" ]] || die "usage: record-url.sh <file.md> <artifact-url>"
[[ -f "$FILE" ]] || die "not a file: $FILE"
[[ "$URL" == https://* ]] || die "not a URL: $URL"

ABS=$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")
DIR=$(dirname "$ABS")
BASE=$(basename "$ABS" .md)
SIDECAR="$DIR/.share-$BASE.url"

cat > "$SIDECAR" <<EOF
url=$URL
sha256=$(sha256sum "$ABS" | cut -d' ' -f1)
published=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

echo "$SIDECAR"
