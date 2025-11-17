-- Rollback Migration 004: Remove Unified Backup & Restore System
-- Drops all tables, indexes, views, and triggers created for backup system
-- This rollback is idempotent - safe to run multiple times

-- Drop triggers first
DROP TRIGGER IF EXISTS audit_backup_delete;
DROP TRIGGER IF EXISTS audit_backup_create;
DROP TRIGGER IF EXISTS prevent_audit_delete;
DROP TRIGGER IF EXISTS prevent_audit_update;

-- Drop views
DROP VIEW IF EXISTS audit_summary;
DROP VIEW IF EXISTS backup_stats_by_type;
DROP VIEW IF EXISTS backup_stats_by_agent;
DROP VIEW IF EXISTS recent_restores;
DROP VIEW IF EXISTS compressible_backups;
DROP VIEW IF EXISTS expired_backups;
DROP VIEW IF EXISTS active_backups;

-- Drop indexes
DROP INDEX IF EXISTS idx_rate_limit_backup;
DROP INDEX IF EXISTS idx_rate_limit_agent;
DROP INDEX IF EXISTS idx_audit_status;
DROP INDEX IF EXISTS idx_audit_timestamp;
DROP INDEX IF EXISTS idx_audit_operation;
DROP INDEX IF EXISTS idx_audit_agent_id;
DROP INDEX IF EXISTS idx_audit_backup_id;
DROP INDEX IF EXISTS idx_backups_type_expires;
DROP INDEX IF EXISTS idx_backups_agent_file;
DROP INDEX IF EXISTS idx_backups_encryption_status;
DROP INDEX IF EXISTS idx_backups_encrypted;
DROP INDEX IF EXISTS idx_backups_compression;
DROP INDEX IF EXISTS idx_backups_deleted_at;
DROP INDEX IF EXISTS idx_backups_created_at;
DROP INDEX IF EXISTS idx_backups_expires_at;
DROP INDEX IF EXISTS idx_backups_backup_type;
DROP INDEX IF EXISTS idx_backups_file_path;
DROP INDEX IF EXISTS idx_backups_agent_id;

-- Drop tables (in reverse dependency order due to foreign keys)
DROP TABLE IF EXISTS restore_rate_limits;
DROP TABLE IF EXISTS backup_audit_log;
DROP TABLE IF EXISTS backups;
