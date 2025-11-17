-- Rollback Migration 005: Remove ACE Reflection Persistence Schema
-- Drops all tables, indexes, views, triggers, and functions created for reflection tracking
-- This rollback is idempotent - safe to run multiple times
-- NOTE: This is PostgreSQL-specific SQL

-- Drop views
DROP VIEW IF EXISTS recent_low_confidence_reflections;
DROP VIEW IF EXISTS reflection_stats_by_task;
DROP VIEW IF EXISTS reflection_stats_by_agent;

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_reflections_updated_at ON reflections;

-- Drop functions
DROP FUNCTION IF EXISTS cleanup_old_reflections(INTEGER);
DROP FUNCTION IF EXISTS update_reflections_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_reflections_archived_at;
DROP INDEX IF EXISTS idx_reflections_payload;
DROP INDEX IF EXISTS idx_reflections_confidence;
DROP INDEX IF EXISTS idx_reflections_type;
DROP INDEX IF EXISTS idx_reflections_agent_task;
DROP INDEX IF EXISTS idx_reflections_timestamp;
DROP INDEX IF EXISTS idx_reflections_task_id;
DROP INDEX IF EXISTS idx_reflections_agent_id;

-- Drop table
DROP TABLE IF EXISTS reflections;
