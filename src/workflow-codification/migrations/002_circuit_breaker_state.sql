-- Migration 002: Circuit Breaker State Table
-- Creates table for persisting circuit breaker states

CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    id SERIAL PRIMARY KEY,
    skill_name VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
    failure_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_threshold INTEGER DEFAULT 5,
    success_threshold INTEGER DEFAULT 2,
    timeout_seconds INTEGER DEFAULT 60,
    last_failure_at TIMESTAMP,
    last_success_at TIMESTAMP,
    state_changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_cb_skill_name ON circuit_breaker_state(skill_name);
CREATE INDEX idx_cb_status ON circuit_breaker_state(status);
CREATE INDEX idx_cb_state_changed_at ON circuit_breaker_state(state_changed_at);

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_circuit_breaker_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    NEW.state_changed_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trg_circuit_breaker_timestamp
BEFORE UPDATE ON circuit_breaker_state
FOR EACH ROW
EXECUTE FUNCTION update_circuit_breaker_timestamp();

-- Verify table creation
SELECT table_name FROM information_schema.tables WHERE table_name = 'circuit_breaker_state';
