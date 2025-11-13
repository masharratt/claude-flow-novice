#!/usr/bin/env bash
# Restore all archived historical tests to their original locations

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../" && pwd)"
ARCHIVE_DIR="${PROJECT_ROOT}/tests/archive/historical"

echo "Restoring archived historical tests..."

# Marketing tests
mkdir -p "${PROJECT_ROOT}/tests/integration"
for file in "${ARCHIVE_DIR}"/marketing-*.sh; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        cp "$file" "${PROJECT_ROOT}/tests/integration/$filename"
        chmod +x "${PROJECT_ROOT}/tests/integration/$filename"
        echo "Restored: tests/integration/$filename"
    fi
done

# Sprint 5 tests
mkdir -p "${PROJECT_ROOT}/tests/cfn-v3"
for file in "${ARCHIVE_DIR}"/test-sprint-5-*.sh; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        cp "$file" "${PROJECT_ROOT}/tests/cfn-v3/$filename"
        chmod +x "${PROJECT_ROOT}/tests/cfn-v3/$filename"
        echo "Restored: tests/cfn-v3/$filename"
    fi
done

echo ""
echo "Restoration complete!"
echo "Verify with: ls -l tests/integration/marketing-*.sh tests/cfn-v3/test-sprint-5-*.sh"
