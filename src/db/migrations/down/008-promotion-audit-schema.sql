-- Rollback Migration 008: Remove Promotion Audit Schema
-- Drops all tables, indexes, triggers, and views created for promotion audit tracking
-- This rollback is idempotent - safe to run multiple times
-- NOTE: This is PostgreSQL-specific SQL

-- Drop views
DROP VIEW IF EXISTS v_promotion_pipeline_stats;
DROP VIEW IF EXISTS v_pending_promotions;

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_promotion_audit_updated_at ON promotion_audit;

-- Drop functions
DROP FUNCTION IF EXISTS update_promotion_audit_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_promotion_audit_completed_at;
DROP INDEX IF EXISTS idx_promotion_audit_status;
DROP INDEX IF EXISTS idx_promotion_audit_environment;
DROP INDEX IF EXISTS idx_promotion_audit_skill_id;

-- Drop table
DROP TABLE IF EXISTS promotion_audit;
