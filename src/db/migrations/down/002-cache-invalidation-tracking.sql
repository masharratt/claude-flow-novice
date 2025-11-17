-- Rollback Migration 002: Remove Cache Invalidation Tracking
-- Drops all tables and indexes created for cache invalidation tracking
-- This rollback is idempotent - safe to run multiple times

-- Drop indexes
DROP INDEX IF EXISTS idx_skills_content_hash;
DROP INDEX IF EXISTS idx_slm_timestamp;
DROP INDEX IF EXISTS idx_slm_agent_type;
DROP INDEX IF EXISTS idx_ci_timestamp;
DROP INDEX IF EXISTS idx_ci_skill_id;

-- Drop tables
DROP TABLE IF EXISTS skill_loader_metrics;
DROP TABLE IF EXISTS cache_invalidations;
