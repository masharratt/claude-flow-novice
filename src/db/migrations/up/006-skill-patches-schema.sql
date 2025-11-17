-- Migration 006: Skill Patches Schema
-- Part of Task 5.1: Edge Case Analyzer & Skill Patcher
--
-- Creates tables for edge case analysis and patch management:
-- - edge_cases: Failure tracking with pattern detection
-- - skill_patches: Patch proposals with approval workflow
-- - patch_validations: Validation results and metrics
--
-- Features:
-- - Pattern-based failure grouping
-- - Confidence-based patch filtering
-- - Manual approval workflow (PENDING_UPDATE status)
-- - Comprehensive audit trail
-- - Performance indexes for common queries
--
-- Applied: 2025-11-16

-- ============================================================================
-- Edge Cases Table
-- ============================================================================
-- Tracks all detected edge cases with categorization and pattern detection

CREATE TABLE IF NOT EXISTS edge_cases (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'SYNTAX_ERROR',
    'LOGIC_ERROR',
    'TIMEOUT',
    'VALIDATION_ERROR',
    'UNKNOWN'
  )),
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  context TEXT, -- JSON string with additional context
  detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
  pattern_hash TEXT NOT NULL, -- Hash for grouping similar failures
  confidence REAL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_edge_cases_skill ON edge_cases(skill_id);
CREATE INDEX IF NOT EXISTS idx_edge_cases_category ON edge_cases(category);
CREATE INDEX IF NOT EXISTS idx_edge_cases_pattern ON edge_cases(pattern_hash);
CREATE INDEX IF NOT EXISTS idx_edge_cases_detected ON edge_cases(detected_at);
CREATE INDEX IF NOT EXISTS idx_edge_cases_confidence ON edge_cases(confidence DESC);

-- Composite index for common pattern matching queries
CREATE INDEX IF NOT EXISTS idx_edge_cases_skill_category ON edge_cases(skill_id, category);

-- ============================================================================
-- Skill Patches Table
-- ============================================================================
-- Stores patch proposals with approval workflow and deployment tracking

CREATE TABLE IF NOT EXISTS skill_patches (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  failure_id TEXT NOT NULL, -- References edge_cases.id
  category TEXT NOT NULL CHECK (category IN (
    'SYNTAX_ERROR',
    'LOGIC_ERROR',
    'TIMEOUT',
    'VALIDATION_ERROR',
    'UNKNOWN'
  )),
  patch_content TEXT NOT NULL, -- The actual patch code
  confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  status TEXT DEFAULT 'PENDING_UPDATE' CHECK (status IN (
    'PENDING_UPDATE', -- Awaiting manual approval (Phase 1)
    'APPROVED',        -- Approved for deployment
    'DEPLOYED',        -- Successfully deployed
    'REJECTED',        -- Rejected by reviewer
    'ROLLED_BACK'      -- Deployed but rolled back due to issues
  )),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  approved_by TEXT, -- Agent or user who approved the patch
  deployed_at TEXT, -- When patch was deployed
  success INTEGER, -- Boolean: 1 if deployment succeeded, 0 if failed, NULL if not yet deployed
  rollback_reason TEXT, -- Reason for rollback if status = 'ROLLED_BACK'

  -- Foreign key constraint (logical, not enforced by SQLite)
  -- FOREIGN KEY (failure_id) REFERENCES edge_cases(id)

  CONSTRAINT confidence_threshold CHECK (
    -- Only allow high-confidence patches (≥0.85)
    confidence >= 0.85
  )
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_skill_patches_skill ON skill_patches(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_patches_failure ON skill_patches(failure_id);
CREATE INDEX IF NOT EXISTS idx_skill_patches_status ON skill_patches(status);
CREATE INDEX IF NOT EXISTS idx_skill_patches_confidence ON skill_patches(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_skill_patches_created ON skill_patches(created_at);
CREATE INDEX IF NOT EXISTS idx_skill_patches_deployed ON skill_patches(deployed_at);

-- Composite index for pending patches query
CREATE INDEX IF NOT EXISTS idx_skill_patches_pending ON skill_patches(status, confidence DESC)
WHERE status = 'PENDING_UPDATE';

-- ============================================================================
-- Patch Validations Table
-- ============================================================================
-- Tracks validation results for patches (dry-run testing)

CREATE TABLE IF NOT EXISTS patch_validations (
  id TEXT PRIMARY KEY,
  patch_id TEXT NOT NULL, -- References skill_patches.id
  status TEXT NOT NULL CHECK (status IN (
    'SUCCESS',
    'FAILED',
    'SKIPPED'
  )),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0), -- Validation duration
  error_message TEXT, -- Error details if validation failed
  validated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key constraint (logical, not enforced by SQLite)
  -- FOREIGN KEY (patch_id) REFERENCES skill_patches(id)

  CONSTRAINT performance_check CHECK (
    -- Ensure validations complete within reasonable time (10s max)
    duration_ms <= 10000
  )
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_patch_validations_patch ON patch_validations(patch_id);
CREATE INDEX IF NOT EXISTS idx_patch_validations_status ON patch_validations(status);
CREATE INDEX IF NOT EXISTS idx_patch_validations_validated ON patch_validations(validated_at);

-- Composite index for patch validation lookup
CREATE INDEX IF NOT EXISTS idx_patch_validations_patch_status ON patch_validations(patch_id, status);

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- High-confidence pending patches ready for review
CREATE VIEW IF NOT EXISTS pending_high_confidence_patches AS
SELECT
  sp.*,
  ec.error_message,
  ec.category as failure_category,
  pv.status as validation_status,
  pv.validated_at
FROM skill_patches sp
LEFT JOIN edge_cases ec ON sp.failure_id = ec.id
LEFT JOIN patch_validations pv ON sp.id = pv.patch_id
WHERE sp.status = 'PENDING_UPDATE'
  AND sp.confidence >= 0.90
ORDER BY sp.confidence DESC, sp.created_at ASC;

-- Failure pattern summary by skill
CREATE VIEW IF NOT EXISTS failure_patterns_by_skill AS
SELECT
  skill_id,
  category,
  pattern_hash,
  COUNT(*) as failure_count,
  AVG(confidence) as avg_confidence,
  MIN(detected_at) as first_seen,
  MAX(detected_at) as last_seen
FROM edge_cases
GROUP BY skill_id, category, pattern_hash
HAVING failure_count > 1
ORDER BY failure_count DESC;

-- Patch deployment success rate
CREATE VIEW IF NOT EXISTS patch_deployment_stats AS
SELECT
  skill_id,
  COUNT(*) as total_patches,
  SUM(CASE WHEN status = 'DEPLOYED' THEN 1 ELSE 0 END) as deployed_count,
  SUM(CASE WHEN status = 'ROLLED_BACK' THEN 1 ELSE 0 END) as rollback_count,
  SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
  ROUND(AVG(confidence), 2) as avg_confidence
FROM skill_patches
GROUP BY skill_id;

-- ============================================================================
-- Migration Metadata
-- ============================================================================

-- Track migration application
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO schema_migrations (version, name)
VALUES (6, '006-skill-patches-schema');
