#!/usr/bin/env bash
# Pre-Edit Backup Hook
# Automatically backs up files before Edit/Write operations

set -euo pipefail

FILE_PATH="$1"
AGENT_ID="${2:-unknown}"
TIMESTAMP=$(date +%s)

# Critical files requiring backup
CRITICAL_PATTERNS=(
  "orchestrate-cfn-loop.sh"
  "invoke-waiting-mode.sh"
  "execute-.*\\.sh"
  "agent\\.md"
  "SKILL\\.md"
)

# Check if file matches critical pattern
is_critical() {
  local file="$1"
  for pattern in "${CRITICAL_PATTERNS[@]}"; do
    if echo "$file" | grep -qE "$pattern"; then
      return 0
    fi
  done
  return 1
}

# Only backup if file exists and is critical
if [ ! -f "$FILE_PATH" ]; then
  echo "[Pre-Edit Backup] File doesn't exist yet: $FILE_PATH"
  exit 0
fi

if ! is_critical "$FILE_PATH"; then
  echo "[Pre-Edit Backup] Not a critical file: $FILE_PATH"
  exit 0
fi

# Create backup
BACKUP_PATH="${FILE_PATH}.backup-${TIMESTAMP}"
cp "$FILE_PATH" "$BACKUP_PATH"

# Verify backup
if [ -f "$BACKUP_PATH" ]; then
  ORIGINAL_SIZE=$(wc -l < "$FILE_PATH")
  BACKUP_SIZE=$(wc -l < "$BACKUP_PATH")

  if [ "$ORIGINAL_SIZE" -eq "$BACKUP_SIZE" ]; then
    echo "[Pre-Edit Backup] ✅ Backed up: $FILE_PATH ($ORIGINAL_SIZE lines)"
    echo "[Pre-Edit Backup]    Backup: $BACKUP_PATH"

    # Log to Redis
    redis-cli LPUSH "backup:log" "{\"timestamp\":$TIMESTAMP,\"file\":\"$FILE_PATH\",\"agent\":\"$AGENT_ID\",\"lines\":$ORIGINAL_SIZE}" >/dev/null 2>&1 || true
  else
    echo "[Pre-Edit Backup] ❌ Backup verification failed"
    exit 1
  fi
else
  echo "[Pre-Edit Backup] ❌ Backup creation failed"
  exit 1
fi

# Cleanup old backups (keep last 5)
BACKUP_DIR=$(dirname "$FILE_PATH")
BACKUP_PATTERN=$(basename "$FILE_PATH").backup-*
find "$BACKUP_DIR" -name "$BACKUP_PATTERN" -type f 2>/dev/null | sort -r | tail -n +6 | xargs rm -f 2>/dev/null || true

exit 0
