-- ============================================================
-- FEATURE 4: AI PATTERN RECOMMENDER
-- Migration: 004_pattern_recommendations.sql
-- Purpose: Create pattern_recommendations table for workflow pattern detection
-- ============================================================

CREATE TABLE IF NOT EXISTS pattern_recommendations (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User identification
    user_id VARCHAR(255),

    -- Detected workflow pattern (JSONB array of steps)
    -- Format: [{"skill": "skill-name", "params": {...}, "order": 1}, ...]
    workflow_steps JSONB NOT NULL,

    -- Recommendation strength
    recommendation_strength VARCHAR(20) CHECK (recommendation_strength IN ('high', 'medium', 'low')),
    strength_score DECIMAL(3,2) CHECK (strength_score BETWEEN 0 AND 1),

    -- Component scores for recommendation
    frequency_score DECIMAL(3,2),
    similarity_score DECIMAL(3,2),
    value_score DECIMAL(3,2),
    determinism_score DECIMAL(3,2),

    -- Projected impact
    projected_monthly_savings_usd DECIMAL(10,2),

    -- User interaction
    status VARCHAR(50) DEFAULT 'suggested' CHECK (status IN ('suggested', 'accepted', 'rejected', 'deployed')),
    suggested_at TIMESTAMP DEFAULT NOW(),
    responded_at TIMESTAMP,

    -- Optional metadata
    metadata JSONB DEFAULT '{}'
);

-- Comments for documentation
COMMENT ON TABLE pattern_recommendations IS 'AI-generated recommendations for workflow patterns that could be codified into skills';
COMMENT ON COLUMN pattern_recommendations.workflow_steps IS 'JSONB array of workflow steps detected as a repeating pattern';
COMMENT ON COLUMN pattern_recommendations.recommendation_strength IS 'high (>0.7), medium (0.4-0.7), low (<0.4) based on composite scoring';
COMMENT ON COLUMN pattern_recommendations.strength_score IS 'Composite score (0-1) combining frequency, similarity, value, and determinism';
COMMENT ON COLUMN pattern_recommendations.frequency_score IS 'How often pattern occurs (0-1)';
COMMENT ON COLUMN pattern_recommendations.similarity_score IS 'How similar instances are to each other (0-1)';
COMMENT ON COLUMN pattern_recommendations.value_score IS 'Estimated time/cost savings if codified (0-1)';
COMMENT ON COLUMN pattern_recommendations.determinism_score IS 'How deterministic pattern is (0-1, higher = more suitable for automation)';
COMMENT ON COLUMN pattern_recommendations.status IS 'suggested = pending review, accepted = user approved, rejected = user declined, deployed = skill created';
