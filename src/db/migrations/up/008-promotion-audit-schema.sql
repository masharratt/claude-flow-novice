/**
 * Migration: Promotion Pipeline Audit Schema
 *
 * Creates tables for tracking skill promotions, stages, audit trails, and rollbacks.
 * Supports the automated promotion pipeline with approval gates and rollback capability.
 *
 * Tables:
 * - promotions: Track each promotion request and its status
 * - promotion_stages: Track individual stage results (validate, test, approve, deploy)
 * - promotion_audit: Comprehensive audit trail of all actions
 * - promotion_rollbacks: Track rollback operations
 */

-- Promotions table: Track promotion requests and results
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id TEXT NOT NULL UNIQUE,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  -- Status values: pending, validating, testing, awaiting-approval, approved, deploying, completed, failed, rolled-back
  approved_by TEXT,
  requested_by TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_promotions_skill_id
    FOREIGN KEY (skill_id) REFERENCES skills(id)
);

CREATE INDEX IF NOT EXISTS idx_promotions_skill_id ON promotions(skill_id);
CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);
CREATE INDEX IF NOT EXISTS idx_promotions_created_at ON promotions(created_at);
CREATE INDEX IF NOT EXISTS idx_promotions_requested_by ON promotions(requested_by);

-- Promotion stages: Track individual stage execution and results
CREATE TABLE IF NOT EXISTS promotion_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id INTEGER NOT NULL,
  stage TEXT NOT NULL,
  -- Stage values: validate, test, approve, deploy
  status TEXT NOT NULL DEFAULT 'pending',
  -- Status values: pending, running, passed, failed
  result_message TEXT,
  duration_ms INTEGER,
  confidence_score REAL,
  -- Confidence: 0.0 to 1.0
  started_at TEXT,
  completed_at TEXT,

  CONSTRAINT fk_promotion_stages_promotion_id
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promotion_stages_promotion_id ON promotion_stages(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_stages_stage ON promotion_stages(stage);
CREATE INDEX IF NOT EXISTS idx_promotion_stages_status ON promotion_stages(status);

-- Comprehensive audit trail: Track all actions with full context
CREATE TABLE IF NOT EXISTS promotion_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id INTEGER NOT NULL,
  skill_id TEXT NOT NULL,
  action TEXT NOT NULL,
  -- Action values: promote, validate, test, approve, deploy, rollback, promote-failed, notify
  actor TEXT NOT NULL,
  -- Actor: username, 'system', or service name
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details TEXT,
  -- JSON-encoded details: {reason, confidence, stage, error, approvedBy, autoApproved, etc}

  CONSTRAINT fk_promotion_audit_promotion_id
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promotion_audit_promotion_id ON promotion_audit(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_audit_skill_id ON promotion_audit(skill_id);
CREATE INDEX IF NOT EXISTS idx_promotion_audit_action ON promotion_audit(action);
CREATE INDEX IF NOT EXISTS idx_promotion_audit_actor ON promotion_audit(actor);
CREATE INDEX IF NOT EXISTS idx_promotion_audit_timestamp ON promotion_audit(timestamp);

-- Rollback tracking: Record rollback operations and their justification
CREATE TABLE IF NOT EXISTS promotion_rollbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id INTEGER NOT NULL,
  skill_id TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  reason TEXT NOT NULL,
  rolled_back_by TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_promotion_rollbacks_promotion_id
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promotion_rollbacks_skill_id ON promotion_rollbacks(skill_id);
CREATE INDEX IF NOT EXISTS idx_promotion_rollbacks_timestamp ON promotion_rollbacks(timestamp);

-- SLA tracking: Monitor time from submission to promotion
CREATE TABLE IF NOT EXISTS promotion_sla_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id INTEGER NOT NULL,
  skill_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  auto_approved_at TEXT,
  manually_approved_at TEXT,
  deployed_at TEXT,

  -- SLA thresholds (in seconds)
  auto_approval_threshold_sec INTEGER DEFAULT 60,
  total_sla_threshold_sec INTEGER DEFAULT 300,

  -- Calculated metrics
  auto_approval_time_sec INTEGER,
  total_time_sec INTEGER,
  sla_breach BOOLEAN DEFAULT 0,

  CONSTRAINT fk_promotion_sla_promotion_id
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promotion_sla_skill_id ON promotion_sla_tracking(skill_id);
CREATE INDEX IF NOT EXISTS idx_promotion_sla_submitted_at ON promotion_sla_tracking(submitted_at);
CREATE INDEX IF NOT EXISTS idx_promotion_sla_breach ON promotion_sla_tracking(sla_breach);

-- Notification tracking: Track notifications sent during promotion
CREATE TABLE IF NOT EXISTS promotion_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id INTEGER NOT NULL,
  skill_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  -- Event types: submitted, validated, tested, approved, deployed, failed, rolled-back
  notification_channel TEXT NOT NULL,
  -- Channels: slack, email, webhook, internal
  notification_payload TEXT,
  -- JSON-encoded notification details
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivery_status TEXT DEFAULT 'sent',
  -- Status: pending, sent, failed, acknowledged
  error_message TEXT,

  CONSTRAINT fk_promotion_notifications_promotion_id
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promotion_notifications_promotion_id ON promotion_notifications(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_notifications_event_type ON promotion_notifications(event_type);
CREATE INDEX IF NOT EXISTS idx_promotion_notifications_sent_at ON promotion_notifications(sent_at);

-- Approval gate history: Track approval gate decisions and reasoning
CREATE TABLE IF NOT EXISTS promotion_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id INTEGER NOT NULL,
  skill_id TEXT NOT NULL,
  approval_type TEXT NOT NULL,
  -- Type: auto, manual, override
  approval_status TEXT NOT NULL,
  -- Status: approved, rejected, pending
  approved_by TEXT,
  approval_reason TEXT,
  confidence_threshold REAL,
  actual_confidence REAL,
  approved_at TEXT,

  CONSTRAINT fk_promotion_approvals_promotion_id
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promotion_approvals_promotion_id ON promotion_approvals(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_approvals_approval_type ON promotion_approvals(approval_type);
CREATE INDEX IF NOT EXISTS idx_promotion_approvals_approved_at ON promotion_approvals(approved_at);

-- Test execution results: Detailed test results for traceability
CREATE TABLE IF NOT EXISTS promotion_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  promotion_id INTEGER NOT NULL,
  skill_id TEXT NOT NULL,
  test_suite TEXT,
  test_name TEXT,
  test_status TEXT,
  -- Status: passed, failed, skipped, error
  duration_ms INTEGER,
  coverage_percentage REAL,
  error_message TEXT,
  stdout_output TEXT,
  stderr_output TEXT,
  executed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_promotion_test_results_promotion_id
    FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_promotion_test_results_promotion_id ON promotion_test_results(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_test_results_test_status ON promotion_test_results(test_status);

-- Trigger: Update promotion updated_at timestamp
CREATE TRIGGER IF NOT EXISTS trg_promotions_update_timestamp
AFTER UPDATE ON promotions
BEGIN
  UPDATE promotions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
