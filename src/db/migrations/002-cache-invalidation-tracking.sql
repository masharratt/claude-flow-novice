-- Migration 002: Cache Invalidation Tracking
-- Adds tables for tracking cache invalidation events and skill loader metrics

-- Cache invalidations table
-- Tracks when skills are invalidated from cache due to content changes
CREATE TABLE IF NOT EXISTS cache_invalidations (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  invalidated_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT NOT NULL,
  old_hash TEXT,
  new_hash TEXT,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ci_skill_id ON cache_invalidations(skill_id);
CREATE INDEX IF NOT EXISTS idx_ci_timestamp ON cache_invalidations(invalidated_at);

-- Skill loader metrics table
-- Tracks performance metrics for skill loading operations
CREATE TABLE IF NOT EXISTS skill_loader_metrics (
  id TEXT PRIMARY KEY,
  agent_type TEXT NOT NULL,
  load_time_ms INTEGER NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  cache_miss INTEGER NOT NULL DEFAULT 0,
  cache_invalidation INTEGER NOT NULL DEFAULT 0,
  skills_loaded INTEGER NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_slm_agent_type ON skill_loader_metrics(agent_type);
CREATE INDEX IF NOT EXISTS idx_slm_timestamp ON skill_loader_metrics(timestamp);

-- Verify content_hash index exists (should be added in future if missing)
CREATE INDEX IF NOT EXISTS idx_skills_content_hash ON skills(content_hash);
