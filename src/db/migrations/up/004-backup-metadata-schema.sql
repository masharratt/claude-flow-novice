-- Migration 004: Unified Backup & Restore System Metadata Schema
-- Part of Task 4.3: Unified Backup & Restore System
-- Version: 2.0.0 (Enhanced with encryption support)
-- Created: 2025-11-16
-- Updated: 2025-11-17 (Added encryption support for CVSS 7.2 vulnerability fix)

-- ============================================================================
-- Backup Metadata Table
-- ============================================================================
-- Stores metadata for all backups created by the backup manager
-- Supports querying by agent, file path, backup type, and expiration
-- Enhanced: Supports encrypted backups with encryption metadata tracking

CREATE TABLE IF NOT EXISTS backups (
  -- Primary identification
  id TEXT PRIMARY KEY NOT NULL,

  -- Owner and context
  agent_id TEXT NOT NULL,

  -- File information
  file_path TEXT NOT NULL,
  backup_path TEXT NOT NULL,

  -- Integrity verification
  original_hash TEXT NOT NULL,
  backup_hash TEXT NOT NULL,

  -- Size tracking (bytes)
  file_size INTEGER NOT NULL,
  backup_size INTEGER,

  -- Backup classification
  backup_type TEXT NOT NULL CHECK(backup_type IN ('pre-edit', 'checkpoint', 'manual')),

  -- Temporal tracking
  created_at DATETIME NOT NULL DEFAULT (datetime('now')),
  expires_at DATETIME NOT NULL,

  -- Compression status
  is_compressed BOOLEAN DEFAULT 0,
  compressed_at DATETIME,
  compression_ratio REAL,

  -- ENCRYPTION SUPPORT (CVSS 7.2 mitigation)
  is_encrypted BOOLEAN DEFAULT 0,
  encrypted_at DATETIME,
  encryption_algorithm TEXT,
  encryption_iv TEXT,
  encryption_auth_tag TEXT,
  encryption_hmac TEXT,
  encryption_key_version TEXT,

  -- Additional context (JSON)
  metadata TEXT,

  -- Soft delete support
  deleted_at DATETIME,

  CONSTRAINT valid_expiration CHECK(expires_at > created_at),
  CONSTRAINT valid_compression_ratio CHECK(compression_ratio IS NULL OR (compression_ratio >= 0 AND compression_ratio <= 1))
);

-- ============================================================================
-- Backup Audit Trail Table
-- ============================================================================
-- Logs all backup and restore operations for compliance and debugging

CREATE TABLE IF NOT EXISTS backup_audit_log (
  -- Primary identification
  id TEXT PRIMARY KEY NOT NULL,

  -- Backup reference (nullable for failed operations)
  backup_id TEXT,

  -- Operation details
  operation TEXT NOT NULL CHECK(operation IN ('create', 'restore', 'delete', 'compress', 'cleanup')),
  agent_id TEXT NOT NULL,

  -- Operation result
  status TEXT NOT NULL CHECK(status IN ('success', 'failure', 'partial')),

  -- Target file information
  file_path TEXT NOT NULL,
  backup_path TEXT,

  -- Operation metadata
  timestamp DATETIME NOT NULL DEFAULT (datetime('now')),
  duration_ms INTEGER,

  -- Error tracking
  error_message TEXT,
  error_code TEXT,

  -- Additional context (JSON)
  metadata TEXT,

  -- Foreign key to backups table (soft reference)
  FOREIGN KEY (backup_id) REFERENCES backups(id) ON DELETE SET NULL
);

-- ============================================================================
-- Restore Rate Limiting Table
-- ============================================================================
-- Tracks restore operations for rate limiting enforcement

CREATE TABLE IF NOT EXISTS restore_rate_limits (
  -- Primary identification
  id TEXT PRIMARY KEY NOT NULL,

  -- Rate limit scope
  agent_id TEXT NOT NULL,

  -- Restore details
  backup_id TEXT NOT NULL,
  file_path TEXT NOT NULL,

  -- Timing
  restored_at DATETIME NOT NULL DEFAULT (datetime('now')),

  -- Foreign key to backups table
  FOREIGN KEY (backup_id) REFERENCES backups(id) ON DELETE CASCADE
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_backups_agent_id ON backups(agent_id);
CREATE INDEX IF NOT EXISTS idx_backups_file_path ON backups(file_path);
CREATE INDEX IF NOT EXISTS idx_backups_backup_type ON backups(backup_type);
CREATE INDEX IF NOT EXISTS idx_backups_expires_at ON backups(expires_at);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);

-- Soft delete queries
CREATE INDEX IF NOT EXISTS idx_backups_deleted_at ON backups(deleted_at) WHERE deleted_at IS NOT NULL;

-- Compression queries
CREATE INDEX IF NOT EXISTS idx_backups_compression ON backups(is_compressed, created_at);

-- Encryption queries (CVSS 7.2 mitigation)
CREATE INDEX IF NOT EXISTS idx_backups_encrypted ON backups(is_encrypted);
CREATE INDEX IF NOT EXISTS idx_backups_encryption_status ON backups(is_encrypted, created_at);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_backups_agent_file ON backups(agent_id, file_path);
CREATE INDEX IF NOT EXISTS idx_backups_type_expires ON backups(backup_type, expires_at);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_backup_id ON backup_audit_log(backup_id);
CREATE INDEX IF NOT EXISTS idx_audit_agent_id ON backup_audit_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_operation ON backup_audit_log(operation);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON backup_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_status ON backup_audit_log(status);

-- Rate limit indexes
CREATE INDEX IF NOT EXISTS idx_rate_limit_agent ON restore_rate_limits(agent_id, restored_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_backup ON restore_rate_limits(backup_id);

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Active backups (not expired, not deleted)
CREATE VIEW IF NOT EXISTS active_backups AS
SELECT *
FROM backups
WHERE deleted_at IS NULL
  AND expires_at > datetime('now');

-- Expired backups ready for cleanup
CREATE VIEW IF NOT EXISTS expired_backups AS
SELECT *
FROM backups
WHERE deleted_at IS NULL
  AND expires_at <= datetime('now');

-- Backups eligible for compression (older than 7 days, not compressed)
CREATE VIEW IF NOT EXISTS compressible_backups AS
SELECT *
FROM backups
WHERE deleted_at IS NULL
  AND is_compressed = 0
  AND created_at < datetime('now', '-7 days');

-- Recent restore operations (last 24 hours)
CREATE VIEW IF NOT EXISTS recent_restores AS
SELECT
  rl.*,
  b.file_path,
  b.backup_type
FROM restore_rate_limits rl
JOIN backups b ON rl.backup_id = b.id
WHERE rl.restored_at > datetime('now', '-1 day');

-- Backup statistics by agent
CREATE VIEW IF NOT EXISTS backup_stats_by_agent AS
SELECT
  agent_id,
  COUNT(*) as total_backups,
  SUM(CASE WHEN deleted_at IS NULL AND expires_at > datetime('now') THEN 1 ELSE 0 END) as active_backups,
  SUM(file_size) as total_size_bytes,
  SUM(CASE WHEN is_compressed = 1 THEN file_size ELSE 0 END) as compressed_size_bytes,
  AVG(CASE WHEN is_compressed = 1 THEN compression_ratio ELSE NULL END) as avg_compression_ratio,
  MIN(created_at) as oldest_backup,
  MAX(created_at) as newest_backup
FROM backups
GROUP BY agent_id;

-- Backup statistics by type
CREATE VIEW IF NOT EXISTS backup_stats_by_type AS
SELECT
  backup_type,
  COUNT(*) as total_backups,
  SUM(CASE WHEN deleted_at IS NULL AND expires_at > datetime('now') THEN 1 ELSE 0 END) as active_backups,
  SUM(file_size) as total_size_bytes,
  AVG(file_size) as avg_size_bytes,
  MIN(created_at) as oldest_backup,
  MAX(created_at) as newest_backup
FROM backups
GROUP BY backup_type;

-- Audit log summary
CREATE VIEW IF NOT EXISTS audit_summary AS
SELECT
  operation,
  status,
  COUNT(*) as count,
  AVG(duration_ms) as avg_duration_ms,
  MIN(timestamp) as first_occurrence,
  MAX(timestamp) as last_occurrence
FROM backup_audit_log
GROUP BY operation, status;

-- ============================================================================
-- Triggers for Data Integrity
-- ============================================================================

-- Prevent modification of audit log
CREATE TRIGGER IF NOT EXISTS prevent_audit_update
BEFORE UPDATE ON backup_audit_log
BEGIN
  SELECT RAISE(ABORT, 'Audit log records are immutable');
END;

-- Prevent deletion of audit log
CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
BEFORE DELETE ON backup_audit_log
BEGIN
  SELECT RAISE(ABORT, 'Audit log records cannot be deleted');
END;

-- Auto-create audit entry on backup creation
CREATE TRIGGER IF NOT EXISTS audit_backup_create
AFTER INSERT ON backups
BEGIN
  INSERT INTO backup_audit_log (
    id, backup_id, operation, agent_id, status, file_path, backup_path, timestamp, metadata
  ) VALUES (
    lower(hex(randomblob(16))),
    NEW.id,
    'create',
    NEW.agent_id,
    'success',
    NEW.file_path,
    NEW.backup_path,
    datetime('now'),
    json_object('backup_type', NEW.backup_type, 'file_size', NEW.file_size)
  );
END;

-- Auto-create audit entry on backup deletion
CREATE TRIGGER IF NOT EXISTS audit_backup_delete
AFTER UPDATE OF deleted_at ON backups
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  INSERT INTO backup_audit_log (
    id, backup_id, operation, agent_id, status, file_path, backup_path, timestamp
  ) VALUES (
    lower(hex(randomblob(16))),
    NEW.id,
    'delete',
    NEW.agent_id,
    'success',
    NEW.file_path,
    NEW.backup_path,
    datetime('now')
  );
END;

-- ============================================================================
-- Migration Verification Query
-- ============================================================================
-- Run this query to verify migration success:
-- SELECT name, type FROM sqlite_master WHERE name LIKE '%backup%' ORDER BY type, name;
