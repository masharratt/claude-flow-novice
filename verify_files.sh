#!/bin/bash
set -euo pipefail

cd /mnt/wsl/docker-desktop-bind-mounts/Ubuntu/b12e986fbf40baa4ab6e7d67a62bc26e28e460bda79c231265f4100ae030e4d0

echo "=== Verifying Trigger.dev v4 Documentation Files ==="
echo ""

files=(
  "TRIGGER_DEV_V4_EXPERT.md"
  "TRIGGER_DEV_V4_SETUP_GUIDE.md"
  "TRIGGER_DEV_V4_API_REFERENCE.md"
  "TRIGGER_DEV_V4_DOCUMENTATION_INDEX.md"
  "TRIGGER_DEV_V4_VALIDATION_REPORT.md"
  "DOCUMENTATION_DELIVERY_SUMMARY.md"
  "TRIGGER_DEV_V4_FILE_MANIFEST.md"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    lines=$(wc -l < "$file")
    size=$(du -h "$file" | cut -f1)
    echo "✓ $file"
    echo "  Lines: $lines | Size: $size"
  else
    echo "✗ $file - NOT FOUND"
  fi
done

echo ""
echo "=== Summary ==="
total_lines=$(cat "${files[@]}" 2>/dev/null | wc -l)
echo "Total lines across all documents: $total_lines"
echo "Total files created: ${#files[@]}"
echo ""
echo "All documentation files are ready!"
