-- Migration 009: Edge Case Feedback Loop Enhancement
-- Part of Phase 2, Task P2-2.1
--
-- Purpose: Enhance edge case tracking with comprehensive feedback loop,
--          deduplication, expert notification, and analytics
--
-- Features:
--   - SHA-256 signature-based deduplication
--   - Comprehensive priority scoring (frequency + recency + severity + impact)
--   - Expert notification queue with SLA tracking
--   - Complete feedback loop workflow (NEW → INVESTIGATING → RESOLVED → CLOSED)
--   - Resolution tracking and verification
--   - Analytics views for monitoring and reporting

-- Enhanced edge cases table for feedback loop
CREATE TABLE IF NOT EXISTS edge_case_tracker (
    -- Unique identifier
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

    -- Deduplication signature (SHA-256 of type + normalized context)
    signature TEXT NOT NULL UNIQUE,

    -- Classification
    type TEXT NOT NULL CHECK(type IN (
        'syntax_error',
        'logic_error',
        'timeout',
        'data_validation',
        'system_error'
    )),

    category TEXT NOT NULL CHECK(category IN (
        'skill_execution',
        'database_operation',
        'coordination',
        'file_operation',
        'api_call'
    )),

    -- Priority (calculated based on frequency, recency, severity, impact)
    priority TEXT NOT NULL CHECK(priority IN (
        'critical',  -- Blocking production
        'high',      -- Frequent occurrence
        'medium',    -- Occasional
        'low'        -- Rare
    )),

    -- Error context (JSON with error details, normalized for deduplication)
    context TEXT NOT NULL,

    -- Feedback loop workflow status
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN (
        'new',
        'investigating',
        'resolved',
        'closed',
        'wont_fix'
    )),

    -- Temporal tracking
    first_occurred DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_occurred DATETIME DEFAULT CURRENT_TIMESTAMP,
    occurrence_count INTEGER DEFAULT 1,

    -- Expert assignment and resolution
    assigned_expert TEXT,
    investigation_started_at DATETIME,
    resolved_at DATETIME,
    resolution TEXT,  -- JSON with resolution details

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Edge case occurrences (for frequency tracking)
CREATE TABLE IF NOT EXISTS edge_case_occurrences (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    edge_case_id TEXT NOT NULL,
    occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    context_snapshot TEXT,  -- JSON snapshot of context at occurrence time

    FOREIGN KEY (edge_case_id) REFERENCES edge_case_tracker(id) ON DELETE CASCADE
);

-- Edge case resolutions (for resolution workflow tracking)
CREATE TABLE IF NOT EXISTS edge_case_resolutions (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    edge_case_id TEXT NOT NULL,

    -- Resolution details
    description TEXT NOT NULL,
    fixed_in_commit TEXT,
    verification_test TEXT,
    notes TEXT,

    -- Workflow tracking
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (edge_case_id) REFERENCES edge_case_tracker(id) ON DELETE CASCADE
);

-- Expert notifications (for <1h SLA tracking)
CREATE TABLE IF NOT EXISTS edge_case_notifications (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    edge_case_id TEXT NOT NULL,

    -- Notification details
    priority TEXT NOT NULL,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,

    -- Delivery tracking
    channel TEXT NOT NULL CHECK(channel IN ('slack', 'email')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,
    delivery_status TEXT CHECK(delivery_status IN ('pending', 'sent', 'failed')),

    -- SLA tracking (notifications should be sent within 1 hour)
    sla_breach BOOLEAN GENERATED ALWAYS AS (
        sent_at IS NULL AND
        (julianday('now') - julianday(created_at)) * 24 > 1
    ) STORED,

    FOREIGN KEY (edge_case_id) REFERENCES edge_case_tracker(id) ON DELETE CASCADE
);

-- Indexes for performance (<100ms recording, <50ms deduplication, <500ms analytics)

-- Deduplication: Fast signature lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_edge_case_tracker_signature
    ON edge_case_tracker(signature);

-- Priority queries
CREATE INDEX IF NOT EXISTS idx_edge_case_tracker_priority_status
    ON edge_case_tracker(priority, status);

-- Temporal queries (recent edge cases)
CREATE INDEX IF NOT EXISTS idx_edge_case_tracker_last_occurred
    ON edge_case_tracker(last_occurred DESC);

-- Frequency queries
CREATE INDEX IF NOT EXISTS idx_edge_case_tracker_occurrence_count
    ON edge_case_tracker(occurrence_count DESC);

-- Category and type analytics
CREATE INDEX IF NOT EXISTS idx_edge_case_tracker_category
    ON edge_case_tracker(category, status);

CREATE INDEX IF NOT EXISTS idx_edge_case_tracker_type
    ON edge_case_tracker(type, status);

-- Expert assignment tracking
CREATE INDEX IF NOT EXISTS idx_edge_case_tracker_assigned_expert
    ON edge_case_tracker(assigned_expert)
    WHERE assigned_expert IS NOT NULL;

-- Resolution tracking
CREATE INDEX IF NOT EXISTS idx_edge_case_tracker_resolved
    ON edge_case_tracker(resolved_at)
    WHERE resolved_at IS NOT NULL;

-- Notification SLA tracking
CREATE INDEX IF NOT EXISTS idx_edge_case_notifications_sla
    ON edge_case_notifications(created_at, sent_at)
    WHERE sent_at IS NULL;

-- Occurrence temporal index
CREATE INDEX IF NOT EXISTS idx_edge_case_occurrences_time
    ON edge_case_occurrences(edge_case_id, occurred_at DESC);

-- Analytics Views

-- View: Top edge cases by frequency
CREATE VIEW IF NOT EXISTS v_top_edge_cases_by_frequency AS
SELECT
    id,
    signature,
    type,
    category,
    priority,
    occurrence_count,
    status,
    last_occurred,
    assigned_expert
FROM edge_case_tracker
WHERE status NOT IN ('closed', 'wont_fix')
ORDER BY occurrence_count DESC, last_occurred DESC
LIMIT 100;

-- View: Edge cases by priority
CREATE VIEW IF NOT EXISTS v_edge_cases_by_priority AS
SELECT
    priority,
    COUNT(*) as total_cases,
    SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_cases,
    SUM(CASE WHEN status = 'investigating' THEN 1 ELSE 0 END) as investigating_cases,
    SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_cases,
    SUM(occurrence_count) as total_occurrences
FROM edge_case_tracker
GROUP BY priority;

-- View: Edge cases by category
CREATE VIEW IF NOT EXISTS v_edge_cases_by_category AS
SELECT
    category,
    COUNT(*) as total_cases,
    SUM(occurrence_count) as total_occurrences,
    AVG(occurrence_count) as avg_occurrences,
    MAX(last_occurred) as most_recent
FROM edge_case_tracker
WHERE status NOT IN ('closed', 'wont_fix')
GROUP BY category;

-- View: Edge cases by type
CREATE VIEW IF NOT EXISTS v_edge_cases_by_type AS
SELECT
    type,
    COUNT(*) as total_cases,
    SUM(occurrence_count) as total_occurrences,
    AVG(occurrence_count) as avg_occurrences,
    MAX(last_occurred) as most_recent
FROM edge_case_tracker
WHERE status NOT IN ('closed', 'wont_fix')
GROUP BY type;

-- View: Resolution analytics (SLA tracking)
CREATE VIEW IF NOT EXISTS v_edge_case_resolution_analytics AS
SELECT
    ect.id,
    ect.type,
    ect.category,
    ect.priority,
    ect.status,
    ect.first_occurred,
    ect.investigation_started_at,
    ect.resolved_at,

    -- Time to investigation (hours)
    CAST((julianday(ect.investigation_started_at) - julianday(ect.first_occurred)) * 24 AS REAL) as hours_to_investigation,

    -- Time to resolution (hours)
    CAST((julianday(ect.resolved_at) - julianday(ect.first_occurred)) * 24 AS REAL) as hours_to_resolution,

    -- SLA compliance (critical: <4h, high: <24h, medium: <72h, low: <168h)
    CASE
        WHEN ect.priority = 'critical' AND ect.resolved_at IS NOT NULL AND
             (julianday(ect.resolved_at) - julianday(ect.first_occurred)) * 24 <= 4 THEN 'met'
        WHEN ect.priority = 'high' AND ect.resolved_at IS NOT NULL AND
             (julianday(ect.resolved_at) - julianday(ect.first_occurred)) * 24 <= 24 THEN 'met'
        WHEN ect.priority = 'medium' AND ect.resolved_at IS NOT NULL AND
             (julianday(ect.resolved_at) - julianday(ect.first_occurred)) * 24 <= 72 THEN 'met'
        WHEN ect.priority = 'low' AND ect.resolved_at IS NOT NULL AND
             (julianday(ect.resolved_at) - julianday(ect.first_occurred)) * 24 <= 168 THEN 'met'
        WHEN ect.resolved_at IS NULL THEN 'pending'
        ELSE 'breached'
    END as sla_status,

    ect.assigned_expert,
    ect.occurrence_count
FROM edge_case_tracker ect
WHERE ect.status IN ('investigating', 'resolved', 'closed');

-- View: Notification SLA compliance
CREATE VIEW IF NOT EXISTS v_notification_sla_compliance AS
SELECT
    DATE(created_at) as notification_date,
    COUNT(*) as total_notifications,
    SUM(CASE WHEN sent_at IS NOT NULL THEN 1 ELSE 0 END) as sent_notifications,
    SUM(CASE WHEN sla_breach = 1 THEN 1 ELSE 0 END) as sla_breaches,
    CAST(SUM(CASE WHEN sla_breach = 0 AND sent_at IS NOT NULL THEN 1 ELSE 0 END) AS REAL) /
        CAST(COUNT(*) AS REAL) * 100 as sla_compliance_percentage
FROM edge_case_notifications
GROUP BY DATE(created_at)
ORDER BY notification_date DESC;

-- View: Overall analytics dashboard
CREATE VIEW IF NOT EXISTS v_edge_case_dashboard AS
SELECT
    -- Totals
    COUNT(*) as total_cases,
    SUM(occurrence_count) as total_occurrences,

    -- By status
    SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_cases,
    SUM(CASE WHEN status = 'investigating' THEN 1 ELSE 0 END) as investigating_cases,
    SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_cases,
    SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_cases,

    -- Resolution rate
    CAST(SUM(CASE WHEN status IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS REAL) /
        CAST(COUNT(*) AS REAL) * 100 as resolution_rate_percentage,

    -- Average resolution time (hours) for resolved cases
    AVG(CASE
        WHEN resolved_at IS NOT NULL
        THEN (julianday(resolved_at) - julianday(first_occurred)) * 24
        ELSE NULL
    END) as avg_resolution_time_hours,

    -- By priority
    SUM(CASE WHEN priority = 'critical' THEN 1 ELSE 0 END) as critical_cases,
    SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_cases,
    SUM(CASE WHEN priority = 'medium' THEN 1 ELSE 0 END) as medium_cases,
    SUM(CASE WHEN priority = 'low' THEN 1 ELSE 0 END) as low_cases
FROM edge_case_tracker;

-- Trigger: Update last_occurred timestamp on duplicate detection
CREATE TRIGGER IF NOT EXISTS trg_edge_case_update_last_occurred
AFTER UPDATE OF occurrence_count ON edge_case_tracker
FOR EACH ROW
BEGIN
    UPDATE edge_case_tracker
    SET last_occurred = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- Trigger: Update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trg_edge_case_update_timestamp
AFTER UPDATE ON edge_case_tracker
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE edge_case_tracker
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- Trigger: Auto-set investigation_started_at when status changes to investigating
CREATE TRIGGER IF NOT EXISTS trg_edge_case_investigation_started
AFTER UPDATE OF status ON edge_case_tracker
FOR EACH ROW
WHEN NEW.status = 'investigating' AND OLD.status != 'investigating'
BEGIN
    UPDATE edge_case_tracker
    SET investigation_started_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id AND investigation_started_at IS NULL;
END;

-- Trigger: Auto-set resolved_at when status changes to resolved
CREATE TRIGGER IF NOT EXISTS trg_edge_case_resolved
AFTER UPDATE OF status ON edge_case_tracker
FOR EACH ROW
WHEN NEW.status = 'resolved' AND OLD.status != 'resolved'
BEGIN
    UPDATE edge_case_tracker
    SET resolved_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id AND resolved_at IS NULL;
END;

-- Migration metadata
INSERT OR IGNORE INTO schema_migrations (version, description, applied_at)
VALUES (
    '009',
    'Edge Case Feedback Loop Enhancement - deduplication, notifications, analytics',
    CURRENT_TIMESTAMP
);

-- Performance note:
-- Expected performance targets:
--   - Edge case recording: <100ms
--   - Deduplication check: <50ms (via UNIQUE INDEX on signature)
--   - Notification delivery: <1h (tracked via sla_breach column)
--   - Analytics query: <500ms (via pre-computed views)
