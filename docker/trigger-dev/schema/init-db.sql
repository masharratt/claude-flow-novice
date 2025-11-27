-- ============================================================================
-- CFN Loop Database Schema
-- ============================================================================
-- Version: 1.0.0
-- Date: 2025-11-26
-- Purpose: Complete schema for CFN Loop execution tracking, logging, and MDAP
--
-- Tables:
--   Core: cfn_tasks, cfn_iterations, cfn_phases, cfn_agents
--   Logging: cfn_logs (with log_level enum)
--   Testing: cfn_test_runs
--   MDAP: mdap_executions, mdap_model_stats
--   Views: v_task_summary, v_recent_errors
-- ============================================================================

-- ============================================================================
-- Core Tables
-- ============================================================================

-- Tasks (top-level CFN Loop execution)
CREATE TABLE cfn_tasks (
    id VARCHAR(64) PRIMARY KEY,
    description TEXT NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT 'standard',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    max_iterations INT NOT NULL DEFAULT 10,
    current_iteration INT NOT NULL DEFAULT 0,
    provider VARCHAR(20),
    work_dir VARCHAR(512),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    final_decision VARCHAR(20),
    final_pass_rate DECIMAL(5,4),
    final_consensus DECIMAL(5,4),
    error_message TEXT,

    trigger_run_id VARCHAR(64),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_tasks_status ON cfn_tasks(status);
CREATE INDEX idx_tasks_created_at ON cfn_tasks(created_at DESC);
CREATE INDEX idx_tasks_trigger_run_id ON cfn_tasks(trigger_run_id);

-- Iterations
CREATE TABLE cfn_iterations (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(64) REFERENCES cfn_tasks(id) ON DELETE CASCADE,
    iteration_number INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    gate_pass_rate DECIMAL(5,4),
    gate_passed BOOLEAN,
    consensus_score DECIMAL(5,4),
    consensus_passed BOOLEAN,
    decision VARCHAR(20),

    coordinator_manifest JSONB,
    metadata JSONB DEFAULT '{}',

    UNIQUE(task_id, iteration_number)
);

CREATE INDEX idx_iterations_task_id ON cfn_iterations(task_id);
CREATE INDEX idx_iterations_status ON cfn_iterations(status);

-- Phases within iterations
CREATE TABLE cfn_phases (
    id SERIAL PRIMARY KEY,
    iteration_id INT REFERENCES cfn_iterations(id) ON DELETE CASCADE,
    phase_number INT NOT NULL,
    phase_name VARCHAR(100),
    parallel BOOLEAN DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    agents_total INT,
    agents_completed INT DEFAULT 0,
    agents_passed INT DEFAULT 0,

    UNIQUE(iteration_id, phase_number)
);

CREATE INDEX idx_phases_iteration_id ON cfn_phases(iteration_id);
CREATE INDEX idx_phases_status ON cfn_phases(status);

-- Agents
CREATE TABLE cfn_agents (
    id VARCHAR(64) PRIMARY KEY,
    task_id VARCHAR(64) REFERENCES cfn_tasks(id) ON DELETE CASCADE,
    iteration_id INT REFERENCES cfn_iterations(id) ON DELETE SET NULL,
    phase_id INT REFERENCES cfn_phases(id) ON DELETE SET NULL,

    agent_type VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL,

    assigned_files TEXT[],
    assigned_tests TEXT[],
    task_description TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INT,

    success BOOLEAN,
    tests_passed BOOLEAN,
    confidence DECIMAL(5,4),
    files_modified TEXT[],
    error_message TEXT,

    trigger_run_id VARCHAR(64),
    trigger_batch_id VARCHAR(64),

    output JSONB,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_agents_task_id ON cfn_agents(task_id);
CREATE INDEX idx_agents_iteration_id ON cfn_agents(iteration_id);
CREATE INDEX idx_agents_status ON cfn_agents(status);
CREATE INDEX idx_agents_role ON cfn_agents(role);
CREATE INDEX idx_agents_agent_type ON cfn_agents(agent_type);
CREATE INDEX idx_agents_trigger_run_id ON cfn_agents(trigger_run_id);

-- ============================================================================
-- Logging
-- ============================================================================

CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error', 'fatal');

CREATE TABLE cfn_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),

    task_id VARCHAR(64),
    iteration_id INT,
    agent_id VARCHAR(64),
    component VARCHAR(50),

    level log_level NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,

    data JSONB DEFAULT '{}',

    error_type VARCHAR(100),
    error_stack TEXT
);

CREATE INDEX idx_logs_task_id ON cfn_logs(task_id);
CREATE INDEX idx_logs_agent_id ON cfn_logs(agent_id);
CREATE INDEX idx_logs_timestamp ON cfn_logs(timestamp DESC);
CREATE INDEX idx_logs_level ON cfn_logs(level) WHERE level IN ('error', 'fatal');
CREATE INDEX idx_logs_component ON cfn_logs(component);

-- ============================================================================
-- Test Results
-- ============================================================================

CREATE TABLE cfn_test_runs (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(64) REFERENCES cfn_tasks(id) ON DELETE CASCADE,
    iteration_id INT REFERENCES cfn_iterations(id) ON DELETE SET NULL,
    agent_id VARCHAR(64),

    test_command VARCHAR(512),
    work_dir VARCHAR(512),

    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INT,

    exit_code INT,
    total_tests INT,
    passed_tests INT,
    failed_tests INT,
    skipped_tests INT,
    pass_rate DECIMAL(5,4),

    stdout TEXT,
    stderr TEXT,

    failed_test_names TEXT[],
    failure_details JSONB
);

CREATE INDEX idx_test_runs_task ON cfn_test_runs(task_id);
CREATE INDEX idx_test_runs_iteration ON cfn_test_runs(iteration_id);
CREATE INDEX idx_test_runs_agent ON cfn_test_runs(agent_id);

-- ============================================================================
-- MDAP Tables (Multi-model Dynamic Allocation Protocol)
-- ============================================================================

CREATE TABLE mdap_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(64),
    micro_task_id VARCHAR(64) NOT NULL,

    profile VARCHAR(20) NOT NULL,
    complexity VARCHAR(20) NOT NULL,

    attempts JSONB NOT NULL,
    final_tier INT NOT NULL,
    final_model VARCHAR(50) NOT NULL,

    success BOOLEAN NOT NULL,
    red_flagged BOOLEAN DEFAULT FALSE,
    escalation_count INT DEFAULT 0,

    total_latency_ms INT NOT NULL,
    total_cost_usd DECIMAL(10,6) NOT NULL,
    test_pass_rate DECIMAL(5,4),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mdap_task ON mdap_executions(task_id);
CREATE INDEX idx_mdap_profile ON mdap_executions(profile);
CREATE INDEX idx_mdap_success ON mdap_executions(success);
CREATE INDEX idx_mdap_complexity ON mdap_executions(complexity);
CREATE INDEX idx_mdap_created_at ON mdap_executions(created_at DESC);

CREATE TABLE mdap_model_stats (
    model VARCHAR(50) NOT NULL,
    complexity VARCHAR(20) NOT NULL,
    profile VARCHAR(20) NOT NULL,

    total_attempts INT DEFAULT 0,
    success_count INT DEFAULT 0,
    success_rate DECIMAL(5,4),

    avg_latency_ms INT,
    avg_cost_usd DECIMAL(10,6),

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (model, complexity, profile)
);

CREATE INDEX idx_mdap_stats_model ON mdap_model_stats(model);
CREATE INDEX idx_mdap_stats_success_rate ON mdap_model_stats(success_rate DESC);

-- ============================================================================
-- Views
-- ============================================================================

CREATE VIEW v_task_summary AS
SELECT
    t.id,
    t.description,
    t.mode,
    t.status,
    t.current_iteration,
    t.final_decision,
    t.final_pass_rate,
    t.created_at,
    t.completed_at,
    EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) as duration_seconds,
    COUNT(DISTINCT a.id) as total_agents,
    COUNT(DISTINCT a.id) FILTER (WHERE a.success = true) as successful_agents,
    COUNT(DISTINCT i.id) as total_iterations
FROM cfn_tasks t
LEFT JOIN cfn_agents a ON t.id = a.task_id
LEFT JOIN cfn_iterations i ON t.id = i.task_id
GROUP BY t.id;

CREATE VIEW v_recent_errors AS
SELECT
    l.timestamp,
    l.task_id,
    l.agent_id,
    l.component,
    l.message,
    l.error_type,
    l.data
FROM cfn_logs l
WHERE l.level IN ('error', 'fatal')
ORDER BY l.timestamp DESC
LIMIT 100;

CREATE VIEW v_agent_performance AS
SELECT
    agent_type,
    role,
    COUNT(*) as total_executions,
    COUNT(*) FILTER (WHERE success = true) as successful_executions,
    ROUND(AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END)::numeric, 4) as success_rate,
    ROUND(AVG(duration_ms)::numeric, 0) as avg_duration_ms,
    ROUND(AVG(confidence)::numeric, 4) as avg_confidence
FROM cfn_agents
WHERE status IN ('completed', 'failed')
GROUP BY agent_type, role
ORDER BY total_executions DESC;

CREATE VIEW v_iteration_summary AS
SELECT
    i.id,
    i.task_id,
    i.iteration_number,
    i.status,
    i.gate_pass_rate,
    i.gate_passed,
    i.consensus_score,
    i.consensus_passed,
    i.decision,
    EXTRACT(EPOCH FROM (i.completed_at - i.started_at)) as duration_seconds,
    COUNT(DISTINCT p.id) as total_phases,
    COUNT(DISTINCT a.id) as total_agents
FROM cfn_iterations i
LEFT JOIN cfn_phases p ON i.id = p.iteration_id
LEFT JOIN cfn_agents a ON i.id = a.iteration_id
GROUP BY i.id;

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to update task status based on latest iteration
CREATE OR REPLACE FUNCTION update_task_from_iteration()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE cfn_tasks
    SET
        current_iteration = NEW.iteration_number,
        status = CASE
            WHEN NEW.decision = 'PROCEED' THEN 'completed'
            WHEN NEW.decision = 'ABORT' THEN 'failed'
            ELSE 'running'
        END,
        final_decision = CASE WHEN NEW.decision IN ('PROCEED', 'ABORT') THEN NEW.decision ELSE final_decision END,
        final_pass_rate = CASE WHEN NEW.decision IN ('PROCEED', 'ABORT') THEN NEW.gate_pass_rate ELSE final_pass_rate END,
        final_consensus = CASE WHEN NEW.decision IN ('PROCEED', 'ABORT') THEN NEW.consensus_score ELSE final_consensus END,
        completed_at = CASE WHEN NEW.decision IN ('PROCEED', 'ABORT') THEN NOW() ELSE completed_at END
    WHERE id = NEW.task_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_task_from_iteration
    AFTER UPDATE OF decision ON cfn_iterations
    FOR EACH ROW
    WHEN (NEW.decision IS NOT NULL)
    EXECUTE FUNCTION update_task_from_iteration();

-- Function to update phase agent counts
CREATE OR REPLACE FUNCTION update_phase_agent_counts()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('completed', 'failed') AND (OLD.status IS NULL OR OLD.status NOT IN ('completed', 'failed')) THEN
        UPDATE cfn_phases
        SET
            agents_completed = agents_completed + 1,
            agents_passed = agents_passed + CASE WHEN NEW.success = true THEN 1 ELSE 0 END
        WHERE id = NEW.phase_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_phase_agent_counts
    AFTER UPDATE OF status ON cfn_agents
    FOR EACH ROW
    WHEN (NEW.phase_id IS NOT NULL)
    EXECUTE FUNCTION update_phase_agent_counts();

-- ============================================================================
-- Initial Data / Comments
-- ============================================================================

COMMENT ON TABLE cfn_tasks IS 'Top-level CFN Loop task executions';
COMMENT ON TABLE cfn_iterations IS 'Iterations within a CFN Loop task';
COMMENT ON TABLE cfn_phases IS 'Phases within an iteration (Loop 3 implementation, Loop 2 validation, etc.)';
COMMENT ON TABLE cfn_agents IS 'Individual agent executions';
COMMENT ON TABLE cfn_logs IS 'Structured logging for debugging and observability';
COMMENT ON TABLE cfn_test_runs IS 'Test execution results for gate checks';
COMMENT ON TABLE mdap_executions IS 'Multi-model Dynamic Allocation Protocol execution records';
COMMENT ON TABLE mdap_model_stats IS 'Aggregated statistics per model/complexity/profile';

COMMENT ON VIEW v_task_summary IS 'Summary view of tasks with agent counts';
COMMENT ON VIEW v_recent_errors IS 'Recent error logs for quick debugging';
COMMENT ON VIEW v_agent_performance IS 'Agent performance metrics by type and role';
COMMENT ON VIEW v_iteration_summary IS 'Summary view of iterations with phase and agent counts';
