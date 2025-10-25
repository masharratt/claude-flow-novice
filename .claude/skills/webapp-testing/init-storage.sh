#!/bin/bash
# Webapp Testing Skill - Initialize Storage
# Purpose: Create SQLite schema and directory structure for screenshot management

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$PROJECT_ROOT"

FORCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --force) FORCE=true; shift ;;
    *) echo "Unknown parameter: $1"; exit 1 ;;
  esac
done

DB_PATH="${HOME}/.claude/memory/adaptive-context.db"

echo "Initializing webapp-testing storage..." >&2

# Create directory structure
echo "Creating directory structure..." >&2
mkdir -p .screenshots/baselines
mkdir -p .screenshots/current
mkdir -p .screenshots/diffs
mkdir -p .screenshots/archive
echo "✅ Directories created" >&2

# Check if tables already exist
TABLES_EXIST=$(sqlite3 "$DB_PATH" \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('webapp_screenshots', 'screenshot_audit_log');" 2>/dev/null || echo "0")

if [ "$TABLES_EXIST" -eq 2 ] && [ "$FORCE" = false ]; then
  echo "⚠️  SQLite tables already exist. Use --force to recreate (will drop existing data)" >&2
  exit 0
fi

if [ "$FORCE" = true ] && [ "$TABLES_EXIST" -gt 0 ]; then
  echo "⚠️  --force flag set. Dropping existing tables..." >&2
  sqlite3 "$DB_PATH" <<EOF
DROP TABLE IF EXISTS webapp_screenshots;
DROP TABLE IF EXISTS screenshot_audit_log;
EOF
fi

# Create SQLite schema
echo "Creating SQLite schema..." >&2
sqlite3 "$DB_PATH" <<'EOF'
-- Main screenshots table
CREATE TABLE IF NOT EXISTS webapp_screenshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screenshot_key TEXT UNIQUE NOT NULL,
  project TEXT NOT NULL,
  component TEXT NOT NULL,
  viewport TEXT NOT NULL,
  state TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'default',
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  baseline BOOLEAN DEFAULT 0,
  captured_at INTEGER NOT NULL,
  task_id TEXT,
  agent_id TEXT,
  metadata TEXT,
  UNIQUE(project, component, viewport, state, variant, baseline)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_baseline ON webapp_screenshots(project, component, viewport, state, variant, baseline);
CREATE INDEX IF NOT EXISTS idx_task ON webapp_screenshots(task_id);
CREATE INDEX IF NOT EXISTS idx_component ON webapp_screenshots(project, component);
CREATE INDEX IF NOT EXISTS idx_captured ON webapp_screenshots(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshot_key ON webapp_screenshots(screenshot_key);

-- Audit log table
CREATE TABLE IF NOT EXISTS screenshot_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screenshot_key TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  old_file_hash TEXT,
  new_file_hash TEXT,
  approved_by TEXT,
  created_at INTEGER NOT NULL,
  task_id TEXT,
  metadata TEXT
);

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_audit_screenshot ON screenshot_audit_log(screenshot_key);
CREATE INDEX IF NOT EXISTS idx_audit_created ON screenshot_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_task ON screenshot_audit_log(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON screenshot_audit_log(action);
EOF

echo "✅ SQLite schema created" >&2

# Verify tables created
VERIFY=$(sqlite3 "$DB_PATH" \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('webapp_screenshots', 'screenshot_audit_log');" 2>/dev/null)

if [ "$VERIFY" -eq 2 ]; then
  echo "✅ Verification passed: 2 tables created" >&2
else
  echo "❌ Verification failed: Expected 2 tables, found $VERIFY" >&2
  exit 1
fi

# Create .gitignore for ephemeral directories
cat > .screenshots/.gitignore <<'EOF'
# Ephemeral screenshot directories (not version controlled)
current/
diffs/
archive/

# Version control baselines only
!baselines/
EOF

echo "✅ .gitignore created for .screenshots/" >&2

# Output summary
cat <<EOF

✅ Webapp-testing storage initialized successfully

Directory Structure:
  .screenshots/
  ├── baselines/    (version controlled - reference images)
  ├── current/      (ephemeral - test captures)
  ├── diffs/        (ephemeral - comparison outputs)
  └── archive/      (ephemeral - historical captures)

SQLite Tables:
  - webapp_screenshots      (screenshot metadata and file references)
  - screenshot_audit_log    (baseline change audit trail)

Database Location:
  ${DB_PATH}

Next Steps:
  1. Capture screenshot:  ./.claude/skills/webapp-testing/capture-screenshot.sh --help
  2. Set baseline:        ./.claude/skills/webapp-testing/set-baseline.sh --help
  3. Compare screenshots: ./.claude/skills/webapp-testing/compare-screenshots.sh --help

EOF
