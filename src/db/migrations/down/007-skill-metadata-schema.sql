-- Rollback Migration 007: Remove Skill Metadata Schema
-- Drops all tables and indexes created for skill metadata tracking
-- This rollback is idempotent - safe to run multiple times
-- NOTE: This is SQLite-specific SQL

-- Drop indexes
DROP INDEX IF EXISTS idx_skill_metadata_updated_at;
DROP INDEX IF EXISTS idx_skill_metadata_skill_id;

-- Drop table
DROP TABLE IF EXISTS skill_metadata;
