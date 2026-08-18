#!/usr/bin/env bash
set -euo pipefail

# Search for RuVector implementation files
echo "=== Searching for RuVector files ==="
find /mnt/c/Users/masha/Documents/claude-flow-novice -type f \( -name "*ruvector*" -o -name "*vector*" \) 2>/dev/null | head -20

echo ""
echo "=== Searching for RuVector references in code ==="
grep -r "RuVector\|ruvector" /mnt/c/Users/masha/Documents/claude-flow-novice --include="*.ts" --include="*.js" --include="*.md" 2>/dev/null | head -30

echo ""
echo "=== Searching for collection schemas ==="
grep -r "collections\|schema" /mnt/c/Users/masha/Documents/claude-flow-novice/docker/trigger-dev/src --include="*.ts" 2>/dev/null | head -20
