#!/bin/bash
# Webapp Testing Skill - Set Baseline
# Purpose: Set a captured screenshot as the baseline reference for future comparisons

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$PROJECT_ROOT"

REASON=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --screenshot-key) SCREENSHOT_KEY="$2"; shift 2 ;;
    --reason) REASON="$2"; shift 2 ;;
    --current-file) CURRENT_FILE="$2"; shift 2 ;;  # Optional: explicit file path
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

# Validate required parameters
if [ -z "$SCREENSHOT_KEY" ]; then
  echo "Error: Missing required parameter --screenshot-key" >&2
  echo "Usage: $0 --screenshot-key <key> [--reason <reason>] [--current-file <path>]" >&2
  echo "" >&2
  echo "Required:" >&2
  echo "  --screenshot-key   Screenshot identifier (e.g., 'auth-system/login-form/1920x1080/default/light-mode')" >&2
  echo "" >&2
  echo "Optional:" >&2
  echo "  --reason           Reason for setting baseline (for audit trail)" >&2
  echo "  --current-file     Explicit path to screenshot file (default: auto-detect latest)" >&2
  exit 1
fi

DB_PATH="${HOME}/.claude/memory/adaptive-context.db"

# Parse screenshot key components
IFS='/' read -r PROJECT COMPONENT VIEWPORT STATE VARIANT <<< "$SCREENSHOT_KEY"

if [ -z "$PROJECT" ] || [ -z "$COMPONENT" ] || [ -z "$VIEWPORT" ] || [ -z "$STATE" ] || [ -z "$VARIANT" ]; then
  echo "Error: Invalid screenshot key format. Expected: project/component/viewport/state/variant" >&2
  exit 1
fi

# Get current screenshot from SQLite (if not explicitly provided)
if [ -z "$CURRENT_FILE" ]; then
  CURRENT_PATH=$(sqlite3 "$DB_PATH" \
    "SELECT file_path FROM webapp_screenshots WHERE screenshot_key = '${SCREENSHOT_KEY}' AND baseline = 0 ORDER BY captured_at DESC LIMIT 1" 2>/dev/null)

  if [ -z "$CURRENT_PATH" ]; then
    echo "Error: No current screenshot found for key: $SCREENSHOT_KEY" >&2
    echo "Hint: Run capture-screenshot.sh first to create a capture" >&2
    exit 1
  fi
else
  CURRENT_PATH="$CURRENT_FILE"
fi

# Verify current screenshot exists
if [ ! -f "$CURRENT_PATH" ]; then
  echo "Error: Current screenshot file not found: $CURRENT_PATH" >&2
  exit 1
fi

# Create baseline directory structure
BASELINE_DIR=".screenshots/baselines/${PROJECT}/${COMPONENT}/${VIEWPORT}/${STATE}"
mkdir -p "$BASELINE_DIR"
BASELINE_PATH="${BASELINE_DIR}/${VARIANT}.png"

echo "Setting baseline:" >&2
echo "  Source:   $CURRENT_PATH" >&2
echo "  Baseline: $BASELINE_PATH" >&2

# Check if baseline already exists
if [ -f "$BASELINE_PATH" ]; then
  echo "Warning: Baseline already exists at $BASELINE_PATH" >&2
  echo "This will overwrite the existing baseline. Continue? (y/n)" >&2
  read -r CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Aborted" >&2
    exit 1
  fi

  # Archive old baseline
  ARCHIVE_DIR=".screenshots/archive/$(date +%Y-%m)"
  ARCHIVE_PATH="${ARCHIVE_DIR}/${PROJECT}/${COMPONENT}/${VIEWPORT}/${STATE}/${VARIANT}_$(date +%Y%m%d%H%M%S).png"
  mkdir -p "$(dirname "$ARCHIVE_PATH")"
  cp "$BASELINE_PATH" "$ARCHIVE_PATH"
  echo "  Archived: $ARCHIVE_PATH" >&2

  # Get old hash for audit log
  OLD_FILE_HASH=$(sha256sum "$BASELINE_PATH" | awk '{print $1}')
else
  OLD_FILE_HASH=""
fi

# Copy to baselines directory (remove timestamp from filename)
cp "$CURRENT_PATH" "$BASELINE_PATH"

# Calculate file hash
FILE_HASH=$(sha256sum "$BASELINE_PATH" | awk '{print $1}')

# Get metadata from current screenshot
METADATA=$(sqlite3 "$DB_PATH" \
  "SELECT metadata FROM webapp_screenshots WHERE file_path = '${CURRENT_PATH}' LIMIT 1" 2>/dev/null || echo '{}')

TASK_ID=$(sqlite3 "$DB_PATH" \
  "SELECT task_id FROM webapp_screenshots WHERE file_path = '${CURRENT_PATH}' LIMIT 1" 2>/dev/null || echo '')

AGENT_ID=$(sqlite3 "$DB_PATH" \
  "SELECT agent_id FROM webapp_screenshots WHERE file_path = '${CURRENT_PATH}' LIMIT 1" 2>/dev/null || echo '')

# Update SQLite (set as baseline)
# First check if baseline entry already exists
BASELINE_EXISTS=$(sqlite3 "$DB_PATH" \
  "SELECT COUNT(*) FROM webapp_screenshots WHERE screenshot_key = '${SCREENSHOT_KEY}' AND baseline = 1" 2>/dev/null || echo "0")

if [ "$BASELINE_EXISTS" -gt 0 ]; then
  # Update existing baseline
  sqlite3 "$DB_PATH" <<EOF
UPDATE webapp_screenshots
SET file_path = '${BASELINE_PATH}',
    file_hash = 'sha256:${FILE_HASH}',
    captured_at = $(date +%s),
    task_id = '${TASK_ID}',
    agent_id = '${AGENT_ID}',
    metadata = '${METADATA}'
WHERE screenshot_key = '${SCREENSHOT_KEY}' AND baseline = 1;
EOF
  ACTION="updated"
else
  # Insert new baseline entry
  sqlite3 "$DB_PATH" <<EOF
INSERT INTO webapp_screenshots (
  screenshot_key, project, component, viewport, state, variant,
  file_path, file_hash, baseline, captured_at, task_id, agent_id, metadata
) VALUES (
  '${SCREENSHOT_KEY}',
  '${PROJECT}',
  '${COMPONENT}',
  '${VIEWPORT}',
  '${STATE}',
  '${VARIANT}',
  '${BASELINE_PATH}',
  'sha256:${FILE_HASH}',
  1,
  $(date +%s),
  '${TASK_ID}',
  '${AGENT_ID}',
  '${METADATA}'
);
EOF
  ACTION="created"
fi

# Insert audit log entry
REASON_ESCAPED=$(echo "$REASON" | sed "s/'/''/g")  # Escape single quotes for SQL
sqlite3 "$DB_PATH" <<EOF
INSERT INTO screenshot_audit_log (
  screenshot_key, action, reason, old_file_hash, new_file_hash, approved_by, created_at, task_id
) VALUES (
  '${SCREENSHOT_KEY}',
  '${ACTION}',
  '${REASON_ESCAPED}',
  ${OLD_FILE_HASH:+'sha256:$OLD_FILE_HASH'}${OLD_FILE_HASH:-NULL},
  'sha256:${FILE_HASH}',
  '${AGENT_ID:-system}',
  $(date +%s),
  '${TASK_ID}'
);
EOF

# Clear Redis baseline cache
redis-cli del "screenshot:baseline:${SCREENSHOT_KEY}" > /dev/null 2>&1 || \
  echo "Warning: Failed to clear Redis cache" >&2

# Cache new baseline hash (TTL: 24 hours)
redis-cli setex "screenshot:baseline:${SCREENSHOT_KEY}" 86400 "sha256:${FILE_HASH}" > /dev/null 2>&1

# Output result
cat <<EOF | jq '.'
{
  "status": "baseline-set",
  "action": "${ACTION}",
  "screenshot_key": "${SCREENSHOT_KEY}",
  "baseline_path": "${BASELINE_PATH}",
  "file_hash": "sha256:${FILE_HASH}",
  "reason": "${REASON}",
  "archived_previous": ${OLD_FILE_HASH:+true}${OLD_FILE_HASH:-false},
  "created_at": $(date +%s)
}
EOF

echo "✅ Baseline ${ACTION}: $SCREENSHOT_KEY" >&2
