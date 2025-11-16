-- ============================================================
-- FEATURE 1: SKILL HEALTH SCORE
-- Migration: 001_skill_health_history.sql
-- Purpose: Create skill_health_history table for tracking skill quality metrics
-- ============================================================

CREATE TABLE IF NOT EXISTS skill_health_history (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Skill identification
    skill_name VARCHAR(255) NOT NULL,

    -- Overall health score (composite of all metrics)
    overall_score INTEGER NOT NULL CHECK (overall_score BETWEEN 0 AND 100),

    -- Component scores (weighted metrics)
    reliability_score DECIMAL(5,2) CHECK (reliability_score BETWEEN 0 AND 100),
    performance_score DECIMAL(5,2) CHECK (performance_score BETWEEN 0 AND 100),
    edge_case_score DECIMAL(5,2) CHECK (edge_case_score BETWEEN 0 AND 100),
    documentation_score DECIMAL(5,2) CHECK (documentation_score BETWEEN 0 AND 100),
    test_coverage_score DECIMAL(5,2) CHECK (test_coverage_score BETWEEN 0 AND 100),

    -- Health classification
    health_level VARCHAR(20) CHECK (health_level IN ('excellent', 'good', 'fair', 'poor')),

    -- Timestamp
    calculated_at TIMESTAMP DEFAULT NOW(),

    -- Optional metadata for extensibility
    metadata JSONB DEFAULT '{}'
);

-- Comments for documentation
COMMENT ON TABLE skill_health_history IS 'Tracks historical health scores for skills over time';
COMMENT ON COLUMN skill_health_history.overall_score IS 'Composite health score (0-100) calculated from weighted component scores';
COMMENT ON COLUMN skill_health_history.reliability_score IS 'Success rate from last 100 executions (35% weight)';
COMMENT ON COLUMN skill_health_history.performance_score IS 'Execution time vs baseline (20% weight)';
COMMENT ON COLUMN skill_health_history.edge_case_score IS 'Inverse of edge case failure rate (20% weight)';
COMMENT ON COLUMN skill_health_history.documentation_score IS 'Documentation completeness check (10% weight)';
COMMENT ON COLUMN skill_health_history.test_coverage_score IS 'Percentage of code covered by tests (15% weight)';
COMMENT ON COLUMN skill_health_history.health_level IS 'Classification: excellent (90-100), good (75-89), fair (60-74), poor (<60)';
