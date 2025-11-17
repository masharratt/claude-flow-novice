-- Rollback Migration 003: Remove Unified Metrics Schema
-- Drops all tables, indexes, and triggers created for unified metrics
-- This rollback is idempotent - safe to run multiple times

-- Drop triggers first
DROP TRIGGER IF EXISTS update_execution_metrics_timestamp;

-- Drop indexes
DROP INDEX IF EXISTS idx_idempotency_keys_expires_at;
DROP INDEX IF EXISTS idx_execution_metrics_status_timestamp;
DROP INDEX IF EXISTS idx_execution_metrics_agent_timestamp;
DROP INDEX IF EXISTS idx_execution_metrics_timestamp;
DROP INDEX IF EXISTS idx_execution_metrics_status;
DROP INDEX IF EXISTS idx_execution_metrics_task_id;
DROP INDEX IF EXISTS idx_execution_metrics_skill_id;
DROP INDEX IF EXISTS idx_execution_metrics_agent_id;

-- Drop tables (foreign key constraint requires specific order)
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS execution_metrics;
