-- Rollback Migration 006: Remove Skill Patches Schema
-- Drops all tables, indexes, and views created for skill patch tracking
-- This rollback is idempotent - safe to run multiple times
-- NOTE: This is PostgreSQL-specific SQL

-- Drop views
DROP VIEW IF EXISTS pending_patches;

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_skill_patches_updated_at ON skill_patches;

-- Drop functions
DROP FUNCTION IF EXISTS update_skill_patches_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_skill_patches_created_at;
DROP INDEX IF EXISTS idx_skill_patches_status;
DROP INDEX IF EXISTS idx_skill_patches_skill_id;

-- Drop table
DROP TABLE IF EXISTS skill_patches;
