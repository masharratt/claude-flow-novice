-- Migration 007: Composite Skills Table
-- Creates table for storing composite skill definitions

CREATE TABLE IF NOT EXISTS composite_skills (
    id SERIAL PRIMARY KEY,
    composite_name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    steps JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    total_steps INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DRAFT')),
    owner_id VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_composite_name ON composite_skills(composite_name);
CREATE INDEX idx_composite_status ON composite_skills(status);
CREATE INDEX idx_composite_owner_id ON composite_skills(owner_id);
CREATE INDEX idx_composite_created_at ON composite_skills(created_at);

-- Create table for composite execution history
CREATE TABLE IF NOT EXISTS composite_execution_history (
    id SERIAL PRIMARY KEY,
    composite_id INTEGER REFERENCES composite_skills(id),
    composite_name VARCHAR(255) NOT NULL,
    execution_id UUID NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')),
    workspace_data JSONB,
    step_results JSONB,
    total_duration_ms FLOAT,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for execution history
CREATE INDEX idx_exec_composite_id ON composite_execution_history(composite_id);
CREATE INDEX idx_exec_composite_name ON composite_execution_history(composite_name);
CREATE INDEX idx_exec_execution_id ON composite_execution_history(execution_id);
CREATE INDEX idx_exec_status ON composite_execution_history(status);
CREATE INDEX idx_exec_started_at ON composite_execution_history(started_at);

-- Create view for composite execution statistics
CREATE VIEW v_composite_execution_stats AS
SELECT
    composite_name,
    COUNT(*) as total_executions,
    SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as successful_executions,
    SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_executions,
    AVG(total_duration_ms) as avg_duration_ms,
    MIN(total_duration_ms) as min_duration_ms,
    MAX(total_duration_ms) as max_duration_ms,
    ROUND(100.0 * SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM composite_execution_history
WHERE started_at > NOW() - INTERVAL '30 days'
GROUP BY composite_name;

-- Verify table creation
SELECT table_name FROM information_schema.tables WHERE table_name = 'composite_skills';
