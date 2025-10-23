#!/bin/bash
set -eu

# Initialize Playbook Database

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="$SCRIPT_DIR/playbook.db"

# Create database if not exists
sqlite3 "$DB_PATH" <<'EOF'
CREATE TABLE IF NOT EXISTS playbook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_pattern TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_keywords TEXT,
  loop3_agents TEXT NOT NULL,
  loop2_agents TEXT NOT NULL,
  loop4_agent TEXT DEFAULT 'product-owner',
  iterations_required INTEGER,
  final_confidence REAL,
  final_consensus REAL,
  gate_threshold REAL DEFAULT 0.75,
  consensus_threshold REAL DEFAULT 0.90,
  complexity TEXT,
  estimated_iterations INTEGER,
  actual_iterations INTEGER,
  common_feedback TEXT,
  success_strategy TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  use_count INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_task_type ON playbook_entries(task_type);
CREATE INDEX IF NOT EXISTS idx_task_pattern ON playbook_entries(task_pattern);
CREATE INDEX IF NOT EXISTS idx_final_confidence ON playbook_entries(final_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_use_count ON playbook_entries(use_count DESC);

CREATE TABLE IF NOT EXISTS agent_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_type TEXT NOT NULL,
  task_type TEXT NOT NULL,
  avg_confidence REAL,
  execution_count INTEGER DEFAULT 1,
  success_rate REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_type, task_type)
);

CREATE INDEX IF NOT EXISTS idx_agent_performance ON agent_performance(agent_type, task_type);
EOF

echo "✅ Playbook database initialized at $DB_PATH"