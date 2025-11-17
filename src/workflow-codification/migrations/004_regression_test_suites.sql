-- Migration 004: Regression Test Suites Table
-- Creates table for storing test suite definitions

CREATE TABLE IF NOT EXISTS regression_test_suites (
    id SERIAL PRIMARY KEY,
    skill_name VARCHAR(255) NOT NULL,
    suite_name VARCHAR(255) NOT NULL,
    description TEXT,
    lookback_days INTEGER DEFAULT 30,
    sample_size INTEGER DEFAULT 10,
    total_tests INTEGER,
    test_configuration JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DRAFT')),
    created_by VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(skill_name, suite_name)
);

-- Create indexes
CREATE INDEX idx_test_suite_skill_name ON regression_test_suites(skill_name);
CREATE INDEX idx_test_suite_status ON regression_test_suites(status);
CREATE INDEX idx_test_suite_created_at ON regression_test_suites(created_at);

-- Create function for timestamp updates
CREATE OR REPLACE FUNCTION update_test_suite_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trg_test_suite_timestamp
BEFORE UPDATE ON regression_test_suites
FOR EACH ROW
EXECUTE FUNCTION update_test_suite_timestamp();

-- Verify table creation
SELECT table_name FROM information_schema.tables WHERE table_name = 'regression_test_suites';
