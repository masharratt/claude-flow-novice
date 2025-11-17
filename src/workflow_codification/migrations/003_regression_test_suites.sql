-- ============================================================
-- FEATURE 3: REGRESSION TESTING
-- Migration: 003_regression_test_suites.sql
-- Purpose: Create regression_test_suites table for automated test generation
-- ============================================================

CREATE TABLE IF NOT EXISTS regression_test_suites (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Skill identification
    skill_name VARCHAR(255) NOT NULL,

    -- Test suite metadata
    total_tests INTEGER NOT NULL CHECK (total_tests > 0),

    -- Test cases stored as JSONB array
    -- Format: [{"input": {...}, "expected_output": {...}, "priority": "P0", ...}, ...]
    test_cases JSONB NOT NULL DEFAULT '[]',

    -- Prioritization (P0 = critical, P1 = high, P2 = medium)
    priority VARCHAR(10) CHECK (priority IN ('P0', 'P1', 'P2')),

    -- Lifecycle timestamps
    generated_at TIMESTAMP DEFAULT NOW(),
    last_run_at TIMESTAMP,

    -- Last test run results
    last_run_pass_rate DECIMAL(5,2) CHECK (last_run_pass_rate BETWEEN 0 AND 100),

    -- Optional metadata
    metadata JSONB DEFAULT '{}'
);

-- Comments for documentation
COMMENT ON TABLE regression_test_suites IS 'Stores auto-generated regression test suites from historical successful executions';
COMMENT ON COLUMN regression_test_suites.test_cases IS 'JSONB array of test case objects with input, expected output, and priority';
COMMENT ON COLUMN regression_test_suites.priority IS 'P0 = critical (breaking changes), P1 = high (major changes), P2 = medium (minor changes)';
COMMENT ON COLUMN regression_test_suites.last_run_pass_rate IS 'Percentage of tests that passed in the last execution (0-100)';
