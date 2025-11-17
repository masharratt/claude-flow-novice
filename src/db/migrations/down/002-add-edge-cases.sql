-- Rollback Migration 002: Remove Edge Cases Tables and Views
-- Drops all tables, indexes, and views created for edge case tracking
-- This rollback is idempotent - safe to run multiple times

-- Drop views first (depend on tables)
DROP VIEW IF EXISTS v_failure_trends;
DROP VIEW IF EXISTS v_high_severity_failures;
DROP VIEW IF EXISTS v_top_failures_by_skill;

-- Drop indexes
DROP INDEX IF EXISTS idx_failure_patterns_impact;
DROP INDEX IF EXISTS idx_failure_patterns_skill;
DROP INDEX IF EXISTS idx_edge_cases_occurrence;
DROP INDEX IF EXISTS idx_edge_cases_last_seen;
DROP INDEX IF EXISTS idx_edge_cases_severity;
DROP INDEX IF EXISTS idx_edge_cases_skill_error;

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS failure_patterns;
DROP TABLE IF EXISTS edge_cases;

-- Remove migration record (if exists)
DELETE FROM schema_migrations WHERE version = '002' AND description LIKE '%edge cases%';
