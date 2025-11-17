-- Migration 006: Pattern Recommendations Table
-- Creates table for storing workflow pattern recommendations

CREATE TABLE IF NOT EXISTS pattern_recommendations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    pattern_name VARCHAR(255) NOT NULL,
    pattern_command TEXT NOT NULL,
    frequency INTEGER DEFAULT 0,
    success_rate DECIMAL(5, 2),
    pattern_strength DECIMAL(5, 2) CHECK (pattern_strength >= 0 AND pattern_strength <= 100),
    recommendation TEXT NOT NULL,
    expected_time_savings_minutes INTEGER,
    expected_cost_savings_dollars DECIMAL(10, 2),
    confidence_score DECIMAL(5, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    user_accepted BOOLEAN DEFAULT NULL,
    accepted_at TIMESTAMP,
    rejection_reason TEXT,
    metrics JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_pattern_user_id ON pattern_recommendations(user_id);
CREATE INDEX idx_pattern_strength ON pattern_recommendations(pattern_strength);
CREATE INDEX idx_pattern_created_at ON pattern_recommendations(created_at);
CREATE INDEX idx_pattern_user_accepted ON pattern_recommendations(user_accepted);
CREATE INDEX idx_pattern_composite ON pattern_recommendations(user_id, created_at);

-- Create view for recommendation statistics
CREATE VIEW v_recommendation_stats AS
SELECT
    user_id,
    COUNT(*) as total_recommendations,
    SUM(CASE WHEN user_accepted = true THEN 1 ELSE 0 END) as accepted_count,
    SUM(CASE WHEN user_accepted = false THEN 1 ELSE 0 END) as rejected_count,
    COALESCE(SUM(expected_time_savings_minutes), 0) as total_time_savings,
    COALESCE(SUM(expected_cost_savings_dollars), 0) as total_cost_savings,
    AVG(confidence_score) as avg_confidence
FROM pattern_recommendations
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id;

-- Verify table creation
SELECT table_name FROM information_schema.tables WHERE table_name = 'pattern_recommendations';
