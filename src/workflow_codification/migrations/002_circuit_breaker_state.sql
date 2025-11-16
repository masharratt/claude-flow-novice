-- ============================================================
-- FEATURE 2: SELF-HEALING SKILLS
-- Migration: 002_circuit_breaker_state.sql
-- Purpose: Create circuit_breaker_state table for tracking skill failure patterns
-- ============================================================

CREATE TABLE IF NOT EXISTS circuit_breaker_state (
    -- Primary key (skill_name is unique identifier)
    skill_name VARCHAR(255) PRIMARY KEY,

    -- Circuit state (CLOSED = normal, OPEN = failing, HALF_OPEN = testing recovery)
    status VARCHAR(20) NOT NULL CHECK (status IN ('CLOSED', 'OPEN', 'HALF_OPEN')),

    -- Failure tracking
    consecutive_failures INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    opened_at TIMESTAMP,

    -- Configuration (tunable per skill)
    failure_threshold INTEGER NOT NULL DEFAULT 5,
    cooldown_seconds INTEGER NOT NULL DEFAULT 300,

    -- Last updated
    last_updated TIMESTAMP DEFAULT NOW()
);

-- Comments for documentation
COMMENT ON TABLE circuit_breaker_state IS 'Manages circuit breaker state for self-healing skill retry logic';
COMMENT ON COLUMN circuit_breaker_state.status IS 'CLOSED = normal operation, OPEN = circuit breaker active (no retries), HALF_OPEN = testing recovery';
COMMENT ON COLUMN circuit_breaker_state.consecutive_failures IS 'Count of consecutive failures before circuit opens';
COMMENT ON COLUMN circuit_breaker_state.opened_at IS 'Timestamp when circuit breaker opened (NULL if CLOSED)';
COMMENT ON COLUMN circuit_breaker_state.failure_threshold IS 'Number of consecutive failures before opening circuit (default: 5)';
COMMENT ON COLUMN circuit_breaker_state.cooldown_seconds IS 'Seconds to wait before moving to HALF_OPEN state (default: 300)';
