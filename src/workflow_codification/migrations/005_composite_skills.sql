-- ============================================================
-- FEATURE 5: SKILL COMPOSITION
-- Migration: 005_composite_skills.sql
-- Purpose: Create composite_skills table for multi-skill workflow definitions
-- ============================================================

CREATE TABLE IF NOT EXISTS composite_skills (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Composite skill identification
    composite_name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,

    -- Component skills (JSONB array of skill references)
    -- Format: [{"skill": "skill-name", "params": {...}, "order": 1, "timeout": 300}, ...]
    steps JSONB NOT NULL DEFAULT '[]',

    -- Parallelization strategy (JSONB array of parallel groups)
    -- Format: [{"group": 1, "skills": ["skill-1", "skill-2"]}, ...]
    parallel_groups JSONB,

    -- Execution configuration
    execution_mode VARCHAR(50) DEFAULT 'sequential' CHECK (execution_mode IN ('sequential', 'parallel', 'conditional')),
    error_handling VARCHAR(50) DEFAULT 'stop_on_error' CHECK (error_handling IN ('stop_on_error', 'continue_on_error', 'retry_on_error')),

    -- Lifecycle
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Optional metadata
    metadata JSONB DEFAULT '{}'
);

-- Comments for documentation
COMMENT ON TABLE composite_skills IS 'Defines composite skills that orchestrate multiple atomic skills';
COMMENT ON COLUMN composite_skills.composite_name IS 'Unique identifier for the composite skill (e.g., "deploy-full-stack")';
COMMENT ON COLUMN composite_skills.steps IS 'JSONB array of skill execution steps with parameters and order';
COMMENT ON COLUMN composite_skills.parallel_groups IS 'JSONB array defining which skills can run in parallel (NULL for sequential-only)';
COMMENT ON COLUMN composite_skills.execution_mode IS 'sequential = run steps in order, parallel = run all steps concurrently, conditional = use branching logic';
COMMENT ON COLUMN composite_skills.error_handling IS 'stop_on_error = halt on first failure, continue_on_error = run all steps, retry_on_error = retry failed steps';
