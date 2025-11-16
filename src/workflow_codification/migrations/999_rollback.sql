-- ============================================================
-- ROLLBACK SCRIPT FOR ALL MIGRATIONS
-- Migration: 999_rollback.sql
-- Purpose: Clean teardown of all workflow codification schema extensions
-- ============================================================

-- IMPORTANT: Execute in REVERSE order of creation to respect dependencies

-- ============================================================
-- DROP INDEXES (Feature 6 → Feature 1)
-- ============================================================

-- Feature 6: Execution Traces indexes
DROP INDEX IF EXISTS idx_execution_traces_steps_gin;
DROP INDEX IF EXISTS idx_execution_traces_status;
DROP INDEX IF EXISTS idx_execution_traces_skill;

-- Feature 5: Composite Skills indexes
DROP INDEX IF EXISTS idx_composite_skills_name;
DROP INDEX IF EXISTS idx_composite_skills_mode;

-- Feature 4: Pattern Recommendations indexes
DROP INDEX IF EXISTS idx_pattern_recommendations_strength;
DROP INDEX IF EXISTS idx_pattern_recommendations_user;

-- Feature 3: Regression Test Suites indexes
DROP INDEX IF EXISTS idx_regression_suites_priority;
DROP INDEX IF EXISTS idx_regression_suites_skill;

-- Feature 2: Circuit Breaker indexes
DROP INDEX IF EXISTS idx_circuit_breaker_status;

-- Feature 1: Skill Health History indexes
DROP INDEX IF EXISTS idx_skill_health_level;
DROP INDEX IF EXISTS idx_skill_health_name_time;

-- ============================================================
-- DROP TABLES (Feature 6 → Feature 1)
-- ============================================================

-- Feature 6: Execution Traces (drop partitions first, then parent)
DROP TABLE IF EXISTS execution_traces_2026_01 CASCADE;
DROP TABLE IF EXISTS execution_traces_2025_12 CASCADE;
DROP TABLE IF EXISTS execution_traces_2025_11 CASCADE;
DROP TABLE IF EXISTS execution_traces CASCADE;

-- Feature 5: Composite Skills
DROP TABLE IF EXISTS composite_skills CASCADE;

-- Feature 4: Pattern Recommendations
DROP TABLE IF EXISTS pattern_recommendations CASCADE;

-- Feature 3: Regression Test Suites
DROP TABLE IF EXISTS regression_test_suites CASCADE;

-- Feature 2: Circuit Breaker State
DROP TABLE IF EXISTS circuit_breaker_state CASCADE;

-- Feature 1: Skill Health History
DROP TABLE IF EXISTS skill_health_history CASCADE;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Verify all tables are dropped
DO $$
DECLARE
    remaining_tables TEXT;
BEGIN
    SELECT string_agg(table_name, ', ')
    INTO remaining_tables
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
          'skill_health_history',
          'circuit_breaker_state',
          'regression_test_suites',
          'pattern_recommendations',
          'composite_skills',
          'execution_traces',
          'execution_traces_2025_11',
          'execution_traces_2025_12',
          'execution_traces_2026_01'
      );

    IF remaining_tables IS NOT NULL THEN
        RAISE NOTICE 'WARNING: Some tables still exist: %', remaining_tables;
    ELSE
        RAISE NOTICE 'SUCCESS: All workflow codification tables dropped cleanly';
    END IF;
END $$;
