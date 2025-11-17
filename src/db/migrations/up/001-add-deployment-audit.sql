-- Deployment Audit Trail Migration
-- Part of Task 1.1: Automated Skill Deployment Pipeline
-- Tracks all skill deployment operations for audit and rollback capability

CREATE TABLE IF NOT EXISTS deployment_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deployed_by TEXT DEFAULT 'system',
  version TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT 1,
  error_message TEXT,
  metadata TEXT,  -- JSON string for additional context
  rollback_path TEXT,  -- Path to backup for rollback

  -- Constraints
  CHECK (to_status IN ('APPROVED', 'DEPLOYING', 'DEPLOYED', 'FAILED', 'ROLLED_BACK')),
  CHECK (success IN (0, 1))
);

-- Index for fast lookups by skill_id
CREATE INDEX IF NOT EXISTS idx_deployment_audit_skill_id
  ON deployment_audit(skill_id);

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_deployment_audit_status
  ON deployment_audit(to_status);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_deployment_audit_time
  ON deployment_audit(deployed_at DESC);

-- Skills table (if not exists)
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  content_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,  -- JSON string

  CHECK (status IN ('DRAFT', 'APPROVED', 'DEPLOYING', 'DEPLOYED', 'FAILED', 'ARCHIVED'))
);

-- Index for status queries on skills
CREATE INDEX IF NOT EXISTS idx_skills_status
  ON skills(status);

-- Index for name lookups
CREATE INDEX IF NOT EXISTS idx_skills_name
  ON skills(name);
