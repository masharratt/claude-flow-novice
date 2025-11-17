-- Workspace Tracking Schema
-- Part of Task P2-1.3: Supervised Workspace Cleanup (Phase 2)
-- Tracks workspace lifecycle, cleanup history, and orphan metadata

-- Workspaces table: Core workspace metadata
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  ttl_hours INTEGER NOT NULL,
  max_size_bytes INTEGER NOT NULL,
  current_size_bytes INTEGER DEFAULT 0,
  file_count INTEGER DEFAULT 0,
  last_accessed_at TEXT,
  metadata TEXT, -- JSON: processId, preservePatterns, etc.
  CONSTRAINT valid_ttl CHECK (ttl_hours > 0),
  CONSTRAINT valid_size CHECK (max_size_bytes > 0)
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_workspaces_agent
  ON workspaces(agent_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_task
  ON workspaces(task_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_created
  ON workspaces(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workspaces_last_accessed
  ON workspaces(last_accessed_at DESC);

-- Cleanup history table: Audit trail for all cleanup operations
CREATE TABLE IF NOT EXISTS cleanup_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  cleaned_at TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(
    reason IN ('agent_completed', 'agent_crashed', 'ttl_expired', 'manual', 'orphan_cleanup')
  ),
  size_freed INTEGER NOT NULL,
  files_removed INTEGER NOT NULL,
  duration_ms INTEGER, -- How long cleanup took
  metadata TEXT, -- JSON: exit_code, error_msg, preserved_artifacts, etc.
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
  CONSTRAINT valid_reason CHECK (reason IN (
    'agent_completed', 'agent_crashed', 'ttl_expired', 'manual', 'orphan_cleanup'
  ))
);

-- Indexes for cleanup history
CREATE INDEX IF NOT EXISTS idx_cleanup_workspace
  ON cleanup_history(workspace_id);

CREATE INDEX IF NOT EXISTS idx_cleanup_date
  ON cleanup_history(cleaned_at DESC);

CREATE INDEX IF NOT EXISTS idx_cleanup_reason
  ON cleanup_history(reason);

-- Workspace metrics table: Track disk usage and file statistics
CREATE TABLE IF NOT EXISTS workspace_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  exceeds_limit INTEGER, -- 0 or 1 (bool)
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
);

-- Index for metrics lookups
CREATE INDEX IF NOT EXISTS idx_metrics_workspace
  ON workspace_metrics(workspace_id, recorded_at DESC);

-- Orphan workspace tracking table: Track potentially orphaned workspaces
CREATE TABLE IF NOT EXISTS orphan_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  process_id INTEGER,
  last_accessed_at TEXT NOT NULL,
  grace_period_expires_at TEXT NOT NULL,
  cleaned_at TEXT, -- NULL if not yet cleaned
  clean_reason TEXT,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
  UNIQUE(workspace_id, detected_at)
);

-- Index for orphan tracking
CREATE INDEX IF NOT EXISTS idx_orphan_detected
  ON orphan_tracking(detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_orphan_expires
  ON orphan_tracking(grace_period_expires_at);

CREATE INDEX IF NOT EXISTS idx_orphan_workspace
  ON orphan_tracking(workspace_id);
