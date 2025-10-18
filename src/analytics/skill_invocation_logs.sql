-- Skill Invocation Logging System Schema
-- ACL Level: 4 (Project-wide analytics)

CREATE TABLE skill_invocations (
    -- Core Identification
    invocation_id TEXT PRIMARY KEY,  -- UUID/Hash
    skill_name TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Contextual Information
    user_prompt_hash TEXT,  -- SHA-256 hash of the original user prompt
    selected_skill TEXT,    -- The actual skill that was selected

    -- Performance Metrics
    outcome TEXT CHECK(outcome IN ('success', 'failure', 'partial')),
    token_count_before INTEGER,
    token_count_after INTEGER,
    context_reduction_percentage REAL,

    -- Matching & Quality
    confidence_score REAL,  -- 0-1 range
    mismatch_flag BOOLEAN DEFAULT FALSE,

    -- CFN Loop Correlation
    epic_id TEXT,
    phase_id TEXT,
    sprint_id TEXT,
    swarm_id TEXT,

    -- Metadata
    agent_id TEXT,
    provider TEXT
);

-- Indexes for performance optimization
CREATE INDEX idx_skill_name ON skill_invocations(skill_name);
CREATE INDEX idx_timestamp ON skill_invocations(timestamp);
CREATE INDEX idx_mismatch_flag ON skill_invocations(mismatch_flag);
CREATE INDEX idx_outcome ON skill_invocations(outcome);
CREATE INDEX idx_epic_phase_sprint ON skill_invocations(epic_id, phase_id, sprint_id);

-- View for quick analytics
CREATE VIEW skill_performance_summary AS
SELECT
    skill_name,
    COUNT(*) as total_invocations,
    SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) as successful_invocations,
    ROUND(AVG(confidence_score), 2) as avg_confidence,
    ROUND(AVG(context_reduction_percentage), 2) as avg_context_reduction,
    SUM(CASE WHEN mismatch_flag = TRUE THEN 1 ELSE 0 END) as total_mismatches
FROM skill_invocations
GROUP BY skill_name;