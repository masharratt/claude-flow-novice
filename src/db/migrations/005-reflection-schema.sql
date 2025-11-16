/**
 * Migration 005: ACE Reflection Persistence Schema
 * Task 5.3: Reflection Persistence Standardization
 *
 * Creates the reflections table for PostgreSQL archival storage
 * with proper indexes for performance and unique constraints
 * for idempotent archival.
 */

-- Create reflections table
CREATE TABLE IF NOT EXISTS reflections (
    id SERIAL PRIMARY KEY,

    -- Core reflection fields
    agent_id VARCHAR(255) NOT NULL,
    task_id VARCHAR(255) NOT NULL,
    reflection_type VARCHAR(50) NOT NULL CHECK (
        reflection_type IN ('confidence', 'status', 'progress', 'error', 'decision')
    ),
    confidence DECIMAL(4, 3) NOT NULL CHECK (
        confidence >= 0 AND confidence <= 1
    ),
    payload JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Archival metadata
    archived_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Unique constraint to prevent duplicates during archival
    CONSTRAINT unique_reflection UNIQUE (agent_id, task_id, timestamp)
);

-- Indexes for common query patterns

-- Primary lookup: by agent_id
CREATE INDEX IF NOT EXISTS idx_reflections_agent_id
    ON reflections(agent_id);

-- Lookup by task_id
CREATE INDEX IF NOT EXISTS idx_reflections_task_id
    ON reflections(task_id);

-- Time-range queries
CREATE INDEX IF NOT EXISTS idx_reflections_timestamp
    ON reflections(timestamp DESC);

-- Composite index for agent + task queries
CREATE INDEX IF NOT EXISTS idx_reflections_agent_task
    ON reflections(agent_id, task_id, timestamp DESC);

-- Filter by reflection type
CREATE INDEX IF NOT EXISTS idx_reflections_type
    ON reflections(reflection_type);

-- Confidence-based queries (e.g., low confidence reflections)
CREATE INDEX IF NOT EXISTS idx_reflections_confidence
    ON reflections(confidence);

-- JSONB payload queries (GIN index for JSONB operations)
CREATE INDEX IF NOT EXISTS idx_reflections_payload
    ON reflections USING GIN (payload);

-- Archival tracking (find recently archived reflections)
CREATE INDEX IF NOT EXISTS idx_reflections_archived_at
    ON reflections(archived_at)
    WHERE archived_at IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE reflections IS 'ACE reflection persistence - archival storage from Redis (24h TTL)';
COMMENT ON COLUMN reflections.agent_id IS 'Unique identifier for the agent that generated the reflection';
COMMENT ON COLUMN reflections.task_id IS 'Unique identifier for the task being executed';
COMMENT ON COLUMN reflections.reflection_type IS 'Type of reflection: confidence, status, progress, error, or decision';
COMMENT ON COLUMN reflections.confidence IS 'Confidence score between 0.0 and 1.0';
COMMENT ON COLUMN reflections.payload IS 'Additional reflection data as JSON';
COMMENT ON COLUMN reflections.timestamp IS 'When the reflection was generated';
COMMENT ON COLUMN reflections.archived_at IS 'When the reflection was archived from Redis to PostgreSQL';

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reflections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_reflections_updated_at
    BEFORE UPDATE ON reflections
    FOR EACH ROW
    EXECUTE FUNCTION update_reflections_updated_at();

-- View for reflection statistics by agent
CREATE OR REPLACE VIEW reflection_stats_by_agent AS
SELECT
    agent_id,
    COUNT(*) AS total_reflections,
    AVG(confidence) AS avg_confidence,
    MIN(confidence) AS min_confidence,
    MAX(confidence) AS max_confidence,
    COUNT(*) FILTER (WHERE reflection_type = 'confidence') AS confidence_count,
    COUNT(*) FILTER (WHERE reflection_type = 'status') AS status_count,
    COUNT(*) FILTER (WHERE reflection_type = 'progress') AS progress_count,
    COUNT(*) FILTER (WHERE reflection_type = 'error') AS error_count,
    COUNT(*) FILTER (WHERE reflection_type = 'decision') AS decision_count,
    MIN(timestamp) AS first_reflection,
    MAX(timestamp) AS last_reflection,
    COUNT(*) FILTER (WHERE archived_at IS NOT NULL) AS archived_count
FROM reflections
GROUP BY agent_id;

COMMENT ON VIEW reflection_stats_by_agent IS 'Aggregate statistics for reflections grouped by agent';

-- View for reflection statistics by task
CREATE OR REPLACE VIEW reflection_stats_by_task AS
SELECT
    task_id,
    COUNT(DISTINCT agent_id) AS unique_agents,
    COUNT(*) AS total_reflections,
    AVG(confidence) AS avg_confidence,
    MIN(confidence) AS min_confidence,
    MAX(confidence) AS max_confidence,
    MIN(timestamp) AS first_reflection,
    MAX(timestamp) AS last_reflection
FROM reflections
GROUP BY task_id;

COMMENT ON VIEW reflection_stats_by_task IS 'Aggregate statistics for reflections grouped by task';

-- View for recent low-confidence reflections (monitoring)
CREATE OR REPLACE VIEW recent_low_confidence_reflections AS
SELECT
    agent_id,
    task_id,
    reflection_type,
    confidence,
    payload,
    timestamp
FROM reflections
WHERE
    confidence < 0.70
    AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

COMMENT ON VIEW recent_low_confidence_reflections IS 'Recent reflections with confidence < 0.70 for monitoring';

-- Function to clean up old reflections (optional cleanup utility)
CREATE OR REPLACE FUNCTION cleanup_old_reflections(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM reflections
    WHERE timestamp < NOW() - (days_to_keep || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_reflections IS 'Delete reflections older than specified days (default: 90)';

-- Grant appropriate permissions (adjust role as needed)
-- GRANT SELECT, INSERT, UPDATE ON reflections TO cfn_application;
-- GRANT SELECT ON reflection_stats_by_agent TO cfn_application;
-- GRANT SELECT ON reflection_stats_by_task TO cfn_application;
-- GRANT SELECT ON recent_low_confidence_reflections TO cfn_application;

-- Performance verification query
-- Expected execution time: <200ms for typical queries
/*
EXPLAIN ANALYZE
SELECT *
FROM reflections
WHERE
    agent_id = 'test-agent-123'
    AND task_id = 'task-456'
    AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;
*/
