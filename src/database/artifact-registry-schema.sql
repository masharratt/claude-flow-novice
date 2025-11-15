-- Artifact Registry Schema with TTL Support
-- Version: 1.0.0
-- Purpose: Centralized artifact management with automatic cleanup

-- Main artifacts table with TTL and retention policy support
CREATE TABLE IF NOT EXISTS artifacts (
    -- Identity
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('code', 'documentation', 'test', 'config', 'binary', 'data', 'model', 'report', 'other')),
    format TEXT, -- File format (json, yaml, js, sql, etc.)

    -- Content and Storage
    content TEXT, -- Encrypted content or reference to storage
    content_hash TEXT,
    size_bytes INTEGER,
    storage_location TEXT NOT NULL, -- Path in artifacts/registry/
    checksum TEXT,
    is_compressed BOOLEAN DEFAULT 0,
    compression_type TEXT,

    -- Relationships
    swarm_id TEXT,
    agent_id TEXT,
    task_id TEXT,

    -- Versioning and Lineage
    version INTEGER DEFAULT 1,
    parent_artifact_id TEXT,
    artifact_chain TEXT, -- JSON array of artifact lineage

    -- Metadata and Tags
    tags TEXT, -- JSON array of tags
    metadata TEXT, -- JSON metadata including build info, dependencies
    acl_level INTEGER NOT NULL DEFAULT 2 CHECK (acl_level BETWEEN 1 AND 5),

    -- TTL and Retention Policy
    retention_days INTEGER DEFAULT 30,
    retention_policy TEXT DEFAULT 'standard' CHECK (retention_policy IN ('ephemeral', 'standard', 'permanent', 'custom')),
    expires_at DATETIME, -- Auto-calculated: created_at + retention_days

    -- Status Tracking
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    cleanup_eligible BOOLEAN DEFAULT 0,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    archived_at DATETIME,
    deleted_at DATETIME,

    -- Foreign Keys (optional, depends on swarms/agents/tasks tables existence)
    FOREIGN KEY (parent_artifact_id) REFERENCES artifacts(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON artifacts(created_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_expires_at ON artifacts(expires_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_cleanup ON artifacts(cleanup_eligible, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_artifacts_swarm_id ON artifacts(swarm_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_agent_id ON artifacts(agent_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_task_id ON artifacts(task_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_storage_location ON artifacts(storage_location);

-- Trigger to auto-calculate expires_at on INSERT
CREATE TRIGGER IF NOT EXISTS trg_artifacts_calculate_expires_at_insert
AFTER INSERT ON artifacts
WHEN NEW.retention_policy != 'permanent' AND NEW.expires_at IS NULL
BEGIN
    UPDATE artifacts
    SET expires_at = datetime(NEW.created_at, '+' || NEW.retention_days || ' days')
    WHERE id = NEW.id;
END;

-- Trigger to auto-calculate expires_at on UPDATE
CREATE TRIGGER IF NOT EXISTS trg_artifacts_calculate_expires_at_update
AFTER UPDATE OF retention_days, retention_policy ON artifacts
WHEN NEW.retention_policy != 'permanent'
BEGIN
    UPDATE artifacts
    SET expires_at = datetime(NEW.created_at, '+' || NEW.retention_days || ' days')
    WHERE id = NEW.id;
END;

-- Trigger to mark cleanup_eligible flag
CREATE TRIGGER IF NOT EXISTS trg_artifacts_mark_cleanup_eligible
AFTER UPDATE OF expires_at ON artifacts
WHEN NEW.expires_at IS NOT NULL AND NEW.status = 'active'
BEGIN
    UPDATE artifacts
    SET cleanup_eligible = CASE
        WHEN datetime('now') >= NEW.expires_at THEN 1
        ELSE 0
    END
    WHERE id = NEW.id;
END;

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trg_artifacts_update_timestamp
AFTER UPDATE ON artifacts
BEGIN
    UPDATE artifacts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Retention policy defaults
-- ephemeral: 7 days
-- standard: 30 days
-- permanent: never expires
-- custom: user-defined retention_days

-- Sample queries for TTL cleanup
/*
-- Find expired artifacts eligible for archival
SELECT id, name, type, storage_location, created_at, expires_at
FROM artifacts
WHERE status = 'active'
  AND expires_at IS NOT NULL
  AND datetime('now') >= expires_at
ORDER BY created_at ASC;

-- Find archived artifacts eligible for deletion (archived > 90 days ago)
SELECT id, name, type, storage_location, archived_at
FROM artifacts
WHERE status = 'archived'
  AND archived_at IS NOT NULL
  AND datetime('now') >= datetime(archived_at, '+90 days')
ORDER BY archived_at ASC;

-- Archive an artifact
UPDATE artifacts
SET status = 'archived',
    archived_at = CURRENT_TIMESTAMP
WHERE id = ?;

-- Soft delete an artifact
UPDATE artifacts
SET status = 'deleted',
    deleted_at = CURRENT_TIMESTAMP
WHERE id = ?;

-- Get artifact statistics by retention policy
SELECT
    retention_policy,
    COUNT(*) as total,
    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
    SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived,
    SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) as deleted,
    SUM(CASE WHEN cleanup_eligible = 1 THEN 1 ELSE 0 END) as cleanup_eligible,
    SUM(size_bytes) as total_size_bytes
FROM artifacts
GROUP BY retention_policy;
*/
