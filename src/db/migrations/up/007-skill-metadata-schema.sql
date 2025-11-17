-- Migration 007: Skill Metadata Schema
--
-- Schema for skill loader with memory budget constraints.
-- Stores skill metadata for fast lookup and hash validation.
--
-- Performance targets:
-- - Fast metadata lookup (<10ms)
-- - Efficient hash validation for bulk checks
-- - Cache statistics tracking
--
-- Author: backend-developer (Phase 2, Task P2-1.1)
-- Date: 2025-11-16

-- =============================================================================
-- Skill Metadata Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS skill_metadata (
    -- Primary key
    id TEXT PRIMARY KEY,

    -- File information
    path TEXT NOT NULL,
    hash TEXT NOT NULL,  -- SHA-256 hash
    size INTEGER NOT NULL,  -- File size in bytes

    -- Timestamps
    last_loaded TEXT,  -- ISO 8601 timestamp
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    -- Optional metadata
    namespace TEXT,
    priority INTEGER DEFAULT 0,
    tags TEXT,  -- JSON array

    -- Constraints
    CHECK (size >= 0),
    CHECK (length(hash) = 64),  -- SHA-256 hex string
    CHECK (path LIKE '%.md' OR path LIKE '%.MD')
);

-- =============================================================================
-- Indexes for Performance
-- =============================================================================

-- Fast lookup by ID (primary key already indexed)

-- Fast lookup by hash (for bulk validation)
CREATE INDEX IF NOT EXISTS idx_skill_metadata_hash
    ON skill_metadata(hash);

-- Fast lookup by namespace
CREATE INDEX IF NOT EXISTS idx_skill_metadata_namespace
    ON skill_metadata(namespace);

-- Fast lookup by last_loaded (for cache management)
CREATE INDEX IF NOT EXISTS idx_skill_metadata_last_loaded
    ON skill_metadata(last_loaded DESC);

-- Fast lookup by priority
CREATE INDEX IF NOT EXISTS idx_skill_metadata_priority
    ON skill_metadata(priority DESC);

-- =============================================================================
-- Cache Statistics Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS skill_cache_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Timestamp
    timestamp TEXT DEFAULT (datetime('now')),

    -- Cache metrics
    cache_size INTEGER NOT NULL,
    cache_memory_bytes INTEGER NOT NULL,
    cache_hits INTEGER NOT NULL,
    cache_misses INTEGER NOT NULL,
    cache_evictions INTEGER NOT NULL,

    -- Loader metrics
    skills_loaded INTEGER NOT NULL,
    skills_content_loaded INTEGER NOT NULL,
    hash_mismatches INTEGER NOT NULL,
    cache_invalidations INTEGER NOT NULL,

    -- Computed metrics
    cache_hit_rate REAL,
    memory_utilization REAL,

    -- Context
    context TEXT,  -- Optional context (e.g., "agent-spawn", "skill-deployment")

    CHECK (cache_size >= 0),
    CHECK (cache_memory_bytes >= 0),
    CHECK (cache_hits >= 0),
    CHECK (cache_misses >= 0),
    CHECK (cache_evictions >= 0),
    CHECK (cache_hit_rate >= 0 AND cache_hit_rate <= 1),
    CHECK (memory_utilization >= 0 AND memory_utilization <= 1)
);

-- Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_skill_cache_stats_timestamp
    ON skill_cache_stats(timestamp DESC);

-- Index for context filtering
CREATE INDEX IF NOT EXISTS idx_skill_cache_stats_context
    ON skill_cache_stats(context);

-- =============================================================================
-- Views for Analytics
-- =============================================================================

-- Latest cache statistics
CREATE VIEW IF NOT EXISTS v_skill_cache_latest AS
SELECT
    timestamp,
    cache_size,
    cache_memory_bytes,
    ROUND(cache_memory_bytes / 1024.0 / 1024.0, 2) AS cache_memory_mb,
    cache_hits,
    cache_misses,
    cache_evictions,
    ROUND(cache_hit_rate * 100, 2) AS cache_hit_rate_pct,
    ROUND(memory_utilization * 100, 2) AS memory_utilization_pct,
    skills_loaded,
    skills_content_loaded,
    hash_mismatches,
    cache_invalidations,
    context
FROM skill_cache_stats
ORDER BY timestamp DESC
LIMIT 100;

-- Cache performance summary
CREATE VIEW IF NOT EXISTS v_skill_cache_summary AS
SELECT
    COUNT(*) AS total_snapshots,
    AVG(cache_hit_rate) AS avg_hit_rate,
    MIN(cache_hit_rate) AS min_hit_rate,
    MAX(cache_hit_rate) AS max_hit_rate,
    AVG(memory_utilization) AS avg_memory_utilization,
    MAX(cache_memory_bytes) AS peak_memory_bytes,
    SUM(cache_evictions) AS total_evictions,
    SUM(hash_mismatches) AS total_hash_mismatches,
    SUM(cache_invalidations) AS total_cache_invalidations
FROM skill_cache_stats
WHERE timestamp >= datetime('now', '-24 hours');

-- Skills by namespace
CREATE VIEW IF NOT EXISTS v_skills_by_namespace AS
SELECT
    COALESCE(namespace, 'default') AS namespace,
    COUNT(*) AS skill_count,
    SUM(size) AS total_size_bytes,
    ROUND(SUM(size) / 1024.0 / 1024.0, 2) AS total_size_mb,
    AVG(size) AS avg_size_bytes,
    MIN(last_loaded) AS oldest_load,
    MAX(last_loaded) AS newest_load
FROM skill_metadata
GROUP BY namespace
ORDER BY skill_count DESC;

-- Recently loaded skills
CREATE VIEW IF NOT EXISTS v_skills_recently_loaded AS
SELECT
    id,
    path,
    size,
    ROUND(size / 1024.0, 2) AS size_kb,
    last_loaded,
    namespace,
    priority
FROM skill_metadata
WHERE last_loaded IS NOT NULL
ORDER BY last_loaded DESC
LIMIT 50;

-- Large skills (potential memory pressure)
CREATE VIEW IF NOT EXISTS v_skills_large AS
SELECT
    id,
    path,
    size,
    ROUND(size / 1024.0, 2) AS size_kb,
    ROUND(size / 1024.0 / 1024.0, 2) AS size_mb,
    namespace,
    last_loaded
FROM skill_metadata
WHERE size > 100000  -- >100KB
ORDER BY size DESC;

-- =============================================================================
-- Triggers for Automatic Updates
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS skill_metadata_updated_at
AFTER UPDATE ON skill_metadata
FOR EACH ROW
BEGIN
    UPDATE skill_metadata
    SET updated_at = datetime('now')
    WHERE id = NEW.id;
END;

-- =============================================================================
-- Sample Queries (Comments)
-- =============================================================================

-- Find skills by hash (bulk validation):
-- SELECT id, path, hash FROM skill_metadata WHERE hash IN (?, ?, ...);

-- Get cache hit rate for last hour:
-- SELECT AVG(cache_hit_rate) FROM skill_cache_stats
-- WHERE timestamp >= datetime('now', '-1 hour');

-- Find skills not loaded recently:
-- SELECT id, path FROM skill_metadata
-- WHERE last_loaded IS NULL OR last_loaded < datetime('now', '-7 days')
-- ORDER BY priority DESC;

-- Get memory pressure indicators:
-- SELECT
--   (SELECT SUM(size) FROM skill_metadata) AS total_skill_size_bytes,
--   (SELECT MAX(cache_memory_bytes) FROM skill_cache_stats WHERE timestamp >= datetime('now', '-1 hour')) AS peak_cache_bytes,
--   (SELECT AVG(cache_evictions) FROM skill_cache_stats WHERE timestamp >= datetime('now', '-1 hour')) AS avg_evictions_per_hour;
