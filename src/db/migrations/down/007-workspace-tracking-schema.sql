-- Rollback Migration 007: Remove Workspace Tracking Schema
-- Drops all tables, indexes, and triggers created for workspace state tracking
-- This rollback is idempotent - safe to run multiple times
-- NOTE: This is PostgreSQL-specific SQL

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_workspace_state_updated_at ON workspace_state;

-- Drop functions
DROP FUNCTION IF EXISTS update_workspace_state_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_workspace_state_updated_at;
DROP INDEX IF EXISTS idx_workspace_state_agent_id;

-- Drop table
DROP TABLE IF EXISTS workspace_state;
