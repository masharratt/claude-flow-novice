-- Canonical agent-lifecycle schema (data/agent-lifecycle.db).
--
-- SINGLE SOURCE OF TRUTH. Do not re-declare these tables anywhere else.
-- Consumers apply this file verbatim:
--   .claude/skills/cfn-agent-lifecycle/lib/audit/execute-lifecycle-hook.sh
--   .claude/hooks/cfn-subagent-start.sh
--   .claude/hooks/cfn-subagent-stop.sh
--
-- Idempotent: safe to apply to an existing database on every invocation.
-- Any writer MUST populate every NOT NULL column (id, name, type, status,
-- spawned_at, updated_at) or the INSERT fails with
-- "NOT NULL constraint failed: agents.name".

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'spawned',
    confidence REAL,
    output TEXT,
    metadata TEXT,
    spawned_at TEXT NOT NULL,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lifecycle_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    confidence REAL,
    reasoning TEXT,
    phase TEXT,
    iteration INTEGER,
    tokens_used INTEGER,
    cost_usd REAL,
    duration_ms INTEGER,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
CREATE INDEX IF NOT EXISTS idx_lifecycle_agent_id ON lifecycle_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_timestamp ON lifecycle_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_lifecycle_event_type ON lifecycle_events(event_type);
