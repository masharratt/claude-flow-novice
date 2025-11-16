-- Migration 008: Execution Traces Table
-- Creates table for distributed tracing of skill executions

CREATE TABLE IF NOT EXISTS execution_traces (
    id SERIAL PRIMARY KEY,
    trace_id UUID NOT NULL UNIQUE,
    parent_trace_id UUID,
    skill_name VARCHAR(255) NOT NULL,
    execution_id UUID NOT NULL,
    span_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_ms FLOAT,
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    error_code VARCHAR(100),
    metadata JSONB,
    tags JSONB,
    baggage JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_trace_trace_id ON execution_traces(trace_id);
CREATE INDEX idx_trace_parent_trace_id ON execution_traces(parent_trace_id);
CREATE INDEX idx_trace_skill_name ON execution_traces(skill_name);
CREATE INDEX idx_trace_execution_id ON execution_traces(execution_id);
CREATE INDEX idx_trace_status ON execution_traces(status);
CREATE INDEX idx_trace_start_time ON execution_traces(start_time);
CREATE INDEX idx_trace_created_at ON execution_traces(created_at);
CREATE INDEX idx_trace_composite ON execution_traces(trace_id, start_time);

-- Partition by created_at for better performance
CREATE TABLE IF NOT EXISTS execution_traces_2025_11 PARTITION OF execution_traces
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Create view for trace statistics
CREATE VIEW v_trace_statistics AS
SELECT
    skill_name,
    COUNT(*) as total_traces,
    SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) as successful_traces,
    SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_traces,
    AVG(duration_ms) as avg_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99_duration_ms,
    MIN(start_time) as earliest_trace,
    MAX(start_time) as latest_trace
FROM execution_traces
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY skill_name;

-- Create function for trace cleanup (optional)
CREATE OR REPLACE FUNCTION cleanup_old_traces()
RETURNS void AS $$
BEGIN
    DELETE FROM execution_traces
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Verify table creation
SELECT table_name FROM information_schema.tables WHERE table_name = 'execution_traces';
