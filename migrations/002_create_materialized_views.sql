-- Migration: 002_create_materialized_views.sql
-- Phase 6 :: Query Optimization - Create materialized views for cost aggregation
-- Expected: 10-20x query speedup for aggregate queries

-- Drop existing views if they exist
DROP MATERIALIZED VIEW IF EXISTS mv_cost_by_team CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_cost_by_agent_type CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_daily_cost_summary CASCADE;

-- Create materialized view for cost by team
CREATE MATERIALIZED VIEW mv_cost_by_team AS
SELECT
  team_id,
  COUNT(*) as agent_count,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
  AVG(confidence) as avg_confidence,
  SUM(COALESCE((metadata::json->>'cost')::numeric, 0)) as total_cost,
  MIN(spawned_at) as first_spawn,
  MAX(spawned_at) as last_spawn
FROM agents
WHERE team_id IS NOT NULL
GROUP BY team_id;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_cost_by_team_team_id ON mv_cost_by_team (team_id);

-- Create materialized view for cost by agent type
CREATE MATERIALIZED VIEW mv_cost_by_agent_type AS
SELECT
  type as agent_type,
  COUNT(*) as agent_count,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
  AVG(confidence) as avg_confidence,
  SUM(COALESCE((metadata::json->>'cost')::numeric, 0)) as total_cost,
  AVG(EXTRACT(EPOCH FROM (completed_at - spawned_at))) as avg_duration_seconds
FROM agents
WHERE type IS NOT NULL
GROUP BY type;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_cost_by_agent_type_type ON mv_cost_by_agent_type (agent_type);

-- Create materialized view for daily cost summary
CREATE MATERIALIZED VIEW mv_daily_cost_summary AS
SELECT
  DATE(spawned_at) as date,
  COUNT(*) as total_agents,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
  SUM(COALESCE((metadata::json->>'cost')::numeric, 0)) as total_cost,
  AVG(confidence) as avg_confidence
FROM agents
WHERE spawned_at IS NOT NULL
GROUP BY DATE(spawned_at)
ORDER BY date DESC;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_mv_daily_cost_summary_date ON mv_daily_cost_summary (date);

-- Verify materialized views created
SELECT
  schemaname,
  matviewname,
  definition
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY matviewname;

-- Initial refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_cost_by_team;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_cost_by_agent_type;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_daily_cost_summary;
