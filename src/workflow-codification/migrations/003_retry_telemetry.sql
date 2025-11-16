-- Migration 003: Retry Telemetry Table
-- Creates table for tracking retry behavior and backoff strategies

CREATE TABLE IF NOT EXISTS retry_telemetry (
    id SERIAL PRIMARY KEY,
    skill_name VARCHAR(255) NOT NULL,
    execution_id UUID NOT NULL,
    attempt_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('PENDING', 'RETRYING', 'SUCCESS', 'FAILED')),
    error_code VARCHAR(100),
    error_message TEXT,
    backoff_strategy VARCHAR(50) CHECK (backoff_strategy IN ('EXPONENTIAL', 'LINEAR', 'FIBONACCI', 'FIXED')),
    delay_ms INTEGER,
    retry_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_ms FLOAT,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_retry_skill_name ON retry_telemetry(skill_name);
CREATE INDEX idx_retry_execution_id ON retry_telemetry(execution_id);
CREATE INDEX idx_retry_status ON retry_telemetry(status);
CREATE INDEX idx_retry_attempt_number ON retry_telemetry(attempt_number);
CREATE INDEX idx_retry_created_at ON retry_telemetry(created_at);
CREATE INDEX idx_retry_composite ON retry_telemetry(skill_name, execution_id, attempt_number);

-- Partition by created_at for better performance on large datasets
CREATE TABLE IF NOT EXISTS retry_telemetry_2025_11 PARTITION OF retry_telemetry
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Verify table creation
SELECT table_name FROM information_schema.tables WHERE table_name = 'retry_telemetry';
