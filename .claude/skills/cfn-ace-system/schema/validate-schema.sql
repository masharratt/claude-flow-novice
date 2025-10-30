-- ACE System: Schema Validation Queries
-- Tests that schema supports all required query patterns
-- Run with: sqlite3 swarm-memory.db < validate-schema.sql

.mode column
.headers on
.width 40 15 10

-- =============================================
-- 1. BASIC TABLE VERIFICATION
-- =============================================

.print ""
.print "=== 1. TABLE VERIFICATION ==="
.print ""

SELECT 'context_reflections' as table_name, COUNT(*) as column_count
FROM pragma_table_info('context_reflections');

SELECT 'ace_telemetry' as table_name, COUNT(*) as column_count
FROM pragma_table_info('ace_telemetry');

.print ""
.print "=== 2. INDEX VERIFICATION ==="
.print ""

SELECT
  name as index_name,
  tbl_name as table_name,
  CASE WHEN "unique" = 1 THEN 'YES' ELSE 'NO' END as is_unique
FROM sqlite_master
WHERE type = 'index'
  AND tbl_name IN ('context_reflections', 'ace_telemetry')
ORDER BY tbl_name, name;

-- =============================================
-- 3. VIEW VERIFICATION
-- =============================================

.print ""
.print "=== 3. VIEW VERIFICATION ==="
.print ""

SELECT name as view_name
FROM sqlite_master
WHERE type = 'view'
ORDER BY name;

-- =============================================
-- 4. COLUMN CONSTRAINTS VERIFICATION
-- =============================================

.print ""
.print "=== 4. COLUMN CONSTRAINTS ==="
.print ""

SELECT
  name as column_name,
  type as data_type,
  "notnull" as not_null,
  dflt_value as default_value,
  pk as is_primary_key
FROM pragma_table_info('context_reflections')
WHERE "notnull" = 1 OR pk = 1
ORDER BY pk DESC, name;

-- =============================================
-- 5. QUERY PATTERN TESTS (Context Lookup)
-- =============================================

.print ""
.print "=== 5. CONTEXT LOOKUP QUERY TEST ==="
.print "Query: Find curated strategies by domain"
.print ""

-- This query should use idx_context_lookup index
EXPLAIN QUERY PLAN
SELECT
  id,
  reflection_type,
  json_extract(metadata, '$.domain') as domain,
  confidence,
  created_at
FROM context_reflections
WHERE curator_status = 'curated'
  AND confidence >= 0.70
  AND json_extract(metadata, '$.domain') LIKE '%backend%'
ORDER BY confidence DESC, created_at DESC
LIMIT 5;

-- =============================================
-- 6. KEYWORD SIMILARITY QUERY TEST
-- =============================================

.print ""
.print "=== 6. KEYWORD SIMILARITY QUERY TEST ==="
.print "Query: Find contexts matching keywords"
.print ""

-- This query should use idx_metadata_keywords index
EXPLAIN QUERY PLAN
SELECT
  id,
  reflection_type,
  json_extract(metadata, '$.keywords') as keywords,
  confidence
FROM context_reflections
WHERE json_extract(metadata, '$.keywords') LIKE '%authentication%'
  OR json_extract(metadata, '$.keywords') LIKE '%jwt%'
ORDER BY confidence DESC
LIMIT 5;

-- =============================================
-- 7. ANTI-PATTERN QUERY TEST
-- =============================================

.print ""
.print "=== 7. ANTI-PATTERN QUERY TEST ==="
.print "Query: Find critical anti-patterns"
.print ""

-- This query should use idx_context_reflections_type
EXPLAIN QUERY PLAN
SELECT
  id,
  task_id,
  json_extract(metadata, '$.severity') as severity,
  confidence,
  created_at
FROM context_reflections
WHERE reflection_type = 'anti-pattern'
  AND json_extract(metadata, '$.severity') = 'critical'
ORDER BY created_at DESC;

-- =============================================
-- 8. SUCCESS RATE QUERY TEST
-- =============================================

.print ""
.print "=== 8. SUCCESS RATE QUERY TEST ==="
.print "Query: Find high-impact patterns"
.print ""

-- This query should use idx_context_reflections_success
EXPLAIN QUERY PLAN
SELECT
  id,
  reflection_type,
  confidence,
  success_count,
  total_count,
  CAST(success_count AS REAL) / NULLIF(total_count, 0) as success_rate
FROM context_reflections
WHERE total_count >= 3
  AND CAST(success_count AS REAL) / NULLIF(total_count, 0) >= 0.80
ORDER BY success_count DESC, success_rate DESC
LIMIT 10;

-- =============================================
-- 9. VIEW QUERY TEST (Active Lessons)
-- =============================================

.print ""
.print "=== 9. ACTIVE LESSONS VIEW TEST ==="
.print "Query: Select from v_active_lessons"
.print ""

EXPLAIN QUERY PLAN
SELECT
  id,
  reflection_type,
  domain,
  confidence,
  success_rate
FROM v_active_lessons
WHERE confidence >= 0.80
LIMIT 5;

-- =============================================
-- 10. VIEW QUERY TEST (High Impact Patterns)
-- =============================================

.print ""
.print "=== 10. HIGH IMPACT PATTERNS VIEW TEST ==="
.print "Query: Select from v_high_impact_patterns"
.print ""

EXPLAIN QUERY PLAN
SELECT
  id,
  domain,
  strategy_title,
  success_count,
  success_rate
FROM v_high_impact_patterns
LIMIT 5;

-- =============================================
-- 11. VIEW QUERY TEST (Recent Failures)
-- =============================================

.print ""
.print "=== 11. RECENT FAILURES VIEW TEST ==="
.print "Query: Select from v_recent_failures"
.print ""

EXPLAIN QUERY PLAN
SELECT
  id,
  task_id,
  domain,
  severity,
  confidence
FROM v_recent_failures
WHERE severity = 'critical'
LIMIT 5;

-- =============================================
-- 12. PERFORMANCE METRICS
-- =============================================

.print ""
.print "=== 12. SCHEMA STATISTICS ==="
.print ""

SELECT
  'Reflections' as metric,
  COUNT(*) as count,
  ROUND(AVG(confidence), 2) as avg_confidence,
  MIN(created_at) as earliest,
  MAX(created_at) as latest
FROM context_reflections;

SELECT
  'Telemetry Records' as metric,
  COUNT(*) as count,
  '-' as avg_confidence,
  '-' as earliest,
  '-' as latest
FROM ace_telemetry;

-- =============================================
-- 13. INDEX USAGE ANALYSIS
-- =============================================

.print ""
.print "=== 13. INDEX RECOMMENDATIONS ==="
.print "Note: Run after queries to see which indexes were used"
.print ""

-- Show indexes that exist
SELECT
  m.name as index_name,
  m.tbl_name as table_name,
  GROUP_CONCAT(ii.name, ', ') as indexed_columns
FROM sqlite_master m
JOIN pragma_index_info(m.name) ii
WHERE m.type = 'index'
  AND m.tbl_name = 'context_reflections'
GROUP BY m.name, m.tbl_name
ORDER BY m.name;

-- =============================================
-- 14. SCHEMA VERSION
-- =============================================

.print ""
.print "=== 14. SCHEMA VERSION ==="
.print ""

SELECT
  version,
  applied_at,
  description
FROM schema_version
ORDER BY version DESC;

.print ""
.print "=== VALIDATION COMPLETE ==="
.print ""
