-- Rollback Migration 009: Remove Edge Case Feedback Loop Views
-- Drops all views created for edge case feedback loop
-- This rollback is idempotent - safe to run multiple times

-- Drop views (if they exist)
DROP VIEW IF EXISTS v_edge_case_trends;
DROP VIEW IF EXISTS v_edge_case_patterns;
DROP VIEW IF EXISTS v_critical_edge_cases;

-- Note: This migration only creates views, so there are no tables or indexes to drop.
-- The underlying tables (edge_cases, failure_patterns) are managed by migration 002.
