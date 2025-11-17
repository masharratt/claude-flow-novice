-- Migration 002: Add Edge Cases Table
-- Part of Task 1.5: MVP Edge Case Feedback Loop
--
-- Purpose: Track skill execution failures for continuous improvement
-- Features:
--   - Categorized error tracking (syntax, runtime, validation, timeout, dependency)
--   - Deduplication support (occurrence count, first/last seen)
--   - Severity classification (low, medium, high, critical)
--   - Context capture (input, output, stack trace)
--   - Pattern detection support

-- Edge cases table
CREATE TABLE IF NOT EXISTS edge_cases (
    -- Unique identifier for this edge case
    id TEXT PRIMARY KEY,

    -- Associated skill
    skill_id TEXT NOT NULL,

    -- Error classification
    error_type TEXT NOT NULL CHECK(error_type IN ('syntax', 'runtime', 'validation', 'timeout', 'dependency', 'unknown')),
    severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),

    -- Error details
    error_message TEXT,
    stack_trace TEXT,

    -- Context capture
    input_context TEXT,  -- JSON string of skill input
    output_context TEXT, -- Skill output (if any)

    -- Deduplication tracking
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    occurrence_count INTEGER DEFAULT 1,

    -- Status tracking
    status TEXT DEFAULT 'new' CHECK(status IN ('new', 'acknowledged', 'fixed', 'ignored')),

    -- Additional metadata (JSON)
    metadata TEXT,

    -- Indexes for common queries
    CONSTRAINT fk_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

-- Index for finding similar failures (deduplication)
CREATE INDEX IF NOT EXISTS idx_edge_cases_skill_error
    ON edge_cases(skill_id, error_type, status);

-- Index for severity queries
CREATE INDEX IF NOT EXISTS idx_edge_cases_severity
    ON edge_cases(severity, status);

-- Index for temporal queries
CREATE INDEX IF NOT EXISTS idx_edge_cases_last_seen
    ON edge_cases(last_seen DESC);

-- Index for occurrence tracking
CREATE INDEX IF NOT EXISTS idx_edge_cases_occurrence
    ON edge_cases(occurrence_count DESC);

-- Failure patterns table (for pattern detection)
CREATE TABLE IF NOT EXISTS failure_patterns (
    -- Unique identifier for this pattern
    id TEXT PRIMARY KEY,

    -- Pattern metadata
    skill_id TEXT NOT NULL,
    error_type TEXT NOT NULL,

    -- Pattern characteristics
    common_errors TEXT,      -- JSON array of common error substrings
    common_inputs TEXT,       -- JSON array of common input patterns

    -- Pattern statistics
    occurrence_count INTEGER DEFAULT 0,
    severity TEXT CHECK(severity IN ('low', 'medium', 'high', 'critical')),

    -- Suggested fix (NULL in Phase 1, populated in Phase 4)
    suggested_fix TEXT,

    -- Pattern status
    status TEXT DEFAULT 'detected' CHECK(status IN ('detected', 'analyzing', 'fixed', 'ignored')),

    -- Timestamps
    first_detected DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Additional metadata (JSON)
    metadata TEXT,

    CONSTRAINT fk_pattern_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

-- Index for pattern queries
CREATE INDEX IF NOT EXISTS idx_failure_patterns_skill
    ON failure_patterns(skill_id, error_type);

-- Index for high-impact patterns
CREATE INDEX IF NOT EXISTS idx_failure_patterns_impact
    ON failure_patterns(occurrence_count DESC, severity);

-- View for dashboard: Top failures by skill
CREATE VIEW IF NOT EXISTS v_top_failures_by_skill AS
SELECT
    skill_id,
    error_type,
    SUM(occurrence_count) as total_failures,
    MAX(severity) as max_severity,
    COUNT(*) as unique_cases,
    MAX(last_seen) as most_recent
FROM edge_cases
WHERE status = 'new'
GROUP BY skill_id, error_type
ORDER BY total_failures DESC;

-- View for dashboard: High severity failures
CREATE VIEW IF NOT EXISTS v_high_severity_failures AS
SELECT
    id,
    skill_id,
    error_type,
    severity,
    error_message,
    occurrence_count,
    last_seen
FROM edge_cases
WHERE severity IN ('critical', 'high')
    AND status = 'new'
ORDER BY last_seen DESC, occurrence_count DESC;

-- View for dashboard: Failure trends (last 30 days)
CREATE VIEW IF NOT EXISTS v_failure_trends AS
SELECT
    DATE(first_seen) as date,
    error_type,
    COUNT(*) as new_failures,
    SUM(occurrence_count) as total_occurrences
FROM edge_cases
WHERE first_seen >= datetime('now', '-30 days')
GROUP BY DATE(first_seen), error_type
ORDER BY date DESC;

-- Migration metadata
INSERT INTO schema_migrations (version, description, applied_at)
VALUES (
    '002',
    'Add edge cases table and failure patterns for skill quality tracking',
    CURRENT_TIMESTAMP
)
ON CONFLICT (version) DO NOTHING;
