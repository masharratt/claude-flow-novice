-- ============================================================================
-- Dynamic Skills Database Schema v2.0
-- Three-Tier Approval Workflow Integration & Phase 4 Codification
-- ============================================================================
-- Version: 2.0.0
-- Status: Production Ready
-- Date: 2025-11-16
-- Branch: claude/review-skills-db-plan-015DJZLrjxcfs4VuSn7d4Fon
-- ============================================================================

-- ============================================================================
-- 1. SKILLS TABLE (ENHANCED WITH APPROVAL WORKFLOW)
-- ============================================================================
-- Core skill metadata with approval workflow, Phase 4 integration, and TDD support

CREATE TABLE IF NOT EXISTS skills (
  -- Primary Key and Identity
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Core Metadata (from v1)
  name TEXT UNIQUE NOT NULL,                      -- Skill identifier: 'coordination-protocol-v2'
  category TEXT NOT NULL,                         -- coordination, testing, infrastructure, domain, foundation
  team TEXT,                                      -- cfn, marketing, data-eng, foundation
  content_path TEXT NOT NULL,                     -- Filesystem path: '.claude/skills/coordination/SKILL.md'
  content_hash TEXT NOT NULL,                     -- SHA256 hash for integrity validation
  tags TEXT,                                      -- JSON array: ["redis", "async", "coordination"]
  version TEXT NOT NULL,                          -- Semantic version: "2.1.0"
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'deprecated', 'archived')),

  -- Approval Workflow Integration (NEW)
  approval_level TEXT NOT NULL DEFAULT 'human'
    CHECK(approval_level IN ('auto', 'escalate', 'human')),
  approval_criteria TEXT,                         -- JSON: {"risk_score": 0.3, "test_coverage": 0.8, "security_review": false}
  last_approved_by TEXT,                          -- 'system' or 'expert@example.com'
  last_approval_date TEXT,                        -- ISO 8601 timestamp of last approval

  -- TDD Integration (NEW)
  test_coverage REAL,                             -- 0.0-1.0: percentage of code covered by tests
  test_suite_path TEXT,                           -- Path to test file: '.claude/skills/coordination/test.sh'
  required_test_pass_rate REAL DEFAULT 0.95,     -- 0.0-1.0: required test pass rate for auto approval

  -- Phase 4 Workflow Codification Integration (NEW)
  phase4_pattern_id INTEGER,                      -- Reference to PostgreSQL workflow_patterns.id
  generated_by TEXT,                              -- 'phase4' | 'manual' | 'imported'
  is_auto_generated BOOLEAN DEFAULT 0,            -- 1 if generated from Phase 4 pattern

  -- Lifecycle Management
  deprecation_note TEXT,                          -- Reason for deprecation
  replacement_id INTEGER,                         -- Self-reference to replacement skill
  owner TEXT,                                     -- Team/person responsible
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Foreign Key Constraints
  FOREIGN KEY (replacement_id) REFERENCES skills(id) ON DELETE SET NULL
);

-- ============================================================================
-- 2. APPROVAL HISTORY TABLE (NEW)
-- ============================================================================
-- Complete audit trail of all approval decisions

CREATE TABLE IF NOT EXISTS approval_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- References
  skill_id INTEGER NOT NULL,

  -- Approval Metadata
  version TEXT NOT NULL,                          -- Skill version when approved
  approval_level TEXT NOT NULL
    CHECK(approval_level IN ('auto', 'escalate', 'human')),

  -- Decision Information
  approver TEXT,                                  -- 'system' | 'expert-email@example.com'
  decision TEXT NOT NULL
    CHECK(decision IN ('approved', 'rejected', 'escalated', 'needs_correction')),
  reasoning TEXT,                                 -- Why this decision was made

  -- Assessment Data (JSON format for flexibility)
  risk_assessment TEXT,                           -- JSON: {"security": "low", "complexity": "medium", "maintainability": "high"}
  test_results TEXT,                              -- JSON: {"pass_count": 45, "fail_count": 0, "pass_rate": 1.0}
  approval_criteria_check TEXT,                   -- JSON: {"risk_score": {"required": 0.3, "actual": 0.25}, "test_coverage": ...}

  -- Escalation Information
  escalation_reason TEXT,                         -- If decision is 'escalated', explain why
  escalated_to TEXT,                              -- Who/what received the escalation
  escalation_timestamp TEXT,                      -- When escalation occurred

  -- Timing
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  review_duration_minutes INTEGER,                -- How long review took

  -- Foreign Key Constraints
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_approval_history_skill ON approval_history(skill_id);
CREATE INDEX IF NOT EXISTS idx_approval_history_timestamp ON approval_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_approval_history_decision ON approval_history(decision);

-- ============================================================================
-- 3. APPROVAL CRITERIA TEMPLATES TABLE (NEW)
-- ============================================================================
-- Reusable approval criteria definitions for different skill types

CREATE TABLE IF NOT EXISTS approval_criteria_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Template Identification
  approval_level TEXT NOT NULL
    CHECK(approval_level IN ('auto', 'escalate', 'human')),
  category TEXT NOT NULL,                         -- coordination, testing, infrastructure, domain, foundation

  -- Criteria Definition
  criteria_json TEXT NOT NULL,                    -- JSON format allows flexibility
  description TEXT NOT NULL,                      -- Human-readable explanation

  -- Template Metadata
  enabled BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Uniqueness Constraint
  UNIQUE(approval_level, category)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_approval_templates_level_category ON approval_criteria_templates(approval_level, category);

-- Seed Data: Auto-Approval Criteria (Low Risk, High Certainty)
INSERT OR IGNORE INTO approval_criteria_templates
  (approval_level, category, criteria_json, description, enabled) VALUES
  ('auto', 'coordination',
   '{"risk_score_max": 0.3, "test_coverage_min": 0.95, "complexity_max": "low", "external_dependencies": false, "requires_security_review": false}',
   'Auto-approve simple coordination skills with high test coverage and no external dependencies',
   1);

INSERT OR IGNORE INTO approval_criteria_templates
  (approval_level, category, criteria_json, description, enabled) VALUES
  ('auto', 'foundation',
   '{"risk_score_max": 0.2, "test_coverage_min": 0.98, "complexity_max": "low", "external_dependencies": false, "requires_security_review": false}',
   'Auto-approve bootstrap foundation skills with minimal risk profile',
   1);

INSERT OR IGNORE INTO approval_criteria_templates
  (approval_level, category, criteria_json, description, enabled) VALUES
  ('auto', 'testing',
   '{"risk_score_max": 0.25, "test_coverage_min": 0.90, "complexity_max": "low", "external_dependencies": false}',
   'Auto-approve testing utilities with comprehensive test coverage',
   1);

-- Seed Data: Escalation Criteria (Medium Risk, Requires Review)
INSERT OR IGNORE INTO approval_criteria_templates
  (approval_level, category, criteria_json, description, enabled) VALUES
  ('escalate', 'infrastructure',
   '{"risk_score_min": 0.3, "external_api_calls": true, "resource_provisioning": true, "security_review_required": true, "requires_expert_validation": true}',
   'Escalate infrastructure skills with external dependencies to expert review',
   1);

INSERT OR IGNORE INTO approval_criteria_templates
  (approval_level, category, criteria_json, description, enabled) VALUES
  ('escalate', 'domain',
   '{"complexity_min": "medium", "business_logic": true, "affects_multiple_teams": true, "requires_expert_validation": true}',
   'Escalate domain-specific skills affecting multiple teams',
   1);

INSERT OR IGNORE INTO approval_criteria_templates
  (approval_level, category, criteria_json, description, enabled) VALUES
  ('escalate', 'coordination',
   '{"risk_score_min": 0.3, "complexity_min": "medium", "affects_loop_orchestration": true, "requires_expert_validation": true}',
   'Escalate complex coordination skills that affect loop orchestration',
   1);

-- Seed Data: Human Review Criteria (High Risk, Mandatory Review)
INSERT OR IGNORE INTO approval_criteria_templates
  (approval_level, category, criteria_json, description, enabled) VALUES
  ('human', 'domain',
   '{"complexity_min": "high", "business_logic": true, "affects_revenue": true, "requires_human_review": true}',
   'Require human expert review for high-complexity business logic',
   1);

INSERT OR IGNORE INTO approval_criteria_templates
  (approval_level, category, criteria_json, description, enabled) VALUES
  ('human', 'infrastructure',
   '{"risk_score_min": 0.6, "affects_production": true, "disaster_recovery_impact": true, "requires_human_review": true}',
   'Require human review for high-risk infrastructure skills affecting production',
   1);

INSERT OR IGNORE INTO approval_criteria_templates
  (approval_level, category, criteria_json, description, enabled) VALUES
  ('human', 'coordination',
   '{"phase4_generated": true, "is_edge_case_skill": true, "affects_swarm_recovery": true, "requires_human_review": true}',
   'Require human review for Phase 4-generated skills handling edge cases',
   1);

-- ============================================================================
-- 4. AGENT SKILL MAPPINGS TABLE
-- ============================================================================
-- Maps skills to agent types with priority and conditional loading

CREATE TABLE IF NOT EXISTS agent_skill_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- References
  agent_type TEXT NOT NULL,                       -- 'backend-developer', 'tester', 'cfn-orchestrator', etc.
  skill_id INTEGER NOT NULL,

  -- Priority and Requirement
  priority INTEGER NOT NULL DEFAULT 5,            -- 1-10 (1=highest priority, loaded first)
  required BOOLEAN NOT NULL DEFAULT 0,            -- 1=required always, 0=optional

  -- Conditional Loading (TDD-Aware)
  conditions TEXT,                                -- JSON: {"taskContext": ["auth"], "phase": ["loop3"], "test_context": true}
  tdd_condition TEXT,                             -- JSON: {"require_tests": true, "min_coverage": 0.9, "min_pass_rate": 0.95}

  -- Notes and Metadata
  notes TEXT,                                     -- Human-readable explanation
  enabled BOOLEAN NOT NULL DEFAULT 1,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- Foreign Key Constraints
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE,

  -- Uniqueness: Agent can have each skill only once
  UNIQUE(agent_type, skill_id)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_agent_skills_priority ON agent_skill_mappings(agent_type, priority);
CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skill_mappings(skill_id);
CREATE INDEX IF NOT EXISTS idx_agent_skills_agent_type ON agent_skill_mappings(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_skills_required ON agent_skill_mappings(required);

-- ============================================================================
-- 5. SKILL USAGE LOG TABLE (Analytics)
-- ============================================================================
-- Tracks skill execution and effectiveness metrics

CREATE TABLE IF NOT EXISTS skill_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identifiers
  agent_id TEXT NOT NULL,                         -- 'backend-developer-1'
  agent_type TEXT NOT NULL,                       -- 'backend-developer'
  skill_id INTEGER NOT NULL,

  -- Task Context
  task_id TEXT,                                   -- CFN Loop task ID
  phase TEXT,                                     -- 'loop1', 'loop2', 'loop3', 'loop4'

  -- Timing
  loaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  execution_time_ms INTEGER,                      -- Skill loading/execution overhead

  -- Effectiveness Metrics
  confidence_before REAL,                         -- Agent confidence before skill loaded [0.0-1.0]
  confidence_after REAL,                          -- Agent confidence after execution [0.0-1.0]
  success_indicator BOOLEAN,                      -- 1=skill helped, 0=skill didn't help

  -- TDD Integration
  test_suite_executed BOOLEAN,                    -- 1=skill tests were executed
  test_pass_rate REAL,                            -- Test pass rate if executed [0.0-1.0]

  -- Optional Notes
  notes TEXT,                                     -- Additional context or issues

  -- Phase 6.1: Approval Metadata (Enhanced Usage Logging)
  approval_level TEXT,                            -- 'auto', 'escalate', 'human' (from skill at load time)
  phase4_generated INTEGER DEFAULT 0,             -- 1=generated by Phase 4 CLI, 0=manual/imported

  -- Foreign Key Constraints
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_usage_agent_type ON skill_usage_log(agent_type);
CREATE INDEX IF NOT EXISTS idx_usage_skill ON skill_usage_log(skill_id);
CREATE INDEX IF NOT EXISTS idx_usage_task ON skill_usage_log(task_id);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON skill_usage_log(loaded_at);
CREATE INDEX IF NOT EXISTS idx_usage_phase ON skill_usage_log(phase);
CREATE INDEX IF NOT EXISTS idx_usage_agent_id ON skill_usage_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_usage_approval_level ON skill_usage_log(approval_level);
CREATE INDEX IF NOT EXISTS idx_usage_phase4_generated ON skill_usage_log(phase4_generated);

-- ============================================================================
-- 6. BOOTSTRAP SKILLS TABLE (Registry)
-- ============================================================================
-- Core bootstrap skills that load without database access

CREATE TABLE IF NOT EXISTS bootstrap_skills (
  skill_name TEXT PRIMARY KEY,

  -- File Location
  file_path TEXT NOT NULL,                        -- '.claude/skills/bootstrap/database-connection.md'

  -- Load Order
  load_order INTEGER NOT NULL UNIQUE,             -- 1, 2, 3, 4, 5 (execution sequence)

  -- Metadata
  description TEXT NOT NULL,
  approval_level TEXT DEFAULT 'auto',
  enabled BOOLEAN NOT NULL DEFAULT 1,

  -- Integrity
  content_hash TEXT,                              -- SHA256 for integrity validation

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bootstrap_load_order ON bootstrap_skills(load_order);

-- Seed Data: Bootstrap Skills (Static Registry)
INSERT OR IGNORE INTO bootstrap_skills
  (skill_name, file_path, load_order, description, approval_level, enabled) VALUES
  ('database-connection', '.claude/skills/bootstrap/database-connection.md', 1,
   'SQLite connection patterns and transaction management', 'auto', 1);

INSERT OR IGNORE INTO bootstrap_skills
  (skill_name, file_path, load_order, description, approval_level, enabled) VALUES
  ('bash-fundamentals', '.claude/skills/bootstrap/bash-fundamentals.md', 2,
   'Core bash scripting patterns, error handling, strict mode', 'auto', 1);

INSERT OR IGNORE INTO bootstrap_skills
  (skill_name, file_path, load_order, description, approval_level, enabled) VALUES
  ('file-operations', '.claude/skills/bootstrap/file-operations.md', 3,
   'File I/O, path resolution, safe file operations', 'auto', 1);

INSERT OR IGNORE INTO bootstrap_skills
  (skill_name, file_path, load_order, description, approval_level, enabled) VALUES
  ('error-handling', '.claude/skills/bootstrap/error-handling.md', 4,
   'Error handling, exit codes, recovery patterns', 'auto', 1);

INSERT OR IGNORE INTO bootstrap_skills
  (skill_name, file_path, load_order, description, approval_level, enabled) VALUES
  ('skill-loader', '.claude/skills/bootstrap/skill-loader.md', 5,
   'Dynamic skill loading from database, caching mechanisms', 'auto', 1);

-- ============================================================================
-- 7. PHASE 4 WORKFLOW INTEGRATION TABLE
-- ============================================================================
-- Links Phase 4-generated skills to their source workflow patterns

CREATE TABLE IF NOT EXISTS phase4_skill_generation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Reference to Skills Table
  skill_id INTEGER NOT NULL UNIQUE,

  -- Phase 4 Pattern Information
  phase4_pattern_id INTEGER,                      -- Reference to PostgreSQL: workflow_patterns.id
  pattern_name TEXT,                              -- Name from Phase 4 pattern detection

  -- Generation Metadata
  generated_by TEXT,                              -- Agent/user who initiated generation
  generated_at TEXT DEFAULT (datetime('now')),

  -- Generation Source
  source_reflection_ids TEXT,                     -- JSON array of reflection UUIDs from Phase 2
  edge_cases_tracked INTEGER DEFAULT 0,           -- Number of edge cases currently tracked

  -- Status Tracking
  generation_status TEXT
    CHECK(generation_status IN ('generated', 'approved', 'deployed', 'archived')),
  deployment_timestamp TEXT,                      -- When skill was deployed to production

  -- Version Control
  skill_version TEXT,                             -- Version when deployed
  github_pr_id TEXT,                              -- Link to PR if tracked in GitHub

  -- Foreign Key Constraints
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_phase4_skill ON phase4_skill_generation(skill_id);
CREATE INDEX IF NOT EXISTS idx_phase4_pattern ON phase4_skill_generation(phase4_pattern_id);
CREATE INDEX IF NOT EXISTS idx_phase4_status ON phase4_skill_generation(generation_status);

-- ============================================================================
-- 8. EDGE CASE TRACKING TABLE
-- ============================================================================
-- Tracks edge cases encountered during Phase 4-generated skill execution

CREATE TABLE IF NOT EXISTS edge_case_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- References
  skill_id INTEGER NOT NULL,

  -- Edge Case Information
  edge_case_description TEXT NOT NULL,
  failure_reason TEXT,
  input_parameters TEXT,                          -- JSON format
  expected_output TEXT,
  actual_output TEXT,

  -- Severity and Resolution
  severity TEXT CHECK(severity IN ('low', 'medium', 'high')),
  resolved BOOLEAN DEFAULT 0,
  resolution_notes TEXT,

  -- Skill Update Proposal
  proposed_fix TEXT,                              -- JSON: skill update proposal
  requires_approval BOOLEAN DEFAULT 1,

  -- Timestamps
  detected_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,

  -- Foreign Key Constraints
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edge_case_skill ON edge_case_tracking(skill_id);
CREATE INDEX IF NOT EXISTS idx_edge_case_resolved ON edge_case_tracking(resolved);
CREATE INDEX IF NOT EXISTS idx_edge_case_severity ON edge_case_tracking(severity);

-- ============================================================================
-- 9. KEY INDEXES FOR QUERY PERFORMANCE
-- ============================================================================

-- Skills Table Indexes
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_team ON skills(team);
CREATE INDEX IF NOT EXISTS idx_skills_approval_level ON skills(approval_level);
CREATE INDEX IF NOT EXISTS idx_skills_phase4_pattern ON skills(phase4_pattern_id);
CREATE INDEX IF NOT EXISTS idx_skills_generated_by ON skills(generated_by);
CREATE INDEX IF NOT EXISTS idx_skills_owner ON skills(owner);
CREATE INDEX IF NOT EXISTS idx_skills_created_at ON skills(created_at);

-- Composite Index for Common Query: Skills by Category + Status
CREATE INDEX IF NOT EXISTS idx_skills_category_status ON skills(category, status);

-- Composite Index for Common Query: Agent Type + Priority (for skill loading)
CREATE INDEX IF NOT EXISTS idx_agent_mapping_type_priority ON agent_skill_mappings(agent_type, priority);

-- ============================================================================
-- 10. VIEWS FOR COMMON QUERIES
-- ============================================================================

-- NOTE: Views using aggregate functions (COUNT, AVG, MAX) may return NULL values
-- when no rows match the query criteria. Callers should handle NULLs appropriately:
--
-- Example: Using COALESCE for NULL handling
--   SELECT
--     COALESCE(AVG(test_coverage), 0) as avg_coverage,
--     COALESCE(MAX(timestamp), 'N/A') as last_update
--   FROM approval_distribution;
--
-- Example: Using CAST for numeric operations
--   SELECT
--     approval_level,
--     CAST(COALESCE(avg_test_coverage, 0) AS REAL) as coverage
--   FROM approval_distribution;

-- Active Skills with Approval Status
CREATE VIEW IF NOT EXISTS active_skills_with_approval AS
SELECT
  s.id,
  s.name,
  s.category,
  s.team,
  s.version,
  s.approval_level,
  s.last_approved_by,
  s.last_approval_date,
  COUNT(DISTINCT asm.agent_type) as agent_count,
  s.test_coverage,
  MAX(ah.timestamp) as last_approval_timestamp
FROM skills s
LEFT JOIN agent_skill_mappings asm ON s.id = asm.skill_id
LEFT JOIN approval_history ah ON s.id = ah.skill_id AND ah.decision = 'approved'
WHERE s.status = 'active'
GROUP BY s.id, s.name, s.category, s.team, s.version, s.approval_level;

-- Approval Pending Skills
CREATE VIEW IF NOT EXISTS approval_pending_skills AS
SELECT
  s.id,
  s.name,
  s.category,
  s.approval_level,
  s.version,
  s.created_at,
  COUNT(ah.id) as approval_attempts,
  MAX(ah.timestamp) as last_review_date
FROM skills s
LEFT JOIN approval_history ah ON s.id = ah.skill_id
WHERE s.status = 'active'
  AND (
    SELECT COUNT(*)
    FROM approval_history
    WHERE skill_id = s.id AND decision = 'approved'
  ) = 0
GROUP BY s.id, s.name, s.category, s.approval_level, s.version, s.created_at;

-- Skills by Approval Level Distribution
CREATE VIEW IF NOT EXISTS approval_distribution AS
SELECT
  s.approval_level,
  s.category,
  COUNT(*) as skill_count,
  COUNT(DISTINCT s.team) as team_count,
  AVG(s.test_coverage) as avg_test_coverage
FROM skills s
WHERE s.status = 'active'
GROUP BY s.approval_level, s.category;

-- ============================================================================
-- 11. MIGRATION HELPER PROCEDURES
-- ============================================================================
-- Procedures to support migration from v1 to v2

-- Migration Status: Check if v1 data exists
CREATE VIEW IF NOT EXISTS migration_status AS
SELECT
  'skills_table_exists' as check_name,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='skills') as result
UNION ALL
SELECT 'approval_history_exists', (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='approval_history')
UNION ALL
SELECT 'approval_criteria_templates_exists', (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='approval_criteria_templates');

-- ============================================================================
-- 12. SCHEMA METADATA TABLE
-- ============================================================================
-- Track schema versions for migration management

CREATE TABLE IF NOT EXISTS schema_versions (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  rolled_back_at TEXT
);

INSERT OR IGNORE INTO schema_versions (version, description) VALUES
  ('v2.0.0', 'Initial v2 schema with approval workflow integration and Phase 4 codification support');

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
-- Schema v2.0.0 provides:
--
-- 1. Enhanced Skills Table
--    - Approval workflow columns (approval_level, approval_criteria)
--    - TDD integration (test_coverage, test_suite_path)
--    - Phase 4 integration (phase4_pattern_id, generated_by)
--
-- 2. Approval Workflow Tables
--    - approval_history: Complete audit trail of all approval decisions
--    - approval_criteria_templates: Reusable criteria with seed data
--    - Edge case tracking: Continuous improvement feedback loop
--
-- 3. TDD Support
--    - test_coverage and test_suite_path columns in skills
--    - TDD conditions in agent_skill_mappings
--    - Test pass rate tracking in usage logs
--
-- 4. Phase 4 Integration
--    - phase4_skill_generation: Link generated skills to source patterns
--    - edge_case_tracking: Capture and manage edge cases
--    - Continuous skill evolution support
--
-- 5. Performance Optimization
--    - Comprehensive indexing strategy
--    - Composite indexes for common queries
--    - Materialized views for analytics
--
-- 6. Bootstrap Skills
--    - Static registry of 5 core skills
--    - Load order management
--    - Hash-based integrity checking
--
-- 7. Migration Support
--    - schema_versions table for tracking
--    - migration_status view for v1→v2 validation
--    - Backward compatibility maintained
-- ============================================================================
