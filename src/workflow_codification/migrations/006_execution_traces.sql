-- ============================================================
-- FEATURE 6: EXECUTION TRACING
-- Migration: 006_execution_traces.sql
-- Purpose: Create execution_traces table with monthly partitioning for scalability
-- ============================================================

-- Create parent table (partitioned by started_at)
CREATE TABLE IF NOT EXISTS execution_traces (
    -- Primary key (must include partition column)
    trace_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Skill identification
    skill_name VARCHAR(255) NOT NULL,

    -- Trace lifecycle
    completed_at TIMESTAMP,
    total_duration_ms INTEGER,
    status VARCHAR(50) CHECK (status IN ('running', 'success', 'failed', 'timeout')),

    -- Execution steps (JSONB array)
    -- Format: [{"step": "step-name", "started_at": "...", "completed_at": "...", "status": "...", ...}, ...]
    steps JSONB DEFAULT '[]',

    -- Error tracking
    error_message TEXT,

    -- Optional metadata
    metadata JSONB DEFAULT '{}',

    -- Composite primary key (includes partition column)
    PRIMARY KEY (trace_id, started_at)
) PARTITION BY RANGE (started_at);

-- Create monthly partitions for current and next 2 months
CREATE TABLE IF NOT EXISTS execution_traces_2025_11 PARTITION OF execution_traces
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE IF NOT EXISTS execution_traces_2025_12 PARTITION OF execution_traces
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE TABLE IF NOT EXISTS execution_traces_2026_01 PARTITION OF execution_traces
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Comments for documentation
COMMENT ON TABLE execution_traces IS 'Stores detailed execution traces for all skill executions with monthly partitioning';
COMMENT ON COLUMN execution_traces.trace_id IS 'Unique trace identifier (format: trace-{timestamp}-{random})';
COMMENT ON COLUMN execution_traces.steps IS 'JSONB array of step-level execution details (timestamps, status, errors)';
COMMENT ON COLUMN execution_traces.status IS 'running = in progress, success = completed successfully, failed = error occurred, timeout = exceeded time limit';

-- Note: Partition maintenance should be automated via cron job or pg_cron extension
-- Example: CREATE TABLE execution_traces_YYYY_MM PARTITION OF execution_traces FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01');
