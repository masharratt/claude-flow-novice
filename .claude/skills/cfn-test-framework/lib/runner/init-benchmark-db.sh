#!/usr/bin/env bash
# Initialize benchmark database
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DB_FILE="$PROJECT_ROOT/.artifacts/test-benchmarks.db"

mkdir -p "$PROJECT_ROOT/.artifacts"

sqlite3 "$DB_FILE" << 'EOFSQL'
CREATE TABLE IF NOT EXISTS test_suites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suite_id INTEGER NOT NULL,
  run_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  git_commit TEXT,
  git_branch TEXT,
  total_tests INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  skipped INTEGER NOT NULL,
  duration_seconds REAL NOT NULL,
  success_rate REAL,
  FOREIGN KEY (suite_id) REFERENCES test_suites(id)
);

CREATE TABLE IF NOT EXISTS regression_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  acknowledged INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES test_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON test_runs(run_timestamp DESC);
EOFSQL

echo "✅ Benchmark database initialized: $DB_FILE"
