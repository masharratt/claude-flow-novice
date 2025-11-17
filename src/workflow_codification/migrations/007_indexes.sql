-- ============================================================
-- INDEXES FOR ALL 6 FEATURES
-- Migration: 007_indexes.sql
-- Purpose: Create indexes for optimal query performance across all feature tables
-- ============================================================

-- ============================================================
-- FEATURE 1: SKILL HEALTH HISTORY INDEXES
-- ============================================================

-- Index for querying health history by skill and time (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_skill_health_name_time
    ON skill_health_history(skill_name, calculated_at DESC);

-- Index for filtering by health level (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_skill_health_level
    ON skill_health_history(health_level);

-- ============================================================
-- FEATURE 2: CIRCUIT BREAKER STATE INDEXES
-- ============================================================

-- Index for querying by status (find all OPEN circuits)
CREATE INDEX IF NOT EXISTS idx_circuit_breaker_status
    ON circuit_breaker_state(status);

-- ============================================================
-- FEATURE 3: REGRESSION TEST SUITES INDEXES
-- ============================================================

-- Index for querying test suites by skill
CREATE INDEX IF NOT EXISTS idx_regression_suites_skill
    ON regression_test_suites(skill_name);

-- Index for querying by priority (P0/P1/P2)
CREATE INDEX IF NOT EXISTS idx_regression_suites_priority
    ON regression_test_suites(priority);

-- ============================================================
-- FEATURE 4: PATTERN RECOMMENDATIONS INDEXES
-- ============================================================

-- Composite index for querying user's recommendations by status
CREATE INDEX IF NOT EXISTS idx_pattern_recommendations_user
    ON pattern_recommendations(user_id, status);

-- Index for filtering by recommendation strength
CREATE INDEX IF NOT EXISTS idx_pattern_recommendations_strength
    ON pattern_recommendations(recommendation_strength);

-- ============================================================
-- FEATURE 5: COMPOSITE SKILLS INDEXES
-- ============================================================

-- Index for querying by execution mode
CREATE INDEX IF NOT EXISTS idx_composite_skills_mode
    ON composite_skills(execution_mode);

-- Index for fast lookup by composite_name (even though it's UNIQUE, explicit index helps)
CREATE INDEX IF NOT EXISTS idx_composite_skills_name
    ON composite_skills(composite_name);

-- ============================================================
-- FEATURE 6: EXECUTION TRACES INDEXES (on partitions)
-- ============================================================

-- Index for querying traces by skill name
-- Note: This creates indexes on all current and future partitions
CREATE INDEX IF NOT EXISTS idx_execution_traces_skill
    ON execution_traces(skill_name);

-- Index for querying by status (find all failed executions)
CREATE INDEX IF NOT EXISTS idx_execution_traces_status
    ON execution_traces(status);

-- GIN index for full-text search on JSONB steps (find errors in step details)
CREATE INDEX IF NOT EXISTS idx_execution_traces_steps_gin
    ON execution_traces USING GIN (steps);

-- Performance notes:
-- 1. Partitioned tables automatically inherit indexes from parent table
-- 2. GIN index enables fast JSONB queries like: WHERE steps @> '{"status": "failed"}'
-- 3. All indexes use IF NOT EXISTS to allow safe re-running
-- 4. Index names follow convention: idx_{table}_{columns}_{type}
