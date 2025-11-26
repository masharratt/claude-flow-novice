-- ACE System: Context Reflections Table Schema
-- Stores cognitive reflections from CFN Loop executions for context reuse
-- Version: 1.0.0
-- Created: 2025-10-29

-- =============================================
-- CONTEXT REFLECTIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS context_reflections (
  -- Primary Key
  id TEXT PRIMARY KEY,

  -- Reflection Classification
  reflection_type TEXT NOT NULL CHECK (
    reflection_type IN ('strategy', 'anti-pattern', 'edge-case', 'pattern', 'warning', 'failure')
  ),

  -- Task Context
  task_id TEXT NOT NULL,
  agent_id TEXT,
  swarm_id TEXT NOT NULL,
  project_id TEXT DEFAULT 'default',

  -- Execution Data (JSON format)
  execution_trace TEXT NOT NULL,      -- {"iterations": 2, "loops": ["loop3", "loop2"], "timeline": [...]}
  feedback_signals TEXT NOT NULL,     -- {"loop2_feedback": [...], "product_owner_decision": "PROCEED"}
  extracted_lessons TEXT NOT NULL,    -- {"strategies": [...], "antiPatterns": [...], "edgeCases": [...]}

  -- Metadata (JSON format for flexible querying)
  metadata TEXT DEFAULT '{}',         -- {"tags": [...], "domain": [...], "keywords": [...], "severity": "..."}

  -- Curator Status
  curator_status TEXT DEFAULT 'pending' CHECK (
    curator_status IN ('pending', 'curated', 'merged', 'rejected', 'archived')
  ),
  merged_bullet_ids TEXT,             -- JSON array: ["STRAT-007", "STRAT-008"]
  rejection_reason TEXT,

  -- Access Control
  acl_level INTEGER NOT NULL DEFAULT 3 CHECK (acl_level BETWEEN 1 AND 5),

  -- Quality Metrics
  confidence REAL DEFAULT 0.0 CHECK (confidence BETWEEN 0.0 AND 1.0),
  success_count INTEGER DEFAULT 0,    -- Times this context led to success
  total_count INTEGER DEFAULT 0,      -- Times this context was used

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME,
  last_used_at DATETIME,

  -- Version Control
  version INTEGER DEFAULT 1
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

-- Task & Swarm Lookups (core queries)
CREATE INDEX IF NOT EXISTS idx_context_reflections_task
  ON context_reflections(task_id);

CREATE INDEX IF NOT EXISTS idx_context_reflections_swarm
  ON context_reflections(swarm_id);

-- Curator Workflow (pending items)
CREATE INDEX IF NOT EXISTS idx_context_reflections_status
  ON context_reflections(curator_status);

-- Time-based Queries (recency scoring)
CREATE INDEX IF NOT EXISTS idx_context_reflections_created
  ON context_reflections(created_at DESC);

-- Quality Filtering (high-confidence contexts)
CREATE INDEX IF NOT EXISTS idx_context_reflections_confidence
  ON context_reflections(confidence DESC);

-- Success Rate Queries
CREATE INDEX IF NOT EXISTS idx_context_reflections_success
  ON context_reflections(success_count, total_count);

-- Reflection Type Filtering
CREATE INDEX IF NOT EXISTS idx_context_reflections_type
  ON context_reflections(reflection_type);

-- Composite Index for Context Lookup (primary query pattern)
-- Query: Find high-confidence, recent contexts by domain/tags
CREATE INDEX IF NOT EXISTS idx_context_lookup
  ON context_reflections(curator_status, confidence DESC, created_at DESC)
  WHERE curator_status = 'curated';

-- =============================================
-- ACE TELEMETRY TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS ace_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK (
    operation IN ('reflect', 'query', 'inject', 'curate', 'pattern_detect')
  ),
  duration_ms INTEGER NOT NULL,
  task_id TEXT,
  success BOOLEAN DEFAULT 1,
  error_message TEXT,
  context_size INTEGER,              -- Size of context in bytes
  results_count INTEGER,             -- Number of results returned (for queries)
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Telemetry Indexes
CREATE INDEX IF NOT EXISTS idx_telemetry_operation
  ON ace_telemetry(operation);

CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp
  ON ace_telemetry(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_success
  ON ace_telemetry(success, operation);

-- =============================================
-- JSON EXTRACTION INDEXES (SQLite 3.9+)
-- =============================================
-- These enable fast queries on JSON fields

-- Tags extraction (common query: match by tags)
CREATE INDEX IF NOT EXISTS idx_metadata_tags
  ON context_reflections(json_extract(metadata, '$.tags'));

-- Domain extraction (common query: filter by domain)
CREATE INDEX IF NOT EXISTS idx_metadata_domain
  ON context_reflections(json_extract(metadata, '$.domain'));

-- Keywords extraction (context lookup)
CREATE INDEX IF NOT EXISTS idx_metadata_keywords
  ON context_reflections(json_extract(metadata, '$.keywords'));

-- =============================================
-- PERFORMANCE OPTIMIZATION SETTINGS
-- =============================================

-- Enable Write-Ahead Logging for better concurrency
PRAGMA journal_mode = WAL;

-- Use memory for temporary storage
PRAGMA temp_store = MEMORY;

-- Optimize for read-heavy workload
PRAGMA cache_size = -65536;  -- 64MB cache

-- Balance between performance and safety
PRAGMA synchronous = NORMAL;

-- Larger page size for DDR5-6400 bandwidth
PRAGMA page_size = 8192;

-- Enable query optimization
PRAGMA optimize;

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- Active Curated Lessons (ready for reuse)
CREATE VIEW IF NOT EXISTS v_active_lessons AS
SELECT
  id,
  reflection_type,
  task_id,
  json_extract(metadata, '$.domain') as domain,
  json_extract(metadata, '$.tags') as tags,
  json_extract(metadata, '$.keywords') as keywords,
  extracted_lessons,
  confidence,
  success_count,
  total_count,
  CAST(success_count AS REAL) / NULLIF(total_count, 0) as success_rate,
  created_at
FROM context_reflections
WHERE curator_status = 'curated'
  AND confidence >= 0.70
ORDER BY created_at DESC;

-- High-Impact Patterns (frequently used, high success rate)
CREATE VIEW IF NOT EXISTS v_high_impact_patterns AS
SELECT
  id,
  reflection_type,
  json_extract(metadata, '$.domain') as domain,
  json_extract(extracted_lessons, '$.strategies[0].title') as strategy_title,
  confidence,
  success_count,
  total_count,
  CAST(success_count AS REAL) / NULLIF(total_count, 0) as success_rate,
  last_used_at
FROM context_reflections
WHERE curator_status = 'curated'
  AND total_count >= 3
  AND CAST(success_count AS REAL) / NULLIF(total_count, 0) >= 0.80
ORDER BY success_count DESC, success_rate DESC
LIMIT 10;

-- Recent Failures (for anti-pattern extraction)
CREATE VIEW IF NOT EXISTS v_recent_failures AS
SELECT
  id,
  task_id,
  reflection_type,
  json_extract(metadata, '$.domain') as domain,
  json_extract(metadata, '$.failure_reason') as failure_reason,
  json_extract(metadata, '$.severity') as severity,
  confidence,
  created_at
FROM context_reflections
WHERE reflection_type IN ('anti-pattern', 'failure', 'warning')
  AND created_at > datetime('now', '-30 days')
ORDER BY
  CASE
    WHEN json_extract(metadata, '$.severity') = 'critical' THEN 1
    WHEN json_extract(metadata, '$.severity') = 'warning' THEN 2
    ELSE 3
  END,
  created_at DESC;

-- =============================================
-- SCHEMA VERSION
-- =============================================

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  description TEXT
);

INSERT OR IGNORE INTO schema_version (version, description)
VALUES (1, 'Initial ACE context_reflections schema with telemetry and views');
