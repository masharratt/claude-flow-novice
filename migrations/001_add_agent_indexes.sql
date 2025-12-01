-- Migration: 001_add_agent_indexes.sql
-- Phase 6 :: Query Optimization - Add indexes to agents table
-- Expected: 10-20x query speedup for filtered queries

-- Create indexes on agents table
CREATE INDEX IF NOT EXISTS idx_agents_team_id ON agents (team_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents (status);
CREATE INDEX IF NOT EXISTS idx_agents_spawned_at ON agents (spawned_at);

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_agents_team_status ON agents (team_id, status);
CREATE INDEX IF NOT EXISTS idx_agents_status_spawned ON agents (status, spawned_at);
CREATE INDEX IF NOT EXISTS idx_agents_cost_query ON agents (team_id, spawned_at, status);

-- Add index on completed_at for duration calculations
CREATE INDEX IF NOT EXISTS idx_agents_completed_at ON agents (completed_at);

-- Verify indexes created
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'agents'
  AND schemaname = 'public'
ORDER BY indexname;
