-- Migration 001: Skill Health History Table
-- Creates table for tracking historical skill health scores

CREATE TABLE IF NOT EXISTS skill_health_history (
    id SERIAL PRIMARY KEY,
    skill_name VARCHAR(255) NOT NULL,
    overall_score DECIMAL(5, 2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
    health_level VARCHAR(50) NOT NULL CHECK (health_level IN ('EXCELLENT', 'GOOD', 'FAIR', 'POOR')),
    success_rate DECIMAL(5, 2),
    error_rate DECIMAL(5, 2),
    performance_score DECIMAL(5, 2),
    reliability_score DECIMAL(5, 2),
    execution_count INTEGER DEFAULT 0,
    successful_executions INTEGER DEFAULT 0,
    failed_executions INTEGER DEFAULT 0,
    average_duration_ms FLOAT,
    p95_duration_ms FLOAT,
    p99_duration_ms FLOAT,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for fast querying
CREATE INDEX idx_skill_health_skill_name ON skill_health_history(skill_name);
CREATE INDEX idx_skill_health_recorded_at ON skill_health_history(recorded_at);
CREATE INDEX idx_skill_health_health_level ON skill_health_history(health_level);
CREATE INDEX idx_skill_health_composite ON skill_health_history(skill_name, recorded_at);

-- Create materialized view for dashboards
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_skill_health_latest AS
SELECT
    skill_name,
    overall_score,
    health_level,
    success_rate,
    error_rate,
    average_duration_ms,
    recorded_at,
    ROW_NUMBER() OVER (PARTITION BY skill_name ORDER BY recorded_at DESC) as rn
FROM skill_health_history
WHERE recorded_at > NOW() - INTERVAL '30 days';

-- Create index on materialized view
CREATE INDEX idx_mv_skill_health_latest ON mv_skill_health_latest(skill_name, rn);

-- Verify table creation
SELECT table_name FROM information_schema.tables WHERE table_name = 'skill_health_history';
