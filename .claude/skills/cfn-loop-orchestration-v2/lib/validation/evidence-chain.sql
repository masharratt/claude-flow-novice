-- CFN Loop Validation Evidence Chain Schema
-- SQLite database schema for storing validation results and audit trails

-- Main validation runs table
CREATE TABLE IF NOT EXISTS validation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL UNIQUE,
    template_id TEXT NOT NULL,
    template_version TEXT NOT NULL,
    validation_mode TEXT NOT NULL CHECK (validation_mode IN ('mvp', 'standard', 'enterprise')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'retrying')),
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    consensus_score REAL,
    consensus_threshold REAL,
    validator_count INTEGER,
    max_retries INTEGER,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Individual validator results table
CREATE TABLE IF NOT EXISTS validator_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    validator_id TEXT NOT NULL,
    validator_type TEXT NOT NULL,
    score REAL NOT NULL CHECK (score >= 0 AND score <= 1),
    execution_time INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'timeout', 'error')),
    error_message TEXT,
    metadata TEXT, -- JSON blob for additional data
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (run_id) REFERENCES validation_runs(run_id) ON DELETE CASCADE
);

-- Evidence chain table for detailed validation steps
CREATE TABLE IF NOT EXISTS evidence_chain (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    step_type TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    validator_id TEXT,
    input_data TEXT, -- JSON blob
    output_data TEXT, -- JSON blob
    validation_result TEXT, -- JSON blob
    timestamp INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (run_id) REFERENCES validation_runs(run_id) ON DELETE CASCADE
);

-- Retry log table for tracking retry attempts
CREATE TABLE IF NOT EXISTS retry_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL,
    delay_ms INTEGER NOT NULL,
    reason TEXT NOT NULL,
    consensus_score REAL,
    validator_count INTEGER,
    timestamp INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (run_id) REFERENCES validation_runs(run_id) ON DELETE CASCADE
);

-- Performance metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    unit TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (run_id) REFERENCES validation_runs(run_id) ON DELETE CASCADE
);

-- Error tracking table
CREATE TABLE IF NOT EXISTS error_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    validator_id TEXT,
    timestamp INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (run_id) REFERENCES validation_runs(run_id) ON DELETE CASCADE
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_validation_runs_status ON validation_runs(status);
CREATE INDEX IF NOT EXISTS idx_validation_runs_mode ON validation_runs(validation_mode);
CREATE INDEX IF NOT EXISTS idx_validation_runs_created_at ON validation_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_validator_results_run_id ON validator_results(run_id);
CREATE INDEX IF NOT EXISTS idx_validator_results_validator_id ON validator_results(validator_id);
CREATE INDEX IF NOT EXISTS idx_validator_results_created_at ON validator_results(created_at);
CREATE INDEX IF NOT EXISTS idx_evidence_chain_run_id ON evidence_chain(run_id);
CREATE INDEX IF NOT EXISTS idx_evidence_chain_timestamp ON evidence_chain(timestamp);
CREATE INDEX IF NOT EXISTS idx_retry_log_run_id ON retry_log(run_id);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_run_id ON performance_metrics(run_id);
CREATE INDEX IF NOT EXISTS idx_error_tracking_run_id ON error_tracking(run_id);

-- View for completed validation runs
CREATE VIEW IF NOT EXISTS completed_validation_runs AS
SELECT 
    vr.run_id,
    vr.template_id,
    vr.template_version,
    vr.validation_mode,
    vr.status,
    vr.start_time,
    vr.end_time,
    vr.consensus_score,
    vr.consensus_threshold,
    vr.validator_count,
    vr.error_message,
    (vr.end_time - vr.start_time) as duration_ms,
    COUNT(vr.id) as total_validators,
    SUM(CASE WHEN vrs.status = 'success' THEN 1 ELSE 0 END) as successful_validators,
    AVG(vrs.score) as average_score
FROM validation_runs vr
LEFT JOIN validator_results vrs ON vr.run_id = vrs.run_id
WHERE vr.status = 'completed'
GROUP BY vr.run_id, vr.template_id, vr.template_version, vr.validation_mode, vr.status;

-- View for retry statistics
CREATE VIEW IF NOT EXISTS retry_statistics AS
SELECT 
    rl.run_id,
    vr.template_id,
    vr.validation_mode,
    COUNT(rl.id) as total_retries,
    MAX(rl.attempt_number) as max_attempt,
    AVG(rl.delay_ms) as avg_delay_ms,
    MIN(rl.consensus_score) as min_consensus_score,
    MAX(rl.consensus_score) as max_consensus_score
FROM retry_log rl
JOIN validation_runs vr ON rl.run_id = vr.run_id
GROUP BY rl.run_id, vr.template_id, vr.validation_mode;

-- Trigger to cleanup old records (optional - uncomment if needed)
-- CREATE TRIGGER IF NOT EXISTS cleanup_old_records 
-- AFTER INSERT ON validation_runs
-- FOR EACH ROW
-- BEGIN
--     DELETE FROM validator_results WHERE run_id IN (
--         SELECT run_id FROM validation_runs WHERE created_at < strftime('%s', 'now') - 2592000 -- 30 days
--     );
--     DELETE FROM evidence_chain WHERE run_id IN (
--         SELECT run_id FROM validation_runs WHERE created_at < strftime('%s', 'now') - 2592000
--     );
--     DELETE FROM retry_log WHERE run_id IN (
--         SELECT run_id FROM validation_runs WHERE created_at < strftime('%s', 'now') - 2592000
--     );
--     DELETE FROM performance_metrics WHERE run_id IN (
--         SELECT run_id FROM validation_runs WHERE created_at < strftime('%s', 'now') - 2592000
--     );
--     DELETE FROM error_tracking WHERE run_id IN (
--         SELECT run_id FROM validation_runs WHERE created_at < strftime('%s', 'now') - 2592000
--     );
-- END;