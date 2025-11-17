-- Rollback Migration 001: Remove Deployment Audit Tables
-- Drops all tables, indexes, and views created in the forward migration
-- This rollback is idempotent - safe to run multiple times

-- Drop indexes first (must drop before dropping tables)
DROP INDEX IF EXISTS idx_deployment_audit_skill_id;
DROP INDEX IF EXISTS idx_deployment_audit_status;
DROP INDEX IF EXISTS idx_deployment_audit_time;
DROP INDEX IF EXISTS idx_skills_status;
DROP INDEX IF EXISTS idx_skills_name;

-- Drop tables (will cascade and remove all data)
DROP TABLE IF EXISTS deployment_audit;
DROP TABLE IF EXISTS skills;

-- Note: This rollback assumes these tables were created by this migration only.
-- If other migrations depend on these tables, this rollback will break them.
-- Always ensure migrations are rolled back in reverse order of application.
