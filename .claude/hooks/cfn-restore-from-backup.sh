#!/bin/bash
# cfn-selftest: not-a-hook manually-invoked CLI, never fires on an event
# Restore File from Backup
# Restores a file from its most recent backup

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 FILE_PATH"
  echo "Restores FILE_PATH from most recent backup"
  exit 1
fi

FILE_PATH="$1"
BACKUP_PATTERN="${FILE_PATH}.backup-*"

# Find most recent backup
LATEST_BACKUP=$(ls -t $BACKUP_PATTERN 2>/dev/null | head -1)

if [ -n "$LATEST_BACKUP" ]; then
  echo "Restoring $FILE_PATH from $LATEST_BACKUP"

  # Create pre-restore backup of current state
  TIMESTAMP=$(date +%s)
  cp "$FILE_PATH" "${FILE_PATH}.pre-restore-${TIMESTAMP}" 2>/dev/null || true

  # Restore from backup
  cp "$LATEST_BACKUP" "$FILE_PATH"

  RESTORED_LINES=$(wc -l < "$FILE_PATH")
  echo "✅ Restored $RESTORED_LINES lines"

  # Log restoration
  redis-cli LPUSH "restore:log" "{\"timestamp\":$TIMESTAMP,\"file\":\"$FILE_PATH\",\"backup\":\"$LATEST_BACKUP\",\"lines\":$RESTORED_LINES}" >/dev/null 2>&1 || true
else
  echo "❌ No backup found for $FILE_PATH"
  exit 1
fi
