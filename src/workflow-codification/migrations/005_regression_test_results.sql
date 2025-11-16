-- Migration 005: Regression Test Results Table
-- Creates table for storing test execution results

CREATE TABLE IF NOT EXISTS regression_test_results (
    id SERIAL PRIMARY KEY,
    suite_id INTEGER REFERENCES regression_test_suites(id),
    skill_name VARCHAR(255) NOT NULL,
    test_count INTEGER NOT NULL,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    error_rate DECIMAL(5, 2) GENERATED ALWAYS AS (
        CASE WHEN test_count > 0 THEN (failed * 100.0) / test_count ELSE 0 END
    ) STORED,
    success_rate DECIMAL(5, 2) GENERATED ALWAYS AS (
        CASE WHEN test_count > 0 THEN (passed * 100.0) / test_count ELSE 0 END
    ) STORED,
    execution_time_seconds FLOAT NOT NULL,
    quality_gate_passed BOOLEAN DEFAULT FALSE,
    test_results JSONB,
    execution_environment VARCHAR(255),
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_test_results_suite_id ON regression_test_results(suite_id);
CREATE INDEX idx_test_results_skill_name ON regression_test_results(skill_name);
CREATE INDEX idx_test_results_executed_at ON regression_test_results(executed_at);
CREATE INDEX idx_test_results_quality_gate ON regression_test_results(quality_gate_passed);
CREATE INDEX idx_test_results_composite ON regression_test_results(skill_name, executed_at);

-- Create view for quality gate statistics
CREATE VIEW v_test_quality_gate_stats AS
SELECT
    skill_name,
    COUNT(*) as total_runs,
    SUM(CASE WHEN quality_gate_passed THEN 1 ELSE 0 END) as passed_runs,
    AVG(success_rate) as avg_success_rate,
    MIN(executed_at) as earliest_run,
    MAX(executed_at) as latest_run
FROM regression_test_results
WHERE executed_at > NOW() - INTERVAL '30 days'
GROUP BY skill_name;

-- Verify table creation
SELECT table_name FROM information_schema.tables WHERE table_name = 'regression_test_results';
