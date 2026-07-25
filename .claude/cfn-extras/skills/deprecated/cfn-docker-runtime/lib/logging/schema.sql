-- CFN Docker Logging Database Schema
-- Hybrid logging: Text files (human readable) + SQLite (powerful queries)

-- Container execution logs
CREATE TABLE IF NOT EXISTS container_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    container_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    log_line TEXT NOT NULL,
    stream TEXT NOT NULL CHECK(stream IN ('stdout', 'stderr')),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_agent ON container_logs(task_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_timestamp ON container_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_container ON container_logs(container_id);

-- Container lifecycle events
CREATE TABLE IF NOT EXISTS container_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    container_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('spawn', 'exit', 'kill', 'error', 'oom')),
    exit_code INTEGER,
    status TEXT,
    started_at TEXT,
    finished_at TEXT,
    duration_seconds REAL,
    oom_killed INTEGER DEFAULT 0,
    metadata TEXT,  -- JSON blob for additional data
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task ON container_events(task_id);
CREATE INDEX IF NOT EXISTS idx_exit_code ON container_events(exit_code);
CREATE INDEX IF NOT EXISTS idx_event_type ON container_events(event_type);

-- Redis coordination events
CREATE TABLE IF NOT EXISTS coordination_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    agent_id TEXT,
    event_type TEXT NOT NULL,  -- 'gate-check', 'consensus', 'decision', 'signal', 'wait'
    key TEXT NOT NULL,
    value TEXT,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coord_task ON coordination_events(task_id);
CREATE INDEX IF NOT EXISTS idx_coord_event_type ON coordination_events(event_type);
CREATE INDEX IF NOT EXISTS idx_coord_key ON coordination_events(key);

-- Gate check results
CREATE TABLE IF NOT EXISTS gate_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    iteration INTEGER NOT NULL,
    pass_rate REAL NOT NULL,
    threshold REAL NOT NULL,
    passed INTEGER NOT NULL CHECK(passed IN (0, 1)),
    agent_count INTEGER,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gate_task_iteration ON gate_checks(task_id, iteration);

-- Validator consensus
CREATE TABLE IF NOT EXISTS validator_consensus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    iteration INTEGER NOT NULL,
    validator_id TEXT NOT NULL,
    score REAL NOT NULL,
    feedback TEXT,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_consensus_task_iteration ON validator_consensus(task_id, iteration);

-- Product owner decisions
CREATE TABLE IF NOT EXISTS product_owner_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    iteration INTEGER NOT NULL,
    decision TEXT NOT NULL CHECK(decision IN ('PROCEED', 'ITERATE', 'ABORT')),
    rationale TEXT,
    deliverables_validated INTEGER,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_decision_task ON product_owner_decisions(task_id);

-- Performance metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    unit TEXT,
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metrics_task ON performance_metrics(task_id);
