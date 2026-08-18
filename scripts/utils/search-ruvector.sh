#!/usr/bin/env bash
set -euo pipefail

# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"

# Search for RuVector implementation files
echo "=== Searching for RuVector files ==="
find $PROJECT_ROOT -type f \( -name "*ruvector*" -o -name "*vector*" \) 2>/dev/null | head -20

echo ""
echo "=== Searching for RuVector references in code ==="
grep -r "RuVector\|ruvector" $PROJECT_ROOT --include="*.ts" --include="*.js" --include="*.md" 2>/dev/null | head -30

echo ""
echo "=== Searching for collection schemas ==="
grep -r "collections\|schema" $PROJECT_ROOT/docker/trigger-dev/src --include="*.ts" 2>/dev/null | head -20
