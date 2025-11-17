-- Migration 003: Unified Metrics Schema
-- Part of Task 2.3: Unified Metrics and Execution Logging
--
-- Creates unified execution_metrics table for both PostgreSQL and SQLite
-- with idempotency tracking to prevent duplicate writes

-- ============================================================
-- EXECUTION METRICS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS execution_metrics (
    -- Primary identifier (UUID)
    id TEXT PRIMARY KEY,

    -- Temporal data
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Agent and task context
    agent_id TEXT NOT NULL,
    skill_id TEXT,
    task_id TEXT NOT NULL,

    -- Performance metrics
    duration_ms INTEGER NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    cost_usd DECIMAL(10, 3) NOT NULL DEFAULT 0.000,

    -- Execution status
    status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'timeout', 'cancelled')),
    error_message TEXT,

    -- Additional context (JSON)
    metadata TEXT,

    -- Audit fields
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- IDEMPOTENCY TRACKING TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
    -- Idempotency key (SHA256 hash)
    key TEXT PRIMARY KEY,

    -- Reference to execution metrics
    metrics_id TEXT,

    -- Write timestamp
    written_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- TTL for cleanup (24 hours)
    expires_at TIMESTAMP NOT NULL,

    FOREIGN KEY (metrics_id) REFERENCES execution_metrics(id) ON DELETE CASCADE
);

-- ============================================================
-- INDEXES FOR QUERY PERFORMANCE
-- ============================================================

-- Index for agent-based queries
CREATE INDEX IF NOT EXISTS idx_execution_metrics_agent_id
    ON execution_metrics(agent_id);

-- Index for skill-based queries
CREATE INDEX IF NOT EXISTS idx_execution_metrics_skill_id
    ON execution_metrics(skill_id);

-- Index for task-based queries
CREATE INDEX IF NOT EXISTS idx_execution_metrics_task_id
    ON execution_metrics(task_id);

-- Index for status-based queries
CREATE INDEX IF NOT EXISTS idx_execution_metrics_status
    ON execution_metrics(status);

-- Index for time-range queries
CREATE INDEX IF NOT EXISTS idx_execution_metrics_timestamp
    ON execution_metrics(timestamp DESC);

-- Composite index for common query patterns (agent + time range)
CREATE INDEX IF NOT EXISTS idx_execution_metrics_agent_timestamp
    ON execution_metrics(agent_id, timestamp DESC);

-- Composite index for failure analysis (status + timestamp)
CREATE INDEX IF NOT EXISTS idx_execution_metrics_status_timestamp
    ON execution_metrics(status, timestamp DESC);

-- Index for idempotency key lookups
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
    ON idempotency_keys(expires_at);

-- ============================================================
-- TRIGGERS (SQLite only)
-- ============================================================

-- Update updated_at timestamp on record modification (SQLite)
CREATE TRIGGER IF NOT EXISTS update_execution_metrics_timestamp
    AFTER UPDATE ON execution_metrics
    FOR EACH ROW
    BEGIN
        UPDATE execution_metrics
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.id;
    END;

-- ============================================================
-- CLEANUP PROCEDURES
-- ============================================================

-- Note: For PostgreSQL, use pg_cron or scheduled job
-- For SQLite, cleanup can be performed periodically via application code
--
-- DELETE FROM idempotency_keys WHERE expires_at < CURRENT_TIMESTAMP;

-- ============================================================
-- SAMPLE QUERIES
-- ============================================================

-- Total cost by agent (last 7 days)
-- SELECT agent_id,
--        COUNT(*) as executions,
--        SUM(cost_usd) as total_cost,
--        AVG(duration_ms) as avg_duration
-- FROM execution_metrics
-- WHERE timestamp > datetime('now', '-7 days')  -- SQLite
--    OR timestamp > NOW() - INTERVAL '7 days'   -- PostgreSQL
-- GROUP BY agent_id
-- ORDER BY total_cost DESC;

-- Failure rate by skill
-- SELECT skill_id,
--        COUNT(*) as total,
--        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failures,
--        ROUND(100.0 * SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) / COUNT(*), 2) as failure_rate
-- FROM execution_metrics
-- WHERE skill_id IS NOT NULL
-- GROUP BY skill_id
-- HAVING failure_rate > 5
-- ORDER BY failure_rate DESC;

-- Performance trends (daily)
-- SELECT DATE(timestamp) as date,
--        COUNT(*) as executions,
--        AVG(duration_ms) as avg_duration,
--        SUM(tokens_used) as total_tokens,
--        SUM(cost_usd) as total_cost
-- FROM execution_metrics
-- GROUP BY DATE(timestamp)
-- ORDER BY date DESC
-- LIMIT 30;
